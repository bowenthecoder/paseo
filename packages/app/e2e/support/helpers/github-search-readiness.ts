import { execFileSync } from "node:child_process";
import { expect } from "@playwright/test";
import type { GhIssueFixture } from "./github-fixtures";

/** Wait for the same GitHub search used by the picker to expose a newly seeded item. */
export async function waitForGithubSearchFixture(input: {
  cwd: string;
  kind: "issue" | "pr";
  query: string;
  expected: Pick<GhIssueFixture, "number" | "title" | "url">;
}): Promise<void> {
  await expect(async () => {
    const stdout = execFileSync(
      "gh",
      [input.kind, "list", "--search", input.query, "--json", "number,title,url", "--limit", "20"],
      {
        cwd: input.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 8_000,
      },
    );
    expect(
      JSON.parse(stdout),
      `GitHub ${input.kind} search must return the exact fixture before opening the picker`,
    ).toContainEqual({
      number: input.expected.number,
      title: input.expected.title,
      url: input.expected.url,
    });
  }).toPass({ timeout: 45_000, intervals: [1_000, 2_000, 4_000] });
}
