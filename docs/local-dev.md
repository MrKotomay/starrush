# StarRush — Локальная разработка

## Требования

- **Node.js** 22+ (установлен: v24)
- **Docker Desktop** (для PostgreSQL + Redis)
- **npm** (идёт с Node.js)

## Быстрый старт

### 1. Запустить базы данных (один раз)

```bash
docker compose -f docker-compose.dev.yml up -d
```

Это запустит:
- **PostgreSQL** на `localhost:5432` (user: starrush, pass: starrush, db: starrush)
- **Redis** на `localhost:6379`

### 2. Применить миграции (один раз, или после pull)

```bash
npx prisma migrate deploy
```

### 3. Запустить всё

```bash
npm run dev:all
```

Это запускает три сервиса:
| Сервис | Порт | Описание |
|--------|------|----------|
| **Next.js** (app) | `http://localhost:3000` | Фронтенд + API |
| **Gateway** (WS) | `ws://localhost:8081` | WebSocket для игры |
| **Worker** (round) | `http://localhost:8082` | Игровой цикл раундов |

### 4. Открыть в браузере

Просто открой `http://localhost:3000` — авторизация произойдёт автоматически через dev auth (без Telegram).

### 5. Пополнить казну и кошелёк (один раз после свежей БД)

```bash
# Казна (house treasury) — нужна чтобы принимать ставки
npm run house:fund -- --currency STARS --amount 10000
npm run house:fund -- --currency TON --amount 1000

# Кошелёк dev_user пополняется через UI (кнопка Deposit) или через API
```

## Полезные команды

```bash
# Остановить базы данных
docker compose -f docker-compose.dev.yml down

# Остановить и удалить данные
docker compose -f docker-compose.dev.yml down -v

# Пересоздать базу с нуля
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
npx prisma migrate deploy
npm run house:fund -- --currency STARS --amount 10000
npm run house:fund -- --currency TON --amount 1000

# Открыть Prisma Studio (GUI для базы данных)
npx prisma studio

# Только Next.js (без gateway/worker)
npm run dev

# Линтинг
npm run lint
```

## Как работает dev auth

Когда открываешь `localhost:3000` в обычном браузере (не в Telegram):
1. Фронтенд пытается найти Telegram WebApp → не находит
2. Автоматически вызывает `POST /api/auth/dev`
3. Создаётся dev-юзер (telegram ID: 123456789, username: dev_user)
4. Устанавливается сессионный cookie
5. Приложение загружается как обычно

**Управляется** переменными в `.env`:
- `DEV_AUTH_ENABLED=true` — включает dev авторизацию
- `ENABLE_DEV_WALLET_ACTIONS=1` — включает dev deposit/withdraw
- `ENABLE_DEV_TREASURY=1` — включает пополнение казны

## Архитектура

```
Browser (localhost:3000)
  ├─ Next.js SSR + React (UI + API routes)
  ├─ Phaser 3 (игровая сцена с ракетой)
  └─ WebSocket → Gateway (localhost:8081)
                    └─ Redis PubSub ← Worker (localhost:8082)
                                        └─ Game loop (100ms тики)
                                        └─ PostgreSQL (раунды, ставки, кошельки)
```

## Troubleshooting

**Порты заняты**: `npm run dev:all` автоматически очищает порты 3000 и 8081 на Windows.

**Prisma migrate ошибка**: Убедись что PostgreSQL контейнер запущен: `docker compose -f docker-compose.dev.yml ps`

**401 на API**: Перезагрузи страницу — dev auth пересоздаст сессию.

**Game loop не работает**: Проверь worker: `curl http://localhost:8082/healthz`
