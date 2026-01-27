"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Play,
  Edit,
  Loader2,
  Image,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  workflowJson?: any;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowListProps {
  workflows: Workflow[];
  loading?: boolean;
  onRefresh: () => void;
  onExecute: (workflow: Workflow) => void;
  onEdit: (workflow: Workflow) => void;
  onNew: () => void;
}

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "txt2img", label: "Text to Image" },
  { value: "img2img", label: "Image to Image" },
  { value: "upscale", label: "Upscale" },
  { value: "inpaint", label: "Inpainting" },
  { value: "animation", label: "Animation" },
  { value: "custom", label: "Custom" },
];

export function WorkflowList({
  workflows,
  loading,
  onRefresh,
  onExecute,
  onEdit,
  onNew,
}: WorkflowListProps) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const filteredWorkflows = workflows.filter((w) => {
    if (categoryFilter === "all") return true;
    return w.category === categoryFilter;
  });

  if (loading && workflows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Workflow
          </Button>
        </div>
      </div>

      {filteredWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Workflows Found</h3>
          <p className="text-muted-foreground max-w-md mb-4">
            {categoryFilter === "all"
              ? "Create your first ComfyUI workflow to get started."
              : "No workflows match the selected category."}
          </p>
          <Button onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            Create Workflow
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredWorkflows.map((workflow) => (
            <Card key={workflow.id} className="overflow-hidden">
              <div className="aspect-video bg-muted flex items-center justify-center">
                {workflow.thumbnailUrl ? (
                  <img
                    src={workflow.thumbnailUrl}
                    alt={workflow.name}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <Image className="h-12 w-12 text-muted-foreground/50" />
                )}
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{workflow.name}</CardTitle>
                    {workflow.description && (
                      <CardDescription className="line-clamp-2 mt-1">
                        {workflow.description}
                      </CardDescription>
                    )}
                  </div>
                  {workflow.category && (
                    <Badge variant="secondary" className="ml-2 shrink-0">
                      {workflow.category}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {workflow.tags && workflow.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {workflow.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {workflow.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{workflow.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => onExecute(workflow)}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Execute
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(workflow)}
                  >
                    <Edit className="h-4 w-4" />
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
