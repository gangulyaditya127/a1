import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  variant?: 'default' | 'alert' | 'success' | 'warning';
  subtext?: string;
}

export const StatCard = ({ label, value, icon: Icon, variant = 'default', subtext }: StatCardProps) => {
  return (
    <div className={cn(
      "relative p-5 rounded-xl border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:bg-card/80",
      variant === 'alert' && "border-alert/30 hover:border-alert/50",
      variant === 'success' && "border-success/30 hover:border-success/50",
      variant === 'warning' && "border-warning/30 hover:border-warning/50",
      variant === 'default' && "border-border hover:border-muted-foreground/30"
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </p>
          <p className={cn(
            "text-3xl font-bold font-mono mt-1",
            variant === 'alert' && "text-alert",
            variant === 'success' && "text-success",
            variant === 'warning' && "text-warning",
            variant === 'default' && "text-foreground"
          )}>
            {value}
          </p>
          {subtext && (
            <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
          )}
        </div>
        <div className={cn(
          "p-2 rounded-lg",
          variant === 'alert' && "bg-alert/10 text-alert",
          variant === 'success' && "bg-success/10 text-success",
          variant === 'warning' && "bg-warning/10 text-warning",
          variant === 'default' && "bg-muted text-muted-foreground"
        )}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
