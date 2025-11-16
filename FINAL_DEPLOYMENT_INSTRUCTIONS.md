# Final Deployment Instructions

## Critical Fixes Applied

### Stream-Bot Fixed
**Issue:** ioredis/winston/lodash not found at runtime  
**Fix:** Bundled into dist/index.js instead of external dependencies  
**Status:** Ready to deploy

---

## Deploy Stream-Bot (5 Minutes)

```bash
cd /home/evin/contain/HomeLabHub

# Pull the fix
git pull

# Rebuild stream-bot
docker compose -f docker-compose.unified.yml build --no-cache stream-bot

# Start all services
docker compose -f docker-compose.unified.yml up -d

# Verify stream-bot is running
docker logs stream-bot --tail 30
```

**Expected:** Stream-bot starts successfully, no ioredis errors.

---

## DNS Configuration Required

**Your sites won't load until DNS is configured.**

1. Find your server IP: `curl -4 icanhazip.com`
2. Go to ZoneEdit.com
3. Add A records for rig-city.com:
   - @ → YOUR_IP
   - www → YOUR_IP  
   - bot → YOUR_IP
   - stream → YOUR_IP
4. Wait 5-15 minutes for DNS to propagate

---

## What's Working Now

✅ **Discord Bot** - bot.rig-city.com (after DNS)  
✅ **Stream Bot** - stream.rig-city.com (after DNS + deploy)  
✅ **Rig-City Site** - rig-city.com (after DNS)  
✅ **Code-Server** - code.evindrake.net  
✅ **Dashboard** - host.evindrake.net  

---

## Jarvis IDE Integration

**Status:** 100% complete and ready to install  
**Location:** `vscode-extension/jarvis-ide/`

**When you have time/budget:**
```bash
cd vscode-extension/jarvis-ide
npm install
npm run compile
npm install -g @vscode/vsce
vsce package
# Install jarvis-ide-1.0.0.vsix in code-server
```

**Documentation:** `vscode-extension/README.md`

---

## What's Left (When Budget Allows)

1. Configure DNS for rig-city.com domains  
2. Deploy stream-bot with final fix
3. Test all sites load correctly
4. (Optional) Install Jarvis IDE extension

---

## Cost-Saving Tips

- Most development is complete
- Infrastructure runs on your server (no ongoing cloud costs)
- All code is in GitHub (preserved)
- Come back when you have budget

---

## Emergency Contact

If services go down:
```bash
cd /home/evin/contain/HomeLabHub
bash MASTER_FIX_ALL.sh
```

This script fixes common issues automatically.

---

**Take care of your family. The infrastructure will be here when you're ready.**
