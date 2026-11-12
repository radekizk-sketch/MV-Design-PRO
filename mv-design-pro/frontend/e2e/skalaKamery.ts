/**
 * Skala kamery schematu w testach e2e (karta SLD-SKALA-I-NAWIGACJA, R1/R7).
 *
 * Kanwa ma JEDNĄ scenę niezależną od skali — nie ma „poziomów szczegółu”, na
 * które dawniej czekały specy (atrybut poziomu sceny). Jedynym parametrem widoku jest
 * skala kamery [px ekranu / j.św.], wystawiona na kanwie atrybutem
 * `data-skala-kamery`. Gęstość napisów zależy od rozmiaru ekranowego pisma
 * (`canvas/gestoscInformacji.ts`), więc spec, który potrzebuje czytelnych opisów
 * pól, czeka na skalę czytania (`SKALA_CZYTANIA`, 1 px/j.św.), a spec, który
 * potrzebuje kadru całości, oddala do skali dopasowania.
 *
 * Gesty są NATYWNE (kółko myszy nad wskazanym punktem) — ta sama droga, którą
 * idzie projektant.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { SKALA_CZYTANIA, SKALA_KOMFORTU_CZYTANIA } from '../src/ui/sld/v3/canvas/camera';

export { SKALA_CZYTANIA, SKALA_KOMFORTU_CZYTANIA };

/**
 * Skala POŚREDNIA [px/j.św.] — zbliżenie robocze między przeglądem a skalą czytania (odbiór
 * B-02 właściciela 2026-11-04 pkt 5: oznaczenia aparatów bez parametrów). Pismo t4 (9 j.św.)
 * ma tu 6,3 px — poniżej progu czytelności 9 px — a pismo t1 (13 j.św.) 9,1 px, powyżej.
 */
export const SKALA_POSREDNIA = 0.7;

/** Skala kamery odczytana z atrybutu kanwy (NaN, gdy kanwa go nie niesie). */
export async function skalaKamery(kanwa: Locator): Promise<number> {
  return Number(await kanwa.getAttribute('data-skala-kamery'));
}

interface Punkt {
  readonly x: number;
  readonly y: number;
}

/**
 * Przybliża kółkiem nad `punkt`, aż skala osiągnie `prog` (domyślnie skala
 * czytania). Kończy się asercją — spec nie idzie dalej na zbyt małej skali.
 */
export async function przyblizDoSkali(
  page: Page,
  kanwa: Locator,
  punkt: Punkt,
  prog: number = SKALA_CZYTANIA,
  maksKrokow = 40,
): Promise<void> {
  await page.mouse.move(punkt.x, punkt.y);
  for (let krok = 0; krok < maksKrokow && (await skalaKamery(kanwa)) < prog; krok++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => skalaKamery(kanwa), { timeout: 5000 }).toBeGreaterThanOrEqual(prog);
}

/**
 * Oddala kółkiem nad `punkt`, aż skala przestanie maleć (dolna granica kamery =
 * dopasowanie całej sieci, R2) albo spadnie poniżej `prog`.
 */
export async function oddalDoSkali(
  page: Page,
  kanwa: Locator,
  punkt: Punkt,
  prog = 0,
  maksKrokow = 40,
): Promise<number> {
  await page.mouse.move(punkt.x, punkt.y);
  let poprzednia = await skalaKamery(kanwa);
  for (let krok = 0; krok < maksKrokow; krok++) {
    if (poprzednia <= prog) break;
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(120);
    const biezaca = await skalaKamery(kanwa);
    if (biezaca >= poprzednia) break;
    poprzednia = biezaca;
  }
  return poprzednia;
}

/** Środek ramki lokatora (asercja, że lokator jest na ekranie). */
export async function srodekRamki(lokator: Locator): Promise<Punkt> {
  const box = await lokator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Sufiks refu właściciela wiersza nazwy stacji w paśmie nazw (`#name-row-0`). */
export const WIERSZ_NAZWY_STACJI = '#name-row-0';

/**
 * Uchwyt STACJI jednej sceny: obrys trafienia napisu identyfikacji `<ref>#name-row-0`
 * (warstwa `sld-v3-trafienia`). Dawny zwinięty symbol stacji widoku ogólnego
 * (`data-element-kind="station"`, `sld-v3-l0-<ref>`) nie istnieje.
 */
export function selektorUchwytuStacji(stationRef: string): string {
  return `[data-hit-role="obrys"][data-hit-klasa="etykieta"][data-hit-owner-ref="${stationRef}${WIERSZ_NAZWY_STACJI}"]`;
}

/** Selektor napisu identyfikacji stacji w warstwie rysunku (`data-owner-ref` etykiety). */
export function selektorNapisuStacji(stationRef: string): string {
  return `[data-testid="sld-v3-labels"] [data-owner-ref="${stationRef}${WIERSZ_NAZWY_STACJI}"]`;
}

/** Uchwyt GPZ jednej sceny: obrys napisu identyfikacji GPZ (`gpz/…#name-row-0`). */
export const SELEKTOR_UCHWYTU_GPZ =
  `[data-hit-role="obrys"][data-hit-klasa="etykieta"][data-hit-owner-ref^="gpz/"][data-hit-owner-ref$="${WIERSZ_NAZWY_STACJI}"]`;
