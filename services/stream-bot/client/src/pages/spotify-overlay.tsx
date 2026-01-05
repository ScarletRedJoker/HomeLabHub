import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const [showOBSInfo, setShowOBSInfo] = useState(false);
  const [copied, setCopied] = useState(false);

  const getOBSUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return '';
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    return `${baseUrl}/api/overlay/spotify/obs?token=${token}`;
  };

  const copyOBSUrl = async () => {
    const url = getOBSUrl();
    if (url) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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

  // Don't render anything if nothing is playing (unless showing OBS info)
  if (!nowPlaying.isPlaying && !nowPlaying.title && !showOBSInfo) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Button
          onClick={() => setShowOBSInfo(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg"
        >
          OBS Setup
        </Button>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex items-end justify-start p-8 bg-transparent relative">
      <Button
        onClick={() => setShowOBSInfo(!showOBSInfo)}
        className="fixed top-4 right-4 z-50 bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg"
      >
        {showOBSInfo ? 'Close' : 'OBS Setup'}
      </Button>

      {showOBSInfo && (
        <Card className="fixed top-16 right-4 z-40 p-6 bg-gray-900/95 backdrop-blur-md border-2 border-purple-500/50 max-w-md shadow-2xl">
          <h2 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Add to OBS
          </h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-purple-300 font-semibold text-sm mb-2">OBS-Optimized URL:</h3>
              <div className="bg-gray-800 rounded-lg p-3 break-all">
                <code className="text-green-400 text-xs">{getOBSUrl()}</code>
              </div>
              <Button
                onClick={copyOBSUrl}
                className={`mt-2 w-full ${copied ? 'bg-green-600' : 'bg-purple-600 hover:bg-purple-700'} text-white`}
              >
                {copied ? 'Copied!' : 'Copy OBS URL'}
              </Button>
            </div>

            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-purple-300 font-semibold text-sm mb-2">Steps to add to OBS:</h3>
              <ol className="text-gray-300 text-sm space-y-2 list-decimal list-inside">
                <li>In OBS, click <span className="text-white font-medium">+</span> in Sources</li>
                <li>Select <span className="text-white font-medium">Browser</span></li>
                <li>Name it "Spotify Now Playing"</li>
                <li>Paste the URL copied above</li>
                <li>Set Width: <span className="text-white font-medium">500</span>, Height: <span className="text-white font-medium">200</span></li>
                <li>Click <span className="text-white font-medium">OK</span></li>
              </ol>
            </div>

            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3 mt-3">
              <p className="text-blue-200 text-xs">
                <strong>Tip:</strong> The OBS URL uses a standalone page with inline CSS and absolute URLs for maximum compatibility with OBS browser sources.
              </p>
            </div>
          </div>
        </Card>
      )}

      {nowPlaying.isPlaying && nowPlaying.title && (
        <Card 
          className={`
            flex items-center gap-4 p-4 bg-black/80 backdrop-blur-md 
            border-2 border-green-500/50 shadow-2xl max-w-md
            transition-all duration-500 ease-in-out
            ${fadeOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
          `}
        >
          {nowPlaying.albumImageUrl && (
            <div className="flex-shrink-0">
              <img
                src={nowPlaying.albumImageUrl}
                alt={nowPlaying.album}
                className="w-20 h-20 rounded-md shadow-lg"
              />
            </div>
          )}

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
      )}
    </div>
  );
}
