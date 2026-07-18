import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ForecastResponse } from '@/types/forecaster';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

interface ApplicationCardProps {
  id: string;
  name: string;
  description: string;
  apiEndpoint: string;
  icon: string;
}

export const ApplicationCard = ({
  id,
  name,
  description,
  apiEndpoint,
  icon
}: ApplicationCardProps) => {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 2.5 * 60 * 1000);

    const formatTime = (date: Date) => date.toISOString().slice(0, 19);

    try {
      const params = new URLSearchParams({
        start: formatTime(startTime),
        end: formatTime(endTime)
      });

      const response = await fetch(`${apiEndpoint}?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiEndpoint]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 120000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData]);

  const isAlert = data?.status === 'alert';
  const riskLevel = data?.risk_level || 'Low';

  const getRiskColor = (risk: string) => {
    if (risk === 'Very High' || risk === 'High') return 'text-alert';
    if (risk === 'Medium') return 'text-warning';
    return 'text-success';
  };

  const getStatusBadge = () => {
    if (isAlert) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-alert/10 text-alert border border-alert/30">
          <AlertTriangle className="w-3 h-3" />
          Alert
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/30">
        <CheckCircle className="w-3 h-3" />
        Normal
      </span>
    );
  };

  /**
   * ✅ SonarQube-compliant extraction
   */
  const renderStatsGrid = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-16 rounded-lg bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      );
    }

    if (!data) {
      return (
        <div className="text-center text-muted-foreground text-sm py-4">
          Unable to fetch data
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Errors
          </p>
          <p
            className={cn(
              'text-xl font-bold font-mono mt-1',
              isAlert ? 'text-alert' : 'text-foreground'
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
              'text-xl font-bold font-mono mt-1',
              getRiskColor(riskLevel)
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
              'text-xl font-bold font-mono mt-1',
              data.forecast_triggered ? 'text-alert' : 'text-success'
            )}
          >
            {data.forecast_triggered ? 'ON' : 'OFF'}
          </p>
        </div>
      </div>
    );
  };

  return (
    <Link to={`/app/${id}`} className="block group">
      <div
        className={cn(
          'relative p-6 rounded-xl border transition-all duration-300',
          'bg-card/50 backdrop-blur-sm hover:bg-card/80',
          isAlert
            ? 'border-alert/40 shadow-[0_0_30px_-10px_hsl(var(--alert)/0.3)]'
            : 'border-border/50 hover:border-primary/30',
          'hover:shadow-xl hover:-translate-y-1'
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'text-3xl p-2 rounded-lg',
                isAlert ? 'bg-alert/10' : 'bg-primary/10'
              )}
            >
              {icon}
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {/* ✅ Stats Grid (Sonar-safe) */}
        {renderStatsGrid()}

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
            {data?.duration_seconds
              ? `${Math.round(data.duration_seconds)}s window`
              : 'Loading...'}
          </span>
          <span className="font-mono">
            Threshold: {data?.error_threshold || '15'}
          </span>
        </div>
      </div>
    </Link>
  );
};