"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Video,
  Image as ImageIcon,
  Wand2,
  Play,
  Pause,
  Download,
  Trash2,
  RefreshCw,
  Settings,
  ChevronDown,
  Plus,
  Save,
  FolderOpen,
  Sparkles,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Move,
  ZoomIn,
  RotateCw,
  Film,
  Layers,
  Copy,
} from "lucide-react";

type VideoMode = "text-to-video" | "image-to-video" | "video-to-video";
type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

interface VideoJob {
  id: string;
  mode: VideoMode;
  status: JobStatus;
  progress: number;
  prompt: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  batchId?: string;
  batchIndex?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  processingTimeMs?: number;
}

interface VideoPreset {
  id: string;
  name: string;
  description?: string;
  mode: VideoMode;
  duration: number;
  fps: number;
  width: number;
  height: number;
  motionScale: string;
  cfgScale: string;
  steps: number;
  scheduler: string;
  animateDiffModel?: string;
  cameraMotion: { pan?: number; zoom?: number; rotate?: number };
  subjectMotion: string;
  negativePrompt?: string;
  isDefault: boolean;
}

interface GenerationSettings {
  prompt: string;
  negativePrompt: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  motionScale: number;
  cfgScale: number;
  steps: number;
  scheduler: string;
  animateDiffModel: string;
  cameraMotion: { pan: number; zoom: number; rotate: number };
  subjectMotion: number;
  seed: number;
  batchCount: number;
}

const DEFAULT_SETTINGS: GenerationSettings = {
  prompt: "",
  negativePrompt: "blurry, low quality, distorted, watermark, text, ugly, deformed",
  duration: 16,
  fps: 8,
  width: 512,
  height: 512,
  motionScale: 1.0,
  cfgScale: 7.0,
  steps: 25,
  scheduler: "euler",
  animateDiffModel: "animatediff-v3",
  cameraMotion: { pan: 0, zoom: 0, rotate: 0 },
  subjectMotion: 1.0,
  seed: -1,
  batchCount: 1,
};

const RESOLUTION_PRESETS = [
  { label: "512x512", width: 512, height: 512 },
  { label: "768x512", width: 768, height: 512 },
  { label: "512x768", width: 512, height: 768 },
  { label: "1024x576", width: 1024, height: 576 },
  { label: "576x1024", width: 576, height: 1024 },
];

const FPS_OPTIONS = [8, 12, 16, 24];
const SCHEDULER_OPTIONS = ["euler", "euler_a", "lms", "dpm++_2m", "dpm++_sde", "ddim"];
const ANIMATEDIFF_MODELS = [
  { id: "animatediff-v3", name: "AnimateDiff v3" },
  { id: "animatediff-motion-adapter", name: "Motion Adapter v1.5.3" },
  { id: "animatediff-lightning", name: "AnimateDiff Lightning (Fast)" },
];

export default function VideoStudioPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<VideoMode>("text-to-video");
  const [settings, setSettings] = useState<GenerationSettings>(DEFAULT_SETTINGS);
  const [inputImage, setInputImage] = useState<string>("");
  const [inputVideo, setInputVideo] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [presets, setPresets] = useState<VideoPreset[]>([]);
  const [selectedJob, setSelectedJob] = useState<VideoJob | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [pollingJobIds, setPollingJobIds] = useState<Set<string>>(new Set());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetchJobs();
    fetchPresets();
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (pollingJobIds.size > 0 && !pollingRef.current) {
      pollingRef.current = setInterval(pollActiveJobs, 2000);
    } else if (pollingJobIds.size === 0 && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [pollingJobIds.size]);

  async function fetchJobs() {
    try {
      const res = await fetch("/api/ai/video/jobs?limit=20");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        const activeIds = new Set<string>();
        data.jobs?.forEach((job: VideoJob) => {
          if (job.status === "queued" || job.status === "processing") {
            activeIds.add(job.id);
          }
        });
        setPollingJobIds(activeIds);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
  }

  async function fetchPresets() {
    try {
      const res = await fetch("/api/ai/video/presets");
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
      }
    } catch (error) {
      console.error("Failed to fetch presets:", error);
    }
  }

  async function pollActiveJobs() {
    if (pollingJobIds.size === 0) return;

    const idsToCheck = Array.from(pollingJobIds);
    for (const id of idsToCheck) {
      try {
        const res = await fetch(`/api/ai/video/jobs/${id}`);
        if (res.ok) {
          const data = await res.json();
          const job = data.job;
          
          setJobs(prev => prev.map(j => j.id === id ? job : j));
          
          if (selectedJob?.id === id) {
            setSelectedJob(job);
          }

          if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
            setPollingJobIds(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });

            if (job.status === "completed") {
              toast({
                title: "Video Generated!",
                description: `Your video "${job.prompt.substring(0, 30)}..." is ready`,
              });
            } else if (job.status === "failed") {
              toast({
                title: "Generation Failed",
                description: job.error || "Unknown error",
                variant: "destructive",
              });
            }
          }
        }
      } catch (error) {
        console.error(`Failed to poll job ${id}:`, error);
      }
    }
  }

  async function generateVideo() {
    if (!settings.prompt.trim()) {
      toast({
        title: "Prompt Required",
        description: "Please enter a prompt for video generation",
        variant: "destructive",
      });
      return;
    }

    if (mode === "image-to-video" && !inputImage) {
      toast({
        title: "Image Required",
        description: "Please provide an input image for image-to-video mode",
        variant: "destructive",
      });
      return;
    }

    if (mode === "video-to-video" && !inputVideo) {
      toast({
        title: "Video Required",
        description: "Please provide an input video for video-to-video mode",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt: settings.prompt,
          negativePrompt: settings.negativePrompt,
          inputImage: mode === "image-to-video" ? inputImage : undefined,
          inputVideo: mode === "video-to-video" ? inputVideo : undefined,
          duration: settings.duration,
          fps: settings.fps,
          width: settings.width,
          height: settings.height,
          motionScale: settings.motionScale,
          cfgScale: settings.cfgScale,
          steps: settings.steps,
          scheduler: settings.scheduler,
          animateDiffModel: settings.animateDiffModel,
          cameraMotion: settings.cameraMotion,
          subjectMotion: settings.subjectMotion,
          seed: settings.seed,
          batchCount: settings.batchCount,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: "Generation Started",
          description: `${data.jobs?.length || 1} video job(s) queued`,
        });

        const newJobIds: string[] = [];
        data.jobs?.forEach((j: { jobId: string }) => {
          newJobIds.push(j.jobId);
        });
        setPollingJobIds(prev => new Set([...Array.from(prev), ...newJobIds]));
        
        await fetchJobs();
      } else {
        toast({
          title: "Generation Failed",
          description: data.error || "Failed to queue video generation",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate video",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function savePreset() {
    if (!presetName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for the preset",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch("/api/ai/video/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName,
          mode,
          ...settings,
        }),
      });

      if (res.ok) {
        toast({
          title: "Preset Saved",
          description: `Preset "${presetName}" saved successfully`,
        });
        setShowPresetDialog(false);
        setPresetName("");
        fetchPresets();
      } else {
        const data = await res.json();
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save preset",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  function loadPreset(preset: VideoPreset) {
    setMode(preset.mode);
    setSettings({
      ...settings,
      duration: preset.duration,
      fps: preset.fps,
      width: preset.width,
      height: preset.height,
      motionScale: parseFloat(preset.motionScale),
      cfgScale: parseFloat(preset.cfgScale),
      steps: preset.steps,
      scheduler: preset.scheduler,
      animateDiffModel: preset.animateDiffModel || "animatediff-v3",
      cameraMotion: preset.cameraMotion || { pan: 0, zoom: 0, rotate: 0 },
      subjectMotion: parseFloat(preset.subjectMotion),
      negativePrompt: preset.negativePrompt || settings.negativePrompt,
    });
    toast({
      title: "Preset Loaded",
      description: `Loaded "${preset.name}"`,
    });
  }

  async function deleteJob(jobId: string) {
    try {
      const res = await fetch(`/api/ai/video/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        setJobs(prev => prev.filter(j => j.id !== jobId));
        if (selectedJob?.id === jobId) {
          setSelectedJob(null);
        }
        toast({
          title: "Job Removed",
          description: "Video job has been removed",
        });
      }
    } catch (error) {
      console.error("Failed to delete job:", error);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setInputImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setInputVideo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function getStatusIcon(status: JobStatus) {
    switch (status) {
      case "queued":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "cancelled":
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  }

  function getStatusBadge(status: JobStatus) {
    const variants: Record<JobStatus, "default" | "secondary" | "destructive" | "outline"> = {
      queued: "secondary",
      processing: "default",
      completed: "outline",
      failed: "destructive",
      cancelled: "secondary",
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  }

  function formatDuration(ms?: number) {
    if (!ms) return "-";
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Film className="h-6 w-6 text-purple-500" />
          <div>
            <h1 className="text-xl font-bold">Video Studio</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered video generation with AnimateDiff
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchJobs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[400px] border-r flex flex-col overflow-hidden">
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <Tabs value={mode} onValueChange={(v) => setMode(v as VideoMode)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="text-to-video" className="text-xs">
                  <Wand2 className="h-3 w-3 mr-1" />
                  Text
                </TabsTrigger>
                <TabsTrigger value="image-to-video" className="text-xs">
                  <ImageIcon className="h-3 w-3 mr-1" />
                  Image
                </TabsTrigger>
                <TabsTrigger value="video-to-video" className="text-xs">
                  <Video className="h-3 w-3 mr-1" />
                  Video
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                placeholder="Describe the video you want to generate..."
                value={settings.prompt}
                onChange={(e) => setSettings({ ...settings, prompt: e.target.value })}
                className="min-h-[100px]"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const prompts = [
                    "A majestic eagle soaring through golden clouds at sunset, cinematic lighting",
                    "Ocean waves crashing on rocky shore, slow motion, dramatic sky",
                    "A cyberpunk city street at night with neon lights and rain",
                    "A serene forest with sunlight filtering through the trees, peaceful",
                    "Abstract flowing liquid metal morphing smoothly, reflective surface",
                  ];
                  setSettings({ ...settings, prompt: prompts[Math.floor(Math.random() * prompts.length)] });
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Suggest Prompt
              </Button>
            </div>

            {mode === "image-to-video" && (
              <div className="space-y-2">
                <Label>Input Image</Label>
                <Input type="file" accept="image/*" onChange={handleImageUpload} />
                {inputImage && (
                  <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                    <img
                      src={inputImage}
                      alt="Input"
                      className="w-full h-full object-contain"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => setInputImage("")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {mode === "video-to-video" && (
              <div className="space-y-2">
                <Label>Input Video</Label>
                <Input type="file" accept="video/*" onChange={handleVideoUpload} />
                {inputVideo && (
                  <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                    <video
                      src={inputVideo}
                      className="w-full h-full object-contain"
                      controls
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => setInputVideo("")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Duration (frames)</Label>
                <Select
                  value={settings.duration.toString()}
                  onValueChange={(v) => setSettings({ ...settings, duration: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="8">8 frames</SelectItem>
                    <SelectItem value="16">16 frames</SelectItem>
                    <SelectItem value="24">24 frames</SelectItem>
                    <SelectItem value="32">32 frames</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>FPS</Label>
                <Select
                  value={settings.fps.toString()}
                  onValueChange={(v) => setSettings({ ...settings, fps: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FPS_OPTIONS.map((fps) => (
                      <SelectItem key={fps} value={fps.toString()}>
                        {fps} fps
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select
                value={`${settings.width}x${settings.height}`}
                onValueChange={(v) => {
                  const [w, h] = v.split("x").map(Number);
                  setSettings({ ...settings, width: w, height: h });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_PRESETS.map((res) => (
                    <SelectItem key={res.label} value={res.label}>
                      {res.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Advanced Settings
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Negative Prompt</Label>
                  <Textarea
                    placeholder="What to avoid..."
                    value={settings.negativePrompt}
                    onChange={(e) =>
                      setSettings({ ...settings, negativePrompt: e.target.value })
                    }
                    className="min-h-[60px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label>AnimateDiff Model</Label>
                  <Select
                    value={settings.animateDiffModel}
                    onValueChange={(v) =>
                      setSettings({ ...settings, animateDiffModel: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANIMATEDIFF_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Motion Scale</Label>
                    <span className="text-sm text-muted-foreground">
                      {settings.motionScale.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[settings.motionScale]}
                    onValueChange={([v]) =>
                      setSettings({ ...settings, motionScale: v })
                    }
                    min={0}
                    max={2}
                    step={0.05}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>CFG Scale</Label>
                    <span className="text-sm text-muted-foreground">
                      {settings.cfgScale.toFixed(1)}
                    </span>
                  </div>
                  <Slider
                    value={[settings.cfgScale]}
                    onValueChange={([v]) =>
                      setSettings({ ...settings, cfgScale: v })
                    }
                    min={1}
                    max={15}
                    step={0.5}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Steps</Label>
                    <Input
                      type="number"
                      value={settings.steps}
                      onChange={(e) =>
                        setSettings({ ...settings, steps: parseInt(e.target.value) || 25 })
                      }
                      min={1}
                      max={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scheduler</Label>
                    <Select
                      value={settings.scheduler}
                      onValueChange={(v) =>
                        setSettings({ ...settings, scheduler: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCHEDULER_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 p-3 border rounded-lg">
                  <Label className="flex items-center gap-2">
                    <Move className="h-4 w-4" />
                    Camera Motion
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Move className="h-3 w-3" /> Pan
                      </Label>
                      <Slider
                        value={[settings.cameraMotion.pan]}
                        onValueChange={([v]) =>
                          setSettings({
                            ...settings,
                            cameraMotion: { ...settings.cameraMotion, pan: v },
                          })
                        }
                        min={-1}
                        max={1}
                        step={0.1}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <ZoomIn className="h-3 w-3" /> Zoom
                      </Label>
                      <Slider
                        value={[settings.cameraMotion.zoom]}
                        onValueChange={([v]) =>
                          setSettings({
                            ...settings,
                            cameraMotion: { ...settings.cameraMotion, zoom: v },
                          })
                        }
                        min={-1}
                        max={1}
                        step={0.1}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <RotateCw className="h-3 w-3" /> Rotate
                      </Label>
                      <Slider
                        value={[settings.cameraMotion.rotate]}
                        onValueChange={([v]) =>
                          setSettings({
                            ...settings,
                            cameraMotion: { ...settings.cameraMotion, rotate: v },
                          })
                        }
                        min={-1}
                        max={1}
                        step={0.1}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Subject Motion Intensity</Label>
                    <span className="text-sm text-muted-foreground">
                      {settings.subjectMotion.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[settings.subjectMotion]}
                    onValueChange={([v]) =>
                      setSettings({ ...settings, subjectMotion: v })
                    }
                    min={0}
                    max={2}
                    step={0.1}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Seed (-1 = random)</Label>
                    <Input
                      type="number"
                      value={settings.seed}
                      onChange={(e) =>
                        setSettings({ ...settings, seed: parseInt(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Batch Count</Label>
                    <Select
                      value={settings.batchCount.toString()}
                      onValueChange={(v) =>
                        setSettings({ ...settings, batchCount: parseInt(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={n.toString()}>
                            {n} video{n > 1 ? "s" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex gap-2">
              <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Save className="h-4 w-4 mr-1" />
                    Save Preset
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Preset</DialogTitle>
                    <DialogDescription>
                      Save current settings as a reusable preset
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Preset Name</Label>
                      <Input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="My Video Preset"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowPresetDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={savePreset}>Save Preset</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {presets.length > 0 && (
                <Select onValueChange={(id) => {
                  const preset = presets.find(p => p.id === id);
                  if (preset) loadPreset(preset);
                }}>
                  <SelectTrigger className="flex-1">
                    <FolderOpen className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Load Preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="p-4 border-t">
            <Button
              className="w-full"
              size="lg"
              onClick={generateVideo}
              disabled={isGenerating || !settings.prompt.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate {settings.batchCount > 1 ? `${settings.batchCount} Videos` : "Video"}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            {selectedJob ? (
              <Card className="flex-1 flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(selectedJob.status)}
                      <CardTitle className="text-lg">
                        {selectedJob.prompt.substring(0, 50)}...
                      </CardTitle>
                    </div>
                    {getStatusBadge(selectedJob.status)}
                  </div>
                  <CardDescription>
                    {selectedJob.width}x{selectedJob.height} • {selectedJob.duration} frames @ {selectedJob.fps}fps
                    {selectedJob.processingTimeMs && (
                      <span className="ml-2">• Generated in {formatDuration(selectedJob.processingTimeMs)}</span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  {selectedJob.status === "processing" && (
                    <div className="mb-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Generating...</span>
                        <span>{selectedJob.progress}%</span>
                      </div>
                      <Progress value={selectedJob.progress} />
                    </div>
                  )}

                  {selectedJob.status === "completed" && selectedJob.videoUrl && (
                    <div className="flex-1 flex flex-col">
                      <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center">
                        <video
                          ref={videoRef}
                          src={selectedJob.videoUrl}
                          className="max-w-full max-h-full"
                          controls
                          loop
                          autoPlay
                          muted
                        />
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (selectedJob.videoUrl) {
                              const a = document.createElement("a");
                              a.href = selectedJob.videoUrl;
                              a.download = `video-${selectedJob.id}.mp4`;
                              a.click();
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSettings({ ...settings, prompt: selectedJob.prompt });
                            toast({ title: "Prompt copied to input" });
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Reuse Prompt
                        </Button>
                      </div>
                    </div>
                  )}

                  {selectedJob.status === "failed" && (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <XCircle className="h-12 w-12 text-red-500 mx-auto" />
                        <p className="text-red-500">{selectedJob.error || "Generation failed"}</p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSettings({ ...settings, prompt: selectedJob.prompt });
                          }}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Try Again
                        </Button>
                      </div>
                    </div>
                  )}

                  {selectedJob.status === "queued" && (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <Clock className="h-12 w-12 text-yellow-500 mx-auto animate-pulse" />
                        <p className="text-muted-foreground">Waiting in queue...</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg">
                <div className="text-center space-y-2">
                  <Video className="h-12 w-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">
                    Select a job from the queue or generate a new video
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="h-[200px] border-t overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
              <h3 className="font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Job Queue
              </h3>
              <Badge variant="secondary">
                {jobs.filter(j => j.status === "queued" || j.status === "processing").length} active
              </Badge>
            </div>
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-2 p-2 h-full">
                {jobs.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    No jobs yet. Generate your first video!
                  </div>
                ) : (
                  jobs.map((job) => (
                    <div
                      key={job.id}
                      className={`flex-shrink-0 w-[180px] p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedJob?.id === job.id
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedJob(job)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        {getStatusIcon(job.status)}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteJob(job.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs truncate mb-1">{job.prompt.substring(0, 40)}...</p>
                      {job.status === "processing" && (
                        <Progress value={job.progress} className="h-1" />
                      )}
                      {job.status === "completed" && job.videoUrl && (
                        <div className="aspect-video bg-muted rounded overflow-hidden mt-1">
                          <video
                            src={job.videoUrl}
                            className="w-full h-full object-cover"
                            muted
                            loop
                            autoPlay
                            playsInline
                          />
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
