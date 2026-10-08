/**
 * Build the deep link that opens a page in the hosted Universal Editor.
 *
 * The editor edits a delivered page (its `aem.page` preview URL, which carries
 * the content-source connection), so the link points the editor canvas at that
 * URL. No network, no local service - just string building.
 */

export interface Remote {
	owner: string;
	repo: string;
}

/** Parse `owner`/`repo` from a GitHub remote (SSH or HTTPS). Null if not GitHub. */
export function parseRemote(url: string): Remote | null {
	const m = url.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/i);
	return m ? { owner: m[1], repo: m[2] } : null;
}

/** The EDS preview host for a repo, e.g. `main--repo--owner.aem.page`. */
export function previewHost(owner: string, repo: string, ref = "main"): string {
	return `${ref}--${repo}--${owner}.aem.page`;
}

export interface EditorLinkOptions {
	/** Delivery host or full URL of the page (e.g. `main--repo--owner.aem.page`). */
	host: string;
	/** Page path (defaults to the site root). */
	path?: string;
	/** IMS org slug - prefixes the link so the editor skips the org picker. */
	org?: string;
}

/** The Universal Editor canvas deep link for a delivered page. */
export function editorLink({ host, path = "/", org }: EditorLinkOptions): string {
	const cleanHost = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
	const p = path.startsWith("/") ? path : `/${path}`;
	const orgSeg = org ? `@${org}/` : "";
	return `https://experience.adobe.com/#/${orgSeg}aem/editor/canvas/${cleanHost}${p}`;
}
