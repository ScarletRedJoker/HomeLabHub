import ChannelManager from "@/components/ChannelManager";

/**
 * ChannelsTab Component
 * 
 * Tab for managing Discord channel configurations.
 * Wraps the existing ChannelManager component.
 */
export default function ChannelsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Channel Management</h2>
        <p className="text-discord-muted">
          Configure channels for tickets, logs, and other bot functions.
        </p>
      </div>
      
      <ChannelManager />
    </div>
  );
}
