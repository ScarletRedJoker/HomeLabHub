# HomeLabHub Deployment Guide

> **One document. Zero to production.**

---

## Quick Links

| I need to... | Go to... |
|-------------|----------|
| Deploy from scratch | [Start Here](#phase-1-accounts--prerequisites) |
| Set up DNS/DDNS | [Phase 2: Infrastructure](#phase-2-infrastructure-setup) |
| Set up OAuth apps | [Phase 4: OAuth Configuration](#phase-4-oauth-configuration) |
| Configure email | [Phase 4.6: Email Setup](#46-email--notifications-setup) |
| Set up KVM + Sunshine | [Phase 5: Local Deployment](#phase-5-local-deployment-ubuntu--windows-kvm) |
| Set up automation | [Phase 7: Automation](#phase-7-operational-automation) |
| Fix something | [Troubleshooting](#troubleshooting) |
| Daily management | [Operations](#daily-operations) |
| View all env vars | [Appendix A](#appendix-a-complete-env-reference) |
| DNS scripts | [Appendix C](#appendix-c-dns-automation--scripts) |

---

## Executive Summary

**What you're building:**
- A split-architecture homelab with cloud services (always-on) and local services (GPU-intensive)
- Cloud (Linode $24/mo): Dashboard, Discord Bot, Stream Bot, Database, n8n, Code-Server
- Local (Ubuntu 25.10 host): Plex, Home Assistant, MinIO Storage, Docker services
- Windows 11 KVM VM (GPU passthrough): Sunshine GameStream with RTX 3060

**Time to deploy:** ~2-3 hours from scratch

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               │
┌─────────────────────┐         ┌──────────┴──────────────────────┐
│   LINODE CLOUD      │◄═══════►│   LOCAL UBUNTU 25.10            │
│   Ubuntu 25.10      │ Tailscale│   (Your Main PC)                │
│   $24/month         │   VPN    │                                 │
│   (Public DNS)      │         │   Native Docker Services:       │
│                     │         │   • Plex Media                  │
│ • Dashboard         │         │   • Home Assistant              │
│ • Discord Bot       │         │   • MinIO Storage               │
│ • Stream Bot        │         │                                 │
│ • PostgreSQL        │         │   ┌─────────────────────────┐   │
│ • Redis/n8n/Caddy   │         │   │ Windows 11 KVM VM       │   │
└─────────────────────┘         │   │ (GPU Passthrough: 3060) │   │
     ▲                          │   │ • Sunshine GameStream   │   │
     │                          │   └─────────────────────────┘   │
 dash.evindrake.net             └─────────────────────────────────┘
 n8n.evindrake.net                          ▲
 bot.rig-city.com                 Moonlight + Tailscale
                                  app.plex.tv (native)
                                  (NO public DNS needed)
```

---

## Credential Matrix

Before you start, know what you need. **Get accounts for the green rows first.**

### Required Credentials

| Credential | What It's For | Where to Get It | When Needed |
|------------|---------------|-----------------|-------------|
| **OpenAI API Key** | Jarvis AI, Discord bot AI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Before Phase 3 |
| **Discord Bot Token** | Discord bot authentication | [discord.com/developers](https://discord.com/developers/applications) | Phase 4.1 |
| **Discord Client ID/Secret** | OAuth login | Same as above | Phase 4.1 |
| **Cloudflare Account** | DNS management | [cloudflare.com](https://cloudflare.com) | Phase 2 |
| **Tailscale Auth Key** | VPN between servers | [tailscale.com](https://login.tailscale.com/admin/settings/keys) | Phase 2 |
| **Linode Account** | Cloud server | [linode.com](https://cloud.linode.com) | Phase 3 |

### Optional Credentials (Add Later)

| Credential | What It Enables | Where to Get It |
|------------|-----------------|-----------------|
| Twitch Client ID/Secret | Stream bot Twitch integration | [dev.twitch.tv/console](https://dev.twitch.tv/console/apps) |
| YouTube OAuth | Stream bot YouTube integration | [console.cloud.google.com](https://console.cloud.google.com) |
| Spotify Client ID/Secret | Now playing in streams | [developer.spotify.com](https://developer.spotify.com/dashboard) |
| SendGrid API Key | Email notifications | [sendgrid.com](https://sendgrid.com) |
| Cloudflare API Token | Auto DNS management | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) |
| Plex Token | Plex API access | [plex.tv/claim](https://plex.tv/claim) |

### Auto-Generated (Don't Worry About These)

The bootstrap script generates these automatically:
- Database passwords (POSTGRES_PASSWORD, DISCORD_DB_PASSWORD, etc.)
- Session secrets (SESSION_SECRET, SECRET_KEY)
- Service tokens (SERVICE_AUTH_TOKEN, DASHBOARD_API_KEY)

---

## Phase 1: Accounts & Prerequisites

**Time: 15 minutes**

### 1.1 Create Required Accounts

Do this now if you haven't already:

1. **Cloudflare** (free) - https://cloudflare.com
   - Transfer your domains here or add them
   
2. **Linode** ($24/mo) - https://cloud.linode.com
   - Just create account, we'll create server later
   
3. **Tailscale** (free) - https://tailscale.com
   - Sign up with Google/GitHub
   
4. **OpenAI** (pay-as-you-go) - https://platform.openai.com
   - Add payment method, create API key
   - Save the key somewhere safe!

5. **Discord Developer** (free) - https://discord.com/developers
   - Just need an account for now

### 1.2 Your Domains

You have these domains in Cloudflare:
- `evindrake.net` - Dashboard, n8n, Code-Server (cloud services)
- `rig-city.com` - Discord Bot, Stream Bot (cloud services)
- `scarletredjoker.com` - Static portfolio site

**Note:** Plex and Home Assistant are accessed via Tailscale or their native remote access (plex.tv, Nabu Casa) - NOT through public DNS.

---

## Phase 2: Infrastructure Setup

**Time: 30 minutes**

### 2.1 Create Linode Server

1. Go to [cloud.linode.com](https://cloud.linode.com) → **Create Linode**
2. Select:
   - **Image**: Ubuntu 22.04 LTS
   - **Region**: Closest to you (Newark, Atlanta, etc.)
   - **Plan**: Shared CPU - Linode 4GB ($24/month)
   - **Label**: `homelab-cloud`
   - **Root Password**: Create a strong password
3. Click **Create Linode**
4. **Write down the public IP address** (you'll need it for DNS)

### 2.2 Configure DNS in Cloudflare

Go to Cloudflare → Select domain → **DNS** → Add these records:

**IMPORTANT:** Set Proxy status to **DNS only** (gray cloud) for ALL records!

#### evindrake.net (Cloud Services Only)
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | YOUR_LINODE_IP | DNS only |
| A | `dash` | YOUR_LINODE_IP | DNS only |
| A | `n8n` | YOUR_LINODE_IP | DNS only |
| A | `code` | YOUR_LINODE_IP | DNS only |

#### rig-city.com
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | YOUR_LINODE_IP | DNS only |
| A | `bot` | YOUR_LINODE_IP | DNS only |
| A | `stream` | YOUR_LINODE_IP | DNS only |

#### scarletredjoker.com
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | YOUR_LINODE_IP | DNS only |
| A | `www` | YOUR_LINODE_IP | DNS only |

#### Local Services (NO Public DNS Needed)

These services run on your local Ubuntu host and should NOT have public DNS records pointing to Linode:

| Service | How to Access Remotely |
|---------|------------------------|
| **Plex** | Use [app.plex.tv](https://app.plex.tv) - Plex handles remote access automatically |
| **Home Assistant** | Use [Nabu Casa](https://www.nabucasa.com/) ($6.50/mo) or access via Tailscale IP: `http://100.110.227.25:8123` |
| **MinIO** | Internal only - access via Tailscale: `http://100.110.227.25:9000` |
| **Sunshine** | Runs in Windows KVM VM - access via Moonlight + Tailscale (for game streaming latency) |

**Why not proxy through Linode?**
- Wastes bandwidth (Plex streams would double-hop)
- Adds latency (bad for game streaming)
- Uses your Linode's 4TB monthly transfer
- Tailscale provides encrypted direct access

### 2.3 Set Up Tailscale VPN

**Get an auth key first:**
1. Go to [Tailscale Admin](https://login.tailscale.com/admin/settings/keys)
2. Click **Generate auth key**
3. Settings: Reusable=Yes, Ephemeral=No, Expiry=90 days
4. Copy the key (starts with `tskey-auth-`)

**Install on Linode:**
```bash
ssh root@YOUR_LINODE_IP

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Connect (use your auth key)
sudo tailscale up --authkey=tskey-auth-XXXXX --hostname=homelab-linode

# Get and save your Tailscale IP
tailscale ip -4
# Example output: 100.66.61.51
```

**Install on Local Ubuntu Host:**
```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Connect (use your auth key)
sudo tailscale up --authkey=tskey-auth-XXXXX --hostname=homelab-local

# Get and save your Tailscale IP
tailscale ip -4
# Example output: 100.110.227.25
```

**Test connection:**
```bash
# From Linode, ping your local Ubuntu host
ping 100.110.227.25

# From local Ubuntu, ping Linode
ping 100.66.61.51
```

**Write down both IPs!**
- Linode Tailscale IP: `100.66.61.51`
- Local Tailscale IP: `100.110.227.25`

> **Note:** You can also install Tailscale inside your Windows KVM VM for remote game streaming. See [Phase 5.5](#55-configure-sunshine-in-windows-vm) for details.

### 2.4 Dynamic DNS for Residential IP (If Applicable)

> **Skip this section if:** You only access local services via Tailscale (recommended) or your ISP provides a static IP.

If you have a **residential internet connection** (like Spectrum, Comcast, AT&T), your public IP address changes periodically. If you want to access local services directly via a domain name (not just Tailscale), you need Dynamic DNS.

#### Option 1: Cloudflare DDNS (Recommended)

Use a Docker container to automatically update Cloudflare DNS when your IP changes:

**On your local Ubuntu host:**

1. Create a `ddclient.conf` file:
```ini
# /opt/homelab/ddclient/ddclient.conf
daemon=300
syslog=yes
protocol=cloudflare
use=web, web=https://cloudflare.com/cdn-cgi/trace
zone=evindrake.net
login=your-cloudflare-email@example.com
password=YOUR_CLOUDFLARE_API_TOKEN
local.evindrake.net
```

2. Run the DDNS container:
```bash
sudo mkdir -p /opt/homelab/ddclient

docker run -d \
  --name cloudflare-ddns \
  --restart=always \
  -v /opt/homelab/ddclient/ddclient.conf:/etc/ddclient.conf:ro \
  linuxserver/ddclient
```

**Or use this simpler alternative script (no Docker):**

```bash
#!/bin/bash
# /opt/homelab/scripts/cloudflare-ddns.sh
# Add to crontab: */5 * * * * /opt/homelab/scripts/cloudflare-ddns.sh

API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"
ZONE_ID="YOUR_ZONE_ID"
RECORD_NAME="local.evindrake.net"

# Get current public IP
CURRENT_IP=$(curl -s https://api.ipify.org)

# Get existing record
RECORD=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$RECORD_NAME" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json")

RECORD_ID=$(echo $RECORD | jq -r '.result[0].id')
OLD_IP=$(echo $RECORD | jq -r '.result[0].content')

# Update only if IP changed
if [ "$CURRENT_IP" != "$OLD_IP" ]; then
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"$RECORD_NAME\",\"content\":\"$CURRENT_IP\",\"ttl\":300}"
  echo "$(date): Updated IP from $OLD_IP to $CURRENT_IP" >> /var/log/ddns.log
fi
```

#### Option 2: DuckDNS (Free & Simple)

1. Sign up at [duckdns.org](https://www.duckdns.org/)
2. Create a subdomain (e.g., `yourhomelab.duckdns.org`)
3. Run the update script:

```bash
#!/bin/bash
# /opt/homelab/scripts/duckdns-update.sh
# Add to crontab: */5 * * * * /opt/homelab/scripts/duckdns-update.sh

DOMAIN="yourhomelab"
TOKEN="YOUR_DUCKDNS_TOKEN"

echo url="https://www.duckdns.org/update?domains=$DOMAIN&token=$TOKEN&ip=" | curl -k -o /var/log/duckdns.log -K -
```

#### Option 3: No-IP (Free tier available)

1. Sign up at [noip.com](https://www.noip.com/)
2. Download their Dynamic Update Client (DUC)
3. Install and configure with your credentials

#### When Do You Need DDNS?

| Scenario | Need DDNS? | Recommended Approach |
|----------|------------|---------------------|
| Access local services only via Tailscale | No | Just use Tailscale IPs |
| Want `local.yourdomain.com` to reach home | Yes | Cloudflare DDNS |
| Plex remote access | No | Plex handles this automatically via plex.tv |
| Home Assistant remote | Maybe | Nabu Casa ($6.50/mo) is easier than DDNS |
| Sunshine GameStream | No | Use Tailscale (lower latency, no port forwarding) |

#### Port Forwarding (If Using DDNS Without Tailscale)

If you set up DDNS and want direct access without Tailscale, you'll need to forward these ports on your router:

| Service | Port | Protocol | Notes |
|---------|------|----------|-------|
| Plex | 32400 | TCP | Optional - Plex relay works without this |
| Home Assistant | 8123 | TCP | Only if not using Nabu Casa |
| MinIO | 9000-9001 | TCP | Console + API |
| Sunshine | 47984-48010 | TCP/UDP | Game streaming (not recommended over WAN) |

**Security Warning:** Exposing services to the internet without Tailscale increases attack surface. Use strong passwords, keep software updated, and consider a VPN.

---

## Phase 3: Cloud Deployment (Linode)

**Time: 20 minutes**

### 3.1 Prepare the Server

```bash
ssh root@YOUR_LINODE_IP

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Verify
docker --version
docker compose version
```

### 3.2 Clone and Configure

```bash
# Create directory and clone
mkdir -p /opt/homelab
cd /opt/homelab
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git
cd HomeLabHub

# Create environment file
cp .env.example .env
chmod 600 .env
```

### 3.3 Edit .env File

```bash
nano .env
```

**Set these values (the rest will be auto-generated):**

```bash
# ═══════════════════════════════════════════════════════════════════
# REQUIRED - Set these before deploying
# ═══════════════════════════════════════════════════════════════════

# Dashboard login
WEB_USERNAME=admin
WEB_PASSWORD=your_secure_password_here

# AI (from Phase 1)
OPENAI_API_KEY=sk-proj-your-key-here

# Cross-host routing (your LOCAL Ubuntu host's Tailscale IP)
LOCAL_TAILSCALE_IP=100.110.227.25

# Code Server password
CODE_SERVER_PASSWORD=your_code_password

# ═══════════════════════════════════════════════════════════════════
# DISCORD - Add after Phase 4.1
# ═══════════════════════════════════════════════════════════════════
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

Save with `Ctrl+X`, then `Y`, then `Enter`.

### 3.4 Deploy

```bash
chmod +x deploy/scripts/bootstrap.sh
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets
```

This will:
- Generate all missing passwords automatically
- Create database initialization scripts
- Start all services with Docker Compose

### 3.5 Verify Deployment

```bash
# Check all containers are running
docker compose ps

# You should see all services as "Up":
# caddy, homelab-postgres, homelab-redis, homelab-dashboard,
# discord-bot, stream-bot, n8n, code-server

# Check for errors
docker compose logs --tail=50
```

**Test access (may take 5 min for SSL certificates):**
- Dashboard: https://dash.evindrake.net
- Code Server: https://code.evindrake.net

---

## Phase 4: OAuth Configuration

**Time: 30 minutes**

### 4.1 Discord Bot (REQUIRED)

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → Name: "HomeLabHub"
3. **Bot section:**
   - Click **Add Bot** → **Yes, do it!**
   - Under Token, click **Reset Token** → Copy it
   - Enable these intents:
     - ✅ Presence Intent
     - ✅ Server Members Intent
     - ✅ Message Content Intent
4. **OAuth2 → General:**
   - Copy **Client ID**
   - Copy **Client Secret** (click Reset Secret if needed)
   - Add Redirect URL: `https://bot.rig-city.com/auth/discord/callback`

**Update .env on Linode:**
```bash
nano /opt/homelab/HomeLabHub/.env

# Add:
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
```

**Restart services:**
```bash
cd /opt/homelab/HomeLabHub
docker compose restart discord-bot
```

**Invite bot to your server:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

### 4.2 Twitch (Optional - for Stream Bot)

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps)
2. Click **Register Your Application**
3. Fill in:
   - Name: HomeLabHub Stream Bot
   - OAuth Redirect URL: `https://stream.rig-city.com/api/auth/twitch/callback`
   - Category: Chat Bot
4. Copy **Client ID** and generate **Client Secret**

**Add to .env:**
```bash
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_secret
```

### 4.3 Google Cloud (YouTube, Calendar, Gmail)

**One project, multiple APIs:**

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project: "HomeLabHub"
3. **Enable APIs** (APIs & Services → Library):
   - YouTube Data API v3
   - Google Calendar API
   - Gmail API
4. **OAuth Consent Screen** (APIs & Services → OAuth consent screen):
   - User Type: External
   - App name: HomeLabHub
   - Support email: Your email
   - Add scopes: YouTube, Calendar, Gmail (just click through)
   - Add yourself as test user
5. **Create Credentials** (APIs & Services → Credentials):
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: Web application
   - Name: HomeLabHub
   - Authorized redirect URIs:
     - `https://stream.rig-city.com/api/auth/youtube/callback`
     - `https://dash.evindrake.net/api/google/callback`
6. Copy **Client ID** and **Client Secret**

**Add to .env:**
```bash
YOUTUBE_CLIENT_ID=your_google_client_id
YOUTUBE_CLIENT_SECRET=your_google_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_secret
```

### 4.4 Spotify (Optional - for Now Playing)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Fill in:
   - App name: HomeLabHub Stream Bot
   - Redirect URI: `https://stream.rig-city.com/api/auth/spotify/callback`
   - APIs: Web API
4. Go to Settings → Copy **Client ID** and **Client Secret**

**Add to .env:**
```bash
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_secret
```

### 4.5 Kick.com (Optional - for Kick Streaming)

1. Go to [kick.com/dashboard/settings/developer](https://kick.com/dashboard/settings/developer)
2. Create a new application
3. Copy **Client ID** and **Client Secret**

**Add to .env:**
```bash
KICK_CLIENT_ID=your_kick_client_id
KICK_CLIENT_SECRET=your_kick_secret
```

### 4.6 Email & Notifications Setup

The dashboard can send email notifications for alerts, ticket updates, and system events. Choose one provider:

#### Option A: SendGrid (Recommended - Free tier: 100 emails/day)

1. Sign up at [sendgrid.com](https://sendgrid.com/)
2. Go to **Settings** → **API Keys** → **Create API Key**
3. Select "Full Access" and copy the key

**Add to .env:**
```bash
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxx
EMAIL_FROM=noreply@evindrake.net
EMAIL_FROM_NAME=HomeLabHub
ADMIN_EMAIL=your@email.com
```

**Configure Sender Authentication:**
1. Go to **Settings** → **Sender Authentication**
2. Add and verify your domain (evindrake.net)
3. Add DNS records for SPF/DKIM as shown

#### Option B: Mailgun (First 5,000 emails free)

1. Sign up at [mailgun.com](https://www.mailgun.com/)
2. Add and verify your domain
3. Go to **API Keys** → Copy the Private API Key

**Add to .env:**
```bash
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=key-xxxxx
MAILGUN_DOMAIN=mg.evindrake.net
EMAIL_FROM=noreply@mg.evindrake.net
ADMIN_EMAIL=your@email.com
```

#### Option C: Gmail App Password (Simple, No API needed)

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Enable 2-Factor Authentication if not already
3. Search for "App passwords" → Create one for "Mail"
4. Copy the 16-character password

**Add to .env:**
```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASSWORD=your-16-char-app-password
SMTP_USE_TLS=true
EMAIL_FROM=your.email@gmail.com
ADMIN_EMAIL=your.email@gmail.com
```

#### Option D: Webhook (for n8n, Zapier, Discord)

Send notifications to a webhook instead of email:

**Add to .env:**
```bash
EMAIL_PROVIDER=webhook
EMAIL_WEBHOOK_URL=https://n8n.evindrake.net/webhook/notifications
# Or Discord webhook:
# EMAIL_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
```

#### Notification Types

Configure what triggers notifications:

```bash
# In .env
NOTIFY_ON_ERROR=true           # System errors
NOTIFY_ON_TICKET=true          # New Discord tickets
NOTIFY_ON_DEPLOYMENT=true      # Successful deployments
NOTIFY_ON_BACKUP=true          # Backup completion
NOTIFY_ADMIN_EMAIL=your@email.com
```

#### Test Email Configuration

After deploying, test your email setup:
```bash
# SSH to Linode
curl -X POST https://dash.evindrake.net/api/admin/test-email \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to": "your@email.com", "subject": "Test", "body": "Email works!"}'
```

### 4.7 Apply All Changes

```bash
cd /opt/homelab/HomeLabHub
docker compose down
docker compose up -d
```

---

## Phase 5: Local Deployment (Ubuntu + Windows KVM)

**Time: 45-60 minutes**

Your local Ubuntu 25.10 host runs:
- **Docker services** - Plex, Home Assistant, MinIO (native Linux)
- **Tailscale** - VPN connection to Linode
- **KVM/QEMU** - Virtualization with GPU passthrough
- **Windows 11 VM** - Runs Sunshine GameStream with passed-through RTX 3060

### 5.1 Prerequisites & Hardware Check

#### BIOS/UEFI Settings

Before starting, enable these in your BIOS:
- **Intel**: VT-x, VT-d (Intel Virtualization Technology for Directed I/O)
- **AMD**: AMD-V, AMD-Vi (IOMMU)

> **How to access BIOS:** Restart and press Del, F2, or F12 during boot (varies by motherboard).

#### Verify IOMMU Support

```bash
# Check if IOMMU is enabled
dmesg | grep -i iommu
# Should show: "IOMMU enabled" or similar

# If not enabled, add to GRUB
sudo nano /etc/default/grub

# For Intel, change GRUB_CMDLINE_LINUX_DEFAULT to:
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash intel_iommu=on iommu=pt"

# For AMD, change to:
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash amd_iommu=on iommu=pt"

# Apply changes
sudo update-grub
sudo reboot
```

#### Identify Your GPU

```bash
# List IOMMU groups - find your GPU
#!/bin/bash
for d in /sys/kernel/iommu_groups/*/devices/*; do
  n=${d#*/iommu_groups/*}; n=${n%%/*}
  printf 'IOMMU Group %s ' "$n"
  lspci -nns "${d##*/}"
done | sort -V

# Example output - note your GPU's IDs:
# IOMMU Group 14 0000:01:00.0 VGA compatible controller [0300]: NVIDIA Corporation GA106 [GeForce RTX 3060] [10de:2503] (rev a1)
# IOMMU Group 14 0000:01:00.1 Audio device [0403]: NVIDIA Corporation GA106 High Definition Audio Controller [10de:228e] (rev a1)
```

**Write down:**
- GPU Video ID: `10de:2503` (example)
- GPU Audio ID: `10de:228e` (example)
- IOMMU Group: `14` (example)

### 5.2 Install Virtualization Packages

```bash
# Install KVM, QEMU, and virt-manager
sudo apt update
sudo apt install -y qemu-kvm libvirt-daemon-system libvirt-clients \
  bridge-utils virt-manager ovmf cpu-checker

# Verify KVM support
kvm-ok
# Should say: "KVM acceleration can be used"

# Add yourself to libvirt groups
sudo usermod -aG libvirt,kvm $USER

# Start libvirtd
sudo systemctl enable --now libvirtd

# Log out and back in for group changes
```

### 5.3 Configure VFIO for GPU Passthrough

Create VFIO configuration to isolate GPU from host:

```bash
# Create VFIO config with your GPU IDs
echo "options vfio-pci ids=10de:2503,10de:228e" | sudo tee /etc/modprobe.d/vfio.conf

# Ensure VFIO loads before GPU drivers
sudo nano /etc/modules-load.d/vfio.conf
```

Add these lines:
```
vfio
vfio_iommu_type1
vfio_pci
vfio_virqfd
```

```bash
# Blacklist NVIDIA driver from loading on host (GPU goes to VM)
echo "blacklist nouveau
blacklist nvidia
blacklist nvidia_drm
blacklist nvidia_modeset" | sudo tee /etc/modprobe.d/blacklist-nvidia.conf

# Rebuild initramfs
sudo update-initramfs -u

# Reboot
sudo reboot
```

#### Verify GPU is Bound to VFIO

```bash
# Check if GPU is using vfio-pci driver
lspci -nnk -s 01:00

# Should show:
# Kernel driver in use: vfio-pci
```

### 5.4 Create Windows 11 VM

#### Download Required Files

```bash
# Create VM storage directory
sudo mkdir -p /var/lib/libvirt/images

# Download Windows 11 ISO (or transfer your own)
# Get from: https://www.microsoft.com/software-download/windows11

# Download VirtIO drivers ISO (required for Windows to see virtual disks)
wget -O /var/lib/libvirt/images/virtio-win.iso \
  https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win.iso
```

#### Create VM with virt-manager (GUI)

1. **Open virt-manager:**
   ```bash
   virt-manager
   ```

2. **Create new VM:**
   - File → New Virtual Machine
   - Select "Local install media (ISO image)"
   - Browse to your Windows 11 ISO

3. **Configure resources:**
   - RAM: At least 8 GB (16 GB recommended)
   - CPUs: At least 4 cores
   - Check "Customize configuration before install"

4. **Before clicking Finish, configure:**
   - **Overview:** Change Firmware to "UEFI x86_64: /usr/share/OVMF/OVMF_CODE_4M.fd"
   - **CPUs:** Check "Copy host CPU configuration"
   - **Add Hardware → Storage:** Add VirtIO Win ISO as CDROM
   - **Add Hardware → PCI Host Device:** Add your GPU (both video and audio)
   - **Video → Model:** Change to "None" (GPU passthrough replaces this)

5. **Begin Installation:**
   - During Windows install, load VirtIO drivers when it can't find disks
   - Browse to VirtIO CDROM → `viostor\w11\amd64`

#### Alternative: Create VM via CLI

```bash
# Create disk image (100GB)
sudo qemu-img create -f qcow2 /var/lib/libvirt/images/win11.qcow2 100G

# Create VM (adjust paths and IDs as needed)
virt-install \
  --name win11-gaming \
  --memory 16384 \
  --vcpus 8 \
  --os-variant win11 \
  --cdrom /path/to/Win11.iso \
  --disk /var/lib/libvirt/images/win11.qcow2,bus=virtio \
  --disk /var/lib/libvirt/images/virtio-win.iso,device=cdrom \
  --network bridge=virbr0 \
  --graphics none \
  --boot uefi \
  --host-device 01:00.0 \
  --host-device 01:00.1 \
  --features kvm_hidden=on
```

### 5.5 Configure Sunshine in Windows VM

After Windows 11 installation completes:

#### Install GPU Drivers

1. Download NVIDIA drivers from [nvidia.com/drivers](https://www.nvidia.com/Download/index.aspx)
2. Install and restart VM

#### Install Sunshine

1. Download latest release from [github.com/LizardByte/Sunshine/releases](https://github.com/LizardByte/Sunshine/releases)
   - Get the `.exe` installer

2. Run installer as Administrator
   - Allow firewall prompts
   - Install Virtual Display Driver when prompted

3. Open browser to `https://localhost:47990`
   - Create admin username and password
   - **Save these!**

4. Configure settings:
   - **Network** tab: Note ports (47984-48010)
   - **Audio/Video** tab: Select NVENC encoder
   - **General** tab: Set hostname to `homelab-gaming`

#### Configure Windows Firewall

```powershell
# Run as Administrator in Windows VM
netsh advfirewall firewall add rule name="Sunshine TCP" dir=in action=allow protocol=TCP localport=47984-47990
netsh advfirewall firewall add rule name="Sunshine UDP" dir=in action=allow protocol=UDP localport=47998-48010
```

#### Install Tailscale in Windows VM (For Remote Gaming)

Installing Tailscale inside the Windows VM allows you to stream games from anywhere, not just your local network.

**Step 1: Install Tailscale**
1. In your Windows VM, download from [tailscale.com/download/windows](https://tailscale.com/download/windows)
2. Run installer and complete setup
3. Click the Tailscale icon in system tray → Sign in
4. **Important:** Use the **same Tailscale account** as your Ubuntu host and Linode

**Step 2: Get Windows VM's Tailscale IP**
```powershell
# In Windows PowerShell
tailscale ip -4
# Example output: 100.115.92.47
```

**Write this down!** This is the IP you'll use for remote Moonlight connections.

**Step 3: Verify Tailscale Connectivity**
```powershell
# Test connection to Linode
ping 100.66.61.51

# Test connection to Ubuntu host
ping 100.110.227.25

# Check Tailscale status
tailscale status
# Should show all 3 nodes: linode, ubuntu host, this VM
```

**Step 4: Test Remote Sunshine Access**
1. On your remote client device, ensure Tailscale is running
2. Open Moonlight
3. Add computer using **Windows VM's Tailscale IP** (e.g., `100.115.92.47`)
4. Enter PIN from Sunshine web UI
5. Stream!

**Tailscale IP Summary:**
| Device | Tailscale IP | Purpose |
|--------|--------------|---------|
| Linode | 100.66.61.51 | Cloud services |
| Ubuntu Host | 100.110.227.25 | Plex, Home Assistant, MinIO |
| Windows VM | 100.115.92.47 | Sunshine GameStream |

> **Tip:** If Moonlight can't connect over Tailscale, check Windows Firewall allows Sunshine ports (47984-48010) and that both devices show "connected" in Tailscale status.

### 5.6 Docker Services on Ubuntu Host

Run Plex, Home Assistant, and MinIO directly on your Ubuntu host:

```bash
# Create directories
sudo mkdir -p /opt/homelab/{plex/config,homeassistant/config,minio/data}
sudo chown -R $USER:$USER /opt/homelab
```

Create `/opt/homelab/docker-compose.local.yml`:

```yaml
version: '3.8'

services:
  plex:
    image: lscr.io/linuxserver/plex:latest
    container_name: plex
    network_mode: host  # Better device discovery on Linux
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
      - VERSION=docker
      - PLEX_CLAIM=${PLEX_CLAIM}
    volumes:
      - /opt/homelab/plex/config:/config
      - /mnt/media:/data/media  # Adjust to your media path
    restart: unless-stopped

  homeassistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    container_name: homeassistant
    network_mode: host  # Required for device discovery
    environment:
      - TZ=America/New_York
    volumes:
      - /opt/homelab/homeassistant/config:/config
      - /run/dbus:/run/dbus:ro  # For Bluetooth support
    privileged: true
    restart: unless-stopped

  minio:
    image: quay.io/minio/minio
    container_name: minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_ROOT_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
    volumes:
      - /opt/homelab/minio/data:/data
    command: server /data --console-address ":9001"
    restart: unless-stopped
```

Create `/opt/homelab/.env`:
```env
# Plex - get fresh claim at https://plex.tv/claim (expires in 4 min!)
PLEX_CLAIM=claim-XXXXX

# MinIO
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=your_secure_password_here
```

Start services:
```bash
cd /opt/homelab
docker compose -f docker-compose.local.yml up -d
```

### 5.7 VM Management Commands

```bash
# List VMs
virsh list --all

# Start Windows VM
virsh start win11-gaming

# Graceful shutdown
virsh shutdown win11-gaming

# Force stop (if unresponsive)
virsh destroy win11-gaming

# Auto-start VM on boot
virsh autostart win11-gaming

# Connect to VM console (for BIOS/boot issues)
virt-viewer win11-gaming
```

### 5.8 Pair Moonlight Client

From your client device (phone, laptop, Steam Deck):

1. Download Moonlight: [moonlight-stream.org](https://moonlight-stream.org/)

2. Add computer:
   - **Local network:** Windows VM's local IP (check via `ipconfig` in VM)
   - **Via Tailscale:** Windows VM's Tailscale IP

3. Enter PIN shown in Sunshine web UI

4. Test streaming - click "Desktop"

**Latency Tips:**
- Use 5GHz WiFi or Ethernet
- Set bitrate to 15-50 Mbps
- Enable hardware decoding
- Tailscale adds ~2-5ms (barely noticeable)

### 5.9 Verify Local Setup

| Component | Check | Expected |
|-----------|-------|----------|
| IOMMU | `dmesg \| grep -i iommu` | "IOMMU enabled" |
| GPU Passthrough | `lspci -nnk -s 01:00` | "vfio-pci" driver |
| VM Running | `virsh list` | win11-gaming running |
| Sunshine | `https://VM_IP:47990` | Web UI loads |
| Moonlight | Pair from client | Streaming works |
| Plex | `http://localhost:32400/web` | Plex UI |
| Home Assistant | `http://localhost:8123` | HA onboarding |
| MinIO | `http://localhost:9001` | MinIO console |

### 5.10 Tell Linode About Local Services

Update Linode's `.env` with your local Tailscale IP:

```bash
ssh root@YOUR_LINODE_IP
cd /opt/homelab/HomeLabHub
nano .env

# Add/update:
LOCAL_TAILSCALE_IP=100.110.227.25
PLEX_URL=http://100.110.227.25:32400
HOME_ASSISTANT_URL=http://100.110.227.25:8123
MINIO_ENDPOINT=100.110.227.25:9000

# Restart services
docker compose down && docker compose up -d
```

### 5.11 Troubleshooting GPU Passthrough

| Issue | Solution |
|-------|----------|
| "GPU not in separate IOMMU group" | Need ACS override patch or different PCIe slot |
| VM boots but no display | Check GPU is bound to vfio-pci, verify OVMF firmware |
| Reset bug (VM can't restart without host reboot) | Add `<vendor_reset/>` quirk or use GPU reset script |
| Windows BSOD with code 43 | Add `<hidden state='on'/>` to `<kvm>` section in VM XML |
| Poor performance | Enable CPU pinning, use hugepages, check IOMMU isolation |

**Edit VM XML for Error 43 fix:**
```bash
virsh edit win11-gaming
```
Add inside `<features>`:
```xml
<kvm>
  <hidden state='on'/>
</kvm>
```

---

## Phase 6: Verification Checklist

### Test Cloud Services (Public URLs)

| Service | URL | Expected |
|---------|-----|----------|
| Dashboard | https://dash.evindrake.net | Login page |
| Discord Bot | https://bot.rig-city.com | Bot dashboard |
| Stream Bot | https://stream.rig-city.com | Stream dashboard |
| n8n | https://n8n.evindrake.net | n8n login |
| Code Server | https://code.evindrake.net | VS Code |

### Test Local Services (Tailscale/Native Access)

| Service | How to Access | Expected |
|---------|---------------|----------|
| Plex | [app.plex.tv](https://app.plex.tv) | Your media library |
| Home Assistant | `http://100.110.227.25:8123` via Tailscale | HA dashboard |
| MinIO | `http://100.110.227.25:9000` via Tailscale | MinIO console |

### Test Tailscale Connectivity

From Linode (via SSH):
```bash
# Test connectivity to local services
curl -I http://100.110.227.25:32400   # Plex
curl -I http://100.110.227.25:8123    # Home Assistant
curl -I http://100.110.227.25:9000    # MinIO
```

### Test Discord Bot

In your Discord server, try:
- `/ping`
- `/ticket create`

---

## Daily Operations

### Quick Commands

**On Linode:**
```bash
cd /opt/homelab/HomeLabHub

./homelab status        # Check all services
./homelab logs          # View logs
./homelab restart       # Restart all
./homelab db backup     # Backup database
```

**On Local:**
```bash
cd ~/contain/HomeLabHub
docker compose -f compose.local.yml ps
docker compose -f compose.local.yml logs -f
```

### Update Deployment

```bash
git pull origin main
docker compose down
docker compose up -d --build
```

---

## Phase 7: Operational Automation

Set up automated health checks, backups, and maintenance to keep your homelab running smoothly.

### 7.1 Health Monitoring

#### Using the Built-in Health Check Script

The `./homelab` script includes health monitoring:

```bash
# Run health check
./homelab health

# Output example:
# ✓ PostgreSQL: healthy (connections: 5/100)
# ✓ Redis: healthy (memory: 45MB)
# ✓ Dashboard: healthy (uptime: 5d 3h)
# ✗ Discord Bot: unhealthy (restart required)
# ✓ Tailscale: connected (local: 100.110.227.25)
```

#### Set Up Automated Health Checks (Cron)

On Linode, add to crontab:
```bash
crontab -e

# Add these lines:
# Health check every 5 minutes, alert on failure
*/5 * * * * /opt/homelab/HomeLabHub/homelab health --quiet || /opt/homelab/HomeLabHub/homelab notify "Health check failed"

# Daily summary at 9 AM
0 9 * * * /opt/homelab/HomeLabHub/homelab status --summary | mail -s "Homelab Daily Report" your@email.com
```

#### Docker Health Checks

The docker-compose.yml includes health checks. Monitor them:
```bash
# View health status
docker ps --format "table {{.Names}}\t{{.Status}}"

# Watch for unhealthy containers
watch -n 30 'docker ps --filter "health=unhealthy"'
```

### 7.2 Automated Backups

#### Database Backups

**Daily automated backup (add to crontab):**
```bash
# Backup PostgreSQL daily at 3 AM
0 3 * * * /opt/homelab/HomeLabHub/homelab db backup >> /var/log/homelab-backup.log 2>&1

# Keep 7 days of backups
0 4 * * * find /opt/homelab/backups -name "*.sql.gz" -mtime +7 -delete
```

**Manual backup:**
```bash
./homelab db backup
# Creates: /opt/homelab/backups/homelab_2024-01-15_030000.sql.gz
```

#### Configuration Backups

Backup your `.env` and configs to a secure location:

```bash
# Create config backup script
cat > /opt/homelab/backup-configs.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/homelab/config-backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"
cp /opt/homelab/HomeLabHub/.env "$BACKUP_DIR/"
cp -r /opt/homelab/HomeLabHub/config "$BACKUP_DIR/"
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"
# Keep 30 days
find /opt/homelab/config-backups -name "*.tar.gz" -mtime +30 -delete
echo "Config backup complete: $BACKUP_DIR.tar.gz"
EOF
chmod +x /opt/homelab/backup-configs.sh

# Add to crontab (weekly backup)
0 4 * * 0 /opt/homelab/backup-configs.sh >> /var/log/config-backup.log 2>&1
```

#### Backup to Cloud (Optional)

Send backups to your MinIO storage:

```bash
# Install MinIO client
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# Configure
mc alias set myminio http://100.110.227.25:9000 admin YOUR_MINIO_PASSWORD

# Upload backups
mc cp /opt/homelab/backups/*.sql.gz myminio/homelab-backups/
```

### 7.3 Automatic Updates

#### Container Image Updates with Watchtower

Add Watchtower to your docker-compose.yml for automatic container updates:

```yaml
# Add to your docker-compose.yml
watchtower:
  image: containrrr/watchtower
  container_name: watchtower
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  environment:
    - WATCHTOWER_CLEANUP=true
    - WATCHTOWER_POLL_INTERVAL=86400  # Check daily
    - WATCHTOWER_NOTIFICATIONS=email
    - WATCHTOWER_NOTIFICATION_EMAIL_FROM=${EMAIL_FROM}
    - WATCHTOWER_NOTIFICATION_EMAIL_TO=${ADMIN_EMAIL}
    - WATCHTOWER_NOTIFICATION_EMAIL_SERVER=${SMTP_HOST}
    - WATCHTOWER_NOTIFICATION_EMAIL_SERVER_PORT=${SMTP_PORT}
    - WATCHTOWER_NOTIFICATION_EMAIL_SERVER_USER=${SMTP_USER}
    - WATCHTOWER_NOTIFICATION_EMAIL_SERVER_PASSWORD=${SMTP_PASSWORD}
  restart: unless-stopped
```

**Or manually update:**
```bash
# Pull latest images and restart
docker compose pull
docker compose up -d
```

#### System Updates

```bash
# Add to crontab for security updates (weekly)
0 2 * * 0 apt update && apt upgrade -y -o Dpkg::Options::="--force-confold" >> /var/log/apt-upgrade.log 2>&1
```

### 7.4 Automatic Restarts

#### Restart Unhealthy Containers

Create a watchdog script:

```bash
cat > /opt/homelab/watchdog.sh << 'EOF'
#!/bin/bash
cd /opt/homelab/HomeLabHub

# Get unhealthy containers
UNHEALTHY=$(docker ps --filter "health=unhealthy" --format "{{.Names}}")

if [ -n "$UNHEALTHY" ]; then
    echo "$(date): Restarting unhealthy containers: $UNHEALTHY"
    for container in $UNHEALTHY; do
        docker restart "$container"
    done
    # Notify
    ./homelab notify "Watchdog restarted: $UNHEALTHY"
fi
EOF
chmod +x /opt/homelab/watchdog.sh

# Run every 5 minutes
*/5 * * * * /opt/homelab/watchdog.sh >> /var/log/watchdog.log 2>&1
```

### 7.5 Log Rotation

Prevent logs from filling your disk:

```bash
cat > /etc/logrotate.d/homelab << 'EOF'
/var/log/homelab*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
EOF
```

### 7.6 Windows Local Automation (Task Scheduler)

For your Windows machine running Sunshine:

#### Keep Sunshine Running

1. Open **Task Scheduler** → **Create Task**
2. **General** tab:
   - Name: "Sunshine Watchdog"
   - Run whether user is logged on or not
   - Run with highest privileges
3. **Triggers** tab:
   - At system startup
   - Repeat task every 5 minutes
4. **Actions** tab:
   - Start a program: `C:\Program Files\Sunshine\sunshine.exe`

#### Tailscale Auto-Start

Tailscale auto-starts by default on Windows. Verify:
1. Open **Services** (services.msc)
2. Find "Tailscale" → Ensure Startup type is "Automatic"

### 7.7 n8n Workflow Automation

n8n can automate many homelab tasks. Here are some useful workflows:

#### Workflow Ideas:

1. **Daily Health Report**
   - Trigger: Schedule (9 AM daily)
   - Action: HTTP Request to `./homelab status --json`
   - Action: Format and send email/Discord message

2. **Disk Space Alert**
   - Trigger: Schedule (hourly)
   - Action: SSH node to check disk usage
   - Condition: If usage > 80%
   - Action: Send alert

3. **New Plex Content Notification**
   - Trigger: Webhook from Plex
   - Action: Send Discord notification with new content

4. **Backup Verification**
   - Trigger: After backup cron completes
   - Action: Verify backup file exists and size > 0
   - Action: Send confirmation or alert

**Access n8n:** https://n8n.evindrake.net

---

## Troubleshooting

### SSL Certificate Not Working

```bash
# Check Caddy logs
docker logs caddy

# Common fixes:
# 1. Wait 5 minutes for cert generation
# 2. Verify DNS points to Linode IP (not proxied)
# 3. Restart Caddy
docker compose restart caddy
```

### Container Won't Start

```bash
# Check specific container logs
docker logs container-name

# Common fixes:
# 1. Check .env has required values
# 2. Check port isn't already in use
docker compose down && docker compose up -d
```

### Cross-Host Not Working

```bash
# 1. Verify Tailscale
tailscale status

# 2. Check .env has correct IPs
grep TAILSCALE .env

# 3. Test connectivity
ping 100.110.227.25
```

### Discord Bot Not Responding

```bash
# Check bot logs
docker logs discord-bot

# Common fixes:
# 1. Verify DISCORD_BOT_TOKEN is set
# 2. Check bot intents are enabled in Discord Developer Portal
# 3. Restart
docker compose restart discord-bot
```

### Database Connection Failed

```bash
# Check PostgreSQL
docker logs homelab-postgres

# Verify databases exist
docker exec homelab-postgres psql -U postgres -c "\l"
```

### Reset Everything (Nuclear Option)

```bash
# WARNING: Deletes all data!
docker compose down -v
docker system prune -a
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets
```

---

## Appendix A: Complete .env Reference

All environment variables in one place. The bootstrap script generates most secrets automatically with `--generate-secrets`.

### Core Configuration (Required)

| Variable | Description | Where to Get | Auto-Generated? |
|----------|-------------|--------------|-----------------|
| `WEB_USERNAME` | Dashboard login username | You choose | No |
| `WEB_PASSWORD` | Dashboard login password | You choose | Yes |
| `SERVICE_USER` | Linux username | Your username (e.g., evin) | No |
| `TZ` | Timezone | e.g., America/New_York | No |
| `PUID` | User ID | Run `id -u` | No |
| `PGID` | Group ID | Run `id -g` | No |

### AI Configuration (Required)

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `OPENAI_BASE_URL` | API endpoint | https://api.openai.com/v1 |
| `AI_PROVIDER` | AI provider name | openai |
| `AI_MODEL` | Model to use | gpt-4o |

### Database Passwords (Auto-Generated)

| Variable | Description | Auto-Generated? |
|----------|-------------|-----------------|
| `POSTGRES_PASSWORD` | Main PostgreSQL superuser | Yes |
| `DISCORD_DB_PASSWORD` | Discord bot database | Yes |
| `STREAMBOT_DB_PASSWORD` | Stream bot database | Yes |
| `JARVIS_DB_PASSWORD` | Jarvis AI database | Yes |

### Session Secrets (Auto-Generated)

| Variable | Description | Auto-Generated? |
|----------|-------------|-----------------|
| `SESSION_SECRET` | Flask session encryption | Yes |
| `SECRET_KEY` | Flask secret key | Yes |
| `SERVICE_AUTH_TOKEN` | Inter-service auth | Yes |
| `DASHBOARD_API_KEY` | External API access | Yes |
| `DISCORD_SESSION_SECRET` | Discord bot sessions | Yes |
| `STREAMBOT_SESSION_SECRET` | Stream bot sessions | Yes |

### Discord Bot (Required)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `DISCORD_BOT_TOKEN` | Bot authentication | Discord Developer Portal → Bot → Token |
| `DISCORD_CLIENT_ID` | OAuth client ID | Discord Developer Portal → OAuth2 |
| `DISCORD_CLIENT_SECRET` | OAuth secret | Discord Developer Portal → OAuth2 |
| `DISCORD_APP_ID` | Application ID | Same as Client ID |
| `VITE_DISCORD_CLIENT_ID` | Frontend client ID | Same as Client ID |
| `VITE_CUSTOM_WS_URL` | Custom WebSocket URL | Leave empty for default |

### Stream Bot - Core Configuration (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `STREAMBOT_PORT` | Stream bot port | 5000 |
| `STREAMBOT_NODE_ENV` | Node environment | production |
| `STREAMBOT_OPENAI_API_KEY` | Stream bot AI key | Uses main OPENAI_API_KEY if empty |
| `STREAMBOT_OPENAI_BASE_URL` | Stream bot AI endpoint | https://api.openai.com/v1 |
| `STREAMBOT_FACT_MODEL` | Model for fact generation | gpt-4o |

### Stream Bot - Twitch (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `TWITCH_CLIENT_ID` | Twitch app client ID | [dev.twitch.tv/console](https://dev.twitch.tv/console/apps) |
| `TWITCH_CLIENT_SECRET` | Twitch app secret | Same as above |
| `TWITCH_CHANNEL` | Your channel name | Your Twitch username |
| `TWITCH_REDIRECT_URI` | OAuth callback | `https://stream.rig-city.com/api/auth/twitch/callback` |

### Stream Bot - YouTube (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `YOUTUBE_CLIENT_ID` | Google OAuth client ID | [Google Cloud Console](https://console.cloud.google.com) |
| `YOUTUBE_CLIENT_SECRET` | Google OAuth secret | Same as above |
| `YOUTUBE_REFRESH_TOKEN` | OAuth refresh token | Generated after first OAuth flow |
| `YOUTUBE_REDIRECT_URI` | OAuth callback | `https://stream.rig-city.com/api/auth/youtube/callback` |

### Stream Bot - Spotify (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `SPOTIFY_CLIENT_ID` | Spotify app client ID | [developer.spotify.com](https://developer.spotify.com/dashboard) |
| `SPOTIFY_CLIENT_SECRET` | Spotify app secret | Same as above |
| `SPOTIFY_REFRESH_TOKEN` | OAuth refresh token | Generated after first OAuth flow |
| `SPOTIFY_REDIRECT_URI` | OAuth callback | `https://stream.rig-city.com/api/auth/spotify/callback` |

### Stream Bot - Kick (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `KICK_CLIENT_ID` | Kick app client ID | Kick Developer Portal |
| `KICK_CLIENT_SECRET` | Kick app secret | Same as above |
| `KICK_REDIRECT_URI` | OAuth callback | `https://stream.rig-city.com/api/auth/kick/callback` |

### n8n Automation (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `N8N_HOST` | n8n hostname | n8n.evindrake.net |
| `N8N_WEBHOOK_URL` | Webhook base URL | https://n8n.evindrake.net/ |
| `N8N_BASIC_AUTH_USER` | n8n login user | admin |
| `N8N_BASIC_AUTH_PASSWORD` | n8n login password | You choose |

### Code Server (Optional)

| Variable | Description | Auto-Generated? |
|----------|-------------|-----------------|
| `CODE_SERVER_PASSWORD` | VS Code web login | Yes |

### Cross-Host Configuration

| Variable | Description | Role | Notes |
|----------|-------------|------|-------|
| `LOCAL_TAILSCALE_IP` | Local Ubuntu host's Tailscale IP | Cloud | Run `tailscale ip -4` on Ubuntu host |
| `TAILSCALE_LINODE_HOST` | Linode's Tailscale IP | Local | Get with `tailscale ip -4` on Linode |

### Local Services - Plex (Local Role)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `PLEX_TOKEN` | Plex API token | [Get Plex Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) |
| `PLEX_CLAIM` | Initial setup claim | [plex.tv/claim](https://plex.tv/claim) (expires in 4 min!) |
| `PLEX_URL` | Plex server URL | http://LOCAL_TAILSCALE_IP:32400 |
| `PLEX_MEDIA_PATH` | Media directory | /data/plex/media |

### Local Services - Home Assistant (Local Role)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `HOME_ASSISTANT_URL` | HA server URL | http://LOCAL_TAILSCALE_IP:8123 |
| `HOME_ASSISTANT_TOKEN` | Long-lived access token | HA → Profile → Long-Lived Access Tokens |

### Local Services - MinIO (Local Role)

| Variable | Description | Default |
|----------|-------------|---------|
| `MINIO_ROOT_USER` | MinIO admin user | admin |
| `MINIO_ROOT_PASSWORD` | MinIO admin password | You choose |
| `MINIO_ENDPOINT` | MinIO endpoint | minio:9000 |
| `MINIO_BUCKET_NAME` | Default bucket | homelab-uploads |

### Local Services - Sunshine GameStream (Local Role)

| Variable | Description | Default |
|----------|-------------|---------|
| `SUNSHINE_USER` | Sunshine web UI user | admin |
| `SUNSHINE_PASS` | Sunshine web UI password | You choose |

### Local Services - VNC (Local Role)

| Variable | Description |
|----------|-------------|
| `VNC_PASSWORD` | VNC connection password |
| `VNC_USER` | VNC user (your Linux user) |
| `VNC_USER_PASSWORD` | Your Linux password |

### NAS Storage (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `NAS_IP` | NAS IP address | 192.168.1.100 |
| `NAS_HOSTNAME` | NAS hostname | zyxel-nas326 |
| `NAS_USER` | NAS admin user | admin |
| `NAS_PASSWORD` | NAS admin password | - |
| `NAS_MOUNT_BASE` | Mount point | /mnt/nas |

### Google Services (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_TOKEN_CACHE_TTL` | Token cache duration (seconds) | 300 |
| `CALENDAR_POLL_INTERVAL_MINUTES` | Calendar poll interval | 5 |
| `CALENDAR_LEAD_TIME_MINUTES` | Event reminder lead time | 10 |
| `GMAIL_FROM_NAME` | Gmail sender name | Homelab Dashboard |
| `GMAIL_DEFAULT_RECIPIENT` | Default email recipient | - |
| `DRIVE_BACKUP_FOLDER_NAME` | Google Drive backup folder | Homelab Backups |
| `DRIVE_BACKUP_RETENTION_DAYS` | Backup retention period | 30 |
| `DRIVE_AUTO_BACKUP_ENABLED` | Enable auto backup | false |
| `DRIVE_AUTO_BACKUP_SCHEDULE` | Cron schedule | 0 2 * * * |

### Email Service (Optional - Pick One)

| Variable | Description | Default |
|----------|-------------|---------|
| `EMAIL_PROVIDER` | Email service | sendgrid, mailgun, smtp, or webhook |
| `EMAIL_FROM` | From address | noreply@evindrake.net |
| `EMAIL_FROM_NAME` | Sender display name | HomeLabHub |
| `ADMIN_EMAIL` | Admin notification email | - |
| `SENDGRID_API_KEY` | SendGrid API key | [sendgrid.com](https://sendgrid.com) |
| `MAILGUN_API_KEY` | Mailgun API key | [mailgun.com](https://mailgun.com) |
| `MAILGUN_DOMAIN` | Mailgun domain | mg.evindrake.net |
| `SMTP_HOST` | SMTP server | smtp.gmail.com |
| `SMTP_PORT` | SMTP port | 587 |
| `SMTP_USER` | SMTP username | Your email |
| `SMTP_PASSWORD` | SMTP password | App password |
| `SMTP_USE_TLS` | Use TLS encryption | true |
| `EMAIL_WEBHOOK_URL` | Webhook for email (n8n, Zapier) | - |

### DNS Automation (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) |
| `CLOUDFLARE_ZONE_ID_EVINDRAKE` | Zone ID for evindrake.net | Cloudflare → Domain → Overview |
| `CLOUDFLARE_ZONE_ID_RIGCITY` | Zone ID for rig-city.com | Same |
| `CLOUDFLARE_ZONE_ID_SCARLETREDJOKER` | Zone ID for scarletredjoker.com | Same |
| `CLOUDFLARE_ZONE` | Primary zone for DDNS | evindrake.net |

Token permissions required: Zone.Zone (Read), Zone.DNS (Edit), Zone.Cache Purge (Write)

### Dynamic DNS (Optional - for Residential IP)

| Variable | Description | Default |
|----------|-------------|---------|
| `DDNS_ENABLED` | Enable dynamic DNS updates | false |
| `DDNS_PROVIDER` | DDNS provider | cloudflare, duckdns, noip |
| `DDNS_SUBDOMAIN` | Subdomain to update | local |
| `DDNS_UPDATE_INTERVAL` | Update interval (seconds) | 300 |
| `DUCKDNS_TOKEN` | DuckDNS authentication token | - |
| `DUCKDNS_DOMAIN` | DuckDNS subdomain | yourhomelab |

### Notifications (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `NOTIFY_ON_ERROR` | Send notification on system errors | true |
| `NOTIFY_ON_TICKET` | Send notification on new tickets | true |
| `NOTIFY_ON_DEPLOYMENT` | Send notification on deployments | true |
| `NOTIFY_ON_BACKUP` | Send notification on backup completion | true |
| `NOTIFY_ADMIN_EMAIL` | Email for admin notifications | - |
| `DISCORD_WEBHOOK_URL` | Discord webhook for notifications | - |

### Sunshine GameStream (Windows)

| Variable | Description | Default |
|----------|-------------|---------|
| `SUNSHINE_USER` | Sunshine web UI username | admin |
| `SUNSHINE_PASS` | Sunshine web UI password | - |
| `SUNSHINE_PORT` | Sunshine HTTPS port | 47990 |

### Service URLs (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_BOT_URL` | Discord bot public URL | https://bot.rig-city.com |
| `N8N_URL` | n8n public URL | https://n8n.evindrake.net |
| `STATIC_SITE_URL` | Static site URL | https://scarletredjoker.com |
| `LETSENCRYPT_EMAIL` | SSL certificate email | your_email@example.com |

### Operational Toggles

| Variable | Description | Default |
|----------|-------------|---------|
| `FLASK_ENV` | Flask environment | production |
| `FLASK_DEBUG` | Flask debug mode | false |
| `NODE_ENV` | Node.js environment | production |
| `RESET_DB` | Reset Discord bot database | false |
| `HOME_ASSISTANT_VERIFY_SSL` | Verify HA SSL certificate | False |
| `MINIO_USE_SSL` | Use SSL for MinIO | false |
| `N8N_BASIC_AUTH_ACTIVE` | Enable n8n auth | true |

### Path Configuration (Usually Don't Change)

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST_STATIC_SITE_PATH` | Host static site directory | ./static-sites |

---

## Appendix B: Secret Management

### How Bootstrap Generates Secrets

When you run `./deploy/scripts/bootstrap.sh --generate-secrets`:

1. **Checks each secret variable** in .env
2. **If empty or missing**, generates a secure random value:
   - Passwords: 32-char alphanumeric (via `openssl rand -base64`)
   - Session secrets: 64-char hex (via `openssl rand -hex 32`)
3. **Writes to .env** and reports what was generated
4. **Never overwrites** existing values

### Manual Secret Generation

If you need to generate secrets yourself:

```bash
# 32-character password
openssl rand -base64 24 | tr -d '/+=' | head -c 32

# 64-character hex secret
openssl rand -hex 32
```

### Secret Rotation

To rotate a secret:

```bash
# 1. Generate new value
NEW_SECRET=$(openssl rand -hex 32)

# 2. Update .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$NEW_SECRET/" .env

# 3. Restart services
docker compose down && docker compose up -d
```

### Backup Strategy

Always backup .env before making changes:

```bash
cp .env .env.backup.$(date +%Y%m%d)
```

---

## Appendix C: DNS Automation & Scripts

### Cloudflare API Reference

All Cloudflare operations use the v4 API with Bearer token authentication.

#### Get Your Credentials

1. **API Token** (recommended): [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Create token with: Zone.Zone (Read), Zone.DNS (Edit)
   
2. **Zone IDs**: Cloudflare Dashboard → Domain → Overview → API section
   ```
   CLOUDFLARE_ZONE_ID_EVINDRAKE=abc123...
   CLOUDFLARE_ZONE_ID_RIGCITY=def456...
   ```

### DDNS Update Script (Cloudflare)

Complete script for automatic IP updates:

```bash
#!/bin/bash
# cloudflare-ddns.sh - Update Cloudflare DNS when IP changes
# Run via cron: */5 * * * * /path/to/cloudflare-ddns.sh

# Configuration
CF_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"
CF_ZONE_ID="YOUR_ZONE_ID"
RECORD_NAME="local.evindrake.net"
LOG_FILE="/var/log/cloudflare-ddns.log"

# Get current public IP
CURRENT_IP=$(curl -s https://api.ipify.org)

# Get current DNS record
RECORD=$(curl -s -X GET \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${RECORD_NAME}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json")

RECORD_ID=$(echo $RECORD | jq -r '.result[0].id')
RECORD_IP=$(echo $RECORD | jq -r '.result[0].content')

# Update if changed
if [ "$CURRENT_IP" != "$RECORD_IP" ]; then
  echo "$(date): IP changed from $RECORD_IP to $CURRENT_IP" >> $LOG_FILE
  
  curl -s -X PUT \
    "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${RECORD_ID}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"${RECORD_NAME}\",\"content\":\"${CURRENT_IP}\",\"ttl\":300,\"proxied\":false}" >> $LOG_FILE
    
  echo "$(date): DNS updated successfully" >> $LOG_FILE
fi
```

### Windows PowerShell DDNS Script

```powershell
# cloudflare-ddns.ps1 - Windows version
# Run as scheduled task every 5 minutes

$CF_API_TOKEN = "YOUR_CLOUDFLARE_API_TOKEN"
$CF_ZONE_ID = "YOUR_ZONE_ID"
$RECORD_NAME = "local.evindrake.net"
$LOG_FILE = "C:\HomeLabHub\logs\ddns.log"

# Get current IP
$currentIP = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content

# Get current DNS record
$headers = @{
    "Authorization" = "Bearer $CF_API_TOKEN"
    "Content-Type" = "application/json"
}

$response = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?name=$RECORD_NAME" -Headers $headers
$recordId = $response.result[0].id
$recordIP = $response.result[0].content

# Update if changed
if ($currentIP -ne $recordIP) {
    "$(Get-Date): IP changed from $recordIP to $currentIP" | Out-File -Append $LOG_FILE
    
    $body = @{
        type = "A"
        name = $RECORD_NAME
        content = $currentIP
        ttl = 300
        proxied = $false
    } | ConvertTo-Json
    
    Invoke-RestMethod -Method Put -Uri "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$recordId" -Headers $headers -Body $body
    
    "$(Get-Date): DNS updated successfully" | Out-File -Append $LOG_FILE
}
```

### Docker-based DDNS (Set and Forget)

Deploy as a Docker container for automatic updates:

```yaml
# docker-compose.ddns.yml
version: '3.8'

services:
  cloudflare-ddns:
    image: oznu/cloudflare-ddns
    container_name: cloudflare-ddns
    restart: always
    environment:
      - API_KEY=${CLOUDFLARE_API_TOKEN}
      - ZONE=${CLOUDFLARE_ZONE}
      - SUBDOMAIN=local
      - PROXIED=false
```

Run with:
```bash
docker compose -f docker-compose.ddns.yml up -d
```

### Bulk DNS Management Script

Manage all your DNS records from a single script:

```bash
#!/bin/bash
# dns-manager.sh - Manage all DNS records

CF_API_TOKEN="YOUR_TOKEN"

# Define your records
declare -A RECORDS
RECORDS["evindrake.net"]="@:LINODE_IP dash:LINODE_IP n8n:LINODE_IP code:LINODE_IP"
RECORDS["rig-city.com"]="@:LINODE_IP bot:LINODE_IP stream:LINODE_IP"
RECORDS["scarletredjoker.com"]="@:LINODE_IP www:LINODE_IP"

LINODE_IP="YOUR_LINODE_IP"

for zone in "${!RECORDS[@]}"; do
  echo "Processing $zone..."
  zone_id=$(get_zone_id "$zone")
  
  for record in ${RECORDS[$zone]}; do
    name="${record%%:*}"
    ip="${record##*:}"
    ip="${ip/LINODE_IP/$LINODE_IP}"
    
    echo "  Setting $name.$zone → $ip"
    # API call to update record...
  done
done
```

### DNS Verification Script

Verify all DNS records are correct:

```bash
#!/bin/bash
# verify-dns.sh - Check all DNS records

LINODE_IP="YOUR_LINODE_IP"

echo "Checking DNS records..."

# Cloud services
for domain in dash.evindrake.net n8n.evindrake.net code.evindrake.net bot.rig-city.com stream.rig-city.com; do
  resolved=$(dig +short $domain)
  if [ "$resolved" == "$LINODE_IP" ]; then
    echo "✓ $domain → $resolved"
  else
    echo "✗ $domain → $resolved (expected $LINODE_IP)"
  fi
done

# Check propagation
echo ""
echo "Checking via public DNS servers..."
for dns in 8.8.8.8 1.1.1.1 9.9.9.9; do
  for domain in dash.evindrake.net bot.rig-city.com; do
    resolved=$(dig +short @$dns $domain)
    echo "  $domain via $dns → $resolved"
  done
done
```

### Cron Setup Reference

Common cron schedules for DNS/DDNS scripts:

```bash
# Edit crontab
crontab -e

# DDNS update every 5 minutes
*/5 * * * * /opt/homelab/scripts/cloudflare-ddns.sh

# DNS verification daily at 6 AM
0 6 * * * /opt/homelab/scripts/verify-dns.sh | mail -s "DNS Report" your@email.com

# Log rotation for DDNS logs
0 0 * * 0 truncate -s 0 /var/log/cloudflare-ddns.log
```

---

## Summary Checklist

### Phase 1: Accounts
- [ ] Cloudflare account with domains transferred
- [ ] Linode account created
- [ ] Tailscale account created
- [ ] OpenAI account with API key
- [ ] Discord Developer account

### Phase 2: Infrastructure
- [ ] Linode server created (4GB, Ubuntu 22.04)
- [ ] Linode public IP noted
- [ ] DNS records added for cloud services (gray cloud!)
- [ ] Tailscale installed on Linode
- [ ] Tailscale installed on local Windows
- [ ] Both Tailscale IPs noted
- [ ] (Optional) DDNS configured for residential IP

### Phase 3: Cloud Deployment
- [ ] Docker installed on Linode
- [ ] Repository cloned
- [ ] Cloud .env configured
- [ ] Bootstrap script run with --role cloud
- [ ] All cloud services running (docker compose ps)

### Phase 4: OAuth & Email
- [ ] Discord OAuth app created
- [ ] Discord bot token obtained
- [ ] Bot invited to server
- [ ] (Optional) Twitch OAuth app created
- [ ] (Optional) YouTube/Google OAuth configured
- [ ] (Optional) Spotify OAuth configured
- [ ] (Optional) Email provider configured (SendGrid/Mailgun/SMTP)

### Phase 5: Local Setup (Windows)
- [ ] Tailscale connected and working
- [ ] Sunshine installed and configured
- [ ] Moonlight client paired
- [ ] Remote gaming tested via Tailscale
- [ ] (Optional) Docker Desktop with Plex/HA/MinIO
- [ ] Local Tailscale IP added to Linode .env

### Phase 6: Verification
- [ ] Dashboard accessible at https://dash.evindrake.net
- [ ] Discord bot responding to /ping
- [ ] Stream bot dashboard working
- [ ] n8n accessible
- [ ] Code Server working
- [ ] Plex accessible via app.plex.tv
- [ ] Sunshine streaming working via Tailscale

### Phase 7: Automation (Optional)
- [ ] Health check cron configured
- [ ] Database backup cron configured
- [ ] Watchtower for auto-updates (optional)
- [ ] Log rotation configured
- [ ] n8n workflows created (optional)

---

**Your homelab is now live at https://dash.evindrake.net**

### Quick Reference

| Service | URL | Access Method |
|---------|-----|---------------|
| Dashboard | https://dash.evindrake.net | Public |
| Discord Bot | https://bot.rig-city.com | Public |
| Stream Bot | https://stream.rig-city.com | Public |
| n8n | https://n8n.evindrake.net | Public |
| Code Server | https://code.evindrake.net | Public |
| Plex | app.plex.tv | Plex Native |
| Home Assistant | Tailscale IP:8123 | Tailscale |
| Sunshine | Tailscale IP | Moonlight |
| MinIO | Tailscale IP:9001 | Tailscale |
