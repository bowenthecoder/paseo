import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "../support/fixtures";
import {
  cleanupRewindFlow,
  launchAgent,
  sendMessage,
  type AgentHandle,
  type RewindFlowProvider,
} from "../support/helpers/rewind-flow";
import { openSubagentsTrack } from "../support/helpers/subagents";

// Bowen's acceptance check for subagents: one chat launches twelve background children, ends
// its turn, and must come back on its own when they finish, the way the Claude Code CLI does.
// Every child must be listed in the Tasks list and readable when clicked.
const FANOUT = 12;

interface FanoutCase {
  provider: RewindFlowProvider;
  providerId?: string;
  providerConfig?: Parameters<typeof launchAgent>[0]["providerConfig"];
  prompt: string;
}

const cases: FanoutCase[] = [
  {
    provider: "claude",
    providerConfig: { model: "sonnet" },
    prompt: [
      `Launch ${FANOUT} background subagents with Claude Code's native Agent tool: call the tool ${FANOUT} times in one go, each with run_in_background true, subagent_type "general-purpose", name "fanout_child_N" and the prompt "Run the shell command sleep 25, then reply with exactly FANOUT_CHILD_N and nothing else", for N from 1 to ${FANOUT}.`,
      "Do not wait, poll, sleep or read any files yourself. As soon as all launches are made, end your turn with exactly FANOUT_LAUNCHED and nothing else.",
      `Later, when the notifications for all ${FANOUT} children have arrived, reply with exactly FANOUT_DONE and nothing else. Do not use Paseo tools.`,
    ].join(" "),
  },
  {
    provider: "codex",
    // Codex 1 is the Subscriptions account; the plain "codex" provider is disabled on this host.
    providerId: "codex-a",
    providerConfig: {
      model: "gpt-5.6-sol",
      providerOptions: { features: { multi_agent_v2: true } },
    },
    prompt: [
      `Use the native collaboration.spawn_agent tool ${FANOUT} times, with task_name "fanout_child_N" and fork_turns "none", asking each child to run the shell command sleep 25 and then reply with exactly FANOUT_CHILD_N and nothing else, for N from 1 to ${FANOUT}.`,
      "Launch as many as the native concurrency limit permits. If capacity is full, end the turn and resume launching the remaining numbered children when completion notifications arrive. Do not stop after the first batch: exactly twelve unique children must run. Never recreate a completed child. Once all twelve launches are made, end your turn with exactly FANOUT_LAUNCHED and nothing else.",
      `When all ${FANOUT} children have finished, reply with exactly FANOUT_DONE and nothing else. Do not use Paseo tools.`,
    ].join(" "),
  },
];

test.use({ e2eForkProviders: ["claude", "codex-a"] });

test.describe("real background command", () => {
  test.setTimeout(600_000);

  // The other way a chat looks stopped: it ended its turn while a background shell command was
  // still running. The Tasks pill must say a task is running, and the chat must wake up by itself
  // when the command settles.
  test("claude: a background command keeps the chat visibly waiting and wakes it when done", async ({
    page,
  }, testInfo) => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "paseo-background-command-")));
    let handle: AgentHandle | undefined;
    try {
      handle = await launchAgent({
        page,
        provider: "claude",
        cwd,
        mode: "full-access",
        providerConfig: { model: "sonnet" },
      });
      await sendMessage(
        handle,
        [
          'Run the shell command sleep 45 with Claude Code\'s Bash tool in the background (run_in_background true), with the description "Sleep for the background command check".',
          "Do not wait for it, poll it, or read any files. As soon as it is started, end your turn with exactly SHELL_STARTED and nothing else.",
          "When its completion notification arrives, reply with exactly SHELL_DONE and nothing else. Do not use Paseo tools.",
        ].join(" "),
      );
      const header = page.getByTestId("subagents-track-header");
      await expect(header).toBeVisible({ timeout: 30_000 });
      await expect(header).toContainText(/running task/i, { timeout: 30_000 });
      await openSubagentsTrack(page);
      const rows = page.locator('[data-testid^="subagents-track-row-"]');
      await expect(rows).toHaveCount(1, { timeout: 30_000 });
      await expect(rows.first()).toContainText(/background command/i);
      const shot = testInfo.outputPath("claude-background-command-waiting.png");
      await page.screenshot({ path: shot });
      await testInfo.attach("claude background command waiting", {
        path: shot,
        contentType: "image/png",
      });

      // Nobody types anything: the command settles, the row leaves, the chat comes back.
      await expect(page.getByText("SHELL_DONE", { exact: true }).last()).toBeVisible({
        timeout: 300_000,
      });
      await expect(rows).toHaveCount(0, { timeout: 30_000 });
      const finish = await handle.client.waitForFinish(handle.agentId, 120_000);
      expect(finish.status).toBe("idle");
      await expect(
        page
          .getByTestId("tool-call-group")
          .filter({ visible: true })
          .filter({ hasText: /\b(?:tools?|commands?) running\b/i }),
      ).toHaveCount(0, { timeout: 30_000 });
    } finally {
      await cleanupRewindFlow({ handle, cwd });
    }
  });
});

test.describe("real subagent fan-out", () => {
  test.setTimeout(1_200_000);

  for (const scenario of cases) {
    test(`${scenario.provider}: the parent resumes by itself after ${FANOUT} background subagents finish`, async ({
      page,
    }, testInfo) => {
      const cwd = realpathSync(
        mkdtempSync(path.join(tmpdir(), `paseo-fanout-${scenario.provider}-`)),
      );
      let handle: AgentHandle | undefined;
      const shot = async (name: string) => {
        const file = testInfo.outputPath(`${scenario.provider}-${name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        await testInfo.attach(`${scenario.provider} ${name}`, {
          path: file,
          contentType: "image/png",
        });
      };
      try {
        handle = await launchAgent({
          page,
          provider: scenario.provider,
          providerId: scenario.providerId,
          cwd,
          mode: "full-access",
          providerConfig: scenario.providerConfig,
        });
        // sendMessage returns once the parent is idle: its launch turn has ended while the
        // children are still sleeping.
        await sendMessage(handle, scenario.prompt);
        const header = page.getByTestId("subagents-track-header");
        await expect(header).toBeVisible({ timeout: 60_000 });
        const pillAtIdle = (await header.textContent()) ?? "";
        await openSubagentsTrack(page);
        const rows = page.locator('[data-testid^="subagents-track-row-"]');
        await expect(rows).toHaveCount(FANOUT, { timeout: 600_000 });
        await shot("launched");
        testInfo.annotations.push({ type: "pill while parent idle", description: pillAtIdle });

        // Nobody types anything from here on: the parent must continue on its own.
        await expect(page.getByText("FANOUT_DONE", { exact: true }).last()).toBeVisible({
          timeout: 900_000,
        });
        await shot("done");
        const finish = await handle.client.waitForFinish(handle.agentId, 120_000);
        expect(finish.status).toBe("idle");
        await expect(
          page
            .getByTestId("tool-call-group")
            .filter({ visible: true })
            .filter({ hasText: /\b(?:tools?|commands?) running\b/i }),
        ).toHaveCount(0, { timeout: 30_000 });

        await openSubagentsTrack(page);
        await expect(rows).toHaveCount(FANOUT);
        const childOutputs = new Set<string>();
        for (let index = 0; index < FANOUT; index += 1) {
          await openSubagentsTrack(page);
          await rows.nth(index).click();
          // Each click opens another child view beside the earlier ones; read the newest.
          const panel = page.getByTestId("provider-subagent-panel").filter({ visible: true });
          await expect(panel).toBeVisible({ timeout: 30_000 });
          const output = panel
            .getByTestId("assistant-message")
            .getByText(/^FANOUT_CHILD_\d+$/)
            .last();
          await expect(output).toBeVisible({ timeout: 60_000 });
          childOutputs.add((await output.textContent())!.trim());
        }
        expect(childOutputs).toEqual(
          new Set(Array.from({ length: FANOUT }, (_, i) => `FANOUT_CHILD_${i + 1}`)),
        );
        await shot("child-view");

        // The transcript's own Task cards link to the same views: expand the grouped launch
        // line, then open the first child from its card.
        const group = page
          .getByTestId("tool-call-group")
          .filter({ hasText: /subagent/i })
          .first();
        await expect(group).toBeVisible({ timeout: 30_000 });
        await group.click();
        const cardLink = page.getByTestId("tool-call-open-subagent").first();
        await expect(cardLink).toBeVisible({ timeout: 30_000 });
        const viewsBefore = await page.getByTestId("provider-subagent-panel").count();
        await cardLink.click();
        await expect
          .poll(async () => page.getByTestId("provider-subagent-panel").count(), {
            timeout: 30_000,
          })
          .toBeGreaterThanOrEqual(viewsBefore);
        await expect(
          page
            .getByTestId("provider-subagent-panel")
            .filter({ visible: true })
            .getByTestId("assistant-message")
            .getByText(/^FANOUT_CHILD_\d+$/)
            .first(),
        ).toBeVisible({ timeout: 60_000 });
        await shot("card-link");
      } finally {
        await cleanupRewindFlow({ handle, cwd });
      }
    });
  }
});
