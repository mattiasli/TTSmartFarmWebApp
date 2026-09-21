import { Badge, Button, MessageBar, MessageBarBody, MessageBarTitle, Text } from '@fluentui/react-components';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router';
import { logout } from './api';
import { FarmLiveProvider, useFarmLiveContext } from './FarmLiveContext';
import { HostControls } from './HostControls';

function formatTelemetryAge(ageMs: number | null) {
  if (ageMs === null || !Number.isFinite(ageMs)) return 'n/a';
  const milliseconds = Math.max(0, Math.round(ageMs));
  if (milliseconds < 1000) return `${milliseconds} ms`;
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days > 99 ? '99+ d' : `${days} d`;
}

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
              <Text size={200} className="telemetry-status">
                {live.transport === 'websocket' ? 'live socket' : 'HTTP poll'} · age{' '}
                <span className="telemetry-age">{formatTelemetryAge(snapshot.connection.telemetryAgeMs)}</span>
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
