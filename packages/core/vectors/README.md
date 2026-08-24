# Golden vectors

The `expected` bytes in these files were **not** produced by this codebase. Each
one comes from `cast abi-encode` with the struct signature copied out of the
Solidity, so it is the contract's statement of the encoding rather than ours.

That distinction is the whole point. `toJustanAccount.encoding.test.ts` decodes
what we encoded back through the shape we believe the contract reads, which
proves we are consistent with ourselves and nothing more. Move a field in the
implementation and in that shape at the same time, which is what a person does
when a mirrored test fails, and it stays green while the on-chain decode breaks.
The vectors fail, because their bytes never moved.

## The structs

Copied verbatim; check them against the submodule before trusting anything here.

`contracts/justanaccount/src/JustanAccount.sol:67`

```solidity
struct SignatureWrapper {
    uint256 ownerIndex;
    bytes signatureData;
}
```

`contracts/justanaccount/lib/solady/src/utils/WebAuthn.sol:17`

```solidity
struct WebAuthnAuth {
    bytes authenticatorData;
    string clientDataJSON;
    uint256 challengeIndex;   // start index of `"challenge":"` in clientDataJSON
    uint256 typeIndex;        // start index of `"type":"`      in clientDataJSON
    bytes32 r;
    bytes32 s;
}
```

Both submodules have to be checked out to read these:

```bash
git submodule update --init contracts/justanaccount
cd contracts/justanaccount && git submodule update --init lib/solady
```

`contracts/permissions/src/JustaPermissionManager.sol:225`

```solidity
struct CallPermission {
    address target;
    bytes4 selector;
    address checker;
}

struct SpendLimit {
    address token;
    uint160 allowance;
    PeriodUnit unit;
    uint16 multiplier;
}

struct Permission {
    address account;
    address spender;
    uint48 start;
    uint48 end;
    uint256 salt;
    CallPermission[] calls;
    SpendLimit[] spends;
}
```

`executeBatch` takes that tuple plus `BaseAccount.Call[]`, which comes from
ERC-4337 rather than from our own contracts,
`contracts/permissions/lib/justanaccount/lib/account-abstraction/contracts/core/BaseAccount.sol:21`:

```solidity
struct Call {
    address target;
    uint256 value;
    bytes data;
}
```

That one is two submodules deep:

```bash
cd contracts/permissions && git submodule update --init lib/justanaccount
cd lib/justanaccount && git submodule update --init lib/account-abstraction
```

## Re-deriving a vector

`signature-wrap.json`, first entry:

```bash
cast abi-encode "f((uint256,bytes))" "(0,0x$(printf 'aa%.0s' {1..32})$(printf 'bb%.0s' {1..32})1b)"
```

Fourth entry, the index past a byte:

```bash
cast abi-encode "f((uint256,bytes))" "(300,0x1234)"
```

The bytes handed to `cast` are what `wrapSignature` produces on the way in, not
its `input.signature`. For a 65-byte signature it repacks as
`abi.encodePacked(r, s, v)` with `v` normalised to 27 or 28 first, so the second
entry takes a signature ending in `01` and its expected bytes end in `1c`. Drop
the raw input into the command above and you will derive something that ends in
`01` and conclude, wrongly, that the vector is broken.

`signature-webauthn.json`:

```bash
cast abi-encode "f((bytes,bytes,uint256,uint256,bytes32,bytes32))" \
  "(0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d00000000,\
0x$(printf '%s' '{"type":"webauthn.get","challenge":"9jEFijuhEWrM4SOW-tChJbUEHEP44VcjcJ-Bqo1fTM8","origin":"https://keys.jaw.id"}' | xxd -p | tr -d '\n'),\
23,1,0x$(printf '11%.0s' {1..32}),0x$(printf '22%.0s' {1..32}))"
```

`clientDataJSON` is passed as `bytes` rather than `string`. The two are
identical in ABI encoding, both being dynamic byte arrays, and the hex form
avoids having to quote a JSON string containing commas through a shell.

`permission-calls.json` is `cast calldata` rather than `cast abi-encode`, so the
four-byte selector is pinned too. That matters here: the selector is a hash of
the whole signature, so retyping or reordering a field inside the `Permission`
tuple moves it even on a call whose arrays are empty.

The tuple is long enough to be worth naming once:

```bash
PERM='(address,address,uint48,uint48,uint256,(address,bytes4,address)[],(address,uint160,uint8,uint16)[])'
```

Third entry, `buildRevokePermissionCall`:

```bash
cast calldata "revoke($PERM)" \
  "(0x1111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222,\
1700000000,2000000000,42,[(0x3333333333333333333333333333333333333333,0xa9059cbb,\
0x0000000000000000000000000000000000000000)],[(0x4444444444444444444444444444444444444444,1000000,2,7)])"
```

Fourth entry, `encodeExecuteBatchWithPermission`, same permission plus two calls:

```bash
cast calldata "executeBatch($PERM,(address,uint256,bytes)[])" \
  "<the permission above>" \
  "[(0x5555555555555555555555555555555555555555,0,0xa9059cbb$(printf '0%.0s' {1..24})7777777777777777777777777777777777777777$(printf '0%.0s' {1..58})f4240),\
(0x6666666666666666666666666666666666666666,1000000000000000000,0x)]"
```

The two grant entries carry a `start` and no salt because
`apiPermissionsToPermission` stamps `start` from `Date.now()` and draws the salt
from `Math.random()`. The test freezes the clock and pins `Math.random` to 0, so
those vectors are generated with `start` at the frozen value and salt 0. The
period is the other thing to watch: `unit: 'year'` has no enum member, so the
second entry is generated as `Month` with the multiplier times twelve.

To read a vector back:

```bash
cast abi-decode --input "f((uint256,bytes))" 0x<expected>
```

For a `permission-calls.json` entry, drop the leading four bytes first, or use
`cast 4byte-decode`.

## Two things worth knowing

**The offsets point at the keys.** Solady's `WebAuthn.verify` compares the 21
bytes at `typeIndex` against the literal `"type":"webauthn.get"` and the 13
bytes at `challengeIndex` against `"challenge":"`. Pointing either one at the
value that follows the key fails verification on chain and nothing off chain
notices. That is where `challengeIndex ?? 23` and `typeIndex ?? 1` in
`toJustanAccount.ts` come from.

**`ownerIndex` is `uint256`, and used to be `uint8` here.** Reading the struct
is what surfaced it. The bytes are identical for any value that fits in a byte,
so the first three vectors do not move, but the narrower declaration made viem
refuse to encode past 255 for an index the contract accepts.

That ceiling is easier to reach than it looks. `MultiOwnable` hands out indices
from a counter that only goes up (`s_nextOwnerIndex++`), and removing an owner
deletes its slot without reusing the index or compacting the rest. So the limit
is on how many owners the account has ever had, not on how many it has now: an
account that has rotated owners 300 times has whatever owners it has today, and
if one of them sits at index 260 that owner could not sign through this SDK at
all. The fourth vector pins index 300, which the old declaration threw on.

## Changing a vector

Do not regenerate one because a test went red. A red vector means the bytes we
send no longer match the bytes the contract decodes, which is either a bug in
the encoder or a change in the contract. Say which, in the PR description.
