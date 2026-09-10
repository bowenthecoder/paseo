import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { createFileObserver, type FileChange } from "../index.js";
import type { ObservationBackend, ObservationHost, ObserverMetrics } from "./contracts.js";
import { createNativeRecursiveBackend } from "./native-recursive.js";
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
// Only the inventory reads are intercepted. Tests that drive a real directory
// still need the rest of the module, and get the untouched reads back below.
vi.mock("node:fs/promises", async () => ({
  ...(await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")),
  readdir: filesystem.readdir,
  stat: filesystem.stat,
}));

const realFilesystem = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

let backend: ObservationBackend | undefined;
let active = true;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.clearAllMocks();
  filesystem.readdir.mockImplementation(realFilesystem.readdir);
  filesystem.stat.mockImplementation(realFilesystem.stat);
  active = true;
});

afterEach(async () => {
  active = false;
  await backend?.close();
  backend = undefined;
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

// Native watchers may coalesce file removals into change notifications. Keep the
// filesystem real while controlling which notifications reach reconciliation.
test("shallow parent scans retain nested change scopes", async () => {
  vi.useRealTimers();
  const root = await mkdtemp(join(tmpdir(), "native-scopes-"));
  const paths = createObserverPaths(process.platform);
  const removed = [
    join(root, "root.txt"),
    join(root, "child", "child.txt"),
    join(root, "child", "deep", "deep.txt"),
  ];
  await mkdir(join(root, "child", "deep"), { recursive: true });
  await Promise.all(removed.map((path) => writeFile(path, "before")));
  const events: FileChange[] = [];
  const notifications = new EventEmitter();
  let observing = true;
  const observer = createFileObserver();
  const nativeBackend = createNativeRecursiveBackend(
    {
      root,
      metrics: observer.getDiagnostics(),
      isActive: () => observing,
      isIgnored: () => false,
      isPathInside: paths.isInside,
      queueEvent: (type, path) => events.push({ type, path }),
      fail: (error) => {
        throw error;
      },
    },
    paths,
    (_root, listener) => {
      notifications.on("change", listener);
      return {
        close: () => {
          notifications.removeAllListeners();
        },
        on: (event, onError) => notifications.on(event, onError),
      };
    },
  );
  try {
    await nativeBackend.start();
    await Promise.all(removed.map((path) => rm(path)));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    for (const path of removed) notifications.emit("change", "change", path);
    await vi.advanceTimersByTimeAsync(8_000);
    vi.useRealTimers();
    await expect
      .poll(() =>
        events
          .filter((event) => event.type === "delete")
          .map((event) => event.path)
          .sort(),
      )
      .toEqual([...removed].sort());
  } finally {
    vi.useRealTimers();
    observing = false;
    await nativeBackend.close();
    await observer.close();
    await rm(root, { recursive: true, force: true });
  }
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
