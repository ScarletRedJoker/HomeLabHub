# Nebula Command

## Overview
Nebula Command is a creation engine designed for comprehensive homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It provides a unified, integrated solution for digital creators and homelab enthusiasts, streamlining content generation, distribution, and community engagement. The platform is optimized for distributed deployment across cloud and local infrastructure, offering significant market potential in automation, content generation, and community management.

## User Preferences
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

## System Architecture

### Core Services
The platform is built around three distributed core services:
*   **Dashboard (Next.js 14):** A web interface for homelab management, Docker controls, SSH metrics, deployment pipelines, a code editor, a visual website designer, and an OpenAI-powered AI chat assistant (Jarvis AI).
*   **Discord Bot (Node.js/React):** A customizable bot for community management with per-server identity and granular feature toggles.
*   **Stream Bot (Node.js/React/Vite):** Manages multi-platform content posting and interaction across Twitch, YouTube, and Kick.

### Cross-Service Integration and Deployment
Services share a PostgreSQL database and Redis for caching, communicating via webhooks and APIs. The system uses a three-tier distributed deployment model: an Ubuntu Host (Home) running a Windows 11 VM with GPU passthrough, and Linode (Cloud) hosting the Nebula Command dashboard, Discord bot, and stream bot. Tailscale provides secure mesh networking.

### Platform Architecture
The system features a three-layer design (Experience, Control Plane, Execution Plane) with an event-driven spine, including a Marketplace API for Docker packages, an Agent Orchestrator API for AI agents with function calling, and Service Discovery via `service-map.yml`. A Creative Studio offers AI-powered content creation. Key features include a Quick Start Wizard, Universal Builder, App Factory (AI-powered code generation), AI Code Assistant, Deploy Pipelines, Template Marketplace, and Project Manager.

### Auto-Deployment and AI Gateway
An auto-deployment system handles server provisioning and deployment for Docker/PM2. The AI Gateway provides a unified chat interface with provider/model selection, real-time responses, and a circuit breaker for fallback. Local AI services (Ollama, Stable Diffusion, ComfyUI) are automatically discovered via Tailscale.

### AI Node Management and Unified Windows AI Stack
A dedicated dashboard page monitors service health, GPU statistics, and package versions for local AI services on a Windows VM. A PowerShell script (`Start-NebulaAiStack.ps1`) provides one-command startup for all Windows AI services. APIs are provided for Speech Services, Job Scheduling, Training, and Embeddings/RAG. A unified model management system via the dashboard and a Windows Model Agent offers model inventory and download management.

### Creative Engine
A content generation system at `/creative-studio` offers six generation modes (Text-to-image, Image-to-image, Inpainting, ControlNet, Upscaling, Face Swap) utilizing local AI (Stable Diffusion WebUI on Windows VM). It includes advanced features like ControlNet, ReActor face swap, ESRGAN upscaling, and a database-backed pipeline system for job persistence.

### Jarvis AI Orchestrator and Autonomous Development
The Jarvis Orchestrator provides multi-agent AI capabilities with a job queue, subagent management, local-first resource selection, and progress tracking. The OpenCode Integration enables autonomous code development using local AI, prioritizing models for feature development, bug fixing, code review, and refactoring.

### Jarvis Agent Configuration System
A system at `/agent-builder` allows deep customization of AI agents with unique personas, system prompts, tool permissions, model selection, and node affinity. It includes five built-in agents: Jarvis Prime, Security Sentinel, Creative Director, Code Architect, and DevOps Commander.

### Jarvis Workflow Automation
A multi-step AI workflow system at `/api/jarvis-workflows` supports workflow templates, various step types (ai-text, ai-image, security-scan, code-analysis, service-check), variable interpolation, and trigger types (manual, schedule, webhook, event-based). It includes five built-in templates: Content Pipeline, Security Audit, Code Review, Deployment Verification, and Creative Brainstorm.

### Creative Ideation Studio
An AI-powered brainstorming and concept generation tool at `/ideation` features an Idea Canvas, Brainstorm Mode, Moodboard Builder, Concept Generator, and session history.

### Jarvis Security & Verification
Output validation and content moderation at `/api/security` includes pattern-based content filtering (block, warn, log, redact) with five built-in rules (PII Detector, Profanity Filter, Code Injection, Rate Limiter, API Key Detector) and event logging.

### Multi-Environment Bootstrap System and Multi-Node Cluster Management
The system auto-configures based on deployment target with environment detection, a PostgreSQL-backed service registry, multi-layer fallback peer discovery, and idempotent bootstrap scripts. Jarvis includes full multi-node orchestration with auto-discovery, capability tracking, unified execution via SSH or HTTP Agent API, and automated job routing.

### Nebula Agent
A Node.js/Express agent (`services/nebula-agent`) runs on the Windows VM to receive commands from the dashboard on port 9765 via Tailscale, offering endpoints for health, execution, models, and services.

### Command Center
A unified dashboard page (`/command-center`) provides centralized control of all deployment environments, featuring API aggregation, real-time environment cards, a visual topology view, quick actions, and metrics.

### Autonomous Code Generation Pipeline
The system generates code autonomously using local Ollama models via an API endpoint (`/api/ai/code`) supporting various job types through a 4-step workflow (analyze → plan → implement → validate) with safety features.

### Remote Deployment Center
A dashboard-based remote deployment and verification system (`/deploy`) supports Linode, Ubuntu Home, and Windows VM, offering actions like `trigger_deploy`, `verify_all`, and `rollback`, with live logs and verification probes.

### Nebula Deployer CLI
A comprehensive CLI tool (`deploy/nebula-deployer/`) provides automated deployment with self-healing capabilities through commands like `deploy`, `setup`, `verify`, `secrets`, and `status`.

### Local Deployment Pipeline and Health Monitoring
The Local Deploy Manager provides secure multi-target deployment. The Health Monitor tracks system health across all deployment targets for services like Ollama, PostgreSQL, and Docker.

### Notification and Power Management
A Notification Service provides multi-channel alerts. A WoL Relay system enables remote server power control from the cloud.

### Development vs. Production and Replit Modelfarm
The system dynamically adjusts behavior based on the environment, integrating with Replit Modelfarm for AI services in Replit.

### AI Studio - Real-Time Video Generation
A unified AI video generation and streaming control interface (`/ai-studio`) orchestrates motion control, face swap, style transfer, and video generation workflows via an AI Video Pipeline, OBS Controller, Motion Capture Bridge, Face Swap Service, and Video Generation Hub.

### Docker Marketplace and Settings
A Docker marketplace offers over 24 pre-built packages. A comprehensive settings interface manages configurations for AI, servers, and integrations.

### Project Inventory and Remote Management
The `/api/inventory` endpoint provides real-time visibility across all deployment nodes (Docker, PM2, Git, System metrics). The `/api/inventory/execute` endpoint enables bulk remote operations (git-pull, docker-restart, npm-install, pm2-reload) and custom command execution.

### Content Hub
A unified `/content-hub` page consolidates Docker marketplace apps, AI models (Ollama/SD), project templates, and custom repository sources (Civitai, HuggingFace, GitHub, Docker Hub).

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