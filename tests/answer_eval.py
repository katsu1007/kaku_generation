# かつが引いた区画の正解（.real/answers/*.rooms.json）5枚と、今の読み取りを一度に比べる。使い方: python3 tests/answer_eval.py 結果.json [図面名…]（sh tests/e2e/srv.sh を先に動かす）
import sys,json,os
from playwright.sync_api import sync_playwright
SETS=[('0530','.real/0530.jww'),('toilet_plan','.real/toilet_plan.jww'),('toilet','.real/toilet.jww'),('school','.real/school.dxf'),('factory','.real/factory.dxf')]
only=sys.argv[2:] 
JS=r"""async([pid,rooms])=>{const a=await import('./js/app.js'),C=await import('./js/answercmp.js');const d=a.state.projects.find(x=>x.id===pid).drawing;
const cmp=C.compareRooms(rooms,d.plan.faces);
const v2=d.v2?C.compareRooms(rooms,d.v2.faces):null;
return JSON.stringify({cmp,v2sum:v2&&v2.sum,v2rooms:v2&&v2.rooms,faces:d.plan.faces.map(f=>({i:f.i,area:f.area,poly:f.poly,merged:!!f.merged})),v2faces:d.v2?d.v2.faces.map(f=>({area:f.area,poly:f.poly})):[],segs:d.plan.segs,texts:((d.src2||{}).texts||[]),doors:d.doors||[]})}"""
R={}
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page();pg.goto('http://localhost:8765/');pg.wait_for_timeout(600)
  pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1;await a.saveSettings()}")
  for n,f in SETS:
    if only and n not in only: continue
    rooms=json.load(open(f'.real/answers/{n}.rooms.json'))
    pid=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'e'});await a.flush();return p.id}")
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(400);pg.set_input_files('#dwgFile',f)
    pg.wait_for_function("()=>document.querySelector('#dwgFaces button')",timeout=600000,polling=300);pg.wait_for_timeout(800)
    r=json.loads(pg.evaluate(JS,[pid,rooms]));r['rooms']=rooms;R[n]=r;s=r['cmp']['sum'];v=r['v2sum']
    print(f"{n:12} 部屋{s['rooms']:3} 合う{s['ok']:3} 分かれ{s['split']:3}(区画{s['facesInRooms']}) 足りない{s['short']:3} 広さ違い{s['diff']:3} 無し{s['none']:3} またぐ{s['extra']:3} | 試し 合う{v and v['ok']} 分かれ{v and v['split']} 無し{v and v['none']}",flush=True)
  b.close()
json.dump(R,open(sys.argv[1],'w'))
