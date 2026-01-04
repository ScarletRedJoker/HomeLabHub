import { useState, useEffect } from "react";
import { useServerContext } from "@/contexts/ServerContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar, 
  Plus, 
  Edit, 
  Trash2, 
  Play, 
  Clock, 
  Hash, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2
} from "lucide-react";

interface ScheduledPost {
  id: number;
  serverId: string;
  name: string;
  content: string | null;
  embedData: string | null;
  channelId: string;
  scheduleType: "once" | "recurring";
  cronExpression: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  timezone: string;
  isEnabled: boolean;
  createdBy: string;
  createdByUsername: string | null;
  createdAt: string;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface EmbedData {
  title?: string;
  description?: string;
  color?: string;
  footer?: { text?: string };
  image?: { url?: string };
  thumbnail?: { url?: string };
}

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const CRON_PRESETS = [
  { label: "Every day", value: "daily", description: "Runs once every day" },
  { label: "Every Monday", value: "weekly-monday", description: "Runs every Monday" },
  { label: "Every Tuesday", value: "weekly-tuesday", description: "Runs every Tuesday" },
  { label: "Every Wednesday", value: "weekly-wednesday", description: "Runs every Wednesday" },
  { label: "Every Thursday", value: "weekly-thursday", description: "Runs every Thursday" },
  { label: "Every Friday", value: "weekly-friday", description: "Runs every Friday" },
  { label: "Every Saturday", value: "weekly-saturday", description: "Runs every Saturday" },
  { label: "Every Sunday", value: "weekly-sunday", description: "Runs every Sunday" },
  { label: "First of month", value: "monthly", description: "Runs on the 1st of each month" },
];

export default function ContentScheduler() {
  const { selectedServerId } = useServerContext();
  const { toast } = useToast();
  
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [runningPostId, setRunningPostId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    content: "",
    useEmbed: false,
    embedTitle: "",
    embedDescription: "",
    embedColor: "#5865F2",
    embedFooter: "",
    embedImage: "",
    channelId: "",
    scheduleType: "once" as "once" | "recurring",
    cronPreset: "daily",
    cronTime: "09:00",
    oneTimeDate: "",
    oneTimeTime: "12:00",
    timezone: "UTC",
    isEnabled: true,
  });

  useEffect(() => {
    if (selectedServerId) {
      fetchPosts();
      fetchChannels();
    }
  }, [selectedServerId]);

  const fetchPosts = async () => {
    if (!selectedServerId) return;
    
    try {
      setLoading(true);
      const res = await fetch(`/api/servers/${selectedServerId}/scheduler`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
    } catch (error) {
      console.error("Error fetching scheduled posts:", error);
      toast({ title: "Error", description: "Failed to load scheduled posts", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    if (!selectedServerId) return;
    
    try {
      const res = await fetch(`/api/servers/${selectedServerId}/channels`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const channelList = data.channels || data || [];
        setChannels(channelList.filter((c: Channel) => c.type === 0));
      }
    } catch (error) {
      console.error("Error fetching channels:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      content: "",
      useEmbed: false,
      embedTitle: "",
      embedDescription: "",
      embedColor: "#5865F2",
      embedFooter: "",
      embedImage: "",
      channelId: "",
      scheduleType: "once",
      cronPreset: "daily",
      cronTime: "09:00",
      oneTimeDate: "",
      oneTimeTime: "12:00",
      timezone: "UTC",
      isEnabled: true,
    });
    setEditingPost(null);
  };

  const openEditDialog = (post: ScheduledPost) => {
    setEditingPost(post);
    
    let embedData: EmbedData = {};
    if (post.embedData) {
      try {
        embedData = JSON.parse(post.embedData);
      } catch (e) {}
    }

    const hasEmbed = post.embedData && Object.keys(embedData).length > 0;

    let cronPreset = "daily";
    let cronTime = "09:00";
    if (post.cronExpression) {
      const parts = post.cronExpression.split(" ");
      if (parts.length === 5) {
        const [minute, hour, , , dayOfWeek] = parts;
        cronTime = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
        if (dayOfWeek === "1") cronPreset = "weekly-monday";
        else if (dayOfWeek === "2") cronPreset = "weekly-tuesday";
        else if (dayOfWeek === "3") cronPreset = "weekly-wednesday";
        else if (dayOfWeek === "4") cronPreset = "weekly-thursday";
        else if (dayOfWeek === "5") cronPreset = "weekly-friday";
        else if (dayOfWeek === "6") cronPreset = "weekly-saturday";
        else if (dayOfWeek === "0") cronPreset = "weekly-sunday";
      }
    }

    let oneTimeDate = "";
    let oneTimeTime = "12:00";
    if (post.nextRunAt && post.scheduleType === "once") {
      const dt = new Date(post.nextRunAt);
      oneTimeDate = dt.toISOString().split("T")[0];
      oneTimeTime = dt.toTimeString().substring(0, 5);
    }

    setFormData({
      name: post.name,
      content: post.content || "",
      useEmbed: hasEmbed,
      embedTitle: embedData.title || "",
      embedDescription: embedData.description || "",
      embedColor: embedData.color || "#5865F2",
      embedFooter: embedData.footer?.text || "",
      embedImage: embedData.image?.url || "",
      channelId: post.channelId,
      scheduleType: post.scheduleType as "once" | "recurring",
      cronPreset,
      cronTime,
      oneTimeDate,
      oneTimeTime,
      timezone: post.timezone,
      isEnabled: post.isEnabled,
    });
    
    setIsDialogOpen(true);
  };

  const buildCronExpression = () => {
    const [hours, minutes] = formData.cronTime.split(":").map(Number);
    const preset = formData.cronPreset;
    
    switch (preset) {
      case "daily":
        return `${minutes} ${hours} * * *`;
      case "weekly-monday":
        return `${minutes} ${hours} * * 1`;
      case "weekly-tuesday":
        return `${minutes} ${hours} * * 2`;
      case "weekly-wednesday":
        return `${minutes} ${hours} * * 3`;
      case "weekly-thursday":
        return `${minutes} ${hours} * * 4`;
      case "weekly-friday":
        return `${minutes} ${hours} * * 5`;
      case "weekly-saturday":
        return `${minutes} ${hours} * * 6`;
      case "weekly-sunday":
        return `${minutes} ${hours} * * 0`;
      case "monthly":
        return `${minutes} ${hours} 1 * *`;
      default:
        return `${minutes} ${hours} * * *`;
    }
  };

  const handleSubmit = async () => {
    if (!selectedServerId) return;
    
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    if (!formData.channelId) {
      toast({ title: "Error", description: "Please select a channel", variant: "destructive" });
      return;
    }

    if (!formData.content.trim() && !formData.useEmbed) {
      toast({ title: "Error", description: "Please add content or an embed", variant: "destructive" });
      return;
    }

    let embedData = null;
    if (formData.useEmbed) {
      embedData = {
        title: formData.embedTitle || undefined,
        description: formData.embedDescription || undefined,
        color: formData.embedColor,
        footer: formData.embedFooter ? { text: formData.embedFooter } : undefined,
        image: formData.embedImage ? { url: formData.embedImage } : undefined,
      };
    }

    let nextRunAt = null;
    let cronExpression = null;

    if (formData.scheduleType === "once") {
      if (!formData.oneTimeDate) {
        toast({ title: "Error", description: "Please select a date", variant: "destructive" });
        return;
      }
      nextRunAt = new Date(`${formData.oneTimeDate}T${formData.oneTimeTime}:00`).toISOString();
    } else {
      cronExpression = buildCronExpression();
    }

    const payload = {
      name: formData.name,
      content: formData.content || undefined,
      embedData,
      channelId: formData.channelId,
      scheduleType: formData.scheduleType,
      cronExpression,
      nextRunAt,
      timezone: formData.timezone,
      isEnabled: formData.isEnabled,
    };

    try {
      const url = editingPost
        ? `/api/servers/${selectedServerId}/scheduler/${editingPost.id}`
        : `/api/servers/${selectedServerId}/scheduler`;
      
      const res = await fetch(url, {
        method: editingPost ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast({ title: "Success", description: editingPost ? "Post updated" : "Post scheduled" });
        setIsDialogOpen(false);
        resetForm();
        fetchPosts();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error saving post:", error);
      toast({ title: "Error", description: "Failed to save post", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!selectedServerId) return;
    if (!confirm("Are you sure you want to delete this scheduled post?")) return;

    try {
      const res = await fetch(`/api/servers/${selectedServerId}/scheduler/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        toast({ title: "Success", description: "Post deleted" });
        fetchPosts();
      } else {
        toast({ title: "Error", description: "Failed to delete post", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      toast({ title: "Error", description: "Failed to delete post", variant: "destructive" });
    }
  };

  const handleRunNow = async (id: number) => {
    if (!selectedServerId) return;

    try {
      setRunningPostId(id);
      const res = await fetch(`/api/servers/${selectedServerId}/scheduler/${id}/run-now`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        toast({ title: "Success", description: "Post sent successfully!" });
        fetchPosts();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to send post", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error running post:", error);
      toast({ title: "Error", description: "Failed to send post", variant: "destructive" });
    } finally {
      setRunningPostId(null);
    }
  };

  const handleToggleEnabled = async (post: ScheduledPost) => {
    if (!selectedServerId) return;

    try {
      const res = await fetch(`/api/servers/${selectedServerId}/scheduler/${post.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isEnabled: !post.isEnabled }),
      });

      if (res.ok) {
        toast({ title: "Success", description: `Post ${!post.isEnabled ? "enabled" : "disabled"}` });
        fetchPosts();
      }
    } catch (error) {
      console.error("Error toggling post:", error);
    }
  };

  const formatNextRun = (dateStr: string | null) => {
    if (!dateStr) return "Not scheduled";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getChannelName = (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    return channel ? `#${channel.name}` : `#${channelId}`;
  };

  if (!selectedServerId) {
    return (
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardContent className="p-6 text-center text-discord-muted">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select a server to manage scheduled posts</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-discord-blue" />
              Content Scheduler
            </CardTitle>
            <p className="text-discord-muted text-sm mt-1">
              Schedule messages and embeds to be posted automatically
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchPosts} className="border-discord-dark">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="bg-discord-blue hover:bg-discord-blue/80">
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule Post
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-discord-sidebar border-discord-dark max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-white">
                    {editingPost ? "Edit Scheduled Post" : "Schedule New Post"}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-discord-text">Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Daily Announcement"
                      className="bg-discord-dark border-discord-dark text-white"
                    />
                  </div>

                  <div>
                    <Label className="text-discord-text">Channel</Label>
                    <Select 
                      value={formData.channelId} 
                      onValueChange={(v) => setFormData({ ...formData, channelId: v })}
                    >
                      <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent className="bg-discord-dark border-discord-dark">
                        {channels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id}>
                            <div className="flex items-center gap-2">
                              <Hash className="h-4 w-4 text-discord-muted" />
                              {channel.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-discord-text">Message Content</Label>
                    <Textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      placeholder="Enter your message..."
                      className="bg-discord-dark border-discord-dark text-white min-h-[100px]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.useEmbed}
                      onCheckedChange={(v) => setFormData({ ...formData, useEmbed: v })}
                    />
                    <Label className="text-discord-text">Include Embed</Label>
                  </div>

                  {formData.useEmbed && (
                    <Card className="bg-discord-dark border-discord-dark p-4 space-y-3">
                      <div>
                        <Label className="text-discord-text text-sm">Title</Label>
                        <Input
                          value={formData.embedTitle}
                          onChange={(e) => setFormData({ ...formData, embedTitle: e.target.value })}
                          className="bg-discord-sidebar border-discord-dark text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-discord-text text-sm">Description</Label>
                        <Textarea
                          value={formData.embedDescription}
                          onChange={(e) => setFormData({ ...formData, embedDescription: e.target.value })}
                          className="bg-discord-sidebar border-discord-dark text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-discord-text text-sm">Color</Label>
                          <Input
                            type="color"
                            value={formData.embedColor}
                            onChange={(e) => setFormData({ ...formData, embedColor: e.target.value })}
                            className="bg-discord-sidebar border-discord-dark h-10"
                          />
                        </div>
                        <div>
                          <Label className="text-discord-text text-sm">Footer Text</Label>
                          <Input
                            value={formData.embedFooter}
                            onChange={(e) => setFormData({ ...formData, embedFooter: e.target.value })}
                            className="bg-discord-sidebar border-discord-dark text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-discord-text text-sm">Image URL</Label>
                        <Input
                          value={formData.embedImage}
                          onChange={(e) => setFormData({ ...formData, embedImage: e.target.value })}
                          placeholder="https://..."
                          className="bg-discord-sidebar border-discord-dark text-white"
                        />
                      </div>
                    </Card>
                  )}

                  <Tabs 
                    value={formData.scheduleType} 
                    onValueChange={(v) => setFormData({ ...formData, scheduleType: v as "once" | "recurring" })}
                  >
                    <TabsList className="bg-discord-dark">
                      <TabsTrigger value="once" className="data-[state=active]:bg-discord-blue">
                        One-time
                      </TabsTrigger>
                      <TabsTrigger value="recurring" className="data-[state=active]:bg-discord-blue">
                        Recurring
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="once" className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-discord-text">Date</Label>
                          <Input
                            type="date"
                            value={formData.oneTimeDate}
                            onChange={(e) => setFormData({ ...formData, oneTimeDate: e.target.value })}
                            className="bg-discord-dark border-discord-dark text-white"
                          />
                        </div>
                        <div>
                          <Label className="text-discord-text">Time</Label>
                          <Input
                            type="time"
                            value={formData.oneTimeTime}
                            onChange={(e) => setFormData({ ...formData, oneTimeTime: e.target.value })}
                            className="bg-discord-dark border-discord-dark text-white"
                          />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="recurring" className="space-y-3">
                      <div>
                        <Label className="text-discord-text">Frequency</Label>
                        <Select 
                          value={formData.cronPreset} 
                          onValueChange={(v) => setFormData({ ...formData, cronPreset: v })}
                        >
                          <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-discord-dark border-discord-dark">
                            {CRON_PRESETS.map((preset) => (
                              <SelectItem key={preset.value} value={preset.value}>
                                <div>
                                  <div className="font-medium">{preset.label}</div>
                                  <div className="text-xs text-discord-muted">{preset.description}</div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-discord-text">Time</Label>
                        <Input
                          type="time"
                          value={formData.cronTime}
                          onChange={(e) => setFormData({ ...formData, cronTime: e.target.value })}
                          className="bg-discord-dark border-discord-dark text-white"
                        />
                      </div>
                    </TabsContent>
                  </Tabs>

                  <div>
                    <Label className="text-discord-text">Timezone</Label>
                    <Select 
                      value={formData.timezone} 
                      onValueChange={(v) => setFormData({ ...formData, timezone: v })}
                    >
                      <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-discord-dark border-discord-dark">
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.isEnabled}
                      onCheckedChange={(v) => setFormData({ ...formData, isEnabled: v })}
                    />
                    <Label className="text-discord-text">Enabled</Label>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="border-discord-dark">
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} className="bg-discord-blue hover:bg-discord-blue/80">
                    {editingPost ? "Update" : "Schedule"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-discord-blue" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-discord-muted">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No scheduled posts yet</p>
              <p className="text-sm">Click "Schedule Post" to create your first one</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <Card key={post.id} className="bg-discord-dark border-discord-dark">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-white font-medium">{post.name}</h3>
                          <Badge 
                            variant={post.isEnabled ? "default" : "secondary"}
                            className={post.isEnabled ? "bg-green-600" : "bg-discord-muted"}
                          >
                            {post.isEnabled ? "Active" : "Disabled"}
                          </Badge>
                          <Badge variant="outline" className="border-discord-blue text-discord-blue">
                            {post.scheduleType === "once" ? "One-time" : "Recurring"}
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-discord-muted space-y-1">
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4" />
                            {getChannelName(post.channelId)}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Next run: {formatNextRun(post.nextRunAt)}
                          </div>
                          {post.lastRunAt && (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              Last run: {formatNextRun(post.lastRunAt)}
                            </div>
                          )}
                        </div>

                        {post.content && (
                          <p className="text-discord-text text-sm mt-2 line-clamp-2">
                            {post.content}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={post.isEnabled}
                          onCheckedChange={() => handleToggleEnabled(post)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRunNow(post.id)}
                          disabled={runningPostId === post.id}
                          className="text-green-500 hover:text-green-400 hover:bg-green-500/10"
                          title="Run Now"
                        >
                          {runningPostId === post.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(post)}
                          className="text-discord-blue hover:text-discord-blue/80"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(post.id)}
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
