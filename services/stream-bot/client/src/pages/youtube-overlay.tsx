import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface LivestreamData {
  isLive: boolean;
  title?: string;
  viewerCount?: number;
  channelName?: string;
  thumbnailUrl?: string;
  liveChatId?: string;
}

export default function YouTubeOverlay() {
  const [livestream, setLivestream] = useState<LivestreamData>({ isLive: false });
  const [fadeOut, setFadeOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get token from URL query params
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setError('Missing overlay token. Please generate a new overlay URL from your settings.');
      return;
    }

    // Poll for livestream status every 10 seconds (less frequent than Spotify)
    const fetchLivestream = async () => {
      try {
        const response = await fetch(`/api/overlay/youtube/data?token=${token}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 401) {
            setError(errorData.error || 'Invalid or expired token. Please generate a new overlay URL.');
            return;
          }
          if (response.status === 429) {
            console.warn('Rate limited, skipping this refresh');
            return;
          }
          throw new Error(errorData.error || 'Failed to fetch livestream data');
        }
        
        const data = await response.json();
        
        // Handle fade-in/fade-out transitions
        if (!data.isLive && livestream.isLive) {
          // Fade out before hiding
          setFadeOut(true);
          setTimeout(() => {
            setLivestream(data);
            setFadeOut(false);
          }, 500);
        } else if (data.isLive && !livestream.isLive) {
          // Fade in when showing
          setLivestream(data);
          setFadeOut(false);
        } else {
          setLivestream(data);
        }
        
        setError(null);
      } catch (error: any) {
        console.error('Error fetching livestream:', error);
        setError(error.message || 'Failed to fetch livestream data');
      }
    };

    fetchLivestream();
    const interval = setInterval(fetchLivestream, 10000);

    return () => clearInterval(interval);
  }, [livestream.isLive]);

  // Show error message if token is invalid
  if (error) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-transparent">
        <Card className="p-6 bg-red-900/80 backdrop-blur-md border-2 border-red-500/50 max-w-md">
          <h2 className="text-white font-bold text-lg mb-2">Overlay Error</h2>
          <p className="text-red-200 text-sm">{error}</p>
        </Card>
      </div>
    );
  }

  // Don't render anything if not live
  if (!livestream.isLive || !livestream.title) {
    return null;
  }

  return (
    <div className="w-screen h-screen flex items-end justify-start p-8 bg-transparent">
      <Card 
        className={`
          flex items-center gap-4 p-4 bg-black/80 backdrop-blur-md 
          border-2 border-red-500/50 shadow-2xl max-w-md
          transition-all duration-500 ease-in-out
          ${fadeOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
        `}
      >
        {/* Thumbnail */}
        {livestream.thumbnailUrl && (
          <div className="flex-shrink-0">
            <img
              src={livestream.thumbnailUrl}
              alt={livestream.title}
              className="w-20 h-20 rounded-md shadow-lg object-cover"
            />
          </div>
        )}

        {/* Stream Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-5 h-5 text-red-500 animate-pulse"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span className="text-xs text-red-500 font-semibold uppercase tracking-wide">
              Live Now
            </span>
            {livestream.viewerCount !== undefined && (
              <span className="text-xs text-gray-400">
                {livestream.viewerCount.toLocaleString()} watching
              </span>
            )}
          </div>

          <h3 className="text-white font-bold text-base truncate mb-1">
            {livestream.title}
          </h3>
          {livestream.channelName && (
            <p className="text-gray-300 text-sm truncate">
              {livestream.channelName}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
