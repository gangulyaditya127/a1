import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { GlobalRefreshProvider } from "@/contexts/GlobalRefreshContext";
import { PaymentThresholdProvider } from "@/contexts/PaymentThresholdContext";
import Home from "./pages/Home";
import ApplicationDetail from "./pages/ApplicationDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <GlobalRefreshProvider>
      <PaymentThresholdProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/app/:appId" element={<ApplicationDetail />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
        </TooltipProvider>
      </PaymentThresholdProvider>
    </GlobalRefreshProvider>
  </QueryClientProvider>
);

export default App;
