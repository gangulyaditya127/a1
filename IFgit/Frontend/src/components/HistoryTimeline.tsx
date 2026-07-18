import { ForecastHistory } from "@/types/forecaster";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Circle } from "lucide-react";

interface HistoryTimelineProps {
  history: ForecastHistory[];
}

export const HistoryTimeline = ({ history }: HistoryTimelineProps) => {
  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="font-mono text-sm">No history yet...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
      {history.slice().reverse().map((item, index) => {
        const isAlert = item.response.status === 'alert';
        return (
          <div
            key={item.timestamp.getTime()}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-all duration-200",
              isAlert 
                ? "border-alert/30 bg-alert/5 hover:bg-alert/10" 
                : "border-border bg-card/30 hover:bg-card/50"
            )}
          >
            <div className="mt-1">
              <Circle 
                className={cn(
                  "w-3 h-3",
                  isAlert ? "fill-alert text-alert" : "fill-success text-success"
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  "text-xs font-mono font-semibold uppercase",
                  isAlert ? "text-alert" : "text-success"
                )}>
                  {isAlert ? "Alert" : "Normal"}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {format(item.timestamp, "HH:mm:ss")}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-mono">
                <span>Errors: {item.response.error_count}</span>
                <span>•</span>
                <span>Risk: {item.response.risk_level || '-'}</span>
              </div>
              {item.response.llm_response && (
                <p className="text-xs text-foreground/70 mt-2 line-clamp-2">
                  {item.response.llm_response.issue_summary}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
