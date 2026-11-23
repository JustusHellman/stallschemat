import { expect, test } from '@playwright/test';
import { openAs } from './fixtures';

test.describe('settings', () => {
  test('calendar subscription links are personal and correct', async ({ page }) => {
    await openAs(page, 'Maja');
    await page.getByRole('button', { name: /Inställningar/ }).click();
    const card = page.getByTestId('calendar-card');
    await card.getByRole('tab', { name: 'iPhone / Mac' }).click();
    await expect(card.getByTestId('cal-apple')).toHaveAttribute('href', 'webcal://localhost:4173/cal/maja.ics');
    await card.getByRole('tab', { name: 'Google / Android' }).click();
    const g = await card.getByTestId('cal-google').getAttribute('href');
    expect(g).toBe('https://calendar.google.com/calendar/r?cid=' + encodeURIComponent('webcal://localhost:4173/cal/maja.ics'));
    await expect(card.getByLabel('Kalenderlänk')).toHaveValue('http://localhost:4173/cal/maja.ics');
    await expect(card.locator('.steps li')).toHaveCount(3);
  });

  test('defaults to the right calendar + install guide for the device', async ({ page }, info) => {
    await openAs(page);
    await page.getByRole('button', { name: /Inställningar/ }).click();
    const cal = page.getByTestId('calendar-card');
    const install = page.getByTestId('install-card');
    if (info.project.name === 'iphone') {
      await expect(cal.getByRole('tab', { name: 'iPhone / Mac' })).toHaveAttribute('aria-selected', 'true');
      await expect(install).toContainText('Lägg till på hemskärmen');
    } else {
      await expect(cal.getByRole('tab', { name: 'Google / Android' })).toHaveAttribute('aria-selected', 'true');
      await expect(install).toContainText('Installera app');
    }
  });

  test('install banner on the schedule links to the guide and can be dismissed', async ({ page }) => {
    await openAs(page);
    const banner = page.getByTestId('install-banner');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Dölj' }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('install-banner')).toHaveCount(0);
  });

  test('"Uppdatera nu" refreshes', async ({ page }) => {
    await openAs(page);
    await page.getByRole('button', { name: /Inställningar/ }).click();
    await page.getByRole('button', { name: 'Uppdatera nu' }).click();
    await expect(page.getByRole('status')).toContainText('uppdaterat');
  });
});

test.describe('navigation', () => {
  test('regular users get no bottom menu; the gear opens settings and back returns', async ({ page }) => {
    await openAs(page);
    await expect(page.locator('nav.tabs')).toHaveCount(0);
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('calendar-card')).toBeVisible();
    await page.getByTestId('back').click();
    await expect(page.locator('.weeknav')).toBeVisible();
  });

  test('admins get the bottom menu with Schema and Admin', async ({ page }) => {
    await openAs(page);
    await page.getByTestId('settings-btn').click();
    await page.getByLabel('Admin-kod', { exact: true }).fill('1234');
    await page.getByRole('button', { name: 'Lås upp' }).click();
    const nav = page.locator('nav.tabs');
    await expect(nav.getByRole('button')).toHaveText([/Schema/, /Admin/]);
    await nav.getByRole('button', { name: /Schema/ }).click();
    await expect(page.locator('.weeknav')).toBeVisible();
  });

  test('my-shifts list links to the calendar setup', async ({ page }) => {
    await openAs(page);
    await page.getByTestId('next-shift').click();
    await page.getByRole('button', { name: /telefonens kalender/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('calendar-card')).toBeInViewport();
  });
});

test.describe('PWA', () => {
  test('has a valid web app manifest and service worker', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await (await request.get(href!)).json();
    expect(manifest.name).toBe('Stallschemat');
    expect(manifest.lang).toBe('sv');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    expect((await request.get('/sw.js')).ok()).toBe(true);
    expect((await request.get('/apple-touch-icon.png')).ok()).toBe(true);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  });
});
