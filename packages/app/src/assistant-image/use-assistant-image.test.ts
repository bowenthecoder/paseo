// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import type { ImageLoadEvent } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { __setAttachmentStoreForTests } from "@/attachments/store";
import type { AttachmentStore, SaveAttachmentInput } from "@/attachments/types";
import { useAssistantImage } from "./use-assistant-image";

const i18n = createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: {} } },
  });
});

afterEach(() => {
  cleanup();
  __setAttachmentStoreForTests(null);
});

describe("assistant image preview recovery", () => {
  it("rereads the source after a stored preview disappears and keeps the repaired cache on remount", async () => {
    const savedSources: SaveAttachmentInput[] = [];
    const storedIds = new Set<string>();
    let removeFirstPreview = true;
    const store: AttachmentStore = {
      storageType: "web-indexeddb",
      async save(input) {
        const id = input.id!;
        savedSources.push(input);
        storedIds.add(id);
        return {
          id,
          mimeType: input.mimeType ?? "image/png",
          storageType: "web-indexeddb",
          storageKey: id,
          createdAt: savedSources.length,
        };
      },
      async resolvePreviewUrl({ attachment }) {
        // Storage can disappear after acquisition succeeds but before URL resolution.
        if (removeFirstPreview) {
          removeFirstPreview = false;
          storedIds.delete(attachment.id);
        }
        if (!storedIds.has(attachment.id)) {
          throw new Error("ENOENT: stored preview is missing");
        }
        return `blob:${attachment.id}`;
      },
      async encodeBase64() {
        throw new Error("This image preview does not encode an outgoing attachment");
      },
      async delete({ attachment }) {
        storedIds.delete(attachment.id);
      },
      async garbageCollect() {},
    };
    __setAttachmentStoreForTests(store);
    let reads = 0;
    let sourceAvailable = true;
    const client: Pick<DaemonClient, "readFile"> = {
      async readFile(_cwd, path) {
        reads += 1;
        if (!sourceAvailable) throw new Error("Source image no longer exists");
        return {
          kind: "image",
          path,
          mime: "image/png",
          size: 4,
          modifiedAt: "1",
          bytes: new Uint8Array([1, 2, 3, 4]),
        };
      },
    };
    const input = {
      source: "missing-stored-preview.png",
      occurrenceKey: "agent:message:missing-stored-preview",
      workspaceRoot: "/workspace",
      serverId: "preview-recovery-host",
      client,
    };
    const first = renderHook(() => useAssistantImage(input));
    await waitFor(() => expect(first.result.current.status).toBe("failed"), { timeout: 3_000 });
    expect(reads).toBe(1);
    expect(savedSources).toHaveLength(1);
    first.unmount();

    const retry = renderHook(() => useAssistantImage(input));
    await waitFor(() => {
      expect(retry.result.current.status).not.toBe("failed");
      expect("binding" in retry.result.current && retry.result.current.binding).toBeTruthy();
    });
    expect(reads).toBe(2);
    expect(savedSources).toHaveLength(2);
    expect(savedSources[1].id).toBe(savedSources[0].id);
    const recovered = retry.result.current;
    if (recovered.status === "failed" || !recovered.binding) {
      throw new Error("Expected a recovered preview binding");
    }
    const repairedUri = recovered.binding.uri;
    act(() => {
      recovered.binding!.onLoad({
        nativeEvent: { source: { width: 64, height: 32, uri: repairedUri } },
      } as ImageLoadEvent);
    });
    expect(retry.result.current.status).toBe("loaded");
    retry.unmount();

    sourceAvailable = false;
    const remounted = renderHook(() => useAssistantImage(input));
    await waitFor(() => {
      const current = remounted.result.current;
      expect(current.status !== "failed" && current.binding?.uri).toBe(repairedUri);
    });
    expect(reads).toBe(2);
    expect(savedSources).toHaveLength(2);
  });
});
