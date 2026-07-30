// A local x402 "paid API" for the demo — the endpoint side of the two AgentCash
// cases (pay-per-call APIs, payments for AI agents). It speaks the same v2 wire
// the jaw CLI parses: a 402 with a base64 PAYMENT-REQUIRED challenge, then 200 +
// a PAYMENT-RESPONSE receipt once a PAYMENT-SIGNATURE comes back.
//
// It verifies the *shape* of the payment (a signed exact-scheme payload for the
// advertised requirement), not the on-chain settlement — this is a client-flow
// demo, not a facilitator. It shows: per-call micro-pricing, price-before-pay,
// receipts, and free endpoints passing through.
//
// Run:  node packages/cli/scripts/demo-x402-server.mjs
// Then: jaw_pay_and_fetch { url: "http://localhost:8402/email-lookup?addr=0x..." }
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = 8402;
const NETWORK = 'eip155:84532'; // Base Sepolia
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const PAY_TO = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

// Per-call micro-prices, base units (USDC, 6 decimals). The "penny for an email
// lookup" example from the AgentCash page.
const CATALOG = {
  '/email-lookup': { price: '10000', data: (q) => ({ address: q.addr, email: 'agent@example.com', verified: true }) }, // 0.01 USDC
  '/enrich': { price: '50000', data: (q) => ({ address: q.addr, ens: 'vitalik.eth', tags: ['whale', 'dev'] }) }, // 0.05 USDC
  '/premium-search': { price: '250000', data: (q) => ({ query: q.q, results: 42 }) }, // 0.25 USDC
  '/health': { free: true, data: () => ({ ok: true }) }, // free — passthrough
};

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
const unb64 = (s) => {
  try {
    return JSON.parse(Buffer.from(s, 'base64').toString());
  } catch {
    return null;
  }
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = CATALOG[url.pathname];
  const q = Object.fromEntries(url.searchParams);

  if (!route) {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'no such endpoint' }));
  }

  if (route.free) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(route.data(q)));
  }

  const proof = req.headers['payment-signature'];
  if (!proof) {
    // No payment yet → advertise the price. This is "price before pay".
    const challenge = {
      x402Version: 2,
      resource: { url: url.href },
      accepts: [
        {
          scheme: 'exact',
          network: NETWORK,
          amount: route.price,
          asset: USDC,
          payTo: PAY_TO,
          maxTimeoutSeconds: 60,
        },
      ],
    };
    console.log(`[402] ${url.pathname} → quoting ${Number(route.price) / 1e6} USDC`);
    res.writeHead(402, { 'content-type': 'application/json', 'PAYMENT-REQUIRED': b64(challenge) });
    return res.end('{}');
  }

  // A proof arrived. Verify its shape against what we advertised (a real
  // facilitator would verify + settle on-chain; here we check structure).
  const payload = unb64(proof);
  const auth = payload?.payload?.authorization;
  const ok =
    payload?.x402Version === 2 &&
    payload?.accepted?.amount === route.price &&
    auth?.to?.toLowerCase() === PAY_TO.toLowerCase() &&
    auth?.value === route.price &&
    typeof payload?.payload?.signature === 'string';

  if (!ok) {
    const reChallenge = {
      x402Version: 2,
      error: 'invalid_exact_evm_payload',
      resource: { url: url.href },
      accepts: [
        { scheme: 'exact', network: NETWORK, amount: route.price, asset: USDC, payTo: PAY_TO, maxTimeoutSeconds: 60 },
      ],
    };
    console.log(`[402] ${url.pathname} → rejected malformed proof`);
    res.writeHead(402, { 'content-type': 'application/json', 'PAYMENT-REQUIRED': b64(reChallenge) });
    return res.end('{}');
  }

  const receipt = {
    success: true,
    transaction: `0x${randomBytes(32).toString('hex')}`,
    network: NETWORK,
    amount: route.price,
  };
  console.log(
    `[200] ${url.pathname} → paid ${Number(route.price) / 1e6} USDC, receipt ${receipt.transaction.slice(0, 12)}…`
  );
  res.writeHead(200, { 'content-type': 'application/json', 'PAYMENT-RESPONSE': b64(receipt) });
  res.end(JSON.stringify(route.data(q)));
});

server.listen(PORT, () => {
  console.log(`demo x402 API on http://localhost:${PORT}`);
  console.log(
    'paid:',
    Object.entries(CATALOG)
      .filter(([, r]) => !r.free)
      .map(([p, r]) => `${p} (${Number(r.price) / 1e6} USDC)`)
      .join(', ')
  );
  console.log(
    'free:',
    Object.entries(CATALOG)
      .filter(([, r]) => r.free)
      .map(([p]) => p)
      .join(', ')
  );
});
