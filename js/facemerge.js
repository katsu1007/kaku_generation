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
 *  - 階段（名前・中の文字が階段・上り・下り・UP・DN、または踏み面の列が広い所に飲み込まれる。むぎの設計）
 *  - 試しの区画の形が、中に入らないほかの区画（1㎡以上。階段・EV など）にかぶっている
 *  - 試しの区画が輪の形（外まわりの広さが区画の広さの 1.25 倍より大きい＝中に穴がある）
 *  - 中に入る今の区画の広さの合計が、試しの区画の35%に満たない・1.05 倍を超える（机の多い事務所は、今の区画が机の下を抜くので半分くらいになる・大天）
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
const innerDoor = (d, P, mem, segs) => {
  if (!d || !d.c || !((+d.r || 0) >= 0.55)) return false;
  const c = d.c, inn = (x, y, g) => pip(x, y, P) && edgeD(x, y, P) > g;
  if (inn(c[0], c[1], 0.3)) return true;
  if (!d.m) return false;
  const vx = d.m[0] - c[0], vy = d.m[1] - c[1], k = Math.SQRT1_2;
  const e1 = [c[0] + (vx * k - vy * k), c[1] + (vx * k + vy * k)], e2 = [c[0] + (vx * k + vy * k), c[1] + (-vx * k + vy * k)];
  /* 扉の板の線（ちょうつがいから円弧の端までの線）がある方は開いた扉の所。もう片方が壁の開口（扉の開く所）なので、そちらだけ見る（大天の会議室：部屋の外まわりの壁の両開きの扉で、開いた板の所を中の間仕切りと見ていた） */
  const leaf = e => (segs || []).some(q => { const a = [q[0], q[1]], b = [q[2], q[3]], dd = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
    return (dd(a, c) <= 0.05 && dd(b, e) <= 0.1) || (dd(b, c) <= 0.05 && dd(a, e) <= 0.1); });
  let E = [e1, e2]; if (segs) { const l1 = leaf(e1), l2 = leaf(e2); if (l1 !== l2) E = [l1 ? e2 : e1]; }
  return E.some(e => { const x = (c[0] + e[0]) / 2, y = (c[1] + e[1]) / 2;
    return inn(x, y, 0.2) && mem.filter(f => edgeD(x, y, f.poly) <= 0.2).length >= 2; });
};

/* 階段の踏み面の列を探す（むぎの実測と設計・docs/from-muse-2026-11-23b.md）。
 * 長さ 0.55〜1.8m の線で、向きがそろい（3.5°以内）、長さ方向に短い方の 70% 以上重なり、間隔 18〜33cm（ばらつき 3.5cm 以内）で5本以上並ぶ物（4本だと、窓ぎわの縦の線・棚の線で誤って見つけたため・くらちゃん。4本の階段は名前・文字で止める）。
 * 重なりの条件が、机・棚の列（同じ間隔でも長さ方向にずれて並ぶ）と分ける決め手。さらに両端が 10cm 以内でそろうこと（机の木目で誤って見つけたため・くらちゃん）。返す物：[{ cx, cy, area（列の箱の広さ）, n }] */
export function treadRows(segs) {
  const C = [];
  (segs || []).forEach(s => { if (!s || s.length < 4) return; const dx = s[2] - s[0], dy = s[3] - s[1], L = Math.hypot(dx, dy); if (L < 0.55 || L > 1.8) return;
    let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI; if (a >= Math.PI) a -= Math.PI;
    C.push({ s, L, a }); });
  if (C.length < 4) return [];
  const B = new Map(), bw = 3.5 * Math.PI / 180, nb = Math.ceil(Math.PI / bw);
  C.forEach((c, k) => { const b = Math.floor(c.a / bw) % nb; (B.get(b) || B.set(b, []).get(b)).push(k); });
  const rows = [], used = new Set();
  for (const [b, ks] of B) {
    const pool = [...ks, ...(B.get((b + 1) % nb) || [])];
    if (pool.length < 4) continue;
    const a0 = C[ks[0]].a, ux = Math.cos(a0), uy = Math.sin(a0), nx = -uy, ny = ux;
    const P = pool.filter(k => Math.abs(((C[k].a - a0 + Math.PI * 1.5) % Math.PI) - Math.PI / 2) <= bw).map(k => { const s = C[k].s, t1 = s[0] * ux + s[1] * uy, t2 = s[2] * ux + s[3] * uy;
      return { k, p: ((s[0] + s[2]) / 2) * nx + ((s[1] + s[3]) / 2) * ny, t0: Math.min(t1, t2), t1: Math.max(t1, t2) }; }).sort((x, y) => x.p - y.p);
    /* 踏み面は同じ幅の階段の中なので、両端がそろう（10cm 以内。机の木目・棚の線は端がばらばら） */
    const ov = (x, y) => (Math.min(x.t1, y.t1) - Math.max(x.t0, y.t0)) >= 0.7 * Math.min(x.t1 - x.t0, y.t1 - y.t0) && Math.abs(x.t0 - y.t0) <= 0.1 && Math.abs(x.t1 - y.t1) <= 0.1;
    for (let i = 0; i < P.length; i++) {
      if (used.has(P[i].k)) continue;
      const ch = [P[i]];
      for (;;) { const last = ch[ch.length - 1]; let best = null;
        for (let j = i + 1; j < P.length && P[j].p <= last.p + 0.33; j++) { const q = P[j]; if (q.p < last.p + 0.18 || used.has(q.k) || !ov(last, q)) continue;
          const want = ch.length > 1 ? (ch[ch.length - 1].p - ch[0].p) / (ch.length - 1) : null;
          if (want != null && Math.abs((q.p - last.p) - want) > 0.035) continue;
          if (!best || Math.abs(q.p - last.p - (want || 0.25)) < Math.abs(best.p - last.p - (want || 0.25))) best = q; }
        if (!best) break; ch.push(best); }
      if (ch.length < 5) continue;
      const gaps = ch.slice(1).map((q, m) => q.p - ch[m].p), g = gaps.reduce((t, v) => t + v, 0) / gaps.length;
      if (Math.max(...gaps.map(v => Math.abs(v - g))) > 0.035) continue;
      ch.forEach(q => used.add(q.k));
      const t0 = Math.min(...ch.map(q => q.t0)), t1 = Math.max(...ch.map(q => q.t1)), pc = (ch[0].p + ch[ch.length - 1].p) / 2, tc = (t0 + t1) / 2;
      rows.push({ cx: tc * ux + pc * nx, cy: tc * uy + pc * ny, area: (t1 - t0) * (ch[ch.length - 1].p - ch[0].p), n: ch.length });
    }
  }
  return rows;
}
const STAIR = /階段|上り|下り|^UP$|^DN$/i;

/* f1（今の区画）が f2（試しの区画）の中にすっぽり入るか */
const inside = (f1, f2) => {
  if (!f1.poly || f1.poly.length < 3 || !(f1.area > 0) || f1.area > f2.area * 1.02) return false;
  const q = inPt(f1.poly); if (!pip(q[0], q[1], f2.poly)) return false;
  let ok = 0; f1.poly.forEach(v => { if (pip(v[0], v[1], f2.poly) || edgeD(v[0], v[1], f2.poly) <= 0.15) ok++; });
  return ok >= f1.poly.length * 0.9;
};

/* faces・open：今の読み取りの区画と開口。v2faces・v2open：試しの区画と開口。
 * 返す物：{ faces, open, merged: [{ i, from: [元の区画の i] }], split: { 新しい i: { faces: [元の区画], open: { i: 開口 } } } } */
export function mergeSplitFaces({ faces, open = {}, v2faces = [], v2open = {}, fixtures = [], doors = [], segs = null, texts = [], why = null, minSum = 0.35 }) {
  const no = (f2, r) => { if (why) why.push({ i: f2.i, area: Math.round(f2.area * 10) / 10, r }); };
  const treads = segs ? treadRows(segs) : [];
  const stairTx = (texts || []).filter(t => t && STAIR.test(String(t.t || '').trim()));
  const F = (faces || []).filter(f => f && f.poly && f.poly.length >= 3);
  let next = Math.max(-1, ...(faces || []).map(f => +f.i || 0)) + 1;
  const taken = new Set(), out = [], merged = [], split = {}, op = { ...open };
  const toilets = (fixtures || []).filter(x => x && x.b && (x.t === 'toilet' || x.t === 'urinal')).map(x => [(x.b[0] + x.b[2]) / 2, (x.b[1] + x.b[3]) / 2]);
  const sorted = [...(v2faces || [])].filter(f => f && f.poly && f.poly.length >= 3 && f.area > 0).sort((a, b) => b.area - a.area);
  for (const f2 of sorted) {
    if (polyA(f2.poly) > f2.area * 1.25) { no(f2, 'ring'); continue; }
    const mem = F.filter(f1 => !taken.has(f1.i) && !f1.hand && inside(f1, f2));
    if (mem.length < 2) { if (mem.length) no(f2, 'one'); continue; }
    /* 試しの区画の形が、中に入らないほかの区画（階段・EV など）までかぶっている時はまとめない */
    const memS = new Set(mem.map(f => f.i));
    if (F.some(g => !memS.has(g.i) && g.area >= 1 && g.area < f2.area && (() => { const q = inPt(g.poly); return pip(q[0], q[1], f2.poly) && edgeD(q[0], q[1], f2.poly) > 0.2; })())) { no(f2, 'cover'); continue; }
    const sum = mem.reduce((s, f) => s + f.area, 0);
    if (sum < f2.area * minSum || sum > f2.area * 1.05) { no(f2, 'sum ' + Math.round(sum / f2.area * 100)); continue; }
    const names = new Set(mem.map(f => String(f.name || '').trim()).filter(Boolean));
    if (names.size >= 2) { no(f2, 'names ' + [...names].join('/')); continue; }
    if (mem.filter(f => toilets.some(c => pip(c[0], c[1], f.poly))).length >= 2) { no(f2, 'booth'); continue; }
    if ((doors || []).some(d => innerDoor(d, f2.poly, mem, segs))) { no(f2, 'door'); continue; }
    /* 階段：区画の名前・中の文字が「階段・上り・下り・UP・DN」、または踏み面の列が試しの区画の中にあって区画の4割未満（広い所に飲み込まれる）の時はまとめない */
    if (mem.some(f => /階段/.test(String(f.name || ''))) || stairTx.some(t => pip(t.x, t.y, f2.poly))) { no(f2, 'stairtext'); continue; }
    if (treads.some(r => pip(r.cx, r.cy, f2.poly) && r.area < f2.area * 0.4)) { no(f2, 'tread'); continue; }
    const i = next++, keepOpen = {};
    mem.forEach(f => { taken.add(f.i); const k = String(f.i); if (op[k]) { keepOpen[k] = op[k]; delete op[k]; } });
    const big = [...mem].sort((a, b) => b.area - a.area)[0];
    const area = f2.area;
    const nf = { i, name: [...names][0] || f2.name || '', area, peri: f2.peri, ch: Math.max(...mem.map(f => +f.ch || 0), +f2.ch || 0), poly: f2.poly.map(p => [p[0], p[1]]), merged: mem.map(f => f.i) };
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
