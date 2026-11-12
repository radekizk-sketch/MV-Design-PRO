/**
 * Karta INSPEKTOR-I-NAWIGACJA — karty inspektora na realnym backendzie, oba motywy; zrzuty dla
 * oceny właściciela (B-02 — werdykt wystawia właściciel, nie test).
 *
 * Ścieżki natywne:
 *  - stacja: klik wiersza drzewa topologii „Model sieci — Właściwości” (strzałki rozwinięcia
 *    klikane natywnie; to samo wejście co zrzut właściciela `wejscie-z-drzewa`), potem
 *    „Pokaż na schemacie” z inspektora. Drzewo przestrzeni „Schemat” otwiera z wiersza okno
 *    techniczne stacji (konfigurator), nie kartę — ta ścieżka ma własne testy;
 *  - transformator: klik „Otwórz” w tabeli „Karta transformatora” karty stacji (to samo
 *    wejście co klik w symbol transformatora);
 *  - szyny SN/nN, pole SN i sieć zasilająca: adres z identyfikatorem obiektu (link do obiektu —
 *    ta sama ścieżka odtworzenia zaznaczenia z adresu co przycisk „wstecz” przeglądarki).
 * Po każdym wejściu: identyfikacja celu zgodna (ref karty = ref celu, stacja karty = okruszek
 * kadru, gdy obiekt leży w stacji), sekcja wyników nazwana analizą („Obliczenia zwarciowe”).
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { wykonajBiegDoKonca } from './biegi';
import { katalogZrzutow } from './katalogZrzutow';
import { BACKEND_BASE, otworzAplikacje, siecKadrow, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'inspektor-i-nawigacja'));
const OKNO = { width: 1440, height: 900 } as const;

interface Enm {
  substations: { ref_id: string; name: string; bus_refs: string[] }[];
  buses: { ref_id: string; name: string; voltage_kv: number }[];
  bays: { ref_id: string; substation_ref: string; field_role?: string | null }[];
  sources?: { ref_id: string; name: string }[];
}

async function biegZwarciowy(request: APIRequestContext, caseId: string): Promise<void> {
  const utworz = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: 'SC_3F' },
    timeout: 60000,
  });
  expect(utworz.ok(), await utworz.text()).toBeTruthy();
  await wykonajBiegDoKonca(request, BACKEND_BASE, ((await utworz.json()) as { id: string }).id);
}

async function zrzut(page: Page, nazwa: string, motyw: string): Promise<void> {
  await page.getByTestId('inspektor-karta').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.screenshot({ path: resolve(KATALOG, `${nazwa}-${motyw}.png`) });
}

async function zgodnyCel(page: Page, ref: string, wStacji: boolean): Promise<void> {
  const karta = page.getByTestId('inspektor-karta');
  await expect(karta).toHaveAttribute('data-element-ref', ref, { timeout: 30000 });
  if (!wStacji) return;
  const stacja = await karta.getAttribute('data-stacja-nazwa');
  expect(stacja, `stacja nadrzędna ${ref}`).toBeTruthy();
  await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText(stacja!, { timeout: 30000 });
}

/** Rozwija drzewo topologii natywnymi klikami strzałek, aż wiersz celu będzie widoczny. */
async function odslonWezel(page: Page, cel: string): Promise<Locator> {
  const drzewo = page.getByTestId('mvd-tree');
  const wiersz = drzewo.locator('[role="treeitem"]').filter({ hasText: cel }).first();
  for (let i = 0; i < 40 && (await wiersz.count()) === 0; i += 1) {
    const zwiniety = drzewo.locator('[role="treeitem"][aria-expanded="false"]').first();
    if ((await zwiniety.count()) === 0) break;
    const id = (await zwiniety.getAttribute('data-testid'))!.replace('mvd-tree-row-', '');
    await page.getByTestId(`mvd-tree-chevron-${id}`).click();
  }
  await expect(wiersz).toBeVisible({ timeout: 10000 });
  return wiersz;
}

/**
 * Adres z tożsamością obiektu (link / zakładka przeglądarki) — odtworzenie zaznaczenia z adresu.
 * Kontrakt adresu (`decodeSelectionFromParams`): identyfikator, typ i nazwa są wymagane.
 */
async function linkDoObiektu(page: Page, ref: string, typ: string, nazwa: string): Promise<void> {
  await page.evaluate(
    ([r, t, n]) => {
      window.location.hash = `#sld?sel=${encodeURIComponent(r)}&type=${t}&name=${encodeURIComponent(n)}`;
    },
    [ref, typ, nazwa] as const,
  );
}

test('karty inspektora: stacja, szyny SN/nN, pole SN, transformator, sieć zasilająca (oba motywy)', async ({ page, request }) => {
  test.setTimeout(900000);
  mkdirSync(KATALOG, { recursive: true });
  const seed = await siecKadrow(request);
  const enm = seed.enm as unknown as Enm;
  await biegZwarciowy(request, seed.caseId);
  await otworzAplikacje(page, seed, OKNO);

  const sekcyjna = enm.substations.find((s) => s.name === 'Stacja Sekcyjna')!;
  const szyny = sekcyjna.bus_refs.map((r) => enm.buses.find((b) => b.ref_id === r)!).filter(Boolean);
  const szynaNn = szyny.find((b) => b.voltage_kv < 1)!;
  const szynaSn = szyny.find((b) => b.voltage_kv >= 1)!;
  const poleSn = enm.bays.find((b) => b.substation_ref === sekcyjna.ref_id && b.field_role === 'LINIA_IN')!;
  const zrodlo = (enm.sources ?? [])[0];

  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    // Stacja — klik w drzewie topologii „Model sieci — Właściwości”.
    await page.getByRole('button', { name: /^Model sieci \d$/ }).first().click();
    await page.getByTestId('mvd-model-zakladka-wlasciwosci').click();
    await page.getByTestId('mvd-tree-mode-administracyjny').click();
    await (await odslonWezel(page, 'Stacja Sekcyjna')).click();
    await zgodnyCel(page, sekcyjna.ref_id, false);
    await expect(page.getByTestId('inspektor-element-oznaczenie')).toHaveText(/^S\d{2}$/);
    // Podtytuł: kategoria stacji z modelu, rodzaj topologiczny w wierszu „Rodzaj”.
    await expect(page.getByTestId('inspektor-element-rodzaj')).toHaveText('Stacja SN/nN');
    await expect(page.getByTestId('inspektor-element-napiecia')).toHaveText(' · 15/0,4 kV');
    await expect(page.getByTestId('inspektor-karta-wartosc-rodzaj')).toHaveText('Stacja sekcyjna');
    // Przyczynę rodzaju mówi układ rozdzielnicy — bez osobnej „Podstawy rodzaju” (deklaracja zgodna).
    await expect(page.getByTestId('inspektor-karta-wartosc-podstawa_rodzaju')).toHaveCount(0);
    await expect(page.getByTestId('inspektor-karta-wiersz-uklad_sn').or(page.getByText('dwie sekcje szyn ze sprzęgłem')).first()).toBeVisible();
    await expect(page.getByTestId('inspektor-wyniki-tytul')).toHaveText('Obliczenia zwarciowe');
    await zrzut(page, 'karta-stacja-sekcyjna', motyw.klucz);

    // „Pokaż na schemacie” (natywny przycisk inspektora) — ten sam cel na schemacie: karta
    // niesie ref stacji, okruszek kadru = stacja nadrzędna karty.
    await page.getByTestId('mvd-inspektor-pokaz-na-schemacie').getByRole('button', { name: 'Pokaż na schemacie' }).click();
    await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
    await zgodnyCel(page, sekcyjna.ref_id, true);

    // Transformator — przejście z karty stacji.
    await page.getByTestId('inspektor-karta-otworz-tr_karta').first().click();
    await expect(page.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'transformator', { timeout: 30000 });
    // Kolejność paneli: parametry → wyniki → katalog (sekcja „Katalog” po wynikach).
    const poKolei = await page.getByTestId('inspektor-karta').evaluate((karta) => {
      const wyniki = karta.querySelector('[data-testid="inspektor-wyniki"]');
      const katalog = karta.querySelector('[data-testid="inspektor-karta-katalog"]');
      const tabliczka = karta.querySelector('[data-testid="inspektor-karta-tabliczka"]');
      if (!wyniki || !katalog || !tabliczka) return 'brak sekcji';
      const przed = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return przed(tabliczka, wyniki) && przed(wyniki, katalog) ? 'zgodna' : 'niezgodna';
    });
    expect(poKolei).toBe('zgodna');
    await zrzut(page, 'karta-transformator', motyw.klucz);

    for (const [nazwa, ref, typ, nazwaObiektu] of [
      ['karta-szyna-nn', szynaNn.ref_id, 'Bus', szynaNn.name],
      ['karta-szyna-sn', szynaSn.ref_id, 'Bus', szynaSn.name],
      ['karta-pole-sn', poleSn.ref_id, 'BaySN', poleSn.ref_id],
      ...(zrodlo ? [['karta-siec-zasilajaca', zrodlo.ref_id, 'Source', zrodlo.name]] : []),
    ] as const) {
      await linkDoObiektu(page, ref, typ, nazwaObiektu);
      await zgodnyCel(page, ref, nazwa !== 'karta-siec-zasilajaca');
      if (typ === 'Bus') {
        // Sekcja zwarć szyny (karta I.2): rodzaj zwarcia, Ik'', ip, Ith z warunkami — scenariusz
        // maksymalny i minimalny osobno (pasmo z backendu), bez zbiorczej tabeli punktów.
        const zwarcie = page.getByTestId('inspektor-zwarcie');
        await expect(zwarcie).toBeVisible({ timeout: 60000 });
        await expect(zwarcie.getByTestId('inspektor-zwarcie-rodzaj')).not.toHaveText('');
        await expect(
          zwarcie.getByTestId('inspektor-zwarcie-wielkosc-IK_3F_A').getByTestId('inspektor-zwarcie-maks'),
        ).toHaveText(/\d+,\d+ (kA|A)/);
      }
      await zrzut(page, nazwa, motyw.klucz);
    }
  }
});
