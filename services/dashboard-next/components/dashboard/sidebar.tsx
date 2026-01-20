"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Activity,
  History,
  Server,
  Globe,
  Code2,
  Rocket,
  HardDrive,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Palette,
  Terminal,
  FolderOpen,
  Sparkles,
  Package,
  Shield,
  Cpu,
  AlertTriangle,
  Wrench,
  Monitor,
  Wand2,
  Box,
  Factory,
  Layers,
  GitBranch,
  Play,
  Cog,
  Zap,
  Network,
  Megaphone,
  Link2,
  Radio,
  Music,
  Download,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  defaultOpen?: boolean;
}

const navGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/status", label: "Status", icon: Activity },
      { href: "/activity", label: "Activity", icon: History },
      { href: "/incidents", label: "Incidents", icon: AlertTriangle },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    icon: Server,
    defaultOpen: true,
    items: [
      { href: "/command-center", label: "Command Center", icon: Network },
      { href: "/connections", label: "Connections", icon: Link2 },
      { href: "/production-control", label: "Production Control", icon: Rocket },
      { href: "/inventory", label: "Inventory", icon: Box },
      { href: "/infrastructure", label: "Infrastructure", icon: Server },
      { href: "/servers", label: "Servers", icon: HardDrive },
      { href: "/services", label: "Services", icon: Server },
      { href: "/domain-manager", label: "Domain Manager", icon: Globe },
      { href: "/resources", label: "Resources", icon: Shield },
      { href: "/terminal", label: "Terminal", icon: Terminal },
      { href: "/remote", label: "Remote Console", icon: Monitor },
      { href: "/windows", label: "Windows VM", icon: Monitor },
      { href: "/files-remote", label: "Remote Files", icon: FolderOpen },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    icon: Zap,
    items: [
      { href: "/pipelines", label: "Pipelines", icon: GitBranch },
      { href: "/deploy", label: "Deploy", icon: Rocket },
      { href: "/agents", label: "AI Agents", icon: Cpu },
    ],
  },
  {
    id: "ai-media",
    label: "AI & Creative",
    icon: Sparkles,
    items: [
      { href: "/ai", label: "Jarvis AI", icon: Bot },
      { href: "/ai-jobs", label: "AI Jobs", icon: Cpu },
      { href: "/ai-training", label: "Training", icon: Play },
      { href: "/ai-speech", label: "Speech", icon: Wand2 },
      { href: "/ai-knowledge", label: "Knowledge Base", icon: Layers },
      { href: "/ai-sandbox", label: "AI Sandbox", icon: Wand2 },
      { href: "/creative-studio", label: "Creative Studio", icon: Sparkles },
    ],
  },
  {
    id: "development",
    label: "Development",
    icon: Code2,
    items: [
      { href: "/quick-start", label: "Quick Start", icon: Rocket },
      { href: "/content-hub", label: "Content Hub", icon: Package },
      { href: "/factory", label: "App Factory", icon: Factory },
      { href: "/builder", label: "Builder", icon: Wrench },
      { href: "/code-assist", label: "Code Assist", icon: Wand2 },
      { href: "/projects", label: "Projects", icon: Layers },
      { href: "/editor", label: "Code Editor", icon: Code2 },
    ],
  },
  {
    id: "media",
    label: "Media",
    icon: Download,
    items: [
      { href: "/media-library", label: "Media Library", icon: Music },
    ],
  },
  {
    id: "websites",
    label: "Websites",
    icon: Globe,
    items: [
      { href: "/websites", label: "Websites", icon: Globe },
      { href: "/designer", label: "Designer", icon: Palette },
      { href: "/marketing", label: "Marketing", icon: Megaphone },
    ],
  },
  {
    id: "streaming",
    label: "Streaming",
    icon: Radio,
    items: [
      { href: "/stream-config", label: "Stream Bot", icon: Bot },
      { href: "/discord-presence", label: "Discord Presence", icon: Radio },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: Cog,
    items: [
      { href: "/self", label: "Self", icon: Wrench },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function NavGroupComponent({ 
  group, 
  collapsed = false, 
  onNavClick,
  pathname,
  openGroups,
  toggleGroup,
}: { 
  group: NavGroup;
  collapsed?: boolean;
  onNavClick?: () => void;
  pathname: string;
  openGroups: Set<string>;
  toggleGroup: (id: string) => void;
}) {
  const isOpen = openGroups.has(group.id);
  const hasActiveItem = group.items.some(item => 
    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
  );

  if (collapsed) {
    return (
      <div className="space-y-1">
        {group.items.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                "flex items-center justify-center rounded-lg p-2 transition-colors touch-manipulation",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              title={item.label}
            >
              <item.icon className="h-5 w-5" />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={() => toggleGroup(group.id)}>
      <CollapsibleTrigger className={cn(
        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        hasActiveItem 
          ? "text-foreground" 
          : "text-muted-foreground hover:text-foreground"
      )}>
        <div className="flex items-center gap-2">
          <group.icon className="h-4 w-4" />
          <span>{group.label}</span>
        </div>
        <ChevronDown className={cn(
          "h-4 w-4 transition-transform",
          isOpen && "rotate-180"
        )} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 space-y-1 mt-1">
        {group.items.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors touch-manipulation",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

function NavContent({ collapsed = false, onNavClick }: { collapsed?: boolean; onNavClick?: () => void }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    navGroups.forEach(group => {
      if (group.defaultOpen) initial.add(group.id);
      if (group.items.some(item => 
        pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
      )) {
        initial.add(group.id);
      }
    });
    return initial;
  });

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  return (
    <nav className="flex-1 p-2 sm:p-4 space-y-2 overflow-y-auto">
      {navGroups.map((group) => (
        <NavGroupComponent
          key={group.id}
          group={group}
          collapsed={collapsed}
          onNavClick={onNavClick}
          pathname={pathname}
          openGroups={openGroups}
          toggleGroup={toggleGroup}
        />
      ))}
    </nav>
  );
}

export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] max-w-[85vw] p-0">
        <SheetHeader className="h-14 sm:h-16 flex flex-row items-center border-b px-3 sm:px-4">
          <Link href="/" className="flex items-center gap-2" onClick={() => onOpenChange(false)}>
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold">N</span>
            </div>
            <SheetTitle className="font-semibold text-base sm:text-lg truncate">Nebula Command</SheetTitle>
          </Link>
        </SheetHeader>
        <NavContent onNavClick={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative hidden md:flex flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 items-center border-b px-4">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold">N</span>
            </div>
            <span className="font-semibold text-lg">Nebula Command</span>
          </Link>
        )}
        {collapsed && (
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground font-bold">N</span>
          </div>
        )}
      </div>

      <NavContent collapsed={collapsed} />

      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </Button>
    </aside>
  );
}
