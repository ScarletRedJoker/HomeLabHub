'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Bot, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Plus,
  FileCode,
  GitBranch,
  Loader2,
  RefreshCw,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Undo2,
  ChevronDown,
  ChevronRight,
  Terminal,
  Zap,
  Timer,
  Sparkles,
  GitMerge,
  AlertCircle,
  FileText,
  Code,
  Settings
} from 'lucide-react';

interface BranchMetadata {
  branchName?: string;
  originalBranch?: string;
  branchMerged?: boolean;
}

interface Job {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  provider: string | null;
  model: string | null;
  targetPaths: string[] | null;
  filesModified: string[] | null;
  testsRun: boolean | null;
  testsPassed: boolean | null;
  buildRun: boolean | null;
  buildPassed: boolean | null;
  buildOutput: string | null;
  tokensUsed: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  branchMetadata: BranchMetadata | null;
  autoApprovalRule: string | null;
  context: unknown;
  plan: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface Patch {
  id: string;
  jobId: string;
  filePath: string;
  patchType: string;
  diffUnified: string | null;
  diffStats: {
    additions: number;
    deletions: number;
    hunks: number;
  } | null;
  status: string;
  appliedAt: string | null;
  rolledBackAt: string | null;
}

interface ExecutionRun {
  id: string;
  stepIndex: number | null;
  stepName: string | null;
  action: string;
  status: string | null;
  durationMs: number | null;
  tokensUsed: number | null;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

interface Approval {
  id: string;
  decision: string;
  comments: string | null;
  isAutoApproved: boolean;
  autoApprovalRule: string | null;
  reviewedAt: string | null;
}

interface Provider {
  name: string;
  health?: {
    isHealthy: boolean;
    latencyMs: number;
    availableModels: string[];
    error?: string;
  };
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-500',
  planning: 'bg-blue-500',
  executing: 'bg-yellow-500',
  review: 'bg-purple-500',
  approved: 'bg-green-500',
  applied: 'bg-green-600',
  rejected: 'bg-red-500',
  rolled_back: 'bg-orange-500',
  failed: 'bg-red-600',
};

const typeIcons: Record<string, React.ReactNode> = {
  feature: <Plus className="h-4 w-4" />,
  bugfix: <FileCode className="h-4 w-4" />,
  refactor: <GitBranch className="h-4 w-4" />,
  test: <CheckCircle className="h-4 w-4" />,
  docs: <FileCode className="h-4 w-4" />,
};

function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split('\n');
  
  return (
    <pre className="text-xs font-mono overflow-x-auto p-3 bg-muted rounded-lg">
      {lines.map((line, index) => {
        let className = '';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className = 'text-green-500 bg-green-500/10';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = 'text-red-500 bg-red-500/10';
        } else if (line.startsWith('@@')) {
          className = 'text-blue-400 bg-blue-500/10';
        } else if (line.startsWith('diff') || line.startsWith('index')) {
          className = 'text-muted-foreground';
        }
        
        return (
          <div key={index} className={`${className} whitespace-pre`}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

function ExecutionProgress({ job, runs }: { job: Job; runs: ExecutionRun[] }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const isExecuting = ['planning', 'executing'].includes(job.status);
  
  useEffect(() => {
    if (!isExecuting) return;
    
    const startTime = new Date(job.createdAt).getTime();
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isExecuting, job.createdAt]);

  const currentStep = runs.length;
  const maxSteps = 20;
  const progress = Math.min((currentStep / maxSteps) * 100, 95);
  const totalTokens = runs.reduce((sum, run) => sum + (run.tokensUsed || 0), 0);
  const latestRun = runs[runs.length - 1];

  const formatElapsed = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!isExecuting && !job.durationMs) return null;

  return (
    <Card className="border-yellow-500/50 bg-yellow-500/5">
      <CardContent className="pt-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isExecuting ? (
                <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              <span className="font-medium">
                {isExecuting ? 'Executing...' : 'Completed'}
              </span>
            </div>
            <Badge variant="outline">
              Step {currentStep} of ~{maxSteps}
            </Badge>
          </div>

          <Progress value={isExecuting ? progress : 100} className="h-2" />

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span>
                {isExecuting ? formatElapsed(elapsedTime) : formatDuration(job.durationMs)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span>{totalTokens.toLocaleString()} tokens</span>
            </div>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span>{currentStep} steps</span>
            </div>
          </div>

          {isExecuting && latestRun && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
              <span className="font-medium">Current: </span>
              {latestRun.action === 'tool_calls' ? 'Executing tools' : 'Processing response'}
              {latestRun.stepName && ` (${latestRun.stepName})`}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDuration(ms: number | null) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function AIDevPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobPatches, setJobPatches] = useState<Patch[]>([]);
  const [jobRuns, setJobRuns] = useState<ExecutionRun[]>([]);
  const [jobApprovals, setJobApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [expandedPatches, setExpandedPatches] = useState<Set<string>>(new Set());

  const [newJob, setNewJob] = useState({
    title: '',
    description: '',
    type: 'feature',
    targetPaths: '',
    provider: 'ollama',
    autoExecute: false,
  });

  const hasExecutingJob = useMemo(() => {
    return jobs.some(job => ['planning', 'executing'].includes(job.status));
  }, [jobs]);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/dev/jobs');
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  }, []);

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/dev/providers?health=true');
      const data = await response.json();
      if (data.success) {
        setProviders(data.providers);
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    }
  }, []);

  const fetchJobDetails = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/ai/dev/jobs/${jobId}`);
      const data = await response.json();
      if (data.success) {
        setSelectedJob(data.job);
        setJobPatches(data.patches || []);
        setJobRuns(data.runs || []);
        setJobApprovals(data.approvals || []);
      }
    } catch (error) {
      console.error('Failed to fetch job details:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchJobs(), fetchProviders()]);
      setLoading(false);
    };
    loadData();
  }, [fetchJobs, fetchProviders]);

  useEffect(() => {
    const interval = setInterval(fetchJobs, hasExecutingJob ? 2000 : 5000);
    return () => clearInterval(interval);
  }, [fetchJobs, hasExecutingJob]);

  useEffect(() => {
    if (selectedJob && detailDialogOpen && ['planning', 'executing'].includes(selectedJob.status)) {
      const interval = setInterval(() => {
        fetchJobDetails(selectedJob.id);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [selectedJob, detailDialogOpen, fetchJobDetails]);

  const handleCreateJob = async () => {
    setActionLoading('create');
    try {
      const response = await fetch('/api/ai/dev/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newJob,
          targetPaths: newJob.targetPaths ? newJob.targetPaths.split(',').map(p => p.trim()) : undefined,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCreateDialogOpen(false);
        setNewJob({
          title: '',
          description: '',
          type: 'feature',
          targetPaths: '',
          provider: 'ollama',
          autoExecute: false,
        });
        fetchJobs();
      }
    } catch (error) {
      console.error('Failed to create job:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleJobAction = async (jobId: string, action: string, reason?: string) => {
    setActionLoading(`${action}-${jobId}`);
    try {
      const response = await fetch(`/api/ai/dev/jobs/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const data = await response.json();
      if (data.success) {
        fetchJobs();
        if (selectedJob?.id === jobId) {
          fetchJobDetails(jobId);
        }
      }
    } catch (error) {
      console.error(`Failed to ${action} job:`, error);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleRunExpanded = (runId: string) => {
    setExpandedRuns(prev => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const togglePatchExpanded = (patchId: string) => {
    setExpandedPatches(prev => {
      const next = new Set(prev);
      if (next.has(patchId)) {
        next.delete(patchId);
      } else {
        next.add(patchId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8" />
            AI Developer
          </h1>
          <p className="text-muted-foreground mt-1">
            Autonomous code modification and development assistance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { fetchJobs(); fetchProviders(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Job
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create AI Development Job</DialogTitle>
                <DialogDescription>
                  Describe what you want the AI to do. It will analyze the codebase and make changes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Task Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Add dark mode toggle to settings page"
                    value={newJob.title}
                    onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Provide more details about the task..."
                    value={newJob.description}
                    onChange={(e) => setNewJob({ ...newJob, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Job Type</Label>
                    <Select value={newJob.type} onValueChange={(v) => setNewJob({ ...newJob, type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="feature">Feature</SelectItem>
                        <SelectItem value="bugfix">Bug Fix</SelectItem>
                        <SelectItem value="refactor">Refactor</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="docs">Documentation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider">AI Provider</Label>
                    <Select value={newJob.provider} onValueChange={(v) => setNewJob({ ...newJob, provider: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name} {p.health?.isHealthy ? '✓' : '✗'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetPaths">Target Paths (optional, comma-separated)</Label>
                  <Input
                    id="targetPaths"
                    placeholder="e.g., services/dashboard-next/app, services/dashboard-next/components"
                    value={newJob.targetPaths}
                    onChange={(e) => setNewJob({ ...newJob, targetPaths: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoExecute"
                    checked={newJob.autoExecute}
                    onChange={(e) => setNewJob({ ...newJob, autoExecute: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="autoExecute">Start execution immediately</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateJob} disabled={!newJob.title || actionLoading === 'create'}>
                  {actionLoading === 'create' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Job
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
          <div className="grid gap-4">
            {jobs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No jobs yet</h3>
                  <p className="text-muted-foreground">Create your first AI development job to get started.</p>
                </CardContent>
              </Card>
            ) : (
              jobs.map((job) => (
                <Card key={job.id} className={`hover:border-primary/50 transition-colors ${['planning', 'executing'].includes(job.status) ? 'border-yellow-500/50' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {typeIcons[job.type] || <FileCode className="h-4 w-4" />}
                        <CardTitle className="text-lg">{job.title}</CardTitle>
                        {job.autoApprovalRule && (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Auto-approved
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {['planning', 'executing'].includes(job.status) && (
                          <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                        )}
                        <Badge className={statusColors[job.status]}>{job.status}</Badge>
                      </div>
                    </div>
                    {job.description && (
                      <CardDescription className="mt-1">{job.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(job.durationMs)}
                        </span>
                        {job.tokensUsed && (
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {job.tokensUsed.toLocaleString()} tokens
                          </span>
                        )}
                        {job.filesModified && (
                          <span className="flex items-center gap-1">
                            <FileCode className="h-3 w-3" />
                            {job.filesModified.length} files
                          </span>
                        )}
                        {job.testsRun && (
                          <span className={`flex items-center gap-1 ${job.testsPassed ? 'text-green-500' : 'text-red-500'}`}>
                            <CheckCircle className="h-3 w-3" />
                            Tests {job.testsPassed ? 'passed' : 'failed'}
                          </span>
                        )}
                        {job.branchMetadata?.branchName && (
                          <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {job.branchMetadata.branchName}
                          </span>
                        )}
                        <span>{job.provider || 'ollama'}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            fetchJobDetails(job.id);
                            setDetailDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        {job.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => handleJobAction(job.id, 'execute')}
                            disabled={actionLoading === `execute-${job.id}`}
                          >
                            {actionLoading === `execute-${job.id}` ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-1" />
                            )}
                            Execute
                          </Button>
                        )}
                        {job.status === 'review' && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleJobAction(job.id, 'approve')}
                              disabled={actionLoading === `approve-${job.id}`}
                            >
                              {actionLoading === `approve-${job.id}` ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <ThumbsUp className="h-4 w-4 mr-1" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleJobAction(job.id, 'reject')}
                              disabled={actionLoading === `reject-${job.id}`}
                            >
                              {actionLoading === `reject-${job.id}` ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <ThumbsDown className="h-4 w-4 mr-1" />
                              )}
                              Reject
                            </Button>
                          </>
                        )}
                        {job.status === 'applied' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleJobAction(job.id, 'rollback')}
                            disabled={actionLoading === `rollback-${job.id}`}
                          >
                            {actionLoading === `rollback-${job.id}` ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Undo2 className="h-4 w-4 mr-1" />
                            )}
                            Rollback
                          </Button>
                        )}
                        {['planning', 'executing'].includes(job.status) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleJobAction(job.id, 'cancel')}
                            disabled={actionLoading === `cancel-${job.id}`}
                          >
                            {actionLoading === `cancel-${job.id}` ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4 mr-1" />
                            )}
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                    {job.errorMessage && (
                      <div className="mt-2 text-sm text-red-500 bg-red-500/10 p-2 rounded flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        {job.errorMessage}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="providers" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => (
              <Card key={provider.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg capitalize">{provider.name}</CardTitle>
                    <Badge variant={provider.health?.isHealthy ? 'default' : 'destructive'}>
                      {provider.health?.isHealthy ? 'Healthy' : 'Unhealthy'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {provider.health && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Latency</span>
                        <span>{provider.health.latencyMs}ms</span>
                      </div>
                      {provider.health.availableModels.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Models:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {provider.health.availableModels.slice(0, 5).map((model) => (
                              <Badge key={model} variant="outline" className="text-xs">
                                {model}
                              </Badge>
                            ))}
                            {provider.health.availableModels.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{provider.health.availableModels.length - 5} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                      {provider.health.error && (
                        <div className="text-red-500">{provider.health.error}</div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedJob && typeIcons[selectedJob.type]}
              {selectedJob?.title}
              {selectedJob?.autoApprovalRule && (
                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Auto-approved: {selectedJob.autoApprovalRule}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>{selectedJob?.description}</DialogDescription>
          </DialogHeader>

          {selectedJob && ['planning', 'executing'].includes(selectedJob.status) && (
            <ExecutionProgress job={selectedJob} runs={jobRuns} />
          )}

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="patches" className="flex items-center gap-1">
                <Code className="h-4 w-4" />
                Patches ({jobPatches.length})
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex items-center gap-1">
                <Terminal className="h-4 w-4" />
                Logs ({jobRuns.length})
              </TabsTrigger>
              <TabsTrigger value="context" className="flex items-center gap-1">
                <Settings className="h-4 w-4" />
                Context
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[50vh] mt-4">
              <TabsContent value="overview" className="space-y-4 p-1">
                {selectedJob && (
                  <>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <Badge className={`ml-2 ${statusColors[selectedJob.status]}`}>
                          {selectedJob.status}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <span className="ml-2 capitalize">{selectedJob.type}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Provider:</span>
                        <span className="ml-2">{selectedJob.provider || 'ollama'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Duration:</span>
                        <span className="ml-2">{formatDuration(selectedJob.durationMs)}</span>
                      </div>
                      {selectedJob.tokensUsed && (
                        <div>
                          <span className="text-muted-foreground">Tokens:</span>
                          <span className="ml-2">{selectedJob.tokensUsed.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedJob.testsRun && (
                        <div>
                          <span className="text-muted-foreground">Tests:</span>
                          <span className={`ml-2 ${selectedJob.testsPassed ? 'text-green-500' : 'text-red-500'}`}>
                            {selectedJob.testsPassed ? 'Passed' : 'Failed'}
                          </span>
                        </div>
                      )}
                      {selectedJob.buildRun && (
                        <div>
                          <span className="text-muted-foreground">Build:</span>
                          <span className={`ml-2 ${selectedJob.buildPassed ? 'text-green-500' : 'text-red-500'}`}>
                            {selectedJob.buildPassed ? 'Passed' : 'Failed'}
                          </span>
                        </div>
                      )}
                    </div>

                    {selectedJob.branchMetadata && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <GitBranch className="h-4 w-4" />
                            Branch Information
                          </h4>
                          <div className="grid grid-cols-2 gap-4 text-sm bg-muted/50 rounded p-3">
                            {selectedJob.branchMetadata.branchName && (
                              <div>
                                <span className="text-muted-foreground">Current Branch:</span>
                                <code className="ml-2 bg-muted px-1 rounded">{selectedJob.branchMetadata.branchName}</code>
                              </div>
                            )}
                            {selectedJob.branchMetadata.originalBranch && (
                              <div>
                                <span className="text-muted-foreground">Original Branch:</span>
                                <code className="ml-2 bg-muted px-1 rounded">{selectedJob.branchMetadata.originalBranch}</code>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">Merge Status:</span>
                              <Badge variant="outline" className={`ml-2 ${selectedJob.branchMetadata.branchMerged ? 'bg-green-500/10 text-green-600' : ''}`}>
                                {selectedJob.branchMetadata.branchMerged ? (
                                  <>
                                    <GitMerge className="h-3 w-3 mr-1" />
                                    Merged
                                  </>
                                ) : 'Not Merged'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {jobApprovals.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-medium mb-2">Approvals</h4>
                          <div className="space-y-2">
                            {jobApprovals.map((approval) => (
                              <div key={approval.id} className="border rounded p-3 text-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={approval.decision === 'approved' ? 'default' : 'destructive'}>
                                      {approval.decision}
                                    </Badge>
                                    {approval.isAutoApproved && (
                                      <Badge variant="outline" className="bg-green-500/10 text-green-600">
                                        <Sparkles className="h-3 w-3 mr-1" />
                                        Auto: {approval.autoApprovalRule}
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-muted-foreground">
                                    {approval.reviewedAt && new Date(approval.reviewedAt).toLocaleString()}
                                  </span>
                                </div>
                                {approval.comments && (
                                  <p className="mt-2 text-muted-foreground">{approval.comments}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {selectedJob.errorMessage && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-medium mb-2 text-red-500 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Error
                          </h4>
                          <div className="bg-red-500/10 p-3 rounded text-sm text-red-500">
                            {selectedJob.errorMessage}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="patches" className="space-y-4 p-1">
                {jobPatches.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No patches generated yet
                  </div>
                ) : (
                  jobPatches.map((patch) => (
                    <Collapsible
                      key={patch.id}
                      open={expandedPatches.has(patch.id)}
                      onOpenChange={() => togglePatchExpanded(patch.id)}
                    >
                      <div className="border rounded-lg">
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                            <div className="flex items-center gap-2">
                              {expandedPatches.has(patch.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <FileCode className="h-4 w-4" />
                              <code className="text-sm">{patch.filePath}</code>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{patch.patchType}</Badge>
                              <Badge variant={patch.status === 'applied' ? 'default' : 'secondary'}>
                                {patch.status}
                              </Badge>
                              {patch.diffStats && (
                                <div className="text-xs text-muted-foreground">
                                  <span className="text-green-500">+{patch.diffStats.additions}</span>
                                  {' / '}
                                  <span className="text-red-500">-{patch.diffStats.deletions}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {patch.diffUnified && (
                            <div className="border-t p-3">
                              <DiffViewer diff={patch.diffUnified} />
                            </div>
                          )}
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))
                )}
              </TabsContent>

              <TabsContent value="logs" className="space-y-4 p-1">
                {jobRuns.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No execution logs yet
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-muted-foreground mb-2">
                      Total: {jobRuns.length} steps, {jobRuns.reduce((sum, r) => sum + (r.tokensUsed || 0), 0).toLocaleString()} tokens
                    </div>
                    {jobRuns.map((run) => (
                      <Collapsible
                        key={run.id}
                        open={expandedRuns.has(run.id)}
                        onOpenChange={() => toggleRunExpanded(run.id)}
                      >
                        <div className="border rounded-lg">
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                              <div className="flex items-center gap-2">
                                {expandedRuns.has(run.id) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                                <Badge variant="outline">Step {run.stepIndex}</Badge>
                                <span className="text-sm font-medium">
                                  {run.action === 'tool_calls' ? 'Tool Calls' : 'Response'}
                                </span>
                                {run.stepName && (
                                  <span className="text-sm text-muted-foreground">({run.stepName})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Timer className="h-3 w-3" />
                                  {formatDuration(run.durationMs)}
                                </span>
                                {run.tokensUsed && (
                                  <span className="flex items-center gap-1">
                                    <Zap className="h-3 w-3" />
                                    {run.tokensUsed.toLocaleString()}
                                  </span>
                                )}
                                <Badge variant={run.status === 'completed' ? 'default' : 'destructive'} className="text-xs">
                                  {run.status}
                                </Badge>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t p-3 space-y-3">
                              {run.errorMessage && (
                                <div className="bg-red-500/10 p-2 rounded text-sm text-red-500">
                                  {run.errorMessage}
                                </div>
                              )}
                              {run.output && (
                                <div>
                                  <h5 className="text-sm font-medium mb-1">Output</h5>
                                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-60">
                                    {JSON.stringify(run.output, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                  </>
                )}
              </TabsContent>

              <TabsContent value="context" className="space-y-4 p-1">
                {selectedJob && (
                  <>
                    {selectedJob.targetPaths && selectedJob.targetPaths.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Target Paths</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedJob.targetPaths.map((path, index) => (
                            <Badge key={index} variant="outline">
                              {path}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedJob.filesModified && selectedJob.filesModified.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Files Modified</h4>
                        <div className="bg-muted rounded p-3 space-y-1">
                          {selectedJob.filesModified.map((file, index) => (
                            <code key={index} className="block text-sm">{file}</code>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedJob.plan && (
                      <div>
                        <h4 className="font-medium mb-2">Execution Plan</h4>
                        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-60">
                          {JSON.stringify(selectedJob.plan, null, 2)}
                        </pre>
                      </div>
                    )}

                    {selectedJob.context && (
                      <div>
                        <h4 className="font-medium mb-2">Job Context</h4>
                        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-60">
                          {JSON.stringify(selectedJob.context, null, 2)}
                        </pre>
                      </div>
                    )}

                    {selectedJob.buildOutput && (
                      <div>
                        <h4 className="font-medium mb-2">Build Output</h4>
                        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-60">
                          {selectedJob.buildOutput}
                        </pre>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
