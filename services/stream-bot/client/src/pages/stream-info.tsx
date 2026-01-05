import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { InfoBanner, HelpTooltip } from "@/components/HelpTooltip";
import { Loader2, Save, RefreshCw, Check, X, AlertCircle, Gamepad2, Info } from "lucide-react";
import { SiTwitch, SiYoutube, SiKick } from "react-icons/si";

interface StreamInfo {
  title?: string;
  game?: string;
  gameId?: string;
  tags?: string[];
  description?: string;
}

interface PlatformStreamInfo {
  platform: string;
  connected: boolean;
  isLive?: boolean;
  info?: StreamInfo;
  error?: string;
}

interface Game {
  id: string;
  name: string;
  boxArtUrl: string;
}

const platformIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  twitch: SiTwitch,
  youtube: SiYoutube,
  kick: SiKick,
};

const platformColors: Record<string, string> = {
  twitch: "text-purple-500",
  youtube: "text-red-500",
  kick: "text-green-500",
};

const platformBgColors: Record<string, string> = {
  twitch: "bg-purple-500/10 border-purple-500/20",
  youtube: "bg-red-500/10 border-red-500/20",
  kick: "bg-green-500/10 border-green-500/20",
};

export default function StreamInfo() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [game, setGame] = useState("");
  const [gameId, setGameId] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [gameSearch, setGameSearch] = useState("");
  const [showGameDropdown, setShowGameDropdown] = useState(false);

  const { data: streamInfo, isLoading, refetch } = useQuery<PlatformStreamInfo[]>({
    queryKey: ["/api/stream-info"],
    refetchInterval: 30000,
  });

  const { data: games, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/stream-info/games", gameSearch],
    enabled: gameSearch.length >= 2,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      gameId: string;
      game: string;
      tags: string[];
      description: string;
      platforms: string[];
    }) => {
      return await apiRequest("PUT", "/api/stream-info", data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stream-info"] });
      
      const results = data.results || [];
      const successes = results.filter((r: any) => r.success);
      const failures = results.filter((r: any) => !r.success);
      
      if (failures.length === 0) {
        toast({
          title: "Stream Info Updated",
          description: `Successfully updated ${successes.length} platform${successes.length !== 1 ? 's' : ''}.`,
        });
      } else if (successes.length > 0) {
        toast({
          title: "Partial Update",
          description: `Updated ${successes.length} platform(s). ${failures.length} failed: ${failures.map((f: any) => f.platform).join(', ')}`,
          variant: "default",
        });
      } else {
        toast({
          title: "Update Failed",
          description: failures.map((f: any) => `${f.platform}: ${f.error}`).join('; '),
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update stream info. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (streamInfo) {
      const connectedPlatforms = streamInfo.filter(p => p.connected);
      if (connectedPlatforms.length > 0 && selectedPlatforms.length === 0) {
        setSelectedPlatforms(connectedPlatforms.map(p => p.platform));
      }

      const twitch = streamInfo.find(p => p.platform === 'twitch' && p.connected);
      if (twitch?.info) {
        if (!title && twitch.info.title) setTitle(twitch.info.title);
        if (!game && twitch.info.game) {
          setGame(twitch.info.game);
          setGameId(twitch.info.gameId || '');
        }
        if (!tags && twitch.info.tags?.length) setTags(twitch.info.tags.join(', '));
      }

      const youtube = streamInfo.find(p => p.platform === 'youtube' && p.connected);
      if (youtube?.info && !description && youtube.info.description) {
        setDescription(youtube.info.description);
      }
    }
  }, [streamInfo]);

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({
        title: "Missing Title",
        description: "Please enter a stream title.",
        variant: "destructive",
      });
      return;
    }

    if (selectedPlatforms.length === 0) {
      toast({
        title: "No Platforms Selected",
        description: "Please select at least one platform to update.",
        variant: "destructive",
      });
      return;
    }

    const tagsArray = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .slice(0, 10);

    updateMutation.mutate({
      title,
      gameId,
      game,
      tags: tagsArray,
      description,
      platforms: selectedPlatforms,
    });
  };

  const handleGameSelect = (selectedGame: Game) => {
    setGame(selectedGame.name);
    setGameId(selectedGame.id);
    setGameSearch("");
    setShowGameDropdown(false);
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const selectAllPlatforms = () => {
    const connectedPlatforms = streamInfo?.filter(p => p.connected).map(p => p.platform) || [];
    setSelectedPlatforms(connectedPlatforms);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const connectedPlatforms = streamInfo?.filter(p => p.connected) || [];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold candy-gradient-text">Stream Info Editor</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-0.5 sm:mt-1">
            Update your stream title, game, and tags across all platforms
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      <InfoBanner
        title="How to use Stream Info Editor"
        description="Update your stream title, category, and tags all at once across multiple platforms. Changes apply immediately when you click 'Apply'. This is much faster than updating each platform separately!"
        variant="info"
      />

      <Card className="candy-glass-card">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">Current Stream Info</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            View and compare your current stream info across platforms
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <div className="grid gap-4 sm:grid-cols-3">
            {streamInfo?.map((platform) => {
              const Icon = platformIcons[platform.platform];
              const colorClass = platformColors[platform.platform];
              const bgClass = platformBgColors[platform.platform];

              return (
                <div
                  key={platform.platform}
                  className={`p-4 rounded-lg border ${bgClass} ${!platform.connected ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {Icon && <Icon className={`h-5 w-5 ${colorClass}`} />}
                    <span className="font-medium capitalize">{platform.platform}</span>
                    {platform.isLive && (
                      <Badge variant="secondary" className="ml-auto bg-red-500 text-white text-xs">
                        LIVE
                      </Badge>
                    )}
                    {!platform.connected && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        Not Connected
                      </Badge>
                    )}
                  </div>

                  {platform.connected && !platform.error && platform.info && (
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Title: </span>
                        <span className="font-medium">{platform.info.title || 'Not set'}</span>
                      </div>
                      {platform.platform === 'twitch' && (
                        <div>
                          <span className="text-muted-foreground">Game: </span>
                          <span className="font-medium">{platform.info.game || 'Not set'}</span>
                        </div>
                      )}
                      {platform.info.tags && platform.info.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {platform.info.tags.slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {platform.info.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{platform.info.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {platform.error && (
                    <div className="flex items-center gap-2 text-yellow-500 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-xs">{platform.error}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="candy-glass-card">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">Update Stream Info</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Set new stream info and apply to selected platforms
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="flex items-center gap-1">
                Stream Title
                <HelpTooltip content="Your stream title appears in search results and on your channel. Make it catchy and descriptive! Example: 'Chill Ranked Games | !discord !socials'" />
              </Label>
              <Input
                id="title"
                placeholder="Enter your stream title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={140}
              />
              <p className="text-xs text-muted-foreground text-right">
                {title.length}/140
              </p>
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="game">Game / Category</Label>
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Gamepad2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="game"
                      placeholder="Search for a game..."
                      value={gameSearch || game}
                      onChange={(e) => {
                        setGameSearch(e.target.value);
                        setShowGameDropdown(true);
                      }}
                      onFocus={() => setShowGameDropdown(true)}
                      className="pl-10"
                    />
                  </div>
                  {game && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setGame("");
                        setGameId("");
                        setGameSearch("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {showGameDropdown && games && games.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                    {games.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center gap-3 p-2 hover:bg-muted cursor-pointer"
                        onClick={() => handleGameSelect(g)}
                      >
                        {g.boxArtUrl && (
                          <img
                            src={g.boxArtUrl}
                            alt={g.name}
                            className="w-8 h-10 object-cover rounded"
                          />
                        )}
                        <span className="text-sm">{g.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {showGameDropdown && gamesLoading && gameSearch.length >= 2 && (
                  <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg p-3 text-center">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </div>
                )}
              </div>
              {game && (
                <p className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium">{game}</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags" className="flex items-center gap-1">
                Tags
                <HelpTooltip content="Tags help viewers find your stream. Use relevant tags like your game genre, language, or stream style. Example: English, Competitive, Chill Vibes" />
              </Label>
              <Input
                id="tags"
                placeholder="gaming, fun, chill (comma separated, max 10)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of tags (Twitch supports up to 10)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (YouTube only)</Label>
              <Textarea
                id="description"
                placeholder="Enter stream description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="candy-glass-card">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg">Select Platforms</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Choose which platforms to update
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllPlatforms}
              disabled={connectedPlatforms.length === 0}
            >
              Select All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <div className="grid gap-3 sm:grid-cols-3">
            {streamInfo?.map((platform) => {
              const Icon = platformIcons[platform.platform];
              const colorClass = platformColors[platform.platform];
              const isSelected = selectedPlatforms.includes(platform.platform);

              return (
                <div
                  key={platform.platform}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                    isSelected ? 'border-primary bg-primary/5' : ''
                  } ${!platform.connected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                  onClick={() => platform.connected && togglePlatform(platform.platform)}
                >
                  <div className="flex items-center gap-3">
                    {Icon && <Icon className={`h-5 w-5 ${colorClass}`} />}
                    <div>
                      <p className="font-medium capitalize">{platform.platform}</p>
                      <p className="text-xs text-muted-foreground">
                        {platform.connected ? (
                          platform.isLive ? 'Live' : 'Ready'
                        ) : (
                          'Not connected'
                        )}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isSelected}
                    onCheckedChange={() => platform.connected && togglePlatform(platform.platform)}
                    disabled={!platform.connected}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedPlatforms.length > 0 && (
        <Card className="candy-glass-card">
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Preview</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              How your stream info will appear on each platform
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="grid gap-4 sm:grid-cols-3">
              {selectedPlatforms.map((platform) => {
                const Icon = platformIcons[platform];
                const colorClass = platformColors[platform];
                const bgClass = platformBgColors[platform];

                return (
                  <div key={platform} className={`p-4 rounded-lg border ${bgClass}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {Icon && <Icon className={`h-5 w-5 ${colorClass}`} />}
                      <span className="font-medium capitalize">{platform}</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Title: </span>
                        <span className="font-medium">{title || 'Not set'}</span>
                      </div>
                      {platform === 'twitch' && (
                        <div>
                          <span className="text-muted-foreground">Game: </span>
                          <span className="font-medium">{game || 'Not set'}</span>
                        </div>
                      )}
                      {tags && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tags.split(',').slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {tag.trim()}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end sticky bottom-4 sm:static">
        <Button
          onClick={handleSubmit}
          disabled={updateMutation.isPending || selectedPlatforms.length === 0}
          className="candy-button border-0 h-10 sm:h-9 w-full sm:w-auto shadow-lg sm:shadow-none gap-2"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Apply to {selectedPlatforms.length} Platform{selectedPlatforms.length !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}
