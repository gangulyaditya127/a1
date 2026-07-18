import { LLMResponse } from "@/types/forecaster";
import { AlertTriangle, Zap, MessageSquare, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertPanelProps {
  llmResponse: LLMResponse;
  riskLevel?: string | null;
}

export const AlertPanel = ({ llmResponse, riskLevel }: AlertPanelProps) => {
  const getRiskColor = (risk?: string | null) => {
    if (!risk) return 'alert';
    const riskLower = risk.toLowerCase();
    if (riskLower.includes('very high') || riskLower.includes('high') || riskLower.includes('critical')) return 'alert';
    if (riskLower.includes('medium')) return 'warning';
    return 'success';
  };

  const displayRisk = riskLevel || 'Unknown';
  const riskColor = getRiskColor(riskLevel);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary */}
      <div className="p-5 rounded-xl border border-alert/30 bg-alert/5 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-alert/10 text-alert shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-alert text-sm uppercase tracking-wider">Issue Summary</h3>
            <p className="text-foreground mt-2 leading-relaxed">
              {llmResponse.issue_summary}
            </p>
          </div>
        </div>
      </div>

      {/* Risk Level */}
      <div className={cn(
        "p-4 rounded-xl border backdrop-blur-sm",
        riskColor === 'alert' && "border-alert/30 bg-alert/5",
        riskColor === 'warning' && "border-warning/30 bg-warning/5",
        riskColor === 'success' && "border-success/30 bg-success/5"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            riskColor === 'alert' && "bg-alert/10 text-alert",
            riskColor === 'warning' && "bg-warning/10 text-warning",
            riskColor === 'success' && "bg-success/10 text-success"
          )}>
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Risk Level</p>
            <p className={cn(
              "font-bold font-mono text-lg",
              riskColor === 'alert' && "text-alert",
              riskColor === 'warning' && "text-warning",
              riskColor === 'success' && "text-success"
            )}>
              {displayRisk}
            </p>
          </div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="p-5 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">Reasoning</h3>
            <p className="text-foreground mt-2 leading-relaxed text-sm">
              {llmResponse.reasoning}
            </p>
          </div>
        </div>
      </div>

      {/* Recommended Actions */}
      {llmResponse.recommended_actions && llmResponse.recommended_actions.length > 0 && (
        <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <ListChecks className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-primary text-sm uppercase tracking-wider">Recommended Actions</h3>
              <ul className="mt-3 space-y-2">
                {llmResponse.recommended_actions.map((action, index) => (
                  <li key={action} className="flex items-start gap-2 text-sm">
                    <span className="text-primary font-mono text-xs mt-0.5">{String(index + 1).padStart(2, '0')}</span>
                    <span className="text-foreground">{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
