import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import UserMenu from "@/components/UserMenu";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Profile from "@/pages/Profile";
import Dashboard from "@/pages/dashboard";
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
import SongRequests from "@/pages/song-requests";
import NotFound from "@/pages/not-found";
import SpotifyOverlay from "@/pages/spotify-overlay";
import YouTubeOverlay from "@/pages/youtube-overlay";

function AuthRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      {/* Overlay routes - publicly accessible for OBS */}
      <Route path="/overlay/spotify" component={SpotifyOverlay} />
      <Route path="/spotify-overlay" component={SpotifyOverlay} />
      <Route path="/overlay/youtube" component={YouTubeOverlay} />
      <Route path="/youtube-overlay" component={YouTubeOverlay} />
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
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 p-4 border-b bg-background sticky top-0 z-10">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/trigger" component={Trigger} />
              <Route path="/activity" component={Activity} />
              <Route path="/history" component={History} />
              <Route path="/statistics" component={Statistics} />
              <Route path="/commands" component={Commands} />
              <Route path="/moderation" component={Moderation} />
              <Route path="/giveaways" component={Giveaways} />
              <Route path="/shoutouts" component={Shoutouts} />
              <Route path="/games" component={Games} />
              <Route path="/currency" component={Currency} />
              <Route path="/song-requests" component={SongRequests} />
              <Route path="/settings" component={Settings} />
              <Route path="/profile" component={Profile} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthRouter />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
