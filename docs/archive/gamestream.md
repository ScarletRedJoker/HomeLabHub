# GameStream Setup Guide

Stream games from your gaming PC to any device using Sunshine and Moonlight.

## Overview

GameStream allows you to play PC games on any device - phone, tablet, TV, or another computer. The technology uses:

- **Sunshine** - Self-hosted game streaming server (runs on your gaming PC)
- **Moonlight** - Client app (runs on your devices)

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│  YOUR GAMING PC     │     │  YOUR DEVICES       │
│  (Local Ubuntu)     │     │                     │
│                     │     │  📱 Phone           │
│  ┌───────────────┐  │     │  📺 Smart TV        │
│  │   Sunshine    │──┼─────│  💻 Laptop          │
│  │  (Streaming)  │  │     │  🎮 Steam Deck      │
│  └───────────────┘  │     │                     │
└─────────────────────┘     └─────────────────────┘
         │
         │ (via Tailscale VPN)
         ▼
┌─────────────────────┐
│   LINODE CLOUD      │
│   (Caddy Proxy)     │
│                     │
│   gamestream.       │
│   evindrake.net     │
└─────────────────────┘
```

## Prerequisites

1. **GPU Drivers**: NVIDIA or AMD GPU with up-to-date drivers
2. **Docker**: Docker and Docker Compose installed on local host
3. **Tailscale**: Connected VPN mesh between local and Linode

## NVIDIA GPU Setup

For NVIDIA GPUs, you need additional setup for hardware encoding:

```bash
# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt update
sudo apt install -y nvidia-container-toolkit

# Configure Docker to use NVIDIA runtime
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verify GPU is accessible
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
```

Then uncomment `runtime: nvidia` in compose.local.yml:
```yaml
sunshine:
  # ... other config ...
  runtime: nvidia  # Uncomment this line
```

## Setup Steps

### Step 1: Start Sunshine

On your local Ubuntu host:

```bash
cd ~/contain/HomeLabHub

# Start the Sunshine container
docker compose -f compose.local.yml up -d sunshine

# Check it's running
docker compose -f compose.local.yml ps sunshine
```

### Step 2: Initial Configuration

1. **Access Web UI**: Open https://gamestream.evindrake.net (or http://localhost:47990)
2. **Create Account**: Set username and password when prompted
3. **Accept HTTPS Warning**: Self-signed certificate is normal

### Step 3: Pair Moonlight Client

1. Download Moonlight from https://moonlight-stream.org for your device
2. Open Moonlight and enter your host address:
   - Local network: Your PC's local IP (e.g., `192.168.1.100`)
   - Remote via Tailscale: Your Tailscale IP (e.g., `100.64.x.x`)
3. A PIN will appear - enter it in the Sunshine web UI to pair

### Step 4: Add Games

In the Sunshine web UI (https://gamestream.evindrake.net):

1. Go to **Applications** tab
2. Click **Add Application**
3. Add your games:
   - **Name**: Game name (e.g., "Steam Big Picture")
   - **Command**: Path to executable or launcher
   
Example applications:
```
Steam Big Picture:
  Command: steam://open/bigpicture
  
Desktop (Full Access):
  Command: mstsc /v:localhost
  
Specific Game:
  Command: "C:\Program Files\Steam\steamapps\common\MyGame\game.exe"
```

## Environment Variables

Add to your `.env` file:

```bash
# Sunshine GameStream
SUNSHINE_USER=admin
SUNSHINE_PASS=your_secure_password
```

## Ports Used

| Port | Protocol | Purpose |
|------|----------|---------|
| 47990 | TCP | Web UI |
| 47989 | TCP | HTTPS Web UI |
| 47984 | TCP | RTSP |
| 47998 | UDP | Video stream |
| 47999 | UDP | Audio stream |
| 48000 | UDP | Control stream |
| 48010 | TCP | RTSP (alt) |

## Firewall Configuration

If you have UFW enabled on your local host:

```bash
# Allow Sunshine ports
sudo ufw allow 47989:48010/tcp
sudo ufw allow 47998:48010/udp
```

## Troubleshooting

### Black Screen / No Video
- Ensure GPU drivers are up-to-date
- Check that `/dev/dri` is accessible
- Verify Sunshine has GPU access: `docker exec sunshine-gamestream ls -la /dev/dri`

### Can't Connect from Moonlight
- Verify Tailscale is connected on both devices
- Check firewall allows Sunshine ports
- Try using direct Tailscale IP instead of domain

### High Latency
- Use 5GHz WiFi or Ethernet
- Lower streaming quality in Moonlight settings
- Ensure your network supports the bandwidth

### Audio Issues
- Check audio output device in Sunshine settings
- Verify PulseAudio or PipeWire is running on host

## Performance Optimization

### NVIDIA GPUs
Sunshine uses NVENC for hardware encoding:
- RTX 2000+ series: Best performance
- GTX 1000 series: Good performance
- Older: May need software encoding

### AMD GPUs
Uses VAAPI or AMF:
- RX 5000+ series: Good performance
- Older: Check driver compatibility

### Network Recommendations
- **Local streaming**: Any decent WiFi works
- **Remote streaming**: 15+ Mbps upload from your PC
- **4K streaming**: 50+ Mbps recommended

## Remote Access

For streaming outside your home:

1. **Via Tailscale** (Recommended): 
   - Install Tailscale on your device
   - Connect to your Tailscale network
   - Use your PC's Tailscale IP in Moonlight

2. **Via Domain**:
   - Use `gamestream.evindrake.net` (routed through Linode)
   - Requires stable Tailscale connection between local and Linode

## Dashboard Integration

The HomeLabHub dashboard at https://host.evindrake.net shows:
- Sunshine service status (running/stopped)
- Quick link to gamestream.evindrake.net
- Start/Stop controls

## Next Steps

1. Pair all your devices with Moonlight
2. Add your favorite games to Sunshine
3. Configure quality settings in Moonlight for each device
4. Enjoy gaming anywhere!
