/**
 * Model kreatora „Odgałęzienie SN" — ui2, kreatory/rama.
 *
 * Rozpoczyna nowe odgałęzienie (pierwszy odcinek) od jawnego zacisku źródła —
 * szyny, słupa albo ZKSN. To byt ODRĘBNY od „Słupa rozgałęźnego" i „ZKSN", które
 * wstawiają węzeł na ISTNIEJĄCYM odcinku; tu tworzymy NOWY ciąg od źródła.
 * Katalog-first (KABEL_SN / LINIA_SN). Zapis = operacja domenowa
 * `start_branch_segment_sn`. Kontrakt payloadu bez zmian względem legacy
 * `StartBranchForm`.
 */

import { normalizeCatalogBinding, normalizeSegmentKind, normalizeSegmentNamespace } from '../../../ui/network-build/forms/catalogPayload';

export type RodzajOdcinka = 'cable' | 'line_overhead';

export interface OdgaleznieFormData {
  segment_type: RodzajOdcinka;
  /** Długość odgałęzienia w kilometrach (wejście użytkownika). */
  dlugosc_km: number | null;
  catalog_ref: string | null;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: OdgaleznieFormData = {
  segment_type: 'cable',
  dlugosc_km: 1,
  catalog_ref: null,
};

export interface KontekstOdgalezienia {
  /** Kanoniczny zacisk źródła odgałęzienia (from_ref). */
  from_ref: string;
  source_type_label: string;
  source_name: string;
  /** Wymuszony rodzaj odcinka wynikający z typu źródła (ZKSN=kabel, słup=linia). */
  forced_segment_type: RodzajOdcinka | null;
  /** Wstępny rodzaj odcinka z kontekstu. */
  initial_segment_type: RodzajOdcinka;
  /** Wstępna referencja katalogowa z kontekstu (segment.catalog_binding). */
  initial_catalog_ref: string | null;
}

export function maZrodlo(kontekst: KontekstOdgalezienia): boolean {
  return kontekst.from_ref.trim().length > 0;
}

export function walidujFormularz(data: OdgaleznieFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (data.dlugosc_km === null || !(data.dlugosc_km > 0)) {
    errors.push({ field: 'dlugosc_km', message: 'Długość odgałęzienia musi być większa od zera.' });
  }
  if (!data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz typ odcinka odgałęzienia z katalogu.' });
  }
  return errors;
}

/** Efektywny rodzaj odcinka — wymuszony przez typ źródła albo wybrany przez użytkownika. */
export function efektywnyRodzaj(data: OdgaleznieFormData, kontekst: KontekstOdgalezienia): RodzajOdcinka {
  return kontekst.forced_segment_type ?? data.segment_type;
}

export function zbudujPayload(
  data: OdgaleznieFormData,
  kontekst: KontekstOdgalezienia,
): Record<string, unknown> {
  const rodzaj = efektywnyRodzaj(data, kontekst);
  const catalogBinding = normalizeCatalogBinding(
    data.catalog_ref,
    normalizeSegmentNamespace(rodzaj),
  );
  return {
    from_ref: kontekst.from_ref,
    segment: {
      rodzaj: normalizeSegmentKind(rodzaj),
      dlugosc_m: Math.round((data.dlugosc_km ?? 0) * 1000),
      catalog_binding: catalogBinding ?? undefined,
    },
  };
}
