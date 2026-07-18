import { cn } from "@/lib/utils";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

interface RefreshIndicatorProps {
  isLoading: boolean;
  lastUpdate: Date | null;
  nextUpdate: number;
  isConnected: boolean;
}

export const RefreshIndicator = ({ 
  isLoading, 
  lastUpdate, 
  nextUpdate,
  isConnected 
}: RefreshIndicatorProps) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        {isConnected ? (
          <Wifi className="w-4 h-4 text-success" />
        ) : (
          <WifiOff className="w-4 h-4 text-alert" />
        )}
        <span className={cn(
          "font-mono text-xs",
          isConnected ? "text-success" : "text-alert"
        )}>
          {isConnected ? "CONNECTED" : "DISCONNECTED"}
        </span>
      </div>

      <div className="w-px h-4 bg-border" />

      <div className="flex items-center gap-2">
        <RefreshCw className={cn(
          "w-4 h-4 text-muted-foreground",
          isLoading && "animate-spin text-primary"
        )} />
        <span className="text-muted-foreground font-mono text-xs">
          {isLoading ? "FETCHING..." : `Next: ${nextUpdate}s`}
        </span>
      </div>

      {lastUpdate && (
        <>
          <div className="w-px h-4 bg-border" />
          <span className="text-muted-foreground font-mono text-xs">
            Last: {formatTime(lastUpdate)}
          </span>
        </>
      )}
    </div>
  );
};
