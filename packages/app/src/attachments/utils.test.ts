import { describe, expect, it } from "vitest";
import {
  createImageSourceCacheKey,
  createPreviewAttachmentId,
  fileUriToPath,
  localFileSourceToPath,
  markdownFileSourceToPath,
  parseDataUrl,
  parseImageDataUrl,
  pathToFileUri,
} from "./utils";

describe("pathToFileUri", () => {
  it("converts POSIX absolute paths to file URIs", () => {
    expect(pathToFileUri("/home/user/file.txt")).toBe("file:///home/user/file.txt");
  });

  it("converts Windows drive-letter paths to file URIs", () => {
    expect(pathToFileUri("C:\\Users\\file.txt")).toBe("file:///C:/Users/file.txt");
  });

  it("converts UNC paths to host-based file URIs", () => {
    expect(pathToFileUri("\\\\server\\share\\dir")).toBe("file://server/share/dir");
  });

  it("passes through file URIs unchanged", () => {
    expect(pathToFileUri("file:///already/uri")).toBe("file:///already/uri");
  });

  it("passes through relative paths unchanged", () => {
    expect(pathToFileUri("relative/path")).toBe("relative/path");
  });
});

describe("fileUriToPath", () => {
  it("converts Windows drive-letter file URIs back to paths", () => {
    expect(fileUriToPath("file:///C:/Users/file.txt")).toBe("C:/Users/file.txt");
  });

  it("converts host-based file URIs back to UNC paths", () => {
    expect(fileUriToPath("file://server/share/shot%231.png")).toBe("\\\\server\\share\\shot#1.png");
  });
});

describe("localFileSourceToPath", () => {
  it("decodes markdown-encoded Windows drive-letter paths", () => {
    expect(localFileSourceToPath("C:%5CUsers%5Cfile.txt")).toBe("C:/Users/file.txt");
  });

  it("preserves literal percent sequences in plain local paths", () => {
    expect(localFileSourceToPath("/tmp/image%20with%20literal%20percent.png")).toBe(
      "/tmp/image%20with%20literal%20percent.png",
    );
  });
});

describe("markdownFileSourceToPath", () => {
  it.each([
    ["/tmp/Paseo%20Preview/current-chats.png", "/tmp/Paseo Preview/current-chats.png"],
    ["shots/current%20chats.png", "shots/current chats.png"],
    ["~/shots/current%20chats.png", "~/shots/current chats.png"],
    ["file:///tmp/Paseo%20Preview/current.png", "/tmp/Paseo Preview/current.png"],
    ["C:%5CMy%20Files%5Ccurrent.png", "C:/My Files/current.png"],
    ["C:/My%20Files/current.png", "C:/My Files/current.png"],
    ["file:///C:/My%20Files/current.png", "C:/My Files/current.png"],
    ["/tmp/literal%2520.png", "/tmp/literal%20.png"],
    ["file:///tmp/literal%2520.png", "/tmp/literal%20.png"],
    ["C:%5CMy%20Files%5Cliteral%2520.png", "C:/My Files/literal%20.png"],
    ["/tmp/100%/current%20chats.png", "/tmp/100%/current chats.png"],
    ["file:///tmp/100%/current%20chats.png", "/tmp/100%/current chats.png"],
    ["/tmp/caf%C3%A9.png", "/tmp/café.png"],
    ["/tmp/bad%ZZ%20name.png", "/tmp/bad%ZZ name.png"],
    ["/tmp/bad%FF.png", "/tmp/bad%FF.png"],
    ["/tmp/name%3Fpart%23one.png?size=20#preview", "/tmp/name?part#one.png"],
    ["file:///tmp/name%3Fpart%23one.png?size=20#preview", "/tmp/name?part#one.png"],
  ])("converts the Markdown destination %s once", (source, expected) => {
    expect(markdownFileSourceToPath(source)).toBe(expected);
  });
});

describe("parseDataUrl", () => {
  it("accepts base64 data URLs with media-type parameters", () => {
    expect(parseDataUrl("data:image/png;charset=utf-8;name=preview;base64,AAECAw==")).toEqual({
      mimeType: "image/png",
      base64: "AAECAw==",
    });
  });

  it("rejects non-base64 data URLs", () => {
    expect(() => parseDataUrl("data:image/png,not-base64")).toThrow(
      "Attachment data URL is not base64 encoded.",
    );
  });
});

describe("parseImageDataUrl", () => {
  it("returns a compact cache key for image data URLs", () => {
    const dataUrl = `data:image/png;base64,${"a".repeat(512)}`;

    expect(parseImageDataUrl(dataUrl)).toMatchObject({
      mimeType: "image/png",
      base64: "a".repeat(512),
    });
    expect(createImageSourceCacheKey(dataUrl)).toMatch(/^data-image:image\/png:512:/);
    expect(createImageSourceCacheKey(dataUrl)).not.toContain("a".repeat(128));
  });

  it("ignores non-image data URLs", () => {
    expect(parseImageDataUrl("data:text/plain;base64,SGVsbG8=")).toBeNull();
  });

  it("ignores SVG data URLs", () => {
    expect(parseImageDataUrl("data:image/svg+xml;base64,PHN2ZyAvPg==")).toBeNull();
  });

  it("distinguishes image data that differs only in the middle", () => {
    const prefix = "a".repeat(64);
    const suffix = "z".repeat(64);
    const first = `data:image/png;base64,${prefix}${"b".repeat(256)}${suffix}`;
    const second = `data:image/png;base64,${prefix}${"c".repeat(256)}${suffix}`;

    expect(createImageSourceCacheKey(first)).not.toBe(createImageSourceCacheKey(second));
  });

  it("gives equal-length preview content distinct attachment identities", () => {
    expect(
      createPreviewAttachmentId({
        mimeType: "image/png",
        contentLength: 512,
        contentKey: "first-content",
      }),
    ).not.toBe(
      createPreviewAttachmentId({
        mimeType: "image/png",
        contentLength: 512,
        contentKey: "second-content",
      }),
    );
  });
});
