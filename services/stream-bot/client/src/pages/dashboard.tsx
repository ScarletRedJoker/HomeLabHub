import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { PlatformCard } from "@/components/platform-card";
import { ConnectPlatformDialog } from "@/components/connect-platform-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Activity, Zap, Clock, TrendingUp } from "lucide-react";
import type { PlatformConnection, BotSettings } from "@shared/schema";

export default function Dashboard() {
  const { toast } = useToast();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  const { data: platforms, isLoading: platformsLoading } = useQuery<PlatformConnection[]>({
    queryKey: ["/api/platforms"],
  });

  const { data: settings } = useQuery<BotSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: stats } = useQuery<{
    totalMessages: number;
    messagesThisWeek: number;
    activePlatforms: number;
  }>({
    queryKey: ["/api/stats"],
  });

  // WebSocket for real-time updates
  const handleWebSocketMessage = useCallback((data: any) => {
    if (data.type === "new_message") {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "New Fact Posted!",
        description: data.fact,
      });
    } else if (data.type === "bot_status") {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    }
  }, [toast]);

  useWebSocket(handleWebSocketMessage);

  const connectMutation = useMutation({
    mutationFn: async (data: {
      platform: string;
      platformUsername: string;
      accessToken: string;
      channelId?: string;
      botUsername?: string;
      bearerToken?: string;
      cookies?: string;
    }) => {
      // Create or update platform connection
      const existingConnection = platforms?.find((p) => p.platform === data.platform);
      
      // Store platform-specific data in connectionData
      const connectionData: any = {
        botUsername: data.botUsername || data.platformUsername,
      };

      // For Kick, store bearer token and cookies separately
      if (data.platform === "kick") {
        connectionData.bearerToken = data.bearerToken;
        connectionData.cookies = data.cookies;
      }
      
      if (existingConnection) {
        return await apiRequest("PATCH", `/api/platforms/${existingConnection.id}`, {
          isConnected: true,
          lastConnectedAt: new Date().toISOString(),
          platformUsername: data.platformUsername,
          accessToken: data.accessToken,
          channelId: data.channelId || data.platformUsername.toLowerCase(),
          connectionData,
        });
      } else {
        return await apiRequest("POST", "/api/platforms", {
          platform: data.platform,
          isConnected: true,
          lastConnectedAt: new Date().toISOString(),
          platformUsername: data.platformUsername,
          platformUserId: data.platformUsername.toLowerCase(),
          accessToken: data.accessToken,
          channelId: data.channelId || data.platformUsername.toLowerCase(),
          connectionData,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setConnectDialogOpen(false);
      setConnectingPlatform(null);
      toast({
        title: "Platform Connected",
        description: "Your Twitch channel is now connected! Configure your bot in Settings to start posting facts.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error?.message || "Failed to connect platform. Please check your credentials and try again.",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (platformId: string) => {
      return await apiRequest("PATCH", `/api/platforms/${platformId}`, {
        isConnected: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Platform Disconnected",
        description: "Platform has been disconnected",
      });
    },
    onError: () => {
      toast({
        title: "Disconnection Failed",
        description: "Failed to disconnect platform",
        variant: "destructive",
      });
    },
  });

  const handleConnect = (platform: string) => {
    setConnectingPlatform(platform);
    setConnectDialogOpen(true);
  };

  const handleConnectSubmit = (data: {
    platform: string;
    platformUsername: string;
    accessToken: string;
    channelId?: string;
    botUsername?: string;
    bearerToken?: string;
    cookies?: string;
  }) => {
    connectMutation.mutate(data);
  };

  const handleDisconnect = (platformId: string) => {
    disconnectMutation.mutate(platformId);
  };

  const handleSettings = (platform: string) => {
    toast({
      title: "Platform Settings",
      description: `Opening settings for ${platform}`,
    });
  };

  const getPlatformConnection = (platform: string) => {
    return platforms?.find((p) => p.platform === platform);
  };

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Manage your multi-platform streaming bot
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {settings?.isActive ? (
                <Badge variant="default" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                  <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground mr-1.5" />
                  Inactive
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {settings?.intervalMode === "manual"
                ? "Manual trigger only"
                : settings?.intervalMode === "fixed"
                ? `Every ${settings.fixedIntervalMinutes} min`
                : "Random intervals"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Facts</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-messages">
              {stats?.totalMessages ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All time posted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-weekly-messages">
              {stats?.messagesThisWeek ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Facts posted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platforms</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-platforms">
              {stats?.activePlatforms ?? 0}/3
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Connected
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Platform Connections */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Platform Connections</h2>
        {platformsLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <Skeleton className="h-4 w-24 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <PlatformCard
              platform="twitch"
              connection={getPlatformConnection("twitch")}
              onConnect={() => handleConnect("twitch")}
              onDisconnect={() => {
                const conn = getPlatformConnection("twitch");
                if (conn) handleDisconnect(conn.id);
              }}
              onSettings={() => handleSettings("twitch")}
              isLoading={connectMutation.isPending || disconnectMutation.isPending}
            />
            <PlatformCard
              platform="youtube"
              connection={getPlatformConnection("youtube")}
              onConnect={() => handleConnect("youtube")}
              onDisconnect={() => {
                const conn = getPlatformConnection("youtube");
                if (conn) handleDisconnect(conn.id);
              }}
              onSettings={() => handleSettings("youtube")}
              isLoading={connectMutation.isPending || disconnectMutation.isPending}
            />
            <PlatformCard
              platform="kick"
              connection={getPlatformConnection("kick")}
              onConnect={() => handleConnect("kick")}
              onDisconnect={() => {
                const conn = getPlatformConnection("kick");
                if (conn) handleDisconnect(conn.id);
              }}
              onSettings={() => handleSettings("kick")}
              isLoading={connectMutation.isPending || disconnectMutation.isPending}
            />
          </div>
        )}
      </div>

      {/* Connect Platform Dialog */}
      <ConnectPlatformDialog
        platform={connectingPlatform || "twitch"}
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        onConnect={handleConnectSubmit}
        isPending={connectMutation.isPending}
      />
    </div>
  );
}
