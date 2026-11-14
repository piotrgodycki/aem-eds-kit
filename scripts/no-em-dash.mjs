// The repository uses no em dashes: a colon, comma or full stop reads better (EDS-226).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|css|html|yml|yaml|txt)$/;
const files = execFileSync("git", ["ls-files"], { encoding: "utf-8" })
	.split("\n")
	.filter((f) => TEXT.test(f) && f !== "pnpm-lock.yaml");
const found = files.flatMap((file) =>
	readFileSync(file, "utf-8")
		.split("\n")
		.flatMap((line, i) => (line.includes("—") ? [`${file}:${i + 1}`] : [])),
);
if (found.length) {
	console.error(
		`No em dashes, please (a colon, comma or full stop instead):\n  ${found.join("\n  ")}`,
	);
	process.exit(1);
}
