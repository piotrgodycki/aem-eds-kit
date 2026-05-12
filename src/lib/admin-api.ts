import { logger } from "./logger.js";

const ADMIN_BASE = "https://admin.hlx.page";

export interface AdminApiConfig {
	org: string;
	site: string;
	ref?: string;
}

export interface AdminApiResult {
	ok: boolean;
	status: number;
	path: string;
	previewUrl?: string;
	liveUrl?: string;
	message?: string;
}

async function adminRequest(
	action: "preview" | "live",
	config: AdminApiConfig,
	pagePath: string,
): Promise<AdminApiResult> {
	const ref = config.ref || "main";
	const normalizedPath = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
	const url = `${ADMIN_BASE}/${action}/${config.org}/${config.site}/${ref}${normalizedPath}`;

	logger.debug(`POST ${url}`);

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
	});

	const body = await response.json().catch(() => ({}));
	const data = body as Record<string, Record<string, string>>;

	if (!response.ok) {
		return {
			ok: false,
			status: response.status,
			path: normalizedPath,
			message: (body as Record<string, string>).message || `HTTP ${response.status}`,
		};
	}

	return {
		ok: true,
		status: response.status,
		path: normalizedPath,
		previewUrl: data.preview?.url,
		liveUrl: data.live?.url,
	};
}

export async function previewPage(
	config: AdminApiConfig,
	pagePath: string,
): Promise<AdminApiResult> {
	return adminRequest("preview", config, pagePath);
}

export async function publishPage(
	config: AdminApiConfig,
	pagePath: string,
): Promise<AdminApiResult> {
	return adminRequest("live", config, pagePath);
}

export async function previewPages(
	config: AdminApiConfig,
	paths: string[],
): Promise<AdminApiResult[]> {
	return Promise.all(paths.map((p) => previewPage(config, p)));
}

export async function publishPages(
	config: AdminApiConfig,
	paths: string[],
): Promise<AdminApiResult[]> {
	return Promise.all(paths.map((p) => publishPage(config, p)));
}
