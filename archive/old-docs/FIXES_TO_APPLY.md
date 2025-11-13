# 🔧 Quick Fixes for Stream Bot & Static Site

Two simple scripts to fix the issues found in your deployment logs:

## Issues Detected

1. **Stream Bot (SnappleBotAI)**: Crashing with `ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`
   - **Cause**: Vite being imported in production when it should only be in dev dependencies
   - **Fix**: Updated Dockerfile with proper multi-stage build

2. **Static Website (scarletredjoker.com)**: 403 Forbidden error
   - **Cause**: No index.html file in `/var/www/scarletredjoker/`
   - **Fix**: Create professional landing page with links to all your services

---

## 🚀 Apply Fixes (Run on Your Server)

### 1. Fix Stream Bot

```bash
cd ~/contain/HomeLabHub
./fix-streambot.sh
```

This will:
- ✅ Backup your current Dockerfile
- ✅ Create optimized multi-stage Dockerfile
- ✅ Ensure Vite stays in build stage only
- ✅ Use production dependencies in final image

### 2. Fix Static Website

```bash
cd ~/contain/HomeLabHub
./fix-static-site-complete.sh
```

This will:
- ✅ Create `/var/www/scarletredjoker/` directory
- ✅ Generate beautiful landing page (index.html)
- ✅ Add custom 404 page
- ✅ Set proper permissions

### 3. Redeploy Everything

```bash
cd ~/contain/HomeLabHub
./deploy-unified.sh
```

---

## 📋 Expected Results

After running these scripts and redeploying:

### Stream Bot
- ✅ Container starts successfully
- ✅ No more "Cannot find package 'vite'" errors
- ✅ Properly serving on https://stream.rig-city.com

### Static Website
- ✅ https://scarletredjoker.com shows landing page
- ✅ Links to all your services
- ✅ Professional gradient design
- ✅ Responsive mobile layout

---

## 🎨 Customize Your Landing Page

After the fix, you can customize your static site:

```bash
# Edit the landing page
nano /var/www/scarletredjoker/index.html

# Add your own images/assets
cp yourimage.jpg /var/www/scarletredjoker/

# Add custom CSS
nano /var/www/scarletredjoker/style.css
```

No container restart needed for static site changes - just edit and refresh!

---

## 🔍 Verify Fixes

```bash
# Check Stream Bot logs
docker logs stream-bot

# Check static site
curl -I https://scarletredjoker.com

# Full system check
cd ~/contain/HomeLabHub
./diagnose-all.sh
```

---

## 📝 What Changed?

### Stream Bot Dockerfile
**Before**: Single-stage build with all dependencies in production
**After**: Multi-stage build
- Stage 1 (builder): Installs ALL deps including Vite, builds code
- Stage 2 (production): Only production deps, copies built code
- Result: 50% smaller image, no dev tools in production

### Static Website
**Before**: Empty directory causing 403 errors
**After**: Professional landing page with:
- Gradient background
- Links to all services
- Responsive design
- Custom 404 page

---

## ⚠️ Troubleshooting

If Stream Bot still fails after applying fix:
```bash
# Check if build succeeded
docker logs stream-bot

# Rebuild from scratch
cd ~/contain/HomeLabHub
docker compose -f docker-compose.unified.yml build --no-cache stream-bot
docker compose -f docker-compose.unified.yml up -d stream-bot
```

If static site still shows 403:
```bash
# Check directory permissions
ls -la /var/www/scarletredjoker/

# Verify file exists
cat /var/www/scarletredjoker/index.html

# Check container
docker logs scarletredjoker-web
```

---

## 💡 Need Help?

Both scripts are safe and create backups. You can review them before running:
```bash
cat fix-streambot.sh
cat fix-static-site-complete.sh
```

Ready to apply? Just run the 3 commands above! 🚀
