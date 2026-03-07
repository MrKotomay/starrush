# StarRush

Telegram Mini App crash game:
- Next.js app (`app`)
- WebSocket gateway (`gateway`)
- Round worker (`workers`)
- PostgreSQL + Redis

## 1) VDS run (single server, Docker)

`docker-compose.yml` is the production/DBaaS stack:
- `edge` (Caddy reverse proxy + TLS)
- `app` (Next.js)
- `gateway` (WebSocket backend)
- `worker` (round loop)
- `migrate` (Prisma migrations, one-off)

Admin panel:
- browser UI at `/admin`
- Caddy `basic_auth` on `/admin*` and `/api/admin*`
- Telegram allowlist login inside the app
- embedded Prisma Studio at `/admin/data`

### First deploy on VDS

1. Install Docker + Docker Compose plugin on server.
2. Clone repo on VDS.
3. Copy env template and fill secrets:

```bash
cp .env.example .env
```

4. Deploy stack (production/DBaaS mode):

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
   - `ADMIN_TELEGRAM_IDS=comma,separated,telegram,ids`
   - `TELEGRAM_LOGIN_CLIENT_ID=<BotFather Web Login client id>`
   - `ADMIN_BASIC_AUTH_USER=...`
   - `ADMIN_BASIC_AUTH_HASH='...'` (wrap bcrypt hash in single quotes)
3. In BotFather set Mini App URL to `https://your-domain`.
4. In BotFather Web Login settings, allow `https://your-domain` and copy the Web Login client ID into `TELEGRAM_LOGIN_CLIENT_ID`.

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

## 3) DBaaS setup (Timeweb)

1. Create managed PostgreSQL and Redis instances in Timeweb Cloud.
2. Set these variables in `.env` on VDS:
   - `DOCKER_DATABASE_URL=...`
   - `DOCKER_REDIS_URL=...`
3. Re-run deploy script.

No changes are needed in application code for this switch.

## 4) VDS disk usage (Docker cache/log growth)

If your VDS disk usage keeps growing over time, the usual sources are Docker image/build cache and container logs.
`infra/deploy/deploy-vds.sh` now prunes stale images and builder cache at the end of deploy, but you can also inspect manually:

```bash
df -h
docker system df -v
sudo du -xh /var/lib/docker --max-depth=2 | sort -h | tail -n 30
journalctl --disk-usage
```

One-time cleanup commands:

```bash
docker image prune -a -f
docker builder prune -a -f
docker container prune -f
```

Compose logging is capped with `json-file` rotation (`10m` x `3` files per container) in `docker-compose.yml`.

