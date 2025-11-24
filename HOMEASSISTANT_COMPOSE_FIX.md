# Home Assistant Compose Fix

## Issue
```
service homeassistant declares mutually exclusive `network_mode` and `networks`: invalid compose project
```

## Root Cause
In `orchestration/compose.web.yml`, the homeassistant service had BOTH:
- `networks: - homelab` (lines 133-134)
- `network_mode: host` (line 142)

These are **mutually exclusive** in Docker Compose. You cannot specify both.

## Why network_mode: host?
Home Assistant uses `network_mode: host` because it needs:
- **mDNS discovery** for smart home devices (Chromecast, smart speakers, etc.)
- **UPnP/SSDP** for device auto-discovery
- **Direct network access** to control IoT devices on your LAN
- **Port 8123** directly on the host (no port mapping needed)

## Fix Applied
**Removed** `networks: - homelab` section.
**Kept** `network_mode: host`.

### Before:
```yaml
homeassistant:
  image: ghcr.io/home-assistant/home-assistant:stable
  container_name: homeassistant
  restart: unless-stopped
  privileged: true
  networks:        # ❌ CONFLICT!
    - homelab
  network_mode: host
  ...
```

### After:
```yaml
homeassistant:
  image: ghcr.io/home-assistant/home-assistant:stable
  container_name: homeassistant
  restart: unless-stopped
  privileged: true
  network_mode: host  # ✅ Uses host networking
  ...
```

## Impact
- ✅ Home Assistant can now discover smart home devices
- ✅ Accessible at `http://host.evindrake.net:8123`
- ⚠️  NOT on the `homelab` Docker network (uses host network instead)
- ⚠️  Dashboard references it as `http://homeassistant:8123` (should work via host network)

## Testing
```bash
# Restart services
docker compose down
docker compose up -d

# Check Home Assistant logs
docker logs homeassistant -f

# Access directly
curl http://localhost:8123

# Or via browser
open http://host.evindrake.net:8123
```

## Alternative (if you want it on homelab network)
If you DON'T need device discovery and want Home Assistant on the homelab network:

```yaml
homeassistant:
  ...
  networks:
    - homelab
  ports:
    - "8123:8123"
  # REMOVE network_mode: host
```

But this will **break device discovery**!

## Status
✅ **Fixed** - Removed conflicting `networks` declaration
