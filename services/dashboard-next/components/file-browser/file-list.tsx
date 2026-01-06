"use client";

import { Folder, File, FileText, FileCode, FileImage, FileVideo, FileAudio, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileItem {
  name: string;
  path: string;
  type: "directory" | "file";
  size?: number;
  modifyTime?: number;
  accessTime?: number;
  rights?: { user: string; group: string; other: string };
  owner?: number;
  group?: number;
}

interface FileListProps {
  files: FileItem[];
  selectedFiles: string[];
  onSelect: (path: string, multiSelect?: boolean) => void;
  onNavigate: (path: string) => void;
  onPreview: (file: FileItem) => void;
  loading?: boolean;
}

function getFileIcon(file: FileItem) {
  if (file.type === "directory") {
    return <Folder className="h-5 w-5 text-yellow-500" />;
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "py":
    case "go":
    case "rs":
    case "java":
    case "c":
    case "cpp":
    case "h":
    case "sh":
    case "bash":
    case "zsh":
      return <FileCode className="h-5 w-5 text-blue-500" />;
    case "md":
    case "txt":
    case "log":
    case "json":
    case "yaml":
    case "yml":
    case "xml":
    case "html":
    case "css":
    case "env":
    case "conf":
    case "cfg":
    case "ini":
      return <FileText className="h-5 w-5 text-gray-500" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
    case "ico":
      return <FileImage className="h-5 w-5 text-purple-500" />;
    case "mp4":
    case "mkv":
    case "avi":
    case "mov":
    case "webm":
      return <FileVideo className="h-5 w-5 text-red-500" />;
    case "mp3":
    case "wav":
    case "flac":
    case "ogg":
      return <FileAudio className="h-5 w-5 text-green-500" />;
    default:
      return <File className="h-5 w-5 text-gray-400" />;
  }
}

function formatSize(bytes?: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString();
}

function isPreviewable(file: FileItem): boolean {
  if (file.type === "directory") return false;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const previewableExts = [
    "js", "ts", "jsx", "tsx", "py", "go", "rs", "java", "c", "cpp", "h",
    "md", "txt", "log", "json", "yaml", "yml", "xml", "html", "css",
    "sh", "bash", "zsh", "env", "conf", "cfg", "ini", "toml", "sql"
  ];
  return previewableExts.includes(ext || "");
}

export function FileList({ files, selectedFiles, onSelect, onNavigate, onPreview, loading }: FileListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Folder className="h-12 w-12 mb-4 opacity-50" />
        <p>This directory is empty</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50 text-sm">
          <tr>
            <th className="w-8 px-3 py-2"></th>
            <th className="text-left px-3 py-2 font-medium">Name</th>
            <th className="text-right px-3 py-2 font-medium w-24">Size</th>
            <th className="text-right px-3 py-2 font-medium w-44 hidden md:table-cell">Modified</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {files.map((file) => {
            const isSelected = selectedFiles.includes(file.path);
            const canPreview = isPreviewable(file);

            return (
              <tr
                key={file.path}
                className={cn(
                  "group cursor-pointer transition-colors",
                  isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                )}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    onSelect(file.path, true);
                  } else {
                    onSelect(file.path, false);
                  }
                }}
                onDoubleClick={() => {
                  if (file.type === "directory") {
                    onNavigate(file.path);
                  } else if (canPreview) {
                    onPreview(file);
                  }
                }}
              >
                <td className="px-3 py-2">
                  <div
                    className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30 group-hover:border-muted-foreground/50"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {getFileIcon(file)}
                    <span className="truncate">{file.name}</span>
                    {file.type === "directory" && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-sm text-muted-foreground">
                  {file.type === "directory" ? "-" : formatSize(file.size)}
                </td>
                <td className="px-3 py-2 text-right text-sm text-muted-foreground hidden md:table-cell">
                  {formatDate(file.modifyTime)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
