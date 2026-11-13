/**
 * B-02 właściciela 2026-11-13 — MACIERZ SKALI i POMIAR NAWIGACJI na REALNYM backendzie, ścieżką
 * natywną (kółko, klawisze i kliki Playwrighta w żywej aplikacji).
 *
 * 1. Macierz zrzutów: skala {30, 45, 60, 100, 200 %} × okno {1440×900, 1280×720} × motyw {jasny,
 *    ciemny} × inspektor {zamknięty, otwarty} × cel {cała sieć, stacja, pole} — każdy zrzut ma
 *    w polu widzenia rzeczywisty obiekt (nazwa pliku mówi, jaki cel i jaka skala); asercja: skala
 *    kamery osiągnięta (albo dolny kraniec skali, jawnie w nazwie pliku), środek celu w wolnej
 *    kanwie. Przejście poziomów szczegółu LOD0 → LOD1 → LOD2 kółkiem nad zaznaczoną stacją:
 *    zaznaczenie i ekranowy środek stacji bez zmian (P1-02), napisy narysowane czytelne (≥ 9 px).
 * 2. Pomiar (P1-05) na sieci wzorcowej 52 stacji (`sldSubstrate52s`). Model trafia do aplikacji
 *    KOŃCÓWKĄ IMPORTU ARCHIWUM (`POST /api/projects/import`) — `PUT …/enm` jest w trybie
 *    produkcyjnym wyłączony (`api/enm.py`, `_PRODUCTION_DISABLED_ROUTE_KEYS`): archiwum
 *    wyeksportowanego projektu (`POST /api/projects/{id}/export`) dostaje migawkę fikstury w miejsce
 *    swojej i wraca importem bez weryfikacji odcisków (odciski liczy eksporter, a migawka jest
 *    podmieniona); reszta drogi — otwarcie aplikacji, kanwa, polecenia — natywna. Opóźnienie poleceń nawigacji (kółko, Shift+1, przelot) od wejścia
 *    do pierwszej klatki z nowym kadrem, stabilność skali (kółko tam i z powrotem wraca do tej
 *    samej skali), czytelność napisów po zmianie poziomu szczegółu, liczba węzłów DOM kanwy.
 *    Wynik — `test-results/pomiar-nawigacji-52.json` i komunikat testu; liczby trafiają do
 *    kontraktu `docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md` i wiersza PLANS.md.
 *
 * Spec nie ocenia wyglądu (werdykt B-02 należy do właściciela). Zrzuty: `katalogZrzutow`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { BACKEND_BASE, otworzAplikacje, siecKadrow, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'sld-skala-i-nawigacja', 'macierz'));
/** Czułość kółka kanwy (`SldCanvasV3.tsx`, `WHEEL_ZOOM_SENSITIVITY`). */
const CZULOSC_KOLKA = 0.0015;
// Dyrektywa właściciela 2026-11-13: LOD0 do ~40 %, LOD1 ~40–85 %, LOD2 od ~85 % — 30 % (LOD0),
// 45 i 60 % (LOD1), 100 i 200 % (LOD2). Granice z `oknoRenderu.ts`: 9/24 = 0,375 i 9/11 = 0,818,
// histereza ±10 % (`PASMO_HISTEREZY_CZYTELNOSCI`) — w paśmie dopuszczalny poziom sąsiedni.
const SKALE = [0.3, 0.45, 0.6, 1, 2] as const;
const GRANICE_LOD = [9 / 24, 9 / 11] as const;
const PASMO_LOD = 0.1;
const POZIOMY = (s: number): readonly string[] => {
  const poziom = (x: number): number => GRANICE_LOD.filter((g) => x >= g).length;
  const mozliwe = new Set([poziom(s), poziom(s * (1 + PASMO_LOD)), poziom(s / (1 + PASMO_LOD))]);
  return [...mozliwe].sort().map((n) => `LOD${n}`);
};

/** CRC-32 (IEEE 802.3) — suma kontrolna wpisu ZIP. */
const TABLICA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(dane: Buffer): number {
  let c = 0xffffffff;
  for (const b of dane) c = TABLICA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Wpisy archiwum ZIP (katalog centralny; metoda 0 albo 8 — tylko te zapisuje eksporter). */
function rozpakujZip(zip: Buffer): Map<string, Buffer> {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const liczba = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const wpisy = new Map<string, Buffer>();
  for (let i = 0; i < liczba; i += 1) {
    const metoda = zip.readUInt16LE(p + 10);
    const rozmiar = zip.readUInt32LE(p + 20);
    const dlNazwy = zip.readUInt16LE(p + 28);
    const dlDod = zip.readUInt16LE(p + 30);
    const dlKom = zip.readUInt16LE(p + 32);
    const lokalny = zip.readUInt32LE(p + 42);
    const nazwa = zip.subarray(p + 46, p + 46 + dlNazwy).toString('utf8');
    const start = lokalny + 30 + zip.readUInt16LE(lokalny + 26) + zip.readUInt16LE(lokalny + 28);
    const surowe = zip.subarray(start, start + rozmiar);
    wpisy.set(nazwa, metoda === 8 ? inflateRawSync(surowe) : Buffer.from(surowe));
    p += 46 + dlNazwy + dlDod + dlKom;
  }
  return wpisy;
}

/** Archiwum ZIP bez kompresji (metoda 0) z podanych wpisów. */
function spakujZip(wpisy: ReadonlyMap<string, Buffer>): Buffer {
  const lokalne: Buffer[] = [];
  const centralne: Buffer[] = [];
  let przesuniecie = 0;
  for (const [nazwa, dane] of wpisy) {
    const n = Buffer.from(nazwa, 'utf8');
    const crc = crc32(dane);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(dane.length, 18);
    lh.writeUInt32LE(dane.length, 22);
    lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(dane.length, 20);
    ch.writeUInt32LE(dane.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(przesuniecie, 42);
    lokalne.push(lh, n, dane);
    centralne.push(ch, n);
    przesuniecie += 30 + n.length + dane.length;
  }
  const katalog = Buffer.concat(centralne);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(wpisy.size, 8);
  eocd.writeUInt16LE(wpisy.size, 10);
  eocd.writeUInt32LE(katalog.length, 12);
  eocd.writeUInt32LE(przesuniecie, 16);
  return Buffer.concat([...lokalne, katalog, eocd]);
}

type Prost = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
const skalaKamery = async (kanwa: Locator) => Number(await kanwa.getAttribute('data-skala-kamery'));

async function spoczynek(kanwa: Locator): Promise<string> {
  await expect(kanwa).toHaveAttribute('data-stan-kamery', 'spoczynek', { timeout: 10000 });
  return (await kanwa.getAttribute('viewBox'))!;
}
async function kadrUstalony(page: Page, kanwa: Locator): Promise<string> {
  let poprzedni = await spoczynek(kanwa);
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(250);
    const biezacy = await spoczynek(kanwa);
    if (biezacy === poprzedni) return biezacy;
    poprzedni = biezacy;
  }
  return poprzedni;
}

async function prostokat(page: Page, selektor: string): Promise<Prost | null> {
  return page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, selektor);
}

/** Wolna kanwa: kanwa bez pasa narzędzi u góry i rzędu doków u dołu. */
async function wolnaKanwa(page: Page, kanwa: Locator): Promise<Prost> {
  const k = (await kanwa.boundingBox())!;
  const pas = (await prostokat(page, '[data-testid="sld-v3-toolbar"] > [data-toolbar-group="widok"]'))!;
  const sciezka = await prostokat(page, '[data-testid="sld-v3-sciezka-kadru"]');
  const skala = (await prostokat(page, '[data-testid="sld-v3-wskaznik-skali"]'))!;
  return { left: k.x, right: k.x + k.width, top: Math.max(pas.bottom, sciezka?.bottom ?? 0), bottom: skala.top };
}

/** Środek ekranowy celu: obrys zaznaczenia celu (rysowany w każdej skali), a bez zaznaczenia —
 *  uchwyty trafienia obiektu; dla całej sieci — środek wolnej kanwy. */
async function srodekCelu(page: Page, kanwa: Locator, ref: string | null): Promise<{ x: number; y: number }> {
  if (ref === null) {
    const w = await wolnaKanwa(page, kanwa);
    return { x: (w.left + w.right) / 2, y: (w.top + w.bottom) / 2 };
  }
  const p = await kanwa.evaluate((svg, r) => {
    const obrys = Array.from(svg.querySelectorAll(`[data-zaznaczenie-ref="${r}"]`));
    const el = obrys.length > 0 ? obrys : Array.from(svg.querySelectorAll(`[data-hit-owner-ref="${r}"], [data-hit-owner-ref^="${r}#"]`));
    if (el.length === 0) return null;
    const b = { l: Infinity, t: Infinity, r: -Infinity, d: -Infinity };
    for (const e of el) {
      const q = e.getBoundingClientRect();
      b.l = Math.min(b.l, q.left);
      b.t = Math.min(b.t, q.top);
      b.r = Math.max(b.r, q.right);
      b.d = Math.max(b.d, q.bottom);
    }
    return { x: (b.l + b.r) / 2, y: (b.t + b.d) / 2 };
  }, ref);
  expect(p, `cel ${ref} ma uchwyt na kanwie`).not.toBeNull();
  return p!;
}

/** Skala kamery kółkiem z kursorem nad punktem (punkt stały kółka). Zwraca skalę osiągniętą. */
async function skalaKolkiem(page: Page, kanwa: Locator, cel: number, punkt: () => Promise<{ x: number; y: number }>): Promise<number> {
  for (let i = 0; i < 10; i += 1) {
    const s = await skalaKamery(kanwa);
    if (Math.abs(s / cel - 1) < 0.01) break;
    const p = await punkt();
    await page.mouse.move(p.x, p.y);
    const przed = await kanwa.getAttribute('viewBox');
    await page.mouse.wheel(0, -Math.log(cel / s) / CZULOSC_KOLKA);
    await expect.poll(() => kanwa.getAttribute('viewBox'), { timeout: 5000 }).not.toBe(przed);
    await spoczynek(kanwa);
    if ((await skalaKamery(kanwa)) === s) break; // kraniec skali
  }
  return skalaKamery(kanwa);
}

async function inspektor(page: Page, otwarty: boolean): Promise<void> {
  const widoczny = await page.getByTestId('mvd-inspector').isVisible();
  if (widoczny !== otwarty) await page.keyboard.press('Control+KeyI');
  await expect(page.getByTestId('mvd-inspector')).toBeVisible({ visible: otwarty });
}

/** Napisy warstwy etykiet narysowane poniżej progu czytelności (pismo × skala < 9 px). */
async function napisyNieczytelne(kanwa: Locator): Promise<number> {
  return kanwa.evaluate((svg) => {
    const s = Number(svg.getAttribute('data-skala-kamery'));
    let n = 0;
    for (const t of Array.from(svg.querySelectorAll('[data-testid="sld-v3-labels"] text'))) {
      const f = Number(t.getAttribute('font-size'));
      if (Number.isFinite(f) && f * s < 9 - 0.05) n += 1;
    }
    return n;
  });
}

for (const motyw of [
  { klucz: 'jasny', theme: 'light_technical' as const },
  { klucz: 'ciemny', theme: 'dark_scada' as const },
]) {
  for (const okno of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    const rozmiar = `${okno.width}x${okno.height}`;
    test(`macierz skali × inspektor × cel i przejście LOD0→LOD2 (${motyw.klucz}, ${rozmiar})`, async ({ page, request }) => {
      test.setTimeout(900000);
      mkdirSync(KATALOG, { recursive: true });
      const seed = await siecKadrow(request);
      await otworzAplikacje(page, seed, okno);
      await ustawMotyw(page, motyw.theme);
      await page.getByRole('button', { name: /^Schemat \(SLD\)/ }).first().click();
      const kanwa = page.getByTestId('sld-canvas-v3');
      await expect(kanwa).toBeVisible();
      const stacja = (seed.enm.substations ?? []).find((st) => st.name === 'Stacja Sekcyjna')!;
      const pole = (seed.enm.bays ?? []).find((b) => b.substation_ref === stacja.ref_id)!;
      // Cała sieć: kółko z kadru całej sieci nad GPZ (korzeń sieci) — środek kadru całej sieci
      // bywa pustym tłem, a każdy zrzut ma pokazywać rzeczywisty obiekt (B-02 2026-11-13).
      const gpz = (seed.enm.substations ?? []).find((st) => st.station_type === 'gpz')!;
      const cele = [
        { nazwa: 'cala-siec-kolko-nad-gpz', ref: null, kotwica: gpz.ref_id },
        { nazwa: 'stacja', ref: stacja.ref_id, kotwica: stacja.ref_id },
        { nazwa: 'pole', ref: pole.ref_id, kotwica: pole.ref_id },
      ] as const;
      for (const cel of cele) {
        for (const otwarty of [false, true]) {
          for (const skala of SKALE) {
            await page.keyboard.press('Escape');
            await page.keyboard.press('Escape');
            await page.keyboard.press('Shift+F');
            await kadrUstalony(page, kanwa);
            if (cel.ref !== null) {
              // Zaznaczenie celu natywnym klikiem: stacja — wiersz nazwy (cel w każdej skali); pole —
              // klik w pole po dwukliku nazwy stacji (kadr stacji, pole jest celem kliku).
              const nazwa = page.locator(`[data-hit-owner-ref^="${stacja.ref_id}#name-row"]`).last();
              if (cel.nazwa === 'pole') {
                await nazwa.dblclick();
                await kadrUstalony(page, kanwa);
                const c = await srodekCelu(page, kanwa, cel.ref);
                await page.mouse.click(c.x, c.y);
              } else {
                await nazwa.click();
              }
              await expect.poll(() => page.locator(`[data-zaznaczenie-ref="${cel.ref}"]`).count(), { message: `${cel.nazwa}: zaznaczony` }).toBeGreaterThan(0);
              await page.getByTestId('sld-v3-fit-view').click();
              await kadrUstalony(page, kanwa);
            }
            await inspektor(page, otwarty);
            await kadrUstalony(page, kanwa);
            // Cała sieć bez zaznaczenia: punkt kółka ustalony RAZ (środek GPZ w kadrze całej sieci) —
            // kółko trzyma punkt pod kursorem, a obwiednia uchwytów GPZ zmienia się z poziomem
            // szczegółu, więc liczona na nowo przesuwałaby punkt.
            const punktStaly = cel.ref === null ? await srodekCelu(page, kanwa, cel.kotwica) : null;
            const osiagnieta = await skalaKolkiem(page, kanwa, skala, async () => punktStaly ?? srodekCelu(page, kanwa, cel.kotwica));
            const kraniec = Math.abs(osiagnieta / skala - 1) >= 0.01;
            if (kraniec) expect(osiagnieta, `${cel.nazwa} ${skala}: kraniec skali`).toBeGreaterThan(skala);
            const c = punktStaly ?? (await srodekCelu(page, kanwa, cel.kotwica));
            const w = await wolnaKanwa(page, kanwa);
            expect(c.x, `${cel.nazwa} ${skala}: środek celu w wolnej kanwie (x)`).toBeGreaterThanOrEqual(w.left);
            expect(c.x).toBeLessThanOrEqual(w.right);
            expect(c.y, `${cel.nazwa} ${skala}: środek celu w wolnej kanwie (y)`).toBeGreaterThanOrEqual(w.top);
            expect(c.y).toBeLessThanOrEqual(w.bottom);
            expect(await napisyNieczytelne(kanwa), `${cel.nazwa} ${skala}: napisy narysowane czytelne`).toBe(0);
            expect(POZIOMY(osiagnieta), `${cel.nazwa} ${skala}: poziom szczegółu`).toContain(await kanwa.getAttribute('data-poziom-szczegolu'));
            const procent = kraniec ? `kraniec-${Math.round(osiagnieta * 100)}` : `${Math.round(skala * 100)}`;
            await page.screenshot({
              path: resolve(KATALOG, `${cel.nazwa}-skala-${procent}-inspektor-${otwarty ? 'otwarty' : 'zamkniety'}-${motyw.klucz}-${rozmiar}.png`),
            });
          }
        }
      }

      // Przejście LOD0 → LOD1 → LOD2 kółkiem nad zaznaczoną stacją: zaznaczenie i położenie stacji.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Shift+F');
      await kadrUstalony(page, kanwa);
      await page.locator(`[data-hit-owner-ref^="${stacja.ref_id}#name-row"]`).last().click();
      await expect.poll(() => page.locator(`[data-zaznaczenie-ref="${stacja.ref_id}"]`).count()).toBeGreaterThan(0);
      await kadrUstalony(page, kanwa);
      const punkt = await srodekCelu(page, kanwa, stacja.ref_id);
      let poprzedniSrodek: { x: number; y: number } | undefined;
      for (const [lod, s] of [['lod0', 0.3], ['lod1', 0.6], ['lod2', 1]] as const) {
        await page.mouse.move(punkt.x, punkt.y);
        const przed = await kanwa.getAttribute('viewBox');
        const teraz = await skalaKamery(kanwa);
        if (Math.abs(teraz / s - 1) >= 0.01) {
          await page.mouse.wheel(0, -Math.log(s / teraz) / CZULOSC_KOLKA);
          await expect.poll(() => kanwa.getAttribute('viewBox'), { timeout: 5000 }).not.toBe(przed);
          await spoczynek(kanwa);
        }
        expect(await page.locator(`[data-zaznaczenie-ref="${stacja.ref_id}"]`).count(), `${lod}: zaznaczenie stacji`).toBeGreaterThan(0);
        expect(await kanwa.getAttribute('data-poziom-szczegolu'), `${lod}: poziom szczegółu`).toBe(lod.toUpperCase());
        expect(await napisyNieczytelne(kanwa), `${lod}: napisy czytelne`).toBe(0);
        // Punkt stały kółka: punkt świata pod kursorem nieruchomy — środek stacji na ekranie w miejscu
        // (uchwyt stacji zmienia klasę między poziomami, więc mierzymy obrys zaznaczenia).
        const obrys = (await prostokat(page, `[data-zaznaczenie-ref="${stacja.ref_id}"]`))!;
        const srodek = { x: (obrys.left + obrys.right) / 2, y: (obrys.top + obrys.bottom) / 2 };
        if (lod !== 'lod0') {
          expect(Math.abs(srodek.x - poprzedniSrodek!.x), `${lod}: środek stacji w miejscu (x)`).toBeLessThan(2);
          expect(Math.abs(srodek.y - poprzedniSrodek!.y), `${lod}: środek stacji w miejscu (y)`).toBeLessThan(2);
        }
        poprzedniSrodek = srodek;
        await page.screenshot({ path: resolve(KATALOG, `przejscie-${lod}-stacja-zaznaczona-${motyw.klucz}-${rozmiar}.png`) });
      }
    });
  }
}
test('pomiar nawigacji na sieci wzorcowej 52 stacji: opóźnienie poleceń, stabilność skali, czytelność po zmianie poziomu', async ({ page, request }) => {
  test.setTimeout(600000);
  const zrodlo = await siecKadrow(request);
  const fikstura = JSON.parse(readFileSync(resolve(HERE, '..', 'public', 'test-fixtures', 'sldSubstrate52s.enm.json'), 'utf8')) as { enm: unknown };
  const eksport = await request.post(`${BACKEND_BASE}/api/projects/${zrodlo.projectId}/export`);
  expect(eksport.ok(), `eksport projektu: ${eksport.status()}`).toBeTruthy();
  const wpisy = rozpakujZip(await eksport.body());
  const projekt = JSON.parse(wpisy.get('project.json')!.toString('utf8')) as { enm: { models: Array<{ case_id: string; snapshot: unknown }> } };
  expect(projekt.enm.models, 'archiwum niesie jeden model sieci').toHaveLength(1);
  projekt.enm.models[0]!.snapshot = fikstura.enm;
  wpisy.set('project.json', Buffer.from(JSON.stringify(projekt), 'utf8'));
  const nazwaProjektu = `Sieć wzorcowa 52 stacji ${Date.now().toString(36)}`;
  const imp = await request.post(`${BACKEND_BASE}/api/projects/import`, {
    multipart: {
      file: { name: 'siec-wzorcowa-52.mvdp.zip', mimeType: 'application/zip', buffer: spakujZip(wpisy) },
      new_name: nazwaProjektu,
      verify_integrity: 'false',
    },
    timeout: 60000,
  });
  expect(imp.ok(), `import archiwum: ${imp.status()}`).toBeTruthy();
  const wynikImportu = (await imp.json()) as { status: string; project_id: string | null; errors: string[] };
  expect(wynikImportu.errors, 'import bez błędów').toEqual([]);
  expect(wynikImportu.status).toBe('SUCCESS');
  const aktywny = await request.get(`${BACKEND_BASE}/api/study-cases/project/${wynikImportu.project_id}/active`);
  expect(aktywny.ok(), 'aktywny przypadek zaimportowanego projektu').toBeTruthy();
  const przypadek = (await aktywny.json()) as { id: string; name: string };
  const seed = { projectId: wynikImportu.project_id!, projectName: nazwaProjektu, caseId: przypadek.id, caseName: przypadek.name };
  await otworzAplikacje(page, seed, { width: 1440, height: 900 });
  await page.getByRole('button', { name: /^Schemat \(SLD\)/ }).first().click();
  const kanwa = page.getByTestId('sld-canvas-v3');
  await expect(kanwa).toBeVisible();
  await expect.poll(() => kanwa.locator('[data-testid="sld-v3-symbole-stacji"] > *').count(), { timeout: 60000, message: 'sieć 52 stacji na kanwie' }).toBeGreaterThan(40);
  await page.keyboard.press('Shift+F');
  await kadrUstalony(page, kanwa);

  /** Opóźnienie polecenia: od chwili tuż przed wejściem do pierwszej klatki (rAF) po zmianie
   *  `viewBox` kanwy — górne oszacowanie (obejmuje rundę Playwright → przeglądarka). */
  const opoznienie = async (polecenie: () => Promise<void>): Promise<number> => {
    await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="sld-canvas-v3"]')!;
      const w = window as unknown as { __t0: number; __t1: number | null };
      w.__t1 = null;
      const obs = new MutationObserver(() => {
        if (w.__t1 !== null) return;
        obs.disconnect();
        requestAnimationFrame(() => {
          w.__t1 = performance.now();
        });
      });
      obs.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
      w.__t0 = performance.now();
    });
    await polecenie();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __t1: number | null }).__t1), { timeout: 10000 }).not.toBeNull();
    const ms = await page.evaluate(() => {
      const w = window as unknown as { __t0: number; __t1: number };
      return w.__t1 - w.__t0;
    });
    await spoczynek(kanwa);
    return ms;
  };
  const mediana = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const w = await wolnaKanwa(page, kanwa);
  const srodek = { x: (w.left + w.right) / 2, y: (w.top + w.bottom) / 2 };
  await page.mouse.move(srodek.x, srodek.y);
  const kolko: number[] = [];
  const skalaStartowa = await skalaKamery(kanwa);
  for (let i = 0; i < 6; i += 1) kolko.push(await opoznienie(() => page.mouse.wheel(0, i % 2 === 0 ? -240 : 240)));
  await kadrUstalony(page, kanwa);
  const dryfSkali = Math.abs((await skalaKamery(kanwa)) / skalaStartowa - 1);
  const shift1: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Shift+F');
    await kadrUstalony(page, kanwa);
    await page.mouse.move(srodek.x, srodek.y);
    shift1.push(await opoznienie(() => page.keyboard.press('Shift+Digit1')));
    expect(await skalaKamery(kanwa), 'Shift+1: skala czytania').toBeCloseTo(1, 4);
  }
  const czytelnoscPoLod = await napisyNieczytelne(kanwa);
  const dom = await kanwa.evaluate((svg) => svg.querySelectorAll('*').length);
  // Przelot (preferencja ruchu bez ograniczeń): opóźnienie pierwszej klatki i czas do spoczynku.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const przelot: number[] = [];
  const czasPrzelotu: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const t = Date.now();
    przelot.push(await opoznienie(() => page.keyboard.press(i % 2 === 0 ? 'Shift+F' : 'Shift+Digit1')));
    czasPrzelotu.push(Date.now() - t);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Shift+F');
  await kadrUstalony(page, kanwa);
  const domCalejSieci = await kanwa.evaluate((svg) => svg.querySelectorAll('*').length);
  const pomiar = {
    zrodlo: 'e2e/sld-macierz-skali.spec.ts, sieć wzorcowa 52 stacji, okno 1440×900, Chromium bez ograniczeń CPU',
    opoznienie_kolka_ms: { mediana: mediana(kolko), max: Math.max(...kolko), probki: kolko },
    opoznienie_shift1_ms: { mediana: mediana(shift1), max: Math.max(...shift1), probki: shift1 },
    opoznienie_przelotu_ms: { mediana: mediana(przelot), max: Math.max(...przelot), probki: przelot },
    czas_przelotu_do_spoczynku_ms: czasPrzelotu,
    dryf_skali_kolko_tam_i_z_powrotem: dryfSkali,
    napisy_nieczytelne_po_zmianie_poziomu: czytelnoscPoLod,
    wezly_dom_kanwy: { skala_czytania: dom, cala_siec: domCalejSieci },
  };
  mkdirSync(resolve(HERE, '..', 'test-results'), { recursive: true });
  writeFileSync(resolve(HERE, '..', 'test-results', 'pomiar-nawigacji-52.json'), JSON.stringify(pomiar, null, 2));
  test.info().annotations.push({ type: 'pomiar', description: JSON.stringify(pomiar) });
  console.log(`POMIAR-NAWIGACJI-52 ${JSON.stringify(pomiar)}`);
  expect(dryfSkali, 'kółko tam i z powrotem wraca do tej samej skali').toBeLessThan(1e-3);
  expect(czytelnoscPoLod, 'napisy po zmianie poziomu czytelne').toBe(0);
  expect(domCalejSieci, 'budżet DOM kadru całej sieci (architekt: 3 000)').toBeLessThanOrEqual(3000);
  for (const ms of [...kolko, ...shift1, ...przelot]) expect(ms, 'polecenie nawigacji odpowiada w pierwszej sekundzie').toBeLessThan(1000);
});
