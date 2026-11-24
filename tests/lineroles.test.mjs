// 線の役割（js/lineroles.js）：家具の線だけを外し、壁・扉・袖壁は残すか
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnitureLines } from '../js/lineroles.js';
const rect = (x0, y0, x1, y1) => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
/* 6m×4m の部屋：壁は厚み 12cm の2本線 */
const room = () => [...rect(0, 0, 6, 4), ...rect(-0.12, -0.12, 6.12, 4.12)];
test('部屋の中の机（線がぎっしり）は家具、壁は残す', () => {
  /* 机：天板の縁の2本線（3cm）＋引き出しの線＋椅子（小さい多角形）。等間隔に何本も並ぶ板の線（20cm おき）はまだ壁の2本線と見分けられない（宿題） */
  const desk = [...rect(2, 1.5, 3.6, 2.2), ...rect(2.03, 1.53, 3.57, 2.17), [2.8, 1.53, 2.8, 2.17], [3.2, 1.53, 3.2, 2.17]];
  for (const cx of [2.4, 3.2]) { const n = 8, r = 0.22, cy = 2.5; for (let k = 0; k < n; k++) { const a = k / n * 2 * Math.PI, b = (k + 1) / n * 2 * Math.PI; desk.push([cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b)]); } desk.push([cx, 2.2, cx, 2.28]); }
  const segs = [...room(), ...desk].map(s => [...s, 0]);
  const f = new Set(furnitureLines(segs));
  for (let i = 0; i < 8; i++) assert.ok(!f.has(i), '壁は外さない');
  for (let i = 8; i < segs.length; i++) assert.ok(f.has(i), '机は外す');
});
test('壁に付いた短い袖壁と、2本の壁の間の建具枠は外さない', () => {
  const stub = [[0, 2, 0.6, 2], [0.6, 2, 0.6, 2.1], [0.6, 2.1, 0, 2.1]];            // 左の壁から出た袖壁（3本）
  const frame = [[6, 1, 6.12, 1], [6, 1.9, 6.12, 1.9], [6.03, 1, 6.03, 1.9], [6.09, 1, 6.09, 1.9], [6.03, 1.2, 6.09, 1.2], [6.03, 1.6, 6.09, 1.6], [6.03, 1.4, 6.09, 1.4]];
  const segs = [...room(), ...stub, ...frame].map(s => [...s, 0]);
  const f = new Set(furnitureLines(segs));
  assert.equal(f.size, 0);
});
test('水まわりの器具のそばのかたまりは外さない', () => {
  const booth = [...rect(2, 1, 2.9, 2.2)]; for (let k = 1; k < 6; k++) booth.push([2, 1 + k * 0.2, 2.9, 1 + k * 0.2]);
  const segs = [...room(), ...booth].map(s => [...s, 0]);
  assert.equal(furnitureLines(segs, () => true, { keepBoxes: [[2.2, 1.3, 2.7, 2]] }).length, 0);
});
