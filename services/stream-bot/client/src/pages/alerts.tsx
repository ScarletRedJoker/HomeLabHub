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
import { Loader2, Save, Bell, Sparkles, Users, Target, TestTube, History } from "lucide-react";
import { z } from "zod";

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

export default function Alerts() {
  const { toast } = useToast();
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [newThreshold, setNewThreshold] = useState<string>("");

  const { data: settings, isLoading } = useQuery<AlertSettingsFormValues>({
    queryKey: ["/api/alerts/settings"],
  });

  const { data: history = [] } = useQuery<AlertHistory[]>({
    queryKey: ["/api/alerts/history", historyFilter],
    queryFn: async () => {
      const filterParam = historyFilter !== "all" ? `?type=${historyFilter}` : "";
      const res = await apiRequest("GET", `/api/alerts/history${filterParam}`);
      return await res.json() as AlertHistory[];
    },
  });

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stream Alerts</h1>
        <p className="text-muted-foreground">
          Configure alerts for followers, subscribers, raids, and milestones
        </p>
      </div>

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
    </div>
  );
}
