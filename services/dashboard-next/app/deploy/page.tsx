"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Rocket,
  Server,
  Home,
  Monitor,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  GitBranch,
  GitCommit,
  Upload,
  Download,
  RotateCcw,
  Play,
  Activity,
  Wifi,
  WifiOff,
  Shield,
  Zap,
  History,
  Terminal,
  ChevronDown,
  ChevronRight,
  Bot,
  Cpu,
  HardDrive,
  Database,
  Settings,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type Environment = "linode" | "ubuntu-home" | "windows-vm";

interface EnvironmentStatus {
  environment: Environment;
  online: boolean;
  lastDeployment?: string;
  gitCommit?: string;
  gitBranch?: string;
  commitsAhead?: number;
  commitsBehind?: number;
  services: ServiceStatus[];
  lastChecked?: string;
}

interface ServiceStatus {
  name: string;
  status: "running" | "stopped" | "error" | "unknown";
  uptime?: string;
  port?: number;
}

interface ProbeResult {
  name: string;
  success: boolean;
  message: string;
  latencyMs?: number;
  category?: string;
}

interface DeploymentRecord {
  id: string;
  environment: Environment;
  gitCommit: string;
  previousCommit?: string;
  timestamp: string;
  success: boolean;
  duration: number;
  services: string[];
  triggeredBy?: string;
}

interface DeployStep {
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  message?: string;
  duration?: number;
}

const ENVIRONMENT_CONFIG: Record<Environment, { name: string; icon: React.ElementType; color: string; services: string[] }> = {
  linode: {
    name: "Linode Server",
    icon: Server,
    color: "blue",
    services: ["dashboard-next", "discord-bot", "stream-bot", "terminal-server"],
  },
  "ubuntu-home": {
    name: "Ubuntu Home",
    icon: Home,
    color: "green",
    services: ["plex", "docker", "libvirt", "vnc-server"],
  },
  "windows-vm": {
    name: "Windows VM",
    icon: Monitor,
    color: "purple",
    services: ["nebula-agent", "ollama", "comfyui", "stable-diffusion"],
  },
};

export default function DeploymentCenterPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("environments");

  const [environmentStatus, setEnvironmentStatus] = useState<Record<Environment, EnvironmentStatus>>({
    linode: { environment: "linode", online: false, services: [] },
    "ubuntu-home": { environment: "ubuntu-home", online: false, services: [] },
    "windows-vm": { environment: "windows-vm", online: false, services: [] },
  });

  const [verificationResults, setVerificationResults] = useState<Record<string, ProbeResult[]>>({});
  const [deploymentHistory, setDeploymentHistory] = useState<DeploymentRecord[]>([]);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployingEnvironment, setDeployingEnvironment] = useState<Environment | "all" | null>(null);
  const [deployProgress, setDeployProgress] = useState(0);
  const [deploySteps, setDeploySteps] = useState<DeployStep[]>([]);
  const [autoRemediation, setAutoRemediation] = useState(false);
  const [showDeployAllModal, setShowDeployAllModal] = useState(false);
  const [expandedEnvironments, setExpandedEnvironments] = useState<Set<Environment>>(new Set<Environment>(["linode", "ubuntu-home", "windows-vm"]));

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/deploy?action=get_status");
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          const newStatus: Record<Environment, EnvironmentStatus> = {
            linode: {
              environment: "linode",
              online: data.status.linode?.online ?? false,
              lastDeployment: data.status.linode?.lastDeployment,
              gitCommit: data.status.linode?.gitCommit,
              gitBranch: data.status.linode?.gitBranch || "main",
              commitsAhead: data.status.linode?.commitsAhead || 0,
              commitsBehind: data.status.linode?.commitsBehind || 0,
              services: data.status.linode?.services || ENVIRONMENT_CONFIG.linode.services.map(s => ({
                name: s,
                status: "unknown" as const,
              })),
              lastChecked: new Date().toISOString(),
            },
            "ubuntu-home": {
              environment: "ubuntu-home",
              online: data.status["ubuntu-home"]?.online ?? false,
              lastDeployment: data.status["ubuntu-home"]?.lastDeployment,
              gitCommit: data.status["ubuntu-home"]?.gitCommit,
              gitBranch: data.status["ubuntu-home"]?.gitBranch || "main",
              commitsAhead: data.status["ubuntu-home"]?.commitsAhead || 0,
              commitsBehind: data.status["ubuntu-home"]?.commitsBehind || 0,
              services: data.status["ubuntu-home"]?.services || ENVIRONMENT_CONFIG["ubuntu-home"].services.map(s => ({
                name: s,
                status: "unknown" as const,
              })),
              lastChecked: new Date().toISOString(),
            },
            "windows-vm": {
              environment: "windows-vm",
              online: data.status["windows-vm"]?.online ?? false,
              lastDeployment: data.status["windows-vm"]?.lastDeployment,
              gitCommit: data.status["windows-vm"]?.gitCommit,
              gitBranch: data.status["windows-vm"]?.gitBranch || "main",
              commitsAhead: data.status["windows-vm"]?.commitsAhead || 0,
              commitsBehind: data.status["windows-vm"]?.commitsBehind || 0,
              services: data.status["windows-vm"]?.services || ENVIRONMENT_CONFIG["windows-vm"].services.map(s => ({
                name: s,
                status: "unknown" as const,
              })),
              lastChecked: new Date().toISOString(),
            },
          };
          setEnvironmentStatus(newStatus);
        }
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/deploy?action=history&limit=20");
      if (res.ok) {
        const data = await res.json();
        if (data.history) {
          setDeploymentHistory(data.history);
        }
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchHistory()]);
    setRefreshing(false);
    setLoading(false);
  }, [fetchStatus, fetchHistory]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      if (!isDeploying) {
        fetchStatus();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchStatus, isDeploying]);

  useEffect(() => {
    if (isDeploying) {
      pollIntervalRef.current = setInterval(() => {
        fetchStatus();
      }, 5000);
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isDeploying, fetchStatus]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [deployLogs]);

  const handleDeploy = async (environment: Environment | "all") => {
    setIsDeploying(true);
    setDeployingEnvironment(environment);
    setDeployLogs([`[${new Date().toLocaleTimeString()}] Starting deployment to ${environment}...`]);
    setDeployProgress(0);
    setDeploySteps([
      { name: "Connecting", status: "running" },
      { name: "Pulling code", status: "pending" },
      { name: "Building", status: "pending" },
      { name: "Deploying services", status: "pending" },
      { name: "Verifying", status: "pending" },
    ]);

    const progressInterval = setInterval(() => {
      setDeployProgress(prev => Math.min(prev + 2, 95));
    }, 1000);

    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger_deploy",
          environment,
        }),
      });

      const data = await res.json();

      clearInterval(progressInterval);
      setDeployProgress(100);

      if (data.success) {
        setDeployLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Deployment completed successfully!`,
          `[${new Date().toLocaleTimeString()}] Git commit: ${data.gitCommit || "unknown"}`,
          `[${new Date().toLocaleTimeString()}] Duration: ${data.duration || 0}ms`,
        ]);
        setDeploySteps(steps => steps.map(s => ({ ...s, status: "success" })));
        toast.success(`Deployment to ${environment} completed!`);
      } else {
        setDeployLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ERROR: ${data.error || "Deployment failed"}`,
        ]);
        setDeploySteps(steps => {
          const updated = [...steps];
          const runningIdx = updated.findIndex(s => s.status === "running");
          if (runningIdx >= 0) updated[runningIdx].status = "failed";
          return updated;
        });
        toast.error(`Deployment failed: ${data.error || "Unknown error"}`);
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      setDeployLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ERROR: ${error.message || "Request failed"}`,
      ]);
      toast.error("Deployment request failed");
    } finally {
      setIsDeploying(false);
      setDeployingEnvironment(null);
      fetchAll();
    }
  };

  const handleAction = async (
    action: string,
    environment: Environment,
    loadingKey: string,
    successMessage: string
  ) => {
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, environment }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(successMessage);
        fetchAll();
      } else {
        toast.error(data.error || "Action failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Request failed");
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handleVerifyAll = async () => {
    setActionLoading(prev => ({ ...prev, verifyAll: true }));
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_all" }),
      });

      const data = await res.json();

      if (data.success) {
        setVerificationResults(data.results || {});
        toast.success(data.healthy ? "All systems healthy!" : "Some checks failed");
      } else {
        toast.error(data.error || "Verification failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Request failed");
    } finally {
      setActionLoading(prev => ({ ...prev, verifyAll: false }));
    }
  };

  const toggleEnvironment = (env: Environment) => {
    setExpandedEnvironments(prev => {
      const next = new Set(prev);
      if (next.has(env)) {
        next.delete(env);
      } else {
        next.add(env);
      }
      return next;
    });
  };

  const getStatusBadge = (status: "running" | "stopped" | "error" | "unknown") => {
    switch (status) {
      case "running":
        return <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Running</Badge>;
      case "stopped":
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Stopped</Badge>;
      case "error":
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Unknown</Badge>;
    }
  };

  const categorizeProbes = (probes: ProbeResult[]) => {
    const categories: Record<string, ProbeResult[]> = {
      Services: [],
      Infrastructure: [],
      AI: [],
      Other: [],
    };

    probes.forEach(probe => {
      const name = probe.name.toLowerCase();
      if (name.includes("service") || name.includes("bot") || name.includes("dashboard")) {
        categories.Services.push(probe);
      } else if (name.includes("ssh") || name.includes("docker") || name.includes("network")) {
        categories.Infrastructure.push(probe);
      } else if (name.includes("ai") || name.includes("ollama") || name.includes("comfy")) {
        categories.AI.push(probe);
      } else {
        categories.Other.push(probe);
      }
    });

    return categories;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading Deployment Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Rocket className="h-7 w-7 text-primary" />
            Deployment Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Deploy, monitor, and manage all Nebula Command environments
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["linode", "ubuntu-home", "windows-vm"] as Environment[]).map(env => {
            const config = ENVIRONMENT_CONFIG[env];
            const Icon = config.icon;
            return (
              <Button
                key={env}
                size="sm"
                variant="outline"
                onClick={() => handleDeploy(env)}
                disabled={isDeploying}
                className={`border-${config.color}-500/30`}
              >
                {deployingEnvironment === env ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4 mr-1" />
                )}
                Deploy {config.name.split(" ")[0]}
              </Button>
            );
          })}
          <Button
            onClick={() => setShowDeployAllModal(true)}
            disabled={isDeploying}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
          >
            {deployingEnvironment === "all" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Deploy All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Dialog open={showDeployAllModal} onOpenChange={setShowDeployAllModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Deploy to All Environments
            </DialogTitle>
            <DialogDescription>
              This will trigger a deployment to all three environments: Linode, Ubuntu Home, and Windows VM.
              Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            {(["linode", "ubuntu-home", "windows-vm"] as Environment[]).map(env => (
              <div key={env} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {ENVIRONMENT_CONFIG[env].name}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeployAllModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowDeployAllModal(false);
                handleDeploy("all");
              }}
              className="bg-gradient-to-r from-blue-500 to-purple-500"
            >
              <Rocket className="h-4 w-4 mr-2" />
              Deploy All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 lg:w-[500px]">
          <TabsTrigger value="environments" className="flex items-center gap-1">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">Environments</span>
          </TabsTrigger>
          <TabsTrigger value="verification" className="flex items-center gap-1">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Verification</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="git" className="flex items-center gap-1">
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline">Git Sync</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="environments" className="space-y-4 mt-4">
          <div className="grid gap-4">
            {(["linode", "ubuntu-home", "windows-vm"] as Environment[]).map(env => {
              const config = ENVIRONMENT_CONFIG[env];
              const status = environmentStatus[env];
              const Icon = config.icon;
              const isExpanded = expandedEnvironments.has(env);

              return (
                <Card key={env} className={`border-${config.color}-500/20`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleEnvironment(env)}>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className={`rounded-lg bg-${config.color}-500/10 p-2`}>
                          <Icon className={`h-6 w-6 text-${config.color}-500`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{config.name}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            {status.online ? (
                              <><Wifi className="h-3 w-3 text-green-500" /> Online</>
                            ) : (
                              <><WifiOff className="h-3 w-3 text-red-500" /> Offline</>
                            )}
                            {status.gitCommit && (
                              <span className="text-xs font-mono">
                                <GitCommit className="h-3 w-3 inline mr-1" />
                                {status.gitCommit.substring(0, 7)}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeploy(env)}
                          disabled={isDeploying}
                        >
                          {deployingEnvironment === env ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAction("sync_code", env, `sync_${env}`, "Code synced")}
                          disabled={actionLoading[`sync_${env}`]}
                        >
                          {actionLoading[`sync_${env}`] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAction("rollback", env, `rollback_${env}`, "Rollback complete")}
                          disabled={actionLoading[`rollback_${env}`]}
                        >
                          {actionLoading[`rollback_${env}`] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Last Deploy:</span>
                          <p className="font-medium">
                            {status.lastDeployment
                              ? new Date(status.lastDeployment).toLocaleString()
                              : "Never"}
                          </p>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Branch:</span>
                          <p className="font-medium flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {status.gitBranch || "main"}
                          </p>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Ahead:</span>
                          <p className="font-medium text-green-500">+{status.commitsAhead || 0}</p>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Behind:</span>
                          <p className="font-medium text-orange-500">-{status.commitsBehind || 0}</p>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Services
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {(status.services.length > 0 ? status.services : config.services.map(s => ({ name: s, status: "unknown" as const }))).map(service => (
                            <div
                              key={service.name}
                              className="flex items-center justify-between p-2 rounded-lg bg-secondary/50"
                            >
                              <span className="text-sm truncate">{service.name}</span>
                              {getStatusBadge(service.status)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="verification" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-500" />
                    System Verification
                  </CardTitle>
                  <CardDescription>Run health checks across all environments</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="auto-remediation"
                      checked={autoRemediation}
                      onCheckedChange={setAutoRemediation}
                    />
                    <Label htmlFor="auto-remediation" className="text-sm">
                      Auto-remediation
                    </Label>
                  </div>
                  <Button
                    onClick={handleVerifyAll}
                    disabled={actionLoading.verifyAll}
                  >
                    {actionLoading.verifyAll ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Run Verification
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {Object.keys(verificationResults).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Click "Run Verification" to check all systems</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(verificationResults).map(([env, probes]) => {
                    const categories = categorizeProbes(probes);
                    const allHealthy = probes.every(p => p.success);

                    return (
                      <div key={env} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium capitalize">{env.replace("-", " ")}</h3>
                          {allHealthy ? (
                            <Badge variant="default" className="bg-green-500/20 text-green-400">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Healthy
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Issues Found
                            </Badge>
                          )}
                        </div>

                        <div className="grid gap-2">
                          {Object.entries(categories).map(([category, categoryProbes]) => {
                            if (categoryProbes.length === 0) return null;
                            return (
                              <div key={category}>
                                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">
                                  {category}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                                  {categoryProbes.map((probe, idx) => (
                                    <div
                                      key={idx}
                                      className={`flex items-center justify-between p-2 rounded text-sm ${
                                        probe.success ? "bg-green-500/10" : "bg-red-500/10"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        {probe.success ? (
                                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <XCircle className="h-4 w-4 text-red-500" />
                                        )}
                                        <span>{probe.name}</span>
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {probe.latencyMs ? `${probe.latencyMs}ms` : probe.message}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-purple-500" />
                Deployment History
              </CardTitle>
              <CardDescription>Recent deployments across all environments</CardDescription>
            </CardHeader>
            <CardContent>
              {deploymentHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No deployment history available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deploymentHistory.map(record => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition"
                    >
                      <div className="flex items-center gap-3">
                        {record.success ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">
                              {record.environment.replace("-", " ")}
                            </span>
                            <Badge variant="outline" className="text-xs font-mono">
                              <GitCommit className="h-3 w-3 mr-1" />
                              {record.gitCommit.substring(0, 7)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(record.timestamp).toLocaleString()} • {record.duration}ms
                            {record.services.length > 0 && ` • ${record.services.length} services`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {record.previousCommit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs"
                            onClick={() => window.open(`https://github.com/compare/${record.previousCommit}...${record.gitCommit}`, "_blank")}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Diff
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAction("rollback", record.environment, `rollback_${record.id}`, "Rollback initiated")}
                          disabled={actionLoading[`rollback_${record.id}`]}
                        >
                          {actionLoading[`rollback_${record.id}`] ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="git" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-3 gap-4">
            {(["linode", "ubuntu-home", "windows-vm"] as Environment[]).map(env => {
              const config = ENVIRONMENT_CONFIG[env];
              const status = environmentStatus[env];
              const Icon = config.icon;

              return (
                <Card key={env}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Icon className={`h-5 w-5 text-${config.color}-500`} />
                      {config.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Branch:</span>
                        <span className="font-mono flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          {status.gitBranch || "main"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Commit:</span>
                        <span className="font-mono">
                          {status.gitCommit ? status.gitCommit.substring(0, 7) : "unknown"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Status:</span>
                        <div className="flex items-center gap-2">
                          {status.commitsAhead ? (
                            <Badge className="bg-green-500/20 text-green-400">
                              <Upload className="h-3 w-3 mr-1" />
                              +{status.commitsAhead}
                            </Badge>
                          ) : null}
                          {status.commitsBehind ? (
                            <Badge className="bg-orange-500/20 text-orange-400">
                              <Download className="h-3 w-3 mr-1" />
                              -{status.commitsBehind}
                            </Badge>
                          ) : null}
                          {!status.commitsAhead && !status.commitsBehind && (
                            <Badge variant="outline">Up to date</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleAction("sync_code", env, `pull_${env}`, "Code pulled")}
                        disabled={actionLoading[`pull_${env}`]}
                      >
                        {actionLoading[`pull_${env}`] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <><Download className="h-4 w-4 mr-1" /> Pull</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleAction("sync_code", env, `sync_${env}`, "Synced")}
                        disabled={actionLoading[`sync_${env}`]}
                      >
                        {actionLoading[`sync_${env}`] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <><RefreshCw className="h-4 w-4 mr-1" /> Sync</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {(isDeploying || deployLogs.length > 0) && (
        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-green-500" />
                Live Deployment Logs
              </CardTitle>
              {isDeploying && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-sm text-muted-foreground">
                    Deploying to {deployingEnvironment}...
                  </span>
                </div>
              )}
            </div>
            {isDeploying && (
              <div className="space-y-2 mt-2">
                <Progress value={deployProgress} className="h-2" />
                <div className="flex gap-2 flex-wrap">
                  {deploySteps.map((step, idx) => (
                    <Badge
                      key={idx}
                      variant={
                        step.status === "success"
                          ? "default"
                          : step.status === "running"
                          ? "secondary"
                          : step.status === "failed"
                          ? "destructive"
                          : "outline"
                      }
                      className={step.status === "success" ? "bg-green-500/20 text-green-400" : ""}
                    >
                      {step.status === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {step.status === "success" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {step.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                      {step.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="bg-black rounded-lg p-4 h-64 overflow-auto font-mono text-xs">
              {deployLogs.map((log, idx) => {
                const isError = log.includes("ERROR") || log.includes("STDERR");
                const isSuccess = log.includes("success") || log.includes("completed");
                return (
                  <div
                    key={idx}
                    className={`${
                      isError
                        ? "text-red-400"
                        : isSuccess
                        ? "text-green-400"
                        : "text-gray-300"
                    }`}
                  >
                    {log}
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
