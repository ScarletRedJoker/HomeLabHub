import { useState, useEffect } from "react";
import { useServerContext } from "@/contexts/ServerContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, UserPlus, Radio, Scan, Sparkles } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StreamSettings {
  serverId: string;
  notificationChannelId: string | null;
  customMessage: string | null;
  isEnabled: boolean;
  autoDetectEnabled?: boolean;
  autoSyncIntervalMinutes?: number;
  lastAutoSyncAt?: Date | null;
}

interface TrackedUser {
  id: number;
  serverId: string;
  userId: string;
  username?: string | null;
  customMessage: string | null;
  lastNotifiedAt: Date | null;
  autoDetected?: boolean;
  connectedPlatforms?: string | null;
  platformUsernames?: string | null;
  isActive?: boolean;
  createdAt: Date;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

export default function StreamNotificationsTab() {
  const { selectedServerId } = useServerContext();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  
  // Settings state
  const [settings, setSettings] = useState<StreamSettings>({
    serverId: selectedServerId || '',
    notificationChannelId: null,
    customMessage: null,
    isEnabled: false,
    autoDetectEnabled: false,
    autoSyncIntervalMinutes: 60,
  });

  // Tracked users state
  const [trackedUsers, setTrackedUsers] = useState<TrackedUser[]>([]);
  const [newUserId, setNewUserId] = useState("");
  const [newUserMessage, setNewUserMessage] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Fetch channels
  useEffect(() => {
    if (!selectedServerId) return;

    fetch(`/api/servers/${selectedServerId}/channels`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        // Filter for text channels only (type 0)
        const textChannels = data.channels?.filter((ch: Channel) => ch.type === 0) || [];
        setChannels(textChannels);
      })
      .catch((error) => {
        console.error("Failed to fetch channels:", error);
      });
  }, [selectedServerId]);

  // Fetch settings and tracked users
  useEffect(() => {
    if (!selectedServerId) return;

    setLoading(true);
    Promise.all([
      fetch(`/api/stream-notifications/settings/${selectedServerId}`, {
        credentials: "include",
      }).then((res) => res.json()),
      fetch(`/api/stream-notifications/tracked-users/${selectedServerId}`, {
        credentials: "include",
      }).then((res) => res.json()),
    ])
      .then(([settingsData, usersData]) => {
        setSettings(settingsData);
        setTrackedUsers(usersData);
      })
      .catch((error) => {
        console.error("Failed to fetch stream notification data:", error);
        toast({
          title: "Error",
          description: "Failed to load stream notification settings",
          variant: "destructive",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedServerId, toast]);

  const handleSaveSettings = async () => {
    if (!settings.notificationChannelId) {
      toast({
        title: "Error",
        description: "Please select a notification channel",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/stream-notifications/settings/${selectedServerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          notificationChannelId: settings.notificationChannelId,
          customMessage: settings.customMessage || null,
          isEnabled: settings.isEnabled,
          autoDetectEnabled: settings.autoDetectEnabled,
          autoSyncIntervalMinutes: settings.autoSyncIntervalMinutes,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      const data = await response.json();
      setSettings(data);
      
      toast({
        title: "Success",
        description: "Stream notification settings saved successfully",
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast({
        title: "Error",
        description: "Failed to save stream notification settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserId.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Discord user ID",
        variant: "destructive",
      });
      return;
    }

    setAddingUser(true);
    try {
      const response = await fetch(`/api/stream-notifications/tracked-users/${selectedServerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: newUserId,
          customMessage: newUserMessage || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add user");
      }

      const newUser = await response.json();
      setTrackedUsers([...trackedUsers, newUser]);
      setNewUserId("");
      setNewUserMessage("");
      
      toast({
        title: "Success",
        description: "User added to stream tracking",
      });
    } catch (error: any) {
      console.error("Failed to add user:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add user to tracking",
        variant: "destructive",
      });
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      const response = await fetch(
        `/api/stream-notifications/tracked-users/${selectedServerId}/${userId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to remove user");
      }

      setTrackedUsers(trackedUsers.filter((u) => u.userId !== userId));
      
      toast({
        title: "Success",
        description: "User removed from stream tracking",
      });
    } catch (error) {
      console.error("Failed to remove user:", error);
      toast({
        title: "Error",
        description: "Failed to remove user from tracking",
        variant: "destructive",
      });
    }
  };

  const handleManualScan = async () => {
    setScanning(true);
    try {
      const response = await fetch(`/api/stream-notifications/scan/${selectedServerId}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to trigger scan");
      }

      const result = await response.json();
      
      // Reload tracked users after scan
      const usersResponse = await fetch(`/api/stream-notifications/tracked-users/${selectedServerId}`, {
        credentials: "include",
      });
      const usersData = await usersResponse.json();
      setTrackedUsers(usersData);
      
      toast({
        title: "Auto-Detection Scan Complete",
        description: `Found ${result.membersWithStreaming} members with streaming accounts. ${result.newlyAdded} newly added.`,
      });
    } catch (error) {
      console.error("Failed to trigger scan:", error);
      toast({
        title: "Error",
        description: "Failed to trigger auto-detection scan",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-discord-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Radio className="h-5 w-5 text-discord-blue" />
            Stream Notification Settings
          </CardTitle>
          <CardDescription className="text-discord-muted">
            Configure automatic go-live notifications for tracked streamers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isEnabled" className="text-white">Enable Stream Notifications</Label>
              <p className="text-sm text-discord-muted">
                Automatically post when tracked users go live
              </p>
            </div>
            <Switch
              id="isEnabled"
              checked={settings.isEnabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, isEnabled: checked })
              }
            />
          </div>

          {/* Notification Channel */}
          <div className="space-y-2">
            <Label htmlFor="channel" className="text-white">Notification Channel</Label>
            <Select
              value={settings.notificationChannelId || ""}
              onValueChange={(value) =>
                setSettings({ ...settings, notificationChannelId: value })
              }
            >
              <SelectTrigger className="bg-discord-dark border-discord-darker text-white">
                <SelectValue placeholder="Select a channel..." />
              </SelectTrigger>
              <SelectContent className="bg-discord-dark border-discord-darker">
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id} className="text-white hover:bg-discord-darker">
                    #{channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Message Template */}
          <div className="space-y-2">
            <Label htmlFor="message" className="text-white">Custom Message Template (Optional)</Label>
            <Textarea
              id="message"
              placeholder="Hey @user just went live on {platform}! Go check them out!"
              value={settings.customMessage || ""}
              onChange={(e) =>
                setSettings({ ...settings, customMessage: e.target.value })
              }
              className="bg-discord-dark border-discord-darker text-white placeholder:text-discord-muted min-h-[100px]"
            />
            <p className="text-sm text-discord-muted">
              Available tokens: <code className="text-discord-blue">@user</code> (mentions the user),{" "}
              <code className="text-discord-blue">{"{user}"}</code>,{" "}
              <code className="text-discord-blue">{"{game}"}</code>,{" "}
              <code className="text-discord-blue">{"{platform}"}</code>,{" "}
              <code className="text-discord-blue">{"{server}"}</code>
            </p>
          </div>

          {/* Auto-Detection Section */}
          <div className="space-y-4 p-4 rounded-lg bg-discord-dark border border-discord-darker">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="autoDetect" className="text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-discord-blue" />
                  Auto-Detect Streaming Accounts
                </Label>
                <p className="text-sm text-discord-muted">
                  Automatically track server members with connected Twitch/YouTube/Kick accounts
                </p>
              </div>
              <Switch
                id="autoDetect"
                checked={settings.autoDetectEnabled || false}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, autoDetectEnabled: checked })
                }
              />
            </div>

            {settings.autoDetectEnabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="syncInterval" className="text-white">Auto-Sync Interval (minutes)</Label>
                  <Input
                    id="syncInterval"
                    type="number"
                    min="15"
                    max="1440"
                    value={settings.autoSyncIntervalMinutes || 60}
                    onChange={(e) =>
                      setSettings({ ...settings, autoSyncIntervalMinutes: parseInt(e.target.value) || 60 })
                    }
                    className="bg-discord-darker border-discord-dark text-white"
                  />
                  <p className="text-xs text-discord-muted">
                    How often to scan for new members with streaming accounts (15-1440 minutes)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleManualScan}
                    disabled={scanning}
                    variant="outline"
                    className="border-discord-blue text-discord-blue hover:bg-discord-blue hover:text-white"
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Scan className="mr-2 h-4 w-4" />
                        Scan Now
                      </>
                    )}
                  </Button>
                  {settings.lastAutoSyncAt && (
                    <p className="text-xs text-discord-muted">
                      Last scanned: {new Date(settings.lastAutoSyncAt).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="rounded-lg bg-discord-darker p-3 border border-discord-blue/30">
                  <p className="text-xs text-discord-muted">
                    <strong className="text-discord-blue">How it works:</strong> This feature passively detects users when they go live. 
                    It requires at least one stream session to detect their accounts. Users are only tracked if they're in this server 
                    and have streaming accounts connected to Discord.
                  </p>
                </div>
              </>
            )}
          </div>

          <Button
            onClick={handleSaveSettings}
            disabled={saving}
            className="bg-discord-blue hover:bg-discord-blue-hover text-white"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Tracked Users Card */}
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-discord-blue" />
            Tracked Streamers
          </CardTitle>
          <CardDescription className="text-discord-muted">
            Add Discord users to track for stream notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add User Form */}
          <div className="space-y-4 p-4 rounded-lg bg-discord-dark border border-discord-darker">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="userId" className="text-white">Discord User ID</Label>
                <Input
                  id="userId"
                  placeholder="123456789012345678"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="bg-discord-darker border-discord-dark text-white placeholder:text-discord-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userMessage" className="text-white">Custom Message (Optional)</Label>
                <Input
                  id="userMessage"
                  placeholder="🎮 @user is streaming {game}!"
                  value={newUserMessage}
                  onChange={(e) => setNewUserMessage(e.target.value)}
                  className="bg-discord-darker border-discord-dark text-white placeholder:text-discord-muted"
                />
              </div>
            </div>
            <Button
              onClick={handleAddUser}
              disabled={addingUser}
              className="bg-discord-blue hover:bg-discord-blue-hover text-white w-full md:w-auto"
            >
              {addingUser ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </>
              )}
            </Button>
          </div>

          {/* Tracked Users List */}
          <div className="space-y-2">
            {trackedUsers.length === 0 ? (
              <p className="text-discord-muted text-center py-8">
                No users tracked yet. Add users above to start receiving stream notifications.
              </p>
            ) : (
              trackedUsers.map((user) => {
                const platforms = user.connectedPlatforms ? JSON.parse(user.connectedPlatforms) : [];
                const platformUsernames = user.platformUsernames ? JSON.parse(user.platformUsernames) : {};
                
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-discord-dark border border-discord-darker hover:border-discord-blue transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-medium">
                          {user.username ? (
                            <>
                              {user.username} <span className="text-discord-muted text-sm">({user.userId})</span>
                            </>
                          ) : (
                            <>User ID: <code className="text-discord-blue">{user.userId}</code></>
                          )}
                        </p>
                        {user.autoDetected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-discord-blue/20 text-discord-blue border border-discord-blue/30">
                            <Sparkles className="h-3 w-3" />
                            Auto-detected
                          </span>
                        )}
                        {!user.isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30">
                            Inactive
                          </span>
                        )}
                      </div>
                      
                      {platforms.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {platforms.map((platform: string) => (
                            <span key={platform} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-300 border border-purple-500/30">
                              {platform === 'twitch' && '🟣'}
                              {platform === 'youtube' && '🔴'}
                              {platform === 'kick' && '🟢'}
                              {platform.charAt(0).toUpperCase() + platform.slice(1)}
                              {platformUsernames[platform] && `: ${platformUsernames[platform]}`}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {user.customMessage && (
                        <p className="text-sm text-discord-muted truncate">
                          {user.customMessage}
                        </p>
                      )}
                      {user.lastNotifiedAt && (
                        <p className="text-xs text-discord-muted">
                          Last notified: {new Date(user.lastNotifiedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveUser(user.userId)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10 ml-4"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
