# Nebula Agent

Windows VM management agent for Nebula Command. This service runs on your Windows VM and receives deployment commands from the dashboard.

## Installation on Windows VM

### Prerequisites
- Node.js 18+ installed
- Git installed
- PM2 for process management (`npm install -g pm2`)

### Quick Setup

1. Clone the repository on your Windows VM:
```powershell
cd C:\
git clone https://github.com/YOUR_REPO/HomeLabHub.git
cd HomeLabHub\services\nebula-agent
```

2. Install dependencies:
```powershell
npm install
```

3. Set up environment variables (create `.env` file or set system env vars):
```powershell
$env:NEBULA_AGENT_TOKEN = "your-secure-token-here"
$env:AGENT_PORT = "9765"
```

4. Build and start:
```powershell
npm run build
npm run pm2:start
```

5. (Optional) Configure PM2 to start on boot:
```powershell
pm2 startup
pm2 save
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Agent info and available endpoints |
| `/api/health` | GET | System health, GPU status, memory |
| `/api/execute` | POST | Execute arbitrary PowerShell command |
| `/api/models` | GET | List Ollama, SD, and ComfyUI models |
| `/api/services` | GET | Check status of AI services |
| `/api/services/:name/restart` | POST | Restart a specific service |
| `/api/git/pull` | POST | Pull latest code from Git |

## Authentication

All endpoints require Bearer token authentication when `NEBULA_AGENT_TOKEN` is set:

```
Authorization: Bearer your-token-here
```

## Firewall Configuration

Make sure port 9765 is accessible via Tailscale. If using Windows Firewall:

```powershell
New-NetFirewallRule -DisplayName "Nebula Agent" -Direction Inbound -LocalPort 9765 -Protocol TCP -Action Allow
```

## Service Management

```powershell
# Start agent
npm run pm2:start

# Stop agent  
npm run pm2:stop

# Restart agent
npm run pm2:restart

# View logs
pm2 logs nebula-agent
```
