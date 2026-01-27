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
  Cpu,
  Link2,
  Zap,
  Eye,
  EyeOff,
} from "lucide-react";

interface IntegrationStatus {
  name: string;
  desc: string;
  status: "active" | "configured" | "missing" | "local" | "needs_reconnect" | "unknown";
  statusText: string;
  testable?: boolean;
  serviceKey?: string;
}

interface ServerConfig {
  id: string;
  name: string;
  host: string;
  user: string;
  description?: string;
  keyPath?: string;
  deployPath?: string;
  isDefault?: boolean;
}

interface AISettings {
  openaiKeyConfigured: boolean;
  openaiKeyMasked: string;
  ollamaUrl: string;
  windowsVmIp: string;
  stableDiffusionUrl: string;
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
  ai?: AISettings;
}

interface ServerStatus {
  id: string;
  status: "connected" | "disconnected" | "unknown";
}

interface ServerFormData {
  name: string;
  host: string;
  user: string;
  keyPath: string;
  deployPath: string;
}

interface TestResult {
  service: string;
  status: "success" | "error" | "not_configured";
  message: string;
  latency?: number;
}

const emptyServerForm: ServerFormData = { name: "", host: "", user: "", keyPath: "", deployPath: "" };

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
  const defaultTab = searchParams.get("tab") || "ai";

  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [serverDialogMode, setServerDialogMode] = useState<"add" | "edit">("add");
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [serverForm, setServerForm] = useState<ServerFormData>(emptyServerForm);
  const [serverFormErrors, setServerFormErrors] = useState<Partial<ServerFormData>>({});
  const [savingServer, setSavingServer] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<ServerConfig | null>(null);
  const [deletingServer, setDeletingServer] = useState(false);

  const [testingService, setTestingService] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [showApiKey, setShowApiKey] = useState(false);

  const [aiSettings, setAiSettings] = useState<AISettings>({
    openaiKeyConfigured: false,
    openaiKeyMasked: "",
    ollamaUrl: "",
    windowsVmIp: "",
    stableDiffusionUrl: "",
  });

  const fetchIntegrations = useCallback(async () => {
    try {
      const [aiRes, platformRes] = await Promise.all([
        fetch("/api/ai/status").catch(() => null),
        fetch("/api/integrations/platform-status").catch(() => null),
      ]);
      
      const newIntegrations: IntegrationStatus[] = [];
      
      if (aiRes?.ok) {
        const aiData = await aiRes.json();
        const openaiProvider = aiData.providers?.text?.find((p: any) => p.name === "OpenAI");
        const ollamaProvider = aiData.providers?.text?.find((p: any) => p.name === "Ollama");
        const dalleProvider = aiData.providers?.image?.find((p: any) => p.name === "DALL-E 3");
        const sdProvider = aiData.providers?.image?.find((p: any) => p.name === "Stable Diffusion");
        
        newIntegrations.push({
          name: "OpenAI",
          desc: "GPT-4o & DALL-E",
          status: openaiProvider?.status === "connected" ? "active" : "missing",
          statusText: openaiProvider?.status === "connected" ? "Active" : "Not Configured",
          testable: true,
          serviceKey: "openai",
        });
        
        newIntegrations.push({
          name: "Ollama",
          desc: "Local LLM",
          status: ollamaProvider?.status === "connected" ? "active" : 
                  ollamaProvider?.status === "error" ? "missing" : "local",
          statusText: ollamaProvider?.status === "connected" ? 
                      `${ollamaProvider?.model || "Active"}` : "Offline",
          testable: true,
          serviceKey: "ollama",
        });
        
        newIntegrations.push({
          name: "Stable Diffusion",
          desc: "Local image gen",
          status: sdProvider?.status === "connected" ? "active" : "local",
          statusText: sdProvider?.status === "connected" ? "Online" : "Offline",
          testable: true,
          serviceKey: "stable_diffusion",
        });
        
        setAiSettings(prev => ({
          ...prev,
          openaiKeyConfigured: openaiProvider?.status === "connected",
          openaiKeyMasked: openaiProvider?.status === "connected" ? "sk-...configured" : "",
        }));
      }
      
      let discordStatus: IntegrationStatus = {
        name: "Discord Bot",
        desc: "Bot notifications",
        status: "unknown",
        statusText: "Unknown",
        testable: true,
        serviceKey: "discord",
      };
      let twitchStatus: IntegrationStatus = {
        name: "Twitch",
        desc: "Stream status",
        status: "unknown",
        statusText: "Unknown",
        testable: true,
        serviceKey: "twitch",
      };
      let youtubeStatus: IntegrationStatus = {
        name: "YouTube",
        desc: "Video uploads",
        status: "unknown",
        statusText: "Unknown",
        testable: true,
        serviceKey: "youtube",
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
            discordStatus = { ...discordStatus, status: integrationStatus, statusText };
          } else if (platformName === "twitch") {
            twitchStatus = { ...twitchStatus, status: integrationStatus, statusText };
          } else if (platformName === "youtube") {
            youtubeStatus = { ...youtubeStatus, status: integrationStatus, statusText };
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
      
      if (data.ai) {
        setAiSettings(prev => ({ ...prev, ...data.ai }));
      }
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

  const testService = async (serviceKey: string, options?: Record<string, any>) => {
    setTestingService(serviceKey);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceKey, options }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        setTestResults(prev => ({
          ...prev,
          [serviceKey]: { 
            service: serviceKey, 
            status: "error", 
            message: error.error || "Test failed" 
          }
        }));
        toast({
          title: "Test Failed",
          description: error.error || "Connection test failed",
          variant: "destructive",
        });
        return;
      }
      
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [serviceKey]: data.result }));
      
      toast({
        title: data.result.status === "success" ? "Test Successful" : "Test Failed",
        description: data.result.message,
        variant: data.result.status === "success" ? "default" : "destructive",
      });
    } catch (err) {
      const friendlyError = getErrorMessage(err);
      setTestResults(prev => ({
        ...prev,
        [serviceKey]: { service: serviceKey, status: "error", message: friendlyError.message }
      }));
      toast({ 
        title: friendlyError.title, 
        description: friendlyError.message, 
        variant: "destructive" 
      });
    } finally {
      setTestingService(null);
    }
  };

  const testConnection = async (serverId: string) => {
    setTestingServer(serverId);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "ssh", options: { serverId } }),
      });
      
      if (!res.ok) {
        setServerStatuses((prev) => ({ ...prev, [serverId]: "disconnected" }));
        toast({
          title: "Connection Failed",
          description: "Could not connect to server",
          variant: "destructive",
        });
        return;
      }
      
      const data = await res.json();
      const newStatus = data.result?.status === "success" ? "connected" : "disconnected";
      setServerStatuses((prev) => ({ ...prev, [serverId]: newStatus }));
      
      toast({
        title: newStatus === "connected" ? "Connected" : "Connection Failed",
        description: data.result?.message || (newStatus === "connected"
          ? `Successfully connected to ${serverId}`
          : `Could not connect to ${serverId}. Please check your SSH configuration.`),
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
        body: JSON.stringify({ ...settings, ai: aiSettings }),
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
    setServerForm({ 
      name: server.name, 
      host: server.host, 
      user: server.user,
      keyPath: server.keyPath || "",
      deployPath: server.deployPath || "",
    });
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
          keyPath: serverForm.keyPath.trim() || undefined,
          deployPath: serverForm.deployPath.trim() || undefined,
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
            ? { 
                ...s, 
                name: serverForm.name.trim(), 
                host: serverForm.host.trim(), 
                user: serverForm.user.trim(),
                keyPath: serverForm.keyPath.trim() || undefined,
                deployPath: serverForm.deployPath.trim() || undefined,
              }
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

  const getStatusIcon = (status: IntegrationStatus["status"]) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "local":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "needs_reconnect":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case "unknown":
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusColor = (status: IntegrationStatus["status"]) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500";
      case "local":
        return "bg-yellow-500/10 text-yellow-500";
      case "needs_reconnect":
        return "bg-orange-500/10 text-orange-500";
      case "unknown":
        return "bg-gray-500/10 text-gray-500";
      default:
        return "bg-red-500/10 text-red-500";
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
          <TabsTrigger value="ai" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <Cpu className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden xs:inline">AI</span>
          </TabsTrigger>
          <TabsTrigger value="servers" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <Server className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden xs:inline">Servers</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <Link2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden xs:inline">Integrations</span>
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

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Zap className="h-5 w-5" />
                AI Configuration
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Configure AI providers and local inference endpoints
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {aiSettings.openaiKeyConfigured ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium text-sm">OpenAI API Key</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground font-mono">
                          {showApiKey && aiSettings.openaiKeyMasked 
                            ? aiSettings.openaiKeyMasked 
                            : aiSettings.openaiKeyConfigured 
                              ? "••••••••••••••••" 
                              : "Not configured"}
                        </p>
                        {aiSettings.openaiKeyConfigured && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => setShowApiKey(!showApiKey)}
                          >
                            {showApiKey ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testService("openai")}
                    disabled={testingService === "openai"}
                  >
                    {testingService === "openai" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="ml-2">Test</span>
                  </Button>
                </div>
                {testResults["openai"] && (
                  <div className={`p-3 rounded-lg text-sm ${
                    testResults["openai"].status === "success" 
                      ? "bg-green-500/10 text-green-700 dark:text-green-400" 
                      : "bg-red-500/10 text-red-700 dark:text-red-400"
                  }`}>
                    {testResults["openai"].message}
                    {testResults["openai"].latency && (
                      <span className="ml-2 text-xs opacity-75">
                        ({testResults["openai"].latency}ms)
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="windowsVmIp" className="text-sm font-medium">Windows VM IP (Tailscale)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="windowsVmIp"
                      value={aiSettings.windowsVmIp}
                      onChange={(e) => setAiSettings({ ...aiSettings, windowsVmIp: e.target.value })}
                      placeholder="e.g. 100.x.x.x"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    IP address of Windows VM running Ollama, Stable Diffusion, etc.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ollamaUrl" className="text-sm font-medium">Ollama URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="ollamaUrl"
                      value={aiSettings.ollamaUrl}
                      onChange={(e) => setAiSettings({ ...aiSettings, ollamaUrl: e.target.value })}
                      placeholder="e.g. http://100.x.x.x:11434"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testService("ollama", { url: aiSettings.ollamaUrl })}
                      disabled={testingService === "ollama"}
                    >
                      {testingService === "ollama" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-2">Test</span>
                    </Button>
                  </div>
                </div>
                {testResults["ollama"] && (
                  <div className={`p-3 rounded-lg text-sm ${
                    testResults["ollama"].status === "success" 
                      ? "bg-green-500/10 text-green-700 dark:text-green-400" 
                      : "bg-red-500/10 text-red-700 dark:text-red-400"
                  }`}>
                    {testResults["ollama"].message}
                    {testResults["ollama"].latency && (
                      <span className="ml-2 text-xs opacity-75">
                        ({testResults["ollama"].latency}ms)
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="sdUrl" className="text-sm font-medium">Stable Diffusion URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="sdUrl"
                      value={aiSettings.stableDiffusionUrl}
                      onChange={(e) => setAiSettings({ ...aiSettings, stableDiffusionUrl: e.target.value })}
                      placeholder="e.g. http://100.x.x.x:7860"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testService("stable_diffusion", { url: aiSettings.stableDiffusionUrl })}
                      disabled={testingService === "stable_diffusion"}
                    >
                      {testingService === "stable_diffusion" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-2">Test</span>
                    </Button>
                  </div>
                </div>
                {testResults["stable_diffusion"] && (
                  <div className={`p-3 rounded-lg text-sm ${
                    testResults["stable_diffusion"].status === "success" 
                      ? "bg-green-500/10 text-green-700 dark:text-green-400" 
                      : "bg-red-500/10 text-red-700 dark:text-red-400"
                  }`}>
                    {testResults["stable_diffusion"].message}
                    {testResults["stable_diffusion"].latency && (
                      <span className="ml-2 text-xs opacity-75">
                        ({testResults["stable_diffusion"].latency}ms)
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 text-xs text-muted-foreground">
                <p>Note: OpenAI API key is managed via environment variables (OPENAI_API_KEY).</p>
                <p>Local AI endpoints require Tailscale connection to your homelab.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base sm:text-lg">Platform Integrations</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Status of connected services and APIs</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchIntegrations}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="space-y-3">
                {integrations.map((service) => (
                  <div key={service.name} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {getStatusIcon(service.status)}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{service.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{service.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${getStatusColor(service.status)}`}>
                        {service.statusText}
                      </span>
                      {service.testable && service.serviceKey && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => testService(service.serviceKey!)}
                          disabled={testingService === service.serviceKey}
                          className="h-8 px-2"
                        >
                          {testingService === service.serviceKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
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
            <div className="space-y-2">
              <Label htmlFor="serverKeyPath">SSH Key Path (optional)</Label>
              <Input
                id="serverKeyPath"
                value={serverForm.keyPath}
                onChange={(e) => setServerForm({ ...serverForm, keyPath: e.target.value })}
                placeholder="~/.ssh/homelab"
              />
              <p className="text-xs text-muted-foreground">Leave empty to use default key</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serverDeployPath">Deploy Path (optional)</Label>
              <Input
                id="serverDeployPath"
                value={serverForm.deployPath}
                onChange={(e) => setServerForm({ ...serverForm, deployPath: e.target.value })}
                placeholder="/opt/homelab/deploy"
              />
              <p className="text-xs text-muted-foreground">Path to deploy script on this server</p>
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
