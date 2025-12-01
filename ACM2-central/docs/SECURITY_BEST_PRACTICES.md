# Security Best Practices

This document outlines the security measures implemented in the ACM2 Central multi-tenant analytics dashboard and provides best practices for maintaining a secure application.

## Table of Contents

1. [Security Headers](#security-headers)
2. [Authentication & Session Security](#authentication--session-security)
3. [CSRF Protection](#csrf-protection)
4. [Authorization & Access Control](#authorization--access-control)
5. [Data Protection](#data-protection)
6. [Rate Limiting](#rate-limiting)
7. [Security Checklist](#security-checklist)
8. [Incident Response](#incident-response)

---

## Security Headers

### Implemented Headers

The application implements comprehensive security headers in `next.config.js`:

#### 1. **Strict-Transport-Security (HSTS)**
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```
- Forces HTTPS connections for 2 years
- Applies to all subdomains
- Eligible for browser preload lists

**Best Practice**: Ensure your domain is served over HTTPS before enabling HSTS.

#### 2. **Content-Security-Policy (CSP)**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; ...
```
- Restricts resource loading to trusted sources
- Prevents XSS attacks by controlling script execution
- Allows WorkOS API connections

**Current Configuration**:
- `default-src 'self'`: Only load resources from same origin
- `script-src 'self' 'unsafe-eval' 'unsafe-inline'`: Required for Next.js and React
- `connect-src 'self' https://api.workos.com`: API connections
- `frame-ancestors 'self'`: Prevent clickjacking

**⚠️ Note**: `'unsafe-eval'` and `'unsafe-inline'` are required for Next.js development and React. Consider using nonces or hashes in production for stricter CSP.

#### 3. **X-Frame-Options**
```
X-Frame-Options: SAMEORIGIN
```
- Prevents clickjacking attacks
- Only allows framing from same origin

#### 4. **X-Content-Type-Options**
```
X-Content-Type-Options: nosniff
```
- Prevents MIME-type sniffing
- Forces browsers to respect declared content types

#### 5. **X-XSS-Protection**
```
X-XSS-Protection: 1; mode=block
```
- Enables browser XSS filtering
- Blocks page rendering if XSS detected

#### 6. **Referrer-Policy**
```
Referrer-Policy: strict-origin-when-cross-origin
```
- Controls referrer information sent with requests
- Sends full URL for same-origin, only origin for cross-origin

#### 7. **Permissions-Policy**
```
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
```
- Disables unnecessary browser features
- Prevents FLoC tracking

### Testing Security Headers

Use these tools to verify headers:

```bash
# Using curl
curl -I https://yourdomain.com

# Using securityheaders.com
# Visit: https://securityheaders.com/?q=yourdomain.com

# Using Mozilla Observatory
# Visit: https://observatory.mozilla.org/
```

---

## Authentication & Session Security

### WorkOS AuthKit Integration

The application uses WorkOS AuthKit for authentication with secure session management.

#### Session Cookie Configuration

WorkOS AuthKit automatically configures secure cookies with the following attributes:

- **HttpOnly**: ✅ Prevents JavaScript access to cookies
- **Secure**: ✅ Only transmitted over HTTPS (production)
- **SameSite**: ✅ Set to `Lax` by default, preventing CSRF attacks
- **Path**: `/` - Available across entire application
- **Max-Age**: Configurable session duration

#### Cookie Encryption

Session cookies are encrypted using the `WORKOS_COOKIE_PASSWORD` environment variable:

```bash
# Generate a secure password (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Requirements**:
- Minimum 32 characters
- Use cryptographically secure random generation
- Rotate periodically (every 90 days recommended)
- Store securely (use secrets management in production)

### Session Management Best Practices

1. **Session Expiration**
   - Sessions expire after inactivity period
   - Automatic refresh before expiration
   - Force re-authentication for sensitive operations

2. **Session Validation**
   - Every request validates session token
   - Middleware checks authentication before route access
   - Invalid sessions redirect to login

3. **Logout Security**
   - Complete session termination on logout
   - Clear all session cookies
   - Invalidate tokens server-side

### Environment Variables Security

```bash
# Required for authentication
WORKOS_API_KEY=sk_live_...          # Keep secret, never commit
WORKOS_CLIENT_ID=client_...         # Can be public
WORKOS_COOKIE_PASSWORD=...          # 32+ chars, keep secret
NEXT_PUBLIC_WORKOS_REDIRECT_URI=... # Must match WorkOS dashboard
```

**Best Practices**:
- Never commit `.env` files to version control
- Use different credentials for dev/staging/production
- Rotate API keys every 90 days
- Use secrets management (AWS Secrets Manager, HashiCorp Vault, etc.)

---

## CSRF Protection

### Built-in Protection

Next.js and WorkOS AuthKit provide built-in CSRF protection:

1. **SameSite Cookies**
   - WorkOS session cookies use `SameSite=Lax`
   - Prevents cross-site request forgery
   - Automatically applied by AuthKit

2. **Origin Validation**
   - Next.js validates request origins
   - Rejects requests from untrusted origins
   - Configured via middleware

3. **TRPC Security**
   - TRPC procedures require authentication
   - Session validation on every request
   - Type-safe API prevents injection attacks

### Form Security

All forms in the application are protected:

```typescript
// Forms use TRPC mutations which include:
// 1. Session validation
// 2. Origin checking
// 3. Type validation with Zod
const mutation = api.metrics.create.useMutation();
```

### API Endpoint Protection

```typescript
// Protected procedure example
export const protectedProcedure = t.procedure
  .use(async ({ ctx, next }) => {
    if (!ctx.userContext) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({ ctx: { ...ctx, userContext: ctx.userContext } });
  });
```

---

## Authorization & Access Control

### Role-Based Access Control (RBAC)

The application implements two roles:

1. **Administrator**
   - Can view all nodes/organizations
   - Can switch between nodes
   - Access to admin-only endpoints
   - Full data export capabilities

2. **End User**
   - Can only view own organization's data
   - No node switching
   - Limited to own organization's exports

### Multi-Tenant Data Isolation

#### Database-Level Filtering

```typescript
// Automatic nodeId filtering for end users
const filter: any = {};
if (ctx.userContext.role === 'user') {
  filter.nodeId = ctx.userContext.organizationId;
}
```

#### Authorization Middleware

```typescript
// Admin-only procedure
export const adminProcedure = t.procedure
  .use(async ({ ctx, next }) => {
    if (!ctx.userContext) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    if (ctx.userContext.role !== 'admin') {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next({ ctx });
  });
```

### Security Boundaries

1. **Server-Side Enforcement**
   - All authorization checks happen server-side
   - Never trust client-side filtering
   - Validate every request

2. **URL Parameter Validation**
   - Validate nodeId parameters
   - Reject unauthorized node access
   - Return 403 Forbidden for violations

3. **Data Exposure Prevention**
   - Never expose other organizations in autocomplete
   - Limit error messages to prevent information leakage
   - Use generic error messages for unauthorized access

---

## Data Protection

### Input Validation

All inputs are validated using Zod schemas:

```typescript
const metricsQuerySchema = z.object({
  nodeId: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().min(1).max(1000).default(100),
});
```

### SQL/NoSQL Injection Prevention

1. **Mongoose ODM**
   - Use Mongoose models for all database operations
   - Never construct raw queries from user input
   - Use parameterized queries

2. **Query Sanitization**
   ```typescript
   // ✅ Good - Using Mongoose
   await RAGMetric.find({ nodeId: input.nodeId });
   
   // ❌ Bad - Raw query construction
   await db.collection.find({ $where: userInput });
   ```

### XSS Prevention

1. **React's Built-in Protection**
   - React escapes all rendered content by default
   - Use `dangerouslySetInnerHTML` only when absolutely necessary

2. **Content Security Policy**
   - CSP headers prevent inline script execution
   - Restricts script sources to trusted origins

### Data Encryption

1. **In Transit**
   - HTTPS enforced via HSTS
   - TLS 1.2+ required
   - Secure WebSocket connections

2. **At Rest**
   - MongoDB encryption at rest (enable in production)
   - Encrypted backups
   - Secure credential storage

---

## Rate Limiting

### Current Status

Rate limiting is prepared for future implementation. The infrastructure is ready but not yet enforced.

### Recommended Implementation

#### 1. **API Rate Limiting**

```typescript
// Future implementation example
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
```

#### 2. **Per-User Rate Limiting**

```typescript
// Limit expensive operations per user
const exportLimiter = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 exports per hour per user
};
```

#### 3. **Authentication Rate Limiting**

```typescript
// Prevent brute force attacks
const authLimiter = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 failed attempts
  skipSuccessfulRequests: true,
};
```

### Rate Limiting Best Practices

1. **Different Limits for Different Endpoints**
   - Stricter limits for expensive operations (exports, aggregations)
   - Looser limits for read operations
   - Very strict limits for authentication

2. **User Feedback**
   - Return `429 Too Many Requests` status
   - Include `Retry-After` header
   - Provide clear error messages

3. **Monitoring**
   - Log rate limit violations
   - Alert on suspicious patterns
   - Track per-user request rates

### Recommended Tools

- **Upstash Redis**: Serverless rate limiting
- **express-rate-limit**: Express middleware
- **rate-limiter-flexible**: Advanced rate limiting
- **Cloudflare**: CDN-level rate limiting

---

## Security Checklist

### Development

- [ ] Never commit `.env` files
- [ ] Use environment-specific credentials
- [ ] Enable TypeScript strict mode
- [ ] Run `npm audit` regularly
- [ ] Keep dependencies updated
- [ ] Use ESLint security rules
- [ ] Review code for security issues

### Pre-Production

- [ ] Rotate all API keys and secrets
- [ ] Enable HTTPS/TLS
- [ ] Configure HSTS headers
- [ ] Test CSP headers
- [ ] Verify CORS configuration
- [ ] Test authentication flows
- [ ] Verify authorization boundaries
- [ ] Test multi-tenant isolation
- [ ] Run security scanning tools
- [ ] Perform penetration testing

### Production

- [ ] Use production-grade secrets management
- [ ] Enable database encryption at rest
- [ ] Configure automated backups
- [ ] Set up monitoring and alerting
- [ ] Enable audit logging
- [ ] Configure rate limiting
- [ ] Set up DDoS protection
- [ ] Implement WAF rules
- [ ] Regular security audits
- [ ] Incident response plan

### Ongoing Maintenance

- [ ] Monitor security advisories
- [ ] Update dependencies monthly
- [ ] Rotate credentials quarterly
- [ ] Review audit logs weekly
- [ ] Security training for team
- [ ] Regular penetration testing
- [ ] Update security documentation

---

## Incident Response

### Security Incident Types

1. **Authentication Breach**
   - Unauthorized access to user accounts
   - Compromised credentials

2. **Data Breach**
   - Unauthorized access to sensitive data
   - Data exfiltration

3. **Service Disruption**
   - DDoS attacks
   - Resource exhaustion

### Response Procedure

#### 1. **Detection**
- Monitor logs for suspicious activity
- Set up alerts for security events
- Regular security audits

#### 2. **Containment**
```bash
# Immediate actions
# 1. Rotate compromised credentials
# 2. Revoke affected sessions
# 3. Block malicious IPs
# 4. Enable additional logging
```

#### 3. **Investigation**
- Review audit logs
- Identify scope of breach
- Determine attack vector
- Document findings

#### 4. **Remediation**
- Patch vulnerabilities
- Update security measures
- Restore from clean backups if needed
- Verify system integrity

#### 5. **Communication**
- Notify affected users
- Report to authorities if required
- Update security documentation
- Conduct post-mortem

### Emergency Contacts

```bash
# Add your team's contact information
Security Team: security@yourdomain.com
On-Call Engineer: +1-XXX-XXX-XXXX
Incident Response: incidents@yourdomain.com
```

### Audit Logging

The application logs security-relevant events:

```typescript
// Audit log events
- Authentication (success/failure)
- Authorization failures
- Node switching (admin)
- Data exports
- Configuration changes
```

Review audit logs regularly:
```bash
# Query recent security events
db.auditlogs.find({ 
  action: { $in: ['auth', 'node_switch', 'export'] },
  timestamp: { $gte: new Date(Date.now() - 24*60*60*1000) }
}).sort({ timestamp: -1 });
```

---

## Additional Resources

### Security Tools

- **OWASP ZAP**: Web application security scanner
- **npm audit**: Dependency vulnerability scanner
- **Snyk**: Continuous security monitoring
- **SonarQube**: Code quality and security analysis

### Security Standards

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **CWE Top 25**: https://cwe.mitre.org/top25/
- **NIST Cybersecurity Framework**: https://www.nist.gov/cyberframework

### Compliance

Depending on your industry, consider:
- **GDPR**: EU data protection
- **HIPAA**: Healthcare data security
- **SOC 2**: Service organization controls
- **PCI DSS**: Payment card industry standards

---

## Questions or Concerns?

If you discover a security vulnerability, please report it to:
- **Email**: security@yourdomain.com
- **Do not** create public GitHub issues for security vulnerabilities

---

**Last Updated**: November 13, 2025
**Version**: 1.0.0
**Maintained By**: Security Team
