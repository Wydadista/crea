const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const T = require("../src/model"),
  { StingerStore } = require("../src/stingers");
const make = () => {
  const p = T.empty();
  p.canvasSize = { width: 160, height: 90 };
  p.media = [
    {
      id: "v",
      name: "video",
      path: "/video",
      kind: "video",
      duration: 300,
      hasAudio: false,
    },
    {
      id: "a",
      name: "audio",
      path: "/audio",
      kind: "audio",
      duration: 6,
      hasAudio: true,
    },
  ];
  return p;
};
let sequence = 0;
const uid = () => `id-${++sequence}`;
const clip = (id, start, source = "B", extra = {}) => ({
  id,
  mediaId: "v",
  sourceInstanceId: source,
  start,
  in: 0,
  out: 10,
  speed: 1,
  volume: 1,
  track: 0,
  ...extra,
});
test("left trim preserves a pre-existing minute between different insertions; deletion ripple stays limited to its family", () => {
  const p = make();
  p.clips = [
    clip("A", 0, "A", { out: 20 }),
    clip("B", 80),
    clip("C", 90, "B", { in: 10, out: 20 }),
  ];
  const before = JSON.stringify(p);
  const q = T.trimFamilySegment(
    p,
    "B",
    { ...p.clips[1], in: 3, start: 83 },
    true,
  );
  assert.equal(q.clips[1].start, 80);
  assert.equal(q.clips[1].in, 3);
  assert.equal(q.clips[2].start, 87);
  assert.equal(q.clips[0].out, 20);
  assert.equal(JSON.stringify(p), before);
  const split = structuredClone(p);
  T.split(split.clips, ["B"], 83, uid);
  const removed = T.deleteFamilySegments(split, ["B"], true);
  assert.equal(removed.clips.find((c) => c.in === 3).start, 80);
  assert.equal(removed.clips.find((c) => c.id === "A").start, 0);
  const off = T.trimFamilySegment(
    p,
    "B",
    { ...p.clips[1], in: 3, start: 83 },
    false,
  );
  assert.equal(off.clips[1].start, 83);
  p.clips[1].groupId = p.clips[2].groupId = "joined";
  const joined = T.trimJoined(p, "B", "left", 3, true);
  assert.equal(joined.clips.find((c) => c.id === "B").start, 80);
});
test("volume points survive split, trim, retime and clipboard with source timing and interpolation intact; marker validation", () => {
  const p = make();
  p.clips = [
    clip("v", 0, "source", {
      out: 10,
      volumePoints: [
        { time: 0, value: 1 },
        { time: 2, value: 0.2 },
        { time: 4, value: 1.5 },
      ],
    }),
  ];
  p.markers = [{ id: "mark", name: "Inizio argomento", time: 3 }];
  T.validate(p);
  assert.equal(T.volumeAt(p.clips[0], 1), 0.6);
  assert.equal(T.volumeAt(p.clips[0], 8), 1.5);
  T.split(p.clips, ["v"], 3, uid);
  assert.deepEqual(p.clips[0].volumePoints, p.clips[1].volumePoints);
  const originalGain = T.volumeAt(p.clips[1], T.sourceTime(p.clips[1], 3.5));
  const q = T.pasteSelection(
    p,
    T.copySelection(p, [p.clips[1].id]),
    20,
    0,
    uid,
  );
  const c = q.project.clips.find((c) => q.ids.includes(c.id));
  assert.equal(T.volumeAt(c, T.sourceTime(c, 20.5)), originalGain);
  c.speed = 2;
  assert.equal(T.volumeAt(c, T.sourceTime(c, 20.25)), originalGain);
  assert.deepEqual(
    T.validate(JSON.parse(JSON.stringify(q.project))).markers,
    p.markers,
  );
  assert.throws(() =>
    T.validate({ ...p, markers: [{ id: "bad", name: "", time: 1 }] }),
  );
  assert.throws(() =>
    T.validate({
      ...p,
      clips: [
        {
          ...p.clips[0],
          volumePoints: [
            { time: 2, value: 1 },
            { time: 1, value: 1 },
          ],
        },
      ],
    }),
  );
  assert.ok(
    T.hasVolume({
      ...c,
      volume: 0,
      volumePoints: [
        { time: 0, value: 0 },
        { time: 1, value: 1 },
      ],
    }),
  );
});
test("stinger inserts four seconds of picture and a six-second independent audio tail, preserves downstream sync, has fresh identities and atomic rejection", () => {
  const presetProject = make();
  T.addTrack(presetProject);
  presetProject.clips = [
    clip("stinger", 10, "s", { out: 4 }),
    { ...clip("music", 10, "music", { out: 6, track: 1 }), mediaId: "a" },
  ];
  const preset = T.makeStinger(presetProject, ["stinger", "music"], "Notizie");
  assert.equal(preset.duration, 4);
  const p = make();
  T.addTrack(p);
  p.clips = [
    clip("news", 0, "news", { out: 10 }),
    { ...clip("caption", 0, "caption", { out: 10, track: 1 }) },
  ];
  p.markers = [{ id: "m", name: "Notizia", time: 0 }];
  const before = JSON.stringify(p);
  const result = T.insertStinger(p, preset, 0, 0, uid),
    q = result.project;
  assert.equal(JSON.stringify(p), before);
  assert.equal(q.clips.find((c) => c.id === "news").start, 4);
  assert.equal(q.clips.find((c) => c.id === "caption").start, 4);
  assert.equal(q.markers[0].time, 4);
  const added = q.clips.filter((c) => result.ids.includes(c.id)),
    v = added.find(
      (c) =>
        c.mediaId !== "a" &&
        q.media.find((m) => m.id === c.mediaId).kind === "video",
    ),
    a = added.find(
      (c) => q.media.find((m) => m.id === c.mediaId).kind === "audio",
    );
  assert.equal(T.duration(v), 4);
  assert.equal(T.duration(a), 6);
  assert.equal(v.start, 0);
  assert.equal(a.start, 0);
  assert.ok(a.track >= 2);
  assert.equal(a.linkId, v.linkId);
  assert.ok(v.stingerId);
  assert.equal(T.groups(added).length, 2);
  assert.equal(T.linkedIds(q.clips, [v.id]).length, 2);
  const again = T.insertStinger(q, preset, 4, 0, uid);
  const links = new Set(
    again.project.clips.filter((c) => c.stingerId).map((c) => c.linkId),
  );
  assert.equal(links.size, 2);
  assert.throws(() => T.insertStinger(p, preset, 5, 0, uid), /tra due clip/);
  assert.equal(JSON.stringify(p), before);
});
test("saved stingers survive new store instances and deletion of original media; removing a preset never breaks projects already using it", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-stingers-"));
  try {
    const source = path.join(dir, "original.mp4");
    await fs.writeFile(source, "fixture");
    const p = make();
    p.media = p.media.slice(0, 1);
    p.media[0].path = source;
    p.clips = [clip("v", 0, "source", { out: 4 })];
    const store = new StingerStore(path.join(dir, "library"));
    const id = await store.save(p, ["v"], "Il mio stacchetto");
    await fs.rm(source);
    const reloaded = new StingerStore(store.root),
      list = await reloaded.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "Il mio stacchetto");
    const preset = await reloaded.load(id);
    assert.equal(
      await fs.readFile(preset.content.media[0].path, "utf8"),
      "fixture",
    );
    const empty = T.empty();
    empty.canvasSize = { width: 160, height: 90 };
    const first = T.insertStinger(empty, preset, 0, 0, uid);
    const second = T.insertStinger(first.project, preset, 4, 0, uid);
    assert.equal(second.project.media.length, 1);
    await reloaded.remove(id);
    assert.equal((await reloaded.list()).length, 0);
    assert.equal(
      await fs.readFile(preset.content.media[0].path, "utf8"),
      "fixture",
    );
    await assert.rejects(reloaded.remove("../outside"));
    assert.ok(await fs.stat(store.root));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("project collection links recordings in place, collects other imports once, and keeps references on repeated Save As", async () => {
  const { collectProject } = require("../src/storage");
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "akhbar-recording-links-"),
  );
  try {
    const recordings = path.join(dir, "recordings");
    await fs.mkdir(recordings);
    const recorded = path.join(recordings, "recording.mp4"),
      external = path.join(dir, "photo.png"),
      older = path.join(dir, "old-recording.wav");
    await fs.writeFile(recorded, "recorded data");
    await fs.writeFile(external, "imported data");
    await fs.writeFile(older, "legacy audio");
    const p = T.empty();
    p.media = [
      {
        id: "r",
        kind: "video",
        name: "recording.mp4",
        path: recorded,
        duration: 5,
      },
      {
        id: "p",
        kind: "image",
        name: "photo.png",
        path: external,
        duration: 5,
      },
      {
        id: "old",
        kind: "audio",
        name: "old-recording.wav",
        path: older,
        duration: 5,
        recordingInfo: {},
      },
    ];
    const file = path.join(dir, "project", "work.creastudio");
    const q = await collectProject(p, file, {
      recordingsDirectory: recordings,
    });
    assert.equal(q.media[0].path, recorded);
    assert.equal(q.media[2].path, older);
    assert.equal(
      (await fs.readdir(path.join(dir, "project", "Media"))).length,
      1,
    );
    await collectProject(p, file, { recordingsDirectory: recordings });
    assert.equal(
      (await fs.readdir(path.join(dir, "project", "Media"))).length,
      1,
    );
    assert.equal(await fs.readFile(recorded, "utf8"), "recorded data");
    assert.equal(p.media[0].path, recorded);
    const presetFile = path.join(dir, "preset", "preset.creastudio");
    const stored = await collectProject(p, presetFile, {
      includeRecordings: true,
    });
    assert.ok(stored.media.every((m) => !path.isAbsolute(m.path)));
    assert.equal(
      (await fs.readdir(path.join(dir, "preset", "Media"))).length,
      3,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("successive stingers reuse a free unmuted audio lane and keep both music tails when adjacent", () => {
  const p = make();
  T.addTrack(p);
  p.clips = [
    clip("v", 0, "v", { out: 4 }),
    { ...clip("a", 0, "a", { out: 6, track: 1 }), mediaId: "a" },
  ];
  const preset = T.makeStinger(p, ["v", "a"], "News");
  let q = make();
  q.clips = Array.from({ length: 10 }, (_, i) =>
    clip("news" + i, i * 10, "news" + i),
  );
  for (let i = 0; i < 10; i++)
    q = T.insertStinger(
      q,
      preset,
      q.clips.find((c) => c.id === "news" + i).start,
      0,
      uid,
    ).project;
  assert.equal(T.trackCount(q), 2);
  assert.equal(
    q.clips.filter(
      (c) =>
        c.stingerId && q.media.find((m) => m.id === c.mediaId).kind === "audio",
    ).length,
    10,
  );
  const at = q.clips.find((c) => c.stingerId).start + 4;
  const adjacent = T.insertStinger(q, preset, at, 0, uid).project;
  assert.equal(T.trackCount(adjacent), 3);
  assert.ok(!T.overlaps(adjacent.clips));
});
