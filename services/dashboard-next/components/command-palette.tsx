"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Server,
  Globe,
  Code2,
  Rocket,
  HardDrive,
  Bot,
  Settings,
  Terminal,
  FolderOpen,
  Palette,
  Power,
  RefreshCw,
  Upload,
  Home,
  Cloud,
  Search,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  group: string;
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const router = useRouter();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const navigationItems: CommandItem[] = [
    {
      id: "dashboard",
      label: "Go to Dashboard",
      icon: LayoutDashboard,
      shortcut: "⌘D",
      action: () => router.push("/"),
      group: "Navigation",
    },
    {
      id: "services",
      label: "Go to Services",
      icon: Server,
      shortcut: "⌘S",
      action: () => router.push("/services"),
      group: "Navigation",
    },
    {
      id: "servers",
      label: "Go to Servers",
      icon: HardDrive,
      action: () => router.push("/servers"),
      group: "Navigation",
    },
    {
      id: "websites",
      label: "Go to Websites",
      icon: Globe,
      action: () => router.push("/websites"),
      group: "Navigation",
    },
    {
      id: "designer",
      label: "Go to Designer",
      icon: Palette,
      action: () => router.push("/designer"),
      group: "Navigation",
    },
    {
      id: "editor",
      label: "Go to Code Editor",
      icon: Code2,
      action: () => router.push("/editor"),
      group: "Navigation",
    },
    {
      id: "deploy",
      label: "Go to Deploy",
      icon: Rocket,
      action: () => router.push("/deploy"),
      group: "Navigation",
    },
    {
      id: "files",
      label: "Go to Remote Files",
      icon: FolderOpen,
      action: () => router.push("/files-remote"),
      group: "Navigation",
    },
    {
      id: "terminal",
      label: "Go to Terminal",
      icon: Terminal,
      shortcut: "⌘T",
      action: () => router.push("/terminal"),
      group: "Navigation",
    },
    {
      id: "ai",
      label: "Go to Jarvis AI",
      icon: Bot,
      action: () => router.push("/ai"),
      group: "Navigation",
    },
    {
      id: "prompts",
      label: "Go to Prompt Library",
      icon: BookOpen,
      action: () => router.push("/prompts"),
      group: "Navigation",
    },
  ];

  const serverActions: CommandItem[] = [
    {
      id: "wake-home",
      label: "Wake Home Server",
      icon: Power,
      action: async () => {
        try {
          const res = await fetch("/api/servers/power", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serverId: "home", action: "wake" }),
          });
          if (!res.ok) {
            console.error("Failed to wake home server:", await res.text());
          }
        } catch (e) {
          console.error("Failed to wake home server", e);
        }
      },
      group: "Server Actions",
    },
    {
      id: "restart-linode",
      label: "Restart Linode",
      icon: RefreshCw,
      action: async () => {
        try {
          const res = await fetch("/api/servers/power", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serverId: "linode", action: "restart" }),
          });
          if (!res.ok) {
            console.error("Failed to restart linode:", await res.text());
          }
        } catch (e) {
          console.error("Failed to restart linode", e);
        }
      },
      group: "Server Actions",
    },
    {
      id: "open-terminal",
      label: "Open Terminal",
      icon: Terminal,
      shortcut: "⌘T",
      action: () => router.push("/terminal"),
      group: "Server Actions",
    },
  ];

  const quickActions: CommandItem[] = [
    {
      id: "deploy-linode",
      label: "Deploy to Linode",
      icon: Cloud,
      action: () => router.push("/deploy?target=linode"),
      group: "Quick Actions",
    },
    {
      id: "deploy-home",
      label: "Deploy to Home Server",
      icon: Home,
      action: () => router.push("/deploy?target=home"),
      group: "Quick Actions",
    },
    {
      id: "settings",
      label: "Open Settings",
      icon: Settings,
      shortcut: "⌘,",
      action: () => router.push("/settings"),
      group: "Quick Actions",
    },
  ];

  const allItems = [...navigationItems, ...serverActions, ...quickActions];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-[640px]">
        <Command
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3"
          filter={(value, search) => {
            const item = allItems.find((i) => i.id === value);
            if (!item) return 0;
            const label = item.label.toLowerCase();
            const searchLower = search.toLowerCase();
            if (label.includes(searchLower)) return 1;
            const words = searchLower.split(" ");
            if (words.every((word) => label.includes(word))) return 0.8;
            let score = 0;
            let searchIndex = 0;
            for (const char of label) {
              if (searchIndex < searchLower.length && char === searchLower[searchIndex]) {
                score++;
                searchIndex++;
              }
            }
            return searchIndex === searchLower.length ? score / label.length : 0;
          }}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Type a command or search..."
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              value={search}
              onValueChange={setSearch}
            />
            <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group heading="Navigation" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {navigationItems.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.id}
                  onSelect={() => runCommand(item.action)}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none",
                    "aria-selected:bg-accent aria-selected:text-accent-foreground",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <item.icon className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && (
                    <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                      {item.shortcut}
                    </kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Separator className="h-px bg-border mx-2 my-1" />

            <Command.Group heading="Server Actions" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {serverActions.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.id}
                  onSelect={() => runCommand(item.action)}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none",
                    "aria-selected:bg-accent aria-selected:text-accent-foreground",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <item.icon className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && (
                    <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                      {item.shortcut}
                    </kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Separator className="h-px bg-border mx-2 my-1" />

            <Command.Group heading="Quick Actions" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {quickActions.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.id}
                  onSelect={() => runCommand(item.action)}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none",
                    "aria-selected:bg-accent aria-selected:text-accent-foreground",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <item.icon className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && (
                    <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                      {item.shortcut}
                    </kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
                <span>Select</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">ESC</kbd>
                <span>Close</span>
              </span>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
