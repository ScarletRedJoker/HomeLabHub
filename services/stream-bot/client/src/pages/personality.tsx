import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plus, Trash2, MessageSquare, Sparkles, Smile, Briefcase, Gamepad2, Coffee, Heart, Send, X, Wand2 } from "lucide-react";
import { z } from "zod";

interface PersonalityPreset {
  id: string;
  name: string;
  description: string;
  traits: { humor: number; formality: number; energy: number };
  systemPrompt: string;
  tone: string;
  responseStyle: string;
}

interface PersonalityConfig {
  id: string;
  name: string;
  systemPrompt: string;
  traits: { humor: number; formality: number; energy: number } | string[];
  triggerWords: string[];
  replyChance: number;
  cooldown: number;
  isActive: boolean;
  tone: string;
  responseStyle: string;
  usageCount: number;
}

const personalityFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  systemPrompt: z.string().min(10, "System prompt must be at least 10 characters"),
  traits: z.object({
    humor: z.number().min(0).max(100),
    formality: z.number().min(0).max(100),
    energy: z.number().min(0).max(100),
  }),
  triggerWords: z.array(z.string()),
  responseTemplates: z.array(z.string()),
  isActive: z.boolean(),
  replyChance: z.number().min(0).max(100),
  cooldown: z.number().min(0).max(300),
});

type PersonalityFormValues = z.infer<typeof personalityFormSchema>;

const presetIcons: Record<string, React.ReactNode> = {
  friendly: <Heart className="h-5 w-5 text-pink-500" />,
  sassy: <Sparkles className="h-5 w-5 text-purple-500" />,
  professional: <Briefcase className="h-5 w-5 text-blue-500" />,
  gamer: <Gamepad2 className="h-5 w-5 text-green-500" />,
  chill: <Coffee className="h-5 w-5 text-amber-500" />,
};

export default function Personality() {
  const { toast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [newTriggerWord, setNewTriggerWord] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [activeTab, setActiveTab] = useState("presets");

  const { data: presets, isLoading: isLoadingPresets } = useQuery<PersonalityPreset[]>({
    queryKey: ["/api/personality/presets"],
  });

  const { data: personalityConfig, isLoading: isLoadingConfig } = useQuery<{
    personalities: PersonalityConfig[];
    presets: PersonalityPreset[];
  }>({
    queryKey: ["/api/personality"],
  });

  const form = useForm<PersonalityFormValues>({
    resolver: zodResolver(personalityFormSchema),
    defaultValues: {
      name: "",
      systemPrompt: "You are a helpful chat assistant for a livestream. Keep responses brief and engaging.",
      traits: { humor: 50, formality: 50, energy: 50 },
      triggerWords: [],
      responseTemplates: [],
      isActive: true,
      replyChance: 100,
      cooldown: 30,
    },
  });

  const createPersonalityMutation = useMutation({
    mutationFn: async (data: PersonalityFormValues & { presetId?: string }) => {
      return await apiRequest("POST", "/api/personality", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/personalities"] });
      form.reset();
      setSelectedPreset(null);
      toast({
        title: "Personality created",
        description: "Your custom personality has been saved successfully.",
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
      queryClient.invalidateQueries({ queryKey: ["/api/personality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/personalities"] });
      toast({
        title: "Personality deleted",
        description: "The personality has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete personality.",
        variant: "destructive",
      });
    },
  });

  const togglePersonalityMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest("PATCH", `/api/chatbot/personalities/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/personalities"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update personality status.",
        variant: "destructive",
      });
    },
  });

  const testGenerateMutation = useMutation({
    mutationFn: async (data: { message: string; traits?: any; presetId?: string; personalityId?: string }) => {
      const res = await apiRequest("POST", "/api/personality/generate", data);
      return res.json();
    },
    onSuccess: (data) => {
      setTestResponse(data.response);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate response. Check your AI integration.",
        variant: "destructive",
      });
    },
  });

  const handleSelectPreset = (presetId: string) => {
    const preset = presets?.find(p => p.id === presetId);
    if (preset) {
      setSelectedPreset(presetId);
      form.setValue("name", `My ${preset.name} Bot`);
      form.setValue("systemPrompt", preset.systemPrompt);
      form.setValue("traits", preset.traits);
    }
  };

  const handleAddTriggerWord = () => {
    if (newTriggerWord.trim()) {
      const current = form.getValues("triggerWords");
      if (!current.includes(newTriggerWord.trim().toLowerCase())) {
        form.setValue("triggerWords", [...current, newTriggerWord.trim().toLowerCase()]);
      }
      setNewTriggerWord("");
    }
  };

  const handleRemoveTriggerWord = (word: string) => {
    const current = form.getValues("triggerWords");
    form.setValue("triggerWords", current.filter(w => w !== word));
  };

  const handleAddTemplate = () => {
    if (newTemplate.trim()) {
      const current = form.getValues("responseTemplates");
      form.setValue("responseTemplates", [...current, newTemplate.trim()]);
      setNewTemplate("");
    }
  };

  const handleRemoveTemplate = (index: number) => {
    const current = form.getValues("responseTemplates");
    form.setValue("responseTemplates", current.filter((_, i) => i !== index));
  };

  const handleTestChat = () => {
    if (!testMessage.trim()) return;
    
    const traits = form.getValues("traits");
    testGenerateMutation.mutate({
      message: testMessage,
      traits,
      presetId: selectedPreset || undefined,
    });
  };

  const handleTestPersonality = (personalityId: string) => {
    setIsTestDialogOpen(true);
    setTestResponse("");
  };

  const onSubmit = (data: PersonalityFormValues) => {
    createPersonalityMutation.mutate({
      ...data,
      presetId: selectedPreset || undefined,
    });
  };

  const getTraitLabel = (value: number) => {
    if (value >= 80) return "Very High";
    if (value >= 60) return "High";
    if (value >= 40) return "Medium";
    if (value >= 20) return "Low";
    return "Very Low";
  };

  if (isLoadingPresets || isLoadingConfig) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const existingPersonalities = personalityConfig?.personalities || [];

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wand2 className="h-8 w-8" />
            Bot Personality
          </h1>
          <p className="text-muted-foreground mt-1">
            Customize your chatbot's personality with presets and trait sliders
          </p>
        </div>
        <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Test Personality</DialogTitle>
              <DialogDescription>
                Send a test message to preview how your bot will respond
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Test Message</Label>
                <Textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Type a message to test..."
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
                onClick={handleTestChat}
                disabled={!testMessage.trim() || testGenerateMutation.isPending}
              >
                {testGenerateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="presets">Presets</TabsTrigger>
          <TabsTrigger value="custom">Custom Traits</TabsTrigger>
          <TabsTrigger value="manage">Manage</TabsTrigger>
        </TabsList>

        <TabsContent value="presets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personality Presets</CardTitle>
              <CardDescription>
                Choose a preset to quickly configure your bot's personality
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {presets?.map((preset) => (
                  <Card
                    key={preset.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedPreset === preset.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => handleSelectPreset(preset.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          {presetIcons[preset.id] || <Smile className="h-5 w-5" />}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold">{preset.name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {preset.description}
                          </p>
                          <div className="flex gap-2 mt-3 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              Humor: {preset.traits.humor}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              Energy: {preset.traits.energy}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedPreset && (
            <Card>
              <CardHeader>
                <CardTitle>Quick Create from Preset</CardTitle>
                <CardDescription>
                  Customize and save this preset as your bot personality
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={form.watch("name")}
                    onChange={(e) => form.setValue("name", e.target.value)}
                    placeholder="My Custom Bot"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setIsTestDialogOpen(true);
                      setTestResponse("");
                    }}
                    variant="outline"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Test
                  </Button>
                  <Button
                    onClick={() => onSubmit(form.getValues())}
                    disabled={createPersonalityMutation.isPending}
                  >
                    {createPersonalityMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Personality
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="custom" className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Personality Traits</CardTitle>
                  <CardDescription>
                    Adjust the sliders to fine-tune your bot's personality
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <FormField
                    control={form.control}
                    name="traits.humor"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between">
                          <FormLabel className="flex items-center gap-2">
                            <Smile className="h-4 w-4" />
                            Humor
                          </FormLabel>
                          <span className="text-sm text-muted-foreground">
                            {field.value} - {getTraitLabel(field.value)}
                          </span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                        <FormDescription className="flex justify-between text-xs">
                          <span>Serious</span>
                          <span>Hilarious</span>
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="traits.formality"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between">
                          <FormLabel className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            Formality
                          </FormLabel>
                          <span className="text-sm text-muted-foreground">
                            {field.value} - {getTraitLabel(field.value)}
                          </span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                        <FormDescription className="flex justify-between text-xs">
                          <span>Casual</span>
                          <span>Professional</span>
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="traits.energy"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between">
                          <FormLabel className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            Energy
                          </FormLabel>
                          <span className="text-sm text-muted-foreground">
                            {field.value} - {getTraitLabel(field.value)}
                          </span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                        <FormDescription className="flex justify-between text-xs">
                          <span>Chill</span>
                          <span>Energetic</span>
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Basic Settings</CardTitle>
                  <CardDescription>
                    Configure name, prompt, and behavior settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Personality Name</FormLabel>
                        <FormControl>
                          <Input placeholder="My Custom Bot" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="systemPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>System Prompt</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="You are a helpful chat assistant..."
                            rows={4}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          The base instructions for how your bot should behave
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="replyChance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reply Chance (%)</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Slider
                                min={0}
                                max={100}
                                step={5}
                                value={[field.value]}
                                onValueChange={(vals) => field.onChange(vals[0])}
                              />
                              <div className="text-sm text-center text-muted-foreground">
                                {field.value}%
                              </div>
                            </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="cooldown"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cooldown (seconds)</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Slider
                                min={0}
                                max={300}
                                step={5}
                                value={[field.value]}
                                onValueChange={(vals) => field.onChange(vals[0])}
                              />
                              <div className="text-sm text-center text-muted-foreground">
                                {field.value}s
                              </div>
                            </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Enable Personality</FormLabel>
                          <FormDescription>
                            When enabled, this personality will respond to triggers
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
                  <CardTitle>Trigger Words</CardTitle>
                  <CardDescription>
                    Words that trigger this personality to respond (leave empty to always respond)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={newTriggerWord}
                      onChange={(e) => setNewTriggerWord(e.target.value)}
                      placeholder="Add a trigger word..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTriggerWord();
                        }
                      }}
                    />
                    <Button type="button" onClick={handleAddTriggerWord} variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.watch("triggerWords").map((word, index) => (
                      <Badge key={index} variant="secondary" className="px-3 py-1">
                        {word}
                        <button
                          type="button"
                          onClick={() => handleRemoveTriggerWord(word)}
                          className="ml-2 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Response Templates</CardTitle>
                  <CardDescription>
                    Optional templates the bot can use. Variables: {"{user}"}, {"{streamer}"}, {"{game}"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={newTemplate}
                      onChange={(e) => setNewTemplate(e.target.value)}
                      placeholder="Hey {user}, welcome to the stream!"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTemplate();
                        }
                      }}
                    />
                    <Button type="button" onClick={handleAddTemplate} variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {form.watch("responseTemplates").map((template, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <span className="text-sm">{template}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTemplate(index)}
                          className="hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsTestDialogOpen(true);
                    setTestResponse("");
                  }}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Test Chat
                </Button>
                <Button type="submit" disabled={createPersonalityMutation.isPending}>
                  {createPersonalityMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Personality
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="manage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Personalities</CardTitle>
              <CardDescription>
                Manage your saved bot personalities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {existingPersonalities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wand2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No personalities created yet.</p>
                  <p className="text-sm mt-1">Create one using presets or custom traits!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {existingPersonalities.map((personality) => {
                    const traits = typeof personality.traits === 'object' && !Array.isArray(personality.traits)
                      ? personality.traits
                      : { humor: 50, formality: 50, energy: 50 };
                    
                    return (
                      <div
                        key={personality.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{personality.name}</h4>
                            <Badge variant={personality.isActive ? "default" : "secondary"}>
                              {personality.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                            <span>Humor: {traits.humor}</span>
                            <span>Formality: {traits.formality}</span>
                            <span>Energy: {traits.energy}</span>
                            <span>Uses: {personality.usageCount}</span>
                          </div>
                          {personality.triggerWords && (personality.triggerWords as string[]).length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {(personality.triggerWords as string[]).slice(0, 3).map((word, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {word}
                                </Badge>
                              ))}
                              {(personality.triggerWords as string[]).length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{(personality.triggerWords as string[]).length - 3} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={personality.isActive}
                            onCheckedChange={(checked) =>
                              togglePersonalityMutation.mutate({
                                id: personality.id,
                                isActive: checked,
                              })
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setTestMessage("");
                              setTestResponse("");
                              setIsTestDialogOpen(true);
                            }}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deletePersonalityMutation.mutate(personality.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
