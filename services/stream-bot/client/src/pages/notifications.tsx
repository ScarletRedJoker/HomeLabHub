import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Bell, Check, CheckCheck, Trash2, Loader2, Inbox, Users, Heart, Gift, MessageCircle, Radio, Tv } from "lucide-react";
import { SiTwitch, SiYoutube, SiKick } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";

interface StreamNotification {
  id: string;
  userId: string;
  platform: "twitch" | "youtube" | "kick";
  notificationType: "follow" | "sub" | "donation" | "mention" | "raid" | "host";
  title: string;
  message: string;
  senderName: string;
  senderAvatar?: string;
  amount?: number;
  currency?: string;
  isRead: boolean;
  createdAt: string;
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

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  follow: Users,
  sub: Heart,
  donation: Gift,
  mention: MessageCircle,
  raid: Radio,
  host: Tv,
};

const typeBadgeColors: Record<string, string> = {
  follow: "bg-blue-500/20 text-blue-500",
  sub: "bg-purple-500/20 text-purple-500",
  donation: "bg-green-500/20 text-green-500",
  mention: "bg-yellow-500/20 text-yellow-500",
  raid: "bg-orange-500/20 text-orange-500",
  host: "bg-pink-500/20 text-pink-500",
};

export default function Notifications() {
  const { toast } = useToast();
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: notifications = [], isLoading, refetch } = useQuery<StreamNotification[]>({
    queryKey: ["/api/notifications", platformFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (platformFilter !== "all") params.set("platform", platformFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await apiRequest("GET", `/api/notifications?${params.toString()}`);
      return await res.json();
    },
  });

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications/unread-count");
      const data = await res.json();
      return data.count;
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PUT", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/notifications/read-all");
    },
    onSuccess: (_, __, ___) => {
      toast({ title: "All notifications marked as read" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("DELETE", `/api/notifications/${notificationId}`);
    },
    onSuccess: () => {
      toast({ title: "Notification deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const handleMarkAsRead = (notification: StreamNotification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
  };

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const Icon = platformIcons[platform];
    return Icon ? <Icon className={`h-4 w-4 ${platformColors[platform]}`} /> : null;
  };

  const TypeIcon = ({ type }: { type: string }) => {
    const Icon = typeIcons[type];
    return Icon ? <Icon className="h-3 w-3" /> : null;
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount} new
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            Stay updated with activity from all your connected platforms
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            {markAllReadMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4 mr-2" />
            )}
            Mark All Read
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="space-y-2">
              <CardDescription>Platform</CardDescription>
              <Tabs value={platformFilter} onValueChange={setPlatformFilter}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="twitch" className="gap-1">
                    <SiTwitch className="h-3 w-3" /> Twitch
                  </TabsTrigger>
                  <TabsTrigger value="youtube" className="gap-1">
                    <SiYoutube className="h-3 w-3" /> YouTube
                  </TabsTrigger>
                  <TabsTrigger value="kick" className="gap-1">
                    <SiKick className="h-3 w-3" /> Kick
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-2">
              <CardDescription>Type</CardDescription>
              <Tabs value={typeFilter} onValueChange={setTypeFilter}>
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="follow">Follows</TabsTrigger>
                  <TabsTrigger value="sub">Subs</TabsTrigger>
                  <TabsTrigger value="donation">Donations</TabsTrigger>
                  <TabsTrigger value="mention">Mentions</TabsTrigger>
                  <TabsTrigger value="raid">Raids</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No notifications</h3>
              <p className="text-muted-foreground text-sm">
                {platformFilter !== "all" || typeFilter !== "all"
                  ? "No notifications match your current filters"
                  : "You're all caught up! New notifications will appear here."}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleMarkAsRead(notification)}
                    className={`
                      p-4 rounded-lg border cursor-pointer transition-all
                      ${notification.isRead 
                        ? "bg-muted/30 hover:bg-muted/50" 
                        : "bg-primary/5 border-primary/20 hover:bg-primary/10 shadow-sm"
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={notification.senderAvatar} />
                        <AvatarFallback>
                          {notification.senderName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <PlatformIcon platform={notification.platform} />
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${typeBadgeColors[notification.notificationType]}`}
                          >
                            <TypeIcon type={notification.notificationType} />
                            <span className="ml-1 capitalize">{notification.notificationType}</span>
                          </Badge>
                          {!notification.isRead && (
                            <span className="h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="font-medium text-sm">
                          <span className="font-semibold">{notification.senderName}</span>{" "}
                          {notification.message}
                        </p>
                        {notification.amount !== undefined && (
                          <p className="text-sm text-green-500 font-medium mt-1">
                            {notification.currency && notification.currency !== "viewers" 
                              ? `${notification.currency} ${notification.amount.toFixed(2)}`
                              : notification.notificationType === "raid" 
                                ? `${notification.amount} viewers`
                                : `Tier ${notification.amount}`
                            }
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsReadMutation.mutate(notification.id);
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(notification.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
