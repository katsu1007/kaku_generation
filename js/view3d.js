/* 3Dで見る。
 * 前のKAKUの3D（壁の組み立て・ドアの切り抜き・質感・タップで寸法と数量の根拠）をそのまま使う。
 * 新しい画面の案件（図面・部屋・器具・照明・分電盤）を前のKAKUの形に直して渡し、全画面の層に出す。
 * 前のKAKUの保存（案件一覧）には何も足さない。閉じたら層ごと消す。 */
import { opts } from './app.js';
import { oldType } from './legacy.js';
import { planCH } from './drawing.js';
import { lightWires, symList, typeFixMap, shownFixType } from './project.js';
import { pip } from './lighting.js';
import { fixturesInRegions } from './sheets.js';

const clone = o => JSON.parse(JSON.stringify(o));
const DEMO = /解体|撤去|はがし|剥がし|斫り|はつり/;

/* 部屋ごとの仕上げ：その部屋に掛かっている明細の行（床・壁・天井の面積、巾木の長さ）から品目を拾う */
function finishes(p, r) {
  const o = {};
  (p.lines || []).forEach(l => {
    const b = l.basis; if (!b || !l.itemId || l.kind === 'labor') return;
    if (!(b.rooms === 'all' || (Array.isArray(b.rooms) && b.rooms.includes(r.id)))) return;
    const demo = DEMO.test(l.name || '');
    const k = { floor: demo ? 'dFloor' : 'floor', wall: demo ? 'dWall' : 'wallFin', ceil: demo ? 'dCeil' : 'ceilFin', base: 'haba' }[b.measure];
    if (k && !o[k]) o[k] = l.itemId;
  });
  return o;
}

/* 家具・什器の箱（3Dで天井まで立ち上げないため）：辞書で家具と判定できた線のかたまり（検出・類似）だけ。高さは種類ごとの目安（m） */
const FURN_H = { '机・デスク': [0.72, [0.80, 0.70, 0.55]], '椅子': [0.45, [0.42, 0.45, 0.50]], 'ソファ': [0.70, [0.55, 0.52, 0.48]], 'ベッド': [0.45, [0.85, 0.82, 0.76]],
  'ロッカー': [1.80, [0.70, 0.73, 0.76]], '収納（棚・キャビネット）': [1.80, [0.78, 0.72, 0.62]], '自販機': [1.83, [0.80, 0.30, 0.28]] };
/* 辞書で決まらなかった線のかたまりのうち、ロッカー・棚の並び（細長い四角の中に、短い辺と平行な仕切りが 28〜70cm おきに3本以上）。
 * 斜めの線（壁のハッチ）は数えない。間隔 28cm 未満は階段の段と見て入れない */
function lockerRow(c, segs) {
  if (!c || !c.b || !c.closed || (c.arcShare || 0) > 0.05) return false;
  const [x0, y0, x1, y1] = [Math.min(c.b[0], c.b[2]), Math.min(c.b[1], c.b[3]), Math.max(c.b[0], c.b[2]), Math.max(c.b[1], c.b[3])];
  const w = x1 - x0, h = y1 - y0, sh = Math.min(w, h), lg = Math.max(w, h), alongX = w >= h;
  if (sh < 0.3 || sh > 1.1 || lg < sh * 1.5 || lg > 12) return false;
  const e = 0.02, pos = new Set();
  for (const q of segs) {
    if (Math.min(q[0], q[2]) < x0 - e || Math.max(q[0], q[2]) > x1 + e || Math.min(q[1], q[3]) < y0 - e || Math.max(q[1], q[3]) > y1 + e) continue;
    const vx = Math.abs(q[2] - q[0]), vy = Math.abs(q[3] - q[1]);
    if (alongX ? (vx > 0.01 || vy < sh * 0.4) : (vy > 0.01 || vx < sh * 0.4)) continue;
    const v = alongX ? q[0] : q[1]; if (v < (alongX ? x0 : y0) + 0.05 || v > (alongX ? x1 : y1) - 0.05) continue;
    pos.add(Math.round(v * 100));
  }
  const P = [...pos].sort((a, b) => a - b), gaps = P.slice(1).map((v, k) => (v - P[k]) / 100).filter(g => g > 0.03);
  if (gaps.length < 2) return false;
  const m = gaps.slice().sort((a, b) => a - b)[gaps.length >> 1];
  return m >= 0.28 && m <= 0.7;
}
function furnBoxes(d) {
  let S = []; try { S = symList(d) || []; } catch (e) { return []; }
  const segs = (d.plan && d.plan.segs) || [], known = new Set(S.filter(s => s.furn).map(s => s.k - 10000));
  const lockers = ((d && d.furn) || []).filter((c, j) => !known.has(j) && lockerRow(c, segs))
    .map(c => ({ b: c.b, h: 1.8, col: FURN_H['ロッカー'][1], name: 'ロッカー・棚（線の並びから）' }));
  return lockers.concat(S.filter(s => s.furn && s.b && (s.verdict === 'hit' || s.verdict === 'near') && FURN_H[s.category])
    .map(s => { const w = Math.abs(s.b[2] - s.b[0]), l = Math.abs(s.b[3] - s.b[1]);
      /* 棚・ロッカーと見た物でも、縦横とも 70cm 未満の小さい物は机の横の椅子などなので、低い箱にする（事務所の机の列が柱のように見えた） */
      const small = /収納|ロッカー/.test(s.category) && Math.max(w, l) < 0.7;
      return { b: s.b, h: small ? 0.45 : FURN_H[s.category][0], col: small ? FURN_H['椅子'][1] : FURN_H[s.category][1], name: small ? '椅子など' : s.category }; }));
}
/* 器具の背中（壁側）：読み取りで分かっていない器具（線の形で拾った洋便器・洗面台など）は、四角の4辺のうち、
 * いちばん近くに平行な壁の線（50cm 以上）がある辺を背中にする。前は縦横の長さだけで決めていて、半分くらい向きが逆になっていた
 * （かつ「洗面台と洋便器の方向間違えてるのもある」・2026-11-24） */
function backOf(x, longSegs) {
  const b = x.b, sides = { N: [b[1] < b[3] ? b[3] : b[1], 'h'], S: [Math.min(b[1], b[3]), 'h'], E: [Math.max(b[0], b[2]), 'v'], W: [Math.min(b[0], b[2]), 'v'] };
  const x0 = Math.min(b[0], b[2]), x1 = Math.max(b[0], b[2]), y0 = Math.min(b[1], b[3]), y1 = Math.max(b[1], b[3]);
  let best = '', bd = 0.35;
  for (const [sd, [v, o]] of Object.entries(sides)) {
    for (const s of longSegs) {
      if (o === 'h') { if (Math.abs(s[1] - s[3]) > 0.02) continue; const lo = Math.min(s[0], s[2]), hi = Math.max(s[0], s[2]); if (Math.min(hi, x1) - Math.max(lo, x0) < (x1 - x0) * 0.6) continue;
        const dd = sd === 'N' ? s[1] - v : v - s[1]; if (dd > -0.03 && dd < bd) { bd = dd; best = sd; } }
      else { if (Math.abs(s[0] - s[2]) > 0.02) continue; const lo = Math.min(s[1], s[3]), hi = Math.max(s[1], s[3]); if (Math.min(hi, y1) - Math.max(lo, y0) < (y1 - y0) * 0.6) continue;
        const dd = sd === 'E' ? s[0] - v : v - s[0]; if (dd > -0.03 && dd < bd) { bd = dd; best = sd; } }
    }
  }
  return best;
}

export function toOld(p) {
  const d = p.drawing, plan = d.plan, ch0 = planCH(plan) || opts().ceilH;
  const P = { segs: plan.segs, dsegs: plan.dsegs || [], titles: plan.titles || [], furn: furnBoxes(d),
    faces: plan.faces.map((f, k) => ({ i: f.i, no: k + 1, name: f.name || '', area: f.area, peri: f.peri, ch: f.ch || 0, poly: f.poly })) };
  const rooms = p.rooms.filter(r => r.src === 'plan').map((r, k) => ({
    id: r.id, name: r.name, plan: true, faces: r.faces || [], ch: Number(r.h) > 0 ? Number(r.h) : ch0,
    color: Number.isFinite(r.color) ? r.color : k, area: Number(r.area) || 0, openW: 0, ...finishes(p, r)
  }));
  const places = (d.lights || []).map(x => ({ id: x.id, item: x.item, where: 'pt', p: [x.x, x.y], count: 1 }));
  (d.panels || (d.panel ? [{ id: 'P1', x: d.panel[0], y: d.panel[1] }] : [])).forEach((q, k) => places.push({ id: 'panel' + k, item: 'e-panel', where: 'pt', p: [q.x, q.y], rot: q.rot || 0, count: 1 }));
  (d.outlets || []).forEach(x => places.push({ id: x.id, item: x.item || 'e-cone', where: 'pt', p: [x.x, x.y], count: 1 }));
  (d.places || []).forEach(x => (x.where === 'pt' ? [x.p] : (x.pts || [])).forEach((q, k) => q && places.push({ id: x.id + '_' + k, item: x.item, where: 'pt', p: q, rot: x.rot || 0, count: 1 })));
  /* スイッチ：新しい画面で決めた位置（自動の物も）を置いた物として渡し、照明をそのスイッチにつなぐ（ブースの照明も外の部屋のスイッチへ） */
  const W = lightWires(p), link = {};
  W.sws.forEach(s0 => places.push({ id: 'sw_' + s0.key, item: 'e-sw1', where: 'pt', p: s0.l, count: 1 }));
  Object.entries(W.assign || {}).forEach(([lk, sk]) => { link[lk + ':0'] = 'sw_' + sk + ':0'; });
  const inReg = fixturesInRegions(d);   /* 表・表題欄の中の器具（会社のマーク・空の枠など）は3Dに出さない */
  /* 種類は図面の一覧・明細と同じ「補正後の表示」にする（保存してある生の判定のままだと、直した浴槽などが3Dでは元の種類で出ていた）。
   * 「器具ではない」「判定保留」にした物は3Dに出さない（かつ「トイレ3Dにしたらちょこちょこ浴槽になってる」・2026-11-24） */
  let TF = []; try { TF = typeFixMap(d) || []; } catch (e) { TF = []; }
  /* どの区画にも入らない器具（建物の外・図枠の余白・凡例など）は3Dに出さない（かつ「外に洗面台とか」・2026-11-24）。
   * 器具の四角の真ん中・少し内側の4隅・4辺の30cm外のどれかが区画の中にあれば出す（壁ぎわの器具は区画の形から欠けていることがあるため） */
  const FP = (plan.faces || []).filter(f => f.poly && f.poly.length > 2);
  const inAnyFace = b => { const x0 = Math.min(b[0], b[2]), x1 = Math.max(b[0], b[2]), y0 = Math.min(b[1], b[3]), y1 = Math.max(b[1], b[3]), ix = (x1 - x0) * .2, iy = (y1 - y0) * .2;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, o = 0.3;   /* 区画の形は器具の所が欠けていることがあるので、器具の4辺の 30cm 外も見る（器具の前の床） */
    const pts = [[cx, cy], [x0 + ix, y0 + iy], [x1 - ix, y0 + iy], [x1 - ix, y1 - iy], [x0 + ix, y1 - iy], [cx, y0 - o], [cx, y1 + o], [x0 - o, cy], [x1 + o, cy]];
    if (!FP.length || pts.some(q => FP.some(f => pip(q[0], q[1], f.poly)))) return true;
    /* ブースが区画になっていない図面もあるので、区画のふちから 1m 以内なら出す。それより離れた物（建物の外）だけ外す */
    const near = (px, py) => FP.some(f => f.poly.some((A, i) => { const B = f.poly[(i + 1) % f.poly.length], dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - A[0]) * dx + (py - A[1]) * dy) / L)) : 0; return Math.hypot(px - A[0] - dx * t, py - A[1] - dy * t) < 1; }));
    return near(cx, cy); };
  const longSegs = (plan.segs || []).filter(s => Math.hypot(s[2] - s[0], s[3] - s[1]) >= 0.5);
  const fix = { fx: (d.fixtures || []).map((x, k) => ({ id: 'f' + k, t: oldType(shownFixType(TF, x, k)), b: x.b, back: x.back || backOf(x, longSegs) })).filter((x, k) => !inReg[k] && x.t !== 'unknown' && x.t !== 'other' && inAnyFace(x.b)), doors: (d.doors || []).map(x => ({ c: x.c, m: x.m, r: x.r })) };
  const cur = { id: '__k3d', name: p.name || '', rooms, places, win: {}, win3d: clone(d.win3d || []), openAuto: true,
    wire: { on: (d.lights || []).length > 0 || (d.outlets || []).length > 0, sw: 'e-sw1', cL: 'e-v16-2', cO: 'e-v20-2', extra: d.wireExtra ?? 10, out: (d.outlets || []).length > 0, link } };
  /* 配線の線と長さは新しい画面の計算（ブースは外の部屋のスイッチ、置いたスイッチ・つなぎ替え込み）をそのまま見せる */
  const wire = { paths: W.paths, home: W.home, sws: [], lights: [], lenL: W.lenL, lenO: W.lenO, lenH: W.lenH, circ: W.circ, autoSw: 0, nL: W.nL, nO: W.nO, panel: (d.panels || (d.panel ? [{ id: 'P1', x: d.panel[0], y: d.panel[1] }] : [])).length > 0, far: W.far, noSw: 0 };
  return { plan: P, fix, cur, wire };
}

/* 図が2つ以上ある図面（1階・2階、現況・プラン など）で、1つの図だけを3Dにする：図の範囲（box＝[x0,y0,x1,y1]）の中の物だけにした案件の写しを作る。
 * 元の案件は変えない。配線の長さも、その図の中だけで数え直す */
export function sheetProject(p, sh) {
  if (!sh || !sh.box) return p;
  const [x0, y0, x1, y1] = sh.box, inB = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const d = p.drawing, plan = d.plan;
  const cOf = f => { if (Number.isFinite(f.cx) && Number.isFinite(f.cy)) return [f.cx, f.cy]; let x = 0, y = 0; f.poly.forEach(q => { x += q[0] / f.poly.length; y += q[1] / f.poly.length; }); return [x, y]; };
  const faces = (plan.faces || []).filter(f => f.poly && f.poly.length > 2 && inB(...cOf(f)));
  const ids = new Set(faces.map(f => f.i));
  const segIn = q => Array.isArray(q) && inB((q[0] + q[2]) / 2, (q[1] + q[3]) / 2);
  const ptIn = o => o && (Number.isFinite(o.x) ? inB(o.x, o.y) : true);
  const plan2 = { ...plan, faces, segs: (plan.segs || []).filter(segIn), dsegs: (plan.dsegs || []).filter(segIn), titles: (plan.titles || []).filter(ptIn) };
  const d2 = { ...d, plan: plan2,
    fixtures: (d.fixtures || []).filter(x => x.b && inB((x.b[0] + x.b[2]) / 2, (x.b[1] + x.b[3]) / 2)),
    doors: (d.doors || []).filter(x => !x.c || inB(x.c[0], x.c[1])),
    lights: (d.lights || []).filter(ptIn), outlets: (d.outlets || []).filter(ptIn), switches: (d.switches || []).filter(ptIn),
    panels: (d.panels || (d.panel ? [{ id: 'P1', x: d.panel[0], y: d.panel[1] }] : [])).filter(ptIn), panel: undefined,
    places: (d.places || []).map(x => x.where === 'pt' ? (x.p && inB(x.p[0], x.p[1]) ? x : null) : { ...x, pts: (x.pts || []).filter(q => q && inB(q[0], q[1])) }).filter(x => x && (x.where === 'pt' || x.pts.length)) };
  const rooms = p.rooms.map(r => r.src === 'plan' ? { ...r, faces: (r.faces || []).filter(i => ids.has(i)) } : r).filter(r => r.src !== 'plan' || r.faces.length);
  return { ...p, name: [p.name, sh.title].filter(Boolean).join(' '), drawing: d2, rooms };
}

let layer = null;
/* 3Dで足した窓：面している部屋（窓の真ん中から30cm以内に辺がある区画）の「窓を寸法で入れる」に入れる。
 * 3Dから入れた窓は from3d が付いていて、3Dを閉じるたびに入れ直す（手で入れた窓はそのまま） */
export function applyWin3d(p, list) {
  const d = p.drawing; d.win3d = list;
  const plan = d.plan, near = (q, P) => P.some((a, i) => { const b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1]) < 0.3; });
  p.rooms.forEach(r => { if (Array.isArray(r.windows)) r.windows = r.windows.filter(w => !w.from3d); });
  let n = 0;
  list.forEach((w, wi) => {
    p.rooms.filter(r => r.src === 'plan').forEach(r => {
      const F = (r.faces || []).map(i => plan.faces.find(f => f.i === i)).filter(Boolean);
      if (!F.some(f => near(w.p, f.poly) || pip(w.p[0], w.p[1], f.poly))) return;
      r.windows = r.windows || []; r.windows.push({ w: Math.round(w.w * 1000), h: Math.round(w.h * 1000), n: 1, from3d: wi + 1 }); n++;
    });
  });
  return n;
}

/* 途中で失敗した時は「3Dを用意しています…」の幕を残さず、理由を出す（かつ「パソコンでこれでずっと止まってる」） */
export async function open3D(p, opt = {}) {
  try { return await open3D0(p, opt); }
  catch (e) { close3D(); throw new Error('3Dを開けませんでした：' + (e && e.message ? e.message : String(e))); }
}
async function open3D0(p0, { onClose, sheet = null, sheets = [] } = {}) {
  if (!p0.drawing || !p0.drawing.plan) throw new Error('先に図面を読み込んでください');
  const p = sheet ? sheetProject(p0, sheet) : p0;
  close3D();
  const f = document.createElement('iframe');
  f.title = '3Dで見る';
  /* 用意ができるまでは隠して、幕（3Dを用意しています）を出す。前の画面が一瞬見えないように */
  f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:10000;background:#1c1f1a;visibility:hidden';
  const cover = document.createElement('div');
  cover.style.cssText = 'position:fixed;inset:0;z-index:10001;background:#1c1f1a;color:#e8e6df;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px';
  cover.textContent = '3Dを用意しています…';
  document.body.appendChild(cover); cover3 = cover;
  f.src = './old/index.html?view3d=1';
  document.body.appendChild(f); layer = f;
  const W = await new Promise((res, rej) => {
    let n = 0;
    const t = setInterval(() => {
      try {
        const w = f.contentWindow;
        if (w && typeof w.KAKU_open3D === 'function' && w.eval('typeof KAKU_cat!=="undefined"&&!!KAKU_cat')) { clearInterval(t); res(w); return; }
      } catch (e) { /* 読み込み中 */ }
      if (++n > 300 || layer !== f) { clearInterval(t); rej(new Error('3Dの部品が起動しませんでした')); }
    }, 100);
  });
  const st = W.document.createElement('style');
  st.textContent = 'body>*:not(#k3d):not(script):not(style){visibility:hidden!important}';
  W.document.head.appendChild(st);
  try { W.document.documentElement.dataset.theme = document.documentElement.dataset.theme || 'dark'; } catch (e) { /* なくてよい */ }
  W.__k3 = toOld(p);
  { let gl = false; try { const c = W.document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { /* 判定できない */ }
    if (!gl) throw new Error('このブラウザでは 3D の描画（WebGL）が使えません。ブラウザの設定でハードウェア アクセラレーションをオンにして、ブラウザを再起動してください'); }
  /* 3Dの部品の中で起きたエラーも拾う（パソコンで WebGL が使えない時など） */
  let inner = null; try { W.addEventListener('error', ev => { inner = inner || (ev.error && ev.error.message) || ev.message; }); } catch (e) { /* なくてよい */ }
  W.eval('KAKU_plan=window.__k3.plan;KAKU_fix=window.__k3.fix;current=window.__k3.cur;window.KW_calc=function(){return window.__k3.wire};KAKU_open3D()');
  await new Promise(r => setTimeout(r, 300));
  if (inner) throw new Error(inner);

  f.style.visibility = 'visible'; cover.remove();
  const btn = W.document.querySelector('#k3d .k3close');
  /* 図を1つだけ出している時は、3Dで足した窓を元の案件に戻さない（ほかの図の窓が消えるため） */
  if (btn) { btn.textContent = '閉じる'; btn.onclick = e => { e.preventDefault(); let wins = null; if (!sheet) { try { wins = JSON.parse(W.eval('JSON.stringify(current.win3d||[])')); } catch (er) { /* 読めなければそのまま */ } } close3D(); onClose && onClose(wins); }; }
  /* 図が2つ以上ある時：上の帯に図の切り替え（押すとその図の3Dを開き直す）。印刷・PDF は、出している図だけになる */
  if (sheets.length > 1) { try {
    const top = W.document.querySelector('#k3d .k3top'), bar = W.document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;overflow-x:auto;max-width:100%;padding:18px 0 2px;flex-basis:100%;order:9';   // 上に「高画質にしています」の字が出るので少し下げる
    const b = (label, sh) => { const x = W.document.createElement('button'); x.type = 'button'; x.textContent = label; x.className = 'k3print';
      const on = sh ? sheet && sheet.key === sh.key : !sheet; x.style.cssText = 'white-space:nowrap;' + (on ? 'outline:2px solid #e65c32' : 'opacity:.8');
      x.onclick = ev => { ev.preventDefault(); if (on) return; open3D(p0, { onClose, sheet: sh, sheets }).catch(er => { try { window.alert(er.message); } catch (e2) {} }); }; bar.appendChild(x); };
    sheets.forEach(sh => b(sh.title || '図', sh)); b('全部', null);
    if (top) { top.style.flexWrap = 'wrap'; top.appendChild(bar); }
  } catch (e) { /* 出せなくても3Dは使える */ } }
  return W;
}
let cover3 = null;
export function close3D() { if (layer) { layer.remove(); layer = null; } if (cover3) { cover3.remove(); cover3 = null; } }
