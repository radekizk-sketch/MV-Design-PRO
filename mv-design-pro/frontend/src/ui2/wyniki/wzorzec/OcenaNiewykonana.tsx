/*
 * OcenaNiewykonana — opakowanie ekranu na rekord kontraktu werdyktu o statusie
 * `NIE_OCENIONO` (uczciwość natychmiastowa) oraz zwijana sekcja audytowa na liczby
 * solvera, który nie jest podstawą oceny.
 *
 * Powierzchnie, na których dawny werdykt nie miał podstawy (trajektorie FRT z profilu
 * wejściowego, stabilność z kątów wpisanych przez użytkownika, jakość energii z solvera
 * niezwalidowanego, SSCI z błędnym Z_grid, pole LoM bez sprawdzeń), dostają z backendu
 * PEŁNY rekord `OcenaKryterium` (`backend/src/werdykt`, zbudowany regułą K przez
 * `application/ocena_niewykonana.py`). Ten plik NIE ma własnej prezentacji rekordu —
 * rekord pokazuje JEDYNA karta werdyktu (`KartaWerdyktu`: etykieta, kryterium, wyjaśnienie
 * z „czego brakuje", podstawa, dowód, kompletność, zakres i ślad). Opakowanie dodaje wyłącznie
 * stabilny identyfikator testowy ekranu i atrybuty statusu/semantyki z rekordu.
 *
 * Zero fizyki, zero liczb i zero tekstów oceny wymyślonych w interfejsie.
 */

import { useState, type ReactNode } from 'react';

import { KartaWerdyktu } from './KartaWerdyktu';
import type { OcenaKryterium } from './werdykt';

/** Rekord `ocena` powierzchni bez oceny — rekord K kontraktu (`NIE_OCENIONO`). */
export type RekordOcenyNiewykonanej = OcenaKryterium;

/** Teksty przełącznika sekcji audytowej (opis sekcji, nie ocena). */
export const OCENA_NIEWYKONANA_STRINGS = {
  audytPokaz: 'Pokaż materiał audytowy',
  audytUkryj: 'Ukryj materiał audytowy',
} as const;

export interface OcenaNiewykonanaProps {
  readonly ocena: RekordOcenyNiewykonanej;
  /** Identyfikator testowy opakowania (unikalny na ekranie). */
  readonly testid: string;
}

/** Rekord oceny w karcie werdyktu, w opakowaniu z identyfikatorem ekranu. */
export function OcenaNiewykonana({ ocena, testid }: OcenaNiewykonanaProps) {
  return (
    <div
      data-testid={testid}
      data-status={ocena.status_maszynowy}
      data-semantyka={ocena.etykieta.semantyka}
    >
      <KartaWerdyktu rekord={ocena} />
    </div>
  );
}

export interface SekcjaAudytowaProps {
  /** Nagłówek sekcji Z BACKENDU (np. „Wynik solvera niezwalidowanego — …"). */
  readonly naglowek: string;
  /** Prefiks identyfikatorów testowych: sekcja, `-przelacz`, `-tresc`. */
  readonly testid: string;
  readonly children: ReactNode;
}

/**
 * Sekcja audytowa — liczby solvera, który NIE jest podstawą oceny, zawsze zwinięte
 * na starcie i zawsze pod nagłówkiem z backendu mówiącym, czym ten materiał jest.
 * Pierwszy plan ekranu nie niesie tych liczb; rozwinięcie jest świadomym krokiem.
 */
export function SekcjaAudytowa({ naglowek, testid, children }: SekcjaAudytowaProps) {
  const [otwarta, setOtwarta] = useState(false);
  return (
    <section
      data-testid={testid}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '8px 12px',
        border: '1px dashed var(--mvd-line)',
        borderRadius: 6,
        color: 'var(--mvd-ink)',
        fontFamily: 'var(--mvd-font-sans)',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, flex: '1 1 240px', color: 'var(--mvd-muted)', fontWeight: 600 }}>
          {naglowek}
        </p>
        <button
          type="button"
          aria-expanded={otwarta}
          data-testid={`${testid}-przelacz`}
          onClick={() => setOtwarta((stan) => !stan)}
          style={{
            padding: '3px 10px',
            border: '1px solid var(--mvd-line)',
            borderRadius: 4,
            background: 'var(--mvd-panel)',
            color: 'var(--mvd-ink)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {otwarta ? OCENA_NIEWYKONANA_STRINGS.audytUkryj : OCENA_NIEWYKONANA_STRINGS.audytPokaz}
        </button>
      </div>
      {otwarta && (
        <div data-testid={`${testid}-tresc`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {children}
        </div>
      )}
    </section>
  );
}
