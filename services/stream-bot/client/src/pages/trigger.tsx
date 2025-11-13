import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Zap, Loader2, Sparkles, RefreshCw } from "lucide-react";
import type { PlatformConnection } from "@shared/schema";

export default function Trigger() {
  const { toast } = useToast();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [previewFact, setPreviewFact] = useState<string>("");

  const { data: platforms } = useQuery<PlatformConnection[]>({
    queryKey: ["/api/platforms"],
  });

  const generatePreviewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/generate-fact", {});
      return response;
    },
    onSuccess: (data: any) => {
      setPreviewFact(data.fact);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate preview fact",
        variant: "destructive",
      });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/trigger", {
        platforms: selectedPlatforms,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Fact Posted!",
        description: `Successfully posted to ${selectedPlatforms.length} platform(s)`,
      });
      setPreviewFact("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to post fact. Please try again.",
        variant: "destructive",
      });
    },
  });

  const connectedPlatforms = platforms?.filter((p) => p.isConnected) || [];

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleGeneratePreview = () => {
    generatePreviewMutation.mutate();
  };

  const handleTrigger = () => {
    if (selectedPlatforms.length === 0) {
      toast({
        title: "No platforms selected",
        description: "Please select at least one platform",
        variant: "destructive",
      });
      return;
    }
    triggerMutation.mutate();
  };

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Quick Trigger</h1>
        <p className="text-muted-foreground mt-1">
          Manually post a Snapple fact to your channels
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Platform Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Platforms</CardTitle>
            <CardDescription>
              Choose which platforms to post to
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connectedPlatforms.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No platforms connected</p>
                <p className="text-sm mt-1">
                  Connect platforms from the Dashboard
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {connectedPlatforms.map((platform) => (
                  <div
                    key={platform.id}
                    className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate"
                  >
                    <Checkbox
                      id={platform.platform}
                      checked={selectedPlatforms.includes(platform.platform)}
                      onCheckedChange={() => togglePlatform(platform.platform)}
                      data-testid={`checkbox-trigger-${platform.platform}`}
                    />
                    <Label
                      htmlFor={platform.platform}
                      className="flex-1 cursor-pointer capitalize font-medium"
                    >
                      {platform.platform}
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      @{platform.platformUsername}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview & Trigger */}
        <Card>
          <CardHeader>
            <CardTitle>Fact Preview</CardTitle>
            <CardDescription>
              Generate a preview before posting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="min-h-32 p-4 rounded-lg bg-muted/50 border">
              {previewFact ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4" />
                    <span>Generated Fact:</span>
                  </div>
                  <p className="text-sm font-mono leading-relaxed" data-testid="text-preview-fact">
                    {previewFact}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">Generate a preview to see the fact</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGeneratePreview}
                disabled={generatePreviewMutation.isPending}
                data-testid="button-generate-preview"
              >
                {generatePreviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span>Generate Preview</span>
              </Button>

              <Separator />

              <Button
                className="w-full"
                size="lg"
                onClick={handleTrigger}
                disabled={
                  triggerMutation.isPending ||
                  selectedPlatforms.length === 0 ||
                  connectedPlatforms.length === 0
                }
                data-testid="button-post-now"
              >
                {triggerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                <span>Post Now</span>
              </Button>

              {selectedPlatforms.length > 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  Will post to {selectedPlatforms.length} platform(s)
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
