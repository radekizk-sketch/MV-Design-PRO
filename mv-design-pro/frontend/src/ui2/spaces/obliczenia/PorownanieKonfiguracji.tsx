/*
 * Porównanie konfiguracji 2+ przypadków (W-501) — tabela różnic „czym się różnią"
 * (AUDYT_RADY_SPECJALISTOW W-501: tabela porównawcza konfiguracji). W pełni sterowana
 * propsami (pełne rekordy `StudyCase` z konfiguracją). Różnice liczy czysta funkcja
 * `rozniceKonfiguracji` (adapter); tu wyłącznie prezentacja. Przełącznik „Tylko różnice"
 * ukrywa wiersze identyczne we wszystkich przypadkach.
 */

import { useState } from 'react';
import type { StudyCase } from '../../../ui/study-cases/types';
import { rozniceKonfiguracji } from './adapters/przypadkiAdapter';
import { PRZYPADKI_STRINGS as T } from './strings';

interface PorownanieKonfiguracjiProps {
  przypadki: StudyCase[];
  ladowanie: boolean;
  blad: string | null;
}

export function PorownanieKonfiguracji({ przypadki, ladowanie, blad }: PorownanieKonfiguracjiProps) {
  const [tylkoRoznice, setTylkoRoznice] = useState(false);

  if (ladowanie) {
    return (
      <div className="mvd-karta-pusto" data-testid="mvd-porownanie-ladowanie">
        {T.porownanieLadowanie}
      </div>
    );
  }
  if (blad) {
    return (
      <div className="mvd-karta-pusto mvd-karta-blad" role="alert" data-testid="mvd-porownanie-blad">
        {T.porownanieBlad}
      </div>
    );
  }
  if (przypadki.length < 2) {
    return (
      <div className="mvd-karta-pusto" data-testid="mvd-porownanie-zamalo">
        {T.porownanieZaMalo}
      </div>
    );
  }

  const wiersze = rozniceKonfiguracji(przypadki);
  const czyRozne = wiersze.some((w) => w.rozne);
  const widoczne = tylkoRoznice ? wiersze.filter((w) => w.rozne) : wiersze;

  return (
    <article className="mvd-porownanie" data-testid="mvd-porownanie">
      <header className="mvd-porownanie-naglowek">
        <h3 className="mvd-karta-tytul">{T.porownanieTytul}</h3>
        <label className="mvd-porownanie-filtr">
          <input
            type="checkbox"
            checked={tylkoRoznice}
            onChange={(e) => setTylkoRoznice(e.target.checked)}
            data-testid="mvd-porownanie-tylko-roznice"
          />
          {T.tylkoRoznice}
        </label>
      </header>

      {!czyRozne && (
        <p className="mvd-porownanie-bez-roznic" data-testid="mvd-porownanie-bez-roznic">
          {T.porownanieBezRoznic}
        </p>
      )}

      <div className="mvd-cases-scroll">
        <table className="mvd-porownanie-tabela">
          <thead>
            <tr>
              <th>{T.kolParametr}</th>
              {przypadki.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {widoczne.map((w) => (
              <tr
                key={w.pole}
                className={w.rozne ? 'mvd-porownanie-wiersz mvd-rozne' : 'mvd-porownanie-wiersz'}
                data-rozne={w.rozne}
              >
                <td>
                  {w.etykieta}
                  {w.rozne && (
                    <span className="mvd-porownanie-znacznik">{T.znacznikRoznica}</span>
                  )}
                </td>
                {w.wartosci.map((wartosc, i) => (
                  <td key={przypadki[i].id} className="mvd-num">
                    {wartosc}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
