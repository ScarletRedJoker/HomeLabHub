"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Rocket,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
  GitBranch,
  RefreshCw,
  Trash2,
  Eye,
  Terminal,
  Box,
  Cloud,
  History,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Pipeline {
  id: string;
  name: string;
  project: string;
  targetServer: string;
  branch: string;
  deployType: "docker" | "pm2" | "systemd" | "script";
  status: "idle" | "running" | "success" | "failed";
  lastRun?: string;
  lastDuration?: number;
  runs: PipelineRun[];
}

interface PipelineRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "success" | "failed";
  logs: string[];
}

const defaultPipelines: Pipeline[] = [
  {
    id: "1",
    name: "Dashboard Production",
    project: "dashboard-next",
    targetServer: "linode",
    branch: "main",
    deployType: "docker",
    status: "success",
    lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    lastDuration: 145,
    runs: [
      {
        id: "r1",
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 145000).toISOString(),
        status: "success",
        logs: [
          "[Deploy] Starting deployment...",
          "[Git] Pulling latest changes from main",
          "[Git] Already up to date.",
          "[Docker] Building image...",
          "[Docker] Step 1/12: FROM node:20-alpine",
          "[Docker] Step 2/12: WORKDIR /app",
          "[Docker] Successfully built abc123def",
          "[Docker] Stopping old container...",
          "[Docker] Starting new container...",
          "[Health] Checking service health...",
          "[Health] Service responding on port 5000",
          "[Deploy] Deployment complete!",
        ],
      },
    ],
  },
  {
    id: "2",
    name: "Discord Bot Deploy",
    project: "discord-bot",
    targetServer: "linode",
    branch: "main",
    deployType: "pm2",
    status: "idle",
    lastRun: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    lastDuration: 67,
    runs: [],
  },
  {
    id: "3",
    name: "Stream Bot Deploy",
    project: "stream-bot",
    targetServer: "linode",
    branch: "main",
    deployType: "docker",
    status: "failed",
    lastRun: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    lastDuration: 89,
    runs: [
      {
        id: "r2",
        startedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 6 * 60 * 60 * 1000 + 89000).toISOString(),
        status: "failed",
        logs: [
          "[Deploy] Starting deployment...",
          "[Git] Pulling latest changes from main",
          "[Docker] Building image...",
          "[Docker] Error: Build failed at step 8",
          "[Docker] npm install returned exit code 1",
          "[Deploy] Deployment failed!",
        ],
      },
    ],
  },
];

const servers = [
  { id: "linode", name: "Linode Cloud Server" },
  { id: "homelab", name: "Homelab Ubuntu" },
];

const projects = [
  "dashboard-next",
  "discord-bot",
  "stream-bot",
  "custom",
];

function getStatusBadge(status: Pipeline["status"]) {
  switch (status) {
    case "running":
      return (
        <Badge className="bg-blue-500/20 text-blue-400 gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    case "success":
      return (
        <Badge className="bg-green-500/20 text-green-400 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Success
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/20 text-red-400 gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          Idle
        </Badge>
      );
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatTimeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>(defaultPipelines);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newPipeline, setNewPipeline] = useState({
    name: "",
    project: "",
    targetServer: "",
    branch: "main",
    deployType: "docker" as Pipeline["deployType"],
  });
  const { toast } = useToast();

  async function runPipeline(pipeline: Pipeline) {
    setPipelines((prev) =>
      prev.map((p) =>
        p.id === pipeline.id
          ? {
              ...p,
              status: "running",
              runs: [
                {
                  id: `run-${Date.now()}`,
                  startedAt: new Date().toISOString(),
                  status: "running",
                  logs: ["[Deploy] Starting deployment..."],
                },
                ...p.runs,
              ],
            }
          : p
      )
    );

    toast({
      title: "Deployment Started",
      description: `Running pipeline: ${pipeline.name}`,
    });

    const logs = [
      "[Git] Pulling latest changes from " + pipeline.branch,
      "[Git] Successfully pulled changes",
      `[${pipeline.deployType.toUpperCase()}] Building application...`,
      `[${pipeline.deployType.toUpperCase()}] Build complete`,
      "[Deploy] Stopping existing service...",
      "[Deploy] Starting new service...",
      "[Health] Checking service health...",
      "[Health] Service is healthy",
      "[Deploy] Deployment complete!",
    ];

    for (let i = 0; i < logs.length; i++) {
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
      setPipelines((prev) =>
        prev.map((p) =>
          p.id === pipeline.id && p.runs[0]
            ? {
                ...p,
                runs: [
                  {
                    ...p.runs[0],
                    logs: [...p.runs[0].logs, logs[i]],
                  },
                  ...p.runs.slice(1),
                ],
              }
            : p
        )
      );
    }

    const success = Math.random() > 0.2;

    setPipelines((prev) =>
      prev.map((p) =>
        p.id === pipeline.id
          ? {
              ...p,
              status: success ? "success" : "failed",
              lastRun: new Date().toISOString(),
              lastDuration: Math.floor(logs.length * 0.5 + Math.random() * 30),
              runs: [
                {
                  ...p.runs[0],
                  completedAt: new Date().toISOString(),
                  status: success ? "success" : "failed",
                },
                ...p.runs.slice(1),
              ],
            }
          : p
      )
    );

    toast({
      title: success ? "Deployment Successful" : "Deployment Failed",
      description: success
        ? `${pipeline.name} deployed successfully`
        : `${pipeline.name} deployment failed`,
      variant: success ? "default" : "destructive",
    });
  }

  function createPipeline() {
    if (!newPipeline.name || !newPipeline.project || !newPipeline.targetServer) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const pipeline: Pipeline = {
      id: `pipeline-${Date.now()}`,
      ...newPipeline,
      status: "idle",
      runs: [],
    };

    setPipelines((prev) => [...prev, pipeline]);
    setShowNewDialog(false);
    setNewPipeline({
      name: "",
      project: "",
      targetServer: "",
      branch: "main",
      deployType: "docker",
    });

    toast({
      title: "Pipeline Created",
      description: `${pipeline.name} has been created`,
    });
  }

  function deletePipeline(id: string) {
    setPipelines((prev) => prev.filter((p) => p.id !== id));
    toast({
      title: "Pipeline Deleted",
      description: "Pipeline has been removed",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500">
            <Rocket className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Deploy Pipelines</h1>
            <p className="text-muted-foreground">
              One-click deployment to your servers
            </p>
          </div>
        </div>

        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Pipeline
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Deploy Pipeline</DialogTitle>
              <DialogDescription>
                Set up automated deployment for your project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Pipeline Name</Label>
                <Input
                  placeholder="Production Deploy"
                  value={newPipeline.name}
                  onChange={(e) =>
                    setNewPipeline((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select
                  value={newPipeline.project}
                  onValueChange={(v) =>
                    setNewPipeline((p) => ({ ...p, project: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((proj) => (
                      <SelectItem key={proj} value={proj}>
                        {proj}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Server</Label>
                <Select
                  value={newPipeline.targetServer}
                  onValueChange={(v) =>
                    setNewPipeline((p) => ({ ...p, targetServer: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select server" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        {server.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input
                    placeholder="main"
                    value={newPipeline.branch}
                    onChange={(e) =>
                      setNewPipeline((p) => ({ ...p, branch: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Deploy Type</Label>
                  <Select
                    value={newPipeline.deployType}
                    onValueChange={(v: Pipeline["deployType"]) =>
                      setNewPipeline((p) => ({ ...p, deployType: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="docker">Docker</SelectItem>
                      <SelectItem value="pm2">PM2</SelectItem>
                      <SelectItem value="systemd">Systemd</SelectItem>
                      <SelectItem value="script">Custom Script</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createPipeline}>Create Pipeline</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pipelines.map((pipeline) => (
          <Card key={pipeline.id} className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{pipeline.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <Box className="h-3 w-3" />
                    {pipeline.project}
                  </CardDescription>
                </div>
                {getStatusBadge(pipeline.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Server className="h-4 w-4" />
                  {servers.find((s) => s.id === pipeline.targetServer)?.name ||
                    pipeline.targetServer}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <GitBranch className="h-4 w-4" />
                  {pipeline.branch}
                </div>
                {pipeline.lastRun && (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {formatTimeAgo(pipeline.lastRun)}
                    </div>
                    {pipeline.lastDuration && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <RefreshCw className="h-4 w-4" />
                        {formatDuration(pipeline.lastDuration)}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  onClick={() => runPipeline(pipeline)}
                  disabled={pipeline.status === "running"}
                >
                  {pipeline.status === "running" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Deploy
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setSelectedPipeline(pipeline);
                    setShowLogs(true);
                  }}
                >
                  <Terminal className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => deletePipeline(pipeline.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Pipeline Logs: {selectedPipeline?.name}
            </DialogTitle>
            <DialogDescription>
              View deployment history and logs
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPipeline?.runs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No deployment runs yet</p>
              </div>
            ) : (
              selectedPipeline?.runs.slice(0, 5).map((run) => (
                <Card key={run.id}>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {new Date(run.startedAt).toLocaleString()}
                      </CardTitle>
                      {run.status === "running" ? (
                        <Badge className="bg-blue-500/20 text-blue-400">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Running
                        </Badge>
                      ) : run.status === "success" ? (
                        <Badge className="bg-green-500/20 text-green-400">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Success
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400">
                          <XCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="py-0 pb-3">
                    <ScrollArea className="h-[150px] rounded-lg bg-gray-950 p-3 font-mono text-xs">
                      {run.logs.map((log, idx) => (
                        <div
                          key={idx}
                          className={
                            log.includes("Error") || log.includes("failed")
                              ? "text-red-400"
                              : log.includes("Success") || log.includes("complete")
                              ? "text-green-400"
                              : "text-gray-300"
                          }
                        >
                          {log}
                        </div>
                      ))}
                    </ScrollArea>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-400" />
            Quick Deploy
          </CardTitle>
          <CardDescription>Deploy services directly to your servers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {servers.map((server) => (
              <Button
                key={server.id}
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => {
                  toast({
                    title: "Quick Deploy",
                    description: `Opening SSH connection to ${server.name}...`,
                  });
                }}
              >
                <Server className="h-5 w-5" />
                <span className="text-xs">{server.name}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
