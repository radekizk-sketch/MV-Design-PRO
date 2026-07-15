/*
 * Porównanie 2 szablonów (karta §3/§4.3): tabela różnic — pola, aparaty,
 * transformator. Funkcja czysta `zbudujWierszePorownania` przygotowuje wiersze
 * (cecha / wartość A / wartość B / czy identyczne) z pełnych danych
 * `StationTemplateFull`; komponent renderuje tabelę i znacznik „różne"/
 * „identyczne" per wiersz (`Tag` wzorzec z `spaces/projekt/Kafel.tsx`, lokalna
 * kopia stylu — bez importu z równoległej karty projektu, żeby nie tworzyć
 * zależności między kartami epików).
 */

import type { CatalogChoice, ProtectionRelaySpec, StationTemplateFull } from './api/szablonyClient';
import { SZABLONY_STRINGS } from './strings';

function etykietyOpcji(opcje: readonly CatalogChoice[]): string {
  return opcje.length > 0 ? opcje.map((o) => o.label_pl).join(', ') : '—';
}

function etykietyZabezpieczen(pozycje: readonly ProtectionRelaySpec[]): string {
  return pozycje.length > 0 ? pozycje.map((p) => p.label_pl).join(', ') : '—';
}

function opisDer(szablon: StationTemplateFull): string {
  if (szablon.schema.der_options.length === 0) return '—';
  return szablon.schema.der_options
    .map((d) => `${d.label_pl} (${d.default_count} × ${d.default_p_mw_each} MW)`)
    .join(', ');
}

/** Pojedynczy wiersz tabeli porównania. */
export interface WierszPorownania {
  cecha: string;
  wartoscA: string;
  wartoscB: string;
  identyczne: boolean;
}

/** Buduje wiersze porównania dwóch pełnych szablonów — funkcja czysta. */
export function zbudujWierszePorownania(a: StationTemplateFull, b: StationTemplateFull): WierszPorownania[] {
  function wiersz(cecha: string, wartoscA: string, wartoscB: string): WierszPorownania {
    return { cecha, wartoscA, wartoscB, identyczne: wartoscA === wartoscB };
  }

  return [
    wiersz(SZABLONY_STRINGS.porownanieWierszLiczbaPol, String(a.schema.sn_bays_count.default), String(b.schema.sn_bays_count.default)),
    wiersz(
      SZABLONY_STRINGS.porownanieWierszRolePol,
      a.schema.sn_bay_roles.map((r) => r.label_pl).join(', ') || '—',
      b.schema.sn_bay_roles.map((r) => r.label_pl).join(', ') || '—',
    ),
    wiersz(SZABLONY_STRINGS.porownanieWierszLiczbaTransformatorow, String(a.schema.transformer_count.default), String(b.schema.transformer_count.default)),
    wiersz(SZABLONY_STRINGS.porownanieWierszTransformator, etykietyOpcji(a.schema.transformer_options), etykietyOpcji(b.schema.transformer_options)),
    wiersz(SZABLONY_STRINGS.porownanieWierszOdplywyNn, String(a.schema.nn_feeders_count.default), String(b.schema.nn_feeders_count.default)),
    wiersz(SZABLONY_STRINGS.porownanieWierszDer, opisDer(a), opisDer(b)),
    wiersz(SZABLONY_STRINGS.porownanieWierszAparatyNn, etykietyOpcji(a.schema.nn_feeder_cb_options), etykietyOpcji(b.schema.nn_feeder_cb_options)),
    wiersz(
      SZABLONY_STRINGS.porownanieWierszZabezpieczenia,
      etykietyZabezpieczen(a.schema.sn_bay_protection_options),
      etykietyZabezpieczen(b.schema.sn_bay_protection_options),
    ),
  ];
}

export interface PorownanieSzablonowProps {
  a: StationTemplateFull;
  b: StationTemplateFull;
  onZamknij: () => void;
}

export function PorownanieSzablonow({ a, b, onZamknij }: PorownanieSzablonowProps) {
  const wiersze = zbudujWierszePorownania(a, b);

  return (
    <div className="mvd-szablony-porownanie" data-testid="mvd-porownanie" aria-label={SZABLONY_STRINGS.porownanieTytul}>
      <header className="mvd-szablony-porownanie-head">
        <h3>{SZABLONY_STRINGS.porownanieTytul}</h3>
        <button type="button" className="mvd-btn mvd-btn-ghost" onClick={onZamknij}>
          {SZABLONY_STRINGS.porownanieZamknij}
        </button>
      </header>
      <div className="mvd-cases-scroll">
        <table className="mvd-cases-table">
          <thead>
            <tr>
              <th scope="col">{SZABLONY_STRINGS.porownanieCecha}</th>
              <th scope="col">{a.name_pl}</th>
              <th scope="col">{b.name_pl}</th>
              <th scope="col">{SZABLONY_STRINGS.porownanieRoznica}</th>
            </tr>
          </thead>
          <tbody>
            {wiersze.map((w) => (
              <tr key={w.cecha}>
                <td>{w.cecha}</td>
                <td>{w.wartoscA}</td>
                <td>{w.wartoscB}</td>
                <td>
                  <span className={w.identyczne ? 'mvd-tag mvd-tag-mut' : 'mvd-tag mvd-tag-warn'}>
                    {w.identyczne ? SZABLONY_STRINGS.porownanieIdentyczne : SZABLONY_STRINGS.porownanieRozne}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
