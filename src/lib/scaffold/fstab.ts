import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Authoring models `eds init` can set a project up for. */
export type Authoring = "ue" | "da" | "gdrive" | "sharepoint";

export const AUTHORING_NAMES: Record<Authoring, string> = {
	ue: "Universal Editor (crosswalk)",
	da: "Document Authoring (da.live)",
	gdrive: "Document Authoring (Google Drive)",
	sharepoint: "Document Authoring (SharePoint)",
};

/**
 * Document-based models mount a content source via `fstab.yaml`; Universal
 * Editor / crosswalk authors in AEM and doesn't need one. So we only generate
 * fstab when it's actually required.
 */
export function needsFstab(a: Authoring): boolean {
	return a !== "ue";
}

/** The DA (da.live) content mountpoint for an org/site. */
export function daMountpoint(org: string, site: string): string {
	return `https://content.da.live/${org}/${site}/`;
}

/** Render an `fstab.yaml` that mounts `/` to a content source. */
export function fstabYaml(mountpoint: string): string {
	return `mountpoints:\n  /: ${mountpoint}\n`;
}

/**
 * Write `fstab.yaml`. `eds init` owns this file, so it overwrites the
 * boilerplate's placeholder mountpoint with the real one.
 */
export async function writeFstab(projectRoot: string, mountpoint: string): Promise<string> {
	await writeFile(path.join(projectRoot, "fstab.yaml"), fstabYaml(mountpoint));
	return "fstab.yaml";
}

/**
 * A minimal crosswalk `paths.json` mapping AEM content under
 * `/content/<site>/` to the site root. A sensible starting point - adjust the
 * mapping if your AEM content path differs.
 */
export function pathsJson(site: string): string {
	return `${JSON.stringify(
		{
			mappings: [`/content/${site}/:/`],
			includes: [`/content/${site}/`],
		},
		null,
		2,
	)}\n`;
}

export async function writePaths(projectRoot: string, site: string): Promise<string> {
	await writeFile(path.join(projectRoot, "paths.json"), pathsJson(site));
	return "paths.json";
}

/** The authoring model a content-source URL points at, if any. */
export function authoringFromUrl(url: string): Authoring | undefined {
	if (/content\.da\.live|\/\/da\.live\//i.test(url)) return "da";
	if (/drive\.google\.com|docs\.google\.com/i.test(url)) return "gdrive";
	if (/sharepoint\.com|onedrive\.live\.com|1drv\.ms/i.test(url)) return "sharepoint";
	if (/adobeaemcloud\.(com|net)|\/bin\/franklin\.delivery/i.test(url)) return "ue";
	return undefined;
}

/**
 * Work out a project's authoring model from what's on disk: the `fstab.yaml`
 * mountpoint first, else a crosswalk `paths.json`. Undefined when it can't be
 * told (e.g. the DA boilerplate ships no fstab - DA is configured on da.live).
 */
export async function detectAuthoring(projectRoot: string): Promise<Authoring | undefined> {
	const fstab = path.join(projectRoot, "fstab.yaml");
	if (existsSync(fstab)) {
		const url = (await readFile(fstab, "utf-8")).match(/https?:\/\/[^\s"']+/)?.[0];
		const found = url && authoringFromUrl(url);
		if (found) return found;
	}
	if (existsSync(path.join(projectRoot, "paths.json"))) return "ue";
	return undefined;
}
