import { expect, test } from "../support/fixtures";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import {
  expectComposerDraft,
  fillComposerDraft,
  openGithubPickerFromMenu,
} from "../support/helpers/composer";

test("GitHub attachment search reports failed requests and recovers without losing the draft", async ({
  page,
}) => {
  const workspace = await seedMockAgentWorkspace({
    repoPrefix: "forge-search-recovery-",
    title: "Review GitHub attachments",
  });
  try {
    await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
      const server = ws.connectToServer();
      server.onMessage((message) => ws.send(message));
      ws.onMessage((raw) => {
        const envelope = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
        const message = envelope.message;
        if (message?.type !== "forge.search.request" && message?.type !== "github_search_request") {
          server.send(raw);
          return;
        }
        const failed = message.query === "fail-search";
        ws.send(
          JSON.stringify({
            type: "session",
            message: {
              type:
                message.type === "forge.search.request"
                  ? "forge.search.response"
                  : "github_search_response",
              payload: {
                requestId: message.requestId,
                authState: "authenticated",
                error: failed ? "GitHub search is temporarily unavailable" : null,
                items:
                  failed || !message.query
                    ? []
                    : [
                        {
                          kind: "issue",
                          number: 42,
                          title: "Review order synchronization",
                          url: "https://github.com/example/test-fixture/issues/42",
                          state: "OPEN",
                          body: "Test fixture issue",
                          labels: [],
                        },
                      ],
              },
            },
          }),
        );
      });
    });
    await openAgentRoute(page, workspace);
    const draft = "Keep this draft while searching issues";
    await fillComposerDraft(page, draft);
    await openGithubPickerFromMenu(page);
    const search = page.getByPlaceholder("Search issues and PRs...");
    await search.fill("orders");
    const option = page.getByTestId("composer-github-option-issue:42");
    await expect(option).toBeVisible();
    await search.fill("fail-search");
    const error = page.getByText("GitHub search is temporarily unavailable", { exact: true });
    await expect(error).toBeVisible();
    await expect(option).toBeHidden();
    await expect(page.getByText("No results found", { exact: true })).toBeHidden();
    await search.fill("orders recovered");
    await expect(error).toBeHidden();
    await option.click();
    await expect(page.getByTestId("composer-github-attachment-pill")).toContainText(
      "Review order synchronization",
    );
    await expectComposerDraft(page, draft);
  } finally {
    await workspace.cleanup();
  }
});
