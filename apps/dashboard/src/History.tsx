import { Button, Select, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Title3 } from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { HISTORY_SERIES, type HistorySeries } from '@smartfarm/contracts';
import { fetchEvents, fetchHistory } from './api';

const RANGES = [
  { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { id: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

export function History() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('1h');
  const [path, setPath] = useState<HistorySeries>('t');
  const window = useMemo(() => {
    const to = new Date();
    const selected = RANGES.find((row) => row.id === range) ?? RANGES[0];
    return { from: new Date(to.getTime() - selected.ms).toISOString(), to: to.toISOString() };
  }, [range]);
  const history = useQuery({
    queryKey: ['history', path, range],
    queryFn: () => fetchHistory(path, window.from, window.to),
  });
  const events = useQuery({
    queryKey: ['events'],
    queryFn: () => fetchEvents(),
  });

  return (
    <>
      <section className="section">
        <Title3>History</Title3>
        <div className="control-row">
          <Select value={path} onChange={(_, data) => setPath(data.value as HistorySeries)} aria-label="Series">
            {HISTORY_SERIES.map((series) => (
              <option key={series} value={series}>
                {series}
              </option>
            ))}
          </Select>
          {RANGES.map((row) => (
            <Button key={row.id} appearance={range === row.id ? 'primary' : 'secondary'} onClick={() => setRange(row.id)}>
              {row.label}
            </Button>
          ))}
        </div>
        <Text size={200}>
          {window.from} → {window.to} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
        </Text>
        <div className="history-chart" role="img" aria-label={`${path} history chart`}>
          {(history.data?.points ?? []).map((point) => {
            const height = point.avg == null ? 0 : Math.max(4, Math.min(80, Math.abs(point.avg)));
            return <span key={point.bucket} className="history-bar" style={{ height }} title={`${point.bucket}: ${point.avg ?? '—'}`} />;
          })}
        </div>
        <Table aria-label="History series">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Time</TableHeaderCell>
              <TableHeaderCell>Min</TableHeaderCell>
              <TableHeaderCell>Avg</TableHeaderCell>
              <TableHeaderCell>Max</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(history.data?.points ?? []).map((point) => (
              <TableRow key={point.bucket}>
                <TableCell>{point.bucket}</TableCell>
                <TableCell>{point.min ?? '—'}</TableCell>
                <TableCell>{point.avg == null ? '—' : point.avg.toFixed(2)}</TableCell>
                <TableCell>{point.max ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!history.data?.points.length ? <Text>No samples in this range.</Text> : null}
      </section>
      <section className="section">
        <Title3>Activity</Title3>
        <ul className="rule-list">
          {(events.data?.events ?? []).map((event) => (
            <li key={event.id}>
              {event.createdAt} · {event.category}
            </li>
          ))}
        </ul>
        {events.data?.nextCursor ? (
          <Button
            onClick={() => {
              const cursor = events.data?.nextCursor;
              if (!cursor) return;
              void fetchEvents(JSON.stringify(cursor)).then((page) => {
                queryClient.setQueryData(['events'], {
                  events: [...(events.data?.events ?? []), ...page.events],
                  nextCursor: page.nextCursor,
                });
              });
            }}
          >
            Older events
          </Button>
        ) : null}
      </section>
    </>
  );
}
