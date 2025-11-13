# Switch from Traefik to Caddy

## Why Caddy?

Traefik v2.10 and v3.x both have Docker API compatibility issues with Docker 29.0.0 on Ubuntu 25.10. Caddy is:
- ✅ **Simpler** - No Docker API issues
- ✅ **Automatic HTTPS** - Just like Traefik
- ✅ **Easier config** - Uses a simple Caddyfile
- ✅ **Works perfectly** with Docker 29.0.0

## Quick Migration (5 minutes)

### Step 1: Create Caddyfile

```bash
cd /home/evin/contain/HomeLabHub
nano Caddyfile
```

Paste this:

```
{
    email your-email@example.com
}

bot.rig-city.com {
    reverse_proxy discord-bot:5000
}

stream.rig-city.com {
    reverse_proxy stream-bot:5000
}

plex.evindrake.net {
    reverse_proxy plex-server:32400
}

n8n.evindrake.net {
    reverse_proxy n8n:5678
}

host.evindrake.net {
    reverse_proxy homelab-dashboard:8000
}

vnc.evindrake.net {
    reverse_proxy vnc-desktop:80
}

scarletredjoker.com {
    reverse_proxy scarletredjoker-web:80
}

traefik.evindrake.net {
    reverse_proxy caddy:2019
    basicauth {
        evin $2a$14$YOUR_BCRYPT_HASH_HERE
    }
}
```

### Step 2: Update docker-compose.unified.yml

Replace the entire `traefik:` service with:

```yaml
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    networks:
      - homelab
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"  # HTTP/3
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
```

And in the volumes section at the top, replace `traefik_data:` with:

```yaml
volumes:
  postgres_data:
  n8n_data:
  caddy_data:
  caddy_config:
```

### Step 3: Remove Traefik Labels

Remove ALL `labels:` sections from every service. Caddy doesn't use labels - it uses the Caddyfile instead.

### Step 4: Deploy

```bash
cd /home/evin/contain/HomeLabHub

# Stop Traefik
docker compose -f docker-compose.unified.yml down traefik

# Remove Traefik volume (optional - frees up space)
docker volume rm homelabhub_traefik_data

# Start Caddy
docker compose -f docker-compose.unified.yml up -d caddy

# Check logs (should see NO errors!)
docker logs caddy -f
```

You should see:
```
{"level":"info","msg":"serving initial configuration"}
{"level":"info","msg":"autosaved config"}
```

### Step 5: Test

Wait 30 seconds for SSL certificates, then:

```bash
curl -I https://bot.rig-city.com
curl -I https://host.evindrake.net
curl -I https://plex.evindrake.net
```

Should return **HTTP/2 200** - no more blank pages!

---

## Why This Works

Caddy communicates with Docker containers directly by name (via the Docker network), not through the Docker API. This completely avoids the API version issue.

---

## Need Help?

I can create the full updated docker-compose.unified.yml file for you if you want to switch to Caddy.
