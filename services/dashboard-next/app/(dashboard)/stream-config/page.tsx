"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bot,
  Wifi,
  WifiOff,
  RefreshCw,
  Save,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Copy,
  Check,
  Zap,
  Settings,
  Timer,
  Brain,
  MessageSquare,
  Gamepad2,
  Music,
  Video,
  Users,
  Sparkles,
  ExternalLink,
  Play,
  Pause,
} from "lucide-react";
import { toast } from "sonner";

interface BotSettings {
  id?: string;
  userId?: string;
  intervalMode: "manual" | "fixed" | "random";
  fixedIntervalMinutes?: number;
  randomMinMinutes?: number;
  randomMaxMinutes?: number;
  aiModel: string;
  aiTemperature?: number;
  customPrompt?: string;
  aiPromptTemplate?: string;
  channelTheme?: string;
  enableChatTriggers: boolean;
  chatKeywords: string[];
  activePlatforms: string[];
  isActive: boolean;
  autoShoutoutOnRaid?: boolean;
  autoShoutoutOnHost?: boolean;
  shoutoutMessageTemplate?: string;
}

interface PlatformConnection {
  id: string;
  platform: string;
  platformUsername?: string;
  isConnected: boolean;
  needsRefresh?: boolean;
  lastConnectedAt?: string;
}

interface ChatbotSettings {
  isEnabled: boolean;
  personality: string;
  customPersonalityPrompt?: string;
  temperature?: number;
  responseRate?: number;
  contextWindow?: number;
}

interface OverlayToken {
  token: string;
  expiresIn: number;
  overlayUrl: string;
}

const STREAM_PRESETS = {
  gaming: {
    name: "Gaming",
    icon: Gamepad2,
    channelTheme: "gaming and video games",
    aiModel: "gpt-4o",
    aiTemperature: 8,
    intervalMode: "random" as const,
    randomMinMinutes: 10,
    randomMaxMinutes: 20,
    chatKeywords: ["!snapple", "!fact", "!funfact"],
  },
  justChatting: {
    name: "Just Chatting",
    icon: MessageSquare,
    channelTheme: "casual conversation and entertainment",
    aiModel: "gpt-4o",
    aiTemperature: 9,
    intervalMode: "random" as const,
    randomMinMinutes: 8,
    randomMaxMinutes: 15,
    chatKeywords: ["!snapple", "!fact", "!trivia"],
  },
  music: {
    name: "Music",
    icon: Music,
    channelTheme: "music, songs, and musical performance",
    aiModel: "gpt-4o",
    aiTemperature: 7,
    intervalMode: "fixed" as const,
    fixedIntervalMinutes: 15,
    chatKeywords: ["!snapple", "!musicfact", "!fact"],
  },
  irl: {
    name: "IRL",
    icon: Video,
    channelTheme: "real life adventures and outdoor activities",
    aiModel: "gpt-4o",
    aiTemperature: 8,
    intervalMode: "manual" as const,
    chatKeywords: ["!snapple", "!fact"],
  },
};

const AI_MODELS = [
  { value: "gpt-4o", label: "GPT-4o (Recommended)" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini (Faster)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Economy)" },
];

const CHATBOT_PERSONALITIES = [
  { value: "friendly", label: "Friendly" },
  { value: "snarky", label: "Snarky" },
  { value: "professional", label: "Professional" },
  { value: "enthusiastic", label: "Enthusiastic" },
  { value: "chill", label: "Chill" },
  { value: "custom", label: "Custom" },
];

export default function StreamConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [platforms, setPlatforms] = useState<PlatformConnection[]>([]);
  const [chatbotSettings, setChatbotSettings] = useState<ChatbotSettings | null>(null);
  const [overlayTokens, setOverlayTokens] = useState<Record<string, OverlayToken>>({});
  const [generatingToken, setGeneratingToken] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, platformsRes, chatbotRes] = await Promise.all([
        fetch("/api/stream-config?endpoint=/api/settings"),
        fetch("/api/stream-config?endpoint=/api/platforms"),
        fetch("/api/stream-config?endpoint=/api/chatbot/settings"),
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings(data);
      }

      if (platformsRes.ok) {
        const data = await platformsRes.json();
        setPlatforms(Array.isArray(data) ? data : []);
      }

      if (chatbotRes.ok) {
        const data = await chatbotRes.json();
        setChatbotSettings(data);
      }
    } catch (error) {
      console.error("Failed to fetch stream config:", error);
      toast.error("Failed to load stream bot configuration");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const saveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const res = await fetch("/api/stream-config?endpoint=/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save settings");
      }

      toast.success("Settings saved successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const saveChatbotSettings = async () => {
    if (!chatbotSettings) return;

    setSaving(true);
    try {
      const res = await fetch("/api/stream-config?endpoint=/api/chatbot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatbotSettings),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save chatbot settings");
      }

      toast.success("Chatbot settings saved successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to save chatbot settings");
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (presetKey: keyof typeof STREAM_PRESETS) => {
    const preset = STREAM_PRESETS[presetKey];
    setSettings((prev) => ({
      ...prev!,
      channelTheme: preset.channelTheme,
      aiModel: preset.aiModel,
      aiTemperature: preset.aiTemperature,
      intervalMode: preset.intervalMode,
      fixedIntervalMinutes: preset.fixedIntervalMinutes,
      randomMinMinutes: preset.randomMinMinutes,
      randomMaxMinutes: preset.randomMaxMinutes,
      chatKeywords: preset.chatKeywords,
    }));
    setPresetDialogOpen(false);
    toast.success(`Applied ${preset.name} preset`);
  };

  const generateOverlayToken = async (platform: string) => {
    setGeneratingToken(platform);
    try {
      const res = await fetch("/api/stream-config?endpoint=/api/overlay/generate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, expiresIn: 86400 * 7 }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate token");
      }

      const data = await res.json();
      setOverlayTokens((prev) => ({ ...prev, [platform]: data }));
      toast.success(`Generated ${platform} overlay URL`);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate overlay URL");
    } finally {
      setGeneratingToken(null);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedUrl(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const togglePlatform = (platform: string) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const activePlatforms = prev.activePlatforms || [];
      if (activePlatforms.includes(platform)) {
        return { ...prev, activePlatforms: activePlatforms.filter((p) => p !== platform) };
      } else {
        return { ...prev, activePlatforms: [...activePlatforms, platform] };
      }
    });
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "twitch":
        return "🟣";
      case "youtube":
        return "🔴";
      case "kick":
        return "🟢";
      case "spotify":
        return "🟢";
      default:
        return "⚪";
    }
  };

  const getPlatformStatus = (platform: PlatformConnection) => {
    if (platform.needsRefresh) {
      return (
        <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Needs Reconnect
        </Badge>
      );
    }
    if (platform.isConnected) {
      return (
        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
          <Wifi className="h-3 w-3 mr-1" />
          Connected
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <WifiOff className="h-3 w-3 mr-1" />
        Disconnected
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading stream bot configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
            <Bot className="h-8 w-8 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Stream Bot Configuration
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure your streaming bot settings and integrations
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={saveSettings} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {settings?.isActive ? (
                <>
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-lg font-bold text-green-500">Active</span>
                </>
              ) : (
                <>
                  <div className="h-2 w-2 rounded-full bg-gray-500" />
                  <span className="text-lg font-bold text-muted-foreground">Inactive</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Connected Platforms</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {platforms.filter((p) => p.isConnected).length}/{platforms.length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Posting Mode</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold capitalize">{settings?.intervalMode || "Manual"}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">AI Model</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{settings?.aiModel || "gpt-4o"}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="platforms" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="posting">Posting</TabsTrigger>
          <TabsTrigger value="ai">AI Settings</TabsTrigger>
          <TabsTrigger value="chatbot">Chatbot</TabsTrigger>
          <TabsTrigger value="overlays">OBS Overlays</TabsTrigger>
        </TabsList>

        <TabsContent value="platforms" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Connected Platforms</CardTitle>
                  <CardDescription>
                    Manage your streaming platform connections and activate them for the bot
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPresetDialogOpen(true)}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Apply Preset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {platforms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No platforms connected yet.</p>
                  <p className="text-sm mt-2">
                    Connect platforms from the Stream Bot dashboard to get started.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {platforms.map((platform) => (
                    <Card key={platform.id} className="overflow-hidden">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{getPlatformIcon(platform.platform)}</span>
                            <CardTitle className="text-lg capitalize">{platform.platform}</CardTitle>
                          </div>
                          {getPlatformStatus(platform)}
                        </div>
                        {platform.platformUsername && (
                          <CardDescription>@{platform.platformUsername}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Active for bot</span>
                          <Switch
                            checked={settings?.activePlatforms?.includes(platform.platform) || false}
                            onCheckedChange={() => togglePlatform(platform.platform)}
                            disabled={!platform.isConnected}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Posting Intervals
              </CardTitle>
              <CardDescription>
                Configure how often the bot posts content to your streams
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label>Posting Mode</Label>
                <Select
                  value={settings?.intervalMode || "manual"}
                  onValueChange={(value: "manual" | "fixed" | "random") =>
                    setSettings((prev) => ({ ...prev!, intervalMode: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual (Trigger only)</SelectItem>
                    <SelectItem value="fixed">Fixed Interval</SelectItem>
                    <SelectItem value="random">Random Interval</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settings?.intervalMode === "fixed" && (
                <div className="space-y-4">
                  <Label>Fixed Interval (minutes)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[settings?.fixedIntervalMinutes || 15]}
                      onValueChange={([value]) =>
                        setSettings((prev) => ({ ...prev!, fixedIntervalMinutes: value }))
                      }
                      min={5}
                      max={60}
                      step={5}
                      className="flex-1"
                    />
                    <span className="w-16 text-center font-mono">
                      {settings?.fixedIntervalMinutes || 15} min
                    </span>
                  </div>
                </div>
              )}

              {settings?.intervalMode === "random" && (
                <div className="space-y-4">
                  <Label>Random Interval Range (minutes)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Minimum</Label>
                      <Input
                        type="number"
                        value={settings?.randomMinMinutes || 5}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev!,
                            randomMinMinutes: parseInt(e.target.value) || 5,
                          }))
                        }
                        min={1}
                        max={60}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Maximum</Label>
                      <Input
                        type="number"
                        value={settings?.randomMaxMinutes || 20}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev!,
                            randomMaxMinutes: parseInt(e.target.value) || 20,
                          }))
                        }
                        min={1}
                        max={120}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Chat Triggers</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow viewers to trigger facts via chat commands
                    </p>
                  </div>
                  <Switch
                    checked={settings?.enableChatTriggers || false}
                    onCheckedChange={(checked) =>
                      setSettings((prev) => ({ ...prev!, enableChatTriggers: checked }))
                    }
                  />
                </div>

                {settings?.enableChatTriggers && (
                  <div className="space-y-2">
                    <Label>Trigger Keywords (comma-separated)</Label>
                    <Input
                      value={settings?.chatKeywords?.join(", ") || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev!,
                          chatKeywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                        }))
                      }
                      placeholder="!snapple, !fact, !funfact"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div>
                  <Label>Bot Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable or disable the bot globally
                  </p>
                </div>
                <Switch
                  checked={settings?.isActive || false}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev!, isActive: checked }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Configuration
              </CardTitle>
              <CardDescription>
                Configure the AI model and generation settings for content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label>AI Model</Label>
                <Select
                  value={settings?.aiModel || "gpt-4o"}
                  onValueChange={(value) => setSettings((prev) => ({ ...prev!, aiModel: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <Label>Temperature ({((settings?.aiTemperature || 9) / 10).toFixed(1)})</Label>
                <p className="text-sm text-muted-foreground">
                  Lower = more focused, Higher = more creative
                </p>
                <Slider
                  value={[settings?.aiTemperature || 9]}
                  onValueChange={([value]) =>
                    setSettings((prev) => ({ ...prev!, aiTemperature: value }))
                  }
                  min={0}
                  max={20}
                  step={1}
                />
              </div>

              <div className="space-y-4">
                <Label>Channel Theme</Label>
                <p className="text-sm text-muted-foreground">
                  Describe your channel&apos;s theme for personalized content
                </p>
                <Input
                  value={settings?.channelTheme || ""}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev!, channelTheme: e.target.value }))
                  }
                  placeholder="e.g., gaming and speedruns, cooking and recipes, tech reviews"
                />
              </div>

              <div className="space-y-4">
                <Label>Custom Prompt (Optional)</Label>
                <p className="text-sm text-muted-foreground">
                  Override the default prompt template
                </p>
                <Textarea
                  value={settings?.customPrompt || ""}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev!, customPrompt: e.target.value }))
                  }
                  placeholder="Generate an interesting fact about..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chatbot" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                AI Chatbot Settings
              </CardTitle>
              <CardDescription>
                Configure the AI-powered chatbot that responds to viewers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Chatbot</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow the bot to respond to viewer messages
                  </p>
                </div>
                <Switch
                  checked={chatbotSettings?.isEnabled || false}
                  onCheckedChange={(checked) =>
                    setChatbotSettings((prev) => ({ ...prev!, isEnabled: checked }))
                  }
                />
              </div>

              {chatbotSettings?.isEnabled && (
                <>
                  <div className="space-y-4">
                    <Label>Personality</Label>
                    <Select
                      value={chatbotSettings?.personality || "friendly"}
                      onValueChange={(value) =>
                        setChatbotSettings((prev) => ({ ...prev!, personality: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHATBOT_PERSONALITIES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {chatbotSettings?.personality === "custom" && (
                    <div className="space-y-4">
                      <Label>Custom Personality Prompt</Label>
                      <Textarea
                        value={chatbotSettings?.customPersonalityPrompt || ""}
                        onChange={(e) =>
                          setChatbotSettings((prev) => ({
                            ...prev!,
                            customPersonalityPrompt: e.target.value,
                          }))
                        }
                        placeholder="Describe how the chatbot should behave..."
                        rows={3}
                      />
                    </div>
                  )}

                  <div className="space-y-4">
                    <Label>Response Rate (seconds)</Label>
                    <p className="text-sm text-muted-foreground">
                      Minimum time between chatbot responses
                    </p>
                    <Slider
                      value={[chatbotSettings?.responseRate || 30]}
                      onValueChange={([value]) =>
                        setChatbotSettings((prev) => ({ ...prev!, responseRate: value }))
                      }
                      min={10}
                      max={300}
                      step={10}
                    />
                    <span className="text-sm text-muted-foreground">
                      {chatbotSettings?.responseRate || 30} seconds
                    </span>
                  </div>

                  <div className="space-y-4">
                    <Label>Context Window (messages)</Label>
                    <p className="text-sm text-muted-foreground">
                      How many recent messages to include for context
                    </p>
                    <Slider
                      value={[chatbotSettings?.contextWindow || 10]}
                      onValueChange={([value]) =>
                        setChatbotSettings((prev) => ({ ...prev!, contextWindow: value }))
                      }
                      min={1}
                      max={50}
                      step={1}
                    />
                    <span className="text-sm text-muted-foreground">
                      {chatbotSettings?.contextWindow || 10} messages
                    </span>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={saveChatbotSettings} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Chatbot Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="overlays" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5" />
                OBS Overlay URLs
              </CardTitle>
              <CardDescription>
                Generate browser source URLs for OBS Studio overlays
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {["spotify", "youtube", "alerts", "chat"].map((platform) => (
                <div key={platform} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{getPlatformIcon(platform)}</span>
                    <div>
                      <p className="font-medium capitalize">{platform} Overlay</p>
                      <p className="text-sm text-muted-foreground">
                        {platform === "spotify" && "Now playing music widget"}
                        {platform === "youtube" && "Live stream info widget"}
                        {platform === "alerts" && "Stream alerts and notifications"}
                        {platform === "chat" && "Chat messages overlay"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {overlayTokens[platform] ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const baseUrl = window.location.origin.replace(":5000", ":3000");
                          const fullUrl = `${baseUrl}${overlayTokens[platform].overlayUrl}`;
                          copyToClipboard(fullUrl, `${platform} overlay URL`);
                        }}
                      >
                        {copiedUrl === `${platform} overlay URL` ? (
                          <Check className="h-4 w-4 mr-1" />
                        ) : (
                          <Copy className="h-4 w-4 mr-1" />
                        )}
                        Copy URL
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateOverlayToken(platform)}
                        disabled={generatingToken === platform}
                      >
                        {generatingToken === platform ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4 mr-1" />
                        )}
                        Generate URL
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <h4 className="font-medium text-blue-400 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  How to use in OBS
                </h4>
                <ol className="text-sm text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                  <li>Generate an overlay URL above</li>
                  <li>In OBS, add a new Browser Source</li>
                  <li>Paste the copied URL</li>
                  <li>Set width to 400-500px and height to 100-200px</li>
                  <li>Enable &quot;Shutdown source when not visible&quot;</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Stream Preset</DialogTitle>
            <DialogDescription>
              Choose a preset configuration optimized for your stream type
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {Object.entries(STREAM_PRESETS).map(([key, preset]) => {
              const Icon = preset.icon;
              return (
                <Button
                  key={key}
                  variant="outline"
                  className="h-auto flex-col py-4 gap-2"
                  onClick={() => applyPreset(key as keyof typeof STREAM_PRESETS)}
                >
                  <Icon className="h-8 w-8" />
                  <span>{preset.name}</span>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
