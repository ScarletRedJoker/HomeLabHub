# Nebula Command

## Overview
Nebula Command is a creation engine for comprehensive homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It provides a unified solution for digital creators and homelab enthusiasts, streamlining content generation, distribution, and community engagement. The platform is optimized for distributed deployment across cloud and local infrastructure, aiming to be a central hub for digital creation and homelab operations.

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
Services share a PostgreSQL database and Redis for caching, communicating via webhooks and APIs. The system employs a three-tier distributed deployment model:
- **Ubuntu Host (Home)**: Windows 11 VM with GPU passthrough for AI services.
- **Linode (Cloud)**: Hosts the Dashboard, Discord bot, and Stream bot.
- **Tailscale**: Provides secure mesh networking between all nodes.

### Platform Architecture
A three-layer design (Experience, Control Plane, Execution Plane) supports:
- A Marketplace API for Docker packages.
- An Agent Orchestrator API for managing AI agents.
- Service Discovery facilitated by `service-map.yml`.
- A Creative Studio for AI content generation.

### AI Node Management
The system monitors service health, GPU statistics, and package versions on AI nodes. It includes APIs for Speech, Job Scheduling, Training, and Embeddings/RAG, with unified model management via the dashboard and a Windows Model Agent.

### Creative Engine
The Creative Studio (`/creative-studio`) supports:
- Text-to-image, Image-to-image, and Inpainting.
- ControlNet, Upscaling, and Face Swap features.
- A database-backed pipeline ensures job persistence.

### Jarvis AI Orchestrator
This multi-agent AI system manages a job queue and subagents, supporting local-first resource selection, progress tracking, and integration with OpenCode for autonomous code development.

### Key Features
- **OOTB Setup Wizard** (`/setup`): Guided configuration for environment, secrets, database, AI, and platform connections.
- **Command Center** (`/command-center`): Unified control across all environments.
- **Deploy Center** (`/deploy`): Remote deployment and verification.
- **Services Manager** (`/services`): Container and service management.
- **Secrets Manager** (`/secrets-manager`): Secure credential management.
- **Jarvis AI** (`/jarvis`): AI chat assistant with tool calling.
- **Creative Studio** (`/creative`): AI image generation with ComfyUI/SD.
- **AI Models** (`/ai-models`): Model marketplace and management.
- **Workflows** (`/workflows`): Multi-step AI automation.
- **Agent Builder** (`/agents`): Custom AI agent configuration.
- **Pipelines** (`/pipelines`): Deployment automation.
- **Bot Editor** (`/bot-editor`): Discord bot customization.
- **Servers** (`/servers`): Server monitoring and control.
- **Windows VM** (`/windows`): GPU server management.
- **Domains** (`/domains`): DNS and SSL management.
- **Marketplace** (`/marketplace`): Docker package installation.

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

## Recent Changes

- **January 27, 2026**: ComfyUI Service Supervisor (Production Stability):
  - New supervisor module (`lib/ai/comfyui-supervisor.ts`): Port collision prevention, startup locking, process lifecycle management
  - Windows Agent integration: Uses existing `/ai/start/comfyui`, `/ai/stop/comfyui`, `/ai/restart/comfyui` endpoints
  - HTTP-based health checks instead of local port binding (works with remote Windows VM)
  - Lock file mechanism (`/tmp/comfyui-supervisor.lock`) to prevent duplicate instances
  - Automatic restart on crash (max 3 attempts with 5s cooldown)
  - Supervisor states: IDLE, CHECKING_HEALTH, ACQUIRING_LOCK, STARTING, RUNNING, RESTARTING, STOPPING, ERROR
  - API endpoint (`/api/ai/comfyui/supervisor`): ensure-running, check-agent, start/stop/restart-service, health-check
  - Safe wrapper functions in comfyui-manager.ts: safeCheckHealth(), safeGetReadinessInfo(), safeWaitForReady()
  - Works headlessly on Windows and Linux without manual intervention
  - Event emitter for running, starting, stopping, restarting, unhealthy, recovered, degraded, error events

- **January 27, 2026**: Centralized IP Configuration (Zero Hardcoded IPs):
  - Enhanced `lib/ai/config.ts` with WindowsVMConfig interface: ip, nebulaAgentUrl, nebulaAgentPort, isConfigured
  - Added helper functions: getWindowsVMIP_safe(), requireWindowsVMIP(), buildServiceUrl(), requireServiceUrl()
  - Runtime fallback warnings via warnFallback() for each service (logs once per service per session)
  - Updated 50+ files across lib/, API routes, and UI components to use getAIConfig()
  - Pattern: `config.windowsVM.ip` (nullable), `config.ollama.url`, `config.stableDiffusion.url`, `config.comfyui.url`
  - UI components show "Not configured" instead of hardcoded IPs when unconfigured
  - Env schema examples updated to generic "100.x.x.x" placeholders
  - Verified: grep confirms 0 remaining hardcoded "100.118.44.102" references
  - Supports Docker, Windows, Linux, Tailscale, LAN, and remote access without code changes

- **January 27, 2026**: ComfyUI Full Integration (Automation-Ready):
  - Database schema: `comfyui_workflows` and `comfyui_jobs` tables for workflow persistence and job tracking
  - Service Manager (`lib/ai/comfyui-manager.ts`): State detection (OFFLINE/STARTING/LOADING_MODELS/READY/DEGRADED), VRAM monitoring, readiness polling
  - Job Orchestrator (`lib/ai/comfyui-orchestrator.ts`): Workflow execution, exponential backoff retry (1s-16s), batch processing, job persistence
  - API Endpoints (`/api/ai/comfyui/*`): status, queue, workflows CRUD, execute, jobs, retry, batch
  - Dashboard UI (`/comfyui`): Status card, workflow management, job list, execution dialogs
  - Supports headless/remote operation via `COMFYUI_URL` environment variable
  - Future-ready for AI influencer pipelines, content factories, scheduled jobs

- **January 27, 2026**: AI Developer - Autonomous Code Modification System:
  - Database schema: `ai_dev_jobs`, `ai_dev_patches`, `ai_dev_approvals`, `ai_dev_runs`, `ai_dev_providers` tables
  - Provider Registry (`lib/ai/ai-dev/provider-registry.ts`): Multi-provider support (Ollama default, OpenAI, Anthropic)
  - Tool Interfaces (`lib/ai/ai-dev/tools.ts`): read_file, write_file, search_files, search_code, run_command, run_tests, git_diff
  - Repo Manager (`lib/ai/ai-dev/repo-manager.ts`): Diff generation, patch apply/rollback, git operations
  - Orchestrator (`lib/ai/ai-dev/orchestrator.ts`): Job lifecycle (pending→planning→executing→review→approved→applied), tool calling loop
  - API Endpoints (`/api/ai/dev/*`): jobs CRUD, job actions (execute/approve/reject/rollback), providers health, patches, approvals
  - Dashboard UI (`/ai-dev`): Job queue, create job dialog, diff viewer, approval workflow, provider health
  - Safeguards: Human approval gates, rollback support, path sandboxing, dangerous command blocking
  - No cloud lock-in: Works locally with Ollama, configurable via environment variables

- **January 27, 2026**: Production hardening - AI service configuration and logging:
  - Created centralized AI config system (lib/ai/config.ts) - environment-first configuration
  - Environment variables: WINDOWS_VM_TAILSCALE_IP, OLLAMA_URL, STABLE_DIFFUSION_URL, COMFYUI_URL
  - Implemented structured AI logging (lib/ai/logger.ts) for all AI operations with correlation IDs
  - Startup validation in instrumentation.ts for AI configuration
  - Dashboard error boundaries with context-aware guidance

- **January 27, 2026**: Automated Deployment and Node Auto-Configuration:
  - Bootstrap scripts: `deploy/unified/bootstrap.sh` (Linux), `deploy/unified/bootstrap.ps1` (Windows)
  - Hardware detection: GPU (NVIDIA/AMD/Intel), VRAM, CUDA/ROCm, RAM, disk, network interfaces
  - Dynamic per-node config: `deploy/unified/state/<node-id>/` with hardware-profile.json, .env, service configs
  - Auto-configures Ollama, ComfyUI, Stable Diffusion based on detected capabilities
  - Service supervision: systemd (Linux), NSSM (Windows) with auto-restart
  - Node registration API: `/api/nodes/register` for multi-node service discovery
  - Supports GPU (8GB+, 4-8GB, <4GB VRAM) and CPU-only deployments
  - One-command deployment: works on Windows and Linux with no cloud dependency

- **January 27, 2026**: Dashboard Reliability & Observability (Production UI):
  - AI Service Status component (`app/(dashboard)/components/ai-service-status.tsx`): Real-time status indicators for Ollama, SD, ComfyUI, OpenAI
  - Retry hook (`lib/hooks/use-retry-fetch.ts`): Exponential backoff (2s→4s→8s), max 3 retries, 10s timeout
  - Service availability context (`lib/hooks/use-service-availability.tsx`): Provider for feature availability state
  - Feature gating components (`components/feature-gate.tsx`): FeatureGate, FeatureGatedButton, FeatureStatusBadge
  - Auto-refresh every 30s with countdown timer
  - No silent failures: all errors surface with clear messages
  - No infinite loading: timeout after 10 seconds with explanation
  - Progressive loading states with skeletons and spinners
  - Debug panel with latency, GPU VRAM, troubleshooting steps
  - Non-technical UX: "AI Chat Ready", "All Systems Operational"
  - Fixed TypeScript build errors for production deployment

- **January 27, 2026**: Build-time Safety for Production Deployment:
  - Made database connection lazy-initialized (`lib/db/index.ts`): Uses Proxy pattern to defer connection
  - Added `isBuildTime()` check: Detects `NEXT_PHASE=phase-production-build` or missing DATABASE_URL
  - Suppressed AI config warnings during build: No more "[AIConfig] ... not set" spam in build logs
  - Fixed instrumentation.ts: Skips all initialization during build phase
  - Fixed ai-orchestrator.ts, speech/tts.ts, speech/stt.ts: Build-time guards on console logs
  - Result: Clean Linode Docker builds without database/service connection errors

- **January 27, 2026**: Deploy Script Consolidation:
  - Removed 7 duplicate/deprecated bootstrap scripts (~5,700 lines)
  - Removed: `deploy/scripts/bootstrap.sh`, `bootstrap-linode.sh`, `bootstrap-local.sh`
  - Removed: `deploy/local/scripts/bootstrap-local.sh`, `deploy/linode/bootstrap.sh`
  - Removed: Root-level `deploy-production.sh`, `bootstrap-homelab.sh`
  - Kept: `deploy/linode/deploy.sh`, `deploy/local/deploy.sh`, `deploy/unified/bootstrap.sh`
  - Audit report: `var/reports/deploy-scripts-audit.md`

- **January 27, 2026**: AI Influencer / Video Automation Pipeline:
  - Database schema: `influencer_personas`, `content_pipelines`, `video_projects`, `content_pipeline_runs`, `content_templates`, `monetization_events`, `scheduled_jobs`
  - Pipeline Orchestrator (`lib/ai/influencer-pipeline.ts`): Script generation, prompt chaining, frame generation, batch processing
  - API Endpoints (`/api/ai/influencer/*`): personas CRUD, pipelines CRUD, projects CRUD, execute endpoint
  - Dashboard UI (`/influencer`): Persona management, pipeline configuration, video project tracking
  - Features:
    - Character persistence via LoRA/embeddings and style prompts
    - Script-to-video pipelines with ComfyUI integration
    - Prompt chaining for multi-shot video generation
    - Batch content generation with concurrency control
    - Cron-based scheduling for automated content
    - Monetization hooks for revenue tracking

- **January 27, 2026**: Future-Proofing Architecture for Games, AR/VR, and Simulation:
  - Core Interfaces (`lib/core/interfaces/`): IService, IAIService, IRenderingService, IPipeline, IExtension
  - Service Registry (`lib/core/registry/`): Dynamic service discovery, capability matching, remote node registration
  - Extension System (`lib/core/extensions/`): Plugin architecture for game engines, AR/VR runtimes, simulation engines, rendering backends
  - Real-Time Pipelines (`lib/core/pipelines/`): IRealtimeRenderingPipeline, IXRRenderingPipeline, IStreamingRenderPipeline
  - Extension Types: game-engine, ar-vr-runtime, simulation-engine, rendering-backend, content-pipeline, ai-provider
  - Design Principles: Interface segregation, dependency inversion, open/closed, build-time safety
  - Architecture Documentation: `ARCHITECTURE.md` with extension guides and roadmap
  - Ready for: Unity/Unreal integration, WebXR, Physics engines, WebGPU rendering