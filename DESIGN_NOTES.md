# StarRush — Design Notes

Карта дизайн-системы и компонентов: куда лезть для каких изменений.

## 1. Источники правды для цветов

Все цвета должны идти через токены. Никаких хардкодов `#hex` или `rgba(…)` в компонентах — иначе смена темы потребует трогать десятки файлов.

| Файл | Что в нём |
|---|---|
| `app/globals.css` (`:root`) | **Канонический источник.** HSL триплеты (`--brand-1`, `--surface-1`, …), RGB-каналы для альфы (`--rgb-primary`), shadow- и gradient-токены. Если меняешь палитру — сначала здесь. |
| `theme/colors.ts` | JS-доступные значения (`colors.brand1`, `gradients.primary`). Используется когда цвет нужно прокинуть из TSX (например, viewport `themeColor`). Должно совпадать с `globals.css`. |
| `theme/colors.ts` → `appColorCssVariables` | **Legacy** `--ui-*` алиасы. Применяются на `<html>` через inline style в `app/layout.tsx`. CSS-модули частично ещё ссылаются на них (`--ui-rgb-primary` и т.п.) — не удалять, мигрировать постепенно. |

### Как сменить primary цвет

1. В `app/globals.css` поменять `--brand-1`, `--brand-2`, `--brand-soft` (HSL) **и** `--rgb-primary`, `--rgb-accent` (RGB-каналы).
2. В `theme/colors.ts` синхронизировать `colors.brand1/brand2/brandSoft`, `gradients.primary/primaryHover/bgRadial/sheet`, и `--ui-rgb-*` в `appColorCssVariables`.
3. После этого `--glow-primary`, `--glow-accent`, `--primary-gradient`, `--modal-background` пересчитаются автоматически.

### Композитные градиент-токены (что доступно "из коробки")

| Токен | Что это |
|---|---|
| `--primary-gradient` | Основной violet→pink градиент (CTA кнопки, активные таб-индикаторы) |
| `--glass-gradient` | Полупрозрачный белый стеклянный градиент сверху |
| `--bg-radial` | Радиальный фон страницы (cosmic glow сверху) |
| `--sheet-gradient` | Градиент для bottom-sheet модалок |
| `--modal-background` | **Новое.** Общий фон модалок (radial primary + linear dark). Используется в `wallet-action-modal`, `wallet-overview-modal`, `staking-action-modal`. Перекрасить здесь = перекрасить все три модалки. |
| `--modal-overlay` | Затемнение позади модалки |
| `--modal-shadow` | Тень модалки |
| `--glow-primary`, `--glow-accent` | Цветные свечения |
| `--shadow-sm/md/lg` | Стандартные тени |

## 2. Структура UI: где какой экран

```
app/
  (game)/page.tsx       ← главная страница с табами (Profile / Staking / Mine)
                          ⚠ монолит 654 строки, не разбит
  layout.tsx            ← <html>, TON-провайдер, шрифт, метатеги

components/
  bottom-navigation.tsx ← нижний таббар
  top-hud.tsx           ← верхняя плашка с балансом и аватаром

  profile-header.tsx    ← Profile: шапка с аватаром
  stat-cards.tsx        ← Profile: 4 квадратика статов
  action-buttons.tsx    ← Profile: Deposit / Withdraw
  achievements.tsx      ← Profile: ачивки (мок-данные)
  referral-program.tsx  ← Profile: реферальный блок
  settings-menu.tsx     ← Profile: список настроек

  staking-content.tsx   ← Staking-таб ⚠ монолит 834 строки
  staking-action-modal.tsx ← Staking: модалка stake/unstake/claim

  deposit-funds-modal.tsx ← модалка пополнения ⚠ монолит 716 строк
  wallet-action-modal.tsx ← модалка withdraw
  wallet-overview-modal.tsx ← обзор кошелька

  crash/CrashGame.tsx   ← обёртка над игрой (просто рендерит StarRushPanel)
  game/StarRushPanel.tsx ← главный игровой экран, теперь тонкий (654 строки)
  game/CoefficientDisplay.tsx ← большой коэффициент по центру
  game/PlayersBetsList.tsx ← список ставок игроков
  game/RocketOverlay.tsx ← ракета поверх Phaser

  game/star-rush/       ← модули главного игрового экрана
    helpers.ts          ← константы, форматтеры, утилиты сравнения снимков
    hooks/
      use-round-adapter.ts    ← WebSocket + Phaser bootstrap
      use-wallet-balances.ts  ← TON/STARS balance state
      use-game-actions.ts     ← placeBet / cashOut + retry
    parts/
      ConnectionBanner.tsx    ← баннер "Нет соединения"
      HistoryRail.tsx         ← полоса с историей коэффициентов + status chip
      HistoryDetailsPopover.tsx ← portal popover с seed/hash
      MainCta.tsx             ← главная кнопка Bet / Cashout
      SettingsPopover.tsx     ← popover настроек (язык, вибрация)
      ToastLayer.tsx          ← всплывающее уведомление

  ui/                   ← shared UI primitives (используются на разных экранах)
    glass-card.tsx, glass-sheet.tsx, glass-segmented-control.tsx
    primary-button.tsx, secondary-button.tsx
    stat-card.tsx, stat-icon.tsx, chip.tsx
    bottom-nav-shell.tsx
```

## 3. CSS-модули (где не Tailwind, а отдельные .module.css)

Эти модули перекрывают Tailwind для сложных компонентов (анимации, специфические клипы):

| Файл | Где используется |
|---|---|
| `styles/starrush.module.css` (1314 строк) | Все стили внутри игрового экрана (history pills, MainCta states, popover) |
| `styles/staking-safe.module.css` | Staking-таб (vault hero, leaderboard) |
| `styles/place-bet-modal.module.css` | Бет-модалка (табы валют, чипы пресетов) |
| `styles/deposit-funds-modal.module.css` | Модалка пополнения |

При редизайне этих экранов меняй CSS-модуль, а не Tailwind в компоненте.

## 4. Куда смотреть для конкретных задач

| Что хочешь поменять | Где править |
|---|---|
| Primary цвет везде | `app/globals.css` (`--brand-1/2`, `--rgb-primary`) + `theme/colors.ts` |
| Фон модалок | `app/globals.css` → `--modal-background` |
| Главная CTA кнопка в игре | `components/game/star-rush/parts/MainCta.tsx` + CSS `.actionButton` в `starrush.module.css` |
| Кнопка Bet в модалке ставки | `components/bets/PlaceBetModal.tsx` + `place-bet-modal.module.css` |
| Кнопки Deposit/Withdraw на профиле | `components/action-buttons.tsx` |
| Stat-карточки (балансы, рефералы) | `components/stat-cards.tsx` → использует `components/ui/stat-card.tsx` |
| Bottom navigation | `components/bottom-navigation.tsx` (анимация ракеты там же) |
| Top HUD (баланс наверху) | `components/top-hud.tsx` |
| История крашей (рейл с пилюлями) | `components/game/star-rush/parts/HistoryRail.tsx` + классы `historyPill*` в `starrush.module.css` |
| Popover с детальной информацией о раунде | `components/game/star-rush/parts/HistoryDetailsPopover.tsx` |
| Тост в игре | `components/game/star-rush/parts/ToastLayer.tsx` |
| Баннер "Нет соединения" | `components/game/star-rush/parts/ConnectionBanner.tsx` |
| Аватарка в профиле | `components/profile-header.tsx` |
| Реферальный блок | `components/referral-program.tsx` |
| Список настроек | `components/settings-menu.tsx` |
| Bet-модалка целиком | `components/bets/PlaceBetModal.tsx` (430 строк) |
| Игровая сцена (Phaser, ракета, частицы) | `game/StarRushGame.ts` — отдельный мир, цвета в коде, не CSS |

## 5. Известные технические долги (после редизайна стоит закрыть)

1. **Хардкоженные rgba в JSX.** Точечно остались в:
   - `components/bottom-navigation.tsx` — кастомные градиенты ракеты + active pill
   - `components/referral-program.tsx` — много alpha-вариаций белого
   - `components/profile-header.tsx` — boxShadow
   - `components/app-bootstrap-splash.tsx` — splash shadow
   - `components/admin/*` — admin не критично

   Идея: при редизайне каждого компонента заменять `rgba(...)` на `rgba(var(--rgb-primary), 0.X)` или `hsl(var(--brand-1) / 0.X)`.

2. **CSS-модули с hex.** В `place-bet-modal.module.css` и `deposit-funds-modal.module.css` всё ещё встречаются hex значения. Постепенно мигрировать на `hsl(var(--…))`.

3. **Монолиты, которые ещё не разбиты:**
   - `app/(game)/page.tsx` — 654 строки (контейнер всех табов)
   - `components/staking-content.tsx` — 834 строки
   - `components/deposit-funds-modal.tsx` — 716 строк
   - `components/bets/PlaceBetModal.tsx` — 430 строк

   Разбирать по мере того, как доходишь до них в редизайне.

4. **Mock-данные в `app/(game)/page.tsx`:** `mockAchievements` (массив на 4 элемента), `rewards={8}` хардкодом. Заменить на API при подключении бэкенда.

5. **Legacy `--ui-*` алиасы в `theme/colors.ts`.** Постепенно мигрировать на канонические `--brand-1`/`--rgb-primary` в CSS-модулях. Не блокирует, но шум.

## 6. Как проверять изменения

```bash
# Локальный запуск (см. docs/local-dev.md)
docker compose -f docker-compose.dev.yml up -d
npx prisma migrate deploy
npm run dev:all

# TypeScript
npx tsc --noEmit

# Lint
npm run lint
```

В Telegram приложение открывается через BotFather Mini App URL; в обычном браузере — `http://localhost:3000` с автоматическим dev-auth.
