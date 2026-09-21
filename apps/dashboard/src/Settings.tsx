import { Button, Input, Select, Text, Title3 } from '@fluentui/react-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchDiagnostics, fetchMembers, removeMember, setMemberRole } from './api';
import { useFarmLiveContext } from './FarmLiveContext';

export function Settings() {
  const live = useFarmLiveContext();
  const queryClient = useQueryClient();
  const diagnostics = useQuery({ queryKey: ['diagnostics'], queryFn: fetchDiagnostics });
  const members = useQuery({
    queryKey: ['members'],
    queryFn: fetchMembers,
    enabled: live.session?.role === 'admin',
  });
  const [githubId, setGithubId] = useState('');
  const [role, setRole] = useState<'viewer' | 'operator' | 'admin'>('viewer');
  const add = useMutation({
    mutationFn: () => setMemberRole(githubId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeMember(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
  });

  return (
    <>
      <section className="section">
        <Title3>Session</Title3>
        <Text as="p">
          {live.session?.username} · {live.session?.role ?? 'none'} · farm {live.session?.farmId}
        </Text>
        <Text as="p" size={200}>
          Live transport: {live.transport}. MQTT credentials never leave the server.
        </Text>
      </section>
      <section className="section">
        <Title3>Diagnostics</Title3>
        <Text as="p">Dashboard release: {import.meta.env.VITE_RELEASE_SHA}</Text>
        <pre className="diagnostics">{JSON.stringify(diagnostics.data ?? live.snapshot?.connection ?? {}, null, 2)}</pre>
      </section>
      {live.session?.role === 'admin' ? (
        <section className="section">
          <Title3>Members</Title3>
          <ul className="rule-list">
            {(members.data?.members ?? []).map((member) => (
              <li key={member.githubId}>
                {member.username} · {member.role}
                <Button size="small" onClick={() => remove.mutate(member.githubId)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className="control-row">
            <Input value={githubId} onChange={(_, data) => setGithubId(data.value)} placeholder="GitHub id" />
            <Select value={role} onChange={(_, data) => setRole(data.value as typeof role)} aria-label="Role">
              <option value="viewer">viewer</option>
              <option value="operator">operator</option>
              <option value="admin">admin</option>
            </Select>
            <Button appearance="primary" disabled={!githubId || add.isPending} onClick={() => add.mutate()}>
              Save member
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
