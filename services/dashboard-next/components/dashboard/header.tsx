"use client";

import { Bell, Search, User, Moon, Sun, Menu, Settings, LogOut, UserCircle, Server, CheckCircle2, AlertTriangle, Info, Shield, Key, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Notification {
  id: string;
  type: "success" | "warning" | "info" | "error" | "security";
  title: string;
  message: string;
  time: string;
  read: boolean;
  code?: string;
}

interface SecurityNotification {
  id: string;
  type: "otp" | "reset" | "security";
  recipient: string;
  subject: string;
  code?: string;
  revokeUrl?: string;
  timestamp: string;
  read: boolean;
}

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  useEffect(() => {
    setMounted(true);
    
    const fetchNotifications = async () => {
      try {
        const newNotifications: Notification[] = [];
        const now = new Date().toLocaleTimeString();

        const [healthRes, securityRes] = await Promise.all([
          fetch("/api/health/status").catch(() => null),
          fetch("/api/authelia/notifications").catch(() => null),
        ]);

        if (securityRes?.ok) {
          const secData = await securityRes.json();
          if (secData.notifications?.length > 0) {
            secData.notifications.forEach((n: SecurityNotification) => {
              newNotifications.push({
                id: n.id,
                type: "security",
                title: n.code ? "Security Code" : n.subject,
                message: n.code 
                  ? `One-time code for ${n.recipient}`
                  : `Security notification for ${n.recipient}`,
                time: new Date(n.timestamp).toLocaleTimeString(),
                read: false,
                code: n.code,
              });
            });
          }
        }
        
        if (healthRes?.ok) {
          const data = await healthRes.json();
          
          if (data.servers) {
            data.servers.forEach((server: any) => {
              if (server.status === "offline") {
                newNotifications.push({
                  id: `server-${server.id}`,
                  type: "error",
                  title: "Server Offline",
                  message: `${server.name} is not responding`,
                  time: now,
                  read: false,
                });
              } else if (server.metrics?.cpu > 80) {
                newNotifications.push({
                  id: `cpu-${server.id}`,
                  type: "warning",
                  title: "High CPU Usage",
                  message: `${server.name}: ${server.metrics.cpu}% CPU`,
                  time: now,
                  read: false,
                });
              }
            });
          }
        }
          
        if (newNotifications.length === 0) {
          newNotifications.push({
            id: "all-good",
            type: "success",
            title: "All Systems Operational",
            message: "No issues detected",
            time: now,
            read: false,
          });
        }
          
        setNotifications(newNotifications);
      } catch (error) {
        setNotifications([{
          id: "fetch-error",
          type: "info",
          title: "Status Check",
          message: "Unable to fetch server status",
          time: new Date().toLocaleTimeString(),
          read: false,
        }]);
      }
    };
    
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      window.location.href = "/login";
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "warning": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "error": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "security": return <Shield className="h-4 w-4 text-purple-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6">
      <div className="flex items-center gap-3 flex-1">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
        
        <Link href="/" className="flex items-center gap-2 md:hidden shrink-0">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold">N</span>
          </div>
        </Link>
        
        <div className="relative w-full max-w-[200px] sm:max-w-xs md:max-w-sm lg:max-w-md hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search... (Cmd+K)"
            className="pl-10"
            onFocus={(e) => {
              e.target.blur();
              const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
              document.dispatchEvent(event);
            }}
            readOnly
          />
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label="Search"
          onClick={() => {
            const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
            document.dispatchEvent(event);
          }}
        >
          <Search className="h-5 w-5" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {mounted ? (
            theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
        
        <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80 max-w-sm p-0" align="end">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b">
              <h4 className="font-semibold text-sm sm:text-base">Notifications</h4>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs sm:text-sm h-7 sm:h-8 px-2 sm:px-3" onClick={markAllRead}>
                  Mark all read
                </Button>
              )}
            </div>
            <ScrollArea className="h-[250px] sm:h-[300px]">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No notifications
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 sm:p-4 flex gap-2 sm:gap-3 hover:bg-muted/50 transition-colors ${
                        !notification.read ? "bg-muted/30" : ""
                      } ${notification.type === "security" ? "bg-purple-500/5 border-l-2 border-purple-500" : ""}`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs sm:text-sm">{notification.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                        {notification.code && (
                          <div className="mt-2 flex items-center gap-2">
                            <code className="bg-purple-500/10 text-purple-500 px-3 py-1.5 rounded font-mono text-sm font-bold tracking-wider">
                              {notification.code}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => copyCode(notification.code!)}
                            >
                              {copiedCode === notification.code ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        )}
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                          {notification.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="p-2 border-t">
              <Link href="/incidents" onClick={() => setNotificationsOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full">
                  View all incidents
                </Button>
              </Link>
            </div>
          </PopoverContent>
        </Popover>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">Admin</p>
                <p className="text-xs text-muted-foreground">admin@homelab.local</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <Link href="/settings?tab=profile">
              <DropdownMenuItem>
                <UserCircle className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
            </Link>
            <Link href="/settings?tab=servers">
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            </Link>
            <Link href="/servers">
              <DropdownMenuItem>
                <Server className="mr-2 h-4 w-4" />
                Servers
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive focus:text-destructive cursor-pointer"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
