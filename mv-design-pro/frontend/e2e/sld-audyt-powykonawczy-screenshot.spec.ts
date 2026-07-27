/**
 * AUDYT POWYKONAWCZY SLD (zadanie #76, dyrektywa właściciela 2026-07-23:
 * „SLD brak odbioru bez audytu ekranów — daj ekrany i sporządź audyt powykonawczy
 * zespołu ekspertów i poprawiaj").
 *
 * Ten spec dostarcza MATERIAŁ DO OGLĘDZIN: świeże renders HEAD na sieci wzorcowej
 * (≥52 stacje), po jednym kadrze na poziom detalu L0/L1/L2 w obu motywach. Nie jest
 * testem regresji wizualnej — jest generatorem dowodu do audytu wielosoczewkowego
 * (projektant SN, zwarciowiec/rozdzielnie, SCADA/UX, kartografia layoutu, kanon LOD).
 *
 * Poziomy wg `docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md` §2:
 *   L0 — mapa sieci (bloki kompaktowe, przebiegi kabli),
 *   L1 — sieć terenowa (+ rozdzielnia GPZ, sekcje, głowice pól, NOP),
 *   L2 — obiekty i pola (+ detal stacji, aparaty, DER pełny).
 *
 * Bramki, które spec sprawdza po drodze (żeby zrzut nie kłamał):
 *   - kanwa faktycznie wyrenderowana (nie pusty SVG),
 *   - wymuszony poziom detalu DOTARŁ do kanwy (`data-lod-override`),
 *   - zero błędów konsoli — zrzut z wywróconym renderem nie jest materiałem audytu.
 *
 * Wyjście: docs/audit/visual/sld_audyt/sld_L<poziom>_<motyw>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/screenshot-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/sld_audyt');

const POZIOMY = [0, 1, 2] as const;
const MOTYWY = ['light', 'dark'] as const;

/**
 * Kadry SZCZEGOLU (V12K-234). Powiekszenie robi KAMERA, zeby declutter przestal ukrywac
 * etykiety (prog czytelnosci liczony w pikselach EKRANU — `MIN_READABLE_LABEL_SCREEN_PX`);
 * Playwright tylko wycina obszar 960x540 w skali 1:1.
 */
const OBSZARY_SZCZEGOLU = [
  // Punkt = miejsce na kadrze dopasowanym (L2, cala siec), nad ktorym krecimy kolkiem.
  { nazwa: 'rozdzielnia GPZ (110/15 kV)', plik: 'gpz', punktX: 90, punktY: 360, krokiKolka: 8 },
  { nazwa: 'stacja na magistrali z polami', plik: 'stacja', punktX: 620, punktY: 600, krokiKolka: 8 },
] as const;

/** Minimalna liczba stacji sieci wzorcowej — zrzut z ubogiego modelu nie jest audytem. */
const MIN_STACJI = 52;

async function otworzKanwe(page: Page, lod: number, motyw: string): Promise<string[]> {
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(`PAGEERROR: ${err.message}`));

  await page.goto(`${HARNESS_URL}?lod=${lod}&theme=${motyw}`, { waitUntil: 'networkidle' });

  const korzen = page.locator('[data-testid="sld-harness-root"]').first();
  await expect(korzen).toBeVisible({ timeout: 20000 });
  await expect(korzen).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

  // Wymuszony poziom detalu MUSI dotrzec do kanwy — inaczej wszystkie trzy kadry
  // pokazywalyby ten sam LOD i audyt oceniałby nieistniejący stan.
  await expect(korzen).toHaveAttribute('data-lod-override', String(lod));

  // Sieć wzorcowa, nie model demonstracyjny.
  const stacje = Number(await korzen.getAttribute('data-stations'));
  expect(stacje, `sieć wzorcowa ma mieć >= ${MIN_STACJI} stacji, jest ${stacje}`).toBeGreaterThanOrEqual(
    MIN_STACJI,
  );

  const kanwa = page.locator('[data-testid="sld-canvas-v3"]').first();
  await expect(kanwa).toBeVisible({ timeout: 15000 });

  // Kanwa nie moze byc pusta — pusty SVG wyglada na zrzucie jak „czysty schemat".
  const liczbaElementow = await kanwa.locator('g, path, rect, line, text').count();
  expect(liczbaElementow, 'kanwa SLD jest pusta — zrzut nie jest materiałem audytu').toBeGreaterThan(
    50,
  );

  await page.waitForTimeout(900); // auto-fit + ustalenie etykiet
  return bledy;
}

test.describe('SLD — audyt powykonawczy: ekrany L0/L1/L2', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const lod of POZIOMY) {
    for (const motyw of MOTYWY) {
      test(`poziom L${lod} (${motyw})`, async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        const bledy = await otworzKanwe(page, lod, motyw);

        await page.screenshot({
          path: path.join(OUTPUT_DIR, `sld_L${lod}_${motyw}.png`),
          fullPage: false,
        });

        expect(bledy, `bledy konsoli przy L${lod}/${motyw}: ${bledy.join(' | ')}`).toEqual([]);
      });
    }
  }

  /**
   * V12K-234: KADRY SZCZEGOLU — bez nich material audytowy NIE POKAZUJE poziomu L2.
   *
   * OGLEDZINY, ktore to wymusily. Kadr calej sieci wzorcowej (52 stacje) na poziomie
   * „pelny detal" pokazuje: 1135 etykiet UKRYTYCH przez declutter (wskaznik w prawym
   * dolnym rogu podaje te liczbe wprost), legende jako nieczytelna smuge i aparaty
   * ponizej rozdzielczosci piksela. Czyli material opisany jako „L2 — obiekty i pola
   * (+ detal stacji, aparaty, DER pelny)" nie zawiera ANI JEDNEGO z tych elementow.
   * Zielony wynik szesciu testow tego nie wykrywal, bo sprawdzaly render i konsole,
   * a nie CZYTELNOSC tego, co maja pokazac.
   *
   * Kadr jest wycinkiem 960x540 w skali 1:1 (`clip`), nie przeskalowanym zrzutem —
   * inaczej powiekszenie dodaloby rozmycie i nadal nie pokazaloby etykiet, ktore
   * declutter ukrywa przy MALEJ skali kamery. Powiekszenie robi wiec KAMERA
   * (realny gest kolkiem, patrz nizej), a Playwright tylko kadruje.
   */
  for (const obszar of OBSZARY_SZCZEGOLU) {
    test(`szczegol L2: ${obszar.nazwa}`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      const bledy = await otworzKanwe(page, 2, 'dark');

      // Powiekszenie REALNYM gestem uzytkownika (kolko nad punktem zainteresowania),
      // nie parametrem harnessu ani wymuszeniem stanu kamery. Kanwa nasluchuje `wheel`
      // natywnie (`passive: false`), wiec to ta sama sciezka, ktora ma projektant —
      // a wymuszony stan kamery moglby ukryc defekt wlasnie w niej (CLAUDE.md
      // Zero-Debt pkt 5: test nie moze obchodzic realnej sciezki).
      await page.mouse.move(obszar.punktX, obszar.punktY);
      for (let krok = 0; krok < obszar.krokiKolka; krok += 1) {
        await page.mouse.wheel(0, -240);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(300);

      // Kadr wysrodkowany na punkcie, ale PRZYCIETY do widoku — inaczej ujemne `x`
      // daje wycinek wezszy niz zadany (pierwsza wersja zgubila lewa krawedz opisu GPZ).
      const KADR = { szerokosc: 960, wysokosc: 540 } as const;
      const wSrodku = (srodek: number, rozmiarKadru: number, rozmiarWidoku: number): number =>
        Math.max(0, Math.min(srodek - rozmiarKadru / 2, rozmiarWidoku - rozmiarKadru));

      await page.screenshot({
        path: path.join(OUTPUT_DIR, `sld_szczegol_${obszar.plik}.png`),
        clip: {
          x: wSrodku(obszar.punktX, KADR.szerokosc, 1920),
          y: wSrodku(obszar.punktY, KADR.wysokosc, 1080),
          width: KADR.szerokosc,
          height: KADR.wysokosc,
        },
      });

      expect(bledy, `bledy konsoli przy szczegole ${obszar.nazwa}: ${bledy.join(' | ')}`).toEqual([]);
    });
  }

  /**
   * V12K-234: NIEZMIENNIK MOTYWU, zamiast komentarza w harnessie.
   *
   * Kanwa v3 ma STALE tlo techniczne (`SLD_V3_BACKGROUND`) — swiadoma decyzja
   * projektowa: rysunek techniczny nie reaguje na motyw interfejsu. Harness ustawia
   * `data-theme` dla spojnosci strony oceny, ale render jest od niego niezalezny,
   * wiec para zrzutow jasny/ciemny jest BAJTOWO IDENTYCZNA.
   *
   * Dopoki to byl tylko komentarz, szesc plikow nazwanych „light" i „dark" sugerowalo
   * pokrycie motywow, ktorego NIE MA — a przy ogledzinach materialu audytowego
   * wygladalo to na defekt renderu (i tak wlasnie zostalo raz zdiagnozowane, blednie).
   * Ten test zamienia decyzje w SPRAWDZANY FAKT: jesli kanwa kiedys zacznie reagowac
   * na motyw, asercja padnie i wymusi decyzje — albo zrzuty maja sie roznic naprawde,
   * albo duplikat trzeba usunac. Milczaca zmiana w zadna strone nie przejdzie.
   */
  test('niezmiennik: kanwa techniczna jest NIEZALEZNA od motywu (para zrzutow identyczna)', () => {
    for (const lod of POZIOMY) {
      const jasny = fs.readFileSync(path.join(OUTPUT_DIR, `sld_L${lod}_light.png`));
      const ciemny = fs.readFileSync(path.join(OUTPUT_DIR, `sld_L${lod}_dark.png`));

      expect(
        jasny.equals(ciemny),
        `L${lod}: zrzuty jasny/ciemny ROZNIA sie, a kanwa v3 ma stale tlo techniczne. `
          + 'Albo render zaczal reagowac na motyw (wtedy zaktualizuj ten niezmiennik i '
          + 'opis w screenshot-harness-main.tsx), albo do zrzutu wszedl element chrome '
          + 'harnessu, ktory do materialu audytowego nie nalezy.',
      ).toBe(true);
    }
  });
});
