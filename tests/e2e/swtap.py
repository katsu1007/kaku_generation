# 照明・配線の「スイッチ」：指でタップ（少しずれる）したら消える（青に変わって残らない）。黄（自動）・青（置いた物）どちらも
import os
from playwright.sync_api import sync_playwright
REAL=os.environ.get('KAKU_REAL_TOILET','.real/toilet.jww')
ok=lambda c,m: print(('OK  ' if c else 'NG  ')+m)
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
  ctx=b.new_context(viewport={'width':430,'height':900},is_mobile=True,has_touch=True);pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
  pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
  pid=pg.evaluate('location.hash').split('/')[2]
  pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300);pg.set_input_files('#dwgFile',REAL)
  pg.wait_for_selector('#dwgFaces button',state='attached',timeout=120000);pg.wait_for_timeout(2000)
  J=lambda q: pg.evaluate("document.querySelector('%s').click()"%q)
  J('[data-act=selRest]');pg.wait_for_timeout(200);J('[data-act=mkEach]');pg.wait_for_timeout(500)
  J('[data-mode=light]');pg.wait_for_timeout(200);pg.select_option('#lUse','toilet');pg.screenshot(path='/tmp/claude-0/-home-user/03b5ee78-3ce3-5cd3-8fbd-94aac61bea85/scratchpad/lbar.png',full_page=False);J('[data-act=lAuto]');pg.wait_for_timeout(2500)
  J('[data-ltool=sw]');pg.wait_for_timeout(300)
  cdp=ctx.new_cdp_session(pg)
  st=lambda: pg.evaluate("async()=>{const a=await import('./js/app.js');const pr=await import('./js/project.js');const p=a.state.projects.find(x=>x.id==='%s');const W=pr.lightWires(p);return {auto:W.sws.filter(s=>s.auto).map(s=>s.l),placed:(p.drawing.switches||[]).length,all:W.sws.length}}"%pid)
  P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('#dwgView svg.pv');const pt=s.createSVGPoint();pt.x={x};pt.y={-y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
  # 試しのタッチがどれだけずれて届くかを先に測る（テストの道具のずれ。アプリのずれではない）
  def probe():
    pg.evaluate("window.__pr=null;document.addEventListener('pointerdown',e=>{window.__pr=[e.clientX,e.clientY]},{once:true,capture:true})")
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':200,'y':300}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});pg.wait_for_timeout(100)
    r=pg.evaluate('window.__pr');return (r[0]-200,r[1]-300)
  def tap(x,y,wob):
    ox,oy=probe();x-=ox;y-=oy
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});pg.wait_for_timeout(60)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+wob,'y':y+wob/2}]});pg.wait_for_timeout(60)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});pg.wait_for_timeout(400)
  pg.evaluate("window.__ev=[];const s=document.querySelector('#dwgView svg.pv');['pointerdown','pointermove','pointerup','pointercancel','touchstart'].forEach(t=>s.addEventListener(t,e=>window.__ev.push(t+':'+(e.pointerType||'')+':'+Math.round(e.clientX||0)+','+Math.round(e.clientY||0))))")
  s0=st();sw=s0['auto'][0]
  pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'center'})");pg.wait_for_timeout(300)
  x,y=P(*sw);tap(x,y,9)
  s1=st()
  ok(s1['all']==s0['all']-1 and s1['placed']==s0['placed'],f'黄のスイッチを指でタップ（9px ずれ）すると消える（{s0["all"]}→{s1["all"]}・置いた物 {s1["placed"]}）')
  # 大きく動かすと今まで通り動かせる（青になる）
  sw=s1['auto'][0];x,y=P(*sw)
  ox,oy=probe();x-=ox;y-=oy
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});pg.wait_for_timeout(60)
  for k in range(1,6): cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+k*8,'y':y}]});pg.wait_for_timeout(30)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});pg.wait_for_timeout(400)
  s2=st();ok(s2['placed']==s1['placed']+1,f'なぞると動かせる（置いたスイッチ {s2["placed"]}）')
  # 青のスイッチも指でタップすると消える
  pl=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');const q=p.drawing.switches[0];return [q.x,q.y]}"%pid)
  x,y=P(*pl);tap(x,y,8)
  s3=st();ok(s3['placed']==s2['placed']-1,f'青のスイッチも指でタップすると消える（{s2["placed"]}→{s3["placed"]}）')
  print(errs or 'no errors');b.close()
