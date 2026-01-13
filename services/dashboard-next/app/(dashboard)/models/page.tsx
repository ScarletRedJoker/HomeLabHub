"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Box,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  HardDrive,
  Cpu,
  Clock,
  AlertCircle,
  Server,
  Layers,
  Palette,
  Sparkles,
  Grid,
  List,
  Link as LinkIcon,
  X,
  MemoryStick,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ModelType = "checkpoint" | "lora" | "vae" | "embedding" | "controlnet" | "ollama";

interface ModelInfo {
  name: string;
  type: ModelType;
  path?: string;
  size: number;
  sizeFormatted: string;
  modifiedAt?: string;
  vramEstimate?: string;
  parameterSize?: string;
  quantization?: string;
  family?: string;
  loaded?: boolean;
  metadata?: {
    baseModel?: string;
    triggerWords?: string[];
    description?: string;
  };
}

interface DownloadInfo {
  id: string;
  url: string;
  filename: string;
  type: string;
  status: "pending" | "downloading" | "completed" | "failed";
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed?: string;
  eta?: string;
  error?: string;
}

interface OllamaModel {
  name: string;
  model: string;
  modifiedAt: string;
  size: number;
  sizeFormatted: string;
  digest: string;
  parameterSize: string;
  quantization: string;
  family: string;
  loaded?: boolean;
}

interface PullProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
  percent?: number;
}

const MODEL_TYPE_CONFIG: Record<ModelType, { label: string; icon: typeof Box; color: string }> = {
  checkpoint: { label: "Checkpoint", icon: Box, color: "text-blue-500" },
  lora: { label: "LoRA", icon: Layers, color: "text-purple-500" },
  vae: { label: "VAE", icon: Palette, color: "text-green-500" },
  embedding: { label: "Embedding", icon: Sparkles, color: "text-yellow-500" },
  controlnet: { label: "ControlNet", icon: Grid, color: "text-orange-500" },
  ollama: { label: "Ollama", icon: Cpu, color: "text-orange-500" },
};

const POPULAR_OLLAMA_MODELS = [
  { name: "llama3.2", description: "Meta's latest Llama model (3B)" },
  { name: "llama3.2:1b", description: "Llama 3.2 1B - lightweight" },
  { name: "mistral", description: "Mistral 7B - fast and capable" },
  { name: "codellama", description: "Code-specialized Llama" },
  { name: "phi3", description: "Microsoft Phi-3 - compact" },
  { name: "gemma2", description: "Google Gemma 2" },
  { name: "qwen2.5", description: "Alibaba Qwen 2.5" },
  { name: "deepseek-coder", description: "DeepSeek coding model" },
];

export default function ModelsPage() {
  const [activeTab, setActiveTab] = useState<"all" | "ollama" | "diffusion">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  const [windowsModels, setWindowsModels] = useState<ModelInfo[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [downloads, setDownloads] = useState<DownloadInfo[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [ollamaLoading, setOllamaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState<string>("");
  const [agentStatus, setAgentStatus] = useState<string>("checking");
  
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadType, setDownloadType] = useState<ModelType>("checkpoint");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [submittingDownload, setSubmittingDownload] = useState(false);
  
  const [ollamaPullDialogOpen, setOllamaPullDialogOpen] = useState(false);
  const [customOllamaModel, setCustomOllamaModel] = useState("");
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  
  const [deleteModel, setDeleteModel] = useState<{ name: string; type: ModelType } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchWindowsModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch models from Windows agent");
      }
      
      setWindowsModels(data.models || []);
      setAgentStatus(data.agentStatus || "connected");
    } catch (err: any) {
      setError(err.message);
      setWindowsModels([]);
      setAgentStatus("offline");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOllamaModels = useCallback(async () => {
    setOllamaLoading(true);
    setOllamaError(null);
    
    try {
      const res = await fetch("/api/ai/models");
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch Ollama models");
      }
      
      setOllamaModels(data.models || []);
      setOllamaUrl(data.ollamaUrl || "");
    } catch (err: any) {
      setOllamaError(err.message);
      setOllamaModels([]);
    } finally {
      setOllamaLoading(false);
    }
  }, []);

  const fetchDownloads = useCallback(async () => {
    try {
      const res = await fetch("/api/models/download");
      const data = await res.json();
      
      if (res.ok) {
        setDownloads(data.downloads || []);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    fetchWindowsModels();
    fetchOllamaModels();
    fetchDownloads();
  }, [fetchWindowsModels, fetchOllamaModels, fetchDownloads]);

  useEffect(() => {
    const activeDownloads = downloads.filter(d => d.status === "downloading" || d.status === "pending");
    if (activeDownloads.length > 0) {
      const interval = setInterval(fetchDownloads, 2000);
      return () => clearInterval(interval);
    }
  }, [downloads, fetchDownloads]);

  async function handleDownloadSubmit() {
    if (!downloadUrl.trim()) return;
    
    setSubmittingDownload(true);
    
    try {
      const res = await fetch("/api/models/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: downloadUrl.trim(),
          type: downloadType,
          filename: downloadFilename.trim() || undefined,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to queue download");
      }
      
      setDownloadDialogOpen(false);
      setDownloadUrl("");
      setDownloadFilename("");
      fetchDownloads();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmittingDownload(false);
    }
  }

  async function handleCancelDownload(id: string) {
    try {
      const res = await fetch(`/api/models/download/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchDownloads();
      }
    } catch {
    }
  }

  async function handlePullOllamaModel() {
    const modelToPull = customOllamaModel.trim() || selectedOllamaModel;
    if (!modelToPull) return;

    setPulling(true);
    setPullProgress({ model: modelToPull, status: "Starting download..." });

    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelToPull, action: "pull-stream" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to pull model");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const json = JSON.parse(line);
              setPullProgress({
                model: modelToPull,
                status: json.status || "Downloading...",
                completed: json.completed,
                total: json.total,
                percent: json.total ? Math.round((json.completed / json.total) * 100) : undefined,
              });
            } catch {}
          }
        }
      }

      setPullProgress({ model: modelToPull, status: "Complete!" });
      setTimeout(() => {
        setOllamaPullDialogOpen(false);
        setPullProgress(null);
        setCustomOllamaModel("");
        setSelectedOllamaModel("");
        fetchOllamaModels();
      }, 1500);
    } catch (err: any) {
      setPullProgress({ model: modelToPull, status: `Error: ${err.message}` });
    } finally {
      setPulling(false);
    }
  }

  async function handleDeleteModel(name: string, type: ModelType) {
    setDeleting(true);

    try {
      let res;
      if (type === "ollama") {
        res = await fetch("/api/ai/models", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: name }),
        });
      } else {
        res = await fetch(`/api/models/${type}/${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete model");
      }

      setDeleteModel(null);
      if (type === "ollama") {
        fetchOllamaModels();
      } else {
        fetchWindowsModels();
      }
    } catch (err: any) {
      alert(`Failed to delete model: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  const allModels: ModelInfo[] = [
    ...windowsModels,
    ...ollamaModels.map(m => ({
      name: m.name,
      type: "ollama" as ModelType,
      size: m.size,
      sizeFormatted: m.sizeFormatted,
      modifiedAt: m.modifiedAt,
      parameterSize: m.parameterSize,
      quantization: m.quantization,
      family: m.family,
      loaded: m.loaded,
    })),
  ];

  const filteredModels = activeTab === "all" 
    ? allModels 
    : activeTab === "ollama"
      ? allModels.filter(m => m.type === "ollama")
      : allModels.filter(m => m.type !== "ollama");

  const activeDownloads = downloads.filter(d => d.status === "downloading" || d.status === "pending");
  const isLoading = loading || ollamaLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Box className="h-6 w-6 text-orange-500" />
            Model Management
          </h1>
          <p className="text-muted-foreground">
            Manage AI models across Ollama, Stable Diffusion, and ComfyUI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchWindowsModels(); fetchOllamaModels(); }} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download Model
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Download New Model</DialogTitle>
              <DialogDescription>
                Download a model from CivitAI, Hugging Face, or direct URL
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Model URL</Label>
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="https://civitai.com/api/download/..."
                    value={downloadUrl}
                    onChange={(e) => setDownloadUrl(e.target.value)}
                    disabled={submittingDownload}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Model Type</Label>
                <Select
                  value={downloadType}
                  onValueChange={(v) => setDownloadType(v as ModelType)}
                  disabled={submittingDownload}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checkpoint">Checkpoint</SelectItem>
                    <SelectItem value="lora">LoRA</SelectItem>
                    <SelectItem value="vae">VAE</SelectItem>
                    <SelectItem value="embedding">Embedding</SelectItem>
                    <SelectItem value="controlnet">ControlNet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Custom Filename (optional)</Label>
                <Input
                  placeholder="my-model.safetensors"
                  value={downloadFilename}
                  onChange={(e) => setDownloadFilename(e.target.value)}
                  disabled={submittingDownload}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} disabled={submittingDownload}>
                Cancel
              </Button>
              <Button onClick={handleDownloadSubmit} disabled={submittingDownload || !downloadUrl.trim()}>
                {submittingDownload ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Queuing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Start Download
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={ollamaPullDialogOpen} onOpenChange={setOllamaPullDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Cpu className="h-4 w-4 mr-2" />
              Pull Ollama Model
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pull Ollama Model</DialogTitle>
              <DialogDescription>
                Download a model from the Ollama library
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select Popular Model</Label>
                <Select
                  value={selectedOllamaModel}
                  onValueChange={(v) => {
                    setSelectedOllamaModel(v);
                    setCustomOllamaModel("");
                  }}
                  disabled={pulling}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {POPULAR_OLLAMA_MODELS.map((m) => (
                      <SelectItem key={m.name} value={m.name}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.name}</span>
                          <span className="text-xs text-muted-foreground">- {m.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or enter custom</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Custom Model Name</Label>
                <Input
                  placeholder="e.g., llama3.2:70b, codellama:13b"
                  value={customOllamaModel}
                  onChange={(e) => {
                    setCustomOllamaModel(e.target.value);
                    setSelectedOllamaModel("");
                  }}
                  disabled={pulling}
                />
                <p className="text-xs text-muted-foreground">
                  Browse models at{" "}
                  <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="underline">
                    ollama.com/library
                  </a>
                </p>
              </div>

              {pullProgress && (
                <div className="p-4 rounded-lg bg-muted space-y-2">
                  <div className="flex items-center gap-2">
                    {pullProgress.status === "Complete!" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : pullProgress.status.startsWith("Error") ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    <span className="text-sm font-medium">{pullProgress.model}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{pullProgress.status}</p>
                  {pullProgress.percent !== undefined && (
                    <Progress value={pullProgress.percent} className="h-2" />
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOllamaPullDialogOpen(false)} disabled={pulling}>
                Cancel
              </Button>
              <Button onClick={handlePullOllamaModel} disabled={pulling || (!customOllamaModel.trim() && !selectedOllamaModel)}>
                {pulling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Pulling...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Pull Model
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {activeDownloads.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4 text-blue-500 animate-pulse" />
              Active Downloads ({activeDownloads.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeDownloads.map((download) => (
              <div key={download.id} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span className="font-medium truncate">{download.filename}</span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                      {download.type}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCancelDownload(download.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <Progress value={download.progress} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{download.progress}%</span>
                  {download.speed && <span>{download.speed}</span>}
                  {download.eta && <span>ETA: {download.eta}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <Card className="flex-1 sm:max-w-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Windows Agent</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Server className="h-3 w-3" />
                  {agentStatus === "connected" ? "Connected" : agentStatus === "timeout" ? "Timeout" : "Offline"}
                </CardDescription>
              </div>
              {agentStatus === "connected" && (
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              )}
              {agentStatus === "offline" && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <XCircle className="h-4 w-4" />
                </div>
              )}
            </div>
          </CardHeader>
        </Card>
        <Card className="flex-1 sm:max-w-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Ollama Server</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Cpu className="h-3 w-3" />
                  {ollamaUrl || "Not connected"}
                </CardDescription>
              </div>
              {!ollamaLoading && !ollamaError && (
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              )}
              {ollamaError && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <XCircle className="h-4 w-4" />
                </div>
              )}
            </div>
          </CardHeader>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="all">All Models ({allModels.length})</TabsTrigger>
          <TabsTrigger value="ollama">Ollama ({ollamaModels.length})</TabsTrigger>
          <TabsTrigger value="diffusion">Diffusion ({windowsModels.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error && ollamaError ? (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardContent className="flex items-center gap-4 py-6">
                <AlertCircle className="h-8 w-8 text-red-500" />
                <div>
                  <h3 className="font-medium">Failed to connect to AI services</h3>
                  <p className="text-sm text-muted-foreground">Windows Agent: {error}</p>
                  <p className="text-sm text-muted-foreground">Ollama: {ollamaError}</p>
                </div>
                <Button variant="outline" className="ml-auto" onClick={() => { fetchWindowsModels(); fetchOllamaModels(); }}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : filteredModels.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Box className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-2">No Models Found</h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  {activeTab === "ollama" 
                    ? "Pull an Ollama model to get started with local LLM inference."
                    : activeTab === "diffusion"
                      ? "Download checkpoints and LoRAs to use with Stable Diffusion."
                      : "Download or pull models to get started."}
                </p>
                <div className="flex gap-2">
                  {(activeTab === "all" || activeTab === "diffusion") && (
                    <Button onClick={() => setDownloadDialogOpen(true)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Model
                    </Button>
                  )}
                  {(activeTab === "all" || activeTab === "ollama") && (
                    <Button variant="outline" onClick={() => setOllamaPullDialogOpen(true)}>
                      <Cpu className="h-4 w-4 mr-2" />
                      Pull Ollama Model
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : viewMode === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredModels.map((model, idx) => {
                const config = MODEL_TYPE_CONFIG[model.type];
                const Icon = config.icon;
                
                return (
                  <Card key={`${model.type}-${model.name}-${idx}`} className="relative group">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 min-w-0 flex-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Icon className={cn("h-4 w-4 shrink-0", config.color)} />
                            <span className="truncate">{model.name}</span>
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {config.label}
                            {model.family && ` • ${model.family}`}
                            {model.quantization && ` • ${model.quantization}`}
                          </CardDescription>
                        </div>
                        {model.loaded && (
                          <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
                            Loaded
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <HardDrive className="h-3 w-3" />
                          {model.sizeFormatted}
                        </div>
                        {(model.parameterSize || model.vramEstimate) && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MemoryStick className="h-3 w-3" />
                            {model.parameterSize || model.vramEstimate}
                          </div>
                        )}
                      </div>
                      {model.modifiedAt && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Modified: {formatDate(model.modifiedAt)}
                        </div>
                      )}
                      <div className="pt-2 border-t">
                        <Dialog
                          open={deleteModel?.name === model.name && deleteModel?.type === model.type}
                          onOpenChange={(open) => !open && setDeleteModel(null)}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={() => setDeleteModel({ name: model.name, type: model.type })}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Model
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete Model</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to delete <strong>{model.name}</strong>? This will
                                remove {model.sizeFormatted} from your server. This action cannot be undone.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setDeleteModel(null)}>
                                Cancel
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleDeleteModel(model.name, model.type)}
                                disabled={deleting}
                              >
                                {deleting ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </>
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {filteredModels.map((model, idx) => {
                    const config = MODEL_TYPE_CONFIG[model.type];
                    const Icon = config.icon;
                    
                    return (
                      <div key={`${model.type}-${model.name}-${idx}`} className="flex items-center justify-between p-4 hover:bg-muted/50">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <Icon className={cn("h-5 w-5 shrink-0", config.color)} />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{model.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {config.label} • {model.sizeFormatted}
                              {model.parameterSize && ` • ${model.parameterSize}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {model.loaded && (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
                              Loaded
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => setDeleteModel({ name: model.name, type: model.type })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={deleteModel !== null && viewMode === "list"}
        onOpenChange={(open) => !open && setDeleteModel(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Model</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteModel?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModel(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteModel && handleDeleteModel(deleteModel.name, deleteModel.type)}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
