"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  Settings,
  User,
  Shield,
  Bell,
  Palette,
  Server,
  Key,
  Save,
  Loader2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

interface ServerConfig {
  id: string;
  name: string;
  host: string;
  user: string;
  status: "connected" | "disconnected" | "unknown";
}

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);
  const [servers, setServers] = useState<ServerConfig[]>([
    { id: "linode", name: "Linode Server", host: "linode.evindrake.net", user: "root", status: "unknown" },
    { id: "home", name: "Home Server", host: "host.evindrake.net", user: "evin", status: "unknown" },
  ]);
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const { toast } = useToast();

  const testConnection = async (serverId: string) => {
    setTestingServer(serverId);
    try {
      const res = await fetch("/api/servers");
      if (res.ok) {
        const data = await res.json();
        const serverData = data.servers?.find((s: any) => s.id === serverId);
        setServers((prev) =>
          prev.map((s) =>
            s.id === serverId
              ? { ...s, status: serverData?.status === "online" ? "connected" : "disconnected" }
              : s
          )
        );
        toast({
          title: serverData?.status === "online" ? "Connected" : "Disconnected",
          description: serverData?.status === "online" 
            ? `Successfully connected to ${serverId}` 
            : `Could not connect to ${serverId}`,
          variant: serverData?.status === "online" ? "default" : "destructive",
        });
      }
    } catch (error) {
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? { ...s, status: "disconnected" } : s))
      );
      toast({ title: "Error", description: "Connection test failed", variant: "destructive" });
    } finally {
      setTestingServer(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    toast({ title: "Saved", description: "Settings saved successfully" });
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your homelab configuration and preferences</p>
      </div>

      <Tabs defaultValue="servers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="servers" className="flex items-center gap-2">
            <Server className="h-4 w-4" /> Servers
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2">
            <Palette className="h-4 w-4" /> Appearance
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Server Connections</CardTitle>
              <CardDescription>Configure SSH connections to your homelab servers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {servers.map((server) => (
                <div key={server.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-full ${
                        server.status === "connected"
                          ? "bg-green-500/10 text-green-500"
                          : server.status === "disconnected"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {server.status === "connected" ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : server.status === "disconnected" ? (
                        <AlertCircle className="h-5 w-5" />
                      ) : (
                        <Server className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{server.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {server.user}@{server.host}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection(server.id)}
                    disabled={testingServer === server.id}
                  >
                    {testingServer === server.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="ml-2">Test</span>
                  </Button>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                SSH keys are managed on the server. Ensure your public key is in ~/.ssh/authorized_keys.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Integrations</CardTitle>
              <CardDescription>Status of connected services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { name: "OpenAI", status: "Active", desc: "AI assistance" },
                  { name: "Discord", status: "Active", desc: "Bot notifications" },
                  { name: "Twitch", status: "Active", desc: "Stream status" },
                  { name: "YouTube", status: "Active", desc: "Video uploads" },
                  { name: "Plex", status: "Local Only", desc: "Media server" },
                  { name: "Home Assistant", status: "Local Only", desc: "Smart home" },
                ].map((service) => (
                  <div key={service.name} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-xs text-muted-foreground">{service.desc}</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        service.status === "Active"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-yellow-500/10 text-yellow-500"
                      }`}
                    >
                      {service.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>Manage your account information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input defaultValue="Evin" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue="evin@evindrake.net" type="email" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input defaultValue="America/New_York" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Manage authentication settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Password</Label>
                <Input type="password" placeholder="Enter current password" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" placeholder="Enter new password" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input type="password" placeholder="Confirm new password" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Customize the dashboard appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Dark Mode</p>
                  <p className="text-sm text-muted-foreground">Use dark theme across the dashboard</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Compact Mode</p>
                  <p className="text-sm text-muted-foreground">Reduce spacing for more content</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sidebar Collapsed by Default</p>
                  <p className="text-sm text-muted-foreground">Start with minimized sidebar</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Configure how you receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Deployment Alerts</p>
                  <p className="text-sm text-muted-foreground">Get notified when deployments complete or fail</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Server Health Alerts</p>
                  <p className="text-sm text-muted-foreground">Alerts when CPU/RAM exceed thresholds</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Discord Notifications</p>
                  <p className="text-sm text-muted-foreground">Send alerts to Discord channel</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">Send important alerts via email</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
