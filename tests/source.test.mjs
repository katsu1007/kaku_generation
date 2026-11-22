/* 数量の出どころ（図面から／手入力／図面＋手入力）と、組み合わせの入れ忘れチェックのテスト。
 * 実行：node tests/source.test.mjs
 * 期待値は決まりから手で書いた物（どの部屋・どの行が図面から来たか）。金額・数量が変わらないことも確かめる */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineSource, totals } from '../js/calc.js';
import { openChecks } from '../js/workcheck.js';

const rooms = [
  { id: 'p1', name: '事務室', src: 'plan', w: 4, d: 3, h: 2.5, qty: 1 },
  { id: 'p2', name: '会議室', src: 'plan', w: 3, d: 3, h: 2.5, qty: 1 },
  { id: 'm1', name: '倉庫', w: 2, d: 2, h: 2.5, qty: 1 }
];
const src = (l, ls = [l]) => lineSource(l, rooms, ls).src;

test('部屋から数える行：図面の部屋だけ＝図面、手の部屋だけ＝手入力、両方＝両方', () => {
  assert.equal(src({ basis: { measure: 'floor', rooms: ['p1', 'p2'] } }), 'drawing');
  assert.equal(src({ basis: { measure: 'floor', rooms: ['m1'] } }), 'manual');
  const S = lineSource({ basis: { measure: 'floor', rooms: 'all' } }, rooms, []);
  assert.deepEqual(S, { src: 'mixed', nDraw: 2, nMan: 1 });
  assert.equal(src({ basis: { measure: 'floor', rooms: [] } }), 'manual');
});
test('図面の器具・図面で入れた物の行は図面、数量を手で入れた行は手入力', () => {
  assert.equal(src({ qty: 3, basis: null, fromFix: 'toilet' }), 'drawing');
  assert.equal(src({ qty: 12, basis: null, fromDemo: 'el|cable' }), 'drawing');
  assert.equal(src({ qty: 1, basis: null }), 'manual');
});
test('廃材の行は、もとの解体の行の出どころ。配管から数える行は元の配管の行', () => {
  const d1 = { id: 'd1', cat: 'demoF', itemId: 'w-dFloor', unit: '㎡', kind: 'labor', basis: { measure: 'floor', rooms: ['p1'] } };
  const d2 = { id: 'd2', cat: 'demoF', itemId: 'w-dFloor', unit: '㎡', kind: 'labor', basis: { measure: 'floor', rooms: ['m1'] } };
  const w = { id: 'w', basis: { measure: 'waste' } };
  assert.equal(lineSource(w, rooms, [d1, w]).src, 'drawing');
  assert.equal(lineSource(w, rooms, [d1, d2, w]).src, 'mixed');
  const pipe = { id: 'pp', qty: 10, basis: null };
  const fit = { id: 'f', basis: { measure: 'link', line: 'pp', rate: 0.5 } };
  assert.equal(lineSource(fit, rooms, [pipe, fit]).src, 'manual');
  assert.equal(lineSource(fit, rooms, [{ ...pipe, fromDemo: 'x' }, fit]).src, 'drawing');
});
test('出どころを見ても金額は変わらない（行に何も書き足さない）', () => {
  const p = { rooms, lines: [{ id: 'a', name: '床', cat: 'floor', kind: 'mat', price: 1000, basis: { measure: 'floor', rooms: 'all' } }] };
  const before = JSON.stringify(p), t0 = totals(p).subtotal;
  p.lines.forEach(l => lineSource(l, p.rooms, p.lines));
  assert.equal(JSON.stringify(p), before);
  assert.equal(totals(p).subtotal, t0);
});

const base = extra => ({
  name: '改修', customer: '山田様', overheadPct: 10, profitPct: 0,
  rooms: rooms.map(r => ({ ...r })),
  lines: [
    { id: 'y', name: '養生', cat: 'work', kind: 'labor', price: 500, qty: 1 },
    { id: 'x', name: '処分', cat: 'work', kind: 'labor', price: 500, qty: 1 },
    ...extra
  ]
});
const keys = p => openChecks(p).map(x => x.key);

test('解体する部屋が、同じ所の仕上げに入っていない時だけ知らせる', () => {
  const demo = { id: 'd', name: '床解体', cat: 'demoF', kind: 'labor', price: 1300, basis: { measure: 'floor', rooms: ['p1', 'p2'] } };
  const fin = r => ({ id: 'f', name: 'フロア', cat: 'floor', kind: 'mat', price: 3000, basis: { measure: 'floor', rooms: r } });
  const lab = { id: 'fl', name: '床張り手間', cat: 'floor', kind: 'labor', price: 1000, basis: { measure: 'floor', rooms: 'all' } };
  assert.ok(!keys(base([demo, fin(['p1', 'p2']), lab])).includes('demoNoFin'));
  const c = openChecks(base([demo, { ...fin(['p1']), }]) ).find(x => x.key === 'demoNoFin');
  assert.ok(c && c.msg.includes('会議室') && !c.msg.includes('事務室'));
  /* 図面で入れた壁の解体（間仕切りの撤去）は見ない */
  assert.ok(!keys(base([{ id: 'w', name: '壁解体', cat: 'demoW', kind: 'labor', price: 1500, qty: 10, basis: null, fromDemo: 'wall|1' }])).includes('demoNoFin'));
});
test('ボードごと解体するのに新しいボードが無い時だけ知らせる（クロス剥がしだけなら出ない）', () => {
  const cloth = { id: 'c', name: '壁解体 クロス剥がしのみ', cat: 'demoW', kind: 'labor', price: 650, basis: { measure: 'wall', rooms: ['p1'] } };
  const board = { id: 'b', name: '壁解体 ボードごと（クロス共）', cat: 'demoW', kind: 'labor', price: 1400, basis: { measure: 'wall', rooms: ['p1'] } };
  const wallFin = { id: 'wf', name: 'クロス', cat: 'wall', kind: 'mat', price: 1000, basis: { measure: 'wall', rooms: 'all' } };
  const newBoard = { id: 'nb', name: '石膏ボード', cat: 'board', kind: 'mat', price: 600, basis: { measure: 'wall', rooms: ['p1'] } };
  assert.ok(!keys(base([cloth, wallFin])).includes('boardMiss:wall'));
  assert.ok(keys(base([board, wallFin])).includes('boardMiss:wall'));
  assert.ok(!keys(base([board, wallFin, newBoard])).includes('boardMiss:wall'));
  /* ボードを数量で入れてある時は、どの部屋の分か分からないので出さない */
  assert.ok(!keys(base([board, wallFin, { id: 'nb2', name: '石膏ボード', cat: 'board', kind: 'mat', price: 600, qty: 20, basis: null }])).includes('boardMiss:wall'));
});
