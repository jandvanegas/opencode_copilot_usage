/**
 * Shared Copilot usage helpers (used by the server plugin and the TUI sidebar plugin).
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const USER_ENDPOINT = "https://api.github.com/copilot_internal/user";
const BAR_WIDTH = 20;

export interface QuotaSnapshot {
	quota_id?: string;
	entitlement: number;
	remaining: number;
	percent_remaining: number;
	unlimited: boolean;
	overage_count?: number;
	overage_permitted?: boolean;
	credits_used?: number;
}

export interface CopilotUser {
	login?: string;
	copilot_plan?: string;
	quota_reset_date?: string;
	quota_snapshots?: Record<string, QuotaSnapshot>;
}

function authFilePath(): string {
	const dataHome =
		process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
	return join(dataHome, "opencode", "auth.json");
}

/** GitHub OAuth token: env override first, then opencode's auth.json. */
async function getToken(): Promise<string> {
	const fromEnv = process.env.COPILOT_USAGE_TOKEN;
	if (fromEnv) return fromEnv;

	let raw: string;
	try {
		raw = await readFile(authFilePath(), "utf8");
	} catch {
		throw new Error(
			`Cannot read ${authFilePath()}. Log in with \`opencode auth login\` (GitHub Copilot) or set COPILOT_USAGE_TOKEN.`,
		);
	}
	const entry = JSON.parse(raw)["github-copilot"] as
		| { refresh?: string; access?: string }
		| undefined;
	const token = entry?.refresh ?? entry?.access;
	if (!token) {
		throw new Error(
			"No github-copilot credentials in auth.json. Run `opencode auth login` and pick GitHub Copilot.",
		);
	}
	return token;
}

export async function fetchUsage(signal?: AbortSignal): Promise<CopilotUser> {
	const res = await fetch(USER_ENDPOINT, {
		signal,
		headers: {
			Authorization: `token ${await getToken()}`,
			Accept: "application/json",
			"User-Agent": "GitHubCopilotChat/0.26.7",
			"Editor-Version": "vscode/1.99.3",
			"Editor-Plugin-Version": "copilot-chat/0.26.7",
		},
	});
	if (!res.ok) {
		throw new Error(
			`GitHub API returned ${res.status} ${res.statusText}. The token may have expired; re-run \`opencode auth login\`.`,
		);
	}
	return (await res.json()) as CopilotUser;
}

const LABELS: Record<string, string> = {
	premium_interactions: "Premium requests",
	chat: "Chat",
	completions: "Completions",
};

function bar(pctUsed: number): string {
	const clamped = Math.max(0, Math.min(100, pctUsed));
	const filled = Math.round((clamped / 100) * BAR_WIDTH);
	return `[${"#".repeat(filled)}${"-".repeat(BAR_WIDTH - filled)}]`;
}

function fmt(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Used amount and percentage for a metered quota. `credits_used` is updated
 * live by GitHub, whereas `remaining` / `percent_remaining` lag behind, so
 * prefer it when present.
 */
export function quotaUsed(q: QuotaSnapshot): { used: number; pct: number } {
	const used =
		typeof q.credits_used === "number" && q.entitlement > 0
			? q.credits_used
			: q.entitlement - q.remaining;
	const pct =
		q.entitlement > 0
			? (used / q.entitlement) * 100
			: 100 - q.percent_remaining;
	return { used, pct: Math.max(0, Math.min(100, pct)) };
}

export function formatUsage(user: CopilotUser): string {
	const lines: string[] = [];
	const header = [
		"GitHub Copilot",
		user.copilot_plan ? `(${user.copilot_plan})` : "",
		user.login ? `- ${user.login}` : "",
	]
		.filter(Boolean)
		.join(" ");
	lines.push(header);

	const snapshots = Object.entries(user.quota_snapshots ?? {});
	if (snapshots.length === 0) {
		lines.push("No quota information returned for this account.");
	}

	// Metered quotas first, then the unlimited ones.
	snapshots.sort(([, a], [, b]) => Number(a.unlimited) - Number(b.unlimited));

	for (const [id, q] of snapshots) {
		const label = LABELS[id] ?? id;
		if (q.unlimited) {
			lines.push(`${label.padEnd(17)} unlimited`);
			continue;
		}
		const { used, pct: pctUsed } = quotaUsed(q);
		let line = `${label.padEnd(17)} ${bar(pctUsed)} ${pctUsed.toFixed(1)}% used  (${fmt(used)}/${fmt(q.entitlement)})`;
		if (q.overage_count && q.overage_count > 0) {
			line += `  overage: ${q.overage_count}`;
		}
		lines.push(line);
	}

	if (user.quota_reset_date) lines.push(`Resets: ${user.quota_reset_date}`);
	return lines.join("\n");
}
