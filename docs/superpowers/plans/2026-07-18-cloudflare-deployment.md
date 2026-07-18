# Cloudflare Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Next.js application at `planning-poker.kjaniec.dev` as a Cloudflare Worker that connects to the existing tunneled realtime backend at `planning-poker-api.kjaniec.dev`.

**Architecture:** OpenNext builds the Next.js frontend into a Cloudflare Worker, while the Go/Node WebSocket server remains behind Cloudflare Tunnel. The public backend origin is compiled into the browser bundle, and Wrangler owns the frontend custom domain and Worker observability.

**Tech Stack:** Next.js 16, `@opennextjs/cloudflare` 1.20, Wrangler 4, Cloudflare Workers, Cloudflare Tunnel, npm.

---

## File Map

- `package.json`: owns reproducible Cloudflare build, preview, and deploy commands with the production realtime origin.
- `wrangler.jsonc`: owns the Worker entrypoint, static assets binding, frontend custom domain, and observability.
- `docker-compose.yml`: already accepts the production frontend origin through `ALLOWED_ORIGINS`; no code change is required.

### Task 1: Make Cloudflare builds use the production realtime backend

**Files:**
- Modify: `package.json:32-34`

- [ ] **Step 1: Run a failing configuration assertion**

Run:

```bash
node -e 'const p=require("./package.json"); const url="https://planning-poker-api.kjaniec.dev"; if (!p.scripts["cf:build"].includes(url)) throw new Error("cf:build does not set production realtime URL"); if (p.scripts["cf:preview"]!=="npm run cf:build && opennextjs-cloudflare preview") throw new Error("cf:preview bypasses cf:build"); if (p.scripts["cf:deploy"]!=="npm run cf:build && opennextjs-cloudflare deploy") throw new Error("cf:deploy bypasses cf:build")'
```

Expected: exit 1 with `cf:build does not set production realtime URL`.

- [ ] **Step 2: Update the Cloudflare scripts**

Set the three scripts to:

```json
{
  "cf:build": "NEXT_PUBLIC_REALTIME_URL=https://planning-poker-api.kjaniec.dev opennextjs-cloudflare build",
  "cf:preview": "npm run cf:build && opennextjs-cloudflare preview",
  "cf:deploy": "npm run cf:build && opennextjs-cloudflare deploy"
}
```

- [ ] **Step 3: Re-run the configuration assertion**

Run the command from Step 1.

Expected: exit 0 with no output.

- [ ] **Step 4: Verify the application tests and lint**

Run:

```bash
npm run lint
npm test -- --runInBand
```

Expected: Biome reports no errors and all 31 frontend tests pass.

- [ ] **Step 5: Commit the build-script change**

```bash
git add package.json package-lock.json
git commit -m "build: configure Cloudflare realtime origin"
```

### Task 2: Configure the frontend custom domain and observability

**Files:**
- Modify: `wrangler.jsonc:1-11`

- [ ] **Step 1: Run a failing Wrangler configuration assertion**

Run:

```bash
node -e 'const c=JSON.parse(require("fs").readFileSync("wrangler.jsonc","utf8")); const route=c.routes?.find(r=>r.pattern==="planning-poker.kjaniec.dev"&&r.custom_domain===true); if (!route) throw new Error("frontend custom domain missing"); if (c.observability?.enabled!==true) throw new Error("observability is not enabled")'
```

Expected: exit 1 with `frontend custom domain missing`.

- [ ] **Step 2: Add the route and observability settings**

Make `wrangler.jsonc` contain:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "planning-poker",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "routes": [
    {
      "pattern": "planning-poker.kjaniec.dev",
      "custom_domain": true
    }
  ],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "observability": {
    "enabled": true
  }
}
```

- [ ] **Step 3: Re-run the Wrangler configuration assertion**

Run the command from Step 1.

Expected: exit 0 with no output.

- [ ] **Step 4: Build and dry-run the Worker**

Run:

```bash
npm run cf:build
WRANGLER_LOG_PATH=/tmp/planning-poker-wrangler.log npx wrangler deploy --dry-run --outdir /tmp/planning-poker-worker-dry-run
```

Expected: OpenNext creates `.open-next/worker.js`; Wrangler exits 0 and lists the `ASSETS` binding.

- [ ] **Step 5: Commit the Worker configuration**

```bash
git add wrangler.jsonc
git commit -m "build: configure Cloudflare production domain"
```

### Task 3: Authenticate and deploy

**Files:**
- No repository changes.

- [ ] **Step 1: Authenticate Wrangler**

Run:

```bash
npx wrangler login
npx wrangler whoami
```

Expected: the browser authorization completes and `whoami` reports the intended Cloudflare account.

- [ ] **Step 2: Confirm backend origin configuration**

On the realtime host, ensure:

```bash
export ALLOWED_ORIGINS=https://planning-poker.kjaniec.dev
docker compose --profile external-go --profile cloudflare-tunnel up -d --build
```

Keep the existing `CLOUDFLARE_TUNNEL_TOKEN` in the host's secret environment; do not copy it into the repository. Expected: `realtime-server-go` and `cloudflared` are running and the tunnel maps `planning-poker-api.kjaniec.dev` to `http://realtime-server-go:3001`.

- [ ] **Step 3: Deploy the Worker**

Run:

```bash
npm run cf:deploy
```

Expected: Wrangler uploads the Worker, publishes `planning-poker.kjaniec.dev`, and exits 0.

### Task 4: Production smoke test

**Files:**
- No repository changes.

- [ ] **Step 1: Verify frontend routes**

Run:

```bash
curl -fsS -o /dev/null https://planning-poker.kjaniec.dev/
curl -fsS -o /dev/null https://planning-poker.kjaniec.dev/game/cloudflare-smoke
```

Expected: both commands exit 0 with HTTP 2xx responses.

- [ ] **Step 2: Verify the realtime tunnel with the production Origin**

Run:

```bash
node -e 'const {WebSocket}=require("ws"); const ws=new WebSocket("wss://planning-poker-api.kjaniec.dev/api/ws",{origin:"https://planning-poker.kjaniec.dev"}); const timer=setTimeout(()=>{console.error("timeout");process.exit(1)},10000); ws.on("open",()=>{clearTimeout(timer);console.log("websocket connected");ws.close()}); ws.on("error",e=>{clearTimeout(timer);console.error(e.message);process.exit(1)})'
```

Expected: prints `websocket connected` and exits 0.

- [ ] **Step 3: Inspect deployment state and logs**

Run:

```bash
npx wrangler deployments status
npx wrangler versions list
```

Expected: the latest `planning-poker` deployment is active and a new version is listed.

- [ ] **Step 4: Record rollback command**

If the production smoke test fails after deployment, run:

```bash
npx wrangler rollback
```

Expected: Wrangler activates the version immediately preceding the failed deployment.
