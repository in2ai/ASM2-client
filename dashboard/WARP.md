# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common Development Commands

### Development Server

- `bun run dev` - Start Next.js development server with Turbo (runs on port 3000)
- `bun run start` - Start production server on 0.0.0.0:3001 (for Docker compatibility)
- `bun run preview` - Build and start production server for testing

### Code Quality

- `bun run check` - Run both linting and type checking
- `bun run lint` - Run ESLint
- `bun run lint:fix` - Run ESLint with auto-fix
- `bun run typecheck` - Run TypeScript compiler without emitting files
- `bun run format:check` - Check code formatting with Prettier
- `bun run format:write` - Format code with Prettier

### Testing

- `bun run test` - Run Playwright tests
- `bun run test:ui` - Run Playwright tests with UI mode

### Build & Deployment

- `bun run build` - Create production build
- `docker-compose up` - Start full application stack with MongoDB

### Database Operations

- `bun run seed` - Seed MongoDB with sample RAG metrics data
- `docker-compose up mongodb` - Start MongoDB container only

## Architecture Overview

### Tech Stack

This is a **T3 Stack** Next.js application with the following key technologies:

- **Next.js 15** with App Router and React 19
- **tRPC** for type-safe API routes and client-server communication
- **MongoDB** with Mongoose ODM for data persistence
- **Tailwind CSS v4** for styling
- **TypeScript** with strict configuration
- **Playwright** for E2E testing

### Project Structure

```
src/
├── app/                    # Next.js App Router pages and layouts
│   ├── _components/        # Page-specific components
│   ├── api/trpc/          # tRPC API endpoint
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/ui/          # Reusable UI components (shadcn/ui style)
├── lib/                   # Core utilities and database connection
├── models/                # Mongoose schemas and TypeScript interfaces
├── server/api/            # tRPC server-side API logic
│   ├── routers/           # tRPC route handlers
│   ├── root.ts            # Main router combining all sub-routers
│   └── trpc.ts            # tRPC configuration and middleware
├── trpc/                  # Client-side tRPC setup
├── styles/                # Global CSS and Tailwind imports
└── env.js                 # Environment variable validation with Zod
```

### Key Architecture Patterns

#### tRPC API Layer

- **Router Structure**: All API routes are defined in `src/server/api/routers/` and combined in `root.ts`
- **Type Safety**: Full end-to-end type safety from server to client
- **Client Setup**: React Query integration via `@trpc/react-query`
- **Server-Side Rendering**: API calls are prefetched in server components

#### Database Integration

- **Connection Management**: `src/lib/db.ts` handles MongoDB connection lifecycle with connection reuse
- **Models**: Mongoose schemas in `src/models/` with TypeScript interfaces
- **Error Handling**: Uses `neverthrow` Result pattern in seed scripts

#### Component Architecture

- **Server Components**: Default for data fetching and SEO
- **Client Components**: Used for interactivity (marked with "use client")
- **UI Components**: shadcn/ui pattern in `components/ui/`
- **Page Components**: Specific to routes in `app/_components/`

### Environment Configuration

Required environment variables:

- `MONGODB_URI` - MongoDB connection string (validated by Zod)
- `NODE_ENV` - Runtime environment

The app includes Docker Compose configuration for local MongoDB development.

### Development Workflow

1. **Database Setup**: Run `docker-compose up mongodb` to start MongoDB
2. **Seed Data**: Run `bun run seed` to populate initial RAG metrics data
3. **Development**: Run `bun run dev` to start the development server
4. **Code Quality**: Use `bun run check` before commits
5. **Testing**: Run `bun run test` for E2E tests

### Application Domain

This application is a **RAG (Retrieval-Augmented Generation) Metrics Dashboard** that:

- Displays comprehensive analytics for RAG system performance
- Tracks usage metrics, quality metrics, performance data, and alerts
- Shows department-wise distribution and query analytics
- Provides real-time monitoring of AI/ML system health

The main data model (`IRAGMetric`) includes:

- Usage metrics (users, sessions, queries)
- RAG quality metrics (retrieval rates, latency)
- Performance metrics (response times, token usage, costs)
- Analytics (top queries, thematic distribution)
- Alerts and system status
