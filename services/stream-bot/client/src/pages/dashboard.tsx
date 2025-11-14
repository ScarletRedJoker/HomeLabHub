import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { PlatformCard } from "@/components/platform-card";
import { ConnectPlatformDialog } from "@/components/connect-platform-dialog";
import { WelcomeCard } from "@/components/WelcomeCard";
import { FeatureCard } from "@/components/FeatureCard";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Activity, 
  Zap, 
  Clock, 
  TrendingUp, 
  MessageSquare, 
  Trophy, 
  Bot, 
  Coins,
  Sparkles,
  ArrowRight,
  Play,
  Pause,
  Plus,
} from "lucide-react";
import { Link, useLocation } from "wouter";
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

  const [, setLocation] = useLocation();

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
        description: "Your Snapple fact has been posted to all active platforms.",
      });
    },
  });

  const hasConnectedPlatforms = platforms?.some(p => p.isConnected) ?? false;

  return (
    <div className="space-y-8 p-4 sm:p-6 max-w-7xl candy-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold candy-gradient-text">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your multi-platform streaming bot
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleBotMutation.mutate()}
            disabled={toggleBotMutation.isPending || !hasConnectedPlatforms}
          >
            {settings?.isActive ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause Bot
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Bot
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => quickTriggerMutation.mutate()}
            disabled={quickTriggerMutation.isPending || !hasConnectedPlatforms}
            className="candy-button border-0 candy-glow"
          >
            {quickTriggerMutation.isPending ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Posting...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Post Fact Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Welcome Card for New Users */}
      <WelcomeCard />

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 candy-fade-in-delay-1">
        <Card className="candy-stat-card-pink candy-hover-elevate border-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
            <Activity className="h-4 w-4 text-candy-pink" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {settings?.isActive ? (
                <Badge variant="default" className="candy-badge-green">
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
            <p className="text-xs text-muted-foreground mt-1">
              {settings?.intervalMode === "manual"
                ? "Manual trigger only"
                : settings?.intervalMode === "fixed"
                ? `Every ${settings.fixedIntervalMinutes} min`
                : "Random intervals"}
            </p>
          </CardContent>
        </Card>

        <Card className="candy-stat-card-blue candy-hover-elevate border-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Facts</CardTitle>
            <Zap className="h-4 w-4 text-candy-blue" />
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

        <Card className="candy-stat-card-purple candy-hover-elevate border-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-candy-purple" />
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

        <Card className="candy-stat-card-green candy-hover-elevate border-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platforms</CardTitle>
            <Clock className="h-4 w-4 text-candy-green" />
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

      {/* What's New Section */}
      <Card className="candy-glass-card candy-fade-in-delay-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-candy-yellow candy-bounce" />
              <CardTitle>What's New</CardTitle>
            </div>
            <Badge className="candy-badge-purple">Latest Updates</Badge>
          </div>
          <CardDescription>
            Check out the newest features and improvements
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3 p-3 rounded-lg bg-gradient-to-br from-candy-pink/10 to-candy-purple/10">
            <div className="flex-shrink-0">
              <div className="h-2 w-2 rounded-full bg-candy-pink mt-2 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Multi-Platform Support</div>
              <div className="text-xs text-muted-foreground">
                Now supporting Twitch, YouTube, and Kick simultaneously!
              </div>
            </div>
          </div>
          <div className="flex gap-3 p-3 rounded-lg bg-gradient-to-br from-candy-blue/10 to-candy-green/10">
            <div className="flex-shrink-0">
              <div className="h-2 w-2 rounded-full bg-candy-blue mt-2 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">AI Chatbot Integration</div>
              <div className="text-xs text-muted-foreground">
                Interactive AI chatbot with custom personalities
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Discovery */}
      <div className="candy-fade-in-delay-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Explore Features</h2>
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="hover:scale-105 transition-transform">
              View All
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={MessageSquare}
            title="Custom Commands"
            description="Create personalized chat commands for your community"
            badge="Popular"
            badgeVariant="default"
            iconColor="text-blue-500"
            action={{
              label: "Manage Commands",
              onClick: () => setLocation("/commands"),
            }}
          />
          <FeatureCard
            icon={Trophy}
            title="Giveaways"
            description="Run engaging giveaways and raffles for viewers"
            iconColor="text-yellow-500"
            action={{
              label: "Create Giveaway",
              onClick: () => setLocation("/giveaways"),
            }}
          />
          <FeatureCard
            icon={Coins}
            title="Currency System"
            description="Custom points and rewards for loyal viewers"
            badge="New"
            iconColor="text-green-500"
            action={{
              label: "Setup Currency",
              onClick: () => setLocation("/currency"),
            }}
          />
          <FeatureCard
            icon={Bot}
            title="AI Chatbot"
            description="Intelligent chat responses with custom personalities"
            badge="AI"
            iconColor="text-purple-500"
            action={{
              label: "Configure AI",
              onClick: () => setLocation("/chatbot"),
            }}
          />
        </div>
      </div>

      {/* Platform Connections */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Platform Connections</h2>
          {hasConnectedPlatforms && (
            <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
              <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
              {stats?.activePlatforms || 0} Active
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
          <EmptyState
            icon={Plus}
            title="No Platforms Connected"
            description="Connect your first streaming platform to start posting AI-generated Snapple facts to your viewers!"
            action={{
              label: "Connect a Platform",
              onClick: () => handleConnect("twitch"),
            }}
          />
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
