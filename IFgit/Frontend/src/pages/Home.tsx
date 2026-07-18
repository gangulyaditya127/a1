import { Radar, Zap, Activity, Shield, TrendingUp } from 'lucide-react';
import { PaymentServiceCard, AuthServiceCard, SearchServiceCard } from '@/components/applications';
import { useActiveServicesCount } from '@/hooks/useActiveServicesCount';

const Home = () => {
  const { activeCount, totalCount, isChecking } = useActiveServicesCount();

  return (
    <div className="min-h-screen bg-background grid-pattern">
      <div className="min-h-screen backdrop-blur-sm">
        {/* Header */}
        <header className="border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-50">
          <div className="container mx-auto px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Zap className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Issue Forecaster</h1>
                  <p className="text-sm text-muted-foreground">
                    AI-powered smart forecasting for predictive issue detection
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 bg-card/50">
                <span className="text-sm text-muted-foreground">Agent Status</span>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-success" />
                  <span className="text-success font-medium text-sm">Active</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-6 py-8">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="p-5 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Active Applications
              </p>
              <p className="text-3xl font-bold text-foreground">
                {isChecking ? '...' : `${activeCount}/${totalCount}`}
              </p>
            </div>
            <div className="p-5 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Monitoring Status
              </p>
              <p className={`text-3xl font-bold ${activeCount > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                {activeCount > 0 ? 'Online' : 'Offline'}
              </p>
            </div>
            <div className="p-5 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Detection Mode
              </p>
              <p className="text-3xl font-bold text-primary">Predictive</p>
            </div>
            <div className="p-5 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                AI Engine
              </p>
              <p className="text-3xl font-bold text-primary">GPT-4o</p>
            </div>
          </div>

          {/* Section Title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Radar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Registered Applications</h2>
              <p className="text-sm text-muted-foreground">
                Click on an application to view detailed forecasts and logs
              </p>
            </div>
          </div>

          {/* Applications Grid - Each service has its own component */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <PaymentServiceCard />
            <AuthServiceCard />
            <SearchServiceCard />
          </div>

          {/* Features Section */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border border-border/50 bg-card/20">
              <div className="p-3 rounded-lg bg-primary/10 text-primary w-fit mb-4">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Real-time Monitoring</h3>
              <p className="text-sm text-muted-foreground">
                Continuously monitors error logs and detects anomalies in real-time with 2-minute polling intervals.
              </p>
            </div>
            <div className="p-6 rounded-xl border border-border/50 bg-card/20">
              <div className="p-3 rounded-lg bg-alert/10 text-alert w-fit mb-4">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Predictive Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Uses AI to analyze error patterns and predict potential outages before they impact users.
              </p>
            </div>
            <div className="p-6 rounded-xl border border-border/50 bg-card/20">
              <div className="p-3 rounded-lg bg-success/10 text-success w-fit mb-4">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Actionable Insights</h3>
              <p className="text-sm text-muted-foreground">
                Provides recommended actions and reasoning to help SRE teams respond quickly to incidents.
              </p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 mt-auto">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
              <span>Issue Forecaster Agent v1.0</span>
              <span>Powered by GPT-4o</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Home;
