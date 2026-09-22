import { Button, Field, Input, Text, Title1 } from '@fluentui/react-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router';
import { ensureSession, passwordLogin } from './api';

export function Login() {
  const session = useQuery({ queryKey: ['session'], queryFn: ensureSession, retry: 0 });
  const client = useQueryClient();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({ mutationFn: () => passwordLogin(userId, password),
    onSuccess: (data) => { setPassword(''); client.setQueryData(['session'], data); } });
  if (session.data?.authenticated) return <Navigate to="/dashboard" replace />;

  return (
    <main className="page">
      <section className="section">
        <Title1>TT SmartFarm</Title1>
        <Text as="p">Sign in with an account added by your farm administrator.</Text>
        {session.data?.passwordLoginEnabled ? (
          <form style={{ display: 'grid', gap: 12, maxWidth: 360 }} onSubmit={(event) => {
            event.preventDefault(); if (!login.isPending) login.mutate();
          }}>
            <Field label="User ID"><Input autoComplete="username" name="username" required
              value={userId} onChange={(_, data) => setUserId(data.value)} /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" name="password" required
              value={password} onChange={(_, data) => setPassword(data.value)} /></Field>
            <Button appearance="primary" type="submit" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
            {login.error ? <Text role="alert">{login.error.message}</Text> : null}
          </form>
        ) : null}
        {session.data?.githubLoginEnabled ? (
          <Button appearance="primary" as="a" href="/api/auth/github/start">
            Sign in with GitHub
          </Button>
        ) : null}
        {session.isError ? <Text role="alert">Unable to load sign-in. Please refresh to try again.</Text> : null}
      </section>
    </main>
  );
}
