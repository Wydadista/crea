const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
let n = 0;
const id = () => `new${++n}`;
function p() {
  const p = T.empty();
  T.addTrack(p);
  p.media = [
    { id: "v", kind: "video", name: "video", path: "/v.mp4", duration: 10 },
    { id: "e", kind: "effect", name: "blur", duration: 10 },
  ];
  p.clips = [
    {
      id: "a",
      mediaId: "v",
      start: 0,
      track: 0,
      in: 0,
      out: 4,
      speed: 1,
      volume: 1,
    },
    {
      id: "b",
      mediaId: "v",
      start: 4,
      track: 0,
      in: 0,
      out: 2,
      speed: 1,
      volume: 1,
    },
  ];
  return p;
}
test("nested effect follows parent, cuts retain appropriate ranges, copied child identities independent", () => {
  const a = p();
  a.clips[0].attachments = [
    {
      id: "fx",
      mediaId: "e",
      sourceIn: 1,
      sourceOut: 3,
      start: 1,
      in: 0,
      out: 2,
      speed: 1,
      volume: 0,
      effect: {
        type: "blur",
        strength: 20,
        x: 20,
        y: 20,
        width: 40,
        height: 40,
        shape: "circle",
      },
    },
  ];
  T.validate(a);
  assert.equal(T.expanded(a).clips.find((c) => c.id === "fx").start, 1);
  a.clips[0].start = 6;
  a.clips[1].start = 0;
  assert.equal(T.expanded(a).clips.find((c) => c.id === "fx").start, 7);
  T.split(a.clips, ["a"], 8, id);
  const children = T.expanded(a).clips.filter((c) => c.parentId);
  assert.equal(children.length, 2);
  assert.notEqual(children[0].id, children[1].id);
  assert.deepEqual(
    children.map((c) => [c.start, T.duration(c)]),
    [
      [7, 1],
      [8, 1],
    ],
  );
  const paste = T.pasteSelection(
    a,
    T.copySelection(a, ["a"]),
    20,
    0,
    id,
  ).project;
  assert.notEqual(paste.clips.at(-1).attachments[0].id, "fx");
  T.validate(paste);
});
test("compact group is one block on track one while composition tracks and positions remain intact", () => {
  const a = p();
  a.clips[1].track = 1;
  a.clips[1].start = 1;
  const old = JSON.stringify(a.clips);
  T.linkSelected(a.clips, ["a", "b"], id);
  const block = T.groups(a.clips);
  assert.equal(block.length, 1);
  assert.equal(block[0].track, 0);
  assert.equal(block[0].compact, true);
  assert.deepEqual(
    a.clips.map(({ linkId, ...c }) => c),
    JSON.parse(old),
  );
});
test("insertion shifts following clips without overlap and zoom evaluates enter hold return", () => {
  const a = p();
  const next = T.insertMedia(a, { ...a.clips[1], id: "insert" }, 4);
  assert.equal(next.clips.find((c) => c.id === "b").start, 6);
  assert.equal(next.clips.at(-1).start, 4);
  assert.equal(a.clips[1].start, 4);
  const c = {
    in: 0,
    out: 4,
    zoom: {
      from: 1,
      to: 3,
      x: 0.1,
      y: 0.8,
      keys: [
        { time: 0, scale: 1, x: 0.5, y: 0.5 },
        { time: 1, scale: 3, x: 0.1, y: 0.8 },
        { time: 3, scale: 3, x: 0.1, y: 0.8 },
        { time: 4, scale: 1, x: 0.5, y: 0.5 },
      ],
    },
  };
  assert.equal(T.zoomAt(c, 2).scale, 3);
  assert.equal(T.zoomAt(c, 4).scale, 1);
  assert.equal(T.zoomAt(c, 0.5).scale, 2);
  assert.ok(T.zoomExpression(c, "x", "t").includes("if("));
});
