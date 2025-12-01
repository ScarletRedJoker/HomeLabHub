# Environment Variables Reference

## Required Environment Variables for Code-Server

The following environment variable must be added to your `.env` file for code-server to function:

### CODE_SERVER_PASSWORD

**Purpose**: Password for accessing VS Code in browser  
**Required**: Yes  
**Security Level**: High - protects access to your entire codebase

**Example**:
```bash
CODE_SERVER_PASSWORD=your_secure_password_here
```

**How to generate a secure password**:
```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(24))'
```

**Example output**:
```
CODE_SERVER_PASSWORD=xK9mP2nQ7vR4sW8tY6uZ5aB3cD1eF0gH
```

### Adding to .env File

1. Open your `.env` file:
   ```bash
   nano .env
   ```

2. Add the following section at the end:
   ```bash
   # ============================================
   # Code-Server (VS Code in Browser)
   # ============================================
   CODE_SERVER_PASSWORD=your_secure_password_here
   ```

3. Replace `your_secure_password_here` with a strong password

4. Save and exit (Ctrl+X, then Y, then Enter)

5. Restart code-server:
   ```bash
   docker-compose -f docker-compose.unified.yml restart code-server
   ```

## Security Best Practices

### Password Requirements
- **Minimum length**: 16 characters
- **Complexity**: Mix of letters, numbers, and special characters
- **Uniqueness**: Don't reuse passwords from other services

### Password Management
- Store passwords in a secure password manager
- Rotate passwords regularly (every 90 days)
- Never commit passwords to version control
- Never share passwords via unencrypted channels

### What NOT to do
❌ Don't use simple passwords like "password123"  
❌ Don't use the same password for multiple services  
❌ Don't share your password with others  
❌ Don't hardcode passwords in scripts or config files  

### What TO do
✅ Use a password generator  
✅ Store passwords in a password manager  
✅ Use unique, complex passwords  
✅ Enable 2FA on domain registrar  

## Complete .env Template for Code-Server

```bash
# ======================================================================
# Code-Server Configuration
# ======================================================================

# Code-Server Password (VS Code in Browser)
# Generate with: python3 -c 'import secrets; print(secrets.token_urlsafe(24))'
CODE_SERVER_PASSWORD=

# Optional: Override default settings
# CODE_SERVER_USER=coder
# CODE_SERVER_UID=1000
# CODE_SERVER_GID=1000
```

## Verification

After adding the environment variable, verify it's set correctly:

```bash
# Check if variable is in .env
grep CODE_SERVER_PASSWORD .env

# Verify container sees the variable
docker exec code-server env | grep PASSWORD
```

## Troubleshooting

### Variable Not Found
If you get "password not set" errors:

1. **Check .env file exists**:
   ```bash
   ls -la .env
   ```

2. **Check variable is set**:
   ```bash
   cat .env | grep CODE_SERVER_PASSWORD
   ```

3. **Restart container**:
   ```bash
   docker-compose -f docker-compose.unified.yml restart code-server
   ```

### Cannot Login
If password doesn't work:

1. **Verify environment variable in container**:
   ```bash
   docker exec code-server env | grep PASSWORD
   ```

2. **Check for special characters** that might need escaping in .env

3. **Regenerate password** without special shell characters:
   ```bash
   python3 -c 'import secrets, string; chars = string.ascii_letters + string.digits; print("".join(secrets.choice(chars) for _ in range(32)))'
   ```

## Related Documentation

- [Code-Server Setup Guide](CODE_SERVER_SETUP.md)
- [Security Best Practices](SECURITY.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)

---

**Last Updated**: November 14, 2025  
**Applies To**: Code-Server v4.x
