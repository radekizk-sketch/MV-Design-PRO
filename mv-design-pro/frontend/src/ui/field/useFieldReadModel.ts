import { useEffect, useMemo, useState } from 'react';
import { useAppStateStore } from '../app-state/store';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { ObwodyWtornePola, StatusWeryfikacjiWzorca } from '../catalog/api';
import type {
  BayCanonicalModel,
  BayProjectResults,
  KlasaPolaLiniowego,
} from '../../types/enm';
import type {
  Etykieta,
  KompletnoscDowodu,
  StatusWerdyktu,
  WyjasnienieWerdyktu,
} from '../../ui2/wyniki/wzorzec/werdykt';

export interface FieldReadModelStatus {
  data_source: 'ENM_FIELD_READ_MODEL';
  result_state: 'NONE' | 'FRESH';
  has_field_data: boolean;
}

export interface FieldReadModelSummary {
  total_fields: number;
  migrated_count: number;
  requires_completion_count: number;
  source_fields_count: number;
  coupler_fields_count: number;
  fields_with_results_count: number;
}

/** Ocena jednej funkcji EAZ pola wobec wymogu klasy — lustro `enm.pole_liniowe_gpz.OcenaFunkcjiPola`
 *  (rekord wyjaśnialny: co oceniono, kryterium, podstawa, dowód, etykieta ze słownika backendu
 *  i wyjaśnienie kanoniczne z przyczyną, brakami i zastrzeżeniami). */
export interface OcenaFunkcjiPola {
  kod: string;
  funkcja_pl: string;
  wymog: 'OBOWIAZKOWA' | 'NAPOWIETRZNA' | 'NA_ZADANIE_OSD' | 'DOPUSZCZALNA' | 'ZAKAZANA';
  obecna: boolean;
  status: StatusWerdyktu;
  co_oceniono: string;
  kryterium: string;
  podstawa: string;
  dowod: string;
  kompletnosc_dowodu: KompletnoscDowodu;
  etykieta: Etykieta;
  wyjasnienie: WyjasnienieWerdyktu;
}

/** Moduł wytwarzania za polem — lustro `enm.pole_liniowe_gpz.ModulZaPolem`. */
export interface ModulZaPolem {
  ref_id: string;
  p_kw: number;
  napiecie_kv: number | null;
  /** Typ modułu wg progów NC RfG (A–D); `null` = nieustalony (powód w `powod_pl`). */
  typ: string | null;
  powod_pl: string;
}

export interface NiezgodnoscPolaLiniowego {
  kod: string;
  bay_ref: string;
  komunikat_pl: string;
  /** Akcja naprawcza — ta sama, którą walidator podaje w gotowości (W053–W057). */
  akcja_pl: string;
}

/** Ocena pola liniowego GPZ wg klasy pola — lustro `enm.pole_liniowe_gpz.OcenaPolaLiniowego`
 *  (to samo źródło co walidator W053–W057). Krotki backendu jako tablice. */
export interface OcenaPolaLiniowego {
  bay_ref: string;
  klasa_zadeklarowana: KlasaPolaLiniowego | null;
  klasa_z_sieci: KlasaPolaLiniowego;
  klasa_oceny: KlasaPolaLiniowego;
  /** `true` = pole nie ma zadeklarowanej klasy, oceniono klasą wynikającą z sieci za polem. */
  klasa_przyjeta: boolean;
  moduly: ModulZaPolem[];
  /** Odbiory za polem: `[ref_id, P w kW]`. */
  odbiory: [string, number][];
  linia_napowietrzna: boolean;
  ajee_wymagany: boolean;
  ajee_rdzen_obecny: boolean;
  ajee_przyczyna: string;
  oceny_funkcji: OcenaFunkcjiPola[];
  niezgodnosci: NiezgodnoscPolaLiniowego[];
  /** Obwody wtórne wzorca pola (sygnały rysunku); `null` — pole bez szablonu z rysunkiem. */
  obwody_wtorne?: ObwodyWtornePola | null;
  /** Obwody funkcji EAZ rozwiązane na aparatach pola (`enm.pole_liniowe_gpz.ObwodFunkcjiPola`). */
  obwody_funkcji?: ObwodFunkcjiPola[];
  /** Napięcie zwrotne (wzorzec z blokadą NZ); `null` — wzorzec bez pomiaru napięcia linii. */
  napiecie_zwrotne?: NapiecieZwrotnePola | null;
}

/** Obwód wtórny funkcji EAZ pola — lustro `enm.pole_liniowe_gpz.ObwodFunkcjiPola`. */
export interface ObwodFunkcjiPola {
  kod: string;
  funkcja_pl: string;
  /** `false` — funkcja wzorca, której zestaw funkcji pola nie ma. */
  obecna: boolean;
  /** `null` — rysunek wzorca nie rysuje tej funkcji. */
  blok_rysunku: string | null;
  wejscia_pl: string[];
  wyjscia_pl: string;
  weryfikacja: StatusWeryfikacjiWzorca;
  uwaga: string | null;
}

/** Napięcie zwrotne pola — lustro `enm.pole_liniowe_gpz.NapiecieZwrotnePola`. */
export interface NapiecieZwrotnePola {
  pomiar_pl: string;
  blokada_nz: boolean;
  zrodla_za_polem: number;
  mozliwe: boolean;
  wyjasnienie_pl: string;
  stan_pomiaru: 'POD_NAPIECIEM' | 'BEZ_NAPIECIA' | 'NIEUSTALONY';
  stan_pomiaru_pl: string;
}

export interface FieldReadModelItem {
  bay_id: string;
  bay_ref: string;
  bay_name: string;
  canonical_model: BayCanonicalModel;
  project_results?: BayProjectResults | null;
  /** Ocena pola liniowego GPZ (`null` = pole nie jest polem liniowym GPZ). */
  ocena_pola_liniowego?: OcenaPolaLiniowego | null;
}

export interface FieldReadModelResponse {
  case_id: string;
  enm_revision: number;
  view_status: FieldReadModelStatus;
  summary: FieldReadModelSummary;
  fields: FieldReadModelItem[];
}

interface FieldReadModelState {
  data: FieldReadModelResponse;
  isLoading: boolean;
  error: string | null;
}

export interface FieldReadModelView extends FieldReadModelState {
  itemsByBayRef: Map<string, FieldReadModelItem>;
  itemsByBayId: Map<string, FieldReadModelItem>;
  viewStatus: FieldReadModelStatus;
  summary: FieldReadModelSummary;
}

export const EMPTY_FIELD_READ_MODEL: FieldReadModelResponse = {
  case_id: '',
  enm_revision: 0,
  view_status: {
    data_source: 'ENM_FIELD_READ_MODEL',
    result_state: 'NONE',
    has_field_data: false,
  },
  summary: {
    total_fields: 0,
    migrated_count: 0,
    requires_completion_count: 0,
    source_fields_count: 0,
    coupler_fields_count: 0,
    fields_with_results_count: 0,
  },
  fields: [],
};

const cache = new Map<string, FieldReadModelResponse>();
const pending = new Map<string, Promise<FieldReadModelResponse>>();

function buildCacheKey(caseId: string, revision: number | null): string {
  return `${caseId}:${revision ?? 'live'}`;
}

function normalizeFieldReadModelResponse(
  payload: Partial<FieldReadModelResponse> | null | undefined,
): FieldReadModelResponse {
  return {
    ...EMPTY_FIELD_READ_MODEL,
    ...payload,
    view_status: {
      ...EMPTY_FIELD_READ_MODEL.view_status,
      ...(payload?.view_status ?? {}),
    },
    summary: {
      ...EMPTY_FIELD_READ_MODEL.summary,
      ...(payload?.summary ?? {}),
    },
    fields: Array.isArray(payload?.fields) ? payload.fields : [],
  };
}

async function fetchFieldReadModel(caseId: string): Promise<FieldReadModelResponse> {
  const response = await fetch(`/api/cases/${caseId}/enm/field-view`);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać widoku pola: ${response.statusText}`);
  }
  return normalizeFieldReadModelResponse(
    (await response.json()) as Partial<FieldReadModelResponse>,
  );
}

function ensureFieldReadModel(
  caseId: string,
  revision: number | null,
): Promise<FieldReadModelResponse> {
  const key = buildCacheKey(caseId, revision);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const activePending = pending.get(key);
  if (activePending) return activePending;

  const request = fetchFieldReadModel(caseId)
    .then((data) => {
      cache.set(key, data);
      return data;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}

export function useFieldReadModel(): FieldReadModelView {
  const caseId = useAppStateStore((state) => state.activeCaseId);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const revision = snapshot?.header.revision ?? null;

  const [state, setState] = useState<FieldReadModelState>({
    data: EMPTY_FIELD_READ_MODEL,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!caseId) {
      setState({
        data: EMPTY_FIELD_READ_MODEL,
        isLoading: false,
        error: null,
      });
      return;
    }

    const key = buildCacheKey(caseId, revision);
    const cached = cache.get(key);
    if (cached) {
      setState({
        data: normalizeFieldReadModelResponse(cached),
        isLoading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isLoading: true, error: null }));

    ensureFieldReadModel(caseId, revision)
      .then((data) => {
        if (cancelled) return;
        setState({
          data: normalizeFieldReadModelResponse(data),
          isLoading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          data: EMPTY_FIELD_READ_MODEL,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Nieznany błąd odczytu pola',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, revision]);

  // Karta #135 (e)2: JEDEN model pola — odpowiedź backendu `field-view` (tam składany jest stan
  // ruchowy, blokady i telemetria ze źródła). Dawny model budowany z migawki w przeglądarce
  // (`buildSnapshotFieldReadModel`) z heurystyką „bogatości" był modelem-cieniem i wygrywał z
  // backendem — skasowany. Brak przypadku, trwające ładowanie albo błąd odczytu = uczciwy stan
  // pusty z powodem w `error`, nigdy rekonstrukcja z migawki.
  const data = useMemo(() => normalizeFieldReadModelResponse(state.data), [state.data]);

  const itemsByBayRef = useMemo(
    () => new Map(data.fields.map((item) => [item.bay_ref, item] as const)),
    [data.fields],
  );
  const itemsByBayId = useMemo(
    () => new Map(data.fields.map((item) => [item.bay_id, item] as const)),
    [data.fields],
  );

  return {
    ...state,
    data,
    itemsByBayRef,
    itemsByBayId,
    viewStatus: data.view_status,
    summary: data.summary,
  };
}
