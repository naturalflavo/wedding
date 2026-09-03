/* 실제 스테이지를 깨는 입력 순서를 뽑는다.
 * 브라우저에서 프레임 단위로 그대로 재생해 게임을 끝까지 진행시키기 위한 것.
 * 출력: 스테이지별 [{f: 프레임, a: "down"|"up"}, ...]
 */
const path = require("path");
const { T, GY, PW, PH, terrain, stepOnce, loadStages } = require(path.join(__dirname, "sim-core.js"));

function solve(st, spd, width = 8000) {
  const { solid } = terrain(st);
  const goalX = st.goal * T;
  const start = { p: { x: 2 * T, y: (GY - 3) * T, vy: 0, on: false, coy: 0, buf: 0 }, held: false, prev: null, act: null };
  let beam = [start];
  const key = (p, h) =>
    `${Math.round(p.x * 2)},${Math.round(p.y * 2)},${Math.round(p.vy * 4)},${p.on ? 1 : 0},${p.coy},${p.buf},${h ? 1 : 0}`;

  for (let f = 0; f < 1600 && beam.length; f++) {
    const next = new Map();
    for (const s of beam) {
      for (const a of (s.held ? ["hold", "up"] : ["none", "down"])) {
        const p = { ...s.p };
        let held = s.held;
        if (a === "down") { p.buf = 8; held = true; }
        else if (a === "up") held = false;
        if (!stepOnce(p, held, solid, spd)) continue;
        const node = { p, held, prev: s, act: a, f };
        if (p.x + PW > goalX) {                       // 골인 — 경로를 되짚어 입력만 추린다
          const seq = [];
          for (let n = node; n && n.prev; n = n.prev)
            if (n.act === "down" || n.act === "up") seq.push({ f: n.f, a: n.act });
          return { frames: f, seq: seq.reverse() };
        }
        const k = key(p, held);
        if (!next.has(k)) next.set(k, node);
      }
    }
    beam = [...next.values()].sort((a, b) => b.p.x - a.p.x).slice(0, width);
  }
  return null;
}

const { stages, SPD, SPD_STEP } = loadStages();
const out = stages.map((st, i) => {
  const r = solve(st, SPD + (SPD_STEP || 0) * i);
  if (!r) throw new Error(`STAGE ${i + 1} 해답을 찾지 못함`);
  console.error(`STAGE ${i + 1} ${st.name}: ${r.frames}프레임 · 입력 ${r.seq.length}회`);
  return r;
});
console.log(JSON.stringify(out));
