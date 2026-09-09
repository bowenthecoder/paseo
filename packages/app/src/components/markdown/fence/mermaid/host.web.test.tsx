/** @vitest-environment jsdom */
import * as React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MermaidFenceHost } from "./host.web";

vi.stubGlobal("React", React);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/highlighted-code-block", () => ({ HighlightedCodeBlock: () => null }));
vi.mock("@/components/zoomable-viewport", () => ({
  ZoomableViewport: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./runtime/html.gen", () => ({ mermaidRuntimeHtml: '<div id="diagram"></div>' }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SOURCE = "flowchart LR\n  Start --> Done\n";
const EMPTY_STYLE = {};

function mountCompletedDiagram() {
  const view = render(
    <MermaidFenceHost
      code={SOURCE}
      phase="complete"
      inheritedStyles={EMPTY_STYLE}
      textStyle={EMPTY_STYLE}
    />,
  );
  const iframe = view.container.querySelector("iframe");
  if (!iframe?.contentWindow) throw new Error("Expected the diagram runtime iframe");
  const postMessage = vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation(() => {});
  return { iframe, postMessage };
}

function announceReady(iframe: HTMLIFrameElement) {
  fireEvent(
    window,
    new MessageEvent("message", {
      source: iframe.contentWindow,
      data: { type: "bridgeReady" },
    }),
  );
}

describe("Mermaid runtime startup", () => {
  it("renders completed history after iframe load when its early ready message was missed", () => {
    const { iframe, postMessage } = mountCompletedDiagram();

    fireEvent.load(iframe);

    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "render", revision: 1, source: SOURCE, colorScheme: "dark", interactive: false },
      "*",
    );
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it.each(["bridge-first", "load-first"])(
    "sends the pending render once when both readiness signals arrive (%s)",
    (order) => {
      const { iframe, postMessage } = mountCompletedDiagram();

      if (order === "bridge-first") {
        announceReady(iframe);
        fireEvent.load(iframe);
      } else {
        fireEvent.load(iframe);
        announceReady(iframe);
      }

      expect(postMessage).toHaveBeenCalledTimes(1);
    },
  );
});
