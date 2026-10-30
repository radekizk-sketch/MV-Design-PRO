/**
 * Odczyty szyn stacji czytają rekordy K backendu (karta WERDYKT-MIGRACJA-190, SLD G1–G9).
 *
 * Dawniej rysunek liczył werdykt sam: kropka „w paśmie” przy |ΔU| ≤ 5 % (próg bez podstawy)
 * i znak ✓ z flagi `verification.passed` (I″k,max ≤ Icw bez kryterium i marginesu). Teraz znak,
 * ton i podpowiedź pochodzą z rekordu: napięcie — `walidacja_energetyczna.odchylenie_napiecia`
 * (±10 % PN-EN 50160), wytrzymałość — `…wytrzymalosc.<szyna>.cieplna` / `.dynamiczna`.
 *
 * Iloczyn cech: renderer (dziewięć presetów G1–G9 · odczyt szczegółowy archetypu OZE · plakietki
 * stacji T1–T4) × wielkość (U, I_cw, I_dyn) × semantyka rekordu (wynik backendu bez zmian albo
 * podmieniony na „naruszone” — liczby zostają te same, więc rysunek, który porównuje liczby,
 * nie przejdzie wariantu podmienionego).
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { OcenaKryterium } from '../../../../../ui2/wyniki/wzorzec/werdykt';
import { OzeSourceArchetype } from '../OzeSourceArchetype';
import { StationRozdzielniaSN } from '../StationRozdzielniaSN';
import { buildArchetype } from '../archetypes';
import { SldCanonPresetG1 } from '../canon/SldCanonPresetG1';
import { SldCanonPresetG2 } from '../canon/SldCanonPresetG2';
import { SldCanonPresetG3 } from '../canon/SldCanonPresetG3';
import { SldCanonPresetG4 } from '../canon/SldCanonPresetG4';
import { SldCanonPresetG5 } from '../canon/SldCanonPresetG5';
import { SldCanonPresetG6 } from '../canon/SldCanonPresetG6';
import { SldCanonPresetG7 } from '../canon/SldCanonPresetG7';
import { SldCanonPresetG8 } from '../canon/SldCanonPresetG8';
import { SldCanonPresetG9 } from '../canon/SldCanonPresetG9';
import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import type { SldOzeArchetypeCompanion } from '../companions/ozeTypes';

type Preset = (props: { companion: SldOzeArchetypeCompanion }) => JSX.Element;

const PRESETY: ReadonlyArray<[string, Preset, string]> = [
  ['G1', SldCanonPresetG1, 'G4-PVTR'],
  ['G2', SldCanonPresetG2, 'G1'],
  ['G3', SldCanonPresetG3, 'G5-BESS'],
  ['G4', SldCanonPresetG4, 'G4-PVBESS-BUS'],
  ['G5', SldCanonPresetG5, 'G5-WIND-T4'],
  ['G6', SldCanonPresetG6, 'G6-WIND-DFIG'],
  ['G7', SldCanonPresetG7, 'G7-WIND-ASYNC'],
  ['G8', SldCanonPresetG8, 'G8-BIOGAZ'],
  ['G9', SldCanonPresetG9, 'G9-GPO'],
];

const NARUSZONE = { etykieta_pl: 'Kryterium naruszone', semantyka: 'negatywna' } as const;

/** Wszystkie rekordy odczytów szyn companionu (napięcie i obie wytrzymałości). */
function rekordy(c: SldOzeArchetypeCompanion): OcenaKryterium[] {
  return [
    ...Object.values(c.voltage_flow.buses).map((b) => b.ocena),
    ...Object.values(c.short_circuit.buses).flatMap((b) => [b.oceny.cieplna, b.oceny.dynamiczna]),
  ];
}

/** Kopia companionu z KAŻDYM rekordem odczytu szyny podmienionym na „naruszone” — liczby
 *  (ΔU, Ik″, ip, Icw, Idyn) bez zmian. */
function zNaruszeniem(c: SldOzeArchetypeCompanion): SldOzeArchetypeCompanion {
  const kopia = JSON.parse(JSON.stringify(c)) as SldOzeArchetypeCompanion;
  for (const r of rekordy(kopia)) {
    (r as { etykieta: unknown }).etykieta = NARUSZONE;
  }
  return kopia;
}

function opisRekordu(r: OcenaKryterium): string {
  return `${r.etykieta.etykieta_pl}: ${r.wyjasnienie.zdanie_pl}`;
}

function odczyty(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-semantyka]'));
}

describe('presety G1–G9 — odczyt szyny z rekordów K', () => {
  it.each(PRESETY)('%s: znak, ton i podpowiedź z rekordu backendu', (_n, Preset, klucz) => {
    const companion = OZE_ARCHETYPES_2A[klucz];
    const { container } = render(
      <svg>
        <Preset companion={companion} />
      </svg>,
    );
    const opisy = new Set(rekordy(companion).map(opisRekordu));
    const wiersze = odczyty(container);
    // Każdy odczyt szyny niesie trzy rekordy: U, I_cw, I_dyn.
    expect(wiersze.length).toBeGreaterThanOrEqual(3);
    expect(wiersze.length % 3).toBe(0);
    for (const w of wiersze) {
      const tytul = w.querySelector('title')?.textContent ?? '';
      expect(opisy.has(tytul), `podpowiedź spoza rekordów: ${tytul}`).toBe(true);
    }
  });

  it.each(PRESETY)('%s: rekord „naruszone” przy tych samych liczbach daje ✗', (_n, Preset, klucz) => {
    const { container } = render(
      <svg>
        <Preset companion={zNaruszeniem(OZE_ARCHETYPES_2A[klucz])} />
      </svg>,
    );
    const wiersze = odczyty(container);
    expect(wiersze.length).toBeGreaterThanOrEqual(3);
    for (const w of wiersze) {
      expect(w.getAttribute('data-semantyka')).toBe('negatywna');
      expect(w.textContent).toContain('✗');
      expect(w.textContent).not.toContain('✓');
    }
  });
});

describe('archetyp OZE (widok szczegółowy) — U, I_cw, I_dyn z rekordów', () => {
  it.each([['G1'], ['G4-PVTR'], ['G9-GPO']])('%s', (klucz) => {
    for (const [companion, semantyka] of [
      [OZE_ARCHETYPES_2A[klucz], null],
      [zNaruszeniem(OZE_ARCHETYPES_2A[klucz]), 'negatywna'],
    ] as const) {
      const { container, unmount } = render(
        <svg>
          <OzeSourceArchetype companion={companion} stationCode={klucz} name={klucz} detail="close" />
        </svg>,
      );
      const opisy = new Set(rekordy(companion).map(opisRekordu));
      const wiersze = odczyty(container);
      expect(wiersze.length).toBeGreaterThanOrEqual(3);
      for (const w of wiersze) {
        expect(opisy.has(w.querySelector('title')?.textContent ?? '')).toBe(true);
        if (semantyka !== null) expect(w.getAttribute('data-semantyka')).toBe(semantyka);
      }
      unmount();
    }
  });
});

describe('stacja T1–T4 — plakietka napięcia i panel zwarciowy z rekordów', () => {
  it.each([['T1'], ['T2'], ['T3'], ['T4']] as const)('%s', (archetyp) => {
    const { model, companion } = buildArchetype(archetyp);
    const { container } = render(
      <svg>
        <StationRozdzielniaSN model={model} companion={companion} detail="close" />
      </svg>,
    );
    const plakietki = Array.from(container.querySelectorAll('[data-testid^="sr-vf-badge-"]'));
    const panele = Array.from(container.querySelectorAll('[data-testid^="sr-sc-ocena-"]'));
    expect(plakietki.length).toBeGreaterThan(0);
    expect(panele.length).toBeGreaterThan(0);
    for (const el of [...plakietki, ...panele]) {
      const tytul = el.querySelector('title')?.textContent ?? '';
      // Etykieta rekordu przed dwukropkiem, zdanie wyjaśnienia po nim — nigdy sama liczba.
      expect(tytul).toMatch(/^(Kryterium|Brak|Nie)[^:]*: .+/);
      expect(el.getAttribute('data-semantyka')).toMatch(/^(pozytywna|negatywna|ostrzegawcza|neutralna)$/);
    }
  });
});
