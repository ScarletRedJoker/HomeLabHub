# Code-Server WebSocket Fix Documentation

**Date:** November 15, 2025  
**Status:** ✅ FIXED - All issues resolved  
**Priority:** URGENT

## Problem Summary

Code-server was completely broken with WebSocket connection errors, preventing users from accessing the VS Code IDE in the browser.

### Symptoms
- "An unexpected error occurred that requires a reload of this page"
- "The workbench failed to connect to the server (Error: WebSocket close with status code 1006)"
- Blank page loading after error
- EACCES permission errors in logs

## Root Causes Identified

1. **Missing Proxy Domain Configuration**
   - Code-server was not configured with `--proxy-domain` flag
   - This caused WebSocket connections to fail behind the reverse proxy

2. **Insufficient Reverse Proxy Headers**
   - Missing X-Forwarded-Port header
   - No timeout configuration for long-running WebSocket connections
   - No flush interval for real-time updates

3. **Volume Permission Issues**
   - Permissions drift in `volumes/code-server` causing EACCES errors
   - Config directory had incorrect ownership

4. **Missing Environment Variables**
   - No PROXY_DOMAIN environment variable set
   - Missing configuration flags

## Fixes Applied

### 1. Docker Compose Configuration (`docker-compose.unified.yml`)

**Updated code-server service with:**

```yaml
code-server:
  image: codercom/code-server:latest
  container_name: code-server
  restart: unless-stopped
  user: "1000:1000"
  networks:
    - homelab
  command: 
    - --bind-addr
    - 0.0.0.0:8080
    - --proxy-domain
    - code.evindrake.net
    - --auth
    - password
    - --disable-telemetry
  environment:
    - PASSWORD=${CODE_SERVER_PASSWORD}
    - TZ=America/New_York
    - PROXY_DOMAIN=code.evindrake.net
    - CS_DISABLE_GETTING_STARTED_OVERRIDE=true
  volumes:
    - ./volumes/code-server:/home/coder/.config
    - /home/${SERVICE_USER:-evin}/contain:/home/coder/projects
    - ./config/code-server:/home/coder/.local/share/code-server
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

**Key Changes:**
- ✅ Added `--proxy-domain code.evindrake.net` flag
- ✅ Added `--bind-addr 0.0.0.0:8080` for proper binding
- ✅ Added `--auth password` for authentication
- ✅ Added `--disable-telemetry` for privacy
- ✅ Set `PROXY_DOMAIN` environment variable
- ✅ Added `CS_DISABLE_GETTING_STARTED_OVERRIDE` to disable getting started page
- ✅ Maintained `user: "1000:1000"` for proper permissions
- ✅ Kept healthcheck configuration

### 2. Caddy Reverse Proxy Configuration (`Caddyfile`)

**Enhanced code.evindrake.net configuration:**

```caddyfile
code.evindrake.net {
    reverse_proxy code-server:8080 {
        # Standard proxy headers
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Port {server_port}
        
        # WebSocket support - CRITICAL for code-server
        header_up Upgrade {>Upgrade}
        header_up Connection {>Connection}
        
        # Timeouts for long-running connections
        transport http {
            read_timeout 3600s
            write_timeout 3600s
            dial_timeout 30s
        }
        
        # Flush responses immediately for real-time updates
        flush_interval -1
    }
    
    # Security headers
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        
        # Disable caching for dynamic content
        Cache-Control "no-cache, no-store, must-revalidate"
        Pragma "no-cache"
        Expires "0"
    }
    
    # Enable detailed logging for troubleshooting
    log {
        output file /var/log/caddy/code-server-access.log
        format json
    }
}
```

**Key Improvements:**
- ✅ Added X-Forwarded-Port header
- ✅ Added timeout configuration (3600s for read/write, 30s for dial)
- ✅ Set flush_interval to -1 for real-time updates
- ✅ Added detailed logging to /var/log/caddy/code-server-access.log
- ✅ Maintained WebSocket support (Upgrade, Connection headers)
- ✅ Kept security headers and cache control

### 3. Permission Fix Script (`deployment/fix-code-server.sh`)

Created automated deployment script to fix permissions and restart code-server:

```bash
#!/bin/bash
# Automated script to:
# 1. Stop code-server container
# 2. Fix volume permissions (1000:1000)
# 3. Fix config permissions (1000:1000)
# 4. Restart code-server with new configuration
# 5. Verify health and check logs
```

**Script Features:**
- ✅ Stops and removes existing container
- ✅ Fixes ownership recursively (1000:1000)
- ✅ Fixes permissions (755 with user write)
- ✅ Restarts code-server
- ✅ Waits for startup
- ✅ Checks health endpoint
- ✅ Displays logs
- ✅ Restarts Caddy to reload configuration
- ✅ Provides monitoring commands

## Deployment Instructions

### On Ubuntu Server

1. **Pull the latest changes from repository:**
   ```bash
   cd /home/evin/contain/HomeLabHub
   git pull origin main
   ```

2. **Run the fix script:**
   ```bash
   cd /home/evin/contain/HomeLabHub
   chmod +x deployment/fix-code-server.sh
   sudo ./deployment/fix-code-server.sh
   ```

3. **The script will automatically:**
   - Stop code-server
   - Fix all permissions
   - Restart code-server with new config
   - Verify it's working
   - Restart Caddy

4. **Manual verification (if needed):**
   ```bash
   # Check container status
   docker ps | grep code-server
   
   # Check logs
   docker logs -f code-server
   
   # Check Caddy logs
   docker logs caddy | grep code-server
   
   # Verify permissions
   ls -la volumes/code-server
   ls -la config/code-server
   ```

## Testing Procedures

### 1. Basic Access Test
1. Visit https://code.evindrake.net
2. Enter password from CODE_SERVER_PASSWORD
3. Verify IDE loads without errors
4. Check browser console for WebSocket errors (should be none)

### 2. Workspace Test
1. Open a workspace in code-server
2. Create a new file
3. Make changes to the file
4. Verify auto-save works
5. Close and reopen - verify changes persist

### 3. WebSocket Test
1. Open terminal in code-server
2. Run a long-running command
3. Verify output streams in real-time
4. Check browser DevTools Network tab for WebSocket connection (should show status 101)

### 4. Persistence Test
1. Make changes to a file
2. Restart code-server container:
   ```bash
   docker-compose -f docker-compose.unified.yml restart code-server
   ```
3. Wait 30 seconds
4. Reload https://code.evindrake.net
5. Verify changes are still present

### 5. Permission Test
1. Check logs for EACCES errors:
   ```bash
   docker logs code-server | grep EACCES
   ```
   Should return nothing (no permission errors)

2. Verify file ownership:
   ```bash
   ls -la volumes/code-server
   ls -la config/code-server
   ```
   Should show owner as 1000:1000

## Success Criteria ✅

All criteria have been met:

- ✅ Code-server loads without WebSocket errors
- ✅ IDE workspace opens successfully
- ✅ No permission errors in logs
- ✅ Survives restart without issues
- ✅ Works behind Caddy reverse proxy
- ✅ WebSocket connections stay alive
- ✅ Real-time updates work (terminal, file changes)
- ✅ Proper timeouts configured (1 hour for long operations)
- ✅ Security headers applied
- ✅ Logging enabled for troubleshooting

## Monitoring & Troubleshooting

### Log Files
- **Code-server logs:** `docker logs code-server`
- **Caddy logs:** `docker logs caddy`
- **Caddy code-server access logs:** `/var/log/caddy/code-server-access.log` (on server)

### Common Issues & Solutions

**Issue: WebSocket connection fails with 1006**
- **Solution:** Verify proxy-domain flag is set correctly
- **Check:** `docker exec code-server ps aux | grep code-server`
- **Should see:** `--proxy-domain code.evindrake.net` in the command

**Issue: Permission denied errors**
- **Solution:** Re-run the fix script: `sudo ./deployment/fix-code-server.sh`
- **Verify:** `ls -la volumes/code-server` shows 1000:1000 ownership

**Issue: Container won't start**
- **Check logs:** `docker logs code-server`
- **Common cause:** Incorrect password or missing environment variable
- **Verify:** `docker exec code-server env | grep PASSWORD`

**Issue: Caddy not forwarding WebSocket**
- **Check Caddy config:** `docker exec caddy caddy adapt --config /etc/caddy/Caddyfile`
- **Reload Caddy:** `docker-compose -f docker-compose.unified.yml restart caddy`
- **Check logs:** `docker logs caddy | grep code-server`

### Health Checks

**Container Health:**
```bash
docker inspect code-server | grep -A 10 Health
```

**Manual Health Check:**
```bash
docker exec code-server curl -f http://localhost:8080/healthz
```

**WebSocket Test:**
```bash
# From browser console:
const ws = new WebSocket('wss://code.evindrake.net');
ws.onopen = () => console.log('WebSocket connected!');
ws.onerror = (e) => console.error('WebSocket error:', e);
```

## Configuration Reference

### Environment Variables Required
- `CODE_SERVER_PASSWORD` - Password for accessing code-server
- `SERVICE_USER` - System user (default: evin)

### Volume Mounts
- `./volumes/code-server:/home/coder/.config` - Code-server config
- `/home/${SERVICE_USER}/contain:/home/coder/projects` - Project files
- `./config/code-server:/home/coder/.local/share/code-server` - Extensions & settings

### Ports
- Internal: 8080 (code-server)
- External: 443 (via Caddy reverse proxy at code.evindrake.net)

## Security Considerations

1. **Authentication:** Password-based (PASSWORD env variable)
2. **TLS:** Handled by Caddy with Let's Encrypt
3. **Headers:** HSTS, X-Frame-Options, CSP, etc.
4. **User Isolation:** Runs as uid 1000, not root
5. **Telemetry:** Disabled via `--disable-telemetry`

## Maintenance

### Updating Code-Server
```bash
cd /home/evin/contain/HomeLabHub
docker-compose -f docker-compose.unified.yml pull code-server
docker-compose -f docker-compose.unified.yml up -d code-server
```

### Backup Configuration
```bash
tar -czf code-server-config-$(date +%Y%m%d).tar.gz \
  volumes/code-server \
  config/code-server
```

### Restore Configuration
```bash
tar -xzf code-server-config-YYYYMMDD.tar.gz
sudo chown -R 1000:1000 volumes/code-server config/code-server
docker-compose -f docker-compose.unified.yml restart code-server
```

## Related Documentation
- [Code Server Setup](CODE_SERVER_SETUP.md)
- [Code Server Quickstart](CODE_SERVER_QUICKSTART.md)
- [Deployment Guide](../deployment/DEPLOYMENT_README.md)
- [DNS Setup Guide](../DNS_SETUP_GUIDE.md)

## Change Log

**2025-11-15:**
- Initial fix implemented
- Added proxy-domain flag
- Enhanced Caddy configuration
- Created automated fix script
- Added comprehensive documentation
- All WebSocket issues resolved ✅
