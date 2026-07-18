# Cloudflare Deployment Design

## Goal

Deploy the Next.js application to Cloudflare Workers while keeping the existing realtime server behind the existing Cloudflare Tunnel.

## Architecture

- `https://planning-poker.kjaniec.dev` serves the Next.js application from the `planning-poker` Cloudflare Worker built by OpenNext.
- `https://planning-poker-api.kjaniec.dev` exposes the existing realtime server through Cloudflare Tunnel.
- The browser connects to `wss://planning-poker-api.kjaniec.dev/api/ws`. The application derives this URL from the build-time `NEXT_PUBLIC_REALTIME_URL` value.
- The Cloudflare Worker does not implement `/api/ws` and does not replace the Go or Node realtime server.

## Repository Configuration

- Make the Cloudflare build scripts set `NEXT_PUBLIC_REALTIME_URL=https://planning-poker-api.kjaniec.dev` so preview and production deployments cannot accidentally compile a localhost URL.
- Configure `planning-poker.kjaniec.dev` as a Wrangler custom domain.
- Enable Worker observability in `wrangler.jsonc`.
- Keep local Next.js and realtime development scripts unchanged.

## Backend Requirements

- The tunnel public hostname routes `planning-poker-api.kjaniec.dev` to `http://realtime-server-go:3001`.
- The realtime service uses `ALLOWED_ORIGINS=https://planning-poker.kjaniec.dev` in production.
- The public realtime URL is not a secret. Tunnel tokens remain outside version control.

## Deployment Flow

1. Authenticate Wrangler against the intended Cloudflare account.
2. Build the OpenNext Worker with the production realtime origin.
3. Run Wrangler's deployment dry run.
4. Deploy the Worker and its custom domain.
5. Verify the frontend and WebSocket connection, then inspect Worker logs.

## Error Handling and Rollback

- A failed build or dry run stops deployment.
- If the custom domain or realtime hostname is unavailable, the existing Worker version remains available for rollback through Wrangler.
- Realtime connection failures are diagnosed independently through the tunnel and realtime-service logs because the Worker does not proxy WebSocket traffic.

## Verification

- Lint and frontend tests pass.
- OpenNext build and Wrangler dry run succeed.
- The deployed frontend returns HTTP 200 at `/` and `/game/<room>`.
- A browser session connects to `wss://planning-poker-api.kjaniec.dev/api/ws` with origin `https://planning-poker.kjaniec.dev`.
- Wrangler logs show no application errors during the smoke test.
