/*
 * SladSekcyjny — WSPÓLNY komponent śladu obliczeń (WHITE BOX) w SEKCJACH
 * (ZWARCIA-PRO F3 pkt 8). Zamiast jednego długiego bloku (SladWywodu) kroki
 * przychodzą Z BACKENDU pogrupowane w sekcje `{tytul, kroki, norma?}` —
 * każda sekcja to rozwijany akordeon (domyślnie zwinięta, aria-expanded),
 * sekcja z `norma` pokazuje odwołanie normowe przy tytule. Kroki renderowane
 * jak w SladWywodu: `latex` przez KaTeX (`MathBlock`, fail-safe), krok
 * tekstowy monospace. ZERO fizyki, ZERO arytmetyki w UI.
 *
 * Dodatkowo (pkt 10): opcjonalny panel walidacji metody — CHECKLISTA pozycji
 * `{pozycja_pl, wartosc_pl, status}` z ikonami statusu (nie kroki wywodu),
 * renderowany jako ostatnia sekcja akordeonu. Statusy wyłącznie z backendu.
 *
 * Wzorzec interakcji: zwinięty przycisk „Pokaż ślad obliczeń" (zasada śladu
 * na żądanie, 2026-07-22) → lista sekcji, każda zwinięta → klik sekcji →
 * kroki tej sekcji (bez przeładowania ekranu).
 */

import { useState } from 'react';
import { MathBlock } from '../../../ui/proof/MathRenderer';
import type { KrokWywodu } from './SladWywodu';
import { WZORZEC_STRINGS } from './strings';

/** Sekcja wywodu z backendu: tytuł + kroki, opcjonalne odwołanie normowe. */
export interface SekcjaWywodu {
  readonly tytul: string;
  readonly kroki: readonly KrokWywodu[];
  readonly norma?: string;
}

/** Status pozycji walidacji — wyłącznie z backendu (zero ocen w UI). */
export type StatusPozycjiWalidacji = 'PASS' | 'FAIL' | 'INFO';

/** Pozycja checklisty walidacji metody (kształt 1:1 odpowiedzi backendu). */
export interface PozycjaWalidacji {
  readonly pozycja_pl: string;
  readonly wartosc_pl: string;
  readonly status: StatusPozycjiWalidacji;
}

/** Panel walidacji metody — ostatnia sekcja akordeonu (checklista, nie kroki). */
export interface WalidacjaWywodu {
  readonly tytul: string;
  readonly pozycje: readonly PozycjaWalidacji[];
}

export interface SladSekcyjnyProps {
  /** Sekcje wywodu (z backendu). Pusta lista → komponent nie renderuje się. */
  sekcje: readonly SekcjaWywodu[];
  /** Checklista walidacji metody (opcjonalna, na końcu wywodu sekcyjnego). */
  walidacja?: WalidacjaWywodu;
  /** Prefiks `data-testid` (np. „mvd-zwarcia-wklady-slad"). */
  testIdPrefix: string;
}

const IKONA_STATUSU: Record<StatusPozycjiWalidacji, string> = {
  PASS: '✓',
  FAIL: '✗',
  INFO: 'i',
};

const KLASA_STATUSU: Record<StatusPozycjiWalidacji, string> = {
  PASS: 'mvd-wyn-walid-ok',
  FAIL: 'mvd-wyn-walid-err',
  INFO: 'mvd-wyn-walid-info',
};

function opisStatusu(status: StatusPozycjiWalidacji): string {
  if (status === 'PASS') return WZORZEC_STRINGS.walidacjaSpelnione;
  if (status === 'FAIL') return WZORZEC_STRINGS.walidacjaNiespelnione;
  return WZORZEC_STRINGS.walidacjaInformacja;
}

function KrokiSekcji({ kroki, testId }: { kroki: readonly KrokWywodu[]; testId: string }) {
  return (
    <ol className="mvd-wyn-slad" data-testid={testId}>
      {kroki.map((krok) => (
        <li key={krok.tekst} className="mvd-wyn-slad-krok">
          {krok.latex ? (
            <MathBlock latex={krok.latex} />
          ) : (
            <code className="mvd-num">{krok.tekst}</code>
          )}
        </li>
      ))}
    </ol>
  );
}

export function SladSekcyjny({ sekcje, walidacja, testIdPrefix }: SladSekcyjnyProps) {
  const [widoczny, setWidoczny] = useState(false);
  // Klucze otwartych sekcji (indeksowe — nazwy maszyn mogą się powtarzać).
  const [otwarte, setOtwarte] = useState<ReadonlySet<string>>(new Set());
  if (sekcje.length === 0) return null;

  const przelacz = (klucz: string) =>
    setOtwarte((stan) => {
      const nastepny = new Set(stan);
      if (nastepny.has(klucz)) {
        nastepny.delete(klucz);
      } else {
        nastepny.add(klucz);
      }
      return nastepny;
    });

  return (
    <div className="mvd-wyn-slad-blok">
      <button
        type="button"
        className="mvd-wyn-slad-btn"
        aria-expanded={widoczny}
        data-testid={`${testIdPrefix}-btn`}
        onClick={() => setWidoczny((w) => !w)}
      >
        {widoczny ? WZORZEC_STRINGS.sladUkryj : WZORZEC_STRINGS.sladPokaz}
      </button>
      {widoczny && (
        <div data-testid={testIdPrefix}>
          <span className="mvd-wyn-slad-tytul">{WZORZEC_STRINGS.sladTytul}</span>
          {sekcje.map((sekcja, indeks) => {
            const klucz = `s${indeks}`;
            const otwarta = otwarte.has(klucz);
            return (
              <section key={klucz} className="mvd-wyn-slad-sekcja">
                <button
                  type="button"
                  className="mvd-wyn-slad-sekcja-btn"
                  aria-expanded={otwarta}
                  data-testid={`${testIdPrefix}-sekcja-btn-${indeks}`}
                  onClick={() => przelacz(klucz)}
                >
                  <span className="mvd-wyn-slad-sekcja-tytul">{sekcja.tytul}</span>
                  {sekcja.norma && (
                    <span className="mvd-wyn-slad-norma mvd-num">{sekcja.norma}</span>
                  )}
                  <span className="mvd-wyn-zalozenia-zwijak">
                    {otwarta ? WZORZEC_STRINGS.zwin : WZORZEC_STRINGS.rozwin}
                  </span>
                </button>
                {otwarta && (
                  <KrokiSekcji
                    kroki={sekcja.kroki}
                    testId={`${testIdPrefix}-sekcja-kroki-${indeks}`}
                  />
                )}
              </section>
            );
          })}
          {walidacja && walidacja.pozycje.length > 0 && (
            <section className="mvd-wyn-slad-sekcja">
              <button
                type="button"
                className="mvd-wyn-slad-sekcja-btn"
                aria-expanded={otwarte.has('walidacja')}
                data-testid={`${testIdPrefix}-walidacja-btn`}
                onClick={() => przelacz('walidacja')}
              >
                <span className="mvd-wyn-slad-sekcja-tytul">{walidacja.tytul}</span>
                <span className="mvd-wyn-zalozenia-zwijak">
                  {otwarte.has('walidacja') ? WZORZEC_STRINGS.zwin : WZORZEC_STRINGS.rozwin}
                </span>
              </button>
              {otwarte.has('walidacja') && (
                <ul className="mvd-wyn-walid" data-testid={`${testIdPrefix}-walidacja`}>
                  {walidacja.pozycje.map((pozycja) => (
                    <li
                      key={pozycja.pozycja_pl}
                      className="mvd-wyn-walid-poz"
                      data-status={pozycja.status}
                    >
                      <span
                        className={KLASA_STATUSU[pozycja.status]}
                        role="img"
                        aria-label={opisStatusu(pozycja.status)}
                      >
                        {IKONA_STATUSU[pozycja.status]}
                      </span>
                      <span className="mvd-wyn-walid-etykieta">{pozycja.pozycja_pl}</span>
                      <span className="mvd-wyn-walid-wartosc mvd-num">{pozycja.wartosc_pl}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
