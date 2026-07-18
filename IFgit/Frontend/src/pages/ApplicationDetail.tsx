import { useParams, Link } from 'react-router-dom';
import { StatusIndicator } from '@/components/StatusIndicator';
import { StatCard } from '@/components/StatCard';
import { AlertPanel } from '@/components/AlertPanel';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { CollatedLogsPanel } from '@/components/CollatedLogsPanel';
import { DetailedLogsPanel } from '@/components/DetailedLogsPanel';
import { useForecaster } from '@/hooks/useForecaster';
import { usePaymentThreshold } from '@/contexts/PaymentThresholdContext';
import { registeredApplications } from '@/data/applications';
import {
  AlertCircle, Target, Activity, RefreshCw, ArrowLeft,
  Layers, FileText, Clock, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const ApplicationDetail = () => {
  const { appId } = useParams<{ appId: string }>();
  const app = registeredApplications.find(a => a.id === appId);
  const { thresholdNextUpdate, isUpdatingThreshold, updateThreshold } = usePaymentThreshold();

  const isPaymentService = appId === 'payment-service';

  const {
    currentResponse,
    history,
    isLoading,
    error,
    lastUpdate,
    nextUpdate,
    isConnected,
    manualRefresh
  } = useForecaster(app?.apiEndpoint || '');

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!app) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Application Not Found</h1>
          <Link to="/" className="text-primary hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  // Determine status: offline if not connected, otherwise use API response
  const status: 'normal' | 'alert' | 'offline' = isConnected ? (currentResponse?.status || 'normal') :  'offline';
  const isAlert = status === 'alert';
  const isOffline = status === 'offline';


  /**
   * ✅ FIX: Sonar‑safe risk variant derivation
   */
  let riskVariant: 'alert' | 'warning' | 'success' = 'success';

  if (
    currentResponse?.risk_level === 'Very High' ||
    currentResponse?.risk_level === 'High'
  ) {
    riskVariant = 'alert';
  } else if (currentResponse?.risk_level === 'Medium') {
    riskVariant = 'warning';
  }


  return (
    <div className="min-h-screen bg-background grid-pattern">
      <div className="min-h-screen backdrop-blur-sm">
        {/* Header */}
        <header className="border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link to="/">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Button>
                </Link>
                <div className="flex items-center gap-3">
                  <div className="text-3xl p-2 rounded-lg bg-primary/10">
                    {app.icon}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight">{app.name}</h1>
                    <p className="text-xs text-muted-foreground">{app.description}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {isPaymentService && isConnected && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={updateThreshold}
                    disabled={isUpdatingThreshold}
                    className="font-mono text-xs gap-2"
                    title="Update threshold manually"
                  >
                    <Settings className={cn("w-4 h-4", isUpdatingThreshold && "animate-spin text-primary")} />
                    {isUpdatingThreshold ? 'Updating...' : formatTime(thresholdNextUpdate)}
                  </Button>
                )}
                <RefreshIndicator
                  isLoading={isLoading}
                  lastUpdate={lastUpdate}
                  nextUpdate={nextUpdate}
                  isConnected={isConnected}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={manualRefresh}
                  disabled={isLoading}
                  className="font-mono text-xs"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  REFRESH
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-6 py-8">
          {error && (
            <div className="mb-6 p-4 rounded-xl border border-alert/30 bg-alert/10 text-alert animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <span className="font-mono text-sm">{error}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Status & Stats */}
            <div className="lg:col-span-2 space-y-6">
              {/* Status Indicator */}
              <StatusIndicator status={status} isLoading={isLoading} />

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Error Count"
                  value={currentResponse?.error_count ?? '-'}
                  icon={AlertCircle}
                  variant={isAlert ? 'alert' : 'default'}
                />
                <StatCard
                  label="Dynamic Threshold"
                  value={currentResponse?.error_threshold ?? '-'}
                  icon={Target}
                  variant="warning"
                />
                <StatCard
                  label="Risk Level"
                  value={currentResponse?.risk_level ?? '-'}
                  icon={Activity}
                  variant={riskVariant}
                />
                <StatCard
                  label="Duration"
                  value={currentResponse?.duration_seconds ? `${Math.round(currentResponse.duration_seconds)}s` : '-'}
                  icon={Clock}
                  variant="default"
                />
              </div>

              {/* Alert Panel - Only shown when alert */}
              {isAlert && currentResponse?.llm_response && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-alert/30" />
                    <span className="text-xs font-mono text-alert uppercase tracking-wider px-2 animate-blink">
                      ● OUTAGE FORECASTED
                    </span>
                    <div className="h-px flex-1 bg-alert/30" />
                  </div>
                  <AlertPanel
                    llmResponse={currentResponse.llm_response}
                    riskLevel={currentResponse.risk_level}
                  />
                </div>
              )}

              {/* Normal state message */}
              {!isAlert && !isOffline && currentResponse && (
                <div className="p-6 rounded-xl border border-success/20 bg-success/5 text-center">
                  <p className="text-success font-mono text-sm">
                    {currentResponse.message || 'All systems operational. No anomalies detected.'}
                  </p>
                </div>
              )}

              {/* Offline state message */}
              {isOffline && (
                <div className="p-6 rounded-xl border border-muted-foreground/20 bg-muted/10 text-center">
                  <p className="text-muted-foreground font-mono text-sm">
                    Unable to connect to backend service. Data may be stale or unavailable.
                  </p>
                </div>
              )}

              {/* Logs Section */}
              {currentResponse && (
                <Tabs defaultValue="collated" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="collated" className="flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      Collated Logs ({currentResponse.collated_logs?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="detailed" className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Raw Logs ({currentResponse.logs?.length || 0})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="collated">
                    <div className="rounded-xl border border-border/50 bg-card/20 p-4">
                      <CollatedLogsPanel logs={currentResponse.collated_logs || []} />
                    </div>
                  </TabsContent>
                  <TabsContent value="detailed">
                    <div className="rounded-xl border border-border/50 bg-card/20 p-4">
                      <DetailedLogsPanel logs={currentResponse.logs || []} />
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </div>

            {/* Right Column - History */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Check History
                </h2>
                <span className="text-xs font-mono text-muted-foreground">
                  {history.length} checks
                </span>
              </div>
              <div className="rounded-xl border border-border bg-card/30 backdrop-blur-sm p-4">
                <HistoryTimeline history={history} />
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 mt-auto">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
              <span>Issue Forecaster Agent v1.0</span>
              <span>Auto-refresh: 2 min interval</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ApplicationDetail;

