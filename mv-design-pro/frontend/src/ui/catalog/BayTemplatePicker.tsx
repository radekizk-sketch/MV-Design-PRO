/**
 * Kontrakt szablonów pól SN z backendu (`GET /api/catalog/complete-bay-templates`) i nazwy
 * prezentacyjne szablonu: status źródła, rodzaj pola z kanonu ról, nazwa pakietu pola.
 *
 * Dawny komponent wyboru `BayTemplatePicker` (lista przycisków z plakietką statusu) nie miał
 * żadnego miejsca wpięcia w aplikacji — skasowany; szablon pola wybiera projektant w kreatorze
 * stacji, kreatorze pola i edytorze wyposażenia pola, które czytają stąd kontrakt i nazwy.
 */

import type { BayCanonicalRole, BayModelRole } from '../../types/enm';
import type {
  RdzenPrzekladnikaPradowego,
  UzwojeniePrzekladnikaNapieciowego,
} from '../../types/przekladniki';
import { FIELD_ROLE_LABEL_PL } from '../sld/v2/station-rozdzielnia/contract';

export type BayKind =
  | 'liniowe_doplywowe'
  | 'liniowe_odplywowe'
  | 'transformatorowe'
  | 'pomiarowe'
  | 'sprzeglowe_podluzne'
  | 'sprzeglowe_poprzeczne'
  | 'sekcyjne'
  | 'potrzeb_wlasnych'
  | 'odgromnikowe'
  | 'pv'
  | 'bess'
  | 'fw'
  | 'rezerwowe'
  | 'kablowe'
  | 'napowietrzne'
  | 'nop_lacznikowe'
  | 'bateria_kondensatorow'
  | 'zespol_uziemiajacy';

export type BayTemplateSourceStatus =
  | 'official_catalog'
  | 'repo_verified'
  | 'user_defined'
  | 'canonical_fallback'
  | 'requires_catalog'
  | 'incomplete_requires_review';

export type BayRole = BayModelRole;

/**
 * Aparat KANONICZNEGO układu pola — `BayDeviceTemplate` backendu
 * (`network_model/catalog/bay_templates.py`), przenoszony na wyjściu trasy
 * `GET /api/catalog/complete-bay-templates` w `base_template.devices`.
 *
 * To jest KOMPOZYCJA APARATÓW pola (BOM): rodzaj, oznaczenie operatorskie,
 * pozycja w kolumnie pola i umiejscowienie elektryczne. Typ frontendowy tych
 * pól dotąd NIE deklarował, więc kreator dostawał je z sieci i wyrzucał —
 * i dlatego rysunek pola nie miał z czego pokazać składu rozdzielnicy.
 */
export interface BayDeviceTemplateWire {
  // Lustro `BayDeviceTemplate.kind` (`network_model/catalog/bay_templates.py`); równość zbiorów
  // przypina `backend/tests/ci/test_parytet_rodzajow_aparatu_pola.py`.
  readonly kind:
    | 'CB'
    | 'DS_BUS'
    | 'DS_LINE'
    | 'DS_BRANCH'
    | 'ES'
    | 'CT'
    | 'VT'
    | 'FUSE'
    | 'SURGE_ARRESTER'
    | 'CABLE_HEAD'
    | 'TRANSFORMER_DEVICE'
    | 'THREE_POSITION_SWITCH'
    | 'VOLTAGE_INDICATOR'
    | 'CORE_BALANCE_CT'
    | 'UNBALANCE_CT'
    | 'PHASE_TO_PHASE_VT';
  readonly designation_q: string;
  readonly position: number;
  readonly placement: 'UPSTREAM' | 'MIDSTREAM' | 'DOWNSTREAM' | 'OFF_PATH' | 'GROUND_BRANCH';
  readonly optional?: boolean;
  /** Podstawa pozycji w szablonie (rysunek/punkt standardu); `null` = szablon bez podstawy. */
  readonly podstawa?: string | null;
  /** Pozycja katalogowa aparatu wskazana przez szablon; `null` = wartość robocza. */
  readonly catalog_ref?: string | null;
  /** Odgałęzienie toru, w którym aparat leży (Z.11/Z.11.1: przekładnik napięciowy za
   *  wyłącznikiem); `null` = tor główny. */
  readonly odgalezienie?: string | null;
  /** Tabliczka przekładnika wg rysunku standardu: rdzenie CT, uzwojenia VT. */
  readonly rdzenie?: readonly RdzenPrzekladnikaPradowego[];
  readonly uzwojenia?: readonly UzwojeniePrzekladnikaNapieciowego[];
}

/** Port pola — `BayPortTemplate` backendu (`base_template.ports`). */
export interface BayPortTemplateWire {
  readonly kind: string;
  readonly suffix: string;
}

/** Kanoniczny szablon pola — `BayTemplate` backendu (`base_template`). */
export interface BayTemplateWire {
  readonly template_id: string;
  readonly name: string;
  readonly bay_role: BayRole;
  readonly description?: string;
  readonly devices: readonly BayDeviceTemplateWire[];
  readonly ports?: readonly BayPortTemplateWire[];
}

/**
 * Aparat kompozycji PRODUCENTA — `BayDeviceInstanceTemplate` backendu
 * (`device_instances`). Bogatszy od układu kanonicznego: niesie wskaźnik
 * obecności napięcia (VPIS), przekaźnik, licznik i aparat strony nN, a także
 * stronę elektryczną aparatu w polu.
 */
export interface BayDeviceInstanceWire {
  readonly device_template_ref: string;
  readonly apparatus_kind:
    | 'circuit_breaker'
    | 'switch_disconnector'
    | 'disconnector_busbar'
    | 'disconnector_line'
    | 'disconnector_branch'
    | 'earthing_switch'
    | 'fuse_set'
    | 'current_transformer'
    | 'voltage_transformer'
    | 'unbalance_current_transformer'
    | 'phase_to_phase_voltage_transformer'
    | 'surge_arrester'
    | 'cable_head'
    | 'busbar'
    | 'bus_coupler'
    | 'voltage_indicator'
    | 'three_position_switch'
    | 'core_balance_ct'
    | 'protection_relay'
    | 'meter'
    | 'transformer'
    | 'lv_breaker'
    | 'interlock';
  readonly label: string;
  readonly position_in_bay?: number;
  readonly electrical_side?:
    | 'busbar_side'
    | 'line_side'
    | 'transformer_side'
    | 'metering_branch'
    | 'earthing_branch'
    | 'lv_side';
  /**
   * Status wyposażenia aparatu w polu — JEDEN predykat kontraktu
   * (`BayDeviceInstanceTemplate.status_wyposazenia`, pole WYMAGANE po stronie
   * pydantic, bez wartości domyślnej):
   *  · `FABRYCZNY` — aparat wchodzi w skład katalogowego pola rodziny,
   *  · `OPCJA` — dopuszczalne doposażenie tego pola.
   * Aparat spoza listy pola jest NIEDOPUSZCZALNY — to brak wpisu, nie wartość.
   *
   * KOREKTA KONTRAKTU (karta S3): typ deklarował tu parę `is_required` /
   * `is_optional`, którą backend USUNĄŁ przy scaleniu kanonu rozdzielnic
   * (`switchgear/device_instance.py` — dwie niezależne flagi dopuszczały stan
   * sprzeczny i nieokreślony). Backend tych kluczy nie wysyła od tamtej pory,
   * więc były to pola-widma: kod czytający `is_required` dostawał zawsze
   * `undefined`, a fixture'y testowe deklarowały wartość, której żywa odpowiedź
   * nie ma. Deklaracja zgodna z kontraktem jest WYMAGANA, tak jak w pydantic.
   */
  readonly status_wyposazenia: 'FABRYCZNY' | 'OPCJA';
}

export interface CompleteMvBayTemplateSummary {
  readonly template_ref: string;
  /**
   * Kanoniczny układ aparatury pola — ŹRÓDŁO BOM dla generatora mini-SLD
   * (`ui2/kreatory/stacja/generatorSldPola.ts`). Pole jest w kontrakcie
   * WYMAGANE (pydantic `base_template: BayTemplate` bez wartości domyślnej),
   * więc typ też je wymaga: szablon bez kompozycji aparatów nie istnieje, a
   * atrapa bez niego przepuszczałaby rysunek pola bez składu.
   */
  readonly base_template: BayTemplateWire;
  readonly manufacturer_ref: string | null;
  readonly switchgear_family_ref: string | null;
  readonly bay_kind: BayKind;
  readonly bay_role: BayRole;
  readonly source_status: BayTemplateSourceStatus;
  readonly source_refs: readonly string[];
  readonly version: string;
  readonly hash: string;
  readonly notes_pl: string | null;
  /** Nazwa i kod katalogowy pola producenta (gdy szablon je niesie). */
  readonly template_name_pl?: string | null;
  readonly template_code?: string | null;
  /** Kompozycja producenta — bogatsza od kanonicznej, gdy szablon ją niesie. */
  readonly device_instances?: readonly BayDeviceInstanceWire[];
}

/**
 * Grupa statusu źródła szablonu pola — poziom, na którym kreatory opisują pakiet
 * („pakiet katalogowy", „pakiet użytkownika", „poza konfiguracją projektową") i którym
 * rozstrzyga się kompletność pakietu (`isCompleteSourceStatus`).
 */
export type GrupaZrodlaSzablonu = 'PAKIET_KATALOGOWY' | 'PAKIET_UZYTKOWNIKA' | 'POZA_KONFIGURACJA';

/**
 * JEDNO źródło prawdy statusu źródła szablonu pola: nazwa szczegółowa (inspektor) i grupa
 * (kreatory, podgląd rozdzielnicy, kompletność). Dawniej dwie niezależne tablice —
 * szczegółowa tu i grupująca `SOURCE_STATUS_LABEL_PL` w `InsertStationFormHelpers.ts`
 * — plus trzecia kopia podziału w `isCompleteSourceStatus`; nowy status mógł trafić do
 * jednej z nich. Rekord jest totalny względem unii (sprawdzenie kompilatora).
 */
const STATUS_ZRODLA: Readonly<
  Record<BayTemplateSourceStatus, { readonly etykieta: string; readonly grupa: GrupaZrodlaSzablonu }>
> = {
  official_catalog: { etykieta: 'Oficjalny katalog producenta', grupa: 'PAKIET_KATALOGOWY' },
  repo_verified: { etykieta: 'Zweryfikowany w repozytorium', grupa: 'PAKIET_KATALOGOWY' },
  user_defined: { etykieta: 'Definicja użytkownika', grupa: 'PAKIET_UZYTKOWNIKA' },
  canonical_fallback: {
    etykieta: 'Szablon kanoniczny ogólny (rozwiązanie zapasowe)',
    grupa: 'POZA_KONFIGURACJA',
  },
  requires_catalog: { etykieta: 'Wymaga uzupełnienia katalogu', grupa: 'POZA_KONFIGURACJA' },
  incomplete_requires_review: {
    etykieta: 'Niekompletny — wymaga przeglądu',
    grupa: 'POZA_KONFIGURACJA',
  },
};

/** Nazwy grup statusu źródła (teksty kreatorów). */
export const NAZWA_GRUPY_ZRODLA_PL: Readonly<Record<GrupaZrodlaSzablonu, string>> = {
  PAKIET_KATALOGOWY: 'pakiet katalogowy',
  PAKIET_UZYTKOWNIKA: 'pakiet użytkownika',
  POZA_KONFIGURACJA: 'poza konfiguracją projektową',
};

function wpisStatusuZrodla(status: string): (typeof STATUS_ZRODLA)[BayTemplateSourceStatus] | null {
  return Object.prototype.hasOwnProperty.call(STATUS_ZRODLA, status)
    ? STATUS_ZRODLA[status as BayTemplateSourceStatus]
    : null;
}

/** Nazwa statusu źródła szablonu pola. */
export function etykietaStatusuZrodlaSzablonuPl(status: BayTemplateSourceStatus): string {
  return wpisStatusuZrodla(status)?.etykieta ?? 'Nieznany status źródła';
}

/** Grupa statusu źródła (`null` — status spoza unii kontraktu). */
export function grupaZrodlaSzablonu(status: string): GrupaZrodlaSzablonu | null {
  return wpisStatusuZrodla(status)?.grupa ?? null;
}

/**
 * Nazwa grupy statusu źródła — status spoza słownika (wartość z sieci spoza unii kontraktu)
 * dostaje opis jawny, nigdy `undefined` ani kod.
 */
export function grupaZrodlaSzablonuPl(status: string): string {
  const grupa = grupaZrodlaSzablonu(status);
  return grupa ? NAZWA_GRUPY_ZRODLA_PL[grupa] : 'status źródła spoza słownika aplikacji';
}

/**
 * Rodzaj pola katalogu (`BayKind`) → rola kanoniczna pola + określenie rodzaju (karta #141).
 * Rodzaj z rolą kanonu bierze nazwę z kanonu słownictwa ról (`FIELD_ROLE_LABEL_PL`) — ten sam
 * termin co na schemacie, w kreatorze i w inspektorze; rodzaje sprzęgła dokładają określenie
 * („Pole sprzęgła podłużnego”). Rodzaje bez roli kanonu (funkcje pomocnicze rozdzielnicy,
 * pole sekcyjne, wykonanie kablowe/napowietrzne bez kierunku, rezerwa) mają własną nazwę —
 * zgodnie z odwzorowaniem funkcji na rolę operacji w kreatorze stacji
 * (`ui2/kreatory/stacja/konfiguratorRozdzielnicy.ts::ROLA_Z_FUNKCJI_POLA`, parytet przypięty
 * testem). Tablica jest totalna względem `BayKind` (sprawdzenie kompilatora).
 */
type OpisRodzajuPola =
  | { readonly rola: BayCanonicalRole; readonly okreslenie?: string }
  | { readonly nazwaBezRoli: string };

const OPIS_RODZAJU_POLA: Readonly<Record<BayKind, OpisRodzajuPola>> = {
  liniowe_doplywowe: { rola: 'LINIA_IN' },
  liniowe_odplywowe: { rola: 'LINIA_OUT' },
  transformatorowe: { rola: 'TRANSFORMATOROWE' },
  pomiarowe: { rola: 'POMIAROWE' },
  sprzeglowe_podluzne: { rola: 'SPRZEGLO', okreslenie: 'podłużnego' },
  sprzeglowe_poprzeczne: { rola: 'SPRZEGLO', okreslenie: 'poprzecznego' },
  sekcyjne: { nazwaBezRoli: 'Pole sekcyjne' },
  potrzeb_wlasnych: { nazwaBezRoli: 'Pole potrzeb własnych' },
  odgromnikowe: { nazwaBezRoli: 'Pole odgromnikowe' },
  pv: { rola: 'PV_SN' },
  bess: { rola: 'BESS_SN' },
  fw: { rola: 'FW_SN' },
  rezerwowe: { nazwaBezRoli: 'Pole rezerwowe' },
  kablowe: { nazwaBezRoli: 'Pole kablowe' },
  napowietrzne: { nazwaBezRoli: 'Pole napowietrzne' },
  nop_lacznikowe: { nazwaBezRoli: 'Pole łącznikowe NOP' },
  bateria_kondensatorow: { rola: 'BATERIA_KONDENSATOROW' },
  zespol_uziemiajacy: { rola: 'ZESPOL_UZIEMIAJACY' },
};

/** Opis jawny rodzaju pola spoza słownika aplikacji (nowy kod backendu przed aktualizacją). */
export const RODZAJ_POLA_SPOZA_SLOWNIKA_PL = 'rodzaj pola spoza słownika aplikacji';

/**
 * Nazwa rodzaju pola katalogu — z kanonu ról pól, a dla rodzaju bez roli — jego własna.
 * Kod spoza słownika (`BayKind` to lustro backendu, ale wartość przychodzi z sieci) daje opis
 * jawny, nigdy kod ani wyjątek.
 */
export function bayKindLabelPl(kind: BayKind): string {
  if (!Object.prototype.hasOwnProperty.call(OPIS_RODZAJU_POLA, kind)) {
    return RODZAJ_POLA_SPOZA_SLOWNIKA_PL;
  }
  const opis = OPIS_RODZAJU_POLA[kind];
  if ('nazwaBezRoli' in opis) return opis.nazwaBezRoli;
  const nazwaRoli = FIELD_ROLE_LABEL_PL[opis.rola];
  return opis.okreslenie ? `${nazwaRoli} ${opis.okreslenie}` : nazwaRoli;
}

/**
 * Nazwa pakietu pola do listy wyboru — nigdy referencja szablonu (`ABB__SAFERING__LINE_OUT`).
 * Nazwa katalogowa, gdy szablon ją niesie; inaczej rodzaj pola z kanonu ról i nazwa rodziny
 * rozdzielnicy z katalogu rodzin. Szablon rodziny, której katalog nie zna, mówi to wprost;
 * szablon bez rodziny to kanoniczny szablon ogólny.
 */
export function nazwaSzablonuPolaPl(
  szablon: Pick<CompleteMvBayTemplateSummary, 'template_name_pl' | 'bay_kind' | 'switchgear_family_ref'>,
  nazwyRodzin: ReadonlyMap<string, string>,
): string {
  const nazwa = szablon.template_name_pl?.trim();
  if (nazwa) return nazwa;
  const rodzaj = bayKindLabelPl(szablon.bay_kind);
  if (!szablon.switchgear_family_ref) return `${rodzaj} · szablon kanoniczny ogólny`;
  const rodzina = nazwyRodzin.get(szablon.switchgear_family_ref);
  return `${rodzaj} · ${rodzina ?? 'rodzina rozdzielnicy spoza katalogu rodzin'}`;
}

/** Opis jawny szablonu, którego referencji nie ma w katalogu szablonów pól. */
export const SZABLON_SPOZA_KATALOGU_PL = 'szablon spoza katalogu szablonów pól';

/**
 * Nazwa szablonu wskazanego referencją (np. `Bay.bay_template_ref` zapisane w modelu) —
 * nazwa z katalogu albo opis jawny, gdy katalogu tej referencji nie zna; referencja nigdy
 * nie trafia na ekran.
 */
export function nazwaSzablonuPoReferencjiPl(
  templateRef: string,
  szablony: readonly CompleteMvBayTemplateSummary[],
  nazwyRodzin: ReadonlyMap<string, string>,
): string {
  const szablon = szablony.find((s) => s.template_ref === templateRef);
  return szablon ? nazwaSzablonuPolaPl(szablon, nazwyRodzin) : SZABLON_SPOZA_KATALOGU_PL;
}
