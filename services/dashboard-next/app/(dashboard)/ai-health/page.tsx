"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  Thermometer,
  HardDrive,
  Package,
  Play,
  Terminal,
  AlertCircle,
  Clock,
  Shield,
  FileText,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface ServiceStatus {
  name: string;
  status: "running" | "stopped" | "error" | "unknown";
  port: number;
  url: string;
  latencyMs?: number;
  version?: string;
  error?: string;
}

interface DependencyStatus {
  name: string;
  status: "installed" | "missing" | "outdated" | "error" | "unknown";
  currentVersion?: string;
  requiredVersion?: string;
  error?: string;
}

interface GpuStats {
  name: string;
  driver: string;
  cudaVersion: string;
  vramTotalMb: number;
  vramUsedMb: number;
  vramFreeMb: number;
  utilizationPercent: number;
  temperatureC: number;
  status: "healthy" | "warning" | "error";
}

interface DiagnosticCheck {
  name: string;
  passed: boolean;
  message: string;
  command?: string;
  output?: string;
}

interface RepairAction {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  actionType: "restart" | "install" | "update" | "fix" | "manual";
  actionCommand?: string;
  autoFixable: boolean;
}

interface LogEntry {
  timestamp: string;
  level: "error" | "warning" | "info";
  service: string;
  message: string;
}

interface WindowsHealthReport {
  success: boolean;
  timestamp: string;
  vmIp: string;
  vmReachable: boolean;
  agentVersion?: string;
  services: ServiceStatus[];
  dependencies: DependencyStatus[];
  gpu: GpuStats | null;
  diagnostics: DiagnosticCheck[];
  repairActions: RepairAction[];
  recentLogs: LogEntry[];
  summary: {
    servicesOnline: number;
    servicesTotal: number;
    criticalIssues: number;
    warningIssues: number;
    overallHealth: "healthy" | "degraded" | "critical";
  };
  error?: string;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  Ollama: <Bot className="h-5 w-5" />,
  "Stable Diffusion WebUI": <Image className="h-5 w-5" />,
  ComfyUI: <Video className="h-5 w-5" />,
  "Nebula Agent": <Shield className="h-5 w-5" />,
};

export default function AIHealthPage() {
  const [data, setData] = useState<WindowsHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  const fetchHealthData = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/windows-health");
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch health data:", error);
      toast({
        title: "Error",
        description: "Failed to fetch Windows AI health status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchHealthData();
    const interval = setInterval(fetchHealthData, 30000);
    return () => clearInterval(interval);
  }, [fetchHealthData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHealthData();
  };

  const handleRepairAction = async (action: string, params?: Record<string, string>) => {
    setActionLoading(action);
    try {
      const res = await fetch("/api/ai/windows-health", {
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
        fetchHealthData();
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
      case "installed":
      case "healthy":
        return "text-green-500";
      case "stopped":
      case "missing":
      case "critical":
        return "text-red-500";
      case "error":
      case "outdated":
      case "warning":
      case "degraded":
        return "text-yellow-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
      case "installed":
      case "healthy":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{status}</Badge>;
      case "stopped":
      case "missing":
      case "critical":
        return <Badge variant="destructive">{status}</Badge>;
      case "error":
      case "outdated":
      case "warning":
      case "degraded":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">{status}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-blue-500" />;
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case "healthy":
        return "from-green-500 to-emerald-500";
      case "degraded":
        return "from-yellow-500 to-orange-500";
      case "critical":
        return "from-red-500 to-rose-500";
      default:
        return "from-gray-500 to-slate-500";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Loading Windows AI Health Status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${data?.summary ? getHealthColor(data.summary.overallHealth) : 'from-gray-500 to-slate-500'} border border-white/20`}>
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Windows AI Health
              </h1>
              <p className="text-muted-foreground text-sm">
                NebulaAI Stack • {data?.vmIp || "100.118.44.102"}
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
            onClick={() => handleRepairAction("repair_all")}
            disabled={actionLoading !== null}
            className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
          >
            {actionLoading === "repair_all" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4 mr-2" />
            )}
            Run Full Diagnostics
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className={`border-l-4 ${data?.vmReachable ? "border-l-green-500" : "border-l-red-500"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">VM Status</CardTitle>
              <Wifi className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {data?.vmReachable ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="text-xl font-bold">{data?.vmReachable ? "Connected" : "Offline"}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Tailscale: {data?.vmIp}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Services</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.summary?.servicesOnline || 0}/{data?.summary?.servicesTotal || 0}
              </div>
              <Progress
                value={data?.summary ? (data.summary.servicesOnline / data.summary.servicesTotal) * 100 : 0}
                className="mt-2 h-2"
              />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className={`border-l-4 ${(data?.summary?.criticalIssues || 0) > 0 ? "border-l-red-500" : "border-l-green-500"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-red-500">{data?.summary?.criticalIssues || 0}</span>
                <span className="text-sm text-muted-foreground">critical</span>
                <span className="text-2xl font-bold text-yellow-500">{data?.summary?.warningIssues || 0}</span>
                <span className="text-sm text-muted-foreground">warnings</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">GPU</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {data?.gpu ? (
                <>
                  <div className="text-lg font-bold truncate">{data.gpu.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Thermometer className="h-3 w-3" />
                    <span className={data.gpu.temperatureC > 80 ? "text-red-500" : data.gpu.temperatureC > 70 ? "text-yellow-500" : ""}>
                      {data.gpu.temperatureC}°C
                    </span>
                    <span>•</span>
                    <span>{data.gpu.utilizationPercent}% util</span>
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">No GPU data</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {data?.gpu && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  GPU Monitor
                </CardTitle>
                <CardDescription>
                  {data.gpu.name} • Driver {data.gpu.driver} • CUDA {data.gpu.cudaVersion}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <HardDrive className="h-4 w-4" />
                        VRAM Usage
                      </span>
                      <span className="font-mono">
                        {Math.round(data.gpu.vramUsedMb / 1024 * 10) / 10} / {Math.round(data.gpu.vramTotalMb / 1024)} GB
                      </span>
                    </div>
                    <Progress
                      value={(data.gpu.vramUsedMb / data.gpu.vramTotalMb) * 100}
                      className="h-3"
                    />
                    <p className="text-xs text-muted-foreground">
                      {Math.round(data.gpu.vramFreeMb / 1024 * 10) / 10} GB free
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Activity className="h-4 w-4" />
                        Utilization
                      </span>
                      <span className="font-mono">{data.gpu.utilizationPercent}%</span>
                    </div>
                    <Progress value={data.gpu.utilizationPercent} className="h-3" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Thermometer className="h-4 w-4" />
                        Temperature
                      </span>
                      <span className={`font-mono ${data.gpu.temperatureC > 80 ? "text-red-500" : data.gpu.temperatureC > 70 ? "text-yellow-500" : "text-green-500"}`}>
                        {data.gpu.temperatureC}°C
                      </span>
                    </div>
                    <Progress
                      value={Math.min(data.gpu.temperatureC, 100)}
                      className={`h-3 ${data.gpu.temperatureC > 80 ? "[&>div]:bg-red-500" : data.gpu.temperatureC > 70 ? "[&>div]:bg-yellow-500" : ""}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {data?.repairActions && data.repairActions.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" />
                      Recommended Actions
                    </CardTitle>
                    <CardDescription>
                      {data.repairActions.length} issue{data.repairActions.length !== 1 ? "s" : ""} detected
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => handleRepairAction("repair_all")}
                    disabled={actionLoading !== null}
                    size="sm"
                  >
                    {actionLoading === "repair_all" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Wrench className="h-4 w-4 mr-1" />
                        Fix All
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.repairActions.slice(0, 5).map((action, idx) => (
                    <motion.div
                      key={action.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`flex items-start justify-between p-3 rounded-lg border ${
                        action.severity === "critical"
                          ? "border-red-500/30 bg-red-500/5"
                          : action.severity === "warning"
                          ? "border-yellow-500/30 bg-yellow-500/5"
                          : "border-blue-500/30 bg-blue-500/5"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getSeverityIcon(action.severity)}
                        <div>
                          <div className="font-medium">{action.title}</div>
                          <p className="text-sm text-muted-foreground">{action.description}</p>
                        </div>
                      </div>
                      {action.autoFixable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (action.actionType === "restart") {
                              handleRepairAction("restart_service", { service: action.actionCommand || "" });
                            } else if (action.actionType === "install" || action.actionType === "update" || action.actionType === "fix") {
                              handleRepairAction("run_command", { command: action.actionCommand || "" });
                            }
                          }}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === action.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Play className="h-3 w-3 mr-1" />
                              Fix
                            </>
                          )}
                        </Button>
                      )}
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(!data?.repairActions || data.repairActions.length === 0) && data?.vmReachable && (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">All Systems Healthy</h3>
                <p className="text-muted-foreground">No issues detected with the Windows AI stack.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {data?.services?.map((service, index) => (
                <motion.div
                  key={service.name}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg bg-muted ${getStatusColor(service.status)}`}>
                            {SERVICE_ICONS[service.name] || <Server className="h-5 w-5" />}
                          </div>
                          <div>
                            <CardTitle className="text-lg">{service.name}</CardTitle>
                            <CardDescription>Port {service.port}</CardDescription>
                          </div>
                        </div>
                        {getStatusBadge(service.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {service.latencyMs && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Latency</span>
                          <span className="font-mono">{service.latencyMs}ms</span>
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
                          onClick={() => handleRepairAction("restart_service", {
                            service: service.name.toLowerCase().replace(/\s+/g, "_")
                          })}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === `restart-${service.name}` ? (
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
                          disabled={service.status !== "running"}
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
        </TabsContent>

        <TabsContent value="dependencies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Python Dependencies
              </CardTitle>
              <CardDescription>Required packages for AI services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data?.dependencies?.map((dep, idx) => (
                  <motion.div
                    key={dep.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        dep.status === "installed" ? "bg-green-500" :
                        dep.status === "outdated" ? "bg-yellow-500" :
                        dep.status === "missing" ? "bg-red-500" : "bg-gray-500"
                      }`} />
                      <div>
                        <span className="font-mono font-medium">{dep.name}</span>
                        {dep.currentVersion && (
                          <span className="text-sm text-muted-foreground ml-2">
                            v{dep.currentVersion}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Required: {dep.requiredVersion}
                      </span>
                      {getStatusBadge(dep.status)}
                      {(dep.status === "missing" || dep.status === "outdated") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRepairAction("fix_dependency", { dependency: dep.name })}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === `fix-${dep.name}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wrench className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostics" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="h-5 w-5" />
                    Diagnostic Checks
                  </CardTitle>
                  <CardDescription>System component verification</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRepairAction("repair_all")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "repair_all" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Rerun All
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data?.diagnostics?.map((check, idx) => (
                  <motion.div
                    key={check.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`p-4 rounded-lg border ${
                      check.passed ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {check.passed ? (
                          <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                        )}
                        <div>
                          <div className="font-medium">{check.name}</div>
                          <p className="text-sm text-muted-foreground">{check.message}</p>
                          {check.command && (
                            <code className="text-xs bg-muted px-2 py-1 rounded mt-2 block">
                              $ {check.command}
                            </code>
                          )}
                        </div>
                      </div>
                      {getStatusBadge(check.passed ? "passed" : "failed")}
                    </div>
                  </motion.div>
                ))}
                {(!data?.diagnostics || data.diagnostics.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No diagnostic data available</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => handleRepairAction("repair_all")}
                    >
                      Run Diagnostics
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Logs
              </CardTitle>
              <CardDescription>Latest entries from AI services</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {data?.recentLogs && data.recentLogs.length > 0 ? (
                  <div className="space-y-2">
                    {data.recentLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg text-sm font-mono ${
                          log.level === "error"
                            ? "bg-red-500/10 border border-red-500/20"
                            : log.level === "warning"
                            ? "bg-yellow-500/10 border border-yellow-500/20"
                            : "bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                          <Badge variant="outline" className="text-xs">
                            {log.service}
                          </Badge>
                          <Badge
                            className={
                              log.level === "error"
                                ? "bg-red-500/20 text-red-500"
                                : log.level === "warning"
                                ? "bg-yellow-500/20 text-yellow-500"
                                : "bg-blue-500/20 text-blue-500"
                            }
                          >
                            {log.level}
                          </Badge>
                        </div>
                        <p className="text-xs break-all">{log.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No recent logs available</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="text-center text-xs text-muted-foreground">
        Last updated: {data?.timestamp ? new Date(data.timestamp).toLocaleString() : "Never"}
      </div>
    </div>
  );
}
