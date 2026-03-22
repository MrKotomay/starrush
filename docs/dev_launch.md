# 1. Базы данных (один раз)
docker compose -f docker-compose.dev.yml up -d

# 2. Миграции (один раз)
npx prisma migrate deploy

# 3. Запуск всего
npm run dev:all

# 4. Пополнить казну (один раз)
npm run house:fund -- --currency STARS --amount 10000
npm run house:fund -- --currency TON --amount 1000

# 5. Открыть http://localhost:3000