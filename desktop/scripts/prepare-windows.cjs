// npm installs the host FFmpeg binary. Cross-builds also need the Windows binary.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.dirname(require.resolve("ffmpeg-static/package.json"));
const executable = path.join(root, "ffmpeg.exe");
if (!fs.existsSync(executable)) {
  execFileSync(process.execPath, [path.join(root, "install.js")], {
    stdio: "inherit",
    env: {
      ...process.env,
      XDG_CACHE_HOME:
        process.env.XDG_CACHE_HOME ||
        path.join(require("node:os").tmpdir(), "akhbar-build-cache"),
      npm_config_platform: "win32",
      npm_config_arch: "x64",
    },
  });
}
const fd = fs.openSync(executable, "r");
try {
  const header = Buffer.alloc(2);
  fs.readSync(fd, header, 0, 2, 0);
  if (header.toString() !== "MZ")
    throw Error("Il binario FFmpeg per Windows non è valido");
} finally {
  fs.closeSync(fd);
}
