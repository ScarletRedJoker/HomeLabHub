# Nebula Command

## Overview
Nebula Command is a creation engine for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It provides a unified solution for digital creators and homelab enthusiasts, streamlining content generation, distribution, and community engagement. The platform is optimized for distributed deployment across cloud and local infrastructure, aiming to be a central hub for digital creation and homelab operations, with future potential for integration with games, AR/VR, and simulation environments.

## User Preferences
- **Development Workflow:** Edit locally → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit)

## System Architecture

### Core Services
- **Dashboard (Next.js 14):** Web interface for homelab management, Docker controls, SSH metrics, deployment pipelines, code editor, visual website designer, and Jarvis AI assistant.
- **Discord Bot (Node.js/React):** Customizable bot for community management.
- **Stream Bot (Node.js/React/Vite):** Multi-platform content posting across Twitch, YouTube, and Kick.
- **Nebula Agent (Node.js/Express):** Runs on Windows VM for health monitoring, command execution, model management, and service control.

### Cross-Service Integration and Deployment
Services share a PostgreSQL database and Redis for caching, communicating via webhooks and APIs. The system employs a three-tier distributed deployment model leveraging Ubuntu Host (Home) for AI services, Linode (Cloud) for core web and bot services, and Tailscale for secure mesh networking.

### Platform Architecture
A three-layer design (Experience, Control Plane, Execution Plane) supports a Marketplace API for Docker packages, an Agent Orchestrator API for managing AI agents, and Service Discovery via `service-map.yml`. It includes a Creative Studio for AI content generation and a Jarvis AI Orchestrator for multi-agent job management and autonomous code development.

### AI Node Management & Creative Engine
The system monitors AI node health and performance, featuring APIs for Speech, Job Scheduling, Training, and Embeddings/RAG. The Creative Studio supports advanced AI image generation (text-to-image, image-to-image, inpainting, ControlNet, upscaling, face swap) with job persistence. A ComfyUI Service Supervisor ensures robust operation of the image generation pipeline.

### AI Training System (Database-Backed)
- **Training Run Manager:** Full lifecycle management for LoRA, QLoRA, SDXL, and DreamBooth training jobs with database persistence
- **Progress Tracking:** Real-time epoch/step progress, loss metrics, and checkpoint management stored in PostgreSQL
- **Event Bus:** SSE-based real-time event streaming with persistent event history
- **Run Lifecycle:** Create, start, update, complete, fail, cancel operations with full audit trail

### GPU Job Scheduler (Database-Backed)
- **Job Queue:** PostgreSQL-backed priority queue with status tracking (queued, running, completed, failed)
- **VRAM Manager:** Lock-based VRAM allocation with automatic cleanup of stale locks
- **Fair Scheduling:** Multi-node support with utilization-aware job assignment
- **Heartbeat System:** Automatic detection and release of orphaned GPU locks

### GPU VRAM Orchestrator (RTX 3060 12GB)
Smart resource management preventing OOM errors by ensuring only compatible services run simultaneously:
- **VRAM Tracking:** Real-time monitoring of GPU memory usage
- **Smart Switching:** Automatically unloads models before loading new ones (e.g., unload Ollama before starting Stable Diffusion)
- **Service Budgets:** Ollama 3B (~2.5GB), Ollama 8B (~5.5GB), SD/ComfyUI (~6-8GB)
- **Compatible Combinations:** Ollama 3B + Embeddings (4GB), or standalone Ollama 8B/SD/ComfyUI
- **API Endpoint:** `/api/gpu/orchestrator` for status and switching
- **Jarvis Integration:** Ask "switch to Stable Diffusion" or "check GPU status" via chat

### AR/VR & 3D Development
- **AR/VR Studio:** Immersive content creation hub with motion capture, 3D asset pipeline, and VR/AR platform targeting (Quest, SteamVR, Vision Pro, WebXR).
- **Motion Capture Bridge:** 933-line library supporting MediaPipe, OpenPose, mocap devices, pose/hands/face/holistic tracking for ControlNet/AnimateDiff.
- **3D Asset Pipeline:** Texture generation via Stable Diffusion, UV map workflows, normal/height/AO map generation, material library.
- **ComfyUI Integration:** 633-line client for video generation, AnimateDiff, progress tracking, queue management.

### Progress Sync & Cloud Storage
- **Cross-Device Progress Sync:** Pick up exactly where you left off from any device
- **User Progress Table:** Stores current module, active project, UI state, workspace state, recent assets
- **Auto-Save:** Debounced saves (2s delay) + periodic sync (every 30s) + saves on page close
- **Cloud Asset Storage:** Photos and generated images sync to Replit Object Storage (GCS-backed)
- **Asset Ownership:** All creative assets tied to user accounts for secure access
- **Session Restoration:** Automatically restores last active module, project, and UI state on login
- **API Endpoints:** `/api/sync/progress` (GET/POST/DELETE), `/api/sync/assets` (upload URL generation)

### Key Features
- **OOTB Setup Wizard:** Guided platform configuration.
- **Command Center & Deploy Center:** Unified control and remote deployment.
- **Services & Secrets Manager:** Container, service, and credential management with environment comparison (Replit vs Production).
- **User Management:** Role-based user management (admin, developer, viewer, client) with CRUD operations.
- **Module Permissions:** Configurable role-based access control for dashboard modules.
- **Jarvis AI & Creative Studio:** AI chat assistance and advanced image generation.
- **AI Models & Workflows:** Model marketplace, management, and multi-step AI automation.
- **Agent Builder & Pipelines:** Custom AI agent configuration and deployment automation.
- **Bot Editor & Servers:** Discord bot customization and server monitoring.
- **Windows VM & AI Deployment:** GPU server management with one-click AI service deployment (Ollama, ComfyUI, Stable Diffusion), model management, GPU health monitoring, and auto-start configuration.
- **Marketplace:** Docker package installation.
- **AI Developer:** Autonomous code modification with local LLM (Ollama), Git branch isolation, auto-approval rules, build verification, remote execution, context management, and human approval gates.
- **AI Influencer / Video Automation Pipeline:** Fully automated content generation with ComfyUI-based image sequences, AnimateDiff video generation, script-to-video workflows, batch generation, cron-based scheduling, FFmpeg video assembly, and structured asset storage.
- **Automated Deployment and Node Auto-Configuration:** Bootstrap scripts for dynamic, hardware-aware configuration of AI services (Ollama, ComfyUI, Stable Diffusion) on various nodes.

### Deployment System
- **One-Command Deployment:** Simplified installation for Linux and Windows.
- **Hardware Auto-Detection:** Automatically detects GPU, VRAM, CUDA/ROCm, CPU, RAM, disk space, and Tailscale IP.
- **Service Auto-Configuration:** Configures Ollama, ComfyUI, and Stable Diffusion based on detected hardware and generates `service-map.yml`.
- **Service Supervision:** Uses Task Scheduler (Windows) or Systemd (Linux) with a health daemon for auto-restart and monitoring.

### Observability System
Includes a comprehensive observability layer for production monitoring, alerting, and incident management with metrics for AI usage, GPU, jobs, queue depths, and service health. Features an alert manager, automatic incident creation, and a dashboard for real-time status and historical data. All observability data is persisted to PostgreSQL tables: `system_metrics`, `system_alerts`, `incidents`, `incident_events`, `failure_records`, and `failure_aggregates`.

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