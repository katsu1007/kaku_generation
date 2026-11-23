/* 横に並んだ図（現況図｜改修プラン）を分ける決まり（js/reader2/index.js の splitCols）の確かめ。形は決まりを確かめるための四角だけ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCols } from '../js/reader2/index.js';
const box = (x0, y0, x1, y1) => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
const fb = [-2, -4, 22, 8];
const segs = [...box(-2, -4, 22, 8), ...box(0, 0, 8, 6), ...box(12, 0, 20, 6), ...box(14, -4, 22, -2)];

test('同じ高さの見出し2つ・似た大きさの建物2つなら、間のすき間で分ける', () => {
  const r = splitCols(fb, [{ t: '現況図', x: 3, y: -1.2 }, { t: '改修プラン', x: 15, y: -1.2 }], segs, []);
  assert.equal(r.length, 2);
  assert.equal(r[0].kind, 'now'); assert.equal(r[1].kind, 'plan');
  assert.ok(r[0].box[2] > 8 && r[0].box[2] < 12);
});
test('建物の大きさが違う・見出しが1つだけ・見出しの高さが違う時は分けない', () => {
  const s2 = [...box(-2, -4, 22, 8), ...box(0, 0, 8, 6), ...box(12, 0, 14, 2)];
  assert.equal(splitCols(fb, [{ t: '現況図', x: 3, y: -1.2 }, { t: '改修プラン', x: 15, y: -1.2 }], s2, []), null);
  assert.equal(splitCols(fb, [{ t: '現況図', x: 3, y: -1.2 }], segs, []), null);
  assert.equal(splitCols(fb, [{ t: '現況図', x: 3, y: -1.2 }, { t: '改修プラン', x: 15, y: 5 }], segs, []), null);
});
