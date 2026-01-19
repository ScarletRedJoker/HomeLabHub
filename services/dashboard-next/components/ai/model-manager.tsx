"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  RefreshCw,
  Download,
  Trash2,
  CheckCircle2,
  Loader2,
  HardDrive,
  Box,
  Layers,
  Palette,
  Settings,
  AlertCircle,
  X,
} from "lucide-react";

interface SDModel {
  title: string;
  model_name: string;
  filename?: string;
  hash?: string;
  sha256?: string;
  isLoaded?: boolean;
}

interface SDLora {
  name: string;
  alias?: string;
  path?: string;
}

interface SDVAE {
  model_name: string;
  filename?: string;
}

interface SDSettings {
  sampler?: string;
  steps?: number;
  cfgScale?: number;
  clipSkip?: number;
  samplers?: string[];
}

interface DownloadItem {
  id: string;
  filename: string;
  type: string;
  progress: number;
  status: "downloading" | "completed" | "error";
  error?: string;
}

interface DiskUsage {
  total: number;
  used: number;
  free: number;
  checkpoints?: number;
  loras?: number;
  vaes?: number;
}

interface SDStatus {
  available: boolean;
  modelLoaded: boolean;
  currentModel: string | null;
  modelLoading: boolean;
  error: string | null;
}

export function ModelManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("checkpoints");

  const [models, setModels] = useState<SDModel[]>([]);
  const [loras, setLoras] = useState<SDLora[]>([]);
  const [vaes, setVaes] = useState<SDVAE[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentVae, setCurrentVae] = useState<string | null>(null);
  const [status, setStatus] = useState<SDStatus | null>(null);
  const [settings, setSettings] = useState<SDSettings | null>(null);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);

  const [switchingModel, setSwitchingModel] = useState(false);
  const [switchingVae, setSwitchingVae] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [downloadType, setDownloadType] = useState<"checkpoint" | "lora" | "vae">("checkpoint");
  const [downloading, setDownloading] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; type: string; filename: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [savingSettings, setSavingSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<SDSettings>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, statusRes, settingsRes, vaeRes, downloadsRes, diskRes] = await Promise.all([
        fetch("/api/ai/models/sd?action=models"),
        fetch("/api/ai/models/sd?action=status"),
        fetch("/api/ai/models/sd?action=settings"),
        fetch("/api/ai/models/sd?action=vae"),
        fetch("/api/ai/models/sd?action=downloads"),
        fetch("/api/ai/models/sd?action=disk"),
      ]);

      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setModels(data.models || data.checkpoints || []);
        setLoras(data.loras || []);
        if (data.currentModel) setCurrentModel(data.currentModel);
      }

      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
        if (data.currentModel) setCurrentModel(data.currentModel);
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const s = data.settings || data;
        setSettings({
          ...s,
          samplers: data.availableSamplers || s.samplers || [],
        });
        setLocalSettings({
          sampler: s.sampler,
          steps: s.steps,
          cfgScale: s.cfgScale,
          clipSkip: s.clipSkip,
        });
      }

      if (vaeRes.ok) {
        const data = await vaeRes.json();
        setVaes(data.vaes || data || []);
        if (data.currentVae) setCurrentVae(data.currentVae);
      }

      if (downloadsRes.ok) {
        const data = await downloadsRes.json();
        setDownloads(data.downloads || data.queue || []);
      }

      if (diskRes.ok) {
        const data = await diskRes.json();
        setDiskUsage(data);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to fetch data: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (downloads.some((d) => d.status === "downloading")) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch("/api/ai/models/sd?action=downloads");
          if (res.ok) {
            const data = await res.json();
            setDownloads(data.downloads || data.queue || []);
          }
        } catch {}
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [downloads]);

  async function switchModel(modelTitle: string) {
    if (switchingModel) return;
    setSwitchingModel(true);

    try {
      const res = await fetch("/api/ai/models/sd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch-model", model: modelTitle }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentModel(data.currentModel || modelTitle);
        toast({ title: "Success", description: `Switched to ${modelTitle}` });
        await fetchData();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to switch model",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSwitchingModel(false);
    }
  }

  async function switchVae(vaeName: string) {
    if (switchingVae) return;
    setSwitchingVae(true);

    try {
      const res = await fetch("/api/ai/models/sd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch-vae", vae: vaeName }),
      });

      if (res.ok) {
        setCurrentVae(vaeName);
        toast({ title: "Success", description: `Switched VAE to ${vaeName}` });
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to switch VAE",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSwitchingVae(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/ai/models/sd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      await fetchData();
      toast({ title: "Refreshed", description: "Model list updated" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDownload() {
    if (!downloadUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a download URL",
        variant: "destructive",
      });
      return;
    }

    setDownloading(true);
    try {
      const res = await fetch("/api/ai/models/sd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "download",
          url: downloadUrl,
          filename: downloadFilename || undefined,
          type: downloadType,
        }),
      });

      if (res.ok) {
        toast({ title: "Download Started", description: "Check progress below" });
        setDownloadUrl("");
        setDownloadFilename("");
        await fetchData();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to start download",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!deleteDialog) return;
    setDeleting(true);

    try {
      const res = await fetch("/api/ai/models/sd", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: deleteDialog.type,
          filename: deleteDialog.filename,
        }),
      });

      if (res.ok) {
        toast({ title: "Deleted", description: `${deleteDialog.filename} has been deleted` });
        await fetchData();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to delete model",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteDialog(null);
    }
  }

  async function updateSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/ai/models/sd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-settings",
          settings: localSettings,
        }),
      });

      if (res.ok) {
        toast({ title: "Success", description: "Settings updated" });
        await fetchData();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to update settings",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingSettings(false);
    }
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Box className="h-5 w-5 text-purple-500" />
            Model Manager
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage Stable Diffusion models, LoRAs, and VAEs
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {status && (
        <Card className="border-border">
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className={`font-medium flex items-center gap-1 ${status.available ? "text-green-500" : "text-red-500"}`}>
                  {status.available ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Connected
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3" /> Offline
                    </>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Current Model</p>
                <p className="font-medium truncate" title={currentModel || undefined}>
                  {currentModel || "None loaded"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Checkpoints</p>
                <p className="font-medium">{models.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">LoRAs</p>
                <p className="font-medium">{loras.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {diskUsage && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4" /> Disk Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress value={(diskUsage.used / diskUsage.total) * 100} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatBytes(diskUsage.used)} used</span>
                <span>{formatBytes(diskUsage.free)} free</span>
                <span>{formatBytes(diskUsage.total)} total</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4" /> Download Model
          </CardTitle>
          <CardDescription>Download models from CivitAI or Hugging Face URLs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <Label className="text-xs">URL</Label>
              <Input
                placeholder="https://civitai.com/api/download/models/..."
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Filename (optional)</Label>
              <Input
                placeholder="model.safetensors"
                value={downloadFilename}
                onChange={(e) => setDownloadFilename(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={downloadType} onValueChange={(v: "checkpoint" | "lora" | "vae") => setDownloadType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checkpoint">Checkpoint</SelectItem>
                  <SelectItem value="lora">LoRA</SelectItem>
                  <SelectItem value="vae">VAE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-4" onClick={handleDownload} disabled={downloading || !downloadUrl.trim()}>
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Start Download
          </Button>
        </CardContent>
      </Card>

      {downloads.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Download Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {downloads.map((dl) => (
                <div key={dl.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate">{dl.filename}</span>
                    <span className={`text-xs ${dl.status === "completed" ? "text-green-500" : dl.status === "error" ? "text-red-500" : "text-blue-500"}`}>
                      {dl.status === "downloading" ? `${dl.progress}%` : dl.status}
                    </span>
                  </div>
                  <Progress value={dl.progress} className="h-1" />
                  {dl.error && <p className="text-xs text-red-500">{dl.error}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="checkpoints" className="flex items-center gap-2">
            <Box className="h-4 w-4" /> Checkpoints ({models.length})
          </TabsTrigger>
          <TabsTrigger value="loras" className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> LoRAs ({loras.length})
          </TabsTrigger>
          <TabsTrigger value="vaes" className="flex items-center gap-2">
            <Palette className="h-4 w-4" /> VAEs ({vaes.length})
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checkpoints" className="mt-4">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Switch Model</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={currentModel || ""} onValueChange={switchModel} disabled={switchingModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a checkpoint..." />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.model_name || model.title} value={model.title}>
                      <span className="flex items-center gap-2">
                        {model.title === currentModel && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                        {model.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {switchingModel && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Switching model...
                </p>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 space-y-2">
            {models.map((model) => (
              <div
                key={model.model_name || model.title}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  model.title === currentModel ? "border-green-500/50 bg-green-500/5" : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  {model.title === currentModel && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  <div>
                    <p className="font-medium text-sm">{model.title}</p>
                    {model.filename && (
                      <p className="text-xs text-muted-foreground">{model.filename}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => setDeleteDialog({ open: true, type: "checkpoint", filename: model.filename || model.title })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {models.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No checkpoints found</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="loras" className="mt-4">
          <div className="space-y-2">
            {loras.map((lora) => (
              <div
                key={lora.name}
                className="flex items-center justify-between p-3 rounded-lg border border-border"
              >
                <div>
                  <p className="font-medium text-sm">{lora.name}</p>
                  {lora.alias && lora.alias !== lora.name && (
                    <p className="text-xs text-muted-foreground">Alias: {lora.alias}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => setDeleteDialog({ open: true, type: "lora", filename: lora.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {loras.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No LoRAs found</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="vaes" className="mt-4">
          <Card className="border-border mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Switch VAE</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={currentVae || ""} onValueChange={switchVae} disabled={switchingVae}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a VAE..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Automatic">Automatic</SelectItem>
                  <SelectItem value="None">None</SelectItem>
                  {vaes.map((vae) => (
                    <SelectItem key={vae.model_name} value={vae.model_name}>
                      {vae.model_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {vaes.map((vae) => (
              <div
                key={vae.model_name}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  vae.model_name === currentVae ? "border-green-500/50 bg-green-500/5" : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  {vae.model_name === currentVae && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  <div>
                    <p className="font-medium text-sm">{vae.model_name}</p>
                    {vae.filename && (
                      <p className="text-xs text-muted-foreground">{vae.filename}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => setDeleteDialog({ open: true, type: "vae", filename: vae.filename || vae.model_name })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {vaes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No VAEs found</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-sm">Stable Diffusion Settings</CardTitle>
              <CardDescription>Configure generation parameters</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sampler</Label>
                  <Select
                    value={localSettings.sampler || ""}
                    onValueChange={(v) => setLocalSettings({ ...localSettings, sampler: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select sampler..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(settings?.samplers || [
                        "Euler", "Euler a", "DPM++ 2M Karras", "DPM++ SDE Karras",
                        "DPM++ 2M SDE Karras", "DDIM", "UniPC"
                      ]).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Steps</Label>
                  <Input
                    type="number"
                    min={1}
                    max={150}
                    value={localSettings.steps || ""}
                    onChange={(e) => setLocalSettings({ ...localSettings, steps: parseInt(e.target.value) || undefined })}
                    placeholder="20"
                  />
                </div>

                <div className="space-y-2">
                  <Label>CFG Scale</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    step={0.5}
                    value={localSettings.cfgScale || ""}
                    onChange={(e) => setLocalSettings({ ...localSettings, cfgScale: parseFloat(e.target.value) || undefined })}
                    placeholder="7"
                  />
                </div>

                <div className="space-y-2">
                  <Label>CLIP Skip</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={localSettings.clipSkip || ""}
                    onChange={(e) => setLocalSettings({ ...localSettings, clipSkip: parseInt(e.target.value) || undefined })}
                    placeholder="1"
                  />
                </div>
              </div>

              <Button className="mt-4" onClick={updateSettings} disabled={savingSettings}>
                {savingSettings ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={deleteDialog?.open} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteDialog?.filename}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
