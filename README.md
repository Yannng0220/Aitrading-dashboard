<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/24d0fd6d-ffbd-46a6-8656-5e380e5fa2b2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy (GitHub Pages, no local npm needed)

This repo is a **Vite + React** app. You can deploy the frontend to **GitHub Pages** without running npm on your own PC by using GitHub Actions.

### Steps

1. Push this repo to GitHub (make sure your default branch is `main`).
2. In GitHub → **Settings** → **Pages**:
   - **Build and deployment** → Source: **GitHub Actions**
3. Push to `main`. The workflow will automatically:
   - run `npm ci`
   - run `npm run build`
   - deploy `dist/` to GitHub Pages

### Important: dynamic backend

GitHub Pages is **static hosting** only. It **cannot run** `server.ts` (Express), SSE, or any server API.

If you need realtime trading features (API / SSE / WebSocket), deploy the backend separately (Render/Fly.io/Railway/VPS) and let the frontend call that backend URL.

## Deploy (Netlify) - fix "can't fetch prices"

If your Netlify site cannot fetch Bybit prices, it's usually due to **browser CORS** when calling `https://api.bybit.com` directly.

This repo includes a Netlify Function proxy:

- Frontend calls: `GET /api/tickers?category=linear`
- Netlify routes it to: `/.netlify/functions/tickers`
- The function calls Bybit server-side and returns JSON to the browser

### Netlify setup

- Netlify will run `npm run build` in CI and publish `dist/` (configured in `netlify.toml`)
- No need to run npm on your own PC

### Notes

- Netlify Functions are not meant for long-lived SSE streams; this app will still work via polling when SSE isn't available.

## Deploy to Cloudflare Pages

This repo is now ready for `Cloudflare Pages + Pages Functions`.

### What runs on Cloudflare

- Frontend: `dist/`
- Realtime price proxy: `/api/tickers`
- SSE price stream: `/api/stream/prices`
- Agent state storage: `/api/agents`

### GitHub push auto deploy

This repo now includes a GitHub Actions workflow that deploys to Cloudflare Pages whenever you push to `main`.

Before the first push, add these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT_NAME`

The workflow file is [deploy-cloudflare-pages.yml](.github/workflows/deploy-cloudflare-pages.yml).

### Cloudflare setup

1. Create a KV namespace for saved agent state:
   `npx wrangler kv namespace create AGENTS_STATE`
2. Create the preview KV namespace too:
   `npx wrangler kv namespace create AGENTS_STATE --preview`
3. Copy the returned IDs into [wrangler.toml](wrangler.toml)
4. Create a Cloudflare Pages project with the same name you will store in `CLOUDFLARE_PAGES_PROJECT_NAME`
5. Add the three GitHub Secrets listed above
6. Push to `main`

### Local Cloudflare preview

- Build first: `npm run build`
- Start Pages Functions locally: `npm run cf:dev`

### Important note

The old [server.ts](server.ts) Express server is still useful for local Node-based development, but Cloudflare deployment uses the files under [functions](functions) instead of Express.
