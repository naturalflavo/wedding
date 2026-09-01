/* RUN TO THE ALTAR — 스테이지 검증기
 *
 * dev/index.html 의 STAGES 를 읽어 게임 물리를 그대로 재현하고,
 * 빔 서치로 "사람이 낼 수 있는 최선의 플레이"를 찾는다.
 *
 *   - 스테이지를 실제로 깰 수 있는가
 *   - 하트를 한 판에 전부 먹을 수 있는가  (만점 도달 가능성)
 *   - 대충 하는 플레이는 몇 점을 받는가    (점수 하한 = 편차 확인)
 *
 * 사용: node tools/run-sim.js
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "dev", "index.html");

/* ---------- 게임 상수 (dev/index.html 과 동일해야 한다) ---------- */
const T = 16, VH = 12, GY = 10, H = VH * T;
const G = 0.46, JMP = -9.6;
const PW = 11, PH = 14;

/* ---------- dev/index.html 에서 스테이지·점수 상수 추출 ---------- */
function loadFromSource() {
  const s = fs.readFileSync(SRC, "utf8");
  const a = s.indexOf("const STAGES = [");
  if (a < 0) throw new Error("STAGES 블록을 찾지 못했습니다");
  const b = s.indexOf("\n  ];", a);            // 배열 닫는 줄
  if (b < 0) throw new Error("STAGES 배열의 끝을 찾지 못했습니다");
  const stages = eval(s.slice(a, b + 5).replace("const STAGES =", "") + ";");
  const num = (re, dflt) => { const m = s.match(re); return m ? parseFloat(m[1]) : dflt; };
  return {
    stages,
    SPD:          num(/const G = [\d.]+, SPD = ([\d.]+)/, 2.3),
    CLEAR_BONUS:  num(/const CLEAR_BONUS = (\d+)/, 25),
    HEART_BASE:   num(/const HEART_BASE = (\d+)/, 1),
    COMBO_STEP:   num(/const COMBO_STEP = (\d+)/, 10),
    COMBO_MAX:    num(/const COMBO_MAX = (\d+)/, 1),
    STOMP_BASE:   num(/const STOMP_BASE = (\d+)/, 0),
    STOMP_CHAIN:  num(/const STOMP_CHAIN_MAX = (\d+)/, 1),
    NOHIT_BONUS:  num(/const NOHIT_BONUS = (\d+)/, 0),
    SPD_STEP:     num(/const SPD_STEP = ([\d.]+)/, 0),
  };
}

/* ---------- 스테이지 지형 ---------- */
function terrain(st) {
  const inGap = (tx) => st.gaps.some(([g, w]) => tx >= g && tx < g + w);
  const solid = (tx, ty) => {
    if (tx < 0) return true;
    if (tx >= st.lw) return false;
    if (ty >= GY && ty < VH) return !inGap(tx);
    return st.blocks.some((b) => ty === b[1] && tx >= b[0] && tx < b[0] + b[2]);
  };
  return { inGap, solid };
}

/* ---------- 한 프레임 (게임의 step() 과 같은 순서) ---------- */
function stepOnce(p, held, solid, spd) {
  // 자동 전진
  const nx = p.x + spd;
  const tCol = Math.floor((nx + PW - 1) / T);
  let blocked = false;
  for (let ty = Math.floor(p.y / T); ty <= Math.floor((p.y + PH - 1) / T); ty++) {
    if (solid(tCol, ty)) { blocked = true; break; }
  }
  p.x = blocked ? tCol * T - PW : nx;

  // 점프 (코요테 타임 + 입력 버퍼)
  p.coy = p.on ? 7 : Math.max(0, p.coy - 1);
  p.buf = Math.max(0, p.buf - 1);
  if (p.buf && p.coy) { p.vy = JMP; p.on = false; p.coy = 0; p.buf = 0; }
  if (p.vy < 0 && !held) p.vy *= 0.86;
  p.vy = Math.min(p.vy + G, 11);

  // moveY
  const dy = p.vy;
  p.y += dy;
  p.on = false;
  const c0 = Math.floor(p.x / T), c1 = Math.floor((p.x + PW - 1) / T);
  if (dy > 0) {
    const r = Math.floor((p.y + PH - 1) / T);
    for (let tx = c0; tx <= c1; tx++) if (solid(tx, r)) { p.y = r * T - PH; p.vy = 0; p.on = true; break; }
  } else if (dy < 0) {
    const r = Math.floor(p.y / T);
    for (let tx = c0; tx <= c1; tx++) if (solid(tx, r)) { p.y = (r + 1) * T; p.vy = 0; break; }
  }
  return p.y <= H + 40;   // false = 낭떠러지 추락
}

/* ---------- 1) 스테이지를 깰 수 있는가 (하트는 무시) ----------
   하트까지 같이 최적화하면 "욕심내다 죽는" 갈래가 탐색을 가득 채운다.
   깰 수 있는지와 하트를 먹을 수 있는지는 따로 본다. */
const kClear = (p, h) =>
  `${Math.round(p.x * 2)},${Math.round(p.y * 2)},${Math.round(p.vy * 4)},${p.on ? 1 : 0},${p.coy},${p.buf},${h ? 1 : 0}`;

function clearable(st, spd, width = 6000) {
  const { solid } = terrain(st);
  const goalX = st.goal * T;
  let beam = [{ p: { x: 2 * T, y: (GY - 3) * T, vy: 0, on: false, coy: 0, buf: 0 }, held: false }];
  for (let f = 0; f < 1600 && beam.length; f++) {
    const next = new Map();
    for (const s of beam) {
      for (const a of (s.held ? [true, false] : [false, "press"])) {
        const p = { ...s.p };
        let held = s.held;
        if (a === "press") { p.buf = 8; held = true; } else held = a === true;
        if (!stepOnce(p, held, solid, spd)) continue;
        if (p.x + PW > goalX) return { ok: true, frames: f };
        next.set(kClear(p, held), { p, held });
      }
    }
    beam = [...next.values()].sort((a, b) => b.p.x - a.p.x).slice(0, width);
  }
  return { ok: false, frames: -1 };
}

/* ---------- 2) 하트 하나하나가 정말 닿는 자리인가 ----------
   하트 앞 지상에서 출발해 "언제 누르고 얼마나 오래 누를지" 를 전부 시도해 본다.
   먹은 뒤에도 살아남아야 도달 가능으로 친다. */
function heartReachable(st, hx, hy, spd) {
  const { solid, inGap } = terrain(st);
  const heartTx = Math.floor(hx / T);
  // 출발점과 하트 사이에 낭떠러지가 끼면 한 번의 점프로는 검증할 수 없다.
  // 낭떠러지 위 하트는 그 낭떠러지 직전에서, 나머지는 마지막 낭떠러지 다음부터 출발한다.
  const onGap = st.gaps.find(([g, w]) => heartTx >= g && heartTx < g + w);
  let startTx;
  if (onGap) {
    startTx = onGap[0] - 1;
  } else {
    startTx = Math.max(2, heartTx - 11);
    for (let tx = startTx; tx < heartTx; tx++) if (inGap(tx)) startTx = tx + 1;
  }
  if (startTx < 2) startTx = 2;
  if (inGap(startTx)) return false;

  for (let delay = 0; delay < 130; delay++) {
    for (let hold = 0; hold <= 30; hold++) {
      const p = { x: startTx * T, y: (GY) * T - PH, vy: 0, on: true, coy: 7, buf: 0 };
      let got = false, alive = true;
      for (let f = 0; f < 190; f++) {
        if (f === delay) p.buf = 8;
        const held = f >= delay && f < delay + hold;
        if (!stepOnce(p, held, solid, spd)) { alive = false; break; }
        const cx = p.x + PW / 2, cy = p.y + PH / 2;
        if (Math.abs(hx - cx) < 12 && Math.abs(hy - cy) < 13) got = true;
        if (got && p.on) return true;              // 먹고 무사히 착지
        if (p.x > hx + 6 * T && p.on) break;       // 지나쳤다
      }
      if (got && alive) return true;
    }
  }
  return false;
}

/* ---------- 살아남기만 하는 플레이: 낭떠러지 직전에 끝까지 눌러 점프 ----------
   하트를 노리지 않고 그냥 완주하는 "보통 하객" 의 기대 점수를 재기 위한 것. */
function lazyRun(st, spd) {
  const { solid, inGap } = terrain(st);
  const hearts = st.hearts.map(([x, y]) => ({ x: x * T + 8, y: y * T + 8, got: false }));
  const p = { x: 2 * T, y: (GY - 3) * T, vy: 0, on: false, coy: 0, buf: 0 };
  let got = 0, held = false, combo = 0, pts = 0, missed = 0;
  const goalX = st.goal * T;
  for (let f = 0; f < 3000; f++) {
    // 발 앞 타일이 낭떠러지면 바로 누르고, 착지할 때까지 계속 누른다
    if (p.on) {
      held = false;
      if (inGap(Math.floor((p.x + PW + 2) / T))) { p.buf = 8; held = true; }
    }
    if (!stepOnce(p, held, solid, spd)) return { got, pts, cleared: false };
    const cx = p.x + PW / 2, cy = p.y + PH / 2;
    for (const h of hearts) {
      if (h.got || h.miss) continue;
      if (Math.abs(h.x - cx) < 12 && Math.abs(h.y - cy) < 13) {
        h.got = true; got++; combo++;
        pts += HEART_BASE_C * Math.min(COMBO_MAX_C, 1 + Math.floor(combo / COMBO_STEP_C));
      } else if (h.x < p.x - 8) { h.miss = true; missed++; combo = 0; }
    }
    if (p.x + PW > goalX) return { got, pts, cleared: true };
  }
  return { got, pts, cleared: false };
}

/* ---------- 점수 ---------- */
let HEART_BASE_C = 2, COMBO_STEP_C = 10, COMBO_MAX_C = 3;
function heartPoints(n) {                 // 하트 n 개를 한 번도 안 놓치고 먹었을 때
  let pts = 0;
  for (let i = 1; i <= n; i++) pts += HEART_BASE_C * Math.min(COMBO_MAX_C, 1 + Math.floor(i / COMBO_STEP_C));
  return pts;
}

/* ---------- 실행 ---------- */
const C = loadFromSource();
HEART_BASE_C = C.HEART_BASE; COMBO_STEP_C = C.COMBO_STEP; COMBO_MAX_C = C.COMBO_MAX;

console.log("스테이지 검증 — dev/index.html\n");
console.log(`점수 상수: 하트 ${C.HEART_BASE} × 배수(10개마다 ↑, 최대 ×${C.COMBO_MAX})`
  + ` · 밟기 ${C.STOMP_BASE} · 클리어 ${C.CLEAR_BONUS} · 무사고 ${C.NOHIT_BONUS}\n`);

let allHearts = 0, bestHearts = 0, allBugs = 0, ok = true;
let lazyPts = 0, lazyCleared = 0;

C.stages.forEach((st, i) => {
  const spd = C.SPD + C.SPD_STEP * i;
  const cl = clearable(st, spd);
  const lazy = lazyRun(st, spd);
  const bad = [];
  st.hearts.forEach(([hx, hy]) => {
    if (!heartReachable(st, hx * T + 8, hy * T + 8, spd)) bad.push(`${hx},${hy}`);
  });
  allHearts += st.hearts.length; allBugs += st.bugs.length;
  bestHearts += st.hearts.length - bad.length;
  if (lazy.cleared) { lazyPts += lazy.pts + C.CLEAR_BONUS; lazyCleared++; }
  if (!cl.ok || bad.length) ok = false;
  const gapW = [...new Set(st.gaps.map((g) => g[1]))].sort();
  console.log(
    `STAGE ${i + 1} ${st.name}  (속도 ${spd.toFixed(2)} · 갭폭 ${gapW.join("/")}타일 · 버그 ${st.bugs.length})\n` +
    `  클리어   : ${cl.ok ? `가능 (최단 ${(cl.frames / 60).toFixed(1)}초)` : "★★ 불가능"}\n` +
    `  하트     : ${st.hearts.length - bad.length}/${st.hearts.length} 도달 가능` +
      (bad.length ? `  ★ 닿지 않는 자리: ${bad.join(" ")}` : "") + `\n` +
    `  살아남기 : ${lazy.cleared ? `클리어 O · 하트 ${lazy.got}/${st.hearts.length} · ${lazy.pts + C.CLEAR_BONUS}점` : "★ 낭떠러지에 빠짐"}`
  );
});

// ── 예상 점수 분포 ────────────────────────────────────────────────
const nStage = C.stages.length;
// 콤보는 스테이지가 바뀌면 초기화되므로 스테이지 단위로 계산한다
const perfect = C.stages.reduce((a, st) => a + heartPoints(st.hearts.length), 0)
              + allBugs * C.STOMP_BASE + nStage * C.CLEAR_BONUS + nStage * C.NOHIT_BONUS;
const good = C.stages.reduce((a, st) => a + heartPoints(Math.round(st.hearts.length * 0.85)), 0)
           + Math.round(allBugs * 0.4) * C.STOMP_BASE
           + nStage * C.CLEAR_BONUS + Math.floor(nStage / 2) * C.NOHIT_BONUS;
const chainMax = C.stages.reduce((a, st) => a + heartPoints(st.hearts.length), 0)
               + allBugs * C.STOMP_BASE * Math.pow(2, C.STOMP_CHAIN - 1)
               + nStage * C.CLEAR_BONUS + nStage * C.NOHIT_BONUS;

console.log(`\n하트 합계: 최선 ${bestHearts} / 전체 ${allHearts} · 버그 ${allBugs}마리`);
console.log("\n예상 점수 분포");
console.log(`  살아남기만  : ${lazyPts}점   ${lazyCleared < nStage ? "(봇이 " + (nStage - lazyCleared) + "개 스테이지에서 실패해 과소평가)" : ""}`);
console.log(`  꽤 잘함     : ${good}점`);
console.log(`  완벽        : ${perfect}점`);
console.log(`  이론상 최대 : ${chainMax}점  (모든 버그를 최대 체인으로 밟았을 때)`);
console.log(`                 ← Firestore 규칙의 점수 상한은 이보다 커야 한다`);
console.log(`  편차        : ${perfect - lazyPts}점 (이전 체계는 18점)`);
console.log(ok ? "\n✅ 모든 스테이지 클리어 가능 · 하트 전부 도달 가능"
              : "\n❌ 도달 불가능한 하트 또는 클리어 불가 스테이지가 있습니다");
process.exit(ok ? 0 : 1);
