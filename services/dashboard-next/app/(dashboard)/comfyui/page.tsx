"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  Activity,
  Workflow,
  ListTodo,
  ListOrdered,
  Clock,
  Play,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { ComfyUIStatusCard } from "./components/comfyui-status-card";
import { WorkflowList } from "./components/workflow-list";
import { WorkflowForm } from "./components/workflow-form";
import { JobList } from "./components/job-list";
import { ExecuteWorkflowDialog } from "./components/execute-workflow-dialog";

interface ComfyUIStatus {
  state: "ready" | "loading" | "offline" | "error" | "busy";
  isReady: boolean;
  lastCheck: string | null;
  vramUsage: number | null;
  queueSize: number;
  modelLoadProgress: number | null;
  deviceCount: number;
  errorMessage: string | null;
}

interface WorkflowData {
  id: string;
  name: string;
  description: string | null;
  workflowJson?: any;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface JobData {
  id: string;
  workflowId: string | null;
  promptId: string | null;
  status: string;
  inputParams: any;
  outputAssets: any;
  errorMessage: string | null;
  errorCode: string | null;
  retryCount: number;
  maxRetries: number;
  priority: number;
  batchId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface QueueItem {
  promptId: string;
  workflowId?: string;
  position: number;
  priority: number;
  status: string;
  createdAt: string;
}

export default function ComfyUIPage() {
  const [activeTab, setActiveTab] = useState("status");
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(10);
  
  const [status, setStatus] = useState<ComfyUIStatus | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  
  const [workflowFormOpen, setWorkflowFormOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowData | null>(null);
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [executingWorkflow, setExecutingWorkflow] = useState<WorkflowData | null>(null);

  const fetchStatus = useCallback(async (forceRefresh = false) => {
    try {
      const params = forceRefresh ? "?refresh=true" : "";
      const response = await fetch(`/api/ai/comfyui/status${params}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  }, []);

  const fetchWorkflows = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/comfyui/workflows", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data.workflows || []);
      }
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/comfyui/jobs?limit=50", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/comfyui/queue", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setQueue(data.queue || []);
      }
    } catch (error) {
      console.error("Failed to fetch queue:", error);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchWorkflows(), fetchJobs(), fetchQueue()]);
    setLoading(false);
    setCountdown(10);
  }, [fetchStatus, fetchWorkflows, fetchJobs, fetchQueue]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      if (activeTab === "status" || activeTab === "queue") {
        fetchStatus();
        fetchQueue();
      }
      if (activeTab === "jobs") {
        fetchJobs();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAllData, activeTab, fetchStatus, fetchQueue, fetchJobs]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 10));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleNewWorkflow = () => {
    setEditingWorkflow(null);
    setWorkflowFormOpen(true);
  };

  const handleEditWorkflow = (workflow: WorkflowData) => {
    setEditingWorkflow(workflow);
    setWorkflowFormOpen(true);
  };

  const handleExecuteWorkflow = (workflow: WorkflowData) => {
    setExecutingWorkflow(workflow);
    setExecuteDialogOpen(true);
  };

  const handleWorkflowSaved = () => {
    fetchWorkflows();
  };

  const handleExecuted = () => {
    fetchJobs();
    fetchQueue();
    fetchStatus();
  };

  const jobStats = {
    pending: jobs.filter((j) => j.status === "pending").length,
    running: jobs.filter((j) => j.status === "running").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading ComfyUI dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">ComfyUI</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage workflows and jobs for image generation
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshing in {countdown}s
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAllData()}
          >
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh All</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="status" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Status</span>
          </TabsTrigger>
          <TabsTrigger value="workflows" className="gap-2">
            <Workflow className="h-4 w-4" />
            <span className="hidden sm:inline">Workflows</span>
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-2">
            <ListTodo className="h-4 w-4" />
            <span className="hidden sm:inline">Jobs</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <ListOrdered className="h-4 w-4" />
            <span className="hidden sm:inline">Queue</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Workflows</CardTitle>
                <Workflow className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{workflows.length}</div>
                <p className="text-xs text-muted-foreground">Available workflows</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Running</CardTitle>
                <Play className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">{jobStats.running}</div>
                <p className="text-xs text-muted-foreground">Jobs in progress</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{jobStats.completed}</div>
                <p className="text-xs text-muted-foreground">Successful jobs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Failed</CardTitle>
                <XCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{jobStats.failed}</div>
                <p className="text-xs text-muted-foreground">Failed jobs</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ComfyUIStatusCard
              status={status}
              onRefresh={() => fetchStatus(true)}
            />
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No recent jobs
                  </p>
                ) : (
                  <div className="space-y-2">
                    {jobs.slice(0, 5).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="font-mono text-xs">
                          {job.id.slice(0, 8)}...
                        </span>
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "success"
                              : job.status === "failed"
                              ? "destructive"
                              : job.status === "running"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {job.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-4">
          <WorkflowList
            workflows={workflows}
            onRefresh={fetchWorkflows}
            onExecute={handleExecuteWorkflow}
            onEdit={handleEditWorkflow}
            onNew={handleNewWorkflow}
          />
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <JobList jobs={jobs} onRefresh={fetchJobs} />
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Queue Status</CardTitle>
                  <CardDescription>
                    Real-time view of pending and running jobs
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchQueue}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                <div className="rounded-lg border p-4 text-center">
                  <Clock className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
                  <p className="text-2xl font-bold">{status?.queueSize || 0}</p>
                  <p className="text-sm text-muted-foreground">In Queue</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <Play className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                  <p className="text-2xl font-bold">{jobStats.running}</p>
                  <p className="text-sm text-muted-foreground">Running</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <Activity className="h-8 w-8 mx-auto text-green-500 mb-2" />
                  <p className="text-2xl font-bold">{status?.deviceCount || 0}</p>
                  <p className="text-sm text-muted-foreground">GPU Devices</p>
                </div>
              </div>

              {queue.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ListOrdered className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Queue is empty</p>
                  <p className="text-sm">Execute a workflow to add items to the queue</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium text-sm">Position</th>
                        <th className="text-left py-3 px-2 font-medium text-sm">Prompt ID</th>
                        <th className="text-left py-3 px-2 font-medium text-sm">Status</th>
                        <th className="text-left py-3 px-2 font-medium text-sm">Priority</th>
                        <th className="text-left py-3 px-2 font-medium text-sm">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.map((item, index) => (
                        <tr key={item.promptId} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2 text-sm">#{index + 1}</td>
                          <td className="py-3 px-2 font-mono text-sm">
                            {item.promptId?.slice(0, 8) || "-"}...
                          </td>
                          <td className="py-3 px-2">
                            <Badge
                              variant={
                                item.status === "running"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {item.status || "pending"}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 text-sm">{item.priority || 0}</td>
                          <td className="py-3 px-2 text-sm text-muted-foreground">
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleTimeString()
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <WorkflowForm
        open={workflowFormOpen}
        onOpenChange={setWorkflowFormOpen}
        workflow={editingWorkflow}
        onSave={handleWorkflowSaved}
      />

      <ExecuteWorkflowDialog
        open={executeDialogOpen}
        onOpenChange={setExecuteDialogOpen}
        workflow={executingWorkflow}
        onExecuted={handleExecuted}
      />
    </div>
  );
}
