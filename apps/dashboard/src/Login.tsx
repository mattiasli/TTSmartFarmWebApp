import { Button, MessageBar, MessageBarBody, MessageBarTitle, Text, Title1 } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { ensureSession } from './api';

export function Login() {
  const session = useQuery({ queryKey: ['session'], queryFn: ensureSession, retry: 0 });
  if (session.data?.authenticated) return <Navigate to="/dashboard" replace />;

  return (
    <main className="page">
      <section className="section">
        <Title1>TT SmartFarm</Title1>
        <Text as="p">Sign in with the GitHub account that was invited to this farm.</Text>
        {session.data?.githubLoginEnabled ? (
          <Button appearance="primary" as="a" href="/api/auth/github/start">
            Sign in with GitHub
          </Button>
        ) : (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>GitHub login is not configured</MessageBarTitle>
              Local simulator login is only available on loopback.
            </MessageBarBody>
          </MessageBar>
        )}
      </section>
    </main>
  );
}
