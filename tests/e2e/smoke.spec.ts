import { test, expect, Browser, Page, BrowserContext } from '@playwright/test';

// ── Minimal Supabase mock (replaces CDN script) ───────────────────────────────
const MOCK_SUPABASE = `(function(){
  function chain(v){
    var p=Promise.resolve(v);
    return new Proxy(p,{get:function(t,k){
      if(k==='then'||k==='catch'||k==='finally')return t[k].bind(t);
      return function(){return chain(v);};
    }});
  }
  var session={user:{id:'smoke-uid'},access_token:'mock'};
  var client={
    auth:{
      getSession:function(){return Promise.resolve({data:{session:session},error:null});},
      getUser:function(){return Promise.resolve({data:{user:session.user},error:null});},
      onAuthStateChange:function(cb){setTimeout(function(){cb('SIGNED_IN',session);},0);return{data:{subscription:{unsubscribe:function(){}}}};},
      signInWithPassword:function(){return Promise.resolve({data:{session:session},error:null});},
      signOut:function(){return Promise.resolve({error:null});}
    },
    from:function(){return chain({data:[],error:null});},
    storage:{from:function(){return{upload:function(){return Promise.resolve({data:null,error:null});},getPublicUrl:function(){return{data:{publicUrl:''}};}};}},
    channel:function(){return{on:function(){return this;},subscribe:function(){return this;},unsubscribe:function(){return this;}};},
    removeChannel:function(){return Promise.resolve();}
  };
  window.supabase={createClient:function(){return client;}};
})();`;

// ── Shared page (navigate once, test everything) ──────────────────────────────
let ctx: BrowserContext;
let page: Page;
const consoleErrors: string[] = [];

test.describe('smoke', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });

    // Replace Supabase CDN with mock
    await ctx.route('**/@supabase/supabase-js**', route =>
      route.fulfill({ contentType: 'application/javascript', body: MOCK_SUPABASE }),
    );

    page = await ctx.newPage();

    // Speed up splash (3 000 ms / 8 000 ms → 80 ms)
    await page.addInitScript(() => {
      const orig = window.setTimeout;
      // @ts-ignore
      window.setTimeout = (fn: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (delay === 3000 || delay === 8000) delay = 80;
        return orig(fn as TimerHandler, delay, ...args);
      };
    });

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    // Wait for splash gone + login hidden (mock auth resolves instantly)
    await page.waitForFunction(() => !document.getElementById('appSplash'), { timeout: 5000 });
    await page.waitForFunction(
      () => document.getElementById('loginOverlay')?.classList.contains('hidden'),
      { timeout: 5000 },
    );
  });

  test.afterAll(async () => {
    await ctx.close();
  });

  // ── 1. No console errors ──────────────────────────────────────────────────
  test('no console errors on load', () => {
    // Filter noise from incomplete mock (diary card fetch, etc.)
    const hard = consoleErrors.filter(
      e => !e.includes('diary') && !e.includes('Failed to fetch') && !e.includes('supabase'),
    );
    expect(hard).toHaveLength(0);
  });

  // ── 2. Five nav tabs clickable ────────────────────────────────────────────
  for (const tab of ['couple', 'chat', 'playground', 'setting', 'home'] as const) {
    test(`nav tab: ${tab}`, async () => {
      await page.click(`button[data-tab="${tab}"]`);
      await expect(page.locator(`section[data-page="${tab}"]`)).toHaveClass(/v2-active/);
    });
  }

  // ── 3. Chat input focus — no large scroll jump ────────────────────────────
  test('chat input focus does not cause large scroll jump', async () => {
    await page.click('button[data-tab="chat"]');
    const before = await page.evaluate(() => window.scrollY);
    await page.locator('#messageInput').tap();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(200);
  });

  // ── 4. Playground → 查手机 overlay opens ─────────────────────────────────
  test('playground phone overlay opens', async () => {
    await page.click('button[data-tab="playground"]');
    await page.click('button[data-placeholder-route="/playground/phone"]');
    await expect(page.locator('#phoneOverlay')).not.toHaveClass(/hidden/);
  });

  // ── 5. Phone overlay UI elements present ─────────────────────────────────
  test('phone overlay has url input, read button, result area', async () => {
    await expect(page.locator('#phoneUrlInput')).toBeVisible();
    await expect(page.locator('#phoneReadBtn')).toBeVisible();
    await expect(page.locator('#phoneResult')).toBeAttached();
  });

  // ── 6. Diary card click does not crash ────────────────────────────────────
  test('diary card click is responsive', async () => {
    // Close phone overlay first
    await page.click('#phoneOverlayClose');
    await page.click('button[data-tab="home"]');
    const errsBefore = consoleErrors.length;
    await page.click('.diary-card');
    await page.waitForTimeout(200);
    // No new hard errors from the click
    const newErrors = consoleErrors.slice(errsBefore).filter(
      e => !e.includes('diary') && !e.includes('Failed to fetch') && !e.includes('supabase'),
    );
    expect(newErrors).toHaveLength(0);
  });
});
