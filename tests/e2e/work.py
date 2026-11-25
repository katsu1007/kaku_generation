# ③工事の図面：区画をタップして、解体・新規のタブで工事を選ぶ（まだ部屋でない区画は部屋になる）・項目を追加・外す
import os
from playwright.sync_api import sync_playwright
REAL=os.environ.get('KAKU_REAL_TOILET','.real/toilet.jww')
ok=lambda c,m: print(('OK  ' if c else 'NG  ')+m)
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page(viewport={'width':1100,'height':900});errs=[]
  pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
  pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
  pid=pg.evaluate('location.hash').split('/')[2]
  pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300);pg.set_input_files('#dwgFile',REAL)
  pg.wait_for_selector('#dwgFaces button',state='attached',timeout=120000);pg.wait_for_timeout(1500)
  P="async()=>{const a=await import('./js/app.js');return a.state.projects[0]}"
  pg.goto(f'http://localhost:8765/#/p/{pid}/3');pg.wait_for_timeout(800)
  ok(pg.locator('.wk-view svg.pv').count()==1,'③工事に図面が出る')
  # いちばん大きく見える区画の真ん中をタップ
  bx=pg.evaluate("""()=>{let best=null,ba=0;document.querySelectorAll('.wk-view .faces polygon').forEach(e=>{const r=e.getBoundingClientRect();if(r.width*r.height>ba&&r.width<700){ba=r.width*r.height;best=[r.x+r.width/2,r.y+r.height/2,+e.dataset.i]}});return best}""")
  pg.mouse.click(bx[0],bx[1]);pg.wait_for_timeout(300)
  ok(pg.locator('.wk-panel [data-wkslot]').count()>=3,'タップで解体のタブが出る（%d 枠）'%pg.locator('.wk-panel [data-wkslot]').count())
  r0=pg.evaluate(P+"().then(p=>p.rooms.length)") if False else pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects.find(x=>x.id==='%s').rooms.length}"%pid)
  sel=pg.locator('.wk-panel [data-wkslot=fD]');opt=sel.locator('option').nth(1).get_attribute('value');sel.select_option(opt);pg.wait_for_timeout(400)
  st=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return {n:p.rooms.length,l:p.lines.filter(l=>l.cat==='demoF').map(l=>l.basis.rooms.length)}}"%pid)
  ok(st['n']==r0+1,f'まだ部屋でない区画が部屋になる（{r0}→{st["n"]}）')
  ok(st['l']==[1],f'床の解体の行に部屋が入る（{st["l"]}）')
  pg.click('.wk-panel [data-wk=tab][data-v=new]');pg.wait_for_timeout(200)
  ok(pg.locator('.wk-panel [data-wkslot=fF]').count()==1 and pg.locator('.wk-panel [data-wkslot=fD]').count()==0,'新規のタブに切り替わる')
  pg.click('.wk-panel [data-wk=add]');pg.wait_for_timeout(300)
  pg.locator('.modal [data-list] [data-id]').first.click();pg.wait_for_timeout(400)
  ok(pg.locator('.wk-panel [data-wk=drop]').count()==1,'新規の項目を追加できる')
  pg.click('.wk-panel [data-wk=drop]');pg.wait_for_timeout(300)
  ok(pg.locator('.wk-panel [data-wk=drop]').count()==0,'追加した項目を外せる')
  ok(pg.locator('.wk-lines [data-line]').count()>=1,'下に工事の行が出る')
  pg.screenshot(path=os.environ.get('SHOT','/tmp/work.png'))
  print(errs or 'no errors');b.close()
