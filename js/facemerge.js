/* 家具で割れた区画をまとめる（かつ「家具を図面から一旦外して、壁の線でどこまでが区画か分かるように」・2026-11-23）
 *
 * 今の読み取りは、机・椅子・棚の線も壁と見て床を細かく割る。新しい読み取り（試し）の区画探し（drawing.v2 の元）は、
 * 家具の線（1本線・6m未満の線のかたまり）を外して壁の線だけで区画を作る。
 * ここでは、試しの区画1つの中に今の区画が2つ以上すっぽり入っている所だけ、今の区画をその1つに置き換える（今の区画の数字は、それ以外は変えない）。
 * 試しで消えた区画（更衣室など）は今の区画のまま残る。
 *
 * まとめない所（壁を家具と見間違えた疑いがある所。分からない物はまとめない）：
 *  - 中に入る今の区画に、違う部屋名が2つ以上ある
 *  - 中に入る今の区画の2つ以上に便器・小便器がある（トイレのブース）
 *  - 試しの区画の中に、幅 55cm 以上のドアがある（ちょうつがいが中ほど、または扉の開く所が両方とも中ほど＝中の間仕切りのドア）
 *  - 試しの区画の形が、中に入らないほかの区画（1㎡以上。階段・EV など）にかぶっている
 *  - 試しの区画が輪の形（外まわりの広さが区画の広さの 1.25 倍より大きい＝中に穴がある）
 *  - 中に入る今の区画の広さの合計が、試しの区画の半分に満たない・1.05 倍を超える
 * まとめた区画は split に元の区画と開口を覚えるので、「分ける」で元に戻せる */

const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const segD = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const edgeD = (x, y, P) => { let m = Infinity; for (let i = 0, j = P.length - 1; i < P.length; j = i++) m = Math.min(m, segD(x, y, P[j], P[i])); return m; };
const polyA = P => { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]); return Math.abs(s) / 2; };
/* 形の中に必ず入る点（L字は真ん中が外に出るので、横の線で切った一番広い所のまん中） */
export const inPt = (P) => { let ya = Infinity, yb = -Infinity; P.forEach(q => { ya = Math.min(ya, q[1]); yb = Math.max(yb, q[1]); }); let best = null, bw = -1;
  for (let t = 1; t < 8; t++) { const y = ya + (yb - ya) * t / 8, xs = []; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
    xs.sort((u, v) => u - v); for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > bw) { bw = xs[k + 1] - xs[k]; best = [(xs[k] + xs[k + 1]) / 2, y]; } }
  return best || [P[0][0], P[0][1]]; };

/* 区画の中の間仕切りのドアか。ちょうつがい c が区画の中ほど（ふちから 30cm より内）にあれば中のドア。
 * そうでない時は、円弧のまん中 m から両端（90°の扉なら ±45°）を出し、ちょうつがいと端の中点（扉の開く所か、開いた扉の所）のどちらかが、
 * 区画のふちから 20cm より内にあって、しかも中に入る今の区画の2つのふち（壁の両側）から 20cm 以内なら中のドア。
 * 幅 55cm 未満の円弧（椅子など）は見ない */
const innerDoor = (d, P, mem) => {
  if (!d || !d.c || !((+d.r || 0) >= 0.55)) return false;
  const c = d.c, inn = (x, y, g) => pip(x, y, P) && edgeD(x, y, P) > g;
  if (inn(c[0], c[1], 0.3)) return true;
  if (!d.m) return false;
  const vx = d.m[0] - c[0], vy = d.m[1] - c[1], k = Math.SQRT1_2;
  const e1 = [c[0] + (vx * k - vy * k), c[1] + (vx * k + vy * k)], e2 = [c[0] + (vx * k + vy * k), c[1] + (-vx * k + vy * k)];
  return [e1, e2].some(e => { const x = (c[0] + e[0]) / 2, y = (c[1] + e[1]) / 2;
    return inn(x, y, 0.2) && mem.filter(f => edgeD(x, y, f.poly) <= 0.2).length >= 2; });
};

/* f1（今の区画）が f2（試しの区画）の中にすっぽり入るか */
const inside = (f1, f2) => {
  if (!f1.poly || f1.poly.length < 3 || !(f1.area > 0) || f1.area > f2.area * 1.02) return false;
  const q = inPt(f1.poly); if (!pip(q[0], q[1], f2.poly)) return false;
  let ok = 0; f1.poly.forEach(v => { if (pip(v[0], v[1], f2.poly) || edgeD(v[0], v[1], f2.poly) <= 0.15) ok++; });
  return ok >= f1.poly.length * 0.9;
};

/* faces・open：今の読み取りの区画と開口。v2faces・v2open：試しの区画と開口。
 * 返す物：{ faces, open, merged: [{ i, from: [元の区画の i] }], split: { 新しい i: { faces: [元の区画], open: { i: 開口 } } } } */
export function mergeSplitFaces({ faces, open = {}, v2faces = [], v2open = {}, fixtures = [], doors = [] }) {
  const F = (faces || []).filter(f => f && f.poly && f.poly.length >= 3);
  let next = Math.max(-1, ...(faces || []).map(f => +f.i || 0)) + 1;
  const taken = new Set(), out = [], merged = [], split = {}, op = { ...open };
  const toilets = (fixtures || []).filter(x => x && x.b && (x.t === 'toilet' || x.t === 'urinal')).map(x => [(x.b[0] + x.b[2]) / 2, (x.b[1] + x.b[3]) / 2]);
  const sorted = [...(v2faces || [])].filter(f => f && f.poly && f.poly.length >= 3 && f.area > 0).sort((a, b) => b.area - a.area);
  for (const f2 of sorted) {
    if (polyA(f2.poly) > f2.area * 1.25) continue;
    const mem = F.filter(f1 => !taken.has(f1.i) && !f1.hand && inside(f1, f2));
    if (mem.length < 2) continue;
    /* 試しの区画の形が、中に入らないほかの区画（階段・EV など）までかぶっている時はまとめない */
    const memS = new Set(mem.map(f => f.i));
    if (F.some(g => !memS.has(g.i) && g.area >= 1 && g.area < f2.area && (() => { const q = inPt(g.poly); return pip(q[0], q[1], f2.poly) && edgeD(q[0], q[1], f2.poly) > 0.2; })())) continue;
    const sum = mem.reduce((s, f) => s + f.area, 0);
    if (sum < f2.area * 0.5 || sum > f2.area * 1.05) continue;
    const names = new Set(mem.map(f => String(f.name || '').trim()).filter(Boolean));
    if (names.size >= 2) continue;
    if (mem.filter(f => toilets.some(c => pip(c[0], c[1], f.poly))).length >= 2) continue;
    if ((doors || []).some(d => innerDoor(d, f2.poly, mem))) continue;
    const i = next++, keepOpen = {};
    mem.forEach(f => { taken.add(f.i); const k = String(f.i); if (op[k]) { keepOpen[k] = op[k]; delete op[k]; } });
    const big = [...mem].sort((a, b) => b.area - a.area)[0];
    const nf = { i, name: [...names][0] || f2.name || '', area: f2.area, peri: f2.peri, ch: Math.max(...mem.map(f => +f.ch || 0), +f2.ch || 0), poly: f2.poly.map(p => [p[0], p[1]]), merged: mem.map(f => f.i) };
    if (big && big.name && !nf.name) nf.name = big.name;
    /* 開口：試しの開口（扉の無い開口が周りの3割以上なら、ドアだけ。形が壁に沿っていない時に引きすぎないため） */
    const r2 = (v2open || {})[String(f2.i)] || [], g = r2.filter(r => r.ty !== 'd').reduce((t, r) => t + (+r.len || 0), 0);
    const runs = g >= (+f2.peri || 0) * 0.3 ? r2.filter(r => r.ty === 'd') : r2;
    if (runs.length) op[String(i)] = runs;
    out.push(nf); merged.push({ i, from: mem.map(f => f.i) });
    split[i] = { faces: mem, open: keepOpen };
  }
  if (!merged.length) return { faces, open, merged: [], split: {} };
  return { faces: (faces || []).filter(f => !taken.has(f.i)).concat(out), open: op, merged, split };
}

/* まとめた区画を元の区画に戻す（plan は新しい入れ物を返す） */
export function splitMerged(plan, open, i) {
  const s = plan && plan.split && plan.split[i]; if (!s) return null;
  let no = Math.max(0, ...plan.faces.map(f => +f.no || 0));
  const back = s.faces.map(f => { const n = { ...f, no: ++no }; let x = 0, y = 0; n.poly.forEach(q => { x += q[0]; y += q[1]; }); n.cx = Math.round(x / n.poly.length * 1000) / 1000; n.cy = Math.round(y / n.poly.length * 1000) / 1000; return n; });
  const faces = plan.faces.filter(f => f.i !== i).concat(back);
  const op = { ...(open || {}) }; delete op[String(i)]; Object.assign(op, s.open || {});
  const split = { ...plan.split }; delete split[i];
  return { plan: { ...plan, faces, split }, open: op };
}
