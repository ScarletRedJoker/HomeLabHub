import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity as ActivityIcon, Clock, Zap } from "lucide-react";
import type { MessageHistory, BotSettings } from "@shared/schema";

interface BotStatus {
  isActive: boolean;
  intervalMode: string;
  nextPostIn?: number;
  connectedPlatforms: string[];
}

export default function Activity() {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [nextPostCountdown, setNextPostCountdown] = useState<number | undefined>();

  const { data: recentMessages, isLoading } = useQuery<MessageHistory[]>({
    queryKey: ["/api/messages/recent"],
  });

  const { data: settings } = useQuery<BotSettings>({
    queryKey: ["/api/settings"],
  });

  // WebSocket for real-time updates
  const handleWebSocketMessage = useCallback((data: any) => {
    if (data.type === "new_message") {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/recent"] });
    } else if (data.type === "bot_status") {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    }
  }, []);

  useWebSocket(handleWebSocketMessage);

  useEffect(() => {
    if (!settings) return;

    setBotStatus({
      isActive: settings.isActive,
      intervalMode: settings.intervalMode,
      nextPostIn: settings.intervalMode !== "manual" ? 847 : undefined,
      connectedPlatforms: settings.activePlatforms || [],
    });

    // Simulate countdown for demo purposes
    if (settings.intervalMode === "fixed" && settings.fixedIntervalMinutes) {
      const intervalSeconds = settings.fixedIntervalMinutes * 60;
      setNextPostCountdown(intervalSeconds);
      
      const interval = setInterval(() => {
        setNextPostCountdown((prev) => {
          if (!prev || prev <= 0) return intervalSeconds;
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [settings]);

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getTriggerBadge = (type: string) => {
    switch (type) {
      case "scheduled":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Scheduled</Badge>;
      case "manual":
        return <Badge><Zap className="h-3 w-3 mr-1" />Manual</Badge>;
      case "chat_command":
        return <Badge variant="outline"><ActivityIcon className="h-3 w-3 mr-1" />Chat</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Activity</h1>
        <p className="text-muted-foreground mt-1">
          Real-time bot status and recent activity
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Live Status Panel */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bot Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                {botStatus?.isActive ? (
                  <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" data-testid="badge-bot-active">
                    <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary" data-testid="badge-bot-inactive">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground mr-1.5" />
                    Inactive
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Mode</span>
                <span className="text-sm text-muted-foreground capitalize">
                  {botStatus?.intervalMode || "manual"}
                </span>
              </div>

              {nextPostCountdown !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Next Post</span>
                  <span className="text-sm font-mono text-muted-foreground" data-testid="text-next-post">
                    {Math.floor(nextPostCountdown / 60)}:{String(nextPostCountdown % 60).padStart(2, "0")}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t">
                <span className="text-sm font-medium block mb-2">
                  Connected Platforms
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {botStatus?.connectedPlatforms.map((platform) => (
                    <Badge key={platform} variant="outline" className="text-xs capitalize">
                      {platform}
                    </Badge>
                  ))}
                  {botStatus?.connectedPlatforms.length === 0 && (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity Feed */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                      <Skeleton className="h-12 w-12 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentMessages && recentMessages.length > 0 ? (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {recentMessages.map((message) => (
                    <div
                      key={message.id}
                      className="flex items-start gap-3 p-4 rounded-lg border hover-elevate"
                      data-testid={`message-${message.id}`}
                    >
                      <div className="flex-shrink-0 pt-0.5">
                        {getTriggerBadge(message.triggerType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono leading-relaxed break-words">
                          {message.factContent}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {message.platform}
                          </Badge>
                          <span>{formatTimeAgo(message.postedAt)}</span>
                          {message.triggerUser && (
                            <span>by @{message.triggerUser}</span>
                          )}
                        </div>
                      </div>
                      {message.status === "success" ? (
                        <div className="flex-shrink-0 h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                        </div>
                      ) : (
                        <div className="flex-shrink-0 h-5 w-5 rounded-full bg-red-500/10 flex items-center justify-center">
                          <div className="h-2 w-2 rounded-full bg-red-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ActivityIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No recent activity</p>
                  <p className="text-sm mt-1">
                    Facts will appear here once the bot starts posting
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
