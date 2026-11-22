# 見積書の注意書き・ロゴ・ホームの前回のバックアップ（スマホの幅）
# ロゴは tests/e2e/fixtures/logo.png（自分で作った図形だけの画像）
from playwright.sync_api import sync_playwright
import os
os.makedirs('tests/e2e/shots', exist_ok=True)
U='http://localhost:8765/'
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,accept_downloads=True)
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(U);pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(500)
    ok=lambda name,c:print(('OK  ' if c else 'NG  ')+name)
    EST="async()=>{const a=await import('./js/app.js');const d=await import('./js/docs.js');return d.estimateHtml(a.state.projects[0],1,'2026年1月1日')}"
    ok('最初から標準の注意書きが載る', '概算です' in pg.evaluate(EST))
    # ホーム：まだバックアップしていない → 黄色
    pg.evaluate("location.hash='#/'");pg.wait_for_timeout(500)
    ok('ホームに「まだ書き出していません」（黄色）', pg.locator('.bkline.warn').count()==1 and 'まだ書き出していません' in pg.inner_text('.bkline'))
    pg.screenshot(path='tests/e2e/shots/docfoot_home0.png')
    with pg.expect_download() as dl: pg.click('#bkNow')
    ok('ホームから書き出せる', dl.value.suggested_filename.startswith('KAKU_バックアップ_'))
    pg.wait_for_timeout(500)
    ok('書き出したら「今日」・黄色が消える', pg.locator('.bkline.warn').count()==0 and '今日' in pg.inner_text('.bkline'))
    # 設定：ロゴ・注意書き
    pg.evaluate("location.hash='#/settings'");pg.wait_for_timeout(500)
    ok('設定の前回のバックアップも今日', '前回：' in pg.inner_text('body'))
    pg.set_input_files('#logoIn','tests/e2e/fixtures/logo.png');pg.wait_for_timeout(800)
    lg=pg.evaluate("async()=>(await import('./js/app.js')).state.company.logo||''")
    ok('ロゴが縮んで保存される（600×200 以内）', lg.startswith('data:image/png') and pg.evaluate("async(u)=>{const i=new Image();i.src=u;await i.decode();return [i.naturalWidth,i.naturalHeight]}",lg)==[600,200])
    ok('ロゴが見積書に載る', '<img class="colog"' in pg.evaluate(EST))
    pg.fill('[data-c=estNote]','テストの注意書きです。');pg.locator('[data-c=estNote]').blur();pg.wait_for_timeout(500)
    h=pg.evaluate(EST);ok('注意書きを変えられる', 'テストの注意書きです。' in h and '概算です' not in h)
    pg.uncheck('#estNoteOn');pg.wait_for_timeout(400)
    ok('印を外すと載らない', 'class="disc"' not in pg.evaluate(EST))
    pg.check('#estNoteOn');pg.fill('[data-c=estNote]','');pg.locator('[data-c=estNote]').blur();pg.wait_for_timeout(400)
    ok('空にすると標準の文に戻る', '概算です' in pg.evaluate(EST))
    pg.screenshot(path='tests/e2e/shots/docfoot_set.png',full_page=True)
    # 見積書の見た目（A4 の幅で）
    pg2=b.new_page(viewport={'width':794,'height':1123})
    css=open('css/app.css').read()
    pg2.set_content('<html><head><style>'+css+'</style></head><body style="background:#fff;margin:0;padding:24px">'+pg.evaluate(EST)+'</body></html>');pg2.wait_for_timeout(300)
    pg2.screenshot(path='tests/e2e/shots/docfoot_est.png',full_page=True)
    pg.locator('#logoOff').dispatch_event('click');pg.wait_for_timeout(500)
    ok('ロゴを外せる', '<img class="colog"' not in pg.evaluate(EST))
    ok('エラーなし', not errs);print(errs)
    b.close()
