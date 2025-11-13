import { LoginRequired } from "@/components/LoginRequired";
import DashboardShell from "@/pages/DashboardShell";

/**
 * Dashboard Component
 * 
 * Main entry point for the dashboard page.
 * 
 * This component:
 * - Wraps the DashboardShell in LoginRequired to ensure authentication
 * - Provides a single, tabbed dashboard that works for both admins and regular users
 * - Consolidates all dashboard functionality (Overview, Music, Admin tools) into one interface
 * 
 * Authentication:
 * The LoginRequired wrapper ensures that only authenticated users can access
 * the dashboard. Unauthenticated users are redirected to the login page.
 * 
 * Role Awareness:
 * The DashboardShell component automatically detects the user's role (admin or regular user)
 * and displays appropriate tabs based on that role:
 * - All users: Overview, Music, Health tabs
 * - Admin users: Additional Tickets, Panels, Channels tabs
 * 
 * @returns {JSX.Element} The authenticated dashboard interface
 */
export default function Dashboard() {
  return (
    <LoginRequired>
      {/* 
        DashboardShell component provides a tabbed interface for all functionality
        Tabs adapt based on user role with admin-only features hidden for regular users
      */}
      <DashboardShell />
    </LoginRequired>
  );
}
