import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Pressable, Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  ComposerTrackListRow,
  ComposerTrackPill,
  ComposerTrackRow,
  type ComposerTrackPillSegment,
} from "./tracks";

const SUBAGENT_SEGMENTS: ComposerTrackPillSegment[] = [{ bucket: null, text: "3 subagents" }];

// App sources compile against the classic JSX runtime, which expects React on the global.
beforeEach(() => vi.stubGlobal("React", React));

/**
 * The real menu engine, in a real browser, because both things under test only exist there: the
 * panel's dismissal runs through `selectItem`, and the running mark is a Web Animations rotation
 * that jsdom cannot report.
 */

interface Mounted {
  root: Root;
  container: HTMLDivElement;
}

const mounted: Mounted[] = [];

function mount(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

function click(element: Element): void {
  act(() => {
    (element as HTMLElement).click();
  });
}

function pill(): HTMLElement {
  const trigger = document.querySelector('[data-testid="pill"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("track pill did not render");
  }
  return trigger;
}

function openPanel(): void {
  click(pill());
}

function row(testID: string): Element | null {
  return document.querySelector(`[data-testid="${testID}"]`);
}

function requiredRow(testID: string): HTMLElement {
  const target = row(testID);
  if (!(target instanceof HTMLElement)) {
    throw new Error(`track row ${testID} did not render`);
  }
  return target;
}

function isPanelOpen(): boolean {
  return pill().getAttribute("aria-expanded") === "true";
}

describe("composer track panel", () => {
  it("dismisses itself when a row is chosen", () => {
    const onPress = vi.fn();
    mount(
      <ComposerTrackPill testID="pill" segments={SUBAGENT_SEGMENTS} panelTitle="Subagents">
        <ComposerTrackRow accessibilityLabel="Subagent one" testID="row" onPress={onPress}>
          <Text>Subagent one</Text>
        </ComposerTrackRow>
      </ComposerTrackPill>,
    );

    openPanel();
    const target = row("row");
    expect(target).not.toBeNull();

    click(target as Element);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(isPanelOpen()).toBe(false);
    expect(row("row")).toBeNull();
  });

  it("stays open for a row whose result lands in the panel", () => {
    const onPress = vi.fn();
    mount(
      <ComposerTrackPill testID="pill" segments={SUBAGENT_SEGMENTS} panelTitle="Subagents">
        <ComposerTrackRow
          accessibilityLabel="Archive finished"
          testID="row"
          closeOnSelect={false}
          onPress={onPress}
        >
          <Text>Archive finished</Text>
        </ComposerTrackRow>
      </ComposerTrackPill>,
    );

    openPanel();
    click(row("row") as Element);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(isPanelOpen()).toBe(true);
    expect(row("row")).not.toBeNull();
  });

  it("leaves the panel alone when a row's own action button is pressed", () => {
    const onPress = vi.fn();
    const onAction = vi.fn();
    const action = vi.fn(() => (
      <Pressable accessibilityRole="button" testID="row-archive" onPress={onAction}>
        <Text>Archive</Text>
      </Pressable>
    ));
    mount(
      <ComposerTrackPill testID="pill" segments={SUBAGENT_SEGMENTS} panelTitle="Subagents">
        <ComposerTrackRow
          accessibilityLabel="Subagent one"
          testID="row"
          onPress={onPress}
          actions={action}
        >
          <Text>Subagent one</Text>
        </ComposerTrackRow>
      </ComposerTrackPill>,
    );

    openPanel();
    const openButton = requiredRow("row");
    const archiveButton = requiredRow("row-archive");
    expect(openButton.tagName).toBe("BUTTON");
    expect(archiveButton.tagName).toBe("BUTTON");
    expect(archiveButton.parentElement).toBe(openButton.parentElement);
    expect(archiveButton.parentElement?.closest("button")).toBeNull();
    click(archiveButton);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(isPanelOpen()).toBe(true);
  });
});

describe("composer track persistent list", () => {
  it("keeps task actions separate, revealed across hover, and keyboard operable", async () => {
    const onOpen = vi.fn();
    const onArchive = vi.fn();
    const renderActions = vi.fn(({ active }: { active: boolean }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Archive task"
        testID="task-archive"
        disabled={!active}
        onPress={onArchive}
      >
        <Text>Archive</Text>
      </Pressable>
    ));
    const container = mount(
      <ComposerTrackListRow
        accessibilityLabel="Review the implementation"
        testID="task"
        onPress={onOpen}
        actions={renderActions}
      >
        <Text>Review the implementation</Text>
      </ComposerTrackListRow>,
    );
    container.style.width = "380px";

    const openButton = requiredRow("task");
    const archiveButton = requiredRow("task-archive");
    const frame = openButton.parentElement;
    if (!(frame instanceof HTMLElement)) {
      throw new Error("task row did not render its shared frame");
    }
    expect(openButton.tagName).toBe("BUTTON");
    expect(archiveButton.tagName).toBe("BUTTON");
    expect(archiveButton.parentElement).toBe(frame);
    expect(container.querySelector("button button")).toBeNull();
    expect(archiveButton.matches(":disabled")).toBe(true);
    expect(renderActions).toHaveBeenLastCalledWith({ active: false });
    const before = frame.getBoundingClientRect();

    await act(async () => userEvent.hover(openButton));
    expect(archiveButton.matches(":disabled")).toBe(false);
    expect(renderActions).toHaveBeenLastCalledWith({ active: true });
    await act(async () => userEvent.hover(archiveButton));
    expect(archiveButton.matches(":disabled")).toBe(false);
    const revealed = frame.getBoundingClientRect();
    expect(revealed.width).toBeCloseTo(before.width, 1);
    expect(revealed.height).toBeCloseTo(before.height, 1);

    await act(async () => userEvent.click(archiveButton));
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(openButton.isConnected).toBe(true);

    act(() => openButton.focus());
    await act(async () => userEvent.keyboard("{Enter}"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    await act(async () => userEvent.keyboard(" "));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(openButton.isConnected).toBe(true);
  });
});

describe("composer track pill status mark", () => {
  /** The mark is the glyph itself: the dot for a still state, the ring's carrier for running. */
  function mountMark(bucket: "running" | "failed"): { mark: HTMLElement; body: HTMLElement } {
    const container = mount(
      <ComposerTrackPill
        testID="pill"
        segments={[{ bucket, text: "3 subagents" }]}
        panelTitle="Subagents"
      >
        <Text>rows</Text>
      </ComposerTrackPill>,
    );
    const segment = container.querySelector('[data-testid="pill-segment-0"]');
    const body = container.querySelector('[data-testid="pill"]');
    if (!(segment?.firstElementChild instanceof HTMLElement) || !(body instanceof HTMLElement)) {
      throw new Error("pill did not render a status mark");
    }
    return { mark: segment.firstElementChild, body };
  }

  it("spins the shared ring while a child is running", () => {
    const { mark } = mountMark("running");
    const animated = [...mark.querySelectorAll("*")].filter(
      (element) => element.getAnimations().length > 0,
    );

    expect(animated).toHaveLength(1);
    // The rotation is on the carrier; the quarter arc it turns is the coloured top border inside.
    const arc = animated[0]?.firstElementChild as HTMLElement;
    const arcStyle = getComputedStyle(arc);
    expect(arcStyle.borderTopColor).toBe("rgb(38, 138, 224)");
    expect(arcStyle.borderLeftColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("draws a still dot for every other state", () => {
    const { mark } = mountMark("failed");
    const animated = [...mark.querySelectorAll("*")].filter(
      (element) => element.getAnimations().length > 0,
    );

    expect(animated).toHaveLength(0);
    expect(getComputedStyle(mark).backgroundColor).toBe("rgb(241, 46, 47)");
  });

  it("starts the circle you can see on the pill's own padding, whatever the state", () => {
    // The inset the eye compares a leading mark against is the label's trailing one, and that one
    // is the pill's padding. A mark boxed wider than its glyph sits further in than that while
    // looking correctly centred in the box nobody can see.
    for (const bucket of ["running", "failed"] as const) {
      const { mark, body } = mountMark(bucket);
      // The dot is its own box; the ring is drawn by the rotator inside the frame's halo.
      const glyph = bucket === "failed" ? mark : mark.firstElementChild?.firstElementChild;
      if (!(glyph instanceof HTMLElement)) {
        throw new Error(`${bucket} mark did not render a glyph`);
      }

      const style = getComputedStyle(body);
      const edge = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth);
      const inset = glyph.getBoundingClientRect().left - body.getBoundingClientRect().left;

      expect(inset).toBeCloseTo(edge, 1);
    }
  });

  it("draws every state it is given, so a running child survives a failed sibling", () => {
    const container = mount(
      <ComposerTrackPill
        testID="pill"
        segments={[
          { bucket: "failed", text: "1 failed" },
          { bucket: "running", text: "1 working" },
        ]}
        panelTitle="Subagents"
      >
        <Text>rows</Text>
      </ComposerTrackPill>,
    );

    const segments = [...container.querySelectorAll('[data-testid^="pill-segment-"]')];
    expect(segments.map((segment) => segment.textContent)).toEqual(["1 failed", "1 working"]);
    // The ring is the only mark that animates, so its presence proves the second state survived.
    const animated = segments[1]?.querySelectorAll("*") ?? [];
    expect([...animated].filter((element) => element.getAnimations().length > 0)).toHaveLength(1);
  });
});
