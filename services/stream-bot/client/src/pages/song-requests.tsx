import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Music, Play, SkipForward, Trash2, Info, Ban, Clock, AlertCircle } from "lucide-react";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const songSettingsSchema = z.object({
  enableSongRequests: z.boolean(),
  maxQueueSize: z.number().min(1).max(100),
  maxSongsPerUser: z.number().min(1).max(20),
  allowDuplicates: z.boolean(),
  profanityFilter: z.boolean(),
  volumeLimit: z.number().min(0).max(100),
});

type SongSettingsFormValues = z.infer<typeof songSettingsSchema>;

interface SongSettings {
  userId: string;
  enableSongRequests: boolean;
  maxQueueSize: number;
  maxSongsPerUser: number;
  allowDuplicates: boolean;
  profanityFilter: boolean;
  bannedSongs: string[];
  volumeLimit: number;
  createdAt: string;
  updatedAt: string;
}

interface SongQueue {
  id: string;
  userId: string;
  requestedBy: string;
  songTitle: string;
  artist: string;
  url: string;
  platform: string;
  status: string;
  requestedAt: string;
  playedAt?: string;
}

export default function SongRequests() {
  const { toast } = useToast();
  const [songToRemove, setSongToRemove] = useState<string | null>(null);
  const [songToBan, setSongToBan] = useState<{ url: string; title: string } | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<SongSettings>({
    queryKey: ["/api/songrequest/settings"],
  });

  const { data: queue, isLoading: queueLoading } = useQuery<SongQueue[]>({
    queryKey: ["/api/songrequest/queue"],
    refetchInterval: 5000,
  });

  const { data: current, isLoading: currentLoading } = useQuery<SongQueue | null>({
    queryKey: ["/api/songrequest/current"],
    refetchInterval: 5000,
  });

  const { data: history, isLoading: historyLoading } = useQuery<SongQueue[]>({
    queryKey: ["/api/songrequest/history"],
  });

  const form = useForm<SongSettingsFormValues>({
    resolver: zodResolver(songSettingsSchema),
    defaultValues: {
      enableSongRequests: true,
      maxQueueSize: 20,
      maxSongsPerUser: 3,
      allowDuplicates: false,
      profanityFilter: true,
      volumeLimit: 80,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        enableSongRequests: settings.enableSongRequests,
        maxQueueSize: settings.maxQueueSize,
        maxSongsPerUser: settings.maxSongsPerUser,
        allowDuplicates: settings.allowDuplicates,
        profanityFilter: settings.profanityFilter,
        volumeLimit: settings.volumeLimit,
      });
    }
  }, [settings, form]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SongSettingsFormValues) => {
      return await apiRequest("PATCH", "/api/songrequest/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songrequest/settings"] });
      toast({
        title: "Settings saved",
        description: "Your song request settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save song request settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const skipSongMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/songrequest/skip", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songrequest/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/songrequest/queue"] });
      toast({
        title: "Song skipped",
        description: "Moved to the next song in queue.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to skip song. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeSongMutation = useMutation({
    mutationFn: async (songId: string) => {
      return await apiRequest("DELETE", `/api/songrequest/${songId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songrequest/queue"] });
      setSongToRemove(null);
      toast({
        title: "Song removed",
        description: "Song has been removed from the queue.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove song. Please try again.",
        variant: "destructive",
      });
    },
  });

  const banSongMutation = useMutation({
    mutationFn: async (songUrl: string) => {
      return await apiRequest("POST", `/api/songrequest/ban/temp`, { songUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songrequest/settings"] });
      setSongToBan(null);
      toast({
        title: "Song banned",
        description: "Song has been added to the ban list.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to ban song. Please try again.",
        variant: "destructive",
      });
    },
  });

  const playNextMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/songrequest/next", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songrequest/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/songrequest/queue"] });
      toast({
        title: "Playing next song",
        description: "Started playing the next song in queue.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to play next song. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SongSettingsFormValues) => {
    updateSettingsMutation.mutate(data);
  };

  const getPlatformBadge = (platform: string) => {
    switch (platform) {
      case "spotify":
        return <Badge className="bg-green-600">Spotify</Badge>;
      case "youtube":
        return <Badge className="bg-red-600">YouTube</Badge>;
      default:
        return <Badge>{platform}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Music className="h-8 w-8" />
          Song Request System
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage song requests with Spotify & YouTube integration
        </p>
      </div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          {current && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Now Playing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <h3 className="text-xl font-semibold">{current.songTitle}</h3>
                    <p className="text-muted-foreground">{current.artist}</p>
                    <div className="flex items-center gap-2">
                      {getPlatformBadge(current.platform)}
                      <Badge variant="outline">Requested by {current.requestedBy}</Badge>
                    </div>
                    <a 
                      href={current.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline inline-block"
                    >
                      Open in {current.platform === 'spotify' ? 'Spotify' : 'YouTube'}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => skipSongMutation.mutate()}
                      disabled={skipSongMutation.isPending}
                      size="sm"
                      variant="outline"
                    >
                      {skipSongMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <SkipForward className="h-4 w-4" />
                      )}
                      <span className="ml-2">Skip</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!current && !currentLoading && (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  <Music className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No song is currently playing</p>
                  {queue && queue.length > 0 && (
                    <Button
                      onClick={() => playNextMutation.mutate()}
                      disabled={playNextMutation.isPending}
                      className="mt-4"
                    >
                      {playNextMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Start Playing
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Queue ({queue?.length || 0})</CardTitle>
              <CardDescription>
                Upcoming song requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queueLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : !queue || queue.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Queue is empty</p>
                  <p className="text-sm mt-2">
                    Use <code>!songrequest</code> or <code>!sr</code> in chat to request songs
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Song</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.map((song, index) => (
                      <TableRow key={song.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium">{song.songTitle}</TableCell>
                        <TableCell>{song.artist}</TableCell>
                        <TableCell>{getPlatformBadge(song.platform)}</TableCell>
                        <TableCell>{song.requestedBy}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDistanceToNow(new Date(song.requestedAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              onClick={() => setSongToBan({ url: song.url, title: song.songTitle })}
                              size="sm"
                              variant="outline"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => setSongToRemove(song.id)}
                              size="sm"
                              variant="destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Song Request Settings</CardTitle>
              <CardDescription>
                Configure song request behavior and limits
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="enableSongRequests"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable Song Requests</FormLabel>
                            <FormDescription>
                              Allow viewers to request songs via chat commands
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="profanityFilter"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">AI Profanity Filter</FormLabel>
                            <FormDescription>
                              Use OpenAI to filter explicit content from song requests
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="allowDuplicates"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Allow Duplicate Songs</FormLabel>
                            <FormDescription>
                              Allow the same song to be queued multiple times
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="maxQueueSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Queue Size</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum number of songs that can be in the queue (1-100)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="maxSongsPerUser"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Songs Per User</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum number of songs a single user can have in queue (1-20)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="volumeLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Volume Limit (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum volume for song playback (0-100)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={updateSettingsMutation.isPending}
                      className="w-full"
                    >
                      {updateSettingsMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Settings
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>

          {settings && settings.bannedSongs && settings.bannedSongs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ban className="h-5 w-5" />
                  Banned Songs ({settings.bannedSongs.length})
                </CardTitle>
                <CardDescription>
                  Songs that cannot be requested
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {settings.bannedSongs.map((songUrl, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm font-mono truncate">{songUrl}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          apiRequest("DELETE", `/api/songrequest/ban/temp`, { songUrl }).then(() => {
                            queryClient.invalidateQueries({ queryKey: ["/api/songrequest/settings"] });
                            toast({
                              title: "Song unbanned",
                              description: "Song has been removed from the ban list.",
                            });
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Chat Commands</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-1 text-sm">
                <p><code>!songrequest &lt;song name&gt;</code> or <code>!sr &lt;song name&gt;</code> - Request a song</p>
                <p><code>!currentsong</code> or <code>!nowplaying</code> - Show now playing</p>
                <p><code>!queue</code> - Show next 5 songs</p>
                <p><code>!skipsong</code> - Skip current song (moderator only)</p>
                <p><code>!removesong &lt;position&gt;</code> - Remove from queue (moderator only)</p>
              </div>
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Request History
              </CardTitle>
              <CardDescription>
                Previously played songs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : !history || history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No song history yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Song</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Played At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((song) => (
                      <TableRow key={song.id}>
                        <TableCell className="font-medium">{song.songTitle}</TableCell>
                        <TableCell>{song.artist}</TableCell>
                        <TableCell>{getPlatformBadge(song.platform)}</TableCell>
                        <TableCell>{song.requestedBy}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {song.playedAt && formatDistanceToNow(new Date(song.playedAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!songToRemove} onOpenChange={() => setSongToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Song</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this song from the queue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => songToRemove && removeSongMutation.mutate(songToRemove)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!songToBan} onOpenChange={() => setSongToBan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban Song</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to ban "{songToBan?.title}"? This song will not be able to be requested in the future.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => songToBan && banSongMutation.mutate(songToBan.url)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ban Song
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
