"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { FileList, FileItem } from "@/components/file-browser/file-list";
import { FileActions } from "@/components/file-browser/file-actions";
import {
  HardDrive,
  Home,
  ChevronRight,
  Loader2,
  FolderOpen,
  X,
} from "lucide-react";

interface ServerInfo {
  id: string;
  name: string;
  basePath: string;
}

export default function RemoteFilesPage() {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("");
  const [basePath, setBasePath] = useState<string>("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string; extension: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const res = await fetch("/api/sftp");
      if (!res.ok) throw new Error("Failed to fetch servers");
      const data = await res.json();
      setServers(data.servers || []);
      if (data.servers?.length > 0) {
        const first = data.servers[0];
        setSelectedServer(first.id);
        setBasePath(first.basePath);
        setCurrentPath(first.basePath);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch servers",
        variant: "destructive",
      });
    }
  };

  const fetchFiles = useCallback(async (path: string) => {
    if (!selectedServer) return;
    
    setLoading(true);
    setSelectedFiles([]);
    try {
      const res = await fetch(
        `/api/sftp?server=${selectedServer}&path=${encodeURIComponent(path)}&action=list`
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || "Failed to fetch files");
      }
      const data = await res.json();
      setFiles(data.files || []);
      setCurrentPath(data.path);
      setBasePath(data.basePath);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch files",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedServer, toast]);

  useEffect(() => {
    if (selectedServer && currentPath) {
      fetchFiles(currentPath);
    }
  }, [selectedServer]);

  const handleServerChange = (serverId: string) => {
    setSelectedServer(serverId);
    const server = servers.find((s) => s.id === serverId);
    if (server) {
      setCurrentPath(server.basePath);
      setBasePath(server.basePath);
      setFiles([]);
      setSelectedFiles([]);
    }
  };

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    fetchFiles(path);
  };

  const handleSelect = (path: string, multiSelect?: boolean) => {
    if (multiSelect) {
      setSelectedFiles((prev) =>
        prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
      );
    } else {
      setSelectedFiles([path]);
    }
  };

  const handlePreview = async (file: FileItem) => {
    try {
      const res = await fetch(
        `/api/sftp?server=${selectedServer}&path=${encodeURIComponent(file.path)}&action=preview`
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || "Failed to preview file");
      }
      const data = await res.json();
      setPreviewFile(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to preview file",
        variant: "destructive",
      });
    }
  };

  const handleAction = async (action: string, data?: any) => {
    const formData = new FormData();
    formData.append("server", selectedServer);
    formData.append("action", action);
    formData.append("path", data?.path || currentPath);
    
    if (data?.name) formData.append("name", data.name);
    if (data?.newName) formData.append("newName", data.newName);

    const res = await fetch("/api/sftp", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.details || error.error || `${action} failed`);
    }

    setSelectedFiles([]);
    await fetchFiles(currentPath);
  };

  const breadcrumbs = currentPath.split("/").filter(Boolean);
  const pathParts = breadcrumbs.map((part, i) => ({
    name: part,
    path: "/" + breadcrumbs.slice(0, i + 1).join("/"),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Remote Files</h1>
          <p className="text-muted-foreground">
            Browse and manage files on remote servers via SFTP
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Select value={selectedServer} onValueChange={handleServerChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      <div className="flex items-center gap-2">
                        {server.id === "linode" ? (
                          <HardDrive className="h-4 w-4" />
                        ) : (
                          <Home className="h-4 w-4" />
                        )}
                        {server.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <FileActions
              selectedFiles={selectedFiles}
              currentPath={currentPath}
              serverId={selectedServer}
              onRefresh={() => fetchFiles(currentPath)}
              onAction={handleAction}
              loading={loading}
            />
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <nav className="flex items-center gap-1 text-sm mb-4 overflow-x-auto pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavigate(basePath)}
              className="shrink-0"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            {pathParts.map((part, i) => (
              <div key={part.path} className="flex items-center">
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleNavigate(part.path)}
                  className="shrink-0"
                >
                  {part.name}
                </Button>
              </div>
            ))}
          </nav>

          <FileList
            files={files}
            selectedFiles={selectedFiles}
            onSelect={handleSelect}
            onNavigate={handleNavigate}
            onPreview={handlePreview}
            loading={loading}
          />

          {selectedFiles.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              {selectedFiles.length} item(s) selected
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="truncate pr-8">
                {previewFile?.path.split("/").pop()}
              </span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">
              <code>{previewFile?.content}</code>
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
