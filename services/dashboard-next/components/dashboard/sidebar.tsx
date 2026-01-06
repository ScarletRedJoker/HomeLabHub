"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Activity,
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
  { href: "/status", label: "Status", icon: Activity },
  { href: "/services", label: "Services", icon: Server },
  { href: "/websites", label: "Websites", icon: Globe },
  { href: "/designer", label: "Designer", icon: Palette },
  { href: "/editor", label: "Code Editor", icon: Code2 },
  { href: "/deploy", label: "Deploy", icon: Rocket },
  { href: "/servers", label: "Servers", icon: HardDrive },
  { href: "/files-remote", label: "Remote Files", icon: FolderOpen },
  { href: "/terminal", label: "Terminal", icon: Terminal },
  { href: "/creative", label: "Creative Studio", icon: Sparkles },
  { href: "/ai", label: "Jarvis AI", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavContent({ collapsed = false, onNavClick }: { collapsed?: boolean; onNavClick?: () => void }) {
  const pathname = usePathname();
  
  return (
    <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
      {navItems.map((item) => {
        const isActive = pathname === item.href || 
          (item.href !== "/" && pathname.startsWith(item.href));
        
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              collapsed && "justify-center px-2"
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="h-16 flex flex-row items-center border-b px-4">
          <Link href="/" className="flex items-center gap-2" onClick={() => onOpenChange(false)}>
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold">H</span>
            </div>
            <SheetTitle className="font-semibold text-lg">HomeLabHub</SheetTitle>
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
              <span className="text-primary-foreground font-bold">H</span>
            </div>
            <span className="font-semibold text-lg">HomeLabHub</span>
          </Link>
        )}
        {collapsed && (
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground font-bold">H</span>
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
