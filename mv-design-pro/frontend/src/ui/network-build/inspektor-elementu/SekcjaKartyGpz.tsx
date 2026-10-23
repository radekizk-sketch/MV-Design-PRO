/**
 * Karta GPZ-H5-SLD etap 2 (wymaganie 1) — karta GPZ w prawym inspektorze: bilans zasilania
 * i odpływów (`gpz.header.balance`), przeciążenia (`gpz.header.alarms`), tabela pól z rolą,
 * plakietkami automatyki (`gpz.status_flags`) i wielkościami P/Q/I/U z wyniku rozpływu
 * (`gpz.measurements`) oraz jedna zbiorcza informacja o polach bez aparatu w modelu.
 * Klucze parytetu (`docs/sld/SLD_VISUAL_PARITY_CHECKLIST.md` GPZ-06/07/24/25) są na
 * elementach tej karty — schemat ich już nie niesie. Stan: `stanKartyGpz.ts`.
 */
import type { JSX } from 'react';

import type { StanKartyGpz } from './stanKartyGpz';

const STYL_SEKCJI = {
  borderColor: 'var(--mvd-line)',
  fontSize: 'var(--mvd-font-size-data)',
  color: 'var(--mvd-ink)',
} as const;

const NAGLOWKI_WARTOSCI = [
  { klucz: 'p', naglowek: 'P [MW]' },
  { klucz: 'q', naglowek: 'Q [Mvar]' },
  { klucz: 'i', naglowek: 'I [A]' },
  { klucz: 'u', naglowek: 'U [kV]' },
] as const;

export function SekcjaKartyGpz({ karta }: { readonly karta: StanKartyGpz }): JSX.Element {
  const kolorWyniku = karta.wynik === 'nieaktualny' ? 'var(--mvd-warn)' : undefined;
  return (
    <section
      data-testid="inspektor-karta-gpz"
      data-gpz-wynik={karta.wynik}
      data-run-id={karta.runId ?? undefined}
      aria-label="Karta GPZ"
      className="flex flex-col gap-2 border-b px-4 py-3"
      style={STYL_SEKCJI}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold" data-testid="inspektor-gpz-tytul" style={{ fontSize: 'var(--mvd-font-size-data)' }}>
          {karta.tytul}
        </h4>
        {karta.wynik === 'nieaktualny' && (
          <span className="mvd-tag mvd-tag-warn" data-testid="inspektor-gpz-nieaktualne">Nieaktualne</span>
        )}
      </div>
      <dl className="flex flex-col gap-1" data-parity-key="gpz.header.balance">
        <div className="mvd-kafel-kv-row">
          <dt className="mvd-kafel-kv-label">Zasilanie</dt>
          <dd className="mvd-kafel-kv-value mvd-num" data-testid="inspektor-gpz-zasilanie" style={{ color: kolorWyniku }}>{karta.zasilanie}</dd>
        </div>
        <div className="mvd-kafel-kv-row">
          <dt className="mvd-kafel-kv-label">Odpływy</dt>
          <dd className="mvd-kafel-kv-value mvd-num" data-testid="inspektor-gpz-odplywy" style={{ color: kolorWyniku }}>{karta.odplywy}</dd>
        </div>
        <div className="mvd-kafel-kv-row" data-parity-key="gpz.header.alarms">
          <dt className="mvd-kafel-kv-label">Przeciążenia</dt>
          <dd className="mvd-kafel-kv-value mvd-num" data-testid="inspektor-gpz-alarmy" style={{ color: kolorWyniku }}>{karta.alarmy}</dd>
        </div>
      </dl>
      {karta.polaBezAparatu && (
        <p data-testid="inspektor-gpz-pola-bez-aparatu" style={{ color: 'var(--mvd-warn)' }}>{karta.polaBezAparatu}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="inspektor-gpz-pola" data-parity-key="gpz.measurements">
          <thead>
            <tr style={{ color: 'var(--mvd-muted)' }}>
              <th scope="col" className="text-left font-normal">Pole</th>
              <th scope="col" className="text-left font-normal">Rola</th>
              <th scope="col" className="text-left font-normal">Automatyka</th>
              {NAGLOWKI_WARTOSCI.map((k) => (
                <th key={k.klucz} scope="col" className="text-right font-normal">{k.naglowek}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {karta.wiersze.map((wiersz) => (
              <tr
                key={wiersz.bayRef}
                data-testid={`inspektor-gpz-pole-${wiersz.bayRef}`}
                data-gpz-rola={wiersz.rola}
                data-gpz-stan-pola={wiersz.stanDanych ?? (wiersz.napisStanu ? 'niewykonane' : 'z-danymi')}
              >
                <td>{wiersz.oznaczenie}</td>
                <td>{wiersz.rolaPl}</td>
                <td data-parity-key={wiersz.plakietki.length > 0 ? 'gpz.status_flags' : undefined}>
                  {wiersz.plakietki.length === 0
                    ? '—'
                    : wiersz.plakietki.map((plakietka) => (
                        <abbr
                          key={plakietka.kod}
                          className="mvd-tag"
                          title={plakietka.opisPl}
                          data-testid={`inspektor-gpz-plakietka-${wiersz.bayRef}-${plakietka.kod}`}
                        >
                          {plakietka.kod}
                        </abbr>
                      ))}
                </td>
                {wiersz.wartosci ? (
                  NAGLOWKI_WARTOSCI.map((k) => (
                    <td
                      key={k.klucz}
                      className="mvd-num text-right"
                      data-testid={`inspektor-gpz-wartosc-${wiersz.bayRef}-${k.klucz}`}
                      style={{ color: kolorWyniku }}
                    >
                      {wiersz.wartosci![k.klucz]}
                    </td>
                  ))
                ) : (
                  <td
                    colSpan={NAGLOWKI_WARTOSCI.length}
                    className="text-right"
                    data-testid={`inspektor-gpz-stan-${wiersz.bayRef}`}
                    style={{ color: 'var(--mvd-muted)' }}
                  >
                    {wiersz.napisStanu ?? '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
