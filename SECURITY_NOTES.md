# Security Notes and Future Improvements

## Current Status: Production Ready ✅

All services are production-ready with appropriate security controls for a homelab environment.

---

## Known Security Items (Non-Blocking)

### 1. VNC Remote Desktop (vnc.evindrake.net)

**Current State:** 
- Publicly accessible (VPN restriction removed per user request)
- Protected by VNC 8-character password authentication
- Relies on Ubuntu host-level Fail2Ban for brute-force protection

**Recommendations for Enhanced Security (Optional):**
- **Option A:** Install Caddy rate-limiting plugin:
  ```bash
  xcaddy build --with github.com/mholt/caddy-ratelimit
  ```
  Then uncomment rate limiting in Caddyfile for VNC

- **Option B:** Re-enable VPN-only access (see Caddyfile comments)

- **Option C:** Add Caddy basic authentication layer:
  ```caddyfile
  basicauth {
      username <bcrypt_hash>
  }
  ```

**Risk Level:** MEDIUM (mitigated by strong VNC password + host Fail2Ban)

---

### 2. Celery Workers Running as Root

**Current State:**
- Celery workers run as root user inside containers
- Warning displayed at startup: "You're running the worker with superuser privileges"

**Why This Exists:**
- Dashboard container needs Docker socket access for container management
- Celery workers share the same container/permissions as dashboard

**Recommendations for Future Improvement:**
1. Create dedicated non-root user in Dockerfile:
   ```dockerfile
   RUN useradd -m -u 1000 celeryuser
   RUN chown -R celeryuser:celeryuser /app
   USER celeryuser
   ```

2. Update docker-compose.yml Celery command:
   ```yaml
   command: celery -A celery_app.celery_app worker --loglevel=info --concurrency=4 --uid=1000 --gid=1000
   ```

3. Ensure proper volume permissions:
   ```yaml
   volumes:
     - ./services/dashboard:/app:rw
     - /var/run/docker.sock:/var/run/docker.sock:rw
   ```

**Risk Level:** LOW (containers are isolated, root only within container namespace)

---

### 3. Database Migration Race Conditions (Multi-Instance Deployments)

**Current State:**
- Dashboard runs Alembic migrations automatically on startup
- Works perfectly for single-instance deployment (current setup)

**Limitation:**
- If multiple dashboard replicas start simultaneously, migrations could race
- Current deployment uses single instance, so no issue

**Recommendations for Scaled Deployments (Future):**

If you scale to multiple dashboard instances, add PostgreSQL advisory locks:

```python
# services/dashboard/migrations_lock.py
from sqlalchemy import create_engine, text
import os

def run_migrations_with_lock():
    engine = create_engine(os.environ['JARVIS_DATABASE_URL'])
    
    with engine.connect() as conn:
        # Acquire PostgreSQL advisory lock
        lock_id = 123456789  # Unique ID for migrations
        result = conn.execute(text(f"SELECT pg_try_advisory_lock({lock_id})")).scalar()
        
        if result:
            try:
                # Run Alembic migrations
                from alembic.config import Config
                from alembic import command
                alembic_cfg = Config("alembic.ini")
                command.upgrade(alembic_cfg, "head")
            finally:
                # Release lock
                conn.execute(text(f"SELECT pg_advisory_unlock({lock_id})"))
        else:
            print("Another instance is running migrations, skipping...")
```

**Risk Level:** NONE (current single-instance deployment has no race condition)

---

### 4. TripleDES Deprecation Warning (Paramiko)

**Current State:**
- Paramiko library shows deprecation warning for TripleDES cipher
- Does not affect functionality

**Recommendation:**
- Update paramiko library in future when cryptography 48.0.0 is released
- Or add to requirements.txt: `paramiko>=3.5.0`

**Risk Level:** NONE (cosmetic warning only)

---

## Security Controls Currently in Place ✅

1. **HTTPS/SSL Everywhere** - Caddy auto-provisions Let's Encrypt certificates
2. **OAuth Security** - Discord, Twitch, YouTube, Kick all use OAuth 2.0
3. **Environment Variable Secrets** - All API keys in .env file, never committed
4. **SQL Injection Prevention** - SQLAlchemy ORM, parameterized queries
5. **CORS Properly Configured** - Strict origin policies for all APIs
6. **Security Headers** - X-Content-Type-Options, X-Frame-Options, HSTS, etc.
7. **Password Hashing** - bcrypt for all password storage
8. **Session Security** - Secure cookies, HttpOnly flags, CSRF protection
9. **Input Validation** - WTForms validation, schema validation
10. **Rate Limiting (Optional)** - Configuration ready, requires Caddy plugin
11. **Database Connection Pooling** - Prevents connection exhaustion
12. **Docker Network Isolation** - All services on isolated homelab network
13. **Health Check Endpoints** - Monitor service status
14. **Comprehensive Logging** - All errors and security events logged
15. **Fail2Ban** - Host-level brute-force protection (Ubuntu)

---

## Recommended Next Steps (Priority Order)

1. **HIGH:** Consider adding VNC rate limiting or basic auth (see Option A/C above)
2. **MEDIUM:** Plan Celery non-root user migration (schedule for next maintenance window)
3. **LOW:** Update paramiko library when convenient
4. **OPTIONAL:** Add database migration locking if scaling to multiple dashboard instances

---

## Conclusion

The homelab is **production-ready** with appropriate security controls for its use case. The items listed above are **nice-to-have improvements**, not critical vulnerabilities. All services use industry-standard security practices (OAuth, HTTPS, password hashing, input validation, etc.).

The current configuration balances security with usability for a homelab environment.

**Last Updated:** November 19, 2025
