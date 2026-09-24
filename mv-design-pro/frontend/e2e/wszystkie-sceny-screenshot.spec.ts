/**
 * Zrzut KAŻDEJ sceny harnessu — bramka pokrycia ekranów (V12K-259).
 *
 * DLACZEGO POWSTAŁ. Harness renderował 43 sceny żywych komponentów, a spec zrzutów
 * kadrował 9 z nich. Pozostałe 34 były utrzymywane i nigdy nieoglądane — zdolność bez
 * konsumenta, ten sam wzorzec co reguła gotowości bez wywołania (V12K-251). Pierwsze
 * uruchomienie tej bramki znalazło scenę `zrodlo` w stanie TWARDEGO CRASHU (biały ekran,
 * `Cannot read properties of undefined (reading 'length')`) — defekt niewidoczny latami,
 * bo nikt tego ekranu nie renderował w CI.
 *
 * CO SPRAWDZA (poza samym kadrem):
 *  1. korzeń harnessu osiąga `data-status=ready` — scena w ogóle się składa,
 *  2. ZERO błędów konsoli i ZERO wyjątków renderu — biały ekran nie przejdzie,
 *  3. treść nie zawiera komunikatu o nieudanym pobraniu — scena bez atrapy końcówki
 *     pokazywałaby błąd, a zrzut do oceny wyglądałby równie porządnie.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { zbierajNieudaneZadaniaApi } from './nieudaneZadaniaApi';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/sceny');

/**
 * HARNESS-RESZTA-2 (2026-09-17): asercje sceny koordynacji CYTUJĄ fixturę
 * REALNEGO biegu backendu (tę samą, którą serwuje harness) — zero refów sieci
 * wpisanych w specu. Odczyt przez `readFileSync`, nie `import … .json`: moduł
 * specu jest ESM Node'a, gdzie import JSON wymaga atrybutu `with { type: 'json' }`
 * (zmierzone: bez tego bieg kończy się `TypeError` przed zebraniem testów).
 */
const KOORDYNACJA_SCENA_WYNIK = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/koordynacja_scena_wynik.json'),
    'utf-8',
  ),
) as { devices: { location_element_id: string }[] };

/**
 * Decyzja O-51 pkt 7: zabezpieczenia sceny stoją na odcinkach magistrali przy WSKAZANYM
 * zacisku — lokalizacje i zaciski z fixtury rozstrzygnięć backendu (tej samej, którą
 * serwuje atrapa `GET …/enm/zacisk-lokalizacji`).
 */
const KOORDYNACJA_SCENA_MIEJSCA = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/koordynacja_scena_miejsca.json'),
    'utf-8',
  ),
) as { urzadzenia_sceny: { lokalizacja: string; zacisk: 'od' | 'do' }[] };

/** Sceny kadrowane przez `creator-screenshot.spec.ts` — tam mają własne interakcje. */
const JUZ_KADROWANE = new Set([
  'pole', 'oze', 'arcflash', 'magistrala', 'kompensator', 'transformator', 'odbior', 'wiazania',
  // V12T-016 (karta SZABLONY-ROLA-A): `szablony-rola-a-screenshot.spec.ts`
  // rozwija i wybiera rolę A (drzewko startuje zwinięte) — własna interakcja.
  'szablony',
]);

const SCENY = [
  // B-02 / W3-E (2026-09-10): „akademickie" = katalog kart „Analizy specjalistyczne"
  // (widok domyślny, bez `rodzaj`); „ocena" / „ocena-przekroczenia" = ekran „Ocena
  // techniczna wyników" bez przekroczeń i z realnymi NIE SPEŁNIA (obciążenie ×8).
  'akademickie', 'cieplna', 'dokumentacja', 'edycja-parametrow', 'estymacja', 'frt', 'kompensacja',
  'kompensacja-wynik', 'lom', 'macierz', 'migotanie', 'ocena', 'ocena-przekroczenia',
  'odbior-zgodnosc', 'odgalezienie',
  'oltc', 'pole-nn', 'pomiar', 'porownanie', 'przekaznik', 'przypisanie-katalogu', 'pulpit',
  'rozplyw', 'sila-sieci', 'slup-odgalezny', 'ssci', 'swiezosc', 'uwaga', 'walidacja',
  'wyniki-skladowe', 'wyniki-stabilnosc', 'wyniki-stan-fazowy', 'wyniki-zbieznosc', 'zksn',
  'zrodlo', 'zrodlo-dyspozycyjne', 'zwarcia', 'zwarcia-rozplyw',
].filter((s) => !JUZ_KADROWANE.has(s));

const THEMES = ['light', 'dark'] as const;

test.describe('sceny:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const scena of SCENY) {
    for (const theme of THEMES) {
      test(`${scena} — ${theme}`, async ({ page }) => {
        const errs: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));
        zbierajNieudaneZadaniaApi(page, errs);

        await page.setViewportSize({ width: 1220, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${scena}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });

        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root, `scena ${scena} nie doszła do stanu gotowego`).toHaveAttribute(
          'data-status',
          'ready',
          { timeout: 15000 },
        );

        // Treść musi być POKAZANA, nie obiecana: pusty korzeń to scena, która się
        // złożyła i nic nie wyrenderowała.
        const tresc = ((await root.textContent()) ?? '').replace(/\s+/g, ' ').trim();
        expect(tresc.length, `scena ${scena} wyrenderowała pustą treść`).toBeGreaterThan(80);
        // WZORZEC SZEROKI CELOWO (V12K-260): pierwsza wersja lapala tylko „Nie udalo sie
        // POBRAC", a scena odbioru pokazywala „Nie udalo sie WYZNACZYC podgladu pradu" —
        // ten sam defekt, inne slowo, bramka niema. Kazda odmiana „nie udalo sie" na
        // ekranie do oceny znaczy brakujaca atrape albo realna awarie.
        expect(
          /Nie udało się/i.test(tresc),
          `scena ${scena} pokazuje komunikat o niepowodzeniu — brakuje atrapy końcówki`,
        ).toBe(false);

        // K3-B4: znacznik świeżości nagłówka MUSI być na ekranie, nie tylko
        // w kodzie — bramka treści dla jednej sceny AKTUALNEJ (zwarcia:
        // migawka rev. 1 = wynik rev. 1) i wariantu NIEAKTUALNEGO (cieplna:
        // migawka rev. 2, wynik rev. 1 + panel przyczyn z dziennika zmian).
        // Dług nazwany (meldunek K3): sceny jakosc/ranking bez asercji badge
        // — osobna karta.
        if (scena === 'zwarcia') {
          const badge = page.locator('[data-mvd-fresh]').first();
          await expect(badge, 'scena zwarcia: brak znacznika świeżości').toHaveAttribute(
            'data-mvd-fresh',
            'ok',
          );
          await expect(badge).toContainText('aktualne');
        }
        if (scena === 'cieplna') {
          const badge = page.locator('[data-mvd-fresh="stale"]').first();
          await expect(badge, 'scena cieplna: brak znacznika NIEAKTUALNE').toBeVisible();
          await expect(badge).toContainText('nieaktualne (rew. 1 → 2)');
          await expect(page.getByTestId('mvd-co-sie-zmienilo')).toBeVisible();
          await expect(page.getByTestId('mvd-zmiany-podsumowanie')).toContainText(
            'Wynik trzeba przeliczyć',
          );
        }

        // B-02 / W3-E: scena „ocena" pokazuje OCENĘ (nie stan blokujący „brak wyników"),
        // scena przekroczeń niesie co najmniej jedną pozycję NIE SPEŁNIA; katalog kart
        // „akademickie" pokazuje karty pogrupowane (nie listę rozwijaną).
        if (scena === 'ocena' || scena === 'ocena-przekroczenia') {
          await expect(page.getByTestId('mvd-ocena-podsumowanie')).toBeVisible({ timeout: 15000 });
          await expect(page.getByTestId('mvd-ocena-brak-wynikow')).toHaveCount(0);
          const nieSpelnia = Number(
            (await page.getByTestId('mvd-ocena-licznik-nie-spelnia').locator('.mvd-ocena-licznik-liczba').textContent())?.trim(),
          );
          if (scena === 'ocena') expect(nieSpelnia).toBe(0);
          else expect(nieSpelnia).toBeGreaterThan(0);
        }
        if (scena === 'akademickie') {
          await expect(page.getByTestId('mvd-akad-katalog-kart')).toBeVisible({ timeout: 15000 });
          expect(await page.locator('[data-testid^="mvd-akad-karta-otworz-"]').count()).toBeGreaterThan(0);
        }

        await page.waitForTimeout(250);
        await root.screenshot({ path: path.join(OUTPUT_DIR, `scena_${scena}_${theme}.png`) });

        if (errs.length > 0) console.log(`[${scena}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `błędy renderu w scenie ${scena}/${theme}`).toEqual([]);
      });
    }
  }
});

/**
 * Koordynacja zabezpieczeń (E-28) — kadr Z POLICZONYM WYNIKIEM (V12K-262).
 *
 * Osobny test, bo ten ekran nie pokazuje niczego bez przejścia ŚCIEŻKI: dwa
 * zabezpieczenia z szablonu → uruchomienie analizy → krzywe TCC i werdykty par.
 * Klik jest NATYWNY (`page.click`), nie wymuszeniem stanu store — inaczej zrzut
 * dowodziłby działania atrapy, a nie ekranu (precedens: martwy lewy klik w SLD,
 * latami niewidoczny, bo wszystkie specy klikały syntetycznie).
 */
test.describe('koordynacja:screenshot', () => {
  for (const theme of THEMES) {
    test(`koordynacja z wynikiem — ${theme}`, async ({ page }) => {
      const errs: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (m) => {
        if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
      });
      page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));
      zbierajNieudaneZadaniaApi(page, errs);

      await page.setViewportSize({ width: 1220, height: 1400 });
      await page.goto(`${HARNESS_URL}?creator=koordynacja&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });

      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      // Bieg zwarciowy jest zasiany, więc ekran MUSI wpuścić do strony koordynacji,
      // a nie zatrzymać się na uczciwym stanie zerowym.
      await expect(page.getByTestId('protection-coordination-page')).toBeVisible();

      // Dwa zabezpieczenia z szablonu — realną drogą projektanta: szablon,
      // WSKAZANIE ELEMENTU MODELU z listy (V12K-262: lokalizacji nie da się już
      // dostać „za darmo", bo ekran jej nie wymyśla), zapis konfiguracji.
      // HARNESS-RESZTA-2 (2026-09-17): refy CYTOWANE Z FIXTURY realnego biegu
      // backendu (szyny SN obu stacji magistrali sceny) — wcześniej spec podawał
      // refy sieci, która nie istnieje w żadnym modelu repozytorium.
      const miejsca = KOORDYNACJA_SCENA_MIEJSCA.urzadzenia_sceny;
      expect(miejsca.length, 'fixtura koordynacji musi opisywać dwa zabezpieczenia').toBe(2);
      expect(miejsca.map((m) => m.lokalizacja).sort()).toEqual(
        KOORDYNACJA_SCENA_WYNIK.devices.map((u) => u.location_element_id).sort(),
      );
      for (const { lokalizacja, zacisk } of miejsca) {
        await page.getByTitle('Zastosuj szablon').click();
        // Klik ZAWĘŻONY do okna szablonów: po dodaniu pierwszego zabezpieczenia ta sama
        // nazwa jest też na liście urządzeń POD nakładką, a `.first()` trafiał w nią
        // i modal przechwytywał zdarzenie.
        await page.locator('div.fixed.inset-0').getByText('Przekaznik 50/51 (typowy)').click();
        await expect(page.getByTestId('protection-settings-editor')).toBeVisible();
        await page.getByTestId('device-location-select').selectOption(lokalizacja);
        // Zacisk gałęzi — etykieta z nazwą szyny z backendu, brak zacisku domyślnego.
        const zaciskUrzadzenia = page.getByTestId(`device-terminal-${zacisk}`);
        await expect(zaciskUrzadzenia).not.toBeChecked();
        await zaciskUrzadzenia.click();
        await page.getByRole('button', { name: 'Zapisz konfigurację' }).click();
      }

      // Decyzja O-51 pkt 7: prąd ZWARCIOWY szyny zacisku (biegi c_max i c_min) i prąd
      // ROBOCZY tego samego zacisku (bieg rozpływu) związały się z obydwoma
      // zabezpieczeniami — panel braków nie ma czego meldować. Do tej karty
      // zabezpieczenia stały na szynach, a prąd roboczy był nazwanym brakiem (relacji
      // „zabezpieczenie → chroniona gałąź" wtedy nie było).
      await expect(page.getByTestId('coordination-missing-currents')).toHaveCount(0);
      const uruchom = page.getByTestId('run-analysis-button');
      await expect(uruchom).toBeEnabled();
      await uruchom.click();

      // Werdykt pary z NARUSZENIEM musi dojechać na ekran wraz z widoczną akcją
      // naprawczą (V12K-261) — to jest dowód, że łańcuch domknął się do końca.
      // Tożsamość zabezpieczenia nadrzędnego wymyśla EKRAN (`crypto.randomUUID()`
      // przy zastosowaniu szablonu), więc spec nie może jej znać — czyta ją z
      // wiersza selektywności, który ekran wyrenderował.
      await page.getByTestId('tab-selectivity').click();
      await expect(page.getByTestId('selectivity-table')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid^="selectivity-fix-"]').first()).toBeVisible();

      // Krzywe czasowo-prądowe: sedno tego ekranu i jedyny wykres log-log w systemie.
      await page.getByTestId('tab-tcc').click();
      await expect(page.locator('svg').first()).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(400);

      await root.screenshot({ path: path.join(OUTPUT_DIR, `scena_koordynacja_${theme}.png`) });

      if (errs.length > 0) console.log(`[koordynacja/${theme}] errors:\n${errs.join('\n')}`);
      expect(errs, `błędy renderu w scenie koordynacji/${theme}`).toEqual([]);
    });
  }
});
