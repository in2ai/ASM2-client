# ASM2 Central

Multi-tenant analytics dashboard for RAG metrics with WorkOS authentication and role-based access control.

## Tech Stack

- [Next.js 15](https://nextjs.org) - React framework with App Router
- [WorkOS AuthKit](https://workos.com/docs/authkit) - Authentication and user management
- [MongoDB](https://www.mongodb.com/) - Database with Mongoose ODM
- [tRPC](https://trpc.io) - Type-safe API layer
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Recharts](https://recharts.org/) - Data visualization

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- MongoDB instance (local or cloud)
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
   - **Staging**: `https://staging.yourdomain.com/api/auth/callback`
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

# Using Python
python -c "import secrets; print(secrets.token_hex(32))"
```

#### Step 6: Create Organizations (Optional)

If you want to test multi-tenant functionality:

1. Navigate to **Organizations** in WorkOS dashboard
2. Click "Create Organization"
3. Add organization details (name, domain, etc.)
4. Invite users to the organization
5. Assign roles to users (see Role Configuration section below)

### Environment Configuration

#### Step 1: Create Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

#### Step 2: Configure Database Connection

Choose the appropriate MongoDB connection string for your setup:

**Local MongoDB:**

```bash
MONGODB_URI=mongodb://localhost:27017/asm2-central
```

**MongoDB Atlas (Cloud):**

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/asm2-central?retryWrites=true&w=majority
```

**Docker Compose:**

```bash
MONGODB_URI=mongodb://mongodb:27017/asm2-central
```

**MongoDB with Authentication:**

```bash
MONGODB_URI=mongodb://username:password@localhost:27017/asm2-central?authSource=admin
```

**MongoDB Replica Set:**

```bash
MONGODB_URI=mongodb://host1:27017,host2:27017,host3:27017/asm2-central?replicaSet=rs0
```

#### Step 3: Configure WorkOS Credentials

Fill in your WorkOS credentials from Step 4 of WorkOS Setup:

```bash
WORKOS_API_KEY=sk_test_1234567890abcdefghijklmnopqrstuvwxyz
WORKOS_CLIENT_ID=client_01ABCDEFGHIJKLMNOPQRSTUVWXYZ
WORKOS_COOKIE_PASSWORD=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
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
   npm install
   # or
   bun install
   ```

2. Seed the database (optional):

   ```bash
   # Seed metrics data
   npm run seed

   # Seed nodes/companies from existing metrics
   npm run seed:nodes
   ```

3. Run multi-tenant database migration:

   ```bash
   # Run the full migration (creates indexes, migrates data, seeds nodes)
   npm run migrate:multi-tenant

   # Or verify current state first
   npm run migrate:verify
   ```

   See [Multi-Tenant Migration Guide](./docs/MULTI_TENANT_MIGRATION.md) for detailed instructions.

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3001](http://localhost:3001) in your browser

### Role Configuration

The application uses WorkOS organization roles to determine user permissions. There are two role types:

#### Role Types

**Administrator (`admin` role)**

- Can view and switch between all organizations/nodes
- Can access the node management page
- Can view aggregated metrics across all organizations
- Can export data from any organization
- Has access to admin-only API endpoints

**End User (any other role or no role)**

- Can only view their own organization's data
- Cannot switch between organizations
- Cannot access admin-only features
- Data is automatically filtered to their organization

#### Configuring Roles in WorkOS

**Method 1: Via WorkOS Dashboard**

1. Log in to your WorkOS dashboard at [https://dashboard.workos.com/](https://dashboard.workos.com/)

2. Navigate to **Organizations**

3. Select the organization you want to configure

4. Click on **Members** tab

5. For each user:
   - Click on the user's name
   - Assign role: `admin` for administrators, or leave blank/use custom role for end users
   - Save changes

**Method 2: Via WorkOS API**

```bash
curl https://api.workos.com/organizations/{org_id}/memberships/{membership_id} \
  -X PUT \
  -H "Authorization: Bearer ${WORKOS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "admin"
  }'
```

**Method 3: Via WorkOS SDK**

```typescript
import { WorkOS } from "@workos-inc/node";

const workos = new WorkOS(process.env.WORKOS_API_KEY);

await workos.organizations.updateOrganizationMembership({
  organizationMembership: "om_01ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  role: "admin",
});
```

#### Role Mapping Logic

The application determines roles using the following logic:

```typescript
// In TRPC context (src/server/api/trpc.ts)
const role = user.role === "admin" ? "admin" : "user";
```

- If WorkOS user has `role: 'admin'` → Application role: `admin`
- If WorkOS user has any other role or no role → Application role: `user`

#### Testing Roles

To test different role behaviors:

1. **Create test users** in WorkOS with different roles
2. **Sign in** with each user to verify role-based access
3. **Check the user menu** - it displays the current role badge
4. **Verify access**:
   - Admins should see the node selector dropdown
   - End users should see their company name (no selector)

#### Organization Mapping

Each WorkOS organization maps to a "node" (company) in the application:

- `workosOrganizationId` → `nodeId` in the database
- Users are automatically associated with their organization
- Metrics are filtered by `nodeId` based on user's organization

## Troubleshooting

### Environment Configuration Issues

#### Environment Validation Errors

**Problem**: Build fails with environment validation errors

**Solutions**:

- Ensure all required environment variables are set in `.env`
- Check that `WORKOS_COOKIE_PASSWORD` is at least 32 characters
- Verify `NEXT_PUBLIC_WORKOS_REDIRECT_URI` matches your WorkOS dashboard configuration
- Run `npm run typecheck` to see specific validation errors
- Check for typos in variable names (they are case-sensitive)

**Example Error**:

```
❌ Invalid environment variables:
  WORKOS_COOKIE_PASSWORD: String must contain at least 32 character(s)
```

**Fix**: Generate a new password with at least 32 characters:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Missing Environment Variables

**Problem**: Application crashes with "Environment variable not found"

**Solutions**:

- Verify `.env` file exists in the project root
- Check that all variables from `.env.example` are present in `.env`
- Restart the development server after adding new variables
- For Docker: ensure environment variables are passed to the container

**Check your configuration**:

```bash
# Verify .env file exists
ls -la .env

# Check if variables are loaded (development only)
npm run dev | grep "Environment"
```

### Authentication Issues

#### Authentication Redirect Loop

**Problem**: Browser keeps redirecting between app and WorkOS

**Solutions**:

- Verify redirect URI in `.env` matches WorkOS dashboard exactly
- Check that the redirect URI includes the protocol (`http://` or `https://`)
- Ensure the port matches your development server (default: 3001)
- Clear browser cookies and cache
- Check for trailing slashes (should be: `/api/auth/callback` not `/api/auth/callback/`)

**Verify configuration**:

```bash
# In .env
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3001/api/auth/callback

# In WorkOS dashboard, should match exactly:
# http://localhost:3001/api/auth/callback
```

#### Session Not Persisting

**Problem**: User gets logged out immediately or on page refresh

**Solutions**:

- Clear browser cookies and try again
- Verify `WORKOS_COOKIE_PASSWORD` is set correctly (32+ characters)
- Check browser console for cookie-related errors
- Ensure cookies are enabled in browser
- Check if browser is blocking third-party cookies
- Verify `NODE_ENV` is set correctly

**Debug steps**:

```bash
# Check browser console for errors
# Look for: "Failed to set cookie" or "Cookie blocked"

# Verify cookie settings in browser DevTools:
# Application → Cookies → localhost:3001
# Should see: wos-session cookie
```

#### "Unauthorized" or "Forbidden" Errors

**Problem**: User sees authorization errors after logging in

**Solutions**:

- Verify user exists in WorkOS organization
- Check user role assignment in WorkOS dashboard
- Ensure organization is properly configured
- Clear session and log in again
- Check server logs for detailed error messages

**Verify user setup**:

1. Go to WorkOS dashboard → Organizations
2. Find the user's organization
3. Check Members tab - user should be listed
4. Verify role is assigned correctly

### Database Issues

#### MongoDB Connection Errors

**Problem**: Cannot connect to MongoDB

**Solutions**:

- Verify MongoDB is running: `mongosh` or `mongo`
- Check the `MONGODB_URI` format: `mongodb://host:port/database`
- For MongoDB Atlas, ensure your IP is whitelisted
- Check network connectivity
- Verify credentials if using authentication
- Check firewall settings

**Test connection**:

```bash
# Test local MongoDB
mongosh mongodb://localhost:27017/asm2-central

# Test MongoDB Atlas
mongosh "mongodb+srv://cluster.mongodb.net/asm2-central" --username youruser
```

**Common connection string issues**:

```bash
# ❌ Wrong - missing protocol
MONGODB_URI=localhost:27017/asm2-central

# ✅ Correct - includes protocol
MONGODB_URI=mongodb://localhost:27017/asm2-central

# ❌ Wrong - incorrect Atlas format
MONGODB_URI=mongodb://cluster.mongodb.net/asm2-central

# ✅ Correct - Atlas uses mongodb+srv
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/asm2-central
```

#### Database Index Errors

**Problem**: Slow queries or index-related errors

**Solutions**:

- Run the database setup script: `npm run seed:nodes`
- Manually create indexes in MongoDB shell
- Check MongoDB logs for index creation errors
- Verify sufficient disk space

**Create indexes manually**:

```javascript
// Connect to MongoDB shell
use asm2-central

// Create required indexes
db.ragmetrics.createIndex({ nodeId: 1, timestamp: -1 })
db.ragmetrics.createIndex({ nodeId: 1 })
db.nodes.createIndex({ nodeId: 1 }, { unique: true })
db.nodes.createIndex({ workosOrganizationId: 1 }, { unique: true })

// Verify indexes
db.ragmetrics.getIndexes()
db.nodes.getIndexes()
```

#### No Data Showing in Dashboard

**Problem**: Dashboard loads but shows no metrics

**Solutions**:

- Verify metrics exist in database for the user's organization
- Check that `nodeId` in metrics matches user's `organizationId`
- Run seed script to populate test data: `npm run seed`
- Check browser console and server logs for errors
- Verify date range filter isn't excluding all data

**Check data in MongoDB**:

```javascript
// Connect to MongoDB shell
use asm2-central

// Check if metrics exist
db.ragmetrics.countDocuments()

// Check metrics for specific node
db.ragmetrics.find({ nodeId: "your-node-id" }).limit(5)

// Check nodes collection
db.nodes.find()
```

### Role and Permission Issues

#### Admin Features Not Showing

**Problem**: User should be admin but doesn't see admin features

**Solutions**:

- Verify user has `admin` role in WorkOS dashboard
- Clear session and log in again
- Check browser console for role information
- Verify role mapping logic in application

**Debug role assignment**:

```typescript
// Add temporary logging in src/server/api/trpc.ts
console.log("User role from WorkOS:", user.role);
console.log("Mapped application role:", role);
```

#### User Can't Access Their Organization's Data

**Problem**: End user sees "no data" or authorization errors

**Solutions**:

- Verify user is assigned to an organization in WorkOS
- Check that organization has a corresponding node in database
- Verify metrics exist with matching `nodeId`
- Run node seed script: `npm run seed:nodes`

**Verify organization mapping**:

```javascript
// In MongoDB shell
use asm2-central

// Find user's organization ID from WorkOS dashboard
// Then check if node exists
db.nodes.findOne({ workosOrganizationId: "org_01ABCDEFG" })

// Check if metrics exist for that node
db.ragmetrics.countDocuments({ nodeId: "node-id-from-above" })
```

### Migration Issues

#### Migration Script Fails

**Problem**: Migration script exits with errors

**Solutions**:

- Verify MongoDB connection is working
- Check that you have write permissions on the database
- Run verification first: `npm run migrate:verify`
- Check MongoDB logs for detailed error messages
- Ensure sufficient disk space for index creation

**Common errors**:

```bash
# Index already exists with different options
# Solution: Drop the conflicting index manually
db.ragmetrics.dropIndex("nodeId_1")
npm run migrate:multi-tenant

# Duplicate key error
# Solution: Check for duplicate nodeId or workosOrganizationId values
db.nodes.find({ nodeId: "duplicate-id" })
```

#### Metrics Without NodeId

**Problem**: Some metrics don't have a `nodeId` assigned

**Solutions**:

- The migration script automatically assigns them to "default" node
- Or manually assign nodeId before migration:

```javascript
// In MongoDB shell
db.ragmetrics.updateMany(
  { nodeId: { $exists: false } },
  { $set: { nodeId: "your-node-id" } }
)
```

#### Need to Rollback Migration

**Problem**: Migration created incorrect data

**Solutions**:

```bash
# Dry run to see what would be removed
npm run scripts/setup-multi-tenant.ts --rollback --dry-run

# Perform actual rollback (removes nodes and indexes)
npm run migrate:rollback
```

**Note**: Rollback does not remove `nodeId` fields from metrics. You'll need to manually clean those if needed.

#### Placeholder Node Names

**Problem**: Nodes have generic names like "Company node-1"

**Solutions**:

- Update node names after migration:

```javascript
// In MongoDB shell or via application code
db.nodes.updateOne(
  { nodeId: "node-1" },
  { 
    $set: { 
      name: "Acme Corporation",
      workosOrganizationId: "org_01HXYZ123ABC"
    }
  }
)
```

- Or update via the application's admin interface (if available)

### Development Server Issues

#### Port Already in Use

**Problem**: Cannot start dev server - port 3001 in use

**Solutions**:

```bash
# Find process using port 3001
# Windows
netstat -ano | findstr :3001

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or use a different port
PORT=3002 npm run dev
```

#### Hot Reload Not Working

**Problem**: Changes not reflecting in browser

**Solutions**:

- Hard refresh browser: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear Next.js cache: `rm -rf .next`
- Restart development server
- Check for TypeScript errors in terminal

### Production Deployment Issues

#### Environment Variables Not Loading

**Problem**: App works locally but fails in production

**Solutions**:

- Verify all environment variables are set in production environment
- Check that `NEXT_PUBLIC_*` variables are set at build time
- Don't use `.env` file in production - use platform's environment variable system
- Verify `NODE_ENV=production` is set

#### WorkOS Redirect URI Mismatch

**Problem**: Authentication fails in production

**Solutions**:

- Add production redirect URI to WorkOS dashboard
- Update `NEXT_PUBLIC_WORKOS_REDIRECT_URI` to production URL
- Ensure HTTPS is used in production
- Verify domain matches exactly (including subdomain)

### Getting Help

If you're still experiencing issues:

1. **Check the logs**:
   - Browser console (F12 → Console)
   - Server logs (terminal running `npm run dev`)
   - MongoDB logs

2. **Enable debug mode**:

   ```bash
   # Add to .env
   DEBUG=*
   ```

3. **Verify versions**:

   ```bash
   node --version  # Should be 18+
   npm --version
   mongosh --version
   ```

4. **Search existing issues**:
   - Check GitHub issues for similar problems
   - Search WorkOS documentation
   - Check Next.js documentation

5. **Create a minimal reproduction**:
   - Isolate the problem
   - Test with minimal configuration
   - Document steps to reproduce

## Security

This application implements comprehensive security measures to protect user data and prevent common vulnerabilities.

### Security Features

#### 1. **Security Headers**

The application configures security headers in `next.config.js`:

- **Strict-Transport-Security (HSTS)**: Forces HTTPS connections
- **Content-Security-Policy (CSP)**: Prevents XSS attacks and controls resource loading
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-Content-Type-Options**: Prevents MIME-type sniffing
- **X-XSS-Protection**: Enables browser XSS filtering
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Disables unnecessary browser features

#### 2. **Authentication & Session Security**

- **WorkOS AuthKit**: Enterprise-grade authentication
- **Secure Cookies**: HttpOnly, Secure, SameSite=Lax attributes
- **Session Encryption**: 32+ character cookie password
- **Automatic Session Refresh**: Seamless re-authentication
- **Secure Logout**: Complete session termination

#### 3. **CSRF Protection**

- **SameSite Cookies**: Prevents cross-site request forgery
- **Origin Validation**: Next.js validates request origins
- **TRPC Security**: Type-safe API with built-in protection

#### 4. **Authorization & Access Control**

- **Role-Based Access Control (RBAC)**: Admin and User roles
- **Multi-Tenant Isolation**: Database-level data filtering
- **Server-Side Enforcement**: All authorization checks on server
- **Protected Procedures**: TRPC middleware for authentication

#### 5. **Data Protection**

- **Input Validation**: Zod schemas for all inputs
- **SQL/NoSQL Injection Prevention**: Mongoose ODM with parameterized queries
- **XSS Prevention**: React's built-in escaping + CSP headers
- **Data Encryption**: HTTPS in transit, MongoDB encryption at rest

#### 6. **Rate Limiting (Prepared)**

Rate limiting infrastructure is configured but not yet enforced. See `src/lib/rate-limit-config.ts` for configuration.

### Security Best Practices

For detailed security information, see [docs/SECURITY_BEST_PRACTICES.md](docs/SECURITY_BEST_PRACTICES.md), which includes:

- Complete security header documentation
- Authentication and session management best practices
- CSRF protection details
- Authorization and access control guidelines
- Data protection strategies
- Rate limiting implementation guide
- Security checklist for development and production
- Incident response procedures

### Security Checklist

Before deploying to production:

- [ ] Rotate all API keys and secrets
- [ ] Enable HTTPS/TLS with valid certificates
- [ ] Verify security headers are active
- [ ] Test authentication and authorization flows
- [ ] Verify multi-tenant data isolation
- [ ] Enable database encryption at rest
- [ ] Configure automated backups
- [ ] Set up monitoring and alerting
- [ ] Review and test rate limiting
- [ ] Perform security audit

### Reporting Security Vulnerabilities

If you discover a security vulnerability, please report it to your security team. Do not create public GitHub issues for security vulnerabilities.

## Learn More

- [WorkOS AuthKit Documentation](https://workos.com/docs/authkit)
- [Next.js Documentation](https://nextjs.org/docs)
- [tRPC Documentation](https://trpc.io/docs)
- [MongoDB Documentation](https://www.mongodb.com/docs/)
