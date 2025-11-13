import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Video, CheckCircle2, XCircle, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

interface PlatformConnection {
  id: string;
  platform: string;
  platformUserId?: string;
  platformUsername?: string;
  isConnected: boolean;
  lastConnectedAt?: string;
}

export function YouTubeCardMultiUser() {
  const { toast } = useToast();
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check URL for connection success/error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube') === 'connected') {
      toast({
        title: "YouTube Connected!",
        description: "Your YouTube account has been successfully connected.",
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('error')?.startsWith('youtube_')) {
      toast({
        title: "Connection Failed",
        description: "Failed to connect YouTube. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  // Fetch all platform connections
  const { data: platforms, isLoading } = useQuery<PlatformConnection[]>({
    queryKey: ["/api/platforms"],
    refetchInterval: 30000,
  });

  // Find YouTube connection
  const youtubeConnection = platforms?.find(p => p.platform === 'youtube');

  // Generate overlay token mutation
  const generateToken = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/overlay/generate-token', {
        platform: 'youtube',
        expiresIn: 7 * 24 * 60 * 60, // 7 days
      });
      return response;
    },
    onSuccess: (data: any) => {
      const fullUrl = `${window.location.origin}${data.overlayUrl}`;
      setOverlayUrl(fullUrl);
      toast({
        title: "Overlay URL Generated",
        description: "Copy the URL below to use in OBS Browser Source.",
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
      await apiRequest('DELETE', '/auth/youtube/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      setOverlayUrl(null);
      toast({
        title: "YouTube Disconnected",
        description: "Your YouTube account has been disconnected.",
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
            <Video className="w-5 h-5" />
            YouTube Integration
          </CardTitle>
          <CardDescription>
            Loading YouTube connection status...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="w-5 h-5" />
          YouTube Integration
        </CardTitle>
        <CardDescription>
          Connect your YouTube account for livestream integration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            {youtubeConnection?.isConnected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <div>
                  <p className="font-medium">Connected</p>
                  {youtubeConnection.platformUsername && (
                    <p className="text-sm text-muted-foreground">
                      {youtubeConnection.platformUsername}
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
                    Click below to connect your YouTube account
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {youtubeConnection?.isConnected ? (
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
                  onClick={() => window.location.href = '/auth/youtube'}
                >
                  Connect YouTube
                </Button>
              </>
            )}
          </div>
        </div>

        {/* OBS Overlay URL */}
        {youtubeConnection?.isConnected && (
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={overlayUrl}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copyOverlayUrl}
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={openOverlay}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Add this URL to OBS as a Browser Source. Overlay will show when you're live streaming.
                </p>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setOverlayUrl(null);
                    setCopied(false);
                  }}
                  className="text-xs"
                >
                  Regenerate Token
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Click "Generate URL" to create an overlay link for OBS. The token is valid for 7 days.
              </p>
            )}
          </div>
        )}

        {/* Connected Features */}
        {youtubeConnection?.isConnected ? (
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-sm font-medium mb-2">YouTube Features:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Livestream detection and status</li>
              <li>Viewer count tracking</li>
              <li>Stream metadata access</li>
              <li>Live stream overlay for OBS</li>
            </ul>
          </div>
        ) : (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg space-y-2">
            <p className="text-sm font-medium">How to connect YouTube:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Click the "Connect YouTube" button above</li>
              <li>Log in to your Google account</li>
              <li>Authorize the application to access your YouTube data</li>
              <li>You'll be redirected back here once connected</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
