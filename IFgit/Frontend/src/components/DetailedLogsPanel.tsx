import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DetailedLogsPanelProps {
  logs: string[];
}

export const DetailedLogsPanel = ({ logs }: DetailedLogsPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No detailed logs available
      </div>
    );
  }

  const displayLogs = isExpanded ? logs : logs.slice(0, 5);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Raw Error Logs ({logs.length} entries)
          </span>
        </div>
        {logs.length > 5 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                Show All ({logs.length})
              </>
            )}
          </Button>
        )}
      </div>

      {/* Logs */}
      <div className={cn(
        "rounded-xl border border-border/50 bg-background/50 overflow-hidden",
        isExpanded && "max-h-[500px] overflow-y-auto"
      )}>
        {displayLogs.map((log, index) => (
          <div
            key={`${log}`}
            className={cn(
              "group flex items-start gap-3 px-4 py-3 font-mono text-xs",
              "hover:bg-muted/20 transition-colors",
              index !== displayLogs.length - 1 && "border-b border-border/30"
            )}
          >
            <span className="text-muted-foreground shrink-0 w-6 text-right">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="text-foreground/80 break-all flex-1 leading-relaxed">
              {highlightLog(log)}
            </span>
            <button
              onClick={() => copyToClipboard(log, index)}
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Copy log"
            >
              {copiedIndex === index ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              )}
            </button>
          </div>
        ))}
      </div>

      {!isExpanded && logs.length > 5 && (
        <p className="text-xs text-center text-muted-foreground">
          Showing first 5 of {logs.length} logs
        </p>
      )}
    </div>
  );
};

// Helper function to highlight parts of the log
const highlightLog = (log: string) => {
  const parts = log.split(/(\bERROR\b|\bWARN\b|\bINFO\b)/gi);
  
  return parts.map((part, i) => {
    const upper = part.toUpperCase();
    if (upper === 'ERROR') {
      return <span key={part} className="text-alert font-semibold">{part}</span>;
    }
    if (upper === 'WARN') {
      return <span key={part} className="text-warning font-semibold">{part}</span>;
    }
    if (upper === 'INFO') {
      return <span key={part} className="text-primary font-semibold">{part}</span>;
    }
    return part;
  });
};
