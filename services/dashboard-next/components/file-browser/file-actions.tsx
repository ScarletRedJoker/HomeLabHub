"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Download,
  FolderPlus,
  Trash2,
  Pencil,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface FileActionsProps {
  selectedFiles: string[];
  currentPath: string;
  serverId: string;
  onRefresh: () => void;
  onAction: (action: string, data?: any) => Promise<void>;
  loading?: boolean;
}

export function FileActions({
  selectedFiles,
  currentPath,
  serverId,
  onRefresh,
  onAction,
  loading,
}: FileActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newName, setNewName] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const hasSelection = selectedFiles.length > 0;
  const singleSelection = selectedFiles.length === 1;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setActionLoading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("server", serverId);
        formData.append("action", "upload");
        formData.append("path", currentPath);
        formData.append("file", file);

        await fetch("/api/sftp", {
          method: "POST",
          body: formData,
        });
      }
      onRefresh();
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setActionLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownload = async () => {
    if (!singleSelection) return;
    const filePath = selectedFiles[0];
    
    const url = `/api/sftp?server=${serverId}&path=${encodeURIComponent(filePath)}&action=download`;
    const link = document.createElement("a");
    link.href = url;
    link.download = filePath.split("/").pop() || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return;
    
    setActionLoading(true);
    try {
      await onAction("mkdir", { name: newFolderName });
      setNewFolderOpen(false);
      setNewFolderName("");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRename = async () => {
    if (!newName.trim() || !singleSelection) return;
    
    setActionLoading(true);
    try {
      await onAction("rename", { path: selectedFiles[0], newName });
      setRenameOpen(false);
      setNewName("");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!hasSelection) return;
    
    setActionLoading(true);
    try {
      for (const path of selectedFiles) {
        await onAction("delete", { path });
      }
      setDeleteOpen(false);
    } finally {
      setActionLoading(false);
    }
  };

  const openRename = () => {
    if (singleSelection) {
      const currentName = selectedFiles[0].split("/").pop() || "";
      setNewName(currentName);
      setRenameOpen(true);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <Button
          variant="outline"
          size="sm"
          onClick={handleUploadClick}
          disabled={loading || actionLoading}
        >
          {actionLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Upload
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={!singleSelection || loading}
        >
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setNewFolderOpen(true)}
          disabled={loading}
        >
          <FolderPlus className="mr-2 h-4 w-4" />
          New Folder
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={openRename}
          disabled={!singleSelection || loading}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          disabled={!hasSelection || loading}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New Folder"
              className="mt-2"
              onKeyDown={(e) => e.key === "Enter" && handleNewFolder()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleNewFolder} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              Enter a new name
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-name">New Name</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-2"
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Files</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedFiles.length} item(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
