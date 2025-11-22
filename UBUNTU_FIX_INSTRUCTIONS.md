# Ubuntu Server Fix Instructions

## What Happened? 🔍

After the cleanup, three critical errors occurred on your Ubuntu server:

### 1. **Docker Mount Error**
```
error mounting "/home/evin/contain/HomeLabHub/docker-compose.unified.yml"
```
**Cause:** We deleted `docker-compose.unified.yml` during cleanup, but `docker-compose.yml` was still trying to mount it.

### 2. **Discord Bot Password Authentication Failure**
```
password authentication failed for user "ticketbot"
```
**Cause:** Old Docker image layers cached incorrect database passwords.

### 3. **Dashboard Import Error**
```
ImportError: cannot import name 'Config' from 'config'
```
**Cause:** Old Docker image layers missing the correct `config.py` file.

---

## ✅ Fixes Applied (Replit)

I've fixed `docker-compose.yml` by:
- ✅ Changed `docker-compose.unified.yml` → `docker-compose.yml` (3 locations)
- ✅ Updated environment variable `COMPOSE_FILE=/docker-compose.yml`
- ✅ Created `fix-ubuntu-services.sh` to rebuild containers

---

## 🚀 How to Fix on Ubuntu Server

### Step 1: Commit & Push from Replit

**In your Replit shell**, run:
```bash
git add -A
git commit -m "Fix docker-compose.yml references after cleanup"
git push origin main
```

### Step 2: Pull & Rebuild on Ubuntu Server

**On your Ubuntu server**, run:
```bash
cd /home/evin/contain/HomeLabHub
./fix-ubuntu-services.sh
```

This script will:
1. Pull latest fixes from GitHub ✅
2. Rebuild services **without cache** (fixes Config import & passwords) ✅
3. Restart all services with `--force-recreate` ✅
4. Show service status ✅

---

## ⏱️ Expected Results

After running `fix-ubuntu-services.sh`:

✅ **15/15 services running**
✅ Discord bot connects to database successfully  
✅ Dashboard starts without import errors  
✅ Stream bot connects properly  
✅ No docker mount errors  

---

## 🔍 Verify Everything Works

```bash
# Check all services are running
./homelab status

# View logs for any issues
./homelab logs

# Test specific service
./homelab logs homelab-dashboard
./homelab logs discord-bot
```

---

## 💡 Why Rebuild Without Cache?

Docker caches image layers for speed, but this means:
- Old passwords stay in cached layers
- Missing files (like `config.py`) don't get added
- Mount errors persist from old configurations

Using `--no-cache` forces Docker to rebuild from scratch with:
- ✅ Correct database passwords
- ✅ Latest `config.py` file
- ✅ Updated `docker-compose.yml` mounts

---

## Next Steps

1. **In Replit**: Commit and push the fixes
2. **On Ubuntu**: Run `./fix-ubuntu-services.sh`
3. **Verify**: All 15 services running with `./homelab status`

That's it! Your homelab will be fully operational again. 🎯
