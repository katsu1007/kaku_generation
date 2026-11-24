# スマホで操作する場所を広く：縦・横・パソコンで、全画面の入り口・戻る・横の並び・左のメニューの細さ
import os
from playwright.sync_api import sync_playwright
J=os.environ.get('KAKU_REAL_TOILET','.real/toilet.jww')
ok=lambda c,m: print(('OK  ' if c else 'NG  ')+m)
def open_dwg(b,W,H,mobile):
  ctx=b.new_context(viewport={'width':W,'height':H},is_mobile=mobile,has_touch=mobile);pg=ctx.new_page();errs=[]
  pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
  pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(500)
  pid=pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].id}")
  pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(400)
  pg.set_input_files('#dwgFile',J);pg.wait_for_function("()=>document.querySelector('#dwgFaces button')",timeout=90000);pg.wait_for_timeout(600)
  return ctx,pg,errs
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
  # 縦
  ctx,pg,errs=open_dwg(b,390,844,True)
  ok(pg.locator('.fs-open').is_visible(),'縦：「図面を画面いっぱいにして編集する」が見える')
  h=pg.evaluate("document.querySelector('.pv').getBoundingClientRect().height");ok(h>=400,f'縦：図面の高さ {round(h)}px（前は240）')
  pg.locator('.fs-open').dispatch_event('click');pg.wait_for_timeout(500)
  ok(pg.locator('#dwgEdit.dwg-fs').count()==1,'全画面になる')
  t=pg.evaluate("(()=>{const t=[...document.querySelectorAll('.toast')].pop();if(!t)return null;const r=t.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return [t.textContent.slice(0,20),t.contains(e)]})()")
  ok(t and t[1] and '2本の指' in t[0],f'初めての全画面で操作の知らせが図面の上に見える {t}')
  ok(not pg.locator('.dwg-fs-head').is_visible(),'上の行（図面・全画面をやめる）は出さない')
  ok(pg.locator('#dwgMode .fs-exit').is_visible(),'道具の切り替えの左はしに「戻る」')
  pg.locator('#dwgMode [data-mode=meas]').dispatch_event('click');pg.wait_for_timeout(500)
  r=pg.evaluate("(()=>{const s=document.querySelector('#dwgMode').getBoundingClientRect(),o=document.querySelector('#dwgMode button.on').getBoundingClientRect(),e=document.querySelector('#dwgMode .fs-exit').getBoundingClientRect();return [o.left>=e.right-2,o.right<=s.right+2]})()")
  ok(all(r),f'選んだ道具（測る）が「戻る」に隠れず見える {r}')
  vh=pg.evaluate("document.querySelector('#dwgView').getBoundingClientRect().height");ok(vh>450,f'全画面の図面の高さ {round(vh)}px')
  pg.locator('#dwgMode .fs-exit').dispatch_event('click');pg.wait_for_timeout(500)
  ok(pg.locator('#dwgEdit.dwg-fs').count()==0,'「戻る」で全画面をやめる')
  ok(not errs,f'縦：画面のエラー無し {errs[:1]}');ctx.close()
  # 横
  ctx,pg,errs=open_dwg(b,844,390,True)
  sw=pg.evaluate("document.querySelector('#side').getBoundingClientRect().width");ok(sw<80,f'横：左のメニューの幅 {round(sw)}px（前は196）')
  ok(pg.locator('#side .nav .ns').first.is_visible() and not pg.locator('#side .nav .nl').first.is_visible(),'横：メニューは短い名前')
  pg.locator('.fs-open').dispatch_event('click');pg.wait_for_timeout(500)
  pg.locator('#dwgMode [data-mode=light]').dispatch_event('click');pg.wait_for_timeout(600)
  v=pg.evaluate("document.querySelector('#dwgView').getBoundingClientRect().toJSON()");bb=pg.evaluate("document.querySelector('#dwgBar').getBoundingClientRect().toJSON()")
  ok(bb['left']>=v['right']-1,'横の全画面：ボタンの欄は図面の右')
  ok(v['height']>250,f"横の全画面：図面の高さ {round(v['height'])}px")
  ok(not errs,f'横：画面のエラー無し {errs[:1]}');ctx.close()
  # パソコン
  ctx,pg,errs=open_dwg(b,1280,900,False)
  ok(not pg.locator('.fs-open').is_visible(),'パソコン：入り口のボタンは出さない（図面の右上の印で全画面）')
  sw=pg.evaluate("document.querySelector('#side').getBoundingClientRect().width");ok(sw>150,f'パソコン：左のメニューは今まで通り {round(sw)}px')
  ok(not errs,f'パソコン：画面のエラー無し {errs[:1]}');ctx.close()
  b.close()
