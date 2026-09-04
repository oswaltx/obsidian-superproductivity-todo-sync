import esbuild from "esbuild";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-plugin-tests-"));

const entries = ["parse.test.ts", "api.test.ts"];

for (const entry of entries) {
	const outfile = path.join(outDir, entry.replace(/\.ts$/, ".js"));
	await esbuild.build({
		entryPoints: [path.join(__dirname, entry)],
		bundle: true,
		platform: "node",
		format: "cjs",
		external: ["obsidian"],
		outfile,
	});
	console.log(`\n--- running ${entry} ---`);
	execFileSync(process.execPath, [outfile], { stdio: "inherit" });
}

fs.rmSync(outDir, { recursive: true, force: true });
