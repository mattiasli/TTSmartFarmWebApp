import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AccessDenied } from './AccessDenied';
import { AutomationsPage } from './AutomationsPage';
import { Dashboard } from './Dashboard';
import { History } from './History';
import { Layout } from './Layout';
import { Login } from './Login';
import { NotFound } from './NotFound';
import { Settings } from './Settings';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
});

export function App() {
  const [hostMessage, setHostMessage] = useState('Waiting for the federated editor.');

  useEffect(() => {
    const onRemoteNotify = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string') setHostMessage(detail);
    };
    window.addEventListener('smartfarm-federation-notify', onRemoteNotify);
    return () => window.removeEventListener('smartfarm-federation-notify', onRemoteNotify);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route element={<Layout />}>
            <Route
              index
              element={
                <>
                  <Dashboard />
                  <AutomationsPage hostMessage={hostMessage} />
                </>
              }
            />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="automations" element={<AutomationsPage hostMessage={hostMessage} />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
