# StreamBot Dashboard

## Overview
StreamBot is a multi-tenant SaaS platform enabling users to deploy and manage AI-powered chatbots for streaming platforms like Twitch, YouTube, and Kick. These bots generate and post Snapple-style facts, respond to chat commands, and operate on various schedules. The platform focuses on providing isolated environments for each user, ensuring independent bot configurations and secure platform connections. The business vision is to provide a robust, scalable, and user-friendly solution for streamers to enhance viewer engagement with AI-generated content.

## User Preferences
- The user prefers clear and concise explanations.
- The user values modular and maintainable code.
- The user prefers an iterative development approach with frequent updates.
- The user wants to be consulted before any major architectural changes or significant feature implementations.
- The user prefers detailed documentation for new features or complex components.

## System Architecture

### UI/UX Decisions
- **Framework**: React with TypeScript.
- **Routing**: wouter for SPA navigation.
- **UI Components**: Shadcn UI with Radix primitives.
- **Styling**: Tailwind CSS with a custom design system.
- **State Management**: TanStack Query for server state.
- **Real-time**: WebSocket client for live updates.
- **Typography**: Inter (sans-serif) for general text, JetBrains Mono (monospace) for code.
- **Color Scheme**: Primary purple for branding, green for success, red for destructive actions, and gray tones for muted content.
- **Components**: Consistent card styling and interactive elements with hover/active effects. Status indicators combine color, icon, and text for accessibility.

### Technical Implementations
- **Backend Server**: Express.js with TypeScript.
- **Database**: PostgreSQL (Neon serverless) using Drizzle ORM.
- **Authentication**: Passport.js with email/password (local strategy) and PostgreSQL session store.
- **Multi-tenancy**: Data isolation enforced via `userId` foreign keys and API route injection of `req.user.id`.
- **Bot Service**:
    - **BotManager**: Orchestrates user bot instances, manages lifecycle, and WebSocket broadcasting.
    - **BotWorker**: Individual isolated bot instance per user for Twitch client, scheduling, and fact generation.
    - **UserStorage**: User-scoped storage facade for data isolation.
- **Scheduling**: `node-cron` for fixed intervals, custom `setTimeout` for random intervals.
- **AI Integration**: OpenAI GPT models via Replit AI Integrations (no direct API key required for users).
- **Streaming Integration**: 
    - **Twitch**: `tmi.js` for IRC chat connection
    - **YouTube Live**: `googleapis` with Replit YouTube connector for OAuth and Live Chat API
    - **Kick**: `@retconned/kick-js` unofficial library for WebSocket chat (unofficial API)
- **Real-time**: WebSocket server on `/ws` path for live updates and authenticated communication.
- **Containerization**: Docker with multi-stage builds, non-root user, health checks, and proper signal handling.
- **HomelabHub Integration**: Designed for seamless integration with HomelabHub for container orchestration using a comprehensive management script (`./scripts/manage.sh`).

### Feature Specifications
- **Platform Support**: Twitch (full), YouTube Live (full via Replit connector), Kick (full via unofficial library).
- **Posting Modes**: Manual, Fixed Interval, Random Range.
- **AI Generation**: Snapple-style facts (under 200 chars) using customizable prompts and OpenAI models (gpt-5, gpt-5-mini, gpt-4.1-mini).
- **Chat Commands**: Configurable keywords (`!snapple`, `!fact`) for viewers to trigger facts.
- **Real-time Updates**: Live bot status, message history, and activity feed via WebSockets.
- **User Management**: Signup, login, logout, profile management, role-based access control.
- **Dashboard**: Platform connections, bot status, statistics.
- **Quick Trigger**: Manual fact posting.
- **Activity**: Live bot status and recent activity.
- **History**: Searchable, filterable message history with CSV export.
- **Settings**: Comprehensive bot configuration.

### System Design Choices
- **Security**: SESSION_SECRET (cryptographically secure), admin credential change, encrypted OAuth tokens, HTTPS requirement.
- **Scalability**: Multi-tenant architecture with isolated bot instances.
- **Extensibility**: Platform-agnostic design for easy integration of new streaming services.
- **Monitoring**: Health check (`/health`) and diagnostics (`/api/diagnostics`) endpoints.

## External Dependencies
- **Database**: PostgreSQL (via Neon serverless).
- **ORM**: Drizzle ORM.
- **AI Services**: OpenAI (via Replit AI Integrations).
- **Streaming Platform APIs**:
    - **Twitch**: `tmi.js` for IRC chat integration (manual OAuth token via twitchapps.com/tmi)
    - **YouTube Live**: `googleapis` with Replit YouTube connector for OAuth and Live Chat API (connector-managed authentication)
    - **Kick**: `@retconned/kick-js` unofficial WebSocket library (bearer token + cookies authentication)
- **OAuth Providers**: 
    - Twitch: Manual OAuth token input
    - YouTube: Replit connector (automatic token refresh)
    - Kick: Manual bearer token + cookies (unofficial API)
- **Session Store**: `connect-pg-simple` for PostgreSQL session management.

## Recent Changes (November 12, 2025)
- ✅ **CRITICAL FIX: Production build now works in Docker**:
  - Split server/vite.ts into server/http.ts (production) and server/vite.dev.ts (dev-only)
  - server/index.ts now uses dynamic imports for dev code
  - Created esbuild.config.mjs with refined externals (no more vite dependency in production)
  - Fixed ERR_MODULE_NOT_FOUND: Cannot find package 'vite' error
  - Production build tested and verified working
- ✅ **Database provisioning automation**:
  - Created scripts/provision-db.sh for automated database schema sync
  - Supports both DATABASE_URL and STREAMBOT_DATABASE_URL
- ✅ **Major codebase cleanup and unification**:
  - Consolidated .env templates: Single .env.example for all deployment scenarios
  - Simplified scripts/generate-env.sh to create one unified .env file (auto-generates secrets)
  - Merged documentation: SETUP_GUIDE.md now comprehensive
  - **Auto-detection of STREAMBOT_ prefixed variables**: server/env.ts helper automatically falls back to STREAMBOT_* variables
  - Environment variable prefix pattern: STREAMBOT_ for unified homelab deployments (no docker-compose mapping required)
- ✅ Full YouTube Live support via Replit YouTube connector
- ✅ Full Kick support via `@retconned/kick-js` unofficial library
- ✅ Platform-specific connection dialogs (Twitch manual OAuth, YouTube connector-based, Kick manual bearer token)

## Recent Changes (Previous - November 2025)
- ✅ Implemented full YouTube Live support via Replit YouTube connector
- ✅ Created `server/youtube-client.ts` with OAuth2 authentication (no token caching - fresh tokens on every request)
- ✅ Implemented full Kick support via `@retconned/kick-js` unofficial library
- ✅ Added platform-specific connection dialogs (Twitch manual OAuth, YouTube connector-based, Kick manual bearer token)
- ✅ Extended BotWorker with `startYouTubeClient()` and `startKickClient()` methods
- ✅ Updated `postToPlatform()` to handle all three platforms
- ✅ Stored Kick credentials in `connectionData.bearerToken` and `connectionData.cookies`
- ✅ Updated SETUP_GUIDE.md with comprehensive multi-platform setup instructions
- ✅ E2E tests passing for multi-platform connection flows