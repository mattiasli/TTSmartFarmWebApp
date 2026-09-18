import { Badge, Button, MessageBar, MessageBarBody, MessageBarTitle, Text } from '@fluentui/react-components';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router';
import { logout } from './api';
import { FarmLiveProvider, useFarmLiveContext } from './FarmLiveContext';
import { HostControls } from './HostControls';

export function Layout() {
  return (
    <FarmLiveProvider>
      <LayoutBody />
    </FarmLiveProvider>
  );
}

function LayoutBody() {
  const live = useFarmLiveContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const snapshot = live.snapshot;
  const visibleError = error ?? live.snapshotError;

  if (live.session && !live.session.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="page">
      <header className="host-bar">
        <div>
          <Text weight="semibold">TT SmartFarm</Text>
          {snapshot ? (
            <div className="status-row">
              <Badge appearance="filled" color={snapshot.connection.status === 'live' ? 'success' : snapshot.connection.status === 'stale' ? 'warning' : 'danger'}>
                {snapshot.connection.status}
              </Badge>
              {snapshot.simulation ? <Badge appearance="outline">Simulation</Badge> : null}
              <Text size={200}>
                {live.transport === 'websocket' ? 'live socket' : 'HTTP poll'} · age{' '}
                {snapshot.connection.telemetryAgeMs == null ? 'n/a' : `${snapshot.connection.telemetryAgeMs} ms`}
              </Text>
            </div>
          ) : null}
        </div>
        <nav className="host-nav" aria-label="Farm">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/automations">Automations</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <HostControls snapshot={snapshot} onError={setError} />
        {live.session?.username ? (
          <div className="status-row">
            <Text size={200}>{live.session.username}</Text>
            <Button
              size="small"
              onClick={() => {
                void logout().then(() => {
                  queryClient.clear();
                  navigate('/login');
                });
              }}
            >
              Sign out
            </Button>
          </div>
        ) : null}
      </header>
      {visibleError ? (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>
            <MessageBarTitle>Action failed</MessageBarTitle>
            {visibleError}
          </MessageBarBody>
        </MessageBar>
      ) : null}
      <Outlet />
    </div>
  );
}
