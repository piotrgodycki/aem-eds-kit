import { describe, expect, it } from "vitest";
import { cdnCheck, cdnFiles, hostName } from "../../src/lib/cdn.js";

type Page = { status: number; headers?: Record<string, string>; body?: string };

/** A stand-in for fetch: answers by URL, and a missing page with 404. */
function site(pages: Record<string, Page>): typeof fetch {
	return (async (url: string) => {
		const u = new URL(url);
		const key = `${u.protocol}//${u.host}${u.pathname}${u.search}`;
		const page =
			pages[key] ?? (u.pathname.startsWith("/eds-cdn-check-") ? pages.missing : undefined);
		if (!page) throw new Error(`no answer for ${key}`);
		return new Response(page.body ?? "", { status: page.status, headers: page.headers });
	}) as unknown as typeof fetch;
}

const GOOD: Record<string, Page> = {
	"https://www.acme.com/": {
		status: 200,
		headers: { "content-encoding": "br" },
		body: '<script src="/scripts/aem.js" type="module"></script>',
	},
	"http://www.acme.com/eds-cdn-check/path?x=1": {
		status: 301,
		headers: { location: "https://www.acme.com/eds-cdn-check/path?x=1" },
	},
	"https://www.acme.com/query-index.json?limit=1": {
		status: 200,
		body: JSON.stringify({ data: [{ path: "/" }] }),
	},
	"https://www.acme.com/robots.txt": {
		status: 200,
		body: "User-agent: *\nAllow: /\nSitemap: https://www.acme.com/sitemap.xml\n",
	},
	"https://www.acme.com/sitemap.xml": { status: 200 },
	"https://www.acme.com/favicon.ico": { status: 200 },
	"https://acme.com/": { status: 301, headers: { location: "https://www.acme.com/" } },
	missing: { status: 404 },
};

describe("eds cdn check", () => {
	it("passes a domain set up as the guides say", async () => {
		const checks = await cdnCheck("www.acme.com", site(GOOD));
		expect(checks.filter((c) => c.status !== "pass")).toEqual([]);
		expect(checks.map((c) => c.id)).toEqual([
			"home",
			"eds",
			"https",
			"age",
			"robots-tag",
			"compression",
			"query",
			"robots",
			"sitemap",
			"404",
			"favicon",
			"twin",
		]);
	});

	it("names what a misconfigured CDN gets wrong, with the fix", async () => {
		const checks = await cdnCheck(
			"www.acme.com",
			site({
				...GOOD,
				"https://www.acme.com/": {
					status: 200,
					headers: { age: "3600", "x-robots-tag": "noindex, nofollow" },
					body: '<script src="/scripts/aem.js"></script>',
				},
				"http://www.acme.com/eds-cdn-check/path?x=1": {
					status: 302,
					headers: { location: "https://www.acme.com/" },
				},
				"https://www.acme.com/query-index.json?limit=1": {
					status: 200,
					body: JSON.stringify({ data: [{}, {}, {}] }),
				},
				"https://www.acme.com/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\n" },
				missing: { status: 200 },
			}),
		);
		const failed = Object.fromEntries(
			checks.filter((c) => c.status === "fail").map((c) => [c.id, c.fix]),
		);
		expect(Object.keys(failed).sort()).toEqual([
			"404",
			"age",
			"https",
			"query",
			"robots",
			"robots-tag",
		]);
		expect(failed.https).toContain("301");
		expect(checks.find((c) => c.id === "compression")?.status).toBe("warn");
	});

	it("stops after the home page when the domain doesn't answer", async () => {
		const checks = await cdnCheck("www.nowhere.com", site({}));
		expect(checks).toHaveLength(1);
		expect(checks[0]).toMatchObject({ id: "home", status: "fail" });
	});
});

describe("eds cdn setup", () => {
	it("writes each CDN's settings with the host and origin filled in", () => {
		const fastly = cdnFiles("fastly", "www.acme.com", "main--site--acme.aem.live");
		expect(fastly.map((f) => f.file)).toEqual([
			"README.md",
			"push-invalidation.example.json",
			"vcl/recv.vcl",
			"vcl/miss-pass.vcl",
			"vcl/deliver-redirect.vcl",
			"vcl/deliver-headers.vcl",
		]);
		expect(fastly[3].content).toContain('set bereq.http.X-Push-Invalidation = "enabled";');
		expect(JSON.parse(fastly[1].content)).toEqual({
			prod: {
				host: "www.acme.com",
				type: "fastly",
				serviceId: "<service id>",
				authToken: "<API token with purge_select>",
			},
		});
		const cf = cdnFiles("cloudflare", "www.acme.com", "main--site--acme.aem.live");
		const toml = cf.find((f) => f.file === "wrangler.toml")?.content ?? "";
		expect(toml).toContain('ORIGIN_HOSTNAME = "main--site--acme.aem.live"');
		expect(toml).toContain('pattern = "www.acme.com/*"');
		expect(cdnFiles("cloudfront", "a.com", "o").map((f) => f.file)).toContain("strip-headers.js");
	});

	it("reads a host as typed", () => {
		expect(hostName(" https://WWW.Acme.com/path ")).toBe("www.acme.com");
		expect(hostName("not a host")).toBeNull();
	});
});
