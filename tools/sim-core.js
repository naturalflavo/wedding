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


module.exports = { T, VH, GY, H, G, JMP, PW, PH, terrain, stepOnce, loadStages: loadFromSource };
