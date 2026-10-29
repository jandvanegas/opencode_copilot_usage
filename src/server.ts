/**
 * GitHub Copilot usage plugin for opencode.
 *
 * Shows how much of your Copilot quota (premium requests / credits) has been
 * used this billing period.
 *
 * - Registers a `copilot_usage` tool the model can call.
 * - Registers a `/copilot-usage` slash command that calls it and prints the
 *   result.
 *
 * Auth: reuses the GitHub OAuth token opencode already stored when you logged
 * in to the `github-copilot` provider (auth.json). Nothing extra to configure.
 *
 */

// Type-only imports: they are erased at runtime, so this package needs no
// dependencies of its own (opencode's `tool()` helper is an identity function).
import type { Plugin, PluginModule, ToolDefinition } from "@opencode-ai/plugin";
import { fetchUsage, formatUsage } from "./core.ts";

const server: Plugin = async () => {
	return {
		config: (cfg) => {
			cfg.command ??= {};
			cfg.command["copilot-usage"] = {
				description: "Show GitHub Copilot usage percentage",
				template:
					"Call the `copilot_usage` tool and reply with its output exactly as returned, in a code block. Add nothing else.",
			};
		},
		tool: {
			copilot_usage: {
				description:
					"Get the percentage of the GitHub Copilot subscription quota used in the current billing period.",
				args: {},
				async execute(_args, ctx) {
					try {
						return formatUsage(await fetchUsage(ctx.abort));
					} catch (err) {
						return `Failed to fetch Copilot usage: ${(err as Error).message}`;
					}
				},
			} satisfies ToolDefinition,
		},
	};
};

const plugin: PluginModule & { id: string } = {
	id: "copilot-usage",
	server,
};

export default plugin;
