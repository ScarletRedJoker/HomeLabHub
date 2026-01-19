"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Server,
  Cloud,
  Home,
  Laptop,
  Terminal,
  Wifi,
  WifiOff,
  RefreshCw,
  Key,
  KeyRound,
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Network,
  Globe,
  Container,
  Cpu,
  HardDrive,
  Play,
  Eye,
  Link2,
  ExternalLink,
  Copy,
  Check,
  Clock,
  Zap,
  Bot,
  Image,
  Video,
  Music,
  Tv,
  Database,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

type NodeType = "replit" | "linode" | "ubuntu-home" | "windows-vm";

interface ServiceInfo {
  name: string;
  type: "docker" | "pm2" | "native" | "agent";
  status: "online" | "offline" | "unknown";
  port?: number;
  node: NodeType;
}

interface NodeInfo {
  id: NodeType;
  name: string;
  description: string;
  hostname: string;
  tailscaleIp?: string;
  onTailscale: boolean;
  connectionType: "ssh" | "agent" | "local";
  status: "online" | "offline" | "unknown" | "degraded";
  lastHeartbeat?: string;
  sshConfig?: {
    host: string;
    user: string;
    port: number;
    keyConfigured: boolean;
  };
  services: ServiceInfo[];
  capabilities: string[];
  metrics?: {
    cpu?: number;
    memory?: number;
    disk?: number;
    uptime?: string;
  };
  error?: string;
}

interface SSHKeyStatus {
  exists: boolean;
  keyPath: string;
  format?: string;
  isPEMFormat: boolean;
  fingerprint?: string;
  publicKey?: string;
  error?: string;
}

interface ConnectionsData {
  timestamp: string;
  nodes: NodeInfo[];
  sshKeyStatus: SSHKeyStatus;
  tailscaleMesh: {
    nodes: Array<{
      id: NodeType;
      name: string;
      tailscaleIp?: string;
      connected: boolean;
    }>;
  };
  serviceDiscovery: ServiceInfo[];
  summary: {
    totalNodes: number;
    onlineNodes: number;
    totalServices: number;
    onlineServices: number;
  };
}

const nodeIcons: Record<NodeType, React.ReactNode> = {
  replit: <Terminal className="h-5 w-5" />,
  linode: <Cloud className="h-5 w-5" />,
  "ubuntu-home": <Home className="h-5 w-5" />,
  "windows-vm": <Laptop className="h-5 w-5" />,
};

const nodeColors: Record<NodeType, string> = {
  replit: "from-green-500 to-emerald-500",
  linode: "from-blue-500 to-cyan-500",
  "ubuntu-home": "from-orange-500 to-amber-500",
  "windows-vm": "from-purple-500 to-pink-500",
};

const serviceIcons: Record<string, React.ReactNode> = {
  "dashboard": <Server className="h-4 w-4" />,
  "discord bot": <Bot className="h-4 w-4" />,
  "stream bot": <Zap className="h-4 w-4" />,
  "ollama": <Cpu className="h-4 w-4" />,
  "stable diffusion": <Image className="h-4 w-4" />,
  "comfyui": <Video className="h-4 w-4" />,
  "plex": <Music className="h-4 w-4" />,
  "jellyfin": <Tv className="h-4 w-4" />,
  "postgresql": <Database className="h-4 w-4" />,
  "caddy": <Shield className="h-4 w-4" />,
  "home assistant": <Home className="h-4 w-4" />,
  "nebula agent": <Activity className="h-4 w-4" />,
  "dashboard-next": <Server className="h-4 w-4" />,
};

export default function ConnectionsPage() {
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pingLoading, setPingLoading] = useState<string | null>(null);
  const [sshKeyDialog, setSSHKeyDialog] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/connections", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch connections data");
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch connections data:", error);
      toast.error("Failed to fetch connection data");
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

  const handlePing = async (node: NodeInfo) => {
    setPingLoading(node.id);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ping",
          target: node.id,
          host: node.sshConfig?.host || node.hostname,
          user: node.sshConfig?.user,
          port: node.sshConfig?.port,
        }),
      });
      const result = await res.json();
      
      if (result.success) {
        toast.success(`${node.name} is reachable${result.latency ? ` (${result.latency}ms)` : ""}`);
      } else {
        toast.error(`${node.name}: ${result.error || "Connection failed"}`);
      }
    } catch (error) {
      toast.error(`Failed to ping ${node.name}`);
    } finally {
      setPingLoading(null);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "online":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <Wifi className="h-3 w-3 mr-1" />
            Online
          </Badge>
        );
      case "offline":
        return (
          <Badge variant="destructive">
            <WifiOff className="h-3 w-3 mr-1" />
            Offline
          </Badge>
        );
      case "degraded":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Degraded
          </Badge>
        );
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getServiceIcon = (name: string) => {
    const key = name.toLowerCase();
    return serviceIcons[key] || <Container className="h-4 w-4" />;
  };

  const formatLastSeen = (timestamp?: string) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading connections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
            <Network className="h-8 w-8 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Connection Manager
            </h1>
            <p className="text-sm text-muted-foreground">
              Network topology and node status
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Nodes Online</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.summary.onlineNodes || 0}/{data?.summary.totalNodes || 0}
            </div>
            <Progress
              value={data ? (data.summary.onlineNodes / Math.max(data.summary.totalNodes, 1)) * 100 : 0}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Services Active</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.summary.onlineServices || 0}/{data?.summary.totalServices || 0}
            </div>
            <Progress
              value={data ? (data.summary.onlineServices / Math.max(data.summary.totalServices, 1)) * 100 : 0}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tailscale Mesh</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.tailscaleMesh.nodes.filter(n => n.connected).length || 0}/{data?.tailscaleMesh.nodes.length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Connected nodes</p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${data?.sshKeyStatus.exists && data?.sshKeyStatus.isPEMFormat ? "border-l-green-500" : "border-l-yellow-500"}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SSH Key</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {data?.sshKeyStatus.exists ? (
                data?.sshKeyStatus.isPEMFormat ? "Configured" : "Invalid Format"
              ) : (
                "Missing"
              )}
            </div>
            <Button
              variant="link"
              className="p-0 h-auto text-xs"
              onClick={() => setSSHKeyDialog(true)}
            >
              View details
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="nodes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="nodes">Node Status</TabsTrigger>
          <TabsTrigger value="ssh">SSH Manager</TabsTrigger>
          <TabsTrigger value="tailscale">Tailscale Mesh</TabsTrigger>
          <TabsTrigger value="services">Service Discovery</TabsTrigger>
        </TabsList>

        <TabsContent value="nodes" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {data?.nodes.map((node) => (
              <Card key={node.id} className="overflow-hidden">
                <CardHeader className={`bg-gradient-to-r ${nodeColors[node.id]} p-4`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
                        {nodeIcons[node.id]}
                      </div>
                      <div>
                        <CardTitle className="text-white text-lg">{node.name}</CardTitle>
                        <CardDescription className="text-white/80 text-sm">
                          {node.description}
                        </CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(node.status)}
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Hostname:</span>
                      <p className="font-mono text-xs truncate">{node.hostname}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Connection:</span>
                      <p className="capitalize">{node.connectionType}</p>
                    </div>
                    {node.tailscaleIp && (
                      <div>
                        <span className="text-muted-foreground">Tailscale IP:</span>
                        <p className="font-mono text-xs">{node.tailscaleIp}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Last Seen:</span>
                      <p className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatLastSeen(node.lastHeartbeat)}
                      </p>
                    </div>
                  </div>

                  {node.error && (
                    <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                      <AlertTriangle className="h-4 w-4 inline mr-2" />
                      {node.error}
                    </div>
                  )}

                  <div>
                    <span className="text-sm text-muted-foreground mb-2 block">Services ({node.services.length})</span>
                    <div className="flex flex-wrap gap-1">
                      {node.services.slice(0, 5).map((svc) => (
                        <Badge
                          key={svc.name}
                          variant={svc.status === "online" ? "default" : "secondary"}
                          className={`text-xs ${svc.status === "online" ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}`}
                        >
                          {getServiceIcon(svc.name)}
                          <span className="ml-1">{svc.name}</span>
                        </Badge>
                      ))}
                      {node.services.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{node.services.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {node.capabilities.slice(0, 4).map((cap) => (
                      <Badge key={cap} variant="outline" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePing(node)}
                      disabled={pingLoading === node.id || node.id === "replit"}
                    >
                      {pingLoading === node.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                      <span className="ml-1">Ping</span>
                    </Button>
                    {node.sshConfig && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            `ssh ${node.sshConfig!.user}@${node.sshConfig!.host}`,
                            "SSH command"
                          )
                        }
                      >
                        {copiedText === "SSH command" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        <span className="ml-1">SSH</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ssh" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                SSH Key Status
              </CardTitle>
              <CardDescription>
                SSH key configuration for remote node access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {data?.sshKeyStatus.exists ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="font-medium">
                      Key {data?.sshKeyStatus.exists ? "Found" : "Not Found"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Path: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{data?.sshKeyStatus.keyPath}</code>
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {data?.sshKeyStatus.isPEMFormat ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    )}
                    <span className="font-medium">
                      Format: {data?.sshKeyStatus.format || "Unknown"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {data?.sshKeyStatus.isPEMFormat
                      ? "Key is in a compatible format"
                      : "Key may need conversion to PEM format"}
                  </p>
                </div>
              </div>

              {data?.sshKeyStatus.fingerprint && (
                <div className="p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground block mb-1">Fingerprint:</span>
                  <code className="text-xs font-mono break-all">{data.sshKeyStatus.fingerprint}</code>
                </div>
              )}

              {data?.sshKeyStatus.publicKey && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Public Key</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(data.sshKeyStatus.publicKey!, "Public key")}
                    >
                      {copiedText === "Public key" ? (
                        <Check className="h-4 w-4 mr-1" />
                      ) : (
                        <Copy className="h-4 w-4 mr-1" />
                      )}
                      Copy
                    </Button>
                  </div>
                  <div className="p-3 bg-muted rounded-lg overflow-auto max-h-24">
                    <code className="text-xs font-mono break-all whitespace-pre-wrap">
                      {data.sshKeyStatus.publicKey}
                    </code>
                  </div>
                </div>
              )}

              {!data?.sshKeyStatus.exists && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <h4 className="font-medium text-yellow-500 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    SSH Key Required
                  </h4>
                  <p className="text-sm text-muted-foreground mt-2">
                    To connect to remote nodes, you need to configure an SSH key. 
                    Add your private key to the Secrets manager with the key name <code className="bg-muted px-1 py-0.5 rounded">SSH_PRIVATE_KEY</code>.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <a href="/settings" target="_blank">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Settings
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SSH Connection Strings</CardTitle>
              <CardDescription>Quick access to SSH commands for each node</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data?.nodes
                  .filter((n) => n.sshConfig)
                  .map((node) => (
                    <div
                      key={node.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-gradient-to-r ${nodeColors[node.id]}`}>
                          {nodeIcons[node.id]}
                        </div>
                        <div>
                          <p className="font-medium">{node.name}</p>
                          <code className="text-xs font-mono text-muted-foreground">
                            ssh {node.sshConfig!.user}@{node.sshConfig!.host}
                          </code>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {node.sshConfig?.keyConfigured ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            <Key className="h-3 w-3 mr-1" />
                            Key OK
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            No Key
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            copyToClipboard(
                              `ssh ${node.sshConfig!.user}@${node.sshConfig!.host}`,
                              node.name
                            )
                          }
                        >
                          {copiedText === node.name ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tailscale" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Tailscale Mesh Network
              </CardTitle>
              <CardDescription>
                Peer-to-peer network connecting all nodes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data?.tailscaleMesh.nodes.map((node) => {
                  const fullNode = data.nodes.find((n) => n.id === node.id);
                  return (
                    <Card key={node.id} className={`border-2 ${node.connected ? "border-green-500/50" : "border-red-500/50"}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg bg-gradient-to-r ${nodeColors[node.id]}`}>
                              {nodeIcons[node.id]}
                            </div>
                            <span className="font-medium">{node.name}</span>
                          </div>
                          {node.connected ? (
                            <div className="flex items-center gap-1 text-green-500">
                              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-xs">Connected</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-500">
                              <div className="h-2 w-2 rounded-full bg-red-500" />
                              <span className="text-xs">Disconnected</span>
                            </div>
                          )}
                        </div>
                        {node.tailscaleIp && (
                          <div className="flex items-center justify-between p-2 bg-muted rounded">
                            <code className="text-sm font-mono">{node.tailscaleIp}</code>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => copyToClipboard(node.tailscaleIp!, `${node.name} IP`)}
                            >
                              {copiedText === `${node.name} IP` ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-1">
                          {fullNode?.capabilities
                            .filter((c) => ["gpu", "ai", "media", "tailscale"].includes(c))
                            .map((cap) => (
                              <Badge key={cap} variant="outline" className="text-xs">
                                {cap}
                              </Badge>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Network Topology</h4>
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  {data?.tailscaleMesh.nodes.map((node, index) => (
                    <div key={node.id} className="flex items-center gap-2">
                      <div
                        className={`p-3 rounded-full ${
                          node.connected ? "bg-green-500/20" : "bg-red-500/20"
                        }`}
                      >
                        {nodeIcons[node.id]}
                      </div>
                      {index < data.tailscaleMesh.nodes.length - 1 && (
                        <div className="flex items-center gap-1">
                          <div className={`h-0.5 w-8 ${node.connected ? "bg-green-500" : "bg-red-500"}`} />
                          <Link2 className={`h-4 w-4 ${node.connected ? "text-green-500" : "text-red-500"}`} />
                          <div className={`h-0.5 w-8 ${data.tailscaleMesh.nodes[index + 1]?.connected ? "bg-green-500" : "bg-red-500"}`} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Container className="h-5 w-5" />
                Service Discovery
              </CardTitle>
              <CardDescription>
                All known services across deployment nodes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {data?.serviceDiscovery.map((service, index) => {
                    const node = data.nodes.find((n) => n.id === service.node);
                    return (
                      <div
                        key={`${service.name}-${service.node}-${index}`}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg bg-gradient-to-r ${nodeColors[service.node] || "from-gray-500 to-gray-600"}`}>
                            {getServiceIcon(service.name)}
                          </div>
                          <div>
                            <p className="font-medium">{service.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{node?.name || service.node}</span>
                              {service.port && (
                                <>
                                  <span>•</span>
                                  <span>Port {service.port}</span>
                                </>
                              )}
                              <span>•</span>
                              <Badge variant="outline" className="text-xs">
                                {service.type}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {service.status === "online" ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Online
                            </Badge>
                          ) : service.status === "offline" ? (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Offline
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Unknown
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {data?.nodes.map((node) => {
              const nodeServices = data.serviceDiscovery.filter((s) => s.node === node.id);
              const onlineCount = nodeServices.filter((s) => s.status === "online").length;
              
              return (
                <Card key={node.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className={`p-1.5 rounded bg-gradient-to-r ${nodeColors[node.id]}`}>
                        {nodeIcons[node.id]}
                      </div>
                      {node.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {onlineCount}/{nodeServices.length}
                    </div>
                    <Progress
                      value={(onlineCount / Math.max(nodeServices.length, 1)) * 100}
                      className="mt-2 h-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Services online
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={sshKeyDialog} onOpenChange={setSSHKeyDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              SSH Key Details
            </DialogTitle>
            <DialogDescription>
              SSH key configuration for remote server access
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <span className="text-sm font-medium">Status</span>
                <div className="flex items-center gap-2">
                  {data?.sshKeyStatus.exists ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-green-500">Key Found</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-red-500">Key Not Found</span>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-sm font-medium">Format</span>
                <div className="flex items-center gap-2">
                  {data?.sshKeyStatus.isPEMFormat ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{data?.sshKeyStatus.format} (Compatible)</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span>{data?.sshKeyStatus.format || "Unknown"}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-sm font-medium">Key Path</span>
              <code className="block p-2 bg-muted rounded text-sm font-mono">
                {data?.sshKeyStatus.keyPath}
              </code>
            </div>

            {data?.sshKeyStatus.fingerprint && (
              <div className="space-y-1">
                <span className="text-sm font-medium">Fingerprint</span>
                <code className="block p-2 bg-muted rounded text-xs font-mono break-all">
                  {data.sshKeyStatus.fingerprint}
                </code>
              </div>
            )}

            {data?.sshKeyStatus.publicKey && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Public Key</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(data.sshKeyStatus.publicKey!, "Public key")}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
                <code className="block p-2 bg-muted rounded text-xs font-mono break-all max-h-32 overflow-auto">
                  {data.sshKeyStatus.publicKey}
                </code>
              </div>
            )}

            {data?.sshKeyStatus.error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">
                <AlertTriangle className="h-4 w-4 inline mr-2" />
                {data.sshKeyStatus.error}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
