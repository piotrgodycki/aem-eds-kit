import { emitKeypressEvents } from "node:readline";

/**
 * Interactive-session state. When `eds` runs as the menu (no command), actions
 * return to the menu instead of ending the process, and a long-running preview
 * stops on Esc / Enter rather than only on Ctrl+C.
 */
export const session = { menu: false };

/**
 * Keep a running server (preview) alive until the user stops it, then close it.
 * In the menu: Esc or Enter stops it and returns; Ctrl+C quits `eds`. Run
 * directly (`eds block preview`): Ctrl+C / SIGTERM close it and exit, as before.
 */
export async function waitForStop(close: () => Promise<void>): Promise<void> {
	const stdin = process.stdin;
	const interactive = session.menu && stdin.isTTY;
	await new Promise<void>((resolve) => {
		let done = false;
		const finish = async (exit: boolean) => {
			if (done) return;
			done = true;
			process.off("SIGINT", onSignal);
			process.off("SIGTERM", onSignal);
			if (interactive) {
				stdin.off("keypress", onKey);
				stdin.setRawMode(false);
				stdin.pause();
			}
			await close();
			if (exit) process.exit(0);
			resolve();
		};
		const onSignal = () => void finish(true);
		const onKey = (_s: string, key?: { name?: string; ctrl?: boolean }) => {
			if (key?.ctrl && key.name === "c") void finish(true);
			else if (key?.name === "escape" || key?.name === "return") void finish(false);
		};
		process.on("SIGINT", onSignal);
		process.on("SIGTERM", onSignal);
		if (interactive) {
			emitKeypressEvents(stdin);
			stdin.setRawMode(true);
			stdin.resume();
			stdin.on("keypress", onKey);
		}
	});
}

/** The hint shown under a running preview. */
export function stopHint(): string {
	return session.menu && process.stdin.isTTY
		? "Press Esc or Enter to stop and go back to the menu (Ctrl+C quits)."
		: "Press Ctrl+C to stop.";
}
