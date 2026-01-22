# ASM2 Dashboard

Multi-tenant analytics dashboard for RAG metrics with Logto authentication and role-based access control.

> **Note:** For environment variables, Docker deployment, and general project setup, see the [main README](../README.md) and [`.env.example`](../.env.example).

## Tech Stack

- [Next.js 15](https://nextjs.org) - React framework with App Router
- [Logto](https://logto.io/) - Self-hosted authentication and user management
- [QuestDB](https://questdb.io/) - High-performance time-series database
- [tRPC](https://trpc.io) - Type-safe API layer
- [Tailwind CSS 4](https://tailwindcss.com) - Styling
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Recharts](https://recharts.org/) - Data visualization

## Project Structure

```text
src/
├── app/                    # Next.js App Router pages and layouts
│   ├── _components/        # Page-specific components
│   ├── actions/            # Server actions (auth, etc.)
│   └── api/                # API routes (logto, trpc)
├── components/             # Reusable UI components
│   └── ui/                 # shadcn/ui primitives
├── lib/                    # Client-side utilities
│   ├── auth.ts             # Logto user context helper
│   └── logto.ts            # Logto configuration
├── server/                 # Server-side logic
│   ├── api/                # tRPC routers and procedures
│   └── db/                 # Database connection and queries
├── trpc/                   # tRPC client configuration
└── env.js                  # Environment variable validation schema
```

## Local Development

### Prerequisites

- Node.js 18+ and pnpm
- Environment variables configured (see root `.env.example`)

### Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001)

### Local Database Override

When running the dashboard locally while QuestDB runs in Docker, create a `.env.local` file:

```env
QUESTDB_HOST=localhost
```

### Verify Configuration

```bash
pnpm typecheck
```

## Role-Based Access Control

### Administrator (`admin` role)

- View and switch between all organizations/nodes
- Access node management page
- View aggregated metrics across all organizations
- Export data from any organization

### End User (any other role)

- View only their own organization's data
- Cannot switch between organizations
- Data automatically filtered to their organization

## Troubleshooting

| Error                           | Cause                    | Solution                                                           |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `TypeError: fetch failed`       | QuestDB not reachable    | Check `QUESTDB_HOST` (`questdb` for Docker, `localhost` for local) |
| `Invalid environment variables` | Missing/invalid env vars | Run `pnpm typecheck` to see details                                |
| `Redirect loop after login`     | Mismatched URLs          | Verify `NEXT_PUBLIC_APP_URL` and `LOGTO_ENDPOINT`                  |
