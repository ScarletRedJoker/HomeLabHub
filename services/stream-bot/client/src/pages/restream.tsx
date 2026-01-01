import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Eye, EyeOff, Radio, Settings2, ExternalLink } from "lucide-react";
import { SiTwitch, SiYoutube, SiKick, SiFacebook } from "react-icons/si";

interface RestreamDestination {
  id: string;
  platform: string;
  rtmpUrl: string;
  streamKey: string;
  enabled: boolean;
  bitrate: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface RtmpServer {
  region: string;
  url: string;
}

interface RtmpServers {
  [key: string]: {
    name: string;
    servers: RtmpServer[];
  };
}

const platformIcons: Record<string, React.ReactNode> = {
  twitch: <SiTwitch className="h-5 w-5 text-purple-500" />,
  youtube: <SiYoutube className="h-5 w-5 text-red-500" />,
  kick: <SiKick className="h-5 w-5 text-green-500" />,
  facebook: <SiFacebook className="h-5 w-5 text-blue-500" />,
  custom: <Settings2 className="h-5 w-5 text-gray-500" />,
};

const platformColors: Record<string, string> = {
  twitch: "border-purple-500/30 bg-purple-500/5",
  youtube: "border-red-500/30 bg-red-500/5",
  kick: "border-green-500/30 bg-green-500/5",
  facebook: "border-blue-500/30 bg-blue-500/5",
  custom: "border-gray-500/30 bg-gray-500/5",
};

export default function Restream() {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showStreamKeys, setShowStreamKeys] = useState<Record<string, boolean>>({});
  const [newDestination, setNewDestination] = useState({
    platform: "twitch",
    rtmpUrl: "",
    streamKey: "",
    enabled: true,
    bitrate: 6000,
    notes: "",
  });

  const { data: destinations, isLoading } = useQuery<RestreamDestination[]>({
    queryKey: ["/api/restream/destinations"],
  });

  const { data: rtmpServers } = useQuery<RtmpServers>({
    queryKey: ["/api/restream/servers"],
  });

  const addMutation = useMutation({
    mutationFn: async (dest: typeof newDestination) => {
      return await apiRequest("POST", "/api/restream/destinations", dest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restream/destinations"] });
      setShowAddDialog(false);
      setNewDestination({
        platform: "twitch",
        rtmpUrl: "",
        streamKey: "",
        enabled: true,
        bitrate: 6000,
        notes: "",
      });
      toast({ title: "Success", description: "Destination added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RestreamDestination> }) => {
      return await apiRequest("PUT", `/api/restream/destinations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restream/destinations"] });
      toast({ title: "Updated", description: "Destination updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/restream/destinations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restream/destinations"] });
      toast({ title: "Deleted", description: "Destination removed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handlePlatformChange = (platform: string) => {
    setNewDestination((prev) => ({ ...prev, platform, rtmpUrl: "" }));
  };

  const handleServerSelect = (url: string) => {
    setNewDestination((prev) => ({ ...prev, rtmpUrl: url }));
  };

  const toggleStreamKeyVisibility = (id: string) => {
    setShowStreamKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const maskStreamKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return key.substring(0, 4) + "••••••••" + key.substring(key.length - 4);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold candy-gradient-text flex items-center gap-2">
            <Radio className="h-7 w-7" />
            Restream
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-0.5 sm:mt-1">
            Configure multi-platform streaming destinations
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="candy-button">
              <Plus className="h-4 w-4 mr-2" />
              Add Destination
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Streaming Destination</DialogTitle>
              <DialogDescription>
                Configure a new platform for multi-streaming
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select
                  value={newDestination.platform}
                  onValueChange={handlePlatformChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twitch">
                      <div className="flex items-center gap-2">
                        <SiTwitch className="h-4 w-4 text-purple-500" />
                        Twitch
                      </div>
                    </SelectItem>
                    <SelectItem value="youtube">
                      <div className="flex items-center gap-2">
                        <SiYoutube className="h-4 w-4 text-red-500" />
                        YouTube
                      </div>
                    </SelectItem>
                    <SelectItem value="kick">
                      <div className="flex items-center gap-2">
                        <SiKick className="h-4 w-4 text-green-500" />
                        Kick
                      </div>
                    </SelectItem>
                    <SelectItem value="facebook">
                      <div className="flex items-center gap-2">
                        <SiFacebook className="h-4 w-4 text-blue-500" />
                        Facebook
                      </div>
                    </SelectItem>
                    <SelectItem value="custom">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Custom
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {rtmpServers?.[newDestination.platform]?.servers?.length > 0 && (
                <div className="space-y-2">
                  <Label>Server Region</Label>
                  <Select onValueChange={handleServerSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a server" />
                    </SelectTrigger>
                    <SelectContent>
                      {rtmpServers[newDestination.platform].servers.map((server) => (
                        <SelectItem key={server.url} value={server.url}>
                          {server.region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>RTMP URL</Label>
                <Input
                  placeholder="rtmp://..."
                  value={newDestination.rtmpUrl}
                  onChange={(e) =>
                    setNewDestination((prev) => ({ ...prev, rtmpUrl: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Stream Key</Label>
                <Input
                  type="password"
                  placeholder="Your stream key"
                  value={newDestination.streamKey}
                  onChange={(e) =>
                    setNewDestination((prev) => ({ ...prev, streamKey: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Your stream key is stored securely and never shared
                </p>
              </div>

              <div className="space-y-2">
                <Label>Bitrate (kbps)</Label>
                <Input
                  type="number"
                  min={1000}
                  max={20000}
                  value={newDestination.bitrate}
                  onChange={(e) =>
                    setNewDestination((prev) => ({
                      ...prev,
                      bitrate: parseInt(e.target.value) || 6000,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Add any notes about this destination..."
                  value={newDestination.notes}
                  onChange={(e) =>
                    setNewDestination((prev) => ({ ...prev, notes: e.target.value }))
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label>Enabled</Label>
                  <p className="text-xs text-muted-foreground">
                    Stream to this destination when going live
                  </p>
                </div>
                <Switch
                  checked={newDestination.enabled}
                  onCheckedChange={(checked) =>
                    setNewDestination((prev) => ({ ...prev, enabled: checked }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addMutation.mutate(newDestination)}
                disabled={addMutation.isPending || !newDestination.rtmpUrl || !newDestination.streamKey}
              >
                {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Destination
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {destinations?.length === 0 ? (
        <Card className="candy-glass-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Radio className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Destinations Configured</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Add streaming destinations to start multi-platform streaming. Configure RTMP
              endpoints for Twitch, YouTube, Kick, and more.
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Destination
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {destinations?.map((dest) => (
            <Card
              key={dest.id}
              className={`candy-glass-card border-2 ${platformColors[dest.platform] || "border-border"}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {platformIcons[dest.platform]}
                    <div>
                      <CardTitle className="text-base capitalize">{dest.platform}</CardTitle>
                      <CardDescription className="text-xs font-mono truncate max-w-xs">
                        {dest.rtmpUrl}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={dest.enabled}
                      onCheckedChange={(enabled) =>
                        updateMutation.mutate({ id: dest.id, data: { enabled } })
                      }
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Destination</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove this {dest.platform} destination? This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(dest.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-20">Stream Key:</Label>
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1 font-mono">
                    {showStreamKeys[dest.id] ? dest.streamKey : maskStreamKey(dest.streamKey)}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => toggleStreamKeyVisibility(dest.id)}
                  >
                    {showStreamKeys[dest.id] ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-20">Bitrate:</Label>
                  <span className="text-xs">{dest.bitrate} kbps</span>
                </div>
                {dest.notes && (
                  <div className="flex items-start gap-2">
                    <Label className="text-xs text-muted-foreground w-20">Notes:</Label>
                    <span className="text-xs text-muted-foreground">{dest.notes}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      dest.enabled
                        ? "bg-green-500/20 text-green-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {dest.enabled ? "Active" : "Disabled"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Added {new Date(dest.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="candy-glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Quick Links
          </CardTitle>
          <CardDescription>Get your stream keys from these platforms</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <a
              href="https://dashboard.twitch.tv/settings/stream"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <SiTwitch className="h-4 w-4 text-purple-500" />
              <span className="text-sm">Twitch</span>
            </a>
            <a
              href="https://studio.youtube.com/channel/UC/livestreaming"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <SiYoutube className="h-4 w-4 text-red-500" />
              <span className="text-sm">YouTube</span>
            </a>
            <a
              href="https://kick.com/dashboard/settings/stream"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <SiKick className="h-4 w-4 text-green-500" />
              <span className="text-sm">Kick</span>
            </a>
            <a
              href="https://www.facebook.com/live/producer"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <SiFacebook className="h-4 w-4 text-blue-500" />
              <span className="text-sm">Facebook</span>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
