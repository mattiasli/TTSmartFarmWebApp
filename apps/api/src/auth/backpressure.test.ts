import { describe, expect, it } from 'vitest';
import {
  MAX_SOCKET_BUFFERED,
  exceedsBackpressure,
  exceedsSessionSocketLimit,
  exceedsTotalSocketLimit,
} from './backpressure';

describe('realtime backpressure', () => {
  it('T091 closes a socket once the outbound buffer exceeds 1 MiB', () => {
    expect(exceedsBackpressure(MAX_SOCKET_BUFFERED)).toBe(false);
    expect(exceedsBackpressure(MAX_SOCKET_BUFFERED + 1)).toBe(true);
  });

  it('caps sockets per session and overall', () => {
    expect(exceedsSessionSocketLimit(2)).toBe(false);
    expect(exceedsSessionSocketLimit(3)).toBe(true);
    expect(exceedsTotalSocketLimit(99)).toBe(false);
    expect(exceedsTotalSocketLimit(100)).toBe(true);
  });
});
