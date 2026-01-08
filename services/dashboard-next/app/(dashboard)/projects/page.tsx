"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderKanban,
  Plus,
  Search,
  MoreVertical,
  ExternalLink,
  Trash2,
  Edit,
  Play,
  Pause,
  GitBranch,
  Clock,
  HardDrive,
  Code2,
  Globe,
  Server,
  Bot,
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FolderOpen,
  Settings,
  Eye,
  Copy,
  Archive,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

type ProjectStatus = "running" | "stopped" | "building" | "error";
type ProjectType = "web" | "api" | "bot" | "service";

interface Project {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  branch: string;
  lastModified: string;
  path: string;
  port?: number;
  memory?: number;
  cpu?: number;
}

const projectTypeConfig: Record<ProjectType, { icon: React.ReactNode; label: string; color: string }> = {
  web: { icon: <Globe className="h-4 w-4" />, label: "Web App", color: "bg-blue-500/20 text-blue-400" },
  api: { icon: <Server className="h-4 w-4" />, label: "API", color: "bg-green-500/20 text-green-400" },
  bot: { icon: <Bot className="h-4 w-4" />, label: "Bot", color: "bg-purple-500/20 text-purple-400" },
  service: { icon: <HardDrive className="h-4 w-4" />, label: "Service", color: "bg-orange-500/20 text-orange-400" },
};

const statusConfig: Record<ProjectStatus, { icon: React.ReactNode; label: string; color: string }> = {
  running: { icon: <CheckCircle2 className="h-3 w-3" />, label: "Running", color: "bg-green-500/20 text-green-400" },
  stopped: { icon: <XCircle className="h-3 w-3" />, label: "Stopped", color: "bg-gray-500/20 text-gray-400" },
  building: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Building", color: "bg-blue-500/20 text-blue-400" },
  error: { icon: <AlertCircle className="h-3 w-3" />, label: "Error", color: "bg-red-500/20 text-red-400" },
};

const defaultProjects: Project[] = [
  {
    id: "1",
    name: "Dashboard Next",
    description: "Main dashboard web application",
    type: "web",
    status: "running",
    branch: "main",
    lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    path: "/services/dashboard-next",
    port: 5000,
    memory: 256,
    cpu: 12,
  },
  {
    id: "2",
    name: "Discord Bot",
    description: "Community management Discord bot",
    type: "bot",
    status: "running",
    branch: "main",
    lastModified: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    path: "/services/discord-bot",
    port: 4000,
    memory: 180,
    cpu: 5,
  },
  {
    id: "3",
    name: "Stream Bot",
    description: "Multi-platform streaming manager",
    type: "api",
    status: "running",
    branch: "main",
    lastModified: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    path: "/services/stream-bot",
    port: 3000,
    memory: 145,
    cpu: 8,
  },
  {
    id: "4",
    name: "Landing Page",
    description: "Marketing website",
    type: "web",
    status: "stopped",
    branch: "develop",
    lastModified: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    path: "/projects/landing",
  },
];

function formatTimeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(defaultProjects);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | ProjectStatus>("all");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    type: "web" as ProjectType,
  });
  const { toast } = useToast();
  const router = useRouter();

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.description.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || project.status === filter;
    return matchesSearch && matchesFilter;
  });

  const runningCount = projects.filter((p) => p.status === "running").length;
  const stoppedCount = projects.filter((p) => p.status === "stopped").length;
  const totalMemory = projects
    .filter((p) => p.status === "running")
    .reduce((acc, p) => acc + (p.memory || 0), 0);

  function toggleProject(project: Project) {
    const newStatus = project.status === "running" ? "stopped" : "running";
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? { ...p, status: newStatus, memory: newStatus === "running" ? Math.floor(Math.random() * 200) + 100 : undefined }
          : p
      )
    );
    toast({
      title: newStatus === "running" ? "Project Started" : "Project Stopped",
      description: `${project.name} is now ${newStatus}`,
    });
  }

  function deleteProject(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    toast({
      title: "Project Deleted",
      description: "Project has been removed",
    });
  }

  function createProject() {
    if (!newProject.name) {
      toast({
        title: "Missing Name",
        description: "Please enter a project name",
        variant: "destructive",
      });
      return;
    }

    const project: Project = {
      id: `project-${Date.now()}`,
      name: newProject.name,
      description: newProject.description || "No description",
      type: newProject.type,
      status: "stopped",
      branch: "main",
      lastModified: new Date().toISOString(),
      path: `/projects/${newProject.name.toLowerCase().replace(/\s+/g, "-")}`,
    };

    setProjects((prev) => [...prev, project]);
    setShowNewDialog(false);
    setNewProject({ name: "", description: "", type: "web" });

    toast({
      title: "Project Created",
      description: `${project.name} has been created`,
    });
  }

  function duplicateProject(project: Project) {
    const newProj: Project = {
      ...project,
      id: `project-${Date.now()}`,
      name: `${project.name} (Copy)`,
      status: "stopped",
      lastModified: new Date().toISOString(),
      memory: undefined,
      cpu: undefined,
    };
    setProjects((prev) => [...prev, newProj]);
    toast({
      title: "Project Duplicated",
      description: `Created copy of ${project.name}`,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500">
            <FolderKanban className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-muted-foreground">
              Manage and organize your development projects
            </p>
          </div>
        </div>

        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Set up a new development project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input
                  placeholder="My Awesome Project"
                  value={newProject.name}
                  onChange={(e) =>
                    setNewProject((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  placeholder="A brief description of your project"
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Project Type</Label>
                <Select
                  value={newProject.type}
                  onValueChange={(v: ProjectType) =>
                    setNewProject((p) => ({ ...p, type: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(projectTypeConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          {config.icon}
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createProject}>Create Project</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Running</div>
              <Badge className="bg-green-500/20 text-green-400">{runningCount}</Badge>
            </div>
            <div className="text-2xl font-bold mt-1">{runningCount} Projects</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Stopped</div>
              <Badge variant="secondary">{stoppedCount}</Badge>
            </div>
            <div className="text-2xl font-bold mt-1">{stoppedCount} Projects</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Memory Usage</div>
              <Badge className="bg-blue-500/20 text-blue-400">{totalMemory} MB</Badge>
            </div>
            <Progress value={(totalMemory / 1024) * 100} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(["all", "running", "stopped", "error"] as const).map((status) => (
            <Button
              key={status}
              variant={filter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProjects.map((project) => (
          <Card key={project.id} className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${projectTypeConfig[project.type].color}`}>
                    {projectTypeConfig[project.type].icon}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {project.path}
                    </CardDescription>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push("/editor")}>
                      <Code2 className="h-4 w-4 mr-2" />
                      Open in Editor
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/terminal")}>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Open Terminal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/pipelines")}>
                      <Rocket className="h-4 w-4 mr-2" />
                      Deploy
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => duplicateProject(project)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Archive className="h-4 w-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-400"
                      onClick={() => deleteProject(project.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {project.description}
              </p>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {project.branch}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeAgo(project.lastModified)}
                  </span>
                </div>
                <Badge className={statusConfig[project.status].color}>
                  {statusConfig[project.status].icon}
                  <span className="ml-1">{statusConfig[project.status].label}</span>
                </Badge>
              </div>

              {project.status === "running" && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {project.port && (
                    <span>Port: {project.port}</span>
                  )}
                  {project.memory && (
                    <span>RAM: {project.memory}MB</span>
                  )}
                  {project.cpu && (
                    <span>CPU: {project.cpu}%</span>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  variant={project.status === "running" ? "destructive" : "default"}
                  onClick={() => toggleProject(project)}
                >
                  {project.status === "running" ? (
                    <>
                      <Pause className="h-4 w-4" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start
                    </>
                  )}
                </Button>
                {project.status === "running" && project.port && (
                  <Button variant="outline" size="icon">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredProjects.length === 0 && (
        <div className="py-12 text-center">
          <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No projects found</p>
          <Button
            className="mt-4"
            onClick={() => setShowNewDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Project
          </Button>
        </div>
      )}
    </div>
  );
}
