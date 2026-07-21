/**
 * Model kreatora „Dodaj stację SN/nN" (Audyt D, faza D2 — rdzeń).
 *
 * Katalog-first (TRAFO_SN_NN); dobór transformatora po napięciu SN szyny i
 * napięciu nN odbioru — porównanie napięć katalogowych, ZERO fizyki w UI.
 * Umiejscowienie stacji (koniec odcinka vs świadomy podział) pochodzi z
 * kontekstu operacji, nie z domysłu UI. Zapis = realna operacja domenowa
 * `append_station_on_endpoint` (koniec) lub `insert_station_on_segment_sn`
 * (podział). Semantyka podziału backendu pozostaje NIETKNIĘTA.
 *
 * Zakres D2: typ stacji + umiejscowienie + transformator + minimalny blok nN
 * (LOAD_NN). Rozdzielnica SN i pełny blok nN/PV = fazy D3/D4.
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import { voltageMatches } from '../../../ui/network-build/forms/InsertStationFormHelpers';
import type { TransformerType } from '../../../ui/catalog/types';

/** Typ stacji SN/nN (semantyczny — backend akceptuje 1:1). */
export type TypStacji = 'branch' | 'inline' | 'sectional';

/** Tryb umiejscowienia stacji względem topologii magistrali. */
export type TrybUmiejscowienia = 'ENDPOINT_APPEND' | 'SPLIT';

/** Tolerancje zgodności napięć katalogowych (kV) — parytet z legacy. */
const SN_VOLTAGE_TOLERANCE_KV = 0.01;
const NN_VOLTAGE_TOLERANCE_KV = 0.001;

/** Standardowe napięcia nN odbioru [kV]. */
export const NAPIECIA_NN_KV = [0.4, 0.69] as const;
export const DOMYSLNE_NAPIECIE_NN_KV = 0.4;
export const DOMYSLNA_LICZBA_ODPLYWOW_NN = 2;

export interface StacjaFormData {
  station_type: TypStacji;
  station_name: string;
  /** Napięcie nN odbioru [kV] — steruje doborem transformatora. */
  nn_voltage_kv: number;
  catalog_ref: string | null;
  /** Liczba odpływów nN (minimalny blok nN). */
  outgoing_feeders_nn_count: number;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: StacjaFormData = {
  station_type: 'branch',
  station_name: '',
  nn_voltage_kv: DOMYSLNE_NAPIECIE_NN_KV,
  catalog_ref: null,
  outgoing_feeders_nn_count: DOMYSLNA_LICZBA_ODPLYWOW_NN,
};

/**
 * Kontekst operacji (znormalizowany z payloadu operacji). Rozstrzyga tryb
 * umiejscowienia i referencje topologiczne. `segmentId` i `snVoltageKv`
 * rozwiązuje komponent ze snapshotu (helpery legacy), bo wymagają modelu.
 */
export interface KontekstStacji {
  tryb: TrybUmiejscowienia;
  endpointBusRef: string;
  runRef: string;
  segmentId: string;
  positionOnSegment: number;
  snVoltageKv: number;
  stationName: string;
  stationKind: TypStacji;
}

const TYPY_STACJI: readonly TypStacji[] = ['branch', 'inline', 'sectional'];

/** Normalizuje typ stacji z kontekstu do wariantu obsługiwanego przez D2. */
export function normalizujTypStacji(raw: unknown): TypStacji {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if ((TYPY_STACJI as readonly string[]).includes(value)) {
    return value as TypStacji;
  }
  // Mapowanie legacy A/B/C/D → semantyczny wariant.
  if (value === 'b') return 'inline';
  if (value === 'd') return 'sectional';
  return 'branch';
}

/**
 * Wyznacza tryb umiejscowienia: koniec odcinka (append) vs świadomy podział
 * (insert). Parytet z legacy: append gdy jawny ENDPOINT_APPEND lub pozycja na
 * końcu segmentu (>= 0.999) i znany terminal.
 */
export function wyznaczTryb(
  placementMode: string,
  endpointBusRef: string,
  positionOnSegment: number,
): TrybUmiejscowienia {
  const mode = placementMode.toUpperCase();
  const naKoncu = mode === 'ENDPOINT_APPEND' || positionOnSegment >= 0.999;
  return endpointBusRef && naKoncu ? 'ENDPOINT_APPEND' : 'SPLIT';
}

/** Czy zlecenie to zakończenie odcinka stacją (append). */
export function czyKoniecOdcinka(kontekst: KontekstStacji): boolean {
  return kontekst.tryb === 'ENDPOINT_APPEND';
}

/** Nazwa realnej operacji domenowej dla danego trybu. */
export function nazwaOperacji(kontekst: KontekstStacji): string {
  return czyKoniecOdcinka(kontekst)
    ? 'append_station_on_endpoint'
    : 'insert_station_on_segment_sn';
}

/** Czy kontekst pozwala umieścić stację (terminal dla append / segment dla split). */
export function kontekstKompletny(kontekst: KontekstStacji): boolean {
  return czyKoniecOdcinka(kontekst)
    ? Boolean(kontekst.endpointBusRef)
    : Boolean(kontekst.segmentId);
}

/** Ogranicza liczbę odpływów nN do sensownego zakresu (1..8). */
export function ogranicznikOdplywow(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(8, Math.trunc(value)));
}

export function walidujFormularz(data: StacjaFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz typ transformatora z katalogu.' });
  }
  if (!(Number.isFinite(data.nn_voltage_kv) && data.nn_voltage_kv > 0)) {
    errors.push({ field: 'nn_voltage_kv', message: 'Podaj napięcie nN odbioru większe od zera.' });
  }
  if (ogranicznikOdplywow(data.outgoing_feeders_nn_count) < 1) {
    errors.push({
      field: 'outgoing_feeders_nn_count',
      message: 'Stacja wymaga co najmniej jednego odpływu nN.',
    });
  }
  return errors;
}

/**
 * Dobór transformatorów zgodnych z napięciem SN szyny i napięciem nN odbioru.
 * Wyłącznie porównanie napięć katalogowych — ZERO fizyki. Sort rosnąco po mocy
 * znamionowej (stabilny, deterministyczny porządek doboru).
 */
export function doborTransformatorow(
  typy: readonly TransformerType[],
  snVoltageKv: number,
  nnVoltageKv: number,
): TransformerType[] {
  return typy
    .filter(
      (t) =>
        voltageMatches(t.voltage_hv_kv, snVoltageKv, SN_VOLTAGE_TOLERANCE_KV)
        && voltageMatches(t.voltage_lv_kv, nnVoltageKv, NN_VOLTAGE_TOLERANCE_KV),
    )
    .sort((a, b) => a.rated_power_mva - b.rated_power_mva || a.id.localeCompare(b.id));
}

/** Parametry wybranego typu (odczyt z katalogu). */
export interface ParametryTransformatora {
  rated_power_mva: number;
  voltage_hv_kv: number;
  voltage_lv_kv: number;
  uk_percent: number;
}

export function parametryZKatalogu(
  catalogRef: string | null,
  typy: readonly TransformerType[],
): ParametryTransformatora | null {
  if (!catalogRef) return null;
  const it = typy.find((t) => t.id === catalogRef);
  if (!it) return null;
  return {
    rated_power_mva: it.rated_power_mva,
    voltage_hv_kv: it.voltage_hv_kv,
    voltage_lv_kv: it.voltage_lv_kv,
    uk_percent: it.uk_percent,
  };
}

/**
 * Buduje payload realnej operacji domenowej. Wspólny blok (stacja/transformator/
 * blok nN/opcje) + warianty umiejscowienia. Mapuje wyłącznie pola realnie
 * przyjmowane przez operacje `append_station_on_endpoint` /
 * `insert_station_on_segment_sn` (bez fabrykacji).
 */
export function zbudujPayload(
  data: StacjaFormData,
  kontekst: KontekstStacji,
): Record<string, unknown> {
  const nazwa = data.station_name.trim() || kontekst.stationName.trim();
  const transformerBinding = normalizeCatalogBinding(data.catalog_ref, 'TRAFO_SN_NN');
  const catalogItemId = data.catalog_ref?.trim() ?? '';
  const feederCount = ogranicznikOdplywow(data.outgoing_feeders_nn_count);

  const commonPayload: Record<string, unknown> = {
    ...(nazwa ? { name: nazwa } : {}),
    station_type: data.station_type,
    station: {
      station_type: data.station_type,
      station_role: 'STACJA_SN_NN',
      ...(nazwa ? { station_name: nazwa } : {}),
      sn_voltage_kv: kontekst.snVoltageKv,
      nn_voltage_kv: data.nn_voltage_kv,
    },
    transformer: {
      create: true,
      transformer_catalog_ref: catalogItemId,
      ...(transformerBinding ? { catalog_binding: transformerBinding } : {}),
      model_type: 'DWU_UZWOJENIOWY',
    },
    nn_block: {
      create_nn_bus: true,
      main_breaker_nn: true,
      nn_configuration: 'LOAD_NN',
      outgoing_feeders_nn_count: feederCount,
    },
    options: {
      create_transformer_field: true,
      create_default_fields: true,
      create_nn_bus: true,
    },
  };

  if (czyKoniecOdcinka(kontekst)) {
    return {
      ...commonPayload,
      endpoint_bus_ref: kontekst.endpointBusRef,
      ...(kontekst.runRef ? { run_ref: kontekst.runRef } : {}),
    };
  }
  return {
    ...commonPayload,
    segment_id: kontekst.segmentId,
    insert_at: { mode: 'RATIO', value: kontekst.positionOnSegment },
  };
}

// ------------------------------------------------------------- Formatery

export function fmtKv(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(3)} kV` : '—';
}

export function fmtMva(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} MVA` : '—';
}

export function fmtPct(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} %` : '—';
}

export function fmtRatio(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—';
}
