# Environment Configuration Guide

This guide provides comprehensive instructions for configuring environment variables for the ACM2 Central multi-tenant analytics dashboard.

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Variables Reference](#environment-variables-reference)
- [Database Configuration](#database-configuration)
- [WorkOS Configuration](#workos-configuration)
- [Role Mapping](#role-mapping)
- [Environment-Specific Setup](#environment-specific-setup)
- [Validation and Testing](#validation-and-testing)
- [Troubleshooting](#troubleshooting)

## Quick Start

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in the required values (see sections below)

3. Verify configuration:
   ```bash
   npm run typecheck
   ```

## Environment Variables Reference

### Required Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `MONGODB_URI` | Server | MongoDB connection string | `mongodb://localhost:27017/acm2-central` |
| `WORKOS_API_KEY` | Server | WorkOS API key from dashboard | `sk_test_abc123...` |
| `WORKOS_CLIENT_ID` | Server | WorkOS client ID from dashboard | `client_01ABC...` |
| `WORKOS_COOKIE_PASSWORD` | Server | 32+ character encryption key | Generated via crypto |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | Client | OAuth callback URL | `http://localhost:3001/api/auth/callback` |
| `NODE_ENV` | Server | Node environment | `development`, `test`, or `production` |

### Optional Variables

| Variable | Type | Description | Default |
|----------|------|-------------|---------|
| `SKIP_ENV_VALIDATION` | Server | Skip environment validation | `false` |

## Database Configuration

### Local MongoDB

For local development with MongoDB running on your machine:

```bash
MONGODB_URI=mongodb://localhost:27017/acm2-central
```

**Prerequisites:**
- MongoDB installed and running
- Default port 27017 available

**Verify connection:**
```bash
mongosh mongodb://localhost:27017/acm2-central
```

### MongoDB Atlas (Cloud)

For cloud-hosted MongoDB:

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/acm2-central?retryWrites=true&w=majority
```

**Setup steps:**
1. Create cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create database user with read/write permissions
3. Whitelist your IP address (or use 0.0.0.0/0 for development)
4. Get connection string from "Connect" → "Connect your application"
5. Replace `<username>`, `<password>`, and `<cluster>` with your values

**Security notes:**
- Use strong passwords
- Restrict IP access in production
- Use separate databases for dev/staging/production

### Docker Compose

For containerized MongoDB:

```bash
MONGODB_URI=mongodb://mongodb:27017/acm2-central
```

**Prerequisites:**
- Docker and Docker Compose installed
- MongoDB service defined in `docker-compose.yml`

### MongoDB with Authentication

For MongoDB with username/password authentication:

```bash
MONGODB_URI=mongodb://username:password@localhost:27017/acm2-central?authSource=admin
```

**Parameters:**
- `username`: MongoDB user
- `password`: User password (URL-encode special characters)
- `authSource`: Authentication database (usually `admin`)

### MongoDB Replica Set

For high-availability MongoDB setup:

```bash
MONGODB_URI=mongodb://host1:27017,host2:27017,host3:27017/acm2-central?replicaSet=rs0
```

**Use cases:**
- Production deployments
- High availability requirements
- Geographic distribution

## WorkOS Configuration

### Getting WorkOS Credentials

#### Step 1: Create WorkOS Account

1. Sign up at [dashboard.workos.com](https://dashboard.workos.com/)
2. Verify your email address
3. Complete account setup

#### Step 2: Create Application

1. Click "Create Application" in dashboard
2. Enter application details:
   - **Name**: ACM2 Central (or your app name)
   - **Type**: Web Application
3. Save application

#### Step 3: Get API Credentials

1. Navigate to **API Keys** section
2. Copy your credentials:
   - **API Key**: Starts with `sk_test_` (test) or `sk_live_` (production)
   - **Client ID**: Starts with `client_`

**Example:**
```bash
WORKOS_API_KEY=sk_test_1234567890abcdefghijklmnopqrstuvwxyz
WORKOS_CLIENT_ID=client_01ABCDEFGHIJKLMNOPQRSTUVWXYZ
```

**Security:**
- Never commit these to version control
- Use different keys for dev/staging/production
- Rotate keys periodically

#### Step 4: Configure Redirect URIs

1. In WorkOS dashboard, go to **Redirect URIs**
2. Add URIs for each environment:

**Development:**
```
http://localhost:3001/api/auth/callback
```

**Staging:**
```
https://staging.yourdomain.com/api/auth/callback
```

**Production:**
```
https://yourdomain.com/api/auth/callback
```

**Important:**
- Must match exactly (including protocol, port, path)
- No trailing slashes
- HTTPS required for production

#### Step 5: Generate Cookie Password

Generate a secure 32+ character password for cookie encryption:

**Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Using OpenSSL:**
```bash
openssl rand -hex 32
```

**Using Python:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**Example output:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

Add to `.env`:
```bash
WORKOS_COOKIE_PASSWORD=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### Configuring Authentication Methods

In WorkOS dashboard, navigate to **Authentication** and enable desired methods:

- **Email/Password**: Traditional authentication
- **Magic Link**: Passwordless email authentication
- **Social Login**: Google, GitHub, Microsoft, etc.
- **SSO**: Enterprise single sign-on (SAML, OIDC)

## Role Mapping

### Overview

The application uses WorkOS organization roles to determine user permissions:

- **Administrator** (`admin` role): Full access to all organizations
- **End User** (any other role): Access only to their organization

### Configuring Roles in WorkOS

#### Via WorkOS Dashboard

1. Go to [dashboard.workos.com](https://dashboard.workos.com/)
2. Navigate to **Organizations**
3. Select an organization
4. Click **Members** tab
5. For each user:
   - Click user name
   - Set role to `admin` for administrators
   - Leave blank or use custom role for end users
   - Save changes

#### Via WorkOS API

```bash
curl https://api.workos.com/organizations/{org_id}/memberships/{membership_id} \
  -X PUT \
  -H "Authorization: Bearer ${WORKOS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'
```

#### Via WorkOS SDK

```typescript
import { WorkOS } from '@workos-inc/node';

const workos = new WorkOS(process.env.WORKOS_API_KEY);

await workos.organizations.updateOrganizationMembership({
  organizationMembership: 'om_01ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  role: 'admin',
});
```

### Role Mapping Logic

The application maps WorkOS roles to application roles:

```typescript
// src/server/api/trpc.ts
const role = user.role === 'admin' ? 'admin' : 'user';
```

**Mapping table:**

| WorkOS Role | Application Role | Permissions |
|-------------|------------------|-------------|
| `admin` | `admin` | View all organizations, switch nodes, admin endpoints |
| Any other or none | `user` | View own organization only |

### Organization to Node Mapping

Each WorkOS organization maps to a "node" (company) in the application:

```
WorkOS Organization ID → nodeId in database
```

**Example:**
- WorkOS Org: `org_01ABCDEFGHIJKLMNOPQRSTUVWXYZ`
- Database Node: `{ nodeId: "acme-corp", workosOrganizationId: "org_01ABC..." }`

## Environment-Specific Setup

### Development Environment

```bash
# .env.development (or .env)
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/acm2-central
WORKOS_API_KEY=sk_test_your_test_key
WORKOS_CLIENT_ID=client_your_test_client
WORKOS_COOKIE_PASSWORD=your_generated_32_char_password
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3001/api/auth/callback
```

**Characteristics:**
- Use test WorkOS credentials
- Local MongoDB or development Atlas cluster
- HTTP allowed for localhost
- Detailed error messages enabled

### Staging Environment

```bash
# .env.staging
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@staging-cluster.mongodb.net/acm2-central
WORKOS_API_KEY=sk_test_your_test_key
WORKOS_CLIENT_ID=client_your_test_client
WORKOS_COOKIE_PASSWORD=your_generated_32_char_password
NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://staging.yourdomain.com/api/auth/callback
```

**Characteristics:**
- Use test WorkOS credentials
- Separate staging database
- HTTPS required
- Production-like configuration

### Production Environment

```bash
# Set via platform environment variables (not .env file)
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@prod-cluster.mongodb.net/acm2-central
WORKOS_API_KEY=sk_live_your_production_key
WORKOS_CLIENT_ID=client_your_production_client
WORKOS_COOKIE_PASSWORD=your_generated_32_char_password
NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://yourdomain.com/api/auth/callback
```

**Characteristics:**
- Use live WorkOS credentials
- Production database with backups
- HTTPS required
- Error messages sanitized
- Monitoring and logging enabled

**Security checklist:**
- [ ] Use `sk_live_` API key
- [ ] Strong cookie password (64+ chars recommended)
- [ ] HTTPS only
- [ ] IP whitelisting for database
- [ ] Separate database from dev/staging
- [ ] Environment variables via platform (not .env file)
- [ ] Regular credential rotation

## Validation and Testing

### Validate Environment Variables

The application uses Zod schemas to validate environment variables at build time:

```bash
npm run typecheck
```

**What it checks:**
- All required variables are present
- Variable formats are correct (URLs, minimum lengths, etc.)
- Type safety for TypeScript

**Example validation errors:**

```
❌ Invalid environment variables:
  MONGODB_URI: Invalid url
  WORKOS_COOKIE_PASSWORD: String must contain at least 32 character(s)
```

### Test Database Connection

```bash
# Using mongosh
mongosh "${MONGODB_URI}"

# Should connect successfully and show:
# Current Mongosh Log ID: ...
# Connecting to: mongodb://...
# Using MongoDB: ...
```

### Test WorkOS Configuration

1. Start development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:3001`

3. Should redirect to WorkOS authentication

4. After login, should redirect back to application

**Check for:**
- No redirect loops
- Session persists on refresh
- User information displays correctly

### Test Role-Based Access

1. Create test users with different roles in WorkOS

2. Sign in as end user:
   - Should see only their organization's data
   - Should NOT see node selector
   - Should see company name in header

3. Sign in as admin:
   - Should see node selector dropdown
   - Should be able to switch between organizations
   - Should see "Admin" badge in user menu

## Troubleshooting

### Environment Variable Not Found

**Error:**
```
Error: Environment variable WORKOS_API_KEY is not defined
```

**Solutions:**
1. Verify `.env` file exists in project root
2. Check variable name spelling (case-sensitive)
3. Restart development server after adding variables
4. For Docker: ensure variables are passed to container

### Invalid MongoDB URI

**Error:**
```
❌ Invalid environment variables:
  MONGODB_URI: Invalid url
```

**Solutions:**
1. Check URI format: `mongodb://` or `mongodb+srv://`
2. Ensure no spaces in URI
3. URL-encode special characters in password
4. Verify host and port are correct

**Valid formats:**
```bash
# Local
mongodb://localhost:27017/dbname

# Atlas
mongodb+srv://user:pass@cluster.mongodb.net/dbname

# With auth
mongodb://user:pass@host:27017/dbname?authSource=admin
```

### Cookie Password Too Short

**Error:**
```
❌ Invalid environment variables:
  WORKOS_COOKIE_PASSWORD: String must contain at least 32 character(s)
```

**Solution:**
Generate a new password with at least 32 characters:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Redirect URI Mismatch

**Error:**
```
redirect_uri_mismatch: The redirect URI provided does not match
```

**Solutions:**
1. Check `.env` value matches WorkOS dashboard exactly
2. Include protocol: `http://` or `https://`
3. Include port if not standard: `:3001`
4. No trailing slash: `/api/auth/callback` not `/api/auth/callback/`
5. Check for typos

**Verify match:**
```bash
# In .env
echo $NEXT_PUBLIC_WORKOS_REDIRECT_URI

# Should match WorkOS dashboard exactly
```

### Environment Variables Not Loading in Production

**Problem:**
App works locally but fails in production with missing environment variables.

**Solutions:**
1. Don't use `.env` file in production
2. Set variables via platform's environment variable system:
   - Vercel: Project Settings → Environment Variables
   - Netlify: Site Settings → Environment Variables
   - AWS: ECS Task Definition or Lambda Configuration
   - Docker: Pass via `-e` flag or docker-compose
3. Verify `NEXT_PUBLIC_*` variables are set at build time
4. Check `NODE_ENV=production` is set

### NEXT_PUBLIC Variables Not Available

**Problem:**
Client-side code can't access `NEXT_PUBLIC_*` variables.

**Solutions:**
1. Ensure variable name starts with `NEXT_PUBLIC_`
2. Restart development server after adding
3. For production: set at build time, not runtime
4. Check browser console: `console.log(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI)`

## Best Practices

### Security

1. **Never commit secrets to version control**
   - Add `.env` to `.gitignore`
   - Use `.env.example` for documentation only
   - Rotate credentials regularly

2. **Use different credentials per environment**
   - Development: test keys
   - Staging: test keys (different from dev)
   - Production: live keys

3. **Restrict access**
   - Database: IP whitelisting
   - WorkOS: Separate applications per environment
   - Minimum required permissions

### Organization

1. **Document all variables**
   - Keep `.env.example` up to date
   - Add comments explaining purpose
   - Include example values

2. **Use consistent naming**
   - Follow existing patterns
   - Use SCREAMING_SNAKE_CASE
   - Prefix client variables with `NEXT_PUBLIC_`

3. **Validate early**
   - Use Zod schemas in `src/env.js`
   - Fail fast on invalid configuration
   - Provide clear error messages

### Maintenance

1. **Regular audits**
   - Review environment variables quarterly
   - Remove unused variables
   - Update documentation

2. **Credential rotation**
   - Rotate secrets every 90 days
   - Update all environments
   - Test after rotation

3. **Monitoring**
   - Log configuration errors
   - Alert on authentication failures
   - Track environment-specific issues

## Additional Resources

- [WorkOS Documentation](https://workos.com/docs)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [MongoDB Connection Strings](https://www.mongodb.com/docs/manual/reference/connection-string/)
- [T3 Env Documentation](https://env.t3.gg/)
