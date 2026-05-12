import type { FigmaUrlParts } from "../schemas.js";

/**
 * Parse a Figma URL into its components: fileKey, nodeId, fileName.
 *
 * Supported URL formats:
 * - figma.com/design/:fileKey/:fileName?node-id=:nodeId
 * - figma.com/design/:fileKey/branch/:branchKey/:fileName?node-id=:nodeId
 * - figma.com/file/:fileKey/:fileName?node-id=:nodeId
 * - figma.com/board/:fileKey/:fileName?node-id=:nodeId
 * - figma.com/make/:fileKey/:fileName
 * - figma.com/slides/:fileKey/:fileName?node-id=:nodeId
 *
 * nodeId in URL uses "-" as separator, converted to ":" for API calls.
 */
export function parseFigmaUrl(input: string): FigmaUrlParts {
	// If input looks like a raw node-id (e.g., "42:100" or "42-100"), reject — need at least a fileKey
	if (/^\d+[-:]\d+$/.test(input.trim())) {
		throw new Error(
			`Input "${input}" looks like a node-id but not a full URL. Provide a Figma URL or use --file-key.`,
		);
	}

	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		throw new Error(`Invalid Figma URL: "${input}"`);
	}

	if (!url.hostname.endsWith("figma.com")) {
		throw new Error(`Not a Figma URL: "${input}"`);
	}

	const segments = url.pathname.split("/").filter(Boolean);
	// segments[0] = type (design|file|board|make|slides)
	// segments[1] = fileKey (or branchKey scenario below)

	if (segments.length < 2) {
		throw new Error(`Cannot extract fileKey from URL: "${input}"`);
	}

	const type = segments[0];
	let fileKey: string;
	let fileName: string | undefined;

	// Branch URLs: /design/:fileKey/branch/:branchKey/:fileName
	if (segments[2] === "branch" && segments[3]) {
		fileKey = segments[3]; // use branchKey as fileKey
		fileName = segments[4] ? decodeURIComponent(segments[4]) : undefined;
	} else {
		fileKey = segments[1];
		fileName = segments[2] ? decodeURIComponent(segments[2]) : undefined;
	}

	// Parse node-id from query params
	const rawNodeId = url.searchParams.get("node-id");
	const nodeId = rawNodeId ? normalizeNodeId(rawNodeId) : undefined;

	return { fileKey, nodeId, fileName };
}

/**
 * Convert node-id from URL format (42-100) to API format (42:100).
 */
export function normalizeNodeId(nodeId: string): string {
	return decodeURIComponent(nodeId).replace(/-/g, ":");
}

/**
 * Convert node-id from API format (42:100) to URL format (42-100).
 */
export function nodeIdToUrlFormat(nodeId: string): string {
	return nodeId.replace(/:/g, "-");
}
