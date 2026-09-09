// OOM backstop for a socket whose client stopped draining. A daemon normally has
// 1-10 physical sockets (tens at the outside), so 64 MiB bounds abandoned queues
// without treating ordinary large frames as a protocol or frame-size violation.
export const MAX_PHYSICAL_SOCKET_BUFFERED_BYTES = 64 * 1024 * 1024;
// A single frame larger than the whole buffer bound can never be sent, no matter
// how well the client drains. That is an oversized message, not a stalled socket,
// so callers get a separate signal instead of the high-water close.
export const MAX_PHYSICAL_FRAME_BYTES = MAX_PHYSICAL_SOCKET_BUFFERED_BYTES;
// Current clients ping every 10 seconds. Four delayed cycles fit inside the
// lease without making an abandoned application socket linger for minutes.
export const APPLICATION_SOCKET_LEASE_MS = 45_000;
export const APPLICATION_SOCKET_LEASE_CHECK_INTERVAL_MS = 10_000;

type Clock = () => number;

export class ApplicationSocketLease<TSocket extends object> {
  private readonly deadlines = new Map<TSocket, number>();

  constructor(private readonly clock: Clock = Date.now) {}

  claim(socket: TSocket): void {
    this.deadlines.set(socket, this.clock() + APPLICATION_SOCKET_LEASE_MS);
  }

  renew(socket: TSocket): void {
    if (this.deadlines.has(socket)) {
      this.claim(socket);
    }
  }

  release(socket: TSocket): void {
    this.deadlines.delete(socket);
  }

  listExpired(): TSocket[] {
    const now = this.clock();
    const expired: TSocket[] = [];
    for (const [socket, deadline] of this.deadlines) {
      if (deadline > now) continue;
      expired.push(socket);
    }
    return expired;
  }

  clear(): void {
    this.deadlines.clear();
  }
}

export function outboundFrameByteLength(data: string | Uint8Array | ArrayBuffer): number {
  if (typeof data === "string") return Buffer.byteLength(data);
  return data.byteLength;
}

interface BoundedPhysicalSocket {
  readyState: number;
  bufferedAmount?: number;
  send: (
    data: string | Uint8Array | ArrayBuffer,
    callback?: (error?: Error) => void,
  ) => void | Promise<void>;
}

export async function sendBoundedPhysicalFrameAndWait(params: {
  socket: BoundedPhysicalSocket;
  frame: string | Uint8Array | ArrayBuffer;
  frameBytes?: number;
  onHighWater: () => void;
  onOversized?: (frameBytes: number) => void;
}): Promise<boolean> {
  const { socket, frame, frameBytes = outboundFrameByteLength(frame), onHighWater } = params;
  if (socket.readyState !== 1) return false;
  if (!physicalSocketHasCapacity(socket, frameBytes)) {
    rejectBoundedFrame({ frameBytes, onHighWater, onOversized: params.onOversized });
    return false;
  }

  await new Promise<void>((resolve, reject) => {
    let callbackUsed = false;
    const result = socket.send(frame, (error) => {
      callbackUsed = true;
      if (error) reject(error);
      else resolve();
    });
    if (result && typeof result.then === "function") {
      result.then(resolve, reject);
    } else if (socket.send.length < 2 && !callbackUsed) {
      resolve();
    }
  });
  return true;
}

export function physicalSocketHasCapacity(
  socket: Pick<BoundedPhysicalSocket, "bufferedAmount">,
  frameBytes: number,
): boolean {
  if (typeof socket.bufferedAmount !== "number") return true;
  return socket.bufferedAmount + frameBytes <= MAX_PHYSICAL_SOCKET_BUFFERED_BYTES;
}

export function isOversizedPhysicalFrame(frameBytes: number): boolean {
  return frameBytes > MAX_PHYSICAL_FRAME_BYTES;
}

function rejectBoundedFrame(params: {
  frameBytes: number;
  onHighWater: () => void;
  onOversized?: (frameBytes: number) => void;
}): void {
  if (params.onOversized && isOversizedPhysicalFrame(params.frameBytes)) {
    params.onOversized(params.frameBytes);
    return;
  }
  params.onHighWater();
}

export function sendBoundedPhysicalFrame(params: {
  socket: BoundedPhysicalSocket;
  frame: string | Uint8Array | ArrayBuffer;
  frameBytes?: number;
  onHighWater: () => void;
  onOversized?: (frameBytes: number) => void;
}): boolean {
  const { socket, frame, frameBytes = outboundFrameByteLength(frame), onHighWater } = params;
  if (socket.readyState !== 1) return false;
  if (!physicalSocketHasCapacity(socket, frameBytes)) {
    rejectBoundedFrame({ frameBytes, onHighWater, onOversized: params.onOversized });
    return false;
  }
  const result = socket.send(frame);
  if (result && typeof result.then === "function") {
    void result.catch(() => undefined);
  }
  return true;
}
