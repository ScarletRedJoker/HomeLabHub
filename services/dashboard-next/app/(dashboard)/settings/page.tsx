"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { ErrorCard } from "@/components/ui/error-card";
import { getErrorMessage, FriendlyError } from "@/lib/error-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Bell,
  Palette,
  Server,
  Save,
  Loader2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  XCircle,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

interface IntegrationStatus {
  name: string;
  desc: string;
  status: "active" | "configured" | "missing" | "local" | "needs_reconnect" | "unknown";
  statusText: string;
}

interface ServerConfig {
  id: string;
  name: string;
  host: string;
  user: string;
}

interface UserSettings {
  profile: {
    displayName: string;
    email: string;
    timezone: string;
  };
  appearance: {
    darkMode: boolean;
    compactMode: boolean;
    sidebarCollapsed: boolean;
  };
  notifications: {
    deploymentAlerts: boolean;
    serverHealthAlerts: boolean;
    discordNotifications: boolean;
    emailNotifications: boolean;
  };
  servers: ServerConfig[];
}

interface ServerStatus {
  id: string;
  status: "connected" | "disconnected" | "unknown";
}

interface ServerFormData {
  name: string;
  host: string;
  user: string;
}

const emptyServerForm: ServerFormData = { name: "", host: "", user: "" };

function SettingsPageContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus["status"]>>({});
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [error, setError] = useState<FriendlyError | null>(null);
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") || "servers";

  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [serverDialogMode, setServerDialogMode] = useState<"add" | "edit">("add");
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [serverForm, setServerForm] = useState<ServerFormData>(emptyServerForm);
  const [serverFormErrors, setServerFormErrors] = useState<Partial<ServerFormData>>({});
  const [savingServer, setSavingServer] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<ServerConfig | null>(null);
  const [deletingServer, setDeletingServer] = useState(false);

  const fetchIntegrations = useCallback(async () => {
    try {
      const [aiRes, platformRes] = await Promise.all([
        fetch("/api/ai/status").catch(() => null),
        fetch("/api/integrations/platform-status").catch(() => null),
      ]);
      
      const newIntegrations: IntegrationStatus[] = [];
      
      if (aiRes?.ok) {
        const aiData = await aiRes.json();
        newIntegrations.push({
          name: "OpenAI",
          desc: "AI assistance",
          status: aiData.available ? "active" : "missing",
          statusText: aiData.available ? "Active" : "Not Configured",
        });
      } else {
        newIntegrations.push({
          name: "OpenAI",
          desc: "AI assistance",
          status: "missing",
          statusText: "Not Configured",
        });
      }
      
      let discordStatus: IntegrationStatus = {
        name: "Discord",
        desc: "Bot notifications",
        status: "unknown",
        statusText: "Unknown",
      };
      let twitchStatus: IntegrationStatus = {
        name: "Twitch",
        desc: "Stream status",
        status: "unknown",
        statusText: "Unknown",
      };
      let youtubeStatus: IntegrationStatus = {
        name: "YouTube",
        desc: "Video uploads",
        status: "unknown",
        statusText: "Unknown",
      };
      
      if (platformRes?.ok) {
        const platformData = await platformRes.json();
        const platforms = platformData.platforms || [];
        
        for (const p of platforms) {
          const platformName = p.platform?.toLowerCase();
          let integrationStatus: IntegrationStatus["status"] = "missing";
          let statusText = "Not Connected";
          
          if (p.status === "active" || (p.isConnected && !p.needsReauth)) {
            integrationStatus = "active";
            statusText = "Active";
          } else if (p.status === "needs_reconnect" || p.needsReauth) {
            integrationStatus = "needs_reconnect";
            statusText = "Needs Reconnect";
          } else if (p.status === "unknown") {
            integrationStatus = "unknown";
            statusText = "Unknown";
          } else if (!p.isConnected) {
            integrationStatus = "missing";
            statusText = "Not Connected";
          }
          
          if (platformName === "discord") {
            discordStatus = { name: "Discord", desc: "Bot notifications", status: integrationStatus, statusText };
          } else if (platformName === "twitch") {
            twitchStatus = { name: "Twitch", desc: "Stream status", status: integrationStatus, statusText };
          } else if (platformName === "youtube") {
            youtubeStatus = { name: "YouTube", desc: "Video uploads", status: integrationStatus, statusText };
          }
        }
      }
      
      newIntegrations.push(discordStatus, twitchStatus, youtubeStatus);
      
      newIntegrations.push({
        name: "Plex",
        desc: "Media server",
        status: "local",
        statusText: "Local Only",
      });
      
      newIntegrations.push({
        name: "Home Assistant",
        desc: "Smart home",
        status: "local",
        statusText: "Local Only",
      });
      
      setIntegrations(newIntegrations);
    } catch (err) {
      console.error("Failed to fetch integrations:", err);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) {
        const friendlyError = getErrorMessage(null, res);
        setError(friendlyError);
        return;
      }
      const data = await res.json();
      setSettings(data);
      const statuses: Record<string, ServerStatus["status"]> = {};
      data.servers?.forEach((s: any) => {
        statuses[s.id] = "unknown";
      });
      setServerStatuses(statuses);
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      const friendlyError = getErrorMessage(err);
      setError(friendlyError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchIntegrations();
  }, [fetchSettings, fetchIntegrations]);

  const testConnection = async (serverId: string) => {
    setTestingServer(serverId);
    try {
      const res = await fetch("/api/servers");
      if (!res.ok) {
        const friendlyError = getErrorMessage(null, res);
        setServerStatuses((prev) => ({ ...prev, [serverId]: "disconnected" }));
        toast({
          title: friendlyError.title,
          description: friendlyError.message,
          variant: "destructive",
        });
        return;
      }
      const data = await res.json();
      const serverData = data.servers?.find((s: any) => s.id === serverId);
      const newStatus = serverData?.status === "online" ? "connected" : "disconnected";
      setServerStatuses((prev) => ({ ...prev, [serverId]: newStatus }));
      toast({
        title: newStatus === "connected" ? "Connected" : "Connection Failed",
        description: newStatus === "connected"
          ? `Successfully connected to ${serverId}`
          : `Could not connect to ${serverId}. Please check your SSH configuration.`,
        variant: newStatus === "connected" ? "default" : "destructive",
      });
    } catch (err) {
      const friendlyError = getErrorMessage(err);
      setServerStatuses((prev) => ({ ...prev, [serverId]: "disconnected" }));
      toast({ 
        title: friendlyError.title, 
        description: friendlyError.message, 
        variant: "destructive" 
      });
    } finally {
      setTestingServer(null);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const friendlyError = getErrorMessage(null, res);
        toast({ 
          title: friendlyError.title, 
          description: friendlyError.message, 
          variant: "destructive" 
        });
        return;
      }
      toast({ title: "Settings Saved", description: "Your settings have been saved successfully." });
    } catch (err) {
      const friendlyError = getErrorMessage(err);
      toast({ 
        title: friendlyError.title, 
        description: friendlyError.message, 
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  const updateProfile = (field: keyof UserSettings["profile"], value: string) => {
    if (!settings) return;
    setSettings({ ...settings, profile: { ...settings.profile, [field]: value } });
  };

  const updateAppearance = (field: keyof UserSettings["appearance"], value: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, appearance: { ...settings.appearance, [field]: value } });
  };

  const updateNotifications = (field: keyof UserSettings["notifications"], value: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, notifications: { ...settings.notifications, [field]: value } });
  };

  const validateServerForm = (): boolean => {
    const errors: Partial<ServerFormData> = {};
    if (!serverForm.name.trim()) {
      errors.name = "Name is required";
    }
    if (!serverForm.host.trim()) {
      errors.host = "Host is required";
    }
    if (!serverForm.user.trim()) {
      errors.user = "SSH username is required";
    }
    setServerFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openAddServerDialog = () => {
    setServerDialogMode("add");
    setServerForm(emptyServerForm);
    setServerFormErrors({});
    setEditingServerId(null);
    setServerDialogOpen(true);
  };

  const openEditServerDialog = (server: ServerConfig) => {
    setServerDialogMode("edit");
    setServerForm({ name: server.name, host: server.host, user: server.user });
    setServerFormErrors({});
    setEditingServerId(server.id);
    setServerDialogOpen(true);
  };

  const handleServerFormSubmit = async () => {
    if (!validateServerForm() || !settings) return;
    
    setSavingServer(true);
    try {
      let updatedServers: ServerConfig[];
      
      if (serverDialogMode === "add") {
        const newServer: ServerConfig = {
          id: serverForm.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
          name: serverForm.name.trim(),
          host: serverForm.host.trim(),
          user: serverForm.user.trim(),
        };
        
        if (settings.servers.some((s) => s.id === newServer.id)) {
          let counter = 1;
          while (settings.servers.some((s) => s.id === `${newServer.id}-${counter}`)) {
            counter++;
          }
          newServer.id = `${newServer.id}-${counter}`;
        }
        
        updatedServers = [...settings.servers, newServer];
      } else {
        updatedServers = settings.servers.map((s) =>
          s.id === editingServerId
            ? { ...s, name: serverForm.name.trim(), host: serverForm.host.trim(), user: serverForm.user.trim() }
            : s
        );
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, servers: updatedServers }),
      });

      if (!res.ok) {
        const friendlyError = getErrorMessage(null, res);
        toast({
          title: friendlyError.title,
          description: friendlyError.message,
          variant: "destructive",
        });
        return;
      }
      
      const data = await res.json();
      setSettings(data.settings);
      
      if (serverDialogMode === "add") {
        const newServerId = updatedServers[updatedServers.length - 1].id;
        setServerStatuses((prev) => ({ ...prev, [newServerId]: "unknown" }));
      }
      
      setServerDialogOpen(false);
      toast({
        title: serverDialogMode === "add" ? "Server Added" : "Server Updated",
        description: serverDialogMode === "add"
          ? `${serverForm.name} has been added successfully.`
          : `${serverForm.name} has been updated successfully.`,
      });
    } catch (err) {
      const friendlyError = getErrorMessage(err);
      toast({
        title: friendlyError.title,
        description: friendlyError.message,
        variant: "destructive",
      });
    } finally {
      setSavingServer(false);
    }
  };

  const openDeleteDialog = (server: ServerConfig) => {
    setServerToDelete(server);
    setDeleteDialogOpen(true);
  };

  const handleDeleteServer = async () => {
    if (!serverToDelete || !settings) return;
    
    setDeletingServer(true);
    try {
      const updatedServers = settings.servers.filter((s) => s.id !== serverToDelete.id);

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, servers: updatedServers }),
      });

      if (!res.ok) {
        const friendlyError = getErrorMessage(null, res);
        toast({
          title: friendlyError.title,
          description: friendlyError.message,
          variant: "destructive",
        });
        return;
      }
      
      const data = await res.json();
      setSettings(data.settings);
      
      setServerStatuses((prev) => {
        const newStatuses = { ...prev };
        delete newStatuses[serverToDelete.id];
        return newStatuses;
      });
      
      setDeleteDialogOpen(false);
      toast({
        title: "Server Deleted",
        description: `${serverToDelete.name} has been removed from your configuration.`,
      });
    } catch (err) {
      const friendlyError = getErrorMessage(err);
      toast({
        title: friendlyError.title,
        description: friendlyError.message,
        variant: "destructive",
      });
    } finally {
      setDeletingServer(false);
      setServerToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage your homelab configuration and preferences</p>
        </div>
        <ErrorCard
          title={error.title}
          message={error.message}
          onRetry={fetchSettings}
          isRetrying={loading}
          showContactSupport={error.showContactSupport}
        />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage your homelab configuration and preferences</p>
        </div>
        <ErrorCard
          title="Unable to Load Settings"
          message="We couldn't load your settings. Please try again."
          onRetry={fetchSettings}
          isRetrying={loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage your homelab configuration and preferences</p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="servers" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <Server className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden xs:inline">Servers</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden xs:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <Palette className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden xs:inline">Theme</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden xs:inline">Alerts</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servers" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <CardTitle className="text-base sm:text-lg">Server Connections</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Configure SSH connections to your servers</CardDescription>
                </div>
                <Button onClick={openAddServerDialog} className="w-full sm:w-auto h-8 sm:h-10 text-sm">
                  <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Add Server
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 space-y-3 sm:space-y-4">
              {settings.servers.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-muted-foreground">
                  <Server className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                  <p className="text-sm sm:text-base">No servers configured</p>
                  <p className="text-xs sm:text-sm">Click "Add Server" to add your first server</p>
                </div>
              ) : (
                settings.servers.map((server) => (
                  <div key={server.id} className="flex flex-col gap-3 p-3 sm:p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-1.5 sm:p-2 rounded-full shrink-0 ${
                          serverStatuses[server.id] === "connected"
                            ? "bg-green-500/10 text-green-500"
                            : serverStatuses[server.id] === "disconnected"
                            ? "bg-red-500/10 text-red-500"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {serverStatuses[server.id] === "connected" ? (
                          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                        ) : serverStatuses[server.id] === "disconnected" ? (
                          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                        ) : (
                          <Server className="h-4 w-4 sm:h-5 sm:w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm sm:text-base truncate">{server.name}</p>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                          {server.user}@{server.host}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConnection(server.id)}
                        disabled={testingServer === server.id}
                        className="h-8 text-xs sm:text-sm flex-1 sm:flex-none"
                      >
                        {testingServer === server.id ? (
                          <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        )}
                        <span className="ml-1.5 sm:ml-2">Test</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditServerDialog(server)}
                        className="h-8 text-xs sm:text-sm flex-1 sm:flex-none"
                      >
                        <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="ml-1.5 sm:ml-2">Edit</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDeleteDialog(server)}
                        className="text-destructive hover:text-destructive h-8 text-xs sm:text-sm flex-1 sm:flex-none"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="ml-1.5 sm:ml-2">Delete</span>
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <p className="text-xs sm:text-sm text-muted-foreground">
                SSH keys are managed on the server. Ensure your public key is in ~/.ssh/authorized_keys.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">API Integrations</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Status of connected services</CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="grid gap-2 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                {integrations.map((service) => (
                  <div key={service.name} className="flex items-center justify-between p-2.5 sm:p-3 border rounded-lg gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      {service.status === "active" ? (
                        <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 shrink-0" />
                      ) : service.status === "local" ? (
                        <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500 shrink-0" />
                      ) : service.status === "needs_reconnect" ? (
                        <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500 shrink-0" />
                      ) : service.status === "unknown" ? (
                        <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-xs sm:text-sm truncate">{service.name}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{service.desc}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full shrink-0 whitespace-nowrap ${
                        service.status === "active"
                          ? "bg-green-500/10 text-green-500"
                          : service.status === "local"
                          ? "bg-yellow-500/10 text-yellow-500"
                          : service.status === "needs_reconnect"
                          ? "bg-orange-500/10 text-orange-500"
                          : service.status === "unknown"
                          ? "bg-gray-500/10 text-gray-500"
                          : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {service.statusText}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Profile Settings</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Manage your account information</CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-xs sm:text-sm">Display Name</Label>
                  <Input
                    id="displayName"
                    value={settings.profile.displayName}
                    onChange={(e) => updateProfile("displayName", e.target.value)}
                    className="h-8 sm:h-10 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs sm:text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={settings.profile.email}
                    onChange={(e) => updateProfile("email", e.target.value)}
                    className="h-8 sm:h-10 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-xs sm:text-sm">Timezone</Label>
                <Input
                  id="timezone"
                  value={settings.profile.timezone}
                  onChange={(e) => updateProfile("timezone", e.target.value)}
                  placeholder="America/New_York"
                  className="h-8 sm:h-10 text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Appearance</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Customize the dashboard appearance</CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 space-y-4">
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-xs sm:text-sm">Dark Mode</Label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Use dark theme</p>
                </div>
                <Switch
                  checked={settings.appearance.darkMode}
                  onCheckedChange={(checked) => updateAppearance("darkMode", checked)}
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-xs sm:text-sm">Compact Mode</Label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Reduce padding and spacing</p>
                </div>
                <Switch
                  checked={settings.appearance.compactMode}
                  onCheckedChange={(checked) => updateAppearance("compactMode", checked)}
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-xs sm:text-sm">Collapsed Sidebar</Label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Start with sidebar collapsed</p>
                </div>
                <Switch
                  checked={settings.appearance.sidebarCollapsed}
                  onCheckedChange={(checked) => updateAppearance("sidebarCollapsed", checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Notification Settings</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Configure how you receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 space-y-4">
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-xs sm:text-sm">Deployment Alerts</Label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Get notified about deployment status</p>
                </div>
                <Switch
                  checked={settings.notifications.deploymentAlerts}
                  onCheckedChange={(checked) => updateNotifications("deploymentAlerts", checked)}
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-xs sm:text-sm">Server Health Alerts</Label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Get notified when servers go offline</p>
                </div>
                <Switch
                  checked={settings.notifications.serverHealthAlerts}
                  onCheckedChange={(checked) => updateNotifications("serverHealthAlerts", checked)}
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-xs sm:text-sm">Discord Notifications</Label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Send alerts to Discord</p>
                </div>
                <Switch
                  checked={settings.notifications.discordNotifications}
                  onCheckedChange={(checked) => updateNotifications("discordNotifications", checked)}
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label className="text-xs sm:text-sm">Email Notifications</Label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Send alerts via email</p>
                </div>
                <Switch
                  checked={settings.notifications.emailNotifications}
                  onCheckedChange={(checked) => updateNotifications("emailNotifications", checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="h-8 sm:h-10 text-sm">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <Dialog open={serverDialogOpen} onOpenChange={setServerDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{serverDialogMode === "add" ? "Add Server" : "Edit Server"}</DialogTitle>
            <DialogDescription>
              {serverDialogMode === "add"
                ? "Add a new server to your homelab configuration."
                : "Update the server configuration."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="serverName">Server Name</Label>
              <Input
                id="serverName"
                value={serverForm.name}
                onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })}
                placeholder="My Server"
                className={serverFormErrors.name ? "border-destructive" : ""}
              />
              {serverFormErrors.name && (
                <p className="text-xs text-destructive">{serverFormErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="serverHost">Host / IP Address</Label>
              <Input
                id="serverHost"
                value={serverForm.host}
                onChange={(e) => setServerForm({ ...serverForm, host: e.target.value })}
                placeholder="192.168.1.100 or myserver.local"
                className={serverFormErrors.host ? "border-destructive" : ""}
              />
              {serverFormErrors.host && (
                <p className="text-xs text-destructive">{serverFormErrors.host}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="serverUser">SSH Username</Label>
              <Input
                id="serverUser"
                value={serverForm.user}
                onChange={(e) => setServerForm({ ...serverForm, user: e.target.value })}
                placeholder="root"
                className={serverFormErrors.user ? "border-destructive" : ""}
              />
              {serverFormErrors.user && (
                <p className="text-xs text-destructive">{serverFormErrors.user}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServerDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleServerFormSubmit} disabled={savingServer}>
              {savingServer ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {serverDialogMode === "add" ? "Add Server" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Server</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {serverToDelete?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteServer} disabled={deletingServer}>
              {deletingServer ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsPageFallback() {
  return (
    <div className="space-y-6 p-6 pb-16">
      <div className="space-y-0.5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 mt-2" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageFallback />}>
      <SettingsPageContent />
    </Suspense>
  );
}
