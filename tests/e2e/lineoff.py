# 線を外す（同じ種類を全部）で区画が作り直される・工事対象外の範囲で部屋の床と壁が減るのを確かめる（実図面。リポジトリに入れない .real/factory.dxf）
import os,json
from playwright.sync_api import sync_playwright
F=os.environ.get('KAKU_REAL_FACTORY','.real/factory.dxf')
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page(viewport={'width':1200,'height':1000});errs=[]
  pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
  pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
  pid=pg.evaluate('location.hash').split('/')[2]
  pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300);pg.set_input_files('#dwgFile',F)
  pg.wait_for_selector('#dwgFaces button',state='attached',timeout=300000);pg.wait_for_timeout(1500)
  D="async()=>{const a=await import('./js/app.js');return a.state.projects[0].drawing}"
  d0=pg.evaluate("async()=>{const a=await import('./js/app.js');const d=a.state.projects[0].drawing;return {n:d.plan.faces.length,gk:d.plan.gk,sg:d.plan.sg&&d.plan.sg.length,segs:d.plan.segs.length}}")
  ok=lambda c,m: print(('OK  ' if c else 'NG  ')+m)
  ok(d0['gk'] and d0['sg']==d0['segs'],f"線ごとの種類がある（{d0['sg']}/{d0['segs']}）")
  key=next((k for k in d0['gk'] if k.startswith('LAYER23|1')),None);print('外す種類',key)
  idx=pg.evaluate(f"async()=>{{const a=await import('./js/app.js');const d=a.state.projects[0].drawing;const k=d.plan.gk.indexOf({json.dumps(key)});return d.plan.sg.indexOf(k)}}")
  pg.click('[data-mode=lineoff]');pg.wait_for_timeout(200)
  # 線をタップした事にする（その線のまん中を画面の座標にして押す）
  xy=pg.evaluate(f"""async()=>{{const a=await import('./js/app.js');const s=a.state.projects[0].drawing.plan.segs[{idx}];const svg=document.querySelector('svg.pv');const pt=svg.createSVGPoint();pt.x=(s[0]+s[2])/2;pt.y=-(s[1]+s[3])/2;const g=svg.querySelector('g')||svg;const m=g.getScreenCTM();const q=pt.matrixTransform(m);return [q.x,q.y]}}""")
  pg.mouse.click(xy[0],xy[1]);pg.wait_for_timeout(300)
  print(pg.inner_text('#dwgBar')[:120].replace('\n',' '))
  if pg.locator('[data-act=loKind]').count(): pg.click('[data-act=loKind]')
  else: pg.click('[data-act=loOne]')
  pg.wait_for_timeout(200);pg.click('[data-act=loApply]')
  import time
  for _ in range(300):
    pg.wait_for_timeout(1000)
    if pg.evaluate("async()=>{const a=await import('./js/app.js');const d=a.state.projects[0].drawing;return !!(d&&!d.lineOffDirty&&d.lineOff)}"): break
  pg.wait_for_timeout(1500)
  d1=pg.evaluate("async()=>{const a=await import('./js/app.js');const d=a.state.projects[0].drawing;return {n:d.plan.faces.length,lo:d.lineOff,off:(d.plan.offSegs||[]).length}}")
  ok(d1['n']<d0['n'],f"区画が作り直された（{d0['n']}→{d1['n']}）・外した線 {d1['off']}本")
  # 工事対象外：区画を1つ部屋にして、その真ん中あたりに範囲を入れる
  r=pg.evaluate("""async()=>{const a=await import('./js/app.js');const p=a.state.projects[0],F=p.drawing.plan.faces.filter(f=>f.area>20&&f.area<200).sort((x,y)=>y.area-x.area)[0];return {i:F.i,area:F.area,poly:F.poly}}""")
  pg.click('[data-mode=room]');pg.wait_for_timeout(200)
  pg.evaluate(f"""async()=>{{const b=[...document.querySelectorAll('#dwgFaces button')].find(x=>x.dataset.face=='{r['i']}'||x.dataset.i=='{r['i']}');if(b)b.click()}}""");pg.wait_for_timeout(200)
  if pg.locator('[data-act=mkOne]').count()==0:
    print('区画の一覧のボタンが見つからない'); 
  else:
    pg.click('[data-act=mkOne]');pg.wait_for_timeout(500)
  room0=pg.evaluate("async()=>{const a=await import('./js/app.js');const r=a.state.projects[0].rooms[0];return r&&{a:r.area,p:r.perim}}")
  xs=[q[0] for q in r['poly']];ys=[q[1] for q in r['poly']];cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2
  pg.click('[data-mode=lineoff]');pg.wait_for_timeout(200);pg.click('[data-loway=out]');pg.wait_for_timeout(200)
  def tap(x,y):
    q=pg.evaluate(f"()=>{{const svg=document.querySelector('svg.pv');const pt=svg.createSVGPoint();pt.x={x};pt.y={-y};const g=svg.querySelector('g')||svg;const m=g.getScreenCTM();const r=pt.matrixTransform(m);return [r.x,r.y]}}")
    pg.mouse.click(q[0],q[1]);pg.wait_for_timeout(250)
  tap(cx-1,cy-1);tap(cx+1,cy+1)
  room1=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0],r=p.rooms[0];return r&&{a:r.area,p:r.perim,out:r.out,z:(p.drawing.outZones||[]).length}}")
  print('部屋',room0,'→',room1)
  ok(room0 and room1 and room1['z']==1 and room1['out'] and abs(room0['a']-room1['a']-room1['out']['area'])<0.05 and 3.5<room1['out']['area']<=4.01,'工事対象外の範囲の広さ（約4㎡）が部屋の床から引かれる')
  print(errs or 'no errors');b.close()
