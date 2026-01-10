"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Rocket,
  Sparkles,
  Youtube,
  Twitch,
  Globe,
  Palette,
  Code2,
  Store,
  Bot,
  Music,
  Video,
  Users,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Zap,
  Star,
  Heart,
  Coffee,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

interface CreatorKit {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  items: string[];
  color: string;
  popular?: boolean;
}

const creatorKits: CreatorKit[] = [
  {
    id: "youtuber",
    name: "YouTuber Starter",
    description: "Everything you need to launch your YouTube channel brand",
    icon: <Youtube className="h-6 w-6" />,
    items: [
      "Personal brand website",
      "Channel overlay graphics",
      "Discord community server",
      "Merch store template",
      "Social media links page",
      "Email newsletter signup",
    ],
    color: "from-red-500 to-red-600",
    popular: true,
  },
  {
    id: "streamer",
    name: "Streamer Bundle",
    description: "Launch your streaming career across Twitch, YouTube, and Kick",
    icon: <Twitch className="h-6 w-6" />,
    items: [
      "Stream overlay designer",
      "Alert & widget manager",
      "Chatbot with commands",
      "Schedule & announcement system",
      "Clip & highlight manager",
      "Multi-platform dashboard",
    ],
    color: "from-purple-500 to-purple-600",
    popular: true,
  },
  {
    id: "developer",
    name: "Developer Portfolio",
    description: "Showcase your skills and projects professionally",
    icon: <Code2 className="h-6 w-6" />,
    items: [
      "Portfolio website",
      "Project showcase gallery",
      "Blog with markdown support",
      "Contact form",
      "Resume builder",
      "GitHub integration",
    ],
    color: "from-blue-500 to-blue-600",
  },
  {
    id: "ecommerce",
    name: "Online Store",
    description: "Start selling products or digital goods online",
    icon: <Store className="h-6 w-6" />,
    items: [
      "Product catalog",
      "Shopping cart",
      "Payment integration",
      "Order management",
      "Inventory tracking",
      "Customer accounts",
    ],
    color: "from-green-500 to-green-600",
  },
  {
    id: "musician",
    name: "Musician Hub",
    description: "Share your music and connect with fans",
    icon: <Music className="h-6 w-6" />,
    items: [
      "Music portfolio site",
      "Track player & playlist",
      "Event calendar",
      "Merch store",
      "Fan mailing list",
      "Press kit generator",
    ],
    color: "from-pink-500 to-pink-600",
  },
  {
    id: "community",
    name: "Community Platform",
    description: "Build and manage an online community",
    icon: <Users className="h-6 w-6" />,
    items: [
      "Community website",
      "Discord bot integration",
      "Member directory",
      "Event management",
      "Newsletter system",
      "Analytics dashboard",
    ],
    color: "from-orange-500 to-orange-600",
  },
];

interface SetupStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed";
  progress?: number;
}

export default function QuickStartPage() {
  const [selectedKit, setSelectedKit] = useState<CreatorKit | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([]);
  const { toast } = useToast();
  const router = useRouter();

  async function startGeneration() {
    if (!selectedKit || !brandName) {
      toast({
        title: "Missing Information",
        description: "Please select a kit and enter your brand name",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    const steps: SetupStep[] = selectedKit.items.map((item, idx) => ({
      id: `step-${idx}`,
      name: item,
      status: "pending" as const,
    }));

    setSetupSteps(steps);

    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      setSetupSteps((prev) =>
        prev.map((s, idx) =>
          idx === i ? { ...s, status: "running" } : s
        )
      );

      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));

      setSetupSteps((prev) =>
        prev.map((s, idx) =>
          idx === i ? { ...s, status: "completed" } : s
        )
      );
    }

    setIsGenerating(false);

    toast({
      title: "Setup Complete!",
      description: `Your ${selectedKit.name} is ready to customize`,
    });
  }

  function resetWizard() {
    setSelectedKit(null);
    setBrandName("");
    setBrandDescription("");
    setSetupSteps([]);
    setCurrentStep(0);
  }

  const overallProgress = setupSteps.length > 0
    ? (setupSteps.filter((s) => s.status === "completed").length / setupSteps.length) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500">
          <Rocket className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Quick Start Wizard</h1>
          <p className="text-muted-foreground">
            Launch your brand, website, and services in minutes
          </p>
        </div>
      </div>

      {!selectedKit ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                Choose Your Creator Kit
              </CardTitle>
              <CardDescription>
                Select a starter kit that matches what you want to build
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {creatorKits.map((kit) => (
                  <Card
                    key={kit.id}
                    className="cursor-pointer transition-all hover:border-primary/50"
                    onClick={() => setSelectedKit(kit)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div
                          className={`p-3 rounded-lg bg-gradient-to-br ${kit.color} text-white`}
                        >
                          {kit.icon}
                        </div>
                        {kit.popular && (
                          <Badge className="bg-yellow-500/20 text-yellow-500">
                            <Star className="h-3 w-3 mr-1" />
                            Popular
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg mt-3">{kit.name}</CardTitle>
                      <CardDescription>{kit.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                        {kit.items.slice(0, 4).map((item, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            {item}
                          </li>
                        ))}
                        {kit.items.length > 4 && (
                          <li className="text-xs text-muted-foreground">
                            + {kit.items.length - 4} more...
                          </li>
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                Or Build Something Custom
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => router.push("/factory")}
                >
                  <Globe className="h-5 w-5" />
                  <span className="text-xs">Website</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => router.push("/factory?template=discord-bot")}
                >
                  <Bot className="h-5 w-5" />
                  <span className="text-xs">Discord Bot</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => router.push("/factory?template=api-service")}
                >
                  <Code2 className="h-5 w-5" />
                  <span className="text-xs">API Service</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => router.push("/designer")}
                >
                  <Palette className="h-5 w-5" />
                  <span className="text-xs">Design Tool</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : setupSteps.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Setting Up: {selectedKit.name}</CardTitle>
                <CardDescription>
                  Creating your {brandName} assets and services
                </CardDescription>
              </div>
              <div
                className={`p-3 rounded-lg bg-gradient-to-br ${selectedKit.color} text-white`}
              >
                {selectedKit.icon}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Progress</span>
                <span>{Math.round(overallProgress)}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>

            <div className="space-y-3">
              {setupSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    step.status === "running"
                      ? "bg-blue-500/10"
                      : step.status === "completed"
                      ? "bg-green-500/10"
                      : "bg-muted/50"
                  }`}
                >
                  {step.status === "running" ? (
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  ) : step.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <span
                    className={
                      step.status === "completed"
                        ? "text-muted-foreground"
                        : step.status === "running"
                        ? "font-medium"
                        : ""
                    }
                  >
                    {step.name}
                  </span>
                </div>
              ))}
            </div>

            {overallProgress === 100 && (
              <div className="flex gap-3 pt-4">
                <Button onClick={() => router.push("/projects")} className="flex-1">
                  View Projects
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button variant="outline" onClick={resetWizard}>
                  Create Another
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{selectedKit.name}</CardTitle>
                <CardDescription>{selectedKit.description}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={resetWizard}>
                Change Kit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Brand Name *</Label>
                <Input
                  placeholder="Enter your brand or channel name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Primary Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Brand Description (optional)</Label>
              <Textarea
                placeholder="Tell us about your brand, what you create, and who your audience is..."
                value={brandDescription}
                onChange={(e) => setBrandDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-3">What you'll get:</h4>
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {selectedKit.items.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              className={`w-full bg-gradient-to-r ${selectedKit.color} text-white`}
              onClick={startGeneration}
              disabled={!brandName || isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate My {selectedKit.name}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
