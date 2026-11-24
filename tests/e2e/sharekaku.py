# 案件を1つのファイルで渡す・受け取って開く（同じ案件がある時は別の案件として入れる）
import os
from playwright.sync_api import sync_playwright
os.makedirs('tests/e2e/out',exist_ok=True)
with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page(accept_downloads=True);errs=[]
  pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
  pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
  pid=pg.evaluate('location.hash').split('/')[2]
  pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];p.name='渡す案件';a.touch(p);await a.flush()}")
  pg.goto(f'http://localhost:8765/#/p/{pid}/5');pg.wait_for_timeout(600)
  with pg.expect_download() as dl: pg.click('[data-doc=kaku]')
  path='tests/e2e/out/'+dl.value.suggested_filename;dl.value.save_as(path)
  ok=lambda c,m: print(('OK  ' if c else 'NG  ')+m)
  ok(path.endswith('.kaku.json'),'ファイル名が .kaku.json：'+dl.value.suggested_filename)
  pg.goto('http://localhost:8765/#/');pg.wait_for_timeout(600)
  pg.set_input_files('#openKaku',path);pg.wait_for_timeout(600)
  ok(pg.locator('.modal').count()==1,'同じ案件がある時は聞く')
  pg.click('.modal [data-no]');pg.wait_for_timeout(1200)
  ps=pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects.map(p=>p.name)}")
  ok(len(ps)==2 and any('受け取り' in n for n in ps),f'別の案件として入った：{ps}')
  ok('/p/' in pg.evaluate('location.hash'),'開いた案件の画面に移る')
  print(errs or 'no errors');b.close()
