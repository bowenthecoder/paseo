import { expect, test } from "../support/fixtures";
import { submitMessage } from "../support/helpers/composer";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { choosePermissionAction, expectPermissionActions } from "../support/helpers/permissions";
import { seedWorkspace } from "../support/helpers/seed-client";
import { agentPanel } from "../support/helpers/workspace-tabs";

test.use({ e2eForkProviders: ["grok"] });

// Grok asks the client to approve a plan through its own protocol extension; before Paseo
// answered it, the exit tool failed with "client disconnected" and plan mode stayed on.
test("Grok's plan approval shows the plan and approving it lets Grok leave plan mode", async ({
  page,
}, testInfo) => {
  test.setTimeout(600_000);
  const workspace = await seedWorkspace({
    repoPrefix: "grok-plan-approval-",
    repo: { files: [{ path: "README.md", content: "# probe\n" }] },
  });
  try {
    const agent = await workspace.client.createAgent({
      provider: "grok",
      model: "grok-4.6",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title: "Grok plan approval",
    });
    await openAgentRoute(page, { workspaceId: workspace.workspaceId, agentId: agent.id });
    await expect(agentPanel(page, agent.id)).toBeVisible();
    await submitMessage(
      page,
      "Use your enter_plan_mode tool, write a one-line plan to add a CONTRIBUTING.md file into the plan file, then call exit_plan_mode so I can approve it. Do not implement anything. Once the plan is approved, reply with exactly PLAN_APPROVED_OK and stop.",
    );

    await expectPermissionActions(page, ["Approve plan", "Request changes", "Abandon plan"]);
    await expect(page.getByText(/CONTRIBUTING/).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("grok-plan-approval.png") });
    await choosePermissionAction(page, "Approve plan");

    const finish = await workspace.client.waitForFinish(agent.id, 300_000);
    expect(finish.status).toBe("idle");
    expect(finish.final?.lastError).toBeFalsy();
    await expect(
      agentPanel(page, agent.id).getByText("PLAN_APPROVED_OK", { exact: true }).last(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Tool call failed", { exact: true })).toHaveCount(0);
  } finally {
    await workspace.cleanup();
  }
});
