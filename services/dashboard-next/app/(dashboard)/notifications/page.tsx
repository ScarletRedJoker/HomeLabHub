"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Bell, 
  Check, 
  CheckCheck, 
  AlertTriangle, 
  Info, 
  AlertCircle, 
  CheckCircle2,
  Trash2,
  Plus,
  Settings,
  Webhook,
  Mail,
  RefreshCw,
  Server,
  Cpu,
  Radio,
  Cloud
} from "lucide-react";

interface Event {
  id: number;
  category: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, any> | null;
  channels: string[];
  read: boolean;
  createdAt: string;
}

interface Subscription {
  id: number;
  channel: string;
  webhookUrl: string | null;
  email: string | null;
  categories: string[];
  severities: string[];
  enabled: boolean;
}

const severityIcons: Record<string, any> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle2,
};

const severityColors: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  error: "bg-red-500/10 text-red-500 border-red-500/20",
  success: "bg-green-500/10 text-green-500 border-green-500/20",
};

const categoryIcons: Record<string, any> = {
  system: Settings,
  deployment: Cloud,
  server: Server,
  ai: Cpu,
  stream: Radio,
  discord: Bell,
  security: AlertTriangle,
  user: Bell,
};

export default function NotificationsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ category?: string; severity?: string }>({});
  const [showAddSubscription, setShowAddSubscription] = useState(false);
  const [newSub, setNewSub] = useState({ channel: "discord", webhookUrl: "", categories: [] as string[] });

  useEffect(() => {
    fetchEvents();
    fetchSubscriptions();

    const eventSource = new EventSource("/api/events/stream");
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type !== "connected") {
          setEvents(prev => [data, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    };

    return () => eventSource.close();
  }, []);

  async function fetchEvents() {
    try {
      const params = new URLSearchParams();
      if (filter.category) params.set("category", filter.category);
      if (filter.severity) params.set("severity", filter.severity);
      
      const res = await fetch(`/api/events?${params}`);
      const data = await res.json();
      setEvents(data.events || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSubscriptions() {
    try {
      const res = await fetch("/api/events/subscriptions");
      const data = await res.json();
      setSubscriptions(data.subscriptions || []);
    } catch (error) {
      console.error("Failed to fetch subscriptions:", error);
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" }),
      });
      setEvents(events.map(e => ({ ...e, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  }

  async function addSubscription() {
    try {
      const res = await fetch("/api/events/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSub),
      });
      const data = await res.json();
      if (data.subscription) {
        setSubscriptions([...subscriptions, data.subscription]);
        setShowAddSubscription(false);
        setNewSub({ channel: "discord", webhookUrl: "", categories: [] });
      }
    } catch (error) {
      console.error("Failed to add subscription:", error);
    }
  }

  async function deleteSubscription(id: number) {
    try {
      await fetch("/api/events/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setSubscriptions(subscriptions.filter(s => s.id !== id));
    } catch (error) {
      console.error("Failed to delete subscription:", error);
    }
  }

  async function testNotification() {
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "system",
          severity: "info",
          title: "Test Notification",
          message: "This is a test notification from Nebula Command",
          channels: ["dashboard", "discord"],
        }),
      });
    } catch (error) {
      console.error("Failed to send test notification:", error);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-1">
            Unified event notifications across all services
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchEvents}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={testNotification}>
            Send Test
          </Button>
          {unreadCount > 0 && (
            <Button onClick={markAllRead}>
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark All Read ({unreadCount})
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">
            Events
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <div className="flex gap-4">
            <Select value={filter.category || "all"} onValueChange={(v) => setFilter({ ...filter, category: v === "all" ? undefined : v })}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="deployment">Deployment</SelectItem>
                <SelectItem value="server">Server</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
                <SelectItem value="stream">Stream</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
                <SelectItem value="security">Security</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filter.severity || "all"} onValueChange={(v) => setFilter({ ...filter, severity: v === "all" ? undefined : v })}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={fetchEvents}>Apply Filter</Button>
          </div>

          <ScrollArea className="h-[600px]">
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading events...</div>
              ) : events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No events yet</div>
              ) : (
                events.map((event) => {
                  const SeverityIcon = severityIcons[event.severity] || Info;
                  const CategoryIcon = categoryIcons[event.category] || Bell;
                  
                  return (
                    <Card key={event.id} className={`${!event.read ? "border-l-4 border-l-primary" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-2 rounded-lg ${severityColors[event.severity] || ""}`}>
                            <SeverityIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">{event.title}</span>
                              <Badge variant="outline" className="text-xs">
                                <CategoryIcon className="h-3 w-3 mr-1" />
                                {event.category}
                              </Badge>
                              {!event.read && (
                                <Badge variant="default" className="text-xs">New</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{event.message}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span>{new Date(event.createdAt).toLocaleString()}</span>
                              {event.channels.length > 0 && (
                                <span>Sent to: {event.channels.join(", ")}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-muted-foreground">
              Configure where notifications are sent
            </p>
            <Button onClick={() => setShowAddSubscription(!showAddSubscription)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Subscription
            </Button>
          </div>

          {showAddSubscription && (
            <Card>
              <CardHeader>
                <CardTitle>New Subscription</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Channel</Label>
                    <Select value={newSub.channel} onValueChange={(v) => setNewSub({ ...newSub, channel: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discord">Discord Webhook</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newSub.channel === "discord" && (
                    <div>
                      <Label>Webhook URL</Label>
                      <Input 
                        value={newSub.webhookUrl} 
                        onChange={(e) => setNewSub({ ...newSub, webhookUrl: e.target.value })}
                        placeholder="https://discord.com/api/webhooks/..."
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={addSubscription}>Save</Button>
                  <Button variant="outline" onClick={() => setShowAddSubscription(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4">
            {subscriptions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No subscriptions configured. Add one to receive notifications.
                </CardContent>
              </Card>
            ) : (
              subscriptions.map((sub) => (
                <Card key={sub.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {sub.channel === "discord" ? (
                        <Webhook className="h-5 w-5 text-[#5865F2]" />
                      ) : (
                        <Mail className="h-5 w-5" />
                      )}
                      <div>
                        <div className="font-medium capitalize">{sub.channel}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-md">
                          {sub.webhookUrl || sub.email || "No endpoint configured"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Switch checked={sub.enabled} disabled />
                      <Button variant="ghost" size="icon" onClick={() => deleteSubscription(sub.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
