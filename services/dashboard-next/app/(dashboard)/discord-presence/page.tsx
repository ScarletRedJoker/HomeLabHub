"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  ExternalLink,
  Download,
  Play,
  Pause,
  Tv,
  Music,
  Film,
  Save,
  Copy,
  Monitor,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";

interface MediaSession {
  source: 'plex' | 'jellyfin';
  title: string;
  type: 'movie' | 'episode' | 'track' | 'unknown';
  showName?: string;
  seasonEpisode?: string;
  artistAlbum?: string;
  year?: number;
  state: 'playing' | 'paused';
  progress: number;
  duration: number;
  user: string;
  thumb?: string;
}

interface PresenceData {
  active: boolean;
  sessions: MediaSession[];
  timestamp: number;
}

interface PresenceSettings {
  discordAppId: string;
  enabled: boolean;
  presenceLastSeen: string | null;
}

interface HeartbeatStatus {
  connected: boolean;
  lastSeen: string | null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getMediaIcon(type: string) {
  switch (type) {
    case 'movie':
      return <Film className="h-5 w-5" />;
    case 'episode':
      return <Tv className="h-5 w-5" />;
    case 'track':
      return <Music className="h-5 w-5" />;
    default:
      return <Play className="h-5 w-5" />;
  }
}

export default function DiscordPresencePage() {
  const [presenceData, setPresenceData] = useState<PresenceData | null>(null);
  const [settings, setSettings] = useState<PresenceSettings>({
    discordAppId: '',
    enabled: true,
    presenceLastSeen: null,
  });
  const [heartbeat, setHeartbeat] = useState<HeartbeatStatus>({
    connected: false,
    lastSeen: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discordAppIdInput, setDiscordAppIdInput] = useState('');
  const { toast } = useToast();

  const fetchPresenceData = useCallback(async () => {
    try {
      const res = await fetch('/api/presence/current');
      if (res.ok) {
        const data = await res.json();
        setPresenceData(data);
      }
    } catch (error) {
      console.error('Failed to fetch presence data:', error);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/presence/settings?userId=default');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setDiscordAppIdInput(data.discordAppId || '');
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  }, []);

  const fetchHeartbeat = useCallback(async () => {
    try {
      const res = await fetch('/api/presence/heartbeat?userId=default');
      if (res.ok) {
        const data = await res.json();
        setHeartbeat(data);
      }
    } catch (error) {
      console.error('Failed to fetch heartbeat:', error);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchPresenceData(), fetchSettings(), fetchHeartbeat()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchPresenceData, fetchSettings, fetchHeartbeat]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/presence/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'default',
          discordAppId: discordAppIdInput,
          enabled: settings.enabled,
        }),
      });
      
      if (res.ok) {
        toast({
          title: 'Settings Saved',
          description: 'Your Discord presence settings have been updated.',
        });
        setSettings(prev => ({ ...prev, discordAppId: discordAppIdInput }));
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: 'Copied to clipboard.',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
              <svg className="h-6 w-6 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Discord Rich Presence
              </h1>
              <p className="text-muted-foreground text-sm">
                Show what you're watching on your Discord profile
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="border-l-4 border-l-indigo-500/50 bg-gradient-to-r from-indigo-500/5 to-transparent">
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Discord Rich Presence displays what you're currently watching on Plex or Jellyfin directly on your Discord profile, 
            similar to how Spotify shows your current song. Friends can see your viewing activity in real-time!
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tv className="h-5 w-5" />
                Current Media Status
              </CardTitle>
              <CardDescription>What's currently playing on your media servers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {presenceData?.active && presenceData.sessions.length > 0 ? (
                presenceData.sessions.map((session, index) => (
                  <div key={index} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        session.source === 'plex' 
                          ? 'bg-orange-500/20 text-orange-500' 
                          : 'bg-purple-500/20 text-purple-500'
                      }`}>
                        {getMediaIcon(session.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={
                            session.source === 'plex' 
                              ? 'border-orange-500/30 text-orange-500' 
                              : 'border-purple-500/30 text-purple-500'
                          }>
                            {session.source === 'plex' ? 'Plex' : 'Jellyfin'}
                          </Badge>
                          <Badge variant="secondary" className="gap-1">
                            {session.state === 'playing' ? (
                              <Play className="h-3 w-3" />
                            ) : (
                              <Pause className="h-3 w-3" />
                            )}
                            {session.state}
                          </Badge>
                        </div>
                        <p className="font-medium truncate">{session.title}</p>
                        {session.showName && (
                          <p className="text-sm text-muted-foreground">
                            {session.showName} {session.seasonEpisode && `• ${session.seasonEpisode}`}
                          </p>
                        )}
                        {session.artistAlbum && (
                          <p className="text-sm text-muted-foreground">{session.artistAlbum}</p>
                        )}
                        <div className="mt-3 space-y-1">
                          <Progress 
                            value={(session.progress / session.duration) * 100} 
                            className="h-1.5"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatDuration(session.progress)}</span>
                            <span>{formatDuration(session.duration)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <Tv className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="font-medium">Nothing Playing</p>
                  <p className="text-sm text-muted-foreground">
                    Start watching something on Plex or Jellyfin
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Desktop Agent Status
              </CardTitle>
              <CardDescription>Connection status of your desktop daemon</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 p-4 rounded-lg border">
                <div className={`p-3 rounded-full ${
                  heartbeat.connected 
                    ? 'bg-green-500/20' 
                    : 'bg-gray-500/20'
                }`}>
                  {heartbeat.connected ? (
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  ) : (
                    <XCircle className="h-6 w-6 text-gray-500" />
                  )}
                </div>
                <div>
                  <p className="font-medium">
                    {heartbeat.connected ? 'Connected' : 'Not Detected'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {heartbeat.lastSeen 
                      ? `Last seen: ${new Date(heartbeat.lastSeen).toLocaleString()}`
                      : 'Desktop daemon has not connected yet'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardHeader>
            <CardTitle>Setup Guide</CardTitle>
            <CardDescription>Follow these steps to enable Discord Rich Presence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-lg border">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-500 font-bold text-sm shrink-0">
                  1
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Create a Discord Application</p>
                  <p className="text-sm text-muted-foreground">
                    Go to the Discord Developer Portal and create a new application. 
                    This will be used to display your presence.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a 
                      href="https://discord.com/developers/applications" 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Discord Developer Portal
                    </a>
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-lg border">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-500 font-bold text-sm shrink-0">
                  2
                </div>
                <div className="space-y-3 flex-1">
                  <p className="font-medium">Enter Your Discord Application ID</p>
                  <p className="text-sm text-muted-foreground">
                    Copy the Application ID from your Discord application's General Information page.
                  </p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label htmlFor="discord-app-id" className="sr-only">Discord Application ID</Label>
                      <Input
                        id="discord-app-id"
                        placeholder="Enter your Discord Application ID"
                        value={discordAppIdInput}
                        onChange={(e) => setDiscordAppIdInput(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleSaveSettings} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {settings.discordAppId && (
                    <div className="flex items-center gap-2 text-sm text-green-500">
                      <CheckCircle className="h-4 w-4" />
                      Application ID saved
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-lg border">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-500 font-bold text-sm shrink-0">
                  3
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Download the Desktop Daemon</p>
                  <p className="text-sm text-muted-foreground">
                    Download and install the desktop daemon that will sync your media status to Discord.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a 
                      href="/api/presence/download?platform=windows" 
                      download
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download for Windows
                    </a>
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-lg border">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-500 font-bold text-sm shrink-0">
                  4
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Run the Installer</p>
                  <p className="text-sm text-muted-foreground">
                    Run the downloaded installer on your computer. The daemon will start automatically 
                    and run in the background, updating your Discord status when you watch media.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <Switch
                  id="presence-enabled"
                  checked={settings.enabled}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))}
                />
                <Label htmlFor="presence-enabled" className="cursor-pointer">
                  Enable Discord Rich Presence
                </Label>
              </div>
              {settings.enabled !== (settings.discordAppId ? true : false) && (
                <Button size="sm" onClick={handleSaveSettings} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
