import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Twitch, CheckCircle2, XCircle } from "lucide-react";
import { useEffect } from "react";

interface PlatformConnection {
  id: string;
  platform: string;
  platformUserId?: string;
  platformUsername?: string;
  isConnected: boolean;
  lastConnectedAt?: string;
}

export function TwitchCardMultiUser() {
  const { toast } = useToast();

  // Check URL for connection success/error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'twitch_connected') {
      toast({
        title: "Twitch Connected!",
        description: "Your Twitch account has been successfully connected.",
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('error')?.startsWith('twitch_')) {
      toast({
        title: "Connection Failed",
        description: "Failed to connect Twitch. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  // Fetch all platform connections
  const { data: platforms, isLoading } = useQuery<PlatformConnection[]>({
    queryKey: ["/api/platforms"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Find Twitch connection
  const twitchConnection = platforms?.find(p => p.platform === 'twitch');

  // Disconnect mutation
  const disconnect = useMutation({
    mutationFn: async () => {
      await apiRequest('/auth/twitch/disconnect', { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      toast({
        title: "Twitch Disconnected",
        description: "Your Twitch account has been disconnected.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to disconnect",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Twitch className="w-5 h-5" />
            Twitch Integration
          </CardTitle>
          <CardDescription>
            Loading Twitch connection status...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Twitch className="w-5 h-5" />
          Twitch Integration
        </CardTitle>
        <CardDescription>
          Connect your Twitch account to send automated messages to your chat
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            {twitchConnection?.isConnected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <div>
                  <p className="font-medium">Connected</p>
                  {twitchConnection.platformUsername && (
                    <p className="text-sm text-muted-foreground">
                      @{twitchConnection.platformUsername}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Not Connected</p>
                  <p className="text-sm text-muted-foreground">
                    Click below to connect your Twitch account
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {twitchConnection?.isConnected ? (
              <>
                <Badge variant="default" className="bg-green-500">Active</Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <>
                <Badge variant="secondary">Inactive</Badge>
                <Button 
                  size="sm"
                  onClick={() => window.location.href = '/auth/twitch'}
                >
                  Connect Twitch
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Connected Instructions */}
        {twitchConnection?.isConnected && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2">
            <p className="text-sm font-medium">✅ Twitch Connected!</p>
            <p className="text-sm text-muted-foreground">
              Your bot can now send automated Snapple facts to your Twitch chat. 
              Enable Twitch in your active platforms below to start posting.
            </p>
          </div>
        )}

        {/* Not Connected Instructions */}
        {!twitchConnection?.isConnected && (
          <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg space-y-2">
            <p className="text-sm font-medium">How to connect Twitch:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Click the "Connect Twitch" button above</li>
              <li>Log in to your Twitch account</li>
              <li>Authorize the application to send messages as you</li>
              <li>You'll be redirected back here once connected</li>
            </ol>
            <div className="mt-3 p-3 bg-background rounded border">
              <p className="text-xs font-medium mb-1">✨ Features you'll unlock:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Automated Snapple facts in your Twitch chat</li>
                <li>Configurable posting intervals (fixed or random)</li>
                <li>Chat commands like !snapple and !fact</li>
                <li>AI-powered fact generation</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
