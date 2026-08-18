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

## Re-deriving a vector

`signature-wrap.json`, first entry:

```bash
cast abi-encode "f((uint256,bytes))" "(0,0x$(printf 'aa%.0s' {1..32})$(printf 'bb%.0s' {1..32})1b)"
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

To read a vector back:

```bash
cast abi-decode --input "f((uint256,bytes))" 0x<expected>
```

## Two things worth knowing

**The offsets point at the keys.** Solady's `WebAuthn.verify` compares the 21
bytes at `typeIndex` against the literal `"type":"webauthn.get"` and the 13
bytes at `challengeIndex` against `"challenge":"`. Pointing either one at the
value that follows the key fails verification on chain and nothing off chain
notices. That is where `challengeIndex ?? 23` and `typeIndex ?? 1` in
`toJustanAccount.ts` come from.

**We declare `ownerIndex` narrower than the contract does.** The struct says
`uint256`, `wrapSignature` encodes `uint8`. The bytes are identical for any
value that fits in a byte, verified with `cast`, so nothing is wrong today. Past
255 viem refuses to encode while the contract would accept it.

That ceiling is easier to reach than it looks. `MultiOwnable` hands out indices
from a counter that only goes up (`s_nextOwnerIndex++`), and removing an owner
deletes its slot without reusing the index or compacting the rest. So the limit
is on how many owners the account has ever had, not on how many it has now: an
account that has rotated owners 300 times has whatever owners it has today, and
if one of them sits at index 260 that owner cannot sign through this SDK at all.

Reported rather than changed, since this directory is about pinning the
encoding. Widening `wrapSignature` to `uint256` would produce identical bytes
for every value that fits today.

## Changing a vector

Do not regenerate one because a test went red. A red vector means the bytes we
send no longer match the bytes the contract decodes, which is either a bug in
the encoder or a change in the contract. Say which, in the PR description.
