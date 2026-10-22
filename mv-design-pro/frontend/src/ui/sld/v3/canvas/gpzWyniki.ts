/**
 * Karta GPZ-PARYTET (rozstrzygnięcie §0 pkt 5): wyniki pól i bilansu GPZ dla
 * adnotacji bloku — WYŁĄCZNIE odczyt i formatowanie wierszy `Bay`/`Substation`
 * z `results/v1` (backend `enm/wyniki_pol_gpz.py`). Bilans zasilania, bilans
 * odpływów i liczbę przeciążeń liczy backend; tu nie ma żadnej arytmetyki
 * fizycznej (ani sumy, ani różnicy, ani przeliczenia jednostek).
 *
 * Stan zwracany jest jawny: `null` = brak wyniku rozpływu mocy (brak biegu albo
 * bieg innej analizy). Metryka nieobecna w wierszu = `null` w polu (render pisze
 * „brak"), nigdy zero.
 */
import type { RawMetricValue, RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import type { BilansGpzWartosci } from '../compose/gpzAdnotacje';
import { formatMetricValuePl, normalizeResultLabelAnalysis } from './resultLabelTemplates';

export interface WynikiPolaGpz {
  readonly p: string | null;
  readonly q: string | null;
  readonly i: string | null;
  readonly u: string | null;
}

export interface WynikiStacjiGpz {
  readonly bilans: BilansGpzWartosci;
  readonly liczbaPrzeciazen: string | null;
}

export interface GpzWynikiOverlay {
  /** Wiersze pól wg `Bay.ref_id` (ta sama przestrzeń co `bayRef` kompozycji GPZ). */
  readonly pola: Readonly<Record<string, WynikiPolaGpz>>;
  /** Wiersze bilansu wg `Substation.ref_id` (ta sama przestrzeń co `props.id` GPZ). */
  readonly stacje: Readonly<Record<string, WynikiStacjiGpz>>;
  /** Karta GPZ-H5-SLD pkt 3b (R15): `true` = wynik z aktywnego biegu rodziny rozpływu,
   *  a schemat pokazuje inny bieg (np. zwarciowy) — tytuł tabeli mówi to jawnie. */
  readonly zBieguSpozaWidoku: boolean;
  /** Świeżość biegu, z którego pochodzą wyniki (`kontekstWyniku.swiezoscBiegu`); ustawia
   *  przestrzeń robocza — bieg bloku może być innym biegiem niż nakładka schematu. */
  readonly nieaktualny?: boolean;
}

/** Kody metryk wierszy GPZ — jedno źródło z backendem (`result_builder_v1._METRIC_MAP`). */
export const KODY_METRYK_POLA_GPZ = { p: 'P_MW', q: 'Q_Mvar', i: 'I_A', u: 'U_kV' } as const;
export const KODY_METRYK_STACJI_GPZ = {
  pZasilaniaMw: 'P_SUPPLY_MW',
  qZasilaniaMvar: 'Q_SUPPLY_Mvar',
  pOdplywowMw: 'P_FEEDERS_MW',
  qOdplywowMvar: 'Q_FEEDERS_Mvar',
  liczbaPrzeciazen: 'ALARM_COUNT',
} as const;

function wartosc(metryki: Readonly<Record<string, RawMetricValue>>, kod: string): string | null {
  const metryka = metryki[kod];
  if (!metryka || typeof metryka.value !== 'number' || !Number.isFinite(metryka.value)) return null;
  return formatMetricValuePl(metryka);
}

/**
 * Karta GPZ-H5-SLD pkt 3b (R15): payload, z którego blok GPZ czyta wyniki pól i bilansu.
 * Blok GPZ pokazuje wielkości ROZPŁYWU, więc czyta kontekst RODZINY rozpływu (karta K8),
 * niezależnie od biegu oglądanego na schemacie: gdy schemat pokazuje bieg rozpływu — ten
 * bieg (schemat i blok zgodne); gdy pokazuje inny bieg (zwarcie, dynamika) — aktywny bieg
 * rodziny rozpływu. Dawniej blok czytał tylko payload schematu i po wybraniu biegu
 * zwarciowego pisał „brak wyniku rozpływu mocy" przy aktualnym rozpływie.
 */
export function payloadWynikowGpz(
  payloadSchematu: RawOverlayPayload | null | undefined,
  payloadRodzinyRozplywu: RawOverlayPayload | null | undefined,
): { readonly payload: RawOverlayPayload | null; readonly zBieguSpozaWidoku: boolean } {
  if (payloadSchematu && normalizeResultLabelAnalysis(payloadSchematu.analysis_type) === 'load_flow') {
    return { payload: payloadSchematu, zBieguSpozaWidoku: false };
  }
  if (payloadRodzinyRozplywu && normalizeResultLabelAnalysis(payloadRodzinyRozplywu.analysis_type) === 'load_flow') {
    return { payload: payloadRodzinyRozplywu, zBieguSpozaWidoku: payloadSchematu != null };
  }
  return { payload: null, zBieguSpozaWidoku: false };
}

/** Wyniki GPZ z payloadu `results/v1`; `null` = brak wyniku rozpływu mocy. */
export function buildGpzWynikiOverlay(
  payload: RawOverlayPayload | null | undefined,
  zBieguSpozaWidoku = false,
): GpzWynikiOverlay | null {
  if (!payload || normalizeResultLabelAnalysis(payload.analysis_type) !== 'load_flow') return null;
  const pola: Record<string, WynikiPolaGpz> = {};
  const stacje: Record<string, WynikiStacjiGpz> = {};
  Object.keys(payload.elements)
    .sort()
    .forEach((ref) => {
      const element = payload.elements[ref];
      if (element.kind === 'bay') {
        pola[ref] = {
          p: wartosc(element.metrics, KODY_METRYK_POLA_GPZ.p),
          q: wartosc(element.metrics, KODY_METRYK_POLA_GPZ.q),
          i: wartosc(element.metrics, KODY_METRYK_POLA_GPZ.i),
          u: wartosc(element.metrics, KODY_METRYK_POLA_GPZ.u),
        };
      } else if (element.kind === 'substation') {
        stacje[ref] = {
          bilans: {
            pZasilaniaMw: wartosc(element.metrics, KODY_METRYK_STACJI_GPZ.pZasilaniaMw),
            qZasilaniaMvar: wartosc(element.metrics, KODY_METRYK_STACJI_GPZ.qZasilaniaMvar),
            pOdplywowMw: wartosc(element.metrics, KODY_METRYK_STACJI_GPZ.pOdplywowMw),
            qOdplywowMvar: wartosc(element.metrics, KODY_METRYK_STACJI_GPZ.qOdplywowMvar),
          },
          liczbaPrzeciazen: wartosc(element.metrics, KODY_METRYK_STACJI_GPZ.liczbaPrzeciazen),
        };
      }
    });
  return { pola, stacje, zBieguSpozaWidoku };
}
