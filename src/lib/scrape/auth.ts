/**
 * Saved browser sessions for scraping **gated** design sources (e.g. Google
 * Stitch, private Framer). A Playwright `storageState` (cookies + localStorage)
 * is captured once via a headed login, then reused for headless scrapes.
 *
 * The state contains live session cookies — treat it as a **secret**: it lives
 * under `~/.eds/auth/` (never the repo), the directory is `0700` and the file is
 * `0600`, owner-only.
 */

import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { DesignProvider } from "../figma/prompt-builder.js";

/** Path to the saved session for a provider: `~/.eds/auth/<provider>.json`. */
export function authStatePath(provider: DesignProvider): string {
	return path.join(homedir(), ".eds", "auth", `${provider}.json`);
}

/** True when a session has already been captured for this provider. */
export function hasAuthState(provider: DesignProvider): boolean {
	return existsSync(authStatePath(provider));
}

/** Ensure the owner-only auth directory exists before a state file is written. */
export async function ensureAuthDir(statePath: string): Promise<void> {
	await mkdir(path.dirname(statePath), { recursive: true, mode: 0o700 });
}

/** Lock the saved session down to owner read/write (best-effort). */
export async function secureAuthFile(statePath: string): Promise<void> {
	try {
		await chmod(statePath, 0o600);
	} catch {
		// non-POSIX filesystems may not support chmod — ignore
	}
}
