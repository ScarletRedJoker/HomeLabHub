# JARVIS IDE Integration - Quick Start Guide

## Overview

JARVIS AI Assistant is now accessible directly from your IDE at:

**🔗 https://host.evindrake.net/jarvis/ide**

This minimal, IDE-optimized interface provides full voice and text chat with the AI assistant while you code.

---

## Features

✅ **Voice Input & Output** - Speak to JARVIS and hear responses  
✅ **Text Chat** - Type messages when voice isn't convenient  
✅ **Keyboard Shortcuts** - Press `Ctrl+J` to activate voice input  
✅ **Minimal Interface** - Compact design optimized for side-by-side use  
✅ **Session Persistence** - Conversations saved during your session  
✅ **Quick Actions** - Pre-configured prompts for common tasks  

---

## How to Use

### Option 1: Side-by-Side (Recommended)

1. Open code-server at `https://code.evindrake.net`
2. Open a new browser tab with `https://host.evindrake.net/jarvis/ide`
3. Use your OS window manager to place them side-by-side
4. Chat with JARVIS while coding!

### Option 2: Embedded in Browser

1. In code-server, use browser's split-screen or tab groups
2. Load `https://host.evindrake.net/jarvis/ide` in a split view
3. Access JARVIS without leaving your browser

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+J` | Activate voice input |
| `Enter` | Send text message |
| `Esc` | Close settings panel |

---

## Voice Commands Examples

**Server Management:**
- "Check my server health and status"
- "Show me recent errors in my logs"
- "What containers are running?"

**Troubleshooting:**
- "Why is my container not starting?"
- "Help me debug this error: [paste error]"
- "Optimize my Docker containers"

**Deployment:**
- "How do I deploy a new website?"
- "What's the best way to set up SSL?"
- "Help me configure my reverse proxy"

---

## Configuration

### Prerequisites

JARVIS requires OpenAI API access. Ensure these environment variables are set:

```bash
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
```

### Voice Settings

Click the ⚙️ **Settings** button to customize:
- **Voice** - Select preferred speech synthesis voice
- **Speech Rate** - Adjust speaking speed (0.5x - 2.0x)
- **Pitch** - Modify voice pitch
- **Volume** - Control output volume
- **Auto-speak** - Toggle automatic response reading
- **Continuous Listening** - Enable hands-free mode

---

## UI Controls

| Icon | Function |
|------|----------|
| ⚡ | Toggle Quick Actions panel |
| 🔊 | Toggle auto-speak responses |
| ⚙️ | Open voice settings |
| 🗑️ | Clear conversation history |
| 🎤 | Start/stop voice input |
| ➡️ | Send message |

---

## Quick Actions

Toggle the Quick Actions panel with the ⚡ button to access common prompts:

- 🔍 **What can you do?** - Learn about JARVIS capabilities
- 💓 **Server Health** - Check system status
- 🚀 **Deploy Help** - Get deployment guidance
- 🐛 **Check Errors** - Find and analyze errors
- ⚡ **Optimize** - Get performance recommendations

---

## Browser Compatibility

**Supported:**
- ✅ Google Chrome / Chromium
- ✅ Microsoft Edge
- ✅ Safari (macOS/iOS)

**Limited Support:**
- ⚠️ Firefox (Text-to-speech may have limited voices)

---

## Tips for Best Experience

1. **Use a quality microphone** - Better audio = better transcription
2. **Allow microphone permissions** - Required for voice input
3. **Speak clearly** - Pause briefly before and after commands
4. **Use Quick Actions** - Start with pre-configured prompts
5. **Keep sessions focused** - Clear chat when switching tasks

---

## Troubleshooting

### Voice Input Not Working

1. Check browser microphone permissions
2. Verify microphone is working (test in system settings)
3. Try Chrome/Edge if using another browser
4. Check console for error messages (F12)

### AI Not Responding

1. Verify OpenAI API key is configured correctly
2. Check the status indicator in the header (should show "Online")
3. Refresh the page
4. Check dashboard logs for errors

### Authentication Required

1. Log into the dashboard first at `https://host.evindrake.net`
2. Ensure your session is active
3. Credentials are set in `WEB_USERNAME` and `WEB_PASSWORD` environment variables

---

## Advanced Usage

### Bookmarklet (Optional)

Create a browser bookmarklet for quick access:

```javascript
javascript:(function(){window.open('https://host.evindrake.net/jarvis/ide','JARVIS','width=500,height=800');})();
```

### Custom Domain

If you want JARVIS at a custom subdomain (e.g., `jarvis.evindrake.net`):

1. Add DNS record: `jarvis.evindrake.net` → `your-server-ip`
2. Update Caddy configuration to route to `/jarvis/ide`
3. SSL will be handled automatically by Caddy

---

## API Endpoints

The IDE interface uses these dashboard API endpoints:

- `GET /api/ai/status` - Check if AI is configured
- `POST /api/ai/chat` - Send chat messages
- `GET /jarvis/ide` - Load the IDE interface

---

## Production Deployment

For your Ubuntu production server:

1. **Ensure dashboard is running:**
   ```bash
   cd /home/evin/contain/HomeLabHub
   docker-compose up -d dashboard
   ```

2. **Access via Caddy reverse proxy:**
   - Already configured at `https://host.evindrake.net`
   - Navigate to `/jarvis/ide`

3. **Check SSL certificate:**
   ```bash
   curl -I https://host.evindrake.net/jarvis/ide
   ```

---

## Development Mode (Replit)

For testing in Replit:

```bash
cd services/dashboard
JARVIS_DATABASE_URL="${DATABASE_URL}" python main.py
```

Access at: `https://<your-repl-url>/jarvis/ide`

---

## Security Notes

- ✅ Requires authentication (same credentials as dashboard)
- ✅ API endpoints protected with `@require_auth`
- ✅ Sessions secured with Flask session management
- ✅ No client-side API keys exposed
- ⚠️ Voice transcription happens in browser (Web Speech API)
- ⚠️ Chat messages sent to OpenAI API (per your privacy policy)

---

## Support & Feedback

This integration provides the **simplest and fastest** implementation of JARVIS in your IDE:

- No complex VS Code extensions required
- No additional infrastructure needed
- Works immediately on your production server
- Can be opened in any browser alongside code-server

For issues or feature requests, check the dashboard logs:

```bash
docker logs dashboard
```

---

## Future Enhancements

Potential improvements:

1. **VS Code Extension** - Native sidebar integration
2. **Context-Aware Chat** - JARVIS can see your open files
3. **Code Generation** - Suggest code directly in the editor
4. **Terminal Integration** - Execute suggested commands
5. **Custom Shortcuts** - User-defined keyboard shortcuts

---

## Success! 🎉

You now have JARVIS accessible from your IDE. Start chatting to:

- Get coding help while you work
- Troubleshoot server issues
- Deploy applications with voice commands
- Learn best practices
- Optimize your infrastructure

**Happy coding with JARVIS! 🤖💻**
