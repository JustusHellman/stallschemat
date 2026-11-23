import { expect, test } from '@playwright/test';
import { NOW, openAs, toast, unlockAdmin } from './fixtures';

test.describe('admin', () => {
  test('wrong code is rejected', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page, '9999');
    await expect(page.getByText('Fel kod.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Admin/ })).toHaveCount(0);
  });

  test('first admin creates the code', async ({ page }) => {
    await page.goto(`/?reset&empty&now=${NOW}`);
    await page.getByLabel('Ditt namn').fill('Stina');
    await page.getByRole('button', { name: 'Jag är Stina →' }).click();
    await page.getByRole('button', { name: /Inställningar/ }).click();
    await page.getByLabel('Admin-kod', { exact: true }).fill('4321');
    await page.getByLabel('Upprepa admin-kod').fill('4321');
    await page.getByRole('button', { name: 'Skapa kod' }).click();
    await expect(page.getByTestId('admin-overview')).toBeVisible();
    // Admin stays unlocked after reload
    await page.reload();
    await expect(page.getByRole('button', { name: /Admin/ })).toBeVisible();
  });

  test('overview shows shifts per person and type', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    const table = page.getByTestId('stats-table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead')).toContainText('Frukost');
    await expect(table.locator('thead')).toContainText('Mockning+lunch');
    await expect(table.locator('tbody tr')).toHaveCount(6);
    await page.getByRole('button', { name: 'Kommande' }).click();
    await expect(page.locator('.kpi.warn')).toBeVisible(); // there are free shifts coming
  });

  test('change the base schedule from a date', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    await page.getByRole('tab', { name: 'Grundschema' }).click();
    const editor = page.getByTestId('template-editor');
    await editor.getByRole('button', { name: '＋ Lägg till pass' }).click();
    await editor.getByLabel('Passnamn').last().fill('Middag');
    await editor.getByLabel('Tid för Middag').fill('1230'); // typed without colon -> normalized to 12:30
    await editor.getByLabel('Gäller från').fill('2026-12-07');
    await editor.getByRole('button', { name: 'Spara grundschema' }).click();
    await expect(toast(page)).toContainText('Grundschemat är sparat');

    await page.getByRole('button', { name: /Schema/ }).first().click();
    // Not in week 49 (before the date)…
    await page.getByRole('button', { name: 'Nästa vecka' }).click();
    await expect(page.locator('.day[data-date="2026-12-01"] .slot', { hasText: 'Middag' })).toHaveCount(0);
    // …but from Monday 7 Dec on weekdays
    await page.getByRole('button', { name: 'Nästa vecka' }).click();
    await expect(page.locator('.day[data-date="2026-12-07"] .slot', { hasText: 'Middag' })).toContainText('12:30');
    await expect(page.locator('.day[data-date="2026-12-12"] .slot', { hasText: 'Middag' })).toHaveCount(0); // weekend unchanged
  });

  test('validation blocks an empty shift name', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    await page.getByRole('tab', { name: 'Grundschema' }).click();
    const editor = page.getByTestId('template-editor');
    await editor.getByRole('button', { name: '＋ Lägg till pass' }).click();
    await editor.getByRole('button', { name: 'Spara grundschema' }).click();
    await expect(page.getByText('Alla pass måste ha ett namn.')).toBeVisible();
  });

  test('warns before removing a shift that people already booked', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    await page.getByRole('tab', { name: 'Grundschema' }).click();
    const editor = page.getByTestId('template-editor');
    await editor.getByLabel('Gäller från').fill('2026-11-24');
    await editor.getByRole('button', { name: 'Ta bort Frukost' }).click();
    await editor.getByRole('button', { name: 'Spara grundschema' }).click();
    await expect(editor.locator('.warn')).toContainText('redan bokade pass försvinner');
    await editor.getByRole('button', { name: 'Avbryt' }).click();
    await expect(editor.locator('.warn')).toHaveCount(0);
  });

  test('change a single day from the schedule and reset it', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    await page.getByRole('button', { name: /Schema/ }).first().click();
    await page.locator('.day[data-date="2026-11-26"]').getByRole('button', { name: 'ändra dag' }).click();
    const editor = page.getByTestId('day-editor');
    await expect(editor.getByLabel('Datum')).toHaveValue('2026-11-26');
    await editor.getByRole('button', { name: 'Ta bort Utsläpp' }).click();
    await editor.getByLabel('Notering (visas i schemat)').fill('Veterinär 14:00');
    await editor.getByRole('button', { name: 'Spara dagen' }).click();
    // Utsläpp may be booked in the demo data -> confirm the warning
    const force = editor.getByRole('button', { name: 'Spara ändå' });
    await expect(force.or(toast(page))).toBeVisible();
    if (await force.isVisible()) await force.click();
    await expect(toast(page)).toContainText('är ändrad');

    await page.getByRole('button', { name: /Schema/ }).first().click();
    const day = page.locator('.day[data-date="2026-11-26"]');
    await expect(day).toContainText('Veterinär 14:00');
    await expect(day.locator('.slot', { hasText: 'Utsläpp' })).toHaveCount(0);

    await day.getByRole('button', { name: 'ändra dag' }).click();
    await page.getByRole('button', { name: 'Återställ till grundschemat' }).click();
    await page.getByRole('button', { name: /Schema/ }).first().click();
    await expect(day.locator('.slot', { hasText: 'Utsläpp' })).toBeVisible();
  });

  test('warns before a day change removes a booked shift', async ({ page }) => {
    await openAs(page);
    await page.evaluate(() => {
      const b = (window as any).__stallBackend;
      const w = b.getWeek('2026-W48');
      w.assignments['2026-11-26_utslapp'] = 'lisa';
      b.setWeek('2026-W48', w);
    });
    await unlockAdmin(page);
    await page.getByRole('tab', { name: 'Enstaka dag' }).click();
    const editor = page.getByTestId('day-editor');
    await editor.getByLabel('Datum').fill('2026-11-26');
    await editor.getByRole('button', { name: 'Ta bort Utsläpp' }).click();
    await editor.getByRole('button', { name: 'Spara dagen' }).click();
    await expect(editor.locator('.warn')).toContainText('Utsläpp (Lisa)');
    await editor.getByRole('button', { name: 'Spara ändå' }).click();
    await expect(toast(page)).toContainText('är ändrad');
  });

  test('clearing the date in the day editor does not crash', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    await page.getByRole('tab', { name: 'Enstaka dag' }).click();
    await page.getByTestId('day-editor').getByLabel('Datum').fill('');
    await expect(page.getByText('Välj ett datum inom bokningsperioden.')).toBeVisible();
  });

  test('assign and unassign anyone', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    await page.getByRole('button', { name: /Schema/ }).first().click();
    const free = page.locator('.slot.free:not(.past)').first();
    const key = await free.getAttribute('data-key');
    await free.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Karin' }).click();
    const slot = page.locator(`.slot[data-key="${key}"]`);
    await expect(slot).toContainText('Karin');
    await slot.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ingen (ledigt)' }).click();
    await expect(slot).toHaveAttribute('data-status', 'free');
  });

  test('manage people', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    await page.getByRole('tab', { name: 'Personer' }).click();
    const admin = page.getByTestId('people-admin');
    await admin.getByRole('button', { name: '＋ Lägg till person' }).click();
    await admin.getByLabel('Namn').fill('Hedda');
    await admin.getByRole('button', { name: 'Spara' }).click();
    await expect(admin).toContainText('Hedda');
    const row = admin.locator('.row', { hasText: 'Hedda' });
    await row.getByRole('button', { name: 'Inaktivera' }).click();
    await expect(row).toContainText('Inaktiv');
    // inactive people are not offered in the "who are you" list
    await page.getByTestId('me-chip').click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Hedda' })).toHaveCount(0);
  });

  test('log shows recent changes', async ({ page }) => {
    await openAs(page);
    const free = page.locator('.slot.free:not(.past)').first();
    await free.click();
    await page.getByTestId('claim').click();
    await unlockAdmin(page);
    await page.getByRole('tab', { name: 'Logg' }).click();
    await expect(page.getByTestId('admin-log').locator('li').first()).toContainText('Maja tog');
  });

  test('booking horizon can be changed', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    await page.getByRole('tab', { name: 'Mer' }).click();
    await page.getByRole('button', { name: 'Färre veckor' }).click();
    await expect(page.getByTestId('weeks-ahead')).toHaveText('5');
    await page.getByRole('button', { name: /Schema/ }).first().click();
    const next = page.getByRole('button', { name: 'Nästa vecka' });
    for (let i = 0; i < 5; i++) await next.click();
    await expect(next).toBeDisabled();
  });

  test('lock admin again', async ({ page }) => {
    await openAs(page);
    await unlockAdmin(page);
    await page.getByRole('tab', { name: 'Mer' }).click();
    await page.getByRole('button', { name: 'Lås', exact: true }).click();
    await expect(page.getByRole('button', { name: /Admin/ })).toHaveCount(0);
  });
});
