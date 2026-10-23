/**
 * Karta GPZ-H5-SLD etap 3 (d) — ODSTĘPSTWO stanu łącznika od pozycji normalnej na KAŻDYM
 * glifie łączeniowym, nie tylko na łączniku szyn GPZ.
 *
 * Przyczyna (pomiar przed naprawą, e2e przełączeń H5 na scalonym backendzie): w wariancie
 * awaryjnym rezerwy jawnej scenariusz zamyka wyłącznik pola SN transformatora rezerwowego
 * (`…/transformer/002/breaker_sn`, `normal_state = open`), a glif tego wyłącznika nie niósł
 * pozycji normalnej — schemat wariantu wyglądał jak stan normalny. Pozycję normalną czytały
 * wyłącznie glify toru poziomego łączników szyn GPZ; ta sama klasa obejmuje sprzęgło sekcji
 * stacji, aparat pola rysowany z gałęzi łączeniowej (`Bay.equipment_refs`) i łącznik toru
 * ciągu SN.
 *
 * Iloczyn cech:
 *  (1) glif: każdy glif łączeniowy × stan rzeczywisty {otwarty, zamknięty, nieznany} ×
 *      pozycja normalna {otwarta, zamknięta, niezadeklarowana} — atrybuty i ramka;
 *  (2) ścieżka danych do DOM kanwy: miejsce {sprzęgło sekcji stacji, aparat pola stacji
 *      z gałęzi, łącznik toru, wyłącznik pola SN transformatora rezerwowego GPZ H5} ×
 *      stan rzeczywisty {otwarty, zamknięty} × pozycja normalna {otwarta, zamknięta,
 *      niezadeklarowana} × LOD {1, 2}.
 * Wyrocznia zapisana dosłownie: ramka ⇔ (pozycja zadeklarowana ∧ stan znany ∧ stan ≠ pozycja).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Branch, EnergyNetworkModel } from '../../../../../types/enm';
import { SYMBOL_GLYPHS } from '../../symbols/glyphs';
import type { SymbolId } from '../../symbols/defs';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3 } from '../SldCanvasV3';

type Stan = 'open' | 'closed';
const POZYCJE: readonly (Stan | null)[] = ['open', 'closed', null];

const GLIFY_LACZENIOWE: readonly SymbolId[] = [
  'lineSwitch',
  'lineBreaker',
  'breaker',
  'recloser',
  'disconnector',
  'loadBreakSwitch',
  'earthSwitch',
  'fuseSwitch',
];

describe('glif łączeniowy × stan × pozycja normalna', () => {
  for (const id of GLIFY_LACZENIOWE) {
    for (const stan of ['open', 'closed', 'unknown'] as const) {
      for (const normalna of POZYCJE) {
        it(`${id} · stan ${stan} · pozycja normalna ${normalna}`, () => {
          const Glif = SYMBOL_GLYPHS[id];
          const { container } = render(
            <svg>
              <Glif x={0} y={0} state={stan} {...(normalna ? { pozycjaNormalna: normalna } : {})} />
            </svg>,
          );
          const g = container.querySelector(`[data-symbol-canon="${id}"]`)!;
          expect(g).not.toBeNull();
          const odstepstwo = normalna !== null && stan !== 'unknown' && stan !== normalna;
          expect(g.getAttribute('data-pozycja-normalna')).toBe(normalna);
          expect(g.getAttribute('data-odstepstwo')).toBe(normalna === null ? null : String(odstepstwo));
          expect(g.querySelectorAll('[data-ramka-odstepstwa="true"]')).toHaveLength(odstepstwo ? 1 : 0);
        });
      }
    }
  }
});

const FRONTEND = resolve(__dirname, '../../../../../..');
function wczytaj(sciezka: string): EnergyNetworkModel {
  const dane = JSON.parse(readFileSync(resolve(FRONTEND, sciezka), 'utf8')) as Record<string, unknown>;
  return (dane.snapshot ?? dane.enm ?? dane) as EnergyNetworkModel;
}

interface Miejsce {
  readonly nazwa: string;
  readonly enm: EnergyNetworkModel;
  readonly ref: string;
}

const STACJE = wczytaj('src/harness-fixtures/generated/geometria_stacji_otwarte.json');
const CIAG = wczytaj('src/ui/sld/v3/scene/__tests__/fixtures/elementyCiagu-lacznik.enm.json');
const GPZ_H5 = wczytaj('src/ui/sld/v3/canvas/__tests__/fixtures/gpzH5RezerwaJawnaBezLsSn.enm.json');

/** Aparat pola stacji rysowany z gałęzi łączeniowej: pierwsza gałąź `stn/…`, którą scena
 *  rysuje jako `deviceRef` symbolu (fakt sceny, nie domysł z nazwy). */
function aparatPolaZGalezi(enm: EnergyNetworkModel): string {
  const refy = new Set(buildSceneV3(enm, 2).symbols.map((s) => s.meta?.deviceRef).filter(Boolean));
  return enm.branches.map((b) => b.ref_id).filter((ref) => ref.startsWith('stn/') && refy.has(ref)).sort()[0];
}

const MIEJSCA: readonly Miejsce[] = [
  {
    nazwa: 'sprzęgło sekcji stacji',
    enm: STACJE,
    ref: STACJE.branches.find((b) => b.type === 'bus_coupler' && b.ref_id.startsWith('stn/'))!.ref_id,
  },
  { nazwa: 'aparat pola stacji z gałęzi', enm: STACJE, ref: aparatPolaZGalezi(STACJE) },
  { nazwa: 'łącznik toru', enm: CIAG, ref: CIAG.branches.find((b) => b.name === 'Łącznik sekcyjny za GPZ')!.ref_id },
  {
    nazwa: 'wyłącznik pola SN transformatora rezerwowego GPZ H5',
    enm: GPZ_H5,
    ref: GPZ_H5.branches.find((b) => b.ref_id.endsWith('/transformer/002/breaker_sn'))!.ref_id,
  },
];

function zeStanem(enm: EnergyNetworkModel, ref: string, stan: Stan, normalna: Stan | null): EnergyNetworkModel {
  return {
    ...enm,
    branches: enm.branches.map((b) => {
      if (b.ref_id !== ref) return b;
      const { normal_state: _pominiety, ...bez } = b as Branch & { normal_state?: unknown };
      return (normalna === null ? { ...bez, status: stan } : { ...bez, status: stan, normal_state: normalna }) as Branch;
    }),
  };
}

describe('miejsce łącznika × stan × pozycja normalna × LOD — DOM kanwy', () => {
  for (const miejsce of MIEJSCA) {
    it(`${miejsce.nazwa}: fikstura niesie łącznik ${miejsce.ref}`, () => {
      expect(miejsce.ref).toBeTruthy();
    });
    for (const stan of ['open', 'closed'] as const) {
      for (const normalna of POZYCJE) {
        for (const lod of [1, 2] as const) {
          it(`${miejsce.nazwa} · stan ${stan} · pozycja normalna ${normalna} · LOD ${lod}`, () => {
            const { container } = render(
              <SldCanvasV3 snapshot={zeStanem(miejsce.enm, miejsce.ref, stan, normalna)} width={1600} height={1000} lodOverride={lod} />,
            );
            const wrap = Array.from(container.querySelectorAll('g[data-owner-ref], g[data-device-ref]')).find(
              (g) =>
                (g.getAttribute('data-owner-ref') === miejsce.ref || g.getAttribute('data-device-ref') === miejsce.ref) &&
                g.querySelector('[data-symbol-canon]'),
            );
            expect(wrap, `glif ${miejsce.ref} na kanwie`).toBeDefined();
            const glif = wrap!.querySelector('[data-symbol-canon]')!;
            expect(GLIFY_LACZENIOWE).toContain(glif.getAttribute('data-symbol-canon'));
            const odstepstwo = normalna !== null && stan !== normalna;
            expect(glif.getAttribute('data-switch-state')).toBe(stan);
            expect(glif.getAttribute('data-pozycja-normalna')).toBe(normalna);
            expect(glif.getAttribute('data-odstepstwo')).toBe(normalna === null ? null : String(odstepstwo));
            expect(glif.querySelectorAll('[data-ramka-odstepstwa="true"]')).toHaveLength(odstepstwo ? 1 : 0);
          });
        }
      }
    }
  }
});
