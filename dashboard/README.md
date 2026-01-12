# ASM2 Central

Multi-tenant analytics dashboard for RAG metrics with WorkOS authentication and role-based access control.

## Tech Stack

- [Next.js 15](https://nextjs.org) - React framework with App Router
- [WorkOS AuthKit](https://workos.com/docs/authkit) - Authentication and user management
- [QuestDB](https://questdb.io/) - High-performance time-series database for metrics
- [tRPC](https://trpc.io) - Type-safe API layer
- [Tailwind CSS 4](https://tailwindcss.com) - Styling
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Recharts](https://recharts.org/) - Data visualization

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and layouts
│   ├── _components/        # Page-specific components
│   └── api/                # API routes (auth, trpc)
├── components/             # Reusable UI components
│   └── ui/                 # shadcn/ui primitives
├── lib/                    # Client-side utilities 
├── server/                 # Server-side logic
│   ├── api/                # tRPC routers and procedures
│   └── db/                 # Database connection and queries (QuestDB)
├── trpc/                   # tRPC client configuration
└── env.js                  # Environment variable validation schema
```

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- QuestDB instance (local or cloud)
- WorkOS account and application

### WorkOS Setup

#### Step 1: Create WorkOS Account and Application

1. Sign up for a WorkOS account at [https://dashboard.workos.com/](https://dashboard.workos.com/)

2. Create a new application in the WorkOS dashboard:
   - Click "Create Application"
   - Enter your application name (e.g., "ASM2 Central")
   - Select your application type

#### Step 2: Configure Authentication Methods

1. In your WorkOS application dashboard, navigate to **Authentication** settings

2. Enable the authentication methods you want to support:
   - **Email/Password**: Basic email and password authentication
   - **Magic Link**: Passwordless email authentication
   - **SSO**: Enterprise single sign-on (Google, Microsoft, Okta, etc.)
   - **Social Login**: OAuth providers (GitHub, Google, etc.)

3. Configure your authentication settings:
   - Set session duration (default: 7 days)
   - Configure password requirements if using email/password
   - Customize email templates (optional)

#### Step 3: Configure Redirect URIs

1. In the WorkOS dashboard, navigate to **Redirect URIs**

2. Add your redirect URIs for each environment:
   - **Development**: `http://localhost:3001/api/auth/callback`
   - **Production**: `https://yourdomain.com/api/auth/callback`

3. **Important**: The redirect URI must match exactly (including protocol and port)

#### Step 4: Get Your Credentials

1. Navigate to the **API Keys** section in your WorkOS dashboard

2. Copy your credentials:
   - **API Key**: Starts with `sk_test_` (test) or `sk_live_` (production)
   - **Client ID**: Starts with `client_`

3. **Security Note**: Never commit these credentials to version control

#### Step 5: Generate Cookie Password

Generate a secure 32+ character password for cookie encryption:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32
```

### Environment Configuration

#### Step 1: Create Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

#### Step 2: Configure Database Connection (QuestDB)

Configure the connection to your QuestDB instance:

```bash
QUESTDB_HOST=localhost
QUESTDB_PORT=8812
QUESTDB_USER=admin
QUESTDB_PASSWORD=quest
QUESTDB_DB=qdb
```

#### Step 3: Configure WorkOS Credentials

Fill in your WorkOS credentials from Step 4 of WorkOS Setup:

```bash
WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...
WORKOS_COOKIE_PASSWORD=...
```

#### Step 4: Configure Redirect URI

Set the redirect URI to match your environment:

```bash
# Development
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3001/api/auth/callback

# Production
NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://yourdomain.com/api/auth/callback
```

#### Step 5: Verify Configuration

Verify your environment variables are valid:

```bash
npm run typecheck
```

If validation fails, check the error messages for specific issues with your environment variables.

### Installation

1. Install dependencies:

   ```bash
   pnpm install
   # or
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open [http://localhost:3001](http://localhost:3001) in your browser

## Role Configuration

The application uses WorkOS organization roles to determine user permissions.

### Role Types

**Administrator (`admin` role)**

- Can view and switch between all organizations/nodes
- Can access the node management page
- Can view aggregated metrics across all organizations
- Can export data from any organization

**End User (any other role or no role)**

- Can only view their own organization's data
- Cannot switch between organizations
- Cannot access admin-only features
- Data is automatically filtered to their organization

## Troubleshooting

### Database Connection Issues

**Problem**: Cannot connect to QuestDB

**Solutions**:
- Verify QuestDB is running and accessible.
- Check that the `QUESTDB_HOST` and `QUESTDB_PORT` (usually 8812 for PG wire) are correct.
- Ensure the user and password are correct.
- Check `src/server/db/connection.ts` logic if issues persist.

### Authentication Issues

**Problem**: "Unauthorized" or "Forbidden"

**Solutions**:
- Check that the user belongs to an organization in WorkOS.
- Verify the Redirect URI matches exactly in both `.env` and WorkOS Dashboard.

### Common Errors

- `TypeError: fetch failed`: Often indicates the QuestDB server is not reachable.
- `Invalid environment variables`: Check `src/env.js` for validation rules.
