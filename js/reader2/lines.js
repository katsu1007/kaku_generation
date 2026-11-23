/* 新しい読み取り・段階3：線のまとまり（レイヤー＋色＋線種）ごとに役割を見分ける（画面に触らない）。
 * 線1本ずつではなく、まとまりごとに決める。今の読み取りは、まとまりごとの「使う・使わない」を元から持っているので、
 * 中身は変えずに選び方だけを変えて、区画探しをもう一度回す（回すのは legacy.js）。
 * 壁と決めるのではなく、「壁ではなさそうな物」だけを外す。決め手が無いまとまりは今まで通り使う。
 *   segs   [[x1, y1, x2, y2, まとまりの番号], …]（m）
 *   groups [{ on }]（今の読み取りが使っているか）
 *   texts  [{ t, x, y }]
 *   regions 段階1で見つけた図枠・表・表題欄 [{ type, box }] */
export const ROLE = { tiny: '細かい線（器具・曲線）', dim: '寸法の線', sheet: '表・図枠の線', furn: '壁から離れた線（家具・通り芯など）' };

export function groupStats({ segs = [], groups = [], texts = [], regions = [] } = {}) {
  const regs = regions.filter(r => r.type === 'table' || r.type === 'title').map(r => r.box), frames = regions.filter(r => r.type === 'frame').map(r => r.box);
  /* 寸法の数字（2〜7桁の数字だけの文字）を 0.5m のマスに入れて、線の真ん中の近く（35cm以内）にあるか見る */
  const grid = new Map(), key = (a, b) => a + ',' + b;
  texts.forEach(t => { if (!/^[\d,]{2,7}$/.test(String(t.t || ''))) return; const k = key(Math.round(t.x / 0.5), Math.round(t.y / 0.5)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); });
  const numNear = (x, y) => { const gx = Math.round(x / 0.5), gy = Math.round(y / 0.5); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = grid.get(key(gx + dx, gy + dy)); if (a && a.some(t => Math.abs(t.x - x) <= 0.35 && Math.abs(t.y - y) <= 0.35)) return true; } return false; };
  const near = (a, b) => Math.abs(a - b) < 0.03;
  const S = groups.map((g, gi) => ({ gi, on: !!(g && g.on), n: 0, tot: 0, short: 0, reg: 0, dim: 0 }));
  segs.forEach(s => {
    const o = S[s[4]]; if (!o) return;
    const l = Math.hypot(s[2] - s[0], s[3] - s[1]), mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2;
    o.n++; o.tot += l; if (l < 0.15) o.short++;
    if (regs.some(b => mx >= b[0] - 0.05 && mx <= b[2] + 0.05 && my >= b[1] - 0.05 && my <= b[3] + 0.05)) o.reg += l;
    else if (frames.some(b => (near(s[0], b[0]) && near(s[2], b[0])) || (near(s[0], b[2]) && near(s[2], b[2])) || (near(s[1], b[1]) && near(s[3], b[1])) || (near(s[1], b[3]) && near(s[3], b[3])))) o.reg += l;
    if (l >= 0.3 && numNear(mx, my)) o.dim += l;
  });
  return S.filter(o => o.n).map(o => ({ gi: o.gi, on: o.on, n: o.n, tot: o.tot, mean: o.tot / o.n, short: o.short / o.n, sheet: o.tot ? o.reg / o.tot : 0, dim: o.tot ? o.dim / o.tot : 0 }));
}

/* 役割：今使っているまとまりのうち、壁ではなさそうな物だけ返す { まとまりの番号: 役割 } */
export function roleOf(o) {
  if (!o.on) return null;
  if (o.mean < 0.03 || (o.short >= 0.97 && o.n >= 200)) return 'tiny';
  if (o.dim >= 0.45) return 'dim';
  if (o.sheet >= 0.6) return 'sheet';
  return null;
}
/* 壁のまとまりを見つける：2本線（間 5〜35cm・どちらも 50cm 以上・重なり 30cm 以上）の長さがいちばん多いまとまりを壁とみる。
 * ほかのまとまりは、線の真ん中が壁の線から 30cm 以内にある割合（窓・建具の枠・柱）か、2本線の長さ（ほかの壁のレイヤー）で残す。
 * どちらでもないまとまり（家具・棚・通り芯など、壁から離れた所に描いてある物）は使わない（かつ「区画は壁で囲まれた大きな所」・2026-11-23） */
export function wallGroups(segs, cand) {
  const C = 1, cell = new Map(), key = (a, b) => a + ',' + b;
  const L = segs.map(s => Math.hypot(s[2] - s[0], s[3] - s[1]));
  const add = (k, v) => { let a = cell.get(k); if (!a) cell.set(k, a = []); a.push(v); };
  segs.forEach((s, i) => { if (!cand.has(s[4]) || L[i] < 0.5) return;
    const x0 = Math.floor(Math.min(s[0], s[2]) / C), x1 = Math.floor(Math.max(s[0], s[2]) / C), y0 = Math.floor(Math.min(s[1], s[3]) / C), y1 = Math.floor(Math.max(s[1], s[3]) / C);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) return; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) add(key(x, y), i); });
  const pairLen = {}, paired = new Uint8Array(segs.length);
  segs.forEach((s, i) => { if (!cand.has(s[4]) || L[i] < 0.5 || L[i] > 25) return;
    const ux = (s[2] - s[0]) / L[i], uy = (s[3] - s[1]) / L[i], seen = new Set();
    const x0 = Math.floor((Math.min(s[0], s[2]) - .4) / C), x1 = Math.floor((Math.max(s[0], s[2]) + .4) / C), y0 = Math.floor((Math.min(s[1], s[3]) - .4) / C), y1 = Math.floor((Math.max(s[1], s[3]) + .4) / C);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 600) return;
    for (let x = x0; x <= x1 && !paired[i]; x++) for (let y = y0; y <= y1 && !paired[i]; y++) { const a = cell.get(key(x, y)); if (!a) continue;
      for (const j of a) { if (j === i || seen.has(j) || segs[j][4] !== s[4]) continue; seen.add(j); const t = segs[j];
        const vx = (t[2] - t[0]) / L[j], vy = (t[3] - t[1]) / L[j]; if (Math.abs(ux * vy - uy * vx) > 0.03) continue;
        const d = Math.abs((t[0] - s[0]) * uy - (t[1] - s[1]) * ux); if (d < 0.05 || d > 0.35) continue;
        const p1 = (t[0] - s[0]) * ux + (t[1] - s[1]) * uy, p2 = (t[2] - s[0]) * ux + (t[3] - s[1]) * uy;
        if (Math.min(L[i], Math.max(p1, p2)) - Math.max(0, Math.min(p1, p2)) >= 0.3) { paired[i] = 1; break; } } }
    if (paired[i]) pairLen[s[4]] = (pairLen[s[4]] || 0) + L[i]; });
  let W = -1; Object.keys(pairLen).forEach(g => { if (W < 0 || pairLen[g] > pairLen[W]) W = +g; });
  if (W < 0 || pairLen[W] < 20) return null;
  /* 壁につながっているか：線の端が、同じまとまりの線か壁の線から 3cm 以内ならつなぐ。壁のまとまりを含むつながりに入る線を「壁につながる」とみる
   * （ブースの仕切り・間仕切りは壁につながる。机・椅子・通り芯は離れている） */
  const dseg = (x, y, t) => { const dx = t[2] - t[0], dy = t[3] - t[1], l2 = dx * dx + dy * dy || 1e-12, u = Math.max(0, Math.min(1, ((x - t[0]) * dx + (y - t[1]) * dy) / l2)); return Math.hypot(t[0] + u * dx - x, t[1] + u * dy - y); };
  const C2 = 0.5, ec = new Map();
  segs.forEach((s, i) => { if (!cand.has(s[4])) return;
    const x0 = Math.floor((Math.min(s[0], s[2]) - .03) / C2), x1 = Math.floor((Math.max(s[0], s[2]) + .03) / C2), y0 = Math.floor((Math.min(s[1], s[3]) - .03) / C2), y1 = Math.floor((Math.max(s[1], s[3]) + .03) / C2);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) return; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = key(x, y); let a = ec.get(k); if (!a) ec.set(k, a = []); a.push(i); } });
  /* 線の端どうしの近さ（3cm）を先に全部出しておく */
  const touch = []; segs.forEach((s, i) => { if (!cand.has(s[4])) return; [[s[0], s[1]], [s[2], s[3]]].forEach(([x, y]) => { const a = ec.get(key(Math.floor(x / C2), Math.floor(y / C2))); if (!a) return;
    for (const j of a) if (j !== i && dseg(x, y, segs[j]) <= 0.03) touch.push(i, j); }); });
  const onwOf = ref => { const wc = new Map(); segs.forEach((s, i) => { if (!ref.has(s[4])) return;
      const x0 = Math.floor((Math.min(s[0], s[2]) - .3) / C2), x1 = Math.floor((Math.max(s[0], s[2]) + .3) / C2), y0 = Math.floor((Math.min(s[1], s[3]) - .3) / C2), y1 = Math.floor((Math.max(s[1], s[3]) + .3) / C2);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 8000) return; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = key(x, y); let a = wc.get(k); if (!a) wc.set(k, a = []); a.push(i); } });
    const o = {}; segs.forEach((s, i) => { const g = s[4]; if (!cand.has(g) || ref.has(g)) return; const x = (s[0] + s[2]) / 2, y = (s[1] + s[3]) / 2, a = wc.get(key(Math.floor(x / C2), Math.floor(y / C2)));
      if (a && a.some(j => dseg(x, y, segs[j]) <= 0.3)) o[g] = (o[g] || 0) + L[i]; }); return o; };
  const tot = {}; segs.forEach((s, i) => { const g = s[4]; if (cand.has(g) && g !== W) tot[g] = (tot[g] || 0) + L[i]; });
  /* 壁につながるか：線の端が、同じまとまりの線か、残すと決めたまとまりの線から 3cm 以内ならつなぐ。残すまとまりを含むつながりに入る線の割合を見る。
   * 残すまとまりが増えたら、もう一度（4回まで）。窓・建具は壁の線の近く（30cm）にある割合でも残す */
  const keep = new Set([W]); let near = {}, onw = {};
  for (let round = 0; round < 4; round++) {
    const par = new Int32Array(segs.length).map((_, i) => i), fd = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    for (let k = 0; k < touch.length; k += 2) { const i = touch[k], j = touch[k + 1]; if (segs[i][4] !== segs[j][4] && !keep.has(segs[j][4]) && !keep.has(segs[i][4])) continue; const r1 = fd(i), r2 = fd(j); if (r1 !== r2) par[r1] = r2; }
    const anch = new Set(); segs.forEach((s, i) => { if (keep.has(s[4]) && L[i] >= 0.5) anch.add(fd(i)); });
    near = {}; segs.forEach((s, i) => { const g = s[4]; if (!cand.has(g) || keep.has(g)) return; if (anch.has(fd(i))) near[g] = (near[g] || 0) + L[i]; });
    onw = onwOf(keep);
    let added = 0; Object.keys(tot).forEach(g => { if (keep.has(+g) || !(tot[g] > 0)) return; if ((near[g] || 0) / tot[g] >= 0.5 || (onw[g] || 0) / tot[g] >= 0.6) { keep.add(+g); added++; } });
    if (!added) break;
  }
  /* 外すまとまりの中の間仕切り（ガラスの仕切り・軽い間仕切り。家具と同じレイヤーに描いてある事がある）：
   * 外すまとまりの 1m 以上の線を、端どうし（5cm）でつないだ鎖（3本まで）のうち、鎖の両端が残すまとまりの線に付き、長さが 2m 以上の物は残す。
   * 途中で残すまとまりの線を横切る線（通り芯など）は使わない。机は端が机の線に付くので鎖の端が壁に付かない */
  /* 鎖に使うのは、細かい線の多いまとまり（線の平均 30cm 未満＝家具・器具と一緒に描くレイヤー）だけ。長い線ばかりのまとまり（通り芯・天井の線）は使わない */
  const gN = {}, gT = {}; segs.forEach((s, i) => { if (cand.has(s[4])) { gN[s[4]] = (gN[s[4]] || 0) + 1; gT[s[4]] = (gT[s[4]] || 0) + L[i]; } });
  const span = new Set(), isC = new Uint8Array(segs.length), CL = [];
  segs.forEach((s, i) => { if (cand.has(s[4]) && !keep.has(s[4]) && L[i] >= 1 && gT[s[4]] / gN[s[4]] < 0.3) { isC[i] = 1; CL.push(i); } });
  if (CL.length) {
    const hitK = (x, y, self) => { const a = ec.get(key(Math.floor(x / C2), Math.floor(y / C2))); return !!a && a.some(j => j !== self && keep.has(segs[j][4]) && dseg(x, y, segs[j]) <= 0.05); };
    const nbC = (x, y, self) => { const a = ec.get(key(Math.floor(x / C2), Math.floor(y / C2))); return a ? a.filter(j => j !== self && isC[j] && dseg(x, y, segs[j]) <= 0.05) : []; };
    const crossK = i => { const s = segs[i], a = new Set(); const x0 = Math.floor(Math.min(s[0], s[2]) / C2), x1 = Math.floor(Math.max(s[0], s[2]) / C2), y0 = Math.floor(Math.min(s[1], s[3]) / C2), y1 = Math.floor(Math.max(s[1], s[3]) / C2);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) return true;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) (ec.get(key(x, y)) || []).forEach(j => { if (keep.has(segs[j][4])) a.add(j); });
      for (const j of a) { const t = segs[j], d1 = (t[0] - s[0]) * (s[3] - s[1]) - (t[1] - s[1]) * (s[2] - s[0]), d2 = (t[2] - s[0]) * (s[3] - s[1]) - (t[3] - s[1]) * (s[2] - s[0]);
        const d3 = (s[0] - t[0]) * (t[3] - t[1]) - (s[1] - t[1]) * (t[2] - t[0]), d4 = (s[2] - t[0]) * (t[3] - t[1]) - (s[3] - t[1]) * (t[2] - t[0]);
        if (d1 * d2 < 0 && d3 * d4 < 0) { /* 真ん中で横切る（端の近くは付いているだけ） */ const u = d3 / (d3 - d4); if (u > 0.05 && u < 0.95 && u * L[i] > 0.1 && (1 - u) * L[i] > 0.1) return true; } }
      return false; };
    const ends = i => { const s = segs[i]; return [[s[0], s[1]], [s[2], s[3]]]; };
    CL.forEach(i => { if (span.has(i) || crossK(i)) return;
      const [e0, e1] = ends(i), k0 = hitK(e0[0], e0[1], i), k1 = hitK(e1[0], e1[1], i);
      if (k0 && k1) { if (L[i] >= 2) span.add(i); return; }
      if (!k0 && !k1) return;
      /* 片方だけ付く：付いていない端から、外すまとまりの線を2本までたどって残すまとまりに付けば、鎖ごと残す */
      const free = k0 ? e1 : e0, seen = new Set([i]);
      const walk = (pt, self, path, len) => { if (path.length > 3) return null;
        for (const j of nbC(pt[0], pt[1], self)) { if (seen.has(j) || crossK(j)) continue; seen.add(j);
          const [a0, a1] = ends(j), far = Math.hypot(a0[0] - pt[0], a0[1] - pt[1]) < Math.hypot(a1[0] - pt[0], a1[1] - pt[1]) ? a1 : a0;
          if (hitK(far[0], far[1], j)) return { path: [...path, j], len: len + L[j] }; const r = walk(far, j, [...path, j], len + L[j]); if (r) return r; }
        return null; };
      const r = walk(free, i, [i], L[i]); if (r && r.len >= 2) r.path.forEach(j => span.add(j)); });
  }
  return { W, keep, span, pairLen, near: Object.fromEntries(Object.keys(tot).map(g => [g, (near[g] || 0) / tot[g]])), onw: Object.fromEntries(Object.keys(tot).map(g => [g, (onw[g] || 0) / tot[g]])) };
}
export function groupRoles(input) {
  const st = groupStats(input), off = {};
  st.forEach(o => { const r = roleOf(o); if (r) off[o.gi] = r; });
  if (input.walls !== false) { try {
    const cand = new Set(st.filter(o => o.on && !off[o.gi]).map(o => o.gi));
    if (cand.size >= 2) { const w = wallGroups(input.segs || [], cand);
      if (w) { const furn = new Set(); cand.forEach(g => { if (!w.keep.has(g)) furn.add(g); });
        /* 家具のまとまりはまとまりごと外さず、線ごとに外す（中の間仕切りの線 span は残す） */
        const segOff = [], segKeep = [...w.span]; (input.segs || []).forEach((s, i) => { if (furn.has(s[4]) && !w.span.has(i)) segOff.push(i); });
        return { off, stats: st, furn: [...furn], segOff, segKeep };
      } }
  } catch (e) { /* 見分けられない時は今まで通り */ } }
  /* 全部外れる時は何もしない（壁が残らないと区画が作れない） */
  if (!st.some(o => o.on && !off[o.gi])) return { off: {}, stats: st };
  return { off, stats: st };
}
