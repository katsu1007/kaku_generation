/* 区画の正解との比べ方（js/answercmp.js）の決まりの確かめ。形は決まりを確かめるための四角だけ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerRooms, compareRooms } from '../js/answercmp.js';
const box = (x0, y0, x1, y1) => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

test('正解の線から部屋の輪を作り、中の文字を名前にする', () => {
  const R = answerRooms([...box(0, 0, 4, 3), ...box(4, 0, 7, 3)], [{ t: '事務室', x: 1, y: 1 }]);
  assert.equal(R.length, 2);
  assert.ok(R.some(r => r.name === '事務室' && Math.abs(r.area - 12) < 0.01));
});
test('1区画で合う・分かれすぎ・足りない・部屋をまたぐ区画を数える', () => {
  const rooms = [{ id: 'a1', name: 'A', area: 12, poly: sq(0, 0, 4, 3) }, { id: 'a2', name: 'B', area: 9, poly: sq(4, 0, 7, 3) }, { id: 'a3', name: 'C', area: 9, poly: sq(7, 0, 10, 3) }];
  const faces = [{ i: 0, area: 12, poly: sq(0, 0, 4, 3) }, { i: 1, area: 4.5, poly: sq(4, 0, 5.5, 3) }, { i: 2, area: 4.5, poly: sq(5.5, 0, 7, 3) }, { i: 3, area: 3, poly: sq(7, 0, 8, 3) }, { i: 4, area: 6, poly: sq(8.5, 0, 10.5, 3) }];
  const r = compareRooms(rooms, faces);
  assert.deepEqual(r.rooms.map(o => o.st), ['ok', 'split', 'split']);
  assert.equal(r.sum.ok, 1);
});
