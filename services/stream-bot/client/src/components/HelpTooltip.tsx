import { HelpCircle, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpTooltipProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function HelpTooltip({ content, side = "top", className = "" }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button 
          type="button"
          className={`inline-flex items-center justify-center rounded-full hover:bg-muted transition-colors p-0.5 ${className}`}
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface InfoBannerProps {
  title: string;
  description: string;
  variant?: "info" | "warning" | "success";
  className?: string;
  children?: React.ReactNode;
}

export function InfoBanner({ title, description, variant = "info", className = "", children }: InfoBannerProps) {
  const variants = {
    info: {
      style: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
      Icon: Info,
    },
    warning: {
      style: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300",
      Icon: AlertTriangle,
    },
    success: {
      style: "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300",
      Icon: CheckCircle2,
    },
  };

  const { style, Icon } = variants[variant];

  return (
    <div className={`rounded-lg border p-4 ${style} ${className}`}>
      <div className="flex gap-3">
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-sm mb-1">{title}</h4>
          <p className="text-xs opacity-90">{description}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

interface StepGuideProps {
  steps: Array<{
    number: number;
    title: string;
    description: string;
    completed?: boolean;
  }>;
  className?: string;
}

export function StepGuide({ steps, className = "" }: StepGuideProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {steps.map((step) => (
        <div key={step.number} className="flex gap-3">
          <div 
            className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
              step.completed 
                ? "bg-green-500 text-white" 
                : "bg-muted text-muted-foreground"
            }`}
          >
            {step.completed ? <CheckCircle2 className="h-4 w-4" /> : step.number}
          </div>
          <div className="flex-1">
            <p className={`text-sm font-medium ${step.completed ? "text-green-600 dark:text-green-400" : ""}`}>
              {step.title}
            </p>
            <p className="text-xs text-muted-foreground">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
