"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Download,
  Loader2,
  RefreshCw,
  Star,
  ExternalLink,
  Image as ImageIcon,
  Box,
  Trash2,
  HardDrive,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Pause,
  Play,
  LayoutGrid,
  Clock,
  Filter,
  Eye,
  EyeOff,
  Sparkles,
  Cpu,
  Layers,
  Palette,
  SlidersHorizontal,
  TrendingUp,
  Users,
  FileImage,
  Package,
} from "lucide-react";

interface MarketplaceModel {
  id: string;
  name: string;
  description: string;
  type: string;
  source: "civitai" | "huggingface";
  sourceId: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  creator: string;
  downloads: number;
  rating: number | null;
  ratingCount: number;
  tags: string[];
  nsfw: boolean;
  fileSize: number | null;
  fileSizeFormatted: string | null;
  version: string | null;
  downloadUrl: string | null;
}

interface ModelVersion {
  id: string;
  name: string;
  downloadUrl: string;
  files: {
    id: string;
    name: string;
    size: number;
    sizeFormatted: string;
    type: string;
    primary: boolean;
    checksum?: string;
  }[];
  images: { url: string; nsfw: boolean }[];
  createdAt: string;
}

interface ModelDetails {
  id: string;
  name: string;
  description: string;
  type: string;
  source: "civitai" | "huggingface";
  sourceId: string;
  sourceUrl: string;
  creator: string;
  downloads: number;
  rating: number | null;
  ratingCount: number;
  tags: string[];
  nsfw: boolean;
  license: string | null;
  versions: ModelVersion[];
  sampleImages: string[];
}

interface InstalledModel {
  id: string;
  name: string;
  type: string;
  source: string;
  installedPath: string | null;
  fileSize: string | null;
  fileSizeFormatted: string | null;
  nodeId: string | null;
  status: string;
  lastUsed: string | null;
  useCount: number;
  thumbnailUrl?: string | null;
}

interface ActiveDownload {
  id: string;
  url: string;
  filename: string;
  type: string;
  status: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed?: number;
  eta?: number;
  error?: string;
  startedAt?: string;
}

interface TypeFilter {
  id: string;
  name: string;
  count: number;
}

const typeIcons: Record<string, React.ReactNode> = {
  checkpoint: <Cpu className="h-4 w-4" />,
  lora: <Layers className="h-4 w-4" />,
  embedding: <FileImage className="h-4 w-4" />,
  controlnet: <SlidersHorizontal className="h-4 w-4" />,
  vae: <Palette className="h-4 w-4" />,
};

const typeColors: Record<string, string> = {
  checkpoint: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  lora: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  embedding: "bg-green-500/10 text-green-500 border-green-500/20",
  controlnet: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  vae: "bg-pink-500/10 text-pink-500 border-pink-500/20",
};

const sourceColors: Record<string, string> = {
  civitai: "bg-blue-600/10 text-blue-600 border-blue-600/20",
  huggingface: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  local: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${bytesPerSecond} B/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default function ModelMarketplacePage() {
  const [activeTab, setActiveTab] = useState<"browse" | "downloads" | "installed">("browse");
  const [models, setModels] = useState<MarketplaceModel[]>([]);
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  const [types, setTypes] = useState<TypeFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");
  const [showNsfw, setShowNsfw] = useState(false);
  const [sortBy, setSortBy] = useState("downloads");
  
  const [selectedModel, setSelectedModel] = useState<ModelDetails | null>(null);
  const [modelDetailsLoading, setModelDetailsLoading] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});

  const searchMarketplace = useCallback(async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("query", searchQuery);
      if (selectedType !== "all") params.set("type", selectedType);
      if (selectedSource !== "all") params.set("source", selectedSource);
      params.set("sort", sortBy);
      params.set("nsfw", String(showNsfw));
      params.set("limit", "30");

      const res = await fetch(`/api/models/marketplace?${params}`);
      if (!res.ok) throw new Error("Search failed");

      const data = await res.json();
      setModels(data.models || []);
      setTypes(data.types || []);
      
      if (data.errors?.length) {
        data.errors.forEach((err: string) => toast.warning(err));
      }
    } catch (error: any) {
      console.error("Search error:", error);
      toast.error("Failed to search marketplace");
    } finally {
      setSearching(false);
      setLoading(false);
    }
  }, [searchQuery, selectedType, selectedSource, sortBy, showNsfw]);

  const fetchInstalled = async () => {
    try {
      const res = await fetch("/api/models/installed");
      if (!res.ok) throw new Error("Failed to fetch installed");
      const data = await res.json();
      setInstalledModels(data.models || []);
    } catch (error) {
      console.error("Fetch installed error:", error);
    }
  };

  const fetchDownloads = async () => {
    try {
      const res = await fetch("/api/models/download");
      if (!res.ok) return;
      const data = await res.json();
      setActiveDownloads(data.downloads || []);
    } catch (error) {
      console.error("Fetch downloads error:", error);
    }
  };

  useEffect(() => {
    searchMarketplace();
    fetchInstalled();
    fetchDownloads();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchMarketplace();
    }, 500);
    return () => clearTimeout(debounce);
  }, [searchQuery, selectedType, selectedSource, sortBy, showNsfw]);

  useEffect(() => {
    const interval = setInterval(fetchDownloads, 3000);
    return () => clearInterval(interval);
  }, []);

  const openModelDetails = async (model: MarketplaceModel) => {
    setShowDetailsDialog(true);
    setModelDetailsLoading(true);
    setSelectedModel(null);
    setSelectedVersion("");
    setSelectedFile("");

    try {
      const res = await fetch(`/api/models/marketplace/${model.source}/${model.sourceId}`);
      if (!res.ok) throw new Error("Failed to fetch details");
      
      const details: ModelDetails = await res.json();
      setSelectedModel(details);
      
      if (details.versions?.length > 0) {
        setSelectedVersion(details.versions[0].id);
        const primaryFile = details.versions[0].files?.find(f => f.primary);
        if (primaryFile) setSelectedFile(primaryFile.id);
      }
    } catch (error) {
      toast.error("Failed to load model details");
      setShowDetailsDialog(false);
    } finally {
      setModelDetailsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedModel) return;
    
    const version = selectedModel.versions.find(v => v.id === selectedVersion);
    const file = version?.files.find(f => f.id === selectedFile);
    
    if (!version?.downloadUrl && !file) {
      toast.error("No download URL available");
      return;
    }

    setDownloading(true);
    try {
      const downloadUrl = file 
        ? `https://civitai.com/api/download/models/${version.id}?type=${file.type}&format=SafeTensor`
        : version.downloadUrl;

      const res = await fetch("/api/models/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: downloadUrl,
          type: selectedModel.type,
          filename: file?.name,
          metadata: {
            modelId: selectedModel.id,
            name: selectedModel.name,
            source: selectedModel.source,
            sourceId: selectedModel.sourceId,
            version: version.name,
            checksum: file?.checksum,
          },
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Download failed");
      }

      toast.success(`Download started: ${selectedModel.name}`);
      setShowDetailsDialog(false);
      fetchDownloads();
      setActiveTab("downloads");
    } catch (error: any) {
      toast.error(error.message || "Failed to start download");
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteModel = async (model: InstalledModel) => {
    if (!confirm(`Delete ${model.name}? This cannot be undone.`)) return;

    try {
      const res = await fetch("/api/models/installed", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          modelId: model.id,
          path: model.installedPath,
        }),
      });

      if (!res.ok) throw new Error("Delete failed");
      
      toast.success(`Deleted ${model.name}`);
      fetchInstalled();
    } catch (error) {
      toast.error("Failed to delete model");
    }
  };

  const getCurrentVersion = () => {
    if (!selectedModel) return null;
    return selectedModel.versions.find(v => v.id === selectedVersion);
  };

  const getCurrentFile = () => {
    const version = getCurrentVersion();
    if (!version) return null;
    return version.files.find(f => f.id === selectedFile);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-purple-500" />
            AI Model Marketplace
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Browse and download models from Civitai and HuggingFace
          </p>
        </div>
        <Button 
          onClick={() => { searchMarketplace(); fetchInstalled(); fetchDownloads(); }} 
          variant="outline" 
          size="sm"
          disabled={searching}
        >
          {searching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="browse" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Browse
          </TabsTrigger>
          <TabsTrigger value="downloads" className="gap-2">
            <Download className="h-4 w-4" />
            Downloads
            {activeDownloads.filter(d => d.status === "downloading").length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center">
                {activeDownloads.filter(d => d.status === "downloading").length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="installed" className="gap-2">
            <HardDrive className="h-4 w-4" />
            Installed ({installedModels.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-6 mt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="civitai">Civitai</SelectItem>
                  <SelectItem value="huggingface">HuggingFace</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="downloads">Most Downloads</SelectItem>
                  <SelectItem value="rating">Highest Rated</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
                <Switch
                  checked={showNsfw}
                  onCheckedChange={setShowNsfw}
                  id="nsfw-toggle"
                />
                <Label htmlFor="nsfw-toggle" className="text-sm cursor-pointer">
                  {showNsfw ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Label>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : models.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No models found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try a different search or filter
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {models.map((model) => (
                <Card
                  key={model.id}
                  className="group overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-primary/50 cursor-pointer"
                  onClick={() => openModelDetails(model)}
                >
                  <div className="aspect-video relative bg-muted overflow-hidden">
                    {model.thumbnailUrl && !imageError[model.id] ? (
                      <img
                        src={model.thumbnailUrl}
                        alt={model.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={() => setImageError(prev => ({ ...prev, [model.id]: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
                      </div>
                    )}
                    {model.nsfw && (
                      <Badge className="absolute top-2 left-2 bg-red-500">NSFW</Badge>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Badge variant="secondary" className={typeColors[model.type]}>
                        {typeIcons[model.type]}
                        <span className="ml-1 capitalize">{model.type}</span>
                      </Badge>
                    </div>
                    <div className="absolute bottom-2 right-2">
                      <Badge variant="secondary" className={sourceColors[model.source]}>
                        {model.source === "civitai" ? "Civitai" : "HuggingFace"}
                      </Badge>
                    </div>
                  </div>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base line-clamp-1">{model.name}</CardTitle>
                    <CardDescription className="text-xs flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      {model.creator}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {formatNumber(model.downloads)}
                      </span>
                      {model.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                          {model.rating.toFixed(1)}
                        </span>
                      )}
                      {model.fileSizeFormatted && (
                        <span>{model.fileSizeFormatted}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="downloads" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Active Downloads
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeDownloads.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Download className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No active downloads</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeDownloads.map((download) => (
                    <div
                      key={download.id}
                      className="p-4 border rounded-lg space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{download.filename}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline" className={typeColors[download.type]}>
                              {download.type}
                            </Badge>
                            <span>
                              {download.status === "downloading" && (
                                <span className="flex items-center gap-1 text-blue-500">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Downloading
                                </span>
                              )}
                              {download.status === "completed" && (
                                <span className="flex items-center gap-1 text-green-500">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Completed
                                </span>
                              )}
                              {download.status === "failed" && (
                                <span className="flex items-center gap-1 text-red-500">
                                  <XCircle className="h-3 w-3" />
                                  Failed
                                </span>
                              )}
                              {download.status === "pending" && (
                                <span className="flex items-center gap-1 text-yellow-500">
                                  <Clock className="h-3 w-3" />
                                  Pending
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                        {download.status === "downloading" && (
                          <div className="text-right text-sm text-muted-foreground">
                            {download.speed && <p>{formatSpeed(download.speed)}</p>}
                            {download.eta && <p>ETA: {formatEta(download.eta)}</p>}
                          </div>
                        )}
                      </div>
                      
                      {download.status === "downloading" && (
                        <div className="space-y-1">
                          <Progress value={download.progress} />
                          <p className="text-xs text-muted-foreground text-right">
                            {download.progress}%
                          </p>
                        </div>
                      )}

                      {download.error && (
                        <p className="text-sm text-red-500">{download.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="installed" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Installed Models
              </CardTitle>
              <CardDescription>
                Models installed on your nodes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {installedModels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Box className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No models installed</p>
                  <p className="text-sm mt-1">Download models from the Browse tab</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {installedModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                          {typeIcons[model.type] || <Box className="h-5 w-5" />}
                        </div>
                        <div>
                          <p className="font-medium">{model.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline" className={typeColors[model.type]}>
                              {model.type}
                            </Badge>
                            <Badge variant="outline" className={sourceColors[model.source]}>
                              {model.source}
                            </Badge>
                            {model.fileSizeFormatted && (
                              <span>{model.fileSizeFormatted}</span>
                            )}
                            {model.nodeId && (
                              <span className="flex items-center gap-1">
                                <Cpu className="h-3 w-3" />
                                {model.nodeId}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            toast.info("Sync feature coming soon");
                          }}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteModel(model)}
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
        </TabsContent>
      </Tabs>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          {modelDetailsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : selectedModel ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedModel.name}
                  <Badge variant="outline" className={typeColors[selectedModel.type]}>
                    {selectedModel.type}
                  </Badge>
                  <Badge variant="outline" className={sourceColors[selectedModel.source]}>
                    {selectedModel.source === "civitai" ? "Civitai" : "HuggingFace"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {selectedModel.creator}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="h-4 w-4" />
                    {formatNumber(selectedModel.downloads)} downloads
                  </span>
                  {selectedModel.rating && (
                    <span className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      {selectedModel.rating.toFixed(1)} ({selectedModel.ratingCount})
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-6">
                  {selectedModel.sampleImages.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {selectedModel.sampleImages.slice(0, 4).map((img, idx) => (
                        <img
                          key={idx}
                          src={img}
                          alt={`Sample ${idx + 1}`}
                          className="rounded-lg object-cover aspect-square"
                        />
                      ))}
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedModel.description || "No description available"}
                    </p>
                  </div>

                  {selectedModel.tags.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Tags</h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedModel.tags.slice(0, 15).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Version</Label>
                      <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select version" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedModel.versions.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {getCurrentVersion()?.files && getCurrentVersion()!.files.length > 0 && (
                      <div className="space-y-2">
                        <Label>File</Label>
                        <Select value={selectedFile} onValueChange={setSelectedFile}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select file" />
                          </SelectTrigger>
                          <SelectContent>
                            {getCurrentVersion()!.files.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name} ({f.sizeFormatted})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {getCurrentFile() && (
                    <div className="p-4 bg-muted rounded-lg space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">File Size</span>
                        <span className="font-medium">{getCurrentFile()!.sizeFormatted}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium">{getCurrentFile()!.type}</span>
                      </div>
                      {selectedModel.license && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">License</span>
                          <span className="font-medium">{selectedModel.license}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              <DialogFooter className="flex-shrink-0 pt-4 border-t">
                <Button variant="outline" asChild>
                  <a href={selectedModel.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on {selectedModel.source === "civitai" ? "Civitai" : "HuggingFace"}
                  </a>
                </Button>
                <Button onClick={handleDownload} disabled={downloading}>
                  {downloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
