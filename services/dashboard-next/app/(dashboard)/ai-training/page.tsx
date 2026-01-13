"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  Brain,
  Zap,
  Clock,
  CheckCircle,
  Play,
  Loader2,
  RefreshCw,
  Plus,
  AlertCircle,
  Pause,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface TrainingRun {
  id: string;
  runType: "lora" | "qlora" | "sdxl" | "dreambooth";
  baseModel: string;
  outputName: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  progress: number;
  currentEpoch: number;
  totalEpochs: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  config?: {
    learningRate?: number;
    epochs?: number;
    batchSize?: number;
  };
  metrics?: {
    loss?: number;
    elapsedTime?: number;
  };
}

interface TrainingResponse {
  success: boolean;
  runs: TrainingRun[];
}

const RUN_TYPES = [
  { value: "lora", label: "LoRA", description: "Low-Rank Adaptation" },
  { value: "qlora", label: "QLoRA", description: "Quantized LoRA" },
  { value: "sdxl", label: "SDXL", description: "Stable Diffusion XL" },
  { value: "dreambooth", label: "DreamBooth", description: "Subject-driven generation" },
];

export default function AITrainingPage() {
  const [data, setData] = useState<TrainingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runProgress, setRunProgress] = useState<Record<string, number>>({});
  const eventSourcesRef = useRef<Record<string, EventSource>>({});
  
  const [newRun, setNewRun] = useState({
    runType: "lora",
    baseModel: "",
    outputName: "",
    learningRate: "1e-4",
    epochs: "10",
    batchSize: "1",
  });

  const fetchTrainingRuns = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    try {
      const response = await fetch("/api/ai/training", { cache: "no-store" });
      if (response.ok) {
        const result = await response.json();
        setData(result);
        setCountdown(10);
        
        const initialProgress: Record<string, number> = {};
        result.runs?.forEach((run: TrainingRun) => {
          initialProgress[run.id] = run.progress || 0;
        });
        setRunProgress(prev => ({ ...prev, ...initialProgress }));
      }
    } catch (error) {
      console.error("Failed to fetch training runs:", error);
      toast.error("Failed to fetch training runs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTrainingRuns();
    const interval = setInterval(() => fetchTrainingRuns(), 10000);
    return () => clearInterval(interval);
  }, [fetchTrainingRuns]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 10));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const runningRuns = data?.runs?.filter(run => run.status === "running") || [];
    
    runningRuns.forEach(run => {
      if (!eventSourcesRef.current[run.id]) {
        const eventSource = new EventSource(`/api/ai/training/${run.id}/events`);
        
        eventSource.onmessage = (event) => {
          try {
            const eventData = JSON.parse(event.data);
            if (eventData.type === "progress" && eventData.payload?.progress !== undefined) {
              setRunProgress(prev => ({
                ...prev,
                [run.id]: eventData.payload.progress
              }));
            }
            if (eventData.type === "completed" || eventData.type === "failed") {
              fetchTrainingRuns();
            }
          } catch (e) {
            console.error("Failed to parse SSE event:", e);
          }
        };
        
        eventSource.onerror = () => {
          eventSource.close();
          delete eventSourcesRef.current[run.id];
        };
        
        eventSourcesRef.current[run.id] = eventSource;
      }
    });

    Object.keys(eventSourcesRef.current).forEach(runId => {
      if (!runningRuns.find(r => r.id === runId)) {
        eventSourcesRef.current[runId].close();
        delete eventSourcesRef.current[runId];
      }
    });

    return () => {
      Object.values(eventSourcesRef.current).forEach(es => es.close());
    };
  }, [data?.runs, fetchTrainingRuns]);

  const handleCreateRun = async () => {
    if (!newRun.baseModel || !newRun.outputName) {
      toast.error("Base model and output name are required");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/ai/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runType: newRun.runType,
          baseModel: newRun.baseModel,
          outputName: newRun.outputName,
          datasetPath: "/datasets/default",
          config: {
            learningRate: parseFloat(newRun.learningRate),
            epochs: parseInt(newRun.epochs),
            batchSize: parseInt(newRun.batchSize),
          },
        }),
      });

      if (response.ok) {
        toast.success("Training run created successfully");
        setDialogOpen(false);
        setNewRun({
          runType: "lora",
          baseModel: "",
          outputName: "",
          learningRate: "1e-4",
          epochs: "10",
          batchSize: "1",
        });
        await fetchTrainingRuns(true);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to create training run");
      }
    } catch (error) {
      toast.error("Failed to create training run");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      case "running":
        return <Badge className="bg-blue-500/10 text-blue-500 border-transparent">Running</Badge>;
      case "paused":
        return <Badge variant="secondary">Paused</Badge>;
      case "completed":
        return <Badge variant="success">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRunTypeLabel = (type: string) => {
    const runType = RUN_TYPES.find(t => t.value === type);
    return runType?.label || type.toUpperCase();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const runs = data?.runs || [];
  const activeRuns = runs.filter(r => r.status === "running" || r.status === "pending").length;
  const completedRuns = runs.filter(r => r.status === "completed").length;
  const totalEpochs = runs.reduce((sum, r) => sum + (r.totalEpochs || r.config?.epochs || 0), 0);
  const avgDuration = runs
    .filter(r => r.completedAt && r.startedAt)
    .reduce((sum, r, _, arr) => {
      const duration = new Date(r.completedAt!).getTime() - new Date(r.startedAt!).getTime();
      return sum + duration / arr.length;
    }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading training runs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            AI Training
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Train and fine-tune AI models with LoRA, QLoRA, SDXL, and DreamBooth
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshing in {countdown}s
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTrainingRuns(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">New Training Run</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New Training Run</DialogTitle>
                <DialogDescription>
                  Configure and start a new model training run.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="run-type">Run Type</Label>
                  <Select value={newRun.runType} onValueChange={(v) => setNewRun({ ...newRun, runType: v })}>
                    <SelectTrigger id="run-type">
                      <SelectValue placeholder="Select run type" />
                    </SelectTrigger>
                    <SelectContent>
                      {RUN_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex flex-col">
                            <span>{type.label}</span>
                            <span className="text-xs text-muted-foreground">{type.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="base-model">Base Model</Label>
                  <Input
                    id="base-model"
                    value={newRun.baseModel}
                    onChange={(e) => setNewRun({ ...newRun, baseModel: e.target.value })}
                    placeholder="e.g., mistralai/Mistral-7B-v0.1"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="output-name">Output Name</Label>
                  <Input
                    id="output-name"
                    value={newRun.outputName}
                    onChange={(e) => setNewRun({ ...newRun, outputName: e.target.value })}
                    placeholder="e.g., my-custom-model"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="learning-rate">Learning Rate</Label>
                    <Input
                      id="learning-rate"
                      value={newRun.learningRate}
                      onChange={(e) => setNewRun({ ...newRun, learningRate: e.target.value })}
                      placeholder="1e-4"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="epochs">Epochs</Label>
                    <Input
                      id="epochs"
                      type="number"
                      min={1}
                      value={newRun.epochs}
                      onChange={(e) => setNewRun({ ...newRun, epochs: e.target.value })}
                      placeholder="10"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="batch-size">Batch Size</Label>
                    <Input
                      id="batch-size"
                      type="number"
                      min={1}
                      value={newRun.batchSize}
                      onChange={(e) => setNewRun({ ...newRun, batchSize: e.target.value })}
                      placeholder="1"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateRun} disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Start Training
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Runs</CardTitle>
            <Play className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{activeRuns}</div>
            <p className="text-xs text-muted-foreground">Currently training</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{completedRuns}</div>
            <p className="text-xs text-muted-foreground">Successfully trained</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Epochs</CardTitle>
            <Zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{totalEpochs}</div>
            <p className="text-xs text-muted-foreground">Across all runs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">
              {avgDuration > 0 ? formatDuration(avgDuration) : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Per training run</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Training Runs</CardTitle>
          <CardDescription>Monitor and manage your model training runs</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Brain className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Training Runs</h3>
              <p className="text-muted-foreground max-w-md">
                You haven't started any training runs yet. Click "New Training Run" to begin.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {runs.map((run) => {
                const progress = runProgress[run.id] ?? run.progress ?? 0;
                return (
                  <div
                    key={run.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-muted-foreground">
                          {run.id.slice(0, 8)}...
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getRunTypeLabel(run.runType)}
                        </Badge>
                        {getStatusBadge(run.status)}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium truncate">{run.baseModel}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-primary truncate">{run.outputName}</span>
                      </div>
                      {run.status === "running" && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Epoch {run.currentEpoch || 0}/{run.totalEpochs || run.config?.epochs || 0}
                            </span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                          {run.metrics?.loss !== undefined && (
                            <div className="text-xs text-muted-foreground">
                              Loss: {run.metrics.loss.toFixed(4)}
                              {run.metrics.elapsedTime && (
                                <span className="ml-2">
                                  Elapsed: {formatDuration(run.metrics.elapsedTime)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(run.createdAt)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
