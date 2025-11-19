# Code-Server AI Extensions Setup Guide

This guide explains how to set up AI coding assistants in your code-server instance.

## Recommended AI Extensions

### 1. Continue.dev (FREE & Open Source)
**Best for:** Privacy, local models, flexibility

**Features:**
- AI chat with full context awareness
- Inline code editing
- Supports local models (Ollama) AND cloud models (GPT-4, Claude)
- 100% free and open-source
- Works offline with local models

**Setup:**
1. Install extension: `Continue.continue`
2. Configuration is already set up in `continue-config.json`
3. To use cloud models, set `CONTINUE_API_KEY` in your `.env` file
4. To use local models, ensure Ollama is running on dashboard container

### 2. Codeium (FREE Forever)
**Best for:** Unlimited free autocomplete and chat

**Features:**
- Unlimited autocomplete
- AI chat interface
- 70+ languages supported
- Natural language code search
- SOC 2 Type 2 certified

**Setup:**
1. Install extension: `Codeium.codeium`
2. Sign in with Google/GitHub account (free)
3. Optionally set `CODEIUM_API_KEY` in `.env` for team features

### 3. GitHub Copilot ($10/month)
**Best for:** Premium quality, GitHub integration

**Features:**
- Industry-standard AI assistance
- Inline suggestions
- AI chat with multi-file context
- Built on GPT-4 and Codex

**Setup:**
1. Install extension: `GitHub.copilot`
2. Subscribe at https://github.com/settings/copilot
3. Authenticate with GitHub account
4. Optionally set `GITHUB_COPILOT_TOKEN` in `.env`

## Quick Start

### Install Extensions via UI

1. Open code-server in your browser
2. Click Extensions icon (Ctrl+Shift+X)
3. Search for:
   - "Continue"
   - "Codeium"
   - "GitHub Copilot"
4. Click "Install" for your preferred extension(s)

### Install Extensions via CLI

```bash
# Install from code-server container
docker exec code-server code-server --install-extension Continue.continue
docker exec code-server code-server --install-extension Codeium.codeium
docker exec code-server code-server --install-extension GitHub.copilot
```

## Configuration

All extension settings are pre-configured in `settings.json`:

```json
{
  "github.copilot.enable": { "*": true },
  "codeium.enableCodeLens": true,
  "codeium.enableSearch": true,
  "continue.telemetryEnabled": false,
  "continue.enableTabAutocomplete": true
}
```

## Using Local Models (Continue.dev + Ollama)

Continue.dev can use local AI models via Ollama for completely offline/private coding:

1. **Ensure Ollama is installed on dashboard:**
   ```bash
   docker exec homelab-dashboard ollama list
   ```

2. **Pull recommended models:**
   ```bash
   docker exec homelab-dashboard ollama pull qwen2.5-coder:14b
   docker exec homelab-dashboard ollama pull deepseek-coder:6.7b
   docker exec homelab-dashboard ollama pull nomic-embed-text
   ```

3. **Continue.dev will automatically use these models** (configured in `continue-config.json`)

## Verification

Test that AI extensions are working:

1. **Continue.dev:**
   - Open any code file
   - Press `Cmd/Ctrl+L` to open Continue chat
   - Ask a coding question
   - Expected: AI response appears

2. **Codeium:**
   - Start typing code
   - Expected: Gray autocomplete suggestions appear
   - Press `Tab` to accept

3. **GitHub Copilot:**
   - Start typing a function or comment
   - Expected: Gray inline suggestions appear
   - Press `Tab` to accept

## Troubleshooting

### Extension Not Appearing
- Refresh code-server page
- Check Extensions panel for installation status
- Restart code-server container: `docker restart code-server`

### Continue.dev Not Connecting to Ollama
- Verify Ollama is running: `docker logs homelab-dashboard | grep ollama`
- Check Ollama endpoint: `http://homelab-dashboard:11434`
- Test connection: `curl http://homelab-dashboard:11434/api/tags`

### Codeium Not Authenticating
- Clear browser cache
- Re-authenticate through extension settings
- Check if API key is set in `.env`

### Copilot Subscription Issues
- Verify active subscription at https://github.com/settings/copilot
- Re-authenticate through VS Code command palette
- Check if token is valid

## Environment Variables

Add these to your `.env` file if using API keys:

```bash
# Continue.dev (optional - for cloud models)
CONTINUE_API_KEY=your-api-key-here

# Codeium (optional - auto-detected via auth)
CODEIUM_API_KEY=your-api-key-here

# GitHub Copilot (optional - auto-detected via GitHub auth)
GITHUB_COPILOT_TOKEN=your-token-here
```

## Best Practices

1. **Start with Continue.dev** - Free, works with local models
2. **Add Codeium** - For better autocomplete quality
3. **Consider Copilot** - If you need premium features and have budget
4. **Use local models** - For sensitive code or offline work
5. **Disable telemetry** - Already configured for privacy

## Resources

- Continue.dev: https://continue.dev
- Codeium: https://codeium.com
- GitHub Copilot: https://github.com/features/copilot
- Ollama Models: https://ollama.com/library
