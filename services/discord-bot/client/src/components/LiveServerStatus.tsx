/**
 * LiveServerStatus Component
 * 
 * Displays real-time server status including:
 * - Total member count
 * - Active voice/text channels with member counts
 * - Discord server invite link
 * - WebSocket connection status
 * 
 * Features:
 * - Auto-updates via WebSocket
 * - Larger, more prominent display
 * - Shows ALL channels (not just top channel)
 * - Real-time member count updates
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  Hash, 
  Volume2, 
  Activity, 
  ExternalLink,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  MessageSquare
} from "lucide-react";

interface VoiceChannel {
  id: string;
  name: string;
  userCount: number;
  userLimit: number;
}

interface TextChannel {
  id: string;
  name: string;
  type: string;
}

interface ServerStatus {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  onlineMemberCount?: number;
  voiceChannels: VoiceChannel[];
  textChannels: TextChannel[];
  discordInviteUrl?: string;
}

interface LiveServerStatusProps {
  serverId?: string | null;
  className?: string;
}

export default function LiveServerStatus({ serverId, className = "" }: LiveServerStatusProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Fetch server status data
  const { data: serverStatus, isLoading, error, refetch } = useQuery<ServerStatus>({
    queryKey: ['/api/server-status', serverId],
    queryFn: async () => {
      const url = serverId 
        ? `/api/server-status/${serverId}` 
        : '/api/server-status';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch server status');
      }
      return response.json();
    },
    enabled: !!serverId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!serverId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[LiveServerStatus] WebSocket connected');
      setWsConnected(true);
      // Authenticate
      ws.send(JSON.stringify({
        type: 'auth',
        userId: localStorage.getItem('userId') // Assuming userId is stored
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Refetch data when server updates occur
        if (data.type === 'GUILD_MEMBER_ADD' || 
            data.type === 'GUILD_MEMBER_REMOVE' ||
            data.type === 'VOICE_STATE_UPDATE') {
          if (data.serverId === serverId) {
            refetch();
          }
        }
      } catch (error) {
        console.error('[LiveServerStatus] Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[LiveServerStatus] WebSocket error:', error);
      setWsConnected(false);
    };

    ws.onclose = () => {
      console.log('[LiveServerStatus] WebSocket disconnected');
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [serverId, refetch]);

  const handleCopyInvite = async () => {
    if (!serverStatus?.discordInviteUrl) return;

    try {
      await navigator.clipboard.writeText(serverStatus.discordInviteUrl);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Server invite link copied to clipboard",
      });
      
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy invite link",
        variant: "destructive",
      });
    }
  };

  const handleOpenInvite = () => {
    if (!serverStatus?.discordInviteUrl) return;
    window.open(serverStatus.discordInviteUrl, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return (
      <Card className={`bg-discord-sidebar border-discord-dark ${className}`}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-discord-blue" />
          <span className="ml-3 text-discord-text">Loading server status...</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !serverStatus) {
    return (
      <Card className={`bg-discord-sidebar border-discord-dark ${className}`}>
        <CardContent className="py-6">
          <Alert className="bg-red-500/20 border-red-500/30">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-white">
              Failed to load server status. Please select a server or check your connection.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-gradient-to-br from-discord-sidebar to-discord-bg border-discord-dark ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {serverStatus.icon && (
              <img 
                src={serverStatus.icon} 
                alt={serverStatus.name}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <CardTitle className="text-white text-xl">{serverStatus.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={wsConnected 
                  ? "bg-green-500/20 text-green-400 border-green-500/30" 
                  : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                }>
                  <Activity className="h-3 w-3 mr-1" />
                  {wsConnected ? 'Live' : 'Offline'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Total Members Display */}
        <div className="bg-discord-dark/50 rounded-lg p-4 border border-discord-blue/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-discord-blue/20 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-discord-blue" />
              </div>
              <div>
                <p className="text-sm text-discord-muted">Total Members</p>
                <p className="text-3xl font-bold text-white">{serverStatus.memberCount}</p>
              </div>
            </div>
            {serverStatus.onlineMemberCount !== undefined && (
              <div className="text-right">
                <p className="text-sm text-discord-muted">Online</p>
                <p className="text-2xl font-bold text-green-400">{serverStatus.onlineMemberCount}</p>
              </div>
            )}
          </div>
        </div>

        <Separator className="bg-discord-dark" />

        {/* Voice Channels */}
        {serverStatus.voiceChannels && serverStatus.voiceChannels.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-discord-text flex items-center gap-2">
              <Volume2 className="h-4 w-4" />
              Voice Channels ({serverStatus.voiceChannels.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {serverStatus.voiceChannels.map((channel) => (
                <div 
                  key={channel.id}
                  className="flex items-center justify-between p-3 bg-discord-dark rounded-lg hover:bg-discord-dark/70 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-discord-muted" />
                    <span className="text-sm text-discord-text">{channel.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-discord-blue/20 text-discord-blue border-discord-blue/30">
                      <Users className="h-3 w-3 mr-1" />
                      {channel.userCount}{channel.userLimit > 0 ? `/${channel.userLimit}` : ''}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Text Channels */}
        {serverStatus.textChannels && serverStatus.textChannels.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-discord-text flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Text Channels ({serverStatus.textChannels.length})
            </h3>
            <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
              {serverStatus.textChannels.slice(0, 10).map((channel) => (
                <div 
                  key={channel.id}
                  className="flex items-center gap-2 p-2 bg-discord-dark/30 rounded hover:bg-discord-dark/50 transition-colors"
                >
                  <Hash className="h-3 w-3 text-discord-muted" />
                  <span className="text-xs text-discord-text">{channel.name}</span>
                </div>
              ))}
              {serverStatus.textChannels.length > 10 && (
                <p className="text-xs text-discord-muted text-center pt-1">
                  +{serverStatus.textChannels.length - 10} more channels
                </p>
              )}
            </div>
          </div>
        )}

        {/* Discord Server Invite Link */}
        {serverStatus.discordInviteUrl && (
          <>
            <Separator className="bg-discord-dark" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-discord-text flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Join Discord Server
              </h3>
              <div className="flex gap-2">
                <Button
                  onClick={handleOpenInvite}
                  className="flex-1 bg-discord-blue hover:bg-blue-600 h-10"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Join Server
                </Button>
                <Button
                  onClick={handleCopyInvite}
                  variant="outline"
                  size="icon"
                  className="border-discord-dark h-10 w-10"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="bg-discord-dark rounded-md p-2">
                <p className="text-xs text-discord-muted break-all font-mono">
                  {serverStatus.discordInviteUrl}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Last Updated */}
        <div className="text-center pt-2">
          <p className="text-xs text-discord-muted">
            Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
      </CardContent>

      {/* Custom scrollbar styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgb(47, 49, 54);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgb(88, 101, 242);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgb(71, 82, 196);
        }
      `}</style>
    </Card>
  );
}
