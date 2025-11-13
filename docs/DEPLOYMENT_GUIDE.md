# Deployment Guide for Your Ubuntu Homelab

## Quick Start - Automated Deployment (Recommended)

🚀 **NEW:** Use the automated deployment script for one-command setup!

```bash
# On your Ubuntu server
cd ~
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub
./deploy.sh
```

See **[QUICK_DEPLOY.md](QUICK_DEPLOY.md)** for full automated deployment instructions.

---

## Manual Deployment (Advanced)

If you prefer manual setup or need custom configuration, follow the detailed steps below.

## Step 1: Transfer Code to Your Server

### Option A: Using Git (Recommended)
```bash
# On your Ubuntu server
cd ~
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub
```

### Option B: Direct Download
Download the code from Replit and transfer via SCP:
```bash
# From your local machine
scp -r HomeLabHub evin@your-server-ip:/home/evin/
```

## Step 2: Install Dependencies

```bash
cd ~/homelab-dashboard

# Install uv (modern Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install all dependencies
uv sync
```

Or using pip:
```bash
pip3 install flask flask-cors docker psutil paramiko openai tenacity
```

## Step 3: Configure Environment Variables

Create `.env` file in the project root:
```bash
nano .env
```

Add these variables:
```env
# CRITICAL: Dashboard authentication (REQUIRED)
DASHBOARD_API_KEY=<generate-using-command-below>

# Generate API key with:
# python -c 'import secrets; print(secrets.token_urlsafe(32))'

# IMPORTANT: Copy these from Replit environment for AI features
AI_INTEGRATIONS_OPENAI_API_KEY=your-key-here
AI_INTEGRATIONS_OPENAI_BASE_URL=your-url-here

# Generate a random secret for sessions
SESSION_SECRET=<generate-using-command-below>

# Generate session secret with:
# python -c 'import secrets; print(secrets.token_hex(32))'

# Docker configuration (should work by default)
DOCKER_HOST=unix:///var/run/docker.sock

# SSH configuration for remote script execution
SSH_HOST=localhost
SSH_PORT=22
SSH_USER=evin
SSH_KEY_PATH=/home/evin/.ssh/id_rsa

# Optional: If you set up noVNC
NOVNC_URL=http://localhost:6080/vnc.html
```

### Getting AI Integration Credentials from Replit

In Replit, run this command to see your credentials:
```bash
echo "AI_INTEGRATIONS_OPENAI_API_KEY=$AI_INTEGRATIONS_OPENAI_API_KEY"
echo "AI_INTEGRATIONS_OPENAI_BASE_URL=$AI_INTEGRATIONS_OPENAI_BASE_URL"
```

Copy those values to your `.env` file.

## Step 4: Configure Docker Access

```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Apply group changes
newgrp docker

# Verify Docker access
docker ps
```

## Step 5: Update Service Configuration

Edit `config/config.py` to match your actual setup:

```python
SERVICES = {
    'discord_bot': {
        'name': 'Discord Ticket Bot',
        'container': 'discordticketbot',  # Your actual container name
        'path': '/home/evin/contain/DiscordTicketBot',
        'domain': 'bot.rig-city.com',
        'type': 'container'
    },
    # ... update other services as needed
}
```

Get your actual container names:
```bash
docker ps -a --format "{{.Names}}"
```

## Step 6: Run the Dashboard

### For Testing
```bash
python3 main.py
```

Visit: http://localhost:5000

### For Production (systemd service)

Create service file:
```bash
sudo nano /etc/systemd/system/homelab-dashboard.service
```

Add this content:
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

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable homelab-dashboard
sudo systemctl start homelab-dashboard
sudo systemctl status homelab-dashboard
```

View logs:
```bash
sudo journalctl -u homelab-dashboard -f
```

## Step 7: Set Up Reverse Proxy (Optional but Recommended)

### Nginx Configuration

Install Nginx:
```bash
sudo apt install nginx
```

Create config:
```bash
sudo nano /etc/nginx/sites-available/dashboard
```

Add:
```nginx
server {
    listen 80;
    server_name dashboard.evindrake.net;  # Your domain

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Add SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d dashboard.evindrake.net
```

## Step 8: Set Up Remote Desktop (Optional)

### Install noVNC

```bash
sudo apt update
sudo apt install x11vnc novnc
```

### Start VNC Server
```bash
x11vnc -display :0 -forever -shared -bg -nopw
```

### Start noVNC
```bash
/usr/share/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6080 &
```

### Make Permanent

Create systemd service for x11vnc:
```bash
sudo nano /etc/systemd/system/x11vnc.service
```

```ini
[Unit]
Description=X11 VNC Server
After=display-manager.service

[Service]
Type=simple
ExecStart=/usr/bin/x11vnc -display :0 -forever -shared -nopw
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable x11vnc
sudo systemctl start x11vnc
```

## Troubleshooting

### Docker Connection Failed
```bash
# Check Docker is running
sudo systemctl status docker

# Check socket permissions
ls -l /var/run/docker.sock

# Should show: srw-rw---- 1 root docker
```

### SSH Execution Doesn't Work
```bash
# Check SSH service
sudo systemctl status ssh

# Verify key permissions
chmod 600 ~/.ssh/id_rsa
```

### AI Features Not Working
Make sure you copied the AI integration credentials from Replit to your `.env` file.

### Port 5000 Already in Use
```bash
# Find what's using port 5000
sudo lsof -i :5000

# Change port in main.py if needed
```

## Security Recommendations

1. **Firewall Configuration**:
   ```bash
   sudo ufw allow 22/tcp   # SSH
   sudo ufw allow 80/tcp   # HTTP
   sudo ufw allow 443/tcp  # HTTPS
   sudo ufw enable
   ```

2. **Use Twingate**: Access dashboard through your existing Twingate VPN

3. **Add Authentication**: Consider adding basic auth or OAuth

4. **Regular Updates**:
   ```bash
   cd ~/homelab-dashboard
   git pull
   sudo systemctl restart homelab-dashboard
   ```

## Accessing Your Dashboard

1. **Navigate to the dashboard**:
   - **Local**: http://localhost:5000
   - **Via Twingate**: http://your-server-ip:5000
   - **With Domain**: https://dashboard.evindrake.net (after nginx + SSL setup)

2. **Login with your API key**:
   - Enter the `DASHBOARD_API_KEY` you generated
   - Session lasts 12 hours
   - Logout available in the navigation menu

## Security Notes

⚠️ **IMPORTANT**: This dashboard now requires authentication!

- **API Key Required**: Set `DASHBOARD_API_KEY` in `.env` before starting
- **Session-based Auth**: Web interface uses secure sessions
- **Input Validation**: Container names and commands are validated
- **Dangerous Command Blocking**: Harmful patterns are blocked
- **Best Practice**: Access only through Twingate VPN

For detailed security information, see `SECURITY.md`

## What You Can Do

✅ Monitor all your Docker containers in real-time  
✅ Start, stop, and restart containers with one click  
✅ View live logs with search and filtering  
✅ Get AI-powered troubleshooting help  
✅ Execute remote commands via SSH  
✅ Access remote desktop through noVNC  
✅ Monitor CPU, RAM, disk, and network usage  

Enjoy your new homelab dashboard! 🚀
