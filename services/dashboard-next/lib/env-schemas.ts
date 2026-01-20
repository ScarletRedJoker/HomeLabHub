import { z } from "zod";

export interface EnvVariable {
  key: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  description: string;
  example?: string;
  default?: string;
  instructions?: string;
  validation?: RegExp;
  hint?: string;
  sensitive?: boolean;
}

export interface ServiceEnvConfig {
  name: string;
  description: string;
  icon: string;
  variables: EnvVariable[];
}

export const dashboardEnvSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/[^:]+:[^@]+@[^:]+:\d+\/\w+/, "Invalid PostgreSQL URL format").optional(),
  SESSION_SECRET: z.string().min(32, "Session secret must be at least 32 characters"),
  ADMIN_USERNAME: z.string().min(1, "Admin username is required").default("admin"),
  ADMIN_PASSWORD: z.string().min(8, "Password must be at least 8 characters"),
  OPENAI_API_KEY: z.string().regex(/^sk-(proj-)?[a-zA-Z0-9_-]+$/, "Invalid OpenAI API key format").optional(),
  SSH_PRIVATE_KEY: z.string().optional(),
  LINODE_SSH_HOST: z.string().optional(),
  LINODE_SSH_USER: z.string().optional(),
  HOME_SSH_HOST: z.string().optional(),
  HOME_SSH_USER: z.string().optional(),
  WINDOWS_VM_TAILSCALE_IP: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, "Invalid IP address").optional(),
  UBUNTU_TAILSCALE_IP: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, "Invalid IP address").optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  NEBULA_AGENT_TOKEN: z.string().min(32, "Token must be at least 32 characters").optional(),
  SERVICE_AUTH_TOKEN: z.string().min(32, "Token must be at least 32 characters").optional(),
  JWT_SECRET: z.string().min(32, "JWT secret must be at least 32 characters").optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
});

export const discordBotEnvSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(50, "Discord bot token appears too short"),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/, "Invalid Discord client ID format"),
  DISCORD_CLIENT_SECRET: z.string().min(32, "Client secret must be at least 32 characters"),
  DISCORD_APP_ID: z.string().regex(/^\d{17,20}$/, "Invalid Discord app ID format"),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/[^:]+:[^@]+@[^:]+:\d+\/\w+/, "Invalid PostgreSQL URL format").optional(),
  SESSION_SECRET: z.string().min(32, "Session secret must be at least 32 characters"),
  DISCORD_CALLBACK_URL: z.string().url("Must be a valid URL").optional(),
  APP_URL: z.string().url("Must be a valid URL").optional(),
  DISCORD_PRIMARY_GUILD_ID: z.string().regex(/^\d{17,20}$/, "Invalid guild ID format").optional(),
  PLEX_URL: z.string().url("Must be a valid URL").optional(),
  PLEX_TOKEN: z.string().optional(),
  SERVICE_AUTH_TOKEN: z.string().min(32, "Token must be at least 32 characters").optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
});

export const streamBotEnvSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/[^:]+:[^@]+@[^:]+:\d+\/\w+/, "Invalid PostgreSQL URL format").optional(),
  SESSION_SECRET: z.string().min(32, "Session secret must be at least 32 characters"),
  TWITCH_CLIENT_ID: z.string().regex(/^[a-z0-9]{30}$/, "Invalid Twitch client ID format").optional(),
  TWITCH_CLIENT_SECRET: z.string().min(30, "Twitch client secret appears too short").optional(),
  TWITCH_CHANNEL: z.string().regex(/^[a-zA-Z0-9_]{4,25}$/, "Invalid Twitch channel name").optional(),
  TWITCH_REDIRECT_URI: z.string().url("Must be a valid URL").optional(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REDIRECT_URI: z.string().url("Must be a valid URL").optional(),
  SPOTIFY_CLIENT_ID: z.string().regex(/^[a-f0-9]{32}$/, "Invalid Spotify client ID format").optional(),
  SPOTIFY_CLIENT_SECRET: z.string().min(32, "Spotify client secret appears too short").optional(),
  SPOTIFY_REDIRECT_URI: z.string().url("Must be a valid URL").optional(),
  KICK_CLIENT_ID: z.string().optional(),
  KICK_CLIENT_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().regex(/^sk-(proj-)?[a-zA-Z0-9_-]+$/, "Invalid OpenAI API key format").optional(),
  OBS_ENCRYPTION_KEY: z.string().min(32, "Encryption key must be at least 32 characters").optional(),
  STREAM_BOT_WEBHOOK_SECRET: z.string().min(32, "Webhook secret must be at least 32 characters").optional(),
  DISCORD_BOT_URL: z.string().url("Must be a valid URL").optional(),
  APP_URL: z.string().url("Must be a valid URL").optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
});

export const aiServicesEnvSchema = z.object({
  OLLAMA_HOST: z.string().default("http://100.118.44.102:11434"),
  STABLE_DIFFUSION_API_URL: z.string().default("http://100.118.44.102:7860/api"),
  COMFYUI_API_URL: z.string().default("http://100.118.44.102:8188/api"),
  WINDOWS_VM_TAILSCALE_IP: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, "Invalid IP address").default("100.118.44.102"),
  NEBULA_AGENT_TOKEN: z.string().min(32, "Token must be at least 32 characters").optional(),
  CUDA_VISIBLE_DEVICES: z.string().default("0"),
  WHISPER_MODEL: z.enum(["tiny", "base", "small", "medium", "large", "large-v2", "large-v3"]).default("base"),
  WHISPER_DEVICE: z.enum(["cuda", "cpu"]).default("cuda"),
  AUTO_START_OLLAMA: z.coerce.boolean().default(true),
  AUTO_START_COMFYUI: z.coerce.boolean().default(false),
  AUTO_START_SD_WEBUI: z.coerce.boolean().default(false),
});

export const infrastructureEnvSchema = z.object({
  POSTGRES_PASSWORD: z.string().min(16, "Password should be at least 16 characters"),
  REDIS_PASSWORD: z.string().min(16, "Password should be at least 16 characters").optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().regex(/^[a-f0-9]{32}$/, "Invalid Cloudflare zone ID format").optional(),
  TAILSCALE_AUTHKEY: z.string().regex(/^tskey-/, "Tailscale key must start with tskey-").optional(),
  DOMAIN: z.string().regex(/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/, "Invalid domain format").optional(),
});

export const dashboardVariables: EnvVariable[] = [
  { key: "DATABASE_URL", type: "string", required: false, description: "PostgreSQL connection string", example: "postgresql://user:password@localhost:5432/dashboard", instructions: "Create a PostgreSQL database and user. Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE", sensitive: true },
  { key: "SESSION_SECRET", type: "string", required: true, description: "Secret key for signing session cookies (min 32 chars)", example: "your_secure_random_session_secret_here_minimum_32_chars", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "ADMIN_USERNAME", type: "string", required: true, description: "Username for admin dashboard login", example: "admin", default: "admin", instructions: "Set a username for the admin login" },
  { key: "ADMIN_PASSWORD", type: "string", required: true, description: "Password for admin dashboard login (min 8 chars)", example: "your_secure_password", instructions: "Set a strong password with mixed case, numbers, and symbols", sensitive: true },
  { key: "OPENAI_API_KEY", type: "string", required: false, description: "OpenAI API key for AI features", example: "sk-proj-your_openai_key_here", hint: "https://platform.openai.com/api-keys", instructions: "Get your API key from OpenAI platform", sensitive: true },
  { key: "SSH_PRIVATE_KEY", type: "string", required: false, description: "PEM-format private key for SSH connections", example: "-----BEGIN OPENSSH PRIVATE KEY-----...", instructions: "Paste the entire SSH private key including BEGIN/END markers", sensitive: true },
  { key: "LINODE_SSH_HOST", type: "string", required: false, description: "Hostname or IP of the Linode server", example: "linode.evindrake.net", default: "linode.evindrake.net" },
  { key: "LINODE_SSH_USER", type: "string", required: false, description: "SSH username for Linode server", example: "root", default: "root" },
  { key: "HOME_SSH_HOST", type: "string", required: false, description: "Hostname or IP of the home Ubuntu server", example: "host.evindrake.net", default: "host.evindrake.net" },
  { key: "HOME_SSH_USER", type: "string", required: false, description: "SSH username for home server", example: "evin", default: "evin" },
  { key: "WINDOWS_VM_TAILSCALE_IP", type: "string", required: false, description: "Tailscale IP of Windows VM", example: "100.118.44.102", default: "100.118.44.102" },
  { key: "UBUNTU_TAILSCALE_IP", type: "string", required: false, description: "Tailscale IP of Ubuntu server", example: "100.66.61.51", default: "100.66.61.51" },
  { key: "CLOUDFLARE_API_TOKEN", type: "string", required: false, description: "Cloudflare API token for DNS management", hint: "https://dash.cloudflare.com/profile/api-tokens", sensitive: true },
  { key: "NEBULA_AGENT_TOKEN", type: "string", required: false, description: "Token for Windows VM agent communication", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "SERVICE_AUTH_TOKEN", type: "string", required: false, description: "Token for service-to-service authentication", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "NODE_ENV", type: "string", required: false, description: "Node.js environment mode", example: "production", default: "development" },
  { key: "PORT", type: "number", required: false, description: "HTTP port for the dashboard", example: "5000", default: "5000" },
];

export const discordBotVariables: EnvVariable[] = [
  { key: "DISCORD_BOT_TOKEN", type: "string", required: true, description: "Discord bot authentication token", hint: "https://discord.com/developers/applications", instructions: "Go to Discord Developer Portal > Bot > Reset Token", sensitive: true },
  { key: "DISCORD_CLIENT_ID", type: "string", required: true, description: "Discord application client ID", hint: "https://discord.com/developers/applications", instructions: "Copy Application ID from General Information page" },
  { key: "DISCORD_CLIENT_SECRET", type: "string", required: true, description: "Discord application client secret", hint: "https://discord.com/developers/applications", instructions: "Go to OAuth2 > Reset Secret", sensitive: true },
  { key: "DISCORD_APP_ID", type: "string", required: true, description: "Discord application ID (same as CLIENT_ID)", instructions: "Same as DISCORD_CLIENT_ID, used for slash commands" },
  { key: "DATABASE_URL", type: "string", required: false, description: "PostgreSQL connection string", example: "postgresql://ticketbot:password@localhost:5432/ticketbot", sensitive: true },
  { key: "SESSION_SECRET", type: "string", required: true, description: "Secret for signing session cookies", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "DISCORD_CALLBACK_URL", type: "string", required: false, description: "OAuth2 callback URL", example: "https://bot.rig-city.com/auth/discord/callback", instructions: "Set to your bot URL + /auth/discord/callback" },
  { key: "APP_URL", type: "string", required: false, description: "Public base URL of the Discord bot", example: "https://bot.rig-city.com" },
  { key: "DISCORD_PRIMARY_GUILD_ID", type: "string", required: false, description: "Primary Discord server/guild ID", instructions: "Right-click server > Copy Server ID" },
  { key: "PLEX_URL", type: "string", required: false, description: "URL to Plex Media Server", example: "http://100.66.61.51:32400" },
  { key: "PLEX_TOKEN", type: "string", required: false, description: "Plex authentication token", hint: "Get from Plex Web > View XML > X-Plex-Token", sensitive: true },
  { key: "SERVICE_AUTH_TOKEN", type: "string", required: false, description: "Token for inter-service communication", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "NODE_ENV", type: "string", required: false, description: "Node.js environment mode", example: "production", default: "development" },
  { key: "PORT", type: "number", required: false, description: "HTTP port for the bot web server", example: "5000", default: "5000" },
];

export const streamBotVariables: EnvVariable[] = [
  { key: "DATABASE_URL", type: "string", required: false, description: "PostgreSQL connection string", example: "postgresql://streambot:password@localhost:5432/streambot", sensitive: true },
  { key: "SESSION_SECRET", type: "string", required: true, description: "Secret for signing session cookies", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "TWITCH_CLIENT_ID", type: "string", required: false, description: "Twitch application client ID", hint: "https://dev.twitch.tv/console/apps", instructions: "Register app and copy Client ID" },
  { key: "TWITCH_CLIENT_SECRET", type: "string", required: false, description: "Twitch application client secret", hint: "https://dev.twitch.tv/console/apps", instructions: "Click New Secret and copy it", sensitive: true },
  { key: "TWITCH_CHANNEL", type: "string", required: false, description: "Default Twitch channel to monitor", example: "yourchannelname", instructions: "Your Twitch username (without #)" },
  { key: "TWITCH_REDIRECT_URI", type: "string", required: false, description: "OAuth redirect URI for Twitch", example: "https://stream.rig-city.com/api/auth/twitch/callback" },
  { key: "YOUTUBE_CLIENT_ID", type: "string", required: false, description: "Google OAuth client ID for YouTube", hint: "https://console.cloud.google.com/apis/credentials", instructions: "Create OAuth 2.0 Client ID (Web application)" },
  { key: "YOUTUBE_CLIENT_SECRET", type: "string", required: false, description: "Google OAuth client secret", hint: "https://console.cloud.google.com/apis/credentials", sensitive: true },
  { key: "YOUTUBE_REDIRECT_URI", type: "string", required: false, description: "OAuth redirect URI for YouTube", example: "https://stream.rig-city.com/auth/youtube/callback" },
  { key: "SPOTIFY_CLIENT_ID", type: "string", required: false, description: "Spotify application client ID", hint: "https://developer.spotify.com/dashboard", instructions: "Create app and copy Client ID" },
  { key: "SPOTIFY_CLIENT_SECRET", type: "string", required: false, description: "Spotify application client secret", hint: "https://developer.spotify.com/dashboard", sensitive: true },
  { key: "SPOTIFY_REDIRECT_URI", type: "string", required: false, description: "OAuth redirect URI for Spotify", example: "https://stream.rig-city.com/api/auth/spotify/callback" },
  { key: "KICK_CLIENT_ID", type: "string", required: false, description: "Kick streaming platform client ID", hint: "https://kick.com/dashboard/developer" },
  { key: "KICK_CLIENT_SECRET", type: "string", required: false, description: "Kick streaming platform client secret", sensitive: true },
  { key: "OPENAI_API_KEY", type: "string", required: false, description: "OpenAI API key for AI features", hint: "https://platform.openai.com/api-keys", sensitive: true },
  { key: "OBS_ENCRYPTION_KEY", type: "string", required: false, description: "Encryption key for OBS WebSocket", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "STREAM_BOT_WEBHOOK_SECRET", type: "string", required: false, description: "Secret for Discord Bot webhooks", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "DISCORD_BOT_URL", type: "string", required: false, description: "URL to Discord Bot for notifications", example: "https://bot.rig-city.com" },
  { key: "APP_URL", type: "string", required: false, description: "Public base URL of Stream Bot", example: "https://stream.rig-city.com" },
  { key: "NODE_ENV", type: "string", required: false, description: "Node.js environment mode", example: "production", default: "development" },
  { key: "PORT", type: "number", required: false, description: "HTTP port for Stream Bot", example: "3000", default: "3000" },
];

export const aiServicesVariables: EnvVariable[] = [
  { key: "OLLAMA_HOST", type: "string", required: false, description: "URL to Ollama LLM server", example: "http://100.118.44.102:11434", default: "http://100.118.44.102:11434" },
  { key: "STABLE_DIFFUSION_API_URL", type: "string", required: false, description: "URL to Stable Diffusion WebUI API", example: "http://100.118.44.102:7860/api", default: "http://100.118.44.102:7860/api" },
  { key: "COMFYUI_API_URL", type: "string", required: false, description: "URL to ComfyUI API", example: "http://100.118.44.102:8188/api", default: "http://100.118.44.102:8188/api" },
  { key: "WINDOWS_VM_TAILSCALE_IP", type: "string", required: false, description: "Tailscale IP of Windows VM with GPU", example: "100.118.44.102", default: "100.118.44.102" },
  { key: "NEBULA_AGENT_TOKEN", type: "string", required: false, description: "Token for Nebula Agent authentication", instructions: "Generate: openssl rand -hex 32. Must match token on Windows VM", sensitive: true },
  { key: "CUDA_VISIBLE_DEVICES", type: "string", required: false, description: "GPU devices to use", example: "0", default: "0" },
  { key: "WHISPER_MODEL", type: "string", required: false, description: "Whisper model for speech-to-text", example: "base", default: "base" },
  { key: "WHISPER_DEVICE", type: "string", required: false, description: "Device for Whisper inference", example: "cuda", default: "cuda" },
  { key: "AUTO_START_OLLAMA", type: "boolean", required: false, description: "Auto-start Ollama on boot", example: "true", default: "true" },
  { key: "AUTO_START_COMFYUI", type: "boolean", required: false, description: "Auto-start ComfyUI on boot", example: "false", default: "false" },
  { key: "AUTO_START_SD_WEBUI", type: "boolean", required: false, description: "Auto-start Stable Diffusion WebUI on boot", example: "false", default: "false" },
];

export const infrastructureVariables: EnvVariable[] = [
  { key: "POSTGRES_PASSWORD", type: "string", required: true, description: "PostgreSQL root password", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "REDIS_PASSWORD", type: "string", required: false, description: "Redis cache password", instructions: "Generate: openssl rand -hex 32", sensitive: true },
  { key: "CLOUDFLARE_API_TOKEN", type: "string", required: false, description: "Cloudflare API token for DNS", hint: "https://dash.cloudflare.com/profile/api-tokens", sensitive: true },
  { key: "CLOUDFLARE_ZONE_ID", type: "string", required: false, description: "Cloudflare Zone ID", instructions: "Find in Cloudflare dashboard > domain > Overview" },
  { key: "TAILSCALE_AUTHKEY", type: "string", required: false, description: "Tailscale authentication key", hint: "https://login.tailscale.com/admin/settings/keys", sensitive: true },
  { key: "DOMAIN", type: "string", required: false, description: "Primary domain for services", example: "evindrake.net" },
];

export const serviceConfigs: ServiceEnvConfig[] = [
  { name: "Dashboard", description: "Next.js control panel with SSH, AI, and service management", icon: "Layout", variables: dashboardVariables },
  { name: "Discord Bot", description: "Ticket bot with moderation, presence, and custom commands", icon: "MessageSquare", variables: discordBotVariables },
  { name: "Stream Bot", description: "Multi-platform streaming bot (Twitch, YouTube, Kick)", icon: "Radio", variables: streamBotVariables },
  { name: "AI Services", description: "Local AI stack: Ollama, Stable Diffusion, ComfyUI", icon: "Brain", variables: aiServicesVariables },
  { name: "Infrastructure", description: "Database, cache, DNS, and networking", icon: "Server", variables: infrastructureVariables },
];

export function validateEnvValue(variable: EnvVariable, value: string): string | null {
  if (!value && variable.required) {
    return `${variable.key} is required`;
  }
  if (!value) return null;
  
  if (variable.validation) {
    if (!variable.validation.test(value)) {
      return `Invalid format for ${variable.key}`;
    }
  }
  
  return null;
}

export function generateEnvFileContent(
  values: Record<string, string>,
  environment: "development" | "production"
): string {
  const lines: string[] = [
    `# Environment: ${environment}`,
    `# Generated: ${new Date().toISOString()}`,
    "",
  ];
  
  for (const config of serviceConfigs) {
    const serviceVars = config.variables.filter(v => values[v.key]);
    if (serviceVars.length > 0) {
      lines.push(`# === ${config.name} ===`);
      for (const v of serviceVars) {
        if (values[v.key]) {
          lines.push(`${v.key}=${values[v.key]}`);
        }
      }
      lines.push("");
    }
  }
  
  return lines.join("\n");
}

export const deployCommands = {
  development: {
    local: [
      "# Local Development Setup",
      "cd deploy/local",
      "cp .env.example .env  # Edit with your values",
      "./deploy.sh setup      # Interactive setup",
      "./deploy.sh            # Deploy all services",
    ],
    replit: [
      "# Replit Development",
      "# 1. Add secrets in Replit Secrets tab",
      "# 2. Click Run button",
      "# Environment variables are auto-loaded from secrets",
    ],
  },
  production: {
    linode: [
      "# Linode Production Deployment",
      "cd deploy/linode",
      "cp .env.example .env",
      "nano .env             # Edit with production values",
      "./deploy.sh setup     # Verify configuration",
      "./deploy.sh           # Full deployment",
      "./deploy.sh verify    # Health checks",
    ],
    docker: [
      "# Docker Compose Deployment",
      "docker compose --env-file .env up -d",
      "docker compose logs -f",
    ],
  },
};
