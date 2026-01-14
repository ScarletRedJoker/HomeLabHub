# Nebula Command

## Overview
Nebula Command is a creation engine designed for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It provides a comprehensive, integrated solution for managing homelabs, fostering online communities, and streamlining content creation and distribution, optimized for distributed deployment across cloud and local infrastructure. Key capabilities include a web-based dashboard, a Discord bot, a Stream bot, and hybrid AI services.

## User Preferences
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

## System Architecture

### Core Services
The platform is built around three distributed core services:
*   **Dashboard (Next.js 14):** A web interface for homelab management with real-time statistics, Docker controls, SSH server metrics, deployment pipelines, a Monaco code editor, a visual website designer, and an OpenAI-powered AI chat assistant (Jarvis AI).
*   **Discord Bot (Node.js/React):** A highly customizable bot for community management with per-server identity and granular feature toggles.
*   **Stream Bot (Node.js/React/Vite):** Manages multi-platform content posting and interaction across Twitch, YouTube, and Kick.

### Cross-Service Integration
Services share a PostgreSQL database and Redis for caching. Communication occurs via webhooks (Stream Bot to Discord) and APIs (Dashboard and Discord Bot).

### Deployment Architecture
The system utilizes a distributed deployment model across cloud (Linode), Ubuntu Homelab, and Windows AI Node. Tailscale provides secure mesh networking.

### Database Schema
A shared PostgreSQL instance organizes data into distinct databases for each core service: `homelab_jarvis`, `discord_bot`, and `stream_bot`.

### Platform Architecture Expansion
The system features a three-layer design (Experience, Control Plane, Execution Plane) with an event-driven spine. It includes a Marketplace API for Docker packages, an Agent Orchestrator API for AI agents with function calling, and Service Discovery via a `service-map.yml`. A Creative Studio offers AI-powered content creation with multi-model support.

### Universal Creation Engine
The platform includes a Quick Start Wizard, Universal Builder, App Factory (AI-powered code generation), AI Code Assistant, Deploy Pipelines, Template Marketplace, and a Project Manager.

### Auto-Deployment System
Features a Server Provisioning API and a Deployment Execution API for Docker/PM2 deployments, including preflight checks, auto-secret generation, Authelia setup, health checks, Cloudflare DNS sync, smoke tests, and continuous monitoring.

### AI Gateway Architecture
Features a unified AI Chat interface with provider/model selection, real-time streaming responses, and a circuit breaker for fallback. Local AI services (Ollama, Stable Diffusion, ComfyUI) are automatically discovered and configured via Tailscale.

### Discord Bot Architecture
Includes a per-server customization system for bot identity and feature toggles.

### Production Configuration
The dashboard automatically detects development (Replit) or production (Linode) environments, adjusting AI access and SSH key handling. Jarvis AI has autonomous tools using OpenAI function calling. Local AI services on Windows VM and Ubuntu are utilized when running in production via Tailscale. An `/infrastructure` page provides remote control for VMs and Windows services.

### Local AI Services (Windows VM)
A Windows VM hosts GPU-accelerated AI services: Ollama (LLM inference), Stable Diffusion WebUI (image generation), and ComfyUI (node-based video/image workflows). An Auto-Deployment System provides unified management, dependency handling, and a Windows AI Supervisor for service management.

### AI Node Management System
A comprehensive dashboard page (`/ai-nodes`) provides (Agent Port: 9765 via Tailscale):
- **Service Health Monitoring:** Real-time status for Ollama (11434), Stable Diffusion (7860), ComfyUI (8188), and Whisper (8765)
- **GPU Statistics:** Memory usage, utilization, and temperature from nvidia-smi
- **Issue Detection:** Automatic detection of known problems including NumPy 2.x incompatibility, torch.library custom_op errors, xformers mismatches, triton missing, protobuf conflicts, and comfy_kitchen issues
- **Package Version Tracking:** Current vs target versions for numpy (1.26.4), torch (2.3.1), protobuf (5.28.3), xformers (0.0.28), transformers, diffusers
- **One-Click Repair:** Dashboard buttons to restart services, update dependencies, fix specific issues, or repair all
- **Health Daemon:** Windows PowerShell script (`deploy/windows/scripts/start-health-daemon.ps1`) runs continuously, scanning logs for error patterns and reporting package versions every 30 seconds (deep scans every 5 minutes)
- **API Endpoint:** `/api/ai/node-manager` with GET for diagnostics and POST for repair actions
- **Agent Communication:** Requires `NEBULA_AGENT_TOKEN` secret for secure communication with Windows VM agent via Tailscale (100.118.44.102)

### Unified Windows AI Stack Startup
The `deploy/windows/scripts/Start-NebulaAiStack.ps1` script provides one-command startup for all Windows AI services:
- **Python Validation:** Requires Python 3.10-3.12 (rejects 3.14+ as PyTorch lacks CUDA wheels)
- **PyTorch CUDA Repair:** Automatically detects CPU-only PyTorch and reinstalls with CUDA 12.1
- **Ordered Service Start:** Ollama → Stable Diffusion → ComfyUI → Nebula Agent
- **Auto-Start on Boot:** `.\Start-NebulaAiStack.ps1 install` registers as Windows scheduled task
- **Commands:** `start`, `stop`, `status`, `repair`, `validate`, `install`
- **Known Issue Fix:** "Torch not compiled with CUDA enabled" error caused by wrong PyTorch build or Python 3.14

### AI Services API Endpoints
Provides APIs for Speech Services (TTS/STT), Job Scheduling (GPU jobs), Training (LoRA, QLoRA, etc.), and Embeddings/RAG (semantic search, chunking). Core AI libraries support GPU-aware scheduling, hybrid speech services, RAG, and model training.

### Model Management System
A unified model management system via the dashboard and a Windows Model Agent provides model inventory, download management from Civitai/HuggingFace, VRAM estimates, and one-click deletion.

### Docker Marketplace
A marketplace offers 24+ pre-built Docker packages across 9 categories for one-click deployment to SSH-connected servers.

### Settings System
A comprehensive settings interface provides configuration for AI, servers, integrations (Discord, Twitch, YouTube), and general settings (profile, appearance, notifications), with connection testing.

### Development vs Production
Differences in SSH access, AI service utilization (cloud vs. local), and specific feature availability are managed by environment detection. Replit development uses modelfarm for OpenAI integration.

## External Dependencies
*   **PostgreSQL:** Primary relational database.
*   **Redis:** Caching and session management.
*   **OpenAI API:** AI services.
*   **Discord API (discord.js):** Discord Bot functionality.
*   **Twitch/YouTube/Kick APIs:** Stream Bot integration.
*   **Spotify API:** Music bot features.
*   **Plex API:** "Now Playing" status.
*   **Home Assistant API:** Homelab automation.
*   **Cloudflare API:** DNS management.
*   **Tailscale:** Secure network connectivity.
*   **Caddy:** Reverse proxy.
*   **Ollama:** Local LLM inference.
*   **Stable Diffusion:** Local image generation.