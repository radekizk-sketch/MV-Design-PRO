/**
 * Kolor łącznika v2 (harnessy rozdzielni stacji) z JEDNEGO źródła z kaflem łącznika v3
 * (rozstrzygnięcie architekta 2026-10-30 pkt 5, karta UX-04 §11.14; CLAUDE.md „KLASA, NIE
 * INSTANCJA" pkt 3 — predykaty parami): każdy symbol łącznika v2 bierze kolor i geometrię
 * z `barwaLacznika` → `polozenieZeStanu` → `STATE_COLOR`.
 *
 * Inwentarz klasy (wszystkie miejsca v2 rysujące stan łącznika kolorem):
 *  · `GpzApparatusSymbols.tsx::ApparatusCbSquare` (wyłącznik □),
 *  · `GpzApparatusSymbols.tsx::ApparatusEarthingSwitch` (uziemnik),
 *  · `GpzApparatusSymbols.tsx::ApparatusThreePositionSwitch` (łącznik trójpołożeniowy),
 *  · `StationRozdzielniaSN.tsx::CouplerDisconnectorDiamond` (romb sprzęgła),
 *  · `StationRozdzielniaSN.tsx` — symbol reprezentatywny pola na poziomie „far".
 *
 * Iloczyn cech: symbol × stan (zamknięty, otwarty, uziemiony, nieustalony, awaria, brak danej)
 * × poziom szczegółu (sprzęgło i symbol reprezentatywny) × stan wyłącznika sprzęgła (NOP).
 * Wyrocznia koloru jest jawną tabelą literałów — niezależną od tabeli produkcyjnej.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ApparatusCbSquare,
  ApparatusEarthingSwitch,
  ApparatusThreePositionSwitch,
} from '../GpzApparatusSymbols';
import { StationRozdzielniaSN } from '../StationRozdzielniaSN';
import { buildT4 } from '../archetypes';
import type { StationDetailLevel } from '../geometry';
import type { StationRozdzielniaModel } from '../contract';
import type { SwitchState } from '../../../v3/symbols/glyphs';

afterEach(() => cleanup());

const CZERWONY = '#C62828';
const ZIELONY = '#2E7D32';
const SZARY = '#6B7280';
const FIOLET = '#8E44AD';

type Stan = SwitchState | undefined;
const STANY: readonly Stan[] = ['closed', 'open', 'earthed', 'unknown', 'bad', undefined];

/** Wyrocznia: kolor łącznika wg konwencji dyspozytorskiej (§11.13). */
function kolorOczekiwany(stan: Stan, maZestykUziemiajacy: boolean): string {
  switch (stan) {
    case 'closed':
      return CZERWONY;
    case 'open':
      return ZIELONY;
    case 'earthed':
      return maZestykUziemiajacy ? ZIELONY : SZARY;
    case 'bad':
      return FIOLET;
    default:
      return SZARY;
  }
}

const opis = (stan: Stan): string => stan ?? 'brak danej';

describe('v2 — kolor łącznika z jednego źródła (symbol × stan)', () => {
  it.each(STANY.map((s) => [opis(s), s] as const))('wyłącznik □ — %s', (_n, stan) => {
    const { container } = render(
      <svg>
        <ApparatusCbSquare cx={50} cy={50} state={stan} />
      </svg>,
    );
    const rect = container.querySelector('[data-testid="sld-v2-gpz-bay-cb"] rect')!;
    const kolor = kolorOczekiwany(stan, false);
    expect(rect.getAttribute('stroke')).toBe(kolor);
    // Para obrys/wypełnienie: tor otwarty — bez wypełnienia kolorem stanu.
    if (stan === 'open') expect(rect.getAttribute('fill')).not.toBe(kolor);
    else expect(rect.getAttribute('fill')).toBe(kolor);
  });

  it.each((['closed', 'open', 'unknown'] as const).map((s) => [s] as const))('uziemnik — %s', (stan) => {
    const { container } = render(
      <svg>
        <ApparatusEarthingSwitch cxAxis={50} cy={50} state={stan} />
      </svg>,
    );
    const galaz = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"] line')!;
    expect(galaz.getAttribute('stroke')).toBe(kolorOczekiwany(stan, false));
  });

  it.each(STANY.map((s) => [opis(s), s] as const))('łącznik trójpołożeniowy — %s', (_n, stan) => {
    const cx = 100;
    const cy = 50;
    const h = 9;
    const { container } = render(
      <svg>
        <ApparatusThreePositionSwitch cx={cx} cy={cy} h={h} position={stan} />
      </svg>,
    );
    const g = container.querySelector('[data-testid="sld-v2-apparatus-three-position-switch"]')!;
    const noz = Array.from(g.querySelectorAll('line')).find((l) => l.getAttribute('stroke-width') === '1.8')!;
    expect(noz.getAttribute('stroke')).toBe(kolorOczekiwany(stan, true));
    // Geometria noża z tej samej pary co kolor.
    const koniec = [Number(noz.getAttribute('x2')), Number(noz.getAttribute('y2'))];
    if (stan === 'closed') expect(koniec).toEqual([cx, cy + h]);
    else if (stan === 'earthed') expect(koniec).toEqual([cx - h - 3, cy + 1]);
    else expect(koniec[0]).toBeGreaterThan(cx);
    const nieustalony = stan === undefined || stan === 'unknown' || stan === 'bad';
    expect(noz.hasAttribute('stroke-dasharray')).toBe(nieustalony);
  });
});

/** Model T4 z podmienionym stanem Q1 sprzęgła i Q1 pola liniowego „sr-t4-in". */
function modelT4(stanQ1Sprzegla: Stan, stanQ1Pola: Stan): StationRozdzielniaModel {
  const { model } = buildT4();
  return {
    ...model,
    fields: model.fields.map((f) => {
      if (f.role === 'SPRZEGLO') {
        return {
          ...f,
          apparatus: f.apparatus.map((a) => (a.designation === 'Q1' ? { ...a, switchState: stanQ1Sprzegla as never } : a)),
        };
      }
      if (f.fieldId === 'sr-t4-in') {
        return {
          ...f,
          apparatus: f.apparatus.map((a) => (a.kind === 'LOAD_SWITCH' ? { ...a, switchState: stanQ1Pola as never } : a)),
        };
      }
      return f;
    }),
  };
}

const POZIOMY: readonly StationDetailLevel[] = ['far', 'closer', 'close'];
const STANY_SPRZEGLA: readonly Stan[] = ['closed', 'open', 'unknown', 'bad', undefined];

describe('v2 — romb sprzęgła i symbol reprezentatywny pola (stan × poziom szczegółu)', () => {
  for (const poziom of POZIOMY) {
    for (const stan of STANY_SPRZEGLA) {
      it(`romb Q1 sprzęgła @${poziom} — ${opis(stan)}, wyłącznik sprzęgła otwarty (NOP)`, () => {
        const { companion } = buildT4();
        const { container } = render(
          <svg>
            <StationRozdzielniaSN model={modelT4(stan, 'closed')} companion={companion} detail={poziom} />
          </svg>,
        );
        const sprzeglo = container.querySelector('[data-testid^="sr-coupler-sr-"]')!;
        expect(sprzeglo.getAttribute('data-is-nop')).toBe('true');
        const romb = sprzeglo.querySelector('[data-testid="sr-coupler-cell-a"] [data-symbol-shape="diamond"]')!;
        const kolor = kolorOczekiwany(stan, true);
        // Stan rombu = stan rekordu Q1, nie stan wyłącznika sprzęgła (NOP nie „otwiera" Q1).
        expect(romb.getAttribute('data-state')).toBe(stan ?? 'unknown');
        const obrys = romb.querySelector('polygon')!;
        expect(obrys.getAttribute('stroke')).toBe(kolor);
        expect(obrys.getAttribute('fill')).toBe(stan === 'closed' ? kolor : 'none');
      });

    }
  }
  for (const stan of STANY_SPRZEGLA) {
    it(`symbol reprezentatywny pola @far — ${opis(stan)}`, () => {
      const { companion } = buildT4();
      const { container } = render(
        <svg>
          <StationRozdzielniaSN model={modelT4('open', stan)} companion={companion} detail="far" />
        </svg>,
      );
      const sym = container.querySelector('[data-testid="sr-field-rep-symbol-sr-t4-in"]')!;
      const kolor = kolorOczekiwany(stan, true);
      expect(sym.getAttribute('stroke')).toBe(kolor);
      expect(sym.getAttribute('fill')).toBe(stan === 'closed' ? kolor : 'none');
    });
  }
});
