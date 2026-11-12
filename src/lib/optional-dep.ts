import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Load an optional dependency (Playwright, pngjs, pixelmatch). The CLI is often
 * installed globally, so it also looks in the user's project, where they ran
 * `npm i -D playwright`. Returns undefined when neither has it.
 */
export async function loadOptional<T>(
	name: string,
	projectRoot = process.cwd(),
): Promise<T | undefined> {
	try {
		return (await import(name)) as T;
	} catch {
		// not next to the CLI: try the project
	}
	try {
		const require = createRequire(pathToFileURL(path.join(projectRoot, "package.json")).href);
		return (await import(pathToFileURL(require.resolve(name)).href)) as T;
	} catch {
		return undefined;
	}
}
