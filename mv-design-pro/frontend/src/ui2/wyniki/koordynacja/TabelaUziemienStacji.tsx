/**
 * Uziemienia stacji — OSOBNA sekcja z własnym nagłówkiem (korekta właściciela 6), nie wiersze
 * tabeli zabezpieczeń. Napięcie uziomowe U_E i napięcie dotykowe spodziewane U_T to dwie
 * kolumny i dwa pojęcia; U_Tp(t_F) porównuje się z U_T (U_E ≤ U_Tp to jawny warunek
 * wystarczający, opisany w przyczynie wiersza). Komórka bez liczby niesie odsyłacz do przypisu
 * (`przypisy_kolumn` → `przypisy_uziemien`), a każdy przypis stoi pod tabelą RAZ.
 *
 * Dane: `wynik.wiersze_uziemien` (backend `ocena_ziemnozwarciowa.py`). ZERO fizyki w UI.
 */

import { Fragment, useState } from 'react';

import { MathInline, MathRenderer } from '../../../ui/proof/MathRenderer';
import { KartaWerdyktu, ZnakWerdyktu } from '../wzorzec/KartaWerdyktu';
import { liczbaEaz } from './liczbaEaz';
import { rekordyWiersza, type WierszUziemienia, type WynikOcenyZiemnozwarciowej } from './ocenaZiemnozwarciowa';
import { KOORDYNACJA_STRINGS as T } from './strings';

type KluczKolumny = keyof Pick<
  WierszUziemienia,
  | 'prad_uziomowy_a'
  | 'rezystancja_uziomu_ohm'
  | 'napiecie_uziomowe_v'
  | 'napiecie_dotykowe_v'
  | 'napiecie_dotykowe_dopuszczalne_v'
  | 'rezystancja_maksymalna_ohm'
  | 'napiecie_krokowe_v'
  | 't_f_s'
>;

/** Kolumny: symbol (KaTeX) i jednostka nagłówka; `miejsca` — jednostka formatowania liczby. */
const KOLUMNY: readonly { klucz: KluczKolumny; naglowek: string; jednostka: string; miejsca: string }[] = [
  { klucz: 'prad_uziomowy_a', naglowek: T.uziemieniaKolIe, jednostka: 'A', miejsca: 'A' },
  { klucz: 'rezystancja_uziomu_ohm', naglowek: T.uziemieniaKolRe, jednostka: 'Ω', miejsca: '1' },
  { klucz: 'napiecie_uziomowe_v', naglowek: T.uziemieniaKolUe, jednostka: 'V', miejsca: 'V' },
  { klucz: 'napiecie_dotykowe_v', naglowek: T.uziemieniaKolUt, jednostka: 'V', miejsca: 'V' },
  { klucz: 'napiecie_dotykowe_dopuszczalne_v', naglowek: T.uziemieniaKolUtp, jednostka: 'V', miejsca: 'V' },
  { klucz: 'rezystancja_maksymalna_ohm', naglowek: T.uziemieniaKolRemax, jednostka: 'Ω', miejsca: '1' },
  { klucz: 'napiecie_krokowe_v', naglowek: T.uziemieniaKolUs, jednostka: 'V', miejsca: 'V' },
  { klucz: 't_f_s', naglowek: T.uziemieniaKolTf, jednostka: 's', miejsca: 's' },
];

export function TabelaUziemienStacji({
  wiersze,
  przypisy,
  wynik,
  testid,
}: {
  wiersze: readonly WierszUziemienia[];
  przypisy: Readonly<Record<string, string>>;
  wynik: WynikOcenyZiemnozwarciowej;
  testid: string;
}) {
  const [otwarte, setOtwarte] = useState<ReadonlySet<string>>(new Set());
  // Numeracja przypisów w kolejności pierwszego użycia (deterministyczna — kolejność wierszy
  // i kolumn z backendu); przypis wypisany pod tabelą raz.
  const numery = new Map<string, number>();
  for (const w of wiersze) {
    for (const k of KOLUMNY) {
      const p = w[k.klucz] === null ? w.przypisy_kolumn[k.klucz] : undefined;
      if (p && przypisy[p] && !numery.has(p)) numery.set(p, numery.size + 1);
    }
  }
  return (
    <section className="mvd-eaz-rodzina" data-testid={testid}>
      <h5>{T.uziemieniaTytul}</h5>
      <div className="mvd-eaz-przewijanie">
        <table className="mvd-eaz-tabela">
          <thead>
            <tr>
              <th>{T.uziemieniaKolStacja}</th>
              {KOLUMNY.map((k) => (
                <th key={k.klucz} className="mvd-eaz-liczba" data-kolumna={k.klucz}>
                  <MathInline latex={k.naglowek} /> [{k.jednostka}]
                </th>
              ))}
              <th className="mvd-eaz-stan">{T.ziemneKolStan}</th>
              <th>
                <span className="mvd-sr-only">{T.ziemneSzczegoly}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {wiersze.map((w) => {
              const otwarty = otwarte.has(w.stacja_ref);
              return (
                <Fragment key={w.stacja_ref}>
                  <tr data-testid={`${testid}-wiersz`} data-stacja={w.stacja_ref} data-status={w.stan}>
                    <td title={`${w.punkt_pl} · ${w.sposob_pl}`}>{w.stacja_pl}</td>
                    {KOLUMNY.map((k) => {
                      const wartosc = w[k.klucz];
                      const przypis = wartosc === null ? w.przypisy_kolumn[k.klucz] : undefined;
                      const nr = przypis ? numery.get(przypis) : undefined;
                      return (
                        <td
                          key={k.klucz}
                          className="mvd-num mvd-eaz-liczba"
                          data-testid={`${testid}-${k.klucz}`}
                          title={przypis ? przypisy[przypis] : undefined}
                        >
                          {liczbaEaz(wartosc, k.miejsca)}
                          {nr !== undefined ? <sup className="mvd-eaz-odsylacz">{nr}</sup> : null}
                        </td>
                      );
                    })}
                    <td className="mvd-eaz-stan">
                      <ZnakWerdyktu etykieta={w.etykieta} przyczyna={w.przyczyna_pl} status={w.stan} testid={`${testid}-stan`} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="mvd-eaz-akcja"
                        aria-expanded={otwarty}
                        title={T.ziemneSzczegolyOpis}
                        data-testid={`${testid}-szczegoly-przelacz`}
                        onClick={() =>
                          setOtwarte((o) => {
                            const n = new Set(o);
                            if (n.has(w.stacja_ref)) n.delete(w.stacja_ref);
                            else n.add(w.stacja_ref);
                            return n;
                          })
                        }
                      >
                        {otwarty ? T.ziemneSzczegolyZwin : T.ziemneSzczegoly}
                      </button>
                    </td>
                  </tr>
                  {otwarty ? (
                    <tr className="mvd-eaz-wiersz-szczegolow">
                      <td colSpan={KOLUMNY.length + 3}>
                        <div className="mvd-eaz-szczegoly" data-testid={`${testid}-szczegoly`}>
                          <p>{w.przyczyna_pl}</p>
                          {w.wzor_pradu_latex ? <MathRenderer latex={w.wzor_pradu_latex} block /> : null}
                          {w.r_e_max_latex ? <MathRenderer latex={w.r_e_max_latex} block /> : null}
                          {rekordyWiersza(wynik, w.kryteria).map((k) => (
                            <KartaWerdyktu key={k.kryterium_id} rekord={k} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {numery.size > 0 ? (
        <ol className="mvd-eaz-przypisy" data-testid={`${testid}-przypisy`}>
          {[...numery.entries()].map(([klucz, nr]) => (
            <li key={klucz} value={nr}>
              {przypisy[klucz]}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
