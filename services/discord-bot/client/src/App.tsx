import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuthContext } from "@/components/AuthProvider";
import { ServerProvider } from "@/contexts/ServerContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import OnboardingFlow from "@/components/OnboardingFlow";
import Dashboard from "@/pages/Dashboard";
import DeveloperDashboard from "@/pages/DeveloperDashboard";
import NotFound from "@/pages/not-found";

function Router() {
  const { user } = useAuthContext();

  return (
    <>
      <Switch>
        <Route path="/dev" component={DeveloperDashboard} />
        <Route path="/" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
      
      {/* Show onboarding flow if user needs onboarding */}
      {user?.needsOnboarding && (
        <OnboardingFlow onComplete={() => window.location.reload()} />
      )}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="discord-ticket-theme">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ServerProvider>
              <Router />
              <Toaster />
            </ServerProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
