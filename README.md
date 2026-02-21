This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

For full local game stack (app + gateway + round worker) in one command:

```bash
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Local Crash Visual Demo

The current crash game UI is a local-only visual demo (no backend calls). It uses a PixiJS scene layer plus a React UI overlay:

- [components/crash-game.tsx](components/crash-game.tsx) — UI, local round simulation, and overlay.
- [components/crash-pixi-layer.tsx](components/crash-pixi-layer.tsx) — PixiJS scene layer (ship, stars, asteroids).

## Project Structure (StarRush)

Use this as the single source of truth when adding or editing files to keep a consistent style.

- [app/](app/) — Next.js App Router pages and layouts.
	- [app/layout.tsx](app/layout.tsx) — Root layout and shared shell.
	- [app/page.tsx](app/page.tsx) — Home route.
	- [app/globals.css](app/globals.css) — Global styles.
- [components/](components/) — Reusable UI sections and widgets (profile, stats, staking, settings, etc.).
- [lib/](lib/) — Shared utilities and helpers.
	- [lib/utils.ts](lib/utils.ts) — Common helpers.
- [public/](public/) — Static assets.

## Conventions

- Keep route-level UI in [app/](app/), and extract reusable UI into [components/](components/).
- Place cross-cutting helpers in [lib/](lib/).
- Prefer consistent component composition and naming patterns already present in [components/](components/).
- Maintain existing styling patterns in [app/globals.css](app/globals.css) and component styles.

## Roadmap

- Telegram Mini App plan: [docs/telegram-miniapp-roadmap.md](docs/telegram-miniapp-roadmap.md)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
