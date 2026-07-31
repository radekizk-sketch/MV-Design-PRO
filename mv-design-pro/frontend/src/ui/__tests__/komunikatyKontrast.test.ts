/**
 * KD-8 poz. 3, bramka 3 — KOMUNIKATY BLOKAD I OSTRZEŻEŃ SĄ CZYTELNE W OBU
 * MOTYWACH.
 *
 * Defekt z oceny właściciela: ramka „Brak wolnego portu wyjściowego SN…"
 * (pomarańcz na beżu) była poniżej progu czytelności w motywie jasnym. Miara:
 * `text-amber-100` na `bg-amber-950/25` zlanym z panelem — w motywie jasnym
 * 1,35:1, czyli poniżej progu AA (4,5:1) prawie trzykrotnie.
 *
 * Ten test pilnuje DWÓCH rzeczy:
 *  1. kształt „komunikat" (tło + tusz z jednej rodziny barw) nie wraca do
 *     twardej palety Tailwinda — komunikaty mają iść ze skali `sygnal-*`,
 *     bo tylko ona ma wartość per motyw;
 *  2. każda para skali (tusz na własnym tle) ma ≥ 4,5:1 w OBU motywach —
 *     to samo mierzy `scadaTokens.test.ts`, tu w kontekście komunikatu.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

/** Rodziny barw Tailwinda, których użycie jako pary tło+tusz zdradza komunikat. */
const RODZINY = 'red|rose|amber|orange|yellow|emerald|green|sky|blue|cyan';
const BG = new RegExp(`\\bbg-(${RODZINY})-(8|9)\\d{2}(?:/\\d+)?\\b`);
const TUSZ = new RegExp(`\\btext-(${RODZINY})-[1-4]00\\b`);

function plikiTsx(dir: string): string[] {
  const out: string[] = [];
  for (const wpis of readdirSync(dir)) {
    const p = join(dir, wpis);
    if (statSync(p).isDirectory()) {
      if (wpis === '__tests__' || wpis === 'node_modules') continue;
      out.push(...plikiTsx(p));
    } else if (wpis.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

describe('komunikaty — zero twardej palety w kształcie „tło + tusz"', () => {
  it('żaden komunikat nie łączy tła i tuszu z twardej palety Tailwinda', () => {
    const winni: string[] = [];
    for (const plik of plikiTsx(SRC)) {
      for (const linia of readFileSync(plik, 'utf8').split('\n')) {
        const bg = BG.exec(linia);
        const tusz = TUSZ.exec(linia);
        if (bg && tusz && bg[1] === tusz[1]) {
          winni.push(`${plik.replace(SRC, 'src')}: ${bg[0]} + ${tusz[0]}`);
        }
      }
    }
    expect(winni, `komunikaty poza skalą sygnałową:\n${winni.join('\n')}`).toEqual([]);
  });

  it('komunikat blokady konfiguratora stacji używa skali sygnałowej', () => {
    const zrodlo = readFileSync(join(SRC, 'ui/workspace/surfaces/StationConfiguratorSurface.tsx'), 'utf8');
    const wiersz = zrodlo
      .split('\n')
      .find((l) => l.includes('station-network-action-blockers') || l.includes('sygnal-blokada'));
    expect(wiersz).toBeDefined();
    expect(zrodlo).toContain('bg-sygnal-blokada-tlo');
    expect(zrodlo).toContain('text-sygnal-blokada-tusz');
    // Dawna para (pomarańcz na beżu) nie może wrócić.
    expect(zrodlo).not.toContain('bg-amber-950/25');
  });
});
