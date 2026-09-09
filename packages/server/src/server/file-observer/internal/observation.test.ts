import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { FileChange } from "../index.js";
import type { CreateObservationBackend, ObserverMetrics } from "./contracts.js";
import { createManagedObservation } from "./observation.js";
import { createObserverPaths } from "./paths.js";

function createEventBackend() {
  let queue: (changes: FileChange[]) => void = () => {
    throw new Error("Observation backend has not been created");
  };
  const createBackend: CreateObservationBackend = (host) => {
    queue = (changes) => {
      for (const change of changes) host.queueEvent(change.type, change.path);
    };
    return {
      start: async () => {},
      updateIgnore: async () => {},
      close: async () => {},
      getDiagnostics: () => ({
        nativeHandleCount: 0,
        nativeTrackedFileCount: 0,
        pendingReconciliationWorkCount: 0,
        reconciliationInFlight: false,
      }),
    };
  };
  return { createBackend, emit: (...changes: FileChange[]) => queue(changes) };
}

it("delivers a deletion when a repeated creation shares its delivery batch", async () => {
  const root = await mkdtemp(join(tmpdir(), "paseo-observation-batch-"));
  const target = join(root, "changed.txt");
  const backend = createEventBackend();
  const deliveries: Array<{ error: Error | null; events: FileChange[] }> = [];
  const observation = createManagedObservation({
    root,
    callback: (error, events) => deliveries.push({ error, events }),
    options: {},
    paths: createObserverPaths(process.platform),
    metrics: createMetrics(),
    createBackend: backend.createBackend,
    onClosed: () => {},
  });
  async function expectBatch(events: FileChange[]) {
    await expect.poll(() => deliveries).toEqual([{ error: null, events }]);
    deliveries.length = 0;
  }
  try {
    await observation.start();
    backend.emit({ path: target, type: "create" });
    await expectBatch([{ path: target, type: "create" }]);

    // A native backend can repeat an already delivered creation while its
    // inventory scan reports deletion. Synchronous emission keeps both events
    // in one real-clock batch; the consumer must receive the removal.
    backend.emit({ path: target, type: "create" }, { path: target, type: "delete" });
    await expectBatch([{ path: target, type: "delete" }]);

    backend.emit({ path: target, type: "create" });
    await expectBatch([{ path: target, type: "create" }]);

    // Removing and then replacing a file still reports an existing file.
    backend.emit({ path: target, type: "delete" }, { path: target, type: "create" });
    await expectBatch([{ path: target, type: "update" }]);
  } finally {
    await observation.close();
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
