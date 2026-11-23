/* 家具で割れた区画をまとめる（js/facemerge.js）の決まりの確かめ。形は決まりを確かめるための四角だけ（読み取りの点数づけには使わない） */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSplitFaces, splitMerged } from '../js/facemerge.js';
const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const f = (i, P, name = '') => ({ i, name, area: Math.abs((P[1][0] - P[0][0]) * (P[2][1] - P[1][1])), peri: 0, ch: 0, poly: P });
const v2 = [{ i: 0, name: '', area: 12, peri: 14, ch: 0, poly: sq(0, 0, 4, 3) }];

test('試しの区画1つに今の区画が2つ以上入る時は1つにまとめ、元は split に残す', () => {
  const faces = [f(0, sq(0, 0, 2, 3)), f(1, sq(2, 0, 4, 1.5)), f(2, sq(2, 1.5, 4, 3)), f(3, sq(5, 0, 7, 3))];
  const M = mergeSplitFaces({ faces, open: { 0: [{ ty: 'd', len: 0.8 }] }, v2faces: v2, v2open: { 0: [{ ty: 'd', len: 0.8 }] } });
  assert.equal(M.merged.length, 1);
  assert.deepEqual(M.merged[0].from.sort(), [0, 1, 2]);
  assert.equal(M.faces.length, 2);
  const nf = M.faces.find(x => x.merged);
  assert.equal(nf.area, 12);
  assert.ok(M.open[String(nf.i)]);
  assert.equal(M.open['0'], undefined);
  const S = splitMerged({ faces: M.faces, split: M.split }, M.open, nf.i);
  assert.equal(S.plan.faces.length, 4);
  assert.ok(S.open['0']);
});

test('違う部屋名が2つある・便器のある区画が2つある・中にドアがある時はまとめない', () => {
  const two = [f(0, sq(0, 0, 2, 3), '事務室'), f(1, sq(2, 0, 4, 3), '会議室')];
  assert.equal(mergeSplitFaces({ faces: two, v2faces: v2 }).merged.length, 0);
  const booths = [f(0, sq(0, 0, 2, 3)), f(1, sq(2, 0, 4, 3))];
  const fx = [{ t: 'toilet', b: [0.5, 0.5, 1, 1.2] }, { t: 'toilet', b: [2.5, 0.5, 3, 1.2] }];
  assert.equal(mergeSplitFaces({ faces: booths, v2faces: v2, fixtures: fx }).merged.length, 0);
  const door = [{ c: [2, 1.5], m: [2.5, 1.9], r: 0.75 }];
  assert.equal(mergeSplitFaces({ faces: booths, v2faces: v2, doors: door }).merged.length, 0);
  assert.equal(mergeSplitFaces({ faces: booths, v2faces: v2 }).merged.length, 1);
});

test('階段：名前が階段の区画・踏み面の列（両端がそろって等間隔に5本以上）が広い所に入る時はまとめない', async () => {
  const { treadRows } = await import('../js/facemerge.js');
  const tread = [0, 1, 2, 3, 4, 5].map(k => [1, 0.5 + k * 0.25, 2, 0.5 + k * 0.25]);
  assert.equal(treadRows(tread).length, 1);
  /* 端がばらばら（机の木目のような線）は列にしない */
  const grain = [0, 1, 2, 3, 4, 5].map(k => [1 + (k % 2) * 0.3, 0.5 + k * 0.25, 2 + (k % 3) * 0.2, 0.5 + k * 0.25]);
  assert.equal(treadRows(grain).length, 0);
  const faces = [f(0, sq(0, 0, 2, 3)), f(1, sq(2, 0, 4, 3))];
  assert.equal(mergeSplitFaces({ faces, v2faces: v2, segs: tread }).merged.length, 0);
  assert.equal(mergeSplitFaces({ faces: [f(0, sq(0, 0, 2, 3), '階段'), f(1, sq(2, 0, 4, 3))], v2faces: v2 }).merged.length, 0);
  assert.equal(mergeSplitFaces({ faces, v2faces: v2, texts: [{ t: 'UP', x: 1, y: 1 }] }).merged.length, 0);
  assert.equal(mergeSplitFaces({ faces, v2faces: v2, segs: [] }).merged.length, 1);
});
