"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bot,
  Cpu,
  Server,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Rocket,
  Code2,
  TestTube,
  GitBranch,
  HardDrive,
  Wifi,
  WifiOff,
  Zap,
  ArrowLeft,
  Terminal,
  FileCode,
  Check,
  X,
  RotateCcw,
  Eye,
  Bug,
  Sparkles,
  Search,
  Wrench,
  AlertTriangle,
  Cloud,
  CloudOff,
  Info,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface PipelineStatus {
  status: string;
  localAI: {
    available: boolean;
    ollama: {
      status: string;
      url: string;
      latencyMs?: number;
      modelsLoaded: number;
      vramUsed?: number;
    };
    stableDiffusion: {
      status: string;
      url: string;
      gpuUsage?: number;
    };
    comfyUI: {
      status: string;
      url: string;
    };
  };
  fallbackAvailable: boolean;
  actionableMessage: string;
  opencode: {
    available: boolean;
    selectedProvider: string;
    selectedModel: string;
  };
  targets: {
    id: string;
    name: string;
    type: string;
    host: string;
    status: string;
  }[];
  orchestrator: {
    totalJobs: number;
    runningJobs: number;
    queuedJobs: number;
    completedJobs: number;
  };
}

interface AutonomousJob {
  id: string;
  objective: string;
  status: string;
  progress: number;
  createdAt: string;
  steps: {
    name: string;
    status: string;
    output?: string;
  }[];
  result?: {
    filesCreated: string[];
    testsRun: number;
    testsPassed: number;
    deployed: boolean;
  };
  error?: string;
}

type JobType = 'feature-request' | 'bug-fix' | 'code-review' | 'refactor';

interface CodeWorkflow {
  id: string;
  jobType: JobType;
  description: string;
  status: 'analyzing' | 'planning' | 'implementing' | 'validating' | 'completed' | 'failed';
  progress: number;
  steps: {
    analyze: { status: string; output?: string };
    plan: { status: string; output?: string };
    implement: { status: string; output?: string };
    validate: { status: string; output?: string };
  };
  error?: string;
  hasChanges?: boolean;
  changeId?: string;
}

interface StagedChange {
  id: string;
  type: JobType;
  description: string;
  fileCount: number;
  status: 'staged' | 'approved' | 'rejected' | 'applied';
  createdAt: string;
  validationPassed?: boolean;
}

interface CodeApiStatus {
  activeWorkflows: CodeWorkflow[];
  stagedChanges: StagedChange[];
  aiStatus: {
    provider: string;
    model: string;
    usingLocalAI: boolean;
  };
  capabilities: { id: string; name: string; description: string }[];
}

export default function JarvisPage() {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [autonomousJobs, setAutonomousJobs] = useState<AutonomousJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [objective, setObjective] = useState("");
  const [targetService, setTargetService] = useState("dashboard-next");
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [avoidCloud, setAvoidCloud] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [deployTarget, setDeployTarget] = useState("home");
  const [deployService, setDeployService] = useState("all");
  const [deploying, setDeploying] = useState(false);

  const [codeApiStatus, setCodeApiStatus] = useState<CodeApiStatus | null>(null);
  const [jobType, setJobType] = useState<JobType>('feature-request');
  const [codeDescription, setCodeDescription] = useState("");
  const [targetFiles, setTargetFiles] = useState("");
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string[]>([]);
  const [applyingChange, setApplyingChange] = useState(false);
  const [restartingServices, setRestartingServices] = useState(false);
  const [restartResult, setRestartResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus(forceRefresh = false) {
    try {
      const pipelineUrl = forceRefresh ? "/api/dev/pipeline?forceRefresh=true" : "/api/dev/pipeline";
      const [pipelineRes, autonomousRes, codeRes] = await Promise.all([
        fetch(pipelineUrl),
        fetch("/api/dev/autonomous"),
        fetch("/api/ai/code"),
      ]);

      if (pipelineRes.ok) {
        setPipelineStatus(await pipelineRes.json());
      }

      if (autonomousRes.ok) {
        const data = await autonomousRes.json();
        setAutonomousJobs(data.jobs || []);
      }

      if (codeRes.ok) {
        setCodeApiStatus(await codeRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh(forceRefresh = false) {
    setRefreshing(true);
    await fetchStatus(forceRefresh);
  }

  const ollamaOnline = pipelineStatus?.localAI.ollama?.status === "online";
  const sdOnline = pipelineStatus?.localAI.stableDiffusion?.status === "online";
  const comfyOnline = pipelineStatus?.localAI.comfyUI?.status === "online";
  const anyLocalAIOnline = ollamaOnline || sdOnline || comfyOnline;
  const canUseAI = pipelineStatus?.localAI?.ollama?.status === "online" || 
                   pipelineStatus?.localAI?.available || 
                   pipelineStatus?.fallbackAvailable;
  const canGenerateCode = canUseAI;

  async function handleStartCodeGeneration() {
    if (!codeDescription.trim()) return;

    setCodeSubmitting(true);
    try {
      const res = await fetch("/api/ai/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          jobType,
          description: codeDescription,
          targetService,
          targetFiles: targetFiles.trim() ? targetFiles.split(',').map(f => f.trim()) : undefined,
        }),
      });

      if (res.ok) {
        setCodeDescription("");
        setTargetFiles("");
        await fetchStatus();
      }
    } catch (error) {
      console.error("Failed to start code generation:", error);
    } finally {
      setCodeSubmitting(false);
    }
  }

  async function handleViewDiff(changeId: string) {
    try {
      const res = await fetch("/api/ai/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          changeId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDiffContent(data.change?.diff || []);
        setSelectedChangeId(changeId);
        setDiffDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to fetch diff:", error);
    }
  }

  async function handleApplyChange() {
    if (!selectedChangeId) return;

    setApplyingChange(true);
    try {
      const res = await fetch("/api/ai/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          changeId: selectedChangeId,
        }),
      });

      if (res.ok) {
        setDiffDialogOpen(false);
        setSelectedChangeId(null);
        await fetchStatus();
      }
    } catch (error) {
      console.error("Failed to apply change:", error);
    } finally {
      setApplyingChange(false);
    }
  }

  async function handleRejectChange() {
    if (!selectedChangeId) return;

    try {
      const res = await fetch("/api/ai/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          changeId: selectedChangeId,
        }),
      });

      if (res.ok) {
        setDiffDialogOpen(false);
        setSelectedChangeId(null);
        await fetchStatus();
      }
    } catch (error) {
      console.error("Failed to reject change:", error);
    }
  }

  async function handleRestartServices() {
    setRestartingServices(true);
    setRestartResult(null);
    try {
      const res = await fetch("/api/ai/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart", service: "all" }),
      });
      
      const data = await res.json();
      if (data.success) {
        setRestartResult({ success: true, message: "Services restarting - please wait 30-60 seconds" });
        setTimeout(() => handleRefresh(true), 30000);
      } else {
        setRestartResult({ success: false, message: data.error || "Failed to restart services" });
      }
    } catch (error) {
      setRestartResult({ success: false, message: "Unable to reach Windows VM agent" });
    } finally {
      setRestartingServices(false);
      setTimeout(() => setRestartResult(null), 10000);
    }
  }

  function getJobTypeIcon(type: JobType) {
    switch (type) {
      case 'feature-request': return <Sparkles className="h-4 w-4" />;
      case 'bug-fix': return <Bug className="h-4 w-4" />;
      case 'code-review': return <Search className="h-4 w-4" />;
      case 'refactor': return <Wrench className="h-4 w-4" />;
    }
  }

  async function handleStartAutonomous() {
    if (!objective.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/dev/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          targetService,
          autoDeploy,
          constraints: { avoidCloud },
          priority: "normal",
        }),
      });

      if (res.ok) {
        setObjective("");
        await fetchStatus();
      }
    } catch (error) {
      console.error("Failed to start autonomous development:", error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeploy() {
    setDeploying(true);
    try {
      const res = await fetch("/api/dev/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deploy",
          params: {
            target: deployTarget,
            service: deployService,
            gitPull: true,
            restart: true,
          },
        }),
      });

      if (res.ok) {
        await fetchStatus();
      }
    } catch (error) {
      console.error("Deploy failed:", error);
    } finally {
      setDeploying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
            <Bot className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Jarvis Development Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              Autonomous development and deployment using local AI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleRefresh(false)} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="secondary" onClick={() => handleRefresh(true)} disabled={refreshing}>
            <RotateCcw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Force Refresh
          </Button>
        </div>
      </div>

      {pipelineStatus && (
        <Card className={cn(
          "p-4 border-l-4",
          !anyLocalAIOnline && !pipelineStatus.fallbackAvailable && "border-l-red-500 bg-red-500/5",
          !anyLocalAIOnline && pipelineStatus.fallbackAvailable && "border-l-yellow-500 bg-yellow-500/5",
          anyLocalAIOnline && "border-l-green-500 bg-green-500/5"
        )}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {!anyLocalAIOnline && !pipelineStatus.fallbackAvailable && (
                <CloudOff className="h-5 w-5 text-red-500 mt-0.5" />
              )}
              {!anyLocalAIOnline && pipelineStatus.fallbackAvailable && (
                <Cloud className="h-5 w-5 text-yellow-500 mt-0.5" />
              )}
              {anyLocalAIOnline && (
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-semibold">
                  {!anyLocalAIOnline && !pipelineStatus.fallbackAvailable && "AI Services Unavailable"}
                  {!anyLocalAIOnline && pipelineStatus.fallbackAvailable && "Local AI Offline - Using Cloud Fallback"}
                  {anyLocalAIOnline && "AI Services Online"}
                </div>
                {pipelineStatus.actionableMessage && (
                  <p className="text-sm text-muted-foreground">{pipelineStatus.actionableMessage}</p>
                )}
                <div className="flex flex-wrap gap-3 mt-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      ollamaOnline ? "bg-green-500" : "bg-red-500"
                    )} />
                    <span className={ollamaOnline ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                      Ollama: {ollamaOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      sdOnline ? "bg-green-500" : "bg-red-500"
                    )} />
                    <span className={sdOnline ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                      Stable Diffusion: {sdOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      comfyOnline ? "bg-green-500" : "bg-red-500"
                    )} />
                    <span className={comfyOnline ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                      ComfyUI: {comfyOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      pipelineStatus.fallbackAvailable ? "bg-green-500" : "bg-gray-400"
                    )} />
                    <span className={pipelineStatus.fallbackAvailable ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                      OpenAI Fallback: {pipelineStatus.fallbackAvailable ? "Available" : "Not Configured"}
                    </span>
                  </div>
                </div>
                {!anyLocalAIOnline && (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRestartServices}
                      disabled={restartingServices}
                    >
                      {restartingServices ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Restarting...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Restart AI Services
                        </>
                      )}
                    </Button>
                    {restartResult && (
                      <span className={cn(
                        "text-xs",
                        restartResult.success ? "text-green-600" : "text-red-600"
                      )}>
                        {restartResult.message}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-green-400" />
            <h2 className="font-semibold">Local AI Status</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  pipelineStatus?.localAI.ollama?.status === "online" ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="text-sm font-medium">Ollama</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {pipelineStatus?.localAI.ollama?.modelsLoaded || 0} models
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  pipelineStatus?.localAI.stableDiffusion?.status === "online" ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="text-sm font-medium">Stable Diffusion</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {pipelineStatus?.localAI.stableDiffusion?.gpuUsage || 0}% GPU
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  pipelineStatus?.localAI.comfyUI?.status === "online" ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="text-sm font-medium">ComfyUI</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active Provider</span>
              <span className="font-medium">{pipelineStatus?.opencode.selectedProvider || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Model</span>
              <span className="font-medium text-xs">{pipelineStatus?.opencode.selectedModel || "N/A"}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-400" />
            <h2 className="font-semibold">Deploy Targets</h2>
          </div>

          <div className="space-y-2">
            {pipelineStatus?.targets.map((target) => (
              <div
                key={target.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  {target.status === "online" ? (
                    <Wifi className="h-4 w-4 text-green-400" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-400" />
                  )}
                  <div>
                    <div className="text-sm font-medium">{target.name}</div>
                    <div className="text-xs text-muted-foreground">{target.type}</div>
                  </div>
                </div>
                <span className={cn(
                  "text-xs px-2 py-1 rounded",
                  target.status === "online" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                )}>
                  {target.status}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Select value={deployTarget} onValueChange={setDeployTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Target" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Ubuntu Home</SelectItem>
                  <SelectItem value="windows">Windows VM</SelectItem>
                  <SelectItem value="all">All Targets</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deployService} onValueChange={setDeployService}>
                <SelectTrigger>
                  <SelectValue placeholder="Service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  <SelectItem value="dashboard-next">Dashboard</SelectItem>
                  <SelectItem value="discord-bot">Discord Bot</SelectItem>
                  <SelectItem value="stream-bot">Stream Bot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={handleDeploy}
              disabled={deploying}
            >
              {deploying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              Deploy
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            <h2 className="font-semibold">Orchestrator Stats</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold">{pipelineStatus?.orchestrator.runningJobs || 0}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold">{pipelineStatus?.orchestrator.queuedJobs || 0}</div>
              <div className="text-xs text-muted-foreground">Queued</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-green-400">{pipelineStatus?.orchestrator.completedJobs || 0}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold">{pipelineStatus?.orchestrator.totalJobs || 0}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-indigo-400" />
            <h2 className="font-semibold">AI Code Generation</h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className={cn(
              "w-2 h-2 rounded-full",
              codeApiStatus?.aiStatus.usingLocalAI ? "bg-green-500" : "bg-yellow-500"
            )} />
            <span className="text-muted-foreground">
              {codeApiStatus?.aiStatus.provider || 'N/A'}: {codeApiStatus?.aiStatus.model || 'N/A'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Job Type</Label>
                <div className="flex gap-1">
                  {(['feature-request', 'bug-fix', 'code-review', 'refactor'] as JobType[]).map((type) => (
                    <Button
                      key={type}
                      variant={jobType === type ? "default" : "outline"}
                      size="sm"
                      onClick={() => setJobType(type)}
                      className="h-7 text-xs"
                    >
                      {getJobTypeIcon(type)}
                      <span className="ml-1 hidden sm:inline">
                        {type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder={
                  jobType === 'feature-request' ? "Describe the feature you want to build..." :
                  jobType === 'bug-fix' ? "Describe the bug and error messages..." :
                  jobType === 'code-review' ? "Describe what aspects to review..." :
                  "Describe what code to refactor and why..."
                }
                value={codeDescription}
                onChange={(e) => setCodeDescription(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Service</Label>
                <Select value={targetService} onValueChange={setTargetService}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard-next">Dashboard Next</SelectItem>
                    <SelectItem value="discord-bot">Discord Bot</SelectItem>
                    <SelectItem value="stream-bot">Stream Bot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Files (optional)</Label>
                <Input
                  placeholder="path/to/file.ts, path/to/other.ts"
                  value={targetFiles}
                  onChange={(e) => setTargetFiles(e.target.value)}
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleStartCodeGeneration}
              disabled={codeSubmitting || !codeDescription.trim() || !canGenerateCode}
            >
              {codeSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : !canGenerateCode ? (
                <>
                  <CloudOff className="h-4 w-4 mr-2" />
                  <span>AI Services Offline</span>
                </>
              ) : (
                <>
                  {getJobTypeIcon(jobType)}
                  <span className="ml-2">Start {jobType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                </>
              )}
            </Button>
            {!canGenerateCode && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                AI code generation requires Ollama or OpenAI fallback to be available.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Staged Changes</div>
            {(!codeApiStatus?.stagedChanges || codeApiStatus.stagedChanges.length === 0) ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                No staged changes
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {codeApiStatus.stagedChanges.map((change) => (
                    <div key={change.id} className="p-2 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {getJobTypeIcon(change.type)}
                          <span className="text-xs font-medium truncate max-w-[120px]">
                            {change.description}
                          </span>
                        </div>
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          change.validationPassed ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                        )}>
                          {change.fileCount} files
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs flex-1"
                          onClick={() => handleViewDiff(change.id)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {(codeApiStatus?.activeWorkflows?.length || 0) > 0 && (
          <div className="pt-3 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">Active Workflows</div>
            <div className="space-y-2">
              {codeApiStatus?.activeWorkflows.map((workflow) => (
                <div key={workflow.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getJobTypeIcon(workflow.jobType)}
                      <span className="text-sm font-medium truncate max-w-[300px]">
                        {workflow.description}
                      </span>
                    </div>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded",
                      workflow.status === "completed" && "bg-green-500/20 text-green-400",
                      workflow.status === "failed" && "bg-red-500/20 text-red-400",
                      !["completed", "failed"].includes(workflow.status) && "bg-blue-500/20 text-blue-400"
                    )}>
                      {workflow.status}
                    </span>
                  </div>
                  <Progress value={workflow.progress} className="h-1" />
                  <div className="grid grid-cols-4 gap-1">
                    {(['analyze', 'plan', 'implement', 'validate'] as const).map((step) => (
                      <div
                        key={step}
                        className={cn(
                          "text-xs text-center px-1.5 py-0.5 rounded",
                          workflow.steps[step]?.status === "completed" && "bg-green-500/20 text-green-400",
                          workflow.steps[step]?.status === "running" && "bg-blue-500/20 text-blue-400 animate-pulse",
                          workflow.steps[step]?.status === "failed" && "bg-red-500/20 text-red-400",
                          workflow.steps[step]?.status === "pending" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {step}
                      </div>
                    ))}
                  </div>
                  {workflow.hasChanges && workflow.changeId && (
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => handleViewDiff(workflow.changeId!)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Review & Apply Changes
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-purple-400" />
            <h2 className="font-semibold">Legacy Autonomous Development</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Development Objective</Label>
              <Textarea
                placeholder="Describe what you want to build..."
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Service</Label>
                <Select value={targetService} onValueChange={setTargetService}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard-next">Dashboard Next</SelectItem>
                    <SelectItem value="discord-bot">Discord Bot</SelectItem>
                    <SelectItem value="stream-bot">Stream Bot</SelectItem>
                    <SelectItem value="new">New Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-deploy">Auto Deploy</Label>
                  <Switch
                    id="auto-deploy"
                    checked={autoDeploy}
                    onCheckedChange={setAutoDeploy}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="avoid-cloud">Use Local AI Only</Label>
                  <Switch
                    id="avoid-cloud"
                    checked={avoidCloud}
                    onCheckedChange={setAvoidCloud}
                  />
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleStartAutonomous}
              disabled={submitting || !objective.trim() || !canGenerateCode}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : !canGenerateCode ? (
                <>
                  <CloudOff className="h-4 w-4 mr-2" />
                  AI Services Offline
                </>
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {canGenerateCode && "Start Autonomous Development"}
            </Button>
            {!canGenerateCode && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Autonomous development requires AI services to be available.
              </p>
            )}
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-cyan-400" />
            <h2 className="font-semibold">Development Jobs</h2>
          </div>

          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {autonomousJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No autonomous jobs yet
                </div>
              ) : (
                autonomousJobs.map((job) => (
                  <div key={job.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {job.status === "completed" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                        {job.status === "failed" && <XCircle className="h-4 w-4 text-red-400" />}
                        {!["completed", "failed"].includes(job.status) && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                        )}
                        <span className="text-sm font-medium truncate max-w-[200px]">
                          {job.objective}
                        </span>
                      </div>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        job.status === "completed" && "bg-green-500/20 text-green-400",
                        job.status === "failed" && "bg-red-500/20 text-red-400",
                        !["completed", "failed"].includes(job.status) && "bg-blue-500/20 text-blue-400"
                      )}>
                        {job.status}
                      </span>
                    </div>

                    {job.progress > 0 && job.progress < 100 && (
                      <Progress value={job.progress} className="h-1" />
                    )}

                    <div className="flex flex-wrap gap-1">
                      {job.steps.map((step, i) => (
                        <span
                          key={i}
                          className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            step.status === "completed" && "bg-green-500/20 text-green-400",
                            step.status === "running" && "bg-blue-500/20 text-blue-400",
                            step.status === "failed" && "bg-red-500/20 text-red-400",
                            step.status === "pending" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {step.name}
                        </span>
                      ))}
                    </div>

                    {job.result && (
                      <div className="text-xs text-muted-foreground">
                        {job.result.filesCreated.length} files • 
                        {job.result.testsPassed}/{job.result.testsRun} tests passed
                        {job.result.deployed && " • Deployed"}
                      </div>
                    )}

                    {job.error && (
                      <div className="text-xs text-red-400">{job.error}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>

      <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Code Diff Preview
            </DialogTitle>
            <DialogDescription>
              Review the generated changes before applying them to the codebase.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 max-h-[50vh] border rounded-lg">
            <div className="p-4 font-mono text-xs whitespace-pre-wrap">
              {diffContent.length === 0 ? (
                <div className="text-muted-foreground text-center py-8">
                  No changes to display
                </div>
              ) : (
                diffContent.map((diff, i) => (
                  <div key={i} className="mb-4">
                    {diff.split('\n').map((line, j) => (
                      <div
                        key={j}
                        className={cn(
                          "py-0.5 px-2 -mx-2",
                          line.startsWith('+++ NEW FILE') && "bg-green-500/20 text-green-400 font-bold",
                          line.startsWith('---') && "bg-muted text-muted-foreground font-bold",
                          line.startsWith('+++') && !line.startsWith('+++ NEW FILE') && "bg-muted text-muted-foreground font-bold",
                          line.startsWith('@@') && "bg-blue-500/20 text-blue-400",
                          line.startsWith('+') && !line.startsWith('+++') && "bg-green-500/10 text-green-400",
                          line.startsWith('-') && !line.startsWith('---') && "bg-red-500/10 text-red-400",
                        )}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {diffContent.length} file(s) will be modified
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleRejectChange}
                disabled={applyingChange}
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={handleApplyChange}
                disabled={applyingChange}
              >
                {applyingChange ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Approve & Apply
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
