import { EventEmitter } from 'events';

// Interface for error log entry
export interface ErrorLogEntry {
  timestamp: Date;
  message: string;
  stack?: string;
  context?: string;
  severity: 'error' | 'warning' | 'critical';
}

// Interface for connection state change
export interface ConnectionStateChange {
  timestamp: Date;
  previousState: string;
  newState: string;
  reason?: string;
}

// Interface for bot metrics
export interface BotMetrics {
  // Connection info
  isConnected: boolean;
  connectionState: string;
  lastConnectionChange: Date | null;
  disconnectionCount: number;
  
  // Uptime
  startTime: Date;
  uptime: number; // in seconds
  
  // Performance
  latency: number;
  
  // Guilds
  guildsCount: number;
  totalMembers: number;
  
  // Tickets
  activeTickets: {
    open: number;
    inProgress: number;
    resolved: number;
    total: number;
  };
  
  ticketStats: {
    today: number;
    thisWeek: number;
    allTime: number;
  };
  
  // Errors
  errorRate: number; // errors per hour
  totalErrors: number;
  recentErrors: ErrorLogEntry[];
  
  // Stream notifications
  streamNotifications: {
    sentToday: number;
    failedToday: number;
    totalSent: number;
    totalFailed: number;
  };
}

class BotHealthMonitor extends EventEmitter {
  private isConnected: boolean = false;
  private connectionState: string = 'disconnected';
  private lastConnectionChange: Date | null = null;
  private disconnectionCount: number = 0;
  private startTime: Date = new Date();
  private latency: number = 0;
  
  // Error tracking
  private errorLog: ErrorLogEntry[] = [];
  private readonly MAX_ERROR_LOG_SIZE = 100;
  
  // Connection state history
  private connectionStateHistory: ConnectionStateChange[] = [];
  private readonly MAX_CONNECTION_HISTORY = 50;
  
  // Stream notification tracking
  private streamNotificationsSentToday: number = 0;
  private streamNotificationsFailedToday: number = 0;
  private streamNotificationsTotalSent: number = 0;
  private streamNotificationsTotalFailed: number = 0;
  private lastResetDate: Date = new Date();
  
  constructor() {
    super();
    this.resetDailyCounters();
  }
  
  // Reset daily counters at midnight
  private resetDailyCounters() {
    const now = new Date();
    const lastReset = this.lastResetDate;
    
    // Check if it's a new day
    if (now.getDate() !== lastReset.getDate() || 
        now.getMonth() !== lastReset.getMonth() || 
        now.getFullYear() !== lastReset.getFullYear()) {
      this.streamNotificationsSentToday = 0;
      this.streamNotificationsFailedToday = 0;
      this.lastResetDate = now;
    }
    
    // Schedule next reset at midnight
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.resetDailyCounters();
    }, msUntilMidnight);
  }
  
  // Update connection state
  updateConnectionState(newState: string, reason?: string) {
    const previousState = this.connectionState;
    this.connectionState = newState;
    this.lastConnectionChange = new Date();
    
    // Track if disconnected
    if (newState === 'disconnected' || newState === 'reconnecting') {
      this.disconnectionCount++;
      this.isConnected = false;
    } else if (newState === 'connected' || newState === 'ready') {
      this.isConnected = true;
    }
    
    // Add to history
    const stateChange: ConnectionStateChange = {
      timestamp: new Date(),
      previousState,
      newState,
      reason
    };
    
    this.connectionStateHistory.unshift(stateChange);
    if (this.connectionStateHistory.length > this.MAX_CONNECTION_HISTORY) {
      this.connectionStateHistory.pop();
    }
    
    // Emit event
    this.emit('connectionStateChange', stateChange);
    
    console.log(`[BotHealthMonitor] Connection state changed: ${previousState} -> ${newState}${reason ? ` (${reason})` : ''}`);
  }
  
  // Update latency
  updateLatency(latency: number) {
    this.latency = latency;
  }
  
  // Log an error
  logError(message: string, severity: 'error' | 'warning' | 'critical' = 'error', stack?: string, context?: string) {
    const errorEntry: ErrorLogEntry = {
      timestamp: new Date(),
      message,
      severity,
      stack,
      context
    };
    
    this.errorLog.unshift(errorEntry);
    if (this.errorLog.length > this.MAX_ERROR_LOG_SIZE) {
      this.errorLog.pop();
    }
    
    // Emit event for critical errors
    if (severity === 'critical') {
      this.emit('criticalError', errorEntry);
    }
    
    console.error(`[BotHealthMonitor] ${severity.toUpperCase()}: ${message}`);
  }
  
  // Get recent errors
  getRecentErrors(limit: number = 10): ErrorLogEntry[] {
    return this.errorLog.slice(0, limit);
  }
  
  // Get all errors within time window
  getErrorsInTimeWindow(hours: number): ErrorLogEntry[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.errorLog.filter(error => error.timestamp >= cutoffTime);
  }
  
  // Calculate error rate (errors per hour)
  getErrorRate(): number {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentErrors = this.errorLog.filter(error => error.timestamp >= oneHourAgo);
    return recentErrors.length;
  }
  
  // Get connection state history
  getConnectionHistory(limit: number = 20): ConnectionStateChange[] {
    return this.connectionStateHistory.slice(0, limit);
  }
  
  // Track stream notification sent
  trackStreamNotificationSent(success: boolean) {
    if (success) {
      this.streamNotificationsSentToday++;
      this.streamNotificationsTotalSent++;
    } else {
      this.streamNotificationsFailedToday++;
      this.streamNotificationsTotalFailed++;
    }
  }
  
  // Get uptime in seconds
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }
  
  // Reset uptime (call when bot restarts)
  resetUptime() {
    this.startTime = new Date();
  }
  
  // Get comprehensive metrics snapshot
  getMetrics(
    guildsCount: number = 0,
    totalMembers: number = 0,
    activeTickets: { open: number; inProgress: number; resolved: number; total: number } = { open: 0, inProgress: 0, resolved: 0, total: 0 },
    ticketStats: { today: number; thisWeek: number; allTime: number } = { today: 0, thisWeek: 0, allTime: 0 }
  ): BotMetrics {
    return {
      isConnected: this.isConnected,
      connectionState: this.connectionState,
      lastConnectionChange: this.lastConnectionChange,
      disconnectionCount: this.disconnectionCount,
      
      startTime: this.startTime,
      uptime: this.getUptime(),
      
      latency: this.latency,
      
      guildsCount,
      totalMembers,
      
      activeTickets,
      ticketStats,
      
      errorRate: this.getErrorRate(),
      totalErrors: this.errorLog.length,
      recentErrors: this.getRecentErrors(10),
      
      streamNotifications: {
        sentToday: this.streamNotificationsSentToday,
        failedToday: this.streamNotificationsFailedToday,
        totalSent: this.streamNotificationsTotalSent,
        totalFailed: this.streamNotificationsTotalFailed
      }
    };
  }
  
  // Get health status (green/yellow/red)
  getHealthStatus(): 'healthy' | 'degraded' | 'critical' {
    // Critical if disconnected or too many errors
    if (!this.isConnected) {
      return 'critical';
    }
    
    const errorRate = this.getErrorRate();
    const recentCriticalErrors = this.errorLog
      .filter(e => e.severity === 'critical' && 
                   e.timestamp >= new Date(Date.now() - 5 * 60 * 1000)); // last 5 minutes
    
    if (recentCriticalErrors.length > 0 || errorRate > 10) {
      return 'critical';
    }
    
    // Degraded if high latency or moderate errors
    if (this.latency > 200 || errorRate > 3) {
      return 'degraded';
    }
    
    return 'healthy';
  }
}

// Export singleton instance
export const botHealthMonitor = new BotHealthMonitor();
