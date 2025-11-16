# Production vs Demo Architecture

## Two Separate Instances

### host.evindrake.net - PRODUCTION (Your Real Dashboard)
- **Purpose**: Your actual homelab management platform
- **Access**: Private (requires real credentials)
- **Features**: Full functionality
  - Real service deployment
  - Container marketplace with actual deployments
  - Code generation and execution
  - Real system monitoring
  - All autonomous Jarvis actions
- **Data**: Real containers, real services, real operations
- **Config**: DEMO_MODE=false

### test.evindrake.net - DEMO (Public Investor Site)
- **Purpose**: Safe demo for investors/public
- **Access**: Public (auto-login: demo/demo)
- **Features**: Same UI but isolated
  - Mock deployments (don't touch production)
  - Simulated responses
  - Read-only operations
  - No access to real infrastructure
- **Data**: Mock/simulated data only
- **Config**: DEMO_MODE=true, isolated database

## Implementation Strategy

### Option 1: Two Containers (RECOMMENDED)
```yaml
# Production Dashboard
homelab-dashboard:
  environment:
    - DEMO_MODE=false
    - WEB_USERNAME=${PROD_USERNAME}
    - WEB_PASSWORD=${PROD_PASSWORD}
  # Caddy: host.evindrake.net

# Demo Dashboard  
homelab-dashboard-demo:
  environment:
    - DEMO_MODE=true
    - WEB_USERNAME=demo
    - WEB_PASSWORD=demo
  # Caddy: test.evindrake.net
```

### Option 2: Domain-Based Routing (Single Container)
- Less resource usage
- Requires middleware to detect domain
- Less isolated (riskier for public demo)

## Security Considerations

### Production Protection
- Private credentials only
- No auto-login
- Full audit logging
- Rate limiting per user

### Demo Protection
- Read-only mock operations
- Isolated database (or schema)
- No real service access
- Public but safe
- Code obfuscation (minify JS/CSS)
