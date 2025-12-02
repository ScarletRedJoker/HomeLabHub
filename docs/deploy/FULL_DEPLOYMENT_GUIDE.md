# HomeLabHub Deployment Guide

> **One document. Zero to production.**

---

## Quick Links

| I need to... | Go to... |
|-------------|----------|
| **Prepare ALL env vars first** | [Complete Environment Variables](#complete-environment-variables-prepare-these-first) |
| Deploy from scratch | [Start Here](#phase-1-accounts--prerequisites) |
| Set up DNS/DDNS | [Phase 2: Infrastructure](#phase-2-infrastructure-setup) |
| Set up OAuth apps | [Phase 4: OAuth Configuration](#phase-4-oauth-configuration) |
| Configure email | [Phase 4.6: Email Setup](#46-email--notifications-setup) |
| Set up KVM + Sunshine | [Phase 5: Local Deployment](#phase-5-local-deployment-ubuntu--windows-kvm) |
| **Expose local services publicly** | [Phase 5.12: Public Access](#512-public-access-via-linode-reverse-proxy) |
| Set up automation | [Phase 7: Automation](#phase-7-operational-automation) |
| Fix something | [Troubleshooting](#troubleshooting) |
| Daily management | [Operations](#daily-operations) |
| View all env vars | [Complete Environment Variables](#complete-environment-variables-prepare-these-first) |
| DNS scripts | [Appendix C](#appendix-c-dns-automation--scripts) |

---

## Executive Summary

**What you're building:**
- A split-architecture homelab with cloud services (always-on) and local services (GPU-intensive)
- Cloud (Linode $24/mo): Dashboard, Discord Bot, Stream Bot, Database, n8n, Code-Server
- Local (Ubuntu 25.10 host): Plex, Home Assistant, MinIO Storage, Docker services
- Windows 11 KVM VM (GPU passthrough): Sunshine GameStream with RTX 3060

**Time to deploy:** ~2-3 hours from scratch

---

## Service Placement Matrix (CRITICAL - Read This First!)

**Where does each service run? This table is the source of truth.**

| Service | Runs On | Compose File | Why There |
|---------|---------|--------------|-----------|
| **Dashboard** | Linode (Cloud) | `docker-compose.yml` | Always accessible, central management |
| **Discord Bot** | Linode (Cloud) | `docker-compose.yml` | Needs 24/7 uptime for Discord |
| **Stream Bot** | Linode (Cloud) | `docker-compose.yml` | Webhook callbacks need public URL |
| **PostgreSQL** | Linode (Cloud) | `docker-compose.yml` | Database for all services |
| **Redis** | Linode (Cloud) | `docker-compose.yml` | Caching, message queue |
| **n8n** | Linode (Cloud) | `docker-compose.yml` | Automation needs webhooks |
| **Caddy** | Linode (Cloud) | `docker-compose.yml` | Reverse proxy with SSL |
| **code-server** | Linode (Cloud) | `docker-compose.yml` | Browser IDE |
| **Static sites** | Linode (Cloud) | `docker-compose.yml` | Public websites |
| | | | |
| **Plex** | Local Ubuntu | `compose.local.yml` | Media files are local |
| **Home Assistant** | Local Ubuntu | `compose.local.yml` | Smart home devices are local |
| **MinIO** | Local Ubuntu | `compose.local.yml` | Large file storage is local |
| | | | |
| **Sunshine** | Windows VM | Native install | GPU streaming needs GPU |
| **Games** | Windows VM | Native install | GPU-intensive |

### Deployment Order (Linear Flow)

**Do these in order. Don't skip ahead.**

```
PHASE 1-2: Prerequisites & Accounts (Both)
    ↓
PHASE 3: Linode Cloud Setup
    ↓
    ├── Create Linode server
    ├── Run bootstrap.sh --role cloud
    ├── Verify: dash.evindrake.net works
    └── ✓ CHECKPOINT: Cloud services running
    ↓
PHASE 4: OAuth & Integrations (Linode)
    ↓
    ├── Discord bot credentials
    ├── Stream bot integrations (optional)
    └── ✓ CHECKPOINT: Bots working
    ↓
PHASE 5: Local Ubuntu Setup (Your PC)
    ↓
    ├── 5.1-5.3: GPU passthrough setup
    ├── 5.4: Create Windows VM
    ├── 5.5: Install Sunshine in VM
    ├── 5.6: Docker services (Plex, HA, MinIO)
    └── ✓ CHECKPOINT: Local services running
    ↓
PHASE 6: Connect Local to Cloud
    ↓
    └── Tailscale connects everything
```

### Which Compose File Do I Use?

```
ON LINODE:
  cd /opt/homelab/HomeLabHub
  docker compose up -d                    # Uses docker-compose.yml

ON LOCAL UBUNTU:
  cd /opt/homelab
  docker compose -f compose.local.yml up -d   # Uses compose.local.yml
```

**NEVER run `docker-compose.yml` on local Ubuntu.**
**NEVER run `compose.local.yml` on Linode.**

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                │
│                                                                  │
│   dash.evindrake.net    plex.evindrake.net    ha.evindrake.net │
│   n8n.evindrake.net     minio.evindrake.net                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
           ┌───────────────┴───────────────┐
           ▼                               │
┌─────────────────────┐         ┌──────────┴──────────────────────┐
│   LINODE CLOUD      │◄═══════►│   LOCAL UBUNTU 25.10            │
│   Ubuntu 25.10      │ Tailscale│   (Your Main PC)                │
│   $24/month         │   VPN    │                                 │
│   (Caddy Proxy)     │         │   Native Docker Services:       │
│                     │ Proxies  │   • Plex (plex.evindrake.net)   │
│ • Dashboard         │ local ──►│   • Home Assistant (ha.*)       │
│ • Discord Bot       │ services │   • MinIO Storage (minio.*)     │
│ • Stream Bot        │         │                                 │
│ • PostgreSQL        │         │   ┌─────────────────────────┐   │
│ • Redis/n8n/Caddy   │         │   │ Windows 11 KVM VM       │   │
└─────────────────────┘         │   │ (GPU Passthrough: 3060) │   │
                                │   │ • Sunshine GameStream   │   │
                                │   │   (Tailscale only)      │   │
                                │   └─────────────────────────┘   │
                                └─────────────────────────────────┘
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

## Complete Environment Variables (Prepare These First!)

**Stop hunting through the guide!** Fill out this checklist BEFORE you start. Copy everything you need into a text file, then paste into `.env` when you reach Phase 3.

> **Time saver:** Open [.env.example](.env.example) in another tab while you gather these values.

---

### REQUIRED - Fill These Out Now

These are **mandatory** - deployment will fail without them.

#### Core Configuration
```env
# Your timezone (find yours: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
TZ=America/New_York

# Dashboard login - pick these now
WEB_USERNAME=admin
WEB_PASSWORD=________________________    # 16+ characters, mix of letters/numbers/symbols
```

#### OpenAI API (Jarvis AI, Stream Bot)
```env
# Get from: https://platform.openai.com/api-keys
# Click "Create new secret key", copy immediately (you can't see it again!)
OPENAI_API_KEY=sk-proj-____________________________________________
```

#### Discord Bot (Required for ticket system)
```env
# Get from: https://discord.com/developers/applications
# 1. Create New Application → Name it (e.g., "HomeLabHub Bot")
# 2. Go to "Bot" → "Reset Token" → Copy token
DISCORD_BOT_TOKEN=_________________________________________________

# 3. Go to "OAuth2" → Copy Client ID
DISCORD_CLIENT_ID=__________________

# 4. "OAuth2" → Click "Reset Secret" → Copy
DISCORD_CLIENT_SECRET=______________________________________________
```

#### Tailscale (VPN Mesh)
```env
# Get from: https://login.tailscale.com/admin/settings/keys
# Click "Generate auth key" → Reusable, Pre-approved
# You'll use this during setup, not stored in .env permanently
TAILSCALE_AUTH_KEY=tskey-auth-______________________________________
```

#### Code Server (VS Code in browser)
```env
# Pick a strong password for your browser-based VS Code
CODE_SERVER_PASSWORD=________________________
```

---

### OPTIONAL - Fill These If You Want The Feature

Leave blank if you don't need the feature. You can add them later.

#### Twitch Integration (Stream Bot)
```env
# Get from: https://dev.twitch.tv/console/apps
# 1. Register Your Application
# 2. Name: "HomeLabHub StreamBot", Category: Chat Bot
# 3. OAuth Redirect: https://stream.yourdomain.com/api/auth/twitch/callback
TWITCH_CLIENT_ID=_________________________
TWITCH_CLIENT_SECRET=_____________________
TWITCH_CHANNEL=your_twitch_username
TWITCH_REDIRECT_URI=https://stream.rig-city.com/api/auth/twitch/callback
```

#### YouTube Integration (Stream Bot)
```env
# Get from: https://console.cloud.google.com/apis/credentials
# Full step-by-step guide: Phase 4.3 below
# 1. Create Project → APIs & Services → Enable YouTube Data API v3
# 2. OAuth consent screen → Add yourself as test user
# 3. Credentials → Create OAuth Client ID → Web Application
# 4. Add redirect URIs: your callback URL + http://localhost:3000/callback
YOUTUBE_CLIENT_ID=______________________.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-____________________

# REFRESH TOKEN - Required! Generate via OAuth Playground (see Phase 4.3 Step 5)
# 1. Go to: https://developers.google.com/oauthplayground/
# 2. Settings gear → Use your own OAuth credentials → Enter Client ID & Secret
# 3. Select YouTube Data API v3 → youtube.readonly scope
# 4. Authorize → Exchange code → Copy the refresh_token
YOUTUBE_REFRESH_TOKEN=1//____________________________________
```

#### Spotify Integration (Now Playing)
```env
# Get from: https://developer.spotify.com/dashboard
# Full step-by-step guide: Phase 4.4 below
# 1. Create App → Add redirect URI: http://localhost:3000/callback
# 2. Settings → Copy Client ID and Client Secret
SPOTIFY_CLIENT_ID=________________________________
SPOTIFY_CLIENT_SECRET=____________________________

# REFRESH TOKEN - Required! Generate via authorization flow (see Phase 4.4 Step 3)
# Quick method:
# 1. Visit: https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost:3000/callback&scope=user-read-currently-playing
# 2. Authorize → Copy the "code" from the redirect URL
# 3. Exchange code for tokens with curl (see Phase 4.4)
SPOTIFY_REFRESH_TOKEN=AQB_________________________________
```

#### Kick Integration (Stream Bot)
```env
# Get from: Kick Developer Portal (if you have access)
KICK_CLIENT_ID=___________________________________
KICK_CLIENT_SECRET=_______________________________
KICK_REDIRECT_URI=https://stream.rig-city.com/api/auth/kick/callback
```

#### Cloudflare (Dynamic DNS / DNS Automation)
```env
# Get from: https://dash.cloudflare.com/profile/api-tokens
# 1. Create Token → Edit zone DNS template
# 2. Permissions: Zone:Read, DNS:Edit for your domains
CLOUDFLARE_API_TOKEN=_____________________________________________

# Get Zone IDs from: Cloudflare Dashboard → Your Domain → Right sidebar "Zone ID"
CLOUDFLARE_ZONE_ID_EVINDRAKE=________________________________
CLOUDFLARE_ZONE_ID_RIGCITY=__________________________________
CLOUDFLARE_ZONE_ID_SCARLETREDJOKER=__________________________
```

#### n8n Automation
```env
# For n8n.yourdomain.com - pick login credentials
N8N_HOST=n8n.evindrake.net
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=________________________
```

#### Email Notifications

**Option A: SendGrid (Easiest)**
```env
# Get from: https://app.sendgrid.com/settings/api_keys
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG._____________________________________________
EMAIL_FROM=noreply@yourdomain.com
ADMIN_EMAIL=your.email@gmail.com
```

**Option B: SMTP (Gmail)**
```env
# For Gmail: Enable 2FA, then get App Password from:
# https://myaccount.google.com/apppasswords
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASSWORD=________________    # 16-char app password, no spaces
SMTP_USE_TLS=true
EMAIL_FROM=your.email@gmail.com
ADMIN_EMAIL=your.email@gmail.com
```

---

### LOCAL HOST ONLY (Ubuntu, not Linode)

These go in `/opt/homelab/.env` on your **Ubuntu host**, not the Linode.

#### Plex Media Server
```env
# Get fresh claim from: https://plex.tv/claim (expires in 4 minutes!)
# Claim is only needed on first run - after that you can remove it
PLEX_CLAIM=claim-____________________________________

# Get token from: https://www.plex.tv/claim/ (while logged in)
# Or: Plex Settings → General → View XML → Find X-Plex-Token
PLEX_TOKEN=_________________________________________
```

#### MinIO (S3 Storage)
```env
# Pick credentials for your local MinIO instance
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=________________________
```

#### Home Assistant
```env
# Get from: HA Settings → Long-Lived Access Tokens → Create Token
HOME_ASSISTANT_TOKEN=_____________________________________________
```

#### Windows VM / Sunshine GameStream
```env
# Credentials for Sunshine web UI (https://VM_IP:47990)
SUNSHINE_USER=admin
SUNSHINE_PASS=________________________
```

---

### Quick Copy Template

Copy this entire block to a file, fill it out, then paste into `.env`:

```env
# ═══════════════════════════════════════════════════════════════════════════════
# HOMELAB HUB - FILL BEFORE DEPLOYMENT
# Copy to .env after filling out all values
# ═══════════════════════════════════════════════════════════════════════════════

# --- REQUIRED: CORE ---
TZ=America/New_York
WEB_USERNAME=admin
WEB_PASSWORD=
CODE_SERVER_PASSWORD=

# --- REQUIRED: AI ---
OPENAI_API_KEY=

# --- REQUIRED: DISCORD ---
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# --- OPTIONAL: STREAMING INTEGRATIONS ---
# Twitch (https://dev.twitch.tv/console/apps)
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_CHANNEL=

# YouTube (https://console.cloud.google.com - see Phase 4.3 for full guide)
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=              # Generate via OAuth Playground - see Phase 4.3 Step 5

# Spotify (https://developer.spotify.com/dashboard - see Phase 4.4 for full guide)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=              # Generate via authorization flow - see Phase 4.4 Step 3

# Kick
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=

# --- OPTIONAL: CLOUDFLARE ---
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID_EVINDRAKE=
CLOUDFLARE_ZONE_ID_RIGCITY=
CLOUDFLARE_ZONE_ID_SCARLETREDJOKER=

# --- OPTIONAL: EMAIL (pick one provider) ---
EMAIL_PROVIDER=smtp
SENDGRID_API_KEY=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=
ADMIN_EMAIL=

# --- OPTIONAL: N8N ---
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=

# --- LOCAL HOST ONLY (separate .env file) ---
# PLEX_CLAIM=
# PLEX_TOKEN=
# MINIO_ROOT_USER=admin
# MINIO_ROOT_PASSWORD=
# HOME_ASSISTANT_TOKEN=
# SUNSHINE_USER=admin
# SUNSHINE_PASS=
```

---

### Where Each Value Goes

| Environment | File Location | Variables |
|-------------|---------------|-----------|
| **Linode (Cloud)** | `/opt/homelab/HomeLabHub/.env` | All REQUIRED, plus optional integrations |
| **Ubuntu Host (Local)** | `/opt/homelab/.env` | PLEX_*, MINIO_*, HOME_ASSISTANT_*, SUNSHINE_* |
| **Windows VM** | N/A | Sunshine has its own web UI for config |

---

### Checklist Before Starting Deployment

Use this to verify you have everything:

- [ ] **OpenAI API Key** - Have `sk-proj-...` ready
- [ ] **Discord Bot Token** - Created application, copied bot token
- [ ] **Discord Client ID/Secret** - From OAuth2 tab
- [ ] **Cloudflare Account** - Domains added, can access dashboard
- [ ] **Tailscale Account** - Can generate auth keys
- [ ] **Decided on passwords** - WEB_PASSWORD, CODE_SERVER_PASSWORD, N8N password
- [ ] **Email setup decided** - Know if using SendGrid, Gmail, or skipping

**Optional (can add later):**
- [ ] Twitch Client ID/Secret
- [ ] YouTube Client ID/Secret + **Refresh Token** (see Phase 4.3 Step 5)
- [ ] Spotify Client ID/Secret + **Refresh Token** (see Phase 4.4 Step 3)
- [ ] Cloudflare API Token + Zone IDs

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

#### Local Services (Optional Public DNS - See Phase 5.12)

These services run on your local Ubuntu host. You have two access options:

| Service | Default Access | Optional Public Access |
|---------|---------------|------------------------|
| **Plex** | [app.plex.tv](https://app.plex.tv) or Tailscale | plex.evindrake.net via Linode proxy |
| **Home Assistant** | Tailscale: `http://100.110.227.25:8123` | ha.evindrake.net via Linode proxy |
| **MinIO** | Tailscale: `http://100.110.227.25:9001` | minio.evindrake.net via Linode proxy |
| **Sunshine** | Moonlight + Tailscale only | N/A (keep Tailscale-only for latency) |

**Choose Your Approach:**
- **Tailscale-only (simpler):** No extra DNS needed. Access via Tailscale IPs.
- **Public access (convenient):** Set up DNS records in [Phase 5.12](#512-public-access-via-linode-reverse-proxy) to access from any browser without Tailscale.

> **Note:** For full public access setup including DNS records, Caddy configuration, and security hardening, see [Phase 5.12: Public Access](#512-public-access-via-linode-reverse-proxy).

### 2.3 Set Up Tailscale VPN (Complete Guide)

Tailscale creates a secure mesh VPN between all your devices. This is critical for connecting Linode to your local services.

---

#### Step 1: Create a Tailscale Account

1. Go to [tailscale.com](https://tailscale.com/) and click **"Get Started"**
2. Sign up with Google, Microsoft, GitHub, or email
3. After signup, you'll see the **Machines** page (empty for now)

---

#### Step 2: Generate Auth Keys

Auth keys let you add machines without interactive login.

1. Go to [Tailscale Admin → Keys](https://login.tailscale.com/admin/settings/keys)
2. Click **"Generate auth key..."**
3. Configure the key:
   | Setting | Value | Why |
   |---------|-------|-----|
   | **Description** | `HomeLabHub Servers` | Easy identification |
   | **Reusable** | ✅ Yes | Use same key for multiple machines |
   | **Ephemeral** | ❌ No | Machines stay in network after disconnect |
   | **Expiration** | 90 days | Balance security and convenience |
   | **Tags** | Leave empty | Optional for ACLs |
   
4. Click **"Generate key"**
5. **Copy the key immediately!** It looks like: `tskey-auth-kXYZ123456CNTRL-abc123...`

```
⚠️  The key is shown only once! Save it somewhere safe.
```

---

#### Step 3: Install on Linode (Cloud Server)

```bash
# SSH into your Linode
ssh root@YOUR_LINODE_IP

# Download and install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Verify installation
tailscale --version
# Expected: tailscale 1.xx.x

# Connect to your Tailnet (replace with your actual key)
sudo tailscale up --authkey=tskey-auth-kXYZ123456CNTRL-abc123 --hostname=homelab-linode

# Get your Tailscale IP
tailscale ip -4
# Example output: 100.66.61.51

# Verify connection status
tailscale status
# Shows: logged in, connected

# Enable Tailscale to start on boot
sudo systemctl enable tailscaled
sudo systemctl status tailscaled
# Should show: active (running)
```

**Record your Linode Tailscale IP:** `100.66.61.51` (yours will differ)

---

#### Step 4: Install on Local Ubuntu Host

```bash
# On your local Ubuntu machine
# Download and install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Verify installation
tailscale --version

# Connect to your Tailnet (use the same auth key)
sudo tailscale up --authkey=tskey-auth-kXYZ123456CNTRL-abc123 --hostname=homelab-local

# Get your Tailscale IP
tailscale ip -4
# Example output: 100.110.227.25

# Verify connection status
tailscale status
# Should show both machines now

# Enable on boot
sudo systemctl enable tailscaled
sudo systemctl status tailscaled
```

**Record your Local Tailscale IP:** `100.110.227.25` (yours will differ)

---

#### Step 5: Verify Connectivity Between Machines

Run these tests to ensure the VPN tunnel is working:

**From Linode (test connection to local):**
```bash
# Ping local Ubuntu host
ping -c 4 100.110.227.25
# Expected: 4 packets transmitted, 4 received, 0% packet loss

# Test TCP connection to a local service (if running)
nc -zv 100.110.227.25 22       # SSH
nc -zv 100.110.227.25 8123     # Home Assistant (if running)
nc -zv 100.110.227.25 32400    # Plex (if running)
```

**From Local Ubuntu (test connection to Linode):**
```bash
# Ping Linode
ping -c 4 100.66.61.51
# Expected: 4 packets transmitted, 4 received, 0% packet loss

# Test TCP connection to Linode services
nc -zv 100.66.61.51 22         # SSH
nc -zv 100.66.61.51 443        # HTTPS (after Caddy setup)
```

**Connectivity Test Matrix:**
| From | To | Test Command | Expected Result |
|------|------|--------------|-----------------|
| Linode | Local Ubuntu | `ping 100.110.227.25` | 0% packet loss |
| Local Ubuntu | Linode | `ping 100.66.61.51` | 0% packet loss |
| Linode | Local Plex | `curl -s http://100.110.227.25:32400` | Connection or auth response |
| Linode | Local HA | `curl -s http://100.110.227.25:8123` | Connection or auth response |
| Linode | Local MinIO | `curl -s http://100.110.227.25:9001` | MinIO console or redirect |

---

#### Step 6: Enable MagicDNS (Recommended)

MagicDNS lets you use hostnames instead of IP addresses.

1. Go to [Tailscale Admin → DNS](https://login.tailscale.com/admin/dns)
2. Under **MagicDNS**, click **"Enable"**
3. Your machines are now accessible by hostname:
   - `homelab-linode` instead of `100.66.61.51`
   - `homelab-local` instead of `100.110.227.25`

**Test MagicDNS:**
```bash
# From Linode
ping homelab-local
# Should resolve to 100.110.227.25

# From Local Ubuntu
ping homelab-linode
# Should resolve to 100.66.61.51
```

**Note:** The guide uses numeric IPs for clarity, but you can substitute hostnames with MagicDNS enabled.

---

#### Step 7: Review Access Control Lists (Optional)

ACLs control which machines can talk to each other. The default allows all devices to communicate freely.

**View your ACL policy:**
1. Go to [Tailscale Admin → Access controls](https://login.tailscale.com/admin/acls)
2. Default policy looks like:
   ```json
   {
     "acls": [
       {"action": "accept", "src": ["*"], "dst": ["*:*"]}
     ]
   }
   ```

For a homelab, the default "allow all" policy is usually fine. For advanced setups, you can restrict access:

**Example: Only allow Linode to access specific ports on local:**
```json
{
  "acls": [
    // Allow Linode to reach local services
    {"action": "accept", "src": ["homelab-linode"], "dst": ["homelab-local:22,8123,9000,9001,32400"]},
    // Allow local to reach Linode
    {"action": "accept", "src": ["homelab-local"], "dst": ["homelab-linode:*"]},
    // Default deny (implicit)
  ],
  "tagOwners": {}
}
```

---

#### Step 8: Install Tailscale in Windows VM (For Game Streaming)

If you'll use Sunshine for game streaming, install Tailscale in your Windows 11 KVM VM:

1. In the Windows VM, download from [tailscale.com/download/windows](https://tailscale.com/download/windows)
2. Run the installer
3. Log in with the same account
4. Note the Windows VM's Tailscale IP (e.g., `100.100.x.x`)

This allows Moonlight to connect directly to the Windows VM over Tailscale for low-latency game streaming.

---

#### Troubleshooting Tailscale

**Problem: "Logged out" or "Not connected"**
```bash
# Re-authenticate
sudo tailscale up --authkey=tskey-auth-YOUR-KEY

# Or interactive login
sudo tailscale up
# Opens browser for login
```

**Problem: Can't ping other machine**
```bash
# Check status on both machines
tailscale status

# Ensure firewall allows Tailscale
sudo ufw allow in on tailscale0
sudo ufw allow out on tailscale0

# Restart Tailscale
sudo systemctl restart tailscaled
```

**Problem: Tailscale not starting on boot**
```bash
# Enable the service
sudo systemctl enable tailscaled

# Check for errors
sudo systemctl status tailscaled
sudo journalctl -u tailscaled -n 50
```

**Problem: DNS resolution failing with MagicDNS**
```bash
# Force DNS refresh
sudo tailscale down
sudo tailscale up

# Check DNS settings
cat /etc/resolv.conf
# Should show Tailscale DNS entries
```

---

#### Your Tailscale Configuration Summary

| Machine | Hostname | Tailscale IP | Role |
|---------|----------|--------------|------|
| Linode | homelab-linode | 100.66.61.51 | Cloud server (Caddy, dashboard) |
| Local Ubuntu | homelab-local | 100.110.227.25 | Local host (Plex, HA, MinIO) |
| Windows VM | homelab-gaming | 100.100.x.x | Game streaming (Sunshine) |

> **Note:** Your IPs will be different! Tailscale assigns unique IPs when you connect.

### 2.4 Dynamic DNS for Residential IP (Complete Walkthrough)

> **Skip this section if:** You only access local services via Tailscale (recommended) or your ISP provides a static IP.

If you have a **residential internet connection** (like Spectrum, Comcast, AT&T), your public IP address changes periodically. Dynamic DNS automatically updates your DNS records when your IP changes.

---

#### Step 1: Create a Cloudflare API Token

You need an API token with permission to edit DNS records. Here's exactly how to create one:

**Navigate to the API Token Page:**
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click your profile icon (top-right corner)
3. Select **"My Profile"**
4. Click **"API Tokens"** in the left sidebar
5. Click the **"Create Token"** button

**Create a Custom Token:**
1. Scroll down and click **"Create Custom Token"** (not a template)
2. **Token name:** `DDNS Updater - HomeLabHub` (or any descriptive name)
3. **Permissions** - Add these two permissions:
   | Permission | Access Level |
   |------------|--------------|
   | **Zone** → **Zone** | **Read** |
   | **Zone** → **DNS** | **Edit** |
   
4. **Zone Resources:**
   - Select: **Include** → **Specific zone** → **evindrake.net** (your domain)
   - Or select: **Include** → **All zones** (if managing multiple domains)

5. **Client IP Address Filtering:** (Optional but recommended)
   - Leave blank for now, or add your current home IP
   
6. **TTL:** (Token expiration)
   - **Start Date:** Leave blank (starts immediately)
   - **End Date:** Leave blank (no expiration) or set to 1 year from now
   
7. Click **"Continue to summary"**
8. Review the settings and click **"Create Token"**

**CRITICAL: Save Your Token!**
```
Your token: cf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

⚠️  This token is shown ONLY ONCE. Copy it now and save it securely!
```

**Test your token immediately:**
```bash
# Replace with your actual token
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer YOUR_API_TOKEN_HERE" \
  -H "Content-Type: application/json"

# Expected successful response:
# {"result":{"id":"...","status":"active"},"success":true,"errors":[],"messages":[]}
```

---

#### Step 2: Find Your Zone ID

Every Cloudflare zone has a unique ID. Here's how to find it:

**Method 1: Cloudflare Dashboard (Easiest)**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click on your domain (e.g., **evindrake.net**)
3. Scroll down on the **Overview** page
4. Look at the right sidebar under **"API"**
5. Copy the **Zone ID** (32-character string like `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)

**Method 2: Via API (If you have multiple zones)**
```bash
# List all zones and their IDs
curl -X GET "https://api.cloudflare.com/client/v4/zones" \
  -H "Authorization: Bearer YOUR_API_TOKEN_HERE" \
  -H "Content-Type: application/json" | jq '.result[] | {name: .name, id: .id}'

# Example output:
# {
#   "name": "evindrake.net",
#   "id": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
# }
```

**Save your Zone ID:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6` (yours will be different)

---

#### Step 3: Create the DNS Record to Update

Before DDNS can update a record, it must exist. Create it now:

**Via Cloudflare Dashboard:**
1. Go to your domain → **DNS** → **Records**
2. Click **"Add record"**
3. Fill in:
   - **Type:** A
   - **Name:** `local` (creates local.evindrake.net)
   - **IPv4 address:** `1.2.3.4` (temporary placeholder - DDNS will update this)
   - **Proxy status:** **DNS only** (gray cloud - not orange!)
   - **TTL:** 5 min (allows faster propagation when IP changes)
4. Click **Save**

**Via API:**
```bash
# Create the A record
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records" \
  -H "Authorization: Bearer YOUR_API_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "local",
    "content": "1.2.3.4",
    "ttl": 300,
    "proxied": false
  }'
```

---

#### Step 4: Install Prerequisites

**On your local Ubuntu host:**
```bash
# Install required packages
sudo apt update
sudo apt install -y curl jq

# Verify installations
curl --version   # Should show curl version
jq --version     # Should show jq version (e.g., jq-1.6)

# Create scripts directory
sudo mkdir -p /opt/homelab/scripts
sudo mkdir -p /var/log/homelab
```

---

#### Step 5: Choose Your DDNS Method

Pick ONE of these three options:

---

##### Option A: Docker Container (Recommended - Set and Forget)

This is the easiest method - a container that runs continuously:

```bash
# Create config directory
sudo mkdir -p /opt/homelab/ddclient

# Create configuration file
sudo nano /opt/homelab/ddclient/ddclient.conf
```

**Paste this configuration (edit the values):**
```ini
# /opt/homelab/ddclient/ddclient.conf
# Cloudflare Dynamic DNS Configuration

# Update every 5 minutes
daemon=300

# Log to syslog
syslog=yes

# Use Cloudflare protocol
protocol=cloudflare

# Method to determine public IP (reliable Cloudflare endpoint)
use=web, web=https://cloudflare.com/cdn-cgi/trace, web-skip='ip='

# Your domain zone
zone=evindrake.net

# Your Cloudflare email (login)
login=your-email@example.com

# Your API Token (from Step 1)
password=YOUR_CLOUDFLARE_API_TOKEN_HERE

# The record to update (without the zone suffix)
local
```

**Run the container:**
```bash
# Pull and run ddclient container
docker run -d \
  --name cloudflare-ddns \
  --restart=always \
  -v /opt/homelab/ddclient/ddclient.conf:/etc/ddclient.conf:ro \
  linuxserver/ddclient:latest

# Verify it's running
docker ps | grep ddclient

# Check logs for successful update
docker logs cloudflare-ddns

# Expected log output:
# SUCCESS:  local.evindrake.net: updating record to 203.0.113.45
```

**To update configuration:**
```bash
# Edit config
sudo nano /opt/homelab/ddclient/ddclient.conf

# Restart container to apply
docker restart cloudflare-ddns
```

---

##### Option B: Bash Script with Cron (No Docker)

If you prefer not to use Docker:

**Create the script:**
```bash
sudo nano /opt/homelab/scripts/cloudflare-ddns.sh
```

**Paste this script (edit the values at the top):**
```bash
#!/bin/bash
#===============================================================================
# Cloudflare Dynamic DNS Update Script
# Updates DNS record when your public IP changes
#
# Usage: Run via cron every 5 minutes
# crontab -e → */5 * * * * /opt/homelab/scripts/cloudflare-ddns.sh
#===============================================================================

#--- CONFIGURATION (Edit these values) ---
API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN_HERE"     # From Step 1
ZONE_ID="YOUR_ZONE_ID_HERE"                     # From Step 2
RECORD_NAME="local.evindrake.net"               # Full DNS record name
LOG_FILE="/var/log/homelab/ddns.log"
#------------------------------------------

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log with timestamp
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Get current public IP (try multiple services for reliability)
get_public_ip() {
    local ip
    ip=$(curl -s --max-time 10 https://api.ipify.org 2>/dev/null)
    if [ -z "$ip" ]; then
        ip=$(curl -s --max-time 10 https://ifconfig.me 2>/dev/null)
    fi
    if [ -z "$ip" ]; then
        ip=$(curl -s --max-time 10 https://icanhazip.com 2>/dev/null)
    fi
    echo "$ip"
}

CURRENT_IP=$(get_public_ip)

# Validate we got an IP
if [ -z "$CURRENT_IP" ]; then
    log "ERROR: Could not determine public IP"
    exit 1
fi

# Get existing DNS record from Cloudflare
RECORD_RESPONSE=$(curl -s -X GET \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$RECORD_NAME&type=A" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json")

# Check for API errors
if echo "$RECORD_RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
    ERROR_MSG=$(echo "$RECORD_RESPONSE" | jq -r '.errors[0].message')
    log "ERROR: Cloudflare API error: $ERROR_MSG"
    exit 1
fi

# Extract record details
RECORD_ID=$(echo "$RECORD_RESPONSE" | jq -r '.result[0].id')
OLD_IP=$(echo "$RECORD_RESPONSE" | jq -r '.result[0].content')

# Check if record exists
if [ "$RECORD_ID" == "null" ] || [ -z "$RECORD_ID" ]; then
    log "ERROR: DNS record '$RECORD_NAME' not found. Create it first in Cloudflare."
    exit 1
fi

# Only update if IP changed
if [ "$CURRENT_IP" == "$OLD_IP" ]; then
    # Uncomment next line for verbose logging
    # log "INFO: IP unchanged ($CURRENT_IP)"
    exit 0
fi

# Update the DNS record
UPDATE_RESPONSE=$(curl -s -X PUT \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{
        \"type\": \"A\",
        \"name\": \"$RECORD_NAME\",
        \"content\": \"$CURRENT_IP\",
        \"ttl\": 300,
        \"proxied\": false
    }")

# Check if update succeeded
if echo "$UPDATE_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    log "SUCCESS: Updated $RECORD_NAME from $OLD_IP to $CURRENT_IP"
else
    ERROR_MSG=$(echo "$UPDATE_RESPONSE" | jq -r '.errors[0].message')
    log "ERROR: Failed to update DNS: $ERROR_MSG"
    exit 1
fi
```

**Make executable and test:**
```bash
# Make script executable
sudo chmod +x /opt/homelab/scripts/cloudflare-ddns.sh

# Run manually to test
sudo /opt/homelab/scripts/cloudflare-ddns.sh

# Check the log
cat /var/log/homelab/ddns.log

# Expected output:
# 2024-01-15 14:30:00 - SUCCESS: Updated local.evindrake.net from 1.2.3.4 to 203.0.113.45
```

**Add to cron (runs every 5 minutes):**
```bash
# Edit crontab
sudo crontab -e

# Add this line at the bottom:
*/5 * * * * /opt/homelab/scripts/cloudflare-ddns.sh

# Save and exit (Ctrl+X, Y, Enter in nano)

# Verify cron entry
sudo crontab -l | grep ddns

# Expected output:
# */5 * * * * /opt/homelab/scripts/cloudflare-ddns.sh
```

---

##### Option C: Docker Compose (For Integration with Other Services)

Add DDNS to your existing compose stack:

**Create `docker-compose.ddns.yml`:**
```yaml
# /opt/homelab/docker-compose.ddns.yml
version: '3.8'

services:
  cloudflare-ddns:
    image: oznu/cloudflare-ddns:latest
    container_name: cloudflare-ddns
    restart: always
    environment:
      # Your Cloudflare API Token (from Step 1)
      - API_KEY=YOUR_CLOUDFLARE_API_TOKEN_HERE
      # Your domain zone
      - ZONE=evindrake.net
      # Subdomain to update (without zone)
      - SUBDOMAIN=local
      # Check interval (seconds)
      - INTERVAL=300
      # Use IPv4 only
      - IPV6=false
      # DNS only (not proxied)
      - PROXIED=false
    # Optional: resource limits
    deploy:
      resources:
        limits:
          memory: 64M
          cpus: '0.1'
```

**Run it:**
```bash
cd /opt/homelab
docker compose -f docker-compose.ddns.yml up -d

# Check status
docker compose -f docker-compose.ddns.yml logs -f

# Expected output:
# cloudflare-ddns  | DNS record local.evindrake.net (A) updated to 203.0.113.45
```

---

#### Step 6: Verify DDNS is Working

After setting up any method above, verify it's working:

**Check 1: Verify the DNS record updated:**
```bash
# Query DNS for your record
dig +short local.evindrake.net

# Expected output: Your current public IP
# 203.0.113.45

# Alternative using nslookup
nslookup local.evindrake.net

# Check what Cloudflare has
dig @1.1.1.1 +short local.evindrake.net
```

**Check 2: Compare to your actual public IP:**
```bash
# Get your current public IP
curl -s https://api.ipify.org

# This should match the dig output above
```

**Check 3: Check logs for updates:**
```bash
# For Docker container method
docker logs cloudflare-ddns --tail 20

# For bash script method
tail -20 /var/log/homelab/ddns.log

# For Docker Compose method
docker compose -f docker-compose.ddns.yml logs --tail 20
```

**Check 4: Force an update (for testing):**
```bash
# For Docker container
docker restart cloudflare-ddns

# For bash script
sudo /opt/homelab/scripts/cloudflare-ddns.sh

# For Docker Compose
docker compose -f docker-compose.ddns.yml restart
```

---

#### Step 7: Set Up Log Rotation (Optional but Recommended)

Prevent log files from growing forever:

```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/homelab-ddns
```

**Paste:**
```
/var/log/homelab/ddns.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
```

---

#### Troubleshooting DDNS

**Problem: "DNS record not found"**
- Make sure you created the A record in Cloudflare first (Step 3)
- Verify the RECORD_NAME matches exactly (including zone suffix)

**Problem: "Authentication error"**
- Verify your API token is correct (test with curl in Step 1)
- Make sure token has Zone:Read and DNS:Edit permissions
- Check token hasn't expired

**Problem: "Zone not found"**
- Verify your Zone ID is correct (Step 2)
- Make sure token has access to this zone

**Problem: IP not updating after change**
- Check cron is running: `sudo crontab -l`
- Check script has execute permission: `ls -la /opt/homelab/scripts/`
- Run script manually and check for errors

**Test API access manually:**
```bash
# Test listing DNS records
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" | jq '.result[] | {name: .name, type: .type, content: .content}'
```

---

#### Option 2: DuckDNS (Free & Simple Alternative)

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

If you set up DDNS and want direct access without Tailscale, you'll need to forward these ports on your router.

> **Recommendation:** We strongly recommend using Tailscale instead of port forwarding. It's more secure, easier to set up, and doesn't expose your home network. Only use port forwarding if you have a specific reason (e.g., Plex needs it for optimal streaming quality).

---

**Ports to Forward:**

| Service | External Port | Internal Port | Protocol | Notes |
|---------|---------------|---------------|----------|-------|
| Plex | 32400 | 32400 | TCP | Enables direct streaming |
| Home Assistant | 8123 | 8123 | TCP | Only if not using Nabu Casa |
| MinIO Console | 9001 | 9001 | TCP | Web management interface |
| MinIO API | 9000 | 9000 | TCP | S3 API endpoint |

---

**How to Set Up Port Forwarding (Step-by-Step):**

**Step 1: Find Your Router's Admin Page**
```bash
# On your Ubuntu host, find your router's IP (gateway)
ip route | grep default
# Example: default via 192.168.1.1 dev enp0s3

# Or on Windows
ipconfig | findstr "Gateway"
# Example: Default Gateway . . . : 192.168.1.1
```

Open a browser and go to: `http://192.168.1.1` (your gateway IP)

**Common router login pages:**
- `192.168.1.1` - Most routers (Netgear, Linksys, TP-Link)
- `192.168.0.1` - Some D-Link, Belkin
- `192.168.1.254` - AT&T, some BT routers
- `10.0.0.1` - Xfinity/Comcast, some Verizon

**Step 2: Log In to Your Router**
- Default username: `admin`
- Default password: `admin`, `password`, or printed on the router label
- If you've changed it and forgot, check the sticker on your router

**Step 3: Find Port Forwarding Settings**

The location varies by router brand:

| Router Brand | Menu Location |
|--------------|---------------|
| **Netgear** | Advanced → Advanced Setup → Port Forwarding |
| **Linksys** | Security → Apps and Gaming → Port Range Forwarding |
| **TP-Link** | Advanced → NAT Forwarding → Port Forwarding |
| **ASUS** | WAN → Virtual Server / Port Forwarding |
| **D-Link** | Advanced → Port Forwarding |
| **Xfinity/Comcast** | Connect → See Network → Advanced Settings → Port Forwarding |
| **Google WiFi** | Use Google Home app → WiFi → Settings → Port Management |
| **Eero** | eero app → Settings → Network Settings → Port Forwarding |

**Step 4: Add Port Forwarding Rules**

For each service, create a new rule with these settings:

**Example: Plex**
```
Service Name: Plex
External Port: 32400
Internal Port: 32400
Protocol: TCP
Internal IP: 192.168.1.50  (your Ubuntu host's local IP)
Enabled: Yes
```

**Find your Ubuntu host's local IP:**
```bash
# On your Ubuntu host
ip addr show | grep "inet " | grep -v 127.0.0.1
# Example: inet 192.168.1.50/24 ...
```

**Step 5: Set a Static IP for Your Ubuntu Host**

Port forwarding requires a consistent internal IP. Either:

**Option A: Reserve IP in Router (Recommended)**
1. Find "DHCP Reservation" or "Address Reservation" in your router
2. Add your Ubuntu host's MAC address with a permanent IP

```bash
# Get your MAC address
ip link show | grep ether
# Example: ether 00:1a:2b:3c:4d:5e brd ff:ff:ff:ff:ff:ff
```

**Option B: Set Static IP on Ubuntu**
```bash
# Edit netplan config
sudo nano /etc/netplan/01-netcfg.yaml
```

Example static IP configuration:
```yaml
network:
  version: 2
  ethernets:
    enp0s3:  # Your interface name (check with: ip link)
      dhcp4: no
      addresses:
        - 192.168.1.50/24
      routes:
        - to: default
          via: 192.168.1.1  # Your router IP
      nameservers:
        addresses:
          - 8.8.8.8
          - 1.1.1.1
```

```bash
# Apply changes
sudo netplan apply
```

**Step 6: Verify Port Forwarding**

After saving port forwarding rules:

```bash
# Test from outside your network (use your phone on cellular, not WiFi)
# Or use an online port checker

# Test Plex port
# Go to: https://www.yougetsignal.com/tools/open-ports/
# Enter your public IP and port 32400

# Find your public IP
curl -4 ifconfig.me
```

---

**Troubleshooting Port Forwarding:**

| Problem | Solution |
|---------|----------|
| Port shows as closed | 1. Verify internal IP is correct 2. Check Ubuntu firewall: `sudo ufw allow 32400/tcp` 3. Restart router |
| Works locally, not remotely | ISP may block port. Try a different external port (e.g., 32500 → 32400) |
| Double NAT detected | If you have ISP router + personal router, configure on BOTH or put ISP router in bridge mode |
| CGNAT (Carrier-Grade NAT) | See detailed section below |

```bash
# Check if you're behind CGNAT
curl -4 ifconfig.me
# Compare to WAN IP in router (if different, you're behind CGNAT)

# Check Ubuntu firewall
sudo ufw status
# If not listed, add: sudo ufw allow 32400/tcp
```

---

**What is CGNAT and How to Fix It:**

CGNAT (Carrier-Grade NAT) means your ISP shares one public IP among many customers. Port forwarding won't work because you don't have a unique public IP.

**How to check if you're behind CGNAT:**
```bash
# Get your public IP
curl -4 ifconfig.me
# Example result: 100.70.123.45

# Compare to router's WAN IP:
# Log into your router admin page
# Look for WAN IP or External IP
# Example: 10.45.67.89

# If they're DIFFERENT, you're behind CGNAT
# (Public IP starts with 100.64-100.127, 10.x.x.x, or similar private ranges)
```

**Solutions for CGNAT (in order of recommendation):**

**Solution 1: Use Tailscale (Easiest, Free)**
This is what we recommend throughout this guide. Tailscale creates a secure VPN mesh that works even behind CGNAT.
- No port forwarding needed
- More secure than exposing ports
- Works everywhere automatically
- See [Phase 2.3](#23-tailscale-setup-vpn-mesh) for setup

**Solution 2: Use Your Linode as a Reverse Proxy**
Route traffic through your Linode's public IP to reach your home services via Tailscale.
- Your Linode has a real public IP
- Home services accessed via `home.yourdomain.com` → Linode → Tailscale → Home
- See [Phase 5.12](#512-public-access-via-linode-reverse-proxy) for setup

**Solution 3: Request a Static/Public IP from Your ISP**
Some ISPs will give you a real public IP if you ask:
```
Call your ISP and say:
"I need a static public IP address for hosting services at home. 
I'm currently behind CGNAT and need port forwarding to work."

Typical responses:
- Business plan upgrade: $10-30/month extra
- One-time setup fee for static IP
- Some ISPs offer it free if you ask nicely
- Some ISPs flat-out refuse (find a new ISP)
```

**Solution 4: Use Cloudflare Tunnel (Free)**
Cloudflare Tunnel exposes your services through Cloudflare's network without port forwarding:
```bash
# Install cloudflared on your Ubuntu host
curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo | sudo tee /etc/yum.repos.d/cloudflared.repo
# Or for Ubuntu/Debian:
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Authenticate with Cloudflare
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create homelab

# Configure in ~/.cloudflared/config.yml
# tunnel: [your-tunnel-id]
# credentials-file: /root/.cloudflared/[tunnel-id].json
# ingress:
#   - hostname: plex.yourdomain.com
#     service: http://localhost:32400
#   - service: http_status:404

# Run the tunnel
cloudflared tunnel run homelab
```

**Solution 5: Switch to IPv6 (If Available)**
Some ISPs give you a real IPv6 address even with CGNAT on IPv4:
```bash
# Check if you have a public IPv6
curl -6 ifconfig.me
# If you get an address, you can use IPv6 for services

# Note: Not all clients support IPv6, so this isn't a complete solution
```

**Bottom Line:**
- **CGNAT detected?** → Use Tailscale or Linode reverse proxy (our recommended setup)
- **Must have port forwarding?** → Call ISP for static IP or use Cloudflare Tunnel
- **Don't fight CGNAT** → Tailscale is easier, more secure, and works everywhere

---

**Security Warning:**

Exposing services to the internet without Tailscale increases attack surface:
- Use strong, unique passwords for all services
- Keep software updated regularly
- Consider using fail2ban to block brute-force attempts
- Monitor logs for suspicious activity
- Only forward ports you actually need

---

## Phase 3: Cloud Deployment (Linode) - Complete Guide

**Time: 30-45 minutes**

This phase walks you through setting up your Linode cloud server with all prerequisites, security hardening, and verification steps.

---

### 3.1 SSH Into Your Linode

```bash
# Connect to your Linode (use the IP from Phase 1)
ssh root@YOUR_LINODE_IP

# If you get a host key warning on first connection, type 'yes'
# The authenticity of host 'xxx.xxx.xxx.xxx' can't be established...
# Are you sure you want to continue connecting (yes/no)? yes
```

---

### 3.2 Install Prerequisites

#### Step 1: Update System Packages

```bash
# Update package lists
apt update

# Upgrade existing packages (this may take a few minutes)
apt upgrade -y

# Verify you're on Ubuntu
cat /etc/os-release
# Should show: VERSION="25.10" or similar
```

#### Step 2: Install Essential Packages

```bash
# Install required system packages
apt install -y \
    curl \
    wget \
    git \
    jq \
    htop \
    nano \
    unzip \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    apt-transport-https

# Verify installations
git --version        # git version 2.x.x
curl --version       # curl 8.x.x
jq --version         # jq-1.6 or later
```

#### Step 3: Install Docker

```bash
# Download and run Docker's official install script
curl -fsSL https://get.docker.com | sh

# Verify Docker is installed and running
docker --version
# Expected: Docker version 27.x.x

docker compose version
# Expected: Docker Compose version v2.x.x

# Test Docker works
docker run --rm hello-world
# Should print: Hello from Docker!

# Enable Docker to start on boot
systemctl enable docker
systemctl status docker
# Should show: active (running)
```

---

### 3.3 Configure UFW Firewall (Security Hardening)

UFW (Uncomplicated Firewall) protects your server from unauthorized access.

#### Step 1: Check UFW Status

```bash
# Check if UFW is installed
which ufw
# Expected: /usr/sbin/ufw

# Check current status
ufw status
# Probably: Status: inactive
```

#### Step 2: Configure Firewall Rules

```bash
# Set default policies (deny incoming, allow outgoing)
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (CRITICAL - don't skip this or you'll lock yourself out!)
ufw allow ssh
# or explicitly:
ufw allow 22/tcp

# Allow HTTP and HTTPS for web traffic
ufw allow 80/tcp
ufw allow 443/tcp

# Allow Tailscale (if using)
ufw allow in on tailscale0

# View rules before enabling
ufw show added

# Expected output:
# Added user rules (see 'ufw status' for running firewall):
# ufw allow 22/tcp
# ufw allow 80/tcp
# ufw allow 443/tcp
```

#### Step 3: Enable UFW

```bash
# Enable the firewall
ufw enable
# Type 'y' when prompted:
# Command may disrupt existing ssh connections. Proceed with operation (y|n)? y

# Verify status
ufw status verbose

# Expected output:
# Status: active
# Logging: on (low)
# Default: deny (incoming), allow (outgoing)
# 
# To                         Action      From
# --                         ------      ----
# 22/tcp                     ALLOW IN    Anywhere
# 80/tcp                     ALLOW IN    Anywhere
# 443/tcp                    ALLOW IN    Anywhere
```

#### Step 4: Test SSH Still Works

```bash
# Open a NEW terminal window (don't close the current one!)
ssh root@YOUR_LINODE_IP

# If it works, you're good! Close the test terminal.
# If it fails, go back to your original session and:
# ufw disable
# Then troubleshoot the rules
```

---

### 3.4 Clone the Repository

```bash
# Create the homelab directory
mkdir -p /opt/homelab
cd /opt/homelab

# Clone your repository (replace with your actual repo URL)
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git

# Navigate into the project
cd HomeLabHub

# Verify files are present
ls -la
# Should show: docker-compose.yml, .env.example, Caddyfile, deploy/, etc.

# Check the structure
tree -L 2 -d
# or if tree isn't installed:
find . -maxdepth 2 -type d | head -20
```

---

### 3.5 Create and Configure Environment File

#### Step 1: Copy the Example File

```bash
# Copy example to actual .env
cp .env.example .env

# Set secure permissions (only root can read)
chmod 600 .env

# Verify permissions
ls -la .env
# Should show: -rw------- 1 root root ...
```

#### Step 2: Edit the Environment File

```bash
# Open the .env file for editing
nano .env
```

**Set these REQUIRED values:**

```bash
# ═══════════════════════════════════════════════════════════════════════════════
# REQUIRED - Set these before deploying
# ═══════════════════════════════════════════════════════════════════════════════

# --- Dashboard Authentication ---
WEB_USERNAME=admin                           # Your login username
WEB_PASSWORD=YourSecurePassword123!          # Use a strong password (16+ chars)

# --- AI Integration (from Phase 1) ---
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# --- Cross-Host Routing ---
# Your LOCAL Ubuntu host's Tailscale IP (from Phase 2.3)
LOCAL_TAILSCALE_IP=100.110.227.25

# --- Code Server ---
CODE_SERVER_PASSWORD=AnotherSecurePassword456!

# ═══════════════════════════════════════════════════════════════════════════════
# DISCORD - Leave blank now, add after Phase 4.1
# ═══════════════════════════════════════════════════════════════════════════════
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# ═══════════════════════════════════════════════════════════════════════════════
# AUTO-GENERATED - These will be set by bootstrap.sh
# Don't fill these manually - leave them as placeholders or empty
# ═══════════════════════════════════════════════════════════════════════════════
# POSTGRES_PASSWORD=      # Will be auto-generated
# REDIS_PASSWORD=         # Will be auto-generated
# JWT_SECRET=             # Will be auto-generated
```

**Save the file:**
- Press `Ctrl+X` to exit
- Press `Y` to confirm save
- Press `Enter` to confirm filename

---

### 3.6 Validate Environment Before Deployment

Before running bootstrap, verify your configuration:

```bash
# Check .env file is readable
cat .env | head -20

# Verify required variables are set (replace 'grep' values with your actual keys)
grep -E "^WEB_USERNAME=" .env       # Should show your username
grep -E "^WEB_PASSWORD=" .env       # Should show your password
grep -E "^OPENAI_API_KEY=" .env     # Should show sk-proj-...
grep -E "^LOCAL_TAILSCALE_IP=" .env # Should show 100.x.x.x

# Create a simple validation script
cat << 'EOF' > /opt/homelab/validate-env.sh
#!/bin/bash
# Validate required environment variables

source .env

ERRORS=0

check_var() {
    if [ -z "${!1}" ]; then
        echo "❌ Missing: $1"
        ((ERRORS++))
    else
        echo "✅ Set: $1"
    fi
}

echo "Checking required variables..."
echo "=============================="

check_var "WEB_USERNAME"
check_var "WEB_PASSWORD"
check_var "OPENAI_API_KEY"
check_var "LOCAL_TAILSCALE_IP"
check_var "CODE_SERVER_PASSWORD"

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✅ All required variables are set!"
    exit 0
else
    echo "❌ $ERRORS variable(s) missing. Please update .env"
    exit 1
fi
EOF

chmod +x /opt/homelab/validate-env.sh

# Run the validation
cd /opt/homelab/HomeLabHub
/opt/homelab/validate-env.sh
```

---

### 3.7 Run the Bootstrap Script

```bash
# Make the script executable
chmod +x deploy/scripts/bootstrap.sh

# Run with cloud role and auto-generate secrets
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets
```

**What bootstrap.sh does:**
1. Generates secure random passwords for PostgreSQL, Redis, JWT
2. Creates database initialization SQL
3. Validates Docker and Docker Compose are available
4. Pulls required Docker images
5. Starts all services with Docker Compose
6. Waits for services to become healthy

**Expected output:**
```
[INFO] Starting HomeLabHub bootstrap...
[INFO] Role: cloud
[INFO] Generating secure secrets...
[INFO] Generated POSTGRES_PASSWORD
[INFO] Generated REDIS_PASSWORD
[INFO] Generated JWT_SECRET
[INFO] Creating database init scripts...
[INFO] Starting Docker Compose...
[INFO] Waiting for services to be healthy...
[SUCCESS] All services started successfully!
```

---

### 3.8 Verify All Services Are Running

#### Step 1: Check Docker Containers

```bash
# List all running containers
docker compose ps

# Expected output (all should show "Up"):
# NAME                STATUS              PORTS
# caddy               Up                  0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
# homelab-postgres    Up (healthy)        5432/tcp
# homelab-redis       Up                  6379/tcp
# homelab-dashboard   Up                  
# discord-bot         Up                  
# stream-bot          Up                  
# n8n                 Up                  5678/tcp
# code-server         Up                  8080/tcp

# If any container is not "Up", check its logs:
docker compose logs container-name --tail=100
```

#### Step 2: Verify PostgreSQL Database

```bash
# Check database container health
docker compose exec homelab-postgres pg_isready -U homelab
# Expected: /var/run/postgresql:5432 - accepting connections

# Connect to database and verify tables exist
docker compose exec homelab-postgres psql -U homelab -d homelab_dashboard -c '\dt'

# Expected: List of tables (users, sessions, audit_logs, etc.)
# If you see "No relations found", the database may still be initializing

# Check database logs
docker compose logs homelab-postgres --tail=30
```

#### Step 2b: Validate and Create Service Database Roles

**All three services require their own database users.** Verify they exist:

```bash
# Check which roles exist
docker compose exec homelab-postgres psql -U postgres -c '\du'
```

**Required roles (you should see all 4):**
```
             List of roles
 Role name |  Attributes
-----------+---------------
 homelab   | Superuser, Create role, Create DB
 jarvis    |
 postgres  | Superuser, Create role, Create DB, Replication, Bypass RLS
 streambot |
 ticketbot |
```

**If any role is MISSING, create them now:**

```bash
# Load your .env file to get the passwords
source .env

# Create missing roles and databases
docker exec -i homelab-postgres psql -U postgres << 'ENDSQL'
-- Create jarvis user and database (if missing)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
        CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
    END IF;
END
$$;
CREATE DATABASE IF NOT EXISTS homelab_jarvis OWNER jarvis;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;

-- Create streambot user and database (if missing)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
        CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
    END IF;
END
$$;
CREATE DATABASE IF NOT EXISTS streambot OWNER streambot;
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;

-- Create ticketbot user and database (if missing)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ticketbot') THEN
        CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
    END IF;
END
$$;
CREATE DATABASE IF NOT EXISTS ticketbot OWNER ticketbot;
GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;

-- Verify
\du
\l
ENDSQL
```

**Simpler alternative - use direct SQL if roles don't exist:**

```bash
# Load passwords
source .env

# Create roles (these commands are safe - they'll error if role exists, which is fine)
docker exec -i homelab-postgres psql -U postgres << EOF
CREATE USER jarvis WITH PASSWORD '$JARVIS_DB_PASSWORD';
CREATE DATABASE homelab_jarvis OWNER jarvis;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;

CREATE USER streambot WITH PASSWORD '$STREAMBOT_DB_PASSWORD';
CREATE DATABASE streambot OWNER streambot;
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;

CREATE USER ticketbot WITH PASSWORD '$DISCORD_DB_PASSWORD';
CREATE DATABASE ticketbot OWNER ticketbot;
GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
EOF

# Verify all roles exist now
docker compose exec homelab-postgres psql -U postgres -c '\du'
docker compose exec homelab-postgres psql -U postgres -c '\l'
```

**Expected output after role creation:**
```
CREATE ROLE
CREATE DATABASE
GRANT
(repeated for each user)

             List of roles
 Role name |  Attributes
-----------+---------------
 homelab   | Superuser, Create role, Create DB
 jarvis    |
 postgres  | Superuser, Create role, Create DB, Replication, Bypass RLS
 streambot |
 ticketbot |
```

**After creating roles, restart the dependent services:**
```bash
docker compose up -d --force-recreate homelab-dashboard homelab-celery-worker discord-bot stream-bot

# Wait for services to start
sleep 30

# Verify all are running (not restarting)
docker compose ps
```

> **STOP:** Do not proceed until `docker compose ps` shows all services as "Up" (not "Restarting").

---

#### Step 3: Verify Redis

```bash
# Check Redis is responding
docker compose exec homelab-redis redis-cli ping
# Expected: PONG

# Check Redis info
docker compose exec homelab-redis redis-cli info server | head -10
```

#### Step 4: Check for Errors

```bash
# View combined logs from all services (last 100 lines)
docker compose logs --tail=100

# Check for specific error patterns
docker compose logs 2>&1 | grep -i error | tail -20
docker compose logs 2>&1 | grep -i failed | tail -20

# Watch logs in real-time (Ctrl+C to stop)
docker compose logs -f
```

---

### 3.9 SSL/TLS Certificates (Complete Guide)

Caddy automatically provisions and renews SSL certificates from Let's Encrypt. This section covers how it works, verification, and troubleshooting.

---

#### How Caddy SSL Works

1. **Automatic Provisioning:** When Caddy starts and sees HTTPS domains in the Caddyfile, it automatically requests certificates from Let's Encrypt
2. **HTTP-01 Challenge:** Let's Encrypt verifies domain ownership by making an HTTP request to `http://yourdomain.com/.well-known/acme-challenge/`
3. **Auto-Renewal:** Caddy automatically renews certificates 30 days before expiry
4. **No Configuration Needed:** Just use `https://` in your Caddyfile and Caddy handles everything

---

#### Prerequisites for SSL to Work

Before SSL can succeed, verify these requirements:

| Requirement | Check Command | Expected |
|-------------|---------------|----------|
| DNS resolves to your IP | `dig +short dash.evindrake.net` | Your Linode IP |
| Port 80 is open | `nc -zv YOUR_LINODE_IP 80` | Connection succeeded |
| Port 443 is open | `nc -zv YOUR_LINODE_IP 443` | Connection succeeded |
| Caddy container running | `docker compose ps caddy` | Status: Up |
| Valid email in Caddyfile | Check Caddyfile | Email set (optional) |

**Important: DNS Propagation**
- New DNS records can take 5-15 minutes to propagate worldwide
- Let's Encrypt needs to reach your server from multiple locations
- Use [dnschecker.org](https://dnschecker.org) to verify propagation

---

#### Check Certificate Status

```bash
# View Caddy logs for certificate activity
docker compose logs caddy --tail=100 | grep -i cert

# Look for success messages like:
# "certificate obtained successfully"
# "successfully obtained certificate"
# "serving initial certificate"

# Look for error messages like:
# "failed to obtain certificate"
# "challenge failed"
# "ACME challenge failed"

# Full Caddy logs
docker compose logs caddy --tail=100
```

**Test HTTPS is Working:**
```bash
# Simple test (after 5 minutes)
curl -I https://dash.evindrake.net

# Expected response:
# HTTP/2 200
# or HTTP/2 302 (redirect)

# Check certificate details
echo | openssl s_client -connect dash.evindrake.net:443 2>/dev/null | openssl x509 -noout -dates

# Expected output:
# notBefore=Jan 15 00:00:00 2024 GMT
# notAfter=Apr 14 23:59:59 2024 GMT

# View full certificate info
echo | openssl s_client -connect dash.evindrake.net:443 2>/dev/null | openssl x509 -noout -text | head -20
```

---

#### Force Certificate Renewal

Certificates are renewed automatically, but you can force renewal:

```bash
# Method 1: Restart Caddy (triggers certificate check)
docker compose restart caddy

# Wait 30 seconds, then check logs
docker compose logs caddy --tail=50 | grep -i cert

# Method 2: Clear certificate cache and restart
# WARNING: This forces re-issuance of ALL certificates
docker compose exec caddy rm -rf /data/caddy/certificates
docker compose restart caddy

# Method 3: Use Caddy's reload command
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

#### SSL Troubleshooting

**Problem: "Certificate has expired" or "NET::ERR_CERT_DATE_INVALID"**
```bash
# Check certificate dates
echo | openssl s_client -connect dash.evindrake.net:443 2>/dev/null | openssl x509 -noout -dates

# Force renewal
docker compose restart caddy

# If still failing, clear cache
docker compose exec caddy rm -rf /data/caddy/certificates
docker compose restart caddy
```

**Problem: "ACME challenge failed" in logs**
```bash
# Verify DNS is resolving correctly
dig +short dash.evindrake.net
# Must return YOUR_LINODE_IP

# Verify port 80 is accessible from outside
# Use external tool: https://www.yougetsignal.com/tools/open-ports/
# Check port 80 on your Linode IP

# Check firewall
ufw status
# Ports 80 and 443 must be ALLOW

# Check Caddy can bind to ports
docker compose logs caddy | grep -i "bind\|listen\|port"
```

**Problem: "Too many certificates already issued"**
Let's Encrypt has rate limits: 5 duplicate certificates per week

```bash
# Wait 1 week before retrying, or
# Use Let's Encrypt staging for testing:
# Add to Caddyfile:
# {
#   acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
# }
```

**Problem: Certificate works but shows wrong domain**
```bash
# Check Caddyfile has correct domains
cat Caddyfile | grep -E "^\w.*\.(com|net|org)"

# Reload Caddy config
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

#### Certificate Rate Limits

Let's Encrypt has rate limits to prevent abuse:

| Limit | Value | Applies To |
|-------|-------|------------|
| Certificates per domain | 50/week | Example: *.evindrake.net |
| Duplicate certificates | 5/week | Same set of domains |
| Failed validations | 5/hour | Per account |
| New registrations | 500/3 hours | New accounts |

**Best Practices:**
- Don't repeatedly restart Caddy while debugging DNS issues
- Use staging environment for testing: `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory`
- Fix DNS/firewall issues before retrying

---

#### View All Certificates

```bash
# List all certificates Caddy has obtained
docker compose exec caddy ls -la /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/

# Check a specific certificate
docker compose exec caddy cat /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/dash.evindrake.net/dash.evindrake.net.crt | openssl x509 -noout -text | head -30

# Certificate storage location
# /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/
#   └── domain.com/
#       ├── domain.com.crt  (certificate)
#       ├── domain.com.key  (private key)
#       └── domain.com.json (metadata)
```

---

#### Optional: Set Admin Email for Certificate Notifications

Let's Encrypt can email you before certificates expire:

```caddyfile
# In your Caddyfile, add at the top:
{
    email your-email@example.com
}

dash.evindrake.net {
    # ... your config
}
```

```bash
# Reload Caddy to apply
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

### 3.10 Test Web Access

**After 5-10 minutes (for SSL certificates):**

| Service | URL | Expected |
|---------|-----|----------|
| Dashboard | https://dash.evindrake.net | Login page |
| Code Server | https://code.evindrake.net | Password prompt |
| n8n | https://n8n.evindrake.net | n8n login |

**Test from command line:**
```bash
# Test dashboard (should return HTML)
curl -s https://dash.evindrake.net | head -20

# Test with headers
curl -I https://dash.evindrake.net

# Expected response headers:
# HTTP/2 200
# content-type: text/html; charset=utf-8
```

**Common issues:**

| Problem | Cause | Solution |
|---------|-------|----------|
| Connection refused | Container not running | `docker compose up -d` |
| Certificate error | DNS not propagated | Wait 15 min, check `dig` |
| 502 Bad Gateway | Backend not ready | Check backend container logs |
| 404 Not Found | Wrong Caddyfile config | Verify Caddyfile domains |

---

### 3.11 Useful Commands Reference

```bash
# --- Container Management ---
docker compose ps                    # Show container status
docker compose up -d                 # Start all services
docker compose down                  # Stop all services
docker compose restart               # Restart all services
docker compose restart service-name  # Restart one service

# --- Logs ---
docker compose logs -f               # Follow all logs
docker compose logs service-name     # View specific service logs
docker compose logs --tail=100       # Last 100 lines

# --- Database ---
docker compose exec homelab-postgres psql -U homelab -d homelab_dashboard

# --- Shell Access ---
docker compose exec service-name bash  # Get shell in container
docker compose exec service-name sh    # If bash not available

# --- Updates ---
git pull                             # Pull latest code
docker compose pull                  # Pull latest images
docker compose up -d --force-recreate  # Recreate containers
```

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

#### Step 1: Create Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown (top-left) → **New Project**
3. Name it: `HomeLabHub`
4. Click **Create** and wait for it to finish
5. Make sure it's selected in the dropdown

#### Step 2: Enable Required APIs

1. Go to **APIs & Services** → **Library** (left sidebar)
2. Search for and **Enable** each of these:
   - `YouTube Data API v3` - Click it → Click **Enable**
   - `Google Calendar API` - Click it → Click **Enable**
   - `Gmail API` - Click it → Click **Enable**

#### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** → Click **Create**
3. Fill in the form:
   - **App name:** `HomeLabHub`
   - **User support email:** Your email
   - **Developer contact email:** Your email
4. Click **Save and Continue**
5. **Scopes screen:** Click **Add or Remove Scopes**
   - Search and check these:
     - `https://www.googleapis.com/auth/youtube.readonly`
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/gmail.readonly`
   - Click **Update** → **Save and Continue**
6. **Test users:** Click **Add Users**
   - Add your Google email address (the one you'll authorize with)
   - Click **Save and Continue**
7. Click **Back to Dashboard**

#### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `HomeLabHub`
5. **Authorized redirect URIs** - Click **Add URI** for each:
   ```
   https://stream.rig-city.com/api/auth/youtube/callback
   https://dash.evindrake.net/api/google/callback
   http://localhost:3000/callback
   ```
   *(The localhost one is for generating tokens locally)*
6. Click **Create**
7. **COPY IMMEDIATELY:**
   - **Client ID:** `xxxxxxxxxxxx.apps.googleusercontent.com`
   - **Client Secret:** `GOCSPX-xxxxxxxxxxxx`

**Add to .env:**
```bash
YOUTUBE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
```

---

#### Step 5: Generate YouTube Refresh Token (REQUIRED for API access)

The refresh token allows your app to access YouTube without you logging in every time. You only need to do this once.

**Option A: Use the OAuth Playground (Easiest)**

1. Go to [Google OAuth Playground](https://developers.google.com/oauthplayground/)
2. Click the **gear icon** (top right) → Check **Use your own OAuth credentials**
3. Enter:
   - **OAuth Client ID:** Your client ID from Step 4
   - **OAuth Client Secret:** Your client secret from Step 4
4. In the left panel, find **YouTube Data API v3**
5. Check: `https://www.googleapis.com/auth/youtube.readonly`
6. Click **Authorize APIs** (blue button)
7. Sign in with your Google account → Click **Allow**
8. You'll be redirected back with an **Authorization Code**
9. Click **Exchange authorization code for tokens**
10. **COPY THE REFRESH TOKEN** - it looks like: `1//0gxxxxxxxxxxxxxxxxxxxxxxxxxx`

**Add to .env:**
```bash
YOUTUBE_REFRESH_TOKEN=1//0gxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Option B: Use a Local Script**

If OAuth Playground doesn't work, run this on your local machine:

```bash
# Create a temporary script
cat > /tmp/get_google_token.py << 'EOF'
#!/usr/bin/env python3
"""
Google OAuth Token Generator
Run this locally to get refresh tokens for YouTube/Calendar/Gmail
"""
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
import urllib.parse
import json

# Replace these with your credentials
CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com"
CLIENT_SECRET = "GOCSPX-YOUR_SECRET"

# Scopes for YouTube (add more as needed)
SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
]

REDIRECT_URI = "http://localhost:3000/callback"
auth_code = None

class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        query = parse_qs(urlparse(self.path).query)
        if 'code' in query:
            auth_code = query['code'][0]
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"<h1>Success! You can close this window.</h1>")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Error: No code received")
    def log_message(self, format, *args):
        pass

def main():
    global auth_code
    
    # Build authorization URL
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={CLIENT_ID}&"
        f"redirect_uri={urllib.parse.quote(REDIRECT_URI)}&"
        "response_type=code&"
        f"scope={urllib.parse.quote(' '.join(SCOPES))}&"
        "access_type=offline&"
        "prompt=consent"
    )
    
    print("\n=== Google OAuth Token Generator ===\n")
    print("Opening browser for authorization...")
    print(f"If browser doesn't open, visit:\n{auth_url}\n")
    
    # Start local server
    server = HTTPServer(('localhost', 3000), CallbackHandler)
    webbrowser.open(auth_url)
    
    print("Waiting for callback...")
    while auth_code is None:
        server.handle_request()
    
    # Exchange code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    data = urllib.parse.urlencode({
        'code': auth_code,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'redirect_uri': REDIRECT_URI,
        'grant_type': 'authorization_code'
    }).encode()
    
    req = urllib.request.Request(token_url, data=data, method='POST')
    with urllib.request.urlopen(req) as resp:
        tokens = json.loads(resp.read().decode())
    
    print("\n" + "="*50)
    print("SUCCESS! Add these to your .env file:")
    print("="*50)
    print(f"\nYOUTUBE_REFRESH_TOKEN={tokens.get('refresh_token', 'NOT RETURNED')}")
    if 'access_token' in tokens:
        print(f"\n# Access token (expires in {tokens.get('expires_in', '?')} seconds):")
        print(f"# {tokens['access_token'][:50]}...")
    print("\n" + "="*50)

if __name__ == "__main__":
    main()
EOF

# Edit the script with your credentials, then run:
# python3 /tmp/get_google_token.py
```

**Troubleshooting:**
- **"Access blocked" error:** Make sure you added yourself as a test user in Step 3.6
- **"Invalid redirect URI":** Ensure `http://localhost:3000/callback` is in your authorized URIs
- **No refresh token returned:** You must include `prompt=consent` and `access_type=offline` in the auth URL (the script does this)

---

### 4.4 Spotify (Optional - for Now Playing)

#### Step 1: Create Spotify Developer App

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **Create App**
4. Fill in the form:
   - **App name:** `HomeLabHub Stream Bot`
   - **App description:** `Now playing integration for stream bot`
   - **Website:** `https://stream.rig-city.com` (or your domain)
   - **Redirect URI:** Click **Add** and enter:
     ```
     https://stream.rig-city.com/api/auth/spotify/callback
     http://localhost:3000/callback
     ```
   - **APIs used:** Check **Web API**
5. Check the box to agree to Terms of Service
6. Click **Save**

#### Step 2: Get Client Credentials

1. On your app's dashboard, click **Settings**
2. Copy the **Client ID** (visible immediately)
3. Click **View client secret** → Copy the **Client Secret**

**Add to .env:**
```bash
SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

#### Step 3: Generate Spotify Refresh Token (REQUIRED for API access)

**Option A: Use the Web Authorization Flow (Easiest)**

1. **Build your authorization URL:**
   
   Replace `YOUR_CLIENT_ID` with your actual Client ID:
   ```
   https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost:3000/callback&scope=user-read-currently-playing%20user-read-playback-state
   ```

2. **Paste that URL in your browser**

3. **Log in to Spotify and click "Agree"**

4. **You'll be redirected to a URL like:**
   ```
   http://localhost:3000/callback?code=AQBxxxxxxxxxxxxxxxxxxxxxxx
   ```
   *(Your browser will show an error - that's fine, we just need the code)*

5. **Copy the code** from the URL (everything after `code=`)

6. **Exchange the code for tokens** - Run this in your terminal:
   ```bash
   # Replace these values:
   CODE="AQBxxxxxxxxxxxxxxxxxxxxxxx"
   CLIENT_ID="your_client_id"
   CLIENT_SECRET="your_client_secret"
   
   curl -X POST "https://accounts.spotify.com/api/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code" \
     -d "code=$CODE" \
     -d "redirect_uri=http://localhost:3000/callback" \
     -d "client_id=$CLIENT_ID" \
     -d "client_secret=$CLIENT_SECRET"
   ```

7. **You'll get a JSON response like:**
   ```json
   {
     "access_token": "BQDxxxxxxxxxx...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "refresh_token": "AQBxxxxxxxxxx...",
     "scope": "user-read-currently-playing user-read-playback-state"
   }
   ```

8. **Copy the `refresh_token` value** (starts with `AQB...`)

**Add to .env:**
```bash
SPOTIFY_REFRESH_TOKEN=AQBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

**Option B: Use a Python Script**

If the manual method is confusing, use this script:

```bash
cat > /tmp/get_spotify_token.py << 'EOF'
#!/usr/bin/env python3
"""
Spotify OAuth Token Generator
Run this locally to get your refresh token
"""
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
import urllib.parse
import json
import base64

# Replace these with your credentials
CLIENT_ID = "YOUR_SPOTIFY_CLIENT_ID"
CLIENT_SECRET = "YOUR_SPOTIFY_CLIENT_SECRET"

SCOPES = "user-read-currently-playing user-read-playback-state"
REDIRECT_URI = "http://localhost:3000/callback"
auth_code = None

class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        query = parse_qs(urlparse(self.path).query)
        if 'code' in query:
            auth_code = query['code'][0]
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"<h1>Success! Check your terminal for the refresh token.</h1>")
        else:
            self.send_response(400)
            self.end_headers()
            error = query.get('error', ['Unknown'])[0]
            self.wfile.write(f"Error: {error}".encode())
    def log_message(self, format, *args):
        pass

def main():
    global auth_code
    
    auth_url = (
        "https://accounts.spotify.com/authorize?"
        f"client_id={CLIENT_ID}&"
        "response_type=code&"
        f"redirect_uri={urllib.parse.quote(REDIRECT_URI)}&"
        f"scope={urllib.parse.quote(SCOPES)}"
    )
    
    print("\n=== Spotify OAuth Token Generator ===\n")
    print("Opening browser for authorization...")
    print(f"If browser doesn't open, visit:\n{auth_url}\n")
    
    server = HTTPServer(('localhost', 3000), CallbackHandler)
    webbrowser.open(auth_url)
    
    print("Waiting for authorization...")
    while auth_code is None:
        server.handle_request()
    
    # Exchange code for tokens
    token_url = "https://accounts.spotify.com/api/token"
    auth_header = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    
    data = urllib.parse.urlencode({
        'grant_type': 'authorization_code',
        'code': auth_code,
        'redirect_uri': REDIRECT_URI
    }).encode()
    
    req = urllib.request.Request(token_url, data=data, method='POST')
    req.add_header('Authorization', f'Basic {auth_header}')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    
    with urllib.request.urlopen(req) as resp:
        tokens = json.loads(resp.read().decode())
    
    print("\n" + "="*60)
    print("SUCCESS! Add this to your .env file:")
    print("="*60)
    print(f"\nSPOTIFY_REFRESH_TOKEN={tokens.get('refresh_token', 'NOT RETURNED')}")
    print("\n" + "="*60)

if __name__ == "__main__":
    main()
EOF

# Edit CLIENT_ID and CLIENT_SECRET, then run:
# python3 /tmp/get_spotify_token.py
```

---

#### Spotify Scopes Reference

If you need additional Spotify features, add these scopes when generating your token:

| Scope | What it allows |
|-------|----------------|
| `user-read-currently-playing` | See what's playing now |
| `user-read-playback-state` | See playback state (shuffle, repeat, etc.) |
| `user-read-recently-played` | See recently played tracks |
| `playlist-read-private` | Read private playlists |
| `user-library-read` | Read saved tracks/albums |

**Troubleshooting:**
- **"INVALID_CLIENT" error:** Double-check your Client ID and Secret
- **"Invalid redirect URI":** Make sure `http://localhost:3000/callback` is in your app's redirect URIs
- **No refresh token:** Make sure you're using `grant_type=authorization_code` (not client_credentials)

---

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

#### Install GPU Drivers (CRITICAL - Do This First!)

1. **Open Device Manager** in Windows VM (right-click Start → Device Manager)
2. You should see "Microsoft Basic Display Adapter" under Display adapters
3. Download NVIDIA drivers from [nvidia.com/drivers](https://www.nvidia.com/Download/index.aspx)
   - Select: GeForce RTX 3060, Windows 11 64-bit, Game Ready Driver
4. Run installer → Express Installation
5. **Restart the VM**
6. After restart, verify in Device Manager:
   - Display adapters should now show "NVIDIA GeForce RTX 3060"
   - NOT "Microsoft Basic Display Adapter"

**If you still see "Microsoft Basic Display Adapter":**
- The GPU passthrough may not be working
- Check VM settings: View → Details → PCI Host Devices should show your GPU
- Verify GPU is bound to vfio-pci on host: `lspci -nnk -s 03:00`

#### Install Sunshine WITH Virtual Display Driver

**This is critical for headless VMs without a physical monitor:**

1. Download latest release from [github.com/LizardByte/Sunshine/releases](https://github.com/LizardByte/Sunshine/releases)
   - Get the `.exe` installer (e.g., `sunshine-windows-installer.exe`)

2. **Run installer as Administrator:**
   - Right-click → Run as administrator
   - Allow firewall prompts
   - **IMPORTANT: Check "Install Sunshine Virtual Display Driver"** ← Don't skip this!
   - Complete installation

3. **Restart Windows VM** after installation

#### Step 3: Install Virtual Display Driver (Required for Headless VMs)

**Your VM has no physical monitor. Windows needs a virtual display for Sunshine to capture.**

This is NOT optional. Without a display, Sunshine will fail with:
```
Currently available display devices: []
Failed to locate an output device
Unable to find display or encoder during startup
```

**Install IddSampleDriver (Virtual Display):**

1. **Download IddSampleDriver:**
   - In your Windows VM, open Edge browser
   - Go to: `https://github.com/roshkins/IddSampleDriver/releases`
   - Download the latest `IddSampleDriver-x64-Release.zip`

2. **Extract and install:**
   ```
   - Right-click the downloaded zip → Extract All
   - Open the extracted folder
   - Right-click installCert.bat → Run as administrator
   - When prompted, click Yes to install the certificate
   - Right-click install.bat → Run as administrator
   - Wait for "Driver installed successfully" message
   ```

3. **Restart Windows VM:**
   ```powershell
   shutdown /r /t 0
   ```

4. **Verify virtual display is active:**
   - After restart, right-click desktop → Display Settings
   - You should see "Display 1" listed (even without physical monitor)
   - If you see "No display connected", the driver didn't install correctly

5. **Configure resolution:**
   - In Display Settings, set resolution to **1920x1080** or **2560x1440**
   - Set refresh rate to **60Hz** (or 120Hz if supported)

**After IddSampleDriver is installed, restart Sunshine:**

1. Open Windows Services (Win+R → services.msc)
2. Find "Sunshine" service
3. Right-click → Restart

Or restart via PowerShell:
```powershell
Restart-Service Sunshine
```

---

#### Step 4: Verify Sunshine is Working

**Check Sunshine logs for success:**

1. **Check Sunshine logs:**
   - Open Sunshine web UI → Logs
   - Look for: `Currently available display devices: [Your Display]`
   - Should NOT show `[]` anymore

2. **Check Windows Display Settings:**
   - Right-click desktop → Display Settings
   - You should see at least one display listed

3. **Test encoder:**
   - In Sunshine logs, look for: `Encoder [nvenc] succeeded`
   - NOT `Encoder [nvenc] failed`

4. Open browser to `https://localhost:47990`
   - Create admin username and password
   - **Save these credentials!**

5. Configure settings:
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

### 5.6 Docker Services on Ubuntu Host (Complete Guide)

This section sets up Plex, Home Assistant, and MinIO on your local Ubuntu host.

---

#### Step 1: Install Docker on Ubuntu Host

If Docker isn't installed yet:

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install prerequisites
sudo apt install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Install Docker using official script
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group (avoids needing sudo)
sudo usermod -aG docker $USER

# IMPORTANT: Log out and back in for group changes to take effect
# Or run this command to apply immediately:
newgrp docker
```

---

**Verify Docker Installation (DO NOT SKIP):**

```bash
# Check Docker version is installed
docker --version
# Expected: Docker version 27.x.x (or similar)
# If you see "command not found", the installation failed

docker compose version
# Expected: Docker Compose version v2.x.x
# If you see "command not found", reinstall Docker

# Enable Docker to start on boot
sudo systemctl enable docker

# Start the Docker service
sudo systemctl start docker

# CRITICAL: Verify Docker daemon is running
sudo systemctl status docker
```

**What to look for in status output:**
```
● docker.service - Docker Application Container Engine
     Loaded: loaded (/lib/systemd/system/docker.service; enabled)
     Active: active (running) since [date/time]    <-- MUST say "active (running)"
```

**If Docker is NOT running (shows "inactive" or "failed"):**
```bash
# Check what went wrong
sudo journalctl -u docker --no-pager | tail -50

# Common fixes:
# 1. Restart Docker
sudo systemctl restart docker

# 2. Check for conflicting software
sudo apt remove docker-desktop  # If desktop version conflicts

# 3. Reinstall Docker
sudo apt purge docker-ce docker-ce-cli containerd.io
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
sudo systemctl start docker
```

**Final test - Docker must work before proceeding:**
```bash
# Run hello-world test container
docker run --rm hello-world

# Expected output includes:
# "Hello from Docker!"
# "This message shows that your installation appears to be working correctly."

# If you see permission errors:
# "permission denied while trying to connect to the Docker daemon"
# Run: newgrp docker (or log out and back in)
```

> **STOP:** Do not proceed to the next step until `docker run --rm hello-world` works without errors.

---

#### Step 2: Create Directory Structure

```bash
# Create all required directories
sudo mkdir -p /opt/homelab/plex/config
sudo mkdir -p /opt/homelab/plex/transcode
sudo mkdir -p /opt/homelab/homeassistant/config
sudo mkdir -p /opt/homelab/minio/data

# Set ownership to your user
sudo chown -R $USER:$USER /opt/homelab

# Verify permissions
ls -la /opt/homelab/
# All directories should be owned by your user

# Get your user/group IDs (needed for Plex)
id
# Example: uid=1000(evin) gid=1000(evin)
# Note the uid and gid values
```

---

#### Step 3: Set Up Media Storage for Plex

```bash
# Create a media directory (or use an existing drive mount)
sudo mkdir -p /mnt/media/{movies,tv,music}
sudo chown -R $USER:$USER /mnt/media

# If you have a separate drive for media, mount it:
# Example for an external drive:
# sudo mount /dev/sdb1 /mnt/media

# To make the mount permanent, add to /etc/fstab:
# sudo nano /etc/fstab
# Add: /dev/sdb1 /mnt/media ext4 defaults 0 2
```

---

#### Step 3b: Port Conflict Check (DO NOT SKIP)

**Before starting any containers, verify no services are already using the required ports.**

Local services need these ports:
| Service | Port | Purpose |
|---------|------|---------|
| Plex | 32400 | Media streaming |
| Home Assistant | 8123 | Web UI |
| MinIO | 9000 | S3 API |
| MinIO | 9001 | Web Console |

**Run this port check:**

```bash
# Check ALL required ports at once
echo "Checking ports for local services..."

check_port() {
    if ss -tuln | grep -q ":$1 "; then
        echo "❌ Port $1 is IN USE"
        ss -tuln | grep ":$1 " | head -1
        return 1
    else
        echo "✅ Port $1 is available"
        return 0
    fi
}

check_port 32400  # Plex
check_port 8123   # Home Assistant
check_port 9000   # MinIO S3
check_port 9001   # MinIO Console
```

**If any port shows "IN USE":**

```bash
# Find what's using the port (example: port 9000)
sudo lsof -i :9000
# or
sudo netstat -tlnp | grep :9000

# Common conflicts and solutions:

# 1. Old Docker containers from previous attempts
docker ps -a --format "{{.Names}} {{.Ports}}" | grep 9000
docker rm -f container_name_here

# 2. Portainer or other tools using port 9000
# Option A: Stop the conflicting service
sudo systemctl stop portainer

# Option B: Change MinIO to different ports (edit docker-compose.local.yml)
# Change: "9000:9000" to "9002:9000"
# Change: "9001:9001" to "9003:9001"
# Then access MinIO at: http://localhost:9002 and http://localhost:9003

# 3. Home Assistant running natively (not in Docker)
sudo systemctl stop home-assistant@homeassistant
sudo systemctl disable home-assistant@homeassistant
```

**Handling existing containers from previous attempts:**

```bash
# Remove ALL homelab-related containers (safe - no data loss, configs are in volumes)
docker rm -f homeassistant plex minio 2>/dev/null

# Remove any orphaned containers
docker container prune -f

# Verify ports are now free
ss -tuln | grep -E ':32400|:8123|:9000|:9001'
# (should show nothing if all ports are free)
```

> **STOP:** Do not proceed until ALL ports show "available". Running docker-compose with port conflicts will fail.

---

#### Step 4: Create Docker Compose Configuration

```bash
# Create the compose file
nano /opt/homelab/docker-compose.local.yml
```

**Paste this configuration:**
```yaml
# /opt/homelab/docker-compose.local.yml
# Local services: Plex, Home Assistant, MinIO

version: '3.8'

services:
  # ============================================
  # PLEX MEDIA SERVER
  # ============================================
  plex:
    image: lscr.io/linuxserver/plex:latest
    container_name: plex
    network_mode: host  # Required for DLNA discovery and remote access
    environment:
      - PUID=1000              # Your user ID (from 'id' command)
      - PGID=1000              # Your group ID
      - TZ=America/New_York    # Your timezone
      - VERSION=docker         # Use Docker version updates
      - PLEX_CLAIM=${PLEX_CLAIM}  # From plex.tv/claim
    volumes:
      - /opt/homelab/plex/config:/config
      - /opt/homelab/plex/transcode:/transcode  # For temporary transcodes
      - /mnt/media:/data/media:ro  # Read-only media (adjust path!)
    devices:
      - /dev/dri:/dev/dri      # Hardware transcoding (Intel QSV, AMD)
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:32400/web"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============================================
  # HOME ASSISTANT
  # ============================================
  homeassistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    container_name: homeassistant
    network_mode: host  # Required for device/service discovery
    environment:
      - TZ=America/New_York
    volumes:
      - /opt/homelab/homeassistant/config:/config
      - /run/dbus:/run/dbus:ro  # Required for Bluetooth support
    privileged: true  # Required for USB devices, Bluetooth, etc.
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8123"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============================================
  # MINIO (S3-Compatible Object Storage)
  # ============================================
  minio:
    image: quay.io/minio/minio:latest
    container_name: minio
    ports:
      - "9000:9000"    # S3 API
      - "9001:9001"    # Web Console
    environment:
      - MINIO_ROOT_USER=${MINIO_ROOT_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
    volumes:
      - /opt/homelab/minio/data:/data
    command: server /data --console-address ":9001"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

#### Step 5: Create Environment Variables

```bash
# Create the .env file
nano /opt/homelab/.env
```

**Paste (and edit) these values:**
```env
# ═══════════════════════════════════════════════════════════════════════════════
# LOCAL UBUNTU HOST ENVIRONMENT VARIABLES
# ═══════════════════════════════════════════════════════════════════════════════

# --- PLEX ---
# CRITICAL: Get a fresh claim token from https://plex.tv/claim
# The token expires in 4 MINUTES! Get it right before starting Plex.
# After first login, you can remove this line (it's only needed once)
PLEX_CLAIM=claim-XXXXXXXXXXXXXXXX

# --- MINIO ---
# Choose a strong username and password
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=YourSecureMinIOPassword123!

# --- TIMEZONE ---
TZ=America/New_York
```

**Get Plex Claim Token:**
1. Go to [plex.tv/claim](https://plex.tv/claim)
2. Log in to your Plex account
3. Copy the `claim-xxxx...` token
4. **IMMEDIATELY** paste it into `.env` and start Plex (it expires in 4 minutes!)

---

#### Step 6: Start the Services

```bash
cd /opt/homelab

# Pull the latest images
docker compose -f docker-compose.local.yml pull

# Start all services
docker compose -f docker-compose.local.yml up -d

# Watch the logs during first startup
docker compose -f docker-compose.local.yml logs -f

# Press Ctrl+C to stop watching logs (services keep running)
```

**Expected output:**
```
Creating network "homelab_default" with the default driver
Creating minio         ... done
Creating plex          ... done
Creating homeassistant ... done
```

---

#### Step 7: Verify Services Are Running

```bash
# Check container status
docker compose -f docker-compose.local.yml ps

# Expected output (all should show "Up" and "healthy"):
# NAME            STATUS              PORTS
# plex            Up (healthy)        
# homeassistant   Up (healthy)        
# minio           Up (healthy)        0.0.0.0:9000->9000/tcp, 0.0.0.0:9001->9001/tcp

# If a service is "unhealthy", check its logs:
docker compose -f docker-compose.local.yml logs plex --tail=50
```

---

#### Step 8: Initial Service Configuration

**Plex Initial Setup:**
```bash
# Access Plex web UI (from your Ubuntu host)
# Open browser: http://localhost:32400/web

# Or from another device on your network:
# http://YOUR_UBUNTU_IP:32400/web
```

1. Sign in with your Plex account
2. Give your server a name (e.g., "HomeLabHub Media")
3. Add libraries:
   - Movies: `/data/media/movies`
   - TV Shows: `/data/media/tv`
   - Music: `/data/media/music`
4. Enable remote access in Settings → Remote Access

**Home Assistant Initial Setup:**
```bash
# Access Home Assistant (from your Ubuntu host)
# Open browser: http://localhost:8123

# Or from another device on your network:
# http://YOUR_UBUNTU_IP:8123
```

1. Create your admin account
2. Name your home and set location
3. Add any discovered integrations
4. Complete the onboarding wizard

**MinIO Initial Setup:**
```bash
# Access MinIO Console
# Open browser: http://localhost:9001

# Login with credentials from .env:
# Username: admin (or your MINIO_ROOT_USER)
# Password: YourSecureMinIOPassword123! (your MINIO_ROOT_PASSWORD)
```

1. Create your first bucket (e.g., "backups", "media")
2. Note the S3 endpoint: `http://localhost:9000`
3. Create access keys for applications: Access Keys → Create access key

---

#### Step 9: Health Check Commands

Run these to verify everything is healthy:

```bash
# Check all container health status
docker compose -f docker-compose.local.yml ps

# Individual service tests
# Plex:
curl -s http://localhost:32400/identity | head -5
# Expected: XML with server info

# Home Assistant:
curl -s http://localhost:8123/api/ | head -5
# Expected: {"message": "API running."} or auth required

# MinIO:
curl -s http://localhost:9000/minio/health/live
# Expected: empty response (200 OK)

curl -s http://localhost:9000/minio/health/ready
# Expected: empty response (200 OK)

# Check from Tailscale (from Linode):
ssh root@YOUR_LINODE_IP
curl -s http://100.110.227.25:32400/identity    # Plex
curl -s http://100.110.227.25:8123              # Home Assistant
curl -s http://100.110.227.25:9000/minio/health/live  # MinIO
```

---

#### Step 10: Enable Services to Start on Boot

Docker containers with `restart: unless-stopped` will auto-start when Docker starts.

Ensure Docker itself starts on boot:
```bash
# Enable Docker to start on boot (if not already)
sudo systemctl enable docker

# Verify
sudo systemctl is-enabled docker
# Expected: enabled

# Test by rebooting
sudo reboot

# After reboot, verify services are running
docker compose -f docker-compose.local.yml ps
```

---

#### Troubleshooting Local Services

**Plex Issues:**

| Problem | Solution |
|---------|----------|
| "Not authorized" on first access | Make sure PLEX_CLAIM token is fresh (< 4 min old) |
| Can't find media | Verify `/mnt/media` path is correct in compose file |
| No hardware transcoding | Check `/dev/dri` exists and has correct permissions |
| Remote access not working | Enable in Settings → Remote Access, check port 32400 |

```bash
# Check Plex logs
docker logs plex --tail=100 | grep -i error

# Verify media mount
docker exec plex ls -la /data/media/

# Check hardware transcoding
docker exec plex ls -la /dev/dri/
```

**Home Assistant Issues:**

| Problem | Solution |
|---------|----------|
| Can't discover devices | Ensure network_mode: host is set |
| Bluetooth not working | Verify /run/dbus is mounted and privileged: true |
| Slow startup | First boot can take 2-3 minutes |

```bash
# Check HA logs
docker logs homeassistant --tail=100 | grep -i error

# Check HA configuration is valid
docker exec homeassistant python -m homeassistant --script check_config -c /config
```

**MinIO Issues:**

| Problem | Solution |
|---------|----------|
| Can't login to console | Verify MINIO_ROOT_USER and PASSWORD match .env |
| Out of space | Check /opt/homelab/minio/data has space |
| Connection refused on port 9000 | Check firewall: `sudo ufw allow 9000/tcp` |

```bash
# Check MinIO logs
docker logs minio --tail=100 | grep -i error

# Test S3 API
curl -I http://localhost:9000/minio/health/live
# Expected: HTTP/1.1 200 OK
```

---

#### Useful Commands Reference

```bash
# --- Service Management ---
cd /opt/homelab
docker compose -f docker-compose.local.yml ps          # Status
docker compose -f docker-compose.local.yml up -d       # Start all
docker compose -f docker-compose.local.yml down        # Stop all
docker compose -f docker-compose.local.yml restart     # Restart all
docker compose -f docker-compose.local.yml logs -f     # Follow logs
docker compose -f docker-compose.local.yml pull        # Update images

# --- Individual Service ---
docker restart plex
docker logs homeassistant --tail=50
docker exec -it minio sh

# --- Storage ---
du -sh /opt/homelab/*/                  # Check space usage
df -h /opt/homelab                      # Check available space
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

### 5.12 Public Access via Linode Reverse Proxy

Want to access your local services from anywhere without installing Tailscale on every device? Route public traffic through Linode's Caddy reverse proxy.

**How It Works:**
```
┌──────────────────────────────────────────────────────────────────┐
│                         INTERNET                                  │
│           plex.evindrake.net / ha.evindrake.net                  │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTPS (TLS)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LINODE (Caddy Reverse Proxy)                  │
│                                                                   │
│  • Terminates TLS (automatic Let's Encrypt)                      │
│  • Applies authentication (OAuth/Basic Auth)                      │
│  • Rate limiting & security headers                              │
│  • Proxies to local services via Tailscale tunnel                │
└──────────────────────────┬───────────────────────────────────────┘
                           │ Tailscale (encrypted)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL UBUNTU HOST                             │
│                                                                   │
│  • Plex (32400)     → plex.evindrake.net                        │
│  • Home Assistant (8123) → ha.evindrake.net                      │
│  • MinIO (9000/9001) → minio.evindrake.net                       │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- No Tailscale needed on client devices for browser access
- Your home IP stays hidden (all traffic routes through Linode)
- Unified SSL certificates managed by Caddy
- Centralized authentication and logging
- No port forwarding on your home router

**Keep on Tailscale Only:**
- **Sunshine GameStream** - Latency-sensitive, needs direct low-latency path
- **SSH to local host** - Use Tailscale SSH for security

#### Step 1: Add DNS Records (Cloudflare)

Add these A records pointing to your **Linode public IP** (e.g., `172.233.xxx.xxx`):

| Type | Name | Full Domain | Value | Proxy |
|------|------|-------------|-------|-------|
| A | `plex` | plex.evindrake.net | YOUR_LINODE_IP | DNS only (gray cloud) |
| A | `ha` | ha.evindrake.net | YOUR_LINODE_IP | DNS only |
| A | `minio` | minio.evindrake.net | YOUR_LINODE_IP | DNS only |
| A | `storage` | storage.evindrake.net | YOUR_LINODE_IP | DNS only |

> **Important:** Use "DNS only" (gray cloud), not "Proxied" (orange cloud). Cloudflare proxying adds latency and can break WebSocket connections.

#### Step 2: Update Caddyfile for Cross-Host Proxying

SSH to Linode and update your Caddyfile:

```bash
ssh root@YOUR_LINODE_IP
cd /opt/homelab/HomeLabHub
nano Caddyfile
```

Add these entries (replace `100.110.227.25` with your local Ubuntu's Tailscale IP):

```caddyfile
# ============================================
# LOCAL SERVICES (Proxied via Tailscale)
# ============================================

# Plex Media Server
plex.evindrake.net {
    # Plex handles its own authentication
    reverse_proxy http://100.110.227.25:32400 {
        # Increase timeouts for large media streams
        transport http {
            dial_timeout 10s
            response_header_timeout 30s
        }
        # Health check
        health_uri /identity
        health_interval 30s
    }
    
    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
    }
    
    log {
        output file /var/log/caddy/plex.log
    }
}

# Home Assistant
ha.evindrake.net {
    # Basic Auth as extra layer (HA also has its own auth)
    # Remove this block if you prefer HA-only auth
    basicauth {
        evin $2a$14$HASHED_PASSWORD_HERE
    }
    
    reverse_proxy http://100.110.227.25:8123 {
        # WebSocket support for HA frontend
        transport http {
            dial_timeout 10s
        }
        # Health check - HA API endpoint
        health_uri /api/
        health_interval 30s
        health_status 2xx 4xx
    }
    
    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
    
    log {
        output file /var/log/caddy/homeassistant.log {
            roll_size 10mb
            roll_keep 5
        }
        format json
    }
}

# ============================================
# MinIO - Two endpoints: Console (Web UI) + S3 API
# ============================================

# MinIO Console (Web UI) - Port 9001
# Access at: https://minio.evindrake.net
minio.evindrake.net {
    # Basic Auth required (MinIO also has its own auth)
    basicauth {
        evin $2a$14$HASHED_PASSWORD_HERE
    }
    
    # MinIO Console (Web UI on port 9001)
    reverse_proxy http://100.110.227.25:9001 {
        transport http {
            dial_timeout 10s
        }
        # Health check - MinIO console health
        health_uri /minio/health/live
        health_interval 30s
    }
    
    log {
        output file /var/log/caddy/minio.log {
            roll_size 10mb
            roll_keep 5
        }
        format json
    }
}

# MinIO S3 API endpoint (Port 9000) - for programmatic access
# Access at: https://storage.evindrake.net
# Use this for: aws cli, s3cmd, boto3, application integrations
storage.evindrake.net {
    # No basic auth - use MinIO access/secret keys for API auth
    reverse_proxy http://100.110.227.25:9000 {
        transport http {
            dial_timeout 10s
            # Large file uploads need longer timeouts
            response_header_timeout 300s
        }
        # Pass correct headers for S3 compatibility
        header_up Host {upstream_hostport}
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
        # Health check - MinIO API health
        health_uri /minio/health/live
        health_interval 30s
    }
    
    # Allow large uploads (adjust as needed)
    request_body {
        max_size 5GB
    }
    
    # Security headers
    header {
        X-Content-Type-Options nosniff
        # Allow CORS for web apps
        Access-Control-Allow-Origin *
        Access-Control-Allow-Methods "GET, PUT, POST, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Authorization, Content-Type, X-Amz-Date, X-Amz-Content-Sha256"
    }
    
    log {
        output file /var/log/caddy/minio-api.log {
            roll_size 10mb
            roll_keep 5
        }
        format json
    }
}
```

**MinIO Endpoint Summary:**
- **minio.evindrake.net** (port 9001) → Web Console for browsing buckets, uploading via drag-and-drop
- **storage.evindrake.net** (port 9000) → S3 API for CLI tools, applications, backups

**Using the S3 API with AWS CLI:**
```bash
# Configure AWS CLI for MinIO (run once)
aws configure set aws_access_key_id YOUR_MINIO_ACCESS_KEY
aws configure set aws_secret_access_key YOUR_MINIO_SECRET_KEY
aws configure set default.region us-east-1

# List buckets
aws s3 ls --endpoint-url https://storage.evindrake.net

# Upload a file
aws s3 cp myfile.txt s3://mybucket/ --endpoint-url https://storage.evindrake.net

# Download a file
aws s3 cp s3://mybucket/myfile.txt ./downloaded.txt --endpoint-url https://storage.evindrake.net

# Sync a directory
aws s3 sync ./backups s3://mybucket/backups/ --endpoint-url https://storage.evindrake.net
```

#### Step 3: Generate Password Hash for Basic Auth

```bash
# SSH to Linode
ssh root@YOUR_LINODE_IP

# Generate hashed password (interactive - will prompt for password)
docker compose exec caddy caddy hash-password --algorithm bcrypt

# Example session:
# Enter password: ********
# Confirm password: ********
# $2a$14$Zkd2V5Rq.../... (copy this entire line)

# Alternative: generate hash with password on command line (less secure, visible in history)
docker compose exec caddy caddy hash-password --plaintext "YourStrongPassword123!"
```

Replace `$2a$14$HASHED_PASSWORD_HERE` in Caddyfile with your generated hash.

**Example completed basicauth block:**
```caddyfile
basicauth {
    evin $2a$14$Zkd2V5RqXmE8hF9.aBc123DEFghiJKLmnoPQRstUVwxYZ
}
```

#### Step 4: Test Tailscale Connectivity from Linode

Before enabling public access, verify Linode can reach your local services:

```bash
# From Linode SSH session
curl -I http://100.110.227.25:32400  # Plex
curl -I http://100.110.227.25:8123   # Home Assistant  
curl -I http://100.110.227.25:9001   # MinIO Console

# All should return HTTP 200 or 401 (auth required)
```

#### Step 5: Reload Caddy

```bash
cd /opt/homelab/HomeLabHub
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

# Or restart the stack
docker compose down && docker compose up -d
```

#### Step 6: Test Public Access

From any device (no Tailscale needed):

| Service | URL | Expected |
|---------|-----|----------|
| Plex | https://plex.evindrake.net | Plex login |
| Home Assistant | https://ha.evindrake.net | Basic auth → HA login |
| MinIO Console | https://minio.evindrake.net | Basic auth → MinIO login |
| MinIO API | https://storage.evindrake.net | S3-compatible API |

#### Security Recommendations

**Essential (Do These):**
1. **Strong passwords** - Use unique, long passwords for Basic Auth and each service
2. **Enable 2FA** - Turn on two-factor auth in Home Assistant and Plex
3. **Monitor logs** - Check `/var/log/caddy/*.log` for suspicious activity
4. **Keep updated** - Regularly update all services

**Optional Enhancements - fail2ban:**

Block brute force attempts automatically:

```bash
# SSH to Linode
ssh root@YOUR_LINODE_IP

# Install fail2ban
apt update && apt install -y fail2ban jq

# Create log directory (Caddy writes here)
mkdir -p /var/log/caddy
chmod 755 /var/log/caddy

# Create Caddy auth failure filter
cat > /etc/fail2ban/filter.d/caddy-auth.conf << 'EOF'
# Caddy JSON log filter for authentication failures
[Definition]
# Match 401 Unauthorized responses in Caddy JSON logs
failregex = ^.*"remote_ip"\s*:\s*"<HOST>".*"status"\s*:\s*401.*$
            ^.*"request".*"remote_ip"\s*:\s*"<HOST>".*"status"\s*:\s*401.*$
ignoreregex =
datepattern = "ts"\s*:\s*{EPOCH}
EOF

# Create jail configuration
cat > /etc/fail2ban/jail.d/caddy.conf << 'EOF'
[caddy-auth]
enabled = true
port = http,https
filter = caddy-auth
# Caddy log files (JSON format)
logpath = /var/log/caddy/homeassistant.log
          /var/log/caddy/minio.log
          /var/log/caddy/plex.log
# Ban after 5 failed attempts
maxretry = 5
# Ban for 1 hour (3600 seconds)
bantime = 3600
# Look at last 10 minutes of logs
findtime = 600
# Use iptables to block
banaction = iptables-multiport
EOF

# Enable and restart fail2ban
systemctl enable fail2ban
systemctl restart fail2ban

# Verify jail is active
fail2ban-client status caddy-auth

# View banned IPs
fail2ban-client status caddy-auth
```

**Test fail2ban is working:**
```bash
# Check fail2ban logs
tail -f /var/log/fail2ban.log

# Manually test a ban (from another IP, try 6 wrong passwords)
# Then check: fail2ban-client status caddy-auth

# Unban an IP if needed
fail2ban-client set caddy-auth unbanip 192.168.1.100
```

**OAuth Alternative (Advanced):**

Instead of Basic Auth, you can use OAuth with GitHub or Google. This is more secure and convenient:

```caddyfile
# Example with Caddy Security plugin (requires additional setup)
ha.evindrake.net {
    authenticate with github_oauth
    authorize with github_oauth {
        allow email *@yourdomain.com
    }
    reverse_proxy http://100.110.227.25:8123
}
```

See [Caddy Security](https://github.com/greenpau/caddy-security) for OAuth setup.

#### Access Summary

After setup, you have two access methods for each service:

**Services with Public + Tailscale Access:**

| Service | Public URL (Any Browser) | Tailscale Direct (Lower Latency) |
|---------|--------------------------|----------------------------------|
| Plex | https://plex.evindrake.net | http://100.110.227.25:32400 |
| Home Assistant | https://ha.evindrake.net | http://100.110.227.25:8123 |
| MinIO Console | https://minio.evindrake.net | http://100.110.227.25:9001 |
| MinIO S3 API | https://storage.evindrake.net | http://100.110.227.25:9000 |

**Services with Tailscale-Only Access (No Public Exposure):**

| Service | Access Method | Why Tailscale Only? |
|---------|---------------|---------------------|
| Sunshine GameStream | Moonlight → 100.115.92.47 | Latency-sensitive, security |
| SSH to Ubuntu Host | ssh user@100.110.227.25 | Security best practice |
| SSH to Windows VM | RDP/SSH → 100.115.92.47 | Security best practice |

**When to Use Each:**
- **Public URLs** - Browser access from any device, sharing with family, quick mobile checks
- **Tailscale Direct** - Game streaming, SSH, lower latency, debugging, when Linode is down

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

### Test Local Services (Public URLs)

| Service | URL | Expected |
|---------|-----|----------|
| Plex | https://plex.evindrake.net | Plex login → media library |
| Home Assistant | https://ha.evindrake.net | Basic auth → HA dashboard |
| MinIO Console | https://minio.evindrake.net | Basic auth → MinIO login |

### Test Local Services (Tailscale/Direct Access)

| Service | How to Access | Expected |
|---------|---------------|----------|
| Plex | `http://100.110.227.25:32400` via Tailscale | Plex UI (no proxy) |
| Home Assistant | `http://100.110.227.25:8123` via Tailscale | HA dashboard (no proxy) |
| MinIO | `http://100.110.227.25:9001` via Tailscale | MinIO console (no proxy) |
| Sunshine | Moonlight → `100.115.92.47` | Game streaming |

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
