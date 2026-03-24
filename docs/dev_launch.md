# 1. Поднять локальные PostgreSQL и Redis
docker compose -f docker-compose.dev.yml up -d

# 2. Проверить, что контейнеры healthy
docker compose -f docker-compose.dev.yml ps

# 3. Применить миграции
npx prisma migrate deploy

# 4. Запустить app + gateway + worker
npm run dev:all

# 5. Один раз после новой БД пополнить казну
npm run house:fund -- --currency STARS --amount 10000
npm run house:fund -- --currency TON --amount 1000

# 6. Открыть http://localhost:3000
