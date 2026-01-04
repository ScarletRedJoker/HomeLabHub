import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/components/AuthProvider";
import { useServerContext } from "@/contexts/ServerContext";
import { queryClient } from "@/lib/queryClient";
import { Shield, Lock, Info, AlertTriangle, RefreshCw, Loader2, Star, Award, Gavel } from "lucide-react";

interface SlidingSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

export default function SlidingSettingsPanel({ isOpen, onClose }: SlidingSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState("general");
  const { toast } = useToast();
  const { user, isAdmin } = useAuthContext();
  const { selectedServerId } = useServerContext();
  const [isLoading, setIsLoading] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  
  const [settings, setSettings] = useState({
    botName: "Ticket Bot",
    botPrefix: "!",
    discordServerId: "",
    welcomeMessage: "Thank you for creating a ticket. Our support team will assist you shortly.",
    notificationsEnabled: true,
    adminRoleId: "",
    supportRoleId: "",
    autoCloseEnabled: true,
    autoCloseHours: "48",
    debugMode: false,
    autoModEnabled: false,
    bannedWords: "",
    linkFilterEnabled: false,
    spamFilterEnabled: false,
    spamThreshold: 5,
    spamTimeWindow: 5,
    autoModAction: "warn",
    starboardEnabled: false,
    starboardChannelId: "",
    starboardThreshold: 3,
    starboardEmoji: "⭐",
    xpEnabled: false,
    levelUpChannelId: "",
    levelUpMessage: "🎉 Congratulations {user}! You've reached level {level}!",
    xpMinAmount: 15,
    xpMaxAmount: 25,
    xpCooldownSeconds: 60
  });

  const getServerId = (): string | null => {
    if (selectedServerId) return selectedServerId;
    if (user?.connectedServers && user.connectedServers.length > 0) {
      return user.connectedServers[0];
    }
    return null;
  };

  const loadChannels = async (serverId: string) => {
    try {
      const response = await fetch(`/api/servers/${serverId}/channels`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setChannels(data.channels || []);
      }
    } catch (error) {
      console.error("Failed to load channels:", error);
    }
  };
  
  useEffect(() => {
    if (!isOpen) return;
    
    const loadSettings = async () => {
      const serverId = getServerId();
      if (!serverId) return;
      
      try {
        const response = await fetch(`/api/servers/${serverId}/settings`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const botSettings = await response.json();
          
          let bannedWordsStr = "";
          if (botSettings.bannedWords) {
            try {
              const parsed = JSON.parse(botSettings.bannedWords);
              bannedWordsStr = Array.isArray(parsed) ? parsed.join(", ") : "";
            } catch {
              bannedWordsStr = botSettings.bannedWords;
            }
          }
          
          setSettings({
            botName: botSettings.botName || "Ticket Bot",
            botPrefix: botSettings.botPrefix || "!",
            discordServerId: botSettings.serverId || serverId,
            welcomeMessage: botSettings.welcomeMessage || "Thank you for creating a ticket. Our support team will assist you shortly.",
            notificationsEnabled: botSettings.notificationsEnabled ?? true,
            adminRoleId: botSettings.adminRoleId || "",
            supportRoleId: botSettings.supportRoleId || "",
            autoCloseEnabled: botSettings.autoCloseEnabled ?? false,
            autoCloseHours: botSettings.autoCloseHours?.toString() || "48",
            debugMode: botSettings.debugMode ?? false,
            autoModEnabled: botSettings.autoModEnabled ?? false,
            bannedWords: bannedWordsStr,
            linkFilterEnabled: botSettings.linkFilterEnabled ?? false,
            spamFilterEnabled: botSettings.spamFilterEnabled ?? false,
            spamThreshold: botSettings.spamThreshold ?? 5,
            spamTimeWindow: botSettings.spamTimeWindow ?? 5,
            autoModAction: botSettings.autoModAction || "warn",
            starboardEnabled: botSettings.starboardEnabled ?? false,
            starboardChannelId: botSettings.starboardChannelId || "",
            starboardThreshold: botSettings.starboardThreshold ?? 3,
            starboardEmoji: botSettings.starboardEmoji || "⭐",
            xpEnabled: botSettings.xpEnabled ?? false,
            levelUpChannelId: botSettings.levelUpChannelId || "",
            levelUpMessage: botSettings.levelUpMessage || "🎉 Congratulations {user}! You've reached level {level}!",
            xpMinAmount: botSettings.xpMinAmount ?? 15,
            xpMaxAmount: botSettings.xpMaxAmount ?? 25,
            xpCooldownSeconds: botSettings.xpCooldownSeconds ?? 60
          });
        }
        
        await loadChannels(serverId);
      } catch (error) {
        console.error("Failed to load bot settings:", error);
      }
    };

    loadSettings();
  }, [user, isOpen, selectedServerId]);
  
  const handleChange = (field: string, value: any) => {
    setSettings({
      ...settings,
      [field]: value
    });
  };
  
  const autoPopulateFromDiscord = async () => {
    const serverId = getServerId();
    if (!serverId) {
      toast({
        title: "Error",
        description: "No Discord server connected. Please connect a server first.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/discord/server-info/${serverId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        
        const adminRole = data.roles.find((role: any) => 
          role.name.toLowerCase().includes('admin') || 
          role.name.toLowerCase().includes('moderator')
        );
        
        const supportRole = data.roles.find((role: any) => 
          role.name.toLowerCase().includes('support') || 
          role.name.toLowerCase().includes('helper') ||
          role.name.toLowerCase().includes('staff')
        );

        setSettings(prevSettings => ({
          ...prevSettings,
          discordServerId: data.server.id,
          botName: `${data.server.name} Ticket Bot`,
          adminRoleId: adminRole?.id || "",
          supportRoleId: supportRole?.id || ""
        }));

        toast({
          title: "Settings populated",
          description: `Auto-populated settings from ${data.server.name}. Review and save the changes.`,
        });
      } else {
        throw new Error('Failed to fetch server info');
      }
    } catch (error) {
      console.error("Failed to auto-populate from Discord:", error);
      toast({
        title: "Error",
        description: "Failed to fetch Discord server data. Make sure the bot is in your server.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    const serverId = getServerId();
    if (!serverId) {
      toast({
        title: "Error",
        description: "No Discord server connected. Please connect a server first.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      let bannedWordsJson = null;
      if (settings.bannedWords.trim()) {
        const wordsArray = settings.bannedWords.split(',').map(w => w.trim()).filter(w => w);
        bannedWordsJson = JSON.stringify(wordsArray);
      }
      
      const payload = {
        serverId: serverId,
        botName: settings.botName,
        botPrefix: settings.botPrefix,
        welcomeMessage: settings.welcomeMessage,
        notificationsEnabled: settings.notificationsEnabled,
        adminRoleId: settings.adminRoleId,
        supportRoleId: settings.supportRoleId,
        autoCloseEnabled: settings.autoCloseEnabled,
        autoCloseHours: settings.autoCloseHours,
        debugMode: settings.debugMode,
        autoModEnabled: settings.autoModEnabled,
        bannedWords: bannedWordsJson,
        linkFilterEnabled: settings.linkFilterEnabled,
        spamThreshold: settings.spamThreshold,
        spamTimeWindow: settings.spamTimeWindow,
        autoModAction: settings.autoModAction,
        starboardEnabled: settings.starboardEnabled,
        starboardChannelId: settings.starboardChannelId || null,
        starboardThreshold: settings.starboardThreshold,
        starboardEmoji: settings.starboardEmoji,
        xpEnabled: settings.xpEnabled,
        levelUpChannelId: settings.levelUpChannelId || null,
        levelUpMessage: settings.levelUpMessage,
        xpMinAmount: settings.xpMinAmount,
        xpMaxAmount: settings.xpMaxAmount,
        xpCooldownSeconds: settings.xpCooldownSeconds
      };

      const response = await fetch(`/api/servers/${serverId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast({
          title: "Settings saved",
          description: "Your bot settings have been saved successfully.",
        });
        
        queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/onboarding-status`] });
        
        const refreshResponse = await fetch(`/api/servers/${serverId}/settings`, {
          credentials: 'include'
        });
        
        if (refreshResponse.ok) {
          const savedSettings = await refreshResponse.json();
          
          let bannedWordsStr = "";
          if (savedSettings.bannedWords) {
            try {
              const parsed = JSON.parse(savedSettings.bannedWords);
              bannedWordsStr = Array.isArray(parsed) ? parsed.join(", ") : "";
            } catch {
              bannedWordsStr = savedSettings.bannedWords;
            }
          }
          
          setSettings({
            botName: savedSettings.botName || "Ticket Bot",
            botPrefix: savedSettings.botPrefix || "!",
            discordServerId: savedSettings.serverId || "",
            welcomeMessage: savedSettings.welcomeMessage || "Thank you for creating a ticket. Our support team will assist you shortly.",
            notificationsEnabled: savedSettings.notificationsEnabled ?? true,
            adminRoleId: savedSettings.adminRoleId || "",
            supportRoleId: savedSettings.supportRoleId || "",
            autoCloseEnabled: savedSettings.autoCloseEnabled ?? false,
            autoCloseHours: savedSettings.autoCloseHours?.toString() || "48",
            debugMode: savedSettings.debugMode ?? false,
            autoModEnabled: savedSettings.autoModEnabled ?? false,
            bannedWords: bannedWordsStr,
            linkFilterEnabled: savedSettings.linkFilterEnabled ?? false,
            spamFilterEnabled: savedSettings.spamFilterEnabled ?? false,
            spamThreshold: savedSettings.spamThreshold ?? 5,
            spamTimeWindow: savedSettings.spamTimeWindow ?? 5,
            autoModAction: savedSettings.autoModAction || "warn",
            starboardEnabled: savedSettings.starboardEnabled ?? false,
            starboardChannelId: savedSettings.starboardChannelId || "",
            starboardThreshold: savedSettings.starboardThreshold ?? 3,
            starboardEmoji: savedSettings.starboardEmoji || "⭐",
            xpEnabled: savedSettings.xpEnabled ?? false,
            levelUpChannelId: savedSettings.levelUpChannelId || "",
            levelUpMessage: savedSettings.levelUpMessage || "🎉 Congratulations {user}! You've reached level {level}!",
            xpMinAmount: savedSettings.xpMinAmount ?? 15,
            xpMaxAmount: savedSettings.xpMaxAmount ?? 25,
            xpCooldownSeconds: savedSettings.xpCooldownSeconds ?? 60
          });
        }
      } else {
        let errorMessage = 'Failed to save settings';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshSettings = async () => {
    const serverId = getServerId();
    if (!serverId) return;
    
    try {
      const response = await fetch(`/api/servers/${serverId}/settings`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const botSettings = await response.json();
        
        let bannedWordsStr = "";
        if (botSettings.bannedWords) {
          try {
            const parsed = JSON.parse(botSettings.bannedWords);
            bannedWordsStr = Array.isArray(parsed) ? parsed.join(", ") : "";
          } catch {
            bannedWordsStr = botSettings.bannedWords;
          }
        }
        
        setSettings({
          botName: botSettings.botName || "Ticket Bot",
          botPrefix: botSettings.botPrefix || "!",
          discordServerId: botSettings.serverId || "",
          welcomeMessage: botSettings.welcomeMessage || "Thank you for creating a ticket. Our support team will assist you shortly.",
          notificationsEnabled: botSettings.notificationsEnabled ?? true,
          adminRoleId: botSettings.adminRoleId || "",
          supportRoleId: botSettings.supportRoleId || "",
          autoCloseEnabled: botSettings.autoCloseEnabled ?? false,
          autoCloseHours: botSettings.autoCloseHours?.toString() || "48",
          debugMode: botSettings.debugMode ?? false,
          autoModEnabled: botSettings.autoModEnabled ?? false,
          bannedWords: bannedWordsStr,
          linkFilterEnabled: botSettings.linkFilterEnabled ?? false,
          spamFilterEnabled: botSettings.spamFilterEnabled ?? false,
          spamThreshold: botSettings.spamThreshold ?? 5,
          spamTimeWindow: botSettings.spamTimeWindow ?? 5,
          autoModAction: botSettings.autoModAction || "warn",
          starboardEnabled: botSettings.starboardEnabled ?? false,
          starboardChannelId: botSettings.starboardChannelId || "",
          starboardThreshold: botSettings.starboardThreshold ?? 3,
          starboardEmoji: botSettings.starboardEmoji || "⭐",
          xpEnabled: botSettings.xpEnabled ?? false,
          levelUpChannelId: botSettings.levelUpChannelId || "",
          levelUpMessage: botSettings.levelUpMessage || "🎉 Congratulations {user}! You've reached level {level}!",
          xpMinAmount: botSettings.xpMinAmount ?? 15,
          xpMaxAmount: botSettings.xpMaxAmount ?? 25,
          xpCooldownSeconds: botSettings.xpCooldownSeconds ?? 60
        });
        
        await loadChannels(serverId);
        
        toast({
          title: 'Settings refreshed',
          description: 'Bot settings have been refreshed from the server',
        });
      }
    } catch (error) {
      console.error("Failed to load bot settings:", error);
    }
  };
  
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-[90vw] md:max-w-[800px] lg:max-w-[900px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-2xl">Bot Settings</SheetTitle>
              <SheetDescription>
                Configure your ticket bot settings and Discord integration
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Logged in as: <span className="font-medium">{user?.username}</span>
              </p>
              <Button variant="outline" size="sm" onClick={handleRefreshSettings}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex items-center space-x-3 mb-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isAdmin ? 'bg-yellow-500' : 'bg-blue-500'}`}></div>
            <span className="text-sm text-muted-foreground">
              Role: <span className="font-medium">({isAdmin ? 'Administrator' : 'User'})</span>
            </span>
          </div>
          {!isAdmin && (
            <div className="flex items-center space-x-1 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>Some settings require admin privileges</span>
            </div>
          )}
        </div>
        
        {!isAdmin && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900">Limited Access</h3>
                <p className="text-sm text-blue-800 mt-1">
                  As a regular user, you can view settings but cannot modify system-wide configurations. 
                  Contact an administrator to request changes to Discord integration, ticket automation, or advanced settings.
                </p>
                <div className="mt-2 text-xs text-blue-700">
                  <strong>You can modify:</strong> General display preferences and notifications
                </div>
              </div>
            </div>
          </div>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-7 mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="discord">Discord</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="moderation" className="flex items-center gap-1">
              <Gavel className="h-3 w-3" />
              Moderation
            </TabsTrigger>
            <TabsTrigger value="starboard" className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              Starboard
            </TabsTrigger>
            <TabsTrigger value="leveling" className="flex items-center gap-1">
              <Award className="h-3 w-3" />
              Leveling
            </TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>Configure basic bot settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="botName">Bot Name</Label>
                  <Input 
                    id="botName" 
                    value={settings.botName} 
                    onChange={(e) => handleChange("botName", e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    The name displayed in the dashboard and notifications
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="botPrefix">Command Prefix</Label>
                  <Input 
                    id="botPrefix" 
                    value={settings.botPrefix} 
                    onChange={(e) => handleChange("botPrefix", e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    The prefix used for bot commands (e.g., !ticket)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="welcomeMessage">Welcome Message</Label>
                  <Input 
                    id="welcomeMessage" 
                    value={settings.welcomeMessage} 
                    onChange={(e) => handleChange("welcomeMessage", e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    The message sent when a new ticket is created
                  </p>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="notificationsEnabled" 
                    checked={settings.notificationsEnabled}
                    onCheckedChange={(checked) => handleChange("notificationsEnabled", checked)}
                  />
                  <Label htmlFor="notificationsEnabled">Enable Notifications</Label>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={saveSettings} disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="discord">
            <Card>
              <CardHeader>
                <CardTitle>Discord Integration</CardTitle>
                <CardDescription>Configure Discord server settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="discordServerId">Discord Server ID</Label>
                  <Input 
                    id="discordServerId" 
                    value={settings.discordServerId} 
                    onChange={(e) => handleChange("discordServerId", e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    The ID of your Discord server
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="adminRoleId">Admin Role ID</Label>
                  <Input 
                    id="adminRoleId" 
                    value={settings.adminRoleId} 
                    onChange={(e) => handleChange("adminRoleId", e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    The Discord role ID for administrators
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="supportRoleId">Support Role ID</Label>
                  <Input 
                    id="supportRoleId" 
                    value={settings.supportRoleId} 
                    onChange={(e) => handleChange("supportRoleId", e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    The Discord role ID for support staff
                  </p>
                </div>
                
                <Separator className="my-4" />
                
                <div className="bg-muted p-4 rounded-md">
                  <h3 className="font-medium mb-2">Discord Bot Integration</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Auto-populate settings with data from your Discord server.
                  </p>
                  <Button variant="outline" onClick={autoPopulateFromDiscord} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Auto-populate from Discord'
                    )}
                  </Button>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={saveSettings} disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="tickets">
            <Card>
              <CardHeader>
                <CardTitle>Ticket Settings</CardTitle>
                <CardDescription>Configure ticket behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="autoCloseEnabled" 
                    checked={settings.autoCloseEnabled}
                    onCheckedChange={(checked) => handleChange("autoCloseEnabled", checked)}
                  />
                  <Label htmlFor="autoCloseEnabled">Auto-close Inactive Tickets</Label>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="autoCloseHours">Auto-close After (Hours)</Label>
                  <Input 
                    id="autoCloseHours" 
                    type="number"
                    value={settings.autoCloseHours} 
                    onChange={(e) => handleChange("autoCloseHours", e.target.value)}
                    disabled={!settings.autoCloseEnabled}
                  />
                  <p className="text-sm text-muted-foreground">
                    Close tickets automatically after this many hours of inactivity
                  </p>
                </div>
                
                <Separator className="my-4" />
                
                <div className="bg-muted p-4 rounded-md">
                  <h3 className="font-medium mb-2">Ticket Templates</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create and manage ticket templates for common issue types.
                  </p>
                  <Button variant="outline">Manage Templates</Button>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={saveSettings} disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="moderation">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="h-5 w-5" />
                  Auto Moderation
                </CardTitle>
                <CardDescription>Configure automatic moderation features to keep your server safe</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoModEnabled" className="text-base">Enable Auto Moderation</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically moderate messages based on rules
                    </p>
                  </div>
                  <Switch 
                    id="autoModEnabled" 
                    checked={settings.autoModEnabled}
                    onCheckedChange={(checked) => handleChange("autoModEnabled", checked)}
                  />
                </div>

                {settings.autoModEnabled && (
                  <>
                    <Separator />
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="linkFilterEnabled">Filter Links</Label>
                          <p className="text-sm text-muted-foreground">
                            Block messages containing unauthorized links
                          </p>
                        </div>
                        <Switch 
                          id="linkFilterEnabled" 
                          checked={settings.linkFilterEnabled}
                          onCheckedChange={(checked) => handleChange("linkFilterEnabled", checked)}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="spamFilterEnabled">Anti-Spam Protection</Label>
                          <p className="text-sm text-muted-foreground">
                            Detect and prevent message spam
                          </p>
                        </div>
                        <Switch 
                          id="spamFilterEnabled" 
                          checked={settings.spamFilterEnabled}
                          onCheckedChange={(checked) => handleChange("spamFilterEnabled", checked)}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="spamThreshold">Spam Threshold</Label>
                          <Input 
                            id="spamThreshold" 
                            type="number"
                            min={1}
                            value={settings.spamThreshold} 
                            onChange={(e) => handleChange("spamThreshold", parseInt(e.target.value) || 5)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Number of messages to trigger
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="spamTimeWindow">Time Window (seconds)</Label>
                          <Input 
                            id="spamTimeWindow" 
                            type="number"
                            min={1}
                            value={settings.spamTimeWindow} 
                            onChange={(e) => handleChange("spamTimeWindow", parseInt(e.target.value) || 5)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Within this time period
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="bannedWords">Banned Words</Label>
                        <Textarea 
                          id="bannedWords" 
                          placeholder="word1, word2, phrase three, etc."
                          value={settings.bannedWords} 
                          onChange={(e) => handleChange("bannedWords", e.target.value)}
                          className="min-h-[100px]"
                        />
                        <p className="text-sm text-muted-foreground">
                          Comma-separated list of words or phrases to block
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="autoModAction">Moderation Action</Label>
                        <Select 
                          value={settings.autoModAction} 
                          onValueChange={(value) => handleChange("autoModAction", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select action" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="warn">Warn User</SelectItem>
                            <SelectItem value="delete">Delete Message</SelectItem>
                            <SelectItem value="timeout">Timeout User</SelectItem>
                            <SelectItem value="kick">Kick User</SelectItem>
                            <SelectItem value="ban">Ban User</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          Action to take when a rule is violated
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter>
                <Button onClick={saveSettings} disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="starboard">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5" />
                  Starboard
                </CardTitle>
                <CardDescription>Highlight popular messages by reposting them to a special channel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="starboardEnabled" className="text-base">Enable Starboard</Label>
                    <p className="text-sm text-muted-foreground">
                      Messages with enough reactions will be posted to the starboard channel
                    </p>
                  </div>
                  <Switch 
                    id="starboardEnabled" 
                    checked={settings.starboardEnabled}
                    onCheckedChange={(checked) => handleChange("starboardEnabled", checked)}
                  />
                </div>

                {settings.starboardEnabled && (
                  <>
                    <Separator />
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="starboardChannelId">Starboard Channel</Label>
                        <Select 
                          value={settings.starboardChannelId} 
                          onValueChange={(value) => handleChange("starboardChannelId", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a channel" />
                          </SelectTrigger>
                          <SelectContent>
                            {channels.map((channel) => (
                              <SelectItem key={channel.id} value={channel.id}>
                                #{channel.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          Channel where starred messages will be posted
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="starboardThreshold">Star Threshold</Label>
                          <Input 
                            id="starboardThreshold" 
                            type="number"
                            min={1}
                            value={settings.starboardThreshold} 
                            onChange={(e) => handleChange("starboardThreshold", parseInt(e.target.value) || 3)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Reactions needed to post to starboard
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="starboardEmoji">Starboard Emoji</Label>
                          <Input 
                            id="starboardEmoji" 
                            value={settings.starboardEmoji} 
                            onChange={(e) => handleChange("starboardEmoji", e.target.value)}
                            placeholder="⭐"
                          />
                          <p className="text-xs text-muted-foreground">
                            Emoji to track for starboard
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter>
                <Button onClick={saveSettings} disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="leveling">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  XP & Leveling
                </CardTitle>
                <CardDescription>Reward active members with XP and levels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="xpEnabled" className="text-base">Enable XP & Leveling</Label>
                    <p className="text-sm text-muted-foreground">
                      Members earn XP for chatting and level up over time
                    </p>
                  </div>
                  <Switch 
                    id="xpEnabled" 
                    checked={settings.xpEnabled}
                    onCheckedChange={(checked) => handleChange("xpEnabled", checked)}
                  />
                </div>

                {settings.xpEnabled && (
                  <>
                    <Separator />
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="levelUpChannelId">Level Up Announcement Channel</Label>
                        <Select 
                          value={settings.levelUpChannelId} 
                          onValueChange={(value) => handleChange("levelUpChannelId", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Same channel as message (default)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Same channel as message</SelectItem>
                            {channels.map((channel) => (
                              <SelectItem key={channel.id} value={channel.id}>
                                #{channel.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          Where to announce level-ups (leave empty for same channel)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="levelUpMessage">Level Up Message</Label>
                        <Textarea 
                          id="levelUpMessage" 
                          value={settings.levelUpMessage} 
                          onChange={(e) => handleChange("levelUpMessage", e.target.value)}
                          placeholder="🎉 Congratulations {user}! You've reached level {level}!"
                          className="min-h-[80px]"
                        />
                        <p className="text-sm text-muted-foreground">
                          Use {"{user}"} for username and {"{level}"} for the new level
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="xpMinAmount">Minimum XP per Message</Label>
                          <Input 
                            id="xpMinAmount" 
                            type="number"
                            min={1}
                            value={settings.xpMinAmount} 
                            onChange={(e) => handleChange("xpMinAmount", parseInt(e.target.value) || 15)}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="xpMaxAmount">Maximum XP per Message</Label>
                          <Input 
                            id="xpMaxAmount" 
                            type="number"
                            min={1}
                            value={settings.xpMaxAmount} 
                            onChange={(e) => handleChange("xpMaxAmount", parseInt(e.target.value) || 25)}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        XP awarded randomly between min and max values
                      </p>

                      <div className="space-y-2">
                        <Label htmlFor="xpCooldownSeconds">XP Cooldown (seconds)</Label>
                        <Input 
                          id="xpCooldownSeconds" 
                          type="number"
                          min={0}
                          value={settings.xpCooldownSeconds} 
                          onChange={(e) => handleChange("xpCooldownSeconds", parseInt(e.target.value) || 60)}
                        />
                        <p className="text-sm text-muted-foreground">
                          Minimum time between XP awards (prevents spam)
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter>
                <Button onClick={saveSettings} disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="advanced">
            <Card>
              <CardHeader>
                <CardTitle>Advanced Settings</CardTitle>
                <CardDescription>Configuration for advanced users</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="debugMode" 
                    checked={settings.debugMode}
                    onCheckedChange={(checked) => handleChange("debugMode", checked)}
                  />
                  <Label htmlFor="debugMode">Debug Mode</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enable detailed logging and debug information
                </p>
                
                <Separator className="my-4" />
                
                <div className="bg-muted p-4 rounded-md">
                  <h3 className="font-medium mb-2">Database Management</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Manage application data and perform maintenance tasks.
                  </p>
                  <div className="flex space-x-2">
                    <Button variant="outline">Export Data</Button>
                    <Button variant="destructive" size="sm">Reset App Data</Button>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={saveSettings} disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
