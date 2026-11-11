/*
 * Ślad WHITE BOX testu NC RfG renderowany INLINE (scalenie U3/U4 #5).
 * Rdzeń (`ncrfg_ptpiree/engine.py`, B-01) pisze wzór zapisem ASCII/Unicode; LaTeX TEGO
 * SAMEGO wzoru wydaje katalog testów (`wzory_sladu_latex`, rejestr
 * `application/ncrfg_compliance/wzory_sladu.py` z testem kompletności wyprowadzonym z AST
 * rdzenia). Wzór z wpisem renderuje się przez KaTeX (`MathBlock`) — kontrakt prezentacji
 * inżynierskiej; zapis rdzenia zostaje tylko jako stan awaryjny, gdy katalog nie dotarł.
 * Weryfikację jednostek renderuje tak samo: zdanie słowami + algebra jednostek przez KaTeX
 * (`jednostki_sladu` z katalogu). Kanon kroku zachowany: Wzór → Dane → Podstawienie → Wynik → Weryfikacja jednostek.
 * Zero ocen własnych.
 */

import { MathBlock, MathInline } from '../../../ui/proof/MathRenderer';
import type { JednostkiKrokuSladu, KrokSladuNcRfg } from '../ncrfg/typy';
import { MACIERZ_STRINGS, opiszMetryke } from './strings';

type KrokSladu = KrokSladuNcRfg;

export interface SladTestuProps {
  readonly kroki: readonly KrokSladu[];
  /** Zapis wzoru rdzenia → LaTeX (`KatalogNcRfg.wzory_sladu_latex`). */
  readonly wzoryLatex: Readonly<Record<string, string>>;
  /**
   * Tekst weryfikacji jednostek rdzenia → zdanie słowami + algebra jednostek w LaTeX
   * (`KatalogNcRfg.jednostki_sladu`). Algebra jednostek („% − % = pp") nie trafia na ekran
   * jako tekst: zdanie stoi słowami, a równanie jednostek renderuje KaTeX.
   */
  readonly jednostkiSladu: Readonly<Record<string, JednostkiKrokuSladu>>;
}

function WeryfikacjaJednostek({ wpis, zapisRdzenia }: { wpis: JednostkiKrokuSladu | undefined; zapisRdzenia: string }) {
  // Katalog nie dotarł (stan awaryjny) — zapis rdzenia jako zapis techniczny, jak przy wzorze.
  if (wpis === undefined) return <code className="mvd-oze-num">{zapisRdzenia}</code>;
  return (
    <span data-testid="mvd-oze-slad-jednostki">
      {wpis.opis_pl}
      {wpis.latex !== null ? (
        <>
          {' '}
          <MathInline latex={wpis.latex} />
        </>
      ) : null}
    </span>
  );
}

function Pole({ etykieta, dzieci }: { etykieta: string; dzieci: React.ReactNode }) {
  return (
    <div className="mvd-oze-slad-pole">
      <span className="mvd-oze-panel-etyk">{etykieta}</span>
      <div className="mvd-oze-slad-tresc">{dzieci}</div>
    </div>
  );
}

function Wartosci({ dane }: { dane: Readonly<Record<string, unknown>> }) {
  const wpisy = Object.entries(dane);
  if (wpisy.length === 0) return <span className="mvd-oze-panel-etyk">—</span>;
  return (
    <div>
      {wpisy.map(([klucz, wartosc]) => (
        <div key={klucz} className="mvd-oze-metryka">
          <span>{klucz}</span>
          <span className="mvd-oze-num">{opiszMetryke(wartosc)}</span>
        </div>
      ))}
    </div>
  );
}

export function SladTestu({ kroki, wzoryLatex, jednostkiSladu }: SladTestuProps): JSX.Element {
  if (kroki.length === 0) {
    return (
      <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-slad-pusty">
        {MACIERZ_STRINGS.sladPusty}
      </p>
    );
  }
  return (
    <ol className="mvd-oze-slad-lista" data-testid="mvd-oze-slad-kroki">
      {kroki.map((krok) => (
        <li key={`${krok.step}-${krok.key}`} className="mvd-oze-slad-krok">
          <Pole
            etykieta={MACIERZ_STRINGS.sladWzor}
            dzieci={
              wzoryLatex[krok.formula] !== undefined ? (
                <MathBlock latex={wzoryLatex[krok.formula]} />
              ) : (
                <code className="mvd-oze-num">{krok.formula}</code>
              )
            }
          />
          <Pole etykieta={MACIERZ_STRINGS.sladDane} dzieci={<Wartosci dane={krok.data} />} />
          {krok.substitution ? (
            <Pole
              etykieta={MACIERZ_STRINGS.sladPodstawienie}
              dzieci={<span className="mvd-oze-slad-wartosc">{krok.substitution}</span>}
            />
          ) : null}
          <Pole etykieta={MACIERZ_STRINGS.sladWynik} dzieci={<Wartosci dane={krok.result} />} />
          {krok.unit_check ? (
            <Pole
              etykieta={MACIERZ_STRINGS.sladJednostki}
              dzieci={
                <WeryfikacjaJednostek
                  wpis={jednostkiSladu[krok.unit_check]}
                  zapisRdzenia={krok.unit_check}
                />
              }
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
