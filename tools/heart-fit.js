/* 하트 배치 도우미 — 실제 점프 궤적 위에 하트를 놓기 위한 좌표를 뽑는다.
 *
 * "살아남기만 하는 플레이" 의 궤적을 그대로 따라가며 지나가는 칸을 모으고(=자동 획득 →
 * 점수 하한), 그 궤적에서 벗어난 칸도 함께 보여준다(=일부러 가야 하는 자리 → 점수 상한).
 */
const path = require("path");
const sim = require(path.join(__dirname, "sim-core.js"));
const { T, GY, PW, PH, terrain, stepOnce, loadStages } = sim;

const { stages, SPD } = loadStages();

stages.forEach((st, si) => {
  const { solid, inGap } = terrain(st);
  const p = { x: 2 * T, y: (GY - 3) * T, vy: 0, on: false, coy: 0, buf: 0 };
  let held = false;
  const cells = new Set();     // 궤적이 지나간 (tx,ty) — 하트 중심 기준
  const goalX = st.goal * T;
  for (let f = 0; f < 3000; f++) {
    if (p.on) { held = false; if (inGap(Math.floor((p.x + PW + 2) / T))) { p.buf = 8; held = true; } }
    if (!stepOnce(p, held, solid, SPD)) break;
    const cx = p.x + PW / 2, cy = p.y + PH / 2;
    // 하트 중심이 (tx*16+8, ty*16+8) 이므로, 판정범위 안에 들어오는 칸을 역산
    for (let tx = Math.floor((cx - 12) / T); tx <= Math.floor((cx + 12) / T); tx++) {
      for (let ty = 0; ty < GY; ty++) {
        const hx = tx * T + 8, hy = ty * T + 8;
        if (Math.abs(hx - cx) < 12 && Math.abs(hy - cy) < 13) cells.add(tx + "," + ty);
      }
    }
    if (p.x + PW > goalX) break;
  }
  // tx 별로 궤적이 지나간 ty 목록
  const byTx = new Map();
  [...cells].forEach((c) => {
    const [tx, ty] = c.split(",").map(Number);
    if (!byTx.has(tx)) byTx.set(tx, []);
    byTx.get(tx).push(ty);
  });
  const txs = [...byTx.keys()].sort((a, b) => a - b);
  console.log(`\n=== STAGE ${si + 1} ${st.name} — 살아남기 궤적이 지나가는 칸 ===`);
  let line = "";
  txs.forEach((tx) => {
    const tys = byTx.get(tx).sort((a, b) => a - b);
    line += `${tx}:${tys.join("/")}  `;
    if (line.length > 100) { console.log("  " + line); line = ""; }
  });
  if (line) console.log("  " + line);
});
