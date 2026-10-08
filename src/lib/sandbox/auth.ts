import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * GitHub authentication for the sandbox, without depending on the `gh` CLI:
 * an OAuth Device Flow (browser authorize) plus a stored/`env` token fallback.
 */

const CONFIG_DIR = path.join(os.homedir(), ".eds");
const TOKEN_FILE = path.join(CONFIG_DIR, "github.json");

/**
 * OAuth App client id for the Device Flow. Register a GitHub OAuth App once and
 * set it here or via EDS_GITHUB_CLIENT_ID; without it, use a token (PAT) instead.
 */
export const CLIENT_ID = process.env.EDS_GITHUB_CLIENT_ID ?? "";

/** Resolve a GitHub token: env first, then the stored one. */
export async function getToken(): Promise<string | null> {
	const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (env) return env;
	if (existsSync(TOKEN_FILE)) {
		try {
			return JSON.parse(await readFile(TOKEN_FILE, "utf-8")).token ?? null;
		} catch {
			return null;
		}
	}
	return null;
}

export async function saveToken(token: string): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
	// Owner-only permissions - the token is a credential.
	await writeFile(TOKEN_FILE, `${JSON.stringify({ token }, null, 2)}\n`, { mode: 0o600 });
}

export async function clearToken(): Promise<void> {
	if (existsSync(TOKEN_FILE)) await rm(TOKEN_FILE);
}

export interface DeviceCode {
	device_code: string;
	user_code: string;
	verification_uri: string;
	interval: number;
	expires_in: number;
}

/** Start the OAuth Device Flow - returns the code the user types in the browser. */
export async function startDeviceFlow(scopes: string[]): Promise<DeviceCode> {
	const res = await fetch("https://github.com/login/device/code", {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify({ client_id: CLIENT_ID, scope: scopes.join(" ") }),
	});
	if (!res.ok) throw new Error(`device code request failed: ${res.status}`);
	return (await res.json()) as DeviceCode;
}

/** Poll for the access token after the user authorizes. Resolves with the token. */
export async function pollDeviceToken(
	deviceCode: string,
	interval: number,
	expiresIn: number,
): Promise<string> {
	let wait = Math.max(interval, 1);
	const deadline = Date.now() + expiresIn * 1000;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, wait * 1000));
		const res = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: { Accept: "application/json", "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: CLIENT_ID,
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}),
		});
		const data = (await res.json()) as { access_token?: string; error?: string };
		if (data.access_token) return data.access_token;
		if (data.error === "slow_down") wait += 5;
		else if (data.error !== "authorization_pending") {
			throw new Error(data.error ?? "device flow failed");
		}
	}
	throw new Error("device flow timed out");
}
