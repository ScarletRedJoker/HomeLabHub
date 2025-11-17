import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Loader2, Save, Plus, Trash2, MessageSquare, Sparkles, Bot } from "lucide-react";
import { z } from "zod";

const chatbotSettingsSchema = z.object({
  isEnabled: z.boolean(),
  personality: z.string(),
  responseRate: z.number().min(10).max(300),
  learningEnabled: z.boolean(),
  contextWindow: z.number().min(5).max(50),
  mentionTrigger: z.string().min(1),
});

type ChatbotSettingsValues = z.infer<typeof chatbotSettingsSchema>;

const personalitySchema = z.object({
  name: z.string().min(1, "Name is required"),
  systemPrompt: z.string().min(10, "System prompt must be at least 10 characters"),
  temperature: z.number().min(0).max(2),
  traits: z.array(z.string()),
});

type PersonalityFormValues = z.infer<typeof personalitySchema>;

export default function Chatbot() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [testUsername, setTestUsername] = useState("TestUser");

  const { data: settings, isLoading: isLoadingSettings } = useQuery<ChatbotSettingsValues>({
    queryKey: ["/api/chatbot/settings"],
  });

  const { data: presets, isLoading: isLoadingPresets } = useQuery<any[]>({
    queryKey: ["/api/chatbot/personalities/presets"],
  });

  const { data: customPersonalities, isLoading: isLoadingCustom } = useQuery<any[]>({
    queryKey: ["/api/chatbot/personalities"],
  });

  const { data: contextHistory, refetch: refetchContext } = useQuery<any[]>({
    queryKey: ["/api/chatbot/context"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/chatbot/context?limit=10");
      return await res.json();
    },
  });

  const form = useForm<ChatbotSettingsValues>({
    resolver: zodResolver(chatbotSettingsSchema),
    defaultValues: {
      isEnabled: false,
      personality: "friendly",
      responseRate: 60,
      learningEnabled: true,
      contextWindow: 10,
      mentionTrigger: "@bot",
    },
  });

  const personalityForm = useForm<PersonalityFormValues>({
    resolver: zodResolver(personalitySchema),
    defaultValues: {
      name: "",
      systemPrompt: "",
      temperature: 0.7,
      traits: [],
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        isEnabled: settings.isEnabled || false,
        personality: settings.personality || "friendly",
        responseRate: settings.responseRate || 60,
        learningEnabled: settings.learningEnabled ?? true,
        contextWindow: settings.contextWindow || 10,
        mentionTrigger: settings.mentionTrigger || "@bot",
      });
    }
  }, [settings, form]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: ChatbotSettingsValues) => {
      return await apiRequest("PATCH", "/api/chatbot/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/settings"] });
      toast({
        title: "Settings saved",
        description: "Your chatbot settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createPersonalityMutation = useMutation({
    mutationFn: async (data: PersonalityFormValues) => {
      return await apiRequest("POST", "/api/chatbot/personalities", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/personalities"] });
      setIsCreateDialogOpen(false);
      personalityForm.reset();
      toast({
        title: "Personality created",
        description: "Your custom personality has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create personality. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deletePersonalityMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/chatbot/personalities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/personalities"] });
      toast({
        title: "Personality deleted",
        description: "The custom personality has been deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete personality. Please try again.",
        variant: "destructive",
      });
    },
  });

  const testChatbotMutation = useMutation({
    mutationFn: async (data: { message: string; username: string }) => {
      const res = await apiRequest("POST", "/api/chatbot/respond", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      setTestResponse(data.response);
      refetchContext();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to test chatbot. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmitSettings = (data: ChatbotSettingsValues) => {
    updateSettingsMutation.mutate(data);
  };

  const onSubmitPersonality = (data: PersonalityFormValues) => {
    createPersonalityMutation.mutate(data);
  };

  const handleTestChatbot = () => {
    if (!testMessage.trim()) return;
    testChatbotMutation.mutate({ message: testMessage, username: testUsername });
    setTestMessage("");
  };

  if (isLoadingSettings || isLoadingPresets) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const allPersonalities = [
    ...(presets || []),
    ...(customPersonalities || []),
  ];

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8" />
            AI Chatbot
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure your AI chatbot personality and behavior
          </p>
        </div>
        <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <MessageSquare className="h-4 w-4 mr-2" />
              Test Chatbot
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Test Chatbot</DialogTitle>
              <DialogDescription>
                Send a test message to see how your chatbot responds
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={testUsername}
                  onChange={(e) => setTestUsername(e.target.value)}
                  placeholder="TestUser"
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Type your test message here..."
                  rows={3}
                />
              </div>
              {testResponse && (
                <div className="p-4 bg-muted rounded-lg">
                  <Label className="text-sm font-semibold">Bot Response:</Label>
                  <p className="mt-2 text-sm">{testResponse}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={handleTestChatbot}
                disabled={!testMessage.trim() || testChatbotMutation.isPending}
              >
                {testChatbotMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmitSettings)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Chatbot Status</CardTitle>
              <CardDescription>
                Enable or disable the AI chatbot for your stream
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="isEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Chatbot</FormLabel>
                      <FormDescription>
                        Allow the bot to respond to chat messages
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personality</CardTitle>
              <CardDescription>
                Choose a personality for your chatbot or create a custom one
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="personality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bot Personality</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a personality" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allPersonalities.map((p: any) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The personality determines how the bot talks and responds
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Custom Personality
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create Custom Personality</DialogTitle>
                    <DialogDescription>
                      Define a unique personality for your chatbot
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...personalityForm}>
                    <form onSubmit={personalityForm.handleSubmit(onSubmitPersonality)} className="space-y-4 py-4">
                      <FormField
                        control={personalityForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Personality Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Sarcastic Helper" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={personalityForm.control}
                        name="systemPrompt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>System Prompt</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="You are a helpful assistant who..."
                                rows={4}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Describe how the bot should behave and respond
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={personalityForm.control}
                        name="temperature"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Creativity (Temperature: {field.value})</FormLabel>
                            <FormControl>
                              <Slider
                                min={0}
                                max={2}
                                step={0.1}
                                value={[field.value]}
                                onValueChange={(vals) => field.onChange(vals[0])}
                              />
                            </FormControl>
                            <FormDescription>
                              Lower = more focused, Higher = more creative
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <DialogFooter>
                        <Button
                          type="submit"
                          disabled={createPersonalityMutation.isPending}
                        >
                          {createPersonalityMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-2" />
                              Create Personality
                            </>
                          )}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Response Settings</CardTitle>
              <CardDescription>
                Configure when and how the chatbot responds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="mentionTrigger"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mention Trigger</FormLabel>
                    <FormControl>
                      <Input placeholder="@bot" {...field} />
                    </FormControl>
                    <FormDescription>
                      Text users type to directly message the bot
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="responseRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate Limit (seconds between responses per user)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Slider
                          min={10}
                          max={300}
                          step={10}
                          value={[field.value]}
                          onValueChange={(vals) => field.onChange(vals[0])}
                        />
                        <div className="text-sm text-muted-foreground text-center">
                          {field.value} seconds
                        </div>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Minimum time between bot responses to the same user
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contextWindow"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Context Window (messages remembered)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Slider
                          min={5}
                          max={50}
                          step={5}
                          value={[field.value]}
                          onValueChange={(vals) => field.onChange(vals[0])}
                        />
                        <div className="text-sm text-muted-foreground text-center">
                          {field.value} messages
                        </div>
                      </div>
                    </FormControl>
                    <FormDescription>
                      How many previous messages the bot remembers per user
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="learningEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Learning Mode</FormLabel>
                      <FormDescription>
                        Allow bot to learn from conversations
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom Personalities</CardTitle>
              <CardDescription>
                Manage your custom chatbot personalities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingCustom ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-12 bg-muted rounded" />
                  <div className="h-12 bg-muted rounded" />
                </div>
              ) : customPersonalities && customPersonalities.length > 0 ? (
                <div className="space-y-2">
                  {customPersonalities.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <h4 className="font-medium">{p.name}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {p.systemPrompt}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deletePersonalityMutation.mutate(p.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No custom personalities yet. Create one above!
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Conversations</CardTitle>
              <CardDescription>
                View recent chatbot interactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contextHistory && contextHistory.length > 0 ? (
                <div className="space-y-3">
                  {contextHistory.map((ctx: any) => (
                    <div key={ctx.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{ctx.username}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(ctx.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm">
                        <p className="text-muted-foreground">
                          <span className="font-semibold">User:</span> {ctx.message}
                        </p>
                        <p className="mt-1">
                          <span className="font-semibold">Bot:</span> {ctx.response}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No conversation history yet
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={updateSettingsMutation.isPending}
            >
              {updateSettingsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
