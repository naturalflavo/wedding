/* 하트 자동 배치 — 지형(낭떠러지·발판)만 손으로 설계하고, 하트는 규칙으로 깐다.
 *
 *   자동 획득분 : 그냥 완주해도 지나가는 자리 (바닥, 낭떠러지 점프의 정점)  → 점수 하한
 *   일부러 가는분: 궤적에서 벗어난 공중·발판 위                            → 점수 상한
 *
 * 사용: node tools/gen-hearts.js   → STAGES 의 hearts 배열을 출력
 */
const path = require("path");
const { T, GY, PW, terrain, stepOnce } = require(path.join(__dirname, "sim-core.js"));
const SPD_BASE = 2.3, SPD_STEP = 0.2;

/* 살아남기만 하는 플레이가 지나가는 칸 */
function survivePath(st, SPD) {
  const { solid, inGap } = terrain(st);
  const p = { x: 2 * T, y: (GY - 3) * T, vy: 0, on: false, coy: 0, buf: 0 };
  let held = false;
  const seen = new Set();
  const goalX = st.goal * T;
  for (let f = 0; f < 3000; f++) {
    if (p.on) { held = false; if (inGap(Math.floor((p.x + PW + 2) / T))) { p.buf = 8; held = true; } }
    if (!stepOnce(p, held, solid, SPD)) break;
    const cx = p.x + PW / 2, cy = p.y + 7;
    for (let tx = Math.floor((cx - 12) / T); tx <= Math.floor((cx + 12) / T); tx++)
      for (let ty = 0; ty < GY; ty++)
        if (Math.abs(tx * T + 8 - cx) < 12 && Math.abs(ty * T + 8 - cy) < 13) seen.add(tx + "," + ty);
    if (p.x + PW > goalX) break;
  }
  return seen;
}

function genHearts(st, opt, SPD) {
  const { inGap } = terrain(st);
  const onPath = survivePath(st, SPD);
  const hearts = [];
  const used = new Set();
  const add = (tx, ty) => {
    const k = tx + "," + ty;
    if (used.has(k) || tx < 4 || tx > st.goal - 2) return;
    used.add(k); hearts.push([tx, ty]);
  };
  const blockTop = (tx) => {
    const b = st.blocks.find((b) => tx >= b[0] && tx < b[0] + b[2]);
    return b ? b[1] : null;
  };

  // 1) 자동 획득 — 낭떠러지 점프의 정점 (궤적 위)
  st.gaps.forEach(([g, w]) => {
    let n = 0;
    for (let d = 0; d <= w && n < 2; d++) {
      const tx = g + d;
      for (const ty of [3, 4, 5]) if (onPath.has(tx + "," + ty)) { add(tx, ty); n++; break; }
    }
  });

  // 2) 자동 획득 — 평지 바닥
  for (let tx = 5; tx < st.goal; tx += opt.groundEvery)
    if (!inGap(tx) && blockTop(tx) === null && onPath.has(tx + ",9")) add(tx, 9);

  // 3) 일부러 가는 하트 — 발판 위 (궤적 밖)
  st.blocks.forEach(([bx, by, bw]) => {
    let n = 0;
    for (let i = 0; i < bw && n < 2; i++) {
      const ty = by - 1;                       // 발판에 올라섰을 때 몸 중심이 오는 칸
      if (!onPath.has(bx + i + "," + ty)) { add(bx + i, ty); n++; }
    }
  });

  // 4) 일부러 가는 하트 — 평지 위 공중 (궤적 밖이라 일부러 점프해야 닿는다)
  for (let tx = 8; tx < st.goal - 2; tx += opt.airEvery) {
    if (inGap(tx) || inGap(tx + 1) || inGap(tx - 1) || blockTop(tx) !== null) continue;
    for (const ty of opt.airTy) if (!onPath.has(tx + "," + ty)) { add(tx, ty); break; }
  }

  // 5) 골 직전 마무리
  add(st.goal - 3, 9);
  hearts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const auto = hearts.filter(([x, y]) => onPath.has(x + "," + y)).length;

  // 반지 — 스테이지당 하나. 궤적에서 벗어난 발판 위라 일부러 올라가야 닿는다.
  let ring = null;
  for (const [bx, by, bw] of st.blocks) {
    for (let i = 0; i < bw; i++) {
      const tx = bx + i, ty = by - 1;
      if (!onPath.has(tx + "," + ty) && !used.has(tx + "," + ty)) { ring = [tx, ty]; break; }
    }
    if (ring) break;
  }
  return { hearts, auto, extra: hearts.length - auto, ring };
}

/* ── 지형은 손으로 설계한다 ── */
const LAYOUT = [
  { name: "첫 걸음", lw: 124, goal: 116,
    gaps: [[18, 2], [34, 2], [52, 3], [70, 3], [88, 3], [104, 2]],
    blocks: [[44, 8, 4], [80, 7, 3]],
    bugs: [26, 42, 60, 76, 96, 110],
    opt: { groundEvery: 11, airEvery: 13, airTy: [6, 5] } },

  { name: "함께 걸은 길", lw: 140, goal: 132,
    gaps: [[16, 3], [32, 3], [50, 4], [68, 3], [86, 4], [104, 3], [120, 4]],
    blocks: [[42, 8, 4], [78, 7, 3], [96, 8, 3]],
    bugs: [24, 40, 46, 62, 76, 94, 112, 128],
    opt: { groundEvery: 12, airEvery: 11, airTy: [6, 5] } },

  { name: "마지막 언덕", lw: 148, goal: 140,
    gaps: [[14, 3], [28, 4], [44, 3], [58, 4], [74, 3], [88, 4], [104, 3], [118, 4], [132, 3]],
    blocks: [[22, 7, 3], [38, 8, 3], [68, 7, 3], [98, 8, 3], [126, 7, 3]],
    bugs: [20, 34, 50, 52, 66, 80, 82, 96, 110, 124, 138],
    opt: { groundEvery: 13, airEvery: 10, airTy: [5, 6] } },
];

const fmt = (hs) => {
  const parts = hs.map(([x, y]) => `[${x}, ${y}]`);
  const lines = [];
  for (let i = 0; i < parts.length; i += 7) lines.push("               " + parts.slice(i, i + 7).join(", "));
  return lines.join(",\n").replace(/^ {15}/, "");
};

let totAuto = 0, totAll = 0;
LAYOUT.forEach((st, i) => {
  const { hearts, auto, extra, ring } = genHearts(st, st.opt, SPD_BASE + SPD_STEP * i);
  totAuto += auto; totAll += hearts.length;
  console.error(`STAGE ${i + 1} ${st.name}: 하트 ${hearts.length}개 (자동 ${auto} / 일부러 ${extra})`
    + ` · 반지 ${ring ? ring.join(",") : "없음 ★"}`);
  console.log(`    { // ${i + 1}. ${st.name}`);
  console.log(`      name: "${st.name}", lw: ${st.lw}, goal: ${st.goal},`);
  console.log(`      gaps: [${st.gaps.map((g) => `[${g[0]}, ${g[1]}]`).join(", ")}],`);
  console.log(`      blocks: [${st.blocks.map((b) => `[${b[0]}, ${b[1]}, ${b[2]}]`).join(", ")}],`);
  console.log(`      bugs: [${st.bugs.join(", ")}],`);
  console.log(`      hearts: [${fmt(hearts)}],`);
  console.log(`      rings: [${ring ? `[${ring[0]}, ${ring[1]}]` : ""}],`);
  console.log(`    },`);
});
console.error(`\n합계: ${totAll}개 (자동 ${totAuto} / 일부러 ${totAll - totAuto})`);
