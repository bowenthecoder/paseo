import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import { resolveClientSlashCommand, resolvePlanModeToggle } from "./index";

function agentWith(overrides: Partial<Agent>): Agent {
  return {
    id: "agent-1",
    provider: "claude",
    cwd: "/repo",
    currentModeId: "auto",
    availableModes: [],
    ...overrides,
  } as Agent;
}

describe("/plan", () => {
  it("is a client command with its aliases, and /reset starts a fresh draft", () => {
    expect(resolveClientSlashCommand({ text: "/plan", hasAttachments: false })?.kind).toBe(
      "toggle-plan-mode",
    );
    expect(resolveClientSlashCommand({ text: "/planmode", hasAttachments: false })?.kind).toBe(
      "toggle-plan-mode",
    );
    expect(resolveClientSlashCommand({ text: "/reset", hasAttachments: false })?.kind).toBe(
      "replace-agent-with-draft",
    );
  });

  it("enters and leaves a planning mode for providers that have one", () => {
    const modes = [
      { id: "auto", label: "Auto", colorTier: "moderate" as const },
      { id: "plan", label: "Plan", colorTier: "planning" as const },
    ];
    expect(
      resolvePlanModeToggle(agentWith({ availableModes: modes as Agent["availableModes"] })),
    ).toEqual({
      kind: "mode",
      modeId: "plan",
      entering: true,
    });
    expect(
      resolvePlanModeToggle(
        agentWith({ availableModes: modes as Agent["availableModes"], currentModeId: "plan" }),
      ),
    ).toEqual({ kind: "mode", modeId: "auto", entering: false });
  });

  it("flips the plan feature for providers that expose one, and reports none otherwise", () => {
    expect(
      resolvePlanModeToggle(
        agentWith({
          provider: "codex",
          features: [{ id: "plan_mode", type: "toggle", label: "Plan mode", value: false }],
        } as Partial<Agent>),
      ),
    ).toEqual({ kind: "feature", featureId: "plan_mode", value: true });
    expect(resolvePlanModeToggle(agentWith({ provider: "grok" }))).toBeNull();
  });
});
