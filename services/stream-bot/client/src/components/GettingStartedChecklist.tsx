import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  Circle, 
  ChevronRight, 
  Sparkles,
  Zap,
  Radio,
  Layers,
  Settings,
  MessageSquare,
} from "lucide-react";
import { SiTwitch, SiYoutube, SiKick } from "react-icons/si";
import { Link } from "wouter";
import type { PlatformConnection, BotSettings } from "@shared/schema";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  href?: string;
  icon: React.ReactNode;
  priority: "required" | "recommended" | "optional";
}

export function GettingStartedChecklist() {
  const { data: platforms } = useQuery<PlatformConnection[]>({
    queryKey: ["/api/platforms"],
  });

  const { data: settings } = useQuery<BotSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: stats } = useQuery<{
    totalMessages: number;
    messagesThisWeek: number;
    activePlatforms: number;
  }>({
    queryKey: ["/api/stats"],
  });

  const connectedPlatforms = platforms?.filter(p => p.isConnected) || [];
  const hasPlatformConnected = connectedPlatforms.length > 0;
  const hasTwitch = connectedPlatforms.some(p => p.platform === "twitch");
  const hasYoutube = connectedPlatforms.some(p => p.platform === "youtube");
  const hasKick = connectedPlatforms.some(p => p.platform === "kick");
  const hasPostedFact = (stats?.totalMessages || 0) > 0;
  const isBotActive = settings?.isActive ?? false;

  const checklistItems: ChecklistItem[] = [
    {
      id: "connect-platform",
      title: "Connect a streaming platform",
      description: hasPlatformConnected 
        ? `Connected: ${connectedPlatforms.map(p => p.platform).join(", ")}`
        : "Connect Twitch, YouTube, or Kick to start",
      completed: hasPlatformConnected,
      href: "/settings",
      icon: <Sparkles className="h-4 w-4" />,
      priority: "required",
    },
    {
      id: "post-first-fact",
      title: "Post your first fact",
      description: hasPostedFact 
        ? `You've posted ${stats?.totalMessages} facts!`
        : "Use Quick Trigger to test the bot",
      completed: hasPostedFact,
      href: "/trigger",
      icon: <Zap className="h-4 w-4" />,
      priority: "required",
    },
    {
      id: "activate-bot",
      title: "Activate the bot",
      description: isBotActive 
        ? "Bot is active and ready"
        : "Turn on the bot to enable auto-posting",
      completed: isBotActive,
      href: "/settings",
      icon: <Settings className="h-4 w-4" />,
      priority: "recommended",
    },
    {
      id: "setup-commands",
      title: "Set up custom commands",
      description: "Create chat commands for your viewers",
      completed: false,
      href: "/commands",
      icon: <MessageSquare className="h-4 w-4" />,
      priority: "optional",
    },
    {
      id: "create-overlay",
      title: "Create stream overlays",
      description: "Design custom overlays for OBS",
      completed: false,
      href: "/overlay-editor",
      icon: <Layers className="h-4 w-4" />,
      priority: "optional",
    },
  ];

  const completedCount = checklistItems.filter(item => item.completed).length;
  const totalItems = checklistItems.length;
  const progressPercent = (completedCount / totalItems) * 100;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "required":
        return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
      case "recommended":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      default:
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    }
  };

  if (progressPercent === 100) {
    return null;
  }

  return (
    <Card className="candy-glass-card border-primary/20">
      <CardHeader className="p-4 sm:p-6 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-candy-pink to-candy-purple flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">Getting Started</CardTitle>
              <CardDescription className="text-xs">
                Complete these steps to set up StreamBot
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {completedCount}/{totalItems}
          </Badge>
        </div>
        <Progress value={progressPercent} className="h-2 mt-3" />
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 space-y-3">
        <div className="space-y-2">
          {checklistItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                item.completed 
                  ? "bg-green-500/5 border border-green-500/20" 
                  : "bg-muted/50 hover:bg-muted border border-transparent"
              }`}
            >
              <div className={`flex-shrink-0 ${item.completed ? "text-green-500" : "text-muted-foreground"}`}>
                {item.completed ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${item.completed ? "text-green-600 dark:text-green-400" : ""}`}>
                    {item.title}
                  </span>
                  {!item.completed && (
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityColor(item.priority)}`}>
                      {item.priority}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
              </div>
              {!item.completed && item.href && (
                <Link href={item.href}>
                  <Button variant="ghost" size="sm" className="h-8 px-2">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          ))}
        </div>

        {!hasPlatformConnected && (
          <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
            <p className="text-sm font-medium mb-3">Quick Connect</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/settings">
                <Button size="sm" variant="outline" className="gap-2">
                  <SiTwitch className="h-4 w-4 text-purple-500" />
                  Twitch
                </Button>
              </Link>
              <Link href="/settings">
                <Button size="sm" variant="outline" className="gap-2">
                  <SiYoutube className="h-4 w-4 text-red-500" />
                  YouTube
                </Button>
              </Link>
              <Link href="/settings">
                <Button size="sm" variant="outline" className="gap-2">
                  <SiKick className="h-4 w-4 text-green-500" />
                  Kick
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
