import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const _dirname = path.dirname(fileURLToPath(import.meta.url));

/** Fikstura sceny wyliczona przez backend — źródło nazw rodzin (karta PL-ZNAKI:
 * nazwa przepisana ręcznie rozjechała się z backendem po poprawie zapisu). */
const PRZEGLAD = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/przeglad_wiarygodnosci_katalogu.json'),
    'utf-8',
  ),
) as { rodziny_bez_regul: { rodzina: string; powod: string }[] };
/** Nazwa rodziny CT = część powodu przed dwukropkiem („Przekładnik prądowy: …"). */
const NAZWA_RODZINY_CT = PRZEGLAD.rodziny_bez_regul
  .find((r) => r.rodzina === 'ct')!
  .powod.split(':')[0];

/**
 * Sekcja „Pozycje do przeglądu" biblioteki typów — scena harnessu karmiona
 * fiksturą WYLICZONĄ przez backend na żywym katalogu
 * (`backend/scripts/eksport_fixtur_harnessu.py::przeglad_wiarygodnosci_katalogu_scena`,
 * parytet w `backend/tests/ci/test_fixtury_harnessu.py`).
 *
 * Spec pilnuje tego, czego test jednostkowy nie widzi: że ekran REALNIE
 * renderuje kontrakt backendu w przeglądarce, że stan zerowy podaje liczbę
 * policzonych i pominiętych sprawdzeń (bez tego „brak pozycji" byłby
 * nierozróżnialny od „nic nie policzono") i że nazywa odstępstwo sygnałem,
 * a nie odmową.
 */
test.describe('Pozycje do przeglądu katalogu', () => {
  test('sekcja pokazuje pokrycie regul i nazywa odstepstwo sygnalem', async ({ page }) => {
    await page.goto('/creator-harness.html?creator=przeglad-wiarygodnosci');

    const sekcja = page.getByTestId('pozycje-do-przegladu');
    await expect(sekcja).toBeVisible();

    const podsumowanie = page.getByTestId('pozycje-do-przegladu-podsumowanie');
    await expect(podsumowanie).toContainText('Sprawdzeń policzonych:');
    await expect(podsumowanie).toContainText('pominiętych (reguła nie ma zastosowania):');
    await expect(sekcja).toContainText('sygnał do przeglądu karty producenta, nie odmowa');

    // Rozwinięcie szczegółów: pokrycie każdej rodziny + uzasadnienia reguł z backendu.
    await page.getByTestId('pozycje-do-przegladu-przelacz').click();
    const szczegoly = page.getByTestId('pozycje-do-przegladu-szczegoly');
    await expect(szczegoly).toBeVisible();
    await expect(page.getByTestId('pozycje-do-przegladu-rodzina-transformatory')).toContainText(
      'Transformatory',
    );
    await expect(page.getByTestId('pozycje-do-przegladu-regula-KAT-W-002')).toContainText(
      'P0 < Pk',
    );
    // Rodzina poza przeglądem MUSI być nazwana z powodem — milczenie o niej
    // byłoby nierozróżnialne od przeoczenia.
    await expect(page.getByTestId('pozycje-do-przegladu-bez-regul-ct')).toContainText(
      NAZWA_RODZINY_CT,
    );
  });
});
