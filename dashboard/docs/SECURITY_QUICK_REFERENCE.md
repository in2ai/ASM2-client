# Security Quick Reference

Quick reference guide for security features implemented in ACM2 Central.

## Security Headers (next.config.js)

| Header | Value | Purpose |
|--------|-------|---------|
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | Force HTTPS for 2 years |
| X-Frame-Options | SAMEORIGIN | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-XSS-Protection | 1; mode=block | Enable XSS filtering |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer info |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Disable unnecessary features |
| Content-Security-Policy | See next.config.js | Prevent XSS and control resources |

## Cookie Security (WorkOS AuthKit)

| Attribute | Value | Purpose |
|-----------|-------|---------|
| HttpOnly | true | Prevent JavaScript access |
| Secure | true (production) | HTTPS only |
| SameSite | Lax | CSRF protection |
| Path | / | Available across app |
| Encrypted | Yes | Using WORKOS_COOKIE_PASSWORD |

## CSRF Protection

✅ **SameSite=Lax cookies** - Automatic via WorkOS AuthKit
✅ **Origin validation** - Automatic via Next.js middleware  
✅ **Type-safe API** - TRPC with session validation
✅ **Form action restriction** - CSP header `form-action 'self'`

**No explicit CSRF tokens needed** - SameSite cookies provide equivalent protection.

## Authentication Flow

```
User Request → Middleware → WorkOS Session Check → TRPC Context → Protected Procedure → Database
```

## Authorization Levels

| Role | Access | Procedures |
|------|--------|-----------|
| Unauthenticated | Public routes only | `publicProcedure` |
| End User | Own organization data | `protectedProcedure` |
| Administrator | All organizations | `adminProcedure` |

## Rate Limiting (Prepared)

Configuration ready in `src/lib/rate-limit-config.ts`:

| Endpoint Type | Window | Max Requests |
|--------------|--------|--------------|
| API | 15 min | 100 |
| Auth | 15 min | 5 |
| Export | 1 hour | 10 |
| Aggregation | 5 min | 20 |
| Admin | 15 min | 200 |

**Status**: Infrastructure ready, not yet enforced. See config file for implementation examples.

## Environment Variables

### Required for Security

```bash
WORKOS_COOKIE_PASSWORD=<64-char-hex>  # 32+ chars, rotate every 90 days
WORKOS_API_KEY=sk_live_...            # Keep secret
NODE_ENV=production                    # Enable production security
```

### Generate Secure Password

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Security Checklist

### Development
- [ ] Never commit `.env` files
- [ ] Use test credentials only
- [ ] Run `npm audit` regularly

### Pre-Production
- [ ] Rotate all API keys
- [ ] Enable HTTPS/TLS
- [ ] Test security headers
- [ ] Verify CSRF protection
- [ ] Test authorization boundaries

### Production
- [ ] Use secrets management
- [ ] Enable database encryption
- [ ] Configure monitoring
- [ ] Set up audit logging
- [ ] Enable rate limiting

## Testing Security

### 1. Verify Security Headers

```bash
curl -I https://yourdomain.com
```

### 2. Check Cookie Attributes

Browser DevTools → Application → Cookies → Verify HttpOnly, Secure, SameSite

### 3. Test CSRF Protection

Try cross-origin form submission (should fail)

### 4. Test Authorization

Try accessing admin endpoints as regular user (should return 403)

### 5. Test Multi-Tenant Isolation

Try accessing other organization's data via URL manipulation (should return 403)

## Common Security Issues

| Issue | Solution |
|-------|----------|
| Session expired | Automatic refresh by WorkOS |
| CORS errors | Check origin in middleware config |
| Cookie not set | Verify HTTPS in production |
| Authorization failed | Check user role in WorkOS |
| CSP violations | Update CSP in next.config.js |

## Documentation

- **Complete Guide**: [docs/SECURITY_BEST_PRACTICES.md](SECURITY_BEST_PRACTICES.md)
- **CSRF Details**: [docs/CSRF_PROTECTION_VERIFICATION.md](CSRF_PROTECTION_VERIFICATION.md)
- **Environment Setup**: [docs/ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md)

## Emergency Contacts

```bash
# Update with your team's information
Security Team: security@yourdomain.com
On-Call: +1-XXX-XXX-XXXX
Incidents: incidents@yourdomain.com
```

## Quick Commands

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Generate secure password
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Test security headers
curl -I https://yourdomain.com

# Check TypeScript
npm run typecheck

# Run linter
npm run lint
```

---

**Last Updated**: November 13, 2025
**Version**: 1.0.0
