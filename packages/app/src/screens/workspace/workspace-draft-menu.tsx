import { useCallback } from "react";
import { DropdownMenuItem, type MenuPageDefinition } from "@/components/ui/dropdown-menu";
import { buildDraftStoreKey } from "@/stores/draft-keys";
import { useDraftStore } from "@/stores/draft-store";

export const WORKSPACE_DRAFTS_PAGE_ID = "workspace-drafts";

export interface WorkspaceDraftMenuEntry {
  tabId: string;
  draftId: string;
}

interface WorkspaceDraftMenuProps {
  serverId: string;
  entries: WorkspaceDraftMenuEntry[];
  onSelect: (tabId: string) => void;
}

function DraftOption({
  serverId,
  entry,
  index,
  onSelect,
}: {
  serverId: string;
  entry: WorkspaceDraftMenuEntry;
  index: number;
  onSelect: (tabId: string) => void;
}) {
  const draftKey = buildDraftStoreKey({ serverId, agentId: "", draftId: entry.draftId });
  const text = useDraftStore((state) => state.drafts[draftKey]?.input.text ?? "");
  const handleSelect = useCallback(() => onSelect(entry.tabId), [entry.tabId, onSelect]);
  const preview = text.trim().replace(/\s+/g, " ").slice(0, 72);
  return (
    <DropdownMenuItem testID={`workspace-recover-draft-${entry.draftId}`} onSelect={handleSelect}>
      {preview || `Draft ${index + 1}`}
    </DropdownMenuItem>
  );
}

function DraftOptions({ serverId, entries, onSelect }: WorkspaceDraftMenuProps) {
  return (
    <>
      {entries.map((entry, index) => (
        <DraftOption
          key={entry.tabId}
          serverId={serverId}
          entry={entry}
          index={index}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export function workspaceDraftsPage(props: WorkspaceDraftMenuProps): MenuPageDefinition {
  return { id: WORKSPACE_DRAFTS_PAGE_ID, title: "Drafts", content: <DraftOptions {...props} /> };
}
