import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ObservationBackend, ObservationHost, ObserverMetrics } from "./contracts.js";
import { createNativeRecursiveBackend } from "./native-recursive.js";
import { createManagedObservation, type ManagedObservation } from "./observation.js";
import { createObserverPaths } from "./paths.js";

const filesystem = vi.hoisted(() => ({
  watch: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("node:fs", async () => ({
  ...(await vi.importActual<typeof import("node:fs")>("node:fs")),
  watch: filesystem.watch,
}));
vi.mock("node:fs/promises", () => ({
  readdir: filesystem.readdir,
  stat: filesystem.stat,
}));

let backend: ObservationBackend | undefined;
let observation: ManagedObservation | undefined;
let active = true;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.clearAllMocks();
  active = true;
});

afterEach(async () => {
  active = false;
  await backend?.close();
  backend = undefined;
  await observation?.close();
  observation = undefined;
  vi.useRealTimers();
});

describe.each([
  { name: "shallow parent", parentNotification: "root.txt", auditDelay: 8_000 },
  { name: "forced local parent", parentNotification: null, auditDelay: 500 },
  { name: "recursive child", parentNotification: "nested", auditDelay: 500 },
])("native recursive reconciliation scopes: $name", ({ parentNotification, auditDelay }) => {
  it.each(["create", "delete"] as const)(
    "discovers a child %s once without waiting for a full audit",
    async (changeType) => {
      const root = resolve("virtual-observer-root");
      const nested = join(root, "nested");
      const filePath = join(nested, "changed.txt");
      const signalPath = join(nested, "signal.txt");
      let childExists = changeType === "delete";
      let emitNative!: (eventType: "change" | "rename", filename: string | null) => void;
      const close = vi.fn();
      filesystem.watch.mockImplementation((_root, _options, callback) => {
        emitNative = callback;
        return { on: vi.fn(), close };
      });
      filesystem.readdir.mockImplementation(async (directory: string) => {
        if (directory === root) {
          return [directoryEntry("nested", true), directoryEntry("root.txt", false)];
        }
        if (directory === nested) {
          return [
            directoryEntry("signal.txt", false),
            ...(childExists ? [directoryEntry("changed.txt", false)] : []),
          ];
        }
        throw new Error(`Unexpected inventory read: ${directory}`);
      });
      const queueEvent = vi.fn();
      const fail = vi.fn();
      const paths = createObserverPaths(process.platform);
      const host: ObservationHost = {
        root,
        metrics: createMetrics(),
        isActive: () => active,
        isIgnored: () => false,
        isPathInside: paths.isInside,
        queueEvent,
        fail,
      };
      backend = createNativeRecursiveBackend(host, paths);
      await backend.start();
      expect(queueEvent).not.toHaveBeenCalled();
      expect(host.metrics.fullReconciliationCount).toBe(1);

      childExists = changeType === "create";
      emitNative("change", parentNotification);
      // Native notifications may name only a sibling during a burst. The named
      // directory must still be reconciled to recover the other changed paths.
      emitNative("change", join("nested", "signal.txt"));
      expect(queueEvent).toHaveBeenCalledWith("update", signalPath);
      queueEvent.mockClear();
      filesystem.readdir.mockClear();
      await vi.advanceTimersByTimeAsync(auditDelay);

      expect(queueEvent).toHaveBeenCalledWith(changeType, filePath);
      expect(filesystem.readdir).toHaveBeenCalledWith(nested, { withFileTypes: true });
      expect(
        filesystem.readdir.mock.calls.filter(([directory]) => directory === nested),
      ).toHaveLength(1);
      expect(host.metrics.fullReconciliationCount).toBe(1);
      expect(fail).not.toHaveBeenCalled();
    },
  );
});

it("remembers a rescanned child in its parent inventory for a later directory deletion", async () => {
  const root = resolve("virtual-observer-root");
  const nested = join(root, "nested");
  const filePath = join(nested, "removed.txt");
  let directoryExists = true;
  let emitNative!: (eventType: "change" | "rename", filename: string | null) => void;
  filesystem.watch.mockImplementation((_root, _options, callback) => {
    emitNative = callback;
    return { on: vi.fn(), close: vi.fn() };
  });
  filesystem.readdir.mockImplementation(async (directory: string) => {
    if (directory === root) {
      return directoryExists ? [directoryEntry("nested", true)] : [];
    }
    if (directory === nested && directoryExists) {
      return [directoryEntry("removed.txt", false)];
    }
    throw Object.assign(new Error(`Missing directory: ${directory}`), { code: "ENOENT" });
  });
  filesystem.stat.mockRejectedValue(Object.assign(new Error("Missing path"), { code: "ENOENT" }));
  const queueEvent = vi.fn();
  const fail = vi.fn();
  const paths = createObserverPaths(process.platform);
  const host: ObservationHost = {
    root,
    metrics: createMetrics(),
    isActive: () => active,
    isIgnored: () => false,
    isPathInside: paths.isInside,
    queueEvent,
    fail,
  };
  backend = createNativeRecursiveBackend(host, paths);
  await backend.start();

  // The local parent scan happens before the recursive child scan in this batch.
  emitNative("change", null);
  emitNative("change", "nested");
  await vi.advanceTimersByTimeAsync(500);
  expect(backend.getDiagnostics().nativeTrackedFileCount).toBe(1);
  queueEvent.mockClear();

  directoryExists = false;
  emitNative("rename", "nested");
  await vi.advanceTimersByTimeAsync(500);

  expect(queueEvent).toHaveBeenCalledWith("delete", filePath);
  expect(backend.getDiagnostics().nativeTrackedFileCount).toBe(0);
  expect(host.metrics.fullReconciliationCount).toBe(1);
  expect(fail).not.toHaveBeenCalled();
});

it("delivers a deletion when a repeated native create shares its delivery batch", async () => {
  const root = resolve("virtual-observer-root");
  const target = join(root, "changed.txt");
  let fileExists = false;
  let emitNative!: (eventType: "change" | "rename", filename: string | null) => void;
  filesystem.watch.mockImplementation((_root, _options, callback) => {
    emitNative = callback;
    return { on: vi.fn(), close: vi.fn() };
  });
  filesystem.readdir.mockImplementation(async () =>
    fileExists ? [directoryEntry("changed.txt", false)] : [],
  );
  filesystem.stat.mockImplementation(async (path: string) => {
    if (path === root) return { isDirectory: () => true };
    if (fileExists) return { isDirectory: () => false };
    throw Object.assign(new Error("Missing file"), { code: "ENOENT" });
  });
  const callback = vi.fn();
  const paths = createObserverPaths("win32");
  observation = createManagedObservation({
    root,
    callback,
    options: {},
    paths,
    metrics: createMetrics(),
    createBackend: (host) => createNativeRecursiveBackend(host, paths),
    onClosed: vi.fn(),
  });
  await observation.start();

  fileExists = true;
  emitNative("rename", "changed.txt");
  await vi.advanceTimersByTimeAsync(10);
  expect(callback).toHaveBeenLastCalledWith(null, [{ path: target, type: "create" }]);
  callback.mockClear();

  // Native notifications and reconciliation can both report the same creation.
  // The later removal must survive the shared ten-millisecond delivery buffer.
  emitNative("rename", "changed.txt");
  await vi.advanceTimersByTimeAsync(0);
  fileExists = false;
  emitNative("rename", "changed.txt");
  await vi.advanceTimersByTimeAsync(10);

  expect(callback).toHaveBeenLastCalledWith(null, [{ path: target, type: "delete" }]);

  fileExists = true;
  emitNative("rename", "changed.txt");
  await vi.advanceTimersByTimeAsync(10);
  callback.mockClear();

  // A removal followed by a replacement still describes an existing file.
  fileExists = false;
  emitNative("rename", "changed.txt");
  await vi.advanceTimersByTimeAsync(0);
  fileExists = true;
  emitNative("rename", "changed.txt");
  await vi.advanceTimersByTimeAsync(10);
  expect(callback).toHaveBeenLastCalledWith(null, [{ path: target, type: "update" }]);
});

function directoryEntry(name: string, directory: boolean) {
  return { name, isDirectory: () => directory };
}

function createMetrics(): ObserverMetrics {
  return {
    reconciliationCount: 0,
    scopedReconciliationCount: 0,
    fullReconciliationCount: 0,
    reconciliationFailureCount: 0,
    observerFailureCount: 0,
    directoryLimitFailureCount: 0,
    nativeEventCount: 0,
    nativeChangeEventCount: 0,
    nativeRenameEventCount: 0,
    nativePathlessEventCount: 0,
    nativeClassificationCount: 0,
    nativeShallowScanCount: 0,
    lastReconciliationDurationMs: 0,
    maxReconciliationDurationMs: 0,
  };
}
