import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { PlatformCard } from "@/components/platform-card";
import { ConnectPlatformDialog } from "@/components/connect-platform-dialog";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { HelpTooltip } from "@/components/HelpTooltip";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Zap, 
  Play,
  Pause,
  Plus,
  AlertTriangle,
  RefreshCw,
  Layers,
  Radio,
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { PlatformConnection, BotSettings, BotMessage } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { toast } = useToast();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [, setLocation] = useLocation();

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

  const { data: recentMessages } = useQuery<BotMessage[]>({
    queryKey: ["/api/messages"],
  });

  const { data: tokenHealth } = useQuery<{
    success: boolean;
    platforms: Array<{
      platform: string;
      platformUsername: string;
      isConnected: boolean;
      hasRefreshToken: boolean;
      tokenExpired: boolean;
      tokenExpiringSoon: boolean;
      status: 'healthy' | 'needs_reauth' | 'expiring_soon' | 'expired';
      message: string;
      needsReauth: boolean;
    }>;
    anyNeedsReauth: boolean;
  }>({
    queryKey: ["/api/platforms/token-health"],
    refetchInterval: 60000,
  });

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
      const existingConnection = platforms?.find((p) => p.platform === data.platform);
      
      const connectionData: any = {
        botUsername: data.botUsername || data.platformUsername,
      };

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
        description: "Your channel is now connected!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error?.message || "Failed to connect platform.",
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

  const toggleBotMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", "/api/settings", {
        isActive: !settings?.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: settings?.isActive ? "Bot Paused" : "Bot Activated",
        description: settings?.isActive 
          ? "Your bot has been paused" 
          : "Your bot is now active!",
      });
    },
  });

  const quickTriggerMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/trigger-fact", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Fact Posted!",
        description: "Your fact has been posted to all active platforms.",
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

  const connectedPlatforms = platforms?.filter(p => p.isConnected) ?? [];
  const hasConnectedPlatforms = connectedPlatforms.length > 0;
  const recentFacts = recentMessages?.slice(0, 5) ?? [];

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 max-w-7xl candy-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold candy-gradient-text">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-0.5 sm:mt-1">
            {hasConnectedPlatforms 
              ? `Connected to ${connectedPlatforms.length} platform${connectedPlatforms.length > 1 ? 's' : ''}`
              : 'Connect your first platform to get started'
            }
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleBotMutation.mutate()}
            disabled={toggleBotMutation.isPending || !hasConnectedPlatforms}
            className="flex-1 sm:flex-none h-9 sm:h-8 candy-touch-target"
          >
            {settings?.isActive ? (
              <>
                <Pause className="h-4 w-4 mr-1.5" />
                <span className="hidden xs:inline">Pause</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1.5" />
                <span className="hidden xs:inline">Start</span>
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => quickTriggerMutation.mutate()}
            disabled={quickTriggerMutation.isPending || !hasConnectedPlatforms}
            className="flex-1 sm:flex-none candy-button border-0 candy-glow h-9 sm:h-8 candy-touch-target"
          >
            {quickTriggerMutation.isPending ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1.5" />
                Post Fact
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Getting Started Checklist */}
      <GettingStartedChecklist />

      {/* Token Health Warning */}
      {tokenHealth?.anyNeedsReauth && (
        <Card className="border-orange-500/50 bg-orange-500/10">
          <CardHeader className="p-3 sm:p-4 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
              <CardTitle className="text-sm sm:text-base text-orange-700 dark:text-orange-400">
                Platform Reconnection Needed
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            <div className="flex flex-wrap gap-2">
              {tokenHealth.platforms
                .filter(p => p.needsReauth || p.status === 'expired')
                .map(p => (
                  <Button
                    key={p.platform}
                    size="sm"
                    variant="outline"
                    className="border-orange-500/50 hover:bg-orange-500/10"
                    onClick={() => window.location.href = `/auth/${p.platform}`}
                  >
                    <RefreshCw className="h-3 w-3 mr-1.5" />
                    Reconnect {p.platform}
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card 
          className="candy-glass-card candy-hover-elevate cursor-pointer group"
          onClick={() => quickTriggerMutation.mutate()}
        >
          <CardContent className="p-4 sm:p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-candy-pink to-candy-purple flex items-center justify-center group-hover:scale-110 transition-transform">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">Generate Fact</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Post to all platforms</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="candy-glass-card candy-hover-elevate cursor-pointer group"
          onClick={() => setLocation("/announcements")}
        >
          <CardContent className="p-4 sm:p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-candy-blue to-candy-purple flex items-center justify-center group-hover:scale-110 transition-transform">
              <Radio className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">Announcements</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Schedule posts</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="candy-glass-card candy-hover-elevate cursor-pointer group"
          onClick={() => setLocation("/overlay-editor")}
        >
          <CardContent className="p-4 sm:p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-candy-green to-candy-blue flex items-center justify-center group-hover:scale-110 transition-transform">
              <Layers className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">OBS Overlays</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Customize your stream</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status + Recent Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Bot Status Card */}
        <Card className="candy-glass-card">
          <CardHeader className="p-4 sm:p-6 pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-candy-yellow" />
              Bot Status
              <HelpTooltip content="Overview of your bot's current status and activity. Green badge means the bot is actively running." />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                Status
                <HelpTooltip content="Whether the bot is currently active. Active bots can post facts and respond to commands." />
              </span>
              {settings?.isActive ? (
                <Badge className="candy-badge-green">
                  <div className="h-2 w-2 rounded-full bg-white mr-1.5 animate-pulse" />
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground mr-1.5" />
                  Inactive
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                Platforms
                <HelpTooltip content="Number of streaming platforms connected (Twitch, YouTube, Kick). Connect more platforms to reach more viewers!" />
              </span>
              <span className="font-semibold">{stats?.activePlatforms ?? 0}/3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                Facts Posted
                <HelpTooltip content="Total number of AI-generated facts posted to your chat across all platforms." />
              </span>
              <span className="font-semibold">{stats?.totalMessages ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                This Week
                <HelpTooltip content="Facts posted in the last 7 days. Keep your chat engaged with regular content!" />
              </span>
              <span className="font-semibold">{stats?.messagesThisWeek ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="candy-glass-card lg:col-span-2">
          <CardHeader className="p-4 sm:p-6 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-candy-blue" />
                Recent Facts
              </CardTitle>
              <Link href="/fact-feed">
                <Button variant="ghost" size="sm" className="text-xs">
                  View All
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2">
            {recentFacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No facts posted yet</p>
                <p className="text-xs mt-1">Generate your first fact above!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentFacts.map((message) => (
                  <div key={message.id} className="flex gap-3 p-3 rounded-lg bg-muted/50">
                    <CheckCircle2 className="h-4 w-4 text-candy-green mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm line-clamp-2">{message.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {message.createdAt && !isNaN(new Date(message.createdAt).getTime())
                          ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })
                          : 'Recently'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Platform Connections */}
      <div>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-lg sm:text-xl font-semibold">Platform Connections</h2>
          {hasConnectedPlatforms && (
            <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs">
              <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
              {connectedPlatforms.length} Active
            </Badge>
          )}
        </div>
        
        {platformsLoading ? (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
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
        ) : !hasConnectedPlatforms ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-6 sm:p-12 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-candy-pink/20 to-candy-purple/20 flex items-center justify-center mx-auto mb-4">
                <Plus className="h-8 w-8 text-candy-pink" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Connect Your First Platform</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Connect your Twitch, YouTube, or Kick channel to start posting AI-generated facts to your viewers!
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => handleConnect("twitch")} className="candy-button border-0">
                  <Plus className="h-4 w-4 mr-2" />
                  Connect Twitch
                </Button>
                <Button onClick={() => handleConnect("youtube")} variant="outline">
                  Connect YouTube
                </Button>
                <Button onClick={() => handleConnect("kick")} variant="outline">
                  Connect Kick
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
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

      {/* Quick Links to Features */}
      <Card className="candy-glass-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-candy-purple" />
            Quick Access
          </CardTitle>
          <CardDescription>Explore all StreamBot features</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { name: "Commands", desc: "Custom chat commands", href: "/commands" },
              { name: "Giveaways", desc: "Run viewer giveaways", href: "/giveaways" },
              { name: "Currency", desc: "Points system", href: "/currency" },
              { name: "Analytics", desc: "Stream insights", href: "/analytics" },
            ].map((feature) => (
              <Link key={feature.name} href={feature.href}>
                <div className="p-3 rounded-lg bg-muted/50 text-center hover:bg-muted transition-colors cursor-pointer">
                  <p className="font-medium text-sm">{feature.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{feature.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

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
