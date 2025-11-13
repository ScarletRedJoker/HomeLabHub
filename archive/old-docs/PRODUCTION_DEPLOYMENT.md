# Production Deployment Guide

## Recommended Production Configuration

For maximum security in production, follow this hardened deployment approach:

### 1. Disable Remote Script Execution

The remote script execution feature is useful for development but should be disabled in production due to inherent shell execution risks.

Add to your `.env`:
```env
ENABLE_SCRIPT_EXECUTION=false
```

### 2. Use Dashboard Features Appropriately

**Safe for Production (Recommended)**:
✅ Real-time container monitoring (uses Docker SDK)
✅ Container control - start/stop/restart (uses Docker SDK)
✅ Log viewing (read-only via Docker SDK)
✅ AI log analysis (read-only)
✅ System resource monitoring (psutil - read-only)
✅ Service status dashboard

**Not Recommended for Production**:
⚠️ Remote script execution (uses SSH shell - disable in production)
⚠️ File manager (limited implementation)

### 3. Production Deployment Checklist

**Security**:
- [ ] Set strong `DASHBOARD_API_KEY` (32+ characters)
- [ ] Set unique `SESSION_SECRET`
- [ ] Set `ENABLE_SCRIPT_EXECUTION=false`
- [ ] Access only through Twingate VPN
- [ ] Use HTTPS with valid SSL certificate
- [ ] Configure firewall (UFW) to block public access to port 5000

**Docker & SSH**:
- [ ] User in docker group (not root)
- [ ] SSH key-based auth only (no passwords)
- [ ] Docker socket permissions correct (`srw-rw---- root:docker`)

**Monitoring**:
- [ ] Set up log monitoring (`journalctl -u homelab-dashboard -f`)
- [ ] Configure systemd service for auto-restart
- [ ] Test container start/stop/restart functionality
- [ ] Verify AI features work with your API credentials

### 4. Systemd Service (Production)

```ini
[Unit]
Description=Homelab Dashboard
After=network.target docker.service

[Service]
Type=simple
User=evin
WorkingDirectory=/home/evin/homelab-dashboard
EnvironmentFile=/home/evin/homelab-dashboard/.env
ExecStart=/usr/bin/python3 /home/evin/homelab-dashboard/main.py
Restart=always
RestartSec=10

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/evin/homelab-dashboard

[Install]
WantedBy=multi-user.target
```

### 5. Nginx with SSL (Production)

```nginx
server {
    listen 443 ssl http2;
    server_name dashboard.evindrake.net;
    
    ssl_certificate /etc/letsencrypt/live/dashboard.evindrake.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.evindrake.net/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=dashboard:10m rate=10r/s;
    limit_req zone=dashboard burst=20 nodelay;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name dashboard.evindrake.net;
    return 301 https://$server_name$request_uri;
}
```

### 6. What You CAN Do Safely in Production

**Container Management** (via Docker SDK):
- View all container status in real-time
- Start/stop/restart containers with one click
- Monitor CPU and memory usage per container
- View container logs (last 1000 lines)
- Clean up Docker system (prune)

**System Monitoring** (via psutil):
- CPU usage graphs
- Memory usage tracking
- Disk space monitoring
- Network traffic stats
- Top processes

**AI Features** (via OpenAI):
- Analyze container logs for errors
- Get troubleshooting suggestions
- Chat with AI assistant about homelab issues

### 7. What You Should Do Via Direct SSH

For security-sensitive operations, SSH directly to your server:

```bash
# SSH to your server through Twingate
ssh evin@your-server-ip

# Then run commands directly
docker logs containername
docker exec -it containername bash
cat /var/log/nginx/error.log
systemctl status nginx
```

The dashboard will show you WHAT to investigate, then you execute the actual commands via your secure SSH connection.

### 8. Monitoring Your Production Deployment

```bash
# Check dashboard status
sudo systemctl status homelab-dashboard

# View logs
sudo journalctl -u homelab-dashboard -f

# Check for errors
sudo journalctl -u homelab-dashboard --since "1 hour ago" | grep ERROR

# Monitor resource usage
htop

# Check authentication attempts
sudo journalctl -u homelab-dashboard | grep "Blocked\|unauthorized\|Invalid API"
```

### 9. Backup Your Configuration

```bash
# Backup your .env file securely
cp .env .env.backup
chmod 600 .env.backup

# Backup the entire application
tar -czf homelab-dashboard-backup-$(date +%Y%m%d).tar.gz homelab-dashboard/
```

### 10. Emergency Response

If you suspect unauthorized access:

```bash
# Stop the dashboard immediately
sudo systemctl stop homelab-dashboard

# Change API key
nano .env  # Update DASHBOARD_API_KEY

# Clear all sessions
rm -rf /tmp/flask_session*  # If using filesystem sessions

# Restart
sudo systemctl start homelab-dashboard

# Check for suspicious activity
sudo journalctl -u homelab-dashboard --since today
docker events --since 24h
```

## Summary

**Use the dashboard for**:
- Monitoring and visualization
- Quick container start/stop/restart
- Log viewing and AI analysis
- System resource tracking

**Use direct SSH for**:
- Running arbitrary commands
- File management
- System configuration
- Sensitive operations

This approach gives you the convenience of a web dashboard while maintaining strong security through your existing Twingate VPN and SSH setup.
