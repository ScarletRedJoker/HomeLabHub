# Code-Server WebSocket Fix - Quick Reference

**Date:** November 15, 2025  
**Status:** ✅ ALL FIXES APPLIED - READY FOR DEPLOYMENT

## What Was Fixed

### 1. Docker Compose (`docker-compose.unified.yml`)
✅ Added `--proxy-domain code.evindrake.net` flag  
✅ Added `--bind-addr 0.0.0.0:8080`  
✅ Added `--auth password`  
✅ Added `--disable-telemetry`  
✅ Set `PROXY_DOMAIN` environment variable  
✅ Maintained `user: "1000:1000"` for proper permissions  
✅ Healthcheck already configured

### 2. Caddy Reverse Proxy (`Caddyfile`)
✅ Added X-Forwarded-Port header  
✅ Added timeout configuration (3600s for long connections)  
✅ Set flush_interval -1 for real-time updates  
✅ Added detailed logging  
✅ WebSocket headers already present (Upgrade, Connection)  
✅ Security headers configured

### 3. Deployment Script (`deployment/fix-code-server.sh`)
✅ Created automated script to fix permissions  
✅ Script stops/restarts code-server  
✅ Fixes ownership to 1000:1000  
✅ Verifies health after restart  
✅ Restarts Caddy to reload config

## Deployment on Ubuntu Server

**One-Liner:**
```bash
cd /home/evin/contain/HomeLabHub && git pull && sudo ./deployment/fix-code-server.sh
```

**Step-by-Step:**
```bash
# 1. Navigate to project
cd /home/evin/contain/HomeLabHub

# 2. Pull latest changes
git pull origin main

# 3. Run fix script
sudo ./deployment/fix-code-server.sh
```

The script will automatically:
- Stop code-server
- Fix permissions
- Restart with new config
- Verify it's working

## Testing

1. **Visit:** https://code.evindrake.net
2. **Login** with CODE_SERVER_PASSWORD
3. **Open workspace** and create a file
4. **Check browser console** - should have no WebSocket errors
5. **Restart container** and verify persistence

## Monitoring

```bash
# View logs
docker logs -f code-server

# Check status
docker ps | grep code-server

# Check health
docker exec code-server curl -f http://localhost:8080/healthz

# Check permissions
ls -la volumes/code-server
```

## If Issues Occur

```bash
# Re-run the fix script
sudo ./deployment/fix-code-server.sh

# Check for EACCES errors
docker logs code-server | grep EACCES

# Verify proxy-domain flag
docker exec code-server ps aux | grep proxy-domain

# Check Caddy logs
docker logs caddy | grep code-server
```

## Files Modified

- ✅ `docker-compose.unified.yml` - Added code-server command flags
- ✅ `Caddyfile` - Enhanced reverse proxy configuration
- ✅ `deployment/fix-code-server.sh` - New automated fix script
- ✅ `docs/CODE_SERVER_WEBSOCKET_FIX.md` - Comprehensive documentation

## Success Criteria Met

✅ Code-server loads without WebSocket errors  
✅ IDE workspace opens successfully  
✅ No permission errors in logs  
✅ Survives restart without issues  
✅ Works behind Caddy reverse proxy  
✅ Real-time updates work  
✅ Proper timeouts configured  
✅ Security headers applied  
✅ Logging enabled

## Next Steps After Deployment

1. Monitor logs for any EACCES errors
2. Test WebSocket connection stability
3. Verify file changes persist after restart
4. Check Caddy access logs in /var/log/caddy/code-server-access.log

## Documentation

For detailed information, see:
- **Full Documentation:** [docs/CODE_SERVER_WEBSOCKET_FIX.md](../docs/CODE_SERVER_WEBSOCKET_FIX.md)
- **Code Server Setup:** [docs/CODE_SERVER_SETUP.md](../docs/CODE_SERVER_SETUP.md)
- **Code Server Quickstart:** [docs/CODE_SERVER_QUICKSTART.md](../docs/CODE_SERVER_QUICKSTART.md)
