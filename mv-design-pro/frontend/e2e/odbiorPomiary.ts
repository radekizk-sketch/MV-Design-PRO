/**
 * Wybór elementu pomiaru w edytorze okna „Zgodność powykonawcza" (karta #145).
 *
 * Projektant wybiera element z listy modelu po NAZWIE (wartością opcji jest referencja
 * elementu). Pomiar elementu, którego w modelu nie ma (wiersz „brak odpowiednika
 * w modelu"), idzie ścieżką „Element spoza modelu" — ostatnia opcja listy — i polem
 * oznaczenia z protokołu. Helper ćwiczy obie ścieżki natywnie (selectOption + fill),
 * zależnie od tego, czy referencja jest opcją listy modelu.
 */
import type { Page } from '@playwright/test';

export async function wybierzElementOdbioru(page: Page, indeks: number, ref: string): Promise<void> {
  const lista = page.getByTestId(`mvd-odbior-element-${indeks}`);
  const opcjaModelu = lista.locator(`option[value="${ref}"]`);
  if ((await opcjaModelu.count()) > 0) {
    await lista.selectOption(ref);
    return;
  }
  const spozaModelu = await lista.locator('option').last().getAttribute('value');
  if (spozaModelu === null) throw new Error('Lista elementów bez opcji „Element spoza modelu".');
  await lista.selectOption(spozaModelu);
  await page.getByTestId(`mvd-odbior-element-protokol-${indeks}`).fill(ref);
}
