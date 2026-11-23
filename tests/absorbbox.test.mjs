import test from 'node:test';
import assert from 'node:assert/strict';
import { absorbBoxes } from '../js/facemerge.js';
const rect = (i, x0, y0, x1, y1, extra = {}) => ({ i, area: (x1 - x0) * (y1 - y0), peri: 2 * (x1 - x0 + y1 - y0), poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], ...extra });
// 部屋（0〜6 × 0〜5、箱の所はくぼみ）の中の 0.5×1.4 の箱
const room = { i: 0, area: 29.3, peri: 22, poly: [[0, 0], [6, 0], [6, 5], [0, 5]] };
test('部屋の中の箱は部屋に入る（広さは足す・形はそのまま）', () => {
  const box = rect(1, 2, 2, 2.5, 3.4);
  const r = absorbBoxes({ faces: [room, box] });
  assert.equal(r.merged.length, 1);
  const f = r.faces.find(x => x.merged);
  assert.deepEqual(f.merged, [0, 1]);
  assert.equal(f.area, Math.round((29.3 + 0.7) * 100) / 100);
  assert.deepEqual(f.poly, room.poly);
  assert.ok(r.split[f.i] && r.split[f.i].faces.length === 2);
});
test('便器の入った箱（ブース）・名前のある箱・ドアのそばの箱は入れない', () => {
  const box = rect(1, 2, 2, 2.6, 3.5);
  assert.equal(absorbBoxes({ faces: [room, box], fixtures: [{ t: 'toilet', b: [2.1, 2.2, 2.5, 2.8] }] }).merged.length, 0);
  assert.equal(absorbBoxes({ faces: [room, { ...box, name: 'PS' }] }).merged.length, 0);
  assert.equal(absorbBoxes({ faces: [room, box], doors: [{ c: [2.6, 3.6], r: 0.8 }] }).merged.length, 0);
});
test('ほかの区画を2つ以上含む区画（図枠の内側）には入れない', () => {
  const frame = { i: 9, area: 380, poly: [[-10, -10], [10, -10], [10, 10], [-10, 10]] };
  const a = rect(3, -8, -8, -4, -4), b = rect(4, 4, 4, 8, 8), box = rect(5, 0, 0, 0.5, 1.4);
  assert.equal(absorbBoxes({ faces: [frame, a, b, box] }).merged.length, 0);
});
test('中に×がある箱（パイプスペース）と、短い辺が 75cm を超える箱（シャワーのブース）は入れない', () => {
  const box = rect(1, 2, 2, 2.6, 3.0);
  assert.equal(absorbBoxes({ faces: [room, box], segs: [[2, 2, 2.6, 3.0], [2, 3.0, 2.6, 2]] }).merged.length, 0);
  assert.equal(absorbBoxes({ faces: [room, rect(1, 2, 2, 2.9, 3.0)] }).merged.length, 0);
});
