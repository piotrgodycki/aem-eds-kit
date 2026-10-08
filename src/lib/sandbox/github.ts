/**
 * Helpers for the disposable EDS sandbox: build the GitHub (`gh`) command
 * arguments and the Edge Delivery preview URL. Pure and testable - the actual
 * `gh` calls live in the command.
 */

/** Topic tagged on sandbox repos so `eds sandbox list` can find them. */
export const SANDBOX_TOPIC = "eds-sandbox";

/** Default boilerplate template repos per authoring style. */
export const BOILERPLATES = {
	document: "adobe/aem-boilerplate",
	ue: "adobe/aem-boilerplate-xwalk",
} as const;

/** The Edge Delivery preview URL for a repo (new `.aem.page` domain). */
export function previewUrl(owner: string, repo: string, ref = "main"): string {
	return `https://${ref}--${repo}--${owner}.aem.page/`;
}

/** The AEM Code Sync GitHub app install URL (one-time, per repo/owner). */
export function codeSyncInstallUrl(): string {
	return "https://github.com/apps/aem-code-sync/installations/new";
}

export interface CreateOptions {
	template: string;
	private?: boolean;
	clone?: boolean;
}

/** Build `gh repo create` arguments for a sandbox repo. */
export function createArgs(repoRef: string, opts: CreateOptions): string[] {
	return [
		"repo",
		"create",
		repoRef,
		"--template",
		opts.template,
		opts.private ? "--private" : "--public",
		...(opts.clone ? ["--clone"] : []),
	];
}
