"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Globe,
  Plus,
  Search,
  ExternalLink,
  Edit,
  Trash2,
  Eye,
  Loader2,
  Layout,
  Briefcase,
  FileText,
  Palette,
  RefreshCw,
  CheckCircle,
  Clock,
} from "lucide-react";

interface Website {
  id: string;
  name: string;
  domain: string;
  description: string;
  type: string;
  status: "draft" | "published";
  designProjectId?: string;
  createdAt: string;
  updatedAt: string;
}

const templates = [
  { id: "portfolio", name: "Portfolio", description: "Showcase your work and skills", icon: Briefcase },
  { id: "blog", name: "Blog", description: "Share your thoughts and ideas", icon: FileText },
  { id: "landing", name: "Landing Page", description: "Convert visitors into customers", icon: Layout },
  { id: "custom", name: "Custom", description: "Start from scratch", icon: Palette },
];

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewSite, setShowNewSite] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newSite, setNewSite] = useState({ name: "", domain: "", description: "", type: "custom" });
  const { toast } = useToast();

  const fetchWebsites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/websites");
      if (res.ok) {
        const data = await res.json();
        setWebsites(data.websites || []);
      }
    } catch (error) {
      console.error("Failed to fetch websites:", error);
      toast({ title: "Error", description: "Failed to load websites", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchWebsites();
  }, [fetchWebsites]);

  const handleCreate = async () => {
    if (!newSite.name || !newSite.domain) {
      toast({ title: "Error", description: "Name and domain are required", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSite),
      });

      if (res.ok) {
        const data = await res.json();
        setWebsites((prev) => [...prev, data.website]);
        setNewSite({ name: "", domain: "", description: "", type: "custom" });
        setShowNewSite(false);
        toast({ title: "Created", description: `Website "${data.website.name}" created` });
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to create website", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/websites?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setWebsites((prev) => prev.filter((w) => w.id !== id));
        toast({ title: "Deleted", description: "Website deleted" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete website", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handlePublish = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    try {
      const res = await fetch("/api/websites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        setWebsites((prev) =>
          prev.map((w) => (w.id === id ? { ...w, status: newStatus } : w))
        );
        toast({ title: "Updated", description: `Website ${newStatus === "published" ? "published" : "unpublished"}` });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const filteredWebsites = websites.filter(
    (site) =>
      site.name.toLowerCase().includes(search.toLowerCase()) ||
      site.domain.toLowerCase().includes(search.toLowerCase()) ||
      site.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Websites</h1>
          <p className="text-muted-foreground">Create and manage your websites</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchWebsites} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowNewSite(!showNewSite)}>
            <Plus className="mr-2 h-4 w-4" />
            New Website
          </Button>
        </div>
      </div>

      {showNewSite && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Website</CardTitle>
            <CardDescription>Add a new website to your homelab</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Website Name</Label>
                <Input
                  placeholder="My Awesome Site"
                  value={newSite.name}
                  onChange={(e) => setNewSite((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Domain</Label>
                <Input
                  placeholder="example.com"
                  value={newSite.domain}
                  onChange={(e) => setNewSite((p) => ({ ...p, domain: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="A brief description of your website"
                value={newSite.description}
                onChange={(e) => setNewSite((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newSite.type} onValueChange={(v) => setNewSite((p) => ({ ...p, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} - {t.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Create Website
              </Button>
              <Button variant="outline" onClick={() => setShowNewSite(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search websites..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredWebsites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No websites found. Create your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredWebsites.map((site) => (
            <Card key={site.id} className="relative overflow-hidden">
              <button
                onClick={() => handlePublish(site.id, site.status)}
                className={`absolute right-4 top-4 rounded-full px-2 py-1 text-xs font-medium cursor-pointer transition-colors ${
                  site.status === "published"
                    ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                    : "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                }`}
              >
                {site.status === "published" ? (
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Published</span>
                ) : (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Draft</span>
                )}
              </button>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{site.name}</CardTitle>
                    <CardDescription>{site.domain}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">{site.description || "No description"}</p>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="capitalize">{site.type}</span>
                  <span>Updated {formatDate(site.updatedAt)}</span>
                </div>
                <div className="flex gap-2">
                  <Link href={`/designer`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Design
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(site.id)}
                    disabled={deleting === site.id}
                  >
                    {deleting === site.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
