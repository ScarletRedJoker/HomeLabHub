# Quick Deployment Guide

This guide will help you deploy the Homelab Dashboard to your Ubuntu server in minutes.

## Prerequisites

Before running the deployment script, ensure you have:

- ✅ Ubuntu server (tested on 20.04+)
- ✅ Python 3.8+ installed
- ✅ Docker installed and running
- ✅ Your user added to the `docker` group
- ✅ SSH access to your server

## One-Command Deployment

### Option 1: Deploy from GitHub (Recommended)

```bash
# Clone the repository
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub

# Run the deployment script
./deploy.sh
```

### Option 2: Deploy with Custom Settings

```bash
# Custom installation directory
./deploy.sh --install-dir /opt/homelab-dashboard

# Different user
./deploy.sh --user myuser

# Enable script execution (not recommended for production)
./deploy.sh --enable-scripts

# Combine options
./deploy.sh --install-dir /opt/dashboard --user admin
```

### Option 3: Manual Transfer and Deploy

If you're developing in Replit and want to deploy to your server:

```bash
# On your local machine or Replit shell:
# 1. Download the project as ZIP or clone it
# 2. Transfer to your server
scp -r HomeLabHub/ evin@your-server-ip:/home/evin/

# On your Ubuntu server:
cd /home/evin/HomeLabHub
./deploy.sh
```

## What the Script Does

The deployment script automatically:

1. ✅ Checks system requirements (Python, Docker, permissions)
2. ✅ Installs Python dependencies from requirements.txt
3. ✅ Creates `.env` file with random API keys
4. ✅ Sets up systemd service for auto-start
5. ✅ Configures security settings
6. ✅ Starts the dashboard service
7. ✅ Provides next steps and useful commands

## Post-Deployment

### 1. Save Your API Key

The script generates a random API key. You'll see it in the output:

```
Your API Key: abc123def456...
```

**IMPORTANT:** Save this key! You need it to log in.

You can also find it later in:
```bash
cat /home/evin/homelab-dashboard/.env | grep DASHBOARD_API_KEY
```

### 2. Access the Dashboard

Open your browser and navigate to:
- **Local access:** http://localhost:5000
- **Network access:** http://your-server-ip:5000
- **Via Twingate:** Use your Twingate network

### 3. First Login

1. Click the login button
2. Enter your API key
3. Start managing your homelab!

## Managing the Service

```bash
# Check status
sudo systemctl status homelab-dashboard

# View live logs
sudo journalctl -u homelab-dashboard -f

# Restart service
sudo systemctl restart homelab-dashboard

# Stop service
sudo systemctl stop homelab-dashboard

# Start service
sudo systemctl start homelab-dashboard

# Disable auto-start
sudo systemctl disable homelab-dashboard

# Enable auto-start
sudo systemctl enable homelab-dashboard
```

## Configuration

Edit your configuration:
```bash
nano /home/evin/homelab-dashboard/.env
```

After changing `.env`, restart the service:
```bash
sudo systemctl restart homelab-dashboard
```

### Important Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `DASHBOARD_API_KEY` | Your login key | Auto-generated |
| `ENABLE_SCRIPT_EXECUTION` | Allow remote commands | `false` (recommended) |
| `OPENAI_API_KEY` | For AI features | Required for production |
| `FLASK_PORT` | Dashboard port | `5000` |

## Setting Up OpenAI (For AI Features)

The dashboard uses OpenAI for log analysis and troubleshooting. On your own server, you need your own API key:

1. Create account at https://platform.openai.com
2. Generate API key at https://platform.openai.com/api-keys
3. Add to `.env`:
   ```bash
   OPENAI_API_KEY=sk-proj-...your-key-here
   ```
4. Restart service:
   ```bash
   sudo systemctl restart homelab-dashboard
   ```

## Production Hardening (Recommended)

### 1. Set Up Nginx with SSL

```bash
# Install Nginx
sudo apt install nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/dashboard
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name dashboard.evindrake.net;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and get SSL:
```bash
sudo ln -s /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d dashboard.evindrake.net
```

### 2. Configure Firewall

```bash
# Allow Nginx
sudo ufw allow 'Nginx Full'

# Block direct access to port 5000 from outside
sudo ufw allow from 127.0.0.1 to any port 5000

# If using Twingate, allow from Twingate network
sudo ufw allow from 100.64.0.0/10 to any port 5000

# Enable firewall
sudo ufw enable
```

### 3. Set Up Monitoring

```bash
# Create log monitoring script
sudo nano /usr/local/bin/check-dashboard.sh
```

Add:
```bash
#!/bin/bash
if ! systemctl is-active --quiet homelab-dashboard; then
    echo "Dashboard is down, restarting..."
    systemctl restart homelab-dashboard
fi
```

Make executable and add to cron:
```bash
sudo chmod +x /usr/local/bin/check-dashboard.sh
sudo crontab -e
# Add: */5 * * * * /usr/local/bin/check-dashboard.sh
```

## Troubleshooting

### Service won't start

```bash
# Check detailed logs
sudo journalctl -u homelab-dashboard -n 100 --no-pager

# Check Python errors
python3 /home/evin/homelab-dashboard/main.py

# Check permissions
ls -la /var/run/docker.sock
groups evin  # Should include 'docker'
```

### Can't access from network

```bash
# Check if service is listening
sudo netstat -tlnp | grep 5000

# Check firewall
sudo ufw status

# Test locally first
curl http://localhost:5000
```

### Docker permissions error

```bash
# Add user to docker group
sudo usermod -aG docker evin

# Log out and back in, then verify
groups  # Should show 'docker'
```

### AI features not working

```bash
# Check if OPENAI_API_KEY is set
grep OPENAI_API_KEY /home/evin/homelab-dashboard/.env

# Verify API key is valid
# Test at: https://platform.openai.com/playground

# Check logs for OpenAI errors
sudo journalctl -u homelab-dashboard | grep -i openai
```

## Updating the Dashboard

```bash
# Stop service
sudo systemctl stop homelab-dashboard

# Backup current version
cp -r /home/evin/homelab-dashboard /home/evin/homelab-dashboard.backup

# Pull latest changes (if using git)
cd /home/evin/homelab-dashboard
git pull

# Or copy new files from Replit
# scp -r new-version/* evin@server:/home/evin/homelab-dashboard/

# Install any new dependencies
pip3 install -r requirements.txt

# Restart service
sudo systemctl start homelab-dashboard
```

## Uninstalling

```bash
# Stop and disable service
sudo systemctl stop homelab-dashboard
sudo systemctl disable homelab-dashboard

# Remove service file
sudo rm /etc/systemd/system/homelab-dashboard.service
sudo systemctl daemon-reload

# Remove installation directory
rm -rf /home/evin/homelab-dashboard

# Remove firewall rules (if configured)
sudo ufw delete allow 5000
```

## Getting Help

- **Check logs:** `sudo journalctl -u homelab-dashboard -f`
- **Review documentation:** See PRODUCTION_DEPLOYMENT.md and SECURITY.md
- **Test locally:** Run `python3 main.py` to see direct output

## Next Steps

1. ✅ Deploy using `./deploy.sh`
2. ✅ Save your API key
3. ✅ Access the dashboard
4. ✅ Configure OpenAI API key
5. ✅ Set up Nginx with SSL (optional but recommended)
6. ✅ Configure Twingate access
7. ✅ Review security settings in SECURITY.md

Happy homelabbing! 🚀
