"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  RefreshCw,
  Loader2,
  Image as ImageIcon,
  Wand2,
  Sparkles,
  Download,
  Trash2,
  Upload,
  ChevronDown,
  ChevronRight,
  Shuffle,
  ZoomIn,
  Layers,
  Paintbrush,
  ArrowRightLeft,
  Maximize2,
  User,
  X,
  Clock,
  Check,
  AlertCircle,
  Copy,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";

interface SDStatus {
  available: boolean;
  modelLoaded: boolean;
  currentModel: string | null;
  modelLoading: boolean;
  availableModels: string[];
  validCheckpoints?: string[];
  url?: string;
  vram?: { total: number; used: number; free: number };
  error?: string;
  hasMotionModule?: boolean;
  requiresModelSwitch?: boolean;
  ready: boolean;
}

interface Capabilities {
  stableDiffusion: SDStatus;
  features: {
    textToImage: { available: boolean; description: string };
    imageToImage: { available: boolean; description: string };
    inpainting: { available: boolean; description: string };
    controlnet: { available: boolean; models: string[]; description: string; supportedTypes: string[] };
    upscaling: { available: boolean; upscalers: string[]; description: string };
    faceSwap: { available: boolean; extension: string; description: string };
  };
  generationTypes: Array<{
    id: string;
    name: string;
    description: string;
    available: boolean;
  }>;
}

interface SDModel {
  title: string;
  model_name: string;
  filename?: string;
}

interface GeneratedImage {
  id: string;
  base64?: string;
  url?: string;
  prompt: string;
  type: string;
  timestamp: Date;
  parameters: Record<string, unknown>;
}

interface Job {
  id: number;
  type: string;
  status: string;
  prompt: string;
  negativePrompt?: string;
  parameters: Record<string, unknown>;
  outputImages: Array<{ type: string; data?: string; url?: string }>;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

const PROMPT_TEMPLATES = [
  { name: "Cinematic Portrait", prompt: "cinematic portrait, dramatic lighting, film grain, 35mm" },
  { name: "Fantasy Art", prompt: "fantasy art, ethereal, magical, vibrant colors, detailed" },
  { name: "Photorealistic", prompt: "photorealistic, 8k uhd, high detail, sharp focus" },
  { name: "Anime Style", prompt: "anime style, studio ghibli, detailed, vibrant" },
  { name: "Oil Painting", prompt: "oil painting, classical art, masterpiece, detailed brushwork" },
  { name: "Cyberpunk", prompt: "cyberpunk, neon lights, futuristic, dark atmosphere" },
  { name: "Minimalist", prompt: "minimalist, clean, simple, modern design" },
  { name: "Watercolor", prompt: "watercolor painting, soft colors, artistic, flowing" },
];

const SIZE_PRESETS = [
  { label: "512×512", value: "512x512" },
  { label: "768×768", value: "768x768" },
  { label: "1024×1024", value: "1024x1024" },
];

const SAMPLERS = [
  "Euler",
  "Euler a",
  "DPM++ 2M Karras",
  "DPM++ SDE Karras",
  "DDIM",
  "LMS",
  "Heun",
  "DPM2",
  "DPM++ 2S a Karras",
];

type GenerationMode = "text-to-image" | "image-to-image" | "inpainting" | "controlnet" | "upscale" | "face-swap" | "sd-webui" | "comfyui";

export default function CreativeStudioPage() {
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [mode, setMode] = useState<GenerationMode>("text-to-image");
  
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("blurry, low quality, distorted, deformed");
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [targetImage, setTargetImage] = useState<string | null>(null);
  
  const [steps, setSteps] = useState(25);
  const [cfgScale, setCfgScale] = useState(7);
  const [denoisingStrength, setDenoisingStrength] = useState(0.7);
  const [size, setSize] = useState("512x512");
  const [sampler, setSampler] = useState("DPM++ 2M Karras");
  const [seed, setSeed] = useState(-1);
  const [controlnetType, setControlnetType] = useState("canny");
  const [upscaler, setUpscaler] = useState("R-ESRGAN 4x+");
  const [scaleFactor, setScaleFactor] = useState<2 | 4>(2);
  const [batchCount, setBatchCount] = useState(1);
  
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [showImageDialog, setShowImageDialog] = useState(false);
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(false);
  
  const [availableModels, setAvailableModels] = useState<SDModel[]>([]);
  const [switchingModel, setSwitchingModel] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maskInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  const fetchCapabilities = useCallback(async (forceRefresh = false) => {
    try {
      const url = forceRefresh 
        ? "/api/creative/capabilities?refresh=true" 
        : "/api/creative/capabilities";
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCapabilities(data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch capabilities:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/creative/jobs?limit=20", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.jobs) {
          setJobs(data.jobs);
        }
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/models/sd?action=models", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data.models || data.checkpoints || []);
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  }, []);

  const switchModel = async (modelTitle: string) => {
    if (switchingModel) return;
    setSwitchingModel(true);

    try {
      // Find the model by title to get the actual filename (model_name)
      const selectedModel = availableModels.find(m => m.title === modelTitle);
      const modelName = selectedModel?.model_name || modelTitle;
      
      const res = await fetch("/api/ai/models/sd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch-model", model: modelName }),
      });

      if (res.ok) {
        toast.success(`Switching to ${modelTitle}...`);
        setTimeout(() => {
          fetchCapabilities(true);
          fetchModels();
        }, 2000);
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to switch model");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to switch model";
      toast.error(errorMessage);
    } finally {
      setSwitchingModel(false);
    }
  };

  useEffect(() => {
    fetchCapabilities(true);
    fetchJobs();
    fetchModels();
    const interval = setInterval(() => fetchCapabilities(false), 30000);
    return () => clearInterval(interval);
  }, [fetchCapabilities, fetchJobs, fetchModels]);

  const handleFileUpload = (file: File, setter: (val: string | null) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setter(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent, setter: (val: string | null) => void) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      handleFileUpload(file, setter);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && mode === "text-to-image") {
      toast.error("Please enter a prompt");
      return;
    }

    if ((mode === "image-to-image" || mode === "inpainting" || mode === "controlnet" || mode === "upscale") && !inputImage) {
      toast.error("Please upload an input image");
      return;
    }

    if (mode === "inpainting" && !maskImage) {
      toast.error("Please upload or draw a mask");
      return;
    }

    if (mode === "face-swap" && (!sourceImage || !targetImage)) {
      toast.error("Please upload both source and target images");
      return;
    }

    setGenerating(true);

    try {
      const body: Record<string, unknown> = {
        type: mode,
        prompt: prompt || undefined,
        negativePrompt: negativePrompt || undefined,
        size,
        steps,
        cfgScale,
      };

      if (mode === "image-to-image" || mode === "inpainting" || mode === "controlnet") {
        body.image = inputImage;
        body.denoisingStrength = denoisingStrength;
      }

      if (mode === "inpainting") {
        body.mask = maskImage;
      }

      if (mode === "controlnet") {
        body.controlNets = [{
          image: inputImage,
          controlType: controlnetType,
          weight: 1.0,
        }];
      }

      if (mode === "upscale") {
        body.image = inputImage;
        body.scaleFactor = scaleFactor;
        body.upscaler = upscaler;
      }

      if (mode === "face-swap") {
        body.sourceImage = sourceImage;
        body.targetImage = targetImage;
      }

      for (let i = 0; i < batchCount; i++) {
        const res = await fetch("/api/creative/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...body,
            seed: seed === -1 ? Math.floor(Math.random() * 2147483647) : seed + i,
          }),
        });

        const data = await res.json();

        if (data.success) {
          const newImage: GeneratedImage = {
            id: `${Date.now()}-${i}`,
            base64: data.base64,
            url: data.url,
            prompt,
            type: mode,
            timestamp: new Date(),
            parameters: { steps, cfgScale, size, sampler, seed: data.seed || seed },
          };
          setGeneratedImages((prev) => [newImage, ...prev]);
          toast.success(`Image ${i + 1}/${batchCount} generated!`);
        } else {
          toast.error(data.error || "Generation failed");
          break;
        }
      }

      fetchJobs();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Generation failed";
      toast.error(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  const handleUseAsInput = (image: GeneratedImage) => {
    const imageData = image.base64 ? `data:image/png;base64,${image.base64}` : image.url;
    if (imageData) {
      setInputImage(imageData);
      setMode("image-to-image");
      toast.success("Image set as input");
    }
  };

  const handleDownload = (image: GeneratedImage) => {
    const link = document.createElement("a");
    link.download = `creative-${image.id}.png`;
    if (image.base64) {
      link.href = `data:image/png;base64,${image.base64}`;
    } else if (image.url) {
      link.href = image.url;
    }
    link.click();
  };

  const handleDeleteImage = (imageId: string) => {
    setGeneratedImages((prev) => prev.filter((img) => img.id !== imageId));
    toast.success("Image deleted");
  };

  const handleLoadJob = (job: Job) => {
    setPrompt(job.prompt || "");
    setNegativePrompt(job.negativePrompt || "");
    if (job.parameters) {
      if (typeof job.parameters.steps === "number") setSteps(job.parameters.steps);
      if (typeof job.parameters.cfgScale === "number") setCfgScale(job.parameters.cfgScale);
      if (typeof job.parameters.size === "string") setSize(job.parameters.size);
    }
    setMode(job.type as GenerationMode);
    toast.success("Parameters loaded from history");
  };

  const randomizeSeed = () => {
    setSeed(Math.floor(Math.random() * 2147483647));
  };

  const applyTemplate = (template: { name: string; prompt: string }) => {
    setPrompt((prev) => prev ? `${prev}, ${template.prompt}` : template.prompt);
    toast.success(`Applied "${template.name}" template`);
  };

  const getModeIcon = (modeType: GenerationMode) => {
    switch (modeType) {
      case "text-to-image": return <Wand2 className="h-4 w-4" />;
      case "image-to-image": return <ArrowRightLeft className="h-4 w-4" />;
      case "inpainting": return <Paintbrush className="h-4 w-4" />;
      case "controlnet": return <Layers className="h-4 w-4" />;
      case "upscale": return <Maximize2 className="h-4 w-4" />;
      case "face-swap": return <User className="h-4 w-4" />;
      case "sd-webui": return <ImageIcon className="h-4 w-4" />;
      case "comfyui": return <Sparkles className="h-4 w-4" />;
    }
  };

  const isModeAvailable = (modeType: GenerationMode) => {
    if (modeType === "sd-webui" || modeType === "comfyui") return true;
    if (!capabilities) return false;
    switch (modeType) {
      case "text-to-image": return capabilities.features.textToImage.available;
      case "image-to-image": return capabilities.features.imageToImage.available;
      case "inpainting": return capabilities.features.inpainting.available;
      case "controlnet": return capabilities.features.controlnet.available;
      case "upscale": return capabilities.features.upscaling.available;
      case "face-swap": return capabilities.features.faceSwap.available;
      default: return false;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading Creative Studio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-purple-500" />
              Creative Studio
            </h1>
            <p className="text-sm text-muted-foreground">
              Nebula Creative Engine - AI-powered image generation
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {capabilities?.stableDiffusion.ready ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                <Check className="h-3 w-3 mr-1" />
                SD Ready
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                <AlertCircle className="h-3 w-3 mr-1" />
                SD Offline
              </Badge>
            )}
            
            {availableModels.length > 0 ? (
              <Select
                value={capabilities?.stableDiffusion.currentModel || ""}
                onValueChange={switchModel}
                disabled={switchingModel || !capabilities?.stableDiffusion.available}
              >
                <SelectTrigger className="w-[220px] h-8 text-xs">
                  {switchingModel ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Switching...
                    </span>
                  ) : (
                    <SelectValue placeholder="Select Model" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => {
                    const isCurrentModel = model.title === capabilities?.stableDiffusion.currentModel ||
                      model.model_name === capabilities?.stableDiffusion.currentModel;
                    return (
                      <SelectItem key={model.model_name || model.title} value={model.title} className="text-xs">
                        <span className="flex items-center gap-2">
                          {isCurrentModel && (
                            <Check className="h-3 w-3 text-green-500" />
                          )}
                          <span className="truncate max-w-[170px]">{model.title}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : capabilities?.stableDiffusion.currentModel ? (
              <Badge variant="secondary" className="text-xs max-w-[200px] truncate">
                {capabilities.stableDiffusion.currentModel}
              </Badge>
            ) : null}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchCapabilities(); fetchJobs(); fetchModels(); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {capabilities?.stableDiffusion.requiresModelSwitch && (
          <Card className="border-amber-500/50 bg-amber-500/10">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Invalid Model Loaded</p>
                    <p className="text-sm text-muted-foreground">
                      The current model ({capabilities.stableDiffusion.currentModel}) is not a valid checkpoint.
                      {capabilities.stableDiffusion.hasMotionModule && " It appears to be a motion module or auxiliary model."}
                      {" "}Please switch to a valid checkpoint to enable image generation.
                    </p>
                  </div>
                </div>
                {(capabilities.stableDiffusion.validCheckpoints?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Select
                      onValueChange={switchModel}
                      disabled={switchingModel}
                    >
                      <SelectTrigger className="w-[200px] h-9">
                        {switchingModel ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Switching...
                          </span>
                        ) : (
                          <SelectValue placeholder="Switch to checkpoint" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {capabilities.stableDiffusion.validCheckpoints?.map((model) => (
                          <SelectItem key={model} value={model} className="text-sm">
                            <span className="truncate max-w-[180px]">{model}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as GenerationMode)}>
          <TabsList className="grid grid-cols-4 lg:grid-cols-8 h-auto">
            {([
              { id: "text-to-image", label: "Text to Image" },
              { id: "image-to-image", label: "Image to Image" },
              { id: "inpainting", label: "Inpainting" },
              { id: "controlnet", label: "ControlNet" },
              { id: "upscale", label: "Upscale" },
              { id: "face-swap", label: "Face Swap" },
              { id: "sd-webui", label: "SD WebUI" },
              { id: "comfyui", label: "ComfyUI" },
            ] as const).map(({ id, label }) => (
              <TabsTrigger
                key={id}
                value={id}
                disabled={id !== "sd-webui" && id !== "comfyui" && !isModeAvailable(id)}
                className="flex items-center gap-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {getModeIcon(id)}
                <span className="hidden sm:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {mode === "sd-webui" && (
            <div className="mt-6">
              <Card className="overflow-hidden">
                <CardHeader className="py-3 bg-muted/50">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-orange-500" />
                    Stable Diffusion WebUI
                    <Badge variant="outline" className="ml-2">Full Interface</Badge>
                  </CardTitle>
                  <CardDescription>
                    Complete SD WebUI with all features - training, extensions, settings, and more
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <iframe
                    src={`http://${capabilities?.stableDiffusion?.url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || process.env.NEXT_PUBLIC_WINDOWS_VM_IP || '100.118.44.102'}:7860`}
                    className="w-full border-0"
                    style={{ height: 'calc(100vh - 280px)', minHeight: '600px' }}
                    title="Stable Diffusion WebUI"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {mode === "comfyui" && (
            <div className="mt-6">
              <Card className="overflow-hidden">
                <CardHeader className="py-3 bg-muted/50">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    ComfyUI
                    <Badge variant="outline" className="ml-2">Node-Based Workflow</Badge>
                  </CardTitle>
                  <CardDescription>
                    Advanced node-based workflow editor for complex generation pipelines and video
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <iframe
                    src={`http://${process.env.NEXT_PUBLIC_WINDOWS_VM_IP || '100.118.44.102'}:8188`}
                    className="w-full border-0"
                    style={{ height: 'calc(100vh - 280px)', minHeight: '600px' }}
                    title="ComfyUI"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {mode !== "sd-webui" && mode !== "comfyui" && (
          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5 text-blue-500" />
                      Input
                    </span>
                    <Select onValueChange={(val) => {
                      const template = PROMPT_TEMPLATES.find(t => t.name === val);
                      if (template) applyTemplate(template);
                    }}>
                      <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue placeholder="Prompt Templates" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROMPT_TEMPLATES.map((t) => (
                          <SelectItem key={t.name} value={t.name} className="text-xs">
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Prompt</Label>
                    <Textarea
                      placeholder="Describe what you want to generate..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      className="resize-none"
                    />
                  </div>

                  <Collapsible open={showNegativePrompt} onOpenChange={setShowNegativePrompt}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-between">
                        <span>Negative Prompt</span>
                        {showNegativePrompt ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <Textarea
                        placeholder="What to avoid in the generation..."
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value)}
                        rows={2}
                        className="resize-none text-sm"
                      />
                    </CollapsibleContent>
                  </Collapsible>

                  {(mode === "image-to-image" || mode === "inpainting" || mode === "controlnet" || mode === "upscale") && (
                    <div className="space-y-2">
                      <Label>Input Image</Label>
                      <div
                        className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-secondary/50 transition relative"
                        onDrop={(e) => handleDrop(e, setInputImage)}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {inputImage ? (
                          <div className="relative">
                            <img src={inputImage} alt="Input" className="max-h-40 mx-auto rounded" />
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute top-0 right-0 h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); setInputImage(null); }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">Drop image here or click to upload</p>
                          </>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, setInputImage);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {mode === "inpainting" && (
                    <div className="space-y-2">
                      <Label>Mask Image</Label>
                      <div
                        className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-secondary/50 transition"
                        onDrop={(e) => handleDrop(e, setMaskImage)}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => maskInputRef.current?.click()}
                      >
                        {maskImage ? (
                          <div className="relative">
                            <img src={maskImage} alt="Mask" className="max-h-40 mx-auto rounded" />
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute top-0 right-0 h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); setMaskImage(null); }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Paintbrush className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">Upload mask (white = inpaint area)</p>
                          </>
                        )}
                        <input
                          ref={maskInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, setMaskImage);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {mode === "face-swap" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Source Face</Label>
                        <div
                          className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:bg-secondary/50 transition"
                          onClick={() => sourceInputRef.current?.click()}
                        >
                          {sourceImage ? (
                            <div className="relative">
                              <img src={sourceImage} alt="Source" className="max-h-24 mx-auto rounded" />
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-0 right-0 h-5 w-5"
                                onClick={(e) => { e.stopPropagation(); setSourceImage(null); }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <User className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                              <p className="text-xs text-muted-foreground">Face to use</p>
                            </>
                          )}
                          <input
                            ref={sourceInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, setSourceImage);
                            }}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Target Image</Label>
                        <div
                          className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:bg-secondary/50 transition"
                          onClick={() => targetInputRef.current?.click()}
                        >
                          {targetImage ? (
                            <div className="relative">
                              <img src={targetImage} alt="Target" className="max-h-24 mx-auto rounded" />
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-0 right-0 h-5 w-5"
                                onClick={(e) => { e.stopPropagation(); setTargetImage(null); }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <ImageIcon className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                              <p className="text-xs text-muted-foreground">Target image</p>
                            </>
                          )}
                          <input
                            ref={targetInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, setTargetImage);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="h-5 w-5 text-purple-500" />
                    Parameters
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mode !== "upscale" && mode !== "face-swap" && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Steps</Label>
                          <span className="text-xs text-muted-foreground">{steps}</span>
                        </div>
                        <Slider
                          value={[steps]}
                          onValueChange={([v]) => setSteps(v)}
                          min={10}
                          max={50}
                          step={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">CFG Scale</Label>
                          <span className="text-xs text-muted-foreground">{cfgScale}</span>
                        </div>
                        <Slider
                          value={[cfgScale]}
                          onValueChange={([v]) => setCfgScale(v)}
                          min={1}
                          max={20}
                          step={0.5}
                        />
                      </div>
                    </>
                  )}

                  {(mode === "image-to-image" || mode === "inpainting" || mode === "controlnet") && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Denoising Strength</Label>
                        <span className="text-xs text-muted-foreground">{denoisingStrength.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[denoisingStrength]}
                        onValueChange={([v]) => setDenoisingStrength(v)}
                        min={0}
                        max={1}
                        step={0.05}
                      />
                    </div>
                  )}

                  {mode !== "upscale" && mode !== "face-swap" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm">Size</Label>
                        <Select value={size} onValueChange={setSize}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SIZE_PRESETS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm">Sampler</Label>
                        <Select value={sampler} onValueChange={setSampler}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SAMPLERS.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {mode === "controlnet" && capabilities?.features.controlnet.supportedTypes && (
                    <div className="space-y-2">
                      <Label className="text-sm">ControlNet Type</Label>
                      <Select value={controlnetType} onValueChange={setControlnetType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {capabilities.features.controlnet.supportedTypes.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {mode === "upscale" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm">Scale Factor</Label>
                        <Select value={String(scaleFactor)} onValueChange={(v) => setScaleFactor(Number(v) as 2 | 4)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2x</SelectItem>
                            <SelectItem value="4">4x</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Upscaler</Label>
                        <Select value={upscaler} onValueChange={setUpscaler}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(capabilities?.features.upscaling.upscalers || ["R-ESRGAN 4x+"]).map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {mode !== "upscale" && mode !== "face-swap" && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 space-y-2">
                        <Label className="text-sm">Seed</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={seed}
                            onChange={(e) => setSeed(parseInt(e.target.value) || -1)}
                            className="flex-1"
                            placeholder="-1 for random"
                          />
                          <Button variant="outline" size="icon" onClick={randomizeSeed}>
                            <Shuffle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm">Batch Count</Label>
                    <Select value={String(batchCount)} onValueChange={(v) => setBatchCount(Number(v))}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="pt-4 flex gap-2">
                    <Button
                      className="flex-1"
                      size="lg"
                      onClick={handleGenerate}
                      disabled={generating || !capabilities?.stableDiffusion.ready}
                    >
                      {generating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4 mr-2" />
                          Generate
                        </>
                      )}
                    </Button>
                    {generating && (
                      <Button variant="destructive" size="lg" onClick={() => setGenerating(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-green-500" />
                    Output Gallery
                  </span>
                  {generatedImages.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {generatedImages.length} image{generatedImages.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {generatedImages.length === 0 ? (
                  <div className="aspect-square flex items-center justify-center border-2 border-dashed rounded-lg">
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Generated images will appear here</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {generatedImages.map((image) => (
                      <div
                        key={image.id}
                        className="relative group rounded-lg overflow-hidden border bg-secondary/30"
                      >
                        <img
                          src={image.base64 ? `data:image/png;base64,${image.base64}` : image.url}
                          alt={image.prompt}
                          className="w-full aspect-square object-cover cursor-pointer"
                          onClick={() => {
                            setSelectedImage(image);
                            setShowImageDialog(true);
                          }}
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setSelectedImage(image);
                              setShowImageDialog(true);
                            }}
                          >
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDownload(image)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleUseAsInput(image)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDeleteImage(image.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          )}
        </Tabs>
      </div>

      {showHistory && (
        <div className="w-80 border-l bg-card/50 overflow-hidden flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Job History
            </h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchJobs} disabled={loadingJobs}>
              <RefreshCw className={`h-4 w-4 ${loadingJobs ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No generation history</p>
              ) : (
                jobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded-lg border bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition"
                    onClick={() => handleLoadJob(job)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"} className="text-xs">
                        {job.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {job.prompt || "No prompt"}
                    </p>
                    {job.status === "failed" && job.error && (
                      <p className="text-xs text-red-500 mt-1 line-clamp-1">{job.error}</p>
                    )}
                    {job.outputImages && job.outputImages.length > 0 && (
                      <div className="mt-2 flex gap-1">
                        {job.outputImages.slice(0, 3).map((img, idx) => (
                          <div key={idx} className="w-10 h-10 rounded bg-secondary overflow-hidden">
                            {img.data && (
                              <img
                                src={`data:image/png;base64,${img.data}`}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                        ))}
                        {job.outputImages.length > 3 && (
                          <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center text-xs text-muted-foreground">
                            +{job.outputImages.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Generated Image</DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="space-y-4">
              <img
                src={selectedImage.base64 ? `data:image/png;base64,${selectedImage.base64}` : selectedImage.url}
                alt={selectedImage.prompt}
                className="w-full rounded-lg"
              />
              <div className="space-y-2 text-sm">
                <p><strong>Prompt:</strong> {selectedImage.prompt}</p>
                <p><strong>Type:</strong> {selectedImage.type}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => handleDownload(selectedImage)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button variant="outline" onClick={() => { handleUseAsInput(selectedImage); setShowImageDialog(false); }}>
                    <Copy className="h-4 w-4 mr-2" />
                    Use as Input
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
