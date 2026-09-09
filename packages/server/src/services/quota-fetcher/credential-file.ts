import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type CredentialFileReader = (file: string) => Promise<unknown | null>;

export const readCredentialFile: CredentialFileReader = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
};

export function expandCredentialHome(home: string): string {
  if (home === "~") return homedir();
  if (home.startsWith("~/")) return join(homedir(), home.slice(2));
  return home;
}
