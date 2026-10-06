/**
 * Third-party integration templates for EDS. Everything here is appended to
 * `scripts/delayed.js` so it loads in the delayed phase (after LCP, non-blocking)
 * per EDS performance best practices. Heavy widgets (chat) use the facade
 * pattern — a lightweight trigger that loads the real script on first interaction.
 */

export interface IntegrationField {
	name: string;
	message: string;
	placeholder?: string;
}

export interface Integration {
	id: string;
	name: string;
	fields: IntegrationField[];
	code: (v: Record<string, string>) => string;
}

export const INTEGRATIONS: Integration[] = [
	{
		id: "gtm",
		name: "Google Tag Manager",
		fields: [{ name: "id", message: "GTM container ID", placeholder: "GTM-XXXXXXX" }],
		code: (v) => `// Google Tag Manager (${v.id}) — delayed phase, after LCP.
(function (w, d, s, l, i) {
  w[l] = w[l] || [];
  w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  const f = d.getElementsByTagName(s)[0];
  const j = d.createElement(s);
  j.async = true;
  j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i;
  f.parentNode.insertBefore(j, f);
})(window, document, 'script', 'dataLayer', '${v.id}');`,
	},
	{
		id: "ga4",
		name: "Google Analytics 4",
		fields: [{ name: "id", message: "Measurement ID", placeholder: "G-XXXXXXXXXX" }],
		code: (v) => `// Google Analytics 4 (${v.id}) — delayed phase.
const gaScript = document.createElement('script');
gaScript.async = true;
gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=${v.id}';
document.head.appendChild(gaScript);
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', '${v.id}');`,
	},
	{
		id: "chat",
		name: "Chat widget (facade)",
		fields: [
			{ name: "label", message: "Button label", placeholder: "Chat with us" },
			{ name: "src", message: "Chat widget script URL" },
		],
		code: (v) => `// Chat widget — facade pattern: load the heavy script only on first interaction.
const chatBtn = document.createElement('button');
chatBtn.type = 'button';
chatBtn.className = 'chat-facade';
chatBtn.textContent = ${JSON.stringify(v.label || "Chat")};
chatBtn.addEventListener('click', () => {
  const s = document.createElement('script');
  s.async = true;
  s.src = ${JSON.stringify(v.src || "")};
  document.body.appendChild(s);
  chatBtn.remove();
}, { once: true });
document.body.appendChild(chatBtn);`,
	},
	{
		id: "cookiebot",
		name: "Cookie consent (Cookiebot)",
		fields: [{ name: "id", message: "Cookiebot domain group ID (CBID)" }],
		code: (
			v,
		) => `// Cookiebot consent — load early in delayed; configure GTM consent mode to respect it.
const cb = document.createElement('script');
cb.id = 'Cookiebot';
cb.src = 'https://consent.cookiebot.com/uc.js';
cb.setAttribute('data-cbid', '${v.id}');
cb.async = true;
document.head.appendChild(cb);`,
	},
	{
		id: "custom",
		name: "Custom third-party script",
		fields: [{ name: "url", message: "Script URL" }],
		code: (v) => `// Custom third-party script — delayed phase.
const s = document.createElement('script');
s.async = true;
s.src = ${JSON.stringify(v.url || "")};
document.head.appendChild(s);`,
	},
];

export function integrationById(id: string): Integration | undefined {
	return INTEGRATIONS.find((i) => i.id === id);
}

/** Wrap generated code in a marked block for `scripts/delayed.js`. */
export function wrapBlock(name: string, code: string): string {
	return `\n// ── ${name} (eds integrate) ──────────────────────────────\n{\n${code
		.split("\n")
		.map((l) => (l ? `  ${l}` : l))
		.join("\n")}\n}\n`;
}
