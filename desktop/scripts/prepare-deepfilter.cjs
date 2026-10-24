// Official CPU engine and DeepFilterNet3 model. No Python or training required.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const version = "0.5.6";
const platforms = {
  linux: {
    name: `deep-filter-${version}-x86_64-unknown-linux-musl`,
    sha: "70775e251eee44c0f2451a1e833326cf8bcbbe304d3e7cd12851e6fce72ef7da",
  },
  win32: {
    name: `deep-filter-${version}-x86_64-pc-windows-msvc.exe`,
    sha: "75e11fa16445f560cb6b021521ddb89e89270d13b83089705d98776f58fd7915",
  },
};
const model = {
  name: "DeepFilterNet3_onnx.tar.gz",
  sha: "c94d91f70911001c946e0fabb4aa9adc37045f45a03b56008cb0c8244cb63616",
};
async function install(platform = process.platform) {
  const config = platforms[platform];
  if (!config)
    throw Error("DeepFilterNet3: piattaforma supportata Windows/Linux x64");
  const dir = path.join(__dirname, "../vendor/deepfilter", platform);
  await fs.mkdir(dir, { recursive: true });
  async function download(url, file, sha) {
    const target = path.join(dir, file);
    const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
    try {
      if (hash(await fs.readFile(target)) === sha) return;
    } catch {}
    console.log("DeepFilterNet3: scaricamento " + file);
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok)
      throw Error("Download DeepFilterNet3: HTTP " + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== sha)
      throw Error("Checksum DeepFilterNet3 non valido: " + file);
    const tmp = target + ".download";
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, target);
  }
  await download(
    `https://github.com/Rikorose/DeepFilterNet/releases/download/v${version}/${config.name}`,
    platform === "win32" ? "deep-filter.exe" : "deep-filter",
    config.sha,
  );
  await download(
    "https://raw.githubusercontent.com/Rikorose/DeepFilterNet/d375b2d8309e0935d165700c91da9de862a99c31/models/" +
      model.name,
    model.name,
    model.sha,
  );
  if (platform !== "win32")
    await fs.chmod(path.join(dir, "deep-filter"), 0o755);
}
module.exports = { install };
if (require.main === module)
  install(process.argv[2]).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
