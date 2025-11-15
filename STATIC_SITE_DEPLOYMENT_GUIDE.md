# Static Site Deployment Guide

## Overview

This guide covers the deployment and management of static websites in the homelab infrastructure:
- **scarletredjoker.com** - Personal portfolio site (services/static-site/)
- **rig-city.com** - Community site (services/rig-city-site/)

Both sites use Docker containers with Nginx for serving static content and Caddy for automatic SSL/TLS certificate management via Let's Encrypt.

## Architecture

### Infrastructure Components

1. **Nginx Containers** - Serve static HTML/CSS/JS files
   - `scarletredjoker-web` - Container for scarletredjoker.com
   - `rig-city-site` - Container for rig-city.com

2. **Caddy Reverse Proxy** - Handles:
   - Automatic SSL certificate provisioning via Let's Encrypt
   - HTTPS redirection
   - Request routing to backend containers
   - HTTP/2 support

3. **Docker Compose** - Orchestration defined in `docker-compose.unified.yml`

4. **Monitoring Dashboard** - Real-time health monitoring at https://evindrake.net/monitoring

### Directory Structure

```
homelab/
├── services/
│   ├── static-site/           # scarletredjoker.com content
│   │   ├── index.html
│   │   ├── css/
│   │   ├── js/
│   │   └── assets/
│   │
│   └── rig-city-site/         # rig-city.com content
│       ├── index.html
│       ├── css/
│       ├── js/
│       └── assets/
│
├── deployment/
│   ├── validate-static-site.sh    # Pre-deployment validation
│   ├── deploy-static-site.sh      # Blue-green deployment
│   └── static-site-deployments.log
│
├── docker-compose.unified.yml
└── Caddyfile
```

## Health Checks

### Docker Compose Health Checks

Both static sites have health checks configured in `docker-compose.unified.yml`:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:80/"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

These health checks:
- Run every 30 seconds
- Verify the site responds with HTTP 200
- Mark container unhealthy after 3 consecutive failures
- Allow 10 seconds for container startup

### Monitoring Dashboard Health Checks

The monitoring dashboard (https://evindrake.net/monitoring) provides comprehensive health monitoring:

**Metrics Tracked:**
- Container status (running/stopped/unhealthy)
- HTTP response time (milliseconds)
- Disk usage of site files
- Last modified timestamp
- Last deployment time and status
- Content validation (expected elements present)

**API Endpoints:**
- `GET /api/static-sites/status` - Status of both sites
- `GET /api/static-sites/<site_id>/health` - Detailed health check
- `GET /api/static-sites/<site_id>/deployments` - Deployment history

## Deployment Process

### Prerequisites

1. SSH access to the server
2. Docker and Docker Compose installed
3. Valid DNS records pointing to server:
   - scarletredjoker.com → Server IP
   - rig-city.com → Server IP
4. Ports 80 and 443 accessible for SSL certificate provisioning

### Manual Deployment (Simple)

For small updates to existing sites:

```bash
# 1. Navigate to site directory
cd /app/services/static-site  # or /app/services/rig-city-site

# 2. Edit files as needed
nano index.html

# 3. Restart the container
docker-compose -f /app/docker-compose.unified.yml restart scarletredjoker-web
# or
docker-compose -f /app/docker-compose.unified.yml restart rig-city-site

# 4. Verify deployment
curl -I https://scarletredjoker.com
```

### Automated Deployment with Validation

For production deployments with validation and zero downtime:

```bash
# Deploy scarletredjoker.com
./deployment/deploy-static-site.sh scarletredjoker

# Deploy rig-city.com
./deployment/deploy-static-site.sh rig-city
```

The deployment script performs:
1. **Pre-deployment validation** (HTML/CSS/JS syntax, assets)
2. **Blue-green deployment** (creates new container, validates, switches traffic)
3. **Automatic rollback** on failure
4. **Deployment logging** to track history

### Deployment Script Options

```bash
# Standard deployment
./deployment/deploy-static-site.sh <site-name>

# Skip validation (not recommended)
./deployment/deploy-static-site.sh <site-name> --skip-validation

# Force deployment even if validation warnings exist
./deployment/deploy-static-site.sh <site-name> --force

# Dry run (validation only, no deployment)
./deployment/validate-static-site.sh <site-name>
```

### Blue-Green Deployment Process

The deployment script implements blue-green deployment:

1. **Create Green Container** - New container with updated content
2. **Health Check** - Verify green container is healthy
3. **Content Validation** - Check for expected content
4. **Traffic Switch** - Update Caddy to route to green container
5. **Monitor** - Verify traffic flows correctly
6. **Cleanup** - Remove old blue container

If any step fails, the script automatically rolls back to the blue container.

## Content Updates

### Adding New Pages

1. Create HTML file in site directory:
```bash
cd /app/services/static-site
nano new-page.html
```

2. Update navigation in index.html to link to new page

3. Validate and deploy:
```bash
./deployment/validate-static-site.sh scarletredjoker
./deployment/deploy-static-site.sh scarletredjoker
```

### Updating Styles

1. Edit CSS files:
```bash
cd /app/services/static-site/css
nano style.css
```

2. Test locally (if possible) or validate:
```bash
./deployment/validate-static-site.sh scarletredjoker
```

3. Deploy changes:
```bash
./deployment/deploy-static-site.sh scarletredjoker
```

### Adding Assets (Images, Fonts, etc.)

1. Copy assets to appropriate directory:
```bash
cp new-image.jpg /app/services/static-site/assets/
```

2. Reference in HTML:
```html
<img src="/assets/new-image.jpg" alt="Description">
```

3. Validate references and deploy:
```bash
./deployment/validate-static-site.sh scarletredjoker
./deployment/deploy-static-site.sh scarletredjoker
```

## Validation

### Pre-Deployment Validation

The `validate-static-site.sh` script performs comprehensive validation:

**HTML Validation:**
- Syntax checking with `tidy` (if available) or basic checks
- Required elements present (html, head, body, title)
- Proper tag nesting

**CSS Validation:**
- Syntax checking with `csslint` or basic parsing
- No unclosed braces or syntax errors

**JavaScript Validation:**
- Syntax checking with `node` (if available)
- No obvious parse errors

**Asset Validation:**
- All referenced images exist
- All referenced CSS files exist
- All referenced JS files exist
- No broken internal links

**Output:**
```
Validating static site: scarletredjoker
✓ HTML validation passed
✓ CSS validation passed
✓ JavaScript validation passed
✓ All image references valid
✓ All CSS references valid
✓ All JS references valid

Validation Summary:
Status: PASSED
Errors: 0
Warnings: 0
```

### Running Validation

```bash
# Validate scarletredjoker.com
./deployment/validate-static-site.sh scarletredjoker

# Validate rig-city.com
./deployment/validate-static-site.sh rig-city

# Check exit code in scripts
if ./deployment/validate-static-site.sh scarletredjoker; then
    echo "Validation passed"
else
    echo "Validation failed"
fi
```

## Monitoring

### Monitoring Dashboard

Access the monitoring dashboard at: https://evindrake.net/monitoring

**Static Sites Section shows:**
- Current status (Healthy/Degraded/Down)
- Container status
- Response time in milliseconds
- Disk usage
- Last content modification time
- Last deployment time and status

**Color Coding:**
- 🟢 Green - Healthy (HTTP 200, fast response)
- 🟡 Yellow - Degraded (slow response or warnings)
- 🔴 Red - Down (container stopped or HTTP errors)

### API Monitoring

Query static site status via API:

```bash
# Get status of both sites
curl https://evindrake.net/api/static-sites/status

# Get detailed health for scarletredjoker.com
curl https://evindrake.net/api/static-sites/scarletredjoker/health

# Get deployment history
curl https://evindrake.net/api/static-sites/scarletredjoker/deployments
```

### Manual Health Checks

```bash
# Check container status
docker ps | grep -E 'scarletredjoker-web|rig-city-site'

# Check container health
docker inspect scarletredjoker-web | jq '.[0].State.Health'

# Check HTTP response
curl -I https://scarletredjoker.com
curl -I https://rig-city.com

# Check SSL certificate
openssl s_client -connect scarletredjoker.com:443 -servername scarletredjoker.com < /dev/null | openssl x509 -noout -dates

# View container logs
docker logs scarletredjoker-web
docker logs rig-city-site
```

## Troubleshooting

### Site Returns 502 Bad Gateway

**Possible Causes:**
- Container is stopped or unhealthy
- Container port not accessible
- Caddy configuration error

**Solutions:**
```bash
# Check container status
docker ps -a | grep scarletredjoker-web

# Restart container if stopped
docker-compose -f /app/docker-compose.unified.yml restart scarletredjoker-web

# Check container logs
docker logs scarletredjoker-web --tail 50

# Verify port binding
docker port scarletredjoker-web

# Restart Caddy if configuration changed
docker-compose -f /app/docker-compose.unified.yml restart caddy
```

### SSL Certificate Not Working

**Possible Causes:**
- DNS not pointing to server
- Ports 80/443 not accessible
- Let's Encrypt rate limit reached

**Solutions:**
```bash
# Check DNS resolution
nslookup scarletredjoker.com

# Check if ports are accessible
telnet scarletredjoker.com 80
telnet scarletredjoker.com 443

# Check Caddy logs for SSL errors
docker logs caddy --tail 100 | grep -i "certificate\|acme\|tls"

# Force SSL renewal (if needed)
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Site Shows Old Content After Deployment

**Possible Causes:**
- Browser cache
- CDN cache (if using)
- Container not restarted
- Wrong container updated

**Solutions:**
```bash
# Verify container is running latest version
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}"

# Force container recreate
docker-compose -f /app/docker-compose.unified.yml up -d --force-recreate scarletredjoker-web

# Check file timestamps inside container
docker exec scarletredjoker-web ls -lh /usr/share/nginx/html/

# Clear browser cache and hard reload (Ctrl+Shift+R)
```

### Deployment Validation Fails

**Possible Causes:**
- HTML syntax errors
- Missing referenced assets
- Broken links
- CSS/JS syntax errors

**Solutions:**
```bash
# Run validation to see specific errors
./deployment/validate-static-site.sh scarletredjoker

# Check for common HTML errors
grep -r "src=\"\"" /app/services/static-site/
grep -r "href=\"\"" /app/services/static-site/

# Validate HTML manually
tidy -errors /app/services/static-site/index.html

# Check for missing files
find /app/services/static-site/ -type f -name "*.html" -exec grep -Ho 'src="[^"]*"' {} \; | cut -d'"' -f2 | sort | uniq
```

### Container Fails Health Check

**Possible Causes:**
- Nginx not starting
- Configuration error
- Port not listening
- Missing files

**Solutions:**
```bash
# Check container logs
docker logs scarletredjoker-web

# Exec into container and test manually
docker exec -it scarletredjoker-web sh
curl localhost:80
nginx -t
ps aux

# Check health check status
docker inspect scarletredjoker-web | jq '.[0].State.Health'

# Restart container
docker-compose -f /app/docker-compose.unified.yml restart scarletredjoker-web
```

### High Response Time

**Possible Causes:**
- Server resource constraints (CPU/RAM)
- Large images not optimized
- Too many external resources
- Network issues

**Solutions:**
```bash
# Check server resources
docker stats scarletredjoker-web --no-stream

# Optimize images
find /app/services/static-site/assets/ -name "*.jpg" -o -name "*.png" | xargs ls -lh

# Check for large files
du -sh /app/services/static-site/*

# Monitor response time
time curl -I https://scarletredjoker.com
```

## Rollback Procedure

### Automatic Rollback

The deployment script automatically rolls back on failure. Check logs:

```bash
tail -20 /app/deployment/static-site-deployments.log
```

### Manual Rollback

If you need to manually rollback to a previous version:

```bash
# 1. Find previous working version (if using git)
cd /app/services/static-site
git log --oneline

# 2. Revert to previous commit
git checkout <commit-hash> .

# 3. Redeploy
./deployment/deploy-static-site.sh scarletredjoker

# OR restore from backup if available
cp -r /backup/static-site-YYYY-MM-DD/ /app/services/static-site/
./deployment/deploy-static-site.sh scarletredjoker
```

## Security Considerations

### SSL/TLS

- Caddy automatically provisions SSL certificates via Let's Encrypt
- Certificates auto-renew before expiration
- HTTPS enforced for all traffic (HTTP redirects to HTTPS)
- Modern TLS protocols only (TLS 1.2+)

### Content Security

- Static sites only serve files, no server-side execution
- No user input accepted
- No database connections
- Regular content validation prevents malicious injections

### Access Control

- Only authorized users can deploy (SSH access required)
- Deployment scripts log all activities
- Monitoring dashboard requires authentication

## Best Practices

### Before Every Deployment

1. **Test locally** if possible
2. **Run validation** script
3. **Review changes** carefully
4. **Check monitoring dashboard** for current status
5. **Notify users** if expecting downtime (though blue-green prevents this)
6. **Have rollback plan** ready

### Content Guidelines

1. **Optimize images** before adding:
   ```bash
   # Resize large images
   convert large-image.jpg -resize 1920x1080\> optimized-image.jpg
   
   # Compress JPEG
   jpegoptim --max=85 image.jpg
   
   # Compress PNG
   optipng -o5 image.png
   ```

2. **Minify CSS/JS** for production:
   ```bash
   # CSS
   csso style.css -o style.min.css
   
   # JS
   uglifyjs script.js -o script.min.js
   ```

3. **Use relative paths** for assets:
   ```html
   <!-- Good -->
   <img src="/assets/image.jpg">
   <link rel="stylesheet" href="/css/style.css">
   
   <!-- Avoid absolute URLs -->
   <img src="https://scarletredjoker.com/assets/image.jpg">
   ```

4. **Include meta tags** for SEO:
   ```html
   <meta name="description" content="Site description">
   <meta name="keywords" content="keyword1, keyword2">
   <meta property="og:title" content="Page Title">
   <meta property="og:image" content="/assets/preview.jpg">
   ```

### Regular Maintenance

1. **Monitor disk usage** - Check dashboard regularly
2. **Review logs** - Check for errors or unusual activity
3. **Update content** - Keep information current
4. **Test SSL** - Verify certificates are valid
5. **Backup regularly** - Keep copies of important content
6. **Review analytics** - Monitor traffic patterns (if analytics configured)

## Deployment Checklist

Use this checklist for every deployment:

- [ ] Changes tested locally (if possible)
- [ ] Validation script run successfully
- [ ] No errors in validation output
- [ ] Warnings reviewed and acceptable
- [ ] All assets optimized
- [ ] Deployment script ready
- [ ] Rollback plan prepared
- [ ] Current status checked on monitoring dashboard
- [ ] Deployment executed
- [ ] New deployment verified on monitoring dashboard
- [ ] Site manually tested (load pages, click links)
- [ ] Response time acceptable
- [ ] SSL certificate valid
- [ ] Deployment logged
- [ ] Users notified (if major changes)

## Additional Resources

### Useful Commands

```bash
# View all static site containers
docker ps | grep -E 'static-site|rig-city-site|scarletredjoker'

# View deployment history
tail -50 /app/deployment/static-site-deployments.log

# Check Caddy routing
docker exec caddy caddy list-routes

# Test site from server
curl -I http://localhost:<port>

# Check DNS
dig scarletredjoker.com
dig rig-city.com

# Monitor in real-time
watch -n 5 'curl -s https://scarletredjoker.com | head -20'
```

### Log Locations

- Deployment logs: `/app/deployment/static-site-deployments.log`
- Container logs: `docker logs <container-name>`
- Caddy logs: `docker logs caddy`
- Nginx access logs: Inside containers at `/var/log/nginx/`

### Configuration Files

- Docker Compose: `/app/docker-compose.unified.yml`
- Caddy config: `/app/Caddyfile`
- Deployment script: `/app/deployment/deploy-static-site.sh`
- Validation script: `/app/deployment/validate-static-site.sh`

## Support

For issues or questions:

1. Check monitoring dashboard: https://evindrake.net/monitoring
2. Review troubleshooting section above
3. Check deployment logs
4. Examine container logs
5. Verify DNS and SSL configuration

## Change Log

Keep track of major changes to sites:

```
2024-11-15: Added blue-green deployment capability
2024-11-15: Added comprehensive health monitoring
2024-11-15: Added deployment validation scripts
2024-11-15: Enhanced monitoring dashboard with static site widgets
```

---

**Document Version:** 1.0  
**Last Updated:** November 15, 2024  
**Author:** Homelab Infrastructure Team
