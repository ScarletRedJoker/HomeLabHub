import { Home, Settings, Activity, Zap, History, MessageSquare, Shield, Trophy } from "lucide-react";
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
import { Link, useLocation } from "wouter";

const mainItems = [
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
  {
    title: "Commands",
    url: "/commands",
    icon: MessageSquare,
  },
  {
    title: "Moderation",
    url: "/moderation",
    icon: Shield,
  },
  {
    title: "Giveaways",
    url: "/giveaways",
    icon: Trophy,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

const platformItems = [
  {
    title: "Twitch",
    platform: "twitch",
    icon: SiTwitch,
  },
  {
    title: "YouTube",
    platform: "youtube",
    icon: SiYoutube,
  },
  {
    title: "Kick",
    platform: "kick",
    icon: SiKick,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-base font-semibold px-2">
            StreamBot
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
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

        <SidebarGroup>
          <SidebarGroupLabel className="px-2">Platforms</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformItems.map((item) => (
                <SidebarMenuItem key={item.platform}>
                  <SidebarMenuButton
                    className="cursor-default"
                    data-testid={`platform-${item.platform}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-4 py-3 text-xs text-muted-foreground">
          AI-Powered Snapple Facts
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
