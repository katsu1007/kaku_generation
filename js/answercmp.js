/* 区画の正解と読み取りを比べる（かつが JW_CAD で「正解」レイヤに部屋の外まわりを引いて送ってくれる図面用・2026-11-23）
 * 「正解」レイヤ（名前に 正解 か ANSWER）の線は、読み取りの部品が壁にも器具にも使わない（SKIP_LAYER・KF_SKIP）。
 * ここでは、その線を閉じた輪（部屋）にして、読み取った区画と重ねて比べる。画面には出さない（テストの道具） */
import { polygonizeFaces, overlapArea } from './polygonize.js';

const polyA = P => { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]); return Math.abs(s) / 2; };
const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

/* 正解の線 → 部屋の輪。いちばん内側の輪だけ（外まわりを2重に引いた時の外の輪は捨てる）。0.3㎡ 未満は捨てる。
 * texts（{t,x,y}）があれば、輪の中の文字を部屋の名前にする */
export function answerRooms(segs, texts = []) {
  const F = polygonizeFaces(segs || [], { snap: 0.02 }).filter(f => f.area >= 0.3);
  return F.map((f, k) => {
    const name = (texts || []).filter(t => t && pip(t.x, t.y, f.poly)).map(t => String(t.t).trim()).filter(Boolean).join('・');
    return { id: 'a' + (k + 1), name, area: Math.round(f.area * 100) / 100, poly: f.poly };
  });
}

/* 正解の部屋と読み取りの区画を比べる。
 * 区画が部屋に入っている＝区画の広さ（形）の半分以上が部屋に重なる。
 * 部屋ごと：ok（1区画で、広さの差が ±5% 以内）／split（2区画以上に分かれている）／short（区画で覆えていない所が 2割以上）／diff（1区画だが広さが ±5% を超える）
 * 部屋に入らない区画（0.5㎡ 以上）は extra（部屋でない所を区画にしている・部屋をまたいでいる） */
export function compareRooms(rooms, faces) {
  const F = (faces || []).filter(f => f && f.poly && f.poly.length >= 3).map(f => ({ f, A: polyA(f.poly) }));
  const used = new Set();
  const out = rooms.map(r => {
    const mem = [];
    F.forEach(x => { if (!(x.A > 0)) return; const ov = overlapArea(x.f.poly, r.poly); if (ov >= x.A * 0.5) { mem.push({ x, ov }); used.add(x.f.i); } });
    const cover = mem.reduce((s, m) => s + m.ov, 0) / r.area;
    const got = mem.reduce((s, m) => s + (+m.x.f.area || m.x.A), 0);
    const err = r.area ? (got - r.area) / r.area * 100 : 0;
    const st = !mem.length ? 'none' : mem.length >= 2 ? 'split' : cover < 0.8 ? 'short' : Math.abs(err) <= 5 ? 'ok' : 'diff';
    return { id: r.id, name: r.name, area: r.area, st, n: mem.length, faces: mem.map(m => m.x.f.no ?? m.x.f.i), got: Math.round(got * 100) / 100, err: Math.round(err * 10) / 10, cover: Math.round(cover * 100) };
  });
  const extra = F.filter(x => !used.has(x.f.i) && (+x.f.area || x.A) >= 0.5 && rooms.some(r => { const ov = overlapArea(x.f.poly, r.poly); return ov > 0.05; })).map(x => ({ no: x.f.no ?? x.f.i, area: Math.round((+x.f.area || x.A) * 100) / 100 }));
  const cnt = st => out.filter(o => o.st === st).length;
  return { rooms: out, extra, sum: { rooms: out.length, ok: cnt('ok'), split: cnt('split'), short: cnt('short'), diff: cnt('diff'), none: cnt('none'), extra: extra.length, facesInRooms: out.reduce((s, o) => s + o.n, 0) } };
}
