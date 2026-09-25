/*
 * Uczciwość biegu dynamiki w trybie sieci (karta AB-P1 §0.2) — rekordy „nie oceniono"
 * 1:1 z backendu (`__tests__/rekordyOceny.json`, generator
 * `backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py` — ta sama funkcja
 * `oceny_biegu_dynamiki`, którą składa odpowiedź wyniku; parytet pilnuje
 * `backend/tests/uczciwosc/test_fixtury_ocen_fe.py`).
 *
 * ILOCZYN CECH: rekord (zgodność FRT / stabilność kątowa) × pole (status i etykieta /
 * czego brakuje / podstawa i jej stan / status modelu / dane przyjęte bez walidacji).
 * Parametry dynamiczne z profilu TYPOWEGO katalogu są daną przyjętą — karta mówi to
 * wprost, nigdy „dane zwalidowane".
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { OcenaNiewykonana } from '../../wzorzec/OcenaNiewykonana';
import type { RekordOcenyNiewykonanej } from '../../wzorzec/OcenaNiewykonana';
import rekordy from './rekordyOceny.json';

const REKORDY = (rekordy as unknown as { bieg_1: RekordOcenyNiewykonanej[] }).bieg_1;

describe.each(REKORDY.map((r) => [r.kryterium_id, r] as const))('rekord %s', (_id, rekord) => {
  it('status NIE_OCENIONO z etykietą neutralną i nazwanym brakiem', () => {
    render(<OcenaNiewykonana ocena={rekord} testid="ocena" />);
    const opakowanie = screen.getByTestId('ocena');
    expect(opakowanie).toHaveAttribute('data-status', 'NIE_OCENIONO');
    expect(opakowanie).toHaveAttribute('data-semantyka', 'neutralna');
    const karta = `mvd-werdykt-${rekord.kryterium_id}`;
    expect(screen.getByTestId(`${karta}-etykieta`)).toHaveTextContent('Ocena niewykonana');
    expect(screen.getByTestId(`${karta}-czego-brakuje`).textContent?.length).toBeGreaterThan(0);
    for (const zakazane of ['SPEŁNIA', 'NIE SPEŁNIA', 'PASS', 'FAIL', 'ZGODNY']) {
      expect(opakowanie.textContent ?? '').not.toContain(zakazane);
    }
  });

  it('model niezwalidowany i dane przyjęte z profilu typowego nazwane wprost', () => {
    render(<OcenaNiewykonana ocena={rekord} testid="ocena" />);
    expect(rekord.dowod.status_modelu).toBe('UNVALIDATED_MODEL');
    expect(rekord.dowod.status_danych.stan).toBe('UNVALIDATED_INPUT');
    const karta = `mvd-werdykt-${rekord.kryterium_id}`;
    const dane = screen.getByTestId(`${karta}-dowod-dane-przyjete`);
    expect(dane).toHaveTextContent('Farma PV Zachód');
    expect(dane).toHaveTextContent('profilu katalogowego');
  });
});
