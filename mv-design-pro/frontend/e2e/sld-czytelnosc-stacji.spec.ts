/**
 * KARTA SLD-CZYTELNOSC-STACJI — czytelność widoku stacji w ŻYWEJ aplikacji, ścieżką
 * NATYWNĄ (dwuklik, klik + przycisk, kółko myszy Playwrighta; bez zdarzeń syntetycznych).
 *
 * Właściciel ocenił widok stacji na 0/10 (2026-11-11): nie widać toru prądowego, opisy są
 * ukryte („Ukryto 14 opisów — przybliż”), odpływy biegną 5 px od siebie, a pasek narzędzi
 * zawija etykiety i wypada za kanwę. Widok stacji ma być czytelny przy KAŻDEJ drodze dojścia,
 * nie tylko w jednym trybie kadru — dlatego spec ćwiczy iloczyn cech:
 *
 *   droga dojścia {dwuklik nazwy stacji, klik nazwy + „Dopasuj widok”, przybliżanie kółkiem}
 *   × okno {1440×900, 1280×720} × motyw {ciemny, jasny}
 *   × stacja {odgałęźna, przelotowa (sekcyjna wcięta w magistralę), końcowa, GPZ}.
 *
 * Kryteria (pomiar z DOM kanwy, w pikselach EKRANU):
 *  - 0 opisów ukrytych w kadrze (`data-ukryte-opisy-w-kadrze`: ukryte progiem, sufitem
 *    proporcji albo brakiem miejsca, których slot leży w widocznym obszarze kanwy);
 *  - każdy narysowany opis w obszarze ma pismo ≥ 9 px ekranu;
 *  - odstęp sąsiednich równoległych tras (odpływów) w obszarze ≥ `MIN_ODSTEP_TRAS_PX`;
 *  - zacisk nN stacji ≥ `MIN_ZACISK_NN_SWIAT` × skala kadru (portal nN z marginesem);
 *  - „Dopasuj widok” daje ten sam kadr co dwuklik (skala i poziom szczegółu);
 *  - żaden przycisk paska narzędzi kanwy nie zawija etykiety i nie wychodzi poza kanwę;
 *  - w kadrze stacji (dwuklik, „Dopasuj widok”) każdy odpływ wychodzący za ramkę ma znak
 *    kontynuacji z nazwą celu („dalej: …”), opis ≥ 9 px i cały w widocznym obszarze kanwy.
 *
 * Asercje są MIĘKKIE (`expect.soft`): bieg zbiera pomiar całego iloczynu i zapisuje go do
 * `pomiary-<okno>-<motyw>.json` obok zrzutów — ten sam spec dał pomiar „przed” (na drzewie
 * sprzed karty) i dowodzi stanu „po”. Zrzuty 1440×900 w obu motywach (materiał oceny
 * właściciela, bramka B-02 — spec NIE ocenia wyglądu): `docs/uiux/zrzuty/sld-czytelnosc-stacji`
 * przez `katalogZrzutow` (`E2E_KATALOG_ZRZUTOW` kieruje je do innego katalogu, np. `…/przed`).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { otworzAplikacje, siecKadrow, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG = katalogZrzutow(
  process.env.E2E_KATALOG_ZRZUTOW
    ? resolve(process.env.E2E_KATALOG_ZRZUTOW)
    : resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'sld-czytelnosc-stacji', 'po'),
);

/** Próg czytelności pisma [px ekranu] — `MIN_READABLE_LABEL_SCREEN_PX` (`core/text.ts`). */
const MIN_OPIS_PX = 9;
/** Najmniejszy odstęp sąsiednich równoległych tras [px ekranu]: dwie kreski toru o grubości
 *  ~2 px muszą mieć między sobą wyraźne światło (≥ 3 grubości) — inaczej zlewają się w jedną. */
const MIN_ODSTEP_TRAS_PX = 8;
/** Najmniejsza długość zacisku nN [j.św.]: szyna, a nie kreska — szerokość portalu nN
 *  (`LV_PORTAL_WIDTH` = 32) i krok siatki z każdej strony (`LV_TERMINAL_MIN_HALF` = 24,
 *  `layout/measure.ts`). Kryterium karty jest proporcją do portalu, więc na ekranie
 *  porównujemy z tą długością razy skala kadru (pierwsza wersja specu miała próg bezwzględny
 *  24 px, wyprowadzony z założonej skali ~0,6 — przy kadrze stacji odgałęźnej w oknie
 *  1280×720 skala wynosi 0,451, a zacisk 48 j.św. ma tam 21,7 px). */
const MIN_ZACISK_NN_SWIAT = 48;

const OKNA = [
  { klucz: '1440x900', width: 1440, height: 900, zrzuty: true },
  { klucz: '1280x720', width: 1280, height: 720, zrzuty: false },
] as const;
const MOTYWY = [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
] as const;
const STACJE_CZYTELNOSCI = [
  { nazwa: 'Stacja Odgałęźna', plik: 'odgalezna' },
  { nazwa: 'Stacja Sekcyjna', plik: 'przelotowa' },
  { nazwa: 'Stacja Końcowa', plik: 'koncowa' },
  { nazwa: 'GPZ', plik: 'gpz' },
] as const;
type Droga = 'dwuklik' | 'dopasuj' | 'kolko';
const DROGI: readonly Droga[] = ['dwuklik', 'dopasuj', 'kolko'];

interface PomiarWidoku {
  readonly skala: number;
  readonly lod: string | null;
  readonly ukryteRazem: number;
  /** `null` = kanwa nie wystawia kanału (drzewo sprzed karty). */
  readonly ukryteWKadrze: number | null;
  readonly komunikat: string | null;
  readonly opisyWObszarze: number;
  readonly minOpisPx: number | null;
  readonly opisyPonizejProgu: readonly string[];
  readonly minOdstepTrasPx: number | null;
  readonly paraTras: string | null;
  readonly zaciskNnPx: number | null;
  readonly przyciskiZawiniete: readonly string[];
  readonly przyciskiPozaKanwa: readonly string[];
  /** Znaki kontynuacji odpływów kadru (`sld-v3-odejscie-kadru`). */
  readonly odejscia: readonly string[];
  readonly minOpisOdejsciaPx: number | null;
  readonly odejsciaPozaObszarem: readonly string[];
}

async function viewBox(page: Page): Promise<string | null> {
  return page.getByTestId('sld-canvas-v3').getAttribute('viewBox');
}

async function kadrUstalony(page: Page): Promise<void> {
  let poprzedni = await viewBox(page);
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(250);
    const biezacy = await viewBox(page);
    if (biezacy === poprzedni) return;
    poprzedni = biezacy;
  }
}

async function wrocDoSieci(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+F');
  await expect(page.getByTestId('sld-v3-sciezka-kadru')).toHaveCount(0);
  await kadrUstalony(page);
}

/** Uchwyt nazwy stacji (wiersz pasma nazw) — dla GPZ wiersz nazwy bloku GPZ. */
function uchwytNazwy(page: Page, ref: string) {
  return page.locator(`[data-hit-role="obrys"][data-hit-owner-ref^="${ref}#name-row"]`).first();
}

async function dojdz(page: Page, droga: Droga, ref: string): Promise<void> {
  await wrocDoSieci(page);
  const uchwyt = uchwytNazwy(page, ref);
  await expect(uchwyt).toHaveCount(1, { timeout: 30000 });
  if (droga === 'dwuklik') {
    await uchwyt.dblclick();
    await expect(page.getByTestId('sld-v3-sciezka-kadru')).toBeVisible({ timeout: 10000 });
  } else if (droga === 'dopasuj') {
    await uchwyt.click();
    // Przy wąskiej kanwie (okno 1280×720 z otwartym inspektorem) polecenia kadru mogą
    // być zwinięte do menu „Narzędzia” — droga projektanta: rozwinąć menu, kliknąć.
    const dopasujWidok = page.getByTestId('sld-v3-fit-view');
    const zMenu = !(await dopasujWidok.isVisible());
    if (zMenu) await page.getByTestId('sld-v3-toolbar-menu-toggle').click();
    await dopasujWidok.click();
    if (zMenu && (await page.getByTestId('sld-v3-toolbar-menu').isVisible())) {
      await page.getByTestId('sld-v3-toolbar-menu-toggle').click();
    }
  } else {
    const box = await uchwyt.boundingBox();
    expect(box, 'uchwyt nazwy stacji na ekranie').not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    // Kółko do pierwszego poziomu szczegółu stacji (L1) — najmniejsza skala robocza,
    // przy której projektant ogląda pola: najtrudniejszy przypadek czytelności.
    for (let i = 0; i < 40; i += 1) {
      if ((await page.getByTestId('sld-canvas-v3').getAttribute('data-scene-lod')) !== '0') break;
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(60);
    }
    await expect(page.getByTestId('sld-canvas-v3')).not.toHaveAttribute('data-scene-lod', '0');
  }
  await kadrUstalony(page);
}

async function zmierz(page: Page, ref: string): Promise<PomiarWidoku> {
  return page.evaluate(
    ({ ref, progOpisu }) => {
      const svg = document.querySelector<SVGSVGElement>('[data-testid="sld-canvas-v3"]')!;
      const kanwa = svg.getBoundingClientRect();
      const pasek = document.querySelector('[data-testid="sld-v3-toolbar"]')?.getBoundingClientRect();
      const sciezka = document.querySelector('[data-testid="sld-v3-sciezka-kadru"]')?.getBoundingClientRect();
      const gora = Math.max(kanwa.top, pasek ? pasek.bottom : kanwa.top, sciezka ? sciezka.bottom : kanwa.top);
      const obszar = { left: kanwa.left, top: gora, right: kanwa.right, bottom: kanwa.bottom - 40 };
      const wObszarze = (r: { left: number; top: number; right: number; bottom: number }) =>
        r.right > obszar.left && r.left < obszar.right && r.bottom > obszar.top && r.top < obszar.bottom;
      const ctm = svg.getScreenCTM()!;
      const skala = Math.hypot(ctm.a, ctm.b);
      const etykiety = svg.querySelector('[data-testid="sld-v3-labels"]');
      const opisyPonizejProgu: string[] = [];
      let minOpisPx: number | null = null;
      let opisyWObszarze = 0;
      for (const t of Array.from(etykiety?.querySelectorAll('text') ?? [])) {
        if (t.closest('[data-kadr="poza"]')) continue;
        const r = t.getBoundingClientRect();
        if (r.width === 0 || !wObszarze(r)) continue;
        opisyWObszarze += 1;
        const px = Number(t.getAttribute('font-size')) * skala;
        if (minOpisPx === null || px < minOpisPx) minOpisPx = px;
        if (px < progOpisu - 1e-6) opisyPonizejProgu.push(`${t.textContent} (${px.toFixed(1)} px)`);
      }
      // Trasy: odcinki toru (ścieżki z `data-owner-ref`, bez warstwy trafień) w obszarze.
      type Odc = { o: string; x1: number; y1: number; x2: number; y2: number };
      const poziome: Odc[] = [];
      const pionowe: Odc[] = [];
      for (const p of Array.from(svg.querySelectorAll<SVGPathElement>('path[data-owner-ref]'))) {
        if (p.hasAttribute('data-hit-role') || p.closest('[data-testid="sld-v3-labels"]') || p.closest('[data-kadr="poza"]')) continue;
        const o = p.getAttribute('data-owner-ref') ?? '';
        // Parser ścieżki SVG (M/L/H/V/A/Z, bezwzględne i względne): łuk mostka na
        // skrzyżowaniu (`A`) łączy dwa punkty TEJ SAMEJ prostej — liczony jak odcinek
        // (dawniej ścieżki z łukiem były pomijane i para tras 6 px uszła pomiarowi).
        const d = p.getAttribute('d') ?? '';
        if (/[CcQqSsTt]/.test(d)) continue;
        const tokeny = d.match(/[MLHVAZmlhvaz]|-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? [];
        const swiat: { x: number; y: number }[] = [];
        let cx = 0;
        let cy = 0;
        let cmd = 'M';
        for (let i = 0; i < tokeny.length; ) {
          if (/[A-Za-z]/.test(tokeny[i])) {
            cmd = tokeny[i];
            i += 1;
            if (cmd === 'Z' || cmd === 'z') continue;
          }
          const wzgl = cmd === cmd.toLowerCase();
          const n = (k: number) => Number(tokeny[i + k]);
          const C = cmd.toUpperCase();
          if (C === 'M' || C === 'L') {
            cx = (wzgl ? cx : 0) + n(0);
            cy = (wzgl ? cy : 0) + n(1);
            i += 2;
          } else if (C === 'H') {
            cx = (wzgl ? cx : 0) + n(0);
            i += 1;
          } else if (C === 'V') {
            cy = (wzgl ? cy : 0) + n(0);
            i += 1;
          } else if (C === 'A') {
            cx = (wzgl ? cx : 0) + n(5);
            cy = (wzgl ? cy : 0) + n(6);
            i += 7;
          } else {
            i += 1;
            continue;
          }
          swiat.push({ x: cx, y: cy });
        }
        const pkt = swiat.map((q) => ({ x: ctm.a * q.x + ctm.c * q.y + ctm.e, y: ctm.b * q.x + ctm.d * q.y + ctm.f }));
        for (let i = 0; i + 1 < pkt.length; i += 1) {
          const a = pkt[i];
          const b = pkt[i + 1];
          const r = { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) };
          if (!wObszarze({ ...r, right: r.right + 0.5, bottom: r.bottom + 0.5 })) continue;
          if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 4) poziome.push({ o, x1: r.left, x2: r.right, y1: a.y, y2: a.y });
          else if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 4) pionowe.push({ o, x1: a.x, x2: a.x, y1: r.top, y2: r.bottom });
        }
      }
      let minOdstep: number | null = null;
      let paraTras: string | null = null;
      const porownaj = (lista: Odc[], poziomo: boolean) => {
        for (let i = 0; i < lista.length; i += 1) {
          for (let j = i + 1; j < lista.length; j += 1) {
            const a = lista[i];
            const b = lista[j];
            if (a.o === b.o) continue;
            const [a1, a2, b1, b2] = poziomo ? [a.x1, a.x2, b.x1, b.x2] : [a.y1, a.y2, b.y1, b.y2];
            const zakladka = Math.min(a2, b2) - Math.max(a1, b1);
            if (zakladka < 12) continue;
            const odstep = poziomo ? Math.abs(a.y1 - b.y1) : Math.abs(a.x1 - b.x1);
            if (odstep < 0.5) continue;
            if (minOdstep === null || odstep < minOdstep) {
              minOdstep = odstep;
              paraTras = `${a.o} | ${b.o}`;
            }
          }
        }
      };
      porownaj(poziome, true);
      porownaj(pionowe, false);
      // Zacisk nN stacji: długość odcinka `<stacja>#lv-bus` na ekranie.
      let zaciskNnPx: number | null = null;
      for (const p of Array.from(svg.querySelectorAll<SVGPathElement>(`path[data-owner-ref="${ref}#lv-bus"]`))) {
        if (p.hasAttribute('data-hit-role')) continue;
        const r = p.getBoundingClientRect();
        const dl = Math.max(r.width, r.height);
        zaciskNnPx = Math.max(zaciskNnPx ?? 0, dl);
      }
      const przyciskiZawiniete: string[] = [];
      const przyciskiPozaKanwa: string[] = [];
      for (const b of Array.from(document.querySelectorAll<HTMLElement>('[data-testid="sld-v3-toolbar"] button'))) {
        const r = b.getBoundingClientRect();
        if (r.width === 0) continue;
        const nazwa = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
        const linia = parseFloat(getComputedStyle(b).lineHeight) || 14;
        if (b.scrollWidth > b.clientWidth + 1 || r.height > 2 * linia + 4) przyciskiZawiniete.push(nazwa);
        if (r.right > kanwa.right + 0.5 || r.left < kanwa.left - 0.5) przyciskiPozaKanwa.push(nazwa);
        // Wysokość jednej linii: zawinięcie podwaja liczbę wierszy treści przycisku.
        const range = document.createRange();
        range.selectNodeContents(b);
        const wiersze = new Set(Array.from(range.getClientRects()).map((q) => Math.round(q.top)));
        if (wiersze.size > 1 && !przyciskiZawiniete.includes(nazwa)) przyciskiZawiniete.push(nazwa);
      }
      const odejscia: string[] = [];
      const odejsciaPozaObszarem: string[] = [];
      let minOpisOdejsciaPx: number | null = null;
      for (const g of Array.from(svg.querySelectorAll('[data-testid="sld-v3-odejscie-kadru"]'))) {
        const t = g.querySelector('text');
        const tekst = t?.textContent ?? '';
        odejscia.push(tekst);
        const px = Number(t?.getAttribute('font-size') ?? 0) * skala;
        if (minOpisOdejsciaPx === null || px < minOpisOdejsciaPx) minOpisOdejsciaPx = px;
        const r = g.getBoundingClientRect();
        if (r.left < obszar.left - 0.5 || r.right > obszar.right + 0.5 || r.top < obszar.top - 0.5 || r.bottom > obszar.bottom + 0.5) {
          odejsciaPozaObszarem.push(tekst);
        }
      }
      const warstwa = etykiety as HTMLElement | null;
      const ukryte = Number(warstwa?.getAttribute('data-hidden-unreadable') ?? 0) + Number(warstwa?.getAttribute('data-dropped-identity') ?? 0);
      const wKadrze = warstwa?.getAttribute('data-ukryte-opisy-w-kadrze');
      return {
        skala,
        lod: svg.getAttribute('data-scene-lod'),
        ukryteRazem: ukryte,
        ukryteWKadrze: wKadrze == null ? null : Number(wKadrze),
        komunikat: document.querySelector('[data-testid="sld-v3-hidden-labels-hint"]')?.textContent ?? null,
        opisyWObszarze,
        minOpisPx,
        opisyPonizejProgu,
        minOdstepTrasPx: minOdstep,
        paraTras,
        zaciskNnPx,
        przyciskiZawiniete,
        przyciskiPozaKanwa,
        odejscia,
        minOpisOdejsciaPx,
        odejsciaPozaObszarem,
      };
    },
    { ref, progOpisu: MIN_OPIS_PX },
  );
}

for (const okno of OKNA) {
  for (const motyw of MOTYWY) {
    test(`Czytelność widoku stacji — ${okno.klucz}, motyw ${motyw.klucz}`, async ({ page, request }) => {
      test.setTimeout(900000);
      mkdirSync(KATALOG, { recursive: true });
      const seed = await siecKadrow(request);
      const refStacji = new Map((seed.enm.substations ?? []).map((s) => [String(s.name), s.ref_id] as const));
      const gpz = (seed.enm.substations ?? []).find((s) => s.station_type === 'gpz');
      await otworzAplikacje(page, seed, { width: okno.width, height: okno.height }, motyw.theme);
      await ustawMotyw(page, motyw.theme);
      const pomiary: Record<string, PomiarWidoku> = {};
      for (const stacja of STACJE_CZYTELNOSCI) {
        const ref = stacja.plik === 'gpz' ? gpz?.ref_id : refStacji.get(stacja.nazwa);
        expect(ref, `stacja ${stacja.nazwa} w modelu`).toBeTruthy();
        for (const droga of DROGI) {
          await dojdz(page, droga, ref!);
          const pomiar = await zmierz(page, ref!);
          const klucz = `${stacja.plik}-${droga}`;
          pomiary[klucz] = pomiar;
          if (okno.zrzuty) await page.screenshot({ path: resolve(KATALOG, `${klucz}-${motyw.klucz}.png`) });
          const opis = `${okno.klucz} ${motyw.klucz} ${klucz}`;
          expect.soft(pomiar.ukryteWKadrze, `${opis}: opisy ukryte w kadrze`).toBe(0);
          expect.soft(pomiar.opisyPonizejProgu, `${opis}: opisy poniżej ${MIN_OPIS_PX} px`).toEqual([]);
          expect.soft(pomiar.minOdstepTrasPx ?? Infinity, `${opis}: odstęp tras (${pomiar.paraTras})`).toBeGreaterThanOrEqual(MIN_ODSTEP_TRAS_PX);
          if (stacja.plik !== 'gpz') {
            expect.soft(pomiar.zaciskNnPx ?? 0, `${opis}: zacisk nN`).toBeGreaterThanOrEqual(MIN_ZACISK_NN_SWIAT * pomiar.skala - 0.5);
          }
          expect.soft(pomiar.przyciskiZawiniete, `${opis}: przyciski paska zawinięte`).toEqual([]);
          expect.soft(pomiar.przyciskiPozaKanwa, `${opis}: przyciski paska poza kanwą`).toEqual([]);
          if (droga === 'dopasuj') {
            // Karta (A): „Dopasuj widok” = dwuklik — ten sam kadr (skala i poziom szczegółu).
            const dwuklik = pomiary[`${stacja.plik}-dwuklik`];
            expect.soft(pomiar.lod, `${opis}: poziom jak po dwukliku`).toBe(dwuklik?.lod);
            expect.soft(pomiar.skala, `${opis}: skala jak po dwukliku`).toBeCloseTo(dwuklik?.skala ?? NaN, 3);
          }
          if (droga !== 'kolko') {
            expect.soft(pomiar.odejscia.length, `${opis}: znaki kontynuacji odpływów`).toBeGreaterThan(0);
            expect.soft(pomiar.odejscia.every((t) => /^dalej: .+/.test(t)), `${opis}: opis odejścia z nazwą celu`).toBe(true);
            expect.soft(pomiar.minOpisOdejsciaPx ?? 0, `${opis}: pismo opisu odejścia`).toBeGreaterThanOrEqual(MIN_OPIS_PX);
            expect.soft(pomiar.odejsciaPozaObszarem, `${opis}: odejścia poza kadrem`).toEqual([]);
          }
        }
      }
      writeFileSync(resolve(KATALOG, `pomiary-${okno.klucz}-${motyw.klucz}.json`), `${JSON.stringify(pomiary, null, 2)}\n`);
    });
  }
}
