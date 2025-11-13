import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/components/AuthProvider";
import { Shield, Lock, Info, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

interface SlidingSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SlidingSettingsPanel({ isOpen, onClose }: SlidingSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState("general");
  const { toast } = useToast();
  const { user, isAdmin } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);
  
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
    debugMode: false
  });
  
  // Load settings when component mounts or when panel opens
  useEffect(() => {
    if (!isOpen) return;
    
    const loadSettings = async () => {
      if (!user?.connectedServers || user.connectedServers.length === 0) return;
      
      try {
        // Use the first connected server as default
        const firstServerId = user.connectedServers[0];
        const response = await fetch(`/api/bot-settings/${firstServerId}`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const botSettings = await response.json();
          setSettings({
            botName: botSettings.botName || "Ticket Bot",
            botPrefix: botSettings.botPrefix || "!",
            discordServerId: botSettings.serverId || "",
            welcomeMessage: botSettings.welcomeMessage || "Thank you for creating a ticket. Our support team will assist you shortly.",
            notificationsEnabled: botSettings.notificationsEnabled ?? true,
            adminRoleId: botSettings.adminRoleId || "",
            supportRoleId: botSettings.supportRoleId || "",
            autoCloseEnabled: botSettings.autoCloseEnabled ?? false,
            autoCloseHours: botSettings.autoCloseHours || "48",
            debugMode: botSettings.debugMode ?? false
          });
        }
      } catch (error) {
        console.error("Failed to load bot settings:", error);
      }
    };

    loadSettings();
  }, [user, isOpen]);
  
  const handleChange = (field: string, value: any) => {
    setSettings({
      ...settings,
      [field]: value
    });
  };
  
  const autoPopulateFromDiscord = async () => {
    if (!user?.connectedServers || user.connectedServers.length === 0) {
      toast({
        title: "Error",
        description: "No Discord server connected. Please connect a server first.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const serverId = user.connectedServers[0];
      const response = await fetch(`/api/discord/server-info/${serverId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        
        // Find admin and support roles
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
    if (!user?.connectedServers || user.connectedServers.length === 0) {
      toast({
        title: "Error",
        description: "No Discord server connected. Please connect a server first.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const serverId = user.connectedServers[0];
      if (!serverId) {
        throw new Error('No server ID available');
      }
      
      // Use consistent serverId throughout to prevent security issues
      const payload = {
        serverId: serverId,
        botName: settings.botName,
        botPrefix: settings.botPrefix,
        welcomeMessage: settings.welcomeMessage,
        notificationsEnabled: settings.notificationsEnabled,
        adminRoleId: settings.adminRoleId,
        supportRoleId: settings.supportRoleId,
        autoCloseEnabled: settings.autoCloseEnabled,
        autoCloseHours: parseInt(settings.autoCloseHours) || 48,
        debugMode: settings.debugMode
      };

      // Try to update existing settings first
      let response = await fetch(`/api/bot-settings/${serverId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      // If settings don't exist, create them
      if (response.status === 404) {
        response = await fetch('/api/bot-settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      }

      if (response.ok) {
        toast({
          title: "Settings saved",
          description: "Your bot settings have been saved successfully.",
        });
        
        // Perform a fresh GET request to reload settings and verify persistence
        try {
          const refreshResponse = await fetch(`/api/bot-settings/${serverId}`, {
            credentials: 'include'
          });
          
          if (refreshResponse.ok) {
            const savedSettings = await refreshResponse.json();
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
              debugMode: savedSettings.debugMode ?? false
            });
          }
        } catch (refreshError) {
          console.error('Failed to refresh settings after save:', refreshError);
        }
      } else {
        // Parse error details from response
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

  const handleRefreshSettings = () => {
    // Trigger reload of settings by resetting and loading again
    if (user?.connectedServers && user.connectedServers.length > 0) {
      const loadSettings = async () => {
        try {
          const firstServerId = user.connectedServers?.[0];
          const response = await fetch(`/api/bot-settings/${firstServerId}`, {
            credentials: 'include'
          });
          
          if (response.ok) {
            const botSettings = await response.json();
            setSettings({
              botName: botSettings.botName || "Ticket Bot",
              botPrefix: botSettings.botPrefix || "!",
              discordServerId: botSettings.serverId || "",
              welcomeMessage: botSettings.welcomeMessage || "Thank you for creating a ticket. Our support team will assist you shortly.",
              notificationsEnabled: botSettings.notificationsEnabled ?? true,
              adminRoleId: botSettings.adminRoleId || "",
              supportRoleId: botSettings.supportRoleId || "",
              autoCloseEnabled: botSettings.autoCloseEnabled ?? false,
              autoCloseHours: botSettings.autoCloseHours || "48",
              debugMode: botSettings.debugMode ?? false
            });
            
            toast({
              title: 'Settings refreshed',
              description: 'Bot settings have been refreshed from the server',
            });
          }
        } catch (error) {
          console.error("Failed to load bot settings:", error);
        }
      };
      
      loadSettings();
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

        {/* Role Context Information */}
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
        
        {/* Permission Explanation Card */}
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
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="discord">Discord</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          
          {/* General Settings Tab */}
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
          
          {/* Discord Settings Tab */}
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
          
          {/* Tickets Settings Tab */}
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
          
          {/* Advanced Settings Tab */}
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