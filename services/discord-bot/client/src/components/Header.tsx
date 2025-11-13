import React from "react";
import { Search, Filter, Plus } from "lucide-react";

interface HeaderProps {
  title: string;
  totalTickets: number;
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFilterToggle: () => void;
  onNewTicket: () => void;
  hasActiveFilters?: boolean;
}

export default function Header({
  title,
  totalTickets,
  searchQuery,
  onSearchChange,
  onFilterToggle,
  onNewTicket,
  hasActiveFilters = false
}: HeaderProps) {
  
  const hasSearchQuery = searchQuery.trim() !== '';
  
  return (
    <header className="bg-discord-bg border-b border-discord-dark">
      {/* Main Header Bar */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-discord-text">{title}</h1>
            {totalTickets > 0 && (
              <span className="ml-3 text-sm text-discord-muted">
                {totalTickets} ticket{totalTickets !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          
          {/* Primary Action - Always visible to encourage ticket creation */}
          <div className="flex items-center space-x-3">
            {/* Desktop New Ticket Button - Always visible */}
            <button 
              className="hidden sm:flex items-center px-4 py-2 bg-discord-blue hover:bg-blue-600 rounded-md text-white text-sm font-medium transition-colors duration-200 shadow-sm"
              onClick={onNewTicket}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Ticket
            </button>
            
            {/* Mobile New Ticket Button - Always visible */}
            <button 
              className="sm:hidden flex items-center justify-center w-10 h-10 bg-discord-blue hover:bg-blue-600 rounded-full text-white transition-colors duration-200 shadow-sm"
              onClick={onNewTicket}
              aria-label="Create new ticket"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Search and Filter Bar - Only show when there are tickets */}
      {totalTickets > 0 && (
        <div className="px-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
            {/* Enhanced Search Box */}
            <div className="flex-1 relative max-w-md">
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-discord-muted" />
              <input 
                type="text" 
                placeholder="Search your tickets..." 
                className="w-full bg-discord-dark border border-discord-dark text-discord-text pl-10 pr-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-discord-blue focus:border-transparent transition-all duration-200"
                value={searchQuery}
                onChange={onSearchChange}
              />
              {hasSearchQuery && (
                <button
                  className="absolute right-3 top-2.5 text-discord-muted hover:text-discord-text transition-colors"
                  onClick={() => onSearchChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>)}
                  aria-label="Clear search"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            {/* Compact Filter Button */}
            <button 
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                hasActiveFilters 
                  ? 'bg-discord-blue text-white shadow-sm' 
                  : 'bg-discord-dark text-discord-text hover:bg-gray-700'
              }`}
              onClick={onFilterToggle}
              aria-label="Toggle filters"
            >
              <Filter className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Filter</span>
              {hasActiveFilters && (
                <span className="ml-1 w-2 h-2 bg-white rounded-full sm:hidden" aria-hidden="true"></span>
              )}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
