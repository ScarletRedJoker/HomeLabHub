import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Shield, Castle, Users, Sword, AlertTriangle, Check, X, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ModerationPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  features: string[];
  isActive: boolean;
}

interface PresetsResponse {
  presets: ModerationPreset[];
  currentSettings: any;
}

interface ModerationPresetsProps {
  serverId: string;
}

const presetIcons: Record<string, React.ReactNode> = {
  "anti-spam": <Shield className="h-6 w-6" />,
  "anti-raid": <Castle className="h-6 w-6" />,
  "family-friendly": <Users className="h-6 w-6" />,
  "strict-moderation": <Sword className="h-6 w-6" />,
};

export default function ModerationPresets({ serverId }: ModerationPresetsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    presetId: string;
    presetName: string;
    replaceExisting: boolean;
  }>({ open: false, presetId: "", presetName: "", replaceExisting: false });
  const [resetDialog, setResetDialog] = useState(false);

  const { data, isLoading, error } = useQuery<PresetsResponse>({
    queryKey: [`/api/servers/${serverId}/moderation/presets`],
    enabled: !!serverId,
  });

  const applyPresetMutation = useMutation({
    mutationFn: async ({ presetId, replaceExisting }: { presetId: string; replaceExisting: boolean }) => {
      const response = await fetch(`/api/servers/${serverId}/moderation/presets/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ presetId, replaceExisting }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to apply preset");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Preset Applied",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/moderation/presets`] });
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/settings`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removePresetMutation = useMutation({
    mutationFn: async (presetId: string) => {
      const response = await fetch(`/api/servers/${serverId}/moderation/presets/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ presetId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove preset");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Preset Removed",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/moderation/presets`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/servers/${serverId}/moderation/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to reset settings");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Settings Reset",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/moderation/presets`] });
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/settings`] });
      setResetDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePresetToggle = (preset: ModerationPreset) => {
    if (preset.isActive) {
      removePresetMutation.mutate(preset.id);
    } else {
      setConfirmDialog({
        open: true,
        presetId: preset.id,
        presetName: preset.name,
        replaceExisting: false,
      });
    }
  };

  const handleConfirmApply = (replaceExisting: boolean) => {
    applyPresetMutation.mutate({
      presetId: confirmDialog.presetId,
      replaceExisting,
    });
    setConfirmDialog({ open: false, presetId: "", presetName: "", replaceExisting: false });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-discord-blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-discord-muted">
        <AlertTriangle className="h-8 w-8 mb-2" />
        <p>Failed to load moderation presets</p>
      </div>
    );
  }

  const presets = data?.presets || [];
  const activeCount = presets.filter((p) => p.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Moderation Presets</h3>
          <p className="text-sm text-discord-muted">
            One-click configurations for common moderation scenarios
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <Badge variant="secondary" className="bg-discord-blue/20 text-discord-blue">
              {activeCount} Active
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetDialog(true)}
            className="border-discord-dark text-discord-text hover:bg-discord-dark"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((preset) => (
          <Card
            key={preset.id}
            className={`bg-discord-dark border-discord-dark transition-all ${
              preset.isActive ? "ring-2 ring-discord-blue" : ""
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${preset.color}20`, color: preset.color }}
                  >
                    {presetIcons[preset.id] || <Shield className="h-6 w-6" />}
                  </div>
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      {preset.name}
                      {preset.isActive && (
                        <Badge className="bg-green-500/20 text-green-400 text-xs">
                          Active
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-discord-muted mt-1">
                      {preset.description}
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={preset.isActive}
                  onCheckedChange={() => handlePresetToggle(preset)}
                  disabled={applyPresetMutation.isPending || removePresetMutation.isPending}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-xs font-medium text-discord-muted uppercase tracking-wide">
                  Features
                </p>
                <ul className="space-y-1.5">
                  {preset.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-discord-text">
                      <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 pt-4 border-t border-discord-sidebar">
                <Button
                  variant={preset.isActive ? "outline" : "default"}
                  size="sm"
                  className={
                    preset.isActive
                      ? "w-full border-red-500/50 text-red-400 hover:bg-red-500/10"
                      : "w-full bg-discord-blue hover:bg-discord-blue/80"
                  }
                  onClick={() => handlePresetToggle(preset)}
                  disabled={applyPresetMutation.isPending || removePresetMutation.isPending}
                >
                  {applyPresetMutation.isPending || removePresetMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : preset.isActive ? (
                    <X className="h-4 w-4 mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {preset.isActive ? "Disable Preset" : "Enable Preset"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ ...confirmDialog, open: false })}>
        <AlertDialogContent className="bg-discord-sidebar border-discord-dark">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Apply {confirmDialog.presetName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-discord-muted">
              This will configure automod settings based on the selected preset. You can choose to:
              <ul className="mt-3 space-y-2 text-left">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-discord-text">• Merge:</span>
                  <span>Add preset rules to your existing configuration</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-discord-text">• Replace:</span>
                  <span>Replace existing rules with this preset's settings</span>
                </li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="border-discord-dark text-discord-text hover:bg-discord-dark">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleConfirmApply(false)}
              className="bg-discord-blue hover:bg-discord-blue/80"
            >
              Merge with Existing
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleConfirmApply(true)}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Replace Existing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetDialog} onOpenChange={setResetDialog}>
        <AlertDialogContent className="bg-discord-sidebar border-discord-dark">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Reset Moderation Settings?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-discord-muted">
              This will reset all moderation settings to their defaults and remove all applied presets. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-discord-dark text-discord-text hover:bg-discord-dark">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetMutation.mutate()}
              className="bg-red-500 hover:bg-red-600"
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Reset Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
