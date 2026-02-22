# StarRush

Telegram Mini App crash game:
- Next.js app (`app`)
- WebSocket gateway (`gateway`)
- Round worker (`workers`)
- PostgreSQL + Redis

## 1) VDS run (single server, Docker)

`docker-compose.yml` contains full VDS stack:
- `edge` (Caddy reverse proxy + TLS)
- `app` (Next.js)
- `gateway` (WebSocket backend)
- `worker` (round loop)
- `postgres` (PostgreSQL 18)
- `redis` (Redis 8)
- `migrate` (Prisma migrations, one-off)

### First deploy on VDS

1. Install Docker + Docker Compose plugin on server.
2. Clone repo on VDS.
3. Copy env template and fill secrets:

```bash
cp .env.example .env
```

4. Deploy stack:

```bash
bash infra/deploy/deploy-vds.sh
```

5. Check status/logs:

```bash
docker compose ps
docker compose logs -f edge app gateway worker
```

### DNS and Telegram

1. Point `A` record of your domain (`APP_DOMAIN`) to VDS public IP.
2. In `.env` set:
   - `APP_DOMAIN=your-domain`
   - `COOKIE_SECURE=true`
   - `NEXT_PUBLIC_WS_URL=` (empty, use same-host `/ws` proxy)
3. In BotFather set Mini App URL to `https://your-domain`.

## 2) Auto-deploy from GitHub to VDS

Workflow file: `.github/workflows/deploy-vds.yml`

Set repository secrets:
- `VDS_HOST`
- `VDS_PORT` (optional, default `22`)
- `VDS_USER`
- `VDS_SSH_KEY` (private key for SSH login)
- `VDS_APP_PATH` (example: `/opt/starrush`)
- `VDS_REPO_URL` (example: `git@github.com:MrKotomay/starrush.git`)
- `VDS_BRANCH` (optional, default `main`)

What happens on each push to `main`:
1. Workflow SSH-es to VDS.
2. Clones repo (first time) or pulls latest commit.
3. Runs `bash infra/deploy/deploy-vds.sh`.

## 3) Later migration to DBaaS (Timeweb)

When you decide to move databases to managed services:
1. Create PostgreSQL and Redis instances in Timeweb Cloud.
2. Update `.env` on VDS:
   - `DOCKER_DATABASE_URL=...` (managed PostgreSQL)
   - `DOCKER_REDIS_URL=...` (managed Redis)
3. Optional: stop local `postgres` and `redis` services in compose.
4. Re-run deploy script.

No changes are needed in application code for this switch.
