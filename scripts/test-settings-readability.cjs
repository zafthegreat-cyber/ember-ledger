const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');

(async () => {
  const output = 'artifacts/qa/settings-readability';
  const desktopOnly = process.argv.includes('--desktop');
  const organizationOnly = process.argv.includes('--organization');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  const screens = [
    { key: 'profile', route: '/settings/profile', selector: '.you-profile-command-card' },
    { key: 'plans', route: '/settings/plans', selector: '.membership-v4-command-board' },
    { key: 'trust', route: '/settings/trust', selector: '.trust-v4-command-board' },
    { key: 'preferences', route: '/settings', disclosure: 'Appearance & preferences' },
    { key: 'privacy', route: '/settings', disclosure: 'Privacy & safeguards' },
  ].filter(screen => (!desktopOnly || !screen.disclosure) && (!organizationOnly || ['profile', 'plans'].includes(screen.key)));
  try {
    for (const theme of ['light', 'dark']) for (const width of desktopOnly ? [1440] : [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const screen of screens) {
        await page.goto(`http://127.0.0.1:5217${screen.route}?betaLocalMode=true&themeInspect=${theme}`);
        await page.locator('.main').waitFor();
        await page.evaluate(() => document.fonts.ready);
        let root;
        if (screen.disclosure) {
          const summary = page.locator('.settings-layout__disclosure > summary').filter({ hasText: screen.disclosure });
          await summary.focus();
          await page.keyboard.press('Enter');
          root = page.locator('.settings-layout__disclosure[open]');
          await expect(root).toBeVisible();
          await root.scrollIntoViewIfNeeded();
        } else root = page.locator(screen.selector);
        const metrics = await root.evaluate(root => {
          const visible = [...root.querySelectorAll('*')].filter(el => el.checkVisibility() && !el.closest('[aria-hidden="true"]'));
          const text = visible.filter(el => [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()));
          const info = el => ({ text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 100), className: el.className, parent: el.parentElement.className, font: getComputedStyle(el).fontSize });
          const smallText = text.filter(el => parseFloat(getComputedStyle(el).fontSize) < 12).map(info);
          const clippedText = text.filter(el => !el.matches('input,select,textarea,option') && (el.scrollWidth > el.clientWidth + 2 || (['hidden', 'clip'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2))).map(info);
          const smallControls = visible.filter(el => el.matches('button,input,select,textarea,summary,a[href]')).map(el => {
            const target = el.matches('input[type="checkbox"],input[type="radio"]') ? el.closest('label') || el : el;
            const rect = target.getBoundingClientRect();
            return { ...info(el), width: rect.width, height: rect.height };
          }).filter(el => el.width < 43.9 || el.height < 43.9);
          const sidebar = document.querySelector('.ops-desktop-sidebar');
          const sidebarRight = sidebar?.checkVisibility() ? sidebar.getBoundingClientRect().right : null;
          const rail = root.querySelector('.command-board-v4-rail');
          const sidebarLayout = sidebarRight && rail ? {
            sidebarRight,
            railBounds: rail.getBoundingClientRect().toJSON(),
            links: [...rail.querySelectorAll('a')].map(el => ({ href: new URL(el.href).pathname, bounds: el.getBoundingClientRect().toJSON() })),
            contentBehindSidebar: text.filter(el => el.getBoundingClientRect().left < sidebarRight - 1).map(info),
          } : null;
          const composition = {};
          for (const selector of ['.membership-v4-feature-grid', '.membership-v4-plan-grid']) {
            const grid = root.querySelector(selector);
            if (grid) composition[selector] = [...grid.children].map(el => el.getBoundingClientRect().toJSON());
          }
          const usage = root.querySelector('.you-v4-usage-panel');
          if (usage) {
            composition.usage = usage.getBoundingClientRect().toJSON();
            composition.support = [...root.querySelectorAll('.you-v4-side-rail > article')].filter(el => el.checkVisibility()).map(el => el.getBoundingClientRect().toJSON());
          }
          return { smallText, clippedText, smallControls, sidebarLayout, composition, pageOverflow: document.documentElement.scrollWidth - innerWidth };
        });
        if (screen.key === 'plans') {
          const planButtons = root.locator('.membership-v4-plan-card button');
          for (const button of await planButtons.all()) await expect(button).toBeDisabled();
          await root.getByRole('button', { name: 'Review Guardrails', exact: true }).click();
          await expect(root.locator('#membership-scout-guardrails')).toBeInViewport();
          await root.evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
        }
        if (metrics.sidebarLayout) {
          const layout = metrics.sidebarLayout;
          assert.ok(layout.railBounds.left >= layout.sidebarRight, JSON.stringify(layout));
          assert.ok(layout.railBounds.right <= width && layout.railBounds.height < 180, JSON.stringify(layout));
          assert.deepEqual(layout.links.map(link => link.href), ['/', '/', '/find/deals', '/collection', '/business', '/settings']);
          assert.ok(layout.links.every(link => link.bounds.left >= layout.sidebarRight && link.bounds.right <= width && link.bounds.height >= 44), JSON.stringify(layout));
          assert.deepEqual(layout.contentBehindSidebar, [], JSON.stringify(layout));
          const lastLink = root.locator('.command-board-v4-rail a').last();
          await lastLink.focus();
          await expect(lastLink).toBeFocused();
          await expect(lastLink).toBeInViewport();
        }
        if (width === 1440 && screen.key === 'plans') {
          for (const cards of Object.values(metrics.composition)) {
            assert.equal(cards.length, 5);
            assert.ok(cards.every(card => Math.abs(card.top - cards[0].top) < 1 && card.width >= 195), JSON.stringify(cards));
          }
        }
        if (width === 1440 && screen.key === 'profile') {
          const { usage, support } = metrics.composition;
          assert.equal(support.length, 2);
          assert.ok(Math.abs(support[0].top - support[1].top) < 1 && support[0].top >= usage.bottom && support[0].top - usage.bottom <= 24, JSON.stringify(metrics.composition));
          assert.ok(Math.abs(support[0].left - usage.left) < 2 && Math.abs(support[1].right - usage.right) < 2, JSON.stringify(metrics.composition));
        }
        await page.screenshot({ path: `${output}/${theme}-${width}-${screen.key}.png`, fullPage: true });
        await page.screenshot({ path: `${output}/${theme}-${width}-${screen.key}-viewport.png` });
        if (screen.disclosure) {
          const summary = root.locator('summary').first();
          await summary.focus();
          await page.keyboard.press('Enter');
          await expect(page.locator('.settings-layout__disclosure[open]')).toHaveCount(0);
        }
        results.push({ theme, width, screen: screen.key, ...metrics, errors: [...errors] });
        fs.writeFileSync(`${output}/${desktopOnly ? 'desktop-results' : organizationOnly ? 'organization-results' : 'results'}.json`, JSON.stringify(results, null, 2));
        console.log(JSON.stringify({ theme, width, screen: screen.key, smallText: metrics.smallText.length, clippedText: metrics.clippedText.length, smallControls: metrics.smallControls.length, overflow: metrics.pageOverflow }));
      }
      await context.close();
    }
    for (const result of results) {
      assert.deepEqual(result.smallText, [], JSON.stringify(result));
      assert.deepEqual(result.clippedText, [], JSON.stringify(result));
      assert.deepEqual(result.smallControls, [], JSON.stringify(result));
      assert.ok(result.pageOverflow <= 1, JSON.stringify(result));
      assert.deepEqual(result.errors, []);
    }
    console.log(`PASS Settings readability: ${results.length}/${results.length} route/theme/viewport cases.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
