import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Music2, ExternalLink, Copy, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

interface PlatformConnection {
  id: string;
  platform: string;
  platformUserId?: string;
  platformUsername?: string;
  isConnected: boolean;
  lastConnectedAt?: string;
}

interface OverlayTokenResponse {
  token: string;
  expiresIn: number;
  overlayUrl: string;
}

export function SpotifyCardMultiUser() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);

  // Check URL for connection success/error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify') === 'connected') {
      toast({
        title: "Spotify Connected!",
        description: "Your Spotify account has been successfully connected.",
      });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('error')?.startsWith('spotify_')) {
      toast({
        title: "Connection Failed",
        description: "Failed to connect Spotify. Please try again.",
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

  // Find Spotify connection
  const spotifyConnection = platforms?.find(p => p.platform === 'spotify');

  // Generate overlay token mutation
  const generateToken = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<OverlayTokenResponse>('/api/overlay/generate-token', {
        method: 'POST',
        body: JSON.stringify({ platform: 'spotify', expiresIn: 86400 * 7 }), // 7 days
        headers: { 'Content-Type': 'application/json' },
      });
      return res;
    },
    onSuccess: (data) => {
      setOverlayUrl(`${window.location.origin}${data.overlayUrl}`);
      toast({
        title: "Overlay Token Generated!",
        description: "Your overlay URL has been generated and will expire in 7 days.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate token",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disconnect mutation
  const disconnect = useMutation({
    mutationFn: async () => {
      await apiRequest('/auth/spotify/disconnect', { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      setOverlayUrl(null);
      toast({
        title: "Spotify Disconnected",
        description: "Your Spotify account has been disconnected.",
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

  const copyOverlayUrl = () => {
    if (!overlayUrl) return;
    navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    toast({
      title: "Copied!",
      description: "OBS overlay URL copied to clipboard.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const openOverlay = () => {
    if (!overlayUrl) return;
    window.open(overlayUrl, '_blank', 'width=600,height=400');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music2 className="w-5 h-5" />
            Spotify Integration
          </CardTitle>
          <CardDescription>
            Loading Spotify connection status...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music2 className="w-5 h-5" />
          Spotify Integration
        </CardTitle>
        <CardDescription>
          Connect your Spotify account to display "now playing" on your stream
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            {spotifyConnection?.isConnected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <div>
                  <p className="font-medium">Connected</p>
                  {spotifyConnection.platformUsername && (
                    <p className="text-sm text-muted-foreground">
                      {spotifyConnection.platformUsername}
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
                    Click below to connect your Spotify account
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {spotifyConnection?.isConnected ? (
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
                  onClick={() => window.location.href = '/auth/spotify'}
                >
                  Connect Spotify
                </Button>
              </>
            )}
          </div>
        </div>

        {/* OBS Overlay URL */}
        {spotifyConnection?.isConnected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">OBS Browser Source URL</label>
              {!overlayUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateToken.mutate()}
                  disabled={generateToken.isPending}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${generateToken.isPending ? 'animate-spin' : ''}`} />
                  Generate URL
                </Button>
              )}
            </div>

            {overlayUrl ? (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  Add this URL as a Browser Source in OBS to display your currently playing song
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 p-2 bg-muted rounded text-xs font-mono break-all">
                    {overlayUrl}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyOverlayUrl}
                    title="Copy URL"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={openOverlay}
                    title="Preview Overlay"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => generateToken.mutate()}
                    disabled={generateToken.isPending}
                    title="Regenerate URL"
                  >
                    <RefreshCw className={`w-4 h-4 ${generateToken.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                  <p className="text-sm font-medium">OBS Setup Instructions:</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Open OBS Studio</li>
                    <li>Add a new Browser Source</li>
                    <li>Paste the URL above</li>
                    <li>Set width: 600px, height: 200px (or adjust to your preference)</li>
                    <li>Check "Shutdown source when not visible" for best performance</li>
                    <li>Position the overlay on your stream canvas</li>
                  </ol>
                </div>

                <p className="text-xs text-muted-foreground">
                  💡 Tip: The overlay URL is valid for 7 days. Regenerate it if it expires.
                </p>
              </>
            ) : (
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">
                  Click "Generate URL" to create your OBS overlay link
                </p>
              </div>
            )}
          </div>
        )}

        {/* Not Connected Instructions */}
        {!spotifyConnection?.isConnected && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg space-y-2">
            <p className="text-sm font-medium">How to connect Spotify:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Click the "Connect Spotify" button above</li>
              <li>Log in to your Spotify account</li>
              <li>Authorize the application to access your playback data</li>
              <li>You'll be redirected back here once connected</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
