import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAN_APPROVAL_ACTIONS,
  grokPlanFilePath,
  parsePlanApprovalExtRequest,
  resolvePlanApprovalResponse,
  toolNameFromACPTitle,
} from "./acp-plan-approval.js";

describe("Grok plan approval extension", () => {
  it("parses the request and tolerates missing content", () => {
    expect(
      parsePlanApprovalExtRequest({
        sessionId: "session-1",
        toolCallId: "call-1",
        planContent: null,
      }),
    ).toEqual({ sessionId: "session-1", toolCallId: "call-1", planContent: null });
    expect(parsePlanApprovalExtRequest({ planContent: "# Plan" })).toEqual({
      sessionId: null,
      toolCallId: null,
      planContent: "# Plan",
    });
  });

  it("answers in the shape Grok expects", () => {
    expect(resolvePlanApprovalResponse({ behavior: "allow" })).toEqual({
      outcome: "approved",
      feedback: null,
    });
    expect(
      resolvePlanApprovalResponse({
        behavior: "deny",
        selectedActionId: "reject",
        message: "Add a testing step. ",
      }),
    ).toEqual({ outcome: "rejected", feedback: "Add a testing step." });
    expect(resolvePlanApprovalResponse({ behavior: "deny", selectedActionId: "abandon" })).toEqual({
      outcome: "abandoned",
      feedback: null,
    });
    expect(resolvePlanApprovalResponse({ behavior: "deny", message: "   " })).toEqual({
      outcome: "rejected",
      feedback: null,
    });
    expect(PLAN_APPROVAL_ACTIONS.map((action) => action.id)).toEqual([
      "reject",
      "abandon",
      "approve",
    ]);
  });

  it("locates Grok's plan file for a session", () => {
    // Joined with the platform separator: Windows runs Grok from its own home directory too.
    expect(grokPlanFilePath("/Users/bowen", "/var/folders/tmp/probe", "01a0-session")).toBe(
      path.join(
        "/Users/bowen",
        ".grok",
        "sessions",
        "%2Fvar%2Ffolders%2Ftmp%2Fprobe",
        "01a0-session",
        "plan.md",
      ),
    );
  });

  it("names an untyped tool from its title", () => {
    expect(toolNameFromACPTitle('Search tools: "paseo chrome evaluate"')).toBe("Search tools");
    expect(toolNameFromACPTitle("List `/tmp/project`")).toBe("List");
    expect(toolNameFromACPTitle("Plan: Exit")).toBe("Plan");
    expect(toolNameFromACPTitle("enter_plan_mode")).toBe("enter_plan_mode");
    expect(toolNameFromACPTitle("  ")).toBe("");
  });
});
