import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export type AuthoringModel = "da" | "gdrive" | "sharepoint" | "document" | "ue";

export interface DetectedAuthoring {
	model: AuthoringModel;
	org?: string;
	site?: string;
	mountpoint?: string;
}

/**
 * Infer the authoring model from the project: the `fstab.yaml` mountpoint tells
 * document models apart (DA / Google Drive / SharePoint), and a missing fstab
 * with crosswalk config points at Universal Editor.
 */
export async function detectAuthoring(projectRoot: string): Promise<DetectedAuthoring> {
	const fstab = path.join(projectRoot, "fstab.yaml");
	if (existsSync(fstab)) {
		try {
			const parsed = parseYaml(await readFile(fstab, "utf-8")) ?? {};
			const mp = parsed.mountpoints?.["/"];
			const url = typeof mp === "string" ? mp : (mp?.url ?? "");
			const da = url.match(/content\.da\.live\/([^/]+)\/([^/]+)/);
			if (da) return { model: "da", org: da[1], site: da[2], mountpoint: url };
			if (/drive\.google\.com/.test(url)) return { model: "gdrive", mountpoint: url };
			if (/sharepoint\.com|-my\.sharepoint/.test(url))
				return { model: "sharepoint", mountpoint: url };
			return { model: "document", mountpoint: url };
		} catch {
			// fall through
		}
	}
	// No fstab: crosswalk / Universal Editor projects don't ship one.
	return { model: "ue" };
}
