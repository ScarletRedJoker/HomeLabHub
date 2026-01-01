import { Home, Settings, Zap, Layers, Radio, Lightbulb, Video, Clock, MessageSquare, Trophy, Coins, Gamepad2, Vote, Music, Bell, Shield, BarChart3, Sparkles, Bot, Film, Megaphone } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface FeatureFlags {
  obs: boolean;
}

const coreItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    description: "Overview and platform connections",
  },
  {
    title: "Generate Fact",
    url: "/trigger",
    icon: Zap,
    description: "Post facts to your platforms",
  },
  {
    title: "Fact Feed",
    url: "/fact-feed",
    icon: Lightbulb,
    description: "View your personalized facts",
  },
  {
    title: "Announcements",
    url: "/announcements",
    icon: Radio,
    badge: "New",
    description: "Schedule announcements",
  },
  {
    title: "Overlays",
    url: "/overlay-editor",
    icon: Layers,
    description: "OBS overlay editor",
  },
];

const configItems = [
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    description: "Bot configuration",
  },
];

const comingSoonItems = [
  {
    title: "Commands",
    icon: MessageSquare,
    description: "Custom chat commands",
  },
  {
    title: "Giveaways",
    icon: Trophy,
    description: "Run viewer giveaways",
  },
  {
    title: "Currency",
    icon: Coins,
    description: "Custom points system",
  },
  {
    title: "Games",
    icon: Gamepad2,
    description: "Interactive chat games",
  },
  {
    title: "Polls",
    icon: Vote,
    description: "Create viewer polls",
  },
  {
    title: "Song Requests",
    icon: Music,
    description: "Music request system",
  },
  {
    title: "Analytics",
    icon: BarChart3,
    description: "Stream analytics",
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

  const { data: features } = useQuery<FeatureFlags>({
    queryKey: ["/api/features"],
    retry: false,
  });

  return (
    <Sidebar data-testid="sidebar-main" className="border-r">
      <SidebarContent className="gap-0">
        {/* Core Features Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
            Stream Bot
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {coreItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url}
                        data-testid={`link-${item.title.toLowerCase().replace(" ", "-")}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span className="flex-1">{item.title}</span>
                          {item.badge && (
                            <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0 bg-candy-pink/20 text-candy-pink">
                              {item.badge}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{item.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              ))}
              
              {features?.obs && (
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/obs-control"}
                        data-testid="link-obs-control"
                      >
                        <Link href="/obs-control">
                          <Video className="h-4 w-4" />
                          <span>OBS Control</span>
                        </Link>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>Control OBS remotely</p>
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Configuration Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
            Configuration
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {configItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.title.toLowerCase()}`}
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

        {/* Coming Soon Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
            Coming Soon
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {comingSoonItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        className="cursor-not-allowed opacity-50"
                        data-testid={`coming-soon-${item.title.toLowerCase().replace(" ", "-")}`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                      <p className="text-xs text-candy-pink mt-1">Coming Soon!</p>
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              ))}
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
          <div className="font-medium candy-gradient-text">StreamBot</div>
          <div className="mt-0.5">AI-Powered Engagement</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
