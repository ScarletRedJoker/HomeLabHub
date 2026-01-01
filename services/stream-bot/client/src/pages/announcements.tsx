import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Megaphone, Send, Trash2, Edit, Clock, Ban, PlayCircle, Calendar, Repeat } from "lucide-react";
import { SiTwitch, SiYoutube, SiDiscord } from "react-icons/si";
import { formatDistanceToNow, format } from "date-fns";

interface Announcement {
  id: string;
  userId: string;
  title: string;
  message: string;
  platforms: string[];
  scheduleType: "once" | "before_stream" | "recurring";
  scheduledTime: string | null;
  beforeStreamMinutes: number | null;
  cronPattern: string | null;
  discordWebhookUrl: string | null;
  status: "pending" | "sent" | "failed" | "cancelled";
  lastSentAt: string | null;
  nextRunAt: string | null;
  retryCount: number;
  errorMessage: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Templates {
  [key: string]: {
    title: string;
    message: string;
  };
}

const announcementFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
  message: z.string().min(1, "Message is required").max(1000, "Message too long"),
  platforms: z.array(z.string()).min(1, "Select at least one platform"),
  scheduleType: z.enum(["once", "before_stream", "recurring"]),
  scheduledTime: z.string().optional(),
  beforeStreamMinutes: z.coerce.number().min(1).max(120).optional(),
  cronPattern: z.string().optional(),
  discordWebhookUrl: z.string().url("Invalid webhook URL").optional().or(z.literal("")),
});

type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

const platformIcons: Record<string, React.ReactNode> = {
  twitch: <SiTwitch className="h-4 w-4 text-purple-500" />,
  youtube: <SiYoutube className="h-4 w-4 text-red-500" />,
  kick: <span className="h-4 w-4 text-green-500 font-bold text-xs">K</span>,
  discord: <SiDiscord className="h-4 w-4 text-indigo-500" />,
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  sent: "bg-green-500/20 text-green-500",
  failed: "bg-red-500/20 text-red-500",
  cancelled: "bg-gray-500/20 text-gray-500",
};

export default function Announcements() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);

  const { data: announcements, isLoading } = useQuery<Announcement[]>({
    queryKey: ["/api/announcements"],
  });

  const { data: templates } = useQuery<Templates>({
    queryKey: ["/api/announcements/templates"],
  });

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      title: "",
      message: "",
      platforms: [],
      scheduleType: "once",
      scheduledTime: "",
      beforeStreamMinutes: 15,
      cronPattern: "",
      discordWebhookUrl: "",
    },
  });

  const scheduleType = form.watch("scheduleType");
  const selectedPlatforms = form.watch("platforms");

  const createMutation = useMutation({
    mutationFn: async (data: AnnouncementFormValues) => {
      return await apiRequest("POST", "/api/announcements", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Announcement created",
        description: "Your announcement has been scheduled.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create announcement",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AnnouncementFormValues }) => {
      return await apiRequest("PUT", `/api/announcements/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      setIsDialogOpen(false);
      setEditingAnnouncement(null);
      form.reset();
      toast({
        title: "Announcement updated",
        description: "Your announcement has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update announcement",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/announcements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      setIsDeleteDialogOpen(false);
      setSelectedAnnouncement(null);
      toast({
        title: "Announcement deleted",
        description: "The announcement has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete announcement",
        variant: "destructive",
      });
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/announcements/${id}/send-now`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      if (data.success) {
        toast({
          title: "Announcement sent",
          description: "Your announcement was sent successfully.",
        });
      } else {
        toast({
          title: "Partial failure",
          description: "Some platforms failed. Check the announcement details.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send announcement",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/announcements/${id}/cancel`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      toast({
        title: "Announcement cancelled",
        description: "The announcement has been cancelled.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel announcement",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: AnnouncementFormValues) => {
    if (editingAnnouncement) {
      updateMutation.mutate({ id: editingAnnouncement.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    form.reset({
      title: announcement.title,
      message: announcement.message,
      platforms: announcement.platforms,
      scheduleType: announcement.scheduleType,
      scheduledTime: announcement.scheduledTime
        ? new Date(announcement.scheduledTime).toISOString().slice(0, 16)
        : "",
      beforeStreamMinutes: announcement.beforeStreamMinutes || 15,
      cronPattern: announcement.cronPattern || "",
      discordWebhookUrl: announcement.discordWebhookUrl || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setIsDeleteDialogOpen(true);
  };

  const handleUseTemplate = (templateKey: string) => {
    if (templates && templates[templateKey]) {
      form.setValue("title", templates[templateKey].title);
      form.setValue("message", templates[templateKey].message);
    }
  };

  const openCreateDialog = () => {
    setEditingAnnouncement(null);
    form.reset({
      title: "",
      message: "",
      platforms: [],
      scheduleType: "once",
      scheduledTime: "",
      beforeStreamMinutes: 15,
      cronPattern: "",
      discordWebhookUrl: "",
    });
    setIsDialogOpen(true);
  };

  const getScheduleInfo = (announcement: Announcement) => {
    switch (announcement.scheduleType) {
      case "once":
        return announcement.scheduledTime
          ? format(new Date(announcement.scheduledTime), "MMM d, yyyy 'at' h:mm a")
          : "One-time";
      case "before_stream":
        return `${announcement.beforeStreamMinutes} min before stream`;
      case "recurring":
        return announcement.cronPattern || "Recurring";
      default:
        return "Unknown";
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold candy-gradient-text">Announcements</h1>
          <p className="text-muted-foreground">
            Schedule automated messages for your streams
          </p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="candy-gradient hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Announcement
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="candy-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {announcements?.filter((a) => a.status === "pending" && a.isActive).length || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="candy-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5 text-green-500" />
              Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {announcements?.filter((a) => a.status === "sent").length || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="candy-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {announcements?.filter((a) => a.status === "failed").length || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="candy-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Scheduled Announcements
          </CardTitle>
          <CardDescription>
            Manage your scheduled announcements and automated messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !announcements?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No announcements yet</p>
              <p className="text-sm">Create your first announcement to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Platforms</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map((announcement) => (
                    <TableRow key={announcement.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{announcement.title}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {announcement.message}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {announcement.platforms.map((platform) => (
                            <span key={platform} title={platform}>
                              {platformIcons[platform]}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {announcement.scheduleType === "once" && <Calendar className="h-4 w-4" />}
                          {announcement.scheduleType === "before_stream" && <PlayCircle className="h-4 w-4" />}
                          {announcement.scheduleType === "recurring" && <Repeat className="h-4 w-4" />}
                          <span className="text-sm">{getScheduleInfo(announcement)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[announcement.status]}>
                          {announcement.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {announcement.nextRunAt && announcement.isActive ? (
                          <span className="text-sm">
                            {formatDistanceToNow(new Date(announcement.nextRunAt), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => sendNowMutation.mutate(announcement.id)}
                            disabled={sendNowMutation.isPending}
                            title="Send now"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(announcement)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {announcement.isActive && announcement.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => cancelMutation.mutate(announcement.id)}
                              disabled={cancelMutation.isPending}
                              title="Cancel"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(announcement)}
                            className="text-destructive hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement ? "Edit Announcement" : "Create Announcement"}
            </DialogTitle>
            <DialogDescription>
              Schedule an automated message for your streams
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {templates && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-sm text-muted-foreground">Templates:</span>
                  {Object.keys(templates).map((key) => (
                    <Button
                      key={key}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleUseTemplate(key)}
                    >
                      {templates[key].title}
                    </Button>
                  ))}
                </div>
              )}

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Going Live!" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="We're LIVE! Come hang out at the stream!"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The message to send to your selected platforms
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="platforms"
                render={() => (
                  <FormItem>
                    <FormLabel>Platforms</FormLabel>
                    <div className="grid grid-cols-2 gap-4">
                      {["twitch", "youtube", "kick", "discord"].map((platform) => (
                        <FormField
                          key={platform}
                          control={form.control}
                          name="platforms"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(platform)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, platform])
                                      : field.onChange(field.value.filter((v) => v !== platform));
                                  }}
                                />
                              </FormControl>
                              <Label className="flex items-center gap-2 cursor-pointer">
                                {platformIcons[platform]}
                                {platform.charAt(0).toUpperCase() + platform.slice(1)}
                              </Label>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedPlatforms.includes("discord") && (
                <FormField
                  control={form.control}
                  name="discordWebhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discord Webhook URL</FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          placeholder="https://discord.com/api/webhooks/..."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Create a webhook in your Discord server settings
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="scheduleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="once">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            One-time
                          </div>
                        </SelectItem>
                        <SelectItem value="before_stream">
                          <div className="flex items-center gap-2">
                            <PlayCircle className="h-4 w-4" />
                            Before Stream
                          </div>
                        </SelectItem>
                        <SelectItem value="recurring">
                          <div className="flex items-center gap-2">
                            <Repeat className="h-4 w-4" />
                            Recurring
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {scheduleType === "once" && (
                <FormField
                  control={form.control}
                  name="scheduledTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scheduled Date & Time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {scheduleType === "before_stream" && (
                <FormField
                  control={form.control}
                  name="beforeStreamMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minutes Before Stream</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={120}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Send this announcement X minutes before you go live
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {scheduleType === "recurring" && (
                <FormField
                  control={form.control}
                  name="cronPattern"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cron Pattern</FormLabel>
                      <FormControl>
                        <Input placeholder="0 18 * * 1,3,5" {...field} />
                      </FormControl>
                      <FormDescription>
                        Standard cron format: minute hour day-of-month month day-of-week
                        <br />
                        Example: "0 18 * * 1,3,5" = 6:00 PM on Mon/Wed/Fri
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="candy-gradient hover:opacity-90"
                >
                  {editingAnnouncement ? "Update" : "Create"} Announcement
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedAnnouncement?.title}"? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAnnouncement && deleteMutation.mutate(selectedAnnouncement.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
