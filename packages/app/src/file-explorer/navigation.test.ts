import { describe, expect, it } from "vitest";
import {
  explorerFileOpenPath,
  explorerFilesystemRoot,
  explorerParentDirectory,
} from "./navigation";

describe("device filesystem navigation", () => {
  it("reaches a POSIX root without allowing parent navigation past it", () => {
    expect(explorerParentDirectory("/home/bowen/project/")).toBe("/home/bowen");
    expect(explorerParentDirectory("/home")).toBe("/");
    expect(explorerParentDirectory("/")).toBeNull();
    expect(explorerFilesystemRoot("/Users/bowen/project")).toBe("/");
  });

  it("uses the remote Windows drive or share instead of this computer's root", () => {
    expect(explorerFilesystemRoot("D:\\work\\project")).toBe("D:/");
    expect(explorerParentDirectory("D:\\work")).toBe("D:/");
    expect(explorerParentDirectory("D:\\")).toBeNull();
    expect(explorerFilesystemRoot("\\\\server\\share\\project")).toBe("//server/share");
    expect(explorerParentDirectory("\\\\server\\share\\project")).toBe("//server/share");
    expect(explorerParentDirectory("\\\\server\\share")).toBeNull();
  });

  it("leaves a host home alias for the daemon to expand", () => {
    expect(explorerParentDirectory("~")).toBeNull();
    expect(explorerParentDirectory("~/Downloads")).toBe("~");
    expect(explorerFilesystemRoot("~")).toBeNull();
    expect(
      explorerFileOpenPath({
        path: "report.md",
        browsingRoot: "~",
        workspaceRoot: "/home/remote/project",
      }),
    ).toBe("~/report.md");
  });

  it("opens files outside the working folder at their actual host path", () => {
    expect(
      explorerFileOpenPath({
        path: "sibling/report.md",
        browsingRoot: "/home/bowen",
        workspaceRoot: "/home/bowen/project",
      }),
    ).toBe("/home/bowen/sibling/report.md");
    expect(
      explorerFileOpenPath({
        path: "etc/hosts",
        browsingRoot: "/",
        workspaceRoot: "/home/bowen/project",
      }),
    ).toBe("/etc/hosts");
    expect(
      explorerFileOpenPath({
        path: "notes.txt",
        browsingRoot: "D:/",
        workspaceRoot: "D:/project",
      }),
    ).toBe("D:/notes.txt");
  });

  it("keeps existing relative file tab identities in the working folder", () => {
    expect(
      explorerFileOpenPath({
        path: "docs/report.md",
        browsingRoot: "/home/bowen/project/",
        workspaceRoot: "/home/bowen/project",
      }),
    ).toBe("docs/report.md");
  });
});
