# Service Ownership - Complete Separation Architecture

## Service Separation Principle

Each service in the homelab is **completely independent** and owns its entire stack:

1. **Database** - Own PostgreSQL schema
2. **API** - Own HTTP endpoints  
3. **Frontend** - Own UI (React or Flask templates)
4. **Business Logic** - Generate and store own data
5. **Dependencies** - Own npm/pip packages

**NO service should:**
- ❌ Store data belonging to another service
- ❌ Directly query another service's database
- ❌ Mix UI components across service boundaries
- ❌ Generate data for another service to store

## Service Breakdown

### 1. Stream-Bot (stream.rig-city.com)

**Ownership:**
```
Database:  streambot schema in PostgreSQL
API:       Express.js server on port 5000
Frontend:  React + Vite + Tailwind CSS
Auth:      OAuth (Twitch, YouTube, Spotify)
```

**Owns:**
- ✅ Snapple Facts generation and storage
- ✅ Bot configurations (users, bot_config)
- ✅ Stream chat management
- ✅ Platform integrations (Twitch/YouTube/Spotify)
- ✅ Analytics and statistics

**Database Tables:**
```sql
-- Stream-bot owns these tables
CREATE TABLE facts (...)         -- Snapple facts
CREATE TABLE users (...)         -- Bot users  
CREATE TABLE bot_config (...)    -- Bot settings
CREATE TABLE chat_messages (...) -- Stream chat
CREATE TABLE analytics (...)     -- Stream stats
```

**API Endpoints:**
```
POST   /api/facts          → Create new fact
GET    /api/facts/latest   → Get latest fact
GET    /api/facts/random   → Get random fact
GET    /api/bot/status     → Bot status
POST   /api/bot/command    → Execute bot command
```

**Technology Stack:**
- Node.js 20 + TypeScript
- Express.js
- Drizzle ORM
- PostgreSQL (streambot schema)
- React + Vite + Tailwind
- OpenAI GPT-4o for fact generation

---

### 2. Dashboard (host.evindrake.net)

**Ownership:**
```
Database:  homelab_jarvis schema in PostgreSQL
API:       Flask server with Gunicorn
Frontend:  Jinja2 templates + Bootstrap 5
Auth:      Session-based (WEB_USERNAME/WEB_PASSWORD)
```

**Owns:**
- ✅ Jarvis AI chatbot
- ✅ Docker container management
- ✅ System health monitoring
- ✅ Artifact storage and analysis
- ✅ Deployment automation
- ✅ NAS management
- ✅ Plex media import

**Database Tables:**
```sql
-- Dashboard owns these tables
CREATE TABLE ai_sessions (...)       -- Jarvis chat sessions
CREATE TABLE artifacts (...)         -- User uploads
CREATE TABLE deployments (...)       -- Service deployments
CREATE TABLE health_checks (...)     -- System health
CREATE TABLE nas_shares (...)        -- NAS mounts
CREATE TABLE plex_imports (...)      -- Media imports
```

**API Endpoints:**
```
POST   /api/ai/chat           → Jarvis chatbot
GET    /api/ai/status         → AI service status
GET    /api/docker/containers → Docker status
POST   /api/deploy            → Deploy service
GET    /api/health            → System health
POST   /api/plex/import       → Import media
```

**Technology Stack:**
- Python 3.11 + Flask
- SQLAlchemy ORM
- PostgreSQL (homelab_jarvis schema)
- Bootstrap 5 + Chart.js
- OpenAI GPT-4o for Jarvis AI
- Celery for background tasks

---

### 3. Discord-Bot (bot.rig-city.com)

**Ownership:**
```
Database:  discord schema in PostgreSQL
API:       Express.js server + Discord.js
Frontend:  React + Tailwind CSS + Radix UI
Auth:      Discord OAuth
```

**Owns:**
- ✅ Discord ticket system
- ✅ Discord server management
- ✅ User verification
- ✅ Role assignments
- ✅ Moderation logs

**Database Tables:**
```sql
-- Discord-bot owns these tables
CREATE TABLE tickets (...)           -- Support tickets
CREATE TABLE guilds (...)            -- Discord servers
CREATE TABLE roles (...)             -- Role assignments
CREATE TABLE verification (...)      -- User verification
CREATE TABLE moderation_logs (...)   -- Mod actions
```

**API Endpoints:**
```
GET    /api/tickets          → List tickets
POST   /api/tickets          → Create ticket
GET    /api/guilds           → Server list
POST   /api/verify           → Verify user
```

**Technology Stack:**
- Node.js 20 + TypeScript
- Discord.js
- Drizzle ORM
- PostgreSQL (discord schema)
- React + Tailwind + Radix UI

---

## Cross-Service Communication Rules

### ✅ ALLOWED: Read-Only Proxy Pattern

Dashboard can proxy requests to other services as a read-only client:

```python
# Dashboard proxies stream-bot facts (read-only)
@facts_bp.route('/api/facts/latest')
def get_latest_fact():
    response = requests.get('http://stream-bot:5000/api/facts/latest')
    return jsonify(response.json())
```

**Rules:**
1. Only HTTP requests to other service APIs
2. Read-only operations (GET requests)
3. No database queries across schemas
4. No data modification

### ❌ FORBIDDEN: Cross-Service Data Storage

**NEVER do this:**

```python
# ❌ WRONG: Dashboard storing stream-bot facts
@dashboard_routes.route('/generate-fact')
def generate_fact():
    fact = openai.generate_fact()
    # WRONG: Storing stream-bot data in dashboard database
    db.session.add(Artifact(type='fact', content=fact))
    db.session.commit()
```

**Instead:**

```python
# ✅ CORRECT: Stream-bot stores its own facts
# Dashboard just proxies the request
@dashboard_routes.route('/generate-fact')  
def generate_fact():
    # Proxy to stream-bot API
    response = requests.post('http://stream-bot:5000/api/facts')
    return jsonify(response.json())
```

---

## Database Schema Separation

### PostgreSQL Database Structure

```
homelab-postgres:5432
├── streambot schema
│   ├── facts
│   ├── users
│   ├── bot_config
│   └── (stream-bot tables)
│
├── homelab_jarvis schema  
│   ├── ai_sessions
│   ├── artifacts
│   ├── deployments
│   └── (dashboard tables)
│
└── discord schema
    ├── tickets
    ├── guilds
    ├── roles
    └── (discord-bot tables)
```

### Connection Strings

Each service has its own PostgreSQL user and database:

```env
# Stream-Bot
STREAMBOT_DATABASE_URL=postgresql://streambot:Brs=2729@homelab-postgres:5432/streambot

# Dashboard  
DATABASE_URL=postgresql://homelab:Brs=2729@homelab-postgres:5432/homelab_jarvis

# Discord-Bot
DISCORD_DATABASE_URL=postgresql://discord:Brs=2729@homelab-postgres:5432/discord
```

---

## AI Model Usage

All services now use **gpt-4o** as the standard model:

| Service | AI Feature | Model | Purpose |
|---------|-----------|-------|---------|
| Stream-Bot | Fact Generation | gpt-4o | Generate Snapple facts |
| Stream-Bot | Chat Responses | gpt-4o | Bot personality |
| Dashboard | Jarvis AI | gpt-4o-mini | Chatbot assistant |
| Dashboard | Log Analysis | gpt-4o-mini | Troubleshooting |

**Model Hierarchy:**
1. **gpt-4o** - Primary model for all fact generation (most capable)
2. **gpt-4o-mini** - Cost-effective for chat/analysis
3. **gpt-4-turbo** - Available as option for complex tasks

---

## Data Flow Examples

### Example 1: User Generates Fact (Correct)

```
User clicks "Generate Preview" on stream.rig-city.com/trigger
    ↓
Stream-Bot React Frontend calls:
    POST http://stream-bot:5000/api/facts
    ↓
Stream-Bot Express API:
    - Calls OpenAI GPT-4o
    - Stores in streambot.facts table
    - Returns JSON response
    ↓
Stream-Bot React Frontend displays fact
```

**✅ Correct:** Stream-bot owns the entire flow

### Example 2: Dashboard Shows Latest Fact (Correct)

```
User visits host.evindrake.net/facts
    ↓
Dashboard Flask Route:
    GET http://stream-bot:5000/api/facts/latest
    ↓
Dashboard renders fact (read-only)
```

**✅ Correct:** Dashboard proxies to stream-bot API (read-only)

### Example 3: Dashboard Generates Fact (WRONG)

```
❌ User clicks button on dashboard
    ↓
❌ Dashboard calls OpenAI directly  
    ↓
❌ Dashboard stores in artifacts table
```

**❌ WRONG:** Dashboard should never generate or store stream-bot facts!

**✅ FIX:** Dashboard should proxy to stream-bot API instead

---

## Deployment Independence

Each service can be deployed, restarted, or rebuilt independently:

```bash
# Restart stream-bot without affecting dashboard
docker-compose restart stream-bot

# Rebuild discord-bot without affecting stream-bot
docker-compose up -d --build discord-bot

# Update dashboard code without affecting other services
docker-compose up -d --build homelab-dashboard
```

---

## Summary Checklist

For any new feature, verify:

- [ ] Feature belongs to ONE service only
- [ ] Database tables are in the correct schema
- [ ] API endpoints are on the correct service
- [ ] Frontend UI is in the correct service
- [ ] No cross-service data storage
- [ ] Read-only proxying is acceptable
- [ ] Services can restart independently
- [ ] Each service uses its own database connection
- [ ] AI models are correctly configured
- [ ] Environment variables are service-specific
