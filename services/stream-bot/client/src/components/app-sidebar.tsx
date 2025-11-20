import { Home, Settings, Activity, Zap, History, MessageSquare, Shield, Trophy, Megaphone, BarChart3, Gamepad2, Coins, Music, Vote, Bell, Bot, Sparkles, Video } from "lucide-react";
import { SiTwitch, SiYoutube, SiKick } from "react-icons/si";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface FeatureFlags {
  obs: boolean;
}

const botControlItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    title: "Quick Trigger",
    url: "/trigger",
    icon: Zap,
  },
  {
    title: "Activity",
    url: "/activity",
    icon: Activity,
  },
  {
    title: "History",
    url: "/history",
    icon: History,
  },
];

const featureItems = [
  {
    title: "Commands",
    url: "/commands",
    icon: MessageSquare,
    badge: "Popular",
  },
  {
    title: "AI Chatbot",
    url: "/chatbot",
    icon: Bot,
    badge: "AI",
  },
  {
    title: "OBS Control",
    url: "/obs-control",
    icon: Video,
    badge: "New",
  },
  {
    title: "Giveaways",
    url: "/giveaways",
    icon: Trophy,
  },
  {
    title: "Shoutouts",
    url: "/shoutouts",
    icon: Megaphone,
  },
  {
    title: "Games",
    url: "/games",
    icon: Gamepad2,
  },
  {
    title: "Currency",
    url: "/currency",
    icon: Coins,
  },
  {
    title: "Polls",
    url: "/polls",
    icon: Vote,
  },
  {
    title: "Song Requests",
    url: "/song-requests",
    icon: Music,
  },
  {
    title: "Alerts",
    url: "/alerts",
    icon: Bell,
  },
  {
    title: "Moderation",
    url: "/moderation",
    icon: Shield,
  },
];

const analyticsItems = [
  {
    title: "Statistics",
    url: "/statistics",
    icon: BarChart3,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: Sparkles,
  },
];

const platformItems = [
  {
    title: "Twitch",
    platform: "twitch",
    icon: SiTwitch,
    color: "text-purple-500",
  },
  {
    title: "YouTube",
    platform: "youtube",
    icon: SiYoutube,
    color: "text-red-500",
  },
  {
    title: "Kick",
    platform: "kick",
    icon: SiKick,
    color: "text-green-500",
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  // Check if OBS feature is enabled
  const { data: features } = useQuery<FeatureFlags>({
    queryKey: ["/api/features"],
    retry: false,
  });

  // Filter feature items based on enabled features
  const visibleFeatureItems = featureItems.filter((item) => {
    // Hide OBS Control if OBS feature is not enabled
    if (item.url === "/obs-control" && features && !features.obs) {
      return false;
    }
    return true;
  });

  return (
    <Sidebar data-testid="sidebar-main" className="border-r">
      <SidebarContent className="gap-0">
        {/* Bot Control Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
            Bot Control
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {botControlItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.title.toLowerCase().replace(" ", "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Features Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
            Features
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleFeatureItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.title.toLowerCase().replace(" ", "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{item.title}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Analytics Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
            Analytics
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {analyticsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.title.toLowerCase().replace(" ", "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
            Configuration
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/settings"}
                  data-testid="link-settings"
                >
                  <Link href="/settings">
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Platform Status Section */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
            Platforms
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformItems.map((item) => (
                <SidebarMenuItem key={item.platform}>
                  <SidebarMenuButton
                    className="cursor-default hover:bg-transparent"
                    data-testid={`platform-${item.platform}`}
                  >
                    <item.icon className={`h-4 w-4 ${item.color}`} />
                    <span className="text-sm">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t">
        <div className="text-xs text-muted-foreground text-center">
          <div className="font-medium">StreamBot</div>
          <div className="mt-0.5">AI-Powered Engagement</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
