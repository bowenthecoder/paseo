import { z } from "zod";
import { GrokSubagentAdapter } from "./grok-subagents.js";
import { GenericACPAgentClient, type GenericACPAgentClientOptions } from "./generic-acp-agent.js";
import type { AgentModelDefinition } from "../agent-sdk-types.js";

const GrokModelMetaSchema = z.object({
  totalContextTokens: z.number().positive().optional(),
  reasoningEffort: z.string().optional(),
  reasoningEfforts: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().optional(),
        default: z.boolean().optional(),
      }),
    )
    .optional(),
});

export function mapGrokModels(models: AgentModelDefinition[]): AgentModelDefinition[] {
  return models.map((model) => {
    const parsed = GrokModelMetaSchema.safeParse(model.metadata);
    if (!parsed.success) return model;
    const meta = parsed.data;
    const thinkingOptions = meta.reasoningEfforts?.map((effort) => ({
      id: effort.id,
      label:
        effort.id === "xhigh"
          ? "Extra high"
          : effort.id.charAt(0).toUpperCase() + effort.id.slice(1),
      description: effort.description,
      isDefault: effort.default === true,
    }));
    return {
      ...model,
      contextWindowMaxTokens: meta.totalContextTokens,
      thinkingOptions,
      defaultThinkingOptionId:
        meta.reasoningEffort ?? thinkingOptions?.find((option) => option.isDefault)?.id,
    };
  });
}

export class GrokACPAgentClient extends GenericACPAgentClient {
  constructor(options: GenericACPAgentClientOptions) {
    super({
      ...options,
      modelTransformer: mapGrokModels,
      notificationAdapterFactory: () => new GrokSubagentAdapter(),
      // Grok Build 1.0 exposes effort via model metadata and set_model, rather than
      // the standard ACP thought_level selector. Use its session-scoped writer.
      thinkingOptionWriter: async (connection, sessionId, thinkingOptionId, modelId) => {
        if (!modelId) throw new Error("Choose a Grok model before setting effort");
        await connection.unstable_setSessionModel({
          sessionId,
          modelId,
          _meta: { reasoningEffort: thinkingOptionId },
        });
      },
    });
  }
}
