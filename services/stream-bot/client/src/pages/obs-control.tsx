import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Wifi,
  WifiOff,
  Play,
  Square,
  Circle,
  Video,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Edit,
  Coffee,
  Zap,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface OBSStatus {
  connected: boolean;
  connectionExists: boolean;
  lastConnectedAt: string | null;
}

interface Scene {
  sceneName: string;
  sceneIndex: number;
}

interface SceneItem {
  sceneItemId: number;
  sourceName: string;
  sceneItemEnabled: boolean;
  sceneItemIndex: number;
}

interface OBSAutomation {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: "follow" | "subscribe" | "bits" | "raid" | "command" | "timer";
    value?: string;
  };
  actions: Array<{
    type: "scene" | "source_visibility" | "text_update" | "media_play";
    params: Record<string, any>;
    delay?: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface FeatureFlags {
  obs: boolean;
}

export default function OBSControl() {
  const { toast } = useToast();

  // Check if OBS feature is enabled
  const { data: features, isLoading: featuresLoading } = useQuery<FeatureFlags>({
    queryKey: ["/api/features"],
    retry: false,
  });
  const [selectedScene, setSelectedScene] = useState<string>("");
  const [currentScene, setCurrentScene] = useState<string>("");
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<OBSAutomation | null>(null);
  const [connectionForm, setConnectionForm] = useState({
    host: "localhost",
    port: 4455,
    password: "",
  });

  const [automationForm, setAutomationForm] = useState<{
    name: string;
    enabled: boolean;
    trigger: { type: string; value?: string };
    actions: Array<{
      type: string;
      params: Record<string, any>;
      delay?: number;
    }>;
  }>({
    name: "",
    enabled: true,
    trigger: { type: "command", value: "" },
    actions: [],
  });

  const { data: status, isLoading: statusLoading } = useQuery<OBSStatus>({
    queryKey: ["/api/obs/status"],
    refetchInterval: 5000,
  });

  const { data: scenes, isLoading: scenesLoading } = useQuery<Scene[]>({
    queryKey: ["/api/obs/scenes"],
    enabled: status?.connected === true,
    refetchInterval: 10000,
  });

  const { data: automations, isLoading: automationsLoading } = useQuery<OBSAutomation[]>({
    queryKey: ["/api/obs/automations"],
  });

  useEffect(() => {
    if (status?.connected && !currentScene) {
      fetchCurrentScene();
    }
  }, [status?.connected]);

  const fetchCurrentScene = async () => {
    try {
      const response = await apiRequest("GET", "/api/obs/scenes/current");
      setCurrentScene(response.currentScene);
      setSelectedScene(response.currentScene);
    } catch (error) {
      console.error("Failed to fetch current scene:", error);
    }
  };

  const connectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/obs/connect", connectionForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/obs/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/obs/scenes"] });
      setConnectionDialogOpen(false);
      toast({
        title: "Connected to OBS",
        description: "Successfully connected to OBS Studio.",
      });
      fetchCurrentScene();
    },
    onError: (error: any) => {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect to OBS. Check your settings.",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/obs/disconnect", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/obs/status"] });
      toast({
        title: "Disconnected from OBS",
        description: "Successfully disconnected from OBS Studio.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect from OBS.",
        variant: "destructive",
      });
    },
  });

  const switchSceneMutation = useMutation({
    mutationFn: async (sceneName: string) => {
      return await apiRequest("POST", "/api/obs/scenes/switch", { sceneName });
    },
    onSuccess: (_, sceneName) => {
      setCurrentScene(sceneName);
      toast({
        title: "Scene switched",
        description: `Switched to scene: ${sceneName}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to switch scene.",
        variant: "destructive",
      });
    },
  });

  const startStreamMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/obs/stream/start", {});
    },
    onSuccess: () => {
      toast({
        title: "Stream started",
        description: "Your stream has started successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start stream.",
        variant: "destructive",
      });
    },
  });

  const stopStreamMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/obs/stream/stop", {});
    },
    onSuccess: () => {
      toast({
        title: "Stream stopped",
        description: "Your stream has been stopped.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to stop stream.",
        variant: "destructive",
      });
    },
  });

  const startRecordingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/obs/recording/start", {});
    },
    onSuccess: () => {
      toast({
        title: "Recording started",
        description: "Recording has started successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start recording.",
        variant: "destructive",
      });
    },
  });

  const stopRecordingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/obs/recording/stop", {});
    },
    onSuccess: () => {
      toast({
        title: "Recording stopped",
        description: "Recording has been stopped.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to stop recording.",
        variant: "destructive",
      });
    },
  });

  const createAutomationMutation = useMutation({
    mutationFn: async (data: typeof automationForm) => {
      if (editingAutomation) {
        return await apiRequest("PUT", `/api/obs/automations/${editingAutomation.id}`, data);
      }
      return await apiRequest("POST", "/api/obs/automations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/obs/automations"] });
      setAutomationDialogOpen(false);
      setEditingAutomation(null);
      setAutomationForm({
        name: "",
        enabled: true,
        trigger: { type: "command", value: "" },
        actions: [],
      });
      toast({
        title: editingAutomation ? "Automation updated" : "Automation created",
        description: `Successfully ${editingAutomation ? "updated" : "created"} automation rule.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save automation rule.",
        variant: "destructive",
      });
    },
  });

  const deleteAutomationMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/obs/automations/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/obs/automations"] });
      toast({
        title: "Automation deleted",
        description: "Automation rule has been deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete automation rule.",
        variant: "destructive",
      });
    },
  });

  const handleEditAutomation = (automation: OBSAutomation) => {
    setEditingAutomation(automation);
    setAutomationForm({
      name: automation.name,
      enabled: automation.enabled,
      trigger: automation.trigger,
      actions: automation.actions,
    });
    setAutomationDialogOpen(true);
  };

  const addAction = () => {
    setAutomationForm({
      ...automationForm,
      actions: [
        ...automationForm.actions,
        { type: "scene", params: {}, delay: 0 },
      ],
    });
  };

  const removeAction = (index: number) => {
    const newActions = [...automationForm.actions];
    newActions.splice(index, 1);
    setAutomationForm({ ...automationForm, actions: newActions });
  };

  const updateAction = (index: number, field: string, value: any) => {
    const newActions = [...automationForm.actions];
    if (field === "type") {
      newActions[index].type = value;
    } else if (field.startsWith("params.")) {
      const paramField = field.replace("params.", "");
      newActions[index].params[paramField] = value;
    } else if (field === "delay") {
      newActions[index].delay = value;
    }
    setAutomationForm({ ...automationForm, actions: newActions });
  };

  // Loading state
  if (featuresLoading || statusLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  // Feature not available state
  if (features && !features.obs) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">OBS Control</h1>
          <p className="text-muted-foreground">
            Control OBS Studio scenes, sources, and streaming
          </p>
        </div>
        
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Feature Not Available</AlertTitle>
          <AlertDescription>
            OBS WebSocket integration is not configured for this deployment. 
            This is a multi-tenant platform and OBS control is an optional feature.
            If you need OBS integration, please contact your administrator or configure 
            the OBS_WEBSOCKET_HOST environment variable.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>What is OBS Control?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              OBS Control allows you to remotely manage OBS Studio from your stream dashboard, including:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-muted-foreground">
              <li>Switch between scenes automatically based on chat commands or events</li>
              <li>Start and stop streaming or recording</li>
              <li>Control source visibility and settings</li>
              <li>Update text overlays in real-time</li>
              <li>Create automation rules for chat interactions</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              This feature requires OBS Studio with WebSocket server enabled on the same network.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">OBS Control</h1>
          <p className="text-muted-foreground">
            Control OBS Studio scenes, sources, and streaming
          </p>
        </div>
        <Dialog open={connectionDialogOpen} onOpenChange={setConnectionDialogOpen}>
          <DialogTrigger asChild>
            <Button variant={status?.connected ? "outline" : "default"}>
              {status?.connected ? (
                <>
                  <WifiOff className="mr-2 h-4 w-4" />
                  Disconnect
                </>
              ) : (
                <>
                  <Wifi className="mr-2 h-4 w-4" />
                  Connect to OBS
                </>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect to OBS Studio</DialogTitle>
              <DialogDescription>
                Enter your OBS WebSocket connection details. Make sure OBS Studio is running
                and WebSocket server is enabled (Tools → WebSocket Server Settings).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  value={connectionForm.host}
                  onChange={(e) => setConnectionForm({ ...connectionForm, host: e.target.value })}
                  placeholder="localhost"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={connectionForm.port}
                  onChange={(e) => setConnectionForm({ ...connectionForm, port: parseInt(e.target.value) })}
                  placeholder="4455"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={connectionForm.password}
                  onChange={(e) => setConnectionForm({ ...connectionForm, password: e.target.value })}
                  placeholder="Your OBS WebSocket password"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {status?.connected && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
        >
          {disconnectMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <WifiOff className="mr-2 h-4 w-4" />
          )}
          Disconnect
        </Button>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {status?.connected ? (
                <>
                  <Wifi className="h-5 w-5 text-green-500" />
                  Connected to OBS
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-muted-foreground" />
                  Not Connected
                </>
              )}
            </CardTitle>
            <CardDescription>
              {status?.connected
                ? "OBS WebSocket is connected and ready"
                : "Connect to OBS Studio to begin controlling scenes and sources"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status?.connected && currentScene && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Scene:</span>
                  <Badge variant="secondary">{currentScene}</Badge>
                </div>
              )}
              {status?.lastConnectedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Connected:</span>
                  <span className="text-sm">{new Date(status.lastConnectedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stream Controls</CardTitle>
            <CardDescription>
              Start/stop streaming and recording directly from the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="default"
                onClick={() => startStreamMutation.mutate()}
                disabled={!status?.connected || startStreamMutation.isPending}
              >
                <Play className="mr-2 h-4 w-4" />
                Start Stream
              </Button>
              <Button
                variant="destructive"
                onClick={() => stopStreamMutation.mutate()}
                disabled={!status?.connected || stopStreamMutation.isPending}
              >
                <Square className="mr-2 h-4 w-4" />
                Stop Stream
              </Button>
              <Button
                variant="secondary"
                onClick={() => startRecordingMutation.mutate()}
                disabled={!status?.connected || startRecordingMutation.isPending}
              >
                <Circle className="mr-2 h-4 w-4" />
                Start Recording
              </Button>
              <Button
                variant="outline"
                onClick={() => stopRecordingMutation.mutate()}
                disabled={!status?.connected || stopRecordingMutation.isPending}
              >
                <Square className="mr-2 h-4 w-4" />
                Stop Recording
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {status?.connected && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Scene Switcher</CardTitle>
              <CardDescription>
                Click a scene to switch to it instantly
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scenesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : scenes && scenes.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {scenes.map((scene) => (
                    <Button
                      key={scene.sceneName}
                      variant={currentScene === scene.sceneName ? "default" : "outline"}
                      onClick={() => switchSceneMutation.mutate(scene.sceneName)}
                      disabled={switchSceneMutation.isPending}
                      className="h-auto py-4 flex-col gap-1"
                    >
                      <Video className="h-6 w-6" />
                      <span className="text-sm font-medium">{scene.sceneName}</span>
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No scenes found in OBS
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Automation Rules</CardTitle>
                  <CardDescription>
                    Create automated OBS actions triggered by chat commands and events
                  </CardDescription>
                </div>
                <Dialog open={automationDialogOpen} onOpenChange={setAutomationDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Rule
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editingAutomation ? "Edit" : "Create"} Automation Rule
                      </DialogTitle>
                      <DialogDescription>
                        Set up automated OBS actions triggered by events
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="automation-name">Rule Name</Label>
                        <Input
                          id="automation-name"
                          value={automationForm.name}
                          onChange={(e) => setAutomationForm({ ...automationForm, name: e.target.value })}
                          placeholder="e.g., Switch to Thanks scene on follow"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="trigger-type">Trigger Type</Label>
                        <Select
                          value={automationForm.trigger.type}
                          onValueChange={(value) =>
                            setAutomationForm({ ...automationForm, trigger: { ...automationForm.trigger, type: value } })
                          }
                        >
                          <SelectTrigger id="trigger-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="command">Chat Command</SelectItem>
                            <SelectItem value="follow">New Follower</SelectItem>
                            <SelectItem value="subscribe">New Subscriber</SelectItem>
                            <SelectItem value="bits">Bits/Donation</SelectItem>
                            <SelectItem value="raid">Raid</SelectItem>
                            <SelectItem value="timer">Timer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(automationForm.trigger.type === "command" || automationForm.trigger.type === "timer") && (
                        <div className="space-y-2">
                          <Label htmlFor="trigger-value">
                            {automationForm.trigger.type === "command" ? "Command (e.g., !scene)" : "Interval (minutes)"}
                          </Label>
                          <Input
                            id="trigger-value"
                            value={automationForm.trigger.value || ""}
                            onChange={(e) =>
                              setAutomationForm({
                                ...automationForm,
                                trigger: { ...automationForm.trigger, value: e.target.value },
                              })
                            }
                            placeholder={
                              automationForm.trigger.type === "command" ? "!scene" : "30"
                            }
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Actions</Label>
                          <Button type="button" size="sm" variant="outline" onClick={addAction}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add Action
                          </Button>
                        </div>
                        {automationForm.actions.map((action, index) => (
                          <Card key={index}>
                            <CardContent className="pt-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <Label>Action {index + 1}</Label>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeAction(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <Select
                                value={action.type}
                                onValueChange={(value) => updateAction(index, "type", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select action type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="scene">Switch Scene</SelectItem>
                                  <SelectItem value="source_visibility">Toggle Source</SelectItem>
                                  <SelectItem value="text_update">Update Text</SelectItem>
                                  <SelectItem value="media_play">Play Media</SelectItem>
                                </SelectContent>
                              </Select>

                              {action.type === "scene" && (
                                <Input
                                  placeholder="Scene Name"
                                  value={action.params.sceneName || ""}
                                  onChange={(e) => updateAction(index, "params.sceneName", e.target.value)}
                                />
                              )}

                              {action.type === "source_visibility" && (
                                <>
                                  <Input
                                    placeholder="Scene Name"
                                    value={action.params.sceneName || ""}
                                    onChange={(e) => updateAction(index, "params.sceneName", e.target.value)}
                                  />
                                  <Input
                                    placeholder="Source Item ID"
                                    type="number"
                                    value={action.params.sceneItemId || ""}
                                    onChange={(e) => updateAction(index, "params.sceneItemId", parseInt(e.target.value))}
                                  />
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={action.params.visible || false}
                                      onCheckedChange={(checked) => updateAction(index, "params.visible", checked)}
                                    />
                                    <Label>Visible</Label>
                                  </div>
                                </>
                              )}

                              {action.type === "text_update" && (
                                <>
                                  <Input
                                    placeholder="Source Name"
                                    value={action.params.sourceName || ""}
                                    onChange={(e) => updateAction(index, "params.sourceName", e.target.value)}
                                  />
                                  <Input
                                    placeholder="Text Content"
                                    value={action.params.text || ""}
                                    onChange={(e) => updateAction(index, "params.text", e.target.value)}
                                  />
                                </>
                              )}

                              {action.type === "media_play" && (
                                <Input
                                  placeholder="Media Source Name"
                                  value={action.params.sourceName || ""}
                                  onChange={(e) => updateAction(index, "params.sourceName", e.target.value)}
                                />
                              )}

                              <div className="space-y-2">
                                <Label>Delay (milliseconds)</Label>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  value={action.delay || 0}
                                  onChange={(e) => updateAction(index, "delay", parseInt(e.target.value) || 0)}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={automationForm.enabled}
                          onCheckedChange={(checked) => setAutomationForm({ ...automationForm, enabled: checked })}
                        />
                        <Label>Enabled</Label>
                      </div>

                      <Button
                        className="w-full"
                        onClick={() => createAutomationMutation.mutate(automationForm)}
                        disabled={createAutomationMutation.isPending || !automationForm.name}
                      >
                        {createAutomationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingAutomation ? "Update" : "Create"} Automation
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {automationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : automations && automations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Actions</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {automations.map((automation) => (
                      <TableRow key={automation.id}>
                        <TableCell className="font-medium">{automation.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {automation.trigger.type}
                            {automation.trigger.value && `: ${automation.trigger.value}`}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {automation.actions.length} action{automation.actions.length !== 1 ? "s" : ""}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={automation.enabled ? "default" : "secondary"}>
                            {automation.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditAutomation(automation)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteAutomationMutation.mutate(automation.id)}
                              disabled={deleteAutomationMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <Zap className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No automation rules configured</p>
                  <p className="text-sm">Create your first rule to get started</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Preset shortcuts for common streaming tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  variant="secondary"
                  className="h-auto py-4 flex-col gap-1"
                  onClick={() => {
                    switchSceneMutation.mutate("BRB");
                  }}
                  disabled={!scenes?.find((s) => s.sceneName === "BRB")}
                >
                  <Coffee className="h-6 w-6" />
                  <span className="text-sm">Be Right Back</span>
                </Button>
                <Button
                  variant="secondary"
                  className="h-auto py-4 flex-col gap-1"
                  onClick={() => {
                    switchSceneMutation.mutate("Starting Soon");
                  }}
                  disabled={!scenes?.find((s) => s.sceneName === "Starting Soon")}
                >
                  <Play className="h-6 w-6" />
                  <span className="text-sm">Starting Soon</span>
                </Button>
                <Button
                  variant="secondary"
                  className="h-auto py-4 flex-col gap-1"
                  onClick={() => {
                    switchSceneMutation.mutate("Ending Soon");
                  }}
                  disabled={!scenes?.find((s) => s.sceneName === "Ending Soon")}
                >
                  <Square className="h-6 w-6" />
                  <span className="text-sm">Ending Soon</span>
                </Button>
                <Button
                  variant="secondary"
                  className="h-auto py-4 flex-col gap-1"
                  onClick={() => {
                    switchSceneMutation.mutate("Gaming");
                  }}
                  disabled={!scenes?.find((s) => s.sceneName === "Gaming")}
                >
                  <Video className="h-6 w-6" />
                  <span className="text-sm">Gaming</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
