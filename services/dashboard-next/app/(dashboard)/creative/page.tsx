"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";

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
}

export default function CreativeStudioPage() {
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("image");

  const [imagePrompt, setImagePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [imageSize, setImageSize] = useState("1024x1024");
  const [imageStyle, setImageStyle] = useState("vivid");
  const [imageProvider, setImageProvider] = useState("openai");
  const [saveLocally, setSaveLocally] = useState(true);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);

  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [chatProvider, setChatProvider] = useState("auto");
  const [sendingChat, setSendingChat] = useState(false);

  useEffect(() => {
    fetchAIStatus();
  }, []);

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
          saveLocally,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedImage(data);
      } else {
        const error = await res.json();
        alert(`Error: ${error.details || error.error}`);
      }
    } catch (error: any) {
      alert(`Failed to generate image: ${error.message}`);
    } finally {
      setGeneratingImage(false);
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
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-500" />
            Creative Studio
          </h1>
          <p className="text-muted-foreground">
            AI-powered content creation for next-gen creators
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAIStatus}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Status
        </Button>
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-md">
          <TabsTrigger value="image" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Images
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

                <Select value={imageProvider} onValueChange={setImageProvider}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">DALL-E 3</SelectItem>
                    <SelectItem value="stable-diffusion" disabled>
                      Stable Diffusion
                    </SelectItem>
                  </SelectContent>
                </Select>
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
                        onClick={() => window.open(generatedImage.url, "_blank")}
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

        <TabsContent value="video" className="mt-6">
          <div className="text-center py-12">
            <Video className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Video Generation Coming Soon</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              AI video generation with Runway, Luma, and self-hosted options is on the roadmap.
              Create short-form content, stream intros, and social clips with AI.
            </p>
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
      </Tabs>
    </div>
  );
}
