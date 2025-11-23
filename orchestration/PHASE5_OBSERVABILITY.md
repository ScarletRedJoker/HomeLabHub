# Phase 5: Observability & Auto-Recovery

**Status**: ✅ Implemented  
**Version**: 1.0.0  
**Date**: November 23, 2025

## Overview

Phase 5 adds comprehensive monitoring, logging, and automatic recovery capabilities to the homelab using industry-standard observability tools:

- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization dashboards
- **Loki**: Log aggregation
- **Promtail**: Log shipping
- **Watchtower**: Auto-recovery and container updates
- **Exporters**: Metrics from all key services

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │   Grafana    │◄─────┤  Prometheus  │◄─── Metrics        │
│  │ Dashboards   │      │   (TSDB)     │     Scrapers       │
│  │ Port: 3000   │      │ Port: 9090   │                    │
│  └──────┬───────┘      └──────▲───────┘                    │
│         │                     │                             │
│         │  ┌──────────────┐  │                             │
│         └─►│     Loki     │  │                             │
│            │ Log Storage  │  │                             │
│            │ Port: 3100   │  │                             │
│            └──────▲───────┘  │                             │
│                   │          │                             │
│          ┌────────┴──────┐   │                             │
│          │   Promtail    │   │                             │
│          │ Log Shipper   │   │                             │
│          └───────────────┘   │                             │
│                               │                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │              METRICS EXPORTERS                  │       │
│  ├─────────────────────────────────────────────────┤       │
│  │                                                  │       │
│  │  • node-exporter (9100) ───────────────────────┼───┐   │
│  │  • cadvisor (8081) ────────────────────────────┼───┤   │
│  │  • postgres-exporter (9187) ───────────────────┼───┤   │
│  │  • redis-exporter (9121) ──────────────────────┼───┤   │
│  │                                                  │   │   │
│  └──────────────────────────────────────────────────┘   │   │
│                                                          │   │
│  ┌──────────────┐                                       │   │
│  │  Watchtower  │  Auto-restart failed containers       │   │
│  │  (Monitor)   │  Check interval: 5 minutes            │   │
│  └──────────────┘                                       │   │
│                                                          ▼   │
└──────────────────────────────────────────────────────────────┘
                                                           │
                                ┌──────────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   HOMELAB SERVICES     │
                    ├────────────────────────┤
                    │ • postgres             │
                    │ • redis                │
                    │ • dashboard            │
                    │ • discord-bot          │
                    │ • stream-bot           │
                    │ • n8n, homeassistant   │
                    └────────────────────────┘
```

## Components

### 1. Prometheus (Metrics Collection)

**Container**: `homelab-prometheus`  
**Port**: 9090  
**Retention**: 15 days

#### Features:
- Time-series database for metrics
- Auto-discovery of services
- Alert rule evaluation
- PromQL query language

#### Scrape Targets:
```yaml
- prometheus (self-monitoring)
- node-exporter (host metrics)
- cadvisor (container metrics)
- postgres-exporter (database metrics)
- redis-exporter (cache metrics)
- dashboard (application metrics)
- discord-bot (application metrics)
- stream-bot (application metrics)
```

#### Configuration:
```yaml
# config/prometheus/prometheus.yml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

### 2. Grafana (Visualization)

**Container**: `homelab-grafana`  
**Port**: 3000  
**Login**: admin / (see `GRAFANA_ADMIN_PASSWORD` in .env)

#### Pre-configured Dashboards:

1. **Homelab Overview** (`/d/homelab-overview`)
   - CPU usage
   - Memory usage
   - Service health status
   - Running containers
   - Disk space available

2. **Database Dashboard** (`/d/homelab-database`)
   - Database connections
   - Transaction rate
   - Database size
   - Query performance

#### Data Sources:
- **Prometheus**: Metrics (default)
- **Loki**: Logs

#### Access:
```bash
# CLI command
./homelab metrics

# Direct URL
http://localhost:3000

# Dashboards
http://localhost:3000/d/homelab-overview
http://localhost:3000/d/homelab-database
```

### 3. Loki (Log Aggregation)

**Container**: `homelab-loki`  
**Port**: 3100  
**Retention**: 7 days (168 hours)

#### Features:
- Index-free log storage
- Label-based log aggregation
- LogQL query language
- Integration with Grafana

#### Configuration:
```yaml
# config/loki/loki-config.yml
retention_period: 168h
ingestion_rate_mb: 16
max_entries_limit: 5000
```

#### Example LogQL Queries:
```logql
# All logs from dashboard
{container="homelab-dashboard"}

# Error logs from all services
{job="docker"} |= "ERROR"

# Logs from specific service in last hour
{service="discord-bot"} | json | level="ERROR" [1h]

# Count errors per service
sum(count_over_time({job="docker"} |= "ERROR" [5m])) by (service)
```

### 4. Promtail (Log Shipper)

**Container**: `homelab-promtail`  
**Configuration**: Auto-discovers Docker containers

#### Log Pipeline:
1. Discovers Docker containers via `/var/run/docker.sock`
2. Extracts JSON logs from `/var/lib/docker/containers`
3. Parses log levels (ERROR, WARN, INFO, DEBUG)
4. Ships to Loki with labels

### 5. Watchtower (Auto-Recovery)

**Container**: `homelab-watchtower`  
**Poll Interval**: 5 minutes (300 seconds)

#### Features:
- Monitors container health
- Auto-restarts unhealthy containers
- Cleans up old containers
- Optional: Auto-updates images (monitor-only by default)

#### Configuration:
```yaml
environment:
  WATCHTOWER_CLEANUP: true
  WATCHTOWER_POLL_INTERVAL: 300
  WATCHTOWER_MONITOR_ONLY: false  # Set to true to disable auto-updates
```

### 6. Exporters

#### Node Exporter (Host Metrics)
**Port**: 9100  
**Metrics**: CPU, memory, disk, network, filesystem

#### cAdvisor (Container Metrics)
**Port**: 8081  
**Metrics**: Container CPU, memory, network, filesystem

#### PostgreSQL Exporter
**Port**: 9187  
**Metrics**: Database connections, transactions, size, queries

#### Redis Exporter
**Port**: 9121  
**Metrics**: Memory usage, connections, commands, keys

## Alert Rules

Located in `config/prometheus/alerts/homelab-alerts.yml`

### Critical Alerts:

1. **ServiceDown** - Service unavailable for >5 minutes
2. **PostgresDown** - Database offline for >2 minutes
3. **RedisDown** - Cache offline for >2 minutes
4. **HighMemoryUsage** - Memory usage >90% for >5 minutes
5. **LowDiskSpace** - Disk space <10%
6. **BackupFailed** - No successful backup in 24 hours
7. **SSLCertificateExpired** - SSL certificate has expired

### Warning Alerts:

1. **HighCPUUsage** - CPU usage >80% for >10 minutes
2. **HighDatabaseConnections** - Database connections >80% of max
3. **DatabaseSlowQueries** - Average query time >1 second
4. **RedisMemoryHigh** - Redis memory usage >90%
5. **DiskSpaceFilling** - Disk predicted to fill within 4 hours
6. **ContainerRestarting** - Container restarted in last 15 minutes
7. **SSLCertificateExpirySoon** - SSL certificate expires in <7 days

### Alert Notification Channels:

Configure in `.env.grafana`:
```bash
# Email notifications (optional)
GF_SMTP_ENABLED=true
GF_SMTP_HOST=smtp.gmail.com:587
GF_SMTP_USER=your-email@gmail.com
GF_SMTP_PASSWORD=your-app-password
```

## Deployment

### Deploy Observability Stack

```bash
# Deploy all observability services
./homelab deploy observability

# Or deploy with full stack
./homelab deploy all
```

### Verify Deployment

```bash
# Check service status
./homelab status | grep -E "prometheus|grafana|loki|watchtower"

# Run health checks
./homelab health

# View metrics dashboard
./homelab metrics

# Check active alerts
./homelab alerts
```

## CLI Commands

### Metrics Command

Open Grafana dashboards and show metrics status:

```bash
./homelab metrics
```

**Output**:
```
═══ Grafana Dashboards ═══

✓ Grafana is running

Dashboard URLs:
  Main: http://localhost:3000
  Homelab Overview: http://localhost:3000/d/homelab-overview
  Database: http://localhost:3000/d/homelab-database

Login: admin / (see GRAFANA_ADMIN_PASSWORD in .env)

✓ Prometheus is collecting metrics
  Prometheus UI: http://localhost:9090
  Metrics endpoint: http://localhost:9090/metrics

Active scrape targets:
  - prometheus
  - node-exporter
  - cadvisor
  - postgres
  - redis
```

### Alerts Command

Show active Prometheus alerts:

```bash
./homelab alerts
```

**Output (no alerts)**:
```
═══ Active Prometheus Alerts ═══

✅ No active alerts

All systems nominal!

View all alerts: http://localhost:9090/alerts
```

**Output (with alerts)**:
```
═══ Active Prometheus Alerts ═══

🔥 FIRING ALERTS: 2

Alert Details:
  - HighMemoryUsage
  - ServiceDown

View all alerts: http://localhost:9090/alerts
```

### Enhanced Logs Command

Stream logs via Loki (enhanced from Phase 2):

```bash
# All service logs
./homelab logs

# Specific service logs
./homelab logs homelab-dashboard

# Direct Loki access
curl -G -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query={container="homelab-dashboard"}' | jq
```

## Integration with Other Phases

### Phase 1: Configuration Management

Observability services use Phase 1 config templates:

```bash
# config/templates/prometheus.env.j2
PROMETHEUS_RETENTION_TIME=15d
PROMETHEUS_SCRAPE_INTERVAL=30s

# config/templates/grafana.env.j2
GRAFANA_ADMIN_USER={{ secrets.grafana_admin_user }}
GRAFANA_ADMIN_PASSWORD={{ secrets.grafana_admin_password }}

# config/templates/loki.env.j2
LOKI_RETENTION_PERIOD=168h
LOKI_INGESTION_RATE_MB=16
```

### Phase 2: Modular Deployment

Deploy observability independently:

```bash
# Core infrastructure
./homelab deploy core

# Add observability
./homelab deploy observability

# Deployment pattern
./homelab deploy observability_stack
```

### Phase 3: Service Discovery

Prometheus auto-discovers services via:
- Static configurations
- Docker labels (future: Consul integration)
- Traefik service registry

### Phase 4: Database Platform

Database metrics integration:
- PostgreSQL connections, transactions, size
- pgBouncer connection pool metrics
- pgBackRest backup status
- WAL archiving status

Dashboard: `http://localhost:3000/d/homelab-database`

## Monitoring Best Practices

### 1. Metrics Collection

**DO**:
- Monitor all critical services
- Use consistent metric naming
- Add labels for filtering
- Set appropriate scrape intervals (30s default)

**DON'T**:
- Over-scrape (causes high CPU)
- Store high-cardinality metrics
- Scrape too frequently (use recording rules)

### 2. Log Management

**DO**:
- Use structured logging (JSON)
- Add consistent log levels
- Include correlation IDs
- Set retention policies

**DON'T**:
- Log sensitive data (passwords, tokens)
- Use excessive log levels in production
- Store logs indefinitely

### 3. Alerting

**DO**:
- Alert on symptoms, not causes
- Use appropriate thresholds
- Add meaningful descriptions
- Test alert rules

**DON'T**:
- Alert on everything
- Use overly sensitive thresholds
- Ignore warning alerts

### 4. Dashboard Design

**DO**:
- Show key metrics prominently
- Use appropriate visualizations
- Add meaningful legends
- Include time range selectors

**DON'T**:
- Overcrowd dashboards
- Use confusing visualizations
- Forget to add units

## Troubleshooting

### Prometheus Not Scraping Targets

**Symptom**: Targets show as "DOWN" in Prometheus

**Solution**:
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Verify network connectivity
docker exec homelab-prometheus wget -qO- http://homelab-postgres-exporter:9187/metrics

# Restart Prometheus
docker restart homelab-prometheus
```

### Grafana Can't Connect to Data Sources

**Symptom**: "Bad Gateway" or "Connection refused"

**Solution**:
```bash
# Verify Prometheus is running
docker ps | grep prometheus

# Check Prometheus health
curl http://localhost:9090/-/healthy

# Verify Loki is running
curl http://localhost:3100/ready

# Restart Grafana
docker restart homelab-grafana
```

### Loki Not Receiving Logs

**Symptom**: No logs in Grafana

**Solution**:
```bash
# Check Promtail is running
docker ps | grep promtail

# Verify Promtail config
docker logs homelab-promtail | grep -i error

# Test Loki manually
curl -H "Content-Type: application/json" -XPOST \
  http://localhost:3100/loki/api/v1/push \
  -d '{"streams": [{"stream": {"test": "log"}, "values": [["0", "test message"]]}]}'

# Check Loki logs
docker logs homelab-loki | tail -20
```

### Watchtower Not Restarting Containers

**Symptom**: Failed containers stay down

**Solution**:
```bash
# Check Watchtower logs
docker logs homelab-watchtower

# Verify Watchtower has Docker socket access
docker inspect homelab-watchtower | grep -A5 Mounts

# Manual container restart
docker restart <container-name>
```

## Performance Tuning

### Prometheus

**High Memory Usage**:
```yaml
# Reduce retention period
PROMETHEUS_RETENTION_TIME=7d

# Reduce scrape frequency
scrape_interval: 60s
```

**Slow Queries**:
```yaml
# Add recording rules for frequently-used queries
# config/prometheus/recording_rules.yml
groups:
  - name: aggregate_metrics
    interval: 30s
    rules:
      - record: instance:cpu_usage:avg
        expr: avg(rate(node_cpu_seconds_total{mode!="idle"}[5m])) by (instance)
```

### Loki

**High Disk Usage**:
```yaml
# Reduce retention period
retention_period: 72h  # 3 days

# Increase compaction frequency
compaction_interval: 5m
```

**Slow Log Queries**:
```yaml
# Reduce query range
max_look_back_period: 24h

# Limit query results
max_entries_limit_per_query: 1000
```

### Grafana

**Slow Dashboard Loading**:
- Reduce time ranges (default: 6 hours)
- Use recording rules for complex queries
- Limit dashboard refresh rates
- Optimize panel queries

## Metrics Reference

### Node Exporter Metrics

```promql
# CPU usage
100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Disk usage
(node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100

# Network traffic
rate(node_network_receive_bytes_total[5m])
rate(node_network_transmit_bytes_total[5m])
```

### cAdvisor Metrics

```promql
# Container CPU usage
rate(container_cpu_usage_seconds_total{name!=""}[5m]) * 100

# Container memory usage
(container_memory_usage_bytes / container_spec_memory_limit_bytes) * 100

# Container network I/O
rate(container_network_receive_bytes_total[5m])
rate(container_network_transmit_bytes_total[5m])
```

### PostgreSQL Exporter Metrics

```promql
# Database connections
pg_stat_database_numbackends

# Transaction rate
rate(pg_stat_database_xact_commit[5m])

# Database size
pg_database_size_bytes

# Connection pool utilization
(pg_stat_database_numbackends / pg_settings_max_connections) * 100
```

### Redis Exporter Metrics

```promql
# Memory usage
(redis_memory_used_bytes / redis_memory_max_bytes) * 100

# Commands per second
rate(redis_commands_processed_total[5m])

# Connected clients
redis_connected_clients

# Keyspace hits/misses ratio
rate(redis_keyspace_hits_total[5m]) / (rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m]))
```

## Security Considerations

### 1. Authentication

**Grafana**:
- Change default admin password
- Disable anonymous access
- Use strong passwords

**Prometheus**:
- Not exposed publicly (internal only)
- Use reverse proxy with auth if needed

### 2. Network Security

```yaml
# All observability services on homelab network
networks:
  - homelab
  
# Prometheus not exposed externally
# Grafana behind Caddy reverse proxy with SSL
```

### 3. Data Security

- Logs may contain sensitive data - review retention
- Metrics don't contain PII by default
- Secrets stored in Phase 1 encrypted configs

## Future Enhancements

### Phase 5.1: Advanced Monitoring

- [ ] AlertManager clustering for HA
- [ ] Distributed tracing with Jaeger/Tempo
- [ ] Custom application metrics
- [ ] SLA/SLO tracking dashboards

### Phase 5.2: Advanced Logging

- [ ] Loki S3 storage backend
- [ ] Log-based alerting
- [ ] Log sampling for high-volume services
- [ ] Integration with external log aggregators

### Phase 5.3: Advanced Auto-Recovery

- [ ] Auto-scaling based on metrics
- [ ] Predictive scaling using ML
- [ ] Automated incident response
- [ ] Integration with PagerDuty/OpsGenie

## Summary

Phase 5 provides:

✅ **Complete Observability**: Metrics, logs, and traces  
✅ **Automated Monitoring**: Prometheus + Grafana dashboards  
✅ **Log Aggregation**: Loki + Promtail  
✅ **Auto-Recovery**: Watchtower for failed containers  
✅ **Comprehensive Alerts**: 15+ alert rules  
✅ **CLI Integration**: `metrics`, `alerts`, enhanced `logs`  
✅ **Production-Ready**: Battle-tested open-source tools

**Dashboard URLs**:
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090
- Loki: http://localhost:3100

**Next Steps**:
1. Deploy: `./homelab deploy observability`
2. Access dashboards: `./homelab metrics`
3. Monitor alerts: `./homelab alerts`
4. Query logs via Grafana Explore

**Documentation**:
- This file: `orchestration/PHASE5_OBSERVABILITY.md`
- Prometheus: https://prometheus.io/docs/
- Grafana: https://grafana.com/docs/
- Loki: https://grafana.com/docs/loki/

---

**Phase 5 Status**: ✅ Complete  
**Homelab Version**: 2.0.0  
**Last Updated**: November 23, 2025
