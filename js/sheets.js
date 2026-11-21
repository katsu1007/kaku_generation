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
