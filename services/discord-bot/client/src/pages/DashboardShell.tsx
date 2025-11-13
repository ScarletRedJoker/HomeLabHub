import { useState } from "react";
import { useAuthContext } from "@/components/AuthProvider";
import { useServerContext } from "@/contexts/ServerContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import ServerSelector from "@/components/ServerSelector";
import BotInviteCard from "@/components/BotInviteCard";
import SettingsPage from "@/pages/SettingsPage";
import { 
  LayoutDashboard, 
  Settings, 
  LogOut, 
  LayoutTemplate,
  Bot,
  Radio
} from "lucide-react";

// Tab Components
import OverviewTab from "@/components/tabs/OverviewTab";
import PanelsTab from "@/components/tabs/PanelsTab";
import StreamNotificationsTab from "@/components/tabs/StreamNotificationsTab";

/**
 * DashboardShell Component
 * 
 * Unified dashboard with tabbed navigation for all bot management features.
 * 
 * Tabs:
 * - Overview: Ticket management and statistics (all users)
 * - Panels: Panel template customization (admin only)
 * - Stream Notifications: Stream go-live notification management (admin only)
 * 
 * Features:
 * - Role-based access control (admin vs regular users)
 * - Shared header with server selector, theme toggle, and user menu
 * - Persistent tab state during session
 * - Responsive design for mobile and desktop
 * - Channels, Health, and Categories moved to Settings panel
 */
export default function DashboardShell() {
  const { user, isAdmin, logout } = useAuthContext();
  const { selectedServerId, setSelectedServerId } = useServerContext();
  const [activeTab, setActiveTab] = useState("overview");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-discord-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-discord-sidebar border-b border-discord-dark shadow-lg">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            {/* Logo & Title + Mobile Actions Row */}
            <div className="flex items-center justify-between w-full sm:w-auto gap-3">
              {/* Logo & Title */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-discord-blue rounded-lg flex items-center justify-center flex-shrink-0">
                  <LayoutDashboard className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-xl font-bold text-white truncate">Discord Bot Dashboard</h1>
                  <p className="text-xs text-discord-muted truncate">
                    {isAdmin ? 'Administrator Panel' : 'User Panel'}
                  </p>
                </div>
              </div>

              {/* Mobile Quick Actions */}
              <div className="flex items-center gap-1 sm:hidden">
                <ThemeToggle />
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  className="text-discord-text hover:text-white hover:bg-discord-dark h-11 w-11"
                  data-testid="button-settings-mobile"
                >
                  <Settings className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="text-discord-text hover:text-white hover:bg-discord-dark h-11 w-11"
                  data-testid="button-logout-mobile"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Server Selector - Desktop */}
            <div className="flex-1 max-w-md hidden md:block">
              <ServerSelector
                selectedServerId={selectedServerId}
                onServerSelect={setSelectedServerId}
              />
            </div>

            {/* Right Actions - Desktop Only */}
            <div className="hidden sm:flex items-center gap-2">
              {/* Invite Bot Button - Only for admins */}
              {isAdmin && (
                <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-discord-blue text-discord-blue hover:bg-discord-blue hover:text-white hidden lg:flex h-11"
                      data-testid="button-invite-bot"
                    >
                      <Bot className="h-4 w-4 mr-2" />
                      Invite Bot
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-discord-sidebar border-discord-dark max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-white">Invite Bot to Server</DialogTitle>
                    </DialogHeader>
                    <BotInviteCard variant="default" showDescription={true} />
                  </DialogContent>
                </Dialog>
              )}
              
              <ThemeToggle />
              
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setSettingsOpen(true)}
                className="text-discord-text hover:text-white hover:bg-discord-dark h-11 w-11"
                data-testid="button-settings"
              >
                <Settings className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-discord-text hover:text-white hover:bg-discord-dark h-11 w-11"
                data-testid="button-logout"
              >
                <LogOut className="h-5 w-5" />
              </Button>

              {/* User Avatar */}
              <div className="flex items-center gap-2 pl-2 border-l border-discord-dark">
                <div className="w-9 h-9 rounded-full bg-discord-blue flex items-center justify-center">
                  <span className="text-white text-sm font-bold">
                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <span className="text-sm text-white font-medium hidden lg:block">
                  {user?.username || 'User'}
                </span>
              </div>
            </div>
          </div>

          {/* Mobile Server Selector */}
          <div className="md:hidden mt-3">
            <ServerSelector
              selectedServerId={selectedServerId}
              onServerSelect={setSelectedServerId}
            />
          </div>
        </div>
      </header>

      {/* Main Content with Tabs */}
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
          {/* Tab Navigation */}
          <Card className="bg-discord-sidebar border-discord-dark">
            <CardContent className="p-2">
              {/* Mobile: Horizontal Scroll */}
              <div className="md:hidden overflow-x-auto -mx-2 px-2">
                <TabsList className="inline-flex w-auto bg-transparent gap-2 min-w-full">
                  <TabsTrigger 
                    value="overview" 
                    className="data-[state=active]:bg-discord-blue data-[state=active]:text-white flex-shrink-0 h-11 px-4"
                    data-testid="tab-overview"
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    <span>Overview</span>
                  </TabsTrigger>

                  {isAdmin && (
                    <>
                      <TabsTrigger 
                        value="panels" 
                        className="data-[state=active]:bg-discord-blue data-[state=active]:text-white flex-shrink-0 h-11 px-4"
                        data-testid="tab-panels"
                      >
                        <LayoutTemplate className="h-4 w-4 mr-2" />
                        <span>Panels</span>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="stream-notifications" 
                        className="data-[state=active]:bg-discord-blue data-[state=active]:text-white flex-shrink-0 h-11 px-4"
                        data-testid="tab-stream-notifications"
                      >
                        <Radio className="h-4 w-4 mr-2" />
                        <span>Streams</span>
                      </TabsTrigger>
                    </>
                  )}
                </TabsList>
              </div>

              {/* Desktop: Grid Layout */}
              <TabsList className="hidden md:grid w-full bg-transparent gap-2" style={{ 
                gridTemplateColumns: isAdmin ? 'repeat(3, 1fr)' : 'repeat(1, 1fr)' 
              }}>
                <TabsTrigger 
                  value="overview" 
                  className="data-[state=active]:bg-discord-blue data-[state=active]:text-white h-11"
                  data-testid="tab-overview-desktop"
                >
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  <span>Overview</span>
                </TabsTrigger>

                {isAdmin && (
                  <>
                    <TabsTrigger 
                      value="panels" 
                      className="data-[state=active]:bg-discord-blue data-[state=active]:text-white h-11"
                      data-testid="tab-panels-desktop"
                    >
                      <LayoutTemplate className="h-4 w-4 mr-2" />
                      <span>Panels</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="stream-notifications" 
                      className="data-[state=active]:bg-discord-blue data-[state=active]:text-white h-11"
                      data-testid="tab-stream-notifications-desktop"
                    >
                      <Radio className="h-4 w-4 mr-2" />
                      <span>Streams</span>
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
            </CardContent>
          </Card>

          {/* Tab Content */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <OverviewTab />
          </TabsContent>

          {isAdmin && (
            <>
              <TabsContent value="panels" className="space-y-6 mt-6">
                <PanelsTab />
              </TabsContent>
              <TabsContent value="stream-notifications" className="space-y-6 mt-6">
                <StreamNotificationsTab />
              </TabsContent>
            </>
          )}
        </Tabs>
      </main>

      {/* Settings Sheet (Sliding Panel) */}
      <SettingsPage isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
