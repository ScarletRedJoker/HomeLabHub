# Nebula Command

## Overview
Nebula Command is a creation engine for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It provides a comprehensive, integrated solution for managing homelabs, fostering online communities, and streamlining content creation and distribution, optimized for distributed deployment across cloud and local infrastructure. Its key capabilities include a web-based dashboard, a Discord bot, a Stream bot, and hybrid AI services. The project aims to provide a unified platform for digital creators and homelab enthusiasts, offering market potential in automation, content generation, and community engagement.

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
*   **Ubuntu Host (Home):** KVM/libvirt hypervisor running Windows 11 VM with GPU passthrough. Provides NAS connections, Plex media server, remote torrenting (Transmission), VNC/RDP access (TigerVNC, xrdp), and local networking.
*   **Windows 11 VM (KVM Guest):** GPU-accelerated AI services (Ollama, Stable Diffusion, ComfyUI) accessed from dashboard via Tailscale. Uses Sunshine for low-latency GPU streaming.
*   **Linode (Cloud):** Hosts the Nebula Command dashboard, Discord bot, and stream bot. Public-facing services with Caddy reverse proxy.
Tailscale provides secure mesh networking across all nodes. The database schema organizes data into distinct databases for each core service.

### Platform Architecture
The system features a three-layer design (Experience, Control Plane, Execution Plane) with an event-driven spine, including a Marketplace API for Docker packages, an Agent Orchestrator API for AI agents with function calling, and Service Discovery via `service-map.yml`. A Creative Studio offers AI-powered content creation. The platform includes a Quick Start Wizard, Universal Builder, App Factory (AI-powered code generation), AI Code Assistant, Deploy Pipelines, Template Marketplace, and Project Manager.

### Auto-Deployment and AI Gateway
An auto-deployment system handles server provisioning and deployment for Docker/PM2, including preflight checks, secret generation, and continuous monitoring. The AI Gateway provides a unified chat interface with provider/model selection, real-time responses, and a circuit breaker for fallback. Local AI services (Ollama, Stable Diffusion, ComfyUI) are automatically discovered via Tailscale.

### AI Node Management and Unified Windows AI Stack
A dedicated dashboard page (`/ai-nodes`) monitors service health, GPU statistics, detects issues, and tracks package versions for local AI services on a Windows VM. It offers one-click repair actions. A PowerShell script (`Start-NebulaAiStack.ps1`) provides one-command startup for all Windows AI services, including Python and PyTorch validation, ordered service start, and auto-start on boot.

### AI Services and Model Management
APIs are provided for Speech Services (TTS/STT), Job Scheduling, Training, and Embeddings/RAG. A unified model management system via the dashboard and a Windows Model Agent offers model inventory, download management from Civitai/HuggingFace, and VRAM estimates. The Model Registry (`lib/model-registry.ts`) manages local models and integrates with HuggingFace and Civitai for browsing and downloading.

### Jarvis AI Orchestrator and Autonomous Development
The Jarvis Orchestrator (`lib/jarvis-orchestrator.ts`) provides multi-agent AI capabilities with a job queue, subagent management, local-first resource selection, and progress tracking. It includes tools for image/video generation, Docker actions, deployment, code management, and AI service checks. The OpenCode Integration (`lib/opencode-integration.ts`) enables autonomous code development using local AI, prioritizing models like qwen2.5-coder and deepseek-coder for feature development, bug fixing, code review, and refactoring.

### Multi-Node Cluster Management (NEW - January 2026)
Jarvis now includes full multi-node orchestration capabilities:
*   **Node Registration**: Auto-discovers Linode, Ubuntu Home, and Windows VM from server-config-store
*   **Capability Tracking**: 150+ capabilities mapped across nodes (AI, Docker, VM management, etc.)
*   **Unified Execution**: `executeOnNode()` uses SSH for Linux servers, HTTP Agent API for Windows VM
*   **Job Routing**: Automatically routes tasks to the best node based on capability requirements
*   **Cluster Tools**: 6 new Jarvis tools - `get_cluster_status`, `execute_on_node`, `wake_node`, `route_ai_task`, `get_node_capabilities`, `manage_vm`

### Nebula Agent (Windows VM Remote Control)
A Node.js/Express agent (`services/nebula-agent`) runs on the Windows VM to receive commands from the dashboard:
*   **Port**: 9765 (Tailscale accessible)
*   **Auth**: Bearer token (NEBULA_AGENT_TOKEN)
*   **Endpoints**: `/api/health`, `/api/execute`, `/api/models`, `/api/services`, `/api/git`
*   **SD Model Management**: `/api/sd/status`, `/api/sd/models`, `/api/sd/switch-model`
*   **PM2 Managed**: Auto-starts on boot via PM2

### Autonomous Code Generation Pipeline (NEW - January 2026)
The system can now generate code autonomously using local Ollama models:
*   **API Endpoint**: `/api/ai/code` with actions: generate, review, apply, reject, rollback
*   **Job Types**: feature-request, bug-fix, code-review, refactor
*   **4-Step Workflow**: analyze → plan → implement → validate
*   **Safety Features**: Code staging system, automatic backups, diff preview before apply
*   **UI**: Jarvis page includes code generation panel with job type selector and workflow tracking

### Local Deployment Pipeline and Health Monitoring
The Local Deploy Manager (`lib/local-deploy.ts`) provides secure multi-target deployment to Ubuntu homelab and Windows VM, including Git operations, service restarts, rollbacks, and health checks. The Health Monitor (`lib/health-monitor.ts`) tracks system health across all deployment targets (Windows VM, Linode, Ubuntu, Replit) for services like Ollama, PostgreSQL, and Docker, detecting issues and offering auto-fix options.

### Notification and Power Management
A Notification Service provides multi-channel alerts with severity levels, deduplication, and actionable buttons. A WoL Relay system (`lib/wol-relay.ts`) enables remote server power control from the cloud, using the Ubuntu homelab to wake the Windows VM.

### Development vs. Production and Replit Modelfarm
The system dynamically adjusts behavior based on environment detection (Replit vs. Linode). In Replit, the dashboard integrates with Replit Modelfarm for AI services, specifically supporting models like gpt-4o and gpt-image-1, with immediate "connected" status. SSH key handling requires PEM format private keys, with dashboard attempts at automatic conversion.

### Docker Marketplace and Settings
A Docker marketplace offers over 24 pre-built packages for one-click deployment. A comprehensive settings interface manages configurations for AI, servers, and integrations, including connection testing.

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