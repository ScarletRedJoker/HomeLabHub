import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ticket, TicketCategory } from "@shared/schema";
import { useAuthContext } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogOut, User } from "lucide-react";

interface SidebarProps {
  onHelpClick: () => void;
  onNewTicket: () => void;
  onAdminClick?: () => void;
}

export default function Sidebar({ onHelpClick, onNewTicket, onAdminClick }: SidebarProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { user, isAdmin } = useAuthContext();

  // Fetch categories
  const { data: categories = [] } = useQuery<TicketCategory[]>({
    queryKey: ['/api/categories'],
    queryFn: () => fetch('/api/categories').then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch categories: ${res.statusText}`);
      }
      return res.json();
    })
  });

  // Fetch tickets for category counts
  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets'],
    queryFn: () => fetch('/api/tickets').then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch tickets: ${res.statusText}`);
      }
      return res.json();
    })
  });

  // Calculate ticket counts by category
  const getCategoryTicketCount = (categoryId: number) => {
    return tickets.filter((ticket: Ticket) => ticket.categoryId === categoryId).length;
  };

  // Close the sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const sidebar = document.getElementById('mobile-sidebar');
      if (sidebar && !sidebar.contains(event.target as Node) && isMobileSidebarOpen) {
        setIsMobileSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileSidebarOpen]);

  return (
    <>
      {/* Mobile Sidebar Button - Only visible on small screens */}
      <div className="md:hidden fixed top-0 left-0 z-20 p-4">
        <button 
          className="text-discord-text focus:outline-none"
          onClick={() => setIsMobileSidebarOpen(true)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar - Hidden on mobile until toggled */}
      <div 
        id="mobile-sidebar"
        className={`${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 fixed md:static left-0 top-0 z-40 md:z-0 h-screen w-64 bg-discord-sidebar transition-transform duration-200 ease-in-out`}
      >
        <div className="p-4 border-b border-discord-dark">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-discord-blue flex items-center justify-center text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="ml-3 font-bold text-white">Ticket Bot</h1>
          </div>
        </div>
        
        <div className="overflow-y-auto flex-grow">
          {/* User Welcome Section */}
          {user && (
            <div className="px-4 pt-4 pb-2 border-b border-discord-dark">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-white">{user.username}</p>
                    <p className="text-xs text-discord-muted">
                      {isAdmin ? 'Administrator' : 'User'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <ThemeToggle />
                  <button
                    className="p-1.5 hover:bg-gray-700 rounded-md transition-colors duration-200 text-discord-muted hover:text-white"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to sign out?')) {
                        window.location.href = '/auth/logout';
                      }
                    }}
                    title="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Main Navigation */}
          <div className="px-4 pt-5 pb-2">
            <h2 className="text-xs font-semibold text-discord-muted uppercase tracking-wider">
              Main
            </h2>
          </div>
          <div className="mt-1">
            <a href="/" className="block px-4 py-2 bg-gray-700 text-white font-medium flex items-center rounded mx-2 mb-1 group">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <div>
                <span className="block">My Tickets</span>
                <span className="text-xs text-discord-muted group-hover:text-gray-300">View and manage your support tickets</span>
              </div>
            </a>
            <button 
              className="w-full text-left px-4 py-2 hover:bg-gray-700 font-medium flex items-center rounded mx-2 mb-1 group"
              onClick={onHelpClick}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <span className="block">Get Help</span>
                <span className="text-xs text-discord-muted group-hover:text-gray-300">Learn how to use the system</span>
              </div>
            </button>
          </div>
          
          {/* Management Section - Only for admins */}
          {isAdmin && (
            <>
              <div className="px-4 pt-5 pb-2">
                <div className="flex items-center">
                  <h2 className="text-xs font-semibold text-discord-muted uppercase tracking-wider">
                    Management
                  </h2>
                  <span className="ml-2 px-2 py-0.5 bg-yellow-600 text-yellow-100 text-xs rounded-full">
                    Admin
                  </span>
                </div>
                <p className="text-xs text-discord-muted mt-1">Tools for administrators</p>
              </div>
              <div className="mt-1">
                <button 
                  onClick={onAdminClick} 
                  className="w-full text-left block px-4 py-2 hover:bg-gray-700 font-medium flex items-center rounded mx-2 mb-1 group"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <div>
                    <span className="block">Admin Dashboard</span>
                    <span className="text-xs text-discord-muted group-hover:text-gray-300">View stats, manage all tickets</span>
                  </div>
                </button>
                <a href="/settings" className="block px-4 py-2 hover:bg-gray-700 font-medium flex items-center rounded mx-2 mb-1 group">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div>
                    <span className="block">Bot Settings</span>
                    <span className="text-xs text-discord-muted group-hover:text-gray-300">Configure Discord bot and system</span>
                  </div>
                </a>
              </div>
            </>
          )}
          
          {/* Ticket Categories */}
          {categories.length > 0 && (
            <>
              <div className="px-4 pt-5 pb-2">
                <h2 className="text-xs font-semibold text-discord-muted uppercase tracking-wider">
                  Categories
                </h2>
                <p className="text-xs text-discord-muted mt-1">Filter tickets by type</p>
              </div>
              <div className="mt-1">
                {categories.map((category: TicketCategory) => (
                  <a 
                    key={category.id}
                    href="#" 
                    className="block px-4 py-2 hover:bg-gray-700 font-medium flex items-center rounded mx-2 mb-1 group"
                  >
                    <span 
                      className="w-3 h-3 rounded-full mr-3 flex-shrink-0" 
                      style={{ backgroundColor: category.color }}
                    ></span>
                    <span className="flex-grow">{category.name}</span>
                    <span className="ml-2 bg-discord-dark px-2 py-0.5 rounded-full text-xs group-hover:bg-gray-600">
                      {getCategoryTicketCount(category.id)}
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
        
        {/* Quick Actions */}
        <div className="p-4 border-t border-discord-dark">
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-discord-muted uppercase tracking-wider mb-2">
              Quick Actions
            </h3>
            <button 
              className="w-full bg-discord-blue hover:bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center"
              onClick={onNewTicket}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Ticket
            </button>
          </div>
          
          <div className="pt-3 border-t border-discord-dark">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                <div className="text-xs text-discord-muted">
                  <span className="font-medium">Ticket Bot</span> • Online
                </div>
              </div>
              {user && (
                <button
                  className="text-xs text-discord-muted hover:text-white transition-colors duration-200 flex items-center space-x-1 p-1 hover:bg-gray-700 rounded"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to sign out?')) {
                      window.location.href = '/auth/logout';
                    }
                  }}
                  title="Sign out"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
