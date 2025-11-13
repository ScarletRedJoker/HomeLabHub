import PanelEmbedManager from "@/pages/PanelEmbedManager";

/**
 * PanelsTab Component
 * 
 * Tab for managing Discord embed panels and templates.
 * Includes comprehensive embed template creator and panel deployment system.
 */
export default function PanelsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Panel & Embed Templates</h2>
        <p className="text-discord-muted">
          Create and manage custom Discord embed panels with interactive buttons for tickets, announcements, and more.
        </p>
      </div>
      
      <PanelEmbedManager />
    </div>
  );
}
