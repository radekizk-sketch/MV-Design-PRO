/**
 * K6 (Z-12) — KARTA TECHNICZNA obiektu w prawym inspektorze, per rodzaj elementu: stacja,
 * pole, aparat, łącznik, transformator, odcinek, źródło OZE, sieć zasilająca i szyna.
 *
 * Jedno źródło danych: rozstrzygnięcie obiektu z `daneElementuKanwy.ts` (rodzaj + ref) i rekordy
 * migawki ENM czytane tymi samymi lustrami reguł co rysunek i drzewo (`polaStacji`, `szynyStacji`,
 * `rodzajStacji`, `transformatoryStacji`, `stanAparatowPola`). Karta nie jest trzecią ścieżką
 * obok `InspectorEngineeringView` — tam sekcje stacji (dawna „Identyfikacja"/„Struktura" z samymi
 * licznikami) zostały skasowane, ich miejsce zajmuje ta karta.
 *
 * Zasady (wiążące):
 *  - wartość wyłącznie z modelu albo z pozycji katalogu przypisanej elementowi w modelu; brak
 *    danej = `null` (w UI „brak danych"), nigdy domysł ani wartość zastępcza;
 *  - przy danych tabliczki/znamionowych podane jest ŹRÓDŁO danej (`zrodloDanejPl`);
 *  - edycja tylko tam, gdzie istnieje operacja domenowa `update_element_parameters` z kluczem
 *    na liście dozwolonej backendu (`enm/domain_operations.py::update_element_parameters`,
 *    `_PARAMETRY_POLA_EDYTOWALNE`); reszta pól jest tylko do odczytu, bez atrapy;
 *  - zero fizyki: brak sum, porównań i przeliczeń wielkości — wyłącznie zapis polski wartości.
 *
 * Moduł jest CZYSTY (bez Reacta i DOM) — test parytetu karty z fikstura ENM przypina listę
 * pól wymaganych per rodzaj (`WYMAGANE_POLA_KARTY`).
 */
import type {
  Bay,
  BayPrimaryDevice,
  Branch,
  Bus,
  EnergyNetworkModel,
  Generator,
  Measurement,
  ProtectionAssignment,
  Source,
  Substation,
  Transformer,
} from '../../../types/enm';
import type { MVApparatusType } from '../../catalog/types';
import { wielkoscAparatuSnDotyczy } from '../../catalog/pradZwarciowyKatalogu';
import {
  nazwaStacjiJakWDrzewie,
  publicTechnicalLabel,
  segmentPublicIdentity,
  stationPublicIdentity,
} from '../../shared/publicTechnicalLabels';
import { pola, polaNnStacji, polaSnStacji, stacjaPola, zaciskPola } from '../../shared/polaStacji';
import { podpisStacjiPl, rodzajStacji, TYPY_STACJI_BEZ_RODZAJU } from '../../shared/rodzajStacji';
import { szynyStacji } from '../../shared/szynyStacji';
import {
  refyTransformatorowBlokowych,
  selectStationDistributionTransformers,
  stationRefOfTransformer,
  transformatorBlokowyDer,
} from '../../shared/transformatoryStacji';
import { formatGeneratorTypeLabelPl } from '../../shared/generatorTypeLabels';
import { wPasmieNn } from '../../../ui2/model/pasmaNapieciowe';
import { regulacjaLabel, type TrybRegulacji } from '../../../ui2/kreatory/zrodlo-oze/zrodloOzeModel';
import { FIELD_SOURCE_LABEL_PL, fieldRoleLabelPl } from '../v2/station-rozdzielnia/contract';
import { stanLacznikaPolaZModelu, stanLacznikaToruZModelu } from '../v2/model/stanAparatowPola';
import type { DaneElementuKanwy } from './daneElementuKanwy';
import { etykietaZeSlownika } from '../../../ui2/wyniki/wzorzec/slownikWyliczen';

// ---------------------------------------------------------------------------
// Kontrakt karty
// ---------------------------------------------------------------------------

export const BRAK_DANYCH_PL = 'brak danych';

export type RodzajKarty =
  | 'stacja'
  | 'pole'
  | 'aparat'
  | 'lacznik'
  | 'transformator'
  | 'odcinek'
  | 'zrodlo'
  | 'siec_zasilajaca'
  | 'szyna';

export const RODZAJE_KARTY: readonly RodzajKarty[] = [
  'stacja',
  'pole',
  'aparat',
  'lacznik',
  'transformator',
  'odcinek',
  'zrodlo',
  'siec_zasilajaca',
  'szyna',
];

/** Zmiana wartości wyłącznie operacją domenową `update_element_parameters` (kreator edycji
 *  parametrów z polem wskazanym — `field`/`value` kontekstu kreatora). */
export interface EdycjaWiersza {
  readonly elementRef: string;
  readonly parametr: string;
  readonly wartosc: string;
}

export interface WierszKarty {
  readonly klucz: string;
  readonly etykieta: string;
  /** `null` = brak danej w modelu (UI: „brak danych"). */
  readonly wartosc: string | null;
  /** Lista pozycji (odpływy, odbiory…) — pusta lista to FAKT „brak w modelu", nie brak danych. */
  readonly lista?: readonly string[];
  /** Źródło danej, gdy różni się od źródła sekcji (np. nadpisanie projektanta). */
  readonly zrodloPl?: string | null;
  readonly edycja?: EdycjaWiersza;
}

export interface KolumnaTabeli {
  readonly klucz: string;
  readonly etykieta: string;
}

export interface WierszTabeli {
  readonly klucz: string;
  readonly komorki: Readonly<Record<string, string | null>>;
}

export interface TabelaKarty {
  readonly klucz: string;
  readonly podpis: string;
  readonly kolumny: readonly KolumnaTabeli[];
  readonly wiersze: readonly WierszTabeli[];
  readonly pustaPl: string;
  readonly zrodloPl?: string | null;
}

export interface SekcjaKarty {
  readonly id: string;
  readonly tytul: string;
  readonly wiersze: readonly WierszKarty[];
  readonly tabele?: readonly TabelaKarty[];
  /** Źródło danych całej sekcji (dane tabliczki/znamionowe). */
  readonly zrodloPl?: string | null;
  /** Sekcja bez obiektu (np. stacja bez transformatora) — jawny opis zamiast wierszy. */
  readonly pustaPl?: string;
}

export interface KartaTechniczna {
  readonly rodzaj: RodzajKarty;
  /** Rodzaj w nagłówku — dla stacji ta sama reguła co drzewo projektu (`podpisStacjiPl`). */
  readonly rodzajPl: string;
  readonly nazwa: string;
  readonly elementRef: string;
  readonly sekcje: readonly SekcjaKarty[];
}

/** Pozycje katalogów potrzebne karcie (nazwa typu, zdolność wyłączalna aparatu). Brak katalogu
 *  (błąd pobrania) = puste mapy — karta pokazuje wtedy dane z modelu i „brak danych". */
export interface KatalogiKarty {
  readonly aparatySn: ReadonlyMap<string, MVApparatusType>;
  readonly transformatory: ReadonlyMap<string, { readonly name: string }>;
}

export const KATALOGI_PUSTE: KatalogiKarty = { aparatySn: new Map(), transformatory: new Map() };

/**
 * Pola WYMAGANE karty per rodzaj (klucze wierszy i tabel). Przypięte testem parytetu
 * (`__tests__/kartaTechnicznaElementu.parytet.test.ts`): z fikstury pełnej każde pole ma wartość,
 * z fikstury bez danych każde pole JEST na karcie i pokazuje „brak danych".
 */
export const WYMAGANE_POLA_KARTY: Readonly<Record<RodzajKarty, readonly string[]>> = {
  stacja: [
    'oznaczenie',
    'nazwa',
    'rodzaj',
    'podstawa_rodzaju',
    'wykonanie',
    'sekcje_sn',
    'tabela:pola_sn',
    'tr_typ',
    'tr_sn',
    'tr_napiecia',
    'tr_uk',
    'tr_pk',
    'tr_p0',
    'tr_i0',
    'tr_grupa',
    'tr_zaczepy',
    'nn_sekcje',
    'nn_odplywy',
    'nn_odbiory',
    'nn_zrodla',
    'tabela:przylaczenia',
  ],
  pole: [
    'nazwa',
    'numer',
    'rola',
    'stacja',
    'szyna',
    'tabela:aparaty',
    'zabezpieczenie',
    'funkcje_zabezpieczen',
    'przekladniki',
    'przylaczenie',
  ],
  aparat: ['nazwa', 'rodzaj', 'pole', 'stacja', 'typ', 'ur', 'ir', 'ik_wyl', 'stan'],
  lacznik: ['nazwa', 'rodzaj', 'polaczenie', 'stan', 'typ', 'ur', 'ir', 'ik_wyl'],
  transformator: [
    'nazwa',
    'rola',
    'stacja',
    'tr_typ',
    'tr_sn',
    'tr_napiecia',
    'tr_uk',
    'tr_pk',
    'tr_p0',
    'tr_i0',
    'tr_grupa',
    'tr_zaczepy',
    'tr_uklad_nn',
  ],
  odcinek: ['nazwa', 'rodzaj', 'od', 'do', 'stan', 'typ', 'dlugosc', 'przekroj', 'material', 'izolacja', 'i_dop', 'r1', 'x1'],
  zrodlo: [
    'nazwa',
    'rodzaj',
    'stacja',
    'moc',
    'jednostki',
    'typ',
    'tryb_regulacji',
    'modul_ncrfg',
    'wariant',
    'szyna_przylaczenia',
    'pole_zrodlowe',
    'tr_blokowy',
    'kabel_sn',
  ],
  siec_zasilajaca: ['nazwa', 'stacja', 'szyna', 'typ', 'sk_max', 'ik_max', 'rx_max', 'sk_min', 'ik_min', 'rx_min'],
  szyna: ['nazwa', 'napiecie', 'stacja', 'pola', 'galezie'],
};

// ---------------------------------------------------------------------------
// Zapis polski wartości (bez przeliczeń)
// ---------------------------------------------------------------------------

function liczba(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function napis(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rekord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function zapisLiczby(value: unknown, jednostka: string, cyfry = 3): string | null {
  const v = liczba(value);
  if (v === null) return null;
  const tekst = v.toLocaleString('pl-PL', { maximumFractionDigits: cyfry }).replace(/\u00a0/g, ' ');
  return jednostka ? `${tekst} ${jednostka}` : tekst;
}

function wiersz(
  klucz: string,
  etykieta: string,
  wartosc: string | null,
  dodatki: Partial<Pick<WierszKarty, 'zrodloPl' | 'edycja' | 'lista'>> = {},
): WierszKarty {
  return { klucz, etykieta, wartosc, ...dodatki };
}

function lista(klucz: string, etykieta: string, pozycje: readonly string[]): WierszKarty {
  return { klucz, etykieta, wartosc: pozycje.length === 0 ? 'brak w modelu' : String(pozycje.length), lista: pozycje };
}

function edycja(elementRef: string, parametr: string, wartosc: unknown): EdycjaWiersza {
  return {
    elementRef,
    parametr,
    wartosc: typeof wartosc === 'number' ? String(wartosc) : typeof wartosc === 'string' ? wartosc : '',
  };
}

const POLOZENIE_PL: Readonly<Record<'closed' | 'open' | 'unknown', string>> = {
  closed: 'zamknięty',
  open: 'otwarty',
  unknown: 'nieustalony (model niejednoznaczny)',
};

const WYKONANIE_STACJI_PL: Readonly<Record<string, string>> = {
  wnetrzowa: 'wnętrzowa',
  kontenerowa: 'kontenerowa',
  slupowa: 'słupowa',
  prefabrykowana: 'prefabrykowana',
  inna: 'inna',
};

const RODZAJ_GALEZI_PL: Readonly<Record<Branch['type'], string>> = {
  line_overhead: 'Linia napowietrzna',
  cable: 'Kabel',
  switch: 'Łącznik',
  breaker: 'Wyłącznik',
  bus_coupler: 'Sprzęgło szyn',
  disconnector: 'Odłącznik',
  fuse: 'Bezpiecznik',
};

const RODZAJ_URZADZENIA_PL: Readonly<Record<BayPrimaryDevice['kind'], string>> = {
  CB: 'Wyłącznik',
  LOAD_SWITCH: 'Rozłącznik',
  DS: 'Odłącznik',
  ES: 'Uziemnik',
  CT: 'Przekładnik prądowy',
  VT: 'Przekładnik napięciowy',
  CABLE_HEAD: 'Głowica kablowa',
  TRANSFORMER_DEVICE: 'Transformator',
  FUSE: 'Bezpiecznik',
  GENERATOR_PV: 'Falownik PV',
  GENERATOR_BESS: 'Przekształtnik BESS',
  GENERATOR_FW: 'Przekształtnik FW',
  PCS: 'Układ przekształtnikowy PCS',
  BATTERY: 'Bateria',
  SURGE_ARRESTER: 'Ogranicznik przepięć',
  UNBALANCE_CT: 'Przekładnik niezrównoważenia baterii',
  PHASE_TO_PHASE_VT: 'Przekładnik napięciowy międzyfazowy',
};

const RODZAJ_ZABEZPIECZENIA_PL: Readonly<Record<ProtectionAssignment['device_type'], string>> = {
  overcurrent: 'nadprądowe',
  earth_fault: 'ziemnozwarciowe',
  directional_overcurrent: 'nadprądowe kierunkowe',
  distance: 'odległościowe',
  differential: 'różnicowe',
  custom: 'inne (definicja użytkownika)',
};

/** Tryb regulacji z karty katalogowej przekształtnika (`ConverterType.control_mode`) — słownik
 *  katalogu różni się od nastawy modelu (`meta.control_mode`, `REGULACJA_OPCJE`). */
const TRYB_REGULACJI_KATALOGU_PL: Readonly<Record<string, string>> = {
  STALY_COS_PHI: 'Stały współczynnik mocy cosφ',
  Q_U_DROOP: 'Regulacja Q(U) — charakterystyka opadająca',
  Q_OF_U: 'Regulacja Q(U)',
  GRID_FORMING: 'Praca formująca sieć (grid forming)',
};

const WARIANT_PRZYLACZENIA_PL: Readonly<Record<string, string>> = {
  nn_side: 'po stronie nN stacji',
  LV_BEHIND_STATION_TRANSFORMER: 'po stronie nN stacji',
  block_transformer: 'po stronie SN przez transformator blokowy',
  DEDICATED_MV_CONNECTION: 'po stronie SN przez transformator blokowy',
  SOURCE_CONNECTION_STATION: 'stacja przyłączeniowa źródła',
};

/** Etykieta trybu regulacji — słownik nastawy modelu, potem słownik karty katalogowej. */
export function trybRegulacjiPl(kod: string): string {
  return regulacjaLabel(kod as TrybRegulacji) || TRYB_REGULACJI_KATALOGU_PL[kod] || `tryb ${kod}`;
}

// ---------------------------------------------------------------------------
// Źródło danej (katalog / nadpisanie / dane ręczne)
// ---------------------------------------------------------------------------

interface ElementZeZrodlem {
  readonly catalog_ref?: string | null;
  readonly source_mode?: string | null;
  readonly parameter_source?: string | null;
  readonly overrides?: readonly { readonly key: string }[] | null;
  readonly materialized_params?: Record<string, unknown> | null;
}

function wersjaKatalogu(element: ElementZeZrodlem): string | null {
  return napis(element.materialized_params?.catalog_item_version);
}

/** Źródło danych elementu: pozycja katalogu (nazwa i wersja), dane ręczne albo migracja. */
export function zrodloDanychElementuPl(element: ElementZeZrodlem, nazwaKatalogu: string | null): string {
  const tryb = napis(element.source_mode);
  const ref = napis(element.catalog_ref);
  if ((tryb === 'KATALOG' || (!tryb && element.parameter_source === 'CATALOG')) && ref) {
    const wersja = wersjaKatalogu(element);
    return `katalog: ${nazwaKatalogu ?? ref}${wersja && wersja !== 'legacy' ? ` (wersja ${wersja})` : ''}`;
  }
  if (tryb === 'MIGRACJA') return 'dane przeniesione z poprzedniego modelu (bez pozycji katalogu)';
  if (tryb === 'EKSPERCKI_RECZNY' || element.parameter_source === 'OVERRIDE') return 'dane wpisane ręcznie przez projektanta';
  return 'źródło danej nieokreślone w modelu';
}

function nadpisanie(element: ElementZeZrodlem, klucz: string): string | undefined {
  return (element.overrides ?? []).some((o) => o.key === klucz) ? 'nadpisanie projektanta' : undefined;
}

// ---------------------------------------------------------------------------
// Indeks migawki (jedno przejście; migawki są niemutowalne)
// ---------------------------------------------------------------------------

interface IndeksModelu {
  readonly model: EnergyNetworkModel;
  readonly szyny: ReadonlyMap<string, Bus>;
  readonly galezie: ReadonlyMap<string, Branch>;
  readonly transformatory: ReadonlyMap<string, Transformer>;
  readonly stacje: ReadonlyMap<string, Substation>;
  readonly polaWgRef: ReadonlyMap<string, Bay>;
}

const PAMIEC_INDEKSU = new WeakMap<EnergyNetworkModel, IndeksModelu>();

function indeks(model: EnergyNetworkModel): IndeksModelu {
  const z = PAMIEC_INDEKSU.get(model);
  if (z) return z;
  const wgRef = <T extends { ref_id: string; id: string }>(lista: readonly T[] | undefined): Map<string, T> => {
    const mapa = new Map<string, T>();
    for (const el of lista ?? []) {
      mapa.set(el.ref_id, el);
      if (el.id && !mapa.has(el.id)) mapa.set(el.id, el);
    }
    return mapa;
  };
  const wynik: IndeksModelu = {
    model,
    szyny: wgRef(model.buses),
    galezie: wgRef(model.branches),
    transformatory: wgRef(model.transformers),
    stacje: wgRef(model.substations),
    polaWgRef: new Map(pola(model).map((b) => [b.ref_id, b])),
  };
  PAMIEC_INDEKSU.set(model, wynik);
  return wynik;
}

function opisSzyny(ix: IndeksModelu, ref: string | null | undefined): string | null {
  if (!ref) return null;
  const szyna = ix.szyny.get(ref);
  if (!szyna) return null;
  const napiecie = zapisLiczby(szyna.voltage_kv, 'kV');
  const nazwa = publicTechnicalLabel(szyna.name, 'Szyna');
  return napiecie ? `${nazwa} · ${napiecie}` : nazwa;
}

function nazwaStacji(ix: IndeksModelu, ref: string | null | undefined): string | null {
  const stacja = ref ? ix.stacje.get(ref) : undefined;
  return stacja ? nazwaStacjiJakWDrzewie(ix.model, stacja) : null;
}

function nazwaPola(bay: Bay | null | undefined): string | null {
  return bay ? publicTechnicalLabel(bay.name, fieldRoleLabelPl(bay.field_role || bay.bay_role)) : null;
}

function nazwaGalezi(ix: IndeksModelu, galaz: Branch): string {
  if (galaz.type === 'cable' || galaz.type === 'line_overhead') {
    return segmentPublicIdentity(ix.model, galaz).displayName;
  }
  return publicTechnicalLabel(galaz.name, RODZAJ_GALEZI_PL[galaz.type]);
}

// ---------------------------------------------------------------------------
// Aparatura pola
// ---------------------------------------------------------------------------

const TYPY_LACZNIKOW: ReadonlySet<Branch['type']> = new Set(['breaker', 'switch', 'disconnector', 'fuse', 'bus_coupler']);
const PRIORYTET_GALEZI: readonly Branch['type'][] = ['breaker', 'bus_coupler', 'switch', 'fuse', 'disconnector'];
const PRIORYTET_URZADZENIA: readonly BayPrimaryDevice['kind'][] = ['CB', 'LOAD_SWITCH', 'FUSE', 'DS'];

/** Rodzaj aparatu SN (`device_kind` projekcji APARAT_SN) z rodzaju urządzenia pola modelu. */
const RODZAJ_APARATU_SN_Z_URZADZENIA: Readonly<Partial<Record<BayPrimaryDevice['kind'], string>>> = {
  CB: 'WYLACZNIK',
  LOAD_SWITCH: 'ROZLACZNIK',
  DS: 'ODLACZNIK',
  ES: 'UZIEMNIK',
  FUSE: 'ROZLACZNIK_BEZPIECZNIKOWY',
};
/** Rodzaj aparatu SN z typu gałęzi modelu (łącznik ogólny i sprzęgło — bez rozstrzygnięcia). */
const RODZAJ_APARATU_SN_Z_GALEZI: Readonly<Partial<Record<Branch['type'], string>>> = {
  breaker: 'WYLACZNIK',
  disconnector: 'ODLACZNIK',
  fuse: 'ROZLACZNIK_BEZPIECZNIKOWY',
};
/** Nazwa rodzaju aparatu SN w dopisku „nie dotyczy (…)”. */
const NAZWA_RODZAJU_APARATU_SN_PL: Readonly<Record<string, string>> = {
  WYLACZNIK: 'wyłącznik',
  ROZLACZNIK: 'rozłącznik',
  ODLACZNIK: 'odłącznik',
  UZIEMNIK: 'uziemnik',
  ROZLACZNIK_BEZPIECZNIKOWY: 'bezpiecznik',
  REKLOZER: 'reklozer',
};

/**
 * Wielkość zwarciowa aparatu: liczba z jednostką; bez liczby — „nie dotyczy (rodzaj)”, gdy
 * rodzaj aparatu tej wielkości z definicji normy nie ma (jedno źródło:
 * `wielkoscAparatuSnDotyczy`, odbicie predykatów bramki KAT-T-050), albo `null` = „brak
 * danych”, gdy wielkość jest właściwa rodzajowi, a karta/model jej nie podaje.
 */
function wielkoscZwarciowaAparatu(
  wartosc: number | null,
  rodzaj: string | null,
  pole: 'breaking_capacity_ka' | 'i_th_ka',
): string | null {
  if (wartosc !== null) return zapisLiczby(wartosc, 'kA');
  if (rodzaj !== null && !wielkoscAparatuSnDotyczy(rodzaj, pole)) {
    return `nie dotyczy (${etykietaZeSlownika(NAZWA_RODZAJU_APARATU_SN_PL, rodzaj)})`;
  }
  return null;
}

interface AparatPola {
  readonly ref: string;
  readonly rodzajPl: string;
  readonly galaz: Branch | null;
  readonly urzadzenie: BayPrimaryDevice | null;
  /** Rodzaj aparatu SN z modelu (`device_kind` projekcji APARAT_SN) — `null`, gdy model
   *  rodzaju nie rozstrzyga (łącznik ogólny, sprzęgło). */
  readonly rodzajSnModelu: string | null;
  readonly lacznik: boolean;
  readonly priorytet: number;
}

function aparatZGalezi(galaz: Branch): AparatPola {
  const p = PRIORYTET_GALEZI.indexOf(galaz.type);
  return {
    ref: galaz.ref_id,
    rodzajPl: RODZAJ_GALEZI_PL[galaz.type],
    galaz,
    urzadzenie: null,
    rodzajSnModelu: RODZAJ_APARATU_SN_Z_GALEZI[galaz.type] ?? null,
    lacznik: TYPY_LACZNIKOW.has(galaz.type),
    priorytet: p >= 0 ? p : 99,
  };
}

/** Aparaty pola z modelu: aparaty pierwotne (`primary_devices`) i gałęzie z `equipment_refs`
 *  (bez transformatora — ma własną sekcję). Kolejność zapisu modelu. */
function aparatyPola(ix: IndeksModelu, bay: Bay): AparatPola[] {
  const wynik: AparatPola[] = [];
  const pokryte = new Set<string>();
  for (const u of bay.primary_devices ?? []) {
    const galaz = ix.galezie.get(u.device_ref) ?? (u.linked_ref ? ix.galezie.get(u.linked_ref) : undefined) ?? null;
    const p = PRIORYTET_URZADZENIA.indexOf(u.kind);
    wynik.push({
      ref: u.device_ref,
      rodzajPl: RODZAJ_URZADZENIA_PL[u.kind] ?? 'Aparat',
      galaz,
      urzadzenie: u,
      rodzajSnModelu: RODZAJ_APARATU_SN_Z_URZADZENIA[u.kind] ?? null,
      lacznik: p >= 0 || u.kind === 'ES',
      priorytet: p >= 0 ? p : 99,
    });
    pokryte.add(u.device_ref);
    if (galaz) pokryte.add(galaz.ref_id);
  }
  for (const ref of bay.equipment_refs ?? []) {
    if (pokryte.has(ref)) continue;
    const galaz = ix.galezie.get(ref);
    if (!galaz || !TYPY_LACZNIKOW.has(galaz.type)) continue;
    wynik.push(aparatZGalezi(galaz));
    pokryte.add(ref);
  }
  return wynik;
}

function aparatGlowny(aparaty: readonly AparatPola[]): AparatPola | null {
  let najlepszy: AparatPola | null = null;
  for (const a of aparaty) {
    if (a.priorytet === 99) continue;
    if (!najlepszy || a.priorytet < najlepszy.priorytet) najlepszy = a;
  }
  return najlepszy;
}

interface ZnamionaAparatu {
  readonly typ: string | null;
  readonly ur: string | null;
  readonly ir: string | null;
  readonly ik: string | null;
  readonly ith: string | null;
  readonly idyn: string | null;
  readonly zrodloPl: string | null;
}

function znamionaAparatu(aparat: AparatPola, katalogi: KatalogiKarty): ZnamionaAparatu {
  const galaz = aparat.galaz;
  const catalogRef = napis(galaz?.catalog_ref) ?? napis(aparat.urzadzenie?.catalog_ref);
  const kat = catalogRef ? katalogi.aparatySn.get(catalogRef) : undefined;
  const mp = galaz?.materialized_params ?? null;
  const bezpiecznik = galaz?.type === 'fuse' ? galaz : null;
  const ur = liczba(mp?.u_n_kv) ?? liczba(bezpiecznik?.rated_voltage_kv) ?? liczba(kat?.u_n_kv);
  const ir = liczba(mp?.i_n_a) ?? liczba(bezpiecznik?.rated_current_a) ?? liczba(kat?.i_n_a);
  // Rodzaj rozstrzygający „nie dotyczy”: pozycja katalogu (z niej pochodzą znamiona), a bez
  // niej — rodzaj aparatu w modelu.
  const rodzaj = napis(kat?.device_kind) ?? aparat.rodzajSnModelu;
  const ik = wielkoscZwarciowaAparatu(
    liczba(mp?.breaking_capacity_ka) ?? liczba(kat?.breaking_capacity_ka),
    rodzaj,
    'breaking_capacity_ka',
  );
  const ithLiczba = liczba(kat?.i_th_ka);
  const czasIth = liczba(kat?.i_th_duration_s);
  const ith =
    ithLiczba !== null
      ? `${zapisLiczby(ithLiczba, 'kA')}${czasIth !== null ? ` / ${zapisLiczby(czasIth, 's')}` : ''}`
      : wielkoscZwarciowaAparatu(null, rodzaj, 'i_th_ka');
  const typ = kat?.name ?? (catalogRef ? `pozycja katalogu ${catalogRef}` : null);
  const zrodloPl = galaz
    ? zrodloDanychElementuPl(galaz, kat?.name ?? null)
    : catalogRef
      ? `katalog: ${kat?.name ?? catalogRef}`
      : null;
  return {
    typ,
    ur: zapisLiczby(ur, 'kV'),
    ir: zapisLiczby(ir, 'A', 0),
    ik,
    ith,
    idyn: zapisLiczby(kat?.i_dyn_ka, 'kA'),
    zrodloPl,
  };
}

function stanAparatu(ix: IndeksModelu, aparat: AparatPola, bay: Bay | null): string | null {
  const stan = bay
    ? stanLacznikaPolaZModelu(aparat.ref, bay, ix.galezie)
    : stanLacznikaToruZModelu(aparat.ref, ix.galezie);
  return stan ? POLOZENIE_PL[stan] : null;
}

function zabezpieczeniaPola(ix: IndeksModelu, bay: Bay, aparaty: readonly AparatPola[]): string | null {
  const refy = new Set(aparaty.map((a) => a.ref));
  for (const a of aparaty) if (a.galaz) refy.add(a.galaz.ref_id);
  const przypisane = (ix.model.protection_assignments ?? []).filter(
    (pa) => refy.has(pa.breaker_ref) || (bay.protection_ref && pa.ref_id === bay.protection_ref),
  );
  if (przypisane.length > 0) {
    return przypisane
      .map((pa) => `${publicTechnicalLabel(pa.name, 'Zabezpieczenie')} (${RODZAJ_ZABEZPIECZENIA_PL[pa.device_type] ?? pa.device_type})`)
      .join(', ');
  }
  return null;
}

/** Polska nazwa rodzaju przekładnika (słownik ENM `measurement_type`) — bez kodu CT/VT w UI. */
const RODZAJ_PRZEKLADNIKA_PL: Readonly<Record<Measurement['measurement_type'], string>> = {
  CT: 'przekładnik prądowy',
  VT: 'przekładnik napięciowy',
};

function opisPrzekladnika(m: Measurement): string {
  const przekladnia = `${zapisLiczby(m.rating?.ratio_primary, '') ?? '?'}/${zapisLiczby(m.rating?.ratio_secondary, '') ?? '?'} ${m.measurement_type === 'CT' ? 'A' : 'V'}`;
  const klasa = napis(m.rating?.accuracy_class);
  return `${RODZAJ_PRZEKLADNIKA_PL[m.measurement_type]} ${przekladnia}${klasa ? ` · kl. ${klasa}` : ''}`;
}

function pomiaryPola(ix: IndeksModelu, bay: Bay): Measurement[] {
  return (ix.model.measurements ?? []).filter((m: Measurement) => m.bay_ref === bay.ref_id);
}

function przekladnikiPola(ix: IndeksModelu, bay: Bay): string[] {
  return pomiaryPola(ix, bay).map(opisPrzekladnika);
}

function komorkaZabezpieczeniaCt(ix: IndeksModelu, bay: Bay, aparaty: readonly AparatPola[]): string | null {
  const czesci: string[] = [];
  const zab = zabezpieczeniaPola(ix, bay, aparaty);
  if (zab) czesci.push(zab);
  const funkcje = (bay.protection_codes ?? []).filter((k) => napis(k));
  if (funkcje.length > 0) czesci.push(`funkcje ${funkcje.join(', ')}`);
  // Rodzaj z pola modelu (`measurement_type`), nie z napisu opisu — jedno źródło predykatu.
  const ct = pomiaryPola(ix, bay).filter((m) => m.measurement_type === 'CT').map(opisPrzekladnika);
  if (ct.length > 0) czesci.push(ct.join(', '));
  return czesci.length > 0 ? czesci.join(' · ') : null;
}

// ---------------------------------------------------------------------------
// Odcinki przyłączone do zbioru szyn (jeden krok sąsiedztwa rekordu — bez przeszukiwania grafu)
// ---------------------------------------------------------------------------

function odcinkiPrzySzynach(ix: IndeksModelu, szyny: ReadonlySet<string>): { galaz: Branch; szynaWlasna: string }[] {
  const wynik: { galaz: Branch; szynaWlasna: string }[] = [];
  for (const galaz of ix.model.branches ?? []) {
    if (galaz.type !== 'cable' && galaz.type !== 'line_overhead') continue;
    const a = szyny.has(galaz.from_bus_ref);
    const b = szyny.has(galaz.to_bus_ref);
    if (a === b) continue;
    wynik.push({ galaz, szynaWlasna: a ? galaz.from_bus_ref : galaz.to_bus_ref });
  }
  return wynik;
}

function typOdcinka(galaz: Branch): string | null {
  const mp = galaz.materialized_params ?? null;
  return napis(mp?.trade_name) ?? napis(mp?.name) ?? (napis(galaz.catalog_ref) ? `pozycja katalogu ${galaz.catalog_ref}` : null);
}

function dlugoscOdcinka(galaz: Branch): string | null {
  return galaz.type === 'cable' || galaz.type === 'line_overhead' ? zapisLiczby(galaz.length_km, 'km') : null;
}

// ---------------------------------------------------------------------------
// Transformator — dane tabliczki (wspólne dla karty stacji i karty transformatora)
// ---------------------------------------------------------------------------

function zaczepyPl(tr: Transformer): string | null {
  const tc = tr.tap_changer;
  if (tc) {
    const rodzaj = tc.regulation_type === 'OLTC' ? 'podobciążeniowy (OLTC)' : tc.regulation_type === 'DETC' ? 'beznapięciowy' : 'bez regulacji';
    return `${rodzaj}, pozycja ${tc.current_position} (${tc.min_position}…${tc.max_position}), krok ${zapisLiczby(tc.step_percent, '%')}`;
  }
  const pozycja = liczba(tr.tap_position);
  const min = liczba(tr.tap_min);
  const max = liczba(tr.tap_max);
  const krok = zapisLiczby(tr.tap_step_percent, '%');
  if (pozycja === null && min === null && max === null && krok === null) return null;
  const czesci: string[] = [];
  if (pozycja !== null) czesci.push(`pozycja ${pozycja}`);
  if (min !== null || max !== null) czesci.push(`zakres ${min ?? '?'}…${max ?? '?'}`);
  if (krok) czesci.push(`krok ${krok}`);
  return czesci.join(', ');
}

function wierszeTabliczki(tr: Transformer, katalogi: KatalogiKarty, edytowalne: boolean): WierszKarty[] {
  const nazwaKat = tr.catalog_ref ? katalogi.transformatory.get(tr.catalog_ref)?.name ?? null : null;
  const z = (klucz: string) => nadpisanie(tr, klucz);
  const napiecia = liczba(tr.uhv_kv) !== null || liczba(tr.ulv_kv) !== null
    ? `${zapisLiczby(tr.uhv_kv, 'kV') ?? BRAK_DANYCH_PL} / ${zapisLiczby(tr.ulv_kv, 'kV') ?? BRAK_DANYCH_PL}`
    : null;
  return [
    wiersz('tr_typ', 'Typ katalogowy', nazwaKat ?? (napis(tr.catalog_ref) ? `pozycja katalogu ${tr.catalog_ref}` : null)),
    wiersz('tr_sn', 'Moc znamionowa Sₙ', zapisLiczby(tr.sn_mva, 'MVA'), { zrodloPl: z('sn_mva') }),
    wiersz('tr_napiecia', 'Napięcia Uₙ GN / DN', napiecia, { zrodloPl: z('uhv_kv') ?? z('ulv_kv') }),
    wiersz('tr_uk', 'Napięcie zwarcia uₖ', zapisLiczby(tr.uk_percent, '%'), { zrodloPl: z('uk_percent') }),
    wiersz('tr_pk', 'Straty obciążeniowe Pₖ', zapisLiczby(tr.pk_kw, 'kW'), { zrodloPl: z('pk_kw') }),
    wiersz('tr_p0', 'Straty jałowe P₀', zapisLiczby(tr.p0_kw, 'kW'), { zrodloPl: z('p0_kw') }),
    wiersz('tr_i0', 'Prąd jałowy i₀', zapisLiczby(tr.i0_percent, '%'), { zrodloPl: z('i0_percent') }),
    wiersz('tr_grupa', 'Grupa połączeń', napis(tr.vector_group), { zrodloPl: z('vector_group') }),
    wiersz(
      'tr_zaczepy',
      'Przełącznik zaczepów',
      zaczepyPl(tr),
      edytowalne && !tr.tap_changer ? { edycja: edycja(tr.ref_id, 'tap_position', tr.tap_position) } : {},
    ),
  ];
}

// ---------------------------------------------------------------------------
// Karty per rodzaj
// ---------------------------------------------------------------------------

function kartaStacji(ix: IndeksModelu, stacja: Substation, katalogi: KatalogiKarty): KartaTechniczna {
  const model = ix.model;
  const tozsamosc = stationPublicIdentity(model, stacja);
  const rodzajPl = podpisStacjiPl(model, stacja);
  const bezRodzaju = TYPY_STACJI_BEZ_RODZAJU.has(stacja.station_type);
  const rodzaj = bezRodzaju ? null : rodzajStacji(model, stacja.ref_id);
  const podstawa = bezRodzaju
    ? 'nie dotyczy — rodzaj topologiczny określa się dla stacji SN/nN'
    : rodzaj
      ? `${rodzaj.przyczynaPl}${rodzaj.zgodnyZDeklaracja ? '' : ' — deklaracja w modelu jest inna (walidator W043)'}`
      : null;

  const identyfikacja: SekcjaKarty = {
    id: 'identyfikacja',
    tytul: 'Identyfikacja',
    wiersze: [
      wiersz('oznaczenie', 'Oznaczenie', napis(stacja.designation)),
      wiersz('nazwa', 'Nazwa', napis(stacja.name), { edycja: edycja(stacja.ref_id, 'name', stacja.name) }),
      wiersz('rodzaj', 'Rodzaj', rodzajPl),
      wiersz('podstawa_rodzaju', 'Podstawa rodzaju', podstawa),
      wiersz('wykonanie', 'Wykonanie', stacja.construction_type ? WYKONANIE_STACJI_PL[stacja.construction_type] ?? null : null),
      wiersz('kod', 'Kod na schemacie', tozsamosc.code),
    ],
  };

  // Rozdzielnica SN: sekcje (GPZ — sekcje rozdzielni; stacja — szyny pól SN), tabela pól.
  const polaSn = polaSnStacji(model, stacja.ref_id);
  const szynySn = stacja.station_type === 'gpz' && (stacja.gpz_sections ?? []).length > 0
    ? (stacja.gpz_sections ?? []).map((s) => s.bus_ref)
    : [...new Set(polaSn.map((b) => b.bus_ref))];
  const sekcje = szynySn.map((ref) => opisSzyny(ix, ref)).filter((s): s is string => s !== null);
  const wierszePol: WierszTabeli[] = polaSn.map((bay) => {
    const aparaty = aparatyPola(ix, bay);
    const glowny = aparatGlowny(aparaty);
    const znamiona = glowny ? znamionaAparatu(glowny, katalogi) : null;
    return {
      klucz: bay.ref_id,
      komorki: {
        nr: napis(bay.bay_number),
        pole: nazwaPola(bay),
        rola: fieldRoleLabelPl(bay.field_role || bay.bay_role),
        aparat: glowny ? `${glowny.rodzajPl}${znamiona?.typ ? ` · ${znamiona.typ}` : ''}` : null,
        ur: znamiona?.ur ?? null,
        ir: znamiona?.ir ?? null,
        ik: znamiona?.ik ?? null,
        stan: glowny ? stanAparatu(ix, glowny, bay) : null,
        zabezpieczenie: komorkaZabezpieczeniaCt(ix, bay, aparaty),
      },
    };
  });
  const rodziny = [...new Set(polaSn.map((b) => napis(b.switchgear_family_ref)).filter((r): r is string => r !== null))];
  const generatorySn = (model.generators ?? []).filter(
    (g) => g.station_ref === stacja.ref_id && g.connection_variant === 'block_transformer',
  );
  const rozdzielnica: SekcjaKarty = {
    id: 'rozdzielnica_sn',
    tytul: stacja.station_type === 'gpz' ? 'Rozdzielnia SN' : 'Rozdzielnica SN',
    wiersze: [
      lista('sekcje_sn', 'Sekcje szyn SN', sekcje),
      ...(rodziny.length > 0 ? [wiersz('rodzina', 'Rodzina rozdzielnicy', rodziny.join(', '))] : []),
      ...(generatorySn.length > 0
        ? [lista('zrodla_sn', 'Źródła przyłączone po stronie SN', generatorySn.map((g) => opisGeneratora(g)))]
        : []),
    ],
    tabele: [
      {
        klucz: 'pola_sn',
        podpis: 'Pola rozdzielnicy SN',
        kolumny: [
          // Nazwa pola jako pierwsza kolumna: zostaje przy krawędzi przy przewijaniu tabeli.
          { klucz: 'pole', etykieta: 'Pole' },
          { klucz: 'nr', etykieta: 'Nr' },
          { klucz: 'rola', etykieta: 'Rola' },
          { klucz: 'aparat', etykieta: 'Aparat główny' },
          { klucz: 'ur', etykieta: 'Uᵣ' },
          { klucz: 'ir', etykieta: 'Iᵣ' },
          { klucz: 'ik', etykieta: 'Zdolność wyłączalna' },
          { klucz: 'stan', etykieta: 'Stan' },
          { klucz: 'zabezpieczenie', etykieta: 'Zabezpieczenie / przekładniki' },
        ],
        wiersze: wierszePol,
        pustaPl: 'Rozdzielnica SN nie ma pól w modelu.',
        zrodloPl: 'Dane znamionowe aparatów: pozycja katalogu aparatu przypisana w modelu.',
      },
    ],
  };

  // Transformator(y) rozdzielczy stacji.
  const transformatory = selectStationDistributionTransformers(model, stacja);
  const sekcjeTr: SekcjaKarty[] = transformatory.length === 0
    ? [{ id: 'transformator', tytul: 'Transformator', wiersze: [], pustaPl: 'Stacja nie ma transformatora w modelu.' }]
    : transformatory.map((tr, i) => ({
        id: i === 0 ? 'transformator' : `transformator_${i + 1}`,
        tytul: transformatory.length > 1 ? `Transformator ${publicTechnicalLabel(tr.name, `T${i + 1}`)}` : 'Transformator',
        wiersze: [
          ...(transformatory.length > 1 ? [] : [wiersz('tr_nazwa', 'Nazwa', publicTechnicalLabel(tr.name, 'Transformator'))]),
          ...wierszeTabliczki(tr, katalogi, false),
        ],
        zrodloPl: zrodloDanychElementuPl(tr, tr.catalog_ref ? katalogi.transformatory.get(tr.catalog_ref)?.name ?? null : null),
      }));

  // Strona nN.
  const szynyWlasne = szynyStacji(model, stacja);
  const szynyNn = (stacja.nn_sections ?? []).length > 0
    ? (stacja.nn_sections ?? []).map((s) => s.bus_ref)
    : stacja.bus_refs.filter((ref) => wPasmieNn(ix.szyny.get(ref)?.voltage_kv));
  const odplywy = polaNnStacji(model, stacja.ref_id).map((b) => nazwaPola(b) ?? fieldRoleLabelPl(b.bay_role));
  const odbiory = (model.loads ?? [])
    .filter((l) => szynyWlasne.has(l.bus_ref) || rekord(l.meta)?.station_ref === stacja.ref_id)
    .map((l) => `${publicTechnicalLabel(l.name, 'Odbiór')} · ${zapisLiczby(l.p_mw, 'MW') ?? BRAK_DANYCH_PL}`);
  const zrodlaNn = (model.generators ?? [])
    .filter((g) => g.station_ref === stacja.ref_id && g.connection_variant !== 'block_transformer')
    .map((g) => opisGeneratora(g));
  const stronaNn: SekcjaKarty = {
    id: 'strona_nn',
    tytul: 'Strona nN',
    wiersze: [
      lista('nn_sekcje', 'Sekcje szyn nN', szynyNn.map((ref) => opisSzyny(ix, ref)).filter((s): s is string => s !== null)),
      lista('nn_odplywy', 'Pola i odpływy nN', odplywy),
      lista('nn_odbiory', 'Odbiory', odbiory),
      lista('nn_zrodla', 'Źródła po stronie nN', zrodlaNn),
    ],
  };

  // Przyłączenia: odcinki terenowe z jednym końcem w stacji.
  const terminalDoPola = new Map<string, Bay>();
  for (const bay of polaSn) {
    const zacisk = zaciskPola(bay);
    if (zacisk) terminalDoPola.set(zacisk, bay);
  }
  const przylaczenia: SekcjaKarty = {
    id: 'przylaczenia',
    tytul: 'Przyłączenia',
    wiersze: [],
    tabele: [
      {
        klucz: 'przylaczenia',
        podpis: 'Odcinki przyłączone do stacji',
        kolumny: [
          { klucz: 'odcinek', etykieta: 'Odcinek' },
          { klucz: 'typ', etykieta: 'Typ' },
          { klucz: 'dlugosc', etykieta: 'Długość' },
          { klucz: 'pole', etykieta: 'Pole stacji' },
        ],
        wiersze: odcinkiPrzySzynach(ix, szynyWlasne).map(({ galaz, szynaWlasna }) => ({
          klucz: galaz.ref_id,
          komorki: {
            odcinek: nazwaGalezi(ix, galaz),
            typ: `${RODZAJ_GALEZI_PL[galaz.type]}${typOdcinka(galaz) ? ` ${typOdcinka(galaz)}` : ''}`,
            dlugosc: dlugoscOdcinka(galaz),
            pole: nazwaPola(terminalDoPola.get(szynaWlasna)),
          },
        })),
        pustaPl: 'Do stacji nie przyłączono odcinków.',
      },
    ],
  };

  return {
    rodzaj: 'stacja',
    rodzajPl,
    // K6 (Z-11): nazwa nagłówka z tej samej reguły co wiersz drzewa projektu.
    nazwa: nazwaStacjiJakWDrzewie(model, stacja),
    elementRef: stacja.ref_id,
    sekcje: [identyfikacja, rozdzielnica, ...sekcjeTr, stronaNn, przylaczenia],
  };
}

function opisGeneratora(g: Generator): string {
  return `${publicTechnicalLabel(g.name, 'Źródło')} · ${formatGeneratorTypeLabelPl(g.gen_type ?? null)} · ${zapisLiczby(g.p_mw, 'MW') ?? BRAK_DANYCH_PL}`;
}

function kartaPola(ix: IndeksModelu, bay: Bay, katalogi: KatalogiKarty): KartaTechniczna {
  const aparaty = aparatyPola(ix, bay);
  const zacisk = zaciskPola(bay);
  const odcinki = zacisk ? odcinkiPrzySzynach(ix, new Set([zacisk])).map(({ galaz }) => `${nazwaGalezi(ix, galaz)} · ${typOdcinka(galaz) ?? RODZAJ_GALEZI_PL[galaz.type]} · ${dlugoscOdcinka(galaz) ?? BRAK_DANYCH_PL}`) : [];
  const stacjaRef = stacjaPola(ix.model, bay.ref_id);
  const kierunek = bay.outgoing_destination_ref ? nazwaStacji(ix, bay.outgoing_destination_ref) : null;
  const sekcje: SekcjaKarty[] = [
    {
      id: 'identyfikacja',
      tytul: 'Identyfikacja',
      wiersze: [
        wiersz('nazwa', 'Nazwa', napis(bay.name), { edycja: edycja(bay.ref_id, 'name', bay.name) }),
        wiersz('numer', 'Numer pola', napis(bay.bay_number), { edycja: edycja(bay.ref_id, 'bay_number', bay.bay_number) }),
        wiersz('rola', 'Rola', fieldRoleLabelPl(bay.field_role || bay.bay_role)),
        wiersz('stacja', 'Stacja', nazwaStacji(ix, stacjaRef)),
        wiersz('szyna', 'Szyna', opisSzyny(ix, bay.bus_ref)),
        wiersz('skrot', 'Nazwa odpływu', napis(bay.feeder_short_name), {
          edycja: edycja(bay.ref_id, 'feeder_short_name', bay.feeder_short_name),
        }),
        ...(bay.outgoing_destination_ref ? [wiersz('kierunek', 'Kierunek (stacja docelowa)', kierunek)] : []),
      ],
    },
    {
      id: 'aparatura',
      tytul: 'Aparatura',
      wiersze: [
        ...(napis(bay.switchgear_family_ref) ? [wiersz('rodzina', 'Rodzina rozdzielnicy', napis(bay.switchgear_family_ref))] : []),
        ...(napis(bay.config_id) ? [wiersz('konfiguracja', 'Konfiguracja pola', napis(bay.config_id))] : []),
      ],
      tabele: [
        {
          klucz: 'aparaty',
          podpis: 'Aparaty pola',
          kolumny: [
            { klucz: 'aparat', etykieta: 'Aparat' },
            { klucz: 'typ', etykieta: 'Typ' },
            { klucz: 'ur', etykieta: 'Uᵣ' },
            { klucz: 'ir', etykieta: 'Iᵣ' },
            { klucz: 'ik', etykieta: 'Zdolność wyłączalna' },
            { klucz: 'stan', etykieta: 'Stan' },
          ],
          wiersze: aparaty.map((a) => {
            const zn = znamionaAparatu(a, katalogi);
            return {
              klucz: a.ref,
              komorki: {
                aparat: a.galaz ? `${a.rodzajPl} · ${publicTechnicalLabel(a.galaz.name, a.rodzajPl)}` : `${a.rodzajPl}${a.urzadzenie?.designation ? ` ${a.urzadzenie.designation}` : ''}`,
                typ: zn.typ,
                ur: zn.ur,
                ir: zn.ir,
                ik: a.lacznik ? zn.ik : 'nie dotyczy',
                stan: a.lacznik ? stanAparatu(ix, a, bay) : 'nie dotyczy',
              },
            };
          }),
          pustaPl: 'Pole nie ma aparatów w modelu.',
          zrodloPl: 'Dane znamionowe: pozycja katalogu aparatu przypisana w modelu.',
        },
      ],
    },
    {
      id: 'zabezpieczenia',
      tytul: 'Zabezpieczenie i pomiary',
      wiersze: [
        wiersz('zabezpieczenie', 'Zabezpieczenie', zabezpieczeniaPola(ix, bay, aparaty)),
        wiersz(
          'funkcje_zabezpieczen',
          'Funkcje zabezpieczeniowe',
          (bay.protection_codes ?? []).length > 0 ? (bay.protection_codes ?? []).join(', ') : null,
        ),
        lista('przekladniki', 'Przekładniki', przekladnikiPola(ix, bay)),
      ],
    },
    {
      id: 'przylaczenie',
      tytul: 'Przyłączenie',
      wiersze: [lista('przylaczenie', 'Odcinki na zacisku pola', odcinki)],
    },
  ];
  return {
    rodzaj: 'pole',
    rodzajPl: 'Pole',
    nazwa: nazwaPola(bay) ?? 'Pole',
    elementRef: bay.ref_id,
    sekcje,
  };
}

function kartaAparatu(
  ix: IndeksModelu,
  aparat: AparatPola,
  bay: Bay | null,
  katalogi: KatalogiKarty,
  globalId: string | null,
): KartaTechniczna {
  const zn = znamionaAparatu(aparat, katalogi);
  const nazwa = aparat.galaz
    ? publicTechnicalLabel(aparat.galaz.name, aparat.rodzajPl)
    : `${aparat.rodzajPl}${aparat.urzadzenie?.designation ? ` ${aparat.urzadzenie.designation}` : ''}`;
  const lacznikToru = !bay;
  const galaz = aparat.galaz;
  const identyfikacja: WierszKarty[] = lacznikToru && galaz
    ? [
        wiersz('nazwa', 'Nazwa', napis(galaz.name), { edycja: edycja(galaz.ref_id, 'name', galaz.name) }),
        wiersz('rodzaj', 'Rodzaj', aparat.rodzajPl),
        wiersz(
          'polaczenie',
          'Łączy szyny',
          `${opisSzyny(ix, galaz.from_bus_ref) ?? BRAK_DANYCH_PL} — ${opisSzyny(ix, galaz.to_bus_ref) ?? BRAK_DANYCH_PL}`,
        ),
        wiersz('stan', 'Położenie (model)', stanAparatu(ix, aparat, null)),
      ]
    : [
        wiersz('nazwa', 'Nazwa', nazwa, galaz ? { edycja: edycja(galaz.ref_id, 'name', galaz.name) } : {}),
        wiersz('rodzaj', 'Rodzaj', aparat.rodzajPl),
        wiersz('pole', 'Pole', nazwaPola(bay)),
        wiersz('stacja', 'Stacja', bay ? nazwaStacji(ix, stacjaPola(ix.model, bay.ref_id)) : null),
        ...(globalId ? [wiersz('identyfikator', 'Identyfikator na schemacie', globalId)] : []),
        wiersz('stan', 'Położenie (model)', aparat.lacznik ? stanAparatu(ix, aparat, bay) : 'nie dotyczy'),
      ];
  return {
    rodzaj: lacznikToru ? 'lacznik' : 'aparat',
    rodzajPl: lacznikToru ? 'Łącznik' : 'Aparat',
    nazwa,
    elementRef: aparat.ref,
    sekcje: [
      { id: 'identyfikacja', tytul: 'Identyfikacja', wiersze: identyfikacja },
      {
        id: 'znamiona',
        tytul: 'Dane znamionowe',
        wiersze: [
          wiersz('typ', 'Typ katalogowy', zn.typ),
          wiersz('ur', 'Napięcie znamionowe Uᵣ', zn.ur),
          wiersz('ir', 'Prąd znamionowy Iᵣ', zn.ir),
          wiersz('ik_wyl', 'Zdolność wyłączalna', aparat.lacznik ? zn.ik : 'nie dotyczy'),
          // Wiersz zawsze dla łącznika: „brak danych” (null) odróżniony od „nie dotyczy”.
          ...(aparat.lacznik || zn.ith ? [wiersz('ith', 'Prąd cieplny Iₜₕ / czas', zn.ith)] : []),
          ...(zn.idyn ? [wiersz('idyn', 'Prąd szczytowy I_dyn', zn.idyn)] : []),
        ],
        zrodloPl: zn.zrodloPl,
      },
    ],
  };
}

function kartaTransformatora(ix: IndeksModelu, tr: Transformer, katalogi: KatalogiKarty): KartaTechniczna {
  const blokowy = transformatorBlokowyDer(tr, refyTransformatorowBlokowych(ix.model));
  const meta = rekord(tr.meta);
  const gpz = typeof meta?.visual_role === 'string' && meta.visual_role.startsWith('GPZ');
  const rola = blokowy ? 'blokowy źródła OZE' : gpz ? 'WN/SN rozdzielni źródłowej (GPZ)' : 'rozdzielczy SN/nN';
  const stacjaRef = stationRefOfTransformer(ix.model, tr.ref_id);
  return {
    rodzaj: 'transformator',
    rodzajPl: 'Transformator',
    nazwa: publicTechnicalLabel(tr.name, 'Transformator'),
    elementRef: tr.ref_id,
    sekcje: [
      {
        id: 'identyfikacja',
        tytul: 'Identyfikacja',
        wiersze: [
          wiersz('nazwa', 'Nazwa', napis(tr.name), { edycja: edycja(tr.ref_id, 'name', tr.name) }),
          wiersz('rola', 'Funkcja', rola),
          wiersz('stacja', 'Stacja', nazwaStacji(ix, stacjaRef)),
          wiersz('strona_gn', 'Strona GN', opisSzyny(ix, tr.hv_bus_ref)),
          wiersz('strona_dn', 'Strona DN', opisSzyny(ix, tr.lv_bus_ref)),
        ],
      },
      {
        id: 'tabliczka',
        tytul: 'Dane tabliczki',
        wiersze: [
          ...wierszeTabliczki(tr, katalogi, true),
          wiersz('tr_uklad_nn', 'Układ sieci nN', napis(tr.lv_earthing_system), {
            edycja: edycja(tr.ref_id, 'lv_earthing_system', tr.lv_earthing_system),
          }),
          ...(liczba(tr.n_parallel) !== null ? [wiersz('tr_rownolegle', 'Jednostki równoległe', zapisLiczby(tr.n_parallel, ''))] : []),
        ],
        zrodloPl: zrodloDanychElementuPl(tr, tr.catalog_ref ? katalogi.transformatory.get(tr.catalog_ref)?.name ?? null : null),
      },
    ],
  };
}

function kartaOdcinka(ix: IndeksModelu, galaz: Branch): KartaTechniczna {
  const odcinek = galaz.type === 'cable' || galaz.type === 'line_overhead' ? galaz : null;
  const mp = galaz.materialized_params ?? null;
  const stacjaKonca = (ref: string): string | null => {
    for (const stacja of ix.model.substations ?? []) {
      if (szynyStacji(ix.model, stacja).has(ref)) return nazwaStacjiJakWDrzewie(ix.model, stacja);
    }
    return null;
  };
  const koniec = (ref: string): string | null => {
    const szyna = opisSzyny(ix, ref);
    const stacja = stacjaKonca(ref);
    if (!szyna) return null;
    return stacja ? `${stacja} · ${szyna}` : szyna;
  };
  const izolacja = galaz.type === 'cable' ? napis(galaz.insulation) ?? napis(mp?.insulation_type) : 'nie dotyczy (linia napowietrzna)';
  return {
    rodzaj: 'odcinek',
    rodzajPl: galaz.type === 'line_overhead' ? 'Linia napowietrzna' : 'Odcinek kablowy',
    nazwa: nazwaGalezi(ix, galaz),
    elementRef: galaz.ref_id,
    sekcje: [
      {
        id: 'identyfikacja',
        tytul: 'Identyfikacja',
        wiersze: [
          wiersz('nazwa', 'Nazwa', napis(galaz.name), { edycja: edycja(galaz.ref_id, 'name', galaz.name) }),
          wiersz('rodzaj', 'Rodzaj', RODZAJ_GALEZI_PL[galaz.type]),
          wiersz('od', 'Początek', koniec(galaz.from_bus_ref)),
          wiersz('do', 'Koniec', koniec(galaz.to_bus_ref)),
          wiersz('stan', 'Stan (model)', galaz.status === 'open' ? 'otwarty' : galaz.status === 'closed' ? 'zamknięty' : null),
        ],
      },
      {
        id: 'dane',
        tytul: 'Dane odcinka',
        wiersze: [
          wiersz('typ', 'Typ', typOdcinka(galaz)),
          wiersz('dlugosc', 'Długość', dlugoscOdcinka(galaz), odcinek ? { edycja: edycja(galaz.ref_id, 'length_km', odcinek.length_km) } : {}),
          wiersz('przekroj', 'Przekrój', zapisLiczby(odcinek?.cross_section_mm2 ?? mp?.cross_section_mm2, 'mm²')),
          wiersz('material', 'Materiał żyły', napis(odcinek?.conductor_material) ?? napis(mp?.conductor_material)),
          wiersz('izolacja', 'Izolacja', izolacja),
          wiersz('i_dop', 'Obciążalność długotrwała', zapisLiczby(odcinek?.rating?.in_a ?? mp?.rated_current_a, 'A', 0)),
          wiersz('r1', 'Rezystancja R′', zapisLiczby(odcinek?.r_ohm_per_km, 'Ω/km', 4), { zrodloPl: nadpisanie(galaz, 'r_ohm_per_km') }),
          wiersz('x1', 'Reaktancja X′', zapisLiczby(odcinek?.x_ohm_per_km, 'Ω/km', 4), { zrodloPl: nadpisanie(galaz, 'x_ohm_per_km') }),
          ...(galaz.type === 'cable' && liczba(galaz.n_parallel) !== null ? [wiersz('rownolegle', 'Tory równoległe', zapisLiczby(galaz.n_parallel, ''))] : []),
        ],
        zrodloPl: zrodloDanychElementuPl(galaz, napis(mp?.trade_name)),
      },
    ],
  };
}

function kartaZrodla(ix: IndeksModelu, g: Generator): KartaTechniczna {
  const meta = rekord(g.meta) ?? {};
  const mp = g.materialized_params ?? null;
  const blokowy = g.connection_variant === 'block_transformer' || g.connection_variant === 'DEDICATED_MV_CONNECTION';
  const poleRef = napis(meta.der_mv_field_ref) ?? napis(meta.field_ref);
  const pole = poleRef ? ix.polaWgRef.get(poleRef) ?? null : null;
  const trRef = napis(g.blocking_transformer_ref) ?? napis(meta.block_transformer_ref);
  const tr = trRef ? ix.transformatory.get(trRef) ?? null : null;
  const kabelRef = napis(meta.der_mv_cable_ref);
  const kabel = kabelRef ? ix.galezie.get(kabelRef) ?? null : null;
  const tryb = napis(meta.control_mode);
  const trybKatalogu = napis(mp?.control_mode);
  const trybPl = tryb ? trybRegulacjiPl(tryb) : trybKatalogu ? trybRegulacjiPl(trybKatalogu) : null;
  const zrodloTrybu = tryb
    ? trybKatalogu && trybKatalogu === tryb
      ? 'katalog przekształtnika'
      : 'nastawa projektanta w modelu'
    : trybKatalogu
      ? 'katalog przekształtnika (bez nastawy w modelu)'
      : null;
  const jednostki = liczba(g.n_parallel) ?? liczba(g.quantity);
  return {
    rodzaj: 'zrodlo',
    rodzajPl: formatGeneratorTypeLabelPl(g.gen_type ?? null),
    nazwa: publicTechnicalLabel(g.name, 'Źródło OZE'),
    elementRef: g.ref_id,
    sekcje: [
      {
        id: 'identyfikacja',
        tytul: 'Identyfikacja',
        wiersze: [
          wiersz('nazwa', 'Nazwa', napis(g.name)),
          wiersz('rodzaj', 'Rodzaj', formatGeneratorTypeLabelPl(g.gen_type ?? null)),
          wiersz('stacja', 'Stacja', nazwaStacji(ix, g.station_ref ?? null)),
          wiersz('moc', 'Moc czynna P', zapisLiczby(g.p_mw, 'MW')),
          wiersz('jednostki', 'Jednostki', jednostki !== null ? String(jednostki) : null),
          wiersz('typ', 'Typ katalogowy przekształtnika', napis(mp?.name) ?? (napis(g.catalog_ref) ? `pozycja katalogu ${g.catalog_ref}` : null)),
          wiersz('tryb_regulacji', 'Tryb regulacji', trybPl, { zrodloPl: zrodloTrybu }),
          wiersz('modul_ncrfg', 'Moduł NC RfG', g.nc_rfg_module ? `typ ${g.nc_rfg_module}` : null),
        ],
        zrodloPl: zrodloDanychElementuPl(g, napis(mp?.name)),
      },
      {
        id: 'tor_przylaczenia',
        tytul: 'Tor przyłączenia',
        wiersze: [
          wiersz('wariant', 'Przyłączenie', g.connection_variant ? WARIANT_PRZYLACZENIA_PL[g.connection_variant] ?? null : null),
          wiersz('szyna_przylaczenia', 'Szyna falownika', opisSzyny(ix, g.bus_ref)),
          wiersz('pole_zrodlowe', blokowy ? FIELD_SOURCE_LABEL_PL : 'Pole źródłowe nN', nazwaPola(pole)),
          wiersz(
            'tr_blokowy',
            'Transformator blokowy',
            blokowy
              ? tr
                ? `${publicTechnicalLabel(tr.name, 'Transformator blokowy')} · ${zapisLiczby(tr.sn_mva, 'MVA') ?? BRAK_DANYCH_PL} · ${zapisLiczby(tr.uhv_kv, 'kV') ?? BRAK_DANYCH_PL}/${zapisLiczby(tr.ulv_kv, 'kV') ?? BRAK_DANYCH_PL}`
                : null
              : 'nie dotyczy (przyłączenie po stronie nN stacji)',
          ),
          wiersz(
            'kabel_sn',
            'Kabel SN przyłączeniowy',
            blokowy
              ? kabel
                ? `${typOdcinka(kabel) ?? RODZAJ_GALEZI_PL[kabel.type]} · ${dlugoscOdcinka(kabel) ?? BRAK_DANYCH_PL}`
                : null
              : 'nie dotyczy (przyłączenie po stronie nN stacji)',
          ),
        ],
      },
    ],
  };
}

function kartaSieci(ix: IndeksModelu, s: Source): KartaTechniczna {
  const z = (k: string) => nadpisanie(s, k);
  return {
    rodzaj: 'siec_zasilajaca',
    rodzajPl: 'Sieć zasilająca',
    nazwa: publicTechnicalLabel(s.name, 'Sieć zasilająca'),
    elementRef: s.ref_id,
    sekcje: [
      {
        id: 'identyfikacja',
        tytul: 'Identyfikacja',
        wiersze: [
          wiersz('nazwa', 'Nazwa', napis(s.name)),
          wiersz('stacja', 'Stacja', nazwaStacji(ix, s.substation_ref ?? null)),
          wiersz('szyna', 'Szyna przyłączenia', opisSzyny(ix, s.bus_ref)),
          wiersz('typ', 'Typ katalogowy', napis(s.catalog_ref) ? `pozycja katalogu ${s.catalog_ref}` : null),
        ],
      },
      {
        id: 'zwarciowe',
        tytul: 'Parametry zwarciowe',
        wiersze: [
          wiersz('sk_max', 'Moc zwarciowa Sₖ″ maks.', zapisLiczby(s.sk3_mva, 'MVA'), { zrodloPl: z('sk3_mva') }),
          wiersz('ik_max', 'Prąd zwarciowy Iₖ″ maks.', zapisLiczby(s.ik3_ka, 'kA'), { zrodloPl: z('ik3_ka') }),
          wiersz('rx_max', 'Stosunek R/X (maks.)', zapisLiczby(s.rx_ratio, ''), { zrodloPl: z('rx_ratio') }),
          wiersz('sk_min', 'Moc zwarciowa Sₖ″ min.', zapisLiczby(s.sk3_min_mva, 'MVA'), { zrodloPl: z('sk3_min_mva') }),
          wiersz('ik_min', 'Prąd zwarciowy Iₖ″ min.', zapisLiczby(s.ik3_min_ka, 'kA'), { zrodloPl: z('ik3_min_ka') }),
          wiersz('rx_min', 'Stosunek R/X (min.)', zapisLiczby(s.rx_ratio_min, ''), { zrodloPl: z('rx_ratio_min') }),
        ],
        zrodloPl: zrodloDanychElementuPl(s, null),
      },
    ],
  };
}

function kartaSzyny(ix: IndeksModelu, bus: Bus): KartaTechniczna {
  let stacja: Substation | null = null;
  for (const s of ix.model.substations ?? []) {
    if (szynyStacji(ix.model, s).has(bus.ref_id)) {
      stacja = s;
      break;
    }
  }
  const polaSzyny = pola(ix.model).filter((b) => b.bus_ref === bus.ref_id).map((b) => nazwaPola(b) ?? 'Pole');
  const galezie = (ix.model.branches ?? [])
    .filter((g) => g.from_bus_ref === bus.ref_id || g.to_bus_ref === bus.ref_id)
    .map((g) => `${RODZAJ_GALEZI_PL[g.type]} · ${nazwaGalezi(ix, g)}`);
  return {
    rodzaj: 'szyna',
    rodzajPl: 'Szyna',
    nazwa: publicTechnicalLabel(bus.name, 'Szyna'),
    elementRef: bus.ref_id,
    sekcje: [
      {
        id: 'identyfikacja',
        tytul: 'Identyfikacja',
        wiersze: [
          wiersz('nazwa', 'Nazwa', napis(bus.name)),
          wiersz('napiecie', 'Napięcie znamionowe', zapisLiczby(bus.voltage_kv, 'kV')),
          wiersz('stacja', 'Stacja', stacja ? nazwaStacjiJakWDrzewie(ix.model, stacja) : null),
        ],
      },
      {
        id: 'przylaczone',
        tytul: 'Przyłączone',
        wiersze: [lista('pola', 'Pola na szynie', polaSzyny), lista('galezie', 'Gałęzie', galezie)],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Dyspozytor
// ---------------------------------------------------------------------------

/**
 * Karta techniczna obiektu rozstrzygniętego przez `buildDaneElementuKanwy`. `null` — rodzaj bez
 * karty (węzeł SN ma własną sekcję, szkic DER — formularz) albo obiekt nieznany w modelu.
 */
export function buildKartaTechniczna(
  snapshot: EnergyNetworkModel | null,
  dane: DaneElementuKanwy | null,
  katalogi: KatalogiKarty = KATALOGI_PUSTE,
): KartaTechniczna | null {
  if (!snapshot || !dane?.elementId) return null;
  const ix = indeks(snapshot);
  const ref = dane.elementId;
  switch (dane.kind) {
    case 'station': {
      const stacja = ix.stacje.get(ref);
      return stacja ? kartaStacji(ix, stacja, katalogi) : null;
    }
    case 'bay':
    case 'apparatus': {
      const bay = ix.polaWgRef.get(ref);
      if (bay) return kartaPola(ix, bay, katalogi);
      for (const kandydat of pola(snapshot)) {
        const aparat = aparatyPola(ix, kandydat).find((a) => a.ref === ref || a.galaz?.ref_id === ref);
        if (aparat) return kartaAparatu(ix, aparat, kandydat, katalogi, dane.globalId ?? null);
      }
      const galaz = ix.galezie.get(ref);
      if (galaz && TYPY_LACZNIKOW.has(galaz.type)) return kartaAparatu(ix, aparatZGalezi(galaz), null, katalogi, null);
      return null;
    }
    case 'transformer': {
      const tr = ix.transformatory.get(ref);
      return tr ? kartaTransformatora(ix, tr, katalogi) : null;
    }
    case 'cable_run': {
      const galaz = ix.galezie.get(ref);
      return galaz ? kartaOdcinka(ix, galaz) : null;
    }
    case 'generator': {
      const g = (snapshot.generators ?? []).find((x) => x.ref_id === ref || x.id === ref);
      return g ? kartaZrodla(ix, g) : null;
    }
    case 'grid_source': {
      const s = (snapshot.sources ?? []).find((x) => x.ref_id === ref || x.id === ref);
      return s ? kartaSieci(ix, s) : null;
    }
    case 'bus': {
      const bus = ix.szyny.get(ref);
      return bus ? kartaSzyny(ix, bus) : null;
    }
    default:
      return null;
  }
}

/** Wszystkie klucze karty (wiersze i tabele `tabela:<klucz>`) — dla testu parytetu i e2e. */
export function kluczeKarty(karta: KartaTechniczna): string[] {
  const klucze: string[] = [];
  for (const sekcja of karta.sekcje) {
    for (const w of sekcja.wiersze) klucze.push(w.klucz);
    for (const t of sekcja.tabele ?? []) klucze.push(`tabela:${t.klucz}`);
  }
  return klucze;
}
