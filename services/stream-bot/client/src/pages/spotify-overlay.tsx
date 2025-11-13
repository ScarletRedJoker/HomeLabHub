import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface NowPlayingData {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  album?: string;
  albumImageUrl?: string;
  songUrl?: string;
  progressMs?: number;
  durationMs?: number;
  progressPercent?: number;
}

export default function SpotifyOverlay() {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData>({ isPlaying: false });
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

    // Poll for now playing every 5 seconds
    const fetchNowPlaying = async () => {
      try {
        const response = await fetch(`/api/overlay/spotify/data?token=${token}`);
        
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
          throw new Error(errorData.error || 'Failed to fetch now playing');
        }
        
        const data = await response.json();
        
        // Handle fade-in/fade-out transitions
        if (!data.isPlaying && nowPlaying.isPlaying) {
          // Fade out before hiding
          setFadeOut(true);
          setTimeout(() => {
            setNowPlaying(data);
            setFadeOut(false);
          }, 500);
        } else if (data.isPlaying && !nowPlaying.isPlaying) {
          // Fade in when showing
          setNowPlaying(data);
          setFadeOut(false);
        } else {
          setNowPlaying(data);
        }
        
        setError(null);
      } catch (error: any) {
        console.error('Error fetching now playing:', error);
        setError(error.message || 'Failed to fetch now playing data');
      }
    };

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000);

    return () => clearInterval(interval);
  }, [nowPlaying.isPlaying]);

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

  // Don't render anything if nothing is playing
  if (!nowPlaying.isPlaying || !nowPlaying.title) {
    return null;
  }

  return (
    <div className="w-screen h-screen flex items-end justify-start p-8 bg-transparent">
      <Card 
        className={`
          flex items-center gap-4 p-4 bg-black/80 backdrop-blur-md 
          border-2 border-green-500/50 shadow-2xl max-w-md
          transition-all duration-500 ease-in-out
          ${fadeOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
        `}
      >
        {/* Album Art */}
        {nowPlaying.albumImageUrl && (
          <div className="flex-shrink-0">
            <img
              src={nowPlaying.albumImageUrl}
              alt={nowPlaying.album}
              className="w-20 h-20 rounded-md shadow-lg"
            />
          </div>
        )}

        {/* Song Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-5 h-5 text-green-500 animate-pulse"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            <span className="text-xs text-green-500 font-semibold uppercase tracking-wide">
              Now Playing
            </span>
          </div>

          <h3 className="text-white font-bold text-lg truncate mb-1">
            {nowPlaying.title}
          </h3>
          <p className="text-gray-300 text-sm truncate">
            {nowPlaying.artist}
          </p>

          {/* Progress Bar */}
          {nowPlaying.progressPercent !== undefined && (
            <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-1000 ease-linear"
                style={{ width: `${nowPlaying.progressPercent}%` }}
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
