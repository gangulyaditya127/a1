import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";

interface StatusIndicatorProps {
  status: "normal" | "alert" | "offline";
  isLoading?: boolean;
}

const STATUS_CONFIG = {
  normal: {
    container: "border-success/50 bg-success/10 glow-success",
    scanLine: "bg-success/30",
    icon: ShieldCheck,
    iconClass: "text-success",
    label: "NORMAL",
    text: "text-success text-glow-success",
    pulse: false,
  },
  alert: {
    container:
      "border-alert/50 bg-alert/10 glow-alert animate-pulse-glow",
    scanLine: "bg-alert/30",
    icon: ShieldAlert,
    iconClass: "text-alert animate-pulse",
    label: "ALERT",
    text: "text-alert text-glow-alert",
    pulse: true,
  },
  offline: {
    container: "border-muted-foreground/50 bg-muted/10",
    scanLine: "bg-muted-foreground/30",
    icon: ShieldOff,
    iconClass: "text-muted-foreground",
    label: "OFFLINE",
    text: "text-muted-foreground",
    pulse: false,
  },
} as const;

export const StatusIndicator = ({
  status,
  isLoading = false,
}: StatusIndicatorProps) => {
  const {
    container,
    scanLine,
    icon: IconComponent,
    iconClass,
    label,
    text,
    pulse,
  } = STATUS_CONFIG[status];

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all duration-500",
        container
      )}
    >
      {/* Scan line effect */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
        <div
          className={cn("absolute inset-x-0 h-px animate-scan", scanLine)}
        />
      </div>

      <div className={cn("relative", isLoading && "opacity-50")}>
        <IconComponent
          className={cn("w-20 h-20", iconClass)}
          strokeWidth={1.5}
        />
      </div>

      <div className="mt-4 text-center">
        <h2
          className={cn(
            "text-3xl font-bold font-mono tracking-wider uppercase",
            text
          )}
        >
          {label}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          System Status
        </p>
      </div>

      {pulse && (
        <div className="absolute inset-0 rounded-2xl border-2 border-alert/20 animate-ping" />
      )}
    </div>
  );
};
