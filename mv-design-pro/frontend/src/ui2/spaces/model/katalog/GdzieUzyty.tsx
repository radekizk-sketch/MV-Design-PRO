/**
 * GdzieUzyty — lista elementów modelu używających danego typu katalogowego.
 *
 * Źródłem jest snapshot (tylko odczyt): elementy wiązane przez `catalog_ref`
 * (patrz `ui/catalog/catalogSnapshot.ts`). Kliknięcie elementu wywołuje callback
 * `onPokazElement(ref)` — nawigacja do elementu w modelu (kryterium E4.1 §3.3).
 *
 * Zero fizyki, zero mutacji — czysta projekcja snapshotu.
 */

import { STRINGS } from './strings';
import type { ElementUzycia } from './types';

/** Filtruje elementy snapshotu do tych, których `catalog_ref` == id wybranego typu. */
export function filtrujUzycia(
  uzycia: readonly ElementUzycia[],
  typId: string,
): ElementUzycia[] {
  return uzycia.filter((u) => u.catalog_ref === typId);
}

export interface GdzieUzytyProps {
  typId: string;
  uzycia: readonly ElementUzycia[];
  onPokazElement?: (ref: string) => void;
}

export function GdzieUzyty({ typId, uzycia, onPokazElement }: GdzieUzytyProps): JSX.Element {
  const pasujace = filtrujUzycia(uzycia, typId);

  return (
    <section aria-label={STRINGS.gdzieUzytyTytul}>
      <h4 className="mvd-katalog__sekcja-tytul">{STRINGS.gdzieUzytyTytul}</h4>
      {pasujace.length === 0 ? (
        <p className="mvd-katalog__param-def">{STRINGS.gdzieUzytyPusto}</p>
      ) : (
        <>
          <p className="mvd-katalog__param-def">{STRINGS.gdzieUzytyLiczba(pasujace.length)}</p>
          {pasujace.map((u) => (
            <button
              key={u.ref}
              type="button"
              className="mvd-katalog__uzycie-btn"
              onClick={() => onPokazElement?.(u.ref)}
              disabled={!onPokazElement}
              title={STRINGS.gdzieUzytyPokaz}
            >
              {u.etykieta}
              {u.rodzaj ? ` · ${u.rodzaj}` : ''}
            </button>
          ))}
        </>
      )}
    </section>
  );
}
