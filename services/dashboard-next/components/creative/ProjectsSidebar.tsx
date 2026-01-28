"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  FolderOpen,
  Plus,
  Save,
  Trash2,
  MoreVertical,
  Image as ImageIcon,
  Video,
  MessageSquare,
  Clock,
  CheckCircle,
  Loader2,
  PanelLeftOpen,
  CloudOff,
  Cloud,
} from "lucide-react";

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

interface ProjectsSidebarProps {
  currentProjectId?: string | null;
  currentProjectData?: any;
  onProjectLoad?: (project: Project, assets: Asset[]) => void;
  onProjectCreate?: (project: Project) => void;
  onAutoSave?: (projectId: string) => void;
  autoSaveEnabled?: boolean;
  autoSaveInterval?: number;
}

export function ProjectsSidebar({
  currentProjectId,
  currentProjectData,
  onProjectLoad,
  onProjectCreate,
  onAutoSave,
  autoSaveEnabled = true,
  autoSaveInterval = 30000,
}: ProjectsSidebarProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState("image");
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/creative-projects?limit=50");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchProjects();
    }
  }, [open, fetchProjects]);

  useEffect(() => {
    if (autoSaveEnabled && currentProjectId && onAutoSave) {
      autoSaveTimerRef.current = setInterval(() => {
        onAutoSave(currentProjectId);
      }, autoSaveInterval);

      return () => {
        if (autoSaveTimerRef.current) {
          clearInterval(autoSaveTimerRef.current);
        }
      };
    }
  }, [autoSaveEnabled, currentProjectId, autoSaveInterval, onAutoSave]);

  async function createProject() {
    if (!newProjectName.trim()) return;

    try {
      const res = await fetch("/api/creative-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName,
          type: newProjectType,
          data: {},
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProjects((prev) => [data.project, ...prev]);
        onProjectCreate?.(data.project);
        setNewProjectDialogOpen(false);
        setNewProjectName("");
        toast({
          title: "Project Created",
          description: `"${newProjectName}" has been created`,
        });
      } else {
        const error = await res.json();
        toast({
          title: "Failed to Create Project",
          description: error.error || "An error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Failed to Create Project",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  }

  async function loadProject(project: Project) {
    try {
      const res = await fetch(`/api/creative-projects/${project.id}`);
      if (res.ok) {
        const data = await res.json();
        onProjectLoad?.(data.project, data.assets || []);
        setOpen(false);
        toast({
          title: "Project Loaded",
          description: `"${project.name}" has been loaded`,
        });
      }
    } catch (error) {
      toast({
        title: "Failed to Load Project",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  }

  async function deleteProject(projectId: string, projectName: string) {
    try {
      const res = await fetch(`/api/creative-projects/${projectId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        toast({
          title: "Project Deleted",
          description: `"${projectName}" has been deleted`,
        });
      }
    } catch (error) {
      toast({
        title: "Failed to Delete Project",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  }

  async function saveCurrentProject() {
    if (!currentProjectId || !currentProjectData) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/creative-projects/${currentProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentProjectData),
      });

      if (res.ok) {
        setLastSaved(new Date());
        toast({
          title: "Project Saved",
          description: "Your changes have been saved",
        });
        fetchProjects();
      }
    } catch (error) {
      toast({
        title: "Failed to Save",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case "image":
        return <ImageIcon className="h-4 w-4 text-pink-500" />;
      case "video":
        return <Video className="h-4 w-4 text-purple-500" />;
      case "chat":
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      default:
        return <FolderOpen className="h-4 w-4 text-gray-500" />;
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <PanelLeftOpen className="h-4 w-4" />
          Projects
          {currentProjectId && (
            <span className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : lastSaved ? (
                <CheckCircle className="h-3 w-3 text-green-500" />
              ) : (
                <Cloud className="h-3 w-3" />
              )}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              My Projects
            </span>
            <Dialog open={newProjectDialogOpen} onOpenChange={setNewProjectDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Project</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Project Name</label>
                    <Input
                      placeholder="My Creative Project"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createProject()}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Project Type</label>
                    <div className="flex gap-2">
                      {["image", "video", "chat"].map((type) => (
                        <Button
                          key={type}
                          variant={newProjectType === type ? "default" : "outline"}
                          size="sm"
                          onClick={() => setNewProjectType(type)}
                          className="flex-1 gap-2"
                        >
                          {getTypeIcon(type)}
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={createProject} disabled={!newProjectName.trim()}>
                    Create Project
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </SheetTitle>
        </SheetHeader>

        {currentProjectId && (
          <div className="p-3 border-b bg-muted/50">
            <Button
              variant="secondary"
              size="sm"
              className="w-full gap-2"
              onClick={saveCurrentProject}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Current Project
            </Button>
            {lastSaved && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Last saved: {formatDate(lastSaved.toISOString())}
              </p>
            )}
          </div>
        )}

        <ScrollArea className="h-[calc(100vh-180px)]">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <CloudOff className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">No projects yet</p>
              <Button
                variant="link"
                size="sm"
                onClick={() => setNewProjectDialogOpen(true)}
              >
                Create your first project
              </Button>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={`group flex items-center gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors ${
                    currentProjectId === project.id ? "bg-accent" : ""
                  }`}
                  onClick={() => loadProject(project)}
                >
                  {project.thumbnail ? (
                    <img
                      src={project.thumbnail}
                      alt={project.name}
                      className="w-12 h-12 rounded object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                      {getTypeIcon(project.type)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(project.updatedAt)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProject(project.id, project.name);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
