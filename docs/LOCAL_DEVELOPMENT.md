# Local Development Setup

This document explains how to run Nebula Command locally on your own network, independent of Replit.

## Why Run Locally?

The dashboard on Replit **cannot** SSH to your local servers because:
1. Replit runs in the cloud, not on your network
2. Your servers are behind firewalls/NAT
3. SSH keys in Replit are placeholders, not your real keys

For full functionality (server monitoring, Docker control, deployments), run the dashboard locally.

## Quick Start

### 1. Clone on Your Local Machine

```bash
git clone https://github.com/YOUR_REPO/HomeLabHub.git /opt/homelab/HomeLabHub
cd /opt/homelab/HomeLabHub
```

### 2. Set Up SSH Key

Create your SSH key pair (if you haven't already):
```bash
ssh-keygen -t ed25519 -f ~/.ssh/homelab -N ""
```

Copy your public key to each server:
```bash
ssh-copy-id -i ~/.ssh/homelab.pub root@linode.evindrake.net
ssh-copy-id -i ~/.ssh/homelab.pub evin@host.evindrake.net
```

### 3. Create .env File

```bash
cd services/dashboard-next
cp .env.example .env
```

Edit `.env` with your settings:
```bash
# SSH Configuration
SSH_KEY_PATH=/home/YOUR_USER/.ssh/homelab

# Database (use your actual connection string)
DATABASE_URL=postgresql://user:pass@localhost:5432/homelab_jarvis

# Server Hosts
LINODE_SSH_HOST=linode.evindrake.net
LINODE_SSH_USER=root
HOME_SSH_HOST=host.evindrake.net
HOME_SSH_USER=evin

# Local AI (Windows VM with GPU)
OLLAMA_URL=http://100.118.44.102:11434
WINDOWS_VM_TAILSCALE_IP=100.118.44.102
```

### 4. Install Dependencies & Run

```bash
npm install
npm run dev
```

The dashboard will be available at http://localhost:5000

## Running as a Service

For production-like local operation, use PM2:

```bash
# Install PM2
npm install -g pm2

# Start dashboard
cd /opt/homelab/HomeLabHub/services/dashboard-next
pm2 start npm --name "dashboard" -- run dev
pm2 save
pm2 startup
```

## Testing SSH Connectivity

Before running the dashboard, verify SSH works:

```bash
# Test Linode
ssh -i ~/.ssh/homelab root@linode.evindrake.net "echo 'Linode OK'"

# Test Home Server
ssh -i ~/.ssh/homelab evin@host.evindrake.net "echo 'Home OK'"

# Test Windows VM (via Tailscale)
ssh -i ~/.ssh/homelab admin@100.118.44.102 "echo 'Windows VM OK'"
```

## Tailscale Setup (Required for Cloud-Local Communication)

For Linode to communicate with your homelab:

1. Install Tailscale on all machines:
   - Linode server
   - Ubuntu homelab server
   - Windows VM

2. Join the same Tailnet using your auth key

3. Use Tailscale IPs for internal communication:
   - Linode: 100.x.x.x
   - Ubuntu: 100.x.x.x
   - Windows VM: 100.118.44.102

## Workflow

The recommended development workflow:

1. **Edit on Replit** - Use Replit as your IDE for code editing
2. **Push to GitHub** - Commit and push changes
3. **Pull Locally** - On your local machine: `git pull`
4. **Run Locally** - Test with `npm run dev`
5. **Deploy** - Use `./deploy/local/deploy.sh` or `./deploy/linode/deploy.sh`

This gives you the best of both worlds:
- Cloud IDE (Replit) for collaborative editing
- Local execution for full server access
