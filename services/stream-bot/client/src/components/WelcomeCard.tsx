import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Sparkles, Zap, BarChart3, Settings, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { SiTwitch, SiYoutube, SiKick } from "react-icons/si";

export function WelcomeCard() {
  const { user, refreshUser } = useAuth();

  const dismissMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/dismiss-welcome", {});
    },
    onSuccess: () => {
      refreshUser();
    },
  });

  if (!user || user.dismissedWelcome) {
    return null;
  }

  const quickLinks = [
    {
      title: "Quick Trigger",
      description: "Post a fact now",
      href: "/trigger",
      icon: Zap,
      color: "text-yellow-500",
    },
    {
      title: "View Activity",
      description: "See recent posts",
      href: "/activity",
      icon: BarChart3,
      color: "text-blue-500",
    },
    {
      title: "Bot Settings",
      description: "Configure behavior",
      href: "/settings",
      icon: Settings,
      color: "text-purple-500",
    },
  ];

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-candy-pink to-candy-purple flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">Welcome to StreamBot! 🎉</CardTitle>
              <CardDescription className="text-xs">
                Let's get your stream bot set up in just a few minutes
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mt-1 -mr-2"
            onClick={() => dismissMutation.mutate()}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
          <p className="text-sm font-medium mb-2">First, connect a streaming platform:</p>
          <p className="text-xs text-muted-foreground mb-3">
            This lets StreamBot post AI-generated facts to your chat
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings">
              <Button size="sm" variant="outline" className="gap-2 hover:border-purple-500/50 hover:bg-purple-500/10">
                <SiTwitch className="h-4 w-4 text-purple-500" />
                Twitch
              </Button>
            </Link>
            <Link href="/settings">
              <Button size="sm" variant="outline" className="gap-2 hover:border-red-500/50 hover:bg-red-500/10">
                <SiYoutube className="h-4 w-4 text-red-500" />
                YouTube
              </Button>
            </Link>
            <Link href="/settings">
              <Button size="sm" variant="outline" className="gap-2 hover:border-green-500/50 hover:bg-green-500/10">
                <SiKick className="h-4 w-4 text-green-500" />
                Kick
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">Then try these</Badge>
          <span className="text-xs text-muted-foreground">Quick actions to explore:</span>
        </div>
        
        <div className="grid gap-3 sm:grid-cols-3">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <div className="group relative rounded-lg border border-border bg-background/50 p-4 hover:bg-accent hover:border-primary/30 transition-all cursor-pointer">
                <div className="flex flex-col gap-2">
                  <link.icon className={`h-5 w-5 ${link.color}`} />
                  <div>
                    <div className="text-sm font-medium">{link.title}</div>
                    <div className="text-xs text-muted-foreground">{link.description}</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            💡 <strong>Pro tip:</strong> Start with one platform, test the bot, then add more later!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
