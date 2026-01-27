"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, X, Save } from "lucide-react";
import { toast } from "sonner";

interface Workflow {
  id?: string;
  name: string;
  description: string | null;
  workflowJson?: any;
  category: string | null;
  tags: string[];
}

interface WorkflowFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow?: Workflow | null;
  onSave: () => void;
}

const CATEGORIES = [
  { value: "txt2img", label: "Text to Image" },
  { value: "img2img", label: "Image to Image" },
  { value: "upscale", label: "Upscale" },
  { value: "inpaint", label: "Inpainting" },
  { value: "animation", label: "Animation" },
  { value: "custom", label: "Custom" },
];

export function WorkflowForm({ open, onOpenChange, workflow, onSave }: WorkflowFormProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    tags: [] as string[],
    workflowJson: "{}",
  });
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (workflow) {
      setFormData({
        name: workflow.name || "",
        description: workflow.description || "",
        category: workflow.category || "",
        tags: workflow.tags || [],
        workflowJson: JSON.stringify(workflow.workflowJson || {}, null, 2),
      });
    } else {
      setFormData({
        name: "",
        description: "",
        category: "",
        tags: [],
        workflowJson: "{}",
      });
    }
    setTagInput("");
  }, [workflow, open]);

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a workflow name");
      return;
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(formData.workflowJson);
    } catch (e) {
      toast.error("Invalid JSON in workflow definition");
      return;
    }

    setSaving(true);
    try {
      const url = workflow?.id
        ? `/api/ai/comfyui/workflows/${workflow.id}`
        : "/api/ai/comfyui/workflows";
      const method = workflow?.id ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          category: formData.category || null,
          tags: formData.tags,
          workflowJson: parsedJson,
        }),
      });

      if (response.ok) {
        toast.success(workflow?.id ? "Workflow updated" : "Workflow created");
        onOpenChange(false);
        onSave();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to save workflow");
      }
    } catch (error) {
      toast.error("Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {workflow?.id ? "Edit Workflow" : "Create New Workflow"}
          </DialogTitle>
          <DialogDescription>
            {workflow?.id
              ? "Modify the workflow settings and JSON definition."
              : "Create a new ComfyUI workflow for image generation."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="My Workflow"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Optional description..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(v) => setFormData({ ...formData, category: v })}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button type="button" variant="outline" onClick={handleAddTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="workflowJson">Workflow JSON *</Label>
            <textarea
              id="workflowJson"
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              placeholder="Paste your ComfyUI workflow JSON here..."
              value={formData.workflowJson}
              onChange={(e) => setFormData({ ...formData, workflowJson: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Export your workflow from ComfyUI and paste the JSON here.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {workflow?.id ? "Update" : "Create"} Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
