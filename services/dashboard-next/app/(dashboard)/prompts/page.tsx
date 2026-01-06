"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  Plus,
  Copy,
  Edit,
  Trash2,
  Code2,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Settings,
  Loader2,
  Check,
  Search,
  Sparkles,
  ExternalLink,
  Globe,
  Lock,
  X,
  Tag,
} from "lucide-react";

interface Prompt {
  id: string;
  userId?: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  isBuiltin?: boolean;
  createdAt?: Date;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  code: Code2,
  content: FileText,
  image: ImageIcon,
  chat: MessageSquare,
  system: Settings,
};

const CATEGORY_COLORS: Record<string, string> = {
  code: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  content: "bg-green-500/10 text-green-500 border-green-500/20",
  image: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  chat: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  system: "bg-pink-500/10 text-pink-500 border-pink-500/20",
};

const CATEGORY_LABELS: Record<string, string> = {
  code: "Code",
  content: "Content",
  image: "Image",
  chat: "Chat",
  system: "System",
};

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    content: "",
    category: "code",
    tags: [] as string[],
    isPublic: false,
  });
  const [tagInput, setTagInput] = useState("");

  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPrompts();
  }, []);

  async function fetchPrompts() {
    try {
      const res = await fetch("/api/prompts");
      if (res.ok) {
        const data = await res.json();
        setPrompts(data.prompts || []);
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error("Failed to fetch prompts:", error);
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(content: string, promptId: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(promptId);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }

  function openCreateDialog() {
    setEditingPrompt(null);
    setFormData({
      name: "",
      description: "",
      content: "",
      category: "code",
      tags: [],
      isPublic: false,
    });
    setTagInput("");
    setShowCreateDialog(true);
  }

  function openEditDialog(prompt: Prompt) {
    if (prompt.isBuiltin) return;
    setEditingPrompt(prompt);
    setFormData({
      name: prompt.name,
      description: prompt.description,
      content: prompt.content,
      category: prompt.category,
      tags: prompt.tags || [],
      isPublic: prompt.isPublic,
    });
    setTagInput("");
    setShowCreateDialog(true);
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
      setTagInput("");
    }
  }

  function removeTag(tagToRemove: string) {
    setFormData({
      ...formData,
      tags: formData.tags.filter((tag) => tag !== tagToRemove),
    });
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  }

  async function savePrompt() {
    setSaving(true);
    try {
      const method = editingPrompt ? "PUT" : "POST";
      const body = editingPrompt
        ? { id: editingPrompt.id, ...formData }
        : formData;

      const res = await fetch("/api/prompts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await fetchPrompts();
        setShowCreateDialog(false);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to save prompt");
      }
    } catch (error) {
      console.error("Failed to save prompt:", error);
    } finally {
      setSaving(false);
    }
  }

  async function deletePrompt(promptId: string) {
    if (!confirm("Are you sure you want to delete this prompt?")) return;

    try {
      const res = await fetch(`/api/prompts?id=${promptId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchPrompts();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to delete prompt");
      }
    } catch (error) {
      console.error("Failed to delete prompt:", error);
    }
  }

  function useInAI(prompt: Prompt) {
    const encodedContent = encodeURIComponent(prompt.content);
    if (prompt.category === "code") {
      window.location.href = `/generate?prompt=${encodedContent}`;
    } else if (prompt.category === "image") {
      window.location.href = `/creative?tab=image&prompt=${encodedContent}`;
    } else {
      window.location.href = `/creative?tab=chat&prompt=${encodedContent}`;
    }
  }

  const filteredPrompts = prompts.filter((p) => {
    const categoryMatch =
      activeCategory === "all" ||
      p.category.toLowerCase() === activeCategory.toLowerCase();

    if (!searchQuery) return categoryMatch;

    const searchLower = searchQuery.toLowerCase();
    const nameMatch = p.name.toLowerCase().includes(searchLower);
    const descMatch = p.description.toLowerCase().includes(searchLower);
    const tagMatch = p.tags?.some((tag) =>
      tag.toLowerCase().includes(searchLower)
    );

    return categoryMatch && (nameMatch || descMatch || tagMatch);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-500" />
            Prompt Library
          </h1>
          <p className="text-muted-foreground">
            Store, organize, and reuse AI prompts across your projects
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Create Prompt
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts by name or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat] || Settings;
            return (
              <TabsTrigger
                key={cat}
                value={cat}
                className="flex items-center gap-1"
              >
                <Icon className="h-4 w-4" />
                {CATEGORY_LABELS[cat] || cat}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          {filteredPrompts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No prompts found</p>
              {searchQuery && (
                <p className="text-sm mt-1">
                  Try adjusting your search or filters
                </p>
              )}
              <Button
                variant="outline"
                className="mt-4"
                onClick={openCreateDialog}
              >
                Create your first prompt
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPrompts.map((prompt) => {
                const Icon = CATEGORY_ICONS[prompt.category] || Settings;
                const colorClass =
                  CATEGORY_COLORS[prompt.category] || CATEGORY_COLORS.system;

                return (
                  <div
                    key={prompt.id}
                    className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${colorClass}`}
                        >
                          <Icon className="h-3 w-3" />
                          {CATEGORY_LABELS[prompt.category] || prompt.category}
                        </span>
                        {prompt.isPublic ? (
                          <Globe className="h-3 w-3 text-green-500" />
                        ) : (
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      {prompt.isBuiltin && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          Built-in
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold mb-1">{prompt.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {prompt.description}
                    </p>

                    {prompt.tags && prompt.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {prompt.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                        {prompt.tags.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{prompt.tags.length - 3} more
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(prompt.content, prompt.id)}
                        className="flex-1"
                      >
                        {copied === prompt.id ? (
                          <>
                            <Check className="h-3 w-3 mr-1 text-green-500" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => useInAI(prompt)}
                        className="flex-1"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        Use in AI
                      </Button>
                    </div>

                    {!prompt.isBuiltin && (
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDialog(prompt)}
                          className="flex-1"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deletePrompt(prompt.id)}
                          className="flex-1 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPrompt ? "Edit Prompt" : "Create New Prompt"}
            </DialogTitle>
            <DialogDescription>
              Create a reusable prompt template for AI workflows
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="My Custom Prompt"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData({ ...formData, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => {
                      const Icon = CATEGORY_ICONS[cat] || Settings;
                      return (
                        <SelectItem key={cat} value={cat}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {CATEGORY_LABELS[cat] || cat}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Brief description of what this prompt does"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Prompt Content</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                placeholder="Enter your prompt template here..."
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-sm"
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Add a tag..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                {formData.isPublic ? (
                  <Globe className="h-4 w-4 text-green-500" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <Label htmlFor="isPublic" className="font-medium">
                    {formData.isPublic ? "Public" : "Private"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {formData.isPublic
                      ? "Anyone can see and use this prompt"
                      : "Only you can see this prompt"}
                  </p>
                </div>
              </div>
              <Switch
                id="isPublic"
                checked={formData.isPublic}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isPublic: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={savePrompt}
              disabled={saving || !formData.name || !formData.content}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>{editingPrompt ? "Update" : "Create"} Prompt</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
