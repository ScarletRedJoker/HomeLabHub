import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConnectionQualityIndicator } from "@/components/ConnectionQualityIndicator";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AuthProvider } from "@/contexts/AuthContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import UserMenu from "@/components/UserMenu";
import OAuthLogin from "@/pages/OAuthLogin";
import Profile from "@/pages/Profile";
import Dashboard from "@/pages/dashboard";
import FactFeed from "@/pages/fact-feed";
import Settings from "@/pages/settings";
import Trigger from "@/pages/trigger";
import Activity from "@/pages/activity";
import History from "@/pages/history";
import Commands from "@/pages/commands";
import Moderation from "@/pages/moderation";
import Giveaways from "@/pages/giveaways";
import Shoutouts from "@/pages/shoutouts";
import Games from "@/pages/games";
import Currency from "@/pages/currency";
import Statistics from "@/pages/statistics";
import Analytics from "@/pages/analytics";
import SongRequests from "@/pages/song-requests";
import Polls from "@/pages/polls";
import Alerts from "@/pages/alerts";
import Chatbot from "@/pages/chatbot";
import Personality from "@/pages/personality";
import OBSControl from "@/pages/obs-control";
import OverlayEditor from "@/pages/overlay-editor";
import NotFound from "@/pages/not-found";
import SpotifyOverlay from "@/pages/spotify-overlay";
import YouTubeOverlay from "@/pages/youtube-overlay";
import CustomOverlay from "@/pages/custom-overlay";
import StreamAlertsOverlay from "@/pages/stream-alerts-overlay";
import './styles/candy-theme.css';

function AuthRouter() {
  return (
    <Switch>
      <Route path="/login" component={OAuthLogin} />
      {/* Overlay routes - publicly accessible for OBS */}
      <Route path="/overlay/spotify" component={SpotifyOverlay} />
      <Route path="/spotify-overlay" component={SpotifyOverlay} />
      <Route path="/overlay/youtube" component={YouTubeOverlay} />
      <Route path="/youtube-overlay" component={YouTubeOverlay} />
      <Route path="/overlay/custom" component={CustomOverlay} />
      <Route path="/overlay/stream-alerts" component={StreamAlertsOverlay} />
      {/* Public fact feed - accessible without authentication */}
      <Route path="/fact-feed" component={FactFeed} />
      <Route>
        {() => (
          <ProtectedRoute>
            <ProtectedRouter />
          </ProtectedRoute>
        )}
      </Route>
    </Switch>
  );
}

function ProtectedRouter() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <WebSocketProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <OnboardingWizard />
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 sm:gap-4 px-3 py-2 sm:p-4 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="h-8 w-8 sm:h-7 sm:w-7" />
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold candy-gradient-text">StreamBot</h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ConnectionQualityIndicator compact />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/trigger" component={Trigger} />
              <Route path="/activity" component={Activity} />
              <Route path="/history" component={History} />
              <Route path="/statistics" component={Statistics} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/commands" component={Commands} />
              <Route path="/moderation" component={Moderation} />
              <Route path="/giveaways" component={Giveaways} />
              <Route path="/shoutouts" component={Shoutouts} />
              <Route path="/games" component={Games} />
              <Route path="/currency" component={Currency} />
              <Route path="/polls" component={Polls} />
              <Route path="/song-requests" component={SongRequests} />
              <Route path="/alerts" component={Alerts} />
              <Route path="/chatbot" component={Chatbot} />
              <Route path="/personality" component={Personality} />
              <Route path="/obs-control" component={OBSControl} />
              <Route path="/overlay-editor" component={OverlayEditor} />
              <Route path="/settings" component={Settings} />
              <Route path="/profile" component={Profile} />
              <Route component={NotFound} />
            </Switch>
          </main>
          <BottomNavigation />
        </div>
      </div>
      </SidebarProvider>
    </WebSocketProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AuthRouter />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
