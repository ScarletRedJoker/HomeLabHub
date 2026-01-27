# Nebula Command

## Overview
Nebula Command is a creation engine designed for comprehensive homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It provides a unified solution for digital creators and homelab enthusiasts, streamlining content generation, distribution, and community engagement. The platform is optimized for distributed deployment across cloud and local infrastructure, aiming to be a central hub for digital creation and homelab operations, with future potential for integration with games, AR/VR, and simulation environments.

## User Preferences
- **Development Workflow:** Edit locally → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit)

## System Architecture

### Core Services
- **Dashboard (Next.js 14):** Web interface for homelab management, Docker controls, SSH metrics, deployment pipelines, code editor, visual website designer, and Jarvis AI assistant.
- **Discord Bot (Node.js/React):** Customizable bot for community management with per-server identity and granular feature toggles.
- **Stream Bot (Node.js/React/Vite):** Multi-platform content posting across Twitch, YouTube, and Kick.
- **Nebula Agent (Node.js/Express):** Runs on Windows VM for health monitoring, command execution, model management, and service control.

### Cross-Service Integration and Deployment
Services share a PostgreSQL database and Redis for caching, communicating via webhooks and APIs. The system employs a three-tier distributed deployment model leveraging Ubuntu Host (Home) for AI services, Linode (Cloud) for core web and bot services, and Tailscale for secure mesh networking.

### Platform Architecture
A three-layer design (Experience, Control Plane, Execution Plane) supports a Marketplace API for Docker packages, an Agent Orchestrator API for managing AI agents, and Service Discovery via `service-map.yml`. It includes a Creative Studio for AI content generation and a Jarvis AI Orchestrator for multi-agent job management and autonomous code development.

### AI Node Management & Creative Engine
The system monitors AI node health and performance, featuring APIs for Speech, Job Scheduling, Training, and Embeddings/RAG. The Creative Studio supports advanced AI image generation (text-to-image, image-to-image, inpainting, ControlNet, upscaling, face swap) with job persistence. A ComfyUI Service Supervisor ensures robust operation of the image generation pipeline, including automatic restarts and health checks.

### Key Features
Nebula Command provides a comprehensive suite of features including:
- **OOTB Setup Wizard:** Guided platform configuration.
- **Command Center & Deploy Center:** Unified control and remote deployment.
- **Services & Secrets Manager:** Container, service, and credential management.
- **Jarvis AI & Creative Studio:** AI chat assistance and advanced image generation.
- **AI Models & Workflows:** Model marketplace, management, and multi-step AI automation.
- **Agent Builder & Pipelines:** Custom AI agent configuration and deployment automation.
- **Bot Editor & Servers:** Discord bot customization and server monitoring.
- **Windows VM & Domains:** GPU server management and DNS/SSL management.
- **Marketplace:** Docker package installation.
- **AI Developer:** An autonomous code modification system with:
  - Ollama as default local LLM provider (no cloud dependencies)
  - Git branch isolation (`ai-dev/{jobId}-{timestamp}` branches for safe changes)
  - Auto-approval rules (docs-only, test-only, small-changes with conditions)
  - Build verification (npm/cargo/go/python detection and execution)
  - Remote execution via Nebula Agent API with automatic local fallback
  - Context/memory management with token-aware compression and Redis persistence
  - Human approval gates with diff preview and rollback support
  - Dashboard UI with real-time progress, execution logs, and syntax-highlighted diffs
- **AI Influencer / Video Automation Pipeline:** Fully automated content generation system with:
  - ComfyUI-based image sequences with LoRA/embedding support for style consistency
  - AnimateDiff video frame generation with persona-aware prompting
  - Script-to-video workflows with automated prompt chaining
  - Batch generation with priority queue (max 100 items, 2 concurrent)
  - Cron-based scheduling with timezone support (auto-starts on server boot)
  - FFmpeg video assembly with TTS audio mixing and thumbnail generation
  - Structured asset storage at `storage/ai/influencer/{projectId}/`
  - Dashboard UI for pipeline controls, queue monitoring, and persona management
- **Automated Deployment and Node Auto-Configuration:** Bootstrap scripts for dynamic, hardware-aware configuration of AI services (Ollama, ComfyUI, Stable Diffusion) on various nodes.

## Deployment System

### One-Command Deployment
```bash
# Linux
curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash

# Windows (PowerShell as Admin)
irm https://raw.githubusercontent.com/.../install.ps1 | iex
```

### Hardware Auto-Detection
The deployment system automatically detects:
- **GPU:** NVIDIA (via nvidia-smi), AMD (via rocm-smi), Intel, or CPU-only
- **VRAM:** GPU memory in MB for model selection
- **CUDA/ROCm:** Version detection for PyTorch compatibility
- **System:** CPU cores, RAM, disk space, Tailscale IP

### Service Auto-Configuration
Based on detected hardware, the system automatically:
- **Configures Ollama** with appropriate models:
  - < 4GB VRAM: phi, tinyllama
  - 4-8GB VRAM: llama2, mistral, codellama
  - 8-16GB VRAM: llama2:13b, mixtral
  - > 16GB VRAM: llama2:70b, codellama:70b
- **Configures ComfyUI** with --lowvram/--highvram flags
- **Configures Stable Diffusion** with xformers optimization
- **Generates service-map.yml** for service discovery

### Service Supervision
- **Windows:** Task Scheduler jobs with watchdog script
- **Linux:** Systemd units with auto-restart and health monitoring
- **Health Daemon:** Node.js service exposing /health, /metrics, /services, /gpu endpoints
- **Dashboard Integration:** Automatic node registration and periodic heartbeats

### Deployment Files
- `deploy/unified/bootstrap.ps1` - Windows PowerShell bootstrap (1500+ lines)
- `deploy/unified/bootstrap.sh` - Linux Bash bootstrap (1900+ lines)
- `deploy/install.sh` / `deploy/install.ps1` - One-liner installers
- `deploy/update.sh` / `deploy/update.ps1` - Update scripts
- `deploy/uninstall.sh` / `deploy/uninstall.ps1` - Uninstall scripts
- `deploy/services/*.service` - Systemd unit files
- `deploy/services/nebula-watchdog.*` - Service supervision scripts
- `deploy/services/health-daemon.js` - Health monitoring daemon
- `deploy/config/*` - Configuration templates

### Architectural Principles
The architecture is designed for future extensibility with core interfaces for services, rendering, pipelines, and extensions, facilitating integration with game engines, AR/VR runtimes, and simulation engines through a dynamic service registry and plugin system.

## External Dependencies
- **PostgreSQL:** Primary relational database.
- **Redis:** Caching and session management.
- **OpenAI API:** Cloud-based AI services (fallback).
- **Discord API (discord.js):** Discord Bot functionality.
- **Twitch/YouTube/Kick APIs:** Stream Bot integration.
- **Spotify API:** Music bot features.
- **Plex API:** "Now Playing" status.
- **Home Assistant API:** Homelab automation.
- **Cloudflare API:** DNS management.
- **Tailscale:** Secure network connectivity.
- **Caddy:** Reverse proxy.
- **Ollama:** Local LLM inference.
- **Stable Diffusion/ComfyUI:** Local image generation.