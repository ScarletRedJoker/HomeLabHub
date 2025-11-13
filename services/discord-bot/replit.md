# Discord Ticket Bot

## Overview
A production-ready Discord bot and web dashboard for creating and managing support tickets. The system features real-time ticket management, Discord thread integration, and resilient database connectivity. It aims to provide a comprehensive and user-friendly solution for Discord community support.

## User Preferences
### Coding Style
- Clean, modular code
- Comprehensive comments explaining "why"
- TypeScript for type safety
- React best practices
- RESTful API design

### Development Approach
- Focus on MVP (Minimum Viable Product)
- User-friendly interfaces
- Clear, descriptive UI elements
- Easy-to-understand settings
- Production-ready documentation

## System Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript.
- **UI Library**: shadcn/ui components with Tailwind CSS for Discord-themed dark mode.
- **State Management**: TanStack React Query with WebSocket integration for real-time updates.
- **Routing**: Wouter.
- **UI/UX Decisions**: Simplified single-server dashboard view (Overview, Panels), streamlined settings page, comprehensive embed template creator, real-time message updates, responsive design.

### Backend (Node.js + Express)
- **Framework**: Express.js with TypeScript.
- **Database ORM**: Drizzle ORM.
- **Authentication**: Discord OAuth2 with Passport.js.
- **Sessions**: Express-session with PostgreSQL store.
- **WebSockets**: `ws` library for real-time updates.
- **Discord Bot**: discord.js v14 for bot functionality, including slash commands and multi-server support.
- **Core Features**:
    - **Ticket System**: Creation, management, categorization, prioritization, assignment, and resolution of tickets with real-time messaging and action tracking.
    - **Dashboard**: Role-aware interface with ticket statistics, search, filter, and new ticket creation.
    - **Admin Features**: Comprehensive settings (bot, server, panel, categories, permissions), staff assignment, ticket moderation, and audit logging.
    - **Bot Features**: Slash commands, interactive embeds/buttons, multi-server support, ticket notifications, and moderation action buttons.
    - **Developer Toolkit**: Developer-only slash commands and a hidden dashboard (`/dev` route) for system monitoring, Docker management, database tools (SQL runner with 4-layer security), bot management, analytics, and audit logs.
    - **Role Permissions**: Discord role-based access control.
    - **Embed Templates**: Custom embed template system with visual creator and interactive elements.
    - **Moderation Actions**: Discord embed buttons for quick actions (assign, close, pending, ban, warn) and admin-only ticket deletion.
    - **Onboarding Wizard**: Multi-step guided setup for bot invitation and server selection.
    - **Discord Thread Integration**: Bidirectional synchronization between Discord threads and dashboard tickets, including auto-creation and message/status syncing.
    - **Bot Customization**: Per-server bot nickname configuration.
    - **Homelabhub Orchestration**: Docker-based service discovery with API endpoints for monitoring, metrics, and control (see HOMELABHUB_INTEGRATION.md for details).

### Database (PostgreSQL)
- **Provider**: Neon (Replit's built-in PostgreSQL) or standard PostgreSQL, with automatic driver detection.
- **ORM**: Drizzle ORM.
- **Migrations**: `npm run db:push` for schema synchronization.
- **Key Tables**: discordUsers, servers, serverSettings, tickets, ticketMessages, ticketCategories, threadMappings, embedTemplates, panelTemplates, serverRolePermissions, developers.

### Production Deployment
- **Containerization**: Multi-stage Dockerfile using `node:20-slim`.
- **Orchestration**: Docker Compose for full-stack deployment with Docker labels for service discovery.

### Homelabhub Integration
- **Service Discovery**: Docker labels enable automatic discovery by homelabhub dashboard
- **API Endpoints**:
  - `GET /api/homelabhub/metrics` - Real-time bot statistics (guilds, users, channels, uptime, system metrics)
  - `POST /api/homelabhub/control` - Bot control (status, restart, refresh-cache, health-check)
  - `GET /api/homelabhub/status` - Quick status check
- **Security**: API key authentication required (`HOMELABHUB_API_KEY` environment variable)
- **Docker Labels**: Service metadata, web URLs, API endpoints, display preferences
- **Documentation**: See `HOMELABHUB_INTEGRATION.md` for complete integration guide with Python/JavaScript examples

## External Dependencies

- **Discord API**: For OAuth2 authentication, bot interactions, and real-time events.
- **PostgreSQL (Neon)**: Primary database.
- **TanStack React Query**: For frontend data fetching and caching.
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: Component library.
- **react-markdown**: Markdown rendering.
- **rehype-sanitize**: XSS protection for markdown.
- **multer**: File upload handling.
- **dockerode**: For Docker API communication in the developer dashboard.

## Production Security Hardening

### SQL Query Runner - Read-Only Database Role (Recommended)

The Developer Dashboard SQL query runner currently uses a 4-layer security approach:
1. Multi-statement query blocking (semicolon check)
2. Query type whitelist (SELECT, SHOW, EXPLAIN, DESCRIBE, WITH)
3. Dangerous keyword blacklist (DROP, DELETE, INSERT, UPDATE, ALTER, SET, INTO, etc.)
4. Read-only database connection (defense-in-depth)

**Limitation**: String-based SQL validation is inherently imperfect and can potentially be bypassed.

**Recommended Production Hardening**: Create a dedicated PostgreSQL role with true SELECT-only privileges.

#### Step-by-Step Instructions:

```bash
# 1. Access Docker PostgreSQL container
docker exec -it discord-bot-db psql -U ticketbot -d ticketbot

# 2. Create read-only role with a secure password
CREATE ROLE readonly_dev WITH LOGIN PASSWORD 'CHANGE_THIS_TO_SECURE_RANDOM_PASSWORD';

# 3. Grant minimal privileges
GRANT CONNECT ON DATABASE ticketbot TO readonly_dev;
GRANT USAGE ON SCHEMA public TO readonly_dev;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_dev;

# 4. Ensure future tables also get SELECT grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_dev;

# 5. Verify permissions (should show no SUPERUSER, no CREATEDB, no CREATEROLE)
\du readonly_dev

# 6. Exit psql
\q
```

```bash
# 7. Add to your .env file
echo "READONLY_DB_URL=postgresql://readonly_dev:YOUR_SECURE_PASSWORD@localhost:5432/ticketbot" >> .env
```

```typescript
// 8. Update server/db-readonly.ts to use the dedicated role:
const readOnlyUrl = process.env.READONLY_DB_URL || getDatabaseUrl();
const readOnlyPool = new Pool({ connectionString: readOnlyUrl });
export const readOnlyDb = drizzle(readOnlyPool);
```

#### Benefits of Database-Level Enforcement:
- ✅ **True Security**: Database enforces read-only access regardless of SQL query content
- ✅ **Bypass-Proof**: Even if string validation is bypassed, database rejects write operations
- ✅ **Production-Ready**: Industry-standard approach for read-only query runners

**Current Status**: SQL runner is functional for personal/internal use with 4-layer validation. For production with multiple developers, implementing the read-only database role is **strongly recommended**.