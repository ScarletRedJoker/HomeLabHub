"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  Music,
  Video,
  Loader2,
  Trash2,
  Copy,
  Play,
  Magnet,
  FileText,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MediaFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: "audio" | "video" | "other";
}

interface Torrent {
  name: string;
  progress: number;
  status: "downloading" | "seeding" | "paused" | "stopped" | "completed";
  size: number;
  downloaded: number;
  uploadSpeed: number;
  downloadSpeed: number;
}

export default function MediaLibraryPage() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [downloadType, setDownloadType] = useState<"audio" | "video">("audio");
  const [isDownloading, setIsDownloading] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [isLoadingTorrents, setIsLoadingTorrents] = useState(false);
  const [magnetLink, setMagnetLink] = useState("");
  const [isTorrentLoading, setIsTorrentLoading] = useState(false);

  // Load media files
  useEffect(() => {
    loadMediaFiles();
    const interval = setInterval(loadMediaFiles, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadMediaFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch("/api/media/youtube?action=list");
      const data = await response.json();
      setMediaFiles(data.files || []);
    } catch (error) {
      console.error("Failed to load media files:", error);
      toast.error("Failed to load media files");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const loadTorrents = async () => {
    setIsLoadingTorrents(true);
    try {
      const response = await fetch("/api/media/torrent?action=list");
      const data = await response.json();
      setTorrents(data.torrents || []);
    } catch (error) {
      console.error("Failed to load torrents:", error);
      toast.error("Failed to load torrents");
    } finally {
      setIsLoadingTorrents(false);
    }
  };

  const handleYoutubeDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    setIsDownloading(true);
    try {
      const response = await fetch("/api/media/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl,
          type: downloadType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Download failed");
      }

      toast.success(`${downloadType} downloaded: ${data.filename}`);
      setYoutubeUrl("");
      await loadMediaFiles();
    } catch (error: any) {
      toast.error(error.message || "Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAddTorrent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magnetLink.trim()) {
      toast.error("Please enter a magnet link");
      return;
    }

    setIsTorrentLoading(true);
    try {
      const response = await fetch("/api/media/torrent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          magnet: magnetLink,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add torrent");
      }

      toast.success("Torrent added successfully");
      setMagnetLink("");
      await loadTorrents();
    } catch (error: any) {
      toast.error(error.message || "Failed to add torrent");
    } finally {
      setIsTorrentLoading(false);
    }
  };

  const handleRemoveTorrent = async (hash: string) => {
    try {
      const response = await fetch(`/api/media/torrent?action=remove&hash=${hash}`, {
        method: "GET",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove torrent");
      }

      toast.success("Torrent removed");
      await loadTorrents();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove torrent");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Media Library</h1>
        <p className="text-gray-600 mt-2">Download and manage media files from YouTube and torrents</p>
      </div>

      <Tabs defaultValue="youtube" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="youtube">YouTube Download</TabsTrigger>
          <TabsTrigger value="torrents">Torrents</TabsTrigger>
          <TabsTrigger value="library">Media Library</TabsTrigger>
        </TabsList>

        <TabsContent value="youtube" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-4">Download from YouTube</h2>
                <form onSubmit={handleYoutubeDownload} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">YouTube URL</label>
                    <Input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      disabled={isDownloading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Download Type</label>
                    <Select value={downloadType} onValueChange={(v) => setDownloadType(v as "audio" | "video")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="audio">
                          <div className="flex items-center gap-2">
                            <Music className="w-4 h-4" />
                            Audio (MP3)
                          </div>
                        </SelectItem>
                        <SelectItem value="video">
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4" />
                            Video (MP4)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="submit"
                    disabled={isDownloading}
                    className="w-full"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="torrents" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-4">Add Torrent</h2>
                <form onSubmit={handleAddTorrent} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Magnet Link</label>
                    <Input
                      type="text"
                      placeholder="magnet:?xt=urn:btih:..."
                      value={magnetLink}
                      onChange={(e) => setMagnetLink(e.target.value)}
                      disabled={isTorrentLoading}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isTorrentLoading}
                    className="w-full"
                  >
                    {isTorrentLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Magnet className="w-4 h-4 mr-2" />
                        Add Torrent
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Active Torrents</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTorrents}
                  disabled={isLoadingTorrents}
                >
                  {isLoadingTorrents ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Refresh"
                  )}
                </Button>
              </div>

              {torrents.length === 0 ? (
                <p className="text-gray-500 py-8 text-center">No active torrents</p>
              ) : (
                <div className="space-y-3">
                  {torrents.map((torrent, idx) => (
                    <div key={idx} className="border rounded p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium truncate">{torrent.name}</p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(torrent.downloaded)} / {formatFileSize(torrent.size)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTorrent(idx.toString())}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>{torrent.progress}%</span>
                          <span className="text-gray-500">{torrent.status}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${torrent.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>↓ {formatFileSize(torrent.downloadSpeed)}/s</span>
                          <span>↑ {formatFileSize(torrent.uploadSpeed)}/s</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="library" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Downloaded Files</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMediaFiles}
                  disabled={isLoadingFiles}
                >
                  {isLoadingFiles ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Refresh"
                  )}
                </Button>
              </div>

              {mediaFiles.length === 0 ? (
                <p className="text-gray-500 py-8 text-center">No media files downloaded yet</p>
              ) : (
                <div className="space-y-3">
                  {mediaFiles.map((file, idx) => (
                    <div key={idx} className="border rounded p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {file.type === "audio" ? (
                          <Music className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        ) : file.type === "video" ? (
                          <Video className="w-5 h-5 text-purple-600 flex-shrink-0" />
                        ) : (
                          <FileText className="w-5 h-5 text-gray-600 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{file.name}</p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(file.size)} • {formatDate(file.modified)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button variant="ghost" size="sm" title="Copy path">
                          <Copy
                            className="w-4 h-4"
                            onClick={() => {
                              navigator.clipboard.writeText(file.path);
                              toast.success("Path copied");
                            }}
                          />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
