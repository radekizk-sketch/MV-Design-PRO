/**
 * SLD V2 — GpzSwitchgear public type definitions.
 *
 * Extracted from GpzSwitchgearRenderer.tsx for modularization.
 */

import type { FieldRole } from '../domain/apparatusContracts';
import type { GpzApparatusSelection } from './gpzApparatusSelection';

// =============================================================================
// Public types
// =============================================================================

/**
 * Stan zasilania pola — używany do koloryzacji.
 *
 * `unknown` daje neutralny szary. `de_energized` daje przygaszony szary.
 * `energized` daje zielony (kanon SCADA). `tripped`/`alarm` daje czerwony.
 */
export type GpzBayEnergization = 'energized' | 'deenergized' | 'tripped' | 'unknown';

/** Stan łączeniowy CB/DS w polu — domyślnie closed (kanon SCADA = green). */
export type GpzApparatusSwitchState = 'closed' | 'open' | 'unknown';

/**
 * Stan uziemnika (Earthing Switch — ES).
 *
 * BHP-krytyczny: jego stan determinuje, czy pole jest bezpieczne do prac
 * (PN-EN 62271-102). Operator MUSI widzieć jednoznacznie.
 *
 *  - 'open'    → pole pod napięciem / nieuziemione (normalny stan pracy)
 *  - 'closed'  → pole uziemione (czerwony marker bezpieczeństwa)
 *  - 'unknown' → brak telemetrii ze sterownika (Invariant 9)
 *  - 'absent'  → pole nie ma uziemnika (np. proste RMU bez ES — symbol nie
 *                 renderowany, niemniej dokumentowany w typie)
 */
export type EarthingSwitchState = 'open' | 'closed' | 'unknown' | 'absent';

/**
 * Stan funkcji wtórnej (zabezpieczenia / automatyki) na polu.
 *
 *  - `enabled`   → "Zal." (zielony) — funkcja aktywna w gotowości
 *  - `disabled`  → "Odbl." (szary) — funkcja odblokowana ale nieaktywna
 *  - `restricted`→ "Odst." (czerwony) — odstawiona ręcznie
 *  - `blocked`   → "Zabl." (czerwony bg) — zablokowana logicznie
 */
export type SecondaryFlagState = 'enabled' | 'disabled' | 'restricted' | 'blocked';

/**
 * Architektura wtórna pola — flagi zabezpieczeń i automatyk.
 *
 * Każde pole SCADA pokazuje stos badge'y dla aktywnych funkcji wtórnych:
 *   SPZ  — Samoczynne Ponowne Załączenie (auto-reclosure)
 *   SCO  — Samoczynne Częstotliwościowe Odciążanie
 *   OWG  — Ochrona Wstecznie Generatora / Overcurrent Generator
 *   NZ   — Niskonapięciowe Zabezpieczenie
 *   LRW  — Lokalna Rezerwa Wyłącznikowa
 *   ARN  — Automatyczna Regulacja Napięcia
 *   BKR  — Blokada wyłącznika (transformatorowy)
 *   STYCZ.— Stycznik (contactor)
 *   AWSC — Automatyczne Wyłączenie Sieci Cieplnej / dedykowana automatyka
 *   ZS   — Zwarcie Szynowe
 *   SZR  — Samoczynne Załączenie Rezerwy
 */
export interface BaySecondaryFlags {
  readonly spz?: SecondaryFlagState;
  readonly sco?: SecondaryFlagState;
  readonly owg?: SecondaryFlagState;
  readonly nz?: SecondaryFlagState;
  readonly lrw?: SecondaryFlagState;
  readonly arn?: SecondaryFlagState;
  readonly bkr?: SecondaryFlagState;
  readonly stycz?: SecondaryFlagState;
  readonly awsc?: SecondaryFlagState;
  readonly zs?: SecondaryFlagState;
  readonly szr?: SecondaryFlagState;
}

/**
 * Pomiary pola — wyświetlane w panelu pomiarowym pod numerem pola.
 *
 * Wszystkie wartości są opcjonalne — renderer pokazuje tylko te dostarczone.
 * Kanoniczna kolejność wierszy w panelu (top → bottom):
 *   napięcia fazowe (U1/U2/U3) → międzyfazowe (U12/U23/U31) → zerowe (U0)
 *   → częstotliwość (f) → moce (P/Q/Idł) → prądy (I1/I2/I3).
 *
 * Jednostki:
 *   u1..3, u12..31, u0 — kV (napięcia)
 *   f                  — Hz (częstotliwość)
 *   p, q               — MW / Mvar
 *   i1..3              — A
 *   idl                — kA (prąd doziemny)
 *
 * Typy bayów SCADA (pełna gama referencyjna):
 *   - Outgoing line:  P, Q, I1-3
 *   - PN (voltage):   U1-3, U12-31, U0, f
 *   - TR feeder:      P, Q, I1-3 + opcjonalnie U
 *   - Wszystkie:      f opcjonalna
 */
export interface BayMeasurements {
  readonly p?: number;
  readonly q?: number;
  readonly i1?: number;
  readonly i2?: number;
  readonly i3?: number;
  readonly idl?: number;
  readonly f?: number;
  readonly u1?: number;
  readonly u2?: number;
  readonly u3?: number;
  readonly u12?: number;
  readonly u23?: number;
  readonly u31?: number;
  readonly u0?: number;
}

/** Stan markera zwarcia doziemnego (cyan circle u góry pola). */
export type GroundFaultMarkerState = 'normal' | 'detected' | 'fault';

export interface GpzBayDescriptor {
  readonly bayRef: string;
  readonly fieldRole: FieldRole;
  readonly designation: string;
  /** Numer pola (np. "2", "10", "23/1"). Wyświetlany pod kolumną. */
  readonly bayNumber?: string;
  /** Krótka nazwa odpływu (np. "SADY", "OKRĘŻNA"). Wyświetlana w nagłówku kolumny. */
  readonly feederName?: string;
  readonly hasMissingRequiredDevice: boolean;
  readonly energization?: GpzBayEnergization;
  readonly cbState?: GpzApparatusSwitchState;
  readonly dsState?: GpzApparatusSwitchState;
  /**
   * Architektura wtórna pola — stos badge'y SPZ/SCO/OWG/NZ/LRW/ARN/...
   * Renderowane tylko jeśli `secondary` jest dostarczone.
   */
  readonly secondary?: BaySecondaryFlags;
  /** Przekładnia CT, np. "200/5", "300/5". Wyświetlana obok markera CT. */
  readonly ctRatio?: string;
  /** Czy renderować przycisk KAS (kasowanie sygnalizacji) pod numerem pola. */
  readonly hasKasButton?: boolean;
  /** Marker zwarcia doziemnego (cyan circle u góry pola). */
  readonly groundFault?: GroundFaultMarkerState;
  /** Czy pole jest w stanie manipulacji (yellow background highlight). */
  readonly inManipulation?: boolean;
  /** Pomiary pola — renderowane w panelu pod numerem pola. */
  readonly measurements?: BayMeasurements;
  /**
   * Kody funkcji zabezpieczeniowych ANSI/IEC (np. ['87T','51','50','51N',
   * 'Buchholz','temp','ciśnienie'] dla pola TR). Renderowane jako kompaktowy
   * stos mono badge'y na polu — ten sam mechanizm string[] co OzeField.
   * protection_codes. Renderer pokazuje WYŁĄCZNIE dostarczone kody (brak →
   * brak badge'y; data-honest).
   */
  readonly protectionCodes?: readonly string[];
  /**
   * Numer P-* identyfikatora aparatu (np. "P133", "C434", "PE32").
   * Wyświetlany jako mała przygaszona etykieta pod LED-em KAS. Wymaga
   * `hasKasButton: true` żeby był widoczny.
   */
  readonly pNumber?: string;
  /**
   * Stan uziemnika pola (Earthing Switch, ES). Renderowany jako boczna
   * gałąź z trójkątem ziemi (kanon IEC 60617 7-13-05). 'absent' nie
   * renderuje symbolu. Brak pola → fallback 'absent' (backward compat).
   *
   * BHP-krytyczne: closed → czerwony marker bezpieczeństwa
   * (`COLOR_DEVICE_OPEN`), open → szary muted, unknown → szary muted z
   * znakiem zapytania.
   */
  readonly esState?: EarthingSwitchState;
  /**
   * Oznaczenia aparatów wg IEC 81346-2 — Q0/Q1/Q9 dla łączników, T1 dla
   * trafa. Renderowane jako małe etykiety obok każdego symbolu w polu oraz
   * wypełniają `GpzApparatusSelection.designation` przy interakcji.
   * Klucze:
   *  - `cb`    → wyłącznik (Q0 typowo)
   *  - `ds`    → odłącznik liniowy (Q9 typowo) — etykieta Q (legacy)
   *  - `dsLin` → odłącznik liniowy (Q9 typowo) — alias kanonu selekcji
   *  - `dsBus` → odłącznik szynowy (Q1 typowo)
   *  - `es`    → uziemnik (Q8 typowo)
   *  - `ct`    → przekładnik prądowy (T1)
   *
   * Brak pola → renderer pomija etykietę.
   */
  readonly qDesignations?: {
    readonly cb?: string;
    readonly ds?: string;
    readonly dsLin?: string;
    readonly dsBus?: string;
    readonly es?: string;
    readonly ct?: string;
  };
  /**
   * Wychodzące połączenie pola liniowego (kanoniczne dla bays
   * `LINE_OUT`/`GPZ_LINE_BAY`/`LINE_BRANCH`). Definiuje cel odcinka wychodzącego
   * z głowicy kablowej pola SN.
   *
   * Renderer w trybie two-bus rozszerza kolumnę pola: pionowy odcinek z
   * głowicy kablowej do osobnego korytarza wyjściowego, oznaczenie celu
   * (np. "→ ST-001 SADY") i parametry odcinka, gdy ENM je dostarcza.
   *
   * Jeśli pole nie jest pole liniowe (np. TRANSFORMER, MEASUREMENT) — feeder
   * nie powinien być definiowany.
   */
  readonly outgoingFeeder?: {
    /** Etykieta celu (np. "→ Sady ST-001", "→ NMO-12"). */
    readonly destination: string;
    /** Czy feeder pod napięciem (driver kolorystyki). */
    readonly energized?: boolean;
    /** Numer odpływu / linii (np. "L-203"). Renderowany jako sub-label. */
    readonly feederNumber?: string;
    /** Rodzina odcinka z ENM, używana tylko jako awaryjny opis przy braku katalogu. */
    readonly segmentTypeLabel?: string;
    /** Długość odcinka z ENM, np. "500 m"; brak danych nie jest zerem. */
    readonly segmentLengthLabel?: string;
    /** Typ katalogowy kabla/linii, np. "XRUHAKXS 120/25". */
    readonly catalogLabel?: string;
  };
}

/**
 * Kierunek przepływu mocy przez transformator (kanon SCADA — strzałka pod TR).
 *   - `down` → moc płynie z 110 kV w dół do SN (nominalny tryb GPZ)
 *   - `up`   → moc płynie z SN do 110 kV (eksport, np. duży układ OZE)
 *   - `none` → brak strzałki (brak danych lub TR wyłączony)
 */
export type TransformerPowerFlow = 'down' | 'up' | 'none';

/**
 * Pomiary i opisy stanu transformatora wyświetlane przy symbolu TR.
 *
 * Wszystkie pola opcjonalne — renderer pokazuje wyłącznie dostarczone wartości.
 * Kanon SCADA (Tauron / Energa / PSE):
 *   - `oilTemperatureC` → temp. oleju w °C (np. 47.2)
 *   - `uarnKv`          → napięcie regulacyjne odczepu (np. 15.4)
 *   - `nzacz`           → numer zakresu odczepu (np. "9/19" lub "NZACZ 9")
 *   - `flow`            → kierunek przepływu mocy
 *   - `apparentMva`     → moc pozorna w MVA (np. 16.0)
 */
export interface TransformerMeasurements {
  readonly oilTemperatureC?: number;
  readonly uarnKv?: number;
  readonly nzacz?: string;
  readonly flow?: TransformerPowerFlow;
  readonly apparentMva?: number;
}

export interface GpzSectionDescriptor {
  readonly sectionId: string;
  readonly order: number;
  readonly name: string;
  readonly busVoltageKv: number;
  readonly bays: readonly GpzBayDescriptor[];
  /** Pełna etykieta sekcji wyświetlana po lewej (np. "S1"). */
  readonly sectionLabel?: string;
}

export interface GpzCouplerDescriptor {
  readonly couplerId: string;
  readonly leftSectionId: string;
  readonly rightSectionId: string;
  readonly designation: string;
  /**
   * Stan sprzęgła (kanon SCADA).
   * - `true`/'closed'  — pod napięciem (zielony fill).
   * - `false`/'open'   — rozcięcie pierścienia (cyan hollow + przerwa CB).
   * - `'unknown'`      — brak telemetrii (Invariant 9: brak danych ≠ default).
   *
   * Backwards compat: boolean → mapowany na 'closed'/'open'.
   */
  readonly closed: boolean | 'closed' | 'open' | 'unknown';
  /** Numer pola lewej nogi sprzęgła (np. "15"). */
  readonly bayNumberLeft?: string;
  /** Numer pola prawej nogi sprzęgła (np. "17"). */
  readonly bayNumberRight?: string;
  /**
   * Architektura wtórna sprzęgła — najczęściej SZR (Samoczynne Załączenie
   * Rezerwy), opcjonalnie SPZ. Renderowane jako stos badge'y.
   */
  readonly secondary?: BaySecondaryFlags;
  /** Czy renderować przycisk "KAS SP" (kasowanie sygnalizacji sprzęgła poprzecznego). */
  readonly hasKasSp?: boolean;
  /** Czy renderować przycisk "KAS SZR" (kasowanie sygnalizacji SZR). */
  readonly hasKasSzr?: boolean;
  /** Prąd pomiarowy sprzęgła w A — wyświetlany pod CB jako "I  X". */
  readonly currentI?: number;
  /** Czy sprzęgło jest w stanie manipulacji (yellow background). */
  readonly inManipulation?: boolean;
}

export interface GpzSwitchgearRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly voltageHighKv: number;
  /**
   * Czy `voltageHighKv` pochodzi z ENM danych (transformer.uhv_kv / bus).
   * `false` = adapter zwrócił null, używamy fallback display-only — renderer
   * pokazuje "?" zamiast wartości (Invariant 9: brak danych ≠ default).
   * Domyślnie `true` (backwards compat dla testów które przekazują typowe
   * `voltageHighKv: 110`).
   */
  readonly voltageHighKvKnown?: boolean;
  readonly voltageLowKv: number;
  /**
   * Sekcje strony SN (np. 15 kV) — main bus rendererowany tradycyjnie u dołu
   * w trybie two-bus albo w środku w trybie single-bus.
   */
  readonly sections: readonly GpzSectionDescriptor[];
  readonly couplers: readonly GpzCouplerDescriptor[];
  /**
   * Sekcje strony 110 kV (HV bus). Obecność włącza tryb **two-bus**:
   *   ── 110 kV bus ── (HV bays poniżej)
   *           |  TR1 / TR2 / ...
   *   ── 15 kV bus ── (LV bays poniżej)
   *
   * Pusta tablica lub brak → tryb single-bus (zachowanie sprzed Phase 0A
   * refinement two-bus).
   */
  readonly hvSections?: readonly GpzSectionDescriptor[];
  readonly hvCouplers?: readonly GpzCouplerDescriptor[];
  readonly transformerCount?: number;
  /**
   * Pomiary i opisy stanu transformatorów wyświetlane przy symbolach TR (Y/Δ).
   * Jeśli podano `n` elementów, każdy element odnosi się do TR o tym samym
   * indeksie (TR1 → index 0, TR2 → index 1). Brak elementu → brak panelu
   * pomiarowego dla danego TR.
   */
  readonly transformerMeasurements?: readonly TransformerMeasurements[];
  /**
   * Refy transformatorów wyrównane indeksowo do kolumn TR (TR1 → index 0,
   * TR2 → index 1). Gdy podane, symbol TR o danym indeksie staje się
   * klikalny (`onClickTransformer(ref)`). Brak refu → TR nieklikalny
   * (brak crashu).
   */
  readonly transformerRefs?: readonly string[];
  /**
   * Tekst akcji w pasku tytułu (kanon SCADA: "Kasowanie sygnalizacji
   * zabezpieczeń"). Renderowany po prawej stronie pod napięciem.
   */
  readonly titleBarAction?: string;
  /**
   * Etykieta zbiorcza strefy wyprowadzeń SN. Pusty string ukrywa opis zbiorczy,
   * ale nie ukrywa samych korytarzy z głowic pól.
   */
  readonly fieldTrunkLabel?: string;
  readonly selected?: boolean;
  /* =====================================================================
     Interakcja — kontrakt lustrzany do GpzCanonicalRenderer.
     Aparaty emitują kanoniczne `GpzApparatusSelection` z identycznymi
     stringami `${bayRef}#${kind}`, dzięki czemu renderer może stać się
     drop-in zamiennikiem w SldCanvasV2 bez utraty detail-drawer / menu.
     ===================================================================== */
  /** Klik w cały blok GPZ. */
  readonly onClick?: (id: string) => void;
  /** Klik w szynę/etykietę sekcji. */
  readonly onClickSection?: (sectionId: string) => void;
  /** Klik w kolumnę pola. */
  readonly onClickBay?: (bayRef: string) => void;
  /** Dwuklik w kolumnę pola (np. otwarcie detail-drawer pola). */
  readonly onDoubleClickBay?: (bayRef: string) => void;
  /** Menu kontekstowe pola (prawy klik) z koordynatami kursora. */
  readonly onContextMenuBay?: (bayRef: string, evt: { clientX: number; clientY: number }) => void;
  /** Menu kontekstowe sekcji (prawy klik) z koordynatami kursora. */
  readonly onContextMenuSection?: (sectionId: string, evt: { clientX: number; clientY: number }) => void;
  /** Klik w aparat pola — zwraca pełną selekcję (zastępuje onClickCb/Ds/Es). */
  readonly onClickApparatus?: (selection: GpzApparatusSelection) => void;
  /** Menu kontekstowe aparatu pola (prawy klik) z selekcją + koordynatami. */
  readonly onContextMenuApparatus?: (
    selection: GpzApparatusSelection,
    evt: { clientX: number; clientY: number },
  ) => void;
  /** Klik w sprzęgło (CB sprzęgła) — operator otwiera/zamyka. */
  readonly onClickCoupler?: (couplerId: string) => void;
  /** Klik w symbol transformatora — wymaga `transformerRefs` index-aligned. */
  readonly onClickTransformer?: (transformerRef: string) => void;
  /** Kasowanie sygnalizacji (reset) — kanon header/KAS. */
  readonly onResetSignals?: () => void;
  /** Klik w przycisk KAS — kasowanie sygnalizacji zabezpieczeń pola. */
  readonly onClickKas?: (bayRef: string) => void;
}
