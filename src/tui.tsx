/** @jsxImportSource @opentui/solid */
/**
 * Copilot usage display for opencode's TUI.
 *
 * Shows the premium-request quota used this billing period:
 *   - a full block (bar + percentage + reset date) in the right sidebar
 *   - a compact "Copilot 24.4%" label at the right of the prompt's bottom row
 * Refreshed at startup and after every response.
 *
 * Requires an entry in ~/.config/opencode/tui.json:
 *   "plugin": ["./tui-plugins/copilot-usage.tsx"]
 */

import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal, Show } from "solid-js";
import { fetchUsage, quotaUsed, type QuotaSnapshot } from "./core.ts";

/** Unlimited plans have no meaningful percentage, so show nothing for them. */
const metered = (q?: QuotaSnapshot) => (q && !q.unlimited ? q : undefined);

const MIN_REFRESH_MS = 5_000;
const BAR_WIDTH = 20;

type State =
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| {
			kind: "ok";
			plan?: string;
			reset?: string;
			premium?: QuotaSnapshot;
	  };

const tui: TuiPlugin = async (api) => {
	const [state, setState] = createSignal<State>({ kind: "loading" });

	let inflight = false;
	let lastFetch = 0;

	async function refresh(force = false) {
		if (inflight) return;
		if (!force && Date.now() - lastFetch < MIN_REFRESH_MS) return;
		inflight = true;
		lastFetch = Date.now();
		try {
			const user = await fetchUsage(api.lifecycle.signal);
			setState({
				kind: "ok",
				plan: user.copilot_plan,
				reset: user.quota_reset_date,
				premium: metered(user.quota_snapshots?.premium_interactions),
			});
		} catch (err) {
			// Keep showing the last good value if we have one.
			if (state().kind !== "ok") {
				setState({ kind: "error", message: (err as Error).message });
			}
		} finally {
			inflight = false;
		}
	}

	void refresh(true);

	// A response is finished when the session goes idle. opencode emits both
	// `session.status` (type "idle") and the deprecated `session.idle`; the
	// throttle in refresh() collapses them into one request.
	const offs = [
		api.event.on("session.status", (e) => {
			if (e.properties.status.type === "idle") void refresh();
		}),
		api.event.on("session.idle", () => void refresh()),
	];
	api.lifecycle.onDispose(() => offs.forEach((off) => off()));

	const theme = () => api.theme.current;
	const premium = () => {
		const s = state();
		return s.kind === "ok" ? s.premium : undefined;
	};
	const pctUsed = () => {
		const p = premium();
		return p ? quotaUsed(p).pct : 0;
	};
	const color = () =>
		pctUsed() >= 90
			? theme().error
			: pctUsed() >= 75
				? theme().warning
				: theme().textMuted;
	const bar = () => {
		const filled = Math.round((pctUsed() / 100) * BAR_WIDTH);
		return `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}`;
	};

	/** Full block for the right sidebar. */
	function SidebarView() {
		return (
			<box>
				<text fg={theme().text}>
					<b>Copilot</b>
				</text>
				<Show when={state().kind === "loading"}>
					<text fg={theme().textMuted}>loading…</text>
				</Show>
				<Show when={state().kind === "error"}>
					<text fg={theme().error}>usage unavailable</text>
				</Show>
				<Show when={premium()}>
					{(p) => (
						<>
							<text fg={color()}>{bar()}</text>
							<text fg={color()}>
								{pctUsed().toFixed(1)}% used ({quotaUsed(p()).used}/
								{p().entitlement})
							</text>
							<Show when={(state() as { reset?: string }).reset}>
								{(r) => <text fg={theme().textMuted}>resets {r()}</text>}
							</Show>
						</>
					)}
				</Show>
			</box>
		);
	}

	/** Compact "Copilot 24.4%" label at the right end of the prompt's bottom row. */
	function CompactView() {
		return (
			<Show when={premium()}>
				<text fg={color()} wrapMode="none">
					Copilot {pctUsed().toFixed(1)}%
				</text>
			</Show>
		);
	}

	api.slots.register({
		order: 150,
		slots: {
			sidebar_content() {
				return <SidebarView />;
			},
			session_prompt_right() {
				return <CompactView />;
			},
		},
	});
};

const plugin: TuiPluginModule & { id: string } = {
	id: "local.copilot-usage",
	tui,
};

export default plugin;
