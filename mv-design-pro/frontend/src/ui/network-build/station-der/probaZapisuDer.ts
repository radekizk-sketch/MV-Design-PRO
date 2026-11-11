/**
 * Werdykt backendu dla konfiguracji DER PRZED zapisem — próba (`dry_run`) tej samej końcówki
 * `POST …/generators`, którą kreator zapisuje źródło.
 *
 * PO CO. Kreator liczył własny próg mocy transformatora (P/0,9, czyli założone cos φ = 0,9),
 * sprzeczny z JEDYNĄ regułą backendu — kontrolą mocy O-53
 * (`domain.generator_validation.sprawdz_moc_transformatora`: Σ max(S_n,jedn·n; P/cosφ)·k_j ≤
 * S_n,TR·k_obc po całej grupie źródeł zasilanych przez te same transformatory). Ten sam
 * falownik 1 MVA był w kreatorze „za duży" dla transformatora 1000 kVA, który backend
 * przyjmuje. Teraz kreator pyta backend: próba przechodzi CAŁĄ walidację operacji
 * `add_converter_source` i zwraca ten sam kod i to samo zdanie odmowy co zapis, a model zostaje
 * bez zmian. Zero progów i zero fizyki we froncie.
 *
 * Klucz zapytania niesie wersję modelu (`wersjaModelu`): po zmianie transformatora stacji próba
 * liczy się od nowa na nowej migawce.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import {
  probaZapisuDer,
  type DerGeneratorConfigRequest,
  type WerdyktProbyDer,
} from '../../sld/v2/canvas/derPersistenceApi';
import type { BlockTransformerItem } from './audit2-api';

/** Kod odmowy kontroli mocy transformatora (decyzja O-53) — `KOD_MOC_TRANSFORMATORA`. */
export const KOD_ODMOWY_MOCY_TRANSFORMATORA = 'converter.transformer_capacity_exceeded';

export interface KontekstProby {
  readonly projectId: string | null;
  readonly caseId: string | null;
  /** Identyfikator stanu modelu (skrót migawki) — zmiana modelu = nowa próba. */
  readonly wersjaModelu: string | null;
}

function aktywny(kontekst: KontekstProby): kontekst is KontekstProby & {
  projectId: string;
  caseId: string;
} {
  return (
    typeof kontekst.projectId === 'string'
    && kontekst.projectId.length > 0
    && kontekst.projectId !== 'no-project'
    && typeof kontekst.caseId === 'string'
    && kontekst.caseId.length > 0
  );
}

/** Werdykt backendu dla JEDNEJ konfiguracji (`null` zadania = brak próby). */
export function useProbaZapisuDer(
  kontekst: KontekstProby,
  zadanie: DerGeneratorConfigRequest | null,
): UseQueryResult<WerdyktProbyDer, Error> {
  return useQuery({
    queryKey: ['der-proba-zapisu', kontekst.projectId, kontekst.caseId, kontekst.wersjaModelu, zadanie],
    queryFn: ({ signal }) => {
      if (!aktywny(kontekst) || zadanie === null) {
        throw new Error('Próba zapisu DER bez projektu, zakresu obliczeń albo konfiguracji.');
      }
      return probaZapisuDer(kontekst.projectId, kontekst.caseId, zadanie, { signal });
    },
    enabled: aktywny(kontekst) && zadanie !== null,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export interface DoborTransformatoraDedykowanego {
  /** Najmniejszy kandydat, którego konfigurację backend przyjmuje; `null` — żaden. */
  readonly wybrany: BlockTransformerItem | null;
  /** Odmowa największego kandydata, gdy backend nie przyjął żadnego (powód dla projektanta). */
  readonly odmowa: Extract<WerdyktProbyDer, { stan: 'odmowa' }> | null;
}

/**
 * Dobór transformatora dedykowanego: próba zapisu tej samej konfiguracji z każdym kandydatem
 * (kolejność rosnąca mocy podana przez wołającego), wynik — pierwszy przyjęty przez backend.
 */
export function useDoborTransformatoraDedykowanego(
  kontekst: KontekstProby,
  zadanieBazowe: DerGeneratorConfigRequest | null,
  kandydaci: readonly BlockTransformerItem[],
): UseQueryResult<DoborTransformatoraDedykowanego, Error> {
  const identyfikatory = kandydaci.map((kandydat) => kandydat.id);
  return useQuery({
    queryKey: [
      'der-dobor-transformatora-dedykowanego',
      kontekst.projectId,
      kontekst.caseId,
      kontekst.wersjaModelu,
      zadanieBazowe,
      identyfikatory,
    ],
    queryFn: async ({ signal }) => {
      if (!aktywny(kontekst) || zadanieBazowe === null) {
        throw new Error('Dobór transformatora dedykowanego bez projektu albo konfiguracji.');
      }
      const werdykty = await Promise.all(
        kandydaci.map((kandydat) =>
          probaZapisuDer(
            kontekst.projectId,
            kontekst.caseId,
            { ...zadanieBazowe, block_transformer_catalog_ref: kandydat.id },
            { signal },
          )),
      );
      const indeks = werdykty.findIndex((werdykt) => werdykt.stan === 'przyjeta');
      if (indeks >= 0) return { wybrany: kandydaci[indeks], odmowa: null };
      const ostatni = werdykty[werdykty.length - 1];
      return { wybrany: null, odmowa: ostatni?.stan === 'odmowa' ? ostatni : null };
    },
    enabled: aktywny(kontekst) && zadanieBazowe !== null && kandydaci.length > 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
