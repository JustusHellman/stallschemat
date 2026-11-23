import { expect, test } from '@playwright/test';
import { open, openAs, toast } from './fixtures';

test.describe('identity', () => {
  test('first visit asks who you are and remembers it', async ({ page }) => {
    await open(page);
    await expect(page.getByText('Välkommen! Vem är du?')).toBeVisible();
    await page.getByRole('button', { name: 'Lisa', exact: true }).click();
    await page.getByRole('button', { name: 'Jag är Lisa →' }).click();
    await expect(page.getByTestId('me-chip')).toContainText('Lisa');
    await page.reload();
    await expect(page.getByTestId('me-chip')).toContainText('Lisa');
  });

  test('can add yourself as a new person with a colour', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '＋ Ny person' }).click();
    await page.getByLabel('Ditt namn').fill('Frida');
    await page.getByRole('radio').nth(10).click();
    await page.getByRole('button', { name: 'Jag är Frida →' }).click();
    await expect(page.getByTestId('me-chip')).toContainText('Frida');
  });

  test('rejects a duplicate name', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '＋ Ny person' }).click();
    await page.getByLabel('Ditt namn').fill('anna');
    await page.getByRole('button', { name: 'Jag är anna →' }).click();
    await expect(page.getByText('Det namnet finns redan.')).toBeVisible();
  });

  test('tapping your name lets you switch person (fix a misclick)', async ({ page }) => {
    await openAs(page, 'Maja');
    await page.getByTestId('me-chip').click();
    const dialog = page.getByRole('dialog', { name: 'Byt person' });
    await expect(dialog.getByText('Råkade du välja fel?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Sara', exact: true }).click();
    await dialog.getByRole('button', { name: 'Jag är Sara →' }).click();
    await expect(page.getByTestId('me-chip')).toContainText('Sara');
    await expect(dialog).toBeHidden();
  });

  test('can change own colour', async ({ page }) => {
    await openAs(page, 'Maja');
    await page.getByTestId('me-chip').click();
    const dialog = page.getByRole('dialog', { name: 'Byt person' });
    await dialog.getByRole('radio').nth(2).click(); // blue
    await dialog.getByRole('button', { name: 'Jag är Maja →' }).click();
    await expect(page.getByTestId('me-chip').locator('.dot')).toHaveCSS('background-color', 'rgb(63, 136, 197)');
  });
});

test.describe('week view', () => {
  test('shows mine highlighted, free emphasised, taken muted', async ({ page }) => {
    await openAs(page);
    await expect(page.locator('.day').first()).toBeVisible();
    const free = page.locator('.slot.free:not(.past)').first();
    await expect(free).toBeVisible();
    await expect(free).toContainText('Ta ＋');
    await expect(free).toHaveCSS('border-top-style', 'dashed');
    const taken = page.locator('.slot.taken').first();
    await expect(taken).toHaveCSS('background-color', 'rgb(242, 238, 233)');
  });

  test('claim a free shift with two taps, then release it', async ({ page }) => {
    await openAs(page);
    const free = page.locator('.slot.free:not(.past)').first();
    const key = await free.getAttribute('data-key');
    await free.click();
    await page.getByTestId('claim').click();
    await expect(toast(page)).toContainText('är ditt');
    const slot = page.locator(`.slot[data-key="${key}"]`);
    await expect(slot).toHaveAttribute('data-status', 'mine');
    await expect(slot).toContainText('✓ Du');
    // Mine uses my colour (Maja = green)
    await expect(slot).toHaveCSS('background-color', 'rgb(46, 158, 106)');

    await slot.click();
    await page.getByTestId('release').click();
    await expect(toast(page)).toContainText('släppt');
    await expect(slot).toHaveAttribute('data-status', 'free');
  });

  test("tapping someone else's shift explains how to swap", async ({ page }) => {
    await openAs(page);
    await page.locator('.slot.taken:not(.past)').first().click();
    await expect(page.getByRole('dialog')).toContainText('Vill du byta?');
    await expect(page.getByTestId('claim')).toHaveCount(0);
  });

  test('past shifts cannot be claimed', async ({ page }) => {
    await openAs(page);
    const past = page.locator('.slot.past').first();
    await past.click();
    await expect(page.getByRole('dialog')).toContainText('redan varit');
    await expect(page.getByTestId('claim')).toHaveCount(0);
  });

  test('updates live when someone else takes a shift while the sheet is open', async ({ page }) => {
    await openAs(page);
    const free = page.locator('.slot.free:not(.past)').first();
    const key = (await free.getAttribute('data-key'))!;
    await free.click();
    await expect(page.getByTestId('claim')).toBeVisible();
    await page.evaluate((k) => {
      const b = (window as any).__stallBackend;
      const [date] = k.split('_');
      const d = new Date(date + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
      const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
      const wk = 1 + Math.round(((d.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
      const id = `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
      const w = b.getWeek(id);
      w.assignments[k] = 'lisa';
      b.setWeek(id, w);
    }, key);
    await expect(page.getByRole('dialog')).toContainText('taget av Lisa');
    await expect(page.getByTestId('claim')).toHaveCount(0);
    await expect(page.locator(`.slot[data-key="${key}"]`)).toHaveAttribute('data-status', 'taken');
  });

  test('"Mina & lediga" hides shifts taken by others', async ({ page }) => {
    await openAs(page);
    await expect(page.locator('.slot.taken').first()).toBeVisible();
    await page.getByRole('button', { name: 'Mina & lediga' }).click();
    await expect(page.locator('.slot.taken')).toHaveCount(0);
    await expect(page.locator('.slot.free').first()).toBeVisible();
    await page.reload();
    await expect(page.locator('.slot.taken')).toHaveCount(0); // remembered
  });

  test('week navigation stops at the booking horizon', async ({ page }) => {
    await openAs(page);
    const next = page.getByRole('button', { name: 'Nästa vecka' });
    for (let i = 0; i < 6; i++) await next.click();
    await expect(page.locator('.weeknav .title b')).toHaveText('Vecka 1'); // 2026 has 53 weeks -> 2027 W01
    await expect(next).toBeDisabled();
    await page.getByRole('button', { name: 'Idag', exact: true }).click();
    await expect(page.locator('.weeknav .title b')).toHaveText('Vecka 48');
  });

  test('shows single-day changes with a note', async ({ page }) => {
    await openAs(page);
    await page.getByRole('button', { name: 'Nästa vecka' }).click();
    const day = page.locator('.day[data-date="2026-12-02"]');
    await expect(day).toContainText('Hovslagaren kommer');
    await expect(day).toContainText('ändrad');
    await expect(day.locator('.slot', { hasText: 'Hovslagare' })).toBeVisible();
  });

  test('can view past weeks', async ({ page }) => {
    await openAs(page);
    await page.getByRole('button', { name: 'Föregående vecka' }).click();
    await expect(page.locator('.weeknav .title b')).toHaveText('Vecka 47');
    await expect(page.locator('.day')).toHaveCount(7);
    await expect(page.locator('.slot.free')).toHaveCount(0); // demo: past weeks are full
  });

  test('share the week as text', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      // force the clipboard path (no native share sheet in headless browsers)
      Object.defineProperty(navigator, 'share', { value: undefined });
    });
    await openAs(page);
    await page.getByRole('button', { name: 'Dela veckan som text' }).click();
    await expect(toast(page)).toContainText('kopierad');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('Stallschema v.48');
    expect(text).toContain('Frukost');
  });
});

test.describe('my shifts', () => {
  test('next-shift card opens the list; a row opens the shift; release works', async ({ page }) => {
    await openAs(page);
    const card = page.getByTestId('next-shift');
    await expect(card).toContainText('Ditt nästa pass');
    await card.click();
    const list = page.getByRole('dialog', { name: 'Mina pass' });
    const rows = list.getByTestId('my-row');
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    await expect(card).toContainText(`Alla mina (${n})`);
    await rows.first().click();
    await expect(page.getByRole('dialog', { name: 'Mina pass' })).toHaveCount(0);
    await page.getByTestId('release').click();
    await expect(toast(page)).toContainText('släppt');
    await expect(card).toContainText(`Alla mina (${n - 1})`);
  });

  test('claiming updates the next-shift card', async ({ page }) => {
    await page.goto('/?reset&empty&now=2026-11-23T09:00');
    await page.getByLabel('Ditt namn').fill('Nora');
    await page.getByRole('button', { name: 'Jag är Nora →' }).click();
    const card = page.getByTestId('next-shift');
    await expect(card).toContainText('Inga bokade pass');
    await expect(card).toBeDisabled();
    await page.locator('.slot.free:not(.past)').first().click();
    await page.getByTestId('claim').click();
    await expect(card).toContainText('Insläpp idag 16:30');
    await expect(card).toContainText('Alla mina (1)');
  });

  test('the free-count pill scrolls to the first free shift', async ({ page }) => {
    await openAs(page);
    await page.getByTestId('free-count').click();
    await expect(page.locator('.slot.free:not(.past)').first()).toBeInViewport();
  });
});

test.describe('sheets close in every expected way', () => {
  for (const how of ['Escape', 'krysset', 'bakgrunden', 'Stäng-knappen', 'bakåtknappen'] as const) {
    test(`via ${how}`, async ({ page }) => {
      await openAs(page);
      const url = page.url();
      await page.locator('.slot.taken:not(.past)').first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(page.locator('body')).toHaveCSS('overflow', 'hidden'); // page behind is locked
      if (how === 'Escape') await page.keyboard.press('Escape');
      if (how === 'krysset') await dialog.getByRole('button', { name: 'Stäng rutan' }).click();
      if (how === 'bakgrunden') await page.mouse.click(20, 20);
      if (how === 'Stäng-knappen') await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
      if (how === 'bakåtknappen') await page.goBack();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
      expect(page.url()).toBe(url);
      await expect(page.getByTestId('me-chip')).toBeVisible(); // still in the app
    });
  }

  test('back button after going list -> shift closes the sheet without leaving the app', async ({ page }) => {
    await openAs(page);
    await page.getByTestId('next-shift').click();
    await page.getByTestId('my-row').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('me-chip')).toBeVisible();
  });

  test('swipe down closes a sheet', async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone' && info.project.name !== 'android');
    await openAs(page);
    await page.locator('.slot.taken:not(.past)').first().click();
    const sheet = page.locator('.sheet');
    const box = (await sheet.boundingBox())!;
    await sheet.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: box.x + 50, clientY: box.y + 10 }] });
    await sheet.dispatchEvent('touchmove', { touches: [{ identifier: 1, clientX: box.x + 50, clientY: box.y + 160 }] });
    await sheet.dispatchEvent('touchend', { touches: [] });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('error toasts never block taps underneath', async ({ page }) => {
    await openAs(page);
    await expect(page.locator('.toast')).toHaveCount(0);
    await page.locator('.slot.free:not(.past)').first().click();
    await page.getByTestId('claim').click();
    await expect(page.locator('.toast')).toHaveCSS('pointer-events', 'none');
  });
});

test.describe('layout', () => {
  test('nothing overflows on a small phone, even with a long name', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, timezoneId: 'Europe/Stockholm' });
    const page = await ctx.newPage();
    await page.goto('/?reset&now=2026-11-24T12:00');
    await page.getByRole('button', { name: '＋ Ny person' }).click();
    await page.getByLabel('Ditt namn').fill('Maximiliana Andersson-Lö');
    await page.getByRole('button', { name: /Jag är Maximiliana/ }).click();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Nästa vecka' }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: /Inställningar/ }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByLabel('Admin-kod', { exact: true }).fill('1234');
    await page.keyboard.press('Enter');
    for (const t of ['Översikt', 'Grundschema', 'Enstaka dag', 'Personer', 'Logg', 'Mer']) {
      await page.getByRole('tab', { name: t }).click();
      expect(await overflow(), t).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });

  test('uses correct Swedish singular/plural', async ({ page }) => {
    await openAs(page);
    await page.evaluate(() => {
      const b = (window as any).__stallBackend;
      const w = b.getWeek('2026-W48');
      // leave exactly one free upcoming shift this week
      for (const d of ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'])
        for (const s of ['frukost', 'utslapp', 'inslapp', 'kvallsmat']) w.assignments[`${d}_${s}`] ??= 'anna';
      for (const d of ['2026-11-28', '2026-11-29'])
        for (const s of ['frukost', 'utslapp', 'mockning', 'inslapp', 'kvallsmat']) w.assignments[`${d}_${s}`] ??= 'anna';
      delete w.assignments['2026-11-29_kvallsmat'];
      b.setWeek('2026-W48', w);
    });
    await expect(page.getByTestId('free-count')).toHaveText('1 ledigt');
    await expect(page.locator('header')).toContainText('1 ledigt pass den här veckan');
  });
});

test.describe('status', () => {
  test('shows live status', async ({ page }) => {
    await openAs(page);
    await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'live');
  });
});
