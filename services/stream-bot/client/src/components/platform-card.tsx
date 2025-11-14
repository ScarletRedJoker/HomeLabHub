import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Check, X, Loader2 } from "lucide-react";
import { SiTwitch, SiYoutube, SiKick } from "react-icons/si";
import type { PlatformConnection } from "@shared/schema";

interface PlatformCardProps {
  platform: "twitch" | "youtube" | "kick";
  connection?: PlatformConnection;
  onConnect: () => void;
  onDisconnect: () => void;
  onSettings: () => void;
  isLoading?: boolean;
}

const platformConfig = {
  twitch: {
    name: "Twitch",
    icon: SiTwitch,
    color: "text-purple-500",
    bgColor: "bg-gradient-to-br from-purple-500/20 to-purple-600/10",
    glowClass: "candy-platform-twitch",
  },
  youtube: {
    name: "YouTube",
    icon: SiYoutube,
    color: "text-red-500",
    bgColor: "bg-gradient-to-br from-red-500/20 to-red-600/10",
    glowClass: "candy-platform-youtube",
  },
  kick: {
    name: "Kick",
    icon: SiKick,
    color: "text-green-500",
    bgColor: "bg-gradient-to-br from-green-400/20 to-green-500/10",
    glowClass: "candy-platform-kick",
  },
};

export function PlatformCard({
  platform,
  connection,
  onConnect,
  onDisconnect,
  onSettings,
  isLoading = false,
}: PlatformCardProps) {
  const config = platformConfig[platform];
  const Icon = config.icon;
  const isConnected = connection?.isConnected ?? false;

  return (
    <Card 
      className={`candy-glass-card candy-hover-elevate overflow-hidden ${isConnected ? config.glowClass : ''}`} 
      data-testid={`card-platform-${platform}`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${config.bgColor} backdrop-blur-sm`}>
            <Icon className={`h-6 w-6 ${config.color} ${isConnected ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{config.name}</h3>
            {connection?.platformUsername && (
              <p className="text-sm text-muted-foreground">
                @{connection.platformUsername}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge
              variant="default"
              className="candy-badge-green"
              data-testid={`status-${platform}-connected`}
            >
              <div className="h-2 w-2 rounded-full bg-white mr-1.5 animate-pulse" />
              Connected
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              data-testid={`status-${platform}-disconnected`}
            >
              <div className="h-2 w-2 rounded-full bg-muted-foreground mr-1.5" />
              Disconnected
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isConnected && connection?.lastConnectedAt && (
          <div className="text-sm text-muted-foreground">
            Last connected:{" "}
            {new Date(connection.lastConnectedAt).toLocaleDateString()}
          </div>
        )}
        {!isConnected && (
          <p className="text-sm text-muted-foreground">
            Connect your {config.name} account to start posting Snapple facts
          </p>
        )}
      </CardContent>

      <CardFooter className="flex justify-between gap-2 flex-wrap">
        {isConnected ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              disabled={isLoading}
              data-testid={`button-disconnect-${platform}`}
              className="hover:scale-105 transition-transform"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              <span>Disconnect</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSettings}
              data-testid={`button-settings-${platform}`}
              className="hover:scale-105 transition-transform"
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={onConnect}
            disabled={isLoading}
            className="w-full candy-button border-0"
            data-testid={`button-connect-${platform}`}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span>Connect {config.name}</span>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
