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
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activity", label: "Activity", icon: History },
  { href: "/status", label: "Status", icon: Activity },
  { href: "/services", label: "Services", icon: Server },
  { href: "/marketplace", label: "Marketplace", icon: Package },
  { href: "/resources", label: "Resources", icon: Shield },
  { href: "/agents", label: "AI Agents", icon: Cpu },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/websites", label: "Websites", icon: Globe },
  { href: "/designer", label: "Designer", icon: Palette },
  { href: "/editor", label: "Code Editor", icon: Code2 },
  { href: "/deploy", label: "Deploy", icon: Rocket },
  { href: "/servers", label: "Servers", icon: HardDrive },
  { href: "/remote", label: "Remote Console", icon: Monitor },
  { href: "/files-remote", label: "Remote Files", icon: FolderOpen },
  { href: "/terminal", label: "Terminal", icon: Terminal },
  { href: "/creative", label: "Creative Studio", icon: Sparkles },
  { href: "/ai", label: "Jarvis AI", icon: Bot },
  { href: "/ai-sandbox", label: "AI Sandbox", icon: Wand2 },
  { href: "/models", label: "Model Catalog", icon: Box },
  { href: "/self", label: "Self", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavContent({ collapsed = false, onNavClick }: { collapsed?: boolean; onNavClick?: () => void }) {
  const pathname = usePathname();
  
  return (
    <nav className="flex-1 p-2 sm:p-4 space-y-1 sm:space-y-2 overflow-y-auto">
      {navItems.map((item) => {
        const isActive = pathname === item.href || 
          (item.href !== "/" && pathname.startsWith(item.href));
        
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 sm:py-2 text-sm transition-colors touch-manipulation",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent",
              collapsed && "justify-center px-2"
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
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
