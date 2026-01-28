"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import {
  Wand2,
  Image as ImageIcon,
  Video,
  MessageSquare,
  Sparkles,
  Download,
  Copy,
  RefreshCw,
  Zap,
  Cpu,
  Cloud,
  CheckCircle2,
  XCircle,
  Loader2,
  Box,
  Paintbrush,
  Upload,
} from "lucide-react";
import { ModelManager } from "@/components/ai/model-manager";
import { PaintOverlay } from "@/components/ai/PaintOverlay";
import { ProjectsSidebar } from "@/components/creative/ProjectsSidebar";

interface Project {
  id: string;
  name: string;
  type: string;
  data: any;
  thumbnail?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Asset {
  id: string;
  projectId: string;
  type: string;
  data: string;
  metadata: any;
  createdAt: string;
}

interface AIStatus {
  status: string;
  providers: {
    text: { name: string; status: string; model?: string; latency?: number; error?: string }[];
    image: { name: string; status: string; model?: string; error?: string }[];
    video: { name: string; status: string; error?: string }[];
  };
  capabilities: {
    chat: boolean;
    imageGeneration: boolean;
    videoGeneration: boolean;
    localLLM: boolean;
  };
}

interface GeneratedImage {
  url?: string;
  base64?: string;
  provider: string;
  revisedPrompt?: string;
  savedPath?: string;
  isBlob?: boolean;
}

interface GeneratedVideo {
  url: string;
  provider: string;
  model: string;
  duration?: number;
  savedPath?: string;
  isBlob?: boolean;
}

export default function CreativeStudioPage() {
  const { toast } = useToast();
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("image");

  const [imagePrompt, setImagePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [imageSize, setImageSize] = useState("1024x1024");
  const [imageStyle, setImageStyle] = useState("vivid");
  const [imageProvider, setImageProvider] = useState("auto");
  const [imageProviders, setImageProviders] = useState<any[]>([]);
  const [sdAvailable, setSdAvailable] = useState(false);
  const [sdStatus, setSdStatus] = useState<{
    available: boolean;
    modelLoaded: boolean;
    currentModel: string | null;
    modelLoading: boolean;
    availableModels: string[];
    error: string | null;
    vram?: { total: number; used: number; free: number };
    url?: string;
  } | null>(null);
  const [sdModels, setSdModels] = useState<{
    title: string;
    model_name: string;
    filename?: string;
    type?: string;
    isLoaded?: boolean;
  }[]>([]);
  const [sdMotionModules, setSdMotionModules] = useState<{
    title: string;
    model_name: string;
    filename?: string;
  }[]>([]);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [saveLocally, setSaveLocally] = useState(true);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);

  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoModel, setVideoModel] = useState("animatediff");
  const [videoAspectRatio, setVideoAspectRatio] = useState("16:9");
  const [inputImageUrl, setInputImageUrl] = useState("");
  const [saveVideoLocally, setSaveVideoLocally] = useState(true);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<GeneratedVideo | null>(null);
  const [comfyuiStatus, setComfyuiStatus] = useState<{ online: boolean; error?: string } | null>(null);
  const [replicateAvailable, setReplicateAvailable] = useState(false);

  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [chatProvider, setChatProvider] = useState("auto");
  const [sendingChat, setSendingChat] = useState(false);

  const [inpaintSourceImage, setInpaintSourceImage] = useState<string | null>(null);
  const [inpaintMask, setInpaintMask] = useState<string | null>(null);

  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projectAssets, setProjectAssets] = useState<Asset[]>([]);
  const [inpaintPrompt, setInpaintPrompt] = useState("");
  const [inpaintNegativePrompt, setInpaintNegativePrompt] = useState("blurry, low quality, distorted, ugly, deformed");
  const [inpaintDenoisingStrength, setInpaintDenoisingStrength] = useState(0.75);
  const [inpaintSteps, setInpaintSteps] = useState(30);
  const [generatingInpaint, setGeneratingInpaint] = useState(false);
  const [inpaintResult, setInpaintResult] = useState<GeneratedImage | null>(null);
  const inpaintFileInputRef = React.useRef<HTMLInputElement>(null);
  const inpaintCanvasRef = React.useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetchAIStatus();
    fetchImageProviders();
    fetchSDModels();
    fetchVideoStatus();
  }, []);

  async function fetchVideoStatus() {
    try {
      const res = await fetch("/api/ai/video?action=status");
      if (res.ok) {
        const data = await res.json();
        setComfyuiStatus(data.comfyui || { online: false });
        setReplicateAvailable(data.providers?.some((p: any) => p.id === "replicate" && p.available) || false);
      }
    } catch (error) {
      console.error("Failed to fetch video status:", error);
      setComfyuiStatus({ online: false, error: "Failed to check status" });
    }
  }

  async function fetchSDModels() {
    try {
      const res = await fetch("/api/production/sd-models");
      if (res.ok) {
        const data = await res.json();
        if (data.models) {
          setSdModels(data.models);
        }
        if (data.motionModules) {
          setSdMotionModules(data.motionModules);
        }
        if (data.currentModel && sdStatus) {
          setSdStatus(prev => prev ? { ...prev, currentModel: data.currentModel } : prev);
        }
      }
    } catch (error) {
      console.error("Failed to fetch SD models:", error);
    }
  }

  async function switchSDModel(modelTitle: string) {
    if (switchingModel) return;
    
    setSwitchingModel(true);
    try {
      const res = await fetch("/api/production/sd-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelTitle }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSdStatus(prev => prev ? { 
            ...prev, 
            currentModel: data.currentModel || modelTitle,
            modelLoaded: true,
            modelLoading: false,
          } : prev);
          await fetchImageProviders();
          await fetchSDModels();
          toast({
            title: "Success",
            description: `Model switched to ${modelTitle}`,
          });
        } else {
          toast({
            title: "Failed to Switch Model",
            description: data.error || "Unknown error occurred",
            variant: "destructive",
          });
        }
      } else {
        const error = await res.json();
        toast({
          title: "Failed to Switch Model",
          description: error.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to Switch Model",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setSwitchingModel(false);
    }
  }

  async function fetchImageProviders() {
    try {
      const res = await fetch("/api/ai/image");
      if (res.ok) {
        const data = await res.json();
        setImageProviders(data.providers || []);
        setSdAvailable(data.sdAvailable || false);
        if (data.sdStatus) {
          setSdStatus(data.sdStatus);
        }
        
        // Auto-select best available provider - prefer Force Local for unrestricted content
        const providers = data.providers || [];
        if (providers.length > 0) {
          // Prefer Force Local (no restrictions) if available, then SD, then OpenAI, then auto
          const forceLocalProvider = providers.find((p: any) => p.id === "force-local" && p.available);
          const sdProvider = providers.find((p: any) => p.id === "stable-diffusion" && p.available);
          const openaiProvider = providers.find((p: any) => p.id === "openai" && p.available);
          const autoProvider = providers.find((p: any) => p.id === "auto");
          
          if (forceLocalProvider) {
            setImageProvider("force-local");
          } else if (sdProvider) {
            setImageProvider("stable-diffusion");
          } else if (openaiProvider) {
            setImageProvider("openai");
          } else if (autoProvider) {
            setImageProvider("auto");
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch image providers:", error);
    }
  }

  async function fetchAIStatus() {
    try {
      const res = await fetch("/api/ai/status");
      if (res.ok) {
        const data = await res.json();
        setAIStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch AI status:", error);
    } finally {
      setLoading(false);
    }
  }

  async function safeParseJSON(res: Response): Promise<any> {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
        throw new Error("Server returned an HTML error page. The AI service may be unavailable or misconfigured.");
      }
      throw new Error(text || `Server returned non-JSON response (${res.status})`);
    }
    try {
      return await res.json();
    } catch (e) {
      throw new Error(`Invalid JSON response from server: ${e}`);
    }
  }

  async function generateImage() {
    if (!imagePrompt.trim()) return;

    setGeneratingImage(true);
    setGeneratedImage(null);

    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: imagePrompt,
          negativePrompt,
          size: imageSize,
          style: imageStyle,
          provider: imageProvider,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      
      if (res.ok && contentType.includes("image/")) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const provider = res.headers.get("x-provider") || "unknown";
        setGeneratedImage({ url: blobUrl, provider, isBlob: true });
        
        if (currentProject) {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(",")[1];
            try {
              await fetch(`/api/creative-projects/${currentProject.id}/assets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "image",
                  data: base64,
                  metadata: { provider, prompt: imagePrompt, size: imageSize },
                }),
              });
            } catch (e) {
              console.error("Failed to save asset:", e);
            }
          };
          reader.readAsDataURL(blob);
        }
        
        toast({
          title: "Success",
          description: currentProject ? "Image generated and saved to project" : "Image generated successfully",
        });
      } else if (res.ok) {
        const data = await safeParseJSON(res);
        setGeneratedImage(data);
        
        if (currentProject && data.base64) {
          try {
            await fetch(`/api/creative-projects/${currentProject.id}/assets`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "image",
                data: data.base64,
                metadata: { provider: data.provider, prompt: imagePrompt, size: imageSize },
              }),
            });
          } catch (e) {
            console.error("Failed to save asset:", e);
          }
        }
        
        toast({
          title: "Success",
          description: currentProject ? "Image generated and saved to project" : "Image generated successfully",
        });
      } else {
        try {
          const error = await safeParseJSON(res);
          toast({
            title: "Failed to Generate Image",
            description: error.details || error.error || "An unknown error occurred",
            variant: "destructive",
          });
        } catch (parseError: any) {
          toast({
            title: "Failed to Generate Image",
            description: parseError.message || "An unexpected error occurred",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Failed to Generate Image",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setGeneratingImage(false);
    }
  }

  async function generateVideo() {
    if (!videoPrompt.trim() && !inputImageUrl.trim()) return;

    setGeneratingVideo(true);
    setGeneratedVideo(null);

    try {
      const res = await fetch("/api/ai/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: videoPrompt,
          inputImage: inputImageUrl || undefined,
          aspectRatio: videoAspectRatio,
          model: videoModel,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      
      if (res.ok && contentType.includes("video/")) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const provider = res.headers.get("x-provider") || "local";
        const model = res.headers.get("x-model") || videoModel;
        setGeneratedVideo({ url: blobUrl, provider, model, isBlob: true });
        toast({
          title: "Success",
          description: "Video generated successfully",
        });
      } else if (res.ok) {
        const data = await safeParseJSON(res);
        setGeneratedVideo(data);
        toast({
          title: "Success",
          description: "Video generated successfully",
        });
      } else {
        try {
          const error = await safeParseJSON(res);
          toast({
            title: "Failed to Generate Video",
            description: error.details || error.error || "An unknown error occurred",
            variant: "destructive",
          });
        } catch (parseError: any) {
          toast({
            title: "Failed to Generate Video",
            description: parseError.message || "An unexpected error occurred",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Failed to Generate Video",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setGeneratingVideo(false);
    }
  }

  async function sendChatMessage() {
    if (!chatMessage.trim()) return;

    const userMessage = { role: "user", content: chatMessage };
    setChatHistory([...chatHistory, userMessage]);
    setChatMessage("");
    setSendingChat(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: chatMessage,
          history: chatHistory,
          provider: chatProvider,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatHistory((prev) => [
          ...prev,
          { role: "assistant", content: data.response },
        ]);
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setSendingChat(false);
    }
  }

  function handleInpaintImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setInpaintSourceImage(result);
      setInpaintResult(null);
      setInpaintMask(null);
    };
    reader.readAsDataURL(file);
  }

  function useGeneratedImageForInpaint() {
    if (generatedImage?.url) {
      setInpaintSourceImage(generatedImage.url);
      setInpaintResult(null);
      setInpaintMask(null);
      setActiveTab("inpaint");
      toast({
        title: "Image Selected",
        description: "Your generated image has been loaded for inpainting",
      });
    } else if (generatedImage?.base64) {
      setInpaintSourceImage(`data:image/png;base64,${generatedImage.base64}`);
      setInpaintResult(null);
      setInpaintMask(null);
      setActiveTab("inpaint");
      toast({
        title: "Image Selected",
        description: "Your generated image has been loaded for inpainting",
      });
    }
  }

  async function handleMaskExport(maskBase64: string) {
    setInpaintMask(maskBase64);
  }

  async function generateInpaint() {
    if (!inpaintSourceImage || !inpaintMask || !inpaintPrompt.trim()) {
      toast({
        title: "Missing Requirements",
        description: "Please upload an image, paint a mask, and enter a prompt",
        variant: "destructive",
      });
      return;
    }

    setGeneratingInpaint(true);
    setInpaintResult(null);

    try {
      let imageBase64 = inpaintSourceImage;
      if (inpaintSourceImage.startsWith("data:")) {
        imageBase64 = inpaintSourceImage.split(",")[1];
      } else if (inpaintSourceImage.startsWith("blob:")) {
        const response = await fetch(inpaintSourceImage);
        const blob = await response.blob();
        const reader = new FileReader();
        imageBase64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.readAsDataURL(blob);
        });
      }

      const res = await fetch("/api/ai/inpaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          mask: inpaintMask,
          prompt: inpaintPrompt,
          negativePrompt: inpaintNegativePrompt,
          denoisingStrength: inpaintDenoisingStrength,
          steps: inpaintSteps,
        }),
      });

      if (res.ok) {
        const data = await safeParseJSON(res);
        if (data.success && data.image) {
          setInpaintResult({
            base64: data.image,
            provider: "stable-diffusion",
          });
          toast({
            title: "Success",
            description: "Inpainting completed successfully",
          });
        } else {
          throw new Error(data.error || "Failed to generate inpainted image");
        }
      } else {
        const error = await safeParseJSON(res);
        toast({
          title: "Inpainting Failed",
          description: error.details || error.error || "An unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Inpainting Failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setGeneratingInpaint(false);
    }
  }

  function StatusBadge({ status }: { status: string }) {
    if (status === "connected") {
      return (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <CheckCircle2 className="h-3 w-3" /> Connected
        </span>
      );
    }
    if (status === "error") {
      return (
        <span className="flex items-center gap-1 text-xs text-red-400">
          <XCircle className="h-3 w-3" /> Error
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-400">
        <XCircle className="h-3 w-3" /> Not Configured
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-purple-500" />
              Creative Studio
              {currentProject && (
                <span className="text-lg font-normal text-muted-foreground">
                  — {currentProject.name}
                </span>
              )}
            </h1>
            <p className="text-muted-foreground">
              AI-powered content creation for next-gen creators
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ProjectsSidebar
            currentProjectId={currentProject?.id}
            currentProjectData={currentProject ? {
              name: currentProject.name,
              type: currentProject.type,
              data: {
                imagePrompt,
                negativePrompt,
                imageSize,
                imageStyle,
                videoPrompt,
                videoModel,
                chatHistory,
              },
              thumbnail: generatedImage?.url || generatedImage?.base64 ? 
                (generatedImage.url || `data:image/png;base64,${generatedImage.base64}`) : 
                currentProject.thumbnail,
            } : undefined}
            onProjectLoad={(project, assets) => {
              setCurrentProject(project);
              setProjectAssets(assets);
              if (project.data) {
                const data = project.data as any;
                if (data.imagePrompt) setImagePrompt(data.imagePrompt);
                if (data.negativePrompt) setNegativePrompt(data.negativePrompt);
                if (data.imageSize) setImageSize(data.imageSize);
                if (data.imageStyle) setImageStyle(data.imageStyle);
                if (data.videoPrompt) setVideoPrompt(data.videoPrompt);
                if (data.videoModel) setVideoModel(data.videoModel);
                if (data.chatHistory) setChatHistory(data.chatHistory);
              }
              const lastImage = assets.find(a => a.type === "image");
              if (lastImage?.data) {
                setGeneratedImage({ 
                  base64: lastImage.data.startsWith("data:") ? 
                    lastImage.data.split(",")[1] : lastImage.data, 
                  provider: (lastImage.metadata as any)?.provider || "loaded" 
                });
              }
              setActiveTab(project.type);
            }}
            onProjectCreate={(project) => {
              setCurrentProject(project);
              setProjectAssets([]);
              setGeneratedImage(null);
              setGeneratedVideo(null);
              setChatHistory([]);
            }}
            onAutoSave={async (projectId) => {
              try {
                await fetch(`/api/creative-projects/${projectId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    data: {
                      imagePrompt,
                      negativePrompt,
                      imageSize,
                      imageStyle,
                      videoPrompt,
                      videoModel,
                      chatHistory,
                    },
                  }),
                });
              } catch (error) {
                console.error("Auto-save failed:", error);
              }
            }}
          />
          <Button variant="outline" size="sm" onClick={fetchAIStatus}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Status
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {aiStatus?.providers.text.map((provider) => (
          <div
            key={provider.name}
            className="p-4 rounded-lg border bg-card flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              {provider.name === "Ollama" ? (
                <Cpu className="h-5 w-5 text-orange-500" />
              ) : (
                <Cloud className="h-5 w-5 text-blue-500" />
              )}
              <div>
                <p className="font-medium text-sm">{provider.name}</p>
                {provider.model && (
                  <p className="text-xs text-muted-foreground">{provider.model}</p>
                )}
              </div>
            </div>
            <StatusBadge status={provider.status} />
          </div>
        ))}
        {aiStatus?.providers.image.map((provider) => (
          <div
            key={provider.name}
            className="p-4 rounded-lg border bg-card flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-pink-500" />
              <div>
                <p className="font-medium text-sm">{provider.name}</p>
                {provider.model && (
                  <p className="text-xs text-muted-foreground">{provider.model}</p>
                )}
              </div>
            </div>
            <StatusBadge status={provider.status} />
          </div>
        ))}
      </div>

      {/* SD Status Card */}
      {sdStatus && (
        <div className="p-4 rounded-lg border bg-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-purple-500" />
              <h3 className="font-medium">Stable Diffusion Status</h3>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { fetchImageProviders(); fetchSDModels(); }}
              disabled={switchingModel}
            >
              <RefreshCw className={`h-4 w-4 ${switchingModel ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className={`font-medium ${sdStatus.available && sdStatus.modelLoaded ? "text-green-500" : sdStatus.modelLoading || switchingModel ? "text-yellow-500" : "text-red-500"}`}>
                {switchingModel ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Switching Model...
                  </span>
                ) : sdStatus.modelLoading ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading Model...
                  </span>
                ) : sdStatus.available && sdStatus.modelLoaded ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Ready
                  </span>
                ) : sdStatus.available ? (
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    No Model
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Offline
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Current Model</p>
              <p className="font-medium truncate" title={sdStatus.currentModel || undefined}>
                {sdStatus.currentModel || "None"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Checkpoints</p>
              <p className="font-medium">{sdModels.length || sdStatus.availableModels.length}</p>
            </div>
            {sdMotionModules.length > 0 && (
              <div>
                <p className="text-muted-foreground">Motion Modules</p>
                <p className="font-medium text-yellow-500">{sdMotionModules.length}</p>
              </div>
            )}
            {sdStatus.vram && (
              <div>
                <p className="text-muted-foreground">VRAM Free</p>
                <p className="font-medium">{Math.round(sdStatus.vram.free / 1024 / 1024)} MB</p>
              </div>
            )}
          </div>
          
          {sdStatus.available && sdModels.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-sm text-muted-foreground mb-2 block">Switch Model</Label>
                  <Select 
                    value={sdStatus.currentModel || ""} 
                    onValueChange={switchSDModel}
                    disabled={switchingModel || !sdStatus.available}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sdModels.map((model) => (
                        <SelectItem 
                          key={model.title} 
                          value={model.title}
                        >
                          <span className="flex items-center gap-2">
                            {model.isLoaded && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                            {model.title}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {sdMotionModules.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {sdMotionModules.length} motion module(s) detected and filtered (use SD WebUI for AnimateDiff)
                </p>
              )}
            </div>
          )}
          
          {sdStatus.error && (
            <div className="mt-3 p-2 rounded bg-red-500/10 text-red-500 text-sm">
              {sdStatus.error}
            </div>
          )}
          {sdStatus.available && sdModels.length === 0 && sdStatus.availableModels.length > 0 && !sdStatus.modelLoaded && (
            <div className="mt-3 p-2 rounded bg-yellow-500/10 text-yellow-600 text-sm">
              Load a model in SD WebUI to start generating. Available: {sdStatus.availableModels.slice(0, 3).join(", ")}{sdStatus.availableModels.length > 3 ? "..." : ""}
            </div>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full max-w-2xl">
          <TabsTrigger value="image" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Images
          </TabsTrigger>
          <TabsTrigger value="inpaint" className="flex items-center gap-2">
            <Paintbrush className="h-4 w-4" />
            Inpaint
          </TabsTrigger>
          <TabsTrigger value="video" className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Video
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center gap-2">
            <Box className="h-4 w-4" />
            Models
          </TabsTrigger>
        </TabsList>

        <TabsContent value="image" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea
                  placeholder="Describe the image you want to create..."
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Negative Prompt (optional)</Label>
                <Input
                  placeholder="What to avoid in the image..."
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Size</Label>
                  <Select value={imageSize} onValueChange={setImageSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1024x1024">1024x1024 (Square)</SelectItem>
                      <SelectItem value="1792x1024">1792x1024 (Landscape)</SelectItem>
                      <SelectItem value="1024x1792">1024x1792 (Portrait)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Style</Label>
                  <Select value={imageStyle} onValueChange={setImageStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vivid">Vivid</SelectItem>
                      <SelectItem value="natural">Natural</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="save-locally"
                    checked={saveLocally}
                    onCheckedChange={setSaveLocally}
                  />
                  <Label htmlFor="save-locally">Save to server</Label>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Image Provider</Label>
                <div className="flex gap-2 items-start">
                  <Select value={imageProvider} onValueChange={setImageProvider}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {imageProviders.length > 0 ? (
                        imageProviders.map((p) => (
                          <SelectItem 
                            key={p.id} 
                            value={p.id} 
                            disabled={!p.available}
                          >
                            {p.name} {p.unrestricted && "(No Restrictions)"} {p.available ? "" : "(Not Available)"}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="auto">Auto (Local First)</SelectItem>
                          <SelectItem value="stable-diffusion" disabled={!sdAvailable}>
                            Stable Diffusion {sdAvailable ? "(Available)" : "(Offline)"}
                          </SelectItem>
                          <SelectItem value="openai">DALL-E 3</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <div className="flex-1 pt-2">
                    {imageProviders.length > 0 && imageProviders.find((p) => p.id === imageProvider) && (
                      <div className="text-sm">
                        {imageProviders.find((p) => p.id === imageProvider)?.available ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            {imageProviders.find((p) => p.id === imageProvider)?.description}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                            <XCircle className="h-4 w-4" />
                            Not Available
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Button
                onClick={generateImage}
                disabled={generatingImage || !imagePrompt.trim()}
                className="w-full"
              >
                {generatingImage ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Generate Image
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-4">
              <Label>Generated Image</Label>
              <div className="border rounded-lg bg-muted/50 min-h-[400px] flex items-center justify-center">
                {generatedImage?.url ? (
                  <div className="relative w-full">
                    <img
                      src={generatedImage.url}
                      alt="Generated"
                      className="w-full rounded-lg"
                    />
                    <div className="absolute bottom-2 right-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={useGeneratedImageForInpaint}
                        title="Edit with Inpainting"
                      >
                        <Paintbrush className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const link = document.createElement('a');
                          if (generatedImage.isBlob) {
                            link.href = generatedImage.url!;
                          } else {
                            link.href = generatedImage.url!;
                          }
                          link.download = `generated-${Date.now()}.png`;
                          link.click();
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : generatedImage?.base64 ? (
                  <img
                    src={`data:image/png;base64,${generatedImage.base64}`}
                    alt="Generated"
                    className="w-full rounded-lg"
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="h-16 w-16 mx-auto mb-2 opacity-50" />
                    <p>Your generated image will appear here</p>
                  </div>
                )}
              </div>
              {generatedImage?.revisedPrompt && (
                <div className="text-sm text-muted-foreground">
                  <strong>Revised prompt:</strong> {generatedImage.revisedPrompt}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="inpaint" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Source Image</Label>
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={inpaintFileInputRef}
                    onChange={handleInpaintImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => inpaintFileInputRef.current?.click()}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Image
                  </Button>
                  {generatedImage && (
                    <Button
                      variant="outline"
                      onClick={useGeneratedImageForInpaint}
                      className="flex-1"
                    >
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Use Generated
                    </Button>
                  )}
                </div>
              </div>

              {inpaintSourceImage ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Paint Mask (white = areas to regenerate)</Label>
                    <PaintOverlay
                      imageUrl={inpaintSourceImage}
                      width={512}
                      height={512}
                      onMaskExport={handleMaskExport}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Prompt (describe what to generate in masked area)</Label>
                    <Textarea
                      placeholder="Describe what you want to appear in the masked area..."
                      value={inpaintPrompt}
                      onChange={(e) => setInpaintPrompt(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Negative Prompt (optional)</Label>
                    <Input
                      placeholder="What to avoid..."
                      value={inpaintNegativePrompt}
                      onChange={(e) => setInpaintNegativePrompt(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Denoising: {inpaintDenoisingStrength.toFixed(2)}</Label>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={inpaintDenoisingStrength}
                        onChange={(e) => setInpaintDenoisingStrength(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Higher = more change, Lower = preserve original
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Steps: {inpaintSteps}</Label>
                      <input
                        type="range"
                        min="10"
                        max="50"
                        step="5"
                        value={inpaintSteps}
                        onChange={(e) => setInpaintSteps(parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={generateInpaint}
                    disabled={generatingInpaint || !inpaintPrompt.trim() || !inpaintMask}
                    className="w-full"
                  >
                    {generatingInpaint ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Inpainting...
                      </>
                    ) : (
                      <>
                        <Paintbrush className="h-4 w-4 mr-2" />
                        Generate Inpaint
                      </>
                    )}
                  </Button>

                  {!inpaintMask && (
                    <p className="text-xs text-amber-500">
                      Paint on the image to create a mask, then click Generate
                    </p>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg bg-muted/50 p-8 text-center">
                  <Paintbrush className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground mb-2">Upload or select an image to start inpainting</p>
                  <p className="text-xs text-muted-foreground">
                    You can also use a generated image from the Images tab
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <Label>Inpainted Result</Label>
              <div className="border rounded-lg bg-muted/50 min-h-[400px] flex items-center justify-center">
                {generatingInpaint ? (
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto mb-2 text-purple-500" />
                    <p className="text-muted-foreground">Creating your inpainted image...</p>
                    <p className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</p>
                  </div>
                ) : inpaintResult?.base64 ? (
                  <div className="relative w-full">
                    <img
                      src={`data:image/png;base64,${inpaintResult.base64}`}
                      alt="Inpainted"
                      className="w-full rounded-lg"
                    />
                    <div className="absolute bottom-2 right-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setInpaintSourceImage(`data:image/png;base64,${inpaintResult.base64}`);
                          setInpaintMask(null);
                          toast({
                            title: "Image Updated",
                            description: "Result loaded as new source for further editing",
                          });
                        }}
                        title="Use as New Source"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = `data:image/png;base64,${inpaintResult.base64}`;
                          link.download = `inpainted-${Date.now()}.png`;
                          link.click();
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : inpaintResult?.url ? (
                  <div className="relative w-full">
                    <img
                      src={inpaintResult.url}
                      alt="Inpainted"
                      className="w-full rounded-lg"
                    />
                    <div className="absolute bottom-2 right-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = inpaintResult.url!;
                          link.download = `inpainted-${Date.now()}.png`;
                          link.click();
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Paintbrush className="h-16 w-16 mx-auto mb-2 opacity-50" />
                    <p>Your inpainted image will appear here</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="video" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="p-3 rounded-lg border bg-card/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium">ComfyUI (Local Video)</span>
                  </div>
                  {comfyuiStatus ? (
                    comfyuiStatus.online ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle2 className="h-3 w-3" /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <XCircle className="h-3 w-3" /> Offline
                      </span>
                    )
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                {comfyuiStatus && !comfyuiStatus.online && (
                  <p className="text-xs text-muted-foreground">
                    Windows VM at 100.118.44.102:8188 is not reachable. Start ComfyUI or check Tailscale connection.
                  </p>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full h-7 text-xs"
                  onClick={fetchVideoStatus}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh Status
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={videoModel} onValueChange={setVideoModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="animatediff">
                      <span className="flex items-center gap-2">
                        <Cpu className="h-3 w-3 text-green-500" />
                        AnimateDiff (Local - Unrestricted)
                      </span>
                    </SelectItem>
                    <SelectItem value="svd-local">
                      <span className="flex items-center gap-2">
                        <Cpu className="h-3 w-3 text-green-500" />
                        SVD Local (Image-to-Video - Unrestricted)
                      </span>
                    </SelectItem>
                    <SelectItem value="wan-t2v">
                      <span className="flex items-center gap-2">
                        <Cloud className="h-3 w-3 text-blue-500" />
                        WAN 2.1 Text-to-Video (Cloud)
                      </span>
                    </SelectItem>
                    <SelectItem value="wan-i2v">
                      <span className="flex items-center gap-2">
                        <Cloud className="h-3 w-3 text-blue-500" />
                        WAN 2.1 Image-to-Video (Cloud)
                      </span>
                    </SelectItem>
                    <SelectItem value="svd">
                      <span className="flex items-center gap-2">
                        <Cloud className="h-3 w-3 text-blue-500" />
                        Stable Video Diffusion (Cloud)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Local models use your Windows VM GPU. Cloud models use Replicate API.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea
                  placeholder="Describe the video you want to create..."
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  rows={4}
                />
              </div>

              {(videoModel === "wan-i2v" || videoModel === "svd" || videoModel === "svd-local") && (
                <div className="space-y-2">
                  <Label>Input Image URL (for image-to-video)</Label>
                  <Input
                    placeholder="https://example.com/image.png"
                    value={inputImageUrl}
                    onChange={(e) => setInputImageUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Provide a URL to an image to animate
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Aspect Ratio</Label>
                <Select value={videoAspectRatio} onValueChange={setVideoAspectRatio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                    <SelectItem value="9:16">9:16 (Portrait/TikTok)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={saveVideoLocally}
                  onCheckedChange={setSaveVideoLocally}
                />
                <Label>Save to server</Label>
              </div>

              <Button
                onClick={generateVideo}
                disabled={
                  generatingVideo || 
                  (!videoPrompt.trim() && !inputImageUrl.trim()) ||
                  ((videoModel === "animatediff" || videoModel === "svd-local") && comfyuiStatus && !comfyuiStatus.online)
                }
                className="w-full"
              >
                {generatingVideo ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating (~30-60s)...
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4 mr-2" />
                    Generate Video
                  </>
                )}
              </Button>

              {(videoModel === "animatediff" || videoModel === "svd-local") && comfyuiStatus && !comfyuiStatus.online && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  ComfyUI is offline - local video generation unavailable. Switch to cloud model or start ComfyUI.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                {videoModel === "animatediff" || videoModel === "svd-local" ? (
                  <>Local generation via ComfyUI on Windows VM. <strong className="text-green-400">No content restrictions.</strong> Free to use.</>
                ) : (
                  <>Cloud generation via Replicate API. ~5 second clips, 480p quality. Requires REPLICATE_API_TOKEN.</>
                )}
              </p>
            </div>

            <div className="space-y-4">
              <Label>Generated Video</Label>
              <div className="border rounded-lg p-4 min-h-[300px] flex items-center justify-center bg-muted/50">
                {generatingVideo ? (
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto mb-2" />
                    <p className="text-muted-foreground">Creating your video...</p>
                    <p className="text-xs text-muted-foreground mt-1">This takes 30-60 seconds</p>
                  </div>
                ) : generatedVideo?.url ? (
                  <div className="w-full space-y-4">
                    <video
                      src={generatedVideo.url}
                      controls
                      autoPlay
                      loop
                      className="w-full rounded-lg"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {generatedVideo.model} • ~{generatedVideo.duration}s
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => window.open(generatedVideo.url, "_blank")}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Video className="h-16 w-16 mx-auto mb-2 opacity-50" />
                    <p>Your generated video will appear here</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="chat" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="border rounded-lg h-[400px] overflow-y-auto p-4 space-y-4">
                {chatHistory.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Start a conversation with the AI</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-muted"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {sendingChat && (
                  <div className="flex justify-start">
                    <div className="bg-muted p-3 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                />
                <Button onClick={sendChatMessage} disabled={sendingChat}>
                  Send
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 border rounded-lg space-y-4">
                <h3 className="font-medium">Settings</h3>
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select value={chatProvider} onValueChange={setChatProvider}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (Best Available)</SelectItem>
                      <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                      <SelectItem value="ollama">Ollama (Local)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setChatHistory([])}
                >
                  Clear History
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="content" className="mt-6">
          <div className="text-center py-12">
            <Wand2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Content Generator</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Generate stream titles, social posts, video descriptions, and more.
              Available through the Stream Bot dashboard.
            </p>
            <Button className="mt-4" variant="outline" asChild>
              <a href="/ai">Go to Jarvis AI</a>
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="models" className="mt-6">
          <ModelManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
