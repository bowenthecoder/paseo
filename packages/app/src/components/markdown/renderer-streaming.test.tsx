/** @vitest-environment jsdom */
import * as React from "react";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "./renderer";

vi.stubGlobal("React", React);
vi.mock("react-native-markdown-display", async () => {
  const { default: MarkdownIt } = await import("markdown-it");
  return {
    MarkdownIt,
    // A fence owns a persistent runtime. Observing its DOM identity detects a
    // parent-key remount without needing to run Mermaid's separate renderer.
    default: ({ children }: { children: React.ReactNode }) =>
      createElement("iframe", {
        title: "Diagram runtime",
        sandbox: "",
        "data-source": String(children),
      }),
  };
});
vi.mock("@/components/markdown/fence", () => ({ MarkdownFenceBlock: () => null }));
vi.mock("@/components/highlighted-code-block", () => ({ HighlightedCodeBlock: () => null }));

afterEach(cleanup);

it("preserves the assistant Markdown runtime while the first 80 characters stream and finish", () => {
  const first = "```mermaid\nflowchart LR\n  Start --> Middle";
  const view = render(<MarkdownRenderer text={first} enableHtmlish={false} />);
  const runtime = view.getByTitle("Diagram runtime");
  const prefixes = [
    `${first}\n  Middle --> Done`,
    `${first}\n  Middle --> Done\n  Done --> Review\n  Review --> Release`,
    `${first}\n  Middle --> Done\n  Done --> Review\n  Review --> Release\n\`\`\``,
  ];

  for (const text of prefixes) {
    view.rerender(<MarkdownRenderer text={text} enableHtmlish={false} />);
    expect(view.getByTitle("Diagram runtime")).toBe(runtime);
    expect(runtime.isConnected).toBe(true);
    expect(runtime.getAttribute("data-source")).toBe(text);
  }
});
