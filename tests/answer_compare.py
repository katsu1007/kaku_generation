# 区画の正解（JW_CAD で「正解」レイヤに部屋の外まわりを引いた図面）と、今の読み取りの区画を比べる。
# 使い方: python3 tests/answer_compare.py 図面.jww [結果.json] [--key 線のまとまりの正規表現] [--base 元の図面]
#   （sh tests/e2e/srv.sh でポート 8765 を先に動かす）
#   --key：レイヤ名に「正解」が無い時、正解の線のまとまり（"レイヤ|色|太さ"）を正規表現で選ぶ（例 '^0-3\|5\|'）
#   --base：正解の線を足した図面ではなく、元の図面の読み取りと比べる（正解の線を壁と読まないように）
# 正解の部屋は .real/answers/<図面名>.rooms.json にも書き出す（お客さんの図面の中身なのでリポジトリには入れない）
import sys, json, os
from playwright.sync_api import sync_playwright
args = sys.argv[1:]; KEY = None; BASE = None
if '--key' in args: i = args.index('--key'); KEY = args[i + 1]; del args[i:i + 2]
if '--base' in args: i = args.index('--base'); BASE = args[i + 1]; del args[i:i + 2]
F = args[0]; OUT = args[1] if len(args) > 1 else None
URL = os.environ.get('KAKU_URL', 'http://localhost:8765/')
JS = r"""async([pid,key,rooms0])=>{
  const a=await import('./js/app.js'),L=await import('./js/legacy.js'),C=await import('./js/answercmp.js');
  const p=a.state.projects.find(x=>x.id===pid),d=p.drawing;
  const W=await L.getReader(),E=W.document.getElementById('engineFrame').contentWindow;
  const got=JSON.parse(E.eval(`(()=>{const M=rgM(),q=v=>Math.round(v*1000)/1000,re=new RegExp(${JSON.stringify(key||'')}||'正解|ANSWER','i'),o=[];const lys=[...new Set(RG.segs.map(s=>s[0]))];
    RG.segs.forEach(s=>{if(!re.test(${key?'gkey(s)':'String(s[0])'}))return;const A=KAKU_rerot([s[1]*M,s[2]*M],M),B=KAKU_rerot([s[3]*M,s[4]*M],M);o.push([q(A[0]),q(A[1]),q(B[0]),q(B[1])])});
    return JSON.stringify({segs:o,layers:lys.slice(0,80)})})()`));
  const texts=(d.src2&&d.src2.texts)||[];
  let rooms=rooms0;
  if(!rooms){ if(!got.segs.length) return JSON.stringify({err:'正解のレイヤ（名前に「正解」）が見つかりません',layers:got.layers}); rooms=C.answerRooms(got.segs,texts); }
  const cmp=C.compareRooms(rooms,d.plan.faces);
  return JSON.stringify({file:d.fileName,faces:d.plan.faces.length,rooms:rooms.map(r=>({id:r.id,name:r.name,area:r.area,poly:r.poly})),cmp});
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox']); pg = b.new_page()
    pg.goto(URL); pg.wait_for_timeout(600)
    pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1;await a.saveSettings()}")
    def load(path):
        pid = pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'answer'});await a.flush();return p.id}")
        pg.goto(URL + f'#/p/{pid}/2'); pg.wait_for_timeout(400)
        pg.set_input_files('#dwgFile', path)
        pg.wait_for_function("()=>document.querySelector('#dwgFaces button')", timeout=600000, polling=300); pg.wait_for_timeout(800)
        return pid
    R = json.loads(pg.evaluate(JS, [load(F), KEY, None]))
    if BASE and 'err' not in R:
        R = json.loads(pg.evaluate(JS, [load(BASE), None, R['rooms']]))
    b.close()
if 'err' in R:
    print(R['err']); print('レイヤ:', R['layers']); sys.exit(1)
s = R['cmp']['sum']
print(f"{os.path.basename(F)}: 区画{R['faces']}  正解の部屋{s['rooms']}  1区画で合う{s['ok']}  分かれすぎ{s['split']}（区画{s['facesInRooms']}）  足りない{s['short']}  広さ違い{s['diff']}  区画なし{s['none']}  部屋をまたぐ区画{s['extra']}")
for r in R['cmp']['rooms']:
    if r['st'] != 'ok': print(f"  {r['st']:5} {r['name'] or r['id']:12} 正解{r['area']}㎡ 読み取り{r['got']}㎡（{r['err']}%） 区画{r['n']} 覆い{r['cover']}%")
os.makedirs('.real/answers', exist_ok=True)
json.dump(R['rooms'], open('.real/answers/' + os.path.splitext(os.path.basename(F))[0] + '.rooms.json', 'w'), ensure_ascii=False)
if OUT: json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
