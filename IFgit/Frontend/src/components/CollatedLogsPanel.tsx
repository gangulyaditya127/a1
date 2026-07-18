import { CollatedLog } from '@/types/forecaster';
import { cn } from '@/lib/utils';
import { Clock, Hash } from 'lucide-react';

interface CollatedLogsPanelProps {
  logs: CollatedLog[];
}

export const CollatedLogsPanel = ({ logs }: CollatedLogsPanelProps) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No collated logs available
      </div>
    );
  }

  const getCodeColor = (code?: string) => {
    if (!code) return 'bg-muted/30 text-muted-foreground';
    if (code.includes('TIMEOUT') || code.includes('UNAVAILABLE') || code.includes('502')) {
      return 'bg-alert/10 text-alert border-alert/30';
    }
    if (code.includes('EXPIRED') || code.includes('DECLINED')) {
      return 'bg-warning/10 text-warning border-warning/30';
    }
    return 'bg-muted/30 text-muted-foreground border-border/30';
  };

  return (
    <div className="space-y-3">
      {logs.map((log, index) => {
        return (
        <div
          key={`${log.first_seen}-${String(log.count).padStart(3, '0')}`}
          className={cn(
            "p-4 rounded-xl border transition-all",
            "bg-card/30 backdrop-blur-sm hover:bg-card/50",
            log.count > 5 ? "border-alert/30" : "border-border/50"
          )}
        >
          {/* Header with Code and Count */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                "px-2.5 py-1 rounded-md text-xs font-mono font-medium border",
                getCodeColor(log.fields.code)
              )}>
                {log.fields.code || 'UNKNOWN'}
              </span>
              {log.fields.service && (
                <span className="px-2 py-1 rounded-md text-xs font-mono bg-primary/10 text-primary border border-primary/30">
                  {log.fields.service}
                </span>
              )}
              {log.fields.provider && (
                <span className="px-2 py-1 rounded-md text-xs font-mono bg-muted/30 text-muted-foreground border border-border/30">
                  {log.fields.provider}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-foreground bg-muted/30 px-2.5 py-1 rounded-full shrink-0">
              <Hash className="w-3 h-3" />
              <span className="font-mono font-bold text-sm">{log.count}</span>
            </div>
          </div>

          {/* Message */}
          <p className="text-sm text-foreground/90 mb-3">
            {log.fields.msg || log.fields.message || 'No message'}
          </p>

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              First: {new Date(log.first_seen).toLocaleTimeString()}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last: {new Date(log.last_seen).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )})}
    </div>
  );
};
