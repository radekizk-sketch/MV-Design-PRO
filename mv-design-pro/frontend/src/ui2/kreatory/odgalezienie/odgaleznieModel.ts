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

import type { UziemienieEkranuKabla } from '../../../types/uziemienie';
import { normalizeCatalogBinding, normalizeSegmentKind, normalizeSegmentNamespace } from '../../../ui/network-build/forms/catalogPayload';

export type RodzajOdcinka = 'cable' | 'line_overhead';

export interface OdgaleznieFormData {
  segment_type: RodzajOdcinka;
  /** Długość odgałęzienia w kilometrach (wejście użytkownika). */
  dlugosc_km: number | null;
  catalog_ref: string | null;
  /** W5-A: układ uziemienia ekranu kabla (pusty = nie zadeklarowano; tylko dla kabla). */
  screen_bonding: UziemienieEkranuKabla | '';
}

export interface BladPola {
  field: string;
  message: string;
}

/**
 * Stan startowy. Długość NIE ma wartości domyślnej (dawniej 1 km): wpływa na impedancję,
 * spadek napięcia i prąd zwarciowy, więc pochodzi wyłącznie od projektanta (kontrakt
 * prowadzenia projektanta, reguła 4). Rodzaj odcinka startowo „kabel” to filtr listy
 * katalogowej (parametry fizyczne niesie wybrana pozycja katalogu), nie wartość obliczeniowa.
 */
export const DANE_DOMYSLNE: OdgaleznieFormData = {
  segment_type: 'cable',
  dlugosc_km: null,
  catalog_ref: null,
  screen_bonding: '',
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

/** KONFLIKT_TECHNICZNY — widoczny od razu przy polu: długość niedodatnia. */
export function konfliktyFormularza(data: OdgaleznieFormData): BladPola[] {
  if (data.dlugosc_km !== null && !(data.dlugosc_km > 0)) {
    return [{ field: 'dlugosc_km', message: 'Długość odgałęzienia musi być większa od zera.' }];
  }
  return [];
}

/** BRAK_DO_OPERACJI — w kolejności pracy; pokazywany dopiero przy zapisie. */
export function brakiFormularza(data: OdgaleznieFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (data.dlugosc_km === null) {
    errors.push({
      field: 'dlugosc_km',
      message:
        'Podaj długość odgałęzienia — od niej zależą impedancja, spadek napięcia i prąd zwarciowy na końcu.',
    });
  }
  if (!data.catalog_ref?.trim()) {
    errors.push({
      field: 'catalog_ref',
      message:
        'Wybierz typ odcinka z katalogu — R, X i obciążalność odgałęzienia pochodzą z pozycji katalogowej.',
    });
  }
  return errors;
}

/** Komplet kontroli przed zapisem: konflikty, potem braki. */
export function walidujFormularz(data: OdgaleznieFormData): BladPola[] {
  return [...konfliktyFormularza(data), ...brakiFormularza(data)];
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
      // W5-A: deklaracja ekranu tylko dla kabla i tylko gdy wybrana (zero fantomów).
      ...(rodzaj === 'cable' && data.screen_bonding ? { screen_bonding: data.screen_bonding } : {}),
    },
  };
}
