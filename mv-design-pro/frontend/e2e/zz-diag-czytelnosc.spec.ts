import { test } from '@playwright/test';
test('diag', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('mvd-titlebar').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const tb = document.querySelector('[data-testid="mvd-titlebar"]') as HTMLElement;
    const kids = Array.from(tb.children).map((c) => {
      const r = (c as HTMLElement).getBoundingClientRect();
      return `${c.tagName}.${(c as HTMLElement).className} [${(c as HTMLElement).innerText.replace(/\n/g, '|').slice(0, 40)}] x=${r.x.toFixed(0)} w=${r.width.toFixed(0)} h=${r.height.toFixed(0)}`;
    });
    return { sw: tb.scrollWidth, cw: tb.clientWidth, kids, docSW: document.documentElement.scrollWidth };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: '/tmp/claude-0/-home-user-MV-Design-PRO/8eed6aba-b84e-528d-b45d-e41087d94b66/scratchpad/cz/app.png' });
});
