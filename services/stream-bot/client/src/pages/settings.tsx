import { useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import type { BotSettings, UpdateBotSettings } from "@shared/schema";
import { z } from "zod";
import { SpotifyCardMultiUser } from "@/components/spotify-card-multiuser";
import { YouTubeCardMultiUser } from "@/components/youtube-card-multiuser";
import { TwitchCardMultiUser } from "@/components/twitch-card-multiuser";

const settingsFormSchema = z.object({
  intervalMode: z.enum(["fixed", "random", "manual"]),
  fixedIntervalMinutes: z.coerce.number().min(1).max(1440).optional(),
  randomMinMinutes: z.coerce.number().min(1).max(1440).optional(),
  randomMaxMinutes: z.coerce.number().min(1).max(1440).optional(),
  aiModel: z.string(),
  aiPromptTemplate: z.string().optional(),
  enableChatTriggers: z.boolean(),
  chatKeywords: z.array(z.string()),
  activePlatforms: z.array(z.string()),
  isActive: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export default function Settings() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<BotSettings>({
    queryKey: ["/api/settings"],
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      intervalMode: "manual",
      fixedIntervalMinutes: 15,
      randomMinMinutes: 5,
      randomMaxMinutes: 30,
      aiModel: "gpt-5-mini",
      aiPromptTemplate: "",
      enableChatTriggers: true,
      chatKeywords: ["!snapple", "!fact"],
      activePlatforms: [],
      isActive: false,
    },
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      form.reset({
        intervalMode: settings.intervalMode as "fixed" | "random" | "manual",
        fixedIntervalMinutes: settings.fixedIntervalMinutes || 15,
        randomMinMinutes: settings.randomMinMinutes || 5,
        randomMaxMinutes: settings.randomMaxMinutes || 30,
        aiModel: settings.aiModel,
        aiPromptTemplate: settings.aiPromptTemplate || "",
        enableChatTriggers: settings.enableChatTriggers,
        chatKeywords: settings.chatKeywords || ["!snapple", "!fact"],
        activePlatforms: settings.activePlatforms || [],
        isActive: settings.isActive,
      });
    }
  }, [settings, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      return await apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
        description: "Your bot settings have been updated successfully.",
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

  const onSubmit = (data: SettingsFormValues) => {
    updateMutation.mutate(data);
  };

  const intervalMode = form.watch("intervalMode");

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

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your bot behavior and preferences
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Bot Status */}
          <Card>
            <CardHeader>
              <CardTitle>Bot Status</CardTitle>
              <CardDescription>
                Control whether the bot is actively posting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Bot</FormLabel>
                      <FormDescription>
                        Turn on automated fact posting
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-bot-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Interval Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Posting Interval</CardTitle>
              <CardDescription>
                Choose how often the bot posts Snapple facts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="intervalMode"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Interval Mode</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-2"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="manual" data-testid="radio-manual" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            Manual Only - Post on demand only
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="fixed" data-testid="radio-fixed" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            Fixed Interval - Post at regular intervals
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="random" data-testid="radio-random" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            Random Range - Post at random intervals within a range
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />

              {intervalMode === "fixed" && (
                <FormField
                  control={form.control}
                  name="fixedIntervalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fixed Interval (minutes)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          data-testid="input-fixed-interval"
                        />
                      </FormControl>
                      <FormDescription>
                        Post a fact every X minutes (1-1440)
                      </FormDescription>
                    </FormItem>
                  )}
                />
              )}

              {intervalMode === "random" && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="randomMinMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min Minutes</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-random-min"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="randomMaxMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Minutes</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-random-max"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
              <CardDescription>
                Customize how AI generates Snapple facts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="aiModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AI Model</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ai-model">
                          <SelectValue placeholder="Select AI model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="gpt-5-mini">GPT-5 Mini (Fast & Cheap)</SelectItem>
                        <SelectItem value="gpt-5">GPT-5 (Best Quality)</SelectItem>
                        <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose the AI model for generating facts
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="aiPromptTemplate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Prompt Template (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Leave empty for default Snapple-style facts, or customize the prompt..."
                        className="min-h-24"
                        {...field}
                        data-testid="textarea-prompt-template"
                      />
                    </FormControl>
                    <FormDescription>
                      Customize how facts are generated. Leave empty for default.
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Chat Triggers */}
          <Card>
            <CardHeader>
              <CardTitle>Chat Triggers</CardTitle>
              <CardDescription>
                Allow viewers to trigger facts with chat commands
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="enableChatTriggers"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Chat Commands</FormLabel>
                      <FormDescription>
                        Let viewers trigger facts with keywords
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-chat-triggers"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="chatKeywords"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trigger Keywords</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="!snapple, !fact"
                        {...field}
                        value={field.value?.join(", ")}
                        onChange={(e) => {
                          const keywords = e.target.value
                            .split(",")
                            .map((k) => k.trim())
                            .filter((k) => k.length > 0);
                          field.onChange(keywords);
                        }}
                        data-testid="input-chat-keywords"
                      />
                    </FormControl>
                    <FormDescription>
                      Comma-separated list of trigger keywords (e.g., !snapple, !fact)
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Active Platforms */}
          <Card>
            <CardHeader>
              <CardTitle>Active Platforms</CardTitle>
              <CardDescription>
                Select which platforms should receive automated posts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="activePlatforms"
                render={() => (
                  <FormItem>
                    <div className="space-y-3">
                      {["twitch", "youtube", "kick"].map((platform) => (
                        <FormField
                          key={platform}
                          control={form.control}
                          name="activePlatforms"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(platform)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    const updated = checked
                                      ? [...current, platform]
                                      : current.filter((p) => p !== platform);
                                    field.onChange(updated);
                                  }}
                                  data-testid={`checkbox-platform-${platform}`}
                                />
                              </FormControl>
                              <FormLabel className="font-normal capitalize cursor-pointer">
                                {platform}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="button-save-settings"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>Save Settings</span>
            </Button>
          </div>
        </form>
      </Form>

      {/* Platform Connections - Outside the form since they're managed separately */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Platform Connections</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your streaming platforms for automated posting and overlay features
          </p>
        </div>
        <TwitchCardMultiUser />
        <SpotifyCardMultiUser />
        <YouTubeCardMultiUser />
      </div>
    </div>
  );
}
