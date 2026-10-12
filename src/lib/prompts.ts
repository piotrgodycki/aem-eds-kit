/**
 * Thin wrapper around `@inquirer/prompts` that injects the shared brand theme
 * (a `>_` prefix matching the logo) into every prompt. Import this instead of
 * `@inquirer/prompts` so all interactive prompts look consistent; a caller can
 * still pass its own `theme` to override.
 */

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

export const select: typeof _select = (config, context) => _select(withTheme(config), context);
export const input: typeof _input = (config, context) => _input(withTheme(config), context);
export const confirm: typeof _confirm = (config, context) => _confirm(withTheme(config), context);
export const checkbox: typeof _checkbox = (config, context) =>
	_checkbox(withTheme(config), context);
