# DNS Configuration Required for Rig-City.com Domains

## Current Issue

Your Caddy logs show:
```
"no valid A records found for rig-city.com"
```

This means your domain registrar (ZoneEdit) doesn't have DNS records pointing to your server.

## How to Fix (5 Minutes)

### Step 1: Find Your Server's Public IP

```bash
curl -4 icanhazip.com
```

Copy the IP address (example: 123.45.67.89)

### Step 2: Log into ZoneEdit

1. Go to https://zoneedit.com
2. Log in with your credentials
3. Find your **rig-city.com** domain

### Step 3: Add DNS A Records

Add these 4 DNS records:

| Hostname | Type | Value | TTL |
|----------|------|-------|-----|
| @ | A | YOUR_SERVER_IP | 300 |
| www | A | YOUR_SERVER_IP | 300 |
| bot | A | YOUR_SERVER_IP | 300 |
| stream | A | YOUR_SERVER_IP | 300 |

**Replace `YOUR_SERVER_IP` with the IP from Step 1.**

### Step 4: Wait for DNS Propagation

- DNS changes take 5-15 minutes to propagate
- You can check status with: `dig +short rig-city.com @8.8.8.8`
- When it shows your IP, DNS is ready

### Step 5: Caddy Will Auto-Provision SSL

Once DNS is working:
- Caddy automatically requests Let's Encrypt SSL certificates
- Your sites will be available at:
  - https://rig-city.com
  - https://www.rig-city.com  
  - https://bot.rig-city.com
  - https://stream.rig-city.com

## Verification

After DNS propagates, test your sites:

```bash
curl -I https://rig-city.com
curl -I https://stream.rig-city.com
curl -I https://bot.rig-city.com
```

All should return `HTTP/2 200` or redirect responses (not 502).

## If You Have Questions

DNS configuration happens at your domain registrar (ZoneEdit), not in this code. If you need help:
1. Contact ZoneEdit support
2. Or provide screenshots of your ZoneEdit DNS panel and I can guide you
