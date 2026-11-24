/* 図面の中の図（図枠・段）と、使う図・使わない図。画面に触らない（project.js・workcheck.js・floors.js から使う） */
const sheetKey = (b) => `${Math.round(b[0] * 10)},${Math.round(b[1] * 10)}`;
export function sheetsOf(d) {
  const S = ((d && d.analysis && d.analysis.sheets) || []).filter(x => x && x.box);
  if (S.length < 2) return [];
  const both = S.some(x => x.kind === 'plan') && S.some(x => x.kind === 'now'), U = d.sheetUse || {};
  /* 図面の上の図から順に（左右は左から）。同じ名前の図が2つ以上ある時は「（1つ目）」などを付ける */
  const T = [...S].sort((p, q) => Math.abs(q.box[3] - p.box[3]) > 1 ? q.box[3] - p.box[3] : p.box[0] - q.box[0]);
  const cnt = {}, seen = {}; T.forEach(x => { cnt[x.title] = (cnt[x.title] || 0) + 1; });
  return T.map((x, k) => { const key = sheetKey(x.box); const dup = x.title && cnt[x.title] > 1 ? `（${(seen[x.title] = (seen[x.title] || 0) + 1)}つ目）` : '';
    return { ...x, title: x.title ? x.title + dup : '', key, k, use: key in U ? !!U[key] : !(x.kind === 'table' || (both && x.kind === 'now')) }; });
}

/* 器具のうち、見積もりに数える物（使わない図の中・表・表題欄の中の物は数えない）。器具の並びと同じ順の true / false。
 * 前は図面の器具を全部数えていたので、今の図と改修の図が1枚に並ぶ図面（日本モウルド・三井屋）では、使わない図の器具まで明細に入っていた */
export function fixturesInUse(d) {
  const fx = (d && d.fixtures) || [];
  const off = sheetsOf(d).filter(x => !x.use).map(x => x.box);
  const reg = ((d && d.analysis && d.analysis.regions) || []).filter(r => r.box && (r.type === 'table' || r.type === 'title')).map(r => r.box);
  const B = [...off, ...reg];
  return fx.map(x => { if (!x || !x.b) return true; const cx = (x.b[0] + x.b[2]) / 2, cy = (x.b[1] + x.b[3]) / 2; return !B.some(b => cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]); });
}

/* 表・表題欄（解析の table・title）の中にある器具の印（器具の真ん中で見る）。表題欄の会社のマークや「記事」の空の枠を
   器具と拾った物は、図面にも器具として出さない（明細には fixturesInUse で元から入れていない）。手で直した器具は出す */
export function fixturesInRegions(d) {
  const fx = (d && d.fixtures) || [];
  const reg = ((d && d.analysis && d.analysis.regions) || []).filter(r => r.box && (r.type === 'table' || r.type === 'title')).map(r => r.box);
  return fx.map(x => { if (!x || !x.b || x.edited || !reg.length) return false; const cx = (x.b[0] + x.b[2]) / 2, cy = (x.b[1] + x.b[3]) / 2; return reg.some(b => cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]); });
}

/* ほかの区画をいくつも中に含む区画（図枠の内側・建物の外まわり）。中に4つ以上、または2つ以上で中の広さが半分以上。
 * 「まだ部屋にしていない区画を全部選ぶ」・3D で使う（前は全部選ぶで図枠の内側まで部屋になり、床が 1,000㎡ 以上増えていた） */
const pipS = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
export function wrapsMany(f, F) {
  if (!f.poly || f.poly.length < 3) return false;
  let n = 0, a = 0; const cOf = o => Number.isFinite(o.cx) ? [o.cx, o.cy] : [o.poly.reduce((t, q) => t + q[0], 0) / o.poly.length, o.poly.reduce((t, q) => t + q[1], 0) / o.poly.length];
  for (const o of F) { if (o === f || !o.poly || !(o.area < f.area)) continue; const c = cOf(o); if (pipS(c[0], c[1], f.poly)) { n++; a += Number(o.area) || 0; } }
  return n >= 4 || (n >= 2 && a >= (Number(f.area) || 0) * 0.5);
}
