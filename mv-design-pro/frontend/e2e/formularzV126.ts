/**
 * Parametry projektanta scen okna „Analizy specjalistyczne" — CZYTANE Z FIXTURY
 * liczonej backendem (`backend/scripts/eksport_fixtur_harnessu.py`,
 * `PARAMETRY_SCENY_AKADEMICKIE`), nie z kopii w specu: to DOKŁADNIE te wartości,
 * dla których backend policzył gotowość POTWIERDZONĄ, i te, które atrapa harnessu
 * rozpoznaje w zapytaniu o gotowość. Wypełnienie formularza idzie NATYWNĄ ścieżką
 * projektanta (`fill` pól okna), nie wymuszeniem stanu.
 */
import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURA = resolve(HERE, '..', 'src', 'harness-fixtures', 'generated', 'gotowosc_v126_scena_akademickie_parametry.json');

/** Parametry sceny per rodzaj analizy (klucz = kod rodzaju). */
export function parametrySceny(): Record<string, Record<string, unknown>> {
  const fixtura = JSON.parse(readFileSync(FIXTURA, 'utf-8')) as {
    parametry: Record<string, Record<string, unknown>>;
  };
  return fixtura.parametry;
}

/** Dane uziomu stacji sceny (`earthing_safety.earthing`) — pola formularza uziomu. */
export function uziomSceny(): Record<string, string | number> {
  return parametrySceny().earthing_safety.earthing as Record<string, string | number>;
}

/** Wypełnia formularz uziomu stacji polami z fixtury i czeka na gotowość POTWIERDZONĄ. */
export async function wypelnijUziomIPotwierdz(page: Page): Promise<void> {
  const formularz = page.getByTestId('mvd-akad-uziom');
  await expect(formularz).toBeVisible({ timeout: 15000 });
  for (const [klucz, wartosc] of Object.entries(uziomSceny())) {
    await formularz.getByTestId(`mvd-akad-pole-${klucz}`).fill(String(wartosc));
  }
  await expect(page.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', 'POTWIERDZONA', {
    timeout: 30000,
  });
}

/** Otwiera kartę analizy z katalogu i czeka na widok analizy (sekcja uruchomienia). */
export async function otworzAnalize(page: Page, kod: string): Promise<void> {
  await page.getByTestId(`mvd-akad-karta-otworz-${kod}`).click();
  await expect(page.getByTestId('mvd-akad-uruchomienie')).toBeVisible({ timeout: 15000 });
}

/** Uruchamia analizę (przycisk aktywny dopiero przy gotowości POTWIERDZONEJ) i czeka na wynik. */
export async function uruchomAnalize(page: Page, timeout = 60000): Promise<void> {
  const uruchom = page.getByTestId('mvd-akad-uruchom');
  await expect(uruchom).toBeEnabled({ timeout: 30000 });
  await uruchom.click();
  await expect(page.getByTestId('mvd-akad-wyniki')).toBeVisible({ timeout });
}
