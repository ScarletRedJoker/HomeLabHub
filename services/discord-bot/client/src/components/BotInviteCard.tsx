import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Bot, Copy, ExternalLink, Check, Loader2 } from "lucide-react";

interface BotInviteData {
  inviteURL: string;
  permissions: number;
  clientId: string;
}

interface BotInviteCardProps {
  variant?: "default" | "compact";
  className?: string;
  showDescription?: boolean;
}

export default function BotInviteCard({ 
  variant = "default", 
  className = "",
  showDescription = true 
}: BotInviteCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: inviteData, isLoading } = useQuery<BotInviteData>({
    queryKey: ['/api/bot/invite-url'],
    staleTime: Infinity,
  });

  const handleCopyLink = async () => {
    if (!inviteData?.inviteURL) return;

    try {
      await navigator.clipboard.writeText(inviteData.inviteURL);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Bot invite link copied to clipboard",
      });
      
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy invite link",
        variant: "destructive",
      });
    }
  };

  const handleOpenInvite = () => {
    if (!inviteData?.inviteURL) return;
    window.open(inviteData.inviteURL, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return (
      <Card className={className} data-testid="card-bot-invite-loading">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-discord-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!inviteData?.inviteURL) {
    return (
      <Alert className={className} data-testid="alert-bot-invite-error">
        <AlertDescription>
          Unable to generate bot invite link. Please check your configuration.
        </AlertDescription>
      </Alert>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ${className}`} data-testid="container-bot-invite-compact">
        <Button
          onClick={handleOpenInvite}
          className="flex-1 bg-discord-blue hover:bg-blue-600 h-11"
          data-testid="button-open-invite"
        >
          <Bot className="h-4 w-4 mr-2" />
          Invite Bot to Server
        </Button>
        <Button
          onClick={handleCopyLink}
          variant="outline"
          size="icon"
          className="border-discord-dark h-11 w-full sm:w-11"
          data-testid="button-copy-invite"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    );
  }

  return (
    <Card className={`bg-discord-sidebar border-discord-dark ${className}`} data-testid="card-bot-invite">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-discord-blue rounded-lg flex items-center justify-center">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-white">Invite Bot to Server</CardTitle>
            {showDescription && (
              <CardDescription className="text-discord-muted">
                Add the bot to your Discord server to get started
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showDescription && (
          <p className="text-sm text-discord-text">
            Click the button below to add the bot to your Discord server. 
            Make sure you have "Manage Server" permissions.
          </p>
        )}
        
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handleOpenInvite}
            className="flex-1 bg-discord-blue hover:bg-blue-600 h-11 w-full sm:w-auto"
            data-testid="button-open-invite"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Invite Link
          </Button>
          <Button
            onClick={handleCopyLink}
            variant="outline"
            className="border-discord-dark h-11 w-full sm:w-auto"
            data-testid="button-copy-invite"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </>
            )}
          </Button>
        </div>

        <div className="bg-discord-dark rounded-md p-3">
          <p className="text-xs text-discord-muted break-all font-mono">
            {inviteData.inviteURL}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
