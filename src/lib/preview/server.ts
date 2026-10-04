import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".avif": "image/avif",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ico": "image/x-icon",
};

export interface VirtualRoute {
	body: string;
	type: string;
}

export interface PreviewServer {
	url: string;
	port: number;
	close: () => Promise<void>;
}

/**
 * Serve `root` as static files, plus a set of in-memory virtual routes (the
 * generated harness HTML — no files are written to the user's project).
 * Tries `port`, falling back to the next few ports if taken.
 */
export function startServer(
	root: string,
	routes: Record<string, VirtualRoute>,
	port: number,
	host = "127.0.0.1",
): Promise<PreviewServer> {
	const resolvedRoot = path.resolve(root);

	const server = http.createServer((req, res) => {
		const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);

		const route = routes[urlPath];
		if (route) {
			res.writeHead(200, { "content-type": route.type });
			res.end(route.body);
			return;
		}

		// Static file from the project root (with path-traversal protection).
		const filePath = path.join(resolvedRoot, urlPath);
		if (!filePath.startsWith(resolvedRoot)) {
			res.writeHead(403);
			res.end("Forbidden");
			return;
		}
		if (!existsSync(filePath) || !statSync(filePath).isFile()) {
			res.writeHead(404, { "content-type": "text/plain" });
			res.end(`Not found: ${urlPath}`);
			return;
		}
		res.writeHead(200, {
			"content-type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
		});
		createReadStream(filePath).pipe(res);
	});

	return new Promise((resolve, reject) => {
		let attempts = 0;
		const tryListen = (p: number) => {
			server.once("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE" && attempts < 10) {
					attempts++;
					tryListen(p + 1);
				} else {
					reject(err);
				}
			});
			server.listen(p, host, () => {
				resolve({
					url: `http://${host}:${p}/`,
					port: p,
					close: () =>
						new Promise<void>((res) => {
							server.close(() => res());
						}),
				});
			});
		};
		tryListen(port);
	});
}
