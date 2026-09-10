import { buildAbsoluteExplorerPath } from "@/utils/explorer-paths";

export function normalizeExplorerBrowsePath(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  if (/^\/+$/u.test(normalized)) return "/";
  if (/^[A-Za-z]:\/*$/u.test(normalized)) return `${normalized.slice(0, 2)}/`;
  return normalized.replace(/\/+$/, "");
}

/** Derive the connected host's root, including Windows shares, from its own path. */
export function explorerFilesystemRoot(path: string): string | null {
  const normalized = normalizeExplorerBrowsePath(path);
  const share = /^(\/\/[^/]+\/[^/]+)/u.exec(normalized)?.[1];
  if (share) return share;
  if (normalized.startsWith("/")) return "/";
  const drive = /^([A-Za-z]:)\//u.exec(normalized)?.[1];
  return drive ? `${drive}/` : null;
}

export function explorerParentDirectory(path: string): string | null {
  const normalized = normalizeExplorerBrowsePath(path);
  const root = explorerFilesystemRoot(normalized);
  if (normalized === root || normalized === "~" || !normalized) return null;
  const separator = normalized.lastIndexOf("/");
  if (separator < 0) return null;
  const parent = normalized.slice(0, separator);
  return root && parent.length < root.length ? root : parent || null;
}

/** Preserve workspace-relative targets; a different browsing root needs a host path. */
export function explorerFileOpenPath(input: {
  path: string;
  browsingRoot: string;
  workspaceRoot: string;
}): string {
  const browsingRoot = normalizeExplorerBrowsePath(input.browsingRoot);
  const workspaceRoot = normalizeExplorerBrowsePath(input.workspaceRoot);
  return browsingRoot === workspaceRoot
    ? input.path
    : buildAbsoluteExplorerPath({ workspaceRoot: browsingRoot, entryPath: input.path });
}
