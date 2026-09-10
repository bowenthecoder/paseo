import { seedWorkspace } from "./seed-client";

/** Two independent conversations may share one working folder and workspace. */
export async function seedSidebarChats(titles: string[], repoPrefix = "sidebar-chats-") {
  const workspace = await seedWorkspace({ repoPrefix });
  try {
    const agents = [];
    for (const title of titles)
      agents.push(
        await workspace.client.createAgent({
          provider: "mock",
          cwd: workspace.repoPath,
          workspaceId: workspace.workspaceId,
          title,
          modeId: "load-test",
          model: "e2e-fast-stream",
        }),
      );
    return { ...workspace, agents };
  } catch (error) {
    await workspace.cleanup();
    throw error;
  }
}
