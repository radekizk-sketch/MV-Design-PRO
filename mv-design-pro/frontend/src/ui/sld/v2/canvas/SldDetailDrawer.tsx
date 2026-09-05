/**
 * K30-71 — SldDetailDrawer: prawy panel detail z tab interface.
 *
 * Goal: klikalna konfiguracja stacji z rozdzielnicą + TR.
 *
 * Opens when station/bay/apparatus clicked w SLD canvas. Show kategorię
 * tabs zależnie od element kind:
 *
 * STATION:
 *   - Rozdzielnica SN (bay-column overview)
 *   - Transformator (vector group, rated kVA, voltage levels)
 *   - Strona nN (LV bus + odpływy)
 *   - DER (PV/BESS/FW configurable)
 *
 * BAY:
 *   - Apparatus stack (DS/CB/ES states)
 *   - Protection (ANSI 50/51/67 settings)
 *
 * APPARATUS:
 *   - Settings + state telemetry
 *
 * DER:
 *   - 6 tabs (Typ / Moc / Punkt / Falownik / NC RfG / Zabezpieczenia)
 */

import type { CSSProperties, JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, type FieldError, type FieldErrors, type Resolver, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { useProtectionAssignment, type ElementProtectionAssignment } from '../../../protection';
import { formatProtectionFunction } from '../../../inspector/formatProtection';
import { fetchDerConverterTypes } from '../../../catalog/api';
import type { ConverterType } from '../../../catalog/types';

export type SldDetailKind =
  | 'station'
  | 'bay'
  | 'apparatus'
  | 'transformer'
  | 'der'
  | 'cable_run'
  | 'node'
  | null;

export interface SldTransformerDrawerSpec {
  readonly ref: string | null;
  readonly name: string | null;
  readonly vectorGroup: string | null;
  readonly snMva: number | null;
  readonly uhvKv: number | null;
  readonly ulvKv: number | null;
  readonly ukPercent: number | null;
  readonly pkKw: number | null;
  readonly catalogRef: string | null;
  readonly dataQuality: 'model' | 'sld_fallback' | 'missing';
  readonly blockers: readonly string[];
}

export interface SldDetailDrawerData {
  /** Element kind — determines which tab set to show. */
  readonly kind: SldDetailKind;
  /** Kanoniczny typ menu SLD uzywany przez kontener do akcji domenowych. */
  readonly menuKind?: string | null;
  /** Element id (ref_id). */
  readonly elementId: string | null;
  /** Display label (np. "S08 SN" / "Q01" / "PV-1"). */
  readonly label?: string;
  /** Voltage level [kV]. */
  readonly voltageKv?: number | null;
  /** Station code (for breadcrumb). */
  readonly stationCode?: string | null;
  /** Voltage tint stroke color (CSS color string). */
  readonly accentColor?: string;
  /** K30-78: pre-filled DER kind when drawer opened via drag-drop. */
  readonly derKind?: 'PV' | 'BESS' | 'FW';
  /** K30-78: pre-filled connection variant when drawer opened via drag-drop. */
  readonly derConnectionVariant?: 'nn_side' | 'sn_side' | 'dedicated';
  /** K30-79: real transformer spec from ENM snapshot (gdy kind='station'). */
  readonly transformerSpec?: SldTransformerDrawerSpec | null;
  /** K30-80: bay list dla rozdzielnica tab (kind='station'). */
  readonly baysSpec?: ReadonlyArray<{
    readonly id: string;
    readonly name: string | null;
    readonly bayRole: string | null;
    readonly bayNumber: string | null;
    readonly feederShortName: string | null;
  }>;
  /** Opis układu rozdzielnicy SN dla stacji, gdy snapshot nie zawiera listy pól. */
  readonly switchgearDescription?: string | null;
  /** K30-81: nN side spec dla "Strona nN" tab. */
  readonly nnSpec?: {
    readonly busVoltageKv: number | null;
    readonly loads: ReadonlyArray<{
      readonly id: string;
      readonly name: string | null;
      readonly pKw: number | null;
      readonly qKvar: number | null;
    }>;
  } | null;
  /** K30-82: lista istniejących DERs na stacji (kind='station' der tab). */
  readonly existingDers?: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'PV' | 'BESS' | 'FW' | null;
    readonly name: string | null;
    readonly pMw: number | null;
  }>;
  /** K30-83: bay apparatus list (kind='bay' apparatus tab). */
  readonly apparatusSpec?: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'CB' | 'DS' | 'ES' | 'CT' | 'VT' | 'OTHER';
    readonly label: string;
    readonly state: 'closed' | 'open' | 'unknown' | null;
  }>;
  /** K30-84: live metrics chips (z LF/SC overlay payload) — wyświetlane w
   *  header drawer pod label. Każdy chip ma label, value (już sformatowane)
   *  i opcjonalny color (np. severity badge). */
  readonly liveMetrics?: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
    readonly color?: string;
  }>;
  /** K30-95: alarm severity badge w drawer header. Lowercase per
   *  StationOnRunRenderer (warning/important/critical). */
  readonly alarmSeverity?: 'warning' | 'important' | 'critical' | null;
  /** K30-98: breadcrumb context — parent station label (Stacja › Pole). */
  readonly parentStationLabel?: string | null;
  /** Recenzja NO-GO 2026-07-17 pkt 9: identyfikator GLOBALNY
   *  ⟨stacja⟩.⟨pole⟩.⟨aparat⟩ (np. „S01.F01.Q2") — `null` gdy dane nie
   *  pozwalają go złożyć (brak kodu stacji/rekordu pola). */
  readonly globalId?: string | null;
  /** K30-98: breadcrumb context — parent bay label dla apparatus kind. */
  readonly parentBayLabel?: string | null;
  /** K30-97: real apparatus state z snapshot.equipmentStates (gdy
   *  drawer kind='apparatus'). */
  readonly apparatusState?: {
    readonly actualState: 'closed' | 'open' | 'unknown' | null;
    readonly controlMode: 'LOKALNY' | 'ZDALNY' | 'AUTO' | 'BLOKADA' | null;
    readonly communicationOk: boolean | null;
    readonly interlockBlocked: boolean | null;
    readonly lastChangeAt: string | null;
  } | null;
  /** K30-89: cable run spec dla cable_run drawer kind. */
  readonly cableRunSpec?: {
    readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop' | null;
    readonly segmentCount: number | null;
    readonly stationCount: number | null;
    readonly lengthKm: number | null;
    readonly segmentKind: 'cable_sn' | 'overhead_line_sn' | null;
    /** K30-93: max loading % across segments (z lfDerivedMetrics). */
    readonly maxLoadingPct?: number | null;
    /** K30-93: max voltage drop ΔU % (deviation pomiędzy stacjami końcowymi). */
    readonly maxVoltageDropPct?: number | null;
    /** FAB-C: dane katalogowe odcinka (Cable/OverheadLine) z ENM — brak pola
     *  w modelu = null, NIGDY wartość zastępcza (usunięta fabrykacja K30-89). */
    readonly catalogRef?: string | null;
    readonly conductorMaterial?: string | null;
    readonly crossSectionMm2?: number | null;
    readonly insulation?: 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | null;
    readonly ratingInA?: number | null;
  } | null;
  /** Obiekt wezlowy magistrali SN: ZKSN, slup rozgalezny, NMO. */
  readonly nodeSpec?: {
    readonly nodeKind: 'zksn' | 'branch_pole' | 'nmo' | 'other';
    readonly rolePl: string;
    readonly voltageKv: number | null;
    readonly connectedSegmentsCount: number | null;
    readonly catalogRef: string | null;
    readonly blockers: readonly string[];
  } | null;
}

export type SldDerKind = 'PV' | 'BESS' | 'FW';
export type SldDerConnectionVariant = 'nn_side' | 'sn_side' | 'dedicated';
export type SldNcRfgModule = 'A' | 'B' | 'C' | 'D';

export interface SldDerConfigFormValues {
  derKind: SldDerKind;
  powerMw: number;
  connectionVariant: SldDerConnectionVariant;
  pointVoltageKv: number;
  inverterCatalogRef: string;
  ncRfgModule: SldNcRfgModule;
}

export interface SldDetailDrawerSavePayload {
  readonly kind: SldDetailKind;
  readonly elementId: string | null;
  readonly derConfig?: SldDerConfigFormValues;
}

export interface SldDetailDrawerAction {
  readonly id: string;
  readonly labelPl: string;
  readonly group?: 'budowa' | 'edycja' | 'widok' | 'usun';
  readonly disabledReasonPl?: string;
  readonly onClick: () => void;
}

export interface SldDetailDrawerProps {
  readonly open: boolean;
  readonly data: SldDetailDrawerData | null;
  readonly onClose: () => void;
  /** Width [px]. Default 360. */
  readonly width?: number;
  /** K30-87: optional save handler — gdy podany, renderuje "Zapisz" CTA w
   *  footer. Brak handler → footer ukryty. */
  readonly onSave?: (payload: SldDetailDrawerSavePayload) => void | Promise<void>;
  /** K30-91: optional "Otwórz pełny widok" handler — gdy podany, renderuje
   *  CTA w drawer toolbar (sub-header pod tabs). Typowo dla station/bay
   *  otwiera drill-down (StationInternalView / pole edit). */
  readonly onOpenFullView?: () => void;
  /** Otwiera kanoniczny konfigurator stacji/obiektu w prawym panelu roboczym. */
  readonly onOpenConfiguration?: () => void;
  /** Jawne akcje domenowe dla wybranego obiektu. */
  readonly actions?: readonly SldDetailDrawerAction[];
}

const STATION_TABS = [
  { id: 'rozdzielnica', label: 'Rozdzielnica SN' },
  { id: 'transformator', label: 'Transformator' },
  { id: 'nn', label: 'Strona nN' },
  { id: 'der', label: 'Układy PV/BESS/FW' },
] as const;

const BAY_TABS = [
  { id: 'apparatus', label: 'Aparatura' },
  { id: 'protection', label: 'Zabezpieczenia' },
] as const;

const APPARATUS_TABS = [
  { id: 'state', label: 'Stan + telemetria' },
  { id: 'settings', label: 'Nastawy' },
] as const;

const TRANSFORMER_TABS = [
  { id: 'karta', label: 'Karta techniczna' },
] as const;

const DER_TABS = [
  { id: 'typ', label: 'Typ' },
  { id: 'moc', label: 'Moc znamionowa' },
  { id: 'punkt', label: 'Punkt podłączenia' },
  { id: 'inverter', label: 'Falownik' },
  { id: 'rfg', label: 'NC RfG' },
  { id: 'protection', label: 'Zabezpieczenia źródła' },
] as const;

const CABLE_RUN_TABS = [
  { id: 'trasa', label: 'Trasa' },
  { id: 'parametry', label: 'Parametry' },
  { id: 'spadek', label: 'Spadek napięcia' },
] as const;

const NODE_TABS = [
  { id: 'karta', label: 'Karta techniczna' },
  { id: 'operacje', label: 'Operacje' },
] as const;

type ExistingDer = NonNullable<SldDetailDrawerData['existingDers']>[number];

function derKindPublicName(kind: ExistingDer['kind']): string {
  if (kind === 'PV') return 'Układ fotowoltaiczny';
  if (kind === 'BESS') return 'Magazyn energii';
  if (kind === 'FW') return 'Źródło wiatrowe';
  return 'Źródło DER';
}

function isInternalDerName(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return /^(?:blok\s*)?(?:PV|BESS|FW)$/i.test(trimmed)
    || /\b(?:seg|gpz|stn|bay|bus|src)\/[a-z0-9/_#-]{12,}/i.test(trimmed)
    || /\b[0-9a-f]{24,}\b/i.test(trimmed);
}

function formatExistingDerName(der: ExistingDer, index: number): string {
  if (!isInternalDerName(der.name)) return der.name!.trim();
  return `${derKindPublicName(der.kind)} ${String(index + 1).padStart(2, '0')}`;
}

function formatMwPl(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} MW`;
}

function formatTechnicalNumberPl(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits }).format(value);
}

function formatKvPl(value: number): string {
  return `${formatTechnicalNumberPl(value)} kV`;
}

function formatKwPl(value: number): string {
  return `${formatTechnicalNumberPl(value, 1)} kW`;
}

function formatKvarPl(value: number): string {
  return `${formatTechnicalNumberPl(value, 1)} kvar`;
}

/**
 * Opcje przekształtnika DER — WYŁĄCZNIE z katalogu backendu (FAB-F usunęła
 * zaszytą listę `DER_CATALOG_OPTIONS`: 18 identyfikatorów utrzymywanych
 * ręcznie obok katalogu, czyli drugie źródło prawdy o tym, co wolno wybrać).
 *
 * KOREKTA 2026-09-05 (pomiar `get_default_mv_catalog()` na backendzie):
 * wszystkie 18 dawnych identyfikatorów ISTNIEJE w katalogu, a katalog MA
 * przekształtniki nN (`conv-*-nn-*-0p4kv`…, `un_kv` 0,4–0,8 kV). Wcześniejszy
 * komentarz twierdził, że „9/18 nie istniało" i że „backend nie ma żadnego
 * przekształtnika poniżej 1 kV" — oba zdania były nieprawdziwe. Powodem
 * usunięcia listy jest duplikacja katalogu, nie fantomy.
 *
 * Reużywa istniejący klient `fetchDerConverterTypes` (`ui/catalog/api.ts`,
 * `/api/catalog/converter-types?kind=…`). Ten sam zbiór identyfikatorów backend
 * wiąże w przestrzeniach `ZRODLO_NN_PV` / `ZRODLO_NN_BESS` / `CONVERTER`
 * (`api/generators.py::_catalog_namespace`; zmierzone: zbiory PV i BESS są
 * identyczne z `pv-inverter-types` / `bess-inverter-types`). Filtr nN/SN po
 * `un_kv` TYPU Z KATALOGU (rzeczywiste napięcie znamionowe), nie po sufiksie
 * nazwy.
 *
 * WYBÓR JEST JAWNY. Typ przekształtnika to dana projektowa (moc pozorna,
 * k_sc, zakres cos φ, napięcie znamionowe), nie ustawienie interfejsu —
 * szuflada NIE podstawia pierwszej pozycji katalogu. Pusty wybór blokuje zapis
 * (schemat zod) i przełącza szufladę na zakładkę „Falownik". Regresja
 * 2026-09-05 (E2E `critical-der-config`, CI od FAB-F): przy leniwym pobieraniu
 * katalogu I cichym podstawianiu pierwszej pozycji zapis z zakładki „Moc"
 * nigdy nie wysyłał żądania — wartość była pusta, a błąd walidacji wskazywał
 * zakładkę, której użytkownik nie oglądał.
 */
interface DerConverterCatalogState {
  readonly status: 'loading' | 'ready' | 'empty' | 'error';
  readonly options: ReadonlyArray<{ value: string; label: string }>;
  readonly errorMessage: string | null;
}

const DER_CATALOG_STATE_LOADING: DerConverterCatalogState = {
  status: 'loading',
  options: [],
  errorMessage: null,
};

function toConverterKind(kind: SldDerKind): ConverterType['kind'] {
  return kind === 'FW' ? 'WIND' : kind;
}

/** Etykieta = pola katalogu (nazwa, a w jej braku producent+model, a w ich
 *  braku identyfikator) — NIGDY literał zaszyty w UI. */
function converterOptionLabel(item: ConverterType): string {
  const name = item.name?.trim();
  if (name) return name;
  const manufacturerModel = [item.manufacturer, item.model].filter(Boolean).join(' ');
  return manufacturerModel || item.id;
}

const DER_KIND_LABEL_PL: Readonly<Record<SldDerKind, string>> = {
  PV: 'PV',
  BESS: 'BESS',
  FW: 'FW',
};

/** Klucz pary (technologia, wariant przyłączenia), dla której lista opcji
 *  przekształtnika jest ważna — JEDNO źródło prawdy dla haka katalogu i dla
 *  efektu czyszczącego wybór w formularzu (predykaty parami). */
function derCatalogKey(derKind: SldDerKind, connectionVariant: SldDerConnectionVariant): string {
  return `${derKind}|${connectionVariant}`;
}

/** Pobiera opcje przekształtnika z katalogu backendu dla (rodzaj DER, wariant
 *  przyłączenia). Stan pusty (katalog nie zwrócił typów dla tego poziomu
 *  napięcia) i błąd (zapytanie nie powiodło się) są UCZCIWE — bez listy
 *  zastępczej.
 *
 *  `enabled` odracza zapytanie do chwili, gdy zakładka „Falownik" jest
 *  faktycznie oglądana — wybór jest jawny, więc lista jest potrzebna dopiero
 *  tam (a bez tej bramki hak odpalał `fetch` przy KAŻDYM renderze szuflady
 *  z danymi DER, niezależnie od zakładki, co łamało asercje liczby wywołań
 *  `fetch` w testach portalu nN L0-L2).
 *
 *  Stan jest KLUCZOWANY parą (technologia, wariant): wynik pobrany dla PV nie
 *  jest nigdy raportowany jako aktualny po zmianie technologii na BESS —
 *  dopóki zakładka „Falownik" nie pobierze listy dla nowej pary, hak zgłasza
 *  `loading`. Bez klucza stara lista „ready" uzasadniałaby wybór z innej
 *  przestrzeni katalogu. */
function useDerConverterCatalog(
  derKind: SldDerKind,
  connectionVariant: SldDerConnectionVariant,
  enabled: boolean,
): DerConverterCatalogState {
  const key = derCatalogKey(derKind, connectionVariant);
  const [state, setState] = useState<{ key: string; value: DerConverterCatalogState }>({
    key,
    value: DER_CATALOG_STATE_LOADING,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState({ key, value: DER_CATALOG_STATE_LOADING });
    const isNn = connectionVariant === 'nn_side';
    void fetchDerConverterTypes(toConverterKind(derKind))
      .then((records) => {
        if (!active) return;
        if (!Array.isArray(records)) {
          throw new Error('Backend nie zwrócił listy przekształtników z katalogu.');
        }
        const filtered = records.filter((item) => (isNn ? item.un_kv < 1 : item.un_kv >= 1));
        const options = filtered.map((item) => ({
          value: item.id,
          label: converterOptionLabel(item),
        }));
        if (options.length > 0) {
          setState({ key, value: { status: 'ready', options, errorMessage: null } });
        } else {
          setState({
            key,
            value: {
              status: 'empty',
              options: [],
              errorMessage:
                `Katalog nie zawiera przekształtników ${isNn ? 'nN' : 'SN'} dla technologii ` +
                `${DER_KIND_LABEL_PL[derKind]}.`,
            },
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          key,
          value: {
            status: 'error',
            options: [],
            errorMessage:
              error instanceof Error ? error.message : 'Nie udało się pobrać katalogu przekształtników.',
          },
        });
      });
    return () => {
      active = false;
    };
  }, [derKind, connectionVariant, enabled, key]);

  return state.key === key ? state.value : DER_CATALOG_STATE_LOADING;
}

/** Etykieta pozycji zastępczej listy przekształtników — wybór jest jawny, więc
 *  lista zaczyna się od pustej pozycji, a nie od pierwszego typu z katalogu. */
const DER_INVERTER_PLACEHOLDER_LABEL = '— wybierz z katalogu —';

/** Zakładka, na której edytuje się dane pole formularza DER — żeby błąd
 *  walidacji zawsze prowadził do miejsca, gdzie da się go naprawić. */
const DER_FIELD_TAB: Readonly<Record<keyof SldDerConfigFormValues, string>> = {
  derKind: 'typ',
  powerMw: 'moc',
  connectionVariant: 'punkt',
  pointVoltageKv: 'punkt',
  inverterCatalogRef: 'inverter',
  ncRfgModule: 'rfg',
};

const sldDerConfigSchema = z.object({
  derKind: z.enum(['PV', 'BESS', 'FW']),
  powerMw: z.coerce
    .number({ invalid_type_error: 'Podaj moc czynną DER w MW.' })
    .min(0.1, 'Moc czynna DER musi być nie mniejsza niż 0,1 MW.')
    .max(10, 'Moc czynna DER musi być nie większa niż 10 MW.'),
  connectionVariant: z.enum(['nn_side', 'sn_side', 'dedicated']),
  pointVoltageKv: z.coerce.number().positive('Napięcie punktu przyłączenia musi być dodatnie.'),
  inverterCatalogRef: z.string().min(1, 'Wybierz typ przekształtnika z katalogu (zakładka „Falownik").'),
  ncRfgModule: z.enum(['A', 'B', 'C', 'D']),
}).superRefine((value, ctx) => {
  if (value.connectionVariant === 'nn_side' && value.pointVoltageKv >= 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['connectionVariant'],
      message: 'Wariant nN wymaga punktu przyłączenia poniżej 1 kV.',
    });
  }
  if (value.connectionVariant !== 'nn_side' && value.pointVoltageKv < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['connectionVariant'],
      message: 'Wariant SN wymaga punktu przyłączenia co najmniej 1 kV.',
    });
  }
});

function zodIssuesToFormErrors(
  error: z.ZodError<SldDerConfigFormValues>,
): FieldErrors<SldDerConfigFormValues> {
  const errors: FieldErrors<SldDerConfigFormValues> = {};
  for (const issue of error.issues) {
    const fieldName = issue.path[0] as keyof SldDerConfigFormValues | undefined;
    if (!fieldName || errors[fieldName]) continue;
    errors[fieldName] = {
      type: issue.code,
      message: issue.message,
    } as FieldError;
  }
  return errors;
}

const sldDerConfigResolver: Resolver<SldDerConfigFormValues> = async (values) => {
  const parsed = sldDerConfigSchema.safeParse(values);
  if (parsed.success) {
    return { values: parsed.data, errors: {} };
  }
  return {
    values: {},
    errors: zodIssuesToFormErrors(parsed.error),
  };
};

function tabsForKind(data: SldDetailDrawerData | null): readonly { id: string; label: string }[] {
  const kind = data?.kind ?? null;
  if (kind === 'station') return STATION_TABS;
  if (kind === 'bay') return BAY_TABS;
  if (kind === 'apparatus') return APPARATUS_TABS;
  if (kind === 'transformer') return TRANSFORMER_TABS;
  if (kind === 'der') return DER_TABS;
  if (kind === 'cable_run') return CABLE_RUN_TABS;
  if (kind === 'node') return NODE_TABS;
  return [];
}

function pointVoltageForVariant(
  variant: SldDerConnectionVariant,
  stationVoltageKv: number | null | undefined,
): number {
  if (variant === 'nn_side') return 0.4;
  return stationVoltageKv != null && stationVoltageKv >= 1 ? stationVoltageKv : 15;
}

function defaultDerPowerMw(kind: SldDerKind): number {
  if (kind === 'BESS') return 0.5;
  if (kind === 'FW') return 2.0;
  return 0.5;
}

function makeDefaultDerFormValues(data: SldDetailDrawerData | null): SldDerConfigFormValues {
  const derKind = data?.derKind ?? 'PV';
  const connectionVariant = data?.derConnectionVariant ?? 'nn_side';
  return {
    derKind,
    powerMw: defaultDerPowerMw(derKind),
    connectionVariant,
    pointVoltageKv: pointVoltageForVariant(connectionVariant, data?.voltageKv),
    // Wybór typu przekształtnika jest JAWNY (zakładka „Falownik", lista z
    // katalogu backendu) — wartość wstępna zostaje pusta i nikt jej nie
    // podstawia. Formularz odrzuca zapis z pustym `inverterCatalogRef`
    // (schemat zod poniżej) i przełącza szufladę na tę zakładkę.
    inverterCatalogRef: '',
    ncRfgModule: 'A',
  };
}

function firstDerFormError(errors: FieldErrors<SldDerConfigFormValues>): string | null {
  return errors.powerMw?.message?.toString()
    ?? errors.connectionVariant?.message?.toString()
    ?? errors.pointVoltageKv?.message?.toString()
    ?? errors.inverterCatalogRef?.message?.toString()
    ?? errors.derKind?.message?.toString()
    ?? errors.ncRfgModule?.message?.toString()
    ?? null;
}

function drawerActionButtonStyle(
  accent: string,
  group: SldDetailDrawerAction['group'],
  disabled = false,
): CSSProperties {
  const danger = group === 'usun';
  const border = disabled ? 'rgb(var(--scada-panel-raised))' : danger ? 'rgb(var(--scada-status-err))' : group === 'budowa' ? 'rgb(var(--scada-status-ok))' : accent;
  const color = disabled ? 'rgb(var(--scada-muted))' : danger ? 'rgb(var(--scada-status-err-ink))' : group === 'budowa' ? 'rgb(var(--scada-status-ok-ink))' : 'rgb(var(--scada-text))';
  return {
    background: disabled ? 'rgb(var(--scada-bg))' : danger ? 'rgb(var(--scada-bg))' : 'transparent',
    border: `1px solid ${border}`,
    color,
    padding: '4px 10px',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

export function SldDetailDrawer(props: SldDetailDrawerProps): JSX.Element | null {
  const {
    open,
    data,
    onClose,
    width = 392,
    onSave,
    onOpenFullView,
    onOpenConfiguration,
    actions = [],
  } = props;
  const tabs = tabsForKind(data);
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? '');
  // Ten sam wynik co `currentTab` niżej (po wczesnym `return`) — JEDNO źródło
  // prawdy o aktywnej zakładce, policzone też PRZED hakami (zasada hooków),
  // żeby `useDerConverterCatalog` mogło odroczyć zapytanie do chwili, gdy
  // zakładka „Falownik" jest faktycznie oglądana.
  const resolvedTab = tabs.find((t) => t.id === activeTab)?.id ?? tabs[0]?.id ?? '';
  const derForm = useForm<SldDerConfigFormValues>({
    resolver: sldDerConfigResolver,
    mode: 'onChange',
    defaultValues: makeDefaultDerFormValues(data),
  });
  const watchedDerKind = derForm.watch('derKind');
  const watchedConnectionVariant = derForm.watch('connectionVariant');
  const derCatalog = useDerConverterCatalog(
    watchedDerKind,
    watchedConnectionVariant,
    data?.kind === 'der' && resolvedTab === 'inverter',
  );
  const saveError = data?.kind === 'der' ? firstDerFormError(derForm.formState.errors) : null;
  // K30-96: auto-focus close button when drawer opens (ARIA dialog pattern)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || !data) return;
    lastFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    closeButtonRef.current?.focus();
    return () => {
      lastFocusedRef.current?.focus?.();
    };
  }, [open, data?.elementId]);

  useEffect(() => {
    if (!open || data?.kind !== 'der') return;
    derForm.reset(makeDefaultDerFormValues(data));
  }, [open, data?.elementId, data?.kind, data?.derKind, data?.derConnectionVariant, data?.voltageKv, derForm]);

  useEffect(() => {
    if (!open || data?.kind !== 'der') return;
    const nextPointVoltage = pointVoltageForVariant(watchedConnectionVariant, data.voltageKv);
    if (derForm.getValues('pointVoltageKv') !== nextPointVoltage) {
      derForm.setValue('pointVoltageKv', nextPointVoltage, { shouldValidate: true });
    }
  }, [open, data?.kind, data?.voltageKv, watchedConnectionVariant, derForm]);

  // Zmiana pary (technologia, wariant) unieważnia wybrany typ przekształtnika:
  // identyfikator PV nie może „przejść" do BESS ani typ SN do wariantu nN.
  // Ten sam klucz co w `useDerConverterCatalog` (predykaty parami). Czyścimy
  // na PUSTO, nie na pierwszą pozycję nowej listy — wybór jest jawny.
  const derCatalogKeyValue = derCatalogKey(watchedDerKind, watchedConnectionVariant);
  const previousDerCatalogKeyRef = useRef(derCatalogKeyValue);
  useEffect(() => {
    if (previousDerCatalogKeyRef.current === derCatalogKeyValue) return;
    previousDerCatalogKeyRef.current = derCatalogKeyValue;
    if (!open || data?.kind !== 'der') return;
    if (derForm.getValues('inverterCatalogRef') !== '') {
      derForm.setValue('inverterCatalogRef', '', { shouldValidate: false });
    }
  }, [derCatalogKeyValue, open, data?.kind, derForm]);

  // Wybór, którego nie ma na aktualnej liście z katalogu (katalog zmienił się
  // między otwarciami, pozycja zniknęła), też jest unieważniany — na pusto.
  // Dopóki zapytanie trwa, nie ruszamy wartości (lista nie jest jeszcze znana).
  useEffect(() => {
    if (!open || data?.kind !== 'der') return;
    if (derCatalog.status === 'loading') return;
    const currentCatalogRef = derForm.getValues('inverterCatalogRef');
    if (currentCatalogRef !== '' && !derCatalog.options.some((option) => option.value === currentCatalogRef)) {
      derForm.setValue('inverterCatalogRef', '', { shouldValidate: true });
    }
  }, [open, data?.kind, derForm, derCatalog.status, derCatalog.options]);

  const handleSaveClick = useCallback(() => {
    if (!onSave || !data) return;
    if (data.kind === 'der') {
      void derForm.handleSubmit(
        async (values) => {
          await onSave({
            kind: data.kind,
            elementId: data.elementId,
            derConfig: values,
          });
        },
        (errors) => {
          // Błąd pola z NIEWIDOCZNEJ zakładki był dla użytkownika ślepym
          // zaułkiem (regresja E2E 2026-09-05: pusty wybór przekształtnika na
          // zakładce „Falownik" blokował zapis z zakładki „Moc"). Reguła dla
          // całej klasy pól, nie jednego: jeśli oglądana zakładka sama ma błąd,
          // zostajemy na niej; inaczej pokazujemy pierwszą zakładkę z błędem.
          const fieldsWithErrors = Object.keys(errors) as (keyof SldDerConfigFormValues)[];
          const tabsWithErrors: string[] = DER_TABS
            .map((tab): string => tab.id)
            .filter((tabId) => fieldsWithErrors.some((field) => DER_FIELD_TAB[field] === tabId));
          if (tabsWithErrors.length === 0) return;
          setActiveTab((current) => (tabsWithErrors.includes(current) ? current : tabsWithErrors[0]));
        },
      )();
      return;
    }

    void Promise.resolve(onSave({ kind: data.kind, elementId: data.elementId }));
  }, [data, derForm, onSave]);

  // K30-88: Escape key closes drawer
  // K30-90: ArrowLeft/ArrowRight navigate tabs
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (tabs.length < 2) return;
      // Skip if input/textarea/select focused
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const currentIdx = tabs.findIndex((t) => t.id === activeTab);
      if (e.key === 'ArrowRight' && currentIdx >= 0) {
        e.preventDefault();
        const nextIdx = (currentIdx + 1) % tabs.length;
        setActiveTab(tabs[nextIdx].id);
      } else if (e.key === 'ArrowLeft' && currentIdx >= 0) {
        e.preventDefault();
        const prevIdx = (currentIdx - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[prevIdx].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, tabs, activeTab]);

  if (!open || !data || data.kind === null || tabs.length === 0) return null;

  // Reset active tab when data.kind changes (resolvedTab — policzone wyżej,
  // przed hakami — jest tym samym źródłem prawdy).
  const currentTab = resolvedTab;
  const showFooter = Boolean(onSave && data.kind === 'der');
  const showActionToolbar = Boolean(onOpenFullView || onOpenConfiguration || actions.length > 0);

  const accent = data.accentColor ?? 'rgb(var(--scada-status-info))';
  const visibleLabel = detailDisplayLabel(data);

  return (
    <div
      role="dialog"
      aria-label={`Detal: ${visibleLabel}`}
      data-testid="sld-v2-detail-drawer"
      data-element-kind={data.kind}
      data-element-id={data.elementId ?? ''}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width,
        background: 'rgb(var(--scada-bg))',
        borderLeft: `2px solid ${accent}`,
        boxShadow: '-4px 0 12px rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        color: 'rgb(var(--scada-text))',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgb(var(--scada-panel-raised))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div data-testid="sld-v2-detail-drawer-kind" style={{ fontSize: 9, color: 'rgb(var(--scada-muted))', textTransform: 'uppercase', letterSpacing: 1 }}>
            {kindLabel(data.kind)}
          </div>
          {(data.parentStationLabel || data.parentBayLabel) && (
            <div
              data-testid="sld-v2-detail-drawer-breadcrumb"
              style={{ fontSize: 10, color: 'rgb(var(--scada-muted))', marginTop: 2, fontFamily: 'monospace' }}
            >
              {[data.parentStationLabel, data.parentBayLabel].filter(Boolean).join(' › ')}
              {' › '}
            </div>
          )}
          <div data-testid="sld-v2-detail-drawer-label" style={{ fontSize: 16, fontWeight: 800, color: accent, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{visibleLabel}</span>
            {data.alarmSeverity && (
              <span
                data-testid="sld-v2-detail-drawer-alarm-badge"
                data-severity={data.alarmSeverity}
                style={{
                  background: data.alarmSeverity === 'critical' ? 'rgb(var(--scada-status-err))'
                    : data.alarmSeverity === 'important' ? 'rgb(var(--scada-status-warn))'
                    : 'rgb(var(--scada-status-warn-ink))',
                  color: 'rgb(var(--scada-bg))',
                  padding: '1px 6px',
                  borderRadius: 8,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  animation: data.alarmSeverity === 'critical' ? 'sld-drawer-alarm-pulse 1s infinite' : undefined,
                }}
              >
                ⚠ {data.alarmSeverity}
              </span>
            )}
          </div>
          {data.stationCode && data.kind !== 'station' && (
            <div data-testid="sld-v2-detail-drawer-breadcrumb" style={{ fontSize: 10, color: 'rgb(var(--scada-text))', marginTop: 2 }}>
              ↑ Stacja {data.stationCode}
            </div>
          )}
          {data.globalId && (
            <div
              data-testid="sld-v2-detail-drawer-global-id"
              style={{ fontSize: 10, color: 'rgb(var(--scada-status-warn-ink))', marginTop: 2, fontFamily: 'monospace', fontWeight: 700 }}
            >
              Identyfikator: {data.globalId}
            </div>
          )}
          {data.liveMetrics && data.liveMetrics.length > 0 && (
            <div
              data-testid="sld-v2-detail-drawer-live-metrics"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}
            >
              {data.liveMetrics.map((m, i) => (
                <span
                  key={`${m.label}-${i}`}
                  data-testid={`sld-v2-detail-drawer-metric-${m.label}`}
                  style={{
                    background: 'rgb(var(--scada-surface))',
                    border: `1px solid ${m.color ?? 'rgb(var(--scada-border))'}`,
                    color: m.color ?? 'rgb(var(--scada-text))',
                    padding: '2px 6px',
                    borderRadius: 2,
                    fontSize: 9,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                >
                  {m.label}={m.value}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          ref={closeButtonRef}
          data-testid="sld-v2-detail-drawer-close"
          onClick={onClose}
          aria-label="Zamknij panel"
          style={{
            background: 'transparent',
            border: '1px solid rgb(var(--scada-border))',
            color: 'rgb(var(--scada-text))',
            width: 28,
            height: 28,
            borderRadius: 3,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          ×
        </button>
      </div>

      {/* Tabs (K30-94: ARIA tablist + tab + tabpanel) */}
      <div
        role="tablist"
        aria-label={`Karty ${kindLabel(data.kind)}`}
        data-testid="sld-v2-detail-drawer-tabs"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0,
          padding: '8px 12px 0',
          borderBottom: '1px solid rgb(var(--scada-panel-raised))',
        }}
      >
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              type="button"
              role="tab"
              key={tab.id}
              id={`sld-v2-detail-drawer-tab-button-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`sld-v2-detail-drawer-tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              data-testid={`sld-v2-detail-drawer-tab-${tab.id}`}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: isActive ? accent : 'transparent',
                color: isActive ? 'rgb(var(--scada-bg))' : 'rgb(var(--scada-text))',
                border: 'none',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
                borderRadius: '3px 3px 0 0',
                marginRight: 2,
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* K30-91: action toolbar pod tabs (gdy onOpenFullView podany) */}
      {showActionToolbar && (
        <div
          data-testid="sld-v2-detail-drawer-actions"
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid rgb(var(--scada-panel-raised))',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            background: 'rgb(var(--scada-bg))',
          }}
        >
          {onOpenFullView && (
          <button
            type="button"
            data-testid="sld-v2-detail-drawer-open-full-view"
            onClick={onOpenFullView}
            style={{
              background: 'transparent',
              border: `1px solid ${accent}`,
              color: accent,
              padding: '4px 10px',
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ⇱ Otwórz pełny widok
          </button>
          )}
          {onOpenConfiguration && (
            <button
              type="button"
              data-testid="sld-v2-detail-drawer-open-configuration"
              onClick={onOpenConfiguration}
              style={drawerActionButtonStyle(accent, 'edycja')}
            >
              Konfiguruj obiekt
            </button>
          )}
          {actions.map((action) => {
            const disabled = Boolean(action.disabledReasonPl);
            return (
              <button
                type="button"
                key={action.id}
                data-testid={`sld-v2-detail-drawer-action-${action.id}`}
                data-disabled={disabled ? 'true' : 'false'}
                onClick={disabled ? undefined : action.onClick}
                disabled={disabled}
                title={action.disabledReasonPl ?? action.labelPl}
                style={drawerActionButtonStyle(accent, action.group, disabled)}
              >
                {action.labelPl}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab content (K30-94: ARIA tabpanel) */}
      <div
        role="tabpanel"
        id={`sld-v2-detail-drawer-tabpanel-${currentTab}`}
        aria-labelledby={`sld-v2-detail-drawer-tab-button-${currentTab}`}
        data-testid={`sld-v2-detail-drawer-content-${currentTab}`}
        style={{
          flex: 1,
          padding: 16,
          overflowY: 'auto',
          fontSize: 11,
        }}
      >
        <TabContent
          kind={data.kind}
          tab={currentTab}
          data={data}
          derForm={derForm}
          derCatalog={derCatalog}
          onOpenConfiguration={onOpenConfiguration}
        />
      </div>

      {/* K30-87: footer with Save/Cancel CTA (gdy onSave podany) */}
      {showFooter && (
        <div
          data-testid="sld-v2-detail-drawer-footer"
          style={{
            padding: '10px 16px',
            borderTop: '1px solid rgb(var(--scada-panel-raised))',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            background: 'rgb(var(--scada-bg))',
          }}
        >
          <button
            type="button"
            data-testid="sld-v2-detail-drawer-cancel"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgb(var(--scada-border))',
              color: 'rgb(var(--scada-text))',
              padding: '6px 12px',
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Anuluj
          </button>
          <button
            type="button"
            data-testid="sld-v2-detail-drawer-save"
            onClick={handleSaveClick}
            disabled={derForm.formState.isSubmitting}
            style={{
              background: accent,
              border: `1px solid ${accent}`,
              color: 'rgb(var(--scada-bg))',
              padding: '6px 14px',
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 800,
              cursor: derForm.formState.isSubmitting ? 'wait' : 'pointer',
              opacity: derForm.formState.isSubmitting ? 0.75 : 1,
            }}
          >
            Zapisz
          </button>
          {saveError && (
            <span
              data-testid="sld-v2-detail-drawer-save-error"
              style={{
                alignSelf: 'center',
                color: 'rgb(var(--scada-status-err))',
                fontSize: 10,
                marginRight: 'auto',
              }}
            >
              {saveError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function kindLabel(kind: SldDetailKind): string {
  switch (kind) {
    case 'station': return 'Stacja SN/nN';
    case 'bay': return 'Pole';
    case 'apparatus': return 'Aparat';
    case 'transformer': return 'Transformator';
    case 'der': return 'Źródło rozproszone (DER)';
    case 'cable_run': return 'Ciąg kablowy';
    case 'node': return 'Węzeł sieci SN';
    default: return '—';
  }
}

const INTERNAL_REF_PATTERN = /\b(?:stn|seg|gpz|bus|bay|pv|bess|fw|source)\/[^\s]+/i;

function isPublicEngineeringLabel(value: string | null | undefined): value is string {
  return Boolean(value && !INTERNAL_REF_PATTERN.test(value));
}

function detailDisplayLabel(data: SldDetailDrawerData): string {
  if (data.kind === 'station' && isPublicEngineeringLabel(data.label)) return data.label;
  if (data.kind === 'station' && data.stationCode) return data.stationCode;
  if (isPublicEngineeringLabel(data.label)) return data.label;
  return kindLabel(data.kind);
}

function detailObjectContext(data: SldDetailDrawerData): string {
  if (data.kind === 'station') {
    return data.stationCode ? `Stacja ${data.stationCode}` : 'Stacja SN/nN';
  }
  if (data.kind === 'bay') return isPublicEngineeringLabel(data.label) ? data.label : 'Pole SN';
  if (data.kind === 'apparatus') return isPublicEngineeringLabel(data.label) ? data.label : 'Aparat pola';
  if (data.kind === 'transformer') return isPublicEngineeringLabel(data.label) ? data.label : 'Transformator SN/nN';
  if (data.kind === 'der') return isPublicEngineeringLabel(data.label) ? data.label : 'Źródło przyłączone';
  if (data.kind === 'cable_run') return isPublicEngineeringLabel(data.label) ? data.label : 'Ciąg SN';
  if (data.kind === 'node') return data.nodeSpec?.rolePl ?? (isPublicEngineeringLabel(data.label) ? data.label : 'Węzeł sieci SN');
  return 'Układ elektroenergetyczny';
}

interface TabContentProps {
  readonly kind: SldDetailKind;
  /** Kind menu SLD uzywany przez kontener do routingu akcji. */
  readonly menuKind?: string | null;
  readonly tab: string;
  readonly data: SldDetailDrawerData;
  readonly derForm: UseFormReturn<SldDerConfigFormValues>;
  readonly derCatalog: DerConverterCatalogState;
  readonly onOpenConfiguration?: () => void;
}

function TabContent({ kind, tab, data, derForm, derCatalog, onOpenConfiguration }: TabContentProps): JSX.Element {
  return (
    <div data-testid={`sld-v2-detail-drawer-tab-content-${tab}`}>
      <div style={{ color: 'rgb(var(--scada-muted))', fontStyle: 'italic', marginBottom: 12 }}>
        Układ: {detailObjectContext(data)}
      </div>
      <PlaceholderTabBody
        kind={kind}
        tab={tab}
        elementId={data.elementId}
        voltageKv={data.voltageKv ?? null}
        transformerSpec={data.transformerSpec ?? null}
        baysSpec={data.baysSpec}
        switchgearDescription={data.switchgearDescription ?? null}
        nnSpec={data.nnSpec ?? null}
        existingDers={data.existingDers}
        apparatusSpec={data.apparatusSpec}
        cableRunSpec={data.cableRunSpec ?? null}
        nodeSpec={data.nodeSpec ?? null}
        apparatusState={data.apparatusState ?? null}
        derForm={derForm}
        derCatalog={derCatalog}
        onOpenConfiguration={onOpenConfiguration}
      />
    </div>
  );
}

function transformerMissingValue(label = 'Brak danych'): JSX.Element {
  return <span style={{ color: 'rgb(var(--scada-status-warn))', fontStyle: 'normal' }}>{label}</span>;
}

function formatTransformerKva(mva: number | null | undefined): string | null {
  if (mva == null || !Number.isFinite(mva)) return null;
  return `${formatTechnicalNumberPl(mva * 1000, 0)} kVA`;
}

function transformerVoltageLabel(
  spec: SldTransformerDrawerSpec | null,
  fallbackVoltageKv: number | null,
): string | null {
  const uhv = spec?.uhvKv ?? fallbackVoltageKv;
  const ulv = spec?.ulvKv ?? 0.4;
  if (uhv == null || ulv == null) return null;
  return `${formatKvPl(uhv)} / ${formatKvPl(ulv)}`;
}

function transformerRequiredBlockers(spec: SldTransformerDrawerSpec | null): string[] {
  if (!spec || spec.dataQuality === 'missing') {
    return ['Brak transformatora SN/nN przypisanego do stacji.'];
  }
  const blockers = [...spec.blockers];
  if (spec.snMva == null) blockers.push('Brak mocy znamionowej Sn.');
  if (spec.uhvKv == null) blockers.push('Brak napięcia strony SN.');
  if (spec.ulvKv == null) blockers.push('Brak napięcia strony nN.');
  if (spec.ukPercent == null) blockers.push('Brak napięcia zwarcia u_k%.');
  if (spec.vectorGroup == null) blockers.push('Brak grupy połączeń.');
  if (spec.catalogRef == null) blockers.push('Brak pozycji katalogowej transformatora.');
  return Array.from(new Set(blockers));
}

function TransformerStationPanel({
  transformerSpec,
  voltageKv,
  onOpenConfiguration,
}: {
  readonly transformerSpec: SldTransformerDrawerSpec | null;
  readonly voltageKv: number | null;
  readonly onOpenConfiguration?: () => void;
}): JSX.Element {
  const blockers = transformerRequiredBlockers(transformerSpec);
  const isComplete = blockers.length === 0;
  const fromSldFallback = transformerSpec?.dataQuality === 'sld_fallback';
  const panelBorder = isComplete ? 'rgb(var(--scada-status-ok))' : 'rgb(var(--scada-status-warn))';
  const ratedKva = formatTransformerKva(transformerSpec?.snMva);
  const voltageLabel = transformerVoltageLabel(transformerSpec, voltageKv);

  return (
    <div data-testid="drawer-tr-engineering-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section
        style={{
          border: `1px solid ${panelBorder}`,
          background: 'rgb(var(--scada-bg))',
          borderRadius: 6,
          padding: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: 'rgb(var(--scada-muted))', fontSize: 9, fontWeight: 800, letterSpacing: 1.2 }}>
              TRANSFORMATOR SN/nN
            </div>
            <div data-testid="drawer-tr-name" style={{ marginTop: 3, color: 'rgb(var(--scada-text))', fontSize: 13, fontWeight: 800 }}>
              {transformerSpec?.name ?? 'Transformator stacji'}
            </div>
            {transformerSpec?.ref && (
              <div data-testid="drawer-tr-ref" style={{ marginTop: 2, color: 'rgb(var(--scada-text))', fontSize: 9, fontFamily: 'monospace' }}>
                {transformerSpec.ref}
              </div>
            )}
          </div>
          <span
            data-testid="drawer-tr-status"
            style={{
              border: `1px solid ${panelBorder}`,
              color: panelBorder,
              borderRadius: 999,
              padding: '2px 7px',
              fontSize: 9,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {isComplete ? 'DANE KOMPLETNE' : 'DO UZUPEŁNIENIA'}
          </span>
        </div>

        {fromSldFallback && (
          <div data-testid="drawer-tr-sld-fallback-warning" style={{ marginTop: 8, color: 'rgb(var(--scada-status-warn))', fontSize: 10, lineHeight: 1.35 }}>
            Parametry odczytano z widoku SLD. Powiąż transformator z rekordem ENM/katalogiem,
            aby obliczenia i raport miały pełny ślad danych.
          </div>
        )}

        <div
          data-testid="drawer-tr-kpi-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 10,
          }}
        >
          <TransformerKpi label="Moc znamionowa" testId="drawer-tr-rated-kva" value={ratedKva} strong />
          <TransformerKpi label="Napięcie SN / nN" testId="drawer-tr-voltages" value={voltageLabel} />
          <TransformerKpi label="Grupa połączeń" testId="drawer-tr-vector-group" value={transformerSpec?.vectorGroup ?? null} strong />
          <TransformerKpi
            label="Napięcie zwarcia"
            testId="drawer-tr-uk-percent"
            value={transformerSpec?.ukPercent != null ? `${formatTechnicalNumberPl(transformerSpec.ukPercent, 2)} %` : null}
          />
          <TransformerKpi
            label="Straty obciążeniowe Pk"
            testId="drawer-tr-pk-kw"
            value={transformerSpec?.pkKw != null ? `${formatTechnicalNumberPl(transformerSpec.pkKw, 2)} kW` : null}
          />
          <TransformerKpi label="Pozycja katalogowa" testId="drawer-tr-catalog-ref" value={transformerSpec?.catalogRef ?? null} />
        </div>
      </section>

      <section
        data-testid="drawer-tr-calculation-impact"
        style={{
          border: '1px solid rgb(var(--scada-panel-raised))',
          borderRadius: 6,
          background: 'rgb(var(--scada-bg))',
          padding: 10,
        }}
      >
        <div style={{ color: 'rgb(var(--scada-muted))', fontSize: 9, fontWeight: 800, letterSpacing: 1.1, marginBottom: 7 }}>
          WPŁYW NA OBLICZENIA
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5, color: 'rgb(var(--scada-text))', fontSize: 10, lineHeight: 1.35 }}>
          <li><b>Zwarcia:</b> wymagane są Sn, u_k%, grupa połączeń i poziomy napięć.</li>
          <li><b>Rozpływ mocy:</b> wymagane są Sn, przekładnia i straty Pk/P0 z katalogu.</li>
          <li><b>Dobór zabezpieczeń:</b> wymagane są prądy znamionowe strony SN/nN i katalog transformatora.</li>
        </ul>
      </section>

      <section
        data-testid="drawer-tr-blockers"
        style={{
          border: `1px solid ${blockers.length > 0 ? 'rgb(var(--scada-status-warn))' : 'rgb(var(--scada-panel-raised))'}`,
          borderRadius: 6,
          background: blockers.length > 0 ? 'rgb(var(--scada-bg))' : 'rgb(var(--scada-bg))',
          padding: 10,
        }}
      >
        <div style={{ color: blockers.length > 0 ? 'rgb(var(--scada-status-warn))' : 'rgb(var(--scada-status-ok))', fontSize: 10, fontWeight: 800 }}>
          {blockers.length > 0 ? `Braki danych (${blockers.length})` : 'Transformator gotowy do obliczeń'}
        </div>
        {blockers.length > 0 ? (
          <ul style={{ margin: '7px 0 0', paddingLeft: 16, color: 'rgb(var(--scada-status-warn-ink))', fontSize: 10, lineHeight: 1.45 }}>
            {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        ) : (
          <div style={{ marginTop: 6, color: 'rgb(var(--scada-status-ok-ink))', fontSize: 10 }}>
            Dane mogą być użyte przez solvery i dowód obliczeń.
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gap: 6 }}>
        <button
          type="button"
          data-testid="drawer-tr-open-config"
          onClick={onOpenConfiguration}
          disabled={!onOpenConfiguration}
          title={onOpenConfiguration ? 'Otwórz kartę Transformator w konfiguratorze stacji' : 'Brak aktywnego konfiguratora stacji'}
          style={{
            border: '1px solid rgb(var(--scada-status-info))',
            background: onOpenConfiguration ? 'rgb(var(--scada-panel-raised))' : 'rgb(var(--scada-surface))',
            color: onOpenConfiguration ? 'rgb(var(--scada-text))' : 'rgb(var(--scada-muted))',
            borderRadius: 4,
            padding: '8px 10px',
            fontSize: 11,
            fontWeight: 800,
            cursor: onOpenConfiguration ? 'pointer' : 'not-allowed',
            textAlign: 'left',
          }}
        >
          Skonfiguruj transformator w stacji
        </button>
        <div style={{ color: 'rgb(var(--scada-muted))', fontSize: 9, lineHeight: 1.35 }}>
          Ta karta nie zgaduje parametrów. Braki prowadzą do konfiguratora stacji i katalogu transformatorów.
        </div>
      </div>
    </div>
  );
}

function TransformerKpi({
  label,
  value,
  testId,
  strong = false,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly testId: string;
  readonly strong?: boolean;
}): JSX.Element {
  return (
    <div style={{ border: '1px solid rgb(var(--scada-panel-raised))', background: 'rgb(var(--scada-bg))', borderRadius: 4, padding: '7px 8px', minHeight: 48 }}>
      <div style={{ color: 'rgb(var(--scada-muted))', fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div
        data-testid={testId}
        style={{
          color: value ? (strong ? 'rgb(var(--scada-status-warn-ink))' : 'rgb(var(--scada-text))') : 'rgb(var(--scada-status-warn))',
          fontFamily: 'monospace',
          fontSize: 11,
          fontWeight: strong ? 800 : 600,
          overflowWrap: 'anywhere',
        }}
      >
        {value ?? transformerMissingValue()}
      </div>
    </div>
  );
}

function NodeEngineeringPanel({
  nodeSpec,
  tab,
}: {
  readonly nodeSpec: NonNullable<SldDetailDrawerData['nodeSpec']> | null;
  readonly tab: string;
}): JSX.Element {
  const blockers = nodeSpec?.blockers ?? ['Brak danych węzła sieci SN.'];
  const isComplete = blockers.length === 0;
  const border = isComplete ? 'rgb(var(--scada-status-ok))' : 'rgb(var(--scada-status-warn))';
  return (
    <div data-testid="drawer-node-engineering-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section
        style={{
          border: `1px solid ${border}`,
          background: 'rgb(var(--scada-bg))',
          borderRadius: 6,
          padding: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ color: 'rgb(var(--scada-muted))', fontSize: 9, fontWeight: 800, letterSpacing: 1.2 }}>
              WĘZEŁ MAGISTRALI SN
            </div>
            <div data-testid="drawer-node-role" style={{ color: 'rgb(var(--scada-text))', fontSize: 13, fontWeight: 800, marginTop: 3 }}>
              {nodeSpec?.rolePl ?? 'Węzeł sieci SN'}
            </div>
          </div>
          <span
            data-testid="drawer-node-status"
            style={{
              border: `1px solid ${border}`,
              color: border,
              borderRadius: 999,
              padding: '2px 7px',
              fontSize: 9,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {isComplete ? 'DANE KOMPLETNE' : 'DO UZUPEŁNIENIA'}
          </span>
        </div>
        <div
          data-testid="drawer-node-kpi-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 10,
          }}
        >
          <TransformerKpi
            label="Napięcie znamionowe"
            testId="drawer-node-voltage"
            value={nodeSpec?.voltageKv != null ? formatKvPl(nodeSpec.voltageKv) : null}
          />
          <TransformerKpi
            label="Połączone odcinki"
            testId="drawer-node-segments"
            value={nodeSpec?.connectedSegmentsCount != null ? String(nodeSpec.connectedSegmentsCount) : null}
          />
          <TransformerKpi
            label="Pozycja katalogowa"
            testId="drawer-node-catalog"
            value={nodeSpec?.catalogRef ?? null}
          />
          <TransformerKpi
            label="Typ wezla"
            testId="drawer-node-kind"
            value={nodeSpec?.nodeKind === 'zksn' ? 'ZK SN'
              : nodeSpec?.nodeKind === 'branch_pole' ? 'Słup rozgałęźny SN'
                : nodeSpec?.nodeKind === 'nmo' ? 'Punkt NMO'
                  : 'Węzeł SN'}
          />
        </div>
      </section>

      {tab === 'operacje' && (
        <section
          data-testid="drawer-node-operation-rules"
          style={{ border: '1px solid rgb(var(--scada-panel-raised))', borderRadius: 6, background: 'rgb(var(--scada-bg))', padding: 10 }}
        >
          <div style={{ color: 'rgb(var(--scada-muted))', fontSize: 9, fontWeight: 800, letterSpacing: 1.1, marginBottom: 7 }}>
            ZASADY OPERACJI
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, color: 'rgb(var(--scada-text))', fontSize: 10, lineHeight: 1.45 }}>
            <li>Konfiguracja pełna otwiera kartę techniczną węzła.</li>
            <li>Usunięcie lub rozdzielenie wymaga potwierdzenia i zapisu w historii zmian.</li>
            <li>Brak katalogu blokuje obliczenia wymagające danych aparatury.</li>
          </ul>
        </section>
      )}

      <section
        data-testid="drawer-node-blockers"
        style={{
          border: `1px solid ${blockers.length > 0 ? 'rgb(var(--scada-status-warn))' : 'rgb(var(--scada-panel-raised))'}`,
          borderRadius: 6,
          background: blockers.length > 0 ? 'rgb(var(--scada-bg))' : 'rgb(var(--scada-bg))',
          padding: 10,
        }}
      >
        <div style={{ color: blockers.length > 0 ? 'rgb(var(--scada-status-warn))' : 'rgb(var(--scada-status-ok))', fontSize: 10, fontWeight: 800 }}>
          {blockers.length > 0 ? `Braki danych (${blockers.length})` : 'Węzeł gotowy do konfiguracji'}
        </div>
        {blockers.length > 0 ? (
          <ul style={{ margin: '7px 0 0', paddingLeft: 16, color: 'rgb(var(--scada-status-warn-ink))', fontSize: 10, lineHeight: 1.45 }}>
            {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        ) : (
          <div style={{ marginTop: 6, color: 'rgb(var(--scada-status-ok-ink))', fontSize: 10 }}>
            Dane węzła są spójne z widokiem SLD i kartą techniczną.
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * FAB-B (fantom nastaw, M0 — dyrektywa właściciela „usunięte fabrykacje
 * użytkowe"): panel nastaw zabezpieczeń współdzielony przez TRZY miejsca
 * wpięcia — zakładka `der`/`protection`, `bay`/`protection` i
 * `apparatus`/`settings` (reguła KLASA NIE INSTANCJA — jeden mechanizm,
 * nie trzy kopie). Wcześniej każde z tych miejsc renderowało zaszytą,
 * fikcyjną listę funkcji/nastaw (stałe wartości `setpoint`/`delay` zaszyte
 * wprost w tablicy obiektów) NIEZALEŻNIE od tego, co jest w modelu.
 *
 * ŹRÓDŁO DANYCH: DOKŁADNIE ta sama ścieżka co widok zabezpieczeń w
 * inspektorze (`ui/inspector/ProtectionSection.tsx`) —
 * `useProtectionAssignment(elementId)` → `useProtectionView()` → realny
 * read model `GET /api/cases/{caseId}/enm/protection-view`
 * (`application/protection_read_model` backendu) → `assignmentsForElement`.
 * Formatowanie przez `formatProtectionFunction` (czyste przepisanie
 * kształtu, ZERO fizyki/obliczeń w UI — ta sama funkcja co w inspektorze).
 *
 * Brak przypisania zabezpieczenia dla `elementId` w modelu ⇒ uczciwy stan
 * zerowy („Brak nastaw w modelu dla tego elementu.") — NIGDY wartość
 * zastępcza/zmyślona.
 */
function ElementProtectionFunctionsPanel({
  elementId,
  headingPl,
  testId,
}: {
  readonly elementId: string | null;
  readonly headingPl: string;
  readonly testId: string;
}): JSX.Element {
  const { assignments, hasProtection, isLoading, error } = useProtectionAssignment(elementId);

  return (
    <div data-testid={testId}>
      <div style={{ fontSize: 10, color: 'rgb(var(--scada-muted))', marginBottom: 6, fontWeight: 700 }}>
        {headingPl}
      </div>
      {isLoading ? (
        <div data-testid={`${testId}-loading`} style={{ fontSize: 10, color: 'rgb(var(--scada-muted))', fontStyle: 'italic' }}>
          Ładowanie nastaw…
        </div>
      ) : error ? (
        <div data-testid={`${testId}-error`} style={{ fontSize: 10, color: 'rgb(var(--scada-status-err))' }}>
          Nie udało się pobrać nastaw: {error}
        </div>
      ) : hasProtection ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {assignments.map((assignment) => (
            <ProtectionAssignmentSettingsRow key={assignment.device_id} assignment={assignment} />
          ))}
        </ul>
      ) : (
        <div data-testid={`${testId}-empty`} style={{ fontSize: 10, color: 'rgb(var(--scada-muted))', fontStyle: 'italic' }}>
          Brak nastaw w modelu dla tego elementu.
        </div>
      )}
    </div>
  );
}

function ProtectionAssignmentSettingsRow({
  assignment,
}: {
  readonly assignment: ElementProtectionAssignment;
}): JSX.Element {
  const functions = assignment.settings_summary?.functions ?? [];
  return (
    <li
      data-testid={`drawer-protection-device-${assignment.device_id}`}
      style={{
        background: 'rgb(var(--scada-surface))',
        border: '1px solid rgb(var(--scada-panel-raised))',
        borderRadius: 3,
        padding: '6px 8px',
        fontSize: 10,
      }}
    >
      <div style={{ color: 'rgb(var(--scada-text))', fontWeight: 700 }}>{assignment.device_name_pl}</div>
      {functions.length === 0 ? (
        <div style={{ color: 'rgb(var(--scada-muted))', fontStyle: 'italic', marginTop: 2 }}>
          Nastawy do konfiguracji
        </div>
      ) : (
        functions.map((func, index) => {
          const formatted = formatProtectionFunction(func);
          return (
            <div
              key={`${func.code}-${index}`}
              data-testid={formatted.testId}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 3, fontFamily: 'monospace' }}
            >
              <span style={{ color: 'rgb(var(--scada-status-warn-ink))', fontWeight: 700 }}>
                [{formatted.ansiCodes}] {formatted.shortcut}
              </span>
              <span style={{ color: 'rgb(var(--scada-text))', textAlign: 'right' }}>
                {formatted.setpoint}
                {formatted.computed ? ` ${formatted.computed}` : ''}
                {formatted.time ? `, ${formatted.time}` : ''}
              </span>
            </div>
          );
        })
      )}
    </li>
  );
}

function PlaceholderTabBody({
  kind,
  tab,
  elementId,
  voltageKv,
  transformerSpec,
  baysSpec,
  switchgearDescription,
  nnSpec,
  existingDers,
  apparatusSpec,
  cableRunSpec,
  nodeSpec,
  apparatusState,
  derForm,
  derCatalog,
  onOpenConfiguration,
}: {
  kind: SldDetailKind;
  tab: string;
  /** FAB-B: id elementu (bijection z ElementProtectionAssignment.element_id)
   *  — źródło nastaw zabezpieczeń dla zakładek der/protection, bay/protection,
   *  apparatus/settings (patrz ElementProtectionFunctionsPanel). */
  elementId: string | null;
  voltageKv: number | null;
  transformerSpec?: SldTransformerDrawerSpec | null;
  baysSpec?: ReadonlyArray<{
    readonly id: string;
    readonly name: string | null;
    readonly bayRole: string | null;
    readonly bayNumber: string | null;
    readonly feederShortName: string | null;
  }>;
  switchgearDescription?: string | null;
  nnSpec?: {
    readonly busVoltageKv: number | null;
    readonly loads: ReadonlyArray<{
      readonly id: string;
      readonly name: string | null;
      readonly pKw: number | null;
      readonly qKvar: number | null;
    }>;
  } | null;
  existingDers?: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'PV' | 'BESS' | 'FW' | null;
    readonly name: string | null;
    readonly pMw: number | null;
  }>;
  apparatusSpec?: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'CB' | 'DS' | 'ES' | 'CT' | 'VT' | 'OTHER';
    readonly label: string;
    readonly state: 'closed' | 'open' | 'unknown' | null;
  }>;
  cableRunSpec?: {
    readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop' | null;
    readonly segmentCount: number | null;
    readonly stationCount: number | null;
    readonly lengthKm: number | null;
    readonly segmentKind: 'cable_sn' | 'overhead_line_sn' | null;
    readonly maxLoadingPct?: number | null;
    readonly maxVoltageDropPct?: number | null;
    /** FAB-C: dane katalogowe odcinka (Cable/OverheadLine) z ENM — brak pola
     *  w modelu = null, NIGDY wartość zastępcza (usunięta fabrykacja K30-89). */
    readonly catalogRef?: string | null;
    readonly conductorMaterial?: string | null;
    readonly crossSectionMm2?: number | null;
    readonly insulation?: 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | null;
    readonly ratingInA?: number | null;
  } | null;
  nodeSpec?: NonNullable<SldDetailDrawerData['nodeSpec']> | null;
  apparatusState?: {
    readonly actualState: 'closed' | 'open' | 'unknown' | null;
    readonly controlMode: 'LOKALNY' | 'ZDALNY' | 'AUTO' | 'BLOKADA' | null;
    readonly communicationOk: boolean | null;
    readonly interlockBlocked: boolean | null;
    readonly lastChangeAt: string | null;
  } | null;
  derForm: UseFormReturn<SldDerConfigFormValues>;
  derCatalog: DerConverterCatalogState;
  onOpenConfiguration?: () => void;
}): JSX.Element {
  // Tab-specific scaffolding — actual editor forms wired w K30-72+
  if (kind === 'transformer') {
    return (
      <TransformerStationPanel
        transformerSpec={transformerSpec ?? null}
        voltageKv={voltageKv}
        onOpenConfiguration={onOpenConfiguration}
      />
    );
  }
  if (kind === 'node') {
    return <NodeEngineeringPanel nodeSpec={nodeSpec ?? null} tab={tab} />;
  }
  if (kind === 'station' && tab === 'transformator') {
    return (
      <TransformerStationPanel
        transformerSpec={transformerSpec ?? null}
        voltageKv={voltageKv}
        onOpenConfiguration={onOpenConfiguration}
      />
    );
  }
  if (kind === 'der' && tab === 'typ') {
    return (
      <div data-testid="drawer-der-type-selector">
        <label style={{ display: 'block', marginBottom: 6, color: 'rgb(var(--scada-muted))' }}>Typ DER</label>
        <select
          data-testid="drawer-der-type-select"
          {...derForm.register('derKind')}
          style={{
            background: 'rgb(var(--scada-surface))',
            color: 'rgb(var(--scada-text))',
            border: '1px solid rgb(var(--scada-border))',
            padding: 6,
            borderRadius: 3,
            width: '100%',
            fontSize: 11,
          }}
        >
          <option value="PV">PV (fotowoltaika)</option>
          <option value="BESS">BESS (magazyn energii)</option>
          <option value="FW">FW (farma wiatrowa)</option>
        </select>
        {derForm.formState.errors.derKind?.message && (
          <div data-testid="drawer-der-type-error" style={{ marginTop: 6, color: 'rgb(var(--scada-status-err))', fontSize: 10 }}>
            {derForm.formState.errors.derKind.message}
          </div>
        )}
      </div>
    );
  }
  if (kind === 'der' && tab === 'inverter') {
    const currentDerKind = derForm.watch('derKind');
    const currentConnectionVariant = derForm.watch('connectionVariant');
    const wariantLabel = currentConnectionVariant === 'nn_side' ? 'nN' : 'SN';
    return (
      <div data-testid="drawer-der-inverter">
        <label style={{ display: 'block', marginBottom: 6, color: 'rgb(var(--scada-muted))', fontSize: 10, fontWeight: 700 }}>
          Przekształtnik z katalogu
        </label>
        {derCatalog.status === 'loading' && (
          <div data-testid="drawer-der-inverter-loading" style={{ color: 'rgb(var(--scada-muted))', fontSize: 11 }}>
            Wczytywanie katalogu przekształtników…
          </div>
        )}
        {(derCatalog.status === 'empty' || derCatalog.status === 'error') && (
          <div data-testid="drawer-der-inverter-empty" style={{ color: 'rgb(var(--scada-status-warn))', fontSize: 11 }}>
            {derCatalog.errorMessage ?? 'Katalog przekształtników jest niedostępny.'}
          </div>
        )}
        {derCatalog.status === 'ready' && (
          <select
            data-testid="drawer-der-inverter-select"
            {...derForm.register('inverterCatalogRef')}
            style={{
              background: 'rgb(var(--scada-surface))',
              color: 'rgb(var(--scada-text))',
              border: '1px solid rgb(var(--scada-border))',
              padding: 6,
              borderRadius: 3,
              width: '100%',
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          >
            <option value="">{DER_INVERTER_PLACEHOLDER_LABEL}</option>
            {derCatalog.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        {derForm.formState.errors.inverterCatalogRef?.message && (
          <div data-testid="drawer-der-inverter-error" style={{ marginTop: 6, color: 'rgb(var(--scada-status-err))', fontSize: 10 }}>
            {derForm.formState.errors.inverterCatalogRef.message}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 9, color: 'rgb(var(--scada-muted))' }}>
          Powiązanie katalogowe dla {currentDerKind}; lista jest dopasowana do wariantu {wariantLabel}.
        </div>
      </div>
    );
  }
  if (kind === 'der' && tab === 'moc') {
    const currentDerKind = derForm.watch('derKind');
    const presets = currentDerKind === 'BESS'
      ? [0.05, 0.1, 0.25, 0.5, 1]
      : currentDerKind === 'FW'
      ? [2, 3, 5, 8, 10]
      : [0.1, 0.25, 0.5, 1, 2];
    return (
      <div data-testid="drawer-der-power">
        <label style={{ display: 'block', marginBottom: 6, color: 'rgb(var(--scada-muted))', fontSize: 10, fontWeight: 700 }}>
          Moc czynna zadana [MW]
        </label>
        <input
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          data-testid="drawer-der-power-input"
          {...derForm.register('powerMw', { valueAsNumber: true })}
          style={{
            background: 'rgb(var(--scada-surface))',
            color: 'rgb(var(--scada-status-warn-ink))',
            border: '1px solid rgb(var(--scada-border))',
            padding: 6,
            borderRadius: 3,
            width: '100%',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 700,
          }}
        />
        {derForm.formState.errors.powerMw?.message && (
          <div data-testid="drawer-der-power-error" style={{ marginTop: 6, color: 'rgb(var(--scada-status-err))', fontSize: 10 }}>
            {derForm.formState.errors.powerMw.message}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 9, color: 'rgb(var(--scada-muted))' }}>Typowe rozmiary {currentDerKind}:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {presets.map((mw) => (
            <button
              type="button"
              key={mw}
              data-testid={`drawer-der-power-preset-${Math.round(mw * 1000)}`}
              onClick={() => derForm.setValue('powerMw', mw, { shouldDirty: true, shouldValidate: true })}
              style={{
                background: 'rgb(var(--scada-surface))',
                color: 'rgb(var(--scada-text))',
                border: '1px solid rgb(var(--scada-border))',
                padding: '2px 6px',
                borderRadius: 2,
                fontSize: 10,
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              {mw < 1 ? `${Math.round(mw * 1000)} kW` : `${mw} MW`}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'der' && tab === 'punkt') {
    const selectedVariant = derForm.watch('connectionVariant');
    const pointVoltage = Number(derForm.watch('pointVoltageKv') ?? 0);
    const connectionRegister = derForm.register('connectionVariant');
    return (
      <div data-testid="drawer-der-connection-variant">
        <label style={{ display: 'block', marginBottom: 6, color: 'rgb(var(--scada-muted))' }}>Punkt podłączenia</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { value: 'nn_side', label: 'Strona nN (po transformatorze SN/nN)' },
            { value: 'sn_side', label: 'Strona SN (przez dedykowane pole)' },
            { value: 'dedicated', label: 'Dedykowane przyłącze (osobna linia)' },
          ].map((opt) => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgb(var(--scada-text))' }}>
              <input
                type="radio"
                name={connectionRegister.name}
                ref={connectionRegister.ref}
                onBlur={connectionRegister.onBlur}
                value={opt.value}
                data-testid={`drawer-der-connection-${opt.value}`}
                checked={selectedVariant === opt.value}
                onChange={() => {
                  const nextVariant = opt.value as SldDerConnectionVariant;
                  derForm.setValue('connectionVariant', nextVariant, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  derForm.setValue(
                    'pointVoltageKv',
                    pointVoltageForVariant(nextVariant, voltageKv),
                    { shouldDirty: true, shouldValidate: true },
                  );
                }}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div data-testid="drawer-der-point-voltage" style={{ marginTop: 10, color: 'rgb(var(--scada-text))', fontSize: 10, fontFamily: 'monospace' }}>
          Punkt przyłączenia: {pointVoltage.toFixed(3)} kV
        </div>
        {(derForm.formState.errors.connectionVariant?.message || derForm.formState.errors.pointVoltageKv?.message) && (
          <div data-testid="drawer-der-connection-error" style={{ marginTop: 6, color: 'rgb(var(--scada-status-err))', fontSize: 10 }}>
            {derForm.formState.errors.connectionVariant?.message ?? derForm.formState.errors.pointVoltageKv?.message}
          </div>
        )}
      </div>
    );
  }
  if (kind === 'der' && tab === 'protection') {
    return (
      <ElementProtectionFunctionsPanel
        elementId={elementId}
        headingPl="Funkcje zabezpieczeniowe DER (PN-EN 50549-2 / IEC 60255)"
        testId="drawer-der-protection"
      />
    );
  }
  if (kind === 'der' && tab === 'rfg') {
    const selectedModule = derForm.watch('ncRfgModule');
    const rfgRegister = derForm.register('ncRfgModule');
    return (
      <div data-testid="drawer-der-rfg">
        <label style={{ display: 'block', marginBottom: 6, color: 'rgb(var(--scada-muted))' }}>NC RfG typ</label>
        <div data-testid="drawer-der-rfg-types" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['A', 'B', 'C', 'D'].map((t) => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgb(var(--scada-text))' }}>
              <input
                type="radio"
                name={rfgRegister.name}
                ref={rfgRegister.ref}
                onBlur={rfgRegister.onBlur}
                value={t}
                checked={selectedModule === t}
                onChange={() => derForm.setValue('ncRfgModule', t as SldNcRfgModule, {
                  shouldDirty: true,
                  shouldValidate: true,
                })}
              />
              {`Typ ${t}`}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 12, color: 'rgb(var(--scada-muted))', fontSize: 10 }}>
          Grid code: PN-EN 50549 / IEEE 1547 / IEC 61400-21 (FW)
        </div>
      </div>
    );
  }
  if (kind === 'bay' && tab === 'protection') {
    return (
      <ElementProtectionFunctionsPanel
        elementId={elementId}
        headingPl="Zabezpieczenia pola (PN-EN 60255)"
        testId="drawer-bay-protection"
      />
    );
  }
  if (kind === 'cable_run' && tab === 'trasa') {
    const runKindLabel: Record<string, string> = {
      main_trunk: 'ciąg główny',
      branch: 'odgałęzienie',
      ring: 'pętla',
      loop: 'mufowany',
    };
    const segmentKindLabel: Record<string, string> = {
      cable_sn: 'kablowy SN',
      overhead_line_sn: 'napowietrzny SN',
    };
    return (
      <div data-testid="drawer-cable-trasa">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Typ ciągu</dt>
          <dd data-testid="drawer-cable-run-kind" style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace' }}>
            {cableRunSpec?.runKind ? (runKindLabel[cableRunSpec.runKind] ?? cableRunSpec.runKind) : 'kablowy SN'}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Wykonanie</dt>
          <dd style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace' }}>
            {cableRunSpec?.segmentKind ? (segmentKindLabel[cableRunSpec.segmentKind] ?? cableRunSpec.segmentKind) : '—'}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Długość</dt>
          <dd data-testid="drawer-cable-length" style={{ color: 'rgb(var(--scada-status-warn-ink))', fontFamily: 'monospace' }}>
            {cableRunSpec?.lengthKm != null ? `${formatTechnicalNumberPl(cableRunSpec.lengthKm)} km` : '—'}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Liczba segmentów</dt>
          <dd data-testid="drawer-cable-segment-count" style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace' }}>
            {cableRunSpec?.segmentCount ?? '—'}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Liczba stacji</dt>
          <dd data-testid="drawer-cable-station-count" style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace' }}>
            {cableRunSpec?.stationCount ?? '—'}
          </dd>
        </dl>
      </div>
    );
  }
  if (kind === 'cable_run' && tab === 'parametry') {
    // FAB-C (fantom danych katalogowych K30-89): wszystkie wartości poniżej
    // pochodzą WYŁĄCZNIE z cableRunSpec zbudowanego w detailDrawerData.ts
    // (ENM Cable/OverheadLine: catalog_ref/conductor_material/
    // cross_section_mm2/insulation/rating.in_a). Brak pola w modelu = uczciwy
    // stan zerowy „Brak w modelu" — NIGDY wartość zastępcza. Usunięta zaszyta
    // „Norma" (PN-HD 620 S2): model ENM nie niesie normy konstrukcyjnej kabla
    // (ani Cable, ani OverheadLine, ani BranchRating) — wiersz bez pokrycia w
    // kontrakcie danych jest fabrykacją, nie „brakiem do uzupełnienia".
    const NO_DATA = 'Brak w modelu';
    const crossSectionText = cableRunSpec?.crossSectionMm2 != null
      ? `${formatTechnicalNumberPl(cableRunSpec.crossSectionMm2)} mm²`
      : NO_DATA;
    const ratingText = cableRunSpec?.ratingInA != null
      ? `${formatTechnicalNumberPl(cableRunSpec.ratingInA)} A`
      : NO_DATA;
    // Linia napowietrzna (przewód goły) strukturalnie NIE MA izolacji (ENM
    // `OverheadLine` nie ma pola `insulation` — nie da się go „uzupełnić").
    // To NIE jest brak danych, tylko brak zastosowania — rozróżnienie po
    // segmentKind (jedyne źródło prawdy o rodzaju odcinka w tym kontrakcie).
    const insulationText = cableRunSpec?.segmentKind === 'overhead_line_sn'
      ? 'Nie dotyczy (przewód goły)'
      : (cableRunSpec?.insulation ?? NO_DATA);
    return (
      <div data-testid="drawer-cable-parametry">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Typ kabla</dt>
          <dd data-testid="drawer-cable-catalog-ref" style={{ color: cableRunSpec?.catalogRef ? 'rgb(var(--scada-text))' : 'rgb(var(--scada-muted))', fontFamily: 'monospace' }}>
            {cableRunSpec?.catalogRef ?? NO_DATA}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Przekrój żyły</dt>
          <dd data-testid="drawer-cable-cross-section" style={{ color: cableRunSpec?.crossSectionMm2 != null ? 'rgb(var(--scada-text))' : 'rgb(var(--scada-muted))', fontFamily: 'monospace' }}>
            {crossSectionText}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Materiał</dt>
          <dd data-testid="drawer-cable-material" style={{ color: cableRunSpec?.conductorMaterial ? 'rgb(var(--scada-text))' : 'rgb(var(--scada-muted))', fontFamily: 'monospace' }}>
            {cableRunSpec?.conductorMaterial ?? NO_DATA}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Izolacja</dt>
          <dd data-testid="drawer-cable-insulation" style={{ color: cableRunSpec?.insulation ? 'rgb(var(--scada-text))' : 'rgb(var(--scada-muted))', fontFamily: 'monospace' }}>
            {insulationText}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Ampacity I_max</dt>
          <dd data-testid="drawer-cable-ampacity" style={{ color: cableRunSpec?.ratingInA != null ? 'rgb(var(--scada-text))' : 'rgb(var(--scada-muted))', fontFamily: 'monospace' }}>
            {ratingText}
          </dd>
        </dl>
      </div>
    );
  }
  if (kind === 'cable_run' && tab === 'spadek') {
    const loading = cableRunSpec?.maxLoadingPct;
    const vdrop = cableRunSpec?.maxVoltageDropPct;
    const loadingColor = loading == null
      ? 'rgb(var(--scada-muted))'
      : loading >= 95 ? 'rgb(var(--scada-status-err))'
      : loading >= 75 ? 'rgb(var(--scada-status-warn-ink))'
      : 'rgb(var(--scada-status-ok))';
    const vdropColor = vdrop == null
      ? 'rgb(var(--scada-muted))'
      : Math.abs(vdrop) >= 8 ? 'rgb(var(--scada-status-err))'
      : Math.abs(vdrop) >= 5 ? 'rgb(var(--scada-status-warn-ink))'
      : 'rgb(var(--scada-status-ok))';
    return (
      <div data-testid="drawer-cable-spadek">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>ΔU max [%]</dt>
          <dd data-testid="drawer-cable-vdrop-total" style={{ color: vdropColor, fontFamily: 'monospace', fontWeight: 700 }}>
            {vdrop != null ? `${vdrop.toFixed(2)} %` : '—'}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Loading max [%]</dt>
          <dd data-testid="drawer-cable-loading" style={{ color: loadingColor, fontFamily: 'monospace', fontWeight: 700 }}>
            {loading != null ? `${loading.toFixed(1)} %` : '—'}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Klasa zgodności</dt>
          <dd style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace', fontSize: 10 }}>
            PN-EN 50160 (±10%)
          </dd>
        </dl>
        {(loading == null && vdrop == null) && (
          <div style={{ marginTop: 8, fontSize: 9, color: 'rgb(var(--scada-muted))', fontStyle: 'italic' }}>
            Wartości z LF overlay payload (load_flow analysis). Uruchom analizę Power Flow.
          </div>
        )}
      </div>
    );
  }
  if (kind === 'apparatus' && tab === 'state') {
    const aps = apparatusState;
    const stateLabel = aps?.actualState === 'closed' ? 'zamknięty'
      : aps?.actualState === 'open' ? 'otwarty'
      : aps?.actualState === 'unknown' ? 'nieznany'
      : 'zamknięty';
    const stateColor = aps?.actualState === 'open' ? 'rgb(var(--scada-status-warn-ink))'
      : aps?.actualState === 'unknown' ? 'rgb(var(--scada-muted))'
      : 'rgb(var(--scada-status-ok))';
    return (
      <div data-testid="drawer-apparatus-state">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Stan aktualny</dt>
          <dd data-testid="drawer-apparatus-actual-state" style={{ color: stateColor, fontFamily: 'monospace', fontWeight: 700 }}>{stateLabel}</dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Tryb sterowania</dt>
          <dd style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace' }}>{aps?.controlMode ?? 'LOKALNY'}</dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Komunikacja</dt>
          <dd style={{ color: aps?.communicationOk === false ? 'rgb(var(--scada-status-err))' : 'rgb(var(--scada-status-ok))', fontFamily: 'monospace' }}>
            {aps?.communicationOk === false ? 'BŁĄD' : 'OK'}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Uzależnienie operacyjne</dt>
          <dd style={{ color: aps?.interlockBlocked ? 'rgb(var(--scada-status-err))' : 'rgb(var(--scada-text))', fontFamily: 'monospace' }}>
            {aps?.interlockBlocked ? 'aktywne' : 'nieaktywne'}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Ostatnia zmiana</dt>
          <dd style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace', fontSize: 10 }}>
            {aps?.lastChangeAt ?? '—'}
          </dd>
        </dl>
      </div>
    );
  }
  if (kind === 'apparatus' && tab === 'settings') {
    return (
      <ElementProtectionFunctionsPanel
        elementId={elementId}
        headingPl="Nastawy (IEC 60255 / ANSI)"
        testId="drawer-apparatus-settings"
      />
    );
  }
  if (kind === 'bay' && tab === 'apparatus') {
    const stateLabel: Record<string, string> = {
      closed: 'zamknięty',
      open: 'otwarty',
      unknown: 'nieznany',
    };
    const stateColor: Record<string, string> = {
      closed: 'rgb(var(--scada-status-ok))',
      open: 'rgb(var(--scada-status-err))',
      unknown: 'rgb(var(--scada-muted))',
    };
    if (!apparatusSpec || apparatusSpec.length === 0) {
      return (
        <div data-testid="drawer-bay-apparatus-empty" style={{ color: 'rgb(var(--scada-muted))', fontStyle: 'italic', fontSize: 10 }}>
          Aparatura pola wynika z wariantu katalogowego rozdzielnicy.
        </div>
      );
    }
    return (
      <div data-testid="drawer-bay-apparatus">
        <div style={{ fontSize: 10, color: 'rgb(var(--scada-muted))', marginBottom: 6, fontWeight: 700 }}>
          Aparatura ({apparatusSpec.length})
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {apparatusSpec.map((app) => {
            const stateKey = app.state ?? 'unknown';
            return (
              <li
                key={app.id}
                data-testid={`drawer-bay-app-${app.id}`}
                style={{
                  background: 'rgb(var(--scada-surface))',
                  border: '1px solid rgb(var(--scada-panel-raised))',
                  borderRadius: 3,
                  padding: '6px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11,
                }}
              >
                <div>
                  <span style={{ color: 'rgb(var(--scada-status-warn-ink))', fontWeight: 700, fontFamily: 'monospace' }}>
                    [{app.kind}]
                  </span>
                  <span style={{ color: 'rgb(var(--scada-text))', marginLeft: 6 }}>{app.label}</span>
                </div>
                <span
                  data-testid={`drawer-bay-app-${app.id}-state`}
                  style={{ color: stateColor[stateKey], fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}
                >
                  {stateLabel[stateKey]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  if (kind === 'station' && tab === 'der') {
    const totalMw = (existingDers ?? []).reduce((sum, d) => sum + (d.pMw ?? 0), 0);
    const colorFor = (k: 'PV' | 'BESS' | 'FW' | null) =>
      k === 'PV' ? 'rgb(var(--scada-status-warn-ink))' : k === 'BESS' ? 'rgb(var(--scada-text))' : k === 'FW' ? 'rgb(var(--scada-status-ok-ink))' : 'rgb(var(--scada-muted))';
    return (
      <div data-testid="drawer-station-der">
        <div style={{ fontSize: 10, color: 'rgb(var(--scada-muted))', marginBottom: 6, fontWeight: 700 }}>
          Układy PV/BESS/FW ({(existingDers ?? []).length})
          {totalMw > 0 && (
            <span data-testid="drawer-station-der-total" style={{ marginLeft: 8, color: 'rgb(var(--scada-status-warn-ink))' }}>
              Σ {formatMwPl(totalMw)}
            </span>
          )}
        </div>
        {existingDers && existingDers.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {existingDers.map((der, derIndex) => (
              <li
                key={der.id}
                data-testid={`drawer-station-der-${der.id}`}
                style={{
                  background: 'rgb(var(--scada-surface))',
                  border: `1px solid ${colorFor(der.kind)}40`,
                  borderRadius: 3,
                  padding: '6px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11,
                }}
              >
                <div>
                  <span style={{ color: colorFor(der.kind), fontWeight: 700 }}>{der.kind ?? 'DER'}</span>
                  <span style={{ color: 'rgb(var(--scada-text))', marginLeft: 6 }}>{formatExistingDerName(der, derIndex)}</span>
                </div>
                <span style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace', fontSize: 10 }}>
                  {der.pMw != null ? formatMwPl(der.pMw) : '—'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div data-testid="drawer-station-der-empty" style={{ color: 'rgb(var(--scada-muted))', fontStyle: 'italic', fontSize: 10 }}>
            Układy PV/BESS/FW dodaje się z palety jako gotowy wariant przyłączenia.
          </div>
        )}
      </div>
    );
  }
  if (kind === 'station' && tab === 'nn') {
    return (
      <div data-testid="drawer-nn-side">
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 12 }}>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Szyna nN U</dt>
          <dd data-testid="drawer-nn-bus-voltage" style={{ color: 'rgb(var(--scada-status-warn-ink))', fontFamily: 'monospace' }}>
            {nnSpec?.busVoltageKv != null ? formatKvPl(nnSpec.busVoltageKv) : `${formatKvPl(0.4)} (wariant katalogowy)`}
          </dd>
          <dt style={{ color: 'rgb(var(--scada-muted))' }}>Liczba odpływów</dt>
          <dd data-testid="drawer-nn-loads-count" style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace' }}>
            {nnSpec?.loads?.length ?? 0}
          </dd>
        </dl>
        {nnSpec?.loads && nnSpec.loads.length > 0 ? (
          <>
            <div style={{ fontSize: 10, color: 'rgb(var(--scada-muted))', marginBottom: 6, fontWeight: 700 }}>
              Odpływy nN
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {nnSpec.loads.map((load) => (
                <li
                  key={load.id}
                  data-testid={`drawer-nn-load-${load.id}`}
                  style={{
                    background: 'rgb(var(--scada-surface))',
                    border: '1px solid rgb(var(--scada-panel-raised))',
                    borderRadius: 3,
                    padding: '6px 8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: 'rgb(var(--scada-text))' }}>{load.name ?? load.id}</span>
                  <span style={{ color: 'rgb(var(--scada-text))', fontFamily: 'monospace' }}>
                    {load.pKw != null ? formatKwPl(load.pKw) : '—'}
                    {load.qKvar != null ? ` / ${formatKvarPl(load.qKvar)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div data-testid="drawer-nn-no-loads" style={{ color: 'rgb(var(--scada-muted))', fontStyle: 'italic', fontSize: 10 }}>
            Odpływy nN konfigurowane z wariantu stacji.
          </div>
        )}
      </div>
    );
  }
  if (kind === 'station' && tab === 'rozdzielnica') {
    if (!baysSpec || baysSpec.length === 0) {
      return (
        <div data-testid="drawer-rozdzielnica-empty" style={{ color: 'rgb(var(--scada-muted))', fontStyle: 'italic' }}>
          {switchgearDescription ?? 'Rozdzielnica SN: układ pól zgodny z typem stacji.'}
        </div>
      );
    }
    const roleLabel: Record<string, string> = {
      IN: 'Pole dopływowe',
      OUT: 'Pole odpływowe',
      TR: 'Pole transformatorowe',
      COUPLER: 'Łącznik sekcyjny',
      FEEDER: 'Pole zasilające',
      MEASUREMENT: 'Pole pomiarowe',
      OZE: 'Pole OZE',
    };
    return (
      <div data-testid="drawer-rozdzielnica-bays">
        <div style={{ fontSize: 10, color: 'rgb(var(--scada-muted))', marginBottom: 6, fontWeight: 700 }}>
          Pola SN ({baysSpec.length})
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {baysSpec.map((bay) => (
            <li
              key={bay.id}
              data-testid={`drawer-rozdzielnica-bay-${bay.id}`}
              style={{
                background: 'rgb(var(--scada-surface))',
                border: '1px solid rgb(var(--scada-panel-raised))',
                borderRadius: 3,
                padding: '6px 8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ color: 'rgb(var(--scada-text))', fontWeight: 600, fontSize: 11 }}>
                  {bay.bayNumber ? `Q${bay.bayNumber}` : (bay.feederShortName ?? bay.name ?? bay.id)}
                </div>
                <div style={{ color: 'rgb(var(--scada-text))', fontSize: 9 }}>
                  {bay.bayRole ? (roleLabel[bay.bayRole] ?? bay.bayRole) : 'Pole'}
                  {bay.feederShortName && bay.bayNumber ? ` · ${bay.feederShortName}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 9, color: 'rgb(var(--scada-muted))', fontFamily: 'monospace' }}>{bay.bayRole ?? '—'}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div style={{ color: 'rgb(var(--scada-muted))' }} data-testid={`drawer-technical-note-${kind}-${tab}`}>
      Karta techniczna obiektu. Zmiany układu wykonaj akcją kontekstową albo w pełnym widoku.
    </div>
  );
}
