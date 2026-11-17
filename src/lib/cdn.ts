/**
 * A customer's own CDN in front of an Edge Delivery site, as Adobe's guides
 * describe it (aem.live/docs/byo-cdn-setup and the per-vendor pages, the push
 * invalidation pages and the go-live checklist): what to configure for each
 * CDN, and checks of the live domain against it.
 */

export const CDN_TYPES = ["cloudflare", "fastly", "akamai", "cloudfront", "managed"] as const;
export type CdnType = (typeof CDN_TYPES)[number];

/** A host name as typed: lower case, no scheme, no path. Null when it isn't one. */
export function hostName(v: string | undefined): string | null {
	const h = (v ?? "")
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/[/?#].*$/, "");
	return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : null;
}

const GUIDE = "https://www.aem.live/docs";

/** The push invalidation settings for the configuration service, with placeholders for the credentials. */
function pushInvalidation(type: CdnType, host: string): Record<string, unknown> {
	const prod: Record<string, unknown> = { host, type };
	if (type === "cloudflare")
		Object.assign(prod, {
			plan: "<free|pro|business|enterprise>",
			zoneId: "<zone id>",
			apiToken: "<API token with Cache Purge>",
		});
	if (type === "fastly")
		Object.assign(prod, { serviceId: "<service id>", authToken: "<API token with purge_select>" });
	if (type === "akamai")
		Object.assign(prod, {
			endpoint: "<akaa-....luna.akamaiapis.net>",
			clientSecret: "<client_secret>",
			clientToken: "<client_token>",
			accessToken: "<access_token>",
		});
	if (type === "cloudfront")
		Object.assign(prod, {
			distributionId: "<distribution id>",
			accessKeyId: "<AWS access key id>",
			secretAccessKey: "<AWS secret access key>",
			tagInvalidationEnabled: true,
		});
	return { prod };
}

// Fastly's snippets, as the Fastly setup guide gives them.
const FASTLY_RECV = `if (fastly.ff.visits_this_service == 0) {
  # edge delivery node
  if (req.url.qs != "") {
    # remember query string
    set req.http.X-QS = req.url.qs;
    if (req.url.path !~ "/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\\.[0-9a-z]+$"
      && req.url.ext !~ "(?i)^(gif|png|jpe?g|webp)$"
      && req.url.ext != "json"
      && req.url.path != "/.auth") {
      # strip query string from request url
      set req.url = req.url.path;
    }
  }
}
`;
const FASTLY_MISS_PASS = `set bereq.http.X-BYO-CDN-Type = "fastly";
set bereq.http.X-Push-Invalidation = "enabled";
`;
const FASTLY_DELIVER_REDIRECT = `if (fastly.ff.visits_this_service == 0) {
  # on edge delivery node
  if (
    http_status_matches(resp.status, "301,302,303,307,308")
    && req.http.X-QS
    && resp.http.location
    && resp.http.location !~ "\\?.*\\z"
  ) {
    # preserve request query string in redirect location
    set resp.http.location = resp.http.location "?" req.http.X-QS;
  }
}
`;
const FASTLY_DELIVER_HEADERS = `unset resp.http.Age;
if (req.url.path !~ "\\.plain\\.html$") {
  unset resp.http.X-Robots-Tag;
}
`;

// CloudFront's viewer-response function, as the CloudFront setup guide gives it.
const CLOUDFRONT_FUNCTION = `function handler(event) {
    const response = event.response;
    const request = event.request;
    const headers = response.headers;
    // Strip age header
    delete headers['age'];
    // Check if the request URL does not end with '.plain.html'
    if (!request.uri.endsWith('.plain.html')) {
        delete headers['x-robots-tag'];
    }
    return response;
}
`;

/** What every CDN must do, from the BYO CDN overview. */
const COMMON = (host: string, origin: string) => `## What every CDN in front of the site does

- Origin: \`https://${origin}\` (always the main branch for production)
- Sends to the origin: \`X-Forwarded-Host: ${host}\` and \`X-Push-Invalidation: enabled\`
- Lets the origin's cache control headers set the cache TTL
- Compresses (gzip)
- Forwards query parameters to the origin and keeps them in the cache key
- Removes the \`Age\` response header (or sets \`Age: 0\`)
- Redirects HTTP to HTTPS with a 301, keeping the host, path and query
- Test it on a stage domain before going public

Source: ${GUIDE}/byo-cdn-setup and ${GUIDE}/go-live-checklist
`;

const PUSH = (type: CdnType) => `## Push invalidation

A publish then clears the CDN's cache by URL and cache tag. Fill in the credentials in
\`push-invalidation.example.json\` (keep the filled copy out of the repository) and POST it to
the configuration service with your admin token:

\`\`\`
curl -X POST https://admin.hlx.page/config/{org}/sites/{site}/cdn.json \\
  -H 'content-type: application/json' -H 'x-auth-token: <admin token>' \\
  --data @push-invalidation.json
\`\`\`

Then publish a small change and check it shows on the production domain.
Source: ${GUIDE}/setup-byo-cdn-push-invalidation-for-${type}
`;

const STEPS: Record<CdnType, (host: string, origin: string) => string> = {
	cloudflare: (host, origin) => `## Cloudflare (${GUIDE}/byo-cdn-cloudflare-worker-setup)

1. DNS: a proxied CNAME for \`${host.split(".")[0] === "www" ? "www" : "@"}\` (its value doesn't matter with the worker; \`${origin}\` is simplest).
2. SSL/TLS, Edge Certificates: turn on Always Use HTTPS.
3. Caching, Configuration: Caching Level Standard, Browser Cache TTL Respect Existing Headers.
4. Caching, Cache Rules: hostname contains \`${host}\`, Eligible for cache, Browser TTL Respect Origin TTL.
5. Workers: create a worker from Adobe's worker
   https://raw.githubusercontent.com/adobe/aem-cloudflare-prod-worker/main/src/index.mjs
   with the variables in \`wrangler.toml\` (ORIGIN_HOSTNAME, PUSH_INVALIDATION).
6. Triggers: add the route \`${host}/*\` only. Not \`*.${host.replace(/^www\./, "")}/*\`, which serves the site on every subdomain.
7. Paid plans: block the extra ports Cloudflare serves on, to avoid duplicate content.
`,
	fastly: (host, origin) => `## Fastly (${GUIDE}/byo-cdn-fastly-setup)

1. Create a CDN service with the domain \`${host}\`.
2. Origin \`${origin}\`, keeping the defaults for Override default host, compression and Force TLS & HSTS. Shielding: Ashburn Metro (IAD) is recommended.
3. VCL snippets from the \`vcl/\` folder here:
   - \`recv.vcl\` in recv
   - \`miss-pass.vcl\` in miss and in pass (sends X-BYO-CDN-Type and X-Push-Invalidation)
   - \`deliver-redirect.vcl\` and \`deliver-headers.vcl\` in deliver
4. Activate the version.
`,
	akamai: (host, origin) => `## Akamai (${GUIDE}/byo-cdn-akamai-setup)

In the Property Manager:

- Origin Server Hostname \`${origin}\`, Forward Host Header: Origin Hostname, Cache Key Hostname: Incoming Host Header,
  Send True Client IP Header: No, Use SNI TLS Extension: Yes, Trust: Akamai-managed Certificate Authorities Sets
  (never pin certificates: the origin's is renewed)
- Remove Vary Header: On
- Modify Outgoing Request Header (avoid duplicate headers on): \`X-Forwarded-Host: {{builtin.AK_HOST}}\`,
  \`X-BYO-CDN-Type: akamai\`, \`X-Push-Invalidation: enabled\`
- Caching: Honor origin Cache-Control, Enhanced RFC support No, Honor private No, Honor must-revalidate No
- HTTP/2
- A rule for \`${host}\`: Request Protocol is HTTP, Redirect 301 to HTTPS, same host and path, query Expand
`,
	cloudfront: (host, origin) => `## CloudFront (${GUIDE}/byo-cdn-cloudfront-setup)

1. Cache policy: Default TTL 300 s, Headers None, Cookies None, Gzip and Brotli, query strings
   width, height, format, optimize, limit, offset, sheet.
2. Origin request policy: Headers None, Cookies None, the same query strings.
3. Distribution (any plan but Free, which can't invalidate by cache tag): Other origin \`${origin}\`,
   Customize origin settings and cache settings with the two policies, no security protections (no WAF).
4. Origin custom headers: \`X-Forwarded-Host: ${host}\`, \`X-BYO-CDN-Type: cloudfront\`, and once push
   invalidation is set up \`X-Push-Invalidation: enabled\`.
5. General: Use cache tags for cache invalidation, header \`x-amz-meta-cache-tag\`.
6. Functions: create \`strip-headers.js\` from this folder (runtime cloudfront-js-2.0), publish it and
   associate it with the distribution, event type Viewer response, behavior Default (*).
`,
	managed: (host) => `## Adobe-managed CDN (${GUIDE}/setup-byo-cdn-push-invalidation-for-managed)

The CDN in your AEM Sites as a Cloud Service license. Point \`${host}\` at it as Adobe's guide says;
push invalidation needs only the host and the type below.
`,
};

/** The files `eds cdn setup` writes into cdn/<type>/, with the host and origin filled in. */
export function cdnFiles(
	type: CdnType,
	host: string,
	origin: string,
): Array<{ file: string; content: string }> {
	const files = [
		{
			file: "README.md",
			content: `# ${host} on ${type}\n\nWritten by \`eds cdn setup\` from Adobe's BYO CDN guides. Check the result with \`eds cdn check ${host}\`.\n\n${STEPS[type](host, origin)}\n${type === "managed" ? "" : `${COMMON(host, origin)}\n`}${PUSH(type)}`,
		},
		{
			file: "push-invalidation.example.json",
			content: `${JSON.stringify(pushInvalidation(type, host), null, 2)}\n`,
		},
	];
	if (type === "fastly")
		files.push(
			{ file: "vcl/recv.vcl", content: FASTLY_RECV },
			{ file: "vcl/miss-pass.vcl", content: FASTLY_MISS_PASS },
			{ file: "vcl/deliver-redirect.vcl", content: FASTLY_DELIVER_REDIRECT },
			{ file: "vcl/deliver-headers.vcl", content: FASTLY_DELIVER_HEADERS },
		);
	if (type === "cloudfront") files.push({ file: "strip-headers.js", content: CLOUDFRONT_FUNCTION });
	if (type === "cloudflare")
		files.push({
			file: "wrangler.toml",
			content: `# The worker is Adobe's: https://github.com/adobe/aem-cloudflare-prod-worker
name = "aem-worker"
main = "src/index.mjs"
compatibility_date = "2024-01-01"
routes = [{ pattern = "${host}/*", zone_name = "${host.replace(/^www\./, "")}" }]

[vars]
ORIGIN_HOSTNAME = "${origin}"
# disabled on a non-production domain in front of the site
PUSH_INVALIDATION = "enabled"
`,
		});
	return files;
}

type CheckStatus = "pass" | "fail" | "warn";
interface CdnCheck {
	id: string;
	status: CheckStatus;
	/** What was checked, in a few words. */
	what: string;
	/** What was found. */
	detail: string;
	/** How to fix it, when it isn't a pass. */
	fix?: string;
}

type Fetch = typeof fetch;

/** A request that never hangs; it follows redirects only when asked, so a redirect can be checked. */
async function get(f: Fetch, url: string, follow = false): Promise<Response | null> {
	try {
		return await f(url, {
			redirect: follow ? "follow" : "manual",
			signal: AbortSignal.timeout(15_000),
		});
	} catch {
		return null;
	}
}

const PERMANENT = [301, 308];

/** The live domain against Adobe's BYO CDN and go-live guides, one check each. */
export async function cdnCheck(domain: string, f: Fetch = fetch): Promise<CdnCheck[]> {
	const out: CdnCheck[] = [];
	const add = (c: CdnCheck) => out.push(c);
	const base = `https://${domain}`;

	const home = await get(f, `${base}/`);
	const html = home?.ok ? await home.text() : "";
	add(
		home?.ok
			? { id: "home", status: "pass", what: "Home page over HTTPS", detail: `${home.status}` }
			: {
					id: "home",
					status: "fail",
					what: "Home page over HTTPS",
					detail: home ? `${home.status}` : "no answer",
					fix: "Point the domain's DNS at the CDN and the CDN at the main--<repo>--<owner>.aem.live origin.",
				},
	);
	if (!home) return out;

	if (html)
		add(
			/\/scripts\/aem\.js|lib-franklin|aem\.js/.test(html)
				? {
						id: "eds",
						status: "pass",
						what: "Served by Edge Delivery",
						detail: "scripts/aem.js is on the page",
					}
				: {
						id: "eds",
						status: "warn",
						what: "Served by Edge Delivery",
						detail: "scripts/aem.js isn't on the home page",
						fix: "Check the CDN's origin is main--<repo>--<owner>.aem.live.",
					},
		);

	const path = `/eds-cdn-check/path?x=1`;
	const plain = await get(f, `http://${domain}${path}`);
	const location = plain?.headers.get("location") ?? "";
	add(
		plain && PERMANENT.includes(plain.status) && location === `${base}${path}`
			? {
					id: "https",
					status: "pass",
					what: "HTTP redirects to HTTPS",
					detail: `${plain.status}, path and query kept`,
				}
			: {
					id: "https",
					status: plain && PERMANENT.includes(plain.status) ? "warn" : "fail",
					what: "HTTP redirects to HTTPS",
					detail: plain
						? `${plain.status}${location ? ` to ${location}` : ""}`
						: "no answer on HTTP",
					fix: "Redirect all HTTP to HTTPS with a 301, keeping the host, path and query (Cloudflare: Always Use HTTPS; Akamai: a Redirect rule).",
				},
	);

	const age = home.headers.get("age");
	add(
		!age || age === "0"
			? {
					id: "age",
					status: "pass",
					what: "Age header removed",
					detail: age ? "Age: 0" : "no Age header",
				}
			: {
					id: "age",
					status: "fail",
					what: "Age header removed",
					detail: `Age: ${age}`,
					fix: "Remove the Age response header at the CDN, or set it to 0.",
				},
	);

	const robotsTag = home.headers.get("x-robots-tag") ?? "";
	add(
		/noindex/i.test(robotsTag)
			? {
					id: "robots-tag",
					status: "fail",
					what: "Pages can be indexed",
					detail: `X-Robots-Tag: ${robotsTag}`,
					fix: "Remove X-Robots-Tag at the CDN except on .plain.html, and send X-Forwarded-Host to the origin.",
				}
			: {
					id: "robots-tag",
					status: "pass",
					what: "Pages can be indexed",
					detail: "no noindex header",
				},
	);

	const encoding = home.headers.get("content-encoding");
	add(
		encoding
			? { id: "compression", status: "pass", what: "Compression", detail: encoding }
			: {
					id: "compression",
					status: "warn",
					what: "Compression",
					detail: "the home page isn't compressed",
					fix: "Turn on gzip (or Brotli) at the CDN.",
				},
	);

	const index = await get(f, `${base}/query-index.json?limit=1`);
	if (index?.ok) {
		const rows = ((await index.json().catch(() => ({}))) as { data?: unknown[] }).data ?? [];
		add(
			rows.length <= 1
				? {
						id: "query",
						status: "pass",
						what: "Query parameters reach the origin",
						detail: "query-index.json?limit=1 gave 1 row",
					}
				: {
						id: "query",
						status: "fail",
						what: "Query parameters reach the origin",
						detail: `query-index.json?limit=1 gave ${rows.length} rows`,
						fix: "Forward query parameters to the origin and keep them in the cache key.",
					},
		);
	} else
		add({
			id: "query",
			status: "warn",
			what: "Query parameters reach the origin",
			detail: "no query-index.json to test with",
			fix: "Add a query index (helix-query.yaml) for the sitemap, then check again.",
		});

	const robots = await get(f, `${base}/robots.txt`);
	const robotsText = robots?.ok ? await robots.text() : "";
	const blocksAll = /user-agent:\s*\*[\s\S]*?^disallow:\s*\/\s*$/im.test(robotsText);
	add(
		!robots?.ok
			? {
					id: "robots",
					status: "warn",
					what: "robots.txt",
					detail: robots ? `${robots.status}` : "no answer",
					fix: "Serve robots.txt; AEM serves a production one through the CDN.",
				}
			: blocksAll
				? {
						id: "robots",
						status: "fail",
						what: "robots.txt",
						detail: "it disallows everything",
						fix: "Send X-Forwarded-Host so the origin serves the production robots.txt, or fix a custom one.",
					}
				: /^sitemap:/im.test(robotsText)
					? {
							id: "robots",
							status: "pass",
							what: "robots.txt",
							detail: "allows crawlers and names a sitemap",
						}
					: {
							id: "robots",
							status: "warn",
							what: "robots.txt",
							detail: "no Sitemap line",
							fix: "Point robots.txt at the sitemap.",
						},
	);

	const sitemap = await get(f, `${base}/sitemap.xml`, true);
	add(
		sitemap?.ok
			? { id: "sitemap", status: "pass", what: "sitemap.xml", detail: `${sitemap.status}` }
			: {
					id: "sitemap",
					status: "warn",
					what: "sitemap.xml",
					detail: sitemap ? `${sitemap.status}` : "no answer",
					fix: "AEM writes it from the query index: see aem.live/docs/sitemap.",
				},
	);

	const missing = await get(f, `${base}/eds-cdn-check-${Date.now().toString(36)}`);
	add(
		missing?.status === 404
			? { id: "404", status: "pass", what: "A missing page is a 404", detail: "404" }
			: {
					id: "404",
					status: missing?.ok ? "fail" : "warn",
					what: "A missing page is a 404",
					detail: missing ? `${missing.status}` : "no answer",
					fix: "Don't turn missing pages into 200s or redirects at the CDN.",
				},
	);

	// A favicon that redirects to the icon is fine: what matters is that one arrives.
	const favicon = await get(f, `${base}/favicon.ico`, true);
	add(
		favicon?.ok
			? { id: "favicon", status: "pass", what: "Favicon", detail: `${favicon.status}` }
			: {
					id: "favicon",
					status: "warn",
					what: "Favicon",
					detail: favicon ? `${favicon.status}` : "no answer",
					fix: "Add favicon.ico to the project's root.",
				},
	);

	const other = domain.startsWith("www.") ? domain.slice(4) : `www.${domain}`;
	const twin = await get(f, `https://${other}/`);
	const twinTo = twin?.headers.get("location") ?? "";
	add(
		!twin
			? {
					id: "twin",
					status: "warn",
					what: `${other} redirects`,
					detail: "it doesn't answer",
					fix: `If visitors type ${other}, redirect it to ${domain} with a 301.`,
				}
			: PERMANENT.includes(twin.status) && twinTo.startsWith(base)
				? {
						id: "twin",
						status: "pass",
						what: `${other} redirects`,
						detail: `${twin.status} to ${twinTo}`,
					}
				: {
						id: "twin",
						status: "warn",
						what: `${other} redirects`,
						detail: `${twin.status}${twinTo ? ` to ${twinTo}` : ""}`,
						fix: `Redirect ${other} to ${domain} with a 301, so the site has one address.`,
					},
	);
	return out;
}
