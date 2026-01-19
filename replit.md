# Nebula Command

## Overview
Nebula Command is a creation engine for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It provides a comprehensive, integrated solution for managing homelabs, fostering online communities, and streamlining content creation and distribution, optimized for distributed deployment across cloud and local infrastructure. The project aims to provide a unified platform for digital creators and homelab enthusiasts, offering market potential in automation, content generation, and community engagement.

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

### Cross-Service Integration and Deployment
Services share a PostgreSQL database and Redis for caching, communicating via webhooks and APIs. The system uses a three-tier distributed deployment model:
*   **Ubuntu Host (Home):** KVM/libvirt hypervisor running Windows 11 VM with GPU passthrough.
*   **Windows 11 VM (KVM Guest):** GPU-accelerated AI services (Ollama, Stable Diffusion, ComfyUI) accessed from dashboard via Tailscale.
*   **Linode (Cloud):** Hosts the Nebula Command dashboard, Discord bot, and stream bot.
Tailscale provides secure mesh networking across all nodes. The database schema organizes data into distinct databases for each core service.

### Platform Architecture
The system features a three-layer design (Experience, Control Plane, Execution Plane) with an event-driven spine, including a Marketplace API for Docker packages, an Agent Orchestrator API for AI agents with function calling, and Service Discovery via `service-map.yml`. A Creative Studio offers AI-powered content creation. The platform includes a Quick Start Wizard, Universal Builder, App Factory (AI-powered code generation), AI Code Assistant, Deploy Pipelines, Template Marketplace, and Project Manager.

### Auto-Deployment and AI Gateway
An auto-deployment system handles server provisioning and deployment for Docker/PM2. The AI Gateway provides a unified chat interface with provider/model selection, real-time responses, and a circuit breaker for fallback. Local AI services (Ollama, Stable Diffusion, ComfyUI) are automatically discovered via Tailscale.

### AI Node Management and Unified Windows AI Stack
A dedicated dashboard page (`/ai-nodes`) monitors service health, GPU statistics, detects issues, and tracks package versions for local AI services on a Windows VM. A PowerShell script (`Start-NebulaAiStack.ps1`) provides one-command startup for all Windows AI services.

### AI Services and Model Management
APIs are provided for Speech Services (TTS/STT), Job Scheduling, Training, and Embeddings/RAG. A unified model management system via the dashboard and a Windows Model Agent offers model inventory, download management from Civitai/HuggingFace, and VRAM estimates.

### Jarvis AI Orchestrator and Autonomous Development
The Jarvis Orchestrator (`lib/jarvis-orchestrator.ts`) provides multi-agent AI capabilities with a job queue, subagent management, local-first resource selection, and progress tracking. The OpenCode Integration (`lib/opencode-integration.ts`) enables autonomous code development using local AI, prioritizing models like qwen2.5-coder and deepseek-coder for feature development, bug fixing, code review, and refactoring.

### Multi-Environment Bootstrap System
The system auto-configures based on deployment target with zero manual configuration. This includes environment detection, a PostgreSQL-backed service registry with heartbeat, multi-layer fallback peer discovery, a per-node token generation secrets manager, and idempotent bootstrap scripts for Linode, Ubuntu Home, and Windows environments.

### Multi-Node Cluster Management
Jarvis includes full multi-node orchestration capabilities, including auto-discovery of nodes (Linode, Ubuntu Home, Windows VM), capability tracking across nodes, unified execution via SSH or HTTP Agent API, and automated job routing based on capability requirements.

### Nebula Agent (Windows VM Remote Control)
A Node.js/Express agent (`services/nebula-agent`) runs on the Windows VM to receive commands from the dashboard on port 9765 via Tailscale, offering endpoints for health, execution, models, services, and SD model management.

### Command Center
A unified dashboard page (`/command-center`) provides centralized control of all deployment environments, featuring API aggregation, real-time environment cards, a visual topology view, quick actions, and metrics.

### Autonomous Code Generation Pipeline
The system can now generate code autonomously using local Ollama models via an API endpoint (`/api/ai/code`) supporting various job types (feature-request, bug-fix, code-review, refactor) through a 4-step workflow (analyze → plan → implement → validate) with safety features like code staging and automatic backups.

### Remote Deployment Center
A dashboard-based remote deployment and verification system (`/deploy`) supports Linode, Ubuntu Home, and Windows VM, offering actions like trigger_deploy, verify_all, and rollback, with live logs and verification probes.

### Nebula Deployer CLI
A comprehensive CLI tool (`deploy/nebula-deployer/`) provides automated deployment with self-healing capabilities through commands like `deploy`, `setup`, `verify`, `secrets`, and `status`. It features environment detection, 13 verification probes, self-healing remediation, encrypted secret synchronization, and an interactive setup wizard.

### Local Deployment Pipeline and Health Monitoring
The Local Deploy Manager (`lib/local-deploy.ts`) provides secure multi-target deployment to Ubuntu homelab and Windows VM. The Health Monitor (`lib/health-monitor.ts`) tracks system health across all deployment targets for services like Ollama, PostgreSQL, and Docker.

### Notification and Power Management
A Notification Service provides multi-channel alerts. A WoL Relay system (`lib/wol-relay.ts`) enables remote server power control from the cloud.

### Development vs. Production and Replit Modelfarm
The system dynamically adjusts behavior based on environment, integrating with Replit Modelfarm for AI services in Replit and handling SSH keys in PEM format.

### AI Studio - Real-Time Video Generation
A unified AI video generation and streaming control interface (`/ai-studio`) orchestrates motion control, face swap, style transfer, and video generation workflows via an AI Video Pipeline (`lib/ai-video-pipeline.ts`), OBS Controller (`lib/obs-controller.ts`), Motion Capture Bridge (`lib/motion-capture.ts`), Face Swap Service (`lib/face-swap.ts`), and Video Generation Hub (`lib/video-generation.ts`).

### Docker Marketplace and Settings
A Docker marketplace offers over 24 pre-built packages. A comprehensive settings interface manages configurations for AI, servers, and integrations.

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