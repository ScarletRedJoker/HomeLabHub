# PostgreSQL Architecture Fix

## Current Problems
1. Container named `discord-bot-db` (should be `homelab-postgres`)
2. `ticketbot` is PostgreSQL superuser (should be `postgres`)
3. No dynamic database provisioning from dashboard

## Proposed Architecture

### 1. Rename & Reconfigure PostgreSQL Container

```yaml
homelab-postgres:  # Was: discord-bot-db
  image: postgres:16-alpine
  container_name: homelab-postgres
  restart: unless-stopped
  networks:
    homelab:
      aliases:
        - postgres
        - homelab-postgres
        - discord-bot-db  # Keep alias for backward compatibility during migration
  environment:
    POSTGRES_USER: postgres  # Standard superuser
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: postgres  # Default database
    # Pass passwords for init scripts
    DISCORD_DB_PASSWORD: ${DISCORD_DB_PASSWORD}
    STREAMBOT_DB_PASSWORD: ${STREAMBOT_DB_PASSWORD}
    JARVIS_DB_PASSWORD: ${JARVIS_DB_PASSWORD}
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./config/postgres-init:/docker-entrypoint-initdb.d:ro
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### 2. Dashboard Database Provisioning API

Add to the dashboard:

```python
# services/dashboard/services/database_provisioner.py
class DatabaseProvisioner:
    """Provision new databases for marketplace apps"""
    
    def create_database(self, db_name: str, db_user: str, db_password: str) -> dict:
        """
        Create a new database and user
        Returns: {success: bool, db_url: str, error: str}
        """
        # Connect as superuser
        # Create user
        # Create database
        # Grant permissions
        # Return connection string
```

### 3. Migration Strategy (Zero Downtime)

**Phase 1: Update Configuration (No service restart needed)**
- Update docker-compose.yml with new name + alias
- Keep `discord-bot-db` as network alias
- All existing services continue working

**Phase 2: Add Dashboard Provisioning**
- Add database provisioner service
- Update marketplace deployment to use it

**Phase 3: Documentation Update**
- Update all references from discord-bot-db to homelab-postgres

## Benefits

✅ **Logical naming** - Container name reflects its purpose  
✅ **Standard PostgreSQL setup** - `postgres` superuser  
✅ **Dynamic provisioning** - Dashboard can create databases  
✅ **Zero downtime migration** - Network aliases maintain compatibility  
✅ **Scalability** - Easy to add new databases via dashboard  

## Implementation Priority

1. **Immediate (Fix current migration issue)** - Use ticketbot superuser to drop tables
2. **Next deployment** - Rename container + change superuser
3. **Future feature** - Add dashboard database provisioner API
