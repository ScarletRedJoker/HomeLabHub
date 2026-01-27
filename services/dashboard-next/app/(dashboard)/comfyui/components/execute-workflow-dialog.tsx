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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Play, Layers } from "lucide-react";
import { toast } from "sonner";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  workflowJson?: any;
  category: string | null;
  tags: string[];
}

interface ExecuteWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow | null;
  onExecuted: () => void;
}

interface InputParam {
  key: string;
  type: string;
  defaultValue: any;
  label: string;
}

export function ExecuteWorkflowDialog({
  open,
  onOpenChange,
  workflow,
  onExecuted,
}: ExecuteWorkflowDialogProps) {
  const [executing, setExecuting] = useState(false);
  const [executingBatch, setExecutingBatch] = useState(false);
  const [asyncMode, setAsyncMode] = useState(true);
  const [batchCount, setBatchCount] = useState(4);
  const [inputParams, setInputParams] = useState<Record<string, any>>({});
  const [detectedInputs, setDetectedInputs] = useState<InputParam[]>([]);

  useEffect(() => {
    if (workflow?.workflowJson) {
      const inputs = extractInputsFromWorkflow(workflow.workflowJson);
      setDetectedInputs(inputs);
      
      const defaultParams: Record<string, any> = {};
      inputs.forEach((input) => {
        defaultParams[input.key] = input.defaultValue;
      });
      setInputParams(defaultParams);
    } else {
      setDetectedInputs([]);
      setInputParams({});
    }
  }, [workflow]);

  const extractInputsFromWorkflow = (workflowJson: any): InputParam[] => {
    const inputs: InputParam[] = [];
    
    if (!workflowJson || typeof workflowJson !== "object") {
      return inputs;
    }

    const commonInputs = [
      { key: "prompt", type: "text", defaultValue: "", label: "Prompt" },
      { key: "negative_prompt", type: "text", defaultValue: "", label: "Negative Prompt" },
      { key: "seed", type: "number", defaultValue: -1, label: "Seed (-1 for random)" },
      { key: "steps", type: "number", defaultValue: 20, label: "Steps" },
      { key: "cfg", type: "number", defaultValue: 7, label: "CFG Scale" },
      { key: "width", type: "number", defaultValue: 512, label: "Width" },
      { key: "height", type: "number", defaultValue: 512, label: "Height" },
    ];

    try {
      const nodes = workflowJson.nodes || Object.values(workflowJson);
      
      for (const node of nodes) {
        if (node?.class_type === "KSampler" || node?.type === "KSampler") {
          return commonInputs;
        }
      }
    } catch (e) {
    }

    return commonInputs.slice(0, 4);
  };

  const handleExecute = async (isBatch = false) => {
    if (!workflow) return;

    if (isBatch) {
      setExecutingBatch(true);
    } else {
      setExecuting(true);
    }

    try {
      if (isBatch) {
        const response = await fetch("/api/ai/comfyui/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowId: workflow.id,
            inputParams,
            count: batchCount,
            async: asyncMode,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          toast.success(`Batch of ${batchCount} jobs started`);
          onOpenChange(false);
          onExecuted();
        } else {
          const error = await response.json();
          toast.error(error.error || "Failed to start batch execution");
        }
      } else {
        const response = await fetch(`/api/ai/comfyui/workflows/${workflow.id}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputParams,
            async: asyncMode,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (asyncMode) {
            toast.success("Workflow execution started");
          } else {
            toast.success("Workflow completed successfully");
          }
          onOpenChange(false);
          onExecuted();
        } else {
          const error = await response.json();
          toast.error(error.error || "Failed to execute workflow");
        }
      }
    } catch (error) {
      toast.error("Failed to execute workflow");
    } finally {
      setExecuting(false);
      setExecutingBatch(false);
    }
  };

  const handleParamChange = (key: string, value: any, type: string) => {
    let parsedValue = value;
    if (type === "number") {
      parsedValue = value === "" ? 0 : parseFloat(value);
    }
    setInputParams({ ...inputParams, [key]: parsedValue });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Execute Workflow</DialogTitle>
          <DialogDescription>
            {workflow?.name || "Configure and run this workflow"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {detectedInputs.map((input) => (
            <div key={input.key} className="grid gap-2">
              <Label htmlFor={input.key}>{input.label}</Label>
              {input.type === "text" ? (
                <textarea
                  id={input.key}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={`Enter ${input.label.toLowerCase()}...`}
                  value={inputParams[input.key] || ""}
                  onChange={(e) => handleParamChange(input.key, e.target.value, input.type)}
                />
              ) : (
                <Input
                  id={input.key}
                  type="number"
                  value={inputParams[input.key] ?? input.defaultValue}
                  onChange={(e) => handleParamChange(input.key, e.target.value, input.type)}
                />
              )}
            </div>
          ))}

          <div className="border-t pt-4 mt-2">
            <h4 className="text-sm font-medium mb-3">Execution Options</h4>
            
            <div className="flex items-center space-x-2 mb-3">
              <Checkbox
                id="async"
                checked={asyncMode}
                onCheckedChange={(checked) => setAsyncMode(checked === true)}
              />
              <Label htmlFor="async" className="text-sm font-normal">
                Run asynchronously (don't wait for completion)
              </Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="batchCount">Batch Count</Label>
              <Input
                id="batchCount"
                type="number"
                min={1}
                max={100}
                value={batchCount}
                onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Number of jobs to run in batch execution
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleExecute(true)}
            disabled={executing || executingBatch}
          >
            {executingBatch ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Layers className="h-4 w-4 mr-2" />
            )}
            Execute Batch ({batchCount})
          </Button>
          <Button
            onClick={() => handleExecute(false)}
            disabled={executing || executingBatch}
          >
            {executing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
