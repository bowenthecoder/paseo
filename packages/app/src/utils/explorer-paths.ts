import { isAbsolutePath } from "./path";

interface BuildAbsoluteExplorerPathInput {
  workspaceRoot: string;
  entryPath: string;
}

export function buildAbsoluteExplorerPath({
  workspaceRoot,
  entryPath,
}: BuildAbsoluteExplorerPathInput): string {
  const trimmedRoot = workspaceRoot.trim();
  let normalizedWorkspaceRoot = trimmedRoot.replace(/[\\/]+$/, "");
  if (/^\/+$/u.test(trimmedRoot)) normalizedWorkspaceRoot = "/";
  else if (/^[A-Za-z]:[\\/]$/u.test(trimmedRoot)) normalizedWorkspaceRoot = trimmedRoot;
  const normalizedEntryPath = entryPath.trim();

  if (!normalizedWorkspaceRoot) {
    return normalizedEntryPath;
  }

  if (!normalizedEntryPath || normalizedEntryPath === ".") {
    return normalizedWorkspaceRoot;
  }

  if (isAbsolutePath(normalizedEntryPath)) {
    return normalizedEntryPath;
  }

  const separator = normalizedWorkspaceRoot.includes("\\") ? "\\" : "/";
  const segments = normalizedEntryPath.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) {
    return normalizedWorkspaceRoot;
  }

  const prefix = normalizedWorkspaceRoot.endsWith(separator)
    ? normalizedWorkspaceRoot
    : `${normalizedWorkspaceRoot}${separator}`;
  return `${prefix}${segments.join(separator)}`;
}

export function parentExplorerPath(entryPath: string): string {
  const separatorIndex = entryPath.lastIndexOf("/");
  return separatorIndex > 0 ? entryPath.slice(0, separatorIndex) : ".";
}
