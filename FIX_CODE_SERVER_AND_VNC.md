# 🔐 Fix Code-Server & VNC Authentication Issues

## 🎯 **Quick Fix (5 minutes)**

Your noVNC and code-server authentication issues can be fixed by setting the missing passwords in your `.env` file.

### **Step 1: SSH to Your Ubuntu Server**
```bash
ssh evin@your-ubuntu-server
cd /home/evin/contain/HomeLabHub
```

### **Step 2: Edit .env File and Add Passwords**
```bash
nano .env
```

Add or update these lines:
```bash
# VNC Desktop Authentication
VNC_PASSWORD=YourSecurePassword123
# This is the password you enter in the noVNC web interface

# Code-Server Authentication
CODE_SERVER_PASSWORD=YourCodeServerPassword456
# This is the password for VS Code web interface
```

**Press:**
- `Ctrl + O` to save
- `Enter` to confirm
- `Ctrl + X` to exit

### **Step 3: Run the Auto-Fix Script**
```bash
./deployment/fix-authentication-issues.sh
```

This script will:
1. ✅ Verify your passwords are set
2. ✅ Restart vnc-desktop container
3. ✅ Restart code-server container
4. ✅ Validate both services are running correctly

### **Step 4: Test Access**

**VNC Desktop:**
- Go to: `https://vnc.evindrake.net`
- You should see the noVNC interface
- Click "Connect"
- Enter your `VNC_PASSWORD` when prompted
- ✅ You should now see your Ubuntu desktop!

**Code-Server:**
- Go to: `https://code.evindrake.net`
- You should see the VS Code login page
- Enter your `CODE_SERVER_PASSWORD`
- ✅ You should now see VS Code in your browser!

---

## 🔍 **What Was Wrong?**

### **Problem 1: CODE_SERVER_PASSWORD Missing**
- **Issue:** `CODE_SERVER_PASSWORD` was used in docker-compose but not documented in .env.template
- **Impact:** Code-server container couldn't start or had no password set
- **Fix:** Added `CODE_SERVER_PASSWORD` to .env.template

### **Problem 2: NoVNC Password Check Failed**
- **Issue:** "New connection has been rejected with reason: password check failed!"
- **Cause:** Either:
  1. `VNC_PASSWORD` not set in your `.env` file, OR
  2. Password set incorrectly, OR
  3. VNC password file not created properly
- **Fix:** Our script recreates the VNC password file and restarts the container

---

## 📋 **Environment Variables Reference**

### **Required for VNC Desktop:**
```bash
VNC_PASSWORD=your_vnc_password_here
# Used when connecting through web browser (noVNC)
# Can be any secure password you choose

VNC_USER_PASSWORD=your_user_password_here
# Ubuntu desktop user password (for sudo commands inside VNC)
```

### **Required for Code-Server:**
```bash
CODE_SERVER_PASSWORD=your_code_server_password_here
# VS Code web interface password
# Can be any secure password you choose
```

---

## 🛠️ **Manual Troubleshooting**

### **If NoVNC Still Won't Connect:**

1. **Check if password is actually set:**
```bash
grep VNC_PASSWORD .env
```

Should output something like: `VNC_PASSWORD=MySecurePassword123`

2. **Rebuild VNC container:**
```bash
docker-compose -f docker-compose.unified.yml up -d --build vnc-desktop
```

3. **Check VNC logs:**
```bash
docker logs vnc-desktop --tail 50 | grep -i "vnc\|password\|x11vnc"
```

Look for:
- ✅ `VNC password setup complete`
- ✅ `INFO success: x11vnc entered RUNNING state`

If you see:
- ❌ `INFO exited: x11vnc (exit status 1)`
- ❌ `VNC_PASSWORD not set`

Then the password isn't being passed correctly. Verify your .env file.

4. **Force rebuild with no cache:**
```bash
docker-compose -f docker-compose.unified.yml build --no-cache vnc-desktop
docker-compose -f docker-compose.unified.yml up -d vnc-desktop
```

### **If Code-Server Still Won't Connect:**

1. **Check if password is set:**
```bash
grep CODE_SERVER_PASSWORD .env
```

2. **Check code-server logs:**
```bash
docker logs code-server --tail 50
```

Look for:
- ✅ `HTTP server listening on...`
- ✅ Using password from /config/.config/code-server/config.yaml

If you see:
- ❌ `EACCES: permission denied`

Run:
```bash
VOLUME_PATH=$(docker volume inspect code_server_data --format '{{ .Mountpoint }}')
sudo chown -R 1000:1000 "$VOLUME_PATH"
docker-compose -f docker-compose.unified.yml restart code-server
```

3. **Test internal connection:**
```bash
docker exec code-server curl -k https://localhost:8443/healthz
```

Should return: `OK`

---

## 🔐 **Security Notes**

### **Current Setup:**
- ✅ **Code-Server:** Password-protected, HTTPS with Let's Encrypt SSL
- ✅ **VNC Desktop:** Password-protected, HTTPS with Let's Encrypt SSL
- ✅ **Both services** are publicly accessible but require passwords

### **Optional: Add VPN-Only Access**

If you want to restrict access to Twingate VPN only:

**Edit Caddyfile:**
```bash
nano Caddyfile
```

**For code.evindrake.net**, uncomment the VPN restriction:
```caddy
code.evindrake.net {
    @vpn_only {
        remote_ip 100.64.0.0/10  # Twingate VPN range
    }
    handle @vpn_only {
        reverse_proxy http://code-server:8443 {
            # ... existing config ...
        }
    }
    handle {
        respond "VPN Access Required" 403
    }
}
```

**For vnc.evindrake.net**, uncomment similar block.

Then restart Caddy:
```bash
docker-compose -f docker-compose.unified.yml restart caddy
```

---

## 🎉 **Expected Results After Fix**

### **VNC Desktop (vnc.evindrake.net):**
1. Page loads with noVNC interface ✅
2. Click "Connect" button
3. Enter `VNC_PASSWORD` when prompted
4. Desktop appears with full Ubuntu LXDE environment ✅
5. Can use Firefox, file manager, terminal, etc. ✅

### **Code-Server (code.evindrake.net):**
1. Page loads with VS Code login page ✅
2. Enter `CODE_SERVER_PASSWORD`
3. VS Code interface appears ✅
4. Can browse `/config/workspace` (mapped to `/home/evin/contain`) ✅
5. Can edit code, use terminal, install extensions ✅

---

## 📞 **Still Having Issues?**

### **Check Service Status:**
```bash
docker ps | grep -E "vnc-desktop|code-server"
```

Both should show "Up" status.

### **Check Caddy Logs:**
```bash
docker logs caddy --tail 100 | grep -E "code.evindrake|vnc.evindrake"
```

Look for SSL certificate issuance and reverse proxy errors.

### **Full Service Restart:**
```bash
docker-compose -f docker-compose.unified.yml restart vnc-desktop code-server caddy
```

### **Check Network Connectivity:**
```bash
# Test from within containers
docker exec caddy curl -f http://vnc-desktop:80
docker exec caddy curl -k https://code-server:8443/healthz
```

---

## ✅ **Verification Checklist**

- [ ] VNC_PASSWORD is set in `.env`
- [ ] CODE_SERVER_PASSWORD is set in `.env`
- [ ] VNC_USER_PASSWORD is set in `.env`
- [ ] Ran `./deployment/fix-authentication-issues.sh`
- [ ] vnc-desktop container is running
- [ ] code-server container is running
- [ ] Can access https://vnc.evindrake.net (shows noVNC page)
- [ ] Can access https://code.evindrake.net (shows VS Code login)
- [ ] Can login to VNC with password
- [ ] Can login to Code-Server with password

---

**Need Help?** Check logs with:
```bash
docker logs vnc-desktop --tail 100
docker logs code-server --tail 100
```
