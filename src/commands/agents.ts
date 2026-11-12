import chalk from "chalk";
import { listAgentStatus } from "../lib/agents/detect.js";
import { events } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import * as ui from "../lib/ui.js";

/** `eds agents`: which agents eds can drive here, and how to install or sign in to the rest. */
export async function agents(): Promise<void> {
	const list = await listAgentStatus();
	events.emit({ type: "agents", agents: list });
	const ready = list.filter((a) => a.ready).length;
	logger.info(ui.heading("Agents", `${ready} of ${list.length} ready`));
	const w = ui.columnWidth(list.map((a) => a.name));
	for (const a of list) {
		const state = !a.installed
			? chalk.dim("not installed")
			: a.ready
				? `ready${a.model ? ` · ${a.model}` : ""}${a.figmaMcp ? " · Figma MCP" : ""}${a.confined ? "" : " · can read outside the project"}`
				: "installed, not signed in";
		logger.info(ui.statusLine(a.ready ? "pass" : a.installed ? "warn" : "info", a.name, state, w));
		if (!a.installed) logger.info(chalk.dim(`      ${a.install}`));
		else if (!a.ready) logger.info(chalk.dim(`      ${a.signIn}`));
	}
	if (!ready)
		logger.info(
			chalk.dim(
				"\n  eds needs one of these to generate blocks; your account is enough, no API key.",
			),
		);
}
