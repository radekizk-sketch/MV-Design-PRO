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
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('screenshot-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/sld_audyt');

const POZIOMY = [0, 1, 2] as const;
const MOTYWY = ['light', 'dark'] as const;

/**
 * Kadry SZCZEGOLU (V12K-234). Powiekszenie robi KAMERA, zeby declutter przestal ukrywac
 * etykiety (prog czytelnosci liczony w pikselach EKRANU — `MIN_READABLE_LABEL_SCREEN_PX`);
 * Playwright tylko wycina obszar 960x540 w skali 1:1.
 *
 * `kotwica` to SYMBOL (nie napis), na ktorym kadr jest namierzany pomiarem — napisow
 * przy kadrze calej sieci namierzyc SIE NIE DA, bo declutter ich w ogole nie renderuje
 * (to wlasnie jest badane zjawisko). `napisyWymagane` sprawdza sie dopiero PO
 * powiekszeniu: kazdy z tych fragmentow musi lezec CALY w kadrze. Pierwsza wersja
 * liczyla kadr ze zgadnietych wspolrzednych gestu i uciela lewa krawedz opisu GPZ
 * („″ 250 MVA" bez „Sk”), a rozmiar pliku 960x540 tego nie wykrywal.
 */
const OBSZARY_SZCZEGOLU = [
  {
    nazwa: 'rozdzielnia GPZ (110/15 kV)',
    plik: 'gpz',
    kotwica: '[data-testid="sld-v3-gpz-zone"]',
    napisyWymagane: ['GPZ Referencyjny', 'MVA'],
    // Siedem krokow, nie osiem: przy osmiu obszar zainteresowania rosl do 1173x1265 px,
    // czyli WYZSZY niz widok — bramka kadru to zmierzyla i odrzucila.
    krokiKolka: 6,
  },
  {
    // Druga stacja na magistrali — szyna SN stacji jest symbolem obecnym w kazdej skali.
    nazwa: 'stacja na magistrali z polami',
    plik: 'stacja',
    kotwica: '[data-owner-ref$="/station#sn-bus"] >> nth=1',
    // NAPRAWA (karta TESTY-DRYF-E2E poz. 5, 2026-08-12): etykieta pola SN nie
    // niesie dziś słowa „pole" wprost — render pokazuje kod pola + rodzaj
    // gałęzi („F01 · liniowe", „F02 · liniowe"...), więc fragment „pole" nie
    // pasował do ŻADNEGO napisu w całej kanwie i sonda `napisPrzyKotwicy`
    // dostawała `null` (declutter nie ukrywał niczego — etykiety o tej treści
    // po prostu nie istnieją). „liniowe" jest częścią KAŻDEJ etykiety pola na
    // tym zrzucie — dowodzi obecności pól tak samo, jak dawny fragment miał
    // dowodzić.
    napisyWymagane: ['Stacja', 'kVA', 'liniowe'],
    krokiKolka: 8,
  },
] as const;

/**
 * Kadr = CALY widok w skali 1:1. Wycinek 960x540 byl za maly: obszar zainteresowania
 * (symbol + jego opisy) mierzy przy uzytecznym powiekszeniu ok. 800-1300 px, wiec albo
 * kadr ucinal opis, albo trzeba bylo zjechac z powiekszeniem do granicy czytelnosci.
 */
const WIDOK = { szerokosc: 1920, wysokosc: 1080 } as const;

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
   * (realne gesty kolkiem i przeciagniecia, patrz nizej), a Playwright tylko kadruje.
   *
   * KADR JEST MIERZONY, NIE ZGADYWANY. Zoom jest kotwiczony na kursorze
   * (`SldCanvasV3.handleWheel`), a wspolczynnik rosnie wykladniczo — przy osmiu krokach
   * jeden piksel roznicy w punkcie gestu przesuwa obraz o kilkanascie pikseli. Dlatego
   * po powiekszeniu MIERZE polozenie napisu-kotwicy i dosuwam go do srodka realnym
   * przeciagnieciem, a na koniec ASERTUJE, ze caly miesci sie w kadrze. Bez tej asercji
   * kadr moze uciac opis i nadal miec poprawny rozmiar pliku — tak wlasnie stracilem
   * „Sk” z „Sk″ 250 MVA" w pierwszej wersji.
   */
  for (const obszar of OBSZARY_SZCZEGOLU) {
    test(`szczegol L2: ${obszar.nazwa}`, async ({ page }) => {
      await page.setViewportSize({ width: WIDOK.szerokosc, height: WIDOK.wysokosc });
      const bledy = await otworzKanwe(page, 2, 'dark');

      const kotwica = page.locator(obszar.kotwica);
      await expect(
        kotwica,
        `brak symbolu-kotwicy ${obszar.kotwica} — kadru nie da sie namierzyc`,
      ).toBeAttached();

      const srodekKotwicy = async (): Promise<{ x: number; y: number }> => {
        const pole = await kotwica.boundingBox();
        if (!pole) throw new Error(`symbol ${obszar.kotwica} bez geometrii`);
        return { x: pole.x + pole.width / 2, y: pole.y + pole.height / 2 };
      };

      // (1) POWIEKSZENIE realnym gestem kolka, kotwiczone na symbolu. Kanwa nasluchuje
      // `wheel` natywnie (`passive: false`), wiec to ta sama sciezka, ktora ma projektant.
      // Wymuszony stan kamery albo parametr harnessu obszedlby ja — a defekt moze siedziec
      // wlasnie w niej (CLAUDE.md Zero-Debt pkt 5; precedens martwego lewego klika).
      // Re-kotwiczenie w kazdym kroku: kursor na symbolu utrzymuje go w miejscu.
      for (let krok = 0; krok < obszar.krokiKolka; krok += 1) {
        const punkt = await srodekKotwicy();
        await page.mouse.move(punkt.x, punkt.y);
        await page.mouse.wheel(0, -240);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(300);

      // (2) DOSUNIECIE realnym przeciagnieciem (pointerdown + ruch = pan kanwy).
      // Srodkiem kadru jest SRODEK OBSZARU ZAINTERESOWANIA, czyli obwiednia symbolu
      // i wszystkich wymaganych opisow — nie sam symbol. Opis stacji lezy kilkaset
      // pikseli od szyny SN, wiec dosuniecie samego symbolu wypychalo opis za kadr
      // (pomiar: napis GPZ na y = -70 przy kadrze od y = 270).
      // Opis nalezacy DO TEGO obiektu, czyli NAJBLIZSZY kotwicy. `.first()` bralo pierwszy
      // w DOM — przy 52 stacjach byl to opis innej stacji i obwiednia rozlazila sie na
      // 4430 px (pomiar). Blisko kotwicy = ten sam obiekt.
      const napisPrzyKotwicy = async (fragment: string) => {
        const punkt = await srodekKotwicy();
        return page.evaluate(
          ({ tekst, cx, cy }) => {
            const pasujace = Array.from(
              document.querySelectorAll('[data-testid="sld-canvas-v3"] text'),
            ).filter((el) => (el.textContent ?? '').includes(tekst));
            let najlepszy: { x: number; y: number; width: number; height: number } | null = null;
            let najblizej = Number.POSITIVE_INFINITY;
            for (const el of pasujace) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue;
              const d = (r.x + r.width / 2 - cx) ** 2 + (r.y + r.height / 2 - cy) ** 2;
              if (d < najblizej) {
                najblizej = d;
                najlepszy = { x: r.x, y: r.y, width: r.width, height: r.height };
              }
            }
            return najlepszy;
          },
          { tekst: fragment, cx: punkt.x, cy: punkt.y },
        );
      };

      const obwiedniaObszaru = async () => {
        const pola = [await kotwica.boundingBox()];
        for (const fragment of obszar.napisyWymagane) {
          pola.push(await napisPrzyKotwicy(fragment));
        }
        const obecne = pola.filter((p): p is NonNullable<typeof p> => p !== null);
        const x1 = Math.min(...obecne.map((p) => p.x));
        const y1 = Math.min(...obecne.map((p) => p.y));
        const x2 = Math.max(...obecne.map((p) => p.x + p.width));
        const y2 = Math.max(...obecne.map((p) => p.y + p.height));
        return { x1, y1, x2, y2, srodekX: (x1 + x2) / 2, srodekY: (y1 + y2) / 2 };
      };

      const obszarPrzed = await obwiedniaObszaru();
      const dx = WIDOK.szerokosc / 2 - obszarPrzed.srodekX;
      const dy = WIDOK.wysokosc / 2 - obszarPrzed.srodekY;
      // Przeciagniecie w kilku ratach: jeden gest nie moze wyjsc poza widok, a dosuniecie
      // bywa dluzsze niz przekatna ekranu (opis stacji byl 1400 px od srodka).
      const KROK_MAX = 700;
      const raty = Math.max(Math.ceil(Math.abs(dx) / KROK_MAX), Math.ceil(Math.abs(dy) / KROK_MAX), 1);
      for (let rata = 0; rata < raty; rata += 1) {
        const ratX = dx / raty;
        const ratY = dy / raty;
        const startX = ratX < 0 ? WIDOK.szerokosc - 100 : 100;
        const startY = ratY < 0 ? WIDOK.wysokosc - 100 : 100;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + ratX, startY + ratY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(300);

      // Przeciągnięcie to gest KAMERY: nie może zaznaczyć napisów schematu (V12K-235).
      // Przed naprawą zostawiało niebieskie podświetlenie na całej tabliczce stacji —
      // widoczne na zrzucie audytu. To jest dowód na REALNEJ ścieżce; test jednostkowy
      // kanwy pilnuje tylko deklaracji `userSelect`, bo jsdom nie ma zaznaczania.
      const zaznaczenie = await page.evaluate(() => window.getSelection()?.toString() ?? '');
      expect(
        zaznaczenie,
        'przeciągnięcie kanwy zaznaczyło tekst rysunku — podświetlenie selekcji '
          + `wchodzi na schemat (zaznaczono: „${zaznaczenie.slice(0, 80)}")`,
      ).toBe('');

      const kadr = { x: 0, y: 0, width: WIDOK.szerokosc, height: WIDOK.wysokosc };

      // (3) BRAMKA CZYTELNOSCI: kazdy wymagany fragment opisu musi ISTNIEC (declutter go
      // odslonil) i lezec CALY w kadrze. To jest wlasciwa kontrola tego materialu —
      // rozmiar pliku nic nie mowi o tym, czy opis da sie przeczytac.
      const obszarPo = await obwiedniaObszaru();
      expect(
        obszarPo.x2 - obszarPo.x1 <= kadr.width && obszarPo.y2 - obszarPo.y1 <= kadr.height,
        `obszar zainteresowania jest wiekszy niz kadr: `
          + `${Math.round(obszarPo.x2 - obszarPo.x1)}x${Math.round(obszarPo.y2 - obszarPo.y1)} `
          + `vs ${kadr.width}x${kadr.height}. Zmniejsz \`krokiKolka\` dla „${obszar.nazwa}".`,
      ).toBe(true);

      for (const fragment of obszar.napisyWymagane) {
        const p = await napisPrzyKotwicy(fragment);
        expect(
          p,
          `po powiekszeniu brak opisu „${fragment}" — declutter go nie odslonil, `
            + 'wiec kadr nie pokazuje poziomu L2',
        ).not.toBeNull();
        const g = p!;
        expect(
          g.x >= kadr.x && g.y >= kadr.y
            && g.x + g.width <= kadr.x + kadr.width
            && g.y + g.height <= kadr.y + kadr.height,
          `opis „${fragment}" wychodzi za kadr: napis `
            + `[${Math.round(g.x)},${Math.round(g.y)},${Math.round(g.width)}x${Math.round(g.height)}] `
            + `vs kadr [${kadr.x},${kadr.y},${kadr.width}x${kadr.height}]. Uciety opis nie jest `
            + 'materialem audytu — zmniejsz `krokiKolka` albo przesun kotwice.',
        ).toBe(true);
      }

      await page.screenshot({
        path: path.join(OUTPUT_DIR, `sld_szczegol_${obszar.plik}.png`),
        clip: kadr,
      });

      expect(bledy, `bledy konsoli przy szczegole ${obszar.nazwa}: ${bledy.join(' | ')}`).toEqual([]);
    });
  }

  /**
   * V12K-234 → KOREKTA KANONU (naprawa regresji CI-D, 2026-09-04): ten
   * niezmiennik zakładał „kanwa v3 ma STAŁE tło techniczne, rysunek NIE
   * reaguje na motyw" — prawdziwe DO karty KD-8. Właściciel rozstrzygnął
   * inaczej (KD-8 §0.1, `docs/v12xx/REJESTR_KONFLIKTOW.md`): „paleta KAŻDEJ
   * powierzchni, łącznie z kanwą, idzie z motywu" — `ui/sld/v3/theme/
   * palette.ts::sldPaletteForTheme` daje dziś DWIE różne palety
   * (`DARK_SCADA_SLD_PALETTE` / `LIGHT_TECHNICAL_SLD_PALETTE`), a
   * `SldCanvasV3.tsx` czyta ją z `effectiveThemeMode` — dawna decyzja
   * „SCADA-dark zawsze" jest tym NADPISANA. Zmierzone bezpośrednio (ta karta,
   * L0/L1/L2): tło, rama arkusza i etykiety zamieniają jasność/kolor między
   * motywami; WYŁĄCZNIE rodzina barw klasy napięcia (SN zielony) zostaje —
   * dokładnie kontrakt semantyki z `palette.ts` („wolno zmienić jasność, NIE
   * WOLNO zmienić przypisania barw do klas"). Ten sam klasowy błąd (asercja
   * niezmienniczości motywu przeterminowana KD-8) już raz naprawiono w
   * `creator-screenshot.spec.ts` (rejestr `BUGI-PRODUKTU-E2E`, poz. 2) —
   * TA kanwa dostała analogiczną poprawkę wtedy pominiętą.
   *
   * Głębszy niezmiennik (geometria sceny NIEZALEŻNA od palety, rodzina barw
   * NIEZMIENNA między motywami) ma już dedykowaną, wiążącą bramkę CI:
   * `ui/sld/v3/theme/__tests__/palette.test.ts` („determinizm geometrii
   * NIEZALEŻNY od motywu" + „SEMANTYKA klas napięć jest kontraktem") —
   * jest w liście testów krytycznych `sld-determinism.yml`. Rolą TEGO testu
   * zostaje więc pilnowanie, że materiał audytowy „light"/„dark" NIE jest
   * duplikatem w bajtach — inaczej motyw przestał realnie dotrzeć do kanwy
   * (dokładnie regresja odwrotna do tej, którą łapał stary niezmiennik).
   */
  test('niezmiennik: kanwa techniczna REAGUJE na motyw (KD-8) — para zrzutów RÓŻNA', () => {
    for (const lod of POZIOMY) {
      const jasny = fs.readFileSync(path.join(OUTPUT_DIR, `sld_L${lod}_light.png`));
      const ciemny = fs.readFileSync(path.join(OUTPUT_DIR, `sld_L${lod}_dark.png`));

      expect(
        jasny.equals(ciemny),
        `L${lod}: zrzuty jasny/ciemny są BAJTOWO IDENTYCZNE, a KD-8 wymaga, żeby `
          + 'paleta kanwy szła z motywu (`ui/sld/v3/theme/palette.ts::sldPaletteForTheme`). '
          + 'Albo kanwa wróciła do zaszytej palety SCADA-dark (regresja KD-8 — sprawdź '
          + '`effectiveThemeMode`/`useSldPalette` w `SldCanvasV3.tsx`), albo `screenshot-'
          + 'harness-main.tsx` przestał ustawiać `data-theme` przed renderem.',
      ).toBe(false);
    }
  });
});
