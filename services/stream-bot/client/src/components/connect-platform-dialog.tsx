import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Info } from "lucide-react";

const twitchConnectionSchema = z.object({
  channelName: z.string().min(1, "Channel name is required"),
  oauthToken: z.string().min(1, "OAuth token is required"),
  botUsername: z.string().optional(),
});

const kickConnectionSchema = z.object({
  channelName: z.string().min(1, "Channel name is required"),
  bearerToken: z.string().optional(),
  cookies: z.string().optional(),
});

type TwitchConnectionForm = z.infer<typeof twitchConnectionSchema>;
type KickConnectionForm = z.infer<typeof kickConnectionSchema>;

interface ConnectPlatformDialogProps {
  platform: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (data: {
    platform: string;
    platformUsername: string;
    accessToken: string;
    channelId?: string;
    botUsername?: string;
    bearerToken?: string;
    cookies?: string;
  }) => void;
  isPending?: boolean;
}

export function ConnectPlatformDialog({
  platform,
  open,
  onOpenChange,
  onConnect,
  isPending,
}: ConnectPlatformDialogProps) {
  const twitchForm = useForm<TwitchConnectionForm>({
    resolver: zodResolver(twitchConnectionSchema),
    defaultValues: {
      channelName: "",
      oauthToken: "",
      botUsername: "",
    },
  });

  const kickForm = useForm<KickConnectionForm>({
    resolver: zodResolver(kickConnectionSchema),
    defaultValues: {
      channelName: "",
      bearerToken: "",
      cookies: "",
    },
  });

  const onTwitchSubmit = (data: TwitchConnectionForm) => {
    onConnect({
      platform,
      platformUsername: data.channelName,
      accessToken: data.oauthToken,
      channelId: data.channelName.toLowerCase(),
      botUsername: data.botUsername || data.channelName,
    });
  };

  const onKickSubmit = (data: KickConnectionForm) => {
    onConnect({
      platform,
      platformUsername: data.channelName,
      accessToken: data.bearerToken || "",
      channelId: data.channelName.toLowerCase(),
      bearerToken: data.bearerToken,
      cookies: data.cookies,
    });
  };

  const onYouTubeConnect = () => {
    // YouTube uses Replit connector, just mark as connected
    onConnect({
      platform: "youtube",
      platformUsername: "YouTube User",
      accessToken: "connector_managed",
      channelId: "youtube_channel",
    });
  };

  // YouTube dialog (uses Replit connector)
  if (platform === "youtube") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect YouTube Channel</DialogTitle>
            <DialogDescription>
              Connect your YouTube channel to post to livestream chats
            </DialogDescription>
          </DialogHeader>

          <Alert data-testid="alert-youtube-instructions">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">YouTube uses Replit's secure integration:</p>
                <ol className="list-decimal ml-4 space-y-1 text-sm">
                  <li>Your YouTube account is already connected via Replit</li>
                  <li>Click "Connect Channel" to enable posting to livestreams</li>
                  <li>The bot will post to your active livestream's chat</li>
                  <li>Make sure you have an active livestream running</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={onYouTubeConnect}
              disabled={isPending}
              data-testid="button-connect"
            >
              {isPending ? "Connecting..." : "Connect Channel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Kick dialog
  if (platform === "kick") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect Kick Channel</DialogTitle>
            <DialogDescription>
              Connect your Kick channel to start posting AI-generated facts
            </DialogDescription>
          </DialogHeader>

          <Alert data-testid="alert-kick-instructions">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">How to connect Kick:</p>
                <ol className="list-decimal ml-4 space-y-1 text-sm">
                  <li>Enter your Kick channel name (required)</li>
                  <li>Optionally add bearer token + cookies for posting (read-only without)</li>
                  <li>Bot will listen to chat triggers and post scheduled facts</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>

          <Form {...kickForm}>
            <form onSubmit={kickForm.handleSubmit(onKickSubmit)} className="space-y-4">
              <FormField
                control={kickForm.control}
                name="channelName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kick Channel Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="your_channel_name"
                        data-testid="input-channel-name"
                      />
                    </FormControl>
                    <FormDescription>
                      Your Kick channel username (lowercase)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={kickForm.control}
                name="bearerToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bearer Token (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Optional: For posting messages"
                        data-testid="input-bearer-token"
                      />
                    </FormControl>
                    <FormDescription>
                      Required for posting messages (optional for read-only)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={kickForm.control}
                name="cookies"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cookies (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Optional: Session cookies"
                        data-testid="input-cookies"
                      />
                    </FormControl>
                    <FormDescription>
                      Session cookies if using bearer token auth
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  data-testid="button-connect"
                >
                  {isPending ? "Connecting..." : "Connect Channel"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }

  // Twitch dialog (default)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect Twitch Channel</DialogTitle>
          <DialogDescription>
            Connect your Twitch channel to start posting AI-generated facts
          </DialogDescription>
        </DialogHeader>

        <Alert data-testid="alert-twitch-instructions">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">How to get your Twitch OAuth token:</p>
              <ol className="list-decimal ml-4 space-y-1 text-sm">
                <li>
                  Visit{" "}
                  <a
                    href="https://twitchapps.com/tmi/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                    data-testid="link-twitch-oauth"
                  >
                    twitchapps.com/tmi
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Click "Connect" and authorize the application</li>
                <li>Copy the OAuth token (starts with "oauth:")</li>
                <li>Paste it below along with your channel name</li>
              </ol>
            </div>
          </AlertDescription>
        </Alert>

        <Form {...twitchForm}>
          <form onSubmit={twitchForm.handleSubmit(onTwitchSubmit)} className="space-y-4">
            <FormField
              control={twitchForm.control}
              name="channelName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Twitch Channel Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="your_channel_name"
                      data-testid="input-channel-name"
                    />
                  </FormControl>
                  <FormDescription>
                    Your Twitch channel username (without the @)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={twitchForm.control}
              name="oauthToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>OAuth Token</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder="oauth:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      data-testid="input-oauth-token"
                    />
                  </FormControl>
                  <FormDescription>
                    The OAuth token from twitchapps.com/tmi (keep this secret!)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={twitchForm.control}
              name="botUsername"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bot Username (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Leave empty to use your channel name"
                      data-testid="input-bot-username"
                    />
                  </FormControl>
                  <FormDescription>
                    The username that will post facts (defaults to your channel
                    name)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-connect"
              >
                {isPending ? "Connecting..." : "Connect Channel"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
