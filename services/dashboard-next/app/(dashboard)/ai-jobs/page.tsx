"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  Cpu,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Plus,
  AlertCircle,
  ListTodo,
  Play,
} from "lucide-react";
import { toast } from "sonner";

interface Job {
  id: string;
  jobType: string;
  status: "queued" | "running" | "completed" | "failed";
  priority: number;
  createdAt: string;
  estimatedVramMb?: number;
  model?: string;
}

interface QueueStatus {
  queueLength: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  jobs: Job[];
}

interface JobsResponse {
  success: boolean;
  queue: QueueStatus;
  filters: {
    status: string | null;
    jobType: string | null;
    limit: number;
    offset: number;
  };
}

const JOB_TYPES = ["chat", "image", "video", "embedding", "training", "tts", "stt"];

export default function AIJobsPage() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newJob, setNewJob] = useState({
    type: "chat",
    priority: 50,
    model: "",
    prompt: "",
  });

  const fetchJobs = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);

      const response = await fetch(`/api/ai/jobs?${params.toString()}`, { cache: "no-store" });
      if (response.ok) {
        const result = await response.json();
        setData(result);
        setCountdown(10);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
      toast.error("Failed to fetch jobs queue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(() => fetchJobs(), 10000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 10));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleQueueJob = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/ai/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: newJob.type,
          priority: newJob.priority,
          model: newJob.model || undefined,
          payload: { prompt: newJob.prompt },
        }),
      });

      if (response.ok) {
        toast.success("Job queued successfully");
        setDialogOpen(false);
        setNewJob({ type: "chat", priority: 50, model: "", prompt: "" });
        await fetchJobs(true);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to queue job");
      }
    } catch (error) {
      toast.error("Failed to queue job");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "queued":
        return <Badge variant="warning">Queued</Badge>;
      case "running":
        return <Badge className="bg-blue-500/10 text-blue-500 border-transparent">Running</Badge>;
      case "completed":
        return <Badge variant="success">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const stats = data?.queue || { queueLength: 0, runningJobs: 0, completedJobs: 0, failedJobs: 0, jobs: [] };
  const totalJobs = stats.queueLength + stats.runningJobs + stats.completedJobs + stats.failedJobs;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading AI jobs queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">AI Jobs Queue</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Monitor and manage AI processing jobs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshing in {countdown}s
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchJobs(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Queue New Job</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Queue New AI Job</DialogTitle>
                <DialogDescription>
                  Create a new AI processing job to add to the queue.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="job-type">Job Type</Label>
                  <Select value={newJob.type} onValueChange={(v) => setNewJob({ ...newJob, type: v })}>
                    <SelectTrigger id="job-type">
                      <SelectValue placeholder="Select job type" />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority (1-100)</Label>
                  <input
                    id="priority"
                    type="number"
                    min={1}
                    max={100}
                    value={newJob.priority}
                    onChange={(e) => setNewJob({ ...newJob, priority: parseInt(e.target.value) || 50 })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="model">Model (optional)</Label>
                  <input
                    id="model"
                    type="text"
                    value={newJob.model}
                    onChange={(e) => setNewJob({ ...newJob, model: e.target.value })}
                    placeholder="e.g., gpt-4, llama2"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="prompt">Prompt / Config</Label>
                  <textarea
                    id="prompt"
                    value={newJob.prompt}
                    onChange={(e) => setNewJob({ ...newJob, prompt: e.target.value })}
                    placeholder="Enter job prompt or configuration..."
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleQueueJob} disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Queue Job
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalJobs}</div>
            <p className="text-xs text-muted-foreground">All jobs in queue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running</CardTitle>
            <Play className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.runningJobs}</div>
            <p className="text-xs text-muted-foreground">Currently processing</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queued</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.queueLength}</div>
            <p className="text-xs text-muted-foreground">Waiting to process</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.completedJobs}</div>
            <p className="text-xs text-muted-foreground">Successfully finished</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Jobs List</CardTitle>
              <CardDescription>View and filter all AI processing jobs</CardDescription>
            </div>
            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {JOB_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(!stats.jobs || stats.jobs.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Jobs Found</h3>
              <p className="text-muted-foreground max-w-md">
                There are no AI jobs in the queue. Click "Queue New Job" to create one.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-sm">ID</th>
                    <th className="text-left py-3 px-2 font-medium text-sm">Type</th>
                    <th className="text-left py-3 px-2 font-medium text-sm">Status</th>
                    <th className="text-left py-3 px-2 font-medium text-sm">Priority</th>
                    <th className="text-left py-3 px-2 font-medium text-sm">Created</th>
                    <th className="text-left py-3 px-2 font-medium text-sm">VRAM</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.jobs.map((job) => (
                    <tr key={job.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2 font-mono text-sm">{job.id.slice(0, 8)}...</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm capitalize">{job.jobType}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2">{getStatusBadge(job.status)}</td>
                      <td className="py-3 px-2 text-sm">{job.priority}</td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {formatDate(job.createdAt)}
                      </td>
                      <td className="py-3 px-2 text-sm">
                        {job.estimatedVramMb ? `${job.estimatedVramMb} MB` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
