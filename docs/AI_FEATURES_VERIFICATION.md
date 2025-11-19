# AI Features Verification Guide

This guide helps you verify that all AI features are working correctly after deployment or migration fixes.

## Overview

The homelab project includes AI features in two main services:
- **Dashboard (Jarvis)**: AI assistant for homelab management
- **Stream Bot**: AI-powered fact generation for stream interactions

Both services use OpenAI's API through Replit's AI Integrations.

---

## Prerequisites

### Required Environment Variables

Before testing, ensure these environment variables are set in your `.env` file:

```bash
# Replit AI Integrations (auto-configured on Replit)
AI_INTEGRATIONS_OPENAI_API_KEY=<auto-set-by-replit>
AI_INTEGRATIONS_OPENAI_BASE_URL=<auto-set-by-replit>
```

### Verify Environment Variables

Run this command to check if the variables are set:

```bash
if [ -n "$AI_INTEGRATIONS_OPENAI_API_KEY" ] && [ -n "$AI_INTEGRATIONS_OPENAI_BASE_URL" ]; then
    echo "✅ AI_INTEGRATIONS_OPENAI_API_KEY: SET"
    echo "✅ AI_INTEGRATIONS_OPENAI_BASE_URL: SET"
else
    echo "❌ Missing AI Integration environment variables"
    echo "Please ensure Replit AI Integrations are properly configured"
fi
```

---

## Test 1: Dashboard AI (Jarvis) - Basic Health Check

### Step 1: Check Dashboard Service Status

```bash
# Check if dashboard is running
docker ps | grep homelab-dashboard

# Check dashboard logs for AI service initialization
docker logs homelab-dashboard 2>&1 | grep -i "AI Service"
```

**Expected Output:**
```
INFO:services.ai_service:AI Service initialized with Replit AI Integrations
```

**❌ If you see:**
```
WARNING:services.ai_service:AI Service not initialized - missing API credentials
```
**Then:** Your AI integration environment variables are not being passed to the container.

### Step 2: Test AI Chat Endpoint

Test the conversational AI endpoint:

```bash
# Test AI chat (requires authentication)
curl -X POST http://localhost:5555/api/jarvis/voice/query \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is Docker?"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "response": "Docker is a containerization platform...",
  "session_id": "uuid-here"
}
```

**❌ If you get:**
```json
{
  "success": false,
  "error": "AI service is not available. Please check OpenAI API configuration."
}
```
**Then:** AI service failed to initialize. Check environment variables and restart the dashboard.

---

## Test 2: Dashboard AI - Log Analysis

### Test AI-Powered Log Analysis

```bash
# Generate some test logs
docker logs homelab-dashboard --tail 50 > /tmp/test_logs.txt

# Test log analysis endpoint
curl -X POST http://localhost:5555/api/analysis/logs \
  -H "Content-Type: application/json" \
  -d '{
    "service": "dashboard",
    "logs": "'"$(cat /tmp/test_logs.txt | head -20)"'"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "analysis": {
    "summary": "...",
    "errors": [...],
    "recommendations": [...]
  }
}
```

---

## Test 3: Stream Bot AI - Fact Generation

### Step 1: Check Stream Bot Service Status

```bash
# Check if stream-bot is running
docker ps | grep stream-bot

# Check stream-bot logs for OpenAI initialization
docker logs stream-bot 2>&1 | grep -i "openai"
```

### Step 2: Test Fact Generation API

```bash
# Test AI fact generation
curl -X POST http://localhost:3000/api/facts/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "fact": "Did you know that honey never spoils? 3000-year-old honey is still edible!"
}
```

**Console logs should show:**
```
[OpenAI] Generating fact with model: gpt-4.1-mini
[OpenAI] Calling OpenAI API with model: gpt-4.1-mini
[OpenAI] Response received, choices: 1
[OpenAI] Final cleaned fact: ...
```

**❌ If you get an error:**
```json
{
  "success": false,
  "error": "Failed to generate fact with any available model"
}
```
**Then:** OpenAI integration is not working. Check environment variables.

---

## Test 4: Dashboard AI - Streaming Chat

### Test Real-Time AI Streaming

```bash
# Test streaming chat endpoint
curl -X POST http://localhost:5555/api/jarvis/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "List the top 3 Docker commands",
    "model": "gpt-5"
  }'
```

**Expected Output (SSE format):**
```
data: {"content":"1"}
data: {"content":"."}
data: {"content":" "}
data: {"content":"docker"}
...
data: [DONE]
```

---

## Test 5: Database-Dependent AI Features

### Verify Jarvis Task Management

```bash
# Check if Jarvis database tables exist
docker exec discord-bot-db psql -U jarvis -d jarvis -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('projects', 'ai_sessions', 'artifact_builds');
"
```

**Expected Output:**
```
     table_name      
---------------------
 projects
 ai_sessions
 artifact_builds
(3 rows)
```

### Test Voice Deployment Endpoint

```bash
# Test voice-based deployment
curl -X POST http://localhost:5555/api/jarvis/voice/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "params": {
      "project_name": "test-app",
      "project_type": "static"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "session_id": "uuid",
  "status": "started",
  "message": "Deploying test-app...",
  "project_id": "uuid",
  "task_id": "celery-task-id"
}
```

---

## Test 6: Celery Worker AI Tasks

### Verify Celery Worker Can Access AI Service

```bash
# Check celery worker logs
docker logs homelab-celery-worker 2>&1 | grep -i "AI"

# Manually trigger an AI task (if workers are running)
docker exec homelab-celery-worker celery -A celery_app inspect active
```

**Expected Output:**
```
-> celery@worker1: OK
    - empty -
```

---

## Test 7: Code-Server AI Features (REQUIRED)

Code-Server includes AI-powered coding assistants for enhanced development productivity. This is a **required production feature**, not optional.

### Recommended AI Extensions

Three AI extensions are pre-configured:
- **Continue.dev** - Free, open-source, supports local & cloud models
- **Codeium** - Free forever, unlimited autocomplete
- **GitHub Copilot** - Premium ($10/month), industry standard

### Step 1: Verify Extensions are Recommended

```bash
# Check that AI extensions are in recommendations
cat config/code-server/extensions.json | grep -E "Continue|Codeium|copilot"
```

**Expected Output:**
```
    "Continue.continue",
    "Codeium.codeium",
    "GitHub.copilot"
```

**✅ PASS:** All three AI extensions listed
**❌ FAIL:** Extensions missing from recommendations

---

### Step 2: Check Extension Installation Status

```bash
# List installed AI extensions in code-server
docker exec code-server code-server --list-extensions | grep -E "continue|codeium|copilot"
```

**Expected Output (at least one):**
```
Continue.continue
Codeium.codeium
GitHub.copilot
```

**If extensions not installed yet:**
```bash
# Install recommended AI extensions
docker exec code-server code-server --install-extension Continue.continue
docker exec code-server code-server --install-extension Codeium.codeium
docker exec code-server code-server --install-extension GitHub.copilot
```

---

### Step 3: Verify AI Extension Settings

```bash
# Check AI extension settings are configured
cat config/code-server/settings.json | grep -E "copilot|codeium|continue"
```

**Expected Output:**
```json
  "github.copilot.enable": {
    "*": true,
    "yaml": true,
    "plaintext": false,
    "markdown": true
  },
  "codeium.enableCodeLens": true,
  "codeium.enableSearch": true,
  "continue.telemetryEnabled": false,
  "continue.enableTabAutocomplete": true
```

**✅ PASS:** Settings present with AI features enabled
**❌ FAIL:** Settings missing or disabled

---

### Step 4: Verify Environment Variables

```bash
# Check if AI extension credentials are configured
docker exec code-server env | grep -E "CONTINUE_API_KEY|CODEIUM_API_KEY|GITHUB_COPILOT_TOKEN"
```

**Expected Output (optional, but at least one recommended):**
```
CONTINUE_API_KEY=sk-... (or empty for local-only mode)
CODEIUM_API_KEY=... (or empty if using OAuth)
GITHUB_COPILOT_TOKEN=... (or empty if using OAuth)
```

**Note:** Environment variables are optional:
- **Continue.dev** can work with local Ollama models (no API key needed)
- **Codeium** can authenticate via OAuth in browser
- **Copilot** can authenticate via GitHub in browser

---

### Step 5: Test Continue.dev AI Assistant

Access code-server at your configured URL (e.g., https://code.evindrake.net)

**Test 5A: Chat Interface**
1. Open any code file in code-server
2. Press `Cmd+L` (Mac) or `Ctrl+L` (Windows/Linux)
3. Type: "Explain what Docker Compose is"
4. Press Enter

**Expected Behavior:**
- Continue sidebar opens with chat interface
- AI responds with explanation of Docker Compose
- Response appears within 5-10 seconds

**✅ PASS:** AI chat responds with relevant answer
**❌ FAIL:** No response, error message, or timeout

**Test 5B: Inline Code Edit**
1. Open a Python or JavaScript file
2. Highlight a function
3. Press `Cmd+I` (Mac) or `Ctrl+I` (Windows/Linux)
4. Type: "Add detailed docstring"
5. Press Enter

**Expected Behavior:**
- AI generates and inserts docstring
- Changes appear inline in the editor
- Accept/reject options displayed

**✅ PASS:** Docstring added successfully
**❌ FAIL:** No inline edits appear

---

### Step 6: Test Codeium Autocomplete

**Test 6A: Code Completion**
1. Create new file: `test.py`
2. Type: `def calculate_fibonacci(`
3. Wait 1-2 seconds

**Expected Behavior:**
- Gray autocomplete suggestion appears
- Suggestion completes the function signature and body
- Press `Tab` to accept

**✅ PASS:** Autocomplete suggestions appear
**❌ FAIL:** No suggestions or timeout

**Test 6B: Natural Language to Code**
1. Type comment: `# Create a function that sorts a list of dictionaries by a key`
2. Press Enter
3. Wait for suggestion

**Expected Behavior:**
- Codeium generates complete function based on comment
- Code appears as gray suggestion
- Press `Tab` to accept

**✅ PASS:** Code generated from comment
**❌ FAIL:** No code suggestions

---

### Step 7: Test GitHub Copilot (If Enabled)

**Test 7A: Inline Suggestions**
1. Create new file: `app.js`
2. Type: `// Express.js server with authentication`
3. Press Enter
4. Wait for suggestion

**Expected Behavior:**
- Copilot generates Express.js boilerplate
- Gray suggestion appears inline
- Press `Tab` to accept

**✅ PASS:** Copilot generates relevant code
**❌ FAIL:** No suggestions

**Test 7B: Copilot Chat**
1. Open command palette (`Cmd/Ctrl+Shift+P`)
2. Type: "GitHub Copilot: Open Chat"
3. Ask: "How do I optimize this Docker image?"

**Expected Behavior:**
- Chat panel opens
- Copilot responds with optimization tips
- Code examples provided

**✅ PASS:** Chat responds with helpful answer
**❌ FAIL:** Chat not available or errors

---

### Step 8: Verify Local AI Models (Continue.dev + Ollama)

**Test 8A: Check Ollama Installation**
```bash
# Verify Ollama is running on dashboard
docker exec homelab-dashboard ollama list
```

**Expected Output:**
```
NAME                    ID              SIZE    MODIFIED
qwen2.5-coder:14b       abc123          8.5 GB  2 days ago
deepseek-coder:6.7b     def456          3.8 GB  2 days ago
nomic-embed-text        ghi789          274 MB  2 days ago
```

**✅ PASS:** At least one coding model listed
**❌ FAIL:** No models or Ollama not installed

**Test 8B: Test Ollama Connectivity from Code-Server**
```bash
# Test connection to Ollama from code-server container
docker exec code-server curl -s http://homelab-dashboard:11434/api/tags | jq '.models[].name'
```

**Expected Output:**
```json
"qwen2.5-coder:14b"
"deepseek-coder:6.7b"
"nomic-embed-text"
```

**✅ PASS:** Models accessible from code-server
**❌ FAIL:** Connection refused or timeout

**Test 8C: Continue.dev Using Local Model**
1. In Continue chat, click settings (gear icon)
2. Verify model list includes "Qwen2.5-Coder (Local)"
3. Select local model
4. Ask a coding question

**Expected Behavior:**
- Local model appears in dropdown
- Response generates using local Ollama
- No internet connection required

**✅ PASS:** Local model works offline
**❌ FAIL:** Local model not available or errors

---

### Step 9: Verify Continue.dev Configuration

```bash
# Check Continue configuration file exists
cat config/code-server/continue-config.json | jq '.models[].title'
```

**Expected Output:**
```json
"GPT-4"
"Claude 3.5 Sonnet"
"Qwen2.5-Coder (Local)"
```

**✅ PASS:** Configuration includes both cloud and local models
**❌ FAIL:** Configuration missing or malformed

---

### Step 10: Full Integration Test

**Scenario:** Write a Python function using AI assistance

1. Open code-server
2. Create `test_ai.py`
3. Type comment: `# Function to validate email addresses using regex`
4. Accept AI autocomplete suggestion (Codeium/Copilot)
5. Highlight function
6. Open Continue chat (`Cmd/Ctrl+L`)
7. Ask: "Add error handling and unit tests"
8. Apply AI suggestions

**Expected Result:**
- Autocomplete generates function from comment
- Continue generates error handling code
- Continue generates pytest unit tests
- All code is syntactically correct and functional

**✅ PASS:** Complete AI-assisted development workflow works
**❌ FAIL:** Any step fails or produces incorrect code

---

## Quick Verification Script

Save as `verify-code-server-ai.sh`:

```bash
#!/bin/bash

echo "🤖 Code-Server AI Features Verification"
echo "========================================="
echo ""

# Check extensions
echo "1️⃣  Checking AI extensions..."
EXTENSIONS=$(docker exec code-server code-server --list-extensions 2>/dev/null | grep -E "continue|codeium|copilot")
if [ -n "$EXTENSIONS" ]; then
    echo "✅ AI Extensions installed:"
    echo "$EXTENSIONS"
else
    echo "❌ No AI extensions found"
    echo "Installing recommended extensions..."
    docker exec code-server code-server --install-extension Continue.continue
    docker exec code-server code-server --install-extension Codeium.codeium
fi
echo ""

# Check settings
echo "2️⃣  Checking AI settings..."
if grep -q "continue.enableTabAutocomplete" config/code-server/settings.json; then
    echo "✅ Continue.dev settings configured"
else
    echo "❌ Continue.dev settings missing"
fi

if grep -q "codeium.enableCodeLens" config/code-server/settings.json; then
    echo "✅ Codeium settings configured"
else
    echo "❌ Codeium settings missing"
fi

if grep -q "github.copilot.enable" config/code-server/settings.json; then
    echo "✅ GitHub Copilot settings configured"
else
    echo "⚠️  GitHub Copilot settings not configured (optional)"
fi
echo ""

# Check Ollama connectivity
echo "3️⃣  Checking Ollama local models..."
OLLAMA_STATUS=$(docker exec code-server curl -s -o /dev/null -w "%{http_code}" http://homelab-dashboard:11434/api/tags 2>/dev/null)
if [ "$OLLAMA_STATUS" = "200" ]; then
    echo "✅ Ollama accessible from code-server"
    MODELS=$(docker exec homelab-dashboard ollama list 2>/dev/null | grep -E "qwen|deepseek|coder" | wc -l)
    if [ "$MODELS" -gt 0 ]; then
        echo "✅ Local coding models available: $MODELS"
    else
        echo "⚠️  No local coding models found"
        echo "   Run: docker exec homelab-dashboard ollama pull qwen2.5-coder:14b"
    fi
else
    echo "❌ Cannot connect to Ollama"
fi
echo ""

# Check Continue config
echo "4️⃣  Checking Continue.dev configuration..."
if [ -f config/code-server/continue-config.json ]; then
    echo "✅ Continue.dev config file exists"
    MODELS=$(cat config/code-server/continue-config.json | grep -c "\"title\"")
    echo "   Configured models: $MODELS"
else
    echo "❌ Continue.dev config missing"
fi
echo ""

echo "========================================="
echo "✅ Code-Server AI Verification Complete"
echo ""
echo "Access code-server to test AI features:"
echo "  URL: https://code.evindrake.net (or your configured domain)"
echo ""
echo "Quick tests:"
echo "  1. Press Ctrl+L to open Continue chat"
echo "  2. Type code to see Codeium autocomplete"
echo "  3. Check Extensions panel for AI assistants"
```

Make executable and run:
```bash
chmod +x verify-code-server-ai.sh
./verify-code-server-ai.sh
```

---

## Troubleshooting

### Extension Not Appearing

**Problem:** Installed extension doesn't show in code-server

**Solutions:**
1. Restart code-server container:
   ```bash
   docker restart code-server
   ```
2. Force reinstall:
   ```bash
   docker exec code-server code-server --install-extension Continue.continue --force
   ```
3. Check logs:
   ```bash
   docker logs code-server --tail 50
   ```

---

### Continue.dev Not Connecting to Ollama

**Problem:** Local models not accessible in Continue.dev

**Solutions:**
1. Verify Ollama is running:
   ```bash
   docker exec homelab-dashboard ps aux | grep ollama
   ```
2. Test connectivity:
   ```bash
   docker exec code-server curl http://homelab-dashboard:11434/api/tags
   ```
3. Check Continue config has correct endpoint:
   ```bash
   cat config/code-server/continue-config.json | grep apiBase
   ```
   Should show: `"apiBase": "http://homelab-dashboard:11434"`
4. Ensure containers are on same network:
   ```bash
   docker network inspect homelab
   ```

---

### Codeium Not Authenticating

**Problem:** Codeium requests authentication repeatedly

**Solutions:**
1. Clear browser cache and cookies
2. Re-authenticate through extension:
   - Open Extensions panel
   - Click Codeium settings (gear icon)
   - Click "Sign in with Google/GitHub"
3. Check if API key is set (optional):
   ```bash
   docker exec code-server env | grep CODEIUM_API_KEY
   ```

---

### Copilot Subscription Issues

**Problem:** Copilot shows "subscription required"

**Solutions:**
1. Verify active subscription:
   - Visit https://github.com/settings/copilot
   - Ensure subscription is active
2. Re-authenticate:
   - Open command palette (`Cmd/Ctrl+Shift+P`)
   - Search "GitHub Copilot: Sign In"
   - Follow GitHub OAuth flow
3. Check organization settings (if using organization account)

---

### No AI Suggestions Appearing

**Problem:** Typing code but no autocomplete suggestions

**Solutions:**
1. Verify extension is active:
   - Check Extensions panel
   - Ensure extension is enabled (not disabled)
2. Check file type support:
   - AI extensions may not support all file types
   - Test with `.py`, `.js`, `.ts` files first
3. Restart code-server:
   ```bash
   docker restart code-server
   ```
4. Check logs for errors:
   ```bash
   docker logs code-server 2>&1 | grep -i "error\|fail"
   ```

---

## Summary Checklist

After completing all tests, verify:

- ✅ At least one AI extension installed (Continue.dev recommended)
- ✅ AI extension settings configured in `settings.json`
- ✅ Continue.dev chat responds to queries
- ✅ Autocomplete suggestions appear when typing code
- ✅ Ollama local models accessible (for offline AI)
- ✅ Continue.dev configuration file exists with multiple model options
- ✅ Code-server AI features documented in `README-AI-SETUP.md`
- ✅ Environment variables configured (or OAuth authentication working)
- ✅ Full AI-assisted development workflow functional

**All tests passed:** Code-Server AI features are production-ready ✅

**Any tests failed:** Review troubleshooting section and fix issues before marking complete ❌

---

## Full Verification Script

Save this as `verify-ai-features.sh`:

```bash
#!/bin/bash

echo "🤖 AI Features Verification"
echo "=============================="
echo ""

# Check environment variables
echo "1️⃣  Checking environment variables..."
if [ -n "$AI_INTEGRATIONS_OPENAI_API_KEY" ]; then
    echo "✅ AI_INTEGRATIONS_OPENAI_API_KEY: SET"
else
    echo "❌ AI_INTEGRATIONS_OPENAI_API_KEY: NOT SET"
fi

if [ -n "$AI_INTEGRATIONS_OPENAI_BASE_URL" ]; then
    echo "✅ AI_INTEGRATIONS_OPENAI_BASE_URL: SET"
else
    echo "❌ AI_INTEGRATIONS_OPENAI_BASE_URL: NOT SET"
fi

echo ""

# Check dashboard AI initialization
echo "2️⃣  Checking Dashboard AI initialization..."
docker logs homelab-dashboard 2>&1 | grep -q "AI Service initialized" && \
    echo "✅ Dashboard AI Service: INITIALIZED" || \
    echo "❌ Dashboard AI Service: NOT INITIALIZED"

echo ""

# Check stream-bot AI
echo "3️⃣  Checking Stream Bot AI..."
docker logs stream-bot 2>&1 | grep -q "OpenAI" && \
    echo "✅ Stream Bot OpenAI: CONFIGURED" || \
    echo "❌ Stream Bot OpenAI: NOT CONFIGURED"

echo ""

# Test AI endpoint
echo "4️⃣  Testing Dashboard AI endpoint..."
RESPONSE=$(curl -s -X POST http://localhost:5555/api/jarvis/voice/query \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}' || echo '{"success":false}')

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ AI Chat Endpoint: WORKING"
else
    echo "❌ AI Chat Endpoint: FAILED"
fi

echo ""

# Check database tables
echo "5️⃣  Checking database tables..."
docker exec discord-bot-db psql -U jarvis -d jarvis -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('google_service_status', 'calendar_automations', 'email_notifications', 'drive_backups');" 2>/dev/null | grep -q "4" && \
    echo "✅ Google Integration Tables: EXIST" || \
    echo "❌ Google Integration Tables: MISSING"

echo ""
echo "=============================="
echo "✅ Verification Complete"
echo ""
echo "For detailed troubleshooting, see below"
```

Make it executable:
```bash
chmod +x verify-ai-features.sh
./verify-ai-features.sh
```

---

## Troubleshooting

### Problem: AI Service Not Initialized

**Symptoms:**
```
WARNING:services.ai_service:AI Service not initialized - missing API credentials
```

**Solutions:**

1. **Verify environment variables are set:**
   ```bash
   docker exec homelab-dashboard env | grep AI_INTEGRATIONS
   ```

2. **Check docker-compose configuration:**
   Open `docker-compose.unified.yml` and verify the dashboard service has:
   ```yaml
   environment:
     AI_INTEGRATIONS_OPENAI_API_KEY: ${AI_INTEGRATIONS_OPENAI_API_KEY}
     AI_INTEGRATIONS_OPENAI_BASE_URL: ${AI_INTEGRATIONS_OPENAI_BASE_URL}
   ```

3. **Rebuild and restart:**
   ```bash
   docker-compose -f docker-compose.unified.yml up -d --build homelab-dashboard
   ```

---

### Problem: Database Migration Errors

**Symptoms:**
```
sqlalchemy.exc.ProgrammingError: (psycopg2.errors.DuplicateObject) type "serviceconnectionstatus" already exists
```

**Solution:**
Run the migration fix script:
```bash
./deployment/fix-stuck-migrations.sh
```

---

### Problem: Celery Worker Crashes

**Symptoms:**
```
[ERROR] Celery worker crashed on startup
```

**Solution:**

1. **Check database connection:**
   ```bash
   docker logs homelab-celery-worker | grep -i "database\|postgres"
   ```

2. **Verify migration status:**
   ```bash
   docker exec discord-bot-db psql -U jarvis -d jarvis -c "SELECT version_num FROM alembic_version;"
   ```

3. **Restart after migration fix:**
   ```bash
   docker-compose -f docker-compose.unified.yml restart homelab-celery-worker
   ```

---

### Problem: Stream Bot Fact Generation Fails

**Symptoms:**
```json
{
  "error": "Failed to generate fact with any available model"
}
```

**Solutions:**

1. **Check OpenAI environment variables:**
   ```bash
   docker exec stream-bot env | grep AI_INTEGRATIONS
   ```

2. **Check for rate limiting:**
   ```bash
   docker logs stream-bot 2>&1 | grep -i "rate limit\|429"
   ```

3. **Test with different model:**
   ```bash
   curl -X POST http://localhost:3000/api/facts/generate \
     -H "Content-Type: application/json" \
     -d '{"model": "gpt-5-mini"}'
   ```

---

### Problem: Cannot Connect to Dashboard

**Symptoms:**
```
curl: (7) Failed to connect to localhost port 5555
```

**Solution:**

1. **Check if dashboard is running:**
   ```bash
   docker ps | grep homelab-dashboard
   ```

2. **Check port mapping:**
   ```bash
   docker port homelab-dashboard
   ```

3. **Check dashboard logs:**
   ```bash
   docker logs homelab-dashboard --tail 50
   ```

4. **Restart dashboard:**
   ```bash
   docker-compose -f docker-compose.unified.yml restart homelab-dashboard
   ```

---

## Quick Reference - Python Test Script

Save as `test_ai.py`:

```python
#!/usr/bin/env python3
import os
import requests

print('🤖 AI Features Quick Test\n')

# Check environment variables
print('Environment Variables:')
print('API Key:', 'SET' if os.getenv('AI_INTEGRATIONS_OPENAI_API_KEY') else 'MISSING')
print('Base URL:', 'SET' if os.getenv('AI_INTEGRATIONS_OPENAI_BASE_URL') else 'MISSING')
print()

# Test Dashboard AI
print('Testing Dashboard AI...')
try:
    response = requests.post(
        'http://localhost:5555/api/jarvis/voice/query',
        json={'message': 'What is Docker?'},
        timeout=10
    )
    if response.status_code == 200:
        print('✅ Dashboard AI: WORKING')
    else:
        print(f'❌ Dashboard AI: FAILED (Status: {response.status_code})')
except Exception as e:
    print(f'❌ Dashboard AI: ERROR - {e}')

print()

# Test Stream Bot AI
print('Testing Stream Bot AI...')
try:
    response = requests.post(
        'http://localhost:3000/api/facts/generate',
        json={'model': 'gpt-4.1-mini'},
        timeout=10
    )
    if response.status_code == 200:
        print('✅ Stream Bot AI: WORKING')
        data = response.json()
        if 'fact' in data:
            print(f'   Sample fact: {data["fact"][:100]}...')
    else:
        print(f'❌ Stream Bot AI: FAILED (Status: {response.status_code})')
except Exception as e:
    print(f'❌ Stream Bot AI: ERROR - {e}')
```

Run with:
```bash
python3 test_ai.py
```

---

## Quick Reference - Node.js Test Script

Save as `test_ai.js`:

```javascript
#!/usr/bin/env node
const axios = require('axios');

console.log('🤖 AI Features Quick Test\n');

// Check environment variables
console.log('Environment Variables:');
console.log('API Key:', process.env.AI_INTEGRATIONS_OPENAI_API_KEY ? 'SET' : 'MISSING');
console.log('Base URL:', process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ? 'SET' : 'MISSING');
console.log();

// Test Dashboard AI
async function testDashboardAI() {
    console.log('Testing Dashboard AI...');
    try {
        const response = await axios.post('http://localhost:5555/api/jarvis/voice/query', {
            message: 'What is Docker?'
        }, { timeout: 10000 });
        
        if (response.status === 200) {
            console.log('✅ Dashboard AI: WORKING');
        } else {
            console.log(`❌ Dashboard AI: FAILED (Status: ${response.status})`);
        }
    } catch (error) {
        console.log(`❌ Dashboard AI: ERROR - ${error.message}`);
    }
    console.log();
}

// Test Stream Bot AI
async function testStreamBotAI() {
    console.log('Testing Stream Bot AI...');
    try {
        const response = await axios.post('http://localhost:3000/api/facts/generate', {
            model: 'gpt-4.1-mini'
        }, { timeout: 10000 });
        
        if (response.status === 200) {
            console.log('✅ Stream Bot AI: WORKING');
            if (response.data.fact) {
                console.log(`   Sample fact: ${response.data.fact.substring(0, 100)}...`);
            }
        } else {
            console.log(`❌ Stream Bot AI: FAILED (Status: ${response.status})`);
        }
    } catch (error) {
        console.log(`❌ Stream Bot AI: ERROR - ${error.message}`);
    }
}

// Run tests
(async () => {
    await testDashboardAI();
    await testStreamBotAI();
})();
```

Run with:
```bash
node test_ai.js
```

---

## Summary

This verification guide covers:
- ✅ Environment variable checks
- ✅ Dashboard AI (Jarvis) testing
- ✅ Stream Bot AI testing
- ✅ Database migration verification
- ✅ Celery worker AI tasks
- ✅ Common troubleshooting scenarios

After running these tests, you should have confidence that all AI features are working correctly in your homelab deployment.
