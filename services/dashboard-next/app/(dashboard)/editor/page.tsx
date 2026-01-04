"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Save,
  RefreshCw,
  X,
  Plus,
  Search,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  ),
});

interface FileNode {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: FileNode[];
  extension?: string;
  size?: number;
}

function getLanguageFromExtension(ext: string): string {
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    py: "python",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    css: "css",
    html: "html",
    sql: "sql",
    env: "plaintext",
    txt: "plaintext",
  };
  return map[ext] || "plaintext";
}

function FileTreeItem({
  node,
  depth = 0,
  selectedPath,
  onSelect,
  expandedPaths,
  onToggle,
}: {
  node: FileNode;
  depth?: number;
  selectedPath: string | null;
  onSelect: (node: FileNode) => void;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <button
        className={cn(
          "flex w-full items-center gap-1 rounded px-2 py-1 text-sm hover:bg-accent",
          isSelected && "bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (node.type === "directory") {
            onToggle(node.path);
          } else {
            onSelect(node);
          }
        }}
      >
        {node.type === "directory" ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <File className="h-4 w-4 shrink-0 text-blue-400" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {node.type === "directory" && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface OpenTab {
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
}

export default function EditorPage() {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const { toast } = useToast();

  const fetchFileTree = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/files");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setFileTree(data.trees || []);
      if (data.trees?.length > 0) {
        setExpandedPaths(new Set([data.trees[0].path]));
      }
    } catch (error) {
      console.error("Failed to fetch file tree:", error);
      toast({
        title: "Error",
        description: "Failed to load file tree",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFileTree();
  }, []);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelectFile = useCallback(async (node: FileNode) => {
    if (node.type !== "file") return;

    const existingTab = openTabs.find((tab) => tab.path === node.path);
    if (existingTab) {
      setActiveTab(node.path);
      return;
    }

    setLoadingFile(true);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(node.path)}`);
      if (!res.ok) throw new Error("Failed to load file");
      const data = await res.json();

      const newTab: OpenTab = {
        path: node.path,
        name: node.name,
        language: getLanguageFromExtension(data.extension || node.extension || "txt"),
        content: data.content || "",
        isDirty: false,
      };

      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTab(node.path);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load file content",
        variant: "destructive",
      });
    } finally {
      setLoadingFile(false);
    }
  }, [openTabs, toast]);

  const handleCloseTab = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenTabs((prev) => prev.filter((tab) => tab.path !== path));
    if (activeTab === path) {
      const remaining = openTabs.filter((tab) => tab.path !== path);
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
    }
  }, [activeTab, openTabs]);

  const handleContentChange = useCallback((value: string | undefined) => {
    if (!activeTab || value === undefined) return;
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.path === activeTab
          ? { ...tab, content: value, isDirty: true }
          : tab
      )
    );
  }, [activeTab]);

  const handleSave = async () => {
    const tab = openTabs.find((t) => t.path === activeTab);
    if (!tab) return;

    setSaving(true);
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: tab.path, content: tab.content }),
      });

      if (!res.ok) throw new Error("Save failed");

      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === activeTab ? { ...t, isDirty: false } : t
        )
      );

      toast({
        title: "Saved",
        description: `${tab.name} saved successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save file",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const activeTabData = openTabs.find((tab) => tab.path === activeTab);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-7rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchFileTree}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={!activeTabData?.isDirty || saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 shrink-0 border-r bg-card overflow-auto">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Explorer</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="p-2">
            {fileTree.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">No files accessible</p>
            ) : (
              fileTree.map((node) => (
                <FileTreeItem
                  key={node.path}
                  node={node}
                  selectedPath={activeTab}
                  onSelect={handleSelectFile}
                  expandedPaths={expandedPaths}
                  onToggle={handleToggle}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {openTabs.length > 0 && (
            <div className="flex border-b bg-card overflow-x-auto">
              {openTabs.map((tab) => (
                <button
                  key={tab.path}
                  className={cn(
                    "flex items-center gap-2 border-r px-3 py-2 text-sm",
                    activeTab === tab.path
                      ? "bg-background"
                      : "bg-card hover:bg-accent"
                  )}
                  onClick={() => setActiveTab(tab.path)}
                >
                  <File className="h-4 w-4" />
                  <span>{tab.name}</span>
                  {tab.isDirty && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                  <button
                    className="ml-1 rounded hover:bg-secondary"
                    onClick={(e) => handleCloseTab(tab.path, e)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {loadingFile ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activeTabData ? (
              <MonacoEditor
                height="100%"
                language={activeTabData.language}
                value={activeTabData.content}
                onChange={handleContentChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <File className="h-16 w-16 mb-4 opacity-20" />
                <p>Select a file to edit</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
