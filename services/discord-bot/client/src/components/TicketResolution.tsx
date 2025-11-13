import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Ticket } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle, AlertCircle, Ban, FileText, Save, X, Loader2 } from "lucide-react";
import { useAuthContext } from "./AuthProvider";
import { useServerContext } from "@/contexts/ServerContext";

interface TicketResolutionProps {
  ticket: Ticket;
  onClose?: () => void;
  onResolved?: () => void;
}

const RESOLUTION_TYPES = [
  { 
    value: "resolved", 
    label: "Resolved", 
    icon: CheckCircle, 
    color: "text-green-500",
    description: "Issue has been resolved successfully" 
  },
  { 
    value: "warned", 
    label: "Warned", 
    icon: AlertCircle, 
    color: "text-yellow-500",
    description: "User has been warned about their behavior" 
  },
  { 
    value: "punished", 
    label: "Punished", 
    icon: Ban, 
    color: "text-red-500",
    description: "User has been punished (ban/mute/timeout)" 
  },
  { 
    value: "noted", 
    label: "Noted", 
    icon: FileText, 
    color: "text-blue-500",
    description: "Information noted for future reference" 
  }
];

const PUNISHMENT_DURATIONS = [
  { value: "1h", label: "1 Hour" },
  { value: "6h", label: "6 Hours" },
  { value: "12h", label: "12 Hours" },
  { value: "1d", label: "1 Day" },
  { value: "3d", label: "3 Days" },
  { value: "7d", label: "1 Week" },
  { value: "14d", label: "2 Weeks" },
  { value: "30d", label: "1 Month" },
  { value: "permanent", label: "Permanent" }
];

export default function TicketResolution({ ticket, onClose, onResolved }: TicketResolutionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const { selectedServerId } = useServerContext();
  
  const [resolutionType, setResolutionType] = useState<string>("resolved");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [punishmentDuration, setPunishmentDuration] = useState("");
  const [updateTicketStatus, setUpdateTicketStatus] = useState(true);

  // Create resolution mutation
  const createResolutionMutation = useMutation({
    mutationFn: async () => {
      let fullActionTaken = actionTaken;
      
      // Append punishment duration if applicable
      if (resolutionType === "punished" && punishmentDuration) {
        const durationLabel = PUNISHMENT_DURATIONS.find(d => d.value === punishmentDuration)?.label;
        fullActionTaken = `${actionTaken} (Duration: ${durationLabel})`;
      }
      
      const resolutionData = {
        resolutionType,
        resolutionNotes: resolutionNotes.trim() || null,
        actionTaken: fullActionTaken.trim() || null,
        serverId: selectedServerId,
        updateStatus: updateTicketStatus ? "closed" : null
      };
      
      return apiRequest("POST", `/api/tickets/${ticket.id}/resolutions`, resolutionData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket.id}/resolutions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticket.id}/audit-logs`] });
      
      toast({
        title: "Ticket Resolved",
        description: `Ticket #${ticket.id} has been marked as ${resolutionType}.`,
      });
      
      if (onResolved) {
        onResolved();
      }
      
      if (onClose) {
        onClose();
      }
    },
    onError: (error) => {
      toast({
        title: "Resolution Failed",
        description: `Failed to resolve ticket: ${error}`,
        variant: "destructive",
      });
    }
  });

  const handleSubmit = () => {
    if (!resolutionNotes.trim() && !actionTaken.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide either resolution notes or action taken.",
        variant: "destructive",
      });
      return;
    }
    
    if (resolutionType === "punished" && !punishmentDuration) {
      toast({
        title: "Missing Duration",
        description: "Please select a punishment duration.",
        variant: "destructive",
      });
      return;
    }
    
    createResolutionMutation.mutate();
  };

  const selectedType = RESOLUTION_TYPES.find(type => type.value === resolutionType);
  const Icon = selectedType?.icon || CheckCircle;

  return (
    <Card className="w-full max-w-2xl mx-auto bg-discord-sidebar border-discord-dark">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className={`h-5 w-5 ${selectedType?.color}`} />
            <div>
              <CardTitle className="text-white">Resolve Ticket #{ticket.id}</CardTitle>
              <CardDescription className="text-discord-muted mt-1">
                {ticket.title}
              </CardDescription>
            </div>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-discord-muted hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Resolution Type Selection */}
        <div className="space-y-3">
          <Label className="text-discord-text">Resolution Type</Label>
          <RadioGroup value={resolutionType} onValueChange={setResolutionType}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {RESOLUTION_TYPES.map((type) => {
                const TypeIcon = type.icon;
                return (
                  <div key={type.value} className="relative">
                    <RadioGroupItem
                      value={type.value}
                      id={type.value}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={type.value}
                      className="flex items-start gap-3 rounded-lg border-2 border-discord-dark bg-discord-bg p-4 hover:bg-discord-dark/50 cursor-pointer peer-data-[state=checked]:border-discord-blue peer-data-[state=checked]:bg-discord-dark"
                    >
                      <TypeIcon className={`h-5 w-5 mt-0.5 ${type.color}`} />
                      <div className="flex-1">
                        <div className="font-medium text-white">{type.label}</div>
                        <div className="text-xs text-discord-muted mt-1">
                          {type.description}
                        </div>
                      </div>
                    </Label>
                  </div>
                );
              })}
            </div>
          </RadioGroup>
        </div>

        {/* Punishment Duration (shown only for punished type) */}
        {resolutionType === "punished" && (
          <div className="space-y-2">
            <Label htmlFor="punishment-duration" className="text-discord-text">
              Punishment Duration <span className="text-red-500">*</span>
            </Label>
            <Select value={punishmentDuration} onValueChange={setPunishmentDuration}>
              <SelectTrigger id="punishment-duration" className="bg-discord-bg border-discord-dark text-white">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent className="bg-discord-sidebar border-discord-dark">
                {PUNISHMENT_DURATIONS.map((duration) => (
                  <SelectItem 
                    key={duration.value} 
                    value={duration.value}
                    className="text-discord-text hover:bg-discord-dark focus:bg-discord-dark"
                  >
                    {duration.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Action Taken */}
        <div className="space-y-2">
          <Label htmlFor="action-taken" className="text-discord-text">
            Action Taken
            {resolutionType === "punished" && <span className="text-gray-500 ml-2">(e.g., "Banned from server", "Muted in voice channels")</span>}
          </Label>
          <Input
            id="action-taken"
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
            placeholder={
              resolutionType === "punished" 
                ? "Describe the punishment action..."
                : "Describe the action taken..."
            }
            className="bg-discord-bg border-discord-dark text-white placeholder:text-discord-muted"
          />
        </div>

        {/* Resolution Notes */}
        <div className="space-y-2">
          <Label htmlFor="resolution-notes" className="text-discord-text">
            Resolution Notes
          </Label>
          <Textarea
            id="resolution-notes"
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            placeholder="Provide detailed notes about the resolution..."
            rows={4}
            className="bg-discord-bg border-discord-dark text-white placeholder:text-discord-muted resize-none"
          />
          <p className="text-xs text-discord-muted">
            Include any relevant details, decisions made, or follow-up actions required.
          </p>
        </div>

        {/* Update Ticket Status */}
        <div className="flex items-center gap-3 p-3 bg-discord-bg rounded-lg border border-discord-dark">
          <input
            type="checkbox"
            id="update-status"
            checked={updateTicketStatus}
            onChange={(e) => setUpdateTicketStatus(e.target.checked)}
            className="w-4 h-4 rounded border-discord-dark bg-discord-bg text-discord-blue focus:ring-discord-blue focus:ring-offset-0"
          />
          <Label htmlFor="update-status" className="text-discord-text cursor-pointer flex-1">
            Automatically close ticket after resolution
          </Label>
        </div>

        {/* Info Alert */}
        <Alert className="bg-blue-500/10 border-blue-500/20">
          <AlertCircle className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-discord-text">
            This resolution will be recorded in the ticket's history and audit log. 
            {updateTicketStatus && " The ticket will be closed automatically."}
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end pt-2">
          {onClose && (
            <Button
              variant="outline"
              onClick={onClose}
              disabled={createResolutionMutation.isPending}
              className="bg-transparent border-discord-dark text-discord-text hover:bg-discord-dark hover:text-white"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={createResolutionMutation.isPending}
            className="bg-discord-blue hover:bg-discord-blue/80 text-white"
          >
            {createResolutionMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resolving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Resolution
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}