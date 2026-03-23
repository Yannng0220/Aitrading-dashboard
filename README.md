# AI Trading Nexus

Vite + React frontend deployed on Cloudflare Pages, with Cloudflare Pages Functions for:

- `/api/tickers`
- `/api/stream/prices`
- `/api/agents`

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

## Cloudflare setup

1. Create a KV namespace:
   `npx wrangler kv namespace create AGENTS_STATE`
2. Create the preview KV namespace:
   `npx wrangler kv namespace create AGENTS_STATE --preview`
3. Copy the returned IDs into [wrangler.toml](wrangler.toml)
4. In Cloudflare Pages set:
   - Build command: `npm run build`
   - Build output directory: `dist`

## GitHub auto deploy

This repo includes [deploy-cloudflare-pages.yml](.github/workflows/deploy-cloudflare-pages.yml).

Add these GitHub secrets before pushing to `main`:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT_NAME`
