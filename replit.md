# Nebula Command

## Overview
Nebula Command is a creation engine for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It serves as a custom development and automation platform optimized for homelab environments, supporting distributed deployment across cloud and local infrastructure. Its core capabilities include a web-based dashboard for homelab control, a Discord bot for community management, a Stream bot for multi-platform streaming, and hybrid cloud/local AI services. The project's vision is to provide a comprehensive, integrated solution for managing homelabs, fostering online communities, and streamlining content creation and distribution, aiming to offer a versatile and powerful toolset for both personal and community-driven projects.

## User Preferences
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

## System Architecture

### Core Services
The platform is built around three distributed core services:
*   **Dashboard (Next.js 14):** A web interface for homelab management, featuring real-time statistics, Docker container controls, SSH-based server metrics, deployment pipelines, a Monaco code editor, a visual website designer, and an OpenAI-powered AI chat assistant (Jarvis AI).
*   **Discord Bot (Node.js/React):** A highly customizable bot with per-server identity and granular feature toggles for community management (tickets, music, stream notifications, analytics, leveling, giveaways, polls, moderation).
*   **Stream Bot (Node.js/React/Vite):** Manages multi-platform content posting and interaction across Twitch, YouTube, and Kick, including OAuth, token encryption, and rate limiting.

### Cross-Service Integration
Services share a PostgreSQL database and Redis for caching. The Stream Bot uses webhooks for Discord notifications, and the Dashboard and Discord Bot communicate via APIs.

### Deployment Architecture
The system utilizes a distributed deployment model:
- **Cloud (Linode):** Dashboard, Discord Bot, Stream Bot → `deploy/linode/`
- **Ubuntu Homelab:** Plex, MinIO, Home Assistant, Ollama fallback → `deploy/local/`
- **Windows AI Node:** GPU AI services (Ollama, SD, ComfyUI, training) → `deploy/windows/`

Tailscale provides secure mesh networking for cloud services to access local homelab resources.

### Database Schema
A shared PostgreSQL instance organizes data into distinct databases for each core service: `homelab_jarvis` (Dashboard), `discord_bot`, and `stream_bot`.

### Platform Architecture Expansion
The system features a three-layer design (Experience, Control Plane, Execution Plane) with an event-driven spine. It includes a Marketplace API for Docker packages, an Agent Orchestrator API for AI agents with function calling, and Service Discovery via a `service-map.yml`. A Creative Studio offers AI-powered content creation with multi-model support (OpenAI GPT-4o, Ollama, Stable Diffusion) and image generation (DALL-E 3).

### Universal Creation Engine
The platform includes:
- **Quick Start Wizard:** One-click creator kits with pre-configured bundles.
- **Universal Builder:** Allows building various applications (websites, mobile, desktop, bots) with framework and feature selections.
- **App Factory:** Visual project scaffolding with AI-powered code generation.
- **AI Code Assistant:** For code refactoring, debugging, optimization, documentation, and language conversion.
- **Deploy Pipelines:** One-click deployment to Docker/PM2 with real-time logs.
- **Template Marketplace:** Community templates for one-click installation.
- **Project Manager:** For project organization, status tracking, and resource monitoring.

### Auto-Deployment System
Includes a Server Provisioning API for SSH key generation, Docker installation, and Tailscale setup, and a Deployment Execution API for Docker/PM2 deployments with real-time logging. Deployment scripts include preflight checks, auto-secret generation, Authelia setup, health check retries, Cloudflare DNS sync, smoke tests, and continuous health monitoring.

### AI Gateway Architecture
Features a unified AI Chat interface with provider selection (OpenAI, Ollama), model selection, real-time streaming responses, and a circuit breaker for automatic fallback from local to cloud AI. Local AI services (Ollama, Stable Diffusion, ComfyUI) are automatically discovered and configured between Linode and homelab servers using Tailscale.

### Discord Bot Architecture
Features a per-server customization system allowing server admins to configure the bot's identity and enable/disable 16+ toggleable features across 8 categories.

### Production Configuration
- **Environment Detection:** The dashboard automatically detects Replit (dev) or Production (Linode) environments, adjusting AI access accordingly.
- **SSH Key Handling:** SSH-dependent features prioritize `SSH_PRIVATE_KEY` environment variable, with a file fallback.
- **Jarvis AI Tools:** Jarvis has 6 autonomous tools with OpenAI function calling for image/video generation, Docker actions, deployments, and server/container status.
- **Local AI (Production Only):** When running on Linode (Tailscale network), local AI services on Windows VM (Ollama, ComfyUI) and Ubuntu (Ollama fallback) are utilized.
- **VM & Service Management:** An `/infrastructure` page provides remote control for VMs (via libvirt over SSH) and Windows services (Ollama, Stable Diffusion WebUI, ComfyUI) on homelab resources.

### Local AI Services (Windows VM)
The Windows VM (Tailscale IP: 100.118.44.102) hosts GPU-accelerated AI services on RTX 3060 (12GB VRAM):
- **Ollama:** Port 11434 - LLM inference (llama3.2, mistral, codellama, qwen2.5-coder)
- **Stable Diffusion WebUI:** Port 7860 - AUTOMATIC1111 image generation
- **ComfyUI:** Port 8188 - Node-based video/image workflows (AnimateDiff, SVD)

**Auto-Deployment System:**
- **Unified Installer** (`deploy/windows/scripts/install-ai-node.ps1`): One-click setup script with preflight checks, dependency installation, AI service deployment, configuration, and verification
- **Bootstrap Script** (`deploy/windows/bootstrap.ps1`): Remote deployment via `irm ... | iex` pattern with configurable repository URL
- **Windows AI Supervisor** (`deploy/windows/scripts/windows-ai-supervisor.ps1`): PowerShell service manager that auto-starts Ollama/SD/ComfyUI on boot
- **Health Daemon** (`deploy/windows/scripts/vm-ai-health-daemon.ps1`): Reports status every 30s to dashboard webhook
- **Ubuntu Health Monitor** (`deploy/local/scripts/create-local-ai-state.sh`): Polls all AI services, updates shared state file

**Windows Node Setup:**
```powershell
# One-line install (requires setting repo URL):
$env:NEBULA_REPO_URL = "https://github.com/your-org/nebula-command.git"
irm https://raw.githubusercontent.com/.../deploy/windows/bootstrap.ps1 | iex

# Or manual:
git clone <repo> C:\NebulaCommand
cd C:\NebulaCommand\deploy\windows
.\scripts\install-ai-node.ps1
```

**Dashboard Integration APIs:**
- `POST /api/ai/health-webhook` - Receives health reports from Windows VM
- `GET/POST /api/ai/control` - Remote start/stop/restart of AI services
- State file: `/opt/homelab/HomeLabHub/deploy/shared/state/local-ai.json`

**Cluster-Ready Architecture:**
- Node registry schema in `services/dashboard-next/lib/db/ai-cluster-schema.ts`
- Supports adding multiple GPU nodes via Tailscale
- Job queue for VRAM-aware scheduling (future)

### AI Services API Endpoints

**Speech Services:**
- `POST /api/ai/speech/tts` - Text-to-speech generation (XTTS, Piper, Edge-TTS, OpenAI fallback)
- `GET /api/ai/speech/tts` - List available TTS models
- `POST /api/ai/speech/stt` - Speech-to-text transcription (Whisper local + OpenAI fallback)
- `GET /api/ai/speech/stt` - List available STT models

**Job Scheduling:**
- `GET /api/ai/jobs` - List GPU jobs with filtering (status, type, priority)
- `POST /api/ai/jobs` - Queue a new GPU job
- `GET /api/ai/jobs/[id]` - Get job details and progress

**Training:**
- `GET /api/ai/training` - List training runs (LoRA, QLoRA, SDXL, DreamBooth)
- `POST /api/ai/training` - Create new training run with config
- `GET /api/ai/training/[id]` - Get training run details
- `PATCH /api/ai/training/[id]` - Start/cancel/update training run
- `DELETE /api/ai/training/[id]` - Cancel training run
- `GET /api/ai/training/[id]/events` - SSE stream for real-time progress updates

**Embeddings/RAG:**
- `POST /api/ai/embeddings` - Generate embeddings or perform semantic search
  - action=embed: Generate embeddings for text
  - action=search: Semantic search across knowledge base
  - action=chunk: Text chunking for processing
- `GET /api/ai/embeddings` - Get stats and available models

**Core AI Libraries:**
- `lib/ai-scheduler/` - GPU-aware job scheduling with VRAM management and mutex locks
- `lib/speech/` - TTS (TextToSpeechService) and STT (SpeechToTextService) with hybrid local/cloud
- `lib/rag/` - EmbeddingService, TextChunker, KnowledgeRetriever for RAG
- `lib/training/` - TrainingRunManager and TrainingEventBus for model training

**Model Capability Matrix:** See `docs/LOCAL_AI_CAPABILITY_MATRIX.md` for complete model list with VRAM requirements.
**Deployment Guide:** See `docs/LOCAL_AI_DEPLOYMENT_GUIDE.md` for setup instructions.

### Development vs Production
- **Replit (Development):** SSH features limited (no key file), uses cloud AI only (OpenAI via AI_INTEGRATIONS)
- **Linode (Production):** Full SSH access, local AI via Tailscale, Windows VM control enabled
- **SSH Key Errors in Replit:** Expected behavior - Replit dev environment doesn't have SSH keys configured

## External Dependencies
*   **PostgreSQL:** Primary relational database (Neon for development, self-hosted for production).
*   **Redis:** Caching and session management.
*   **OpenAI API:** Powers AI services.
*   **Discord API (discord.js):** Discord Bot functionality.
*   **Twitch/YouTube/Kick APIs:** Stream Bot multi-platform integration.
*   **Spotify API:** Music bot features.
*   **Plex API:** "Now Playing" status for Discord Bot.
*   **Home Assistant API:** Homelab automation.
*   **Cloudflare API:** DNS management.
*   **Tailscale:** Secure network connectivity.
*   **Caddy:** Reverse proxy.
*   **Ollama:** Local large language model (LLM) inference.
*   **Stable Diffusion:** Local image generation.