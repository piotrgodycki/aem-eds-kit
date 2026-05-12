import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { edsConfigSchema, type EdsConfig } from "./schemas.js";
import { logger } from "./logger.js";

const GLOBAL_CONFIG_DIR = path.join(homedir(), ".eds");
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "config.json");
const PROJECT_CONFIG_NAME = ".edsrc.json";

async function loadJsonFile(filePath: string): Promise<unknown> {
	try {
		const content = await readFile(filePath, "utf-8");
		return JSON.parse(content);
	} catch {
		return undefined;
	}
}

export async function loadConfig(projectRoot?: string): Promise<EdsConfig> {
	const globalRaw = await loadJsonFile(GLOBAL_CONFIG_PATH);
	const projectRaw = projectRoot
		? await loadJsonFile(path.join(projectRoot, PROJECT_CONFIG_NAME))
		: undefined;

	const merged = {
		...(typeof globalRaw === "object" && globalRaw !== null ? globalRaw : {}),
		...(typeof projectRaw === "object" && projectRaw !== null ? projectRaw : {}),
	};

	const result = edsConfigSchema.safeParse(merged);
	if (!result.success) {
		logger.debug("Config validation issues:", result.error.flatten());
		return edsConfigSchema.parse({});
	}

	return result.data;
}

export function globalConfigDir(): string {
	return GLOBAL_CONFIG_DIR;
}

export function globalConfigPath(): string {
	return GLOBAL_CONFIG_PATH;
}

export function globalConfigExists(): boolean {
	return existsSync(GLOBAL_CONFIG_PATH);
}
