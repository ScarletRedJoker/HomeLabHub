import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Twitch, Youtube } from 'lucide-react';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

export default function OAuthLogin() {
  const [location] = useLocation();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const successParam = params.get('success');

    if (errorParam) {
      const errorMessages: Record<string, string> = {
        'twitch_auth_failed': 'Twitch authentication failed. Please try again.',
        'youtube_auth_failed': 'YouTube authentication failed. Please try again.',
        'kick_auth_failed': 'Kick authentication failed. Please try again.',
      };
      setError(errorMessages[errorParam] || 'Authentication failed. Please try again.');
    }

    if (successParam) {
      const successMessages: Record<string, string> = {
        'twitch_signin': 'Successfully signed in with Twitch!',
        'youtube_signin': 'Successfully signed in with YouTube!',
        'kick_signin': 'Successfully signed in with Kick!',
      };
      setSuccess(successMessages[successParam] || 'Successfully signed in!');
    }
  }, [location]);

  const handleTwitchLogin = () => {
    window.location.href = '/api/auth/twitch';
  };

  const handleYouTubeLogin = () => {
    window.location.href = '/api/auth/youtube';
  };

  return (
    <div className="min-h-screen flex items-center justify-center candy-animated-bg p-4">
      <div className="candy-glass-card w-full max-w-md p-8 candy-fade-in">
        <div className="space-y-1 text-center mb-6">
          <h1 className="text-3xl font-bold candy-gradient-text">Welcome to StreamBot</h1>
          <p className="text-base text-white/80">
            Sign in with your streaming platform to get started
          </p>
        </div>
        
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive" className="candy-bounce">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 text-green-900 border-green-200 candy-bounce">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <button
              onClick={handleTwitchLogin}
              className="w-full h-12 text-base text-white font-semibold rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #9146FF 0%, #772CE8 100%)',
                boxShadow: '0 4px 15px rgba(145, 70, 255, 0.3)'
              }}
            >
              <div className="flex items-center justify-center gap-2">
                <Twitch className="h-5 w-5" />
                Sign in with Twitch
              </div>
            </button>

            <button
              onClick={handleYouTubeLogin}
              className="w-full h-12 text-base text-white font-semibold rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #FF0000 0%, #CC0000 100%)',
                boxShadow: '0 4px 15px rgba(255, 0, 0, 0.3)'
              }}
            >
              <div className="flex items-center justify-center gap-2">
                <Youtube className="h-5 w-5" />
                Sign in with YouTube
              </div>
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-white/70">
            <p>
              By signing in, you agree to let StreamBot manage your chat bot
              and access your streaming data.
            </p>
          </div>

          <div className="mt-4 text-center text-xs text-white/60">
            <p>
              <strong>New to StreamBot?</strong> Just click a button above!
              We'll automatically create your account when you sign in for the first time.
            </p>
            <p className="mt-2">
              <strong>Kick users:</strong> Sign in with Twitch or YouTube first, then connect your Kick channel from your dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
