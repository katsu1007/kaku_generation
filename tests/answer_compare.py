# 区画の正解（JW_CAD で「正解」レイヤに部屋の外まわりを引いた図面）と、今の読み取りの区画を比べる。
# 使い方: python3 tests/answer_compare.py 図面.jww [結果.json]   （sh tests/e2e/srv.sh でポート 8765 を先に動かす）
# 正解の部屋は .real/answers/<図面名>.rooms.json にも書き出す（お客さんの図面の中身なのでリポジトリには入れない）
import sys, json, os
from playwright.sync_api import sync_playwright
F = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else None
URL = os.environ.get('KAKU_URL', 'http://localhost:8765/')
JS = r"""async(pid)=>{
  const a=await import('./js/app.js'),L=await import('./js/legacy.js'),C=await import('./js/answercmp.js');
  const p=a.state.projects.find(x=>x.id===pid),d=p.drawing;
  const W=await L.getReader(),E=W.document.getElementById('engineFrame').contentWindow;
  const got=JSON.parse(E.eval(`(()=>{const M=rgM(),q=v=>Math.round(v*1000)/1000,re=/正解|ANSWER/i,o=[];const lys=[...new Set(RG.segs.map(s=>s[0]))];
    RG.segs.forEach(s=>{if(!re.test(String(s[0])))return;const A=KAKU_rerot([s[1]*M,s[2]*M],M),B=KAKU_rerot([s[3]*M,s[4]*M],M);o.push([q(A[0]),q(A[1]),q(B[0]),q(B[1])])});
    return JSON.stringify({segs:o,layers:lys.slice(0,80)})})()`));
  if(!got.segs.length) return JSON.stringify({err:'正解のレイヤ（名前に「正解」）が見つかりません',layers:got.layers});
  const texts=(d.src2&&d.src2.texts)||[];
  const rooms=C.answerRooms(got.segs,texts);
  const cmp=C.compareRooms(rooms,d.plan.faces);
  return JSON.stringify({file:d.fileName,faces:d.plan.faces.length,rooms:rooms.map(r=>({id:r.id,name:r.name,area:r.area,poly:r.poly})),cmp});
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox']); pg = b.new_page()
    pg.goto(URL); pg.wait_for_timeout(600)
    pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1;await a.saveSettings()}")
    pid = pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'answer'});await a.flush();return p.id}")
    pg.goto(URL + f'#/p/{pid}/2'); pg.wait_for_timeout(400)
    pg.set_input_files('#dwgFile', F)
    pg.wait_for_function("()=>document.querySelector('#dwgFaces button')", timeout=600000, polling=300); pg.wait_for_timeout(800)
    R = json.loads(pg.evaluate(JS, pid)); b.close()
if 'err' in R:
    print(R['err']); print('レイヤ:', R['layers']); sys.exit(1)
s = R['cmp']['sum']
print(f"{os.path.basename(F)}: 区画{R['faces']}  正解の部屋{s['rooms']}  1区画で合う{s['ok']}  分かれすぎ{s['split']}（区画{s['facesInRooms']}）  足りない{s['short']}  広さ違い{s['diff']}  区画なし{s['none']}  部屋をまたぐ区画{s['extra']}")
for r in R['cmp']['rooms']:
    if r['st'] != 'ok': print(f"  {r['st']:5} {r['name'] or r['id']:12} 正解{r['area']}㎡ 読み取り{r['got']}㎡（{r['err']}%） 区画{r['n']} 覆い{r['cover']}%")
os.makedirs('.real/answers', exist_ok=True)
json.dump(R['rooms'], open('.real/answers/' + os.path.splitext(os.path.basename(F))[0] + '.rooms.json', 'w'), ensure_ascii=False)
if OUT: json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
