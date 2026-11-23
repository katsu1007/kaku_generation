# 区画を続けて部屋にできる（仕上げの画面が自動で開かない）・ゾーンの表示が無いのを確かめる
import os
from playwright.sync_api import sync_playwright
REAL=os.environ.get('KAKU_REAL_TOILET','.real/toilet.jww')
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page();errs=[]
  pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
  pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
  pid=pg.evaluate('location.hash').split('/')[2]
  pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300);pg.set_input_files('#dwgFile',REAL)
  pg.wait_for_selector('#dwgFaces button',state='attached',timeout=120000);pg.wait_for_timeout(1500)
  fb=lambda k: pg.evaluate(f"document.querySelectorAll('#dwgFaces button')[{k}].click()")
  fb(0);pg.wait_for_timeout(150);pg.click('[data-act=mkOne]');pg.wait_for_timeout(400)
  m1=pg.locator('.modal').count()
  fb(2);pg.wait_for_timeout(150);pg.click('[data-act=mkOne]');pg.wait_for_timeout(400)
  n=pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].rooms.length}")
  ok=lambda c,m: print(('OK  ' if c else 'NG  ')+m)
  ok(m1==0,'部屋にした後、仕上げの画面が自動で開かない')
  ok(n==2,f'続けて2部屋作れる（{n}）')
  pg.click('#toast button');pg.wait_for_timeout(300);ok(pg.locator('.modal').count()==1,'知らせの「仕上げを決める」で仕上げの画面が開く')
  ok(pg.locator('[data-z=zone]').count()==0 and pg.locator('#dwgZone').count()==0,'ゾーンのボタン・一覧が無い')
  print(errs or 'no errors');b.close()
