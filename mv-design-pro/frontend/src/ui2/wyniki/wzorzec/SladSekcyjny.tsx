/*
 * SladSekcyjny — WSPÓLNY komponent śladu obliczeń (WHITE BOX) w SEKCJACH
 * (ZWARCIA-PRO F3 pkt 8). Zamiast jednego długiego bloku (SladWywodu) kroki
 * przychodzą Z BACKENDU pogrupowane w sekcje `{tytul, kroki, norma?}` —
 * każda sekcja to rozwijany akordeon (domyślnie zwinięta, aria-expanded),
 * sekcja z `norma` pokazuje odwołanie normowe przy tytule. Kroki renderowane
 * jak w SladWywodu: `latex` przez KaTeX (`MathBlock`, fail-safe), krok
 * tekstowy monospace. ZERO fizyki, ZERO arytmetyki w UI.
 *
 * Dodatkowo (pkt 10): opcjonalny panel metody — lista pozycji `{pozycja_pl, wartosc_pl}`
 * (fakty biegu: norma, c, maszyny, reguła małych silników, powtarzalność), renderowany jako
 * ostatnia sekcja akordeonu. Panel NIE niesie statusu PASS/FAIL: żadna pozycja nie jest
 * oceną wymagania (kontrakt werdyktu wyjaśnialnego) — zdanie pozycji z backendu mówi wszystko.
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

/** Pozycja panelu metody (kształt 1:1 odpowiedzi backendu) — fakt biegu, nie ocena. */
export interface PozycjaWalidacji {
  readonly pozycja_pl: string;
  readonly wartosc_pl: string;
}

/** Panel metody — ostatnia sekcja akordeonu (pozycje faktów biegu, nie kroki). */
export interface WalidacjaWywodu {
  readonly tytul: string;
  readonly pozycje: readonly PozycjaWalidacji[];
}

export interface SladSekcyjnyProps {
  /** Sekcje wywodu (z backendu). Pusta lista → komponent nie renderuje się. */
  sekcje: readonly SekcjaWywodu[];
  /** Panel metody (opcjonalny, na końcu wywodu sekcyjnego). */
  walidacja?: WalidacjaWywodu;
  /** Prefiks `data-testid` (np. „mvd-zwarcia-wklady-slad"). */
  testIdPrefix: string;
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
                    <li key={pozycja.pozycja_pl} className="mvd-wyn-walid-poz">
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
