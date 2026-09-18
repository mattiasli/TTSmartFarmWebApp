export const MAX_SOCKET_BUFFERED = 1_048_576;
export const MAX_SOCKETS_PER_SESSION = 3;
export const MAX_SOCKETS_TOTAL = 100;

export function exceedsBackpressure(bufferedAmount: number) {
  return bufferedAmount > MAX_SOCKET_BUFFERED;
}

export function exceedsSessionSocketLimit(count: number) {
  return count >= MAX_SOCKETS_PER_SESSION;
}

export function exceedsTotalSocketLimit(count: number) {
  return count >= MAX_SOCKETS_TOTAL;
}
