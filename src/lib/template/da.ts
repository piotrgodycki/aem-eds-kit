/**
 * Minimal client for the Document Authoring (da.live) source API. Used to push
 * generated page templates straight into a DA project.
 */

/** The DA source URL for a page, e.g. https://admin.da.live/source/org/site/path.html */
export function daSourceUrl(org: string, site: string, path: string): string {
	const clean = path.replace(/^\/+/, "").replace(/\.html$/i, "");
	return `https://admin.da.live/source/${org}/${site}/${clean}.html`;
}

/** The da.live edit URL for the same page (for the success message). */
export function daEditUrl(org: string, site: string, path: string): string {
	const clean = path.replace(/^\/+/, "").replace(/\.html$/i, "");
	return `https://da.live/edit#/${org}/${site}/${clean}`;
}

/**
 * Push HTML to a DA source path. Open projects accept anonymous writes; others
 * need an IMS token (pass it in, e.g. from a `DA_TOKEN` env var).
 */
export async function pushToDa(
	org: string,
	site: string,
	path: string,
	html: string,
	token?: string,
): Promise<string> {
	const url = daSourceUrl(org, site, path);
	const form = new FormData();
	form.append("data", new Blob([html], { type: "text/html" }), "content.html");
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await fetch(url, { method: "POST", body: form, headers });
	if (!res.ok) {
		throw new Error(`DA push failed: ${res.status} ${res.statusText}`);
	}
	return url;
}
