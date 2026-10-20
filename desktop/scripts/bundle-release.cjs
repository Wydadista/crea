// Recreate portable/source ZIPs and checksums from a clean checkout and Windows build.
const fs = require("node:fs/promises");
const path = require("node:path");
const { createReadStream } = require("node:fs");
const { createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const run = require("node:util").promisify(execFile);
const { getPath7za } = require("app-builder-lib/out/toolsets/7zip");
const root = path.resolve(__dirname, "..");
const pkg = require("../package.json");
async function main() {
  const dist = path.join(root, "dist");
  const app = path.join(dist, "win-unpacked");
  const base = `Crea-Studio-${pkg.version}`;
  const installer = `${base}-x64-Setup.exe`;
  await fs.access(path.join(app, "Crea Studio.exe"));
  await fs.access(path.join(dist, installer));
  const tool = await getPath7za();
  async function zip(output, cwd, args) {
    const temp = path.join(dist, `temporary-${output}`);
    await fs.rm(temp, { force: true });
    try {
      await run(tool, ["a", "-tzip", "-mx=1", "-mcu", temp, ...args], {
        cwd,
        maxBuffer: 16 * 1024 * 1024,
      });
      await run(tool, ["t", temp], { maxBuffer: 16 * 1024 * 1024 });
      await fs.rm(path.join(dist, output), { force: true });
      await fs.rename(temp, path.join(dist, output));
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  const portable = `${base}-Windows-x64.zip`,
    source = `${base}-Sorgenti.zip`;
  await zip(portable, app, ["."]);
  const repo = path.resolve(root, "..");
  const result = await run("git", ["ls-files", "-z", "--", "desktop"], {
    cwd: repo,
    encoding: "buffer",
  });
  const files = result.stdout.toString("utf8").split("\0").filter(Boolean);
  if (
    !files.includes("desktop/package-lock.json") ||
    !files.includes("desktop/scripts/bundle-release.cjs")
  ) {
    throw Error(
      "Aggiungi al Git tutti i sorgenti prima di generare il pacchetto sorgenti.",
    );
  }
  await zip(source, repo, files);
  const sums = [];
  for (const name of [installer, portable, source]) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path.join(dist, name)))
      hash.update(chunk);
    sums.push(`${hash.digest("hex")}  ${name}`);
  }
  await fs.writeFile(path.join(dist, "SHA256SUMS.txt"), sums.join("\n") + "\n");
  console.log(
    "Pacchetti verificati:",
    installer,
    portable,
    source,
    "SHA256SUMS.txt",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
