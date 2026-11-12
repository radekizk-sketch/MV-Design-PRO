/**
 * GdzieUzyty — lista elementów modelu używających danego typu katalogowego.
 *
 * Źródłem jest snapshot (tylko odczyt): elementy wiązane przez `catalog_ref`
 * (patrz `ui/catalog/catalogSnapshot.ts`). Każdy element ma akcję „Pokaż na
 * schemacie" — jedna droga wejścia na schemat (kryterium E4.1 §3.3; karta
 * SLD-SKALA-I-NAWIGACJA, część W — dawniej własny callback, który emitował samo
 * zdarzenie `selekcja` i przełączał zakładkę bez zaznaczenia w store selekcji).
 *
 * Zero fizyki, zero mutacji — czysta projekcja snapshotu.
 */

import { PrzyciskPokazNaSchemacie } from '../../../shared/PrzyciskPokazNaSchemacie';
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
}

export function GdzieUzyty({ typId, uzycia }: GdzieUzytyProps): JSX.Element {
  const pasujace = filtrujUzycia(uzycia, typId);

  return (
    <section aria-label={STRINGS.gdzieUzytyTytul}>
      <h4 className="mvd-katalog__sekcja-tytul">{STRINGS.gdzieUzytyTytul}</h4>
      {pasujace.length === 0 ? (
        <p className="mvd-katalog__param-def">{STRINGS.gdzieUzytyPusto}</p>
      ) : (
        <>
          <p className="mvd-katalog__param-def">{STRINGS.gdzieUzytyLiczba(pasujace.length)}</p>
          <ul className="mvd-katalog__uzycia">
            {pasujace.map((u) => (
              <li key={u.ref} className="mvd-katalog__uzycie" data-testid="mvd-katalog-uzycie">
                <span>
                  {u.etykieta}
                  {u.rodzaj ? ` · ${u.rodzaj}` : ''}
                </span>
                <PrzyciskPokazNaSchemacie elementRef={u.ref} zrodlo="katalog" />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
