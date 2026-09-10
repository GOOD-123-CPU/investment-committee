# Investment Committee

AI-assisted investment research terminal built with Next.js, Prisma, Tailwind CSS, and shadcn/ui.

The app combines live market data, a local securities universe, index knowledge, market slang explanations, multi-agent research, bull/bear debate, risk review, and portfolio tooling in one terminal-style interface.

## Features

- Global market dashboard with index monitoring and quote views
- AI investment research pipeline with analyst agents, debate, risk review, voting, and CIO-style decision output
- Local SQLite data store managed by Prisma
- Bundled seed universe for A-share, Hong Kong, and U.S. market discovery
- Index encyclopedia and market slang dictionary for better query understanding
- Watchlist, recent research, comparison, and portfolio analysis workflows
- Optional MiMo-compatible LLM provider for deeper reasoning flows

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Prisma with SQLite
- Bun

## Getting Started

Install dependencies:

```bash
bun install
```

Create a local environment file:

```bash
cp .env.example .env
```

Initialize the database:

```bash
bun run db:push
```

Start the development server:

```bash
bun run dev
```

Open `http://localhost:3000`.

## Environment Variables

`DATABASE_URL` is required for Prisma. `MIMO_API_KEY` is optional unless you use the MiMo provider or run scripts that generate MiMo candidates.

```env
DATABASE_URL="file:./db/custom.db"
MIMO_BASE_URL="https://api.xiaomimimo.com/v1"
MIMO_API_KEY=""
MIMO_MODEL="mimo-v2.5"
```

## Data Notes

The repository includes a seed universe at `db/seed/universe.json`. Runtime prices, quotes, and related market fields are fetched through the app data layer and may depend on third-party market data availability.

## Disclaimer

This project is for research and educational use only. Generated analysis is not financial advice and should not be used as the sole basis for investment decisions.

## License

MIT
