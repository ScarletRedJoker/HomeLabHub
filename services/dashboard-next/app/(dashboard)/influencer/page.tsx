"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Video, Wand2, Calendar, TrendingUp, Play, Plus, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";

interface Persona {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  platforms: string[] | null;
  isActive: boolean;
  createdAt: string;
}

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  pipelineType: string;
  isActive: boolean;
  isScheduled: boolean;
  cronExpression: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  persona: Persona | null;
}

interface VideoProject {
  id: string;
  title: string | null;
  status: string;
  progress: number;
  targetPlatform: string | null;
  createdAt: string;
  persona: Persona | null;
}

export default function InfluencerPipelinePage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [createPersonaOpen, setCreatePersonaOpen] = useState(false);
  const [createPipelineOpen, setCreatePipelineOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [personasRes, pipelinesRes, projectsRes] = await Promise.all([
        fetch("/api/ai/influencer/personas"),
        fetch("/api/ai/influencer/pipelines"),
        fetch("/api/ai/influencer/projects?limit=10"),
      ]);

      if (personasRes.ok) {
        const data = await personasRes.json();
        setPersonas(data.personas || []);
      }
      if (pipelinesRes.ok) {
        const data = await pipelinesRes.json();
        setPipelines(data.pipelines || []);
      }
      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load pipeline data");
    } finally {
      setLoading(false);
    }
  }

  async function executePipeline(pipelineId: string) {
    try {
      const res = await fetch(`/api/ai/influencer/pipelines/${pipelineId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "trending topic" }),
      });
      if (res.ok) {
        toast.success("Pipeline execution started");
        loadData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to execute pipeline");
      }
    } catch (error) {
      toast.error("Failed to execute pipeline");
    }
  }

  const stats = {
    personas: personas.length,
    activePipelines: pipelines.filter((p) => p.isActive).length,
    scheduledPipelines: pipelines.filter((p) => p.isScheduled).length,
    recentProjects: projects.filter((p) => p.status === "generating").length,
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Influencer Pipeline</h1>
          <p className="text-muted-foreground">
            Automated content generation with character consistency and scheduling
          </p>
        </div>
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Personas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.personas}</div>
            <p className="text-xs text-muted-foreground">AI characters defined</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Pipelines</CardTitle>
            <Wand2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activePipelines}</div>
            <p className="text-xs text-muted-foreground">Content generation flows</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduledPipelines}</div>
            <p className="text-xs text-muted-foreground">Automated pipelines</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentProjects}</div>
            <p className="text-xs text-muted-foreground">Generating now</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="personas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="personas">Personas</TabsTrigger>
          <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
          <TabsTrigger value="projects">Video Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="personas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">AI Influencer Personas</h2>
            <Dialog open={createPersonaOpen} onOpenChange={setCreatePersonaOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Persona
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create AI Persona</DialogTitle>
                  <DialogDescription>
                    Define a new AI influencer character with consistent style and personality.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const formData = new FormData(form);
                    try {
                      const res = await fetch("/api/ai/influencer/personas", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: formData.get("name"),
                          displayName: formData.get("displayName"),
                          description: formData.get("description"),
                          stylePrompt: formData.get("stylePrompt"),
                          platforms: formData.get("platforms")?.toString().split(",").map((p) => p.trim()),
                        }),
                      });
                      if (res.ok) {
                        toast.success("Persona created");
                        setCreatePersonaOpen(false);
                        loadData();
                      } else {
                        const data = await res.json();
                        toast.error(data.error || "Failed to create persona");
                      }
                    } catch {
                      toast.error("Failed to create persona");
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" placeholder="unique_identifier" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input id="displayName" name="displayName" placeholder="Friendly Name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" placeholder="Character description..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stylePrompt">Style Prompt</Label>
                    <Textarea
                      id="stylePrompt"
                      name="stylePrompt"
                      placeholder="Base prompt for consistent visual style..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platforms">Platforms (comma-separated)</Label>
                    <Input id="platforms" name="platforms" placeholder="youtube, tiktok, instagram" />
                  </div>
                  <DialogFooter>
                    <Button type="submit">Create Persona</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {personas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No personas created yet. Create your first AI influencer persona to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {personas.map((persona) => (
                <Card key={persona.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{persona.displayName || persona.name}</CardTitle>
                      <Badge variant={persona.isActive ? "default" : "secondary"}>
                        {persona.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <CardDescription>{persona.description || "No description"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {persona.platforms?.map((platform) => (
                        <Badge key={platform} variant="outline" className="text-xs">
                          {platform}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pipelines" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Content Pipelines</h2>
            <Dialog open={createPipelineOpen} onOpenChange={setCreatePipelineOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Pipeline
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Content Pipeline</DialogTitle>
                  <DialogDescription>
                    Define an automated workflow for content generation.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const formData = new FormData(form);
                    try {
                      const res = await fetch("/api/ai/influencer/pipelines", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: formData.get("name"),
                          description: formData.get("description"),
                          pipelineType: formData.get("pipelineType"),
                          personaId: formData.get("personaId") || null,
                          stages: [
                            { type: "script_gen", config: {} },
                            { type: "prompt_chain", config: {} },
                            { type: "image_gen", config: {} },
                            { type: "video_assembly", config: {} },
                          ],
                        }),
                      });
                      if (res.ok) {
                        toast.success("Pipeline created");
                        setCreatePipelineOpen(false);
                        loadData();
                      } else {
                        const data = await res.json();
                        toast.error(data.error || "Failed to create pipeline");
                      }
                    } catch {
                      toast.error("Failed to create pipeline");
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="pipelineName">Name</Label>
                    <Input id="pipelineName" name="name" placeholder="My Content Pipeline" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pipelineDescription">Description</Label>
                    <Textarea id="pipelineDescription" name="description" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pipelineType">Pipeline Type</Label>
                    <Select name="pipelineType" defaultValue="script_to_video">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="script_to_video">Script to Video</SelectItem>
                        <SelectItem value="image_series">Image Series</SelectItem>
                        <SelectItem value="shorts">Short-form Video</SelectItem>
                        <SelectItem value="static_posts">Static Posts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="personaId">Persona (Optional)</Label>
                    <Select name="personaId">
                      <SelectTrigger>
                        <SelectValue placeholder="Select a persona..." />
                      </SelectTrigger>
                      <SelectContent>
                        {personas.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.displayName || p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="submit">Create Pipeline</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {pipelines.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No pipelines created yet. Create a content pipeline to automate video generation.
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Persona</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pipelines.map((pipeline) => (
                  <TableRow key={pipeline.id}>
                    <TableCell className="font-medium">{pipeline.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{pipeline.pipelineType}</Badge>
                    </TableCell>
                    <TableCell>{pipeline.persona?.displayName || pipeline.persona?.name || "-"}</TableCell>
                    <TableCell>
                      {pipeline.isScheduled ? (
                        <span className="text-sm text-muted-foreground">{pipeline.cronExpression}</span>
                      ) : (
                        <span className="text-muted-foreground">Manual</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={pipeline.isActive ? "default" : "secondary"}>
                        {pipeline.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => executePipeline(pipeline.id)}>
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Video Projects</h2>
            <div className="flex gap-2">
              <Badge variant="outline">{projects.length} total</Badge>
            </div>
          </div>

          {projects.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No video projects yet. Execute a pipeline to generate content.
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.title || "Untitled"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          project.status === "published"
                            ? "default"
                            : project.status === "generating"
                            ? "secondary"
                            : project.status === "failed"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">{project.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{project.targetPlatform || "Not set"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
