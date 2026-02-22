# VDS Deploy Runbook (Timeweb + Docker)

This runbook is for a single VDS setup where the full project runs in Docker:
- app
- gateway
- worker
- postgres
- redis
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

Fill `.env`:
- all secrets (`TELEGRAM_BOT_TOKEN`, `SESSION_SECRET`, `INTERNAL_API_KEY`)
- domain (`APP_DOMAIN`)
- DB credentials (`POSTGRES_PASSWORD`)
- `COOKIE_SECURE=true`

## 3) First deploy

```bash
bash infra/deploy/deploy-vds.sh
```

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

## 6) Auto-update from GitHub Actions

Workflow: `.github/workflows/deploy-vds.yml`

Required GitHub secrets:
- `VDS_HOST`
- `VDS_PORT` (optional)
- `VDS_USER`
- `VDS_SSH_KEY`
- `VDS_APP_PATH` (example `/opt/starrush`)
- `VDS_REPO_URL` (SSH or HTTPS URL)
- `VDS_BRANCH` (optional, default `main`)

After this, each push to `main` triggers deploy automatically.

## 7) Move DB to Timeweb DBaaS later

When ready:
1. Provision managed PostgreSQL and Redis.
2. Change only these env vars on VDS:
   - `DOCKER_DATABASE_URL`
   - `DOCKER_REDIS_URL`
3. Re-run deploy script.

Application, worker and gateway code stays the same.
