import { Button, Field, Input, Select, Text, Title3 } from '@fluentui/react-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { changeAccount, createAccount, fetchDiagnostics, fetchMembers, setMemberRole } from './api';
import { useFarmLiveContext } from './FarmLiveContext';

type Role = 'viewer' | 'operator' | 'admin';
type Member = Awaited<ReturnType<typeof fetchMembers>>['members'][number];
function RoleOptions() {
  return <><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></>;
}

function MemberRow({ member, refresh }: { member: Member; refresh: () => Promise<unknown> }) {
  const [role, setRole] = useState<Role>(member.role);
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const change = useMutation({
    mutationFn: ({ action, value }: { action: 'role' | 'remove' | 'password'; value?: string }) => changeAccount(member.userId, action, value),
    onSuccess: async () => { setPassword(''); setResetting(false); setRemoving(false); await refresh(); },
  });
  return <li style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
    <Text weight="semibold">{member.username} · {member.loginType === 'password' ? 'User ID and password' : 'GitHub'} · {member.role}</Text>
    <div className="control-row">
      <Select aria-label={`Role for ${member.username}`} value={role} onChange={(_, data) => setRole(data.value as Role)} disabled={change.isPending}><RoleOptions /></Select>
      <Button disabled={role === member.role || change.isPending} onClick={() => change.mutate({ action: 'role', value: role })}>Save role</Button>
      {member.loginType === 'password' ? <Button disabled={change.isPending} onClick={() => setResetting(!resetting)}>Reset password</Button> : null}
      <Button disabled={change.isPending} onClick={() => setRemoving(!removing)}>Remove access</Button>
    </div>
    {resetting ? <form className="control-row" onSubmit={(event) => { event.preventDefault(); change.mutate({ action: 'password', value: password }); }}>
      <Field label={`New password for ${member.username}`} hint="15–128 characters. Existing sessions will be signed out.">
        <Input type="password" autoComplete="new-password" value={password} required minLength={15} maxLength={128} onChange={(_, data) => setPassword(data.value)} />
      </Field>
      <Button type="submit" disabled={change.isPending || !password}>Save password</Button>
    </form> : null}
    {removing ? <div className="control-row"><Text>Remove {member.username}'s farm access and sign them out?</Text>
      <Button disabled={change.isPending} onClick={() => change.mutate({ action: 'remove' })}>Confirm removal</Button>
      <Button onClick={() => setRemoving(false)}>Cancel</Button></div> : null}
    {change.error ? <Text role="alert">{change.error.message}</Text> : null}
    {change.isSuccess ? <Text role="status">Account updated.</Text> : null}
  </li>;
}

export function Settings() {
  const live = useFarmLiveContext();
  const queryClient = useQueryClient();
  const diagnostics = useQuery({ queryKey: ['diagnostics'], queryFn: fetchDiagnostics });
  const members = useQuery({ queryKey: ['members'], queryFn: fetchMembers, enabled: live.session?.role === 'admin' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['members'] });
  const [githubId, setGithubId] = useState('');
  const [githubRole, setGithubRole] = useState<Role>('viewer');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const add = useMutation({ mutationFn: () => createAccount(userId, password, role),
    onSuccess: async () => { setUserId(''); setPassword(''); await refresh(); } });
  const inviteGithub = useMutation({ mutationFn: () => setMemberRole(githubId, githubRole),
    onSuccess: async () => { setGithubId(''); await refresh(); } });

  return <>
    <section className="section"><Title3>Session</Title3><Text as="p">{live.session?.username} · {live.session?.role ?? 'none'}</Text></section>
    {live.session?.role === 'admin' ? <section className="section">
      <Title3>Users and access</Title3>
      <Text as="p">Viewers can read the dashboard. Operators can use controls and automations. Admins can also manage users.</Text>
      {members.error ? <Text role="alert">{members.error.message}</Text> : null}
      <ul className="rule-list">{(members.data?.members ?? []).map((member) => <MemberRow key={`${member.userId}:${member.role}`} member={member} refresh={refresh} />)}</ul>
      <Title3>Add a user</Title3>
      <form style={{ display: 'grid', gap: 12, maxWidth: 420 }} onSubmit={(event) => { event.preventDefault(); if (!add.isPending) add.mutate(); }}>
        <Field label="User ID" hint="3–64 characters: letters, numbers, dot, underscore or hyphen. Case-insensitive.">
          <Input value={userId} autoComplete="off" required minLength={3} maxLength={64} onChange={(_, data) => setUserId(data.value)} />
        </Field>
        <Field label="Password" hint="15–128 characters. Give this password to the user privately.">
          <Input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={password} onChange={(_, data) => setPassword(data.value)} />
        </Field>
        <Field label="Role"><Select value={role} onChange={(_, data) => setRole(data.value as Role)}><RoleOptions /></Select></Field>
        <Button type="submit" appearance="primary" disabled={add.isPending}>Create user</Button>
        {add.error ? <Text role="alert">{add.error.message}</Text> : null}
        {add.isSuccess ? <Text role="status">User created. They can sign in with their user ID and password.</Text> : null}
      </form>
      <details style={{ marginTop: 20 }}><summary>Add a GitHub account</summary>
        <form className="control-row" onSubmit={(event) => { event.preventDefault(); if (!inviteGithub.isPending) inviteGithub.mutate(); }}>
          <Field label="GitHub numeric ID"><Input required value={githubId} onChange={(_, data) => setGithubId(data.value)} /></Field>
          <Field label="GitHub account role"><Select value={githubRole} onChange={(_, data) => setGithubRole(data.value as Role)}><RoleOptions /></Select></Field>
          <Button type="submit" disabled={inviteGithub.isPending}>Save GitHub member</Button>
        </form>
        {inviteGithub.error ? <Text role="alert">{inviteGithub.error.message}</Text> : null}
      </details>
    </section> : null}
    <section className="section"><Title3>Diagnostics</Title3><Text as="p">Dashboard release: {import.meta.env.VITE_RELEASE_SHA}</Text>
      <pre className="diagnostics">{JSON.stringify(diagnostics.data ?? live.snapshot?.connection ?? {}, null, 2)}</pre>
    </section>
  </>;
}
