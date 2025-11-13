import React from "react";

interface CommandHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandHelp({ isOpen, onClose }: CommandHelpProps) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-10 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-discord-sidebar rounded-lg shadow-lg w-full max-w-2xl mx-4">
        <div className="p-4 border-b border-discord-dark">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Bot Commands</h2>
            <button 
              className="text-discord-muted hover:text-white"
              onClick={onClose}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="p-4 overflow-y-auto max-h-[70vh]">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">General Commands</h3>
              <div className="bg-discord-dark rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-discord-sidebar">
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket create</td>
                      <td className="py-2 px-4 text-discord-text">Creates a new support ticket</td>
                    </tr>
                    <tr className="border-b border-discord-sidebar">
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket list</td>
                      <td className="py-2 px-4 text-discord-text">Shows your open tickets</td>
                    </tr>
                    <tr className="border-b border-discord-sidebar">
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket view [ID]</td>
                      <td className="py-2 px-4 text-discord-text">Views a specific ticket by ID</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket close [ID]</td>
                      <td className="py-2 px-4 text-discord-text">Closes a ticket</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Admin Commands</h3>
              <div className="bg-discord-dark rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-discord-sidebar">
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket assign [ID] [@user]</td>
                      <td className="py-2 px-4 text-discord-text">Assigns a ticket to a staff member</td>
                    </tr>
                    <tr className="border-b border-discord-sidebar">
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket priority [ID] [level]</td>
                      <td className="py-2 px-4 text-discord-text">Sets ticket priority level</td>
                    </tr>
                    <tr className="border-b border-discord-sidebar">
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket category [ID] [category]</td>
                      <td className="py-2 px-4 text-discord-text">Changes ticket category</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket delete [ID]</td>
                      <td className="py-2 px-4 text-discord-text">Permanently deletes a ticket</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Setup Commands</h3>
              <div className="bg-discord-dark rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-discord-sidebar">
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket setup</td>
                      <td className="py-2 px-4 text-discord-text">Creates ticket channels and categories</td>
                    </tr>
                    <tr className="border-b border-discord-sidebar">
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket add-category [name]</td>
                      <td className="py-2 px-4 text-discord-text">Adds a new ticket category</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-mono text-discord-blue">/ticket settings</td>
                      <td className="py-2 px-4 text-discord-text">Configures ticket bot settings</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
