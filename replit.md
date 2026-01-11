# Nebula Command

## Overview
Nebula Command is a creation engine designed for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It functions as a custom development and automation platform optimized for homelab environments, supporting distributed deployment across cloud and local infrastructure. Its core capabilities include a web-based dashboard for homelab control, a Discord bot for community management, a Stream bot for multi-platform streaming, and hybrid cloud/local AI services.

## User Preferences
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

## System Architecture

### Core Services
The platform is composed of three main services designed for distributed deployment:
*   **Dashboard (Next.js 14):** A web interface for homelab management, featuring real-time statistics, Docker container controls, SSH-based server metrics, deployment pipelines, a Monaco code editor, a visual website designer, and an OpenAI-powered AI chat assistant (Jarvis AI).
*   **Discord Bot (Node.js/React):** A highly customizable "swiss army knife" Discord bot with per-server identity and granular feature toggles for community management (tickets, music, stream notifications, analytics, leveling, giveaways, polls, moderation).
*   **Stream Bot (Node.js/React/Vite):** Handles multi-platform content posting and interaction across Twitch, YouTube, and Kick, supporting OAuth, token encryption, and rate limiting, along with an OBS overlay editor.

### Cross-Service Integration
Services utilize a shared PostgreSQL database and Redis for caching. The Stream Bot uses webhooks for Discord notifications, and the Dashboard and Discord Bot communicate via APIs.

### Deployment Architecture
The system employs a distributed deployment model where a cloud server hosts the Dashboard, Discord Bot, and Stream Bot, while a local Ubuntu Homelab hosts Plex, MinIO, Home Assistant, Ollama, and Stable Diffusion. Tailscale provides secure mesh networking for cloud services to access local homelab resources.

### Database Schema
A shared PostgreSQL instance organizes data into distinct databases for each core service: `homelab_jarvis` (Dashboard), `discord_bot`, and `stream_bot`.

### Platform Architecture Expansion
The system features a three-layer design (Experience, Control Plane, Execution Plane) with an event-driven spine. It includes a Marketplace API for Docker packages, an Agent Orchestrator API for AI agents with function calling, and Service Discovery via a `service-map.yml`. A Creative Studio offers AI-powered content creation with multi-model support (OpenAI GPT-4o, Ollama, Stable Diffusion) and image generation (DALL-E 3).

### Universal Creation Engine
The platform includes:
- **Quick Start Wizard:** One-click creator kits for various user types with pre-configured bundles.
- **Universal Builder:** Allows building various applications (websites, mobile, desktop, bots) with framework and feature selections.
- **App Factory:** Visual project scaffolding with AI-powered code generation.
- **AI Code Assistant:** For code refactoring, debugging, optimization, documentation, and language conversion.
- **Deploy Pipelines:** One-click deployment to Docker/PM2 with real-time logs.
- **Template Marketplace:** Community templates for one-click installation.
- **Project Manager:** For project organization, status tracking, and resource monitoring.

### Auto-Deployment System
Includes a Server Provisioning API for SSH key generation, Docker installation, and Tailscale setup, and a Deployment Execution API for Docker/PM2 deployments with real-time logging.

### AI Gateway Architecture
Features a unified AI Chat interface with provider selection (OpenAI, Ollama), model selection, real-time streaming responses, and a circuit breaker pattern for automatic fallback from local to cloud AI if local services are unavailable. Local AI services (Ollama, Stable Diffusion, ComfyUI) are automatically discovered and configured between Linode and homelab servers using Tailscale.

### Discord Bot Architecture
Features a per-server customization system allowing server admins to configure the bot's identity and enable/disable 16+ toggleable features across 8 categories (moderation, community, engagement, utility, notifications, tickets, media, logging).

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