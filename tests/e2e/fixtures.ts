import { expect, type Page } from '@playwright/test';

/** Monday 23 Nov 2026, 09:00 – morning shifts are past, the rest of the week is open. */
export const NOW = '2026-11-23T09:00';

export async function open(page: Page, query = '') {
  await page.goto(`/?reset&now=${NOW}${query}`);
}

export async function openAs(page: Page, name = 'Maja') {
  await open(page);
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: `Jag är ${name} →` }).click();
  await expect(page.getByTestId('me-chip')).toContainText(name);
}

export async function unlockAdmin(page: Page, code = '1234') {
  await page.getByRole('button', { name: /Inställningar/ }).click();
  await page.getByLabel('Admin-kod', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Lås upp' }).click();
}

/** Run code against the demo in-memory backend (simulates another device). */
export async function asOtherDevice(page: Page, fn: string) {
  await page.evaluate(fn);
}

export const toast = (page: Page) => page.getByRole('status');
