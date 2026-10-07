import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Pull a classic component's **CSS** off disk from its clientlib. This is the
 * authored source (may include LESS), so it's a starting point - the most
 * faithful CSS actually comes from the rendered page (a later phase). We find
 * the clientlib folder, honour `css.txt` ordering when present, concatenate the
 * `.css` files, and flag any `.less` that would need a build.
 */

export interface ClientlibCss {
	/** Concatenated CSS from the clientlib. */
	css: string;
	/** Files that contributed, relative to the search root. */
	files: string[];
	/** LESS/SCSS sources found (need compilation - not concatenated). */
	preprocessed: string[];
}

async function listFiles(dir: string): Promise<string[]> {
	const out: string[] = [];
	const walk = async (d: string) => {
		for (const e of await readdir(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) await walk(p);
			else out.push(p);
		}
	};
	if (existsSync(dir)) await walk(dir);
	return out;
}

/** Find a clientlib folder in or under a component directory. */
export async function findClientlibDir(componentDir: string): Promise<string | null> {
	if (!existsSync(componentDir)) return null;
	const entries = await readdir(componentDir, { withFileTypes: true });
	const match = entries.find((e) => e.isDirectory() && /clientlib/i.test(e.name));
	if (match) return path.join(componentDir, match.name);
	// Some projects keep the CSS directly in the component folder.
	const hasCss = entries.some((e) => e.isFile() && e.name.endsWith(".css"));
	return hasCss ? componentDir : null;
}

/**
 * Read and concatenate CSS from a clientlib directory. Honours `css.txt`
 * (base/#base + listed files) when present; otherwise takes every `.css`.
 */
export async function readClientlibCss(clientlibDir: string): Promise<ClientlibCss> {
	const all = await listFiles(clientlibDir);
	const preprocessed = all
		.filter((f) => /\.(less|scss|sass)$/i.test(f))
		.map((f) => path.relative(clientlibDir, f));

	let cssFiles: string[];
	const cssTxt = path.join(clientlibDir, "css.txt");
	if (existsSync(cssTxt)) {
		// `css.txt` lists files in order; `#base=<dir>` sets the folder they
		// resolve against. Other `#...` lines are comments/directives.
		const lines = (await readFile(cssTxt, "utf-8")).split("\n").map((l) => l.trim());
		let base = clientlibDir;
		const listed: string[] = [];
		for (const l of lines) {
			if (!l) continue;
			const baseMatch = l.match(/^#base\s*=\s*(.+)$/);
			if (baseMatch) base = path.join(clientlibDir, baseMatch[1].trim());
			else if (!l.startsWith("#")) listed.push(l);
		}
		cssFiles = listed
			.map((rel) => path.join(base, rel))
			.filter((f) => existsSync(f) && f.endsWith(".css"));
	} else {
		cssFiles = all.filter((f) => f.endsWith(".css"));
	}

	const parts: string[] = [];
	for (const f of cssFiles) parts.push(await readFile(f, "utf-8"));
	return {
		css: parts.join("\n\n"),
		files: cssFiles.map((f) => path.relative(clientlibDir, f)),
		preprocessed,
	};
}
