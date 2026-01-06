"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  details: {
    parent_model?: string;
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface PullProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
  percent?: number;
}

const POPULAR_MODELS = [
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
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState<string>("");
  
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [customModelName, setCustomModelName] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  
  const [deleteModel, setDeleteModel] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch("/api/ai/models");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch models");
      }
      
      const data = await res.json();
      setModels(data.models || []);
      setOllamaUrl(data.ollamaUrl || "");
    } catch (err: any) {
      setError(err.message);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  async function handlePullModel() {
    const modelToPull = customModelName.trim() || selectedModel;
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
        setPullDialogOpen(false);
        setPullProgress(null);
        setCustomModelName("");
        setSelectedModel("");
        fetchModels();
      }, 1500);
    } catch (err: any) {
      setPullProgress({ model: modelToPull, status: `Error: ${err.message}` });
    } finally {
      setPulling(false);
    }
  }

  async function handleDeleteModel(modelName: string) {
    setDeleting(true);

    try {
      const res = await fetch("/api/ai/models", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete model");
      }

      setDeleteModel(null);
      fetchModels();
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
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Box className="h-6 w-6 text-orange-500" />
            Ollama Model Catalog
          </h1>
          <p className="text-muted-foreground">
            Manage local LLM models on your Ollama server
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchModels} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Dialog open={pullDialogOpen} onOpenChange={setPullDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Download className="h-4 w-4 mr-2" />
                Pull Model
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Pull New Model</DialogTitle>
                <DialogDescription>
                  Download a model from the Ollama library to your server
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Select Popular Model</Label>
                  <Select
                    value={selectedModel}
                    onValueChange={(v) => {
                      setSelectedModel(v);
                      setCustomModelName("");
                    }}
                    disabled={pulling}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {POPULAR_MODELS.map((m) => (
                        <SelectItem key={m.name} value={m.name}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{m.name}</span>
                            <span className="text-xs text-muted-foreground">
                              - {m.description}
                            </span>
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
                    <span className="bg-background px-2 text-muted-foreground">
                      Or enter custom
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Custom Model Name</Label>
                  <Input
                    placeholder="e.g., llama3.2:70b, codellama:13b"
                    value={customModelName}
                    onChange={(e) => {
                      setCustomModelName(e.target.value);
                      setSelectedModel("");
                    }}
                    disabled={pulling}
                  />
                  <p className="text-xs text-muted-foreground">
                    Browse models at{" "}
                    <a
                      href="https://ollama.com/library"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
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
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${pullProgress.percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPullDialogOpen(false)}
                  disabled={pulling}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handlePullModel}
                  disabled={pulling || (!customModelName.trim() && !selectedModel)}
                >
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
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Ollama Server</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Server className="h-3 w-3" />
                {ollamaUrl || "Not connected"}
              </CardDescription>
            </div>
            {!loading && !error && (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                Connected
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <XCircle className="h-4 w-4" />
                Disconnected
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="flex items-center gap-4 py-6">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div>
              <h3 className="font-medium">Failed to connect to Ollama</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" className="ml-auto" onClick={fetchModels}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : models.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Box className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">No Models Found</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              You don't have any models downloaded yet. Pull a model to get started with local LLM inference.
            </p>
            <Button onClick={() => setPullDialogOpen(true)}>
              <Download className="h-4 w-4 mr-2" />
              Pull Your First Model
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <Card key={model.digest} className="relative group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Box className="h-4 w-4 text-orange-500" />
                      {model.name}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {model.family} • {model.quantization}
                    </CardDescription>
                  </div>
                  <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
                    Loaded
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <HardDrive className="h-3 w-3" />
                    {model.sizeFormatted}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Cpu className="h-3 w-3" />
                    {model.parameterSize}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Modified: {formatDate(model.modifiedAt)}
                </div>
                <div className="pt-2 border-t">
                  <Dialog
                    open={deleteModel === model.name}
                    onOpenChange={(open) => !open && setDeleteModel(null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => setDeleteModel(model.name)}
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
                          onClick={() => handleDeleteModel(model.name)}
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
          ))}
        </div>
      )}
    </div>
  );
}
