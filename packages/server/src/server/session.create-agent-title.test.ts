import { describe, expect, test } from "vitest";

import {
  resolveCreateAgentTitles,
  resolveAcceptedTitlePrompt,
} from "./agent/create-agent-title.js";

describe("resolveCreateAgentTitles", () => {
  test("derives a provisional title from prompt when explicit title is absent", () => {
    const resolved = resolveCreateAgentTitles({
      configTitle: undefined,
      initialPrompt: "Implement auth retries with backoff\n\ninclude tests",
    });

    expect(resolved.explicitTitle).toBeNull();
    expect(resolved.provisionalTitle).toBe("Implement auth retries with backoff");
  });

  test("preserves explicit title and does not treat it as provisional", () => {
    const resolved = resolveCreateAgentTitles({
      configTitle: "  Keep This Title  ",
      initialPrompt: "Ignored prompt title",
    });

    expect(resolved.explicitTitle).toBe("Keep This Title");
    expect(resolved.provisionalTitle).toBe("Keep This Title");
  });

  test("returns null values when prompt and title are empty", () => {
    const resolved = resolveCreateAgentTitles({
      configTitle: "   ",
      initialPrompt: "   ",
    });

    expect(resolved.explicitTitle).toBeNull();
    expect(resolved.provisionalTitle).toBeNull();
  });
});

test("provisional titles omit request boilerplate and end at word boundaries", () => {
  expect(
    resolveCreateAgentTitles({
      initialPrompt:
        "I want you to investigate the Amazon tracking failure and then run all the regression tests",
    }).provisionalTitle,
  ).toBe("investigate the Amazon tracking failure and");
});

test("title prompt skips imported chat history and names attachment-only tasks from metadata", () => {
  expect(
    resolveAcceptedTitlePrompt([
      {
        type: "text",
        text: "Old imported conversation",
        mimeType: "text/plain",
        contextKind: "chat_history",
      },
      { type: "text", text: "Fix the current checkout" },
    ]),
  ).toBe("Fix the current checkout");
  expect(
    resolveAcceptedTitlePrompt([
      {
        type: "uploaded_file",
        fileName: "inventory.csv",
        path: "/tmp/inventory.csv",
        mimeType: "text/csv",
        size: 42,
      },
    ]),
  ).toBe("Review inventory.csv");
  expect(
    resolveAcceptedTitlePrompt([
      { type: "image", data: "not-read-for-title", mimeType: "image/png" },
    ]),
  ).toBe("Review attached image");
});
