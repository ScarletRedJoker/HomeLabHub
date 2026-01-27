"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Server,
  Cpu,
  Wifi,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Wrench,
  RefreshCw,
  Activity,
  Zap,
  Loader2,
  Bot,
  Image,
  Video,
  Mic,
  Thermometer,
  HardDrive,
  Package,
  Play,
  Square,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface ServiceHealth {
  name: string;
  status: "online" | "offline" | "error" | "unknown";
  port: number;
  url: string;
  latency_ms?: number;
  details?: Record<string, unknown>;
  error?: string;
}

interface DetectedIssue {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  pattern: string;
  fix_action: string;
  auto_fixable: boolean;
}

interface PackageVersion {
  name: string;
  current: string | null;
  target: string;
  status: "ok" | "mismatch" | "missing" | "unknown";
}

interface GpuInfo {
  name: string;
  memory_used_mb: number;
  memory_total_mb: number;
  utilization_percent: number;
  temperature_c: number;
  status: "online" | "offline" | "error";
  error?: string;
}

interface DiagnosticData {
  success: boolean;
  timestamp: string;
  vm_ip: string;
  vm_reachable: boolean;
  services: Record<string, ServiceHealth>;
  gpu: GpuInfo | null;
  issues: DetectedIssue[];
  packages: PackageVersion[];
  error?: string;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  ollama: <Bot className="h-5 w-5" />,
  stable_diffusion: <Image className="h-5 w-5" />,
  comfyui: <Video className="h-5 w-5" />,
  whisper: <Mic className="h-5 w-5" />,
};

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  ollama: "Local LLM inference",
  stable_diffusion: "Image generation",
  comfyui: "AI workflows & video",
  whisper: "Speech-to-text",
};

export default function AINodesPage() {
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [repairLogs, setRepairLogs] = useState<string[]>([]);
  const { toast } = useToast();

  const fetchDiagnostics = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/node-manager");
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch diagnostics:", error);
      toast({
        title: "Error",
        description: "Failed to fetch AI node diagnostics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 30000);
    return () => clearInterval(interval);
  }, [fetchDiagnostics]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDiagnostics();
  };

  const handleAction = async (
    action: string,
    params?: Record<string, string>
  ) => {
    setActionLoading(action);
    try {
      const res = await fetch("/api/ai/node-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...params }),
      });
      const result = await res.json();

      if (result.success) {
        toast({
          title: "Action Completed",
          description: result.message || `${action} completed successfully`,
        });
        if (result.logs) {
          setRepairLogs((prev) => [...prev, ...result.logs]);
        }
        fetchDiagnostics();
      } else {
        toast({
          title: "Action Failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to execute ${action}`,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleFixIssue = async (issueId: string) => {
    await handleAction("fix-issue", { issue_id: issueId });
  };

  const handleRestartService = async (service: string) => {
    await handleAction("restart-service", { service });
  };

  const handleRepairAll = async () => {
    await handleAction("repair");
  };

  const handleUpdateDeps = async () => {
    await handleAction("update-deps");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
      case "ok":
        return "text-green-500";
      case "offline":
      case "missing":
        return "text-red-500";
      case "error":
      case "mismatch":
        return "text-yellow-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "online":
      case "ok":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Online</Badge>;
      case "offline":
      case "missing":
        return <Badge variant="destructive">Offline</Badge>;
      case "error":
      case "mismatch":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Error</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Activity className="h-5 w-5 text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Warning</Badge>;
      default:
        return <Badge variant="secondary">Info</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const servicesOnline = data?.services
    ? Object.values(data.services).filter((s) => s.status === "online").length
    : 0;
  const totalServices = data?.services ? Object.keys(data.services).length : 4;
  const criticalIssues = data?.issues?.filter((i) => i.severity === "critical").length || 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
              <Zap className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                AI Node Manager
              </h1>
              <p className="text-muted-foreground text-sm">
                NebulaAI Windows GPU Node • {data?.vm_ip || "Not configured"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={handleRepairAll}
            disabled={actionLoading !== null}
            className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
          >
            {actionLoading === "repair" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4 mr-2" />
            )}
            Repair All
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Services Online</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {servicesOnline}/{totalServices}
              </div>
              <Progress value={(servicesOnline / totalServices) * 100} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className={`border-l-4 ${data?.vm_reachable ? "border-l-green-500" : "border-l-red-500"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">VM Status</CardTitle>
              <Wifi className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {data?.vm_reachable ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="text-xl font-bold">{data?.vm_reachable ? "Connected" : "Offline"}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Tailscale: {data?.vm_ip}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className={`border-l-4 ${criticalIssues > 0 ? "border-l-red-500" : "border-l-green-500"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Issues Detected</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.issues?.length || 0}</div>
              {criticalIssues > 0 && (
                <p className="text-xs text-red-500 mt-1">{criticalIssues} critical issues</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">GPU Status</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {data?.gpu ? (
                <>
                  <div className="text-xl font-bold truncate">{data.gpu.name}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.gpu.utilization_percent}% util • {data.gpu.temperature_c}°C
                  </p>
                </>
              ) : (
                <div className="text-muted-foreground">No GPU data</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {data?.services &&
                Object.entries(data.services).map(([key, service], index) => (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-muted ${getStatusColor(service.status)}`}>
                              {SERVICE_ICONS[key] || <Server className="h-5 w-5" />}
                            </div>
                            <div>
                              <CardTitle className="text-lg">{service.name}</CardTitle>
                              <CardDescription>{SERVICE_DESCRIPTIONS[key]}</CardDescription>
                            </div>
                          </div>
                          {getStatusBadge(service.status)}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Port</span>
                          <span className="font-mono">{service.port}</span>
                        </div>
                        {service.latency_ms && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Latency</span>
                            <span className="font-mono">{service.latency_ms}ms</span>
                          </div>
                        )}
                        {service.error && (
                          <div className="text-sm text-red-500 bg-red-500/10 p-2 rounded">
                            {service.error}
                          </div>
                        )}
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleRestartService(key)}
                            disabled={actionLoading !== null}
                          >
                            {actionLoading === `restart-${key}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Restart
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(service.url, "_blank")}
                            disabled={service.status !== "online"}
                          >
                            Open
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>

          {data?.gpu && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  GPU Monitor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <HardDrive className="h-4 w-4" />
                        VRAM Usage
                      </span>
                      <span className="font-mono">
                        {Math.round(data.gpu.memory_used_mb / 1024 * 10) / 10} / {Math.round(data.gpu.memory_total_mb / 1024)} GB
                      </span>
                    </div>
                    <Progress 
                      value={(data.gpu.memory_used_mb / data.gpu.memory_total_mb) * 100} 
                      className="h-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Activity className="h-4 w-4" />
                        Utilization
                      </span>
                      <span className="font-mono">{data.gpu.utilization_percent}%</span>
                    </div>
                    <Progress value={data.gpu.utilization_percent} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Thermometer className="h-4 w-4" />
                        Temperature
                      </span>
                      <span className={`font-mono ${data.gpu.temperature_c > 80 ? "text-red-500" : data.gpu.temperature_c > 70 ? "text-yellow-500" : "text-green-500"}`}>
                        {data.gpu.temperature_c}°C
                      </span>
                    </div>
                    <Progress 
                      value={Math.min(data.gpu.temperature_c, 100)} 
                      className={`h-2 ${data.gpu.temperature_c > 80 ? "[&>div]:bg-red-500" : data.gpu.temperature_c > 70 ? "[&>div]:bg-yellow-500" : ""}`}
                    />
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-400">{data.gpu.name}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          {data?.issues && data.issues.length > 0 ? (
            <>
              <div className="flex justify-end">
                <Button
                  onClick={handleRepairAll}
                  disabled={actionLoading !== null}
                  className="bg-gradient-to-r from-purple-500 to-blue-500"
                >
                  {actionLoading === "repair" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Wrench className="h-4 w-4 mr-2" />
                  )}
                  Fix All Issues
                </Button>
              </div>
              <div className="space-y-3">
                <AnimatePresence>
                  {data.issues.map((issue, index) => (
                    <motion.div
                      key={issue.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className={`border-l-4 ${
                        issue.severity === "critical" 
                          ? "border-l-red-500" 
                          : issue.severity === "warning" 
                            ? "border-l-yellow-500" 
                            : "border-l-blue-500"
                      }`}>
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              {getSeverityIcon(issue.severity)}
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold">{issue.title}</span>
                                  {getSeverityBadge(issue.severity)}
                                </div>
                                <p className="text-sm text-muted-foreground">{issue.description}</p>
                              </div>
                            </div>
                            {issue.auto_fixable && (
                              <Button
                                size="sm"
                                onClick={() => handleFixIssue(issue.id)}
                                disabled={actionLoading !== null}
                              >
                                {actionLoading === `fix-${issue.id}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Wrench className="h-4 w-4 mr-1" />
                                    Auto-Fix
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">No Issues Detected</h3>
                <p className="text-muted-foreground">All AI services are running correctly.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="packages" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleAction("diagnose")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "diagnose" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Scan Packages
            </Button>
            <Button
              onClick={handleUpdateDeps}
              disabled={actionLoading !== null}
            >
              {actionLoading === "update-deps" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Package className="h-4 w-4 mr-2" />
              )}
              Update All
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Python Package Versions</CardTitle>
              <CardDescription>Target versions from ai-dependencies.json</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data?.packages?.map((pkg) => (
                  <div
                    key={pkg.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Package className={`h-4 w-4 ${getStatusColor(pkg.status)}`} />
                      <span className="font-mono font-medium">{pkg.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-mono text-sm">
                          {pkg.current || "Not installed"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Target: {pkg.target}
                        </div>
                      </div>
                      {pkg.status === "ok" ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : pkg.status === "mismatch" ? (
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      ) : pkg.status === "missing" ? (
                        <XCircle className="h-5 w-5 text-red-500" />
                      ) : (
                        <Activity className="h-5 w-5 text-gray-500" />
                      )}
                    </div>
                  </div>
                )) || (
                  <div className="text-center text-muted-foreground py-8">
                    No package data available. Click "Scan Packages" to refresh.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Repair Logs</CardTitle>
                  <CardDescription>Recent repair and update output</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRepairLogs([])}
                  disabled={repairLogs.length === 0}
                >
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] rounded-md border bg-black p-4 font-mono text-sm">
                {repairLogs.length === 0 ? (
                  <div className="text-muted-foreground text-center py-8">
                    No repair logs yet. Run a repair action to see output here.
                  </div>
                ) : (
                  repairLogs.map((log, i) => (
                    <div key={i} className="text-green-400 mb-1">
                      {log}
                    </div>
                  ))
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
