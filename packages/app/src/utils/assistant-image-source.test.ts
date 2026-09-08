import { describe, expect, it } from "vitest";

import { resolveAssistantImageSource } from "./assistant-image-source";

describe("resolveAssistantImageSource", () => {
  it("passes through direct image URIs", () => {
    expect(resolveAssistantImageSource({ source: "https://example.com/image.png" })).toEqual({
      kind: "direct",
      uri: "https://example.com/image.png",
    });
    expect(resolveAssistantImageSource({ source: "data:image/png;base64,abc" })).toEqual({
      kind: "direct",
      uri: "data:image/png;base64,abc",
    });
  });

  it("uses the workspace root for relative paths", () => {
    expect(
      resolveAssistantImageSource({
        source: "screenshots/output.png",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      kind: "file_rpc",
      cwd: "/Users/test/project",
      path: "screenshots/output.png",
    });
  });

  it("decodes the screenshot URL before requesting a file outside the workspace", () => {
    expect(
      resolveAssistantImageSource({
        source: "/Users/test/Desktop/Paseo%20Preview%2020260908/current-chats.png",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      kind: "file_rpc",
      cwd: "/",
      path: "/Users/test/Desktop/Paseo Preview 20260908/current-chats.png",
    });
  });

  it("decodes relative image URLs once and keeps encoded filename punctuation", () => {
    expect(
      resolveAssistantImageSource({
        source: "shots/current%20%2520%3F%23.png?size=20#preview",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      kind: "file_rpc",
      cwd: "/Users/test/project",
      path: "shots/current %20?#.png",
    });
  });

  it("does not decode external or data image URLs", () => {
    for (const source of [
      "https://example.com/a%20b.png?redirect=%2520#part%20one",
      "data:image/svg+xml,%3Csvg%20width%3D%221%22%3E",
      "blob:https://example.com/part%2520",
    ]) {
      expect(resolveAssistantImageSource({ source })).toEqual({ kind: "direct", uri: source });
    }
    expect(
      resolveAssistantImageSource({
        source: "ftp://example.com/a%20b.png",
        workspaceRoot: "/Users/test/project",
      }),
    ).toBeNull();
  });

  it("uses the workspace root for absolute paths inside the workspace", () => {
    expect(
      resolveAssistantImageSource({
        source: "/Users/test/project/screenshots/output.png",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      kind: "file_rpc",
      cwd: "/Users/test/project",
      path: "/Users/test/project/screenshots/output.png",
    });
  });

  it("falls back to filesystem root for absolute paths outside the workspace", () => {
    expect(
      resolveAssistantImageSource({
        source: "/tmp/paseo-codex-screenshot.png",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      kind: "file_rpc",
      cwd: "/",
      path: "/tmp/paseo-codex-screenshot.png",
    });
  });

  it("uses the same home-root target as file previews for tilde paths", () => {
    expect(
      resolveAssistantImageSource({
        source: "~/.paseo/screenshots/output.png",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      kind: "file_rpc",
      cwd: "~",
      path: "~/.paseo/screenshots/output.png",
    });
  });

  it("normalizes file URIs into file RPC requests", () => {
    expect(
      resolveAssistantImageSource({
        source: "file:///tmp/paseo-codex-screenshot.png",
        workspaceRoot: "/Users/test/project",
      }),
    ).toEqual({
      kind: "file_rpc",
      cwd: "/",
      path: "/tmp/paseo-codex-screenshot.png",
    });
  });

  it("normalizes markdown-encoded Windows paths into file RPC requests", () => {
    expect(
      resolveAssistantImageSource({
        source: "C:%5CUsers%5Chanse%5CAppData%5CLocal%5CTemp%5Cpaseo-attachments%5Cimage.png",
        workspaceRoot: "C:/Users/hanse/eatingkat",
      }),
    ).toEqual({
      kind: "file_rpc",
      cwd: "C:/",
      path: "C:/Users/hanse/AppData/Local/Temp/paseo-attachments/image.png",
    });
  });

  it("falls back to the drive root for Windows absolute paths", () => {
    expect(
      resolveAssistantImageSource({
        source: "C:/Users/test/Desktop/screenshot.png",
        workspaceRoot: "D:/repo",
      }),
    ).toEqual({
      kind: "file_rpc",
      cwd: "C:/",
      path: "C:/Users/test/Desktop/screenshot.png",
    });
  });
});
