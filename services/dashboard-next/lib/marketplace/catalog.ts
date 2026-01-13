import type { MarketplacePackage } from "./packages";

export const MARKETPLACE_CATALOG: MarketplacePackage[] = [
  {
    id: "plex",
    name: "plex",
    displayName: "Plex Media Server",
    description: "Stream your media library anywhere. Organize movies, TV, music, and photos.",
    longDescription: "Plex organizes all of your video, music, and photo collections and streams them to all of your devices. Plex Pass features include hardware transcoding, mobile sync, and live TV & DVR.",
    category: "media",
    image: "lscr.io/linuxserver/plex:latest",
    version: "latest",
    envVars: [
      { name: "PUID", description: "User ID for permissions", default: "1000" },
      { name: "PGID", description: "Group ID for permissions", default: "1000" },
      { name: "TZ", description: "Timezone", default: "America/New_York" },
      { name: "PLEX_CLAIM", description: "Plex claim token from plex.tv/claim", secret: true },
    ],
    ports: [
      { container: 32400, host: 32400, description: "Web UI and API" },
    ],
    volumes: [
      { container: "/config", description: "Configuration data" },
      { container: "/movies", description: "Movies library" },
      { container: "/tv", description: "TV shows library" },
      { container: "/music", description: "Music library" },
    ],
    tags: ["media", "streaming", "transcoding"],
    featured: true,
  },
  {
    id: "jellyfin",
    name: "jellyfin",
    displayName: "Jellyfin",
    description: "The free software media system. No licenses, no tracking, no hidden fees.",
    longDescription: "Jellyfin is a free and open-source media server and suite of multimedia applications. It enables you to collect, manage, and stream your media with no strings attached.",
    category: "media",
    image: "jellyfin/jellyfin:latest",
    version: "latest",
    envVars: [
      { name: "JELLYFIN_PublishedServerUrl", description: "Public URL for the server" },
    ],
    ports: [
      { container: 8096, host: 8096, description: "Web UI" },
      { container: 8920, host: 8920, description: "HTTPS Web UI" },
    ],
    volumes: [
      { container: "/config", description: "Configuration data" },
      { container: "/cache", description: "Transcoding cache" },
      { container: "/media", description: "Media library" },
    ],
    tags: ["media", "streaming", "open-source"],
    featured: true,
  },
  {
    id: "nextcloud",
    name: "nextcloud",
    displayName: "Nextcloud",
    description: "Self-hosted productivity platform. Files, calendar, contacts, and more.",
    longDescription: "Nextcloud offers industry-leading on-premises file sync and online collaboration. Host your own cloud with full control over your data and integrations.",
    category: "storage",
    image: "nextcloud:latest",
    version: "latest",
    envVars: [
      { name: "NEXTCLOUD_ADMIN_USER", description: "Admin username", default: "admin" },
      { name: "NEXTCLOUD_ADMIN_PASSWORD", description: "Admin password", required: true, secret: true },
      { name: "NEXTCLOUD_TRUSTED_DOMAINS", description: "Trusted domains (space separated)" },
      { name: "MYSQL_HOST", description: "Database host" },
      { name: "MYSQL_DATABASE", description: "Database name", default: "nextcloud" },
      { name: "MYSQL_USER", description: "Database user", default: "nextcloud" },
      { name: "MYSQL_PASSWORD", description: "Database password", secret: true },
    ],
    ports: [
      { container: 80, host: 8080, description: "Web UI" },
    ],
    volumes: [
      { container: "/var/www/html", description: "Application data" },
      { container: "/var/www/html/data", description: "User data" },
    ],
    tags: ["storage", "cloud", "files", "calendar"],
    featured: true,
  },
  {
    id: "gitea",
    name: "gitea",
    displayName: "Gitea",
    description: "Lightweight self-hosted Git service. Fast, easy to install and maintain.",
    longDescription: "Gitea is a painless, self-hosted, all-in-one software development service. It includes Git hosting, code review, team collaboration, package registry, and CI/CD.",
    category: "development",
    image: "gitea/gitea:latest",
    version: "latest",
    envVars: [
      { name: "USER_UID", description: "User ID", default: "1000" },
      { name: "USER_GID", description: "Group ID", default: "1000" },
      { name: "GITEA__database__DB_TYPE", description: "Database type", default: "sqlite3" },
    ],
    ports: [
      { container: 3000, host: 3000, description: "Web UI" },
      { container: 22, host: 2222, description: "SSH" },
    ],
    volumes: [
      { container: "/data", description: "Application data" },
    ],
    tags: ["git", "development", "ci-cd"],
    featured: true,
  },
  {
    id: "portainer",
    name: "portainer",
    displayName: "Portainer",
    description: "Container management UI. Deploy, troubleshoot, and manage Docker and Kubernetes.",
    longDescription: "Portainer is a lightweight management UI which allows you to easily manage your Docker hosts and Swarm clusters. Provides a simple and intuitive interface.",
    category: "tools",
    image: "portainer/portainer-ce:latest",
    version: "latest",
    envVars: [],
    ports: [
      { container: 9000, host: 9000, description: "Web UI" },
      { container: 9443, host: 9443, description: "HTTPS Web UI" },
    ],
    volumes: [
      { container: "/data", description: "Portainer data" },
      { container: "/var/run/docker.sock", host: "/var/run/docker.sock", description: "Docker socket", required: true },
    ],
    tags: ["docker", "management", "containers"],
    featured: true,
  },
  {
    id: "uptime-kuma",
    name: "uptime-kuma",
    displayName: "Uptime Kuma",
    description: "Self-hosted monitoring tool. Monitor HTTP, TCP, DNS, Docker, and more.",
    longDescription: "Uptime Kuma is a fancy self-hosted monitoring tool. It monitors uptime for HTTP(s), TCP, DNS, Docker containers, and many more with beautiful status pages.",
    category: "monitoring",
    image: "louislam/uptime-kuma:latest",
    version: "latest",
    envVars: [],
    ports: [
      { container: 3001, host: 3001, description: "Web UI" },
    ],
    volumes: [
      { container: "/app/data", description: "Application data" },
    ],
    tags: ["monitoring", "uptime", "alerting"],
    featured: true,
  },
  {
    id: "grafana",
    name: "grafana",
    displayName: "Grafana",
    description: "The open observability platform. Beautiful dashboards for any data source.",
    longDescription: "Grafana is the open source analytics and monitoring solution for every database. Query, visualize, alert on, and understand your metrics no matter where they are stored.",
    category: "monitoring",
    image: "grafana/grafana:latest",
    version: "latest",
    envVars: [
      { name: "GF_SECURITY_ADMIN_USER", description: "Admin username", default: "admin" },
      { name: "GF_SECURITY_ADMIN_PASSWORD", description: "Admin password", required: true, secret: true },
      { name: "GF_INSTALL_PLUGINS", description: "Plugins to install (comma separated)" },
    ],
    ports: [
      { container: 3000, host: 3000, description: "Web UI" },
    ],
    volumes: [
      { container: "/var/lib/grafana", description: "Data storage" },
    ],
    tags: ["monitoring", "dashboards", "visualization"],
    featured: true,
  },
  {
    id: "prometheus",
    name: "prometheus",
    displayName: "Prometheus",
    description: "Systems and service monitoring system. Time-series database and alerting.",
    longDescription: "Prometheus is an open-source systems monitoring and alerting toolkit. It collects and stores metrics as time series data with powerful query language PromQL.",
    category: "monitoring",
    image: "prom/prometheus:latest",
    version: "latest",
    envVars: [],
    ports: [
      { container: 9090, host: 9090, description: "Web UI and API" },
    ],
    volumes: [
      { container: "/prometheus", description: "Data storage" },
      { container: "/etc/prometheus/prometheus.yml", description: "Configuration file" },
    ],
    tags: ["monitoring", "metrics", "alerting"],
  },
  {
    id: "pihole",
    name: "pihole",
    displayName: "Pi-hole",
    description: "Network-wide ad blocking. DNS sinkhole that protects your devices.",
    longDescription: "Pi-hole is a Linux network-level advertisement and Internet tracker blocking application. It blocks ads for all devices on your network without requiring any client-side software.",
    category: "networking",
    image: "pihole/pihole:latest",
    version: "latest",
    envVars: [
      { name: "TZ", description: "Timezone", default: "America/New_York" },
      { name: "WEBPASSWORD", description: "Admin password", required: true, secret: true },
      { name: "PIHOLE_DNS_", description: "Upstream DNS (comma separated)", default: "8.8.8.8;8.8.4.4" },
    ],
    ports: [
      { container: 80, host: 80, description: "Web UI" },
      { container: 53, host: 53, protocol: "tcp", description: "DNS TCP" },
      { container: 53, host: 53, protocol: "udp", description: "DNS UDP" },
    ],
    volumes: [
      { container: "/etc/pihole", description: "Configuration" },
      { container: "/etc/dnsmasq.d", description: "DNS configuration" },
    ],
    tags: ["dns", "ad-blocking", "privacy"],
    featured: true,
  },
  {
    id: "traefik",
    name: "traefik",
    displayName: "Traefik",
    description: "Cloud-native reverse proxy. Automatic HTTPS, load balancing, and routing.",
    longDescription: "Traefik is a modern HTTP reverse proxy and load balancer that makes deploying microservices easy. Automatically discovers the right configuration for your services.",
    category: "networking",
    image: "traefik:latest",
    version: "latest",
    envVars: [
      { name: "CF_API_EMAIL", description: "Cloudflare email (for Let's Encrypt)" },
      { name: "CF_API_KEY", description: "Cloudflare API key", secret: true },
    ],
    ports: [
      { container: 80, host: 80, description: "HTTP" },
      { container: 443, host: 443, description: "HTTPS" },
      { container: 8080, host: 8080, description: "Dashboard" },
    ],
    volumes: [
      { container: "/etc/traefik", description: "Configuration" },
      { container: "/var/run/docker.sock", host: "/var/run/docker.sock", description: "Docker socket", required: true },
    ],
    tags: ["proxy", "load-balancer", "ssl"],
    featured: true,
  },
  {
    id: "postgres",
    name: "postgres",
    displayName: "PostgreSQL",
    description: "The world's most advanced open source relational database.",
    longDescription: "PostgreSQL is a powerful, open source object-relational database system with over 35 years of active development that has earned it a strong reputation for reliability and performance.",
    category: "database",
    image: "postgres:16-alpine",
    version: "16",
    envVars: [
      { name: "POSTGRES_USER", description: "Database user", default: "postgres" },
      { name: "POSTGRES_PASSWORD", description: "Database password", required: true, secret: true },
      { name: "POSTGRES_DB", description: "Default database", default: "postgres" },
    ],
    ports: [
      { container: 5432, host: 5432, description: "PostgreSQL port" },
    ],
    volumes: [
      { container: "/var/lib/postgresql/data", description: "Database data" },
    ],
    tags: ["database", "sql", "relational"],
  },
  {
    id: "redis",
    name: "redis",
    displayName: "Redis",
    description: "In-memory data store. Caching, messaging, and real-time data.",
    longDescription: "Redis is an open source, in-memory data structure store, used as a database, cache, and message broker. It supports various data structures and provides high performance.",
    category: "database",
    image: "redis:alpine",
    version: "latest",
    envVars: [],
    ports: [
      { container: 6379, host: 6379, description: "Redis port" },
    ],
    volumes: [
      { container: "/data", description: "Data persistence" },
    ],
    tags: ["cache", "database", "messaging"],
  },
  {
    id: "mariadb",
    name: "mariadb",
    displayName: "MariaDB",
    description: "Community-developed MySQL fork. Fast, scalable, and robust.",
    longDescription: "MariaDB is a community-developed, commercially supported fork of MySQL. It's designed to be highly compatible while offering improved performance and new features.",
    category: "database",
    image: "mariadb:latest",
    version: "latest",
    envVars: [
      { name: "MYSQL_ROOT_PASSWORD", description: "Root password", required: true, secret: true },
      { name: "MYSQL_DATABASE", description: "Default database" },
      { name: "MYSQL_USER", description: "Database user" },
      { name: "MYSQL_PASSWORD", description: "User password", secret: true },
    ],
    ports: [
      { container: 3306, host: 3306, description: "MySQL port" },
    ],
    volumes: [
      { container: "/var/lib/mysql", description: "Database data" },
    ],
    tags: ["database", "mysql", "sql"],
  },
  {
    id: "ollama",
    name: "ollama",
    displayName: "Ollama",
    description: "Run large language models locally. Llama, Mistral, CodeLlama, and more.",
    longDescription: "Ollama makes it easy to run large language models locally. Get up and running with Llama 3.2, Mistral, Gemma, and other models with a single command.",
    category: "ai",
    image: "ollama/ollama:latest",
    version: "latest",
    envVars: [
      { name: "OLLAMA_HOST", description: "Listen address", default: "0.0.0.0" },
    ],
    ports: [
      { container: 11434, host: 11434, description: "API port" },
    ],
    volumes: [
      { container: "/root/.ollama", description: "Models and data" },
    ],
    tags: ["ai", "llm", "local"],
    featured: true,
  },
  {
    id: "open-webui",
    name: "open-webui",
    displayName: "Open WebUI",
    description: "User-friendly WebUI for LLMs. ChatGPT-style interface for Ollama.",
    longDescription: "Open WebUI is an extensible, feature-rich, and user-friendly self-hosted WebUI designed to operate entirely offline. Supports various LLM runners including Ollama.",
    category: "ai",
    image: "ghcr.io/open-webui/open-webui:main",
    version: "latest",
    envVars: [
      { name: "OLLAMA_BASE_URL", description: "Ollama API URL", default: "http://ollama:11434" },
    ],
    ports: [
      { container: 8080, host: 8080, description: "Web UI" },
    ],
    volumes: [
      { container: "/app/backend/data", description: "Application data" },
    ],
    tags: ["ai", "llm", "chat"],
  },
  {
    id: "code-server",
    name: "code-server",
    displayName: "VS Code (code-server)",
    description: "Run VS Code in the browser. Full IDE experience with extensions.",
    longDescription: "VS Code running in the browser, powered by code-server. Access your development environment from anywhere with a full IDE experience.",
    category: "development",
    image: "lscr.io/linuxserver/code-server:latest",
    version: "latest",
    envVars: [
      { name: "PUID", description: "User ID", default: "1000" },
      { name: "PGID", description: "Group ID", default: "1000" },
      { name: "PASSWORD", description: "Access password", required: true, secret: true },
      { name: "SUDO_PASSWORD", description: "Sudo password", secret: true },
    ],
    ports: [
      { container: 8443, host: 8443, description: "Web UI" },
    ],
    volumes: [
      { container: "/config", description: "Configuration and workspace" },
    ],
    tags: ["ide", "development", "vscode"],
  },
  {
    id: "n8n",
    name: "n8n",
    displayName: "n8n",
    description: "Fair-code workflow automation. 400+ integrations, visual editor.",
    longDescription: "n8n is a free and source-available workflow automation tool. Connect anything to everything with 400+ integrations and a powerful visual editor.",
    category: "tools",
    image: "n8nio/n8n:latest",
    version: "latest",
    envVars: [
      { name: "N8N_BASIC_AUTH_ACTIVE", description: "Enable basic auth", default: "true" },
      { name: "N8N_BASIC_AUTH_USER", description: "Username", default: "admin" },
      { name: "N8N_BASIC_AUTH_PASSWORD", description: "Password", required: true, secret: true },
    ],
    ports: [
      { container: 5678, host: 5678, description: "Web UI" },
    ],
    volumes: [
      { container: "/home/node/.n8n", description: "Data and workflows" },
    ],
    tags: ["automation", "workflow", "integration"],
  },
  {
    id: "homer",
    name: "homer",
    displayName: "Homer",
    description: "A simple static homepage for your server. Dashboard for services.",
    longDescription: "Homer is a dead simple static HOMepage for your servER to keep your services organized. Configure via a simple YAML file.",
    category: "tools",
    image: "b4bz/homer:latest",
    version: "latest",
    envVars: [],
    ports: [
      { container: 8080, host: 8080, description: "Web UI" },
    ],
    volumes: [
      { container: "/www/assets", description: "Configuration and assets" },
    ],
    tags: ["dashboard", "homepage", "organization"],
  },
  {
    id: "heimdall",
    name: "heimdall",
    displayName: "Heimdall",
    description: "Application dashboard and launcher. Beautiful way to organize links.",
    longDescription: "Heimdall is an elegant solution to organize all your web applications. Designed to be a dashboard for all your links to web sites and applications.",
    category: "tools",
    image: "lscr.io/linuxserver/heimdall:latest",
    version: "latest",
    envVars: [
      { name: "PUID", description: "User ID", default: "1000" },
      { name: "PGID", description: "Group ID", default: "1000" },
      { name: "TZ", description: "Timezone", default: "America/New_York" },
    ],
    ports: [
      { container: 80, host: 8080, description: "Web UI" },
    ],
    volumes: [
      { container: "/config", description: "Configuration" },
    ],
    tags: ["dashboard", "launcher", "organization"],
  },
  {
    id: "nginx-proxy-manager",
    name: "nginx-proxy-manager",
    displayName: "Nginx Proxy Manager",
    description: "Easy-to-use reverse proxy. SSL certificates, custom hosts, and more.",
    longDescription: "Nginx Proxy Manager makes it easy to manage reverse proxies with a simple, powerful interface. Get SSL certificates from Let's Encrypt automatically.",
    category: "networking",
    image: "jc21/nginx-proxy-manager:latest",
    version: "latest",
    envVars: [],
    ports: [
      { container: 80, host: 80, description: "HTTP" },
      { container: 443, host: 443, description: "HTTPS" },
      { container: 81, host: 81, description: "Admin UI" },
    ],
    volumes: [
      { container: "/data", description: "Data and certificates" },
      { container: "/etc/letsencrypt", description: "Let's Encrypt data" },
    ],
    tags: ["proxy", "nginx", "ssl"],
  },
  {
    id: "vaultwarden",
    name: "vaultwarden",
    displayName: "Vaultwarden",
    description: "Unofficial Bitwarden server. Lightweight password manager.",
    longDescription: "Vaultwarden is an unofficial Bitwarden compatible server written in Rust. Perfect for self-hosted deployments with lower resource requirements.",
    category: "security",
    image: "vaultwarden/server:latest",
    version: "latest",
    envVars: [
      { name: "ADMIN_TOKEN", description: "Admin panel token", secret: true },
      { name: "SIGNUPS_ALLOWED", description: "Allow new signups", default: "true" },
    ],
    ports: [
      { container: 80, host: 8080, description: "Web UI" },
    ],
    volumes: [
      { container: "/data", description: "Vault data" },
    ],
    tags: ["passwords", "security", "bitwarden"],
    featured: true,
  },
  {
    id: "authelia",
    name: "authelia",
    displayName: "Authelia",
    description: "Multi-factor authentication portal. SSO for your services.",
    longDescription: "Authelia is an open-source authentication and authorization server providing SSO, 2FA, and access control. Integrates with common reverse proxies.",
    category: "security",
    image: "authelia/authelia:latest",
    version: "latest",
    envVars: [],
    ports: [
      { container: 9091, host: 9091, description: "Auth portal" },
    ],
    volumes: [
      { container: "/config", description: "Configuration" },
    ],
    tags: ["auth", "sso", "2fa"],
  },
  {
    id: "watchtower",
    name: "watchtower",
    displayName: "Watchtower",
    description: "Automatic Docker container updates. Keep your containers up to date.",
    longDescription: "Watchtower monitors your running Docker containers and watches for changes to the images they were originally started from. When a new image is available, it automatically pulls and restarts.",
    category: "tools",
    image: "containrrr/watchtower:latest",
    version: "latest",
    envVars: [
      { name: "WATCHTOWER_CLEANUP", description: "Remove old images", default: "true" },
      { name: "WATCHTOWER_SCHEDULE", description: "Update schedule (cron)", default: "0 0 4 * * *" },
    ],
    ports: [],
    volumes: [
      { container: "/var/run/docker.sock", host: "/var/run/docker.sock", description: "Docker socket", required: true },
    ],
    tags: ["docker", "updates", "automation"],
  },
];

export function getPackageById(id: string): MarketplacePackage | undefined {
  return MARKETPLACE_CATALOG.find(pkg => pkg.id === id);
}

export function getPackagesByCategory(category: string): MarketplacePackage[] {
  if (category === "all") return MARKETPLACE_CATALOG;
  return MARKETPLACE_CATALOG.filter(pkg => pkg.category === category);
}

export function searchPackages(query: string): MarketplacePackage[] {
  const searchLower = query.toLowerCase();
  return MARKETPLACE_CATALOG.filter(pkg =>
    pkg.name.toLowerCase().includes(searchLower) ||
    pkg.displayName.toLowerCase().includes(searchLower) ||
    pkg.description.toLowerCase().includes(searchLower) ||
    pkg.tags?.some(tag => tag.toLowerCase().includes(searchLower))
  );
}

export function getFeaturedPackages(): MarketplacePackage[] {
  return MARKETPLACE_CATALOG.filter(pkg => pkg.featured);
}
