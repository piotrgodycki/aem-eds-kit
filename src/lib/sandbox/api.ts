/**
 * Minimal GitHub REST client for sandboxes - create a repo from a template,
 * add topics, list by topic, and delete. Uses a token (no `gh` dependency).
 */

const API = "https://api.github.com";

function headers(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "aem-eds-kit",
		"Content-Type": "application/json",
	};
}

/** The `generate from template` endpoint for a `owner/repo` template. */
export function generateEndpoint(template: string): string {
	return `${API}/repos/${template}/generate`;
}

export async function getUser(token: string): Promise<string> {
	const res = await fetch(`${API}/user`, { headers: headers(token) });
	if (!res.ok) throw new Error(`GitHub auth failed: ${res.status}`);
	return ((await res.json()) as { login: string }).login;
}

/** True if `owner/repo` already exists (so we never clobber an existing repo). */
export async function repoExists(token: string, owner: string, repo: string): Promise<boolean> {
	const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
	if (res.status === 404) return false;
	if (res.ok) return true;
	// Anything else (e.g. 403) is inconclusive - surface it rather than guess.
	throw new Error(`existence check failed: ${res.status} ${await res.text()}`);
}

export interface CreateFromTemplate {
	owner: string;
	name: string;
	private?: boolean;
}

/** Create a repo from a template repository. Returns the new repo's full name. */
export async function createFromTemplate(
	token: string,
	template: string,
	opts: CreateFromTemplate,
): Promise<{ fullName: string; htmlUrl: string; cloneUrl: string }> {
	const res = await fetch(generateEndpoint(template), {
		method: "POST",
		headers: headers(token),
		body: JSON.stringify({
			owner: opts.owner,
			name: opts.name,
			private: !!opts.private,
			include_all_branches: false,
		}),
	});
	if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
	const r = (await res.json()) as { full_name: string; html_url: string; clone_url: string };
	return { fullName: r.full_name, htmlUrl: r.html_url, cloneUrl: r.clone_url };
}

export async function addTopics(
	token: string,
	owner: string,
	repo: string,
	topics: string[],
): Promise<void> {
	await fetch(`${API}/repos/${owner}/${repo}/topics`, {
		method: "PUT",
		headers: headers(token),
		body: JSON.stringify({ names: topics }),
	});
}

export async function deleteRepo(token: string, owner: string, repo: string): Promise<void> {
	const res = await fetch(`${API}/repos/${owner}/${repo}`, {
		method: "DELETE",
		headers: headers(token),
	});
	if (!res.ok && res.status !== 204) {
		throw new Error(`delete failed: ${res.status} ${await res.text()}`);
	}
}

/** Full names of repos the user owns that carry a topic. */
export async function searchByTopic(
	token: string,
	login: string,
	topic: string,
): Promise<string[]> {
	const q = encodeURIComponent(`user:${login} topic:${topic} fork:true`);
	const res = await fetch(`${API}/search/repositories?q=${q}&per_page=100`, {
		headers: headers(token),
	});
	if (!res.ok) throw new Error(`search failed: ${res.status}`);
	const data = (await res.json()) as { items: { full_name: string }[] };
	return data.items.map((i) => i.full_name);
}
