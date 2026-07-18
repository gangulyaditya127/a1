import { Link } from "react-router-dom";
import { useApplicationStatus } from "@/hooks/useApplicationStatus";
import { usePaymentThreshold } from "@/contexts/PaymentThresholdContext";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  WifiOff,
  RefreshCw,
  Settings,
} from "lucide-react";

const APP_CONFIG = {
  id: "payment-service",
  name: "Payment Service",
  description: "Payment gateway and transaction processing service",
  apiEndpoint: `${import.meta.env.VITE_API_PYTHON_BASE_URL}/forecast/issue-forecaster-payment`,
  icon: "💳",
};

const STATUS_UI_CONFIG = {
  offline: {
    badge: {
      text: "Offline",
      icon: WifiOff,
      className:
        "bg-muted/30 text-muted-foreground border-muted-foreground/30",
    },
    border: "border-muted-foreground/30 opacity-75",
    iconBg: "bg-muted/30",
  },
  alert: {
    badge: {
      text: "Alert",
      icon: AlertTriangle,
      className: "bg-alert/10 text-alert border-alert/30",
    },
    border:
      "border-alert/40 shadow-[0_0_30px_-10px_hsl(var(--alert)/0.3)]",
    iconBg: "bg-alert/10",
  },
  normal: {
    badge: {
      text: "Normal",
      icon: CheckCircle,
      className: "bg-success/10 text-success border-success/30",
    },
    border: "border-border/50 hover:border-primary/30",
    iconBg: "bg-primary/10",
  },
} as const;

const RISK_COLOR_MAP: Record<string, string> = {
  "Very High": "text-alert",
  High: "text-alert",
  Medium: "text-warning",
  Low: "text-success",
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const getWindowText = (
  duration?: number,
  isOffline?: boolean
) => {
  if (duration) {
    return `${Math.round(duration)}s window`;
  }
  return isOffline ? "Disconnected" : "Loading...";
};

const getNextUpdateText = (isLoading: boolean, nextUpdate: number) =>
  isLoading ? "Fetching..." : `${nextUpdate}s`;

export const PaymentServiceCard = () => {
  const { data, isLoading, connectionStatus, nextUpdate } =
    useApplicationStatus(APP_CONFIG.apiEndpoint);

  const {
    thresholdNextUpdate,
    isUpdatingThreshold,
    updateThreshold,
  } = usePaymentThreshold();

  const handleManualThresholdUpdate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateThreshold();
  };

  /**
   * ✅ Derived state (minimal)
   */
  const isAlert = data?.status === "alert";
  const isOffline = connectionStatus === "disconnected";
  const riskLevel = data?.risk_level || "Low";

  let statusKey: "offline" | "alert" | "normal" = "normal";
  if (isOffline) {
    statusKey = "offline";
  } else if (isAlert) {
    statusKey = "alert";
  }


  const statusUI = STATUS_UI_CONFIG[statusKey];

  /**
   * ✅ Display helpers
   */
  const riskColor = RISK_COLOR_MAP[riskLevel] ?? "text-success";
  const showSkeleton = isLoading && connectionStatus === "loading";
  const showOfflineState = isOffline && !showSkeleton;
  const showDataState = Boolean(data && !isOffline);

  const windowText = getWindowText(
    data?.duration_seconds,
    isOffline
  );

  const thresholdText = isUpdatingThreshold
    ? "Updating..."
    : formatTime(thresholdNextUpdate);

  const nextUpdateText = getNextUpdateText(isLoading, nextUpdate);

  return (
    <Link to={`/app/${APP_CONFIG.id}`} className="block group">
      <div
        className={cn(
          "relative p-6 rounded-xl border transition-all duration-300",
          "bg-card/50 backdrop-blur-sm hover:bg-card/80",
          statusUI.border,
          "hover:shadow-xl hover:-translate-y-1"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "text-3xl p-2 rounded-lg",
                statusUI.iconBg
              )}
            >
              {APP_CONFIG.icon}
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {APP_CONFIG.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {APP_CONFIG.description}
              </p>
            </div>
          </div>

          {/* Status badge */}
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
              statusUI.badge.className
            )}
          >
            <statusUI.badge.icon className="w-3 h-3" />
            {statusUI.badge.text}
          </span>
        </div>

        {/* Stats Grid */}
        {showSkeleton && (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-lg bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        )}

        {showOfflineState && (
          <div className="text-center text-muted-foreground text-sm py-4">
            Service unavailable
          </div>
        )}

        {showDataState && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Errors
              </p>
              <p
                className={cn(
                  "text-xl font-bold font-mono mt-1",
                  isAlert ? "text-alert" : "text-foreground"
                )}
              >
                {data.error_count}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Risk
              </p>
              <p
                className={cn(
                  "text-xl font-bold font-mono mt-1",
                  riskColor
                )}
              >
                {riskLevel}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Forecast
              </p>
              <p
                className={cn(
                  "text-xl font-bold font-mono mt-1",
                  data.forecast_triggered
                    ? "text-alert"
                    : "text-success"
                )}
              >
                {data.forecast_triggered ? "ON" : "OFF"}
              </p>
            </div>
          </div>
        )}

        {/* LLM Summary Preview */}
        {isAlert && data?.llm_response?.issue_summary && (
          <div className="mt-4 p-3 rounded-lg bg-alert/5 border border-alert/20">
            <p className="text-xs text-alert font-medium mb-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Issue Detected
            </p>
            <p className="text-sm text-foreground/90 line-clamp-2">
              {data.llm_response.issue_summary}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {windowText}
          </span>

          {!isOffline && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleManualThresholdUpdate}
                className="flex items-center gap-1 font-mono hover:text-primary transition-colors"
                title="Update threshold manually"
              >
                <Settings
                  className={cn(
                    "w-3 h-3",
                    isUpdatingThreshold && "animate-spin text-primary"
                  )}
                />
                {thresholdText}
              </button>

              <span className="flex items-center gap-1.5 font-mono">
                <RefreshCw
                  className={cn(
                    "w-3 h-3",
                    isLoading && "animate-spin text-primary"
                  )}
                />
                {nextUpdateText}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export const paymentServiceConfig = APP_CONFIG;
