"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
(async () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions.slice().sort(), ["activeTab", "scripting"]);
  assert.ok(
    !m.host_permissions && !m.content_scripts && !m.action.default_popup,
  );
  const calls = [];
  let click;
  let fail = false;
  const context = vm.createContext({
    browser: {
      runtime: { getURL: (file) => `moz-extension://test/${file}` },
      action: {
        onClicked: { addListener: (f) => (click = f) },
        setBadgeText: async (o) => calls.push(["badge", o]),
        setBadgeBackgroundColor: async () => {},
        setTitle: async (o) => calls.push(["title", o]),
      },
      scripting: {
        executeScript: async (o) => {
          calls.push(["inject", o]);
          if (fail) throw Error("protected");
        },
      },
      tabs: {
        sendMessage: async (id, message) =>
          calls.push(["message", id, message]),
      },
    },
    fetch: async (url) => {
      assert.ok(url.startsWith("moz-extension://test/"));
      calls.push(["local", url]);
      return {
        ok: true,
        text: async () =>
          fs.readFileSync(path.join(root, url.split("/").at(-1)), "utf8"),
      };
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "background.js"), "utf8"),
    context,
  );
  assert.equal(calls.length, 0, "nothing is loaded before the action click");
  await click({ id: 7 });
  assert.equal(calls.filter((c) => c[0] === "inject").length, 1);
  const injection = calls.find((c) => c[0] === "inject")[1];
  assert.equal(injection.target.tabId, 7);
  assert.equal(injection.files[0], "content.js");
  assert.equal(
    calls.find((c) => c[0] === "message")[2].type,
    "akhbar-blur:activate",
  );
  await click({ id: 7 });
  assert.equal(
    calls.filter((c) => c[0] === "local").length,
    2,
    "packaged interface cached",
  );
  fail = true;
  await click({ id: 8 });
  assert.ok(
    calls.some(
      (c) => c[0] === "badge" && c[1].tabId === 8 && c[1].text === "!",
    ),
  );
  assert.ok(!calls.some((c) => c[0] === "message" && c[1] === 8));
  console.log(
    "PASS: MV3, only activeTab/scripting, lazy activation, local-only assets, cached interface, protected-page handling",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
