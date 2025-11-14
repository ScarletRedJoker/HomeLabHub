import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Twitch, Youtube, Link2, Unlink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

interface PlatformConnection {
  platform: string;
  username: string | null;
  isConnected: boolean;
  lastConnectedAt: string | null;
}

interface PlatformData {
  primaryPlatform: string | null;
  platforms: PlatformConnection[];
}

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [platformData, setPlatformData] = useState<PlatformData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPlatformData = async () => {
    try {
      const response = await fetch('/api/auth/platforms', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setPlatformData(data);
      }
    } catch (error) {
      console.error('Failed to fetch platform data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlatformData();
  }, []);

  const handleUnlinkPlatform = async (platform: string) => {
    try {
      const response = await fetch(`/api/auth/unlink/${platform}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unlink platform');
      }

      toast({
        title: 'Platform unlinked',
        description: `${platform} has been unlinked from your account`,
      });

      fetchPlatformData();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to unlink platform',
        variant: 'destructive',
      });
    }
  };

  const handleChangePrimary = async (platform: string) => {
    try {
      const response = await fetch('/api/auth/change-primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to change primary platform');
      }

      toast({
        title: 'Primary platform updated',
        description: `${platform} is now your primary platform`,
      });

      fetchPlatformData();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to change primary platform',
        variant: 'destructive',
      });
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'twitch':
        return <Twitch className="h-4 w-4" />;
      case 'youtube':
        return <Youtube className="h-4 w-4" />;
      case 'kick':
        return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
        </svg>;
      default:
        return <Link2 className="h-4 w-4" />;
    }
  };

  if (!user) return null;

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and connected platforms
        </p>
      </div>

      <Separator />

      <div className="grid gap-6">
        <Card data-testid="card-account-info">
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Your account details and primary platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={user.email}
                disabled
                data-testid="input-email-display"
              />
              <p className="text-xs text-muted-foreground">
                Email is managed through your connected platforms
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label>Primary Platform</Label>
              <div className="flex items-center gap-2">
                {platformData?.primaryPlatform ? (
                  <>
                    {getPlatformIcon(platformData.primaryPlatform)}
                    <span className="text-sm capitalize">
                      {platformData.primaryPlatform}
                    </span>
                    <Badge variant="secondary">Primary</Badge>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">No primary platform set</span>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Account Status</Label>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm" data-testid="text-account-status">
                  {user.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-connected-platforms">
          <CardHeader>
            <CardTitle>Connected Platforms</CardTitle>
            <CardDescription>
              Manage your connected streaming platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading platforms...</p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  {['twitch', 'youtube', 'kick'].map((platform) => {
                    const connection = platformData?.platforms.find(p => p.platform === platform);
                    const isConnected = connection?.isConnected || false;
                    const isPrimary = platformData?.primaryPlatform === platform;

                    return (
                      <div key={platform} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {getPlatformIcon(platform)}
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium capitalize">{platform}</p>
                              {isPrimary && <Badge variant="secondary">Primary</Badge>}
                              {isConnected && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Connected
                              </Badge>}
                            </div>
                            {connection?.username && (
                              <p className="text-sm text-muted-foreground">@{connection.username}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {isConnected ? (
                            <>
                              {!isPrimary && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleChangePrimary(platform)}
                                >
                                  Set as Primary
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUnlinkPlatform(platform)}
                                className="text-destructive hover:bg-destructive/10"
                              >
                                <Unlink className="h-4 w-4 mr-1" />
                                Unlink
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (platform === 'twitch') {
                                  window.location.href = '/auth/twitch';
                                } else if (platform === 'youtube') {
                                  window.location.href = '/auth/youtube';
                                } else if (platform === 'kick') {
                                  window.location.href = '/auth/kick';
                                }
                              }}
                            >
                              <Link2 className="h-4 w-4 mr-1" />
                              Link {platform}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Link additional platforms to use StreamBot across all your streaming accounts.
                    Your primary platform is used for initial authentication.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
