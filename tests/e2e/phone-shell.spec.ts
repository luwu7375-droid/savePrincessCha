import { test, expect, Browser, Page, BrowserContext } from '@playwright/test';

// ── Minimal Supabase mock with activity log support ──────────────────────────
const MOCK_SUPABASE = `(function(){
  console.log('[MOCK] Supabase mock script executing');
  function chain(v){
    var p=Promise.resolve(v);
    return new Proxy(p,{get:function(t,k){
      if(k==='then'||k==='catch'||k==='finally')return t[k].bind(t);
      return function(){return chain(v);};
    }});
  }
  var session={user:{id:'test-uid'},access_token:'mock-token'};
  var mockActivityLog = [];
  var mockConversations = [{id:'test-conv-1',title:'测试会话',pinned:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}];
  var client={
    auth:{
      getSession:function(){console.log('[MOCK] getSession called');return Promise.resolve({data:{session:session},error:null});},
      getUser:function(){console.log('[MOCK] getUser called');return Promise.resolve({data:{user:session.user},error:null});},
      onAuthStateChange:function(cb){console.log('[MOCK] onAuthStateChange called');setTimeout(function(){console.log('[MOCK] firing SIGNED_IN');cb('SIGNED_IN',session);},0);return{data:{subscription:{unsubscribe:function(){}}}}},
      signInWithPassword:function(){console.log('[MOCK] signInWithPassword called');return Promise.resolve({data:{session:session},error:null});},
      signOut:function(){console.log('[MOCK] signOut called');return Promise.resolve({error:null});}
    },
    from:function(table){
      if(table==='cha_activity_log'){
        return{
          select:function(){
            return{
              eq:function(col,val){
                if(col==='user_id'&&val===session.user.id){
                  return{
                    eq:function(col2,val2){
                      if(col2==='action_type'&&val2==='web_browse'){
                        return{
                          gte:function(){return{order:function(){return{limit:function(){return Promise.resolve({data:mockActivityLog,error:null})}}}}},
                          order:function(){return{limit:function(){return Promise.resolve({data:mockActivityLog,error:null})}}},
                        };
                      }
                      return{order:function(){return{limit:function(){return Promise.resolve({data:[],error:null})}}}};
                    },
                    order:function(){return{limit:function(){return Promise.resolve({data:mockActivityLog,error:null})}}},
                  };
                }
                return{order:function(){return{limit:function(){return Promise.resolve({data:[],error:null})}}}};
              },
            };
          },
        };
      }
      if(table==='conversations'){
        return chain({data:mockConversations,error:null});
      }
      if(table==='messages'){
        return chain({data:[],error:null});
      }
      return chain({data:[],error:null});
    },
  };
  window.supabaseClient=client;
  window.supabase={createClient:function(url, key){console.log('[MOCK] createClient called');return client;}};
  window.currentUserId='test-uid';
  window.mockActivityLog=mockActivityLog;
  console.log('[MOCK] Mock setup complete');
})();`;

// ── Shared page ───────────────────────────────────────────────────────────────
let ctx: BrowserContext;
let page: Page;
const consoleErrors: string[] = [];

test.describe('Phone shell simulator', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(30000);
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });

    await ctx.route('**/cdn.jsdelivr.net/**', route => route.abort());
    await ctx.route('**/functions/v1/web**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, summary: 'Test summary', source: { title: 'Test', url: '' } }),
    }));

    page = await ctx.newPage();
    await page.addInitScript(MOCK_SUPABASE);
    await page.addInitScript(() => {
      window.SAVE_PRINCESS_CONFIG = {
        SUPABASE_URL: 'https://mock.supabase.co',
        SUPABASE_ANON_KEY: 'mock-key',
        CHAT_API_ENDPOINT: 'https://mock.supabase.co/functions/v1/chat',
        WEB_API_ENDPOINT: 'https://mock.supabase.co/functions/v1/web',
      };
    });
    await page.addInitScript(() => {
      const orig = window.setTimeout;
      window.setTimeout = (fn: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (delay === 3000 || delay === 8000) delay = 80;
        return orig(fn as TimerHandler, delay, ...args);
      };
    });

    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') consoleErrors.push(text);
    });

    await page.goto('/');
    await page.waitForFunction(() => !document.getElementById('appSplash'), { timeout: 10000 });
    const loginHidden = await page.evaluate(() => document.getElementById('loginOverlay')?.classList.contains('hidden'));
    if (!loginHidden) {
      await page.waitForFunction(() => document.getElementById('loginOverlay')?.classList.contains('hidden'), { timeout: 10000 });
    }

    await page.click('button[data-tab="playground"]');
    await page.click('button[data-placeholder-route="/playground/phone"]');
    await page.waitForSelector('#phoneOverlay:not(.hidden)', { timeout: 2000 });
  });

  test.afterAll(async () => {
    await ctx.close();
  });

  test('phone shell opens with lock screen', async () => {
    const shell = page.locator('.phone-shell');
    await expect(shell).toBeVisible();

    const lockScreen = page.locator('#phoneLockScreen');
    await expect(lockScreen).toBeVisible();
    await expect(lockScreen).toHaveAttribute('data-screen', 'lock');
  });

  test('swipe up unlocks to home screen', async () => {
    const lockScreen = page.locator('#phoneLockScreen');
    await lockScreen.click();

    await page.waitForTimeout(500);

    const homeScreen = page.locator('#phoneHomeScreen');
    await expect(homeScreen).toBeVisible();
    await expect(homeScreen).not.toHaveClass(/hidden/);
  });

  test('home screen shows app grid with core apps', async () => {
    const homeScreen = page.locator('#phoneHomeScreen');
    await expect(homeScreen).toBeVisible();

    await expect(page.locator('[data-app="browser"]')).toBeVisible();
    await expect(page.locator('[data-app="search-history"]')).toBeVisible();
    await expect(page.locator('[data-app="usage-brief"]')).toBeVisible();
    await expect(page.locator('[data-app="notes"]')).toBeVisible();
  });

  test('browser app opens with URL input and history', async () => {
    await page.click('[data-app="browser"]');

    const browserScreen = page.locator('#phoneBrowserScreen');
    await expect(browserScreen).toBeVisible();
    await expect(browserScreen).toHaveAttribute('data-screen', 'browser');

    await expect(page.locator('.phone-url-input')).toBeVisible();
    await expect(page.locator('.phone-browser-go')).toBeVisible();
    await expect(page.locator('#phoneBrowserHistory')).toBeVisible();
  });

  test('browser history displays activity timeline', async () => {
    await page.evaluate(() => {
      const log = [
        {
          id: '1',
          action_type: 'web_browse',
          title: 'Test Page',
          url: 'https://example.com',
          status: 'success',
          created_at: new Date().toISOString(),
        },
      ];
      window.mockActivityLog.push(...log);
    });

    await page.click('.phone-back-btn');
    await page.waitForTimeout(200);
    await page.click('[data-app="browser"]');

    await page.waitForSelector('.phone-timeline-item', { timeout: 2000 });
    const items = page.locator('.phone-timeline-item');
    await expect(items).toHaveCount(1);
  });

  test('search history app shows stub message', async () => {
    await page.click('.phone-back-btn');
    await page.waitForTimeout(200);

    await page.click('[data-app="search-history"]');

    const stubScreen = page.locator('#phoneSearchHistoryScreen');
    await expect(stubScreen).toBeVisible();
    await expect(page.locator('.stub-text')).toContainText('搜索记录功能开发中');
  });

  test('usage brief app shows stub message', async () => {
    await page.click('.phone-back-btn');
    await page.waitForTimeout(200);

    await page.click('[data-app="usage-brief"]');

    const stubScreen = page.locator('#phoneUsageBriefScreen');
    await expect(stubScreen).toBeVisible();
    await expect(page.locator('.stub-text')).toContainText('使用简报功能开发中');
  });

  test('notes app shows stub message', async () => {
    await page.click('.phone-back-btn');
    await page.waitForTimeout(200);

    await page.click('[data-app="notes"]');

    const stubScreen = page.locator('#phoneNotesScreen');
    await expect(stubScreen).toBeVisible();
    await expect(page.locator('.stub-text')).toContainText('备忘录功能开发中');
  });

  test('phone uses light theme with readable colors', async () => {
    const shell = page.locator('.phone-shell');
    const bgColor = await shell.evaluate(el => getComputedStyle(el).backgroundColor);

    // Light theme should have high RGB values (> 200)
    const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const [_, r, g, b] = rgbMatch.map(Number);
      expect(Math.min(r, g, b)).toBeGreaterThan(200);
    }
  });

  test('close button exits phone overlay', async () => {
    await page.click('#phoneOverlayClose');
    await page.waitForTimeout(200);
    await expect(page.locator('#phoneOverlay')).toHaveClass(/hidden/);
  });

  test('no console errors during navigation', async () => {
    const errsBefore = consoleErrors.length;

    await page.click('button[data-placeholder-route="/playground/phone"]');
    await page.waitForSelector('#phoneOverlay:not(.hidden)', { timeout: 2000 });

    const newErrors = consoleErrors.slice(errsBefore).filter(
      e => !e.includes('supabase') && !e.includes('diary'),
    );

    expect(newErrors).toHaveLength(0);
  });
});
