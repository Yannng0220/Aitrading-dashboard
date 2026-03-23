# AI Trading Nexus

Vite + React frontend deployed on Cloudflare Pages, with Cloudflare Pages Functions for:

- `/api/tickers`
- `/api/stream/prices`
- `/api/agents`

The repo also includes a dedicated Cloudflare Worker + Durable Object engine in [engine-worker](engine-worker) so the trading simulation can keep running even when no browser tab is open.

## Local development

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

For a local Cloudflare-style preview:

```bash
npm run build
npm run cf:dev
```

To deploy the background engine Worker:

```bash
npm run cf:deploy:engine
```

## Cloudflare setup

1. Create a KV namespace:
   `npx wrangler kv namespace create AGENTS_STATE`
2. Create the preview KV namespace:
   `npx wrangler kv namespace create AGENTS_STATE --preview`
3. Copy the returned IDs into [wrangler.toml](wrangler.toml)
4. In Cloudflare Pages set:
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Deploy the Durable Object engine once:
   `npm run cf:deploy:engine`

## Durable Object engine

- [engine-worker/wrangler.toml](engine-worker/wrangler.toml) defines the `TradingEngine` Durable Object
- [engine-worker/src/index.ts](engine-worker/src/index.ts) runs the simulation loop with Durable Object alarms
- [wrangler.toml](wrangler.toml) binds Pages Functions to the engine Worker via `ENGINE_SERVICE`

When the engine Worker is deployed, `/api/agents` will proxy to the Durable Object and the frontend will stop running the simulation locally. That means:

- the backend keeps advancing state
- phone and desktop read the same state
- closing the page no longer pauses the simulation

## GitHub auto deploy

This repo includes [deploy-cloudflare-pages.yml](.github/workflows/deploy-cloudflare-pages.yml).

Add these GitHub secrets before pushing to `main`:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT_NAME`
