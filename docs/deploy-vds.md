# VDS Deploy Runbook (Timeweb + Docker)

This runbook is for a single VDS setup where the full project runs in Docker (production/DBaaS mode).

`docker-compose.yml` contains:
- app
- gateway
- worker
- edge proxy (Caddy + TLS)

## 1) Prepare server

Connect to VDS and install Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

Install git:

```bash
sudo apt-get update
sudo apt-get install -y git
```

## 2) Clone project and configure env

```bash
mkdir -p /opt
cd /opt
git clone <YOUR_REPO_URL> starrush
cd starrush
cp .env.example .env
```

Recommended for a private repository:
- use an SSH repo URL for `origin`
- configure a read-only GitHub deploy key on the VDS
- verify server access before the first deploy:

```bash
git ls-remote origin HEAD
```

If this fails, fix VDS DNS/network and GitHub SSH access first. Auto-deploy and manual git updates both depend on it.

Fill `.env`:
- all secrets (`TELEGRAM_BOT_TOKEN`, `SESSION_SECRET`, `INTERNAL_API_KEY`)
- domain (`APP_DOMAIN`)
- DB URLs (`DOCKER_DATABASE_URL`, `DOCKER_REDIS_URL`) for production/DBaaS mode
- `COOKIE_SECURE=true`
- `ALLOWED_WS_ORIGINS=https://<APP_DOMAIN>`
- `MAX_WS_CONNECTIONS_PER_USER=5`

## 3) First deploy

```bash
bash infra/deploy/deploy-vds.sh
```

`infra/deploy/deploy-vds.sh` runs the Prisma `migrate` service before starting app services. This migration step is mandatory for the new security/accounting indexes and unique constraint.

If deploy stops during migration with a duplicate `HouseLedgerEntry` error on `("houseWalletId", "roundId", "userId", "type")`, do not skip it. Clean duplicate rows first and rebalance `HouseWallet`, then rerun deploy.

Check:

```bash
docker compose ps
docker compose logs -f edge app gateway worker
```

## 4) Configure DNS + Telegram

1. Add `A` record: `APP_DOMAIN -> VDS public IP`.
2. Wait for DNS propagation.
3. Caddy will issue TLS certificate automatically.
4. Set Telegram Mini App URL in BotFather to:
   - `https://<APP_DOMAIN>`

## 5) Manual update flow

From `/opt/starrush`:

```bash
bash infra/deploy/update-from-git.sh
```

By default it deploys `main`. Use another branch:

```bash
DEPLOY_BRANCH=staging bash infra/deploy/update-from-git.sh
```

The update script keeps the repo clean while preserving `.env`:
- `git fetch --prune`
- `git reset --hard`
- `git clean -fd -e .env`
- `git checkout -B <branch> origin/<branch>`

## 6) Auto-update from GitHub Actions

Workflow: `.github/workflows/deploy-vds.yml`

Required GitHub secrets:
- `VDS_HOST`
- `VDS_PORT` (optional)
- `VDS_USER`
- `VDS_SSH_KEY`
- `VDS_APP_PATH` (example `/opt/starrush`)
- `VDS_REPO_URL` (recommended: SSH URL)

After this, each push to `main` triggers deploy automatically.

The workflow deploys the exact tested commit by running on the server:
- `git fetch --prune origin <branch>`
- `git checkout -B <branch> origin/<branch>`
- `git reset --hard <tested_sha>`
- `git clean -fd -e .env`

This keeps `/opt/starrush` as a normal git repository with a clean `git status`.

## 7) Timeweb DBaaS checklist

1. Provision managed PostgreSQL and Redis.
2. Set these env vars on VDS:
   - `DOCKER_DATABASE_URL`
   - `DOCKER_REDIS_URL`
3. Re-run deploy script.

Application, worker and gateway code stays the same.
