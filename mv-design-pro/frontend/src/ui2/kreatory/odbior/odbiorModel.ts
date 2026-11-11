/**
 * Model kreatora „Dodaj odbiór nN" (V12K-050, G-NN).
 *
 * Odbiór na odpływie nN. Katalog-first domyślnie (typ OBCIAZENIE wymagany);
 * tryb ręczny (ekspercki) — `manual_mode` — zwalnia z katalogu JAWNIE, przez
 * przełącznik w kreatorze, i wysyła `source_mode: 'EKSPERCKI_RECZNY'` (karta
 * D4: ten sam wyróżnik, którym operacja domenowa `add_nn_load` już znakuje
 * odbiór bez pozycji katalogowej w migawce). ZERO fizyki w UI — prąd/moc
 * pozorną liczy backend (R1: cable-rated-current); moc bierną Q wyprowadza
 * operacja domenowa z cosφ (P·tan(arccos cosφ)), gdy Q nie podano jawnie.
 * Zapis = operacja domenowa `add_nn_load`.
 *
 * FAZY PRZYŁĄCZENIA (W5-D): JEDNO źródło prawdy o fazach odbioru to pole
 * `Load.phases` modelu (`enm/models.py::PhaseSet`), czytane przez rozpływ
 * niesymetryczny (`rozplyw_niesymetryczny`, solver BFS per faza). Formularz
 * startuje BEZ wskazania (`null`) — odbiór bez wskazanej fazy jest liczony jako
 * trójfazowy symetryczny (dokładnie jak przed W5-D; klucz nie trafia do
 * migawki, hash ENM bez zmian). Dawny osobny wybór „sposób przyłączenia"
 * (`connection_type`, meta odbioru bez żadnego konsumenta) jest WYPROWADZANY
 * z faz (`connectionTypeZFaz`) — dwie niezależne kontrolki tej samej cechy
 * fizycznej byłyby dwiema prawdami (reguła „predykaty parami").
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { CableRatedCurrentRequest } from '../../../ui/network-build/forms/cableVoltageDropApi';
import type { LoadCatalogType } from '../../../ui/catalog/types';
import type { PhaseSet } from '../../../types/enm';
import type { NNConnectionType } from '../../../types/domainOps';

export type LoadKind = 'SKUPIONY' | 'ROZPROSZONY';

/** Wartości pola `phases` w kolejności kanonu (`enm/models.py::FAZY_PRZYLACZENIA`). */
export const FAZY_PRZYLACZENIA: readonly PhaseSet[] = ['ABC', 'A', 'B', 'C', 'AB', 'BC', 'CA'];

/**
 * `connection_type` operacji `add_nn_load` wyprowadzony z faz: brak wskazania
 * albo `ABC` = trójfazowy; faza–N (A/B/C) i międzyfazowy (AB/BC/CA) = odbiór
 * jednofazowy (jedna faza obciążenia, między przewodami L–N albo L–L).
 */
export function connectionTypeZFaz(phases: PhaseSet | null): NNConnectionType {
  return phases === null || phases === 'ABC' ? 'TROJFAZOWY' : 'JEDNOFAZOWY';
}

/**
 * Współczynniki modelu obciążenia ZIP — dokładnie te, które kontrakt pól
 * OBCIAZENIE wystawia projektantowi i które rozpływ mocy czyta z tabliczki
 * odbioru. Kolejność zamrożona (P: a, b, c; Q: a, b, c; wrażliwość f).
 */
export const POLA_ZIP = ['a_p', 'b_p', 'c_p', 'a_q', 'b_q', 'c_q', 'k_pf', 'k_qf'] as const;
export type PoleZip = (typeof POLA_ZIP)[number];
export type ModelZip = Record<PoleZip, number>;

/** Stała moc bez wrażliwości częstotliwościowej — zachowanie zastane rozpływu. */
export const ZIP_DOMYSLNY: ModelZip = {
  a_p: 0,
  b_p: 0,
  c_p: 1,
  a_q: 0,
  b_q: 0,
  c_q: 1,
  k_pf: 0,
  k_qf: 0,
};

/** Tolerancja numeryczna sumy udziałów — parytet z kontraktem backendu. */
const TOLERANCJA_SUMY_ZIP = 1e-6;

export interface OdbiorFormData {
  catalog_ref: string | null;
  /**
   * Tryb doboru odbioru — `false` = z katalogu (domyślny, katalog-first),
   * `true` = ręczny/ekspercki (bez pozycji katalogowej). Ten sam wzorzec
   * przełącznika co `zrodloModel.ts` (`manual_mode`) dla `add_grid_source_sn`:
   * karta D4 wiąże się z DOKŁADNIE tym samym wyróżnikiem po stronie backendu
   * (`source_mode: 'EKSPERCKI_RECZNY'`), żeby ścieżka ekspercka była
   * osiągalna JAWNIE, a nie tylko przez pozostawienie pola pustym.
   */
  manual_mode: boolean;
  nazwa: string;
  active_power_kw: number | null;
  cos_phi: number;
  /** Jawny override mocy biernej [kvar]; gdy null — backend wyprowadzi z cosφ. */
  reactive_power_kvar: number | null;
  load_kind: LoadKind;
  /** Fazy przyłączenia (`Load.phases`); `null` = nie wskazano (trójfazowy symetryczny). */
  phases: PhaseSet | null;
  /**
   * Rezystancja uziomu instalacji odbiorczej R_A [Ω] (`Load.earth_electrode_r_ohm`, karta
   * W5-E-TTIT): pętla doziemna układu TT domyka się przez ten uziom, napięcie dotykowe to
   * R_A·I_Δn. `null` = nie podano — analiza TT odmawia kodem `nn.brak_r_a` (zero podstawiania).
   */
  earth_electrode_r_ohm: number | null;
  /** Model obciążenia (ZIP) — czytany przez rozpływ mocy, ustawiany przez projektanta. */
  zip: ModelZip;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: OdbiorFormData = {
  catalog_ref: null,
  manual_mode: false,
  nazwa: '',
  active_power_kw: 50,
  cos_phi: 0.93,
  reactive_power_kvar: null,
  load_kind: 'SKUPIONY',
  phases: null,
  earth_electrode_r_ohm: null,
  zip: { ...ZIP_DOMYSLNY },
};

function isPositive(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Suma udziałów Z+I+P dla wskazanej mocy (czynnej albo biernej). */
export function sumaUdzialowZip(zip: ModelZip, moc: 'p' | 'q'): number {
  return moc === 'p' ? zip.a_p + zip.b_p + zip.c_p : zip.a_q + zip.b_q + zip.c_q;
}

/** Czy model to stała moc bez wrażliwości częstotliwościowej (zachowanie zastane). */
export function czyZipDomyslny(zip: ModelZip): boolean {
  return POLA_ZIP.every((pole) => zip[pole] === ZIP_DOMYSLNY[pole]);
}

/**
 * Walidacja modelu ZIP: udziały w [0, 1] i suma a+b+c = 1 osobno dla P i dla Q.
 * Ten sam warunek egzekwuje operacja domenowa — tu jest wyłącznie po to, żeby
 * projektant zobaczył błąd przy polu, a nie dopiero w odpowiedzi serwera.
 */
export function walidujZip(zip: ModelZip): BladPola[] {
  const errors: BladPola[] = [];
  for (const pole of POLA_ZIP) {
    if (!Number.isFinite(zip[pole])) {
      errors.push({ field: `zip.${pole}`, message: 'Podaj wartość liczbową.' });
    }
  }
  if (errors.length > 0) return errors;
  for (const pole of ['a_p', 'b_p', 'c_p', 'a_q', 'b_q', 'c_q'] as const) {
    if (zip[pole] < 0 || zip[pole] > 1) {
      errors.push({ field: `zip.${pole}`, message: 'Udział musi mieścić się w zakresie [0, 1].' });
    }
  }
  for (const moc of ['p', 'q'] as const) {
    const suma = sumaUdzialowZip(zip, moc);
    if (Math.abs(suma - 1) > TOLERANCJA_SUMY_ZIP) {
      errors.push({
        field: `zip.suma_${moc}`,
        message:
          `Suma udziałów a+b+c dla mocy ${moc === 'p' ? 'czynnej P' : 'biernej Q'} wynosi `
          + `${suma.toFixed(3)} — musi wynosić 1.`,
      });
    }
  }
  return errors;
}

export function walidujFormularz(data: OdbiorFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!isPositive(data.active_power_kw)) {
    errors.push({ field: 'active_power_kw', message: 'Moc czynna odbioru musi być dodatnia.' });
  }
  if (data.cos_phi <= 0 || data.cos_phi > 1) {
    errors.push({ field: 'cos_phi', message: 'Współczynnik mocy cosφ musi być w zakresie (0, 1].' });
  }
  // Katalog-first pozostaje domyślne (karta D4): w trybie katalogowym pozycja
  // katalogowa jest wymagana. Tryb ręczny (ekspercki) zwalnia z tego wymogu —
  // JAWNIE, przez przełącznik, nie przez ciche pozostawienie pola pustym.
  if (!data.manual_mode && !data.catalog_ref?.trim()) {
    errors.push({
      field: 'catalog_ref',
      message: 'Wybierz typ odbioru z katalogu albo przełącz na tryb ręczny (ekspercki).',
    });
  }
  // R_A jest opcjonalne (układ TN nie czyta uziomu instalacji), ale podane musi być dodatnie —
  // ten sam warunek co `enm/uziom_instalacji.py::waliduj_r_a` (jedno źródło reguły).
  if (data.earth_electrode_r_ohm !== null && !isPositive(data.earth_electrode_r_ohm)) {
    errors.push({
      field: 'earth_electrode_r_ohm',
      message: 'Rezystancja uziomu instalacji $R_A$ musi być dodatnia [Ω] albo pozostać pusta.',
    });
  }
  errors.push(...walidujZip(data.zip));
  return errors;
}

/**
 * Model ZIP pozycji katalogowej. Pozycja, która nie deklaruje danego udziału,
 * zostaje przy wartości domyślnej kontraktu (stała moc) — nie przy wartości
 * poprzednio wpisanej w formularzu, bo wybór typu ma pokazać model TEGO typu.
 */
function zipZKatalogu(it: LoadCatalogType): ModelZip {
  const out = { ...ZIP_DOMYSLNY };
  for (const pole of POLA_ZIP) {
    const v = it[pole];
    if (typeof v === 'number' && Number.isFinite(v)) out[pole] = v;
  }
  return out;
}

/** Prefill z katalogu odbioru (opcjonalny). */
export function prefillZKatalogu(
  data: OdbiorFormData,
  catalogRef: string | null,
  typy: readonly LoadCatalogType[],
): OdbiorFormData {
  const it = catalogRef ? typy.find((t) => t.id === catalogRef) : undefined;
  if (!it) return { ...data, catalog_ref: catalogRef };
  return {
    ...data,
    catalog_ref: catalogRef,
    active_power_kw: isPositive(it.p_kw) ? it.p_kw : data.active_power_kw,
    cos_phi: typeof it.cos_phi === 'number' && it.cos_phi > 0 ? it.cos_phi : data.cos_phi,
    reactive_power_kvar: typeof it.q_kvar === 'number' ? it.q_kvar : data.reactive_power_kvar,
    zip: zipZKatalogu(it),
  };
}

/** Buduje żądanie podglądu prądu (R1 cable-rated-current) lub null. */
export function zbudujZapytaniePodgladu(
  data: OdbiorFormData,
  napiecie_v: number,
): CableRatedCurrentRequest | null {
  if (!isPositive(data.active_power_kw) || data.cos_phi <= 0 || !isPositive(napiecie_v)) {
    return null;
  }
  return {
    active_power_kw: data.active_power_kw,
    cos_phi: data.cos_phi,
    line_voltage_v: napiecie_v,
  };
}

export interface KontekstOdbioru {
  feeder_ref?: string;
  bus_nn_ref?: string;
  feeder_name?: string;
  /** Szyna SN odbioru `add_load_sn` (menu szyny na schemacie). */
  bus_ref?: string;
  bus_name?: string;
  bus_voltage_kv?: number;
}

/** Czy kontekst wskazuje miejsce przyłączenia odbioru danego poziomu. */
export function maMiejscePrzylaczenia(
  kontekst: KontekstOdbioru,
  poziom: PoziomOdbioru = 'nn',
): boolean {
  return poziom === 'sn' ? Boolean(kontekst.bus_ref?.trim()) : Boolean(kontekst.feeder_ref?.trim());
}

/**
 * Poziom odbioru — ta sama formatka dla dwóch operacji domenowych o wspólnej semantyce
 * P/Q/cosφ/ZIP/faz (`enm.domain_operations_v2.add_load_sn` reużywa derywacji
 * `add_nn_load`): `nn` = odbiór na odpływie nN (`add_nn_load`, kontekst `feeder_ref`),
 * `sn` = odbiór wprost na szynie SN (`add_load_sn`, kontekst `bus_ref`).
 */
export type PoziomOdbioru = 'nn' | 'sn';

/** Operacja domenowa zapisu odbioru danego poziomu — jedno źródło dla kreatora i testów. */
export const OPERACJA_ODBIORU: Readonly<Record<PoziomOdbioru, 'add_nn_load' | 'add_load_sn'>> = {
  nn: 'add_nn_load',
  sn: 'add_load_sn',
};

export function zbudujPayload(
  data: OdbiorFormData,
  kontekst: KontekstOdbioru,
  poziom: PoziomOdbioru = 'nn',
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    active_power_kw: data.active_power_kw,
    cos_phi: data.cos_phi,
    load_kind: data.load_kind,
    connection_type: connectionTypeZFaz(data.phases),
    // Fazy jadą w payloadzie TYLKO gdy wskazane: odbiór bez wskazania wysyła
    // dokładnie ten payload co przed W5-D (migawka bez klucza `phases`).
    ...(data.phases !== null ? { phases: data.phases } : {}),
    ...(data.nazwa.trim() ? { load_name: data.nazwa.trim() } : {}),
    ...(isPositive(data.reactive_power_kvar) ? { reactive_power_kvar: data.reactive_power_kvar } : {}),
    // Uziom instalacji R_A jedzie w payloadzie TYLKO gdy podany (pole addytywne modelu,
    // poza hashem gdy puste — odbiór bez R_A wysyła dokładnie dotychczasowy payload).
    ...(isPositive(data.earth_electrode_r_ohm) ? { earth_electrode_r_ohm: data.earth_electrode_r_ohm } : {}),
    ...(!data.manual_mode && data.catalog_ref?.trim()
      ? { catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'OBCIAZENIE') }
      : {}),
    // Tryb ręczny (ekspercki): DOKŁADNIE ten sam wyróżnik, którym operacja
    // domenowa `add_nn_load` już znakuje odbiór bez pozycji katalogowej w
    // migawce (`source_mode: 'EKSPERCKI_RECZNY'`), i którym `add_grid_source_sn`
    // już rozpoznaje ręczny ekwiwalent. Bez tego pola brama API (bez jawnej
    // deklaracji, katalog-first domyślne) odrzuca żądanie kodem 422.
    // Odbiór SN (`add_load_sn`) ma katalog OPCJONALNY i rozstrzyga pochodzenie wyłącznie
    // z obecności pozycji katalogu — deklaracji trybu nie czyta, więc jej nie wysyłamy.
    ...(data.manual_mode && poziom === 'nn' ? { source_mode: 'EKSPERCKI_RECZNY' } : {}),
    // Model ZIP jedzie w payloadzie TYLKO gdy różni się od stałej mocy. Odbiór
    // stałomocowy wysyła dokładnie ten payload co przed powstaniem sekcji, więc
    // istniejąca ścieżka pozostaje nietknięta (a operacja i tak przyjmuje oba
    // warianty jako równoważne).
    ...(czyZipDomyslny(data.zip) ? {} : { ...data.zip }),
  };
  if (poziom === 'sn') {
    if (kontekst.bus_ref?.trim()) payload.bus_ref = kontekst.bus_ref.trim();
    return payload;
  }
  if (kontekst.feeder_ref?.trim()) payload.feeder_ref = kontekst.feeder_ref.trim();
  if (kontekst.bus_nn_ref?.trim()) payload.bus_nn_ref = kontekst.bus_nn_ref.trim();
  return payload;
}

// ------------------------------------------------------------- Formatery

export function fmtA(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} A` : '—';
}

export function fmtKva(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} kVA` : '—';
}

export function fmtKw(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} kW` : '—';
}
