import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Music2, ExternalLink, Copy, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";

interface SpotifyStatus {
  connected: boolean;
}

interface SpotifyProfile {
  displayName: string;
  email: string;
  id: string;
  imageUrl?: string;
}

export function SpotifyCard() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: status, isLoading } = useQuery<SpotifyStatus>({
    queryKey: ["/api/spotify/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: profile } = useQuery<SpotifyProfile>({
    queryKey: ["/api/spotify/profile"],
    enabled: status?.connected === true,
  });

  const overlayUrl = `${window.location.origin}/overlay/spotify`;

  const copyOverlayUrl = () => {
    navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    toast({
      title: "Copied!",
      description: "OBS overlay URL copied to clipboard.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const openOverlay = () => {
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
            {status?.connected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <div>
                  <p className="font-medium">Connected</p>
                  {profile && (
                    <p className="text-sm text-muted-foreground">
                      {profile.displayName || profile.email}
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
                    Set up Spotify integration in Replit
                  </p>
                </div>
              </>
            )}
          </div>
          {status?.connected ? (
            <Badge variant="default" className="bg-green-500">Active</Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </div>

        {/* OBS Overlay URL */}
        {status?.connected && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">OBS Browser Source URL</label>
              <p className="text-xs text-muted-foreground mb-2">
                Add this URL as a Browser Source in OBS to display your currently playing song
              </p>
              <div className="flex gap-2">
                <div className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all">
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
              </div>
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
              💡 Tip: The overlay auto-refreshes every 5 seconds and fades in/out smoothly when you start or stop playing music.
            </p>
          </div>
        )}

        {/* Not Connected Instructions */}
        {!status?.connected && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg space-y-2">
            <p className="text-sm font-medium">How to connect Spotify:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>This project uses Replit's Spotify integration</li>
              <li>The integration should already be set up</li>
              <li>If you see this message, you may need to re-authorize</li>
              <li>Contact your homelab administrator (Evin) to verify the connection</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
