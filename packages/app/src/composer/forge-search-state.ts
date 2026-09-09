import type { ForgeSearchItem } from "@getpaseo/protocol/messages";
import type { ForgeSearchPayload } from "@/git/use-forge-search-query";

const EMPTY_SEARCH_ITEMS: ForgeSearchItem[] = [];

export function resolveForgeSearchState(input: {
  data: Pick<ForgeSearchPayload, "items" | "error"> | undefined;
  error: unknown;
  isFetching: boolean;
  searchingText: string;
  noResultsText: string;
}): { items: ForgeSearchItem[]; emptyText: string } {
  const error = input.error ?? input.data?.error;
  if (error) {
    return {
      items: EMPTY_SEARCH_ITEMS,
      emptyText: error instanceof Error ? error.message || error.name : String(error),
    };
  }
  return {
    items: input.data?.items ?? EMPTY_SEARCH_ITEMS,
    emptyText: input.isFetching ? input.searchingText : input.noResultsText,
  };
}
