import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Bell, Sparkles, Users, Target, TestTube, History, Monitor, Play, Volume2, Image, Type, Copy, ExternalLink, RefreshCw, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { z } from "zod";
import { AlertPreview } from "@/components/AlertPreview";

const alertSettingsSchema = z.object({
  enableFollowerAlerts: z.boolean(),
  enableSubAlerts: z.boolean(),
  enableRaidAlerts: z.boolean(),
  enableMilestoneAlerts: z.boolean(),
  followerTemplate: z.string().min(1, "Template is required"),
  subTemplate: z.string().min(1, "Template is required"),
  raidTemplate: z.string().min(1, "Template is required"),
  milestoneThresholds: z.array(z.number()),
});

type AlertSettingsFormValues = z.infer<typeof alertSettingsSchema>;

interface AlertHistory {
  id: string;
  alertType: string;
  username?: string;
  message: string;
  platform: string;
  timestamp: string;
  metadata?: any;
}

interface StreamAlert {
  id: number;
  visitorId: number;
  alertType: string;
  enabled: boolean;
  soundUrl: string | null;
  imageUrl: string | null;
  duration: number;
  animation: string;
  textTemplate: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  ttsEnabled: boolean;
  ttsVoice: string;
  minAmount: number;
  volume: number;
  createdAt: string;
}

const ALERT_TYPES = [
  { value: "follow", label: "Follow", icon: "👋", description: "New follower alerts" },
  { value: "sub", label: "Subscription", icon: "⭐", description: "New and resub alerts" },
  { value: "donation", label: "Donation", icon: "💰", description: "Donation alerts" },
  { value: "raid", label: "Raid", icon: "🚀", description: "Incoming raid alerts" },
  { value: "bits", label: "Bits", icon: "💎", description: "Cheer/bits alerts" },
  { value: "host", label: "Host", icon: "📺", description: "Host alerts" },
];

const ANIMATIONS = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "bounce", label: "Bounce" },
  { value: "zoom", label: "Zoom" },
  { value: "flip", label: "Flip" },
  { value: "shake", label: "Shake" },
];

export default function Alerts() {
  const { toast } = useToast();
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [newThreshold, setNewThreshold] = useState<string>("");
  const [selectedAlertType, setSelectedAlertType] = useState<string>("follow");
  const [overlayUrl, setOverlayUrl] = useState<string>("");
  const [editingAlert, setEditingAlert] = useState<StreamAlert | null>(null);

  const { data: settings, isLoading } = useQuery<AlertSettingsFormValues | null>({
    queryKey: ["/api/alerts/settings"],
  });

  const { data: history = [] } = useQuery<AlertHistory[]>({
    queryKey: ["/api/alerts/history", historyFilter],
    queryFn: async () => {
      const filterParam = historyFilter !== "all" ? `?type=${historyFilter}` : "";
      const res = await apiRequest("GET", `/api/alerts/history${filterParam}`);
      return await res.json();
    },
  });

  const { data: streamAlerts = [], isLoading: streamAlertsLoading } = useQuery<StreamAlert[]>({
    queryKey: ["/api/stream-alerts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stream-alerts");
      return await res.json();
    },
  });

  const currentStreamAlert = streamAlerts.find(a => a.alertType === selectedAlertType);

  const form = useForm<AlertSettingsFormValues>({
    resolver: zodResolver(alertSettingsSchema),
    defaultValues: {
      enableFollowerAlerts: true,
      enableSubAlerts: true,
      enableRaidAlerts: true,
      enableMilestoneAlerts: true,
      followerTemplate: "Welcome {username}! Thanks for the follow! 🎉",
      subTemplate: "Thank you {username} for subscribing! {tier} for {months} months! 💜",
      raidTemplate: "Thank you {raider} for the raid with {viewers} viewers! 🚀",
      milestoneThresholds: [50, 100, 500, 1000, 5000, 10000],
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        enableFollowerAlerts: settings.enableFollowerAlerts,
        enableSubAlerts: settings.enableSubAlerts,
        enableRaidAlerts: settings.enableRaidAlerts,
        enableMilestoneAlerts: settings.enableMilestoneAlerts,
        followerTemplate: settings.followerTemplate,
        subTemplate: settings.subTemplate,
        raidTemplate: settings.raidTemplate,
        milestoneThresholds: settings.milestoneThresholds || [50, 100, 500, 1000, 5000, 10000],
      });
    }
  }, [settings, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: AlertSettingsFormValues) => {
      return await apiRequest("PATCH", "/api/alerts/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/settings"] });
      toast({
        title: "Settings saved",
        description: "Your alert settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const testAlertMutation = useMutation({
    mutationFn: async (alertType: string) => {
      return await apiRequest("POST", "/api/alerts/test", { alertType });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/history"] });
      toast({
        title: "Test alert sent",
        description: data.message || "Test alert has been triggered successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send test alert. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateStreamAlertMutation = useMutation({
    mutationFn: async (data: Partial<StreamAlert> & { alertType: string }) => {
      return await apiRequest("PUT", `/api/stream-alerts/${data.alertType}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stream-alerts"] });
      toast({ title: "Alert updated", description: "Stream alert configuration saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save alert settings.", variant: "destructive" });
    },
  });

  const testStreamAlertMutation = useMutation({
    mutationFn: async (alertType: string) => {
      return await apiRequest("POST", "/api/stream-alerts/test", { alertType });
    },
    onSuccess: () => {
      toast({ title: "Test alert sent", description: "Check your overlay to see the alert." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send test alert.", variant: "destructive" });
    },
  });

  const generateOverlayUrlMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/overlay/generate-token", { platform: "alerts", expiresIn: 30 * 24 * 60 * 60 });
      return await res.json();
    },
    onSuccess: (data: any) => {
      const baseUrl = window.location.origin;
      setOverlayUrl(`${baseUrl}${data.overlayUrl}`);
      toast({ title: "Overlay URL generated", description: "Copy the URL to use in OBS." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate overlay URL.", variant: "destructive" });
    },
  });

  const initializeDefaultsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/stream-alerts/initialize-defaults");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stream-alerts"] });
      toast({ title: "Defaults initialized", description: "Default alert configurations created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to initialize defaults.", variant: "destructive" });
    },
  });

  const onSubmit = (data: AlertSettingsFormValues) => {
    updateMutation.mutate(data);
  };

  const handleTestAlert = (alertType: string) => {
    testAlertMutation.mutate(alertType);
  };

  const handleAddThreshold = () => {
    const threshold = parseInt(newThreshold);
    if (isNaN(threshold) || threshold <= 0) {
      toast({
        title: "Invalid threshold",
        description: "Please enter a valid number greater than 0.",
        variant: "destructive",
      });
      return;
    }

    const currentThresholds = form.getValues("milestoneThresholds");
    if (currentThresholds.includes(threshold)) {
      toast({
        title: "Duplicate threshold",
        description: "This threshold already exists.",
        variant: "destructive",
      });
      return;
    }

    const newThresholds = [...currentThresholds, threshold].sort((a, b) => a - b);
    form.setValue("milestoneThresholds", newThresholds);
    setNewThreshold("");
  };

  const handleRemoveThreshold = (threshold: number) => {
    const currentThresholds = form.getValues("milestoneThresholds");
    const newThresholds = currentThresholds.filter(t => t !== threshold);
    form.setValue("milestoneThresholds", newThresholds);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const handleSaveStreamAlert = (alertType: string, updates: Partial<StreamAlert>) => {
    updateStreamAlertMutation.mutate({ alertType, ...updates });
  };

  const copyOverlayUrl = () => {
    if (overlayUrl) {
      navigator.clipboard.writeText(overlayUrl);
      toast({ title: "Copied", description: "Overlay URL copied to clipboard." });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stream Alerts</h1>
        <p className="text-muted-foreground">
          Configure alerts for followers, subscribers, raids, and milestones
        </p>
      </div>

      <Tabs defaultValue="chat" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Chat Alerts
          </TabsTrigger>
          <TabsTrigger value="overlay" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            OBS Overlay
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Alert Types
              </CardTitle>
              <CardDescription>
                Enable or disable alerts for different event types
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="enableFollowerAlerts"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Follower Alerts</FormLabel>
                      <FormDescription>
                        Show alerts when someone follows your channel
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enableSubAlerts"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Subscriber Alerts</FormLabel>
                      <FormDescription>
                        Show alerts when someone subscribes or resubscribes
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enableRaidAlerts"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Raid Alerts</FormLabel>
                      <FormDescription>
                        Show alerts when your channel gets raided
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enableMilestoneAlerts"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Milestone Alerts</FormLabel>
                      <FormDescription>
                        Show alerts when reaching follower/subscriber milestones
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Alert Templates
              </CardTitle>
              <CardDescription>
                Customize the message templates for each alert type
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="followerTemplate"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Follower Alert Template</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestAlert("follower")}
                        disabled={testAlertMutation.isPending}
                      >
                        {testAlertMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                        <span className="ml-2">Test</span>
                      </Button>
                    </div>
                    <FormControl>
                      <Textarea {...field} rows={2} />
                    </FormControl>
                    <FormDescription>
                      Variables: {"{username}"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="subTemplate"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Subscriber Alert Template</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestAlert("subscriber")}
                        disabled={testAlertMutation.isPending}
                      >
                        {testAlertMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                        <span className="ml-2">Test</span>
                      </Button>
                    </div>
                    <FormControl>
                      <Textarea {...field} rows={2} />
                    </FormControl>
                    <FormDescription>
                      Variables: {"{username}"}, {"{tier}"}, {"{months}"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="raidTemplate"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Raid Alert Template</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestAlert("raid")}
                        disabled={testAlertMutation.isPending}
                      >
                        {testAlertMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                        <span className="ml-2">Test</span>
                      </Button>
                    </div>
                    <FormControl>
                      <Textarea {...field} rows={2} />
                    </FormControl>
                    <FormDescription>
                      Variables: {"{raider}"}, {"{viewers}"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Milestone Thresholds
              </CardTitle>
              <CardDescription>
                Configure at which follower/subscriber counts to trigger milestone alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="milestoneThresholds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Thresholds</FormLabel>
                    <div className="flex flex-wrap gap-2 p-4 border rounded-md min-h-[60px]">
                      {field.value.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No thresholds configured</p>
                      ) : (
                        field.value.map((threshold) => (
                          <Badge
                            key={threshold}
                            variant="secondary"
                            className="px-3 py-1"
                          >
                            {threshold.toLocaleString()}
                            <button
                              type="button"
                              className="ml-2 text-xs hover:text-destructive"
                              onClick={() => handleRemoveThreshold(threshold)}
                            >
                              ✕
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Enter threshold (e.g., 1000)"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddThreshold();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddThreshold}
                >
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Settings
            </Button>
          </div>
        </form>
      </Form>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Alert History
          </CardTitle>
          <CardDescription>
            Recent alerts that have been triggered
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Select value={historyFilter} onValueChange={setHistoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Alerts</SelectItem>
                <SelectItem value="follower">Followers</SelectItem>
                <SelectItem value="subscriber">Subscribers</SelectItem>
                <SelectItem value="raid">Raids</SelectItem>
                <SelectItem value="milestone">Milestones</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No alerts in history yet
              </p>
            ) : (
              history.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="capitalize">
                        {alert.alertType}
                      </Badge>
                      <Badge variant="secondary" className="uppercase text-xs">
                        {alert.platform}
                      </Badge>
                      {alert.username && (
                        <span className="text-sm font-medium">@{alert.username}</span>
                      )}
                    </div>
                    <p className="text-sm">{alert.message}</p>
                  </div>
                  <div className="text-xs text-muted-foreground ml-4 whitespace-nowrap">
                    {formatTimestamp(alert.timestamp)}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="overlay" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                OBS Browser Source URL
              </CardTitle>
              <CardDescription>
                Add this URL as a browser source in OBS to display alerts on your stream
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={overlayUrl}
                  readOnly
                  placeholder="Click 'Generate URL' to create your overlay link"
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={copyOverlayUrl}
                  disabled={!overlayUrl}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => window.open(overlayUrl, '_blank')}
                  disabled={!overlayUrl}
                  variant="outline"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => generateOverlayUrlMutation.mutate()}
                  disabled={generateOverlayUrlMutation.isPending}
                >
                  {generateOverlayUrlMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Generate URL
                </Button>
                {streamAlerts.length === 0 && (
                  <Button
                    variant="outline"
                    onClick={() => initializeDefaultsMutation.mutate()}
                    disabled={initializeDefaultsMutation.isPending}
                  >
                    {initializeDefaultsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Initialize Defaults
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended OBS settings: Width 1920, Height 1080, transparent background
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Alert Configurations
              </CardTitle>
              <CardDescription>
                Configure each alert type with custom images, sounds, and animations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {ALERT_TYPES.map((type) => {
                  const alertConfig = streamAlerts.find(a => a.alertType === type.value);
                  return (
                    <Button
                      key={type.value}
                      variant={selectedAlertType === type.value ? "default" : "outline"}
                      onClick={() => setSelectedAlertType(type.value)}
                      className="flex items-center gap-2"
                    >
                      <span>{type.icon}</span>
                      <span>{type.label}</span>
                      {alertConfig?.enabled && (
                        <Badge variant="secondary" className="ml-1 text-xs">On</Badge>
                      )}
                    </Button>
                  );
                })}
              </div>

              {currentStreamAlert ? (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg font-semibold">
                      {ALERT_TYPES.find(t => t.value === selectedAlertType)?.icon}{" "}
                      {ALERT_TYPES.find(t => t.value === selectedAlertType)?.label} Alert
                    </Label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={currentStreamAlert.enabled}
                          onCheckedChange={(enabled) => handleSaveStreamAlert(selectedAlertType, { enabled })}
                        />
                        <Label>Enabled</Label>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testStreamAlertMutation.mutate(selectedAlertType)}
                        disabled={testStreamAlertMutation.isPending}
                      >
                        {testStreamAlertMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        <span className="ml-2">Test</span>
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Image URL
                      </Label>
                      <Input
                        value={currentStreamAlert.imageUrl || ""}
                        onChange={(e) => handleSaveStreamAlert(selectedAlertType, { imageUrl: e.target.value })}
                        placeholder="https://example.com/alert.gif"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Volume2 className="h-4 w-4" />
                        Sound URL
                      </Label>
                      <Input
                        value={currentStreamAlert.soundUrl || ""}
                        onChange={(e) => handleSaveStreamAlert(selectedAlertType, { soundUrl: e.target.value })}
                        placeholder="https://example.com/alert.mp3"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Type className="h-4 w-4" />
                      Text Template
                    </Label>
                    <Textarea
                      value={currentStreamAlert.textTemplate}
                      onChange={(e) => handleSaveStreamAlert(selectedAlertType, { textTemplate: e.target.value })}
                      placeholder="Thank you {user} for the follow!"
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Variables: {"{user}"}, {"{amount}"}, {"{message}"}, {"{tier}"}, {"{months}"}, {"{platform}"}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Animation</Label>
                      <Select
                        value={currentStreamAlert.animation}
                        onValueChange={(animation) => handleSaveStreamAlert(selectedAlertType, { animation })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ANIMATIONS.map((anim) => (
                            <SelectItem key={anim.value} value={anim.value}>
                              {anim.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Duration (seconds)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={currentStreamAlert.duration}
                        onChange={(e) => handleSaveStreamAlert(selectedAlertType, { duration: parseInt(e.target.value) || 5 })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Font Size (px)</Label>
                      <Input
                        type="number"
                        min={12}
                        max={120}
                        value={currentStreamAlert.fontSize}
                        onChange={(e) => handleSaveStreamAlert(selectedAlertType, { fontSize: parseInt(e.target.value) || 32 })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Font Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={currentStreamAlert.fontColor}
                          onChange={(e) => handleSaveStreamAlert(selectedAlertType, { fontColor: e.target.value })}
                          className="w-12 h-10 p-1"
                        />
                        <Input
                          value={currentStreamAlert.fontColor}
                          onChange={(e) => handleSaveStreamAlert(selectedAlertType, { fontColor: e.target.value })}
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Background Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={currentStreamAlert.backgroundColor === "transparent" ? "#000000" : currentStreamAlert.backgroundColor}
                          onChange={(e) => handleSaveStreamAlert(selectedAlertType, { backgroundColor: e.target.value })}
                          className="w-12 h-10 p-1"
                        />
                        <Input
                          value={currentStreamAlert.backgroundColor}
                          onChange={(e) => handleSaveStreamAlert(selectedAlertType, { backgroundColor: e.target.value })}
                          placeholder="transparent"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Volume ({currentStreamAlert.volume}%)</Label>
                      <Slider
                        value={[currentStreamAlert.volume]}
                        onValueChange={([volume]) => handleSaveStreamAlert(selectedAlertType, { volume })}
                        min={0}
                        max={100}
                        step={5}
                        className="mt-2"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Text-to-Speech</Label>
                      <p className="text-xs text-muted-foreground">Read alert message aloud</p>
                    </div>
                    <Switch
                      checked={currentStreamAlert.ttsEnabled}
                      onCheckedChange={(ttsEnabled) => handleSaveStreamAlert(selectedAlertType, { ttsEnabled })}
                    />
                  </div>

                  <Card className="bg-muted/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Alert Preview
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AlertPreview 
                        alert={{
                          alertType: selectedAlertType,
                          enabled: currentStreamAlert.enabled,
                          soundUrl: currentStreamAlert.soundUrl,
                          imageUrl: currentStreamAlert.imageUrl,
                          duration: currentStreamAlert.duration,
                          animation: currentStreamAlert.animation,
                          textTemplate: currentStreamAlert.textTemplate,
                          fontSize: currentStreamAlert.fontSize,
                          fontColor: currentStreamAlert.fontColor,
                          backgroundColor: currentStreamAlert.backgroundColor,
                          ttsEnabled: currentStreamAlert.ttsEnabled,
                          ttsVoice: currentStreamAlert.ttsVoice,
                          minAmount: currentStreamAlert.minAmount,
                          volume: currentStreamAlert.volume,
                        }}
                        sampleData={{
                          user: "TestUser123",
                          amount: selectedAlertType === "donation" ? 5 : selectedAlertType === "bits" ? 100 : selectedAlertType === "raid" ? 42 : undefined,
                          message: selectedAlertType === "donation" || selectedAlertType === "bits" ? "Great stream!" : undefined,
                          tier: selectedAlertType === "sub" ? "Tier 1" : undefined,
                          months: selectedAlertType === "sub" ? 3 : undefined,
                        }}
                      />
                    </CardContent>
                  </Card>

                  {(selectedAlertType === "donation" || selectedAlertType === "bits") && (
                    <div className="space-y-2">
                      <Label>Minimum Amount</Label>
                      <Input
                        type="number"
                        min={0}
                        value={currentStreamAlert.minAmount}
                        onChange={(e) => handleSaveStreamAlert(selectedAlertType, { minAmount: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                      />
                      <p className="text-xs text-muted-foreground">
                        Only show alerts for amounts equal to or greater than this value
                      </p>
                    </div>
                  )}
                </div>
              ) : streamAlertsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No alert configurations found.</p>
                  <Button
                    onClick={() => initializeDefaultsMutation.mutate()}
                    disabled={initializeDefaultsMutation.isPending}
                  >
                    {initializeDefaultsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Initialize Default Alerts
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
