import { expect, test } from '@playwright/test';

test('tablet crea sala, un móvil se sienta, empieza la partida y recargar mantiene el asiento', async ({ browser }) => {
  const tablet = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await tablet.goto('/board');
  await expect(tablet).toHaveURL(/\/board\/[A-Z0-9]{4}/);
  const code = tablet.url().split('/').pop()!;
  await expect(tablet.getByText(code, { exact: true })).toBeVisible();

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true })).newPage();
  await phone.goto(`/play/${code}`);
  await phone.getByPlaceholder('Tu nombre').fill('Ana');
  await phone.getByRole('button', { name: 'Sentarme a la mesa' }).click();
  await expect(phone.getByText('Estás dentro')).toBeVisible();

  await tablet.getByRole('button', { name: 'Añadir bot' }).click();
  await tablet.getByRole('button', { name: 'Añadir bot' }).click();
  await tablet.getByRole('button', { name: 'Empezar partida' }).click();
  await expect(tablet.locator('svg.board-svg')).toBeVisible();
  await expect(phone.getByRole('dialog', { name: /Coloca/ }).or(phone.getByText(/Turno de|Tu turno/))).toBeVisible();

  await phone.reload();
  await expect(phone.getByText('Ana').first()).toBeVisible();
  await expect(phone.getByText('Sentarme a la mesa')).toHaveCount(0);
});
