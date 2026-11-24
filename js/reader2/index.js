/* 新しい読み取りのまとめ役（画面に触らない）。段階1（図枠・表・表題欄）と段階2（文字）を順に回して、結果を1つにする。
 * 今の読み取りの結果（区画・器具）は書き換えない。返すのは「印」と「提案」だけ：
 *   regions・marks・stats：段階1（frame.js）
 *   names { 区画の i: 名前 }：名前の無い区画の中に、部屋らしい文字が直にあれば、その名前の提案（つないだ文字も使う）
 *   fxOut [{ k: 器具の番号, why }]：表題欄・表の中にある「器具」（会社のマークや表の線の見間違い）
 *   equip [{ name, model }]：表の中の、器具の名前と品番の組
 *   title { project, sheet, scale, date }：表題欄から読めた工事の名前・図面の名前・縮尺・日付
 *   text { total, joined, parts, kinds }：文字の数、つないだ数、種類ごとの数 */
import { analyze as analyzeFrame } from './frame.js';
import { joinTexts, classify, equipment, titleInfo, sheetTitles, labelBoxes } from './text.js';

export const VER = 7;   // 7：「＜A案＞」のように括弧で囲んだ案の見出しも読む・図枠の中に案の見出しが1つなら名前に付けて案（alt）にする（江南）。   // 6：横に並んだ図（現況図｜改修プラン）も分ける（splitCols）。 5：表題欄の枠が無い図面でも、見出しのかたまりから工事名称などを読む（現場トイレ）。   // 4：左右の縦線が無い図枠（上下の横線だけ。0530）も図枠と見る。3：図の分け方（sheets）・工事名称のつなぎ方を足した。古い解析は開いた時に作り直す

/* 1つの図枠の中に、今の図と改修の案が段になって並ぶ図面（三井屋：左の縦の文字「現況図」「プラン③」「プラン⑤」）を段ごとの図に分ける。
 *   見出し：図枠の中（表・表題欄の外）の短い文字で、現況図・既存図・改修前／後・計画図・プラン○・○案 の形の物
 *   見出しは図枠の左の端（幅の1割以内）にある物だけ（仕上表の中の「改修後」などを見出しにしない）
 *   見出しが縦に2つ以上並ぶ（x が 1m 以内でそろい、y が 1m 以上離れる）時だけ分ける
 *   段の境目：上と下の見出しの間で、図の幅の6割以上ある横の長い線のうち一番上（段の見出しの帯の上の線）。無ければまん中
 *   出力：[{ box, title, kind, alt }]（alt：プラン③・A案のように、同じ所の案がいくつもある物） */
const BAND_LABEL = /^(現況図?|既存図?|改修前図?|改修後図?|計画図?|改修図|改修プラン\s*[①-⑳0-9０-９A-Za-zＡ-Ｚ]*|改修案|プラン\s*[①-⑳0-9０-９A-Za-zＡ-Ｚ]*|[A-ZＡ-Ｚ]案|案\s*[①-⑳0-9０-９A-Za-zＡ-Ｚ]+)$/;
/* 見出しのまわりの括弧（＜A案＞・【プラン①】など）を取る */
const unBracket = s => s.replace(/^[<＜〈《【\[(（]+/, '').replace(/[>＞〉》】\])）]+$/, '');
export function splitBands(fb, texts = [], segs = [], skip = []) {
  const inBox = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  const L = texts.map(t => ({ ...t, s: unBracket(String(t.t).replace(/[\s\u3000]+/g, '')) }))
    .filter(t => inBox(t.x, t.y, fb) && t.x <= fb[0] + (fb[2] - fb[0]) * 0.1 && !skip.some(b => inBox(t.x, t.y, b)) && BAND_LABEL.test(t.s));
  if (L.length < 2) return null;
  /* いちばん多くそろう縦の列 */
  let col = [];
  L.forEach(a => { const c = L.filter(b => Math.abs(b.x - a.x) <= 1); if (c.length > col.length) col = c; });
  col = col.sort((p, q) => q.y - p.y).filter((t, k, A) => !k || A[k - 1].y - t.y >= 1);
  if (col.length < 2) return null;
  const w = fb[2] - fb[0];
  const longH = segs.filter(s => Math.abs(s[1] - s[3]) < 0.01 && Math.abs(s[0] - s[2]) >= w * 0.6 * 0.6 && Math.min(s[0], s[2]) <= col[0].x + 2);
  const cuts = [];
  for (let k = 0; k + 1 < col.length; k++) {
    const hi = col[k].y, lo = col[k + 1].y;
    const ys = longH.map(s => s[1]).filter(y => y < hi - 0.05 && y > lo + 0.05).sort((p, q) => q - p);
    cuts.push(ys.length ? ys[0] : (hi + lo) / 2);
  }
  const kindOf = (t) => /現況|既存|改修前/.test(t) ? 'now' : 'plan';
  return col.map((t, k) => ({ box: [fb[0], k + 1 < col.length ? cuts[k] : fb[1], fb[2], k ? cuts[k - 1] : fb[3]], title: t.s, kind: kindOf(t.s), alt: /プラン\s*\S|案/.test(t.s) }));
}
/* 横に並んだ図（現況図｜改修プラン）を分ける（むぎの設計 docs/from-muse-2026-11-23.md の3・縦の段の鏡写し）。
 * 見出し（上と同じ言葉）が図枠の中・表と表題欄の外に、同じ高さ（1m 以内）で横に2つ以上並ぶ時。
 * 境目は、見出しの間の図枠の高さの6割以上の縦の長い線。無ければ、見出しの間で線がいちばん長く途切れる所のまん中。
 * 分けた両側の線のかたまり（図枠の長さの9割以上の線は除く）の大きさが近い（縦・横とも3割以内）時だけ分ける（同じ建物の今と改修なので）。
 * 縦の段（splitBands）で分けた図枠には使わない */
export function splitCols(fb, texts = [], segs = [], skip = []) {
  const inBox = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  const L = texts.map(t => ({ ...t, s: unBracket(String(t.t).replace(/[\s\u3000]+/g, '')) }))
    .filter(t => inBox(t.x, t.y, fb) && !skip.some(b => inBox(t.x, t.y, b)) && BAND_LABEL.test(t.s));
  if (L.length < 2) return null;
  let row = [];
  L.forEach(a => { const c = L.filter(b => Math.abs(b.y - a.y) <= 1); if (c.length > row.length) row = c; });
  row = row.sort((p, q) => p.x - q.x).filter((t, k, A) => !k || t.x - A[k - 1].x >= 2);
  if (row.length < 2) return null;
  const w = fb[2] - fb[0], h = fb[3] - fb[1];
  const frameLine = s => (Math.abs(s[1] - s[3]) < 0.01 && Math.abs(s[0] - s[2]) >= w * 0.9) || (Math.abs(s[0] - s[2]) < 0.01 && Math.abs(s[1] - s[3]) >= h * 0.9);
  const inner = segs.filter(s => inBox(s[0], s[1], fb) && inBox(s[2], s[3], fb) && !frameLine(s) && !skip.some(b => inBox((s[0] + s[2]) / 2, (s[1] + s[3]) / 2, b)));
  const longV = inner.filter(s => Math.abs(s[0] - s[2]) < 0.01 && Math.abs(s[1] - s[3]) >= h * 0.6);
  const cuts = [];
  for (let k = 0; k + 1 < row.length; k++) {
    const lo = row[k].x, hi = row[k + 1].x;
    const v = longV.map(s => s[0]).filter(x => x > lo + 0.05 && x < hi - 0.05);
    if (v.length) { cuts.push(v.sort((p, q) => Math.abs(p - (lo + hi) / 2) - Math.abs(q - (lo + hi) / 2))[0]); continue; }
    /* 線の無い縦の帯：見出しの間の x で、線の掛かる区間を並べて、いちばん長いすき間 */
    const iv = inner.map(s => [Math.min(s[0], s[2]), Math.max(s[0], s[2])]).filter(q => q[1] > lo && q[0] < hi).sort((p, q) => p[0] - q[0]);
    let best = null, cur = lo;
    iv.forEach(q => { if (q[0] > cur && (!best || q[0] - cur > best[1] - best[0])) best = [cur, q[0]]; cur = Math.max(cur, q[1]); });
    if (hi > cur && (!best || hi - cur > best[1] - best[0])) best = [cur, hi];
    if (!best || best[1] - best[0] < 1) return null;
    cuts.push((best[0] + best[1]) / 2);
  }
  const boxes = row.map((t, k) => [k ? cuts[k - 1] : fb[0], fb[1], k + 1 < row.length ? cuts[k] : fb[2], fb[3]]);
  /* 各側の建物の大きさ：端が付き合う線のかたまり（3cm 以内）のうち、いちばん大きい物の箱（表題欄の罫線などの離れたかたまりは入れない） */
  const ext = boxes.map(b => { const S = inner.filter(s => inBox((s[0] + s[2]) / 2, (s[1] + s[3]) / 2, b)); if (!S.length) return null;
    const par = S.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i]));
    const onSeg = (x, y, t) => { const dx = t[2] - t[0], dy = t[3] - t[1], L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - t[0]) * dx + (y - t[1]) * dy) / L)); return Math.hypot(t[0] + u * dx - x, t[1] + u * dy - y) <= 0.03; };
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) { const A = S[i], B = S[j];
      if (onSeg(A[0], A[1], B) || onSeg(A[2], A[3], B) || onSeg(B[0], B[1], A) || onSeg(B[2], B[3], A)) par[f(i)] = f(j); }
    const G = {}; S.forEach((q, i) => { const r = f(i); (G[r] = G[r] || []).push(q); });
    const bb = Object.values(G).map(Q => { const xs = Q.flatMap(q => [q[0], q[2]]), ys = Q.flatMap(q => [q[1], q[3]]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; });
    return bb.sort((p, q) => q[0] * q[1] - p[0] * p[1])[0]; });
  if (ext.some(e => !e || e[0] < 1 || e[1] < 1)) return null;
  const near = (a, b) => Math.abs(a - b) <= Math.max(a, b) * 0.3;
  if (!ext.every(e => near(e[0], ext[0][0]) && near(e[1], ext[0][1]))) return null;
  const kindOf = (t) => /現況|既存|改修前/.test(t) ? 'now' : 'plan';
  return row.map((t, k) => ({ box: boxes[k], title: t.s, kind: kindOf(t.s), alt: /プラン\s*\S|案/.test(t.s) && !/^改修プラン$/.test(t.s) }));
}

const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

/* 探し直した区画（段階3）だけに使う印：外壁の外をぐるっと回る輪と、細い帯。どちらも決めきれない物として「保留」にする（部屋にもできる）
 *   輪：ほかの区画2つ以上をすっぽり囲み、囲まれた区画のまとまりが、どの辺からも 25cm 以上内側にある（便所とブースのように壁に付いている物は輪ではない）
 *   帯：細い方が 35cm 以下で、長さがその4倍以上 */
export function shapeMarks(faces, marks = {}) {
  const B = faces.filter(f => f && f.poly && f.poly.length >= 3).map(f => { const xs = f.poly.map(q => q[0]), ys = f.poly.map(q => q[1]); return { f, b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; });
  const out = {};
  B.forEach(a => {
    if (marks[a.f.i]) return;
    const w = a.b[2] - a.b[0], h = a.b[3] - a.b[1], lo = Math.min(w, h), hi = Math.max(w, h);
    if (lo <= 0.35 && hi >= lo * 4) { out[a.f.i] = { s: 'hold', type: 'strip', why: '細い帯です（見出しの帯や壁の厚みかもしれません）' }; return; }
    const kids = B.filter(c => c !== a && c.b[0] >= a.b[0] - 0.02 && c.b[1] >= a.b[1] - 0.02 && c.b[2] <= a.b[2] + 0.02 && c.b[3] <= a.b[3] + 0.02 && (c.b[2] - c.b[0]) * (c.b[3] - c.b[1]) < w * h * 0.9);
    if (kids.length < 2) return;
    const u = [Math.min(...kids.map(c => c.b[0])), Math.min(...kids.map(c => c.b[1])), Math.max(...kids.map(c => c.b[2])), Math.max(...kids.map(c => c.b[3]))];
    const inset = Math.min(u[0] - a.b[0], u[1] - a.b[1], a.b[2] - u[2], a.b[3] - u[3]);
    if (inset >= 0.25 && (u[2] - u[0]) * (u[3] - u[1]) >= w * h * 0.4) out[a.f.i] = { s: 'hold', type: 'ring', why: 'ほかの区画をぐるっと囲んでいます（建物の外まわりかもしれません）' };
  });
  return out;
}

export function analyzeAll({ segs = [], faces = [], texts = [], fixtures = [], doors = [], shapes = false } = {}) {
  const J = joinTexts(texts);
  const A = analyzeFrame({ segs, faces, texts: J.texts, fixtures, doors });
  if (shapes) { const M = shapeMarks(faces, A.marks); Object.assign(A.marks, M); A.stats.hold += Object.keys(M).length; A.stats.shapes = Object.keys(M).length; }
  const kinds = {}; J.texts.forEach(t => { const k = classify(t.t); kinds[k] = (kinds[k] || 0) + 1; });
  /* 名前の提案：印の無い・名前の無い区画に、部屋らしい文字が直に（中の小さい区画に入らずに）1〜2種類あれば */
  const names = {}, rooms = J.texts.filter(t => classify(t.t) === 'room');
  const F = faces.filter(f => f && f.poly && f.poly.length >= 3);
  F.forEach(f => {
    if (f.name || A.marks[f.i]) return;
    const kids = F.filter(g => g !== f && g.area < f.area * 0.9 && pip(g.poly.reduce((s, q) => s + q[0], 0) / g.poly.length, g.poly.reduce((s, q) => s + q[1], 0) / g.poly.length, f.poly));
    const inside = [...new Set(rooms.filter(t => pip(t.x, t.y, f.poly) && !kids.some(k => pip(t.x, t.y, k.poly))).map(t => t.t))];
    if (inside.length >= 1 && inside.length <= 2) names[f.i] = inside.join('・');
  });
  /* 表題欄・表の中の「器具」は器具ではない（会社のマークを洗面台と拾っていた） */
  const boxes = A.regions.filter(r => r.type === 'title' || r.type === 'table');
  const fxOut = [];
  fixtures.forEach((x, k) => {
    if (!x || !x.b || x.t === 'other') return;
    const cx = (x.b[0] + x.b[2]) / 2, cy = (x.b[1] + x.b[3]) / 2, r = boxes.find(q => cx >= q.box[0] && cx <= q.box[2] && cy >= q.box[1] && cy <= q.box[3]);
    if (r) fxOut.push({ k, t: x.t, why: r.type === 'title' ? '表題欄の中にあります（会社のマークなどの見間違い）' : '表の中にあります（表の線や文字の見間違い）' });
  });
  const equip = equipment(J.texts, A.regions.filter(r => r.type === 'table').map(r => r.box)).slice(0, 40);
  const tbx = A.regions.filter(r => r.type === 'title').map(r => r.box);
  const title = titleInfo(J.texts, tbx.length ? tbx : labelBoxes(J.texts));   // 表題欄の枠が見つからない時は、見出しのかたまりで
  const sheets0 = sheetTitles(J.texts, A.regions.filter(r => r.type === 'frame').map(r => r.box), A.regions.filter(r => r.type === 'title').map(r => r.box));
  const skipB = A.regions.filter(r => r.type === 'title' || r.type === 'table').map(r => r.box);
  /* 案（A案・B案）：横に並べた案は分ける（splitCols）。図枠1つに案の見出しが1つだけの時（江南は図枠ごとに＜A案＞＜B案＞）は、その図の名前に付けて案にする。
   * 案はどれか1つを見積もりに使う物なので alt（2つ以上使う時は黄色の注意） */
  const ALT1 = /^[A-ZＡ-Ｚ]案$/;
  const sheets = sheets0.flatMap(x => {
    if (x.kind === 'table') return [x];
    const sp = splitBands(x.box, J.texts, segs, skipB) || splitCols(x.box, J.texts, segs, skipB);
    if (sp) return sp.map(y => ALT1.test(y.title) && x.title ? { ...y, title: x.title + ' ' + y.title } : y);
    const labs = [...new Set(J.texts.filter(t => t.x >= x.box[0] && t.x <= x.box[2] && t.y >= x.box[1] && t.y <= x.box[3] && !skipB.some(b => t.x >= b[0] && t.x <= b[2] && t.y >= b[1] && t.y <= b[3]))
      .map(t => unBracket(String(t.t).replace(/[\s\u3000]+/g, ''))).filter(v => ALT1.test(v)))];
    if (labs.length === 1) return [{ ...x, title: (x.title ? x.title + ' ' : '') + labs[0], kind: x.kind || 'plan', alt: true }];
    return [x];
  });
  /* 図面の名前は、図枠ごとに読んだ物（sheetTitles）の方が確か（表題欄の見出しの右だけ見ると会社名などを拾う） */
  const st = [...new Set(sheets.map(x => x.title).filter(Boolean))];
  if (sheets.length >= 2 && st.length) title.sheet = st;
  /* 工事名称の見出しが無い表題欄：帯の中の「〜工事」の文字（0530 は「大天工業株式会社様 本社改修工事」が各図の帯にある）。図の名前は使わない */
  if (!(title.project || []).length) {
    const TB = A.regions.filter(r => r.type === 'title').map(r => r.box);
    const P = [...new Set(J.texts.filter(t => TB.some(b => t.x >= b[0] && t.x <= b[2] && t.y >= b[1] && t.y <= b[3])).map(t => String(t.t).replace(/[\s\u3000]+/g, ' ').trim())
      .filter(v => v.length >= 4 && v.length <= 40 && /工事$/.test(v.replace(/\s/g, '')) && !st.includes(v)))];
    if (P.length) title.project = P.slice(0, 1);
  }
  return { ...A, ver: VER, names, fxOut, equip, title, sheets, text: { total: texts.length, after: J.texts.length, joined: J.joined, parts: J.parts, kinds } };
}
