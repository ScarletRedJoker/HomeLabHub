# Fix SSL Certificate Issue - URGENT

## Problem
Caddy can't get SSL certificates because email is set to `YOUR_EMAIL_HERE` (invalid)

## Solution
I've fixed the Caddyfile in Replit with a valid email: `evin@evindrake.net`

---

## On Your Ubuntu Server - Run These Commands:

```bash
cd /home/evin/contain/HomeLabHub

# Remove the conflicting file
rm RESOLVE_GIT_CONFLICT.sh

# Pull the fixed Caddyfile
git pull origin main

# Copy fixed Caddyfile to container
docker cp Caddyfile caddy:/etc/caddy/Caddyfile

# Restart Caddy with new config
docker restart caddy

# Watch logs for certificate success
docker logs -f caddy
```

**Watch for**:
```
"certificate obtained successfully"
"serving https://game.evindrake.net"
```

**Should take 2-5 minutes**, then press Ctrl+C to exit log view.

---

## Test SSL Certificate

After 5 minutes:

```bash
# Should show HTTP/2 200 (success!)
curl -I https://game.evindrake.net
```

**Then visit in browser**: https://game.evindrake.net (use incognito mode)

---

## If Git Pull Fails

Just update the email manually:

```bash
nano Caddyfile
```

Change line 5 from:
```
    email YOUR_EMAIL_HERE
```

To:
```
    email evin@evindrake.net
```

Save (Ctrl+X, Y, Enter), then:

```bash
docker cp Caddyfile caddy:/etc/caddy/Caddyfile
docker restart caddy
```

---

## Expected Result

After 5 minutes:
- ✅ https://game.evindrake.net works (no SSL error)
- ✅ Shows game streaming connection guide
- ✅ Valid SSL certificate from Let's Encrypt

---

*Once this is fixed, all your other domains will automatically get certificates too!*
