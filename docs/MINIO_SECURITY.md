# MinIO Security Configuration

## ⚠️ CRITICAL: Change Default MinIO Credentials

Before deploying to production, you **MUST** change the default MinIO credentials to secure your object storage.

## Step 1: Update docker-compose.unified.yml

Locate the MinIO service configuration in `docker-compose.unified.yml` and change the default credentials:

```yaml
minio:
  image: minio/minio:latest
  container_name: homelab-minio
  environment:
    # CHANGE THESE VALUES!
    MINIO_ROOT_USER: your-secure-username        # Replace with your custom username
    MINIO_ROOT_PASSWORD: your-secure-password    # Must be at least 8 characters
  # ... rest of configuration
```

### Password Requirements:
- Minimum 8 characters long
- Use a strong, random password
- DO NOT use default values like "minioadmin" or "minioadmin123"

### Example Strong Credentials:
```bash
# Generate a secure random password
openssl rand -base64 24
```

## Step 2: Update Dashboard .env File

Update the Dashboard environment variables to match your new MinIO credentials:

```bash
# In services/dashboard/.env
MINIO_ACCESS_KEY=your-secure-username
MINIO_SECRET_KEY=your-secure-password-min-8-chars
```

## Step 3: Restart Services

After updating the credentials, restart the MinIO service and Dashboard:

```bash
cd /path/to/homelab
docker-compose -f docker-compose.unified.yml down
docker-compose -f docker-compose.unified.yml up -d
```

## Step 4: Verify Connection

Check that the Dashboard can connect to MinIO with the new credentials:

1. Visit your Dashboard at `https://host.evindrake.net`
2. Navigate to the File Upload section
3. Try uploading a test file

If the upload succeeds, your MinIO credentials are correctly configured.

## Security Best Practices

1. **Never commit credentials to Git** - Ensure `.env` files are in `.gitignore`
2. **Use strong passwords** - At least 16 characters with mixed case, numbers, and symbols
3. **Rotate credentials regularly** - Change passwords every 90 days
4. **Restrict network access** - MinIO should only be accessible from trusted services
5. **Enable TLS** - Use HTTPS for all MinIO connections in production

## Troubleshooting

### Dashboard cannot connect to MinIO

1. Check that credentials in `docker-compose.unified.yml` match those in `.env`
2. Verify MinIO container is running: `docker ps | grep minio`
3. Check MinIO logs: `docker logs homelab-minio`
4. Ensure MinIO is accessible on the internal network

### Existing data inaccessible

If you change credentials after data has been uploaded, the old data will still be accessible with the new credentials. MinIO stores credentials separately from bucket data.

## Additional Resources

- [MinIO Security Documentation](https://min.io/docs/minio/linux/operations/security.html)
- [MinIO Access Management](https://min.io/docs/minio/linux/administration/identity-access-management.html)
