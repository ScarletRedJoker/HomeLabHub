# Home Assistant Configuration Migration Guide

## Overview
The Home Assistant service uses a Docker named volume `homeassistant_config` for persistent storage. Configuration templates are available in `./config/homeassistant/` for reference.

## Current Setup
- **Primary Config:** Docker volume `homeassistant_config` (mounted to `/config` in container)
- **Templates:** `./config/homeassistant/` (mounted to `/config-templates` read-only)

## To Use Custom Configuration

### Option 1: Quick Copy Script (Recommended)
```bash
# Run the automated copy script
./config/homeassistant/copy-config.sh
```

This script will:
- Backup your existing configuration.yaml (if it exists)
- Copy all template files into the running container
- Automatically restart Home Assistant

### Option 2: Manual Copy
```bash
# Access the running container
docker exec -it homeassistant bash

# Inside container, copy template files
cp /config-templates/configuration.yaml /config/
cp /config-templates/automations.yaml /config/
cp /config-templates/scenes.yaml /config/
cp /config-templates/scripts.yaml /config/

# Exit container
exit

# Restart to apply changes
docker-compose -f docker-compose.unified.yml restart homeassistant
```

### Option 2: Migrate to Bind Mount (Advanced)
**WARNING:** This will replace your current Home Assistant data!

```bash
# 1. Backup current volume data
docker run --rm \
  -v homeassistant_config:/source \
  -v $(pwd)/config/homeassistant-backup:/backup \
  alpine tar czf /backup/ha-config-backup-$(date +%Y%m%d).tar.gz -C /source .

# 2. Stop Home Assistant
docker-compose -f docker-compose.unified.yml stop homeassistant

# 3. Copy current config from volume to host
docker run --rm \
  -v homeassistant_config:/source \
  -v $(pwd)/config/homeassistant:/dest \
  alpine sh -c "cp -r /source/* /dest/"

# 4. Edit docker-compose.unified.yml
# Change: homeassistant_config:/config
# To:     ./config/homeassistant:/config

# 5. Start Home Assistant
docker-compose -f docker-compose.unified.yml up -d homeassistant
```

## Reverse Proxy Configuration
The template `configuration.yaml` includes proper reverse proxy settings:

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 172.16.0.0/12  # Docker bridge networks
    - 192.168.0.0/16 # Private networks
    - 10.0.0.0/8     # Private networks
```

This fixes the "A request from a reverse proxy was received" errors when accessing Home Assistant through Caddy.

## Current Files in Templates
- `configuration.yaml` - Main configuration with reverse proxy settings
- `automations.yaml` - Automation definitions
- `scenes.yaml` - Scene definitions
- `scripts.yaml` - Script definitions
