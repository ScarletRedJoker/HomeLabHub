/**
 * Service Discovery - Resolves service endpoints across distributed infrastructure
 * Reads from service-map.yml and environment variables
 */

export type ServiceLocation = "linode" | "local" | "cloud";
export type Environment = "development" | "production";

export interface ServiceEndpoint {
  name: string;
  url: string;
  location: ServiceLocation;
  healthy?: boolean;
}

const ENV = (process.env.NODE_ENV === "production" ? "production" : "development") as Environment;

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
const LOCAL_SERVER_IP = process.env.LOCAL_TAILSCALE_IP || "100.66.61.51";

function getOllamaUrl(): string {
  if (process.env.OLLAMA_URL) return process.env.OLLAMA_URL;
  return `http://${WINDOWS_VM_IP}:11434`;
}

function getStableDiffusionUrl(): string {
  if (process.env.STABLE_DIFFUSION_URL) return process.env.STABLE_DIFFUSION_URL;
  return `http://${WINDOWS_VM_IP}:7860`;
}

function getLocalServiceUrl(port: number): string {
  return `http://${LOCAL_SERVER_IP}:${port}`;
}

const SERVICE_ENDPOINTS: Record<string, Record<Environment, string>> = {
  "ollama": {
    production: getOllamaUrl(),
    development: getOllamaUrl(),
  },
  "stable-diffusion": {
    production: getStableDiffusionUrl(),
    development: getStableDiffusionUrl(),
  },
  "openai": {
    production: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
    development: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  },
  "plex": {
    production: process.env.PLEX_URL || getLocalServiceUrl(32400),
    development: process.env.PLEX_URL || getLocalServiceUrl(32400),
  },
  "minio": {
    production: process.env.MINIO_URL || getLocalServiceUrl(9000),
    development: process.env.MINIO_URL || getLocalServiceUrl(9000),
  },
  "home-assistant": {
    production: process.env.HOME_ASSISTANT_URL || getLocalServiceUrl(8123),
    development: process.env.HOME_ASSISTANT_URL || getLocalServiceUrl(8123),
  },
  "discord-bot": {
    production: process.env.DISCORD_BOT_URL || "http://discord-bot:4000",
    development: process.env.DISCORD_BOT_URL || "http://localhost:4000",
  },
  "stream-bot": {
    production: process.env.STREAM_BOT_URL || "http://stream-bot:5000",
    development: process.env.STREAM_BOT_URL || "http://localhost:3000",
  },
};

const SERVICE_LOCATIONS: Record<string, ServiceLocation> = {
  "ollama": "local",
  "stable-diffusion": "local",
  "openai": "cloud",
  "plex": "local",
  "minio": "local",
  "home-assistant": "local",
  "discord-bot": "linode",
  "stream-bot": "linode",
  "dashboard": "linode",
};

export function getServiceUrl(serviceName: string): string {
  const service = SERVICE_ENDPOINTS[serviceName];
  if (!service) {
    throw new Error(`Unknown service: ${serviceName}`);
  }
  return service[ENV];
}

export function getServiceLocation(serviceName: string): ServiceLocation {
  return SERVICE_LOCATIONS[serviceName] || "linode";
}

export async function checkServiceHealth(serviceName: string): Promise<ServiceEndpoint> {
  const url = getServiceUrl(serviceName);
  const location = getServiceLocation(serviceName);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let healthUrl = url;
    if (serviceName === "ollama") {
      healthUrl = `${url}/api/tags`;
    } else if (serviceName === "stable-diffusion") {
      healthUrl = `${url}/sdapi/v1/sd-models`;
    } else if (serviceName === "openai") {
      return { name: serviceName, url, location, healthy: true };
    } else if (serviceName === "plex") {
      healthUrl = `${url}/identity`;
    }

    const response = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);

    return {
      name: serviceName,
      url,
      location,
      healthy: response.ok,
    };
  } catch {
    return {
      name: serviceName,
      url,
      location,
      healthy: false,
    };
  }
}

export async function getAllServiceStatus(): Promise<ServiceEndpoint[]> {
  const services = Object.keys(SERVICE_ENDPOINTS);
  const results = await Promise.all(services.map(checkServiceHealth));
  return results;
}

export function isLocalAIAvailable(): boolean {
  return !!process.env.OLLAMA_URL || !!process.env.STABLE_DIFFUSION_URL;
}

export function getAIProvider(): "openai" | "ollama" | "hybrid" {
  const hasOpenAI = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !!process.env.OPENAI_API_KEY;
  const hasOllama = !!process.env.OLLAMA_URL;

  if (hasOpenAI && hasOllama) return "hybrid";
  if (hasOllama) return "ollama";
  return "openai";
}
