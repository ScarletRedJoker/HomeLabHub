# Fix Git Sync Issue on Ubuntu

## Problem
The sync from Replit is blocked because Ubuntu has uncommitted changes.

## Solution

### Option 1: Commit Ubuntu Changes (Keep Them)
```bash
cd /home/evin/contain/HomeLabHub
git add -A
git commit -m "Ubuntu local changes - $(date '+%Y-%m-%d %H:%M:%S')"
```

Then sync will work!

### Option 2: Discard Ubuntu Changes (Use Replit Version)
⚠️ **WARNING: This permanently deletes Ubuntu-only changes!**

```bash
cd /home/evin/contain/HomeLabHub
git reset --hard HEAD
```

## After Fixing
Run the homelab manager:
```bash
./homelab-manager.sh
```

Choose option **17** (Sync from Replit)

## Check What Changed
To see what files are different:
```bash
cd /home/evin/contain/HomeLabHub
git status
git diff
```
