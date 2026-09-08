import { expect, test } from "vitest";
import { mapGrokModels } from "./grok-acp-agent.js";

test("Grok model metadata supplies effort choices and capacity without inventing Fast", () => {
  const [model] = mapGrokModels([
    {
      provider: "grok",
      id: "grok-4.6",
      label: "Grok 4.6",
      metadata: {
        totalContextTokens: 500000,
        reasoningEffort: "high",
        reasoningEfforts: ["low", "medium", "high", "xhigh"].map((id) => ({
          id,
          label: id,
          default: id === "high",
        })),
      },
    },
  ]);
  expect(model.contextWindowMaxTokens).toBe(500000);
  expect(model.thinkingOptions?.map((option) => option.label)).toEqual([
    "Low",
    "Medium",
    "High",
    "Extra high",
  ]);
  expect(model.defaultThinkingOptionId).toBe("high");
});

test("models without reported effort do not acquire invented controls", () => {
  const [model] = mapGrokModels([{ provider: "grok", id: "custom", label: "Custom" }]);
  expect(model.thinkingOptions).toBeUndefined();
});
