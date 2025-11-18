# Discord Ticket Bot with Music Player

A production-ready Discord bot for support ticket management, music playback, and server administration. Features a modern web dashboard, real-time updates via WebSockets, Spotify playlist import, Discord thread integration, and comprehensive admin tools.

**Live Deployment**: bot.rig-city.com

## ✨ Key Features

### 🎫 Advanced Ticket System
- **Multi-server support** with per-server configuration
- **Custom ticket categories** with color coding and emojis
- **Discord thread integration** - Bidirectional sync between Discord threads and dashboard tickets
- **Role-based permissions** - Admin and support role management
- **Ticket panels** - Interactive button-based ticket creation
- **Real-time messaging** - WebSocket sync between Discord and dashboard
- **Auto-close automation** - Configurable inactive ticket closing
- **Rate limiting** - Prevent ticket spam (5 tickets/hour per user)
- **Embed template system** - Custom embeds with markdown, images, and channel mentions
- **Moderation actions** - Quick action buttons (assign, close, ban, warn)
- **Audit logging** - Track all ticket changes

### 🎵 Music Bot (discord-player v6)
- **YouTube & Spotify playback** - Official @discord-player/extractor
- **Spotify playlist import** - OAuth integration to import entire playlists
- **Interactive web dashboard** - Real-time controls, queue management
- **Drag-and-drop queue** - Reorder songs in the web interface
- **Recently played history** - Track last 20 songs
- **Playlist management** - Create, save, and play custom playlists
- **Search with platform badges** - Visual indicators for YouTube/Spotify
- **Live statistics** - Total songs played, playtime tracking
- **8 slash commands** - /play, /skip, /pause, /resume, /queue, /stop, /volume, /nowplaying

### 🌐 Web Dashboard
- **Single-server tabbed interface**:
  - **Overview**: Server stats, quick actions, ticket overview
  - **Music**: Now playing, queue, search, playlists, recently played
  - **Panels**: Create and manage ticket panels
  - **Settings**: 7 organized tabs (General, Server Setup, Categories, Channels, Health, Music, Admin)
- **Discord OAuth2 authentication** - Automatic admin detection
- **Real-time WebSocket updates** - Instant sync across all clients
- **Dark mode themed** - Discord-inspired color scheme
- **Responsive design** - Mobile and desktop optimized
- **Role-aware UI** - Shows features based on user permissions

### 🛡️ Production-Ready Features
- **Neon serverless database** - PostgreSQL with WebSocket support, optimized for Replit
- **Resilient startup** - Retry logic with exponential backoff for database connections
- **Background safeguards**:
  - Channel reconciliation (every 15 minutes)
  - Auto-close checks (every 60 minutes)
  - Scheduled ticket mapping refresh (every 5 minutes)
- **Docker deployment** - Multi-stage build with audio dependencies
- **Health monitoring** - Comprehensive metrics and status endpoints
- **Automatic migrations** - Database schema updates via Drizzle ORM
- **WebSocket broadcasting** - Server-scoped authorization

## 🚀 Quick Start (Replit)

### 1. Setup Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create new application and note the **Application ID**
3. Under **OAuth2**:
   - Copy **Client Secret**
   - Add redirect URL: `https://your-repl-url.repl.co/auth/discord/callback`
4. Under **Bot**:
   - Reset and copy **Bot Token**
   - Enable Privileged Gateway Intents: ✅ Server Members, ✅ Message Content
5. Under **OAuth2 → URL Generator**:
   - Scopes: `bot` + `applications.commands`
   - Permissions: 274878221376
   - Copy invite URL and invite bot to your server

### 2. Configure Environment Variables

Add these secrets in Replit:

```bash
DISCORD_CLIENT_ID=your_application_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_APP_ID=your_application_id
SESSION_SECRET=generate_with_openssl_rand_base64_32
DISCORD_SERVER_INVITE_URL=https://discord.gg/your_invite_code
```

**Spotify Integration (Optional)**:
```bash
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

### 3. Setup PostgreSQL Database

Click **+ Add Database** in Replit to provision a Neon PostgreSQL database. The `DATABASE_URL` environment variable will be automatically set.

### 4. Run the Application

Click **Run** button or execute:
```bash
npm run dev
```

The bot will:
- ✅ Connect to Neon database (with retry logic)
- ✅ Register slash commands globally
- ✅ Start Discord bot with music support
- ✅ Start web dashboard on port 5000
- ✅ Initialize background safeguards

### 5. Access Dashboard

Open the webview preview in Replit and log in with Discord OAuth2.

## 🐳 Docker Deployment (Production)

### Prerequisites
- Docker & Docker Compose installed
- Domain with SSL certificate (Let's Encrypt recommended)
- 2GB RAM minimum, 10GB storage

### Environment Setup

Create `.env` file:

```env
# Discord Configuration
DISCORD_CLIENT_ID=your_application_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_APP_ID=your_application_id

# Database Configuration
POSTGRES_PASSWORD=your_secure_db_password
DATABASE_URL=postgresql://ticketbot:your_secure_db_password@postgres:5432/ticketbot

# Session Security (generate with: openssl rand -base64 32)
SESSION_SECRET=your_random_32_character_session_secret

# Public Domain
PUBLIC_DOMAIN=https://yourdomain.com
DISCORD_CALLBACK_URL=https://yourdomain.com/auth/discord/callback

# Spotify (Optional)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Environment
NODE_ENV=production
PORT=5000
```

### Deploy

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f bot

# Check health
curl http://localhost:5000/health
```

### Nginx Reverse Proxy (Recommended)

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for real-time updates
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## 📚 Usage Guide

### Discord Commands

**Ticket Management:**
- `/ticket` - Create a new ticket with category selection
- `/close-ticket` - Close the current ticket channel

**Music Bot:**
- `/play <song or URL>` - Play YouTube or Spotify track
- `/skip` - Skip to next song
- `/stop` - Stop playback and clear queue
- `/queue` - View current queue
- `/pause` - Pause playback
- `/resume` - Resume playback
- `/volume <1-100>` - Adjust volume
- `/nowplaying` - Show current track

### Dashboard Features

**Music Tab:**
1. Search for songs (YouTube/Spotify indicators)
2. Play, pause, skip controls
3. Drag-and-drop queue reordering
4. Create and manage playlists
5. Import Spotify playlists (OAuth required)
6. View recently played songs
7. Live playback statistics

**Panels Tab:**
1. Create ticket panels with custom embeds
2. Add categories as button options
3. Deploy to Discord channels
4. Edit existing panels

**Settings:**
- **General**: Bot nickname, admin roles
- **Server Setup**: Ticket channels and notifications
- **Categories**: Create ticket categories with colors/emojis
- **Channels**: Manage Discord channel mappings
- **Health**: Bot status, uptime, resource usage
- **Music**: Configure music bot settings
- **Admin**: Advanced configuration and permissions

### Thread Integration

Enable in **Settings → Thread Integration**:
1. Toggle "Enable thread integration"
2. Select target channel for auto-thread creation
3. Enable "Auto-create tickets from threads"
4. Enable "Bidirectional message sync"

Messages in Discord threads automatically sync to dashboard tickets and vice versa.

## 🔧 Architecture

### Tech Stack
- **Backend**: Node.js, Express.js, TypeScript
- **Frontend**: React 18, TanStack Query, Wouter, shadcn/ui, Tailwind CSS
- **Database**: PostgreSQL (Neon serverless) with Drizzle ORM
- **Discord**: discord.js v14, discord-player v6
- **Music**: @discord-player/extractor, ffmpeg-static
- **Auth**: Passport.js with Discord OAuth2
- **Real-time**: WebSocket (ws library)

### Database Schema
- `discordUsers` - Discord user profiles
- `servers` - Connected Discord servers
- `botSettings` - Per-server configuration
- `tickets` - Ticket data with status tracking
- `ticketMessages` - Message history
- `ticketCategories` - Custom categories
- `threadMappings` - Discord thread ↔ ticket sync
- `embedTemplates` - Custom embed configurations
- `panelTemplates` - Ticket panel definitions
- `musicSessions` - Music playback state
- `playlists` - User-created playlists
- `playlistItems` - Playlist tracks
- `serverRolePermissions` - Role-based access control
- `spotifyConnections` - Spotify OAuth tokens

## 🐛 Troubleshooting

### Database Connection Timeouts
✅ **Fixed in v1.1.0**: Migrated to Neon serverless driver with retry logic
- The bot now uses `@neondatabase/serverless` with WebSocket support
- Automatic retry with exponential backoff (5 attempts)
- Scheduled 5-minute refresh of ticket mappings
- Graceful degradation if database unavailable

### Music Not Playing
```bash
# Check music logs
docker compose logs bot | grep -i music

# Common issues:
# - Bot not in voice channel → Join voice first
# - Missing permissions → Check bot voice permissions
# - YouTube rate limiting → Wait and retry
```

### Bot Not Responding
```bash
# Check if bot is online in Discord
docker compose logs bot | head -50

# Verify slash commands registered
# (commands should appear when typing / in Discord)

# Check health endpoint
curl https://yourdomain.com/health
```

## 📊 Monitoring

**Health Endpoint**: `/api/bot/health`

Returns:
```json
{
  "status": "healthy",
  "bot": {
    "online": true,
    "latency": 45,
    "guilds": 3,
    "users": 581
  },
  "database": "connected",
  "uptime": 123456,
  "memory": "256 MB",
  "timestamp": "2025-11-07T00:00:00.000Z"
}
```

**Logs**:
```bash
# Bot startup and errors
docker compose logs -f bot

# Database queries
docker compose logs -f bot | grep -i database

# Music playback
docker compose logs -f bot | grep -i music

# Background jobs
docker compose logs bot | grep -i safeguards
```

## 🔒 Security

- ✅ Discord OAuth2 with session management
- ✅ Role-based access control
- ✅ XSS protection via rehype-sanitize
- ✅ Server-scoped WebSocket authorization
- ✅ Rate limiting on ticket creation
- ✅ Input validation with Zod schemas
- ✅ Secrets stored as environment variables
- ✅ HTTPS with SSL certificates (production)

## 📝 Development

See [QUICKSTART.md](./QUICKSTART.md) for detailed step-by-step setup instructions.

For technical architecture and changelog, see [replit.md](./replit.md).

### Database Migrations

```bash
# Push schema changes to database
npm run db:push

# Generate migration (if needed)
npm run db:generate

# Apply migrations
npm run db:migrate
```

### Running Locally

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Run development server
npm run dev
```

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open pull request

## 📝 License

MIT License - see [LICENSE](./LICENSE) file

## 🎯 Roadmap

- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Custom bot command builder
- [ ] Integration with external ticketing systems
- [ ] Voice transcript logging
- [ ] AI-powered ticket categorization

---

**Questions?** Check [QUICKSTART.md](./QUICKSTART.md) for detailed setup instructions or open an issue on GitHub.
