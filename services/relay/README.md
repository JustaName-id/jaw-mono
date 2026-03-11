# @jaw.id/relay

Cloudflare Worker + Durable Objects that pairs CLI daemons with browser tabs via WebSocket. Both sides connect outbound to `wss://relay.jaw.id` — solves mixed-content blocking in Brave/Safari.

## Architecture

```
CLI ──ws://localhost──▸ Daemon ──wss://relay.jaw.id/{session}──▸ Relay ◂──wss://relay.jaw.id/{session}── Browser
```

- Durable Object per session, 30 min expiry alarm
- Max 2 peers per session (one daemon, one browser)
- 1 MB max message, token auth (UUID)
- `peer_connected` / `peer_disconnected` control messages

## Deployment

### First-Time Setup

```bash
cd services/relay

# 1. Login to Cloudflare
bunx wrangler login

# 2. Deploy
bunx wrangler deploy

# 3. Add custom domain in Cloudflare Dashboard:
#    Workers & Pages → jaw-relay → Settings → Domains & Routes
#    Add custom domain: relay.jaw.id
#
#    OR add to wrangler.toml:
#    routes = [{ pattern = "relay.jaw.id", custom_domain = true }]
#    Then: bunx wrangler deploy

# 4. Verify
curl https://relay.jaw.id/health
# → ok
```

### Updating

```bash
bunx wrangler deploy
```

Zero-downtime. Existing WebSocket connections stay on the old version until they disconnect.

### Cost

Cloudflare Workers free tier: 100k requests/day, 1M DO requests/month. Each CLI session uses ~5-10 relay messages — free tier is more than enough.

## Local Development

```bash
bunx wrangler dev
# Relay runs on http://localhost:8787

# Then in another terminal:
JAW_RELAY_URL=ws://localhost:8787 jaw rpc call wallet_connect
```

## Monitoring

```bash
bunx wrangler tail          # Real-time logs
curl https://relay.jaw.id/health  # Health check
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CLI: "Failed to connect to relay" | Check `~/.jaw/daemon.log`, verify relay is deployed |
| Browser: "Failed to connect to relay" | Check console, verify CSP allows `wss://relay.jaw.id` |
| Session expired | Sessions last 30 min. `jaw disconnect` and reconnect |
