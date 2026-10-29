/**
 * Kanoniczny model GPZ dla schematu jednokreskowego — kontrakt propsów, który adapter
 * ENM (`enmToCanonicalGpzAdapter.ts`) wytwarza, a kompozycja v3 (`v3/compose/gpz.ts`)
 * czyta. Karta GPZ-PARYTET: typy przeniesione z martwego renderera v2
 * (`GpzCanonicalRenderer`, skasowany razem z nagłówkiem operatorskim — żaden ekran go nie
 * renderował, kompozycja v3 czytała z niego wyłącznie typy) i oczyszczone z pól, których
 * narzędzie projektowe nie ma skąd wziąć:
 *
 * * nagłówek operatorski SCADA (stan transmisji telemetrii, dostępność sterowania,
 *   kasowanie sygnalizacji, adres i identyfikator radiowy) — wielkości ruchowe systemu
 *   nadzoru; model ENM ich nie niesie (`Bay.runtime_state` nie ma w produkcie ani jednego
 *   zapisującego), więc kontrolka byłaby atrapą (reguła phantom, kontrakt v3 §8 „Nie SCADA");
 * * bilans i alarmy „z runtime SCADA" — bilans GPZ i liczba alarmów pochodzą teraz z
 *   WYNIKU ROZPŁYWU liczonego przez backend (`enm/wyniki_pol_gpz.py`) i trafiają na
 *   schemat warstwą wyników, nie przez propsy kompozycji;
 * * pomiary pola przepisywane z nakładki przez przeszukanie gałęzi przy szynie pola
 *   (`resolveFeederBranchRef`) — przeszukiwanie topologii we froncie jest zakazane; pomiar
 *   zacisku pola wyznacza backend;
 * * geometria slotowa v2 (`x`/`y`) i wywołania zwrotne interakcji v2 — kompozycja v3 ich
 *   nie czytała.
 */

import type { BayPrimaryDeviceView, BayProtectionMarkingView, CtRatingAnnotationView, VtMountingAnnotationView } from '../model/widokPolStacji';
import type { OltcGlyphAnnotation } from '../model/gpzSwitchgearTypes';
import type { RolaPolaZrodlowego } from '../model/polaZModelu';
import type { BateriaPolaView } from '../model/bateriaPola';

/**
 * Topologia szyny w sekcji GPZ — IEC 60617 + PLAN_SLD_REWORK F1 §3.3.
 *
 *   - `single`  : pojedyncza szyna (większość GPZ 110/SN)
 *   - `double`  : dwie niezależne szyny S1 + S2 (operator wybiera per pole)
 *   - `ring`    : dwie szyny S1 + S2 z zamknięciem po prawej (pierścień)
 */
export type CanonicalGpzBusbarTopology = 'single' | 'double' | 'ring';

/** Pomiar napięcia SZYNY sekcji GPZ — `Measurement{measurement_type:'VT', bus_ref: szyna
 *  sekcji, bez bay_ref}`. `arrangement`: gwiazda = pomiar U; otwarty trójkąt = źródło 3U₀. */
export interface CanonicalGpzBusVt {
  readonly measurementRef: string;
  readonly arrangement: 'open_delta' | 'star' | null;
}

export interface CanonicalGpzSection {
  /** Stabilny identyfikator z ENM (`Substation.gpz_sections[].section_id`). */
  readonly sectionId: string;
  /** Kanoniczny ref Bus ENM tej sekcji (`Substation.gpz_sections[].bus_ref`) — powiązanie
   *  szyny sekcji z wynikami/energizacją. `null`/brak gdy snapshot nie niesie `bus_ref`. */
  readonly busRef?: string | null;
  /** Kolejność w rozdzielni (1-N). */
  readonly order: number;
  /** Etykieta widoczna ("S1"/"S2"/...). */
  readonly label: string;
  /** Napięcie szyny (kV) z `Bus.voltage_kv`; `null` = brak danej w modelu (jawny brak,
   *  bez zastępczego 15/110 kV). */
  readonly busVoltageKv: number | null;
  /** Lista pól na sekcji. */
  readonly bays: readonly CanonicalGpzBay[];
  /** Topologia szyny (single/double/ring). Domyślnie `single`. */
  readonly busbarTopology?: CanonicalGpzBusbarTopology;
  /** VT szyny sekcji (równolegle do szyny, nigdy w torze). Puste/brak = dana nieobecna. */
  readonly busVtMeasurements?: readonly CanonicalGpzBusVt[];
}

/**
 * Rola pola rozdzielni GPZ wg modelu (`Bay.bay_role`) — klucz tła pola (`gpz.bay.panel`)
 * i legendy ról. Mapowanie 1:1, bez zlewania ról: `IN` → zasilające, `OUT`/`FEEDER` →
 * liniowe (odpływ magistrali i odgałęzienia), `TR` → transformatorowe, `COUPLER` → sprzęgło,
 * `MEASUREMENT` → pomiarowe, `OZE` → źródłowe (przyłącze wytwórcy), `BKR` → kompensacyjne (pole
 * baterii kondensatorów, ENEA Zeszyt 1 §13 i Zał. 16). Roli „rezerwowe" model
 * nie zna (pole wolne to stan zajętości liczony w backendzie, nie rola), więc nie istnieje.
 */
export type RolaPolaGpz =
  | 'zasilajace'
  | 'liniowe'
  | 'transformatorowe'
  | 'sprzeglo'
  | 'pomiarowe'
  | 'zrodlowe'
  | 'kompensacyjne';

/**
 * Plakietka funkcji automatyki pola — WYŁĄCZNIE z kodów funkcji pola w modelu
 * (`Bay.protection_codes`, kody słownika `backend/src/network_model/catalog/funkcje_eaz.py`,
 * dane aktywów EAZ, ADR-022). Jeden kod = jedna plakietka (`KOD_FUNKCJI_PLAKIETKI`):
 *
 * * `SPZ` (samoczynne ponowne załączanie) ⇔ kod 79;
 * * `SCO` (samoczynne częstotliwościowe odciążenie) ⇔ kod SCO słownika (dawne „81U poza
 *   polem OZE" było domysłem: 81U to zabezpieczenie podczęstotliwościowe f<, które pole
 *   Z.11.1 ma OBOK automatyki SCO, a nie zamiast niej);
 * * `LRW` (lokalna rezerwa wyłącznikowa) ⇔ kod 50BF;
 * * `NZ` (blokada załączenia od napięcia zwrotnego) ⇔ kod NZ;
 * * `OWG` (wyłączenie pól z generacją od zabezpieczeń transformatora) ⇔ kod OWG.
 *
 * Brak kodu = brak plakietki. Plakietka niesie OBECNOŚĆ funkcji; jej STAN (aktywna /
 * odstawiona, zablokowana) należy do nastaw zabezpieczeń (ADR-022), których model jeszcze
 * nie niesie — plakietka mówi to jawnie (`STAN_FUNKCJI_PLAKIETKI_PL`), nie zgaduje stanu.
 */
export type GpzStatusFlag = 'SPZ' | 'SCO' | 'LRW' | 'NZ' | 'OWG';

/** Kod funkcji słownika EAZ każdej plakietki — JEDNO źródło mapowania i kolejności. */
export const KOD_FUNKCJI_PLAKIETKI: Readonly<Record<GpzStatusFlag, string>> = {
  SPZ: '79',
  SCO: 'SCO',
  LRW: '50BF',
  NZ: 'NZ',
  OWG: 'OWG',
};

/** Kolejność plakietek (stała, deterministyczna). */
export const PLAKIETKI_GPZ: readonly GpzStatusFlag[] = ['SPZ', 'SCO', 'LRW', 'NZ', 'OWG'];

export interface CanonicalGpzBay {
  readonly bayRef: string;
  /** Numer dyspozytorski ("10", "23/1") z ENM `Bay.bay_number`. */
  readonly bayNumber: string | null;
  /** Krótka nazwa odpływu z `Bay.feeder_short_name`. */
  readonly feederName: string | null;
  /** NAZWA stacji docelowej odejścia (`Bay.outgoing_destination_ref` rozwiązany na
   *  `Substation.name`, ref gdy model nie zna nazwy); strzałkę dokłada kompozycja. */
  readonly destinationLabel: string | null;
  /** GEOMETRIA-STACJI (§0 pkt 5): pole rezerwowe (`bay_kind`) albo wolne (bez odcinka na
   *  zacisku) — ta sama para predykatów co pola stacji (`ui/shared/rodzajStacji.ts`). */
  readonly reserve?: 'rezerwowe' | 'wolne';
  /** Rola pola dla gramatyki stosu aparatów — z ENM `Bay.bay_role`. */
  readonly fieldRole: BayFieldRole;
  /** Rola pola dla tła i legendy (`gpz.bay.panel`) — z ENM `Bay.bay_role`, bez zlewania
   *  ról (patrz `RolaPolaGpz`). */
  readonly rolaPola: RolaPolaGpz;
  /** Karta GPZ-PARYTET cz. 3: rodzaj źródła pola źródłowego (`fieldRole = 'SOURCE'`) z
   *  przyłączonych wytwórców (`v2/model/polaZModelu.ts rolaPolaZrodlowego`, ta sama funkcja
   *  co pola źródłowe stacji); nierozstrzygnięty = `DER_UNKNOWN`. Brak dla innych ról. */
  readonly rolaZrodla?: RolaPolaZrodlowego;
  /** UX-04/POLE-BKR-MODEL: bateria kondensatorów na zacisku końca toru pola
   *  (`v2/model/bateriaPola.ts bateriaNaKoncuToruPola`, ta sama funkcja co pola stacji);
   *  kompozycja dokłada glif `capacitorBank` na końcu stosu. Brak = pole bez baterii. */
  readonly bateria?: BateriaPolaView;
  /** Stan łączników z modelu (`v2/model/stanAparatowPola.ts`; brak danej = nieznany). */
  readonly cbState?: SwitchState;
  readonly dsState?: SwitchState;
  readonly esState?: 'closed' | 'open' | 'absent' | 'unknown' | 'bad';
  /** Oznaczenia Q (IEC 81346). */
  readonly qDesignations: {
    readonly cb?: string;
    readonly dsBus?: string;
    readonly dsLin?: string;
    readonly es?: string;
    readonly ct?: string;
  };
  /** Plakietki funkcji automatyki pola z `Bay.protection_codes` (patrz `GpzStatusFlag`). */
  readonly statusFlags: readonly GpzStatusFlag[];
  /** Kody funkcji zabezpieczeniowych ANSI/IEC (`Bay.protection_codes`) — kompozycja
   *  pokazuje WYŁĄCZNIE dostarczone kody (brak → brak oznaczenia). */
  readonly protectionCodes?: readonly string[];
  /** Uporządkowana lista aparatów pola z modelu (`Bay.primary_devices`, a gdy pola nie ma —
   *  gałęzie łączeniowe w `equipment_refs`; `projectBayPrimaryDevices`) — `undefined` gdy
   *  model nie niesie żadnego rekordu aparatu. Kompozycja buduje z niej stos pola
   *  (`compose/gpz.ts specyfikacjaPolaGpz`); bez niej — sylwetka braku danych. */
  readonly primaryDevices?: readonly BayPrimaryDeviceView[];
  /** Adnotacja zabezpieczeń pola — `Bay.protection_ref` rozwiązany na
   *  `ProtectionAssignment`. Kody tu mają pierwszeństwo nad `protectionCodes`. */
  readonly protectionMarking?: BayProtectionMarkingView;
  /** Adnotacje przekładni CT pola (`Measurement.rating`). */
  readonly ctRatingAnnotations?: readonly CtRatingAnnotationView[];
  /** Adnotacje montażu VT pola (`Measurement.vt_mounting`). */
  readonly vtMountingAnnotations?: readonly VtMountingAnnotationView[];
}

export type BayFieldRole =
  | 'LINE_OUT'
  | 'LINE_IN'
  | 'LINE_BRANCH'
  | 'TRANSFORMER'
  | 'COUPLER'
  | 'MEASUREMENT'
  /** Pole źródłowe (`Bay.bay_role = 'OZE'`): gramatyka pola kablowego + glif źródła. */
  | 'SOURCE'
  /** Pole baterii kondensatorów (`Bay.bay_role = 'BKR'`): stos aparatów z rekordów i glif
   *  baterii na końcu toru pola; NIE jest polem kablowym sieci (bateria stoi w rozdzielni,
   *  z pola nie wychodzi magistrala — `czyPoleKabloweGpz`). */
  | 'CAPACITOR_BANK';

/**
 * Karta GPZ-PARYTET cz. 3: pole KABLOWE rozdzielnicy GPZ — pole, z którego wychodzi kabel
 * sieci (liniowe zasilające/odpływowe/odgałęźne i źródłowe). Jeden predykat dla wyboru pola
 * magistrali i przydziału feederów (`v3/scene/buildScene.ts`): pole źródłowe zachowuje
 * wyjście kablowe, które miało jako dawne pole liniowe odpływowe.
 */
export function czyPoleKabloweGpz(role: BayFieldRole): boolean {
  return role === 'LINE_IN' || role === 'LINE_OUT' || role === 'LINE_BRANCH' || role === 'SOURCE';
}

/** Stan łącznika z modelu (`v2/model/stanAparatowPola.ts`): `bad` — rekord „awaria” (kafel błędny
 *  konwencji `STATE_COLOR`, rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC). */
export type SwitchState = 'closed' | 'open' | 'unknown' | 'bad';

export interface CanonicalGpzCoupler {
  /** `Branch.ref_id` gałęzi `bus_coupler` (GEOMETRIA-STACJI: jedno źródło sprzęgła). */
  readonly couplerId: string;
  readonly leftSectionId: string;
  readonly rightSectionId: string;
  readonly designation: string;
  /** Stan z `Branch.status` gałęzi sprzęgła (brak = nieznany). */
  readonly closedState: SwitchState;
  /** Rodzaj łącznika z danych (`v2/model/sprzeglaSekcji.ts`); brak = łącznik. */
  readonly rodzaj?: 'wylacznik' | 'lacznik';
  /** Pole sprzęgła wskazujące gałąź (`null`/brak = brak rekordu pola). */
  readonly bayRef?: string | null;
}

export interface CanonicalGpzTransformer {
  readonly transformerRef: string;
  readonly designation: string; // "TR1", "TR2"
  readonly snMva: number;
  readonly uhvKv: number;
  readonly ulvKv: number;
  /** Grupa połączeń z modelu (`Transformer.vector_group`, np. „Dyn11") — źródło
   *  oznaczenia uzwojeń w glifie (`gpz.transformer.winding.hv/.sn`). `null` = brak danej. */
  readonly vectorGroup: string | null;
  /** Napięcie zwarcia uk% i straty obciążeniowe Pk [kW] z ENM. */
  readonly ukPercent?: number | null;
  readonly pkKw?: number | null;
  /** Sekcja SN, której szyną jest szyna strony SN transformatora w modelu
   *  (`Transformer.lv_bus_ref`); `null` = szyna SN transformatora nie jest szyną
   *  żadnej sekcji GPZ (wieża bez zejścia do szyny SN i wpis braku danych). */
  readonly lvSectionId: string | null;
  /** Ref szyny WN (110 kV). */
  readonly hvBusRef?: string | null;
  /** Adnotacja regulacji zaczepów z `Transformer.tap_changer` (brak = bez regulacji). */
  readonly oltc?: OltcGlyphAnnotation | null;
  /** Karta GPZ-PARYTET cz. 3: pole TR sekcji SN, którego JEDYNYM transformatorem jest ten
   *  transformator (`v2/model/polaZModelu.ts jedynyTransformatorPola`). Pole rysuje się
   *  WYŁĄCZNIE jako pole TR toru transformatora (stan łączników, tożsamość pola) — nie drugi
   *  raz w sekcji. `null` = transformator bez pola TR w modelu (pole toru bez danych). */
  readonly poleTr: CanonicalGpzBay | null;
  /** To samo dla pola WN transformatora (pole TR sekcji WN wskazujące transformator). */
  readonly poleWn: CanonicalGpzBay | null;
}

export interface CanonicalGpzHvSection {
  readonly sectionId: string;
  readonly order: number;
  /** Napięcie szyny WN (kV) z `Bus.voltage_kv`; `null` = brak danej w modelu. */
  readonly busVoltageKv: number | null;
  readonly label: string;
  readonly bays: readonly CanonicalGpzBay[];
}

/**
 * Źródło systemowe (sieć zasilająca GPZ) wywiedzione WYŁĄCZNIE z relacji pierwszoklasowych
 * ENM (`Source` na szynie GPZ z danymi zwarciowymi), używane gdy `gpz_hv_sections` jest
 * puste — zarówno przy równoważniku na szynie WN, jak i na szynach SN (karta GPZ-MODEL).
 */
export interface CanonicalGpzHvSystemSource {
  readonly sourceRef: string;
  /** `Source.meta.source_id` (preferowane) albo `Source.name` — nigdy wartość zastępcza. */
  readonly name: string;
  readonly sk3Mva: number | null;
  readonly ik3Ka: number | null;
  /** Dane scenariusza MIN — `null` = OSD ich nie podał. */
  readonly sk3MinMva: number | null;
  readonly ik3MinKa: number | null;
  /** Napięcie zadane szyny bilansującej (`Source.u_set_pu`) — `null` = brak danej. */
  readonly uSetPu: number | null;
  /** Napięcie SZYNY ŹRÓDŁA (`Bus.voltage_kv` szyny z `Source.bus_ref`). */
  readonly voltageKv: number | null;
  /** `true` ⇔ `Source.bus_ref` to szyna WN GPZ. */
  readonly sourceOnHvBus: boolean;
  /** Napięcie SZYNY WN GPZ (`Bus.voltage_kv` szyny w paśmie WN); `null` = GPZ bez szyny WN
   *  (równoważnik na szynach SN) albo brak danej. */
  readonly hvBusVoltageKv: number | null;
}

export interface CanonicalGpzProps {
  /** Sposób pracy punktu neutralnego sieci SN z `Source.neutral_grounding` źródła GPZ.
   *  `null`/brak = model uziemienia nieokreślony (schemat nic nie rysuje). */
  readonly snNeutralEarthing?: {
    readonly kind: 'resistor' | 'coil' | 'direct' | 'isolated';
    readonly rOhm?: number;
    readonly xOhm?: number;
  } | null;
  readonly id: string;
  /** Nazwa GPZ z ENM `Substation.name`; `null` = model nie niesie nazwy (kompozycja
   *  zgłasza jawny brak `gpz.name.missing`, nie wymyśla nazwy). */
  readonly name: string | null;
  /** Strona WN: szyna 110 kV + pola liniowe WN. Brak → tylko SN. */
  readonly hvSections?: readonly CanonicalGpzHvSection[];
  /** Źródło systemowe WN wywiedzione z relacji pierwszoklasowych, gdy `hvSections` puste. */
  readonly hvSystemSource?: CanonicalGpzHvSystemSource | null;
  /** Kanoniczny ref Bus ENM szyny WN (jedna szyna GPZ w paśmie WN) — `null` gdy brak albo
   *  niejednoznaczność. */
  readonly hvBusRef?: string | null;
  /** Transformatory na osi (T1...Tn). */
  readonly transformers: readonly CanonicalGpzTransformer[];
  /** Strona SN: ≥1 sekcja. */
  readonly sections: readonly CanonicalGpzSection[];
  /** Sprzęgła międzysekcyjne SN. */
  readonly couplers: readonly CanonicalGpzCoupler[];
}
