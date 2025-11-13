# Security Guide

## Authentication & Authorization

This dashboard now includes mandatory authentication to protect your homelab infrastructure.

### API Key Setup

1. **Generate a secure API key**:
   ```bash
   python -c 'import secrets; print(secrets.token_urlsafe(32))'
   ```

2. **Add to your `.env` file**:
   ```env
   DASHBOARD_API_KEY=your-generated-key-here
   ```

3. **The dashboard will not function without this key** - all sensitive endpoints require authentication.

### How Authentication Works

- **Web Interface**: Users must log in with the API key via `/login`
  - Session lasts 12 hours
  - Logout available via `/logout`
  
- **API Endpoints**: All sensitive endpoints require the API key in the `X-API-Key` header:
  ```bash
  curl -H "X-API-Key: your-key" http://localhost:5000/api/containers
  ```

### Protected Endpoints

All the following require authentication:

- System monitoring (`/api/system/*`)
- Container management (`/api/containers/*`)
- Log access (`/api/containers/*/logs`)
- AI features (`/api/ai/*`)
- Script execution (`/api/scripts/execute`)
- All web pages except `/login`

## Input Validation & Sanitization

### Container Name Validation
- Only alphanumeric characters, dashes, underscores, and dots
- Maximum 64 characters
- Pattern: `^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$`

### Command Execution Protection
Dangerous patterns are blocked:
- `rm -rf /` - Recursive deletion from root
- `mkfs` - Filesystem formatting
- `dd if=` - Direct disk operations
- `:(){:|:&};:` - Fork bombs
- `chmod -R 777 /` - Dangerous permission changes

### Log Line Limits
- Maximum 1000 lines per request to prevent resource exhaustion

## Network Security Recommendations

### 1. Use Twingate VPN (You Already Have This!)
Your existing Twingate setup is the **best** way to secure access:
- Access dashboard only through Twingate
- No need to expose port 5000 to internet
- Twingate provides zero-trust network access

### 2. Firewall Configuration

If not using Twingate, use UFW:
```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp  # SSH only
sudo ufw enable

# Do NOT expose port 5000 to public internet
```

### 3. Reverse Proxy with SSL

If you must expose the dashboard, use Nginx with Let's Encrypt:

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
    }
}
```

## Docker Socket Security

The dashboard requires access to Docker socket (`/var/run/docker.sock`), which provides **root-equivalent** access.

### Best Practices:

1. **Run as specific user**:
   ```bash
   sudo usermod -aG docker evin
   # Never run the dashboard as root
   ```

2. **Socket permissions**:
   ```bash
   ls -l /var/run/docker.sock
   # Should show: srw-rw---- 1 root docker
   ```

3. **Consider Docker socket proxy** (advanced):
   - Use [tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy)
   - Provides filtered access to Docker API
   - Limits available operations

## SSH Key Security

For remote script execution:

1. **Use SSH keys, never passwords**:
   ```bash
   chmod 600 ~/.ssh/id_rsa
   chmod 644 ~/.ssh/id_rsa.pub
   ```

2. **Restrict SSH key to specific host**:
   ```bash
   # In ~/.ssh/config
   Host localhost
       IdentityFile ~/.ssh/homelab_dashboard_key
       User evin
   ```

3. **Consider dedicated key**:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/homelab_dashboard_key
   ```

## Session Management

- Sessions expire after 12 hours of inactivity
- SECRET_KEY is randomly generated if not provided
- **Set SESSION_SECRET in .env for production**:
  ```bash
  python -c 'import secrets; print(secrets.token_hex(32))'
  ```

## Audit Logging

All sensitive operations are logged:
- Container start/stop/restart
- Log access
- Command execution attempts
- Blocked dangerous commands

View logs:
```bash
sudo journalctl -u homelab-dashboard -f
```

## Security Checklist

Before deploying to production:

- [ ] Generate and set `DASHBOARD_API_KEY` in `.env`
- [ ] Generate and set `SESSION_SECRET` in `.env`
- [ ] Enable Twingate VPN access or configure firewall
- [ ] Use HTTPS with valid SSL certificate
- [ ] Restrict Docker socket permissions
- [ ] Use SSH key authentication (no passwords)
- [ ] Review and test authentication
- [ ] Set up log monitoring
- [ ] Test logout functionality
- [ ] Backup your `.env` file securely

## Known Limitations & Recommended Approach

### Critical: Remote Command Execution Security

**IMPORTANT**: The remote script execution feature (`/api/scripts/execute`) has inherent security limitations due to SSH shell execution:

1. **Shell Execution Risk**: Commands are executed through SSH which uses a shell (`/bin/sh -c`), making it theoretically possible to bypass filters with sophisticated shell metacharacter injection
2. **Current Protections**:
   - Shell operators blocked: `&&`, `||`, `;`, `|`, `>`, `<`
   - Dangerous patterns blocked
   - Strict command allowlist
   - Container name validation
   - Authenticated access only

**RECOMMENDED PRODUCTION APPROACH**:

Instead of using the remote script execution feature for production, we recommend:

1. **Use the Dashboard for Monitoring Only**:
   - View container status and stats
   - Check logs
   - Use AI troubleshooting for analysis
   - **Disable script execution in production**

2. **For Container Management**:
   - Use Docker API directly (already implemented for start/stop/restart)
   - These operations are safe because they use Docker SDK, not shell execution

3. **For System Commands**:
   - SSH directly to your server when needed
   - Use your existing secure SSH setup
   - The dashboard shows you what to monitor, then you execute manually via SSH

4. **To Disable Script Execution** (Production):
   ```python
   # In config/config.py, add:
   ENABLE_SCRIPT_EXECUTION = os.environ.get('ENABLE_SCRIPT_EXECUTION', 'false').lower() == 'true'
   
   # Then wrap the endpoint:
   @api_bp.route('/scripts/execute', methods=['POST'])
   @require_auth
   def execute_script():
       if not Config.ENABLE_SCRIPT_EXECUTION:
           return jsonify({'success': False, 'message': 'Script execution disabled in production'}), 403
       # ... rest of code
   ```

### Other Limitations

1. **No CSRF protection** - Use only through VPN/trusted networks
2. **Single user system** - All users share same API key
3. **No rate limiting** (application level) - Implement via reverse proxy
4. **No 2FA** - Relies solely on API key

## Reporting Security Issues

If you discover a security vulnerability:
1. Do not open a public issue
2. Email the administrator
3. Provide detailed reproduction steps

## Recommended: Additional Hardening

For maximum security:

1. **Add fail2ban** to block brute force attempts
2. **Enable AppArmor/SELinux** for process isolation
3. **Use read-only filesystems** where possible
4. **Regular updates**: Keep all packages updated
5. **Monitoring**: Set up alerts for suspicious activity

## Emergency Response

If you suspect unauthorized access:

1. **Immediate actions**:
   ```bash
   # Stop the dashboard
   sudo systemctl stop homelab-dashboard
   
   # Check for suspicious containers
   docker ps -a
   
   # Review recent logs
   sudo journalctl -u homelab-dashboard --since "1 hour ago"
   ```

2. **Change API key**:
   - Generate new key
   - Update `.env`
   - Restart dashboard
   - Clear all sessions

3. **Audit**:
   - Check SSH login history: `last`
   - Review Docker events: `docker events --since 24h`
   - Check system logs: `sudo journalctl --since today`

Remember: This dashboard provides **full control** over your Docker infrastructure. Treat the API key like a root password.
