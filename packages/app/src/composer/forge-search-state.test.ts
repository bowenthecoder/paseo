import { describe, expect, it } from "vitest";
import type { ForgeSearchItem } from "@getpaseo/protocol/messages";
import { resolveForgeSearchState } from "./forge-search-state";

const MATCHING_ISSUE: ForgeSearchItem = {
  kind: "issue",
  number: 23,
  title: "Attach the matching issue",
  url: "https://github.com/acme/repo/issues/23",
  state: "open",
  body: null,
  labels: [],
};

const DEFAULT_INPUT = {
  data: undefined,
  error: null,
  isFetching: false,
  searchingText: "Searching...",
  noResultsText: "No results found.",
};

describe("resolveForgeSearchState", () => {
  it("shows the daemon search error instead of reporting no results", () => {
    expect(
      resolveForgeSearchState({
        ...DEFAULT_INPUT,
        data: { items: [], error: "GraphQL: API rate limit exceeded" },
      }),
    ).toEqual({ items: [], emptyText: "GraphQL: API rate limit exceeded" });
  });

  it("hides stale successful results and shows a later transport failure", () => {
    expect(
      resolveForgeSearchState({
        ...DEFAULT_INPUT,
        data: { items: [MATCHING_ISSUE], error: null },
        error: new Error("Request timed out"),
      }),
    ).toEqual({ items: [], emptyText: "Request timed out" });
  });

  it("does not let stale response errors hide a newer connection error", () => {
    expect(
      resolveForgeSearchState({
        ...DEFAULT_INPUT,
        data: { items: [], error: "GraphQL: unavailable" },
        error: new Error("Host disconnected"),
        isFetching: true,
      }),
    ).toEqual({ items: [], emptyText: "Host disconnected" });
  });

  it("displays non-Error rejections from the transport", () => {
    expect(
      resolveForgeSearchState({ ...DEFAULT_INPUT, error: "Connection closed" }).emptyText,
    ).toBe("Connection closed");
  });

  it("does not render a blank state for an Error without a message", () => {
    expect(resolveForgeSearchState({ ...DEFAULT_INPUT, error: new Error() }).emptyText).toBe(
      "Error",
    );
  });

  it("shows searching until an empty request finishes successfully", () => {
    expect(resolveForgeSearchState({ ...DEFAULT_INPUT, isFetching: true })).toEqual({
      items: [],
      emptyText: "Searching...",
    });
    expect(resolveForgeSearchState({ ...DEFAULT_INPUT, data: { items: [], error: null } })).toEqual(
      { items: [], emptyText: "No results found." },
    );
  });

  it("preserves successful and partial search results for selection", () => {
    const items = [MATCHING_ISSUE];
    expect(resolveForgeSearchState({ ...DEFAULT_INPUT, data: { items, error: null } }).items).toBe(
      items,
    );
  });
});
