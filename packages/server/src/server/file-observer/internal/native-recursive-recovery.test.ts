import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { FileChange } from "../index.js";
import type { ObservationHost, ObserverMetrics } from "./contracts.js";
import { createNativeRecursiveBackend, type WatchNativeRecursiveRoot } from "./native-recursive.js";
import { createObserverPaths } from "./paths.js";

test("a pathless native event recovers deletions across all sibling directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "paseo-native-recovery-"));
  const directories = Array.from({ length: 20 }, (_, index) => join(root, `dir-${index}`));
  const populated = join(root, "populated");
  const ignored = join(root, "ignored");
  const files = Array.from({ length: 1_000 }, (_, index) =>
    join(directories[index % directories.length], `file-${index}.txt`),
  );
  const populatedFiles = Array.from({ length: 200 }, (_, index) =>
    join(populated, `nested-${index}.txt`),
  );
  const ignoredFile = join(ignored, "ignored.txt");
  let active = true;
  let closed = false;
  let notifyNative: Parameters<WatchNativeRecursiveRoot>[1] = () => {
    throw new Error("The native watcher has not started");
  };
  const events: FileChange[] = [];
  const failures: Error[] = [];
  const paths = createObserverPaths("win32");
  const host: ObservationHost = {
    root,
    metrics: createMetrics(),
    isActive: () => active,
    isIgnored: (path) => paths.isInside(ignored, path),
    isPathInside: paths.isInside,
    queueEvent: (type, path) => events.push({ type, path }),
    fail: (error) => failures.push(error),
  };
  const watchRoot: WatchNativeRecursiveRoot = (requestedRoot, listener) => {
    expect(requestedRoot).toBe(root);
    notifyNative = listener;
    return {
      close: () => {
        closed = true;
      },
      on: () => undefined,
    };
  };
  const backend = createNativeRecursiveBackend(host, paths, watchRoot);
  try {
    await Promise.all([...directories, populated, ignored].map((directory) => mkdir(directory)));
    await Promise.all(
      [...files, ...populatedFiles, ignoredFile].map((file) => writeFile(file, "observed")),
    );
    await backend.start();
    expect(backend.getDiagnostics().nativeTrackedFileCount).toBe(1_200);

    const removed = files.slice(0, 100);
    await Promise.all([...removed, ignoredFile].map((file) => rm(file)));
    // Replay the three notifications seen on Windows after the hundred deletes.
    // Filesystem inventory and the debounce clock remain real.
    notifyNative("change", join("dir-1", "file-101.txt"));
    notifyNative("rename", join("dir-1", "file-1.txt"));
    notifyNative("rename", null);
    await expect
      .poll(
        () => new Set(events.filter((event) => event.type === "delete").map((event) => event.path)),
        { timeout: 10_000 },
      )
      .toEqual(new Set(removed));
    await expect
      .poll(() => backend.getDiagnostics(), { timeout: 10_000 })
      .toMatchObject({
        nativeTrackedFileCount: 1_100,
        pendingReconciliationWorkCount: 0,
        reconciliationInFlight: false,
      });
    expect(events.some((event) => paths.isInside(ignored, event.path))).toBe(false);
    expect(failures).toEqual([]);

    notifyNative("change", null);
    const deliveredBeforeClose = events.length;
    active = false;
    await backend.close();
    expect(closed).toBe(true);
    expect(backend.getDiagnostics()).toMatchObject({
      nativeTrackedFileCount: 0,
      pendingReconciliationWorkCount: 0,
      reconciliationInFlight: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(events).toHaveLength(deliveredBeforeClose);
  } finally {
    active = false;
    await backend.close();
    await rm(root, { recursive: true, force: true });
  }
});

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
