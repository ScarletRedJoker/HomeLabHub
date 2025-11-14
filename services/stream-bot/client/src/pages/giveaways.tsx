import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trophy, Copy, Check, Trash2, Timer } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Giveaway {
  id: string;
  userId: string;
  title: string;
  keyword: string;
  isActive: boolean;
  requiresSubscription: boolean;
  maxWinners: number;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  entryCount?: number;
  winners?: GiveawayWinner[];
}

interface GiveawayEntry {
  id: string;
  giveawayId: string;
  userId: string;
  username: string;
  platform: string;
  subscriberStatus: boolean;
  enteredAt: string;
}

interface GiveawayWinner {
  id: string;
  giveawayId: string;
  username: string;
  platform: string;
  selectedAt: string;
}

const giveawayFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
  keyword: z.string().min(1, "Keyword is required").max(50, "Keyword too long"),
  requiresSubscription: z.boolean(),
  maxWinners: z.coerce.number().min(1, "At least 1 winner required").max(20, "Maximum 20 winners"),
});

type GiveawayFormValues = z.infer<typeof giveawayFormSchema>;

export default function Giveaways() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEndDialogOpen, setIsEndDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [selectedGiveaway, setSelectedGiveaway] = useState<Giveaway | null>(null);
  const [copiedWinners, setCopiedWinners] = useState(false);
  const [endResult, setEndResult] = useState<{ giveaway: Giveaway; winners: GiveawayWinner[] } | null>(null);

  const { data: giveaways, isLoading } = useQuery<Giveaway[]>({
    queryKey: ["/api/giveaways"],
  });

  const { data: activeGiveaway, refetch: refetchActiveGiveaway } = useQuery<Giveaway | null>({
    queryKey: ["/api/giveaways/active"],
  });

  const { data: entries, refetch: refetchEntries } = useQuery<GiveawayEntry[]>({
    queryKey: ["/api/giveaways", activeGiveaway?.id, "entries"],
    enabled: !!activeGiveaway?.id,
  });

  const form = useForm<GiveawayFormValues>({
    resolver: zodResolver(giveawayFormSchema),
    defaultValues: {
      title: "",
      keyword: "!enter",
      requiresSubscription: false,
      maxWinners: 1,
    },
  });

  useEffect(() => {
    const ws = new WebSocket(
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
    );

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "giveaway_entry") {
        refetchActiveGiveaway();
        refetchEntries();
      }
    };

    return () => ws.close();
  }, [refetchActiveGiveaway, refetchEntries]);

  const createMutation = useMutation({
    mutationFn: async (data: GiveawayFormValues) => {
      return await apiRequest("POST", "/api/giveaways", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways/active"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Giveaway started",
        description: "Your giveaway is now live! Users can enter using the keyword.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create giveaway",
        variant: "destructive",
      });
    },
  });

  const endMutation = useMutation({
    mutationFn: async (giveawayId: string) => {
      return await apiRequest("POST", `/api/giveaways/${giveawayId}/end`, {});
    },
    onSuccess: (result: { giveaway: Giveaway; winners: GiveawayWinner[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways/active"] });
      setEndResult(result);
      setIsEndDialogOpen(false);
      toast({
        title: "Giveaway ended",
        description: `${result.winners.length} winner(s) selected!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to end giveaway",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (giveawayId: string) => {
      return await apiRequest("DELETE", `/api/giveaways/${giveawayId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways/active"] });
      setIsCancelDialogOpen(false);
      setSelectedGiveaway(null);
      toast({
        title: "Giveaway cancelled",
        description: "The giveaway has been cancelled.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel giveaway",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GiveawayFormValues) => {
    createMutation.mutate(data);
  };

  const handleEndGiveaway = () => {
    if (activeGiveaway) {
      endMutation.mutate(activeGiveaway.id);
    }
  };

  const handleCancelGiveaway = () => {
    if (selectedGiveaway) {
      cancelMutation.mutate(selectedGiveaway.id);
    }
  };

  const copyWinnersToClipboard = () => {
    if (endResult) {
      const winnersText = endResult.winners
        .map((w) => `${w.username} (${w.platform})`)
        .join(", ");
      navigator.clipboard.writeText(winnersText);
      setCopiedWinners(true);
      setTimeout(() => setCopiedWinners(false), 2000);
      toast({
        title: "Copied",
        description: "Winners copied to clipboard",
      });
    }
  };

  const formatDuration = (start: string, end?: string | null) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const durationMs = endDate.getTime() - startDate.getTime();
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Giveaways</h1>
          <p className="text-muted-foreground">
            Run giveaways to engage your community
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!!activeGiveaway}>
              <Plus className="mr-2 h-4 w-4" />
              Start Giveaway
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Start New Giveaway</DialogTitle>
              <DialogDescription>
                Create a giveaway that your viewers can enter using a chat command
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Sub Giveaway" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="keyword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Entry Keyword</FormLabel>
                      <FormControl>
                        <Input placeholder="!enter" {...field} />
                      </FormControl>
                      <FormDescription>
                        Users type this in chat to enter
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxWinners"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Winners</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={20} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requiresSubscription"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Subscribers Only</FormLabel>
                        <FormDescription>
                          Only subscribers can enter
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
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Starting..." : "Start Giveaway"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {activeGiveaway && (
        <Card className="border-primary">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  {activeGiveaway.title}
                  <Badge variant="default">LIVE</Badge>
                </CardTitle>
                <CardDescription>
                  Started {formatDistanceToNow(new Date(activeGiveaway.startedAt))} ago
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedGiveaway(activeGiveaway);
                    setIsCancelDialogOpen(true);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsEndDialogOpen(true)}
                >
                  End & Pick Winners
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Entry Keyword</p>
                <p className="text-2xl font-mono">{activeGiveaway.keyword}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Entries</p>
                <p className="text-2xl font-bold">{entries?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Winners</p>
                <p className="text-2xl font-bold">{activeGiveaway.maxWinners}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <Badge variant="secondary">
                  {activeGiveaway.requiresSubscription ? "Subs Only" : "Everyone"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {endResult && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-green-500" />
              Giveaway Winners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {endResult.giveaway.title} - {endResult.winners.length} winner(s)
                  </p>
                  <div className="space-y-1">
                    {endResult.winners.map((winner) => (
                      <div key={winner.id} className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-yellow-500" />
                        <span className="font-semibold">{winner.username}</span>
                        <Badge variant="outline">{winner.platform}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyWinnersToClipboard}
                >
                  {copiedWinners ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copiedWinners ? "Copied!" : "Copy Names"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Past Giveaways</CardTitle>
          <CardDescription>History of your past giveaways</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : !giveaways || giveaways.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No giveaways yet. Start your first giveaway!
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Winners</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {giveaways.map((giveaway) => (
                  <TableRow key={giveaway.id}>
                    <TableCell className="font-medium">{giveaway.title}</TableCell>
                    <TableCell>
                      <code className="text-sm">{giveaway.keyword}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={giveaway.isActive ? "default" : "secondary"}>
                        {giveaway.isActive ? "Active" : "Ended"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Timer className="h-3 w-3" />
                        {formatDuration(giveaway.startedAt, giveaway.endedAt)}
                      </div>
                    </TableCell>
                    <TableCell>{giveaway.entryCount || 0}</TableCell>
                    <TableCell>
                      {giveaway.winners?.length || 0} / {giveaway.maxWinners}
                    </TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(giveaway.startedAt))} ago
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={isEndDialogOpen} onOpenChange={setIsEndDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Giveaway?</AlertDialogTitle>
            <AlertDialogDescription>
              This will randomly select {activeGiveaway?.maxWinners} winner(s) from{" "}
              {entries?.length || 0} entries. The winners will be announced in chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndGiveaway}
              disabled={endMutation.isPending || !entries || entries.length === 0}
            >
              {endMutation.isPending ? "Selecting..." : "End & Pick Winners"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Giveaway?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the giveaway without selecting winners. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Giveaway</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelGiveaway}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Giveaway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
