# Dev Launch

## Local dev

1. Поднять базы:
   `docker compose -f docker-compose.dev.yml up -d`

2. Применить миграции:
   `npx prisma migrate deploy`

3. Запустить приложение:
   `npm run dev:all`

4. При необходимости пополнить казну:
   `npm run house:fund -- --currency STARS --amount 10000`
   `npm run house:fund -- --currency TON --amount 1000`

5. Открыть:
   `http://localhost:3000`

## v0 preview mode

Для `v0` нужно открывать приложение в sandbox-режиме, а не обычным корневым URL.

Используй ссылку вида:

`https://your-app-url/?uiSandbox=1`

Пример:

`https://my-app.vercel.app/?uiSandbox=1`

Что делает этот режим:

- запускает приложение без Telegram auth
- не требует рабочего backend для входа в интерфейс
- подставляет mock-данные для wallet, staking и game
- подходит для импорта и редизайна в `v0`

Как открывать в нужном режиме:

1. Задеплой текущую версию приложения.
2. Скопируй URL деплоя.
3. Добавь в конец `?uiSandbox=1`.
4. Используй именно этот URL в `v0`.

Важно:

- открывать нужно именно URL с `?uiSandbox=1`
- если открыть просто `/`, приложение пойдет в обычный auth flow
- для `v0` рекомендованный URL всегда sandbox-вариант
