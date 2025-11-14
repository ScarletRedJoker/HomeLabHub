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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Coins, Gift, Trophy, History, Clock, Trash2, Plus, Check, X } from "lucide-react";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const currencySettingsSchema = z.object({
  currencyName: z.string().min(1).max(50),
  currencySymbol: z.string().min(1).max(10),
  earnPerMessage: z.number().min(0).max(100),
  earnPerMinute: z.number().min(0).max(100),
  startingBalance: z.number().min(0).max(10000),
  maxBalance: z.number().min(0).max(1000000),
  enableGambling: z.boolean(),
});

type CurrencySettingsFormValues = z.infer<typeof currencySettingsSchema>;

const rewardSchema = z.object({
  rewardName: z.string().min(1).max(100),
  cost: z.number().min(1),
  command: z.string().optional(),
  stock: z.number().min(-1).optional(),
  maxRedeems: z.number().min(-1).optional(),
  isActive: z.boolean(),
});

type RewardFormValues = z.infer<typeof rewardSchema>;

interface CurrencySettings {
  userId: string;
  currencyName: string;
  currencySymbol: string;
  earnPerMessage: number;
  earnPerMinute: number;
  startingBalance: number;
  maxBalance: number;
  enableGambling: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Reward {
  id: number;
  userId: string;
  rewardName: string;
  cost: number;
  command?: string;
  stock?: number;
  maxRedeems?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LeaderboardEntry {
  username: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

interface Transaction {
  id: number;
  userId: string;
  username: string;
  amount: number;
  type: string;
  reason: string;
  timestamp: string;
}

interface Redemption {
  id: number;
  rewardId: number;
  username: string;
  redeemedAt: string;
  fulfilled: boolean;
  rewardName?: string;
  cost?: number;
}

export default function Currency() {
  const { toast } = useToast();
  const [isCreateRewardDialogOpen, setIsCreateRewardDialogOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<CurrencySettings>({
    queryKey: ["/api/currency/settings"],
  });

  const { data: rewards, isLoading: rewardsLoading } = useQuery<Reward[]>({
    queryKey: ["/api/rewards"],
  });

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/currency/leaderboard?limit=10"],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/currency/transactions?limit=50"],
  });

  const { data: redemptions, isLoading: redemptionsLoading } = useQuery<Redemption[]>({
    queryKey: ["/api/currency/redemptions?limit=50"],
  });

  const settingsForm = useForm<CurrencySettingsFormValues>({
    resolver: zodResolver(currencySettingsSchema),
    defaultValues: {
      currencyName: "Points",
      currencySymbol: "⭐",
      earnPerMessage: 1,
      earnPerMinute: 10,
      startingBalance: 100,
      maxBalance: 100000,
      enableGambling: true,
    },
  });

  const rewardForm = useForm<RewardFormValues>({
    resolver: zodResolver(rewardSchema),
    defaultValues: {
      rewardName: "",
      cost: 100,
      command: "",
      stock: -1,
      maxRedeems: -1,
      isActive: true,
    },
  });

  useEffect(() => {
    if (settings) {
      settingsForm.reset({
        currencyName: settings.currencyName || "Points",
        currencySymbol: settings.currencySymbol || "⭐",
        earnPerMessage: settings.earnPerMessage || 1,
        earnPerMinute: settings.earnPerMinute || 10,
        startingBalance: settings.startingBalance || 100,
        maxBalance: settings.maxBalance || 100000,
        enableGambling: settings.enableGambling ?? true,
      });
    }
  }, [settings, settingsForm]);

  useEffect(() => {
    if (editingReward) {
      rewardForm.reset({
        rewardName: editingReward.rewardName,
        cost: editingReward.cost,
        command: editingReward.command || "",
        stock: editingReward.stock ?? -1,
        maxRedeems: editingReward.maxRedeems ?? -1,
        isActive: editingReward.isActive,
      });
    }
  }, [editingReward, rewardForm]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: CurrencySettingsFormValues) => {
      return await apiRequest("/api/currency/settings", {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/currency/settings"] });
      toast({
        title: "Success",
        description: "Currency settings updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update currency settings",
        variant: "destructive",
      });
    },
  });

  const createRewardMutation = useMutation({
    mutationFn: async (data: RewardFormValues) => {
      return await apiRequest("/api/rewards", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rewards"] });
      toast({
        title: "Success",
        description: "Reward created successfully",
      });
      setIsCreateRewardDialogOpen(false);
      rewardForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create reward",
        variant: "destructive",
      });
    },
  });

  const updateRewardMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: RewardFormValues }) => {
      return await apiRequest(`/api/rewards/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rewards"] });
      toast({
        title: "Success",
        description: "Reward updated successfully",
      });
      setEditingReward(null);
      rewardForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update reward",
        variant: "destructive",
      });
    },
  });

  const deleteRewardMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/rewards/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rewards"] });
      toast({
        title: "Success",
        description: "Reward deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete reward",
        variant: "destructive",
      });
    },
  });

  const fulfillRedemptionMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/currency/redemptions/${id}/fulfill`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/currency/redemptions"] });
      toast({
        title: "Success",
        description: "Redemption fulfilled",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fulfill redemption",
        variant: "destructive",
      });
    },
  });

  const onSettingsSubmit = (data: CurrencySettingsFormValues) => {
    updateSettingsMutation.mutate(data);
  };

  const onRewardSubmit = (data: RewardFormValues) => {
    if (editingReward) {
      updateRewardMutation.mutate({ id: editingReward.id, data });
    } else {
      createRewardMutation.mutate(data);
    }
  };

  const handleDeleteReward = (id: number) => {
    if (confirm("Are you sure you want to delete this reward?")) {
      deleteRewardMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Currency System</h1>
        <p className="text-muted-foreground">
          Manage your custom channel points, rewards, and economy
        </p>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">
            <Coins className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="rewards">
            <Gift className="h-4 w-4 mr-2" />
            Rewards
          </TabsTrigger>
          <TabsTrigger value="leaderboard">
            <Trophy className="h-4 w-4 mr-2" />
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <History className="h-4 w-4 mr-2" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="redemptions">
            <Clock className="h-4 w-4 mr-2" />
            Redemptions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Currency Settings</CardTitle>
              <CardDescription>
                Configure your custom currency name, symbol, and earning rates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <Form {...settingsForm}>
                  <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={settingsForm.control}
                        name="currencyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Currency Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Points" {...field} />
                            </FormControl>
                            <FormDescription>
                              The name of your custom currency (e.g., "SnappleCoins")
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={settingsForm.control}
                        name="currencySymbol"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Currency Symbol</FormLabel>
                            <FormControl>
                              <Input placeholder="⭐" {...field} />
                            </FormControl>
                            <FormDescription>
                              The symbol/emoji for your currency
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={settingsForm.control}
                        name="earnPerMessage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Points Per Message</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormDescription>
                              Points earned per chat message
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={settingsForm.control}
                        name="earnPerMinute"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Points Per Minute</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormDescription>
                              Points earned per minute watched (passive income)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={settingsForm.control}
                        name="startingBalance"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Starting Balance</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormDescription>
                              Initial points for new users
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={settingsForm.control}
                        name="maxBalance"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Balance</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormDescription>
                              Maximum points a user can have
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={settingsForm.control}
                      name="enableGambling"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable Gambling</FormLabel>
                            <FormDescription>
                              Allow users to use the !gamble command
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={updateSettingsMutation.isPending}>
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
        </TabsContent>

        <TabsContent value="rewards" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Rewards Manager</CardTitle>
                  <CardDescription>
                    Create and manage custom rewards that viewers can redeem
                  </CardDescription>
                </div>
                <Dialog open={isCreateRewardDialogOpen} onOpenChange={setIsCreateRewardDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => {
                      setEditingReward(null);
                      rewardForm.reset();
                    }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Reward
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>
                        {editingReward ? "Edit Reward" : "Create New Reward"}
                      </DialogTitle>
                      <DialogDescription>
                        Configure a reward that viewers can redeem with their points
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...rewardForm}>
                      <form onSubmit={rewardForm.handleSubmit(onRewardSubmit)} className="space-y-4">
                        <FormField
                          control={rewardForm.control}
                          name="rewardName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reward Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Song Request" {...field} />
                              </FormControl>
                              <FormDescription>
                                The name of the reward (what users will see)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={rewardForm.control}
                          name="cost"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cost</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                />
                              </FormControl>
                              <FormDescription>
                                How many points this reward costs
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={rewardForm.control}
                          name="command"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Command (Optional)</FormLabel>
                              <FormControl>
                                <Input placeholder="!songrequest" {...field} />
                              </FormControl>
                              <FormDescription>
                                Custom command to trigger this reward
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={rewardForm.control}
                            name="stock"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Stock</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Available quantity (-1 for unlimited)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={rewardForm.control}
                            name="maxRedeems"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Max Redeems Per User</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Max per user (-1 for unlimited)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={rewardForm.control}
                          name="isActive"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Active</FormLabel>
                                <FormDescription>
                                  Enable or disable this reward
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <DialogFooter>
                          <Button type="submit" disabled={createRewardMutation.isPending || updateRewardMutation.isPending}>
                            {(createRewardMutation.isPending || updateRewardMutation.isPending) ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="mr-2 h-4 w-4" />
                                {editingReward ? "Update Reward" : "Create Reward"}
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {rewardsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : rewards && rewards.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reward Name</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Max Redeems</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rewards.map((reward) => (
                      <TableRow key={reward.id}>
                        <TableCell className="font-medium">{reward.rewardName}</TableCell>
                        <TableCell>
                          {reward.cost} {settings?.currencySymbol || "⭐"}
                        </TableCell>
                        <TableCell>
                          {reward.stock === -1 ? "Unlimited" : reward.stock}
                        </TableCell>
                        <TableCell>
                          {reward.maxRedeems === -1 ? "Unlimited" : reward.maxRedeems}
                        </TableCell>
                        <TableCell>
                          <Badge variant={reward.isActive ? "default" : "secondary"}>
                            {reward.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingReward(reward);
                                setIsCreateRewardDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteReward(reward.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No rewards created yet. Click "Create Reward" to get started!
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaderboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Currency Leaderboard</CardTitle>
              <CardDescription>
                Top users by {settings?.currencyName || "Points"} balance
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leaderboardLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : leaderboard && leaderboard.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Total Earned</TableHead>
                      <TableHead>Total Spent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.map((entry, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-bold">
                          {index === 0 && "🥇"}
                          {index === 1 && "🥈"}
                          {index === 2 && "🥉"}
                          {index > 2 && `#${index + 1}`}
                        </TableCell>
                        <TableCell className="font-medium">{entry.username}</TableCell>
                        <TableCell>
                          {entry.balance} {settings?.currencySymbol || "⭐"}
                        </TableCell>
                        <TableCell className="text-green-600">
                          +{entry.totalEarned} {settings?.currencySymbol || "⭐"}
                        </TableCell>
                        <TableCell className="text-red-600">
                          -{entry.totalSpent} {settings?.currencySymbol || "⭐"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No leaderboard data available yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>
                Recent currency transactions across all users
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : transactions && transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-medium">{tx.username}</TableCell>
                        <TableCell className={tx.amount > 0 ? "text-green-600" : "text-red-600"}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount} {settings?.currencySymbol || "⭐"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{tx.type}</Badge>
                        </TableCell>
                        <TableCell>{tx.reason}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No transactions yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redemptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Redemption Queue</CardTitle>
              <CardDescription>
                Manage reward redemptions from your viewers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {redemptionsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : redemptions && redemptions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Redeemed At</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.map((redemption) => {
                      const reward = rewards?.find(r => r.id === redemption.rewardId);
                      return (
                        <TableRow key={redemption.id}>
                          <TableCell className="font-medium">{redemption.username}</TableCell>
                          <TableCell>{reward?.rewardName || "Unknown"}</TableCell>
                          <TableCell>
                            {reward?.cost || 0} {settings?.currencySymbol || "⭐"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(redemption.redeemedAt), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={redemption.fulfilled ? "default" : "secondary"}>
                              {redemption.fulfilled ? (
                                <>
                                  <Check className="mr-1 h-3 w-3" />
                                  Fulfilled
                                </>
                              ) : (
                                <>
                                  <Clock className="mr-1 h-3 w-3" />
                                  Pending
                                </>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {!redemption.fulfilled && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fulfillRedemptionMutation.mutate(redemption.id)}
                                disabled={fulfillRedemptionMutation.isPending}
                              >
                                <Check className="mr-1 h-4 w-4" />
                                Fulfill
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No redemptions yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
