import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";

interface StreamAlert {
  id?: string;
  alertType: string;
  enabled: boolean;
  soundUrl?: string | null;
  imageUrl?: string | null;
  duration: number;
  animation: string;
  textTemplate: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  ttsEnabled: boolean;
  ttsVoice: string;
  minAmount: number;
  volume: number;
}

interface AlertPreviewProps {
  alert: StreamAlert;
  sampleData?: {
    user?: string;
    amount?: number;
    message?: string;
    tier?: string;
    months?: number;
    platform?: string;
  };
}

const animationStyles: Record<string, string> = {
  fade: "animate-fade-in",
  slide: "animate-slide-in",
  bounce: "animate-bounce-in",
  zoom: "animate-zoom-in",
  flip: "animate-flip-in",
  shake: "animate-shake",
};

const animationExitStyles: Record<string, string> = {
  fade: "animate-fade-out",
  slide: "animate-slide-out",
  bounce: "animate-bounce-out",
  zoom: "animate-zoom-out",
  flip: "animate-flip-out",
  shake: "animate-fade-out",
};

function formatAlertMessage(template: string, data: AlertPreviewProps["sampleData"] = {}): string {
  const defaults = {
    user: data?.user || "TestUser",
    amount: data?.amount?.toString() || "5",
    message: data?.message || "Test message!",
    tier: data?.tier || "Tier 1",
    months: data?.months?.toString() || "3",
    platform: data?.platform || "twitch",
  };

  return template
    .replace(/{user}/g, defaults.user)
    .replace(/{amount}/g, defaults.amount)
    .replace(/{message}/g, defaults.message)
    .replace(/{tier}/g, defaults.tier)
    .replace(/{months}/g, defaults.months)
    .replace(/{platform}/g, defaults.platform);
}

export function AlertPreview({ alert, sampleData }: AlertPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const playPreview = () => {
    if (isPlaying) {
      stopPreview();
      return;
    }

    setIsPlaying(true);
    setIsExiting(false);

    if (alert.soundUrl) {
      try {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        audioRef.current = new Audio(alert.soundUrl);
        audioRef.current.volume = (alert.volume || 50) / 100;
        audioRef.current.play().catch(console.error);
      } catch (e) {
        console.error("Failed to play alert sound:", e);
      }
    }

    if (alert.ttsEnabled) {
      const message = formatAlertMessage(alert.textTemplate, sampleData);
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = alert.ttsVoice || "en-US";
      window.speechSynthesis.speak(utterance);
    }

    timeoutRef.current = setTimeout(() => {
      setIsExiting(true);
      exitTimeoutRef.current = setTimeout(() => {
        setIsPlaying(false);
        setIsExiting(false);
      }, 500);
    }, (alert.duration || 5) * 1000);
  };

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
    }
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsExiting(false);
  };

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  const animationClass = isExiting
    ? animationExitStyles[alert.animation] || "animate-fade-out"
    : animationStyles[alert.animation] || "animate-fade-in";

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes slideIn {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bounceOut {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); }
          100% { transform: scale(0); opacity: 0; }
        }
        @keyframes zoomIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes zoomOut {
          from { transform: scale(1); opacity: 1; }
          to { transform: scale(0); opacity: 0; }
        }
        @keyframes flipIn {
          from { transform: perspective(400px) rotateY(90deg); opacity: 0; }
          to { transform: perspective(400px) rotateY(0deg); opacity: 1; }
        }
        @keyframes flipOut {
          from { transform: perspective(400px) rotateY(0deg); opacity: 1; }
          to { transform: perspective(400px) rotateY(90deg); opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
          20%, 40%, 60%, 80% { transform: translateX(10px); }
        }
        .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .animate-fade-out { animation: fadeOut 0.5s ease-out forwards; }
        .animate-slide-in { animation: slideIn 0.5s ease-out forwards; }
        .animate-slide-out { animation: slideOut 0.5s ease-out forwards; }
        .animate-bounce-in { animation: bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards; }
        .animate-bounce-out { animation: bounceOut 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards; }
        .animate-zoom-in { animation: zoomIn 0.4s ease-out forwards; }
        .animate-zoom-out { animation: zoomOut 0.4s ease-out forwards; }
        .animate-flip-in { animation: flipIn 0.6s ease-out forwards; }
        .animate-flip-out { animation: flipOut 0.6s ease-out forwards; }
        .animate-shake { animation: shake 0.5s ease-in-out, fadeIn 0.3s ease-out; }
      `}</style>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Preview</span>
        <Button
          variant="outline"
          size="sm"
          onClick={playPreview}
          className="flex items-center gap-2"
        >
          {isPlaying ? (
            <>
              <Pause className="h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Play Preview
            </>
          )}
        </Button>
      </div>

      <div 
        className="relative min-h-[200px] rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden"
        style={{
          background: "repeating-conic-gradient(#1a1a2e 0% 25%, #16162a 0% 50%) 50% / 20px 20px",
        }}
      >
        {isPlaying ? (
          <div
            className={`flex flex-col items-center gap-4 p-6 rounded-lg ${animationClass}`}
            style={{
              backgroundColor: alert.backgroundColor === "transparent" ? "transparent" : alert.backgroundColor,
            }}
          >
            {alert.imageUrl && (
              <img
                src={alert.imageUrl}
                alt="Alert"
                className="w-24 h-24 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <div
              className="text-center font-bold drop-shadow-lg"
              style={{
                fontSize: `${Math.min(alert.fontSize, 48)}px`,
                color: alert.fontColor,
                textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
              }}
            >
              {formatAlertMessage(alert.textTemplate, sampleData)}
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <p className="text-sm">Click "Play Preview" to see your alert</p>
            <p className="text-xs mt-1">Background simulates OBS transparency</p>
          </div>
        )}
      </div>
    </div>
  );
}
