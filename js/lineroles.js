/* 線の役割を自動で決める（図面の「属性変更」を自動で）。画面に触らない。
 * かつ「什器を別扱いできないと販売できない」「読み込みに少し時間がかかってもいいから自動で属性を変えられるといい」（2026-11-24）。
 * 考え方（かつがくれた調査メモの Tang et al. の手順を、この図面の作りに合わせて）：
 *   1. 壁の候補：平行な2本線で、間が 6〜40cm・重なりが 40cm 以上（壁の厚みの2本線）
 *   2. 壁の候補でない線を、端が相手の線に 3cm 以内で付くかでつないで、かたまりにする（壁の線ではつながない＝壁にくっついた机も壁から離れる）
 *   3. かたまりのうち、差し渡し 6m 未満で、外接する四角を 10cm のマスで見て線が通るマスの割合（占有率）が高い物を家具とする
 *      （机・椅子・長いす・棚・ロッカーは線がぎっしり。トイレのブースの仕切り・ガラスの間仕切りは線がまばら）
 *   細長い物（短い辺 45cm 以下・長い辺 1.5m 以上）は壁の切れ端・窓・建具枠なので家具にしない
 * 入力 segs：[[x1,y1,x2,y2,まとまりの番号], …]（m）、use(i)：その線を区画探しに使っているか
 * 出力：家具と見た線の番号の配列 */
export function furnitureLines(segs, use = () => true, opt = {}) {
  const OCC = opt.occ ?? 0.50, SPAN = opt.span ?? 6, CS = 1;
  const N = segs.length, L = new Float64Array(N), ok = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const s = segs[i]; L[i] = Math.hypot(s[2] - s[0], s[3] - s[1]); ok[i] = use(i) && L[i] > 0.005 ? 1 : 0; }
  /* 線の外枠のマス目（1m） */
  const grid = new Map(), put = (k, gx, gy) => { const key = gx * 100003 + gy; let v = grid.get(key); if (!v) grid.set(key, v = []); v.push(k); };
  for (let i = 0; i < N; i++) { if (!ok[i]) continue; const s = segs[i];
    const a = Math.floor((Math.min(s[0], s[2]) - 0.45) / CS), b = Math.floor((Math.max(s[0], s[2]) + 0.45) / CS), c = Math.floor((Math.min(s[1], s[3]) - 0.45) / CS), d = Math.floor((Math.max(s[1], s[3]) + 0.45) / CS);
    if ((b - a + 1) * (d - c + 1) > 900) continue; for (let gx = a; gx <= b; gx++) for (let gy = c; gy <= d; gy++) put(i, gx, gy); }
  const near = (i, P, Q) => { const s = i >= 0 ? segs[i] : [P[0], P[1], Q[0], Q[1]], out = new Set(), a = Math.floor(Math.min(s[0], s[2]) / CS), b = Math.floor(Math.max(s[0], s[2]) / CS), c = Math.floor(Math.min(s[1], s[3]) / CS), d = Math.floor(Math.max(s[1], s[3]) / CS);
    if ((b - a + 1) * (d - c + 1) > 900) return out; for (let gx = a; gx <= b; gx++) for (let gy = c; gy <= d; gy++) { const v = grid.get(gx * 100003 + gy); if (v) v.forEach(j => out.add(j)); } return out; };
  /* 1. 壁の候補（どちらの線も 90cm 以上。机の引き出し・棚板の短い平行な線を壁と見ないため） */
  const wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (!ok[i] || L[i] < 0.9) continue; const s = segs[i], ux = (s[2] - s[0]) / L[i], uy = (s[3] - s[1]) / L[i];
    for (const j of near(i)) { if (j === i || !ok[j] || L[j] < 0.9) continue; const t = segs[j];
      if (Math.abs(ux * (t[3] - t[1]) - uy * (t[2] - t[0])) / L[j] > 0.03) continue;
      const dd = Math.abs((t[0] - s[0]) * uy - (t[1] - s[1]) * ux); if (dd < 0.06 || dd > 0.40) continue;
      const t1 = (t[0] - s[0]) * ux + (t[1] - s[1]) * uy, t2 = (t[2] - s[0]) * ux + (t[3] - s[1]) * uy;
      if (Math.min(L[i], Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)) >= 0.4) { wall[i] = 1; wall[j] = 1; break; } } }
  const segD0 = (x, y, t) => { const dx = t[2] - t[0], dy = t[3] - t[1], l2 = dx * dx + dy * dy; let u = l2 ? ((x - t[0]) * dx + (y - t[1]) * dy) / l2 : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(x - t[0] - u * dx, y - t[1] - u * dy); };
  /* 1a. 収納・ロッカー・カウンターの列（かつ「受付カウンター・間仕切りでは分けない」・2026-11-24。学校の事務所とロビーの間の収納の列で割れていた）：
   *     四角い箱（向かい合う同じ長さの2本の線と、その両端をつなぐ2本の線）を1つずつ見つけ、奥行 30〜90cm・長さ 30cm〜2m の同じ奥行の箱が
   *     長い向きに3つ以上くっついて並んでいたら、その列の線（中の引き出しなどの線も）を家具とする。6m より長くても、壁に付いていても家具 */
  const box = new Uint8Array(N);
  { const rects = [];
    const side = (p, q, len) => { for (const k of near(-1, p, q)) { const t = segs[k]; if (!ok[k]) continue; if (segD0(p[0], p[1], t) <= 0.03 && segD0(q[0], q[1], t) <= 0.03) return true; } return false; };
    for (let i = 0; i < N; i++) { if (!ok[i] || L[i] < 0.32 || L[i] > 4.0) continue; const s = segs[i], ux = (s[2] - s[0]) / L[i], uy = (s[3] - s[1]) / L[i];
      const nb = near(-1, [Math.min(s[0], s[2]) - 2.0, Math.min(s[1], s[3]) - 2.0], [Math.max(s[0], s[2]) + 2.0, Math.max(s[1], s[3]) + 2.0]);   /* 向かいの線は 2m 先まで */
      for (const j of nb) { if (j <= i || !ok[j] || Math.abs(L[j] - L[i]) > 0.03) continue; const t = segs[j];
        if (Math.abs(ux * (t[3] - t[1]) - uy * (t[2] - t[0])) / L[j] > 0.03) continue;
        const d = Math.abs((t[0] - s[0]) * uy - (t[1] - s[1]) * ux); if (d < 0.32 || d > 4.0) continue;   /* 階段の踏み面（26〜30cm）は入れない */
        let t1 = (t[0] - s[0]) * ux + (t[1] - s[1]) * uy, t2 = (t[2] - s[0]) * ux + (t[3] - s[1]) * uy; let A = [t[0], t[1]], B = [t[2], t[3]];
        if (t1 > t2) { [t1, t2] = [t2, t1]; [A, B] = [B, A]; } if (Math.abs(t1) > 0.03 || Math.abs(t2 - L[i]) > 0.03) continue;
        if (!side([s[0], s[1]], A) || !side([s[2], s[3]], B)) continue;
        const a = L[i], depth = Math.min(a, d), len = Math.max(a, d); if (depth > 0.9) continue;
        /* 長い向き（並ぶ向き）の単位ベクトル */
        const lx = a >= d ? ux : -uy, ly = a >= d ? uy : ux, cx = (s[0] + s[2] + A[0] + B[0]) / 4, cy = (s[1] + s[3] + A[1] + B[1]) / 4;
        rects.push({ cx, cy, lx, ly, depth, len, x0: Math.min(s[0], s[2], A[0], B[0]), y0: Math.min(s[1], s[3], A[1], B[1]), x1: Math.max(s[0], s[2], A[0], B[0]), y1: Math.max(s[1], s[3], A[1], B[1]) }); } }
    /* 同じ奥行・同じ向きで、並ぶ向きに隣どうしくっついている箱をつなぐ */
    const R = rects.length, pr = new Int32Array(R); for (let k = 0; k < R; k++) pr[k] = k; const fr = k => { while (pr[k] !== k) { pr[k] = pr[pr[k]]; k = pr[k]; } return k; };
    for (let m = 0; m < R; m++) for (let n = m + 1; n < R; n++) { const P = rects[m], Q = rects[n];
      if (Math.abs(P.depth - Q.depth) > 0.03 || Math.abs(P.lx * Q.ly - P.ly * Q.lx) > 0.05) continue;
      const vx = Q.cx - P.cx, vy = Q.cy - P.cy, along = Math.abs(vx * P.lx + vy * P.ly), perp = Math.abs(vx * P.ly - vy * P.lx);
      if (perp > 0.03 || Math.abs(along - (P.len + Q.len) / 2) > 0.06) continue; const a = fr(m), b = fr(n); if (a !== b) pr[a] = b; }
    const rows = new Map(); for (let k = 0; k < R; k++) { const r = fr(k); let v = rows.get(r); if (!v) rows.set(r, v = []); v.push(rects[k]); }
    rows.forEach(rs => { /* 同じ箱を二重に描いた物は1つと数える */
      const u = []; rs.forEach(q => { if (!u.some(o => Math.hypot(o.cx - q.cx, o.cy - q.cy) < 0.05)) u.push(q); }); if (u.filter(q => q.len <= 2.0).length < 3) return;   /* 長さ 2m までの箱が3つ以上（端の長いカウンターも一緒に） */
      const x0 = Math.min(...u.map(q => q.x0)) - 0.02, y0 = Math.min(...u.map(q => q.y0)) - 0.02, x1 = Math.max(...u.map(q => q.x1)) + 0.02, y1 = Math.max(...u.map(q => q.y1)) + 0.02;
      /* 水まわりの器具が入っている・かかっている列（トイレのブースの並び・流し台）は外さない */
      if ((opt.keepBoxes || []).some(b => b[0] <= x1 && b[2] >= x0 && b[1] <= y1 && b[3] >= y0)) return;
      for (let i = 0; i < N; i++) { if (!ok[i]) continue; const t = segs[i]; if (Math.min(t[0], t[2]) >= x0 && Math.max(t[0], t[2]) <= x1 && Math.min(t[1], t[3]) >= y0 && Math.max(t[1], t[3]) <= y1) { box[i] = 1; wall[i] = 0; } } }); }
  /* 1b. 間仕切り：壁の候補に両端が付いている線（3cm 以内）は壁と同じに扱う。薄い2本線（軽い間仕切り・ガラス）や1本線の仕切りも、
   *     壁と壁の間を区切っていれば残す（机・棚は壁から浮いているか、片方しか付いていない）。付いた線からさらに広げる（4回まで） */
  const touchW = (x, y, i) => { for (const j of near(i)) { if (j === i || !wall[j]) continue; if (segD0(x, y, segs[j]) <= 0.03) return true; } return false; };
  for (let it = 0; it < 4; it++) { let ch = false;
    for (let i = 0; i < N; i++) { if (!ok[i] || wall[i] || box[i] || L[i] < 0.3) continue; const s = segs[i];
      if (touchW(s[0], s[1], i) && touchW(s[2], s[3], i)) { wall[i] = 2; ch = true; } }
    if (!ch) break; }
  /* 2. 壁の候補でない線のかたまり */
  const par = new Int32Array(N); for (let i = 0; i < N; i++) par[i] = i;
  const fd = k => { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; };
  const segD = (x, y, t) => { const dx = t[2] - t[0], dy = t[3] - t[1], l2 = dx * dx + dy * dy; let u = l2 ? ((x - t[0]) * dx + (y - t[1]) * dy) / l2 : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(x - t[0] - u * dx, y - t[1] - u * dy); };
  for (let i = 0; i < N; i++) { if (!ok[i] || wall[i] || box[i]) continue; const s = segs[i];
    for (const j of near(i)) { if (j === i || !ok[j] || wall[j] || box[j]) continue; const t = segs[j];
      if (segD(s[0], s[1], t) <= 0.03 || segD(s[2], s[3], t) <= 0.03 || segD(t[0], t[1], s) <= 0.03 || segD(t[2], t[3], s) <= 0.03) { const a = fd(i), b = fd(j); if (a !== b) par[a] = b; } } }
  const G = new Map(); for (let i = 0; i < N; i++) { if (!ok[i] || wall[i] || box[i]) continue; const r = fd(i); let v = G.get(r); if (!v) G.set(r, v = []); v.push(i); }
  /* 3. 家具のかたまり */
  const out = []; for (let i = 0; i < N; i++) if (box[i]) out.push(i);
  G.forEach(ids => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ids.forEach(i => { const s = segs[i]; x0 = Math.min(x0, s[0], s[2]); y0 = Math.min(y0, s[1], s[3]); x1 = Math.max(x1, s[0], s[2]); y1 = Math.max(y1, s[1], s[3]); });
    const w = x1 - x0, h = y1 - y0, lo = Math.min(w, h), hi = Math.max(w, h);
    if (hi >= SPAN || hi < 0.25) return;
    if (lo <= 0.45 && hi >= 1.5) return;                       // 細長い物（壁の切れ端・窓・建具枠・ブースの仕切り1枚）
    /* 2本の別々の壁の線の間をつなぐかたまり（扉・引き戸・建具枠・間仕切り）は残す。付く所が 50cm 以上離れた別の壁の線 2本以上（机は1本の壁に寄せるだけ） */
    { const hits = []; ids.forEach(i => { const t = segs[i]; [[t[0], t[1]], [t[2], t[3]]].forEach(([x, y]) => { for (const j of near(i)) { if (j === i || !wall[j]) continue; if (segD0(x, y, segs[j]) <= 0.03) { hits.push([j, x, y]); break; } } }); });
      if (hits.some((a, k) => hits.some((b, m) => m > k && a[0] !== b[0] && Math.hypot(a[1] - b[1], a[2] - b[2]) >= 0.5))) return; }
    /* 壁に付いた線の少ない小さいかたまり（6本以下）は袖壁・小便器の仕切り・壁の端の小口（机は椅子や引き出しの線が多い） */
    if (ids.length <= 6 && ids.some(i => { const t = segs[i]; return touchW(t[0], t[1], i) || touchW(t[2], t[3], i); })) return;
    /* 水まわりの器具（便器・小便器・洗面台など）のそば 50cm にかかるかたまりは外さない（トイレのブースの仕切り・器具そのもの） */
    if ((opt.keepBoxes || []).some(b => b[0] - 0.5 <= x1 && b[2] + 0.5 >= x0 && b[1] - 0.5 <= y1 && b[3] + 0.5 >= y0)) return;
    const C = 0.1, nx = Math.max(1, Math.ceil(w / C)), ny = Math.max(1, Math.ceil(h / C)), hit = new Uint8Array(nx * ny);
    ids.forEach(i => { const s = segs[i], n = Math.max(1, Math.ceil(L[i] / (C / 2)));
      for (let k = 0; k <= n; k++) { const x = s[0] + (s[2] - s[0]) * k / n, y = s[1] + (s[3] - s[1]) * k / n;
        const cx = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / C))), cy = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / C))); hit[cy * nx + cx] = 1; } });
    let c = 0; for (let k = 0; k < hit.length; k++) c += hit[k];
    if (c / hit.length >= OCC) ids.forEach(i => out.push(i));
  });
  return out;
}
