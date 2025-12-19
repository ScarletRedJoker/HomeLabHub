/**
 * Homelab Presence Service
 * 
 * Polls the Dashboard API and updates the Discord bot's presence
 * to show homelab status (CPU, services, mode).
 * 
 * Features:
 * - Config validation at startup
 * - Exponential backoff on failures
 * - Rate-limited error logging
 * - Graceful fallback when Dashboard is unreachable
 */

import { Client, ActivityType, PresenceStatusData } from 'discord.js';

interface HomelabPresenceData {
  status: 'healthy' | 'degraded' | 'offline';
  mode: string;
  stats: {
    cpu: number;
    memory: number;
    disk: number;
    uptime: string;
  };
  services: {
    online: number;
    offline: number;
    key_services: string[];
  };
  activities: Array<{
    type: string;
    text: string;
  }>;
  timestamp: string;
}

const DEFAULT_DASHBOARD_URLS = [
  'http://homelab-dashboard:5000',
  'http://localhost:5000',
  ''
];

export class HomelabPresenceService {
  private client: Client;
  private dashboardUrl: string;
  private serviceAuthToken: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastPresenceData: HomelabPresenceData | null = null;
  private activityIndex = 0;
  private rotationInterval: NodeJS.Timeout | null = null;
  private enabled = true;
  
  private consecutiveFailures = 0;
  private maxBackoffMs = 300000; // 5 minutes max
  private baseIntervalMs = 60000; // 1 minute base
  private lastErrorLogTime = 0;
  private errorLogIntervalMs = 300000; // Only log errors every 5 minutes
  private isConfigured = false;

  constructor(client: Client) {
    this.client = client;
    this.dashboardUrl = process.env.DASHBOARD_URL || '';
    this.serviceAuthToken = process.env.SERVICE_AUTH_TOKEN || 'dev-token';
    
    this.isConfigured = this.validateConfig();
  }

  private validateConfig(): boolean {
    if (!this.dashboardUrl || DEFAULT_DASHBOARD_URLS.includes(this.dashboardUrl)) {
      return false;
    }
    
    try {
      new URL(this.dashboardUrl);
    } catch {
      return false;
    }
    
    if (!this.serviceAuthToken || this.serviceAuthToken === 'dev-token') {
      console.warn('[Homelab Presence] SERVICE_AUTH_TOKEN not set - using dev fallback token');
    }
    
    return true;
  }

  async start(): Promise<void> {
    if (!this.isConfigured) {
      console.log('[Homelab Presence] Dashboard URL not configured - using fallback presence only');
      console.log('[Homelab Presence] Set DASHBOARD_URL env var to enable homelab status display');
      this.setFallbackPresence();
      return;
    }

    console.log('[Homelab Presence] Starting presence service...');
    console.log(`[Homelab Presence] Dashboard URL: ${this.dashboardUrl}`);

    await this.fetchAndUpdatePresence();
    this.schedulePoll();

    this.rotationInterval = setInterval(() => {
      this.rotateActivity();
    }, 15000);

    console.log('[Homelab Presence] ✅ Presence service started');
  }

  private schedulePoll(): void {
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
    }

    const backoffMs = Math.min(
      this.baseIntervalMs * Math.pow(1.5, this.consecutiveFailures),
      this.maxBackoffMs
    );

    const jitter = Math.random() * 5000;
    const delay = backoffMs + jitter;

    this.pollInterval = setTimeout(async () => {
      if (this.enabled) {
        await this.fetchAndUpdatePresence();
        this.schedulePoll();
      }
    }, delay);
  }

  stop(): void {
    this.enabled = false;
    
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
    console.log('[Homelab Presence] Presence service stopped');
  }

  private async fetchAndUpdatePresence(): Promise<void> {
    if (!this.isConfigured || !this.enabled) {
      return;
    }

    try {
      const response = await fetch(`${this.dashboardUrl}/api/homelab/presence`, {
        headers: {
          'X-Service-Auth': this.serviceAuthToken,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.lastPresenceData = await response.json() as HomelabPresenceData;
      this.updateBotPresence();
      
      if (this.consecutiveFailures > 0) {
        console.log('[Homelab Presence] ✅ Dashboard connection restored');
      }
      this.consecutiveFailures = 0;

    } catch (error: any) {
      this.consecutiveFailures++;
      
      const now = Date.now();
      const shouldLog = (now - this.lastErrorLogTime) >= this.errorLogIntervalMs;
      
      if (shouldLog || this.consecutiveFailures === 1) {
        const nextRetrySeconds = Math.round(
          Math.min(this.baseIntervalMs * Math.pow(1.5, this.consecutiveFailures), this.maxBackoffMs) / 1000
        );
        console.warn(
          `[Homelab Presence] Dashboard unreachable (attempt ${this.consecutiveFailures}). ` +
          `Next retry in ~${nextRetrySeconds}s. Error: ${error.message}`
        );
        this.lastErrorLogTime = now;
      }
      
      this.setFallbackPresence();
    }
  }

  private updateBotPresence(): void {
    if (!this.lastPresenceData || !this.client.user) return;

    const data = this.lastPresenceData;
    const activities = this.getActivitiesFromData(data);

    if (activities.length === 0) {
      this.setFallbackPresence();
      return;
    }

    const currentActivity = activities[this.activityIndex % activities.length];

    let status: PresenceStatusData = 'online';
    if (data.status === 'degraded') {
      status = 'idle';
    } else if (data.status === 'offline') {
      status = 'dnd';
    }

    this.client.user.setPresence({
      activities: [currentActivity],
      status
    });
  }

  private rotateActivity(): void {
    if (!this.lastPresenceData) return;

    const activities = this.getActivitiesFromData(this.lastPresenceData);
    if (activities.length === 0) return;

    this.activityIndex = (this.activityIndex + 1) % activities.length;
    this.updateBotPresence();
  }

  private getActivitiesFromData(data: HomelabPresenceData) {
    const activities: Array<{ name: string; type: ActivityType }> = [];

    if (data.mode) {
      activities.push({
        name: data.mode,
        type: ActivityType.Playing
      });
    }

    if (data.services.online > 0) {
      activities.push({
        name: `${data.services.online} services online`,
        type: ActivityType.Watching
      });
    }

    if (data.stats.cpu > 0) {
      activities.push({
        name: `CPU ${data.stats.cpu}% | RAM ${data.stats.memory}%`,
        type: ActivityType.Custom
      });
    }

    if (data.stats.uptime && data.stats.uptime !== 'unknown') {
      activities.push({
        name: `Uptime: ${data.stats.uptime}`,
        type: ActivityType.Custom
      });
    }

    activities.push({
      name: 'Support Tickets | /ticket',
      type: ActivityType.Watching
    });

    return activities;
  }

  private setFallbackPresence(): void {
    if (!this.client.user) return;

    this.client.user.setPresence({
      activities: [{ 
        name: 'Support Tickets | /ticket', 
        type: ActivityType.Watching 
      }],
      status: 'online'
    });
  }

  getStatus(): { configured: boolean; healthy: boolean; consecutiveFailures: number } {
    return {
      configured: this.isConfigured,
      healthy: this.consecutiveFailures === 0,
      consecutiveFailures: this.consecutiveFailures
    };
  }
}

let presenceService: HomelabPresenceService | null = null;

export function initHomelabPresence(client: Client): HomelabPresenceService {
  if (presenceService) {
    presenceService.stop();
  }
  presenceService = new HomelabPresenceService(client);
  return presenceService;
}

export function getHomelabPresenceService(): HomelabPresenceService | null {
  return presenceService;
}
