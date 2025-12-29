import { useEffect, useState, useRef, useCallback } from "react";

interface StreamAlert {
  id: string;
  alertType: string;
  enabled: boolean;
  soundUrl?: string;
  imageUrl?: string;
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

interface AlertData {
  alertId: string;
  userId: string;
  platform: string;
  triggeredBy: string;
  alertType: string;
  amount?: number;
  message?: string;
  tier?: string;
  months?: number;
}

interface QueuedAlert {
  id: string;
  alert: StreamAlert;
  data: AlertData;
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

function formatAlertMessage(template: string, data: AlertData): string {
  return template
    .replace(/{user}/g, data.triggeredBy)
    .replace(/{amount}/g, data.amount?.toString() || "0")
    .replace(/{message}/g, data.message || "")
    .replace(/{tier}/g, data.tier || "")
    .replace(/{months}/g, data.months?.toString() || "1")
    .replace(/{platform}/g, data.platform);
}

export default function StreamAlertsOverlay() {
  const [alertQueue, setAlertQueue] = useState<QueuedAlert[]>([]);
  const [currentAlert, setCurrentAlert] = useState<QueuedAlert | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const processNextAlert = useCallback(() => {
    if (currentAlert || alertQueue.length === 0) return;

    const [next, ...rest] = alertQueue;
    setAlertQueue(rest);
    setCurrentAlert(next);
    setIsExiting(false);

    if (next.alert.soundUrl) {
      try {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        audioRef.current = new Audio(next.alert.soundUrl);
        audioRef.current.volume = (next.alert.volume || 50) / 100;
        audioRef.current.play().catch(console.error);
      } catch (e) {
        console.error("Failed to play alert sound:", e);
      }
    }

    if (next.alert.ttsEnabled) {
      const message = formatAlertMessage(next.alert.textTemplate, next.data);
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = next.alert.ttsVoice || "en-US";
      window.speechSynthesis.speak(utterance);
    }

    timeoutRef.current = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        setCurrentAlert(null);
        setIsExiting(false);
      }, 500);
    }, (next.alert.duration || 5) * 1000);
  }, [currentAlert, alertQueue]);

  useEffect(() => {
    processNextAlert();
  }, [processNextAlert]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setError("Missing overlay token. Please generate a new overlay URL from your settings.");
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await fetch(`/api/overlay/verify-token?token=${token}`);
        if (!response.ok) {
          throw new Error("Invalid or expired token");
        }
        const data = await response.json();
        if (!data.valid) {
          throw new Error(data.error || "Token validation failed");
        }
        return data.userId;
      } catch (e: any) {
        setError(e.message || "Token verification failed");
        return null;
      }
    };

    const connectWebSocket = async () => {
      const userId = await verifyToken();
      if (!userId) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[StreamAlertsOverlay] WebSocket connected");
          setIsConnected(true);
          setError(null);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "stream_alert") {
              const queuedAlert: QueuedAlert = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                alert: message.alert,
                data: message.data,
              };
              setAlertQueue((prev) => [...prev, queuedAlert]);
            }
          } catch (e) {
            console.error("[StreamAlertsOverlay] Failed to parse message:", e);
          }
        };

        ws.onclose = () => {
          console.log("[StreamAlertsOverlay] WebSocket disconnected");
          setIsConnected(false);
          setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (e) => {
          console.error("[StreamAlertsOverlay] WebSocket error:", e);
        };
      } catch (e) {
        console.error("[StreamAlertsOverlay] Failed to connect:", e);
        setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (error) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-transparent">
        <div className="p-6 bg-red-900/80 backdrop-blur-md border-2 border-red-500/50 rounded-lg max-w-md">
          <h2 className="text-white font-bold text-lg mb-2">Overlay Error</h2>
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!currentAlert) {
    return null;
  }

  const { alert, data } = currentAlert;
  const animationClass = isExiting
    ? animationExitStyles[alert.animation] || "animate-fade-out"
    : animationStyles[alert.animation] || "animate-fade-in";

  return (
    <>
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
      
      <div className="w-screen h-screen flex items-center justify-center bg-transparent">
        <div
          className={`flex flex-col items-center gap-4 p-8 rounded-lg ${animationClass}`}
          style={{
            backgroundColor: alert.backgroundColor === "transparent" ? "transparent" : alert.backgroundColor,
          }}
        >
          {alert.imageUrl && (
            <img
              src={alert.imageUrl}
              alt="Alert"
              className="w-48 h-48 object-contain"
            />
          )}
          <div
            className="text-center font-bold drop-shadow-lg"
            style={{
              fontSize: `${alert.fontSize}px`,
              color: alert.fontColor,
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
            }}
          >
            {formatAlertMessage(alert.textTemplate, data)}
          </div>
        </div>
      </div>
    </>
  );
}
