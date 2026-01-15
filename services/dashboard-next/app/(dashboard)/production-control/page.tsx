"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Cloud,
  Home,
  Laptop,
  Rocket,
  RotateCcw,
  Shield,
  Wifi,
  WifiOff,
  Image,
  Power,
  GitBranch,
  Cpu,
  HardDrive,
  Activity,
  Terminal,
  ChevronDown,
  ChevronRight,
  Zap,
  Server,
  Key,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

interface NodeStatus {
  id: string;
  name: string;
  tailscaleIp: string;
  status: "online" | "offline" | "unknown";
  responseTime?: number;
  error?: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  details?: string;
}

interface ProductionStatus {
  nodes: NodeStatus[];
  checklist: ChecklistItem[];
  sdModel: {
    available: boolean;
    currentModel: string | null;
    modelLoading: boolean;
    error: string | null;
  };
  timestamp: string;
}

interface SDModelsResponse {
  available: boolean;
  currentModel: string | null;
  modelLoading: boolean;
  models: { title: string; model_name: string }[];
  error?: string;
}

interface DiagnosticResult {
  step: string;
  status: "pass" | "fail" | "warning" | "info";
  message: string;
  details?: any;
  duration?: number;
}

interface AgentTestResult {
  success: boolean;
  diagnostics: DiagnosticResult[];
  summary: {
    reachable: boolean;
    authenticated: boolean;
    agentVersion?: string;
    hostname?: string;
    platform?: string;
    uptime?: number;
    services?: Record<string, { status: string; port?: number }>;
    gpu?: any;
    models?: any;
  };
  config: {
    host: string;
    port: number;
    tokenConfigured: boolean;
    tokenSource: string;
  };
  timestamp: string;
}

const nodeIcons: Record<string, LucideIcon> = {
  linode: Cloud,
  ubuntu: Home,
  windows: Laptop,
};

export default function ProductionControlPage() {
  const [status, setStatus] = useState<ProductionStatus | null>(null);
  const [sdModels, setSdModels] = useState<SDModelsResponse | null>(null);
  const [agentTest, setAgentTest] = useState<AgentTestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState(15);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    try {
      const [statusRes, modelsRes] = await Promise.all([
        fetch("/api/production/status", { cache: "no-store" }),
        fetch("/api/production/sd-models", { cache: "no-store" }),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
      }

      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setSdModels(data);
      }

      setCountdown(15);
    } catch (error) {
      console.error("Failed to fetch production status:", error);
      toast.error("Failed to fetch production status");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 15));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleTestConnection = async () => {
    setActionLoading((prev) => ({ ...prev, testConnection: true }));
    try {
      const res = await fetch("/api/agent/test-connection", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAgentTest(data);
        setDiagnosticsOpen(true);
        if (data.success) {
          toast.success("Windows agent connection successful!");
        } else if (data.summary.reachable && !data.summary.authenticated) {
          toast.error("Agent reachable but authentication failed - check token");
        } else {
          toast.error("Connection test failed - see diagnostics");
        }
      } else {
        toast.error("Failed to run connection test");
      }
    } catch (error) {
      toast.error("Connection test failed");
    } finally {
      setActionLoading((prev) => ({ ...prev, testConnection: false }));
    }
  };

  const handleWakeVM = async () => {
    setActionLoading((prev) => ({ ...prev, wake: true }));
    try {
      const res = await fetch("/api/deploy/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "wake", waitForOnline: true }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Wake-on-LAN sent successfully");
        setTimeout(() => fetchData(true), 2000);
      } else {
        toast.error(data.error || "Failed to wake VM");
      }
    } catch (error) {
      toast.error("Failed to send wake command");
    } finally {
      setActionLoading((prev) => ({ ...prev, wake: false }));
    }
  };

  const handleGitPull = async () => {
    setActionLoading((prev) => ({ ...prev, gitPull: true }));
    try {
      const res = await fetch("/api/deploy/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "git-pull" }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Git pull completed");
      } else {
        toast.error(data.error || "Git pull failed");
      }
    } catch (error) {
      toast.error("Git pull failed");
    } finally {
      setActionLoading((prev) => ({ ...prev, gitPull: false }));
    }
  };

  const handleRestartWindowsService = async (service: string) => {
    setActionLoading((prev) => ({ ...prev, [`restart-${service}`]: true }));
    try {
      const res = await fetch("/api/deploy/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart-service", service }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${service} restarted`);
        setTimeout(() => handleTestConnection(), 2000);
      } else {
        toast.error(data.error || `Failed to restart ${service}`);
      }
    } catch (error) {
      toast.error(`Failed to restart ${service}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [`restart-${service}`]: false }));
    }
  };

  const handleDeployAll = async () => {
    setActionLoading((prev) => ({ ...prev, deployAll: true }));
    try {
      const results = await Promise.all([
        fetch("/api/deploy/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverId: "linode" }),
        }),
        fetch("/api/deploy/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverId: "home" }),
        }),
      ]);

      const allSuccess = results.every((r) => r.ok);
      if (allSuccess) {
        toast.success("Deployment initiated to all servers");
      } else {
        toast.warning("Some deployments may have failed");
      }
    } catch (error) {
      toast.error("Failed to deploy to servers");
    } finally {
      setActionLoading((prev) => ({ ...prev, deployAll: false }));
    }
  };

  const handleRestartServices = async () => {
    setActionLoading((prev) => ({ ...prev, restart: true }));
    try {
      const results = await Promise.all([
        fetch("/api/services/restart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services: ["discord-bot", "stream-bot", "dashboard"] }),
        }).catch(() => ({ ok: false })),
        fetch("/api/vm/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restart", service: "ollama" }),
        }).catch(() => ({ ok: false })),
      ]);
      
      const successCount = results.filter(r => r.ok).length;
      if (successCount === results.length) {
        toast.success("All services restarting");
      } else if (successCount > 0) {
        toast.warning(`Restarted ${successCount}/${results.length} service groups`);
      } else {
        toast.error("Failed to restart services - check server connectivity");
      }
      setTimeout(() => fetchData(), 3000);
    } catch (error) {
      toast.error("Failed to restart services");
    } finally {
      setActionLoading((prev) => ({ ...prev, restart: false }));
    }
  };

  const handleVerifyProduction = async () => {
    setActionLoading((prev) => ({ ...prev, verify: true }));
    try {
      const res = await fetch("/api/production/status", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to fetch status");
      }
      const freshStatus = await res.json();
      setStatus(freshStatus);
      setCountdown(15);
      
      const passedChecks = freshStatus.checklist?.filter((c: ChecklistItem) => c.status === "pass").length || 0;
      const totalChecks = freshStatus.checklist?.length || 0;
      
      if (passedChecks === totalChecks) {
        toast.success("All production checks passed!");
      } else {
        toast.warning(`${passedChecks}/${totalChecks} checks passed`);
      }
    } catch (error) {
      toast.error("Verification failed");
    } finally {
      setActionLoading((prev) => ({ ...prev, verify: false }));
    }
  };

  const handleSwitchModel = async (modelTitle: string) => {
    setActionLoading((prev) => ({ ...prev, sdModel: true }));
    try {
      const res = await fetch("/api/production/sd-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelTitle }),
      });

      if (res.ok) {
        toast.success(`Switching to model: ${modelTitle}`);
        setTimeout(() => fetchData(), 2000);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to switch model");
      }
    } catch (error) {
      toast.error("Failed to switch SD model");
    } finally {
      setActionLoading((prev) => ({ ...prev, sdModel: false }));
    }
  };

  const getChecklistIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "fail":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getDiagnosticIcon = (status: DiagnosticResult["status"]) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return "Unknown";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading production status...</p>
        </div>
      </div>
    );
  }

  const allChecksPassed = status?.checklist.every((c) => c.status === "pass");
  const passedCount = status?.checklist.filter((c) => c.status === "pass").length || 0;
  const totalCount = status?.checklist.length || 0;
  const windowsNode = status?.nodes.find(n => n.id === "windows");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            Production Control Center
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Monitor and manage production readiness
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshing in {countdown}s
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <Card className={
        allChecksPassed
          ? "bg-green-500/5 border-green-500/20"
          : "bg-yellow-500/5 border-yellow-500/20"
      }>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {allChecksPassed ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : (
                <AlertCircle className="h-6 w-6 text-yellow-500" />
              )}
              <div>
                <CardTitle className="text-lg">
                  {allChecksPassed ? "Production Ready" : "Issues Detected"}
                </CardTitle>
                <CardDescription>
                  {passedCount} of {totalCount} checks passed
                </CardDescription>
              </div>
            </div>
            {status?.timestamp && (
              <span className="text-xs text-muted-foreground">
                Updated: {new Date(status.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleDeployAll}
          disabled={actionLoading.deployAll}
          className="flex-1 sm:flex-none"
        >
          {actionLoading.deployAll ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4 mr-2" />
          )}
          Deploy All
        </Button>
        <Button
          variant="outline"
          onClick={handleRestartServices}
          disabled={actionLoading.restart}
          className="flex-1 sm:flex-none"
        >
          {actionLoading.restart ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Restart Services
        </Button>
        <Button
          variant="outline"
          onClick={handleVerifyProduction}
          disabled={actionLoading.verify || refreshing}
          className="flex-1 sm:flex-none"
        >
          {actionLoading.verify ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Shield className="h-4 w-4 mr-2" />
          )}
          Verify Production
        </Button>
      </div>

      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Laptop className="h-6 w-6 text-purple-500" />
              <div>
                <CardTitle className="text-lg">Windows AI Workstation</CardTitle>
                <CardDescription>
                  GPU-powered AI services: Ollama, ComfyUI, Stable Diffusion
                </CardDescription>
              </div>
            </div>
            <Badge
              variant={agentTest?.summary.authenticated ? "success" : windowsNode?.status === "online" ? "warning" : "destructive"}
              className="flex items-center gap-1"
            >
              {agentTest?.summary.authenticated ? (
                <><CheckCircle2 className="h-3 w-3" /> Connected</>
              ) : windowsNode?.status === "online" ? (
                <><AlertCircle className="h-3 w-3" /> Auth Issue</>
              ) : (
                <><WifiOff className="h-3 w-3" /> Offline</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Server className="h-3 w-3" /> Tailscale IP
              </p>
              <code className="text-sm bg-secondary px-2 py-1 rounded block">
                {agentTest?.config.host || windowsNode?.tailscaleIp || "100.118.44.102"}
              </code>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Terminal className="h-3 w-3" /> Agent Port
              </p>
              <code className="text-sm bg-secondary px-2 py-1 rounded block">
                {agentTest?.config.port || "9765"}
              </code>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Key className="h-3 w-3" /> Token Status
              </p>
              <Badge variant={agentTest?.config.tokenConfigured ? "success" : "destructive"}>
                {agentTest?.config.tokenConfigured 
                  ? `Configured (${agentTest.config.tokenSource})` 
                  : "Not Configured"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3" /> Uptime
              </p>
              <span className="text-sm">
                {formatUptime(agentTest?.summary.uptime)}
              </span>
            </div>
          </div>

          {agentTest?.summary.gpu && (
            <div className="p-3 rounded-lg bg-secondary/50 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Cpu className="h-4 w-4" /> GPU: {agentTest.summary.gpu.name}
              </p>
              <div className="grid gap-2 sm:grid-cols-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Memory Used:</span>{" "}
                  {agentTest.summary.gpu.memoryUsed} / {agentTest.summary.gpu.memoryTotal} MB
                </div>
                <div>
                  <span className="text-muted-foreground">Free:</span>{" "}
                  {agentTest.summary.gpu.memoryFree} MB
                </div>
                <div>
                  <span className="text-muted-foreground">Utilization:</span>{" "}
                  {agentTest.summary.gpu.utilization}%
                </div>
              </div>
            </div>
          )}

          {agentTest?.summary.services && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(agentTest.summary.services).map(([name, info]) => (
                <div 
                  key={name}
                  className={`p-3 rounded-lg border ${
                    info.status === "online" 
                      ? "border-green-500/30 bg-green-500/5" 
                      : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm capitalize">{name}</span>
                    <Badge variant={info.status === "online" ? "success" : "destructive"} className="text-xs">
                      {info.status}
                    </Badge>
                  </div>
                  {info.port && (
                    <p className="text-xs text-muted-foreground mt-1">Port: {info.port}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleTestConnection}
              disabled={actionLoading.testConnection}
            >
              {actionLoading.testConnection ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleWakeVM}
              disabled={actionLoading.wake}
            >
              {actionLoading.wake ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Power className="h-4 w-4 mr-2" />
              )}
              Wake VM
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGitPull}
              disabled={actionLoading.gitPull || !agentTest?.summary.authenticated}
            >
              {actionLoading.gitPull ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <GitBranch className="h-4 w-4 mr-2" />
              )}
              Git Pull
            </Button>
            {["ollama", "comfyui", "stable-diffusion"].map((service) => (
              <Button
                key={service}
                size="sm"
                variant="outline"
                onClick={() => handleRestartWindowsService(service)}
                disabled={actionLoading[`restart-${service}`] || !agentTest?.summary.authenticated}
              >
                {actionLoading[`restart-${service}`] ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Restart {service}
              </Button>
            ))}
          </div>

          {agentTest && (
            <Collapsible open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    Connection Diagnostics
                  </span>
                  {diagnosticsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 mt-2">
                {agentTest.diagnostics.map((diag, i) => (
                  <div 
                    key={i}
                    className={`p-3 rounded-lg border ${
                      diag.status === "pass" ? "border-green-500/30 bg-green-500/5" :
                      diag.status === "fail" ? "border-red-500/30 bg-red-500/5" :
                      diag.status === "warning" ? "border-yellow-500/30 bg-yellow-500/5" :
                      "border-blue-500/30 bg-blue-500/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {getDiagnosticIcon(diag.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{diag.step}</p>
                          {diag.duration && (
                            <span className="text-xs text-muted-foreground">{diag.duration}ms</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{diag.message}</p>
                        {diag.details && (
                          <pre className="mt-1 text-xs bg-secondary/50 p-2 rounded overflow-x-auto">
                            {typeof diag.details === "string" 
                              ? diag.details 
                              : JSON.stringify(diag.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-center">
                  Last tested: {new Date(agentTest.timestamp).toLocaleString()}
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Node Status</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {status?.nodes.map((node) => {
            const Icon = nodeIcons[node.id] || Cloud;
            return (
              <Card
                key={node.id}
                className={
                  node.status === "online"
                    ? "border-green-500/30"
                    : "border-red-500/30"
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      <CardTitle className="text-base">{node.name}</CardTitle>
                    </div>
                    <Badge
                      variant={node.status === "online" ? "success" : "destructive"}
                      className="flex items-center gap-1"
                    >
                      {node.status === "online" ? (
                        <Wifi className="h-3 w-3" />
                      ) : (
                        <WifiOff className="h-3 w-3" />
                      )}
                      {node.status === "online" ? "Online" : "Offline"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tailscale IP</span>
                    <code className="text-xs bg-secondary px-2 py-1 rounded">
                      {node.tailscaleIp}
                    </code>
                  </div>
                  {node.responseTime && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Response</span>
                      <span className="text-green-500">{node.responseTime}ms</span>
                    </div>
                  )}
                  {node.error && (
                    <p className="text-xs text-red-500">{node.error}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Production Readiness Checklist</CardTitle>
            <CardDescription>
              All checks must pass for production deployment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {status?.checklist.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50"
              >
                {getChecklistIcon(item.status)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.label}</p>
                  {item.details && (
                    <p className="text-xs text-muted-foreground truncate">
                      {item.details}
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    item.status === "pass"
                      ? "success"
                      : item.status === "fail"
                      ? "destructive"
                      : "outline"
                  }
                >
                  {item.status === "pass" ? "Pass" : item.status === "fail" ? "Fail" : "Unknown"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              <CardTitle className="text-lg">SD Model Selector</CardTitle>
            </div>
            <CardDescription>
              {status?.sdModel.available
                ? `Current: ${status.sdModel.currentModel || "None"}`
                : "Stable Diffusion not available"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sdModels?.available ? (
              <div className="text-center py-4 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {sdModels?.error || "SD WebUI is not reachable"}
                </p>
              </div>
            ) : sdModels.modelLoading ? (
              <div className="text-center py-4">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading model...</p>
              </div>
            ) : (
              <>
                <Select
                  value={sdModels.currentModel || ""}
                  onValueChange={handleSwitchModel}
                  disabled={actionLoading.sdModel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a checkpoint" />
                  </SelectTrigger>
                  <SelectContent>
                    {sdModels.models.map((model) => (
                      <SelectItem key={model.title} value={model.title}>
                        {model.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {sdModels.models.length} checkpoints available
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
