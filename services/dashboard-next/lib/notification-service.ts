/**
 * Notification Service
 * Handles multi-channel notifications with deduplication and actionable alerts
 */

import { eventBus, type EventPayload, type EventSeverity } from "./event-bus";
import type { HealthIssue, IssueSeverity } from "./health-monitor";

export type NotificationLevel = "info" | "warning" | "critical";
export type NotificationChannel = "in-app" | "discord" | "email";

export interface NotificationAction {
  id: string;
  label: string;
  type: "link" | "api-call" | "auto-fix";
  href?: string;
  apiEndpoint?: string;
  apiMethod?: "GET" | "POST" | "PUT" | "DELETE";
  apiBody?: Record<string, unknown>;
  confirmRequired?: boolean;
  confirmMessage?: string;
}

export interface HealthNotification {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  issueId?: string;
  target?: string;
  service?: string;
  timestamp: Date;
  expiresAt?: Date;
  read: boolean;
  dismissed: boolean;
  channels: NotificationChannel[];
  actions: NotificationAction[];
  fixInstructions?: string[];
  metadata?: Record<string, unknown>;
}

interface DeduplicationEntry {
  key: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  notificationId: string;
}

const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const NOTIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;
const MAX_NOTIFICATIONS = 100;

class NotificationService {
  private notifications: Map<string, HealthNotification> = new Map();
  private deduplicationCache: Map<string, DeduplicationEntry> = new Map();
  private discordWebhookUrl: string | null = null;

  constructor() {
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || null;
  }

  private generateId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDeduplicationKey(issue: HealthIssue): string {
    return `${issue.type}:${issue.target}:${issue.service}`;
  }

  private shouldDeduplicate(key: string): boolean {
    const entry = this.deduplicationCache.get(key);
    if (!entry) return false;
    
    const elapsed = Date.now() - entry.lastSeen.getTime();
    return elapsed < DEDUP_WINDOW_MS;
  }

  private updateDeduplication(key: string, notificationId: string): void {
    const existing = this.deduplicationCache.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = new Date();
    } else {
      this.deduplicationCache.set(key, {
        key,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        notificationId,
      });
    }
  }

  private cleanupOldEntries(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.deduplicationCache) {
      if (now - entry.lastSeen.getTime() > DEDUP_WINDOW_MS) {
        this.deduplicationCache.delete(key);
      }
    }

    const sortedNotifications = Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (sortedNotifications.length > MAX_NOTIFICATIONS) {
      const toRemove = sortedNotifications.slice(MAX_NOTIFICATIONS);
      for (const notif of toRemove) {
        this.notifications.delete(notif.id);
      }
    }

    for (const [id, notif] of this.notifications) {
      if (notif.expiresAt && now > notif.expiresAt.getTime()) {
        this.notifications.delete(id);
      }
    }
  }

  private mapSeverityToLevel(severity: IssueSeverity): NotificationLevel {
    const mapping: Record<IssueSeverity, NotificationLevel> = {
      critical: "critical",
      warning: "warning",
      info: "info",
    };
    return mapping[severity];
  }

  private mapLevelToEventSeverity(level: NotificationLevel): EventSeverity {
    const mapping: Record<NotificationLevel, EventSeverity> = {
      critical: "error",
      warning: "warning",
      info: "info",
    };
    return mapping[level];
  }

  private buildActionsForIssue(issue: HealthIssue): NotificationAction[] {
    const actions: NotificationAction[] = [];

    actions.push({
      id: "view-details",
      label: "View Details",
      type: "link",
      href: `/status?issue=${issue.id}`,
    });

    if (issue.autoFixable && issue.autoFixAction) {
      actions.push({
        id: "auto-fix",
        label: "Auto-Fix",
        type: "auto-fix",
        apiEndpoint: "/api/health/check",
        apiMethod: "POST",
        apiBody: { action: "auto-fix", issueId: issue.id, fixAction: issue.autoFixAction },
        confirmRequired: true,
        confirmMessage: `This will attempt to automatically fix: ${issue.title}. Continue?`,
      });
    }

    actions.push({
      id: "acknowledge",
      label: "Acknowledge",
      type: "api-call",
      apiEndpoint: "/api/health/check",
      apiMethod: "POST",
      apiBody: { action: "acknowledge", issueId: issue.id },
    });

    actions.push({
      id: "dismiss",
      label: "Dismiss",
      type: "api-call",
      apiEndpoint: "/api/health/check",
      apiMethod: "POST",
      apiBody: { action: "dismiss", issueId: issue.id },
    });

    return actions;
  }

  async notifyHealthIssue(
    issue: HealthIssue,
    channels: NotificationChannel[] = ["in-app"]
  ): Promise<HealthNotification | null> {
    this.cleanupOldEntries();

    const dedupKey = this.getDeduplicationKey(issue);
    if (this.shouldDeduplicate(dedupKey)) {
      const entry = this.deduplicationCache.get(dedupKey)!;
      entry.count++;
      entry.lastSeen = new Date();
      
      const existingNotif = this.notifications.get(entry.notificationId);
      if (existingNotif) {
        existingNotif.metadata = {
          ...existingNotif.metadata,
          occurrenceCount: entry.count,
          lastOccurrence: new Date(),
        };
      }
      return null;
    }

    const notification: HealthNotification = {
      id: this.generateId(),
      level: this.mapSeverityToLevel(issue.severity),
      title: issue.title,
      message: issue.description,
      issueId: issue.id,
      target: issue.target,
      service: issue.service,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + NOTIFICATION_EXPIRY_MS),
      read: false,
      dismissed: false,
      channels,
      actions: this.buildActionsForIssue(issue),
      fixInstructions: issue.fixInstructions,
      metadata: issue.metadata,
    };

    this.notifications.set(notification.id, notification);
    this.updateDeduplication(dedupKey, notification.id);

    await this.publishToEventBus(notification);

    if (channels.includes("discord") && this.discordWebhookUrl) {
      await this.sendDiscordNotification(notification);
    }

    return notification;
  }

  private async publishToEventBus(notification: HealthNotification): Promise<void> {
    try {
      const payload: EventPayload = {
        category: "system",
        severity: this.mapLevelToEventSeverity(notification.level),
        title: notification.title,
        message: notification.message,
        metadata: {
          notificationId: notification.id,
          issueId: notification.issueId,
          target: notification.target,
          service: notification.service,
          actions: notification.actions,
          fixInstructions: notification.fixInstructions,
        },
        channels: notification.channels.includes("discord") ? ["dashboard", "discord"] : ["dashboard"],
      };

      await eventBus.publish(payload);
    } catch (error) {
      console.warn(
        "[NotificationService] Failed to publish to event bus (Redis/event system may be unavailable):",
        error instanceof Error ? error.message : String(error)
      );
      console.info("[NotificationService] Notification stored in-app cache, event bus unavailable - continuing with degraded functionality");
    }
  }

  private async sendDiscordNotification(notification: HealthNotification): Promise<void> {
    if (!this.discordWebhookUrl) {
      console.debug("[NotificationService] Discord webhook not configured, skipping Discord notification");
      return;
    }

    const colorMap: Record<NotificationLevel, number> = {
      critical: 0xe74c3c,
      warning: 0xf39c12,
      info: 0x3498db,
    };

    const fields = [];

    if (notification.target) {
      fields.push({ name: "Target", value: notification.target, inline: true });
    }
    if (notification.service) {
      fields.push({ name: "Service", value: notification.service, inline: true });
    }

    if (notification.fixInstructions && notification.fixInstructions.length > 0) {
      const instructions = notification.fixInstructions
        .slice(0, 3)
        .map((inst, i) => `${i + 1}. ${inst}`)
        .join("\n");
      fields.push({ name: "Quick Fix Steps", value: instructions, inline: false });
    }

    const embed = {
      title: `${notification.level === "critical" ? "🚨" : notification.level === "warning" ? "⚠️" : "ℹ️"} ${notification.title}`,
      description: notification.message,
      color: colorMap[notification.level],
      fields,
      timestamp: notification.timestamp.toISOString(),
      footer: { text: "Nebula Health Monitor" },
    };

    try {
      const response = await fetch(this.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });

      if (!response.ok) {
        console.warn(`[NotificationService] Discord webhook returned ${response.status}, notification may not have been delivered`);
      }
    } catch (error) {
      console.warn(
        "[NotificationService] Failed to send Discord notification (Discord service may be unavailable):",
        error instanceof Error ? error.message : String(error)
      );
      console.info("[NotificationService] Continuing with degraded Discord delivery");
    }
  }

  async notifyMultipleIssues(
    issues: HealthIssue[],
    channels: NotificationChannel[] = ["in-app"]
  ): Promise<HealthNotification[]> {
    const notifications: HealthNotification[] = [];
    
    for (const issue of issues) {
      const notification = await this.notifyHealthIssue(issue, channels);
      if (notification) {
        notifications.push(notification);
      }
    }

    return notifications;
  }

  getNotifications(options: {
    unreadOnly?: boolean;
    level?: NotificationLevel;
    limit?: number;
  } = {}): HealthNotification[] {
    let notifications = Array.from(this.notifications.values())
      .filter(n => !n.dismissed);

    if (options.unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }

    if (options.level) {
      notifications = notifications.filter(n => n.level === options.level);
    }

    notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options.limit) {
      notifications = notifications.slice(0, options.limit);
    }

    return notifications;
  }

  getNotification(id: string): HealthNotification | undefined {
    return this.notifications.get(id);
  }

  markAsRead(id: string): boolean {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.read = true;
      return true;
    }
    return false;
  }

  markAllAsRead(): void {
    for (const notification of this.notifications.values()) {
      notification.read = true;
    }
  }

  dismiss(id: string): boolean {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.dismissed = true;
      return true;
    }
    return false;
  }

  getUnreadCount(): number {
    return Array.from(this.notifications.values())
      .filter(n => !n.read && !n.dismissed)
      .length;
  }

  getCriticalCount(): number {
    return Array.from(this.notifications.values())
      .filter(n => n.level === "critical" && !n.dismissed)
      .length;
  }

  getStats(): {
    total: number;
    unread: number;
    critical: number;
    warning: number;
    info: number;
    dismissed: number;
  } {
    const notifications = Array.from(this.notifications.values());
    return {
      total: notifications.filter(n => !n.dismissed).length,
      unread: notifications.filter(n => !n.read && !n.dismissed).length,
      critical: notifications.filter(n => n.level === "critical" && !n.dismissed).length,
      warning: notifications.filter(n => n.level === "warning" && !n.dismissed).length,
      info: notifications.filter(n => n.level === "info" && !n.dismissed).length,
      dismissed: notifications.filter(n => n.dismissed).length,
    };
  }

  setDiscordWebhook(url: string | null): void {
    this.discordWebhookUrl = url;
  }
}

export const notificationService = new NotificationService();
