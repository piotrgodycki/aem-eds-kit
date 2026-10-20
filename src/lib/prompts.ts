/**
 * Thin wrapper around `@inquirer/prompts` that injects the shared brand theme
 * (a `>_` prefix matching the logo) into every prompt. Import this instead of
 * `@inquirer/prompts` so all interactive prompts look consistent; a caller can
 * still pass its own `theme` to override.
 *
 * Every prompt also cancels on **Esc** (it rejects with an `AbortPromptError`):
 * the menu uses that to go back. Ctrl+C still rejects with `ExitPromptError`.
 */

import { emitKeypressEvents } from "node:readline";
import {
	checkbox as _checkbox,
	confirm as _confirm,
	input as _input,
	select as _select,
} from "@inquirer/prompts";
import { promptTheme } from "./ui.js";

function withTheme<C extends { theme?: object }>(config: C): C {
	const theme = { ...promptTheme, ...((config.theme as object) ?? {}) };
	return { ...config, theme } as C;
}

type Context = { signal?: AbortSignal } & Record<string, unknown>;

/** Run a prompt that Esc cancels (TTY only), on top of any caller signal. */
function cancelOnEsc<R>(run: (context: Context) => R, context?: Context): R {
	const stdin = process.stdin;
	if (!stdin.isTTY) return run(context ?? {});
	const ac = new AbortController();
	context?.signal?.addEventListener("abort", () => ac.abort(), { once: true });
	emitKeypressEvents(stdin);
	const onKey = (_s: string, key?: { name?: string }) => {
		if (key?.name === "escape") ac.abort();
	};
	stdin.on("keypress", onKey);
	const prompt = run({ ...context, signal: ac.signal });
	void Promise.resolve(prompt)
		.catch(() => {})
		.finally(() => stdin.off("keypress", onKey));
	return prompt;
}

/** True when a prompt was cancelled with Esc. */
export function isEscape(err: unknown): boolean {
	return err instanceof Error && err.name === "AbortPromptError";
}

/** True when the user pressed Ctrl+C in a prompt. */
export function isExit(err: unknown): boolean {
	return err instanceof Error && err.name === "ExitPromptError";
}

export const select: typeof _select = (config, context) =>
	cancelOnEsc((c) => _select(withTheme(config), c), context as Context);
export const input: typeof _input = (config, context) =>
	cancelOnEsc((c) => _input(withTheme(config), c), context as Context);
export const confirm: typeof _confirm = (config, context) =>
	cancelOnEsc((c) => _confirm(withTheme(config), c), context as Context);
export const checkbox: typeof _checkbox = (config, context) =>
	cancelOnEsc((c) => _checkbox(withTheme(config), c), context as Context);
