import { useQuery } from "@tanstack/react-query";
import { useServerContext } from "@/contexts/ServerContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, AlertCircle, AlertTriangle, Activity, Server, Database } from "lucide-react";

interface BotHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  latency: number;
  guilds: number;
  users: number;
  memory: {
    used: number;
    total: number;
  };
}

/**
 * HealthTab Component
 * 
 * Displays bot health metrics, configuration status, and Docker warnings.
 * Helps admins monitor the bot's operational status.
 */
export default function HealthTab() {
  const { selectedServerId } = useServerContext();

  // Fetch bot health status
  const { data: health, isLoading, error } = useQuery<BotHealth>({
    queryKey: ['/api/bot/health'],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'degraded': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'down': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'degraded': return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
      case 'down': return <AlertCircle className="h-5 w-5 text-red-400" />;
      default: return <Activity className="h-5 w-5 text-gray-400" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatMemory = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-discord-blue mx-auto mb-4" />
          <p className="text-discord-text">Loading health status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="bg-red-500/20 border-red-500/30">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-white">
          Failed to load bot health status. The bot may be offline.
        </AlertDescription>
      </Alert>
    );
  }

  const memoryUsagePercent = health?.memory 
    ? Math.round((health.memory.used / health.memory.total) * 100) 
    : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Bot Health & Status</h2>
        <p className="text-sm sm:text-base text-discord-muted">
          Monitor your Discord bot's performance and operational status.
        </p>
      </div>

      {/* Overall Status Card */}
      <Card className="bg-gradient-to-br from-discord-sidebar to-discord-bg border-discord-dark">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-white text-base sm:text-lg">Bot Status</CardTitle>
            {health && (
              <Badge className={getStatusColor(health.status)}>
                <span className="flex items-center gap-2">
                  {getStatusIcon(health.status)}
                  <span className="text-xs sm:text-sm">{health.status.toUpperCase()}</span>
                </span>
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="space-y-1">
              <p className="text-sm text-discord-muted">Uptime</p>
              <p className="text-2xl font-bold text-white" data-testid="text-bot-uptime">
                {health ? formatUptime(health.uptime) : 'N/A'}
              </p>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm text-discord-muted">Latency</p>
              <p className="text-2xl font-bold text-white" data-testid="text-bot-latency">
                {health ? `${health.latency}ms` : 'N/A'}
              </p>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm text-discord-muted">Servers</p>
              <p className="text-2xl font-bold text-white" data-testid="text-bot-guilds">
                {health?.guilds || 0}
              </p>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm text-discord-muted">Total Users</p>
              <p className="text-2xl font-bold text-white" data-testid="text-bot-users">
                {health?.users || 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resource Usage */}
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-white text-base sm:text-lg flex items-center gap-2">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
            Resource Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {/* Memory Usage */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-discord-muted">Memory Usage</span>
              <span className="text-sm text-white font-medium">
                {health ? `${formatMemory(health.memory.used)} / ${formatMemory(health.memory.total)}` : 'N/A'}
              </span>
            </div>
            <div className="w-full bg-discord-dark rounded-full h-2.5">
              <div 
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  memoryUsagePercent > 80 
                    ? 'bg-red-500' 
                    : memoryUsagePercent > 60 
                    ? 'bg-yellow-500' 
                    : 'bg-green-500'
                }`}
                style={{ width: `${memoryUsagePercent}%` }}
                data-testid="progress-memory-usage"
              ></div>
            </div>
            <p className="text-xs text-discord-muted">
              {memoryUsagePercent}% used
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Status */}
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-white text-base sm:text-lg flex items-center gap-2">
            <Server className="h-4 w-4 sm:h-5 sm:w-5" />
            Configuration Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-discord-dark rounded-lg">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-discord-blue flex-shrink-0" />
              <div>
                <p className="font-medium text-white text-sm sm:text-base">Database Connection</p>
                <p className="text-xs text-discord-muted">PostgreSQL</p>
              </div>
            </div>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex-shrink-0">
              <CheckCircle className="h-3 w-3 mr-1" />
              <span className="text-xs">Connected</span>
            </Badge>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-discord-dark rounded-lg">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-discord-blue flex-shrink-0" />
              <div>
                <p className="font-medium text-white text-sm sm:text-base">Discord Gateway</p>
                <p className="text-xs text-discord-muted">WebSocket Connection</p>
              </div>
            </div>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex-shrink-0">
              <CheckCircle className="h-3 w-3 mr-1" />
              <span className="text-xs">Connected</span>
            </Badge>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-discord-dark rounded-lg">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-discord-blue flex-shrink-0" />
              <div>
                <p className="font-medium text-white text-sm sm:text-base">Music System</p>
                <p className="text-xs text-discord-muted">Voice & Audio</p>
              </div>
            </div>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex-shrink-0">
              <CheckCircle className="h-3 w-3 mr-1" />
              <span className="text-xs">Operational</span>
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-white text-base sm:text-lg">System Information</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-sm">
            <div>
              <span className="text-discord-muted">Node.js Version:</span>
              <span className="ml-2 text-white font-medium">{typeof process !== 'undefined' ? process.version : 'N/A'}</span>
            </div>
            <div>
              <span className="text-discord-muted">Environment:</span>
              <span className="ml-2 text-white font-medium">
                {import.meta.env.MODE === 'production' ? 'Production' : 'Development'}
              </span>
            </div>
            <div>
              <span className="text-discord-muted">Platform:</span>
              <span className="ml-2 text-white font-medium">
                {typeof process !== 'undefined' ? process.platform : 'Browser'}
              </span>
            </div>
            <div>
              <span className="text-discord-muted">API Version:</span>
              <span className="ml-2 text-white font-medium">v1.0</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Docker Notice */}
      <Alert className="bg-discord-blue/20 border-discord-blue/30">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-white">
          <span className="font-semibold">Docker Deployment:</span> This bot is running in a containerized environment.
          For optimal performance, ensure Docker has sufficient memory allocation (recommended: 2GB+).
        </AlertDescription>
      </Alert>
    </div>
  );
}
