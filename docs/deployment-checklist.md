# Deployment Checklist

This checklist covers first-time setup and first release for:

1. API Docker image publishing to GHCR
2. Admin UI + Worker proxy deploys to Cloudflare
3. Unified API/SDK versioned releases and npm publish

## 1. GitHub Environments

Create two environments in GitHub:

1. `preview`
2. `production`

For each environment, set:

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Variables:

- `CLOUDFLARE_WORKER_NAME`
- `RAILWAY_API_ORIGIN`
- `CLOUDFLARE_ROUTE` (optional)

## 2. Repository Secrets

Set repository-level secrets:

- `NPM_TOKEN` (required for `@scheduling/client` publish)

## 3. Railway API Configuration

Set environment variables in Railway for each environment:

- `AUTH_BASE_URL` (e.g. `https://app.example.com`)
- `TRUSTED_ORIGINS` (comma-separated app origins)
- `CORS_ORIGIN` (comma-separated app origins)
- Existing API runtime vars (`DATABASE_URL`, `AUTH_SECRET`, etc.)

If pulling private GHCR images from Railway, configure registry credentials with package read access.

## 4. Cloudflare Worker Configuration

Worker config files:

- `apps/admin-ui/wrangler.toml`
- `apps/admin-ui/worker/index.ts`

Proxy behavior:

- `/v1/*` -> Railway API
- `/api/*` -> Railway API
- all other routes -> static SPA assets

## 5. First Deploy

### 5.1 Publish API image

Run workflow:

- **Publish API Image**

Or push to `main` to trigger automatically.

### 5.2 Deploy Worker (preview)

Run workflow:

- **Deploy Cloudflare Worker**
  - `environment=preview`
  - `ref=main`

### 5.3 Deploy Worker (production)

Run workflow:

- **Deploy Cloudflare Worker**
  - `environment=production`
  - `ref=main`

## 6. Create a Versioned Release

Run workflow:

- **Create Versioned Release**
  - `version=X.Y.Z`

This will:

1. Bump both `apps/api/package.json` and `sdk/typescript/package.json`
2. Commit + tag `vX.Y.Z`
3. Create a GitHub Release

Tag push will trigger:

- **Publish API Image**
- **Publish SDK Package**

## 7. Verify Results

1. GHCR image exists with expected tags (`sha-*`, `main`, `vX.Y.Z`, `latest`)
2. Worker deployment is healthy and routes proxy correctly
3. SDK package `@scheduling/client@X.Y.Z` is visible on npm
4. API and SDK package versions are equal

## 8. Rollback Plan

1. Re-run Worker deploy using a known-good `ref`
2. Re-deploy Railway service using previous known-good image tag or digest
3. If needed, deprecate npm release and publish a fixed patch release
