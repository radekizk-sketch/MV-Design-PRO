/**
 * SldCommandService — facade dla menu kontekstowego + toast feedback (PR-13).
 *
 * Brief 1 §12 + brief 2 §17 pkt 10.
 * Dostarcza:
 *   - rejestr menu per typ obiektu (SldMenuRegistry)
 *   - publish toast events (Polish messages)
 *   - integrację z BuildSequence (8 komend) + HistoryStore (undo/redo)
 */

export type SldElementKindForMenu =
  | 'background'
  | 'gpz'
  | 'section'
  | 'bay'
  | 'apparatus'
  | 'cable_segment_sn'
  | 'overhead_line_sn'
  | 'station'
  | 'zksn'
  | 'branch_pole'
  | 'der_pv'
  | 'der_bess'
  | 'der_fw'
  | 'der';

/**
 * Kanon menu kontekstowego SLD (`docs/v12xx/SLD_CAD_ENGINE_V12.md` § „Kanoniczne menu
 * kontekstowe", rozstrzygnięcie V12K-351): sekcje mają STAŁĄ kolejność, a „Usuń" jest
 * zawsze ostatnia — operacja destrukcyjna nie miesza się z edycją i analizą. Kanon wiąże
 * TREŚĆ żywego rejestru `SLD_MENU_REGISTRY` (jedynej ścieżki menu: rejestr →
 * `SldContextMenuController` → `useSldActionExecutor`), nie nazwę pliku. Kolejność pozycji
 * w rejestrze JEST kolejnością na ekranie — nie ma sortowania w locie, więc test kanonu
 * (`sld/v2/command/__tests__/kanonMenuKontekstowego.test.ts`) czyta dokładnie to, co widzi
 * projektant.
 */
export const SEKCJE_MENU_SLD = [
  'Otwórz',
  'Edytuj',
  'Dodaj',
  'Analizuj',
  'Wyniki',
  'Uzasadnienie',
  'Raport',
  'Operacje',
  'Usuń',
] as const;

export type SekcjaMenuSld = (typeof SEKCJE_MENU_SLD)[number];

export interface SldMenuAction {
  readonly id: string;
  readonly labelPl: string;
  readonly section: SekcjaMenuSld;
  readonly disabled?: boolean;
  readonly disabledReasonPl?: string;
}

/** W5-C: pozycje stanu łącznika — JEDNA lista dla menu pola i aparatu. */
const POZYCJE_STANU_LACZNIKA: readonly SldMenuAction[] = [
  { id: 'open-switch', labelPl: 'Otwórz łącznik', section: 'Operacje' },
  { id: 'close-switch', labelPl: 'Zamknij łącznik', section: 'Operacje' },
  { id: 'set-normal-open-point', labelPl: 'Ustaw punkt normalnie otwarty', section: 'Operacje' },
];

/**
 * W5-C: stan łącznika wskazanego przez obiekt menu (`ui/shared/stanLacznika.ts::
 * lacznikTematu`) — ten sam resolver wybiera łącznik dla wykonawcy akcji (predykaty
 * parami). `powodBrakuPl` = obiekt bez jednego łącznika (pozycje nieaktywne z powodem).
 */
export type StanLacznikaMenu =
  | {
      readonly status: 'open' | 'closed';
      readonly maPozycjeNormalna: boolean;
      readonly jestPunktemPodzialu: boolean;
      readonly powodBrakuPl?: undefined;
    }
  | { readonly powodBrakuPl: string };

/** Powód blokady pozycji stanu łącznika; `null` = pozycja dostępna. */
export function powodBlokadyStanuLacznika(
  actionId: string,
  lacznik: StanLacznikaMenu,
): string | null {
  if (lacznik.powodBrakuPl !== undefined) return lacznik.powodBrakuPl;
  if (actionId === 'open-switch' && lacznik.status === 'open') return 'Łącznik jest już otwarty.';
  if (actionId === 'close-switch' && lacznik.status === 'closed') return 'Łącznik jest już zamknięty.';
  if (actionId === 'set-normal-open-point') {
    if (!lacznik.maPozycjeNormalna) {
      return 'Bezpiecznik nie ma pozycji normalnej — punktem podziału jest wyłącznik, rozłącznik, odłącznik albo sprzęgło.';
    }
    if (lacznik.jestPunktemPodzialu) return 'Łącznik jest już punktem normalnie otwartym.';
  }
  return null;
}

/**
 * V12K-351: pozycje wspólne dla wszystkich rodzajów źródła OZE (PV, BESS, farma wiatrowa,
 * generator bez rozpoznanego podtypu). Żadna nie zależy od podtypu — każda ma realny cel
 * w wykonawcy (`shared/sldActionExecutor.ts`):
 *  - `edit-source-module` — kreator „Edycja parametrów elementu" (operacja
 *    `update_element_parameters`, dane modułu wytwórczego NC RfG generatora);
 *  - `show-ncrfg` — macierz wymogów NC RfG (zakładka „ncrfg" warsztatu Wyników);
 *  - `show-results` — zakładka „Rozpływ" warsztatu Wyników z kontekstem elementu;
 *  - `show-sc-contributions` — zakładka „Zwarcia" warsztatu Wyników (wkłady źródeł
 *    do prądu zwarciowego w każdym punkcie zwarcia);
 *  - `show-rationale` — dowody obliczeń (E-36).
 */
const POZYCJE_ZRODLA_EDYCJA: readonly SldMenuAction[] = [
  { id: 'edit-source-module', labelPl: 'Edytuj dane modułu wytwórczego', section: 'Edytuj' },
];
const POZYCJE_ZRODLA_OCENA: readonly SldMenuAction[] = [
  { id: 'show-ncrfg', labelPl: 'Pokaż zgodność przyłączeniową', section: 'Analizuj' },
];
const POZYCJE_ZRODLA_WYNIKI: readonly SldMenuAction[] = [
  { id: 'show-results', labelPl: 'Pokaż wyniki źródła OZE', section: 'Wyniki' },
  { id: 'show-sc-contributions', labelPl: 'Pokaż wkłady zwarciowe źródeł', section: 'Wyniki' },
  { id: 'show-rationale', labelPl: 'Pokaż uzasadnienie inżynierskie', section: 'Uzasadnienie' },
];

export const SLD_MENU_REGISTRY: Readonly<Record<SldElementKindForMenu, readonly SldMenuAction[]>> = {
  background: [
    { id: 'open-catalogs', labelPl: 'Otwórz katalogi techniczne', section: 'Otwórz' },
    { id: 'insert-gpz', labelPl: 'Wstaw główny punkt zasilania', section: 'Dodaj' },
    { id: 'show-readiness', labelPl: 'Pokaż kontrolę konfiguracji', section: 'Analizuj' },
  ],
  gpz: [
    // Karta W2-B: dane zwarciowe źródła mieszkają w karcie „Strona 110 kV" konfiguratora GPZ.
    { id: 'show-sc-source', labelPl: 'Pokaż dane zwarciowe źródła', section: 'Otwórz' },
    { id: 'open-source', labelPl: 'Edytuj główny punkt zasilania', section: 'Edytuj' },
    { id: 'add-section', labelPl: 'Dodaj sekcję rozdzielni SN', section: 'Dodaj' },
    /* Karta S9-5 (audyt B-4 „dalsza budowa nie ma ścieżki na kanwie"): PIERWSZE
     * ogniwo budowy ciągu SN. Źródło GPZ jest jedynym obiektem sieci pustej —
     * bez tych dwóch pozycji projektant nie mógł ruszyć magistrali z rysunku
     * (pomiar: menu GPZ miało wyłącznie akcje widoku/edycji). Kontekst operacji
     * jest REALNY i zmierzony: `resolveContinueTrunkOperationContext` dla
     * `elementType==='Source'` zwraca szynę SN GPZ jako `from_bus_ref` i
     * `is_first_trunk_segment=true`; `resolveBranchStartOperationContext` — tę
     * samą szynę jako `from_bus_ref` odgałęzienia. */
    { id: 'continue-trunk', labelPl: 'Wyprowadź ciąg główny SN', section: 'Dodaj' },
    { id: 'start-branch', labelPl: 'Rozpocznij odgałęzienie', section: 'Dodaj' },
  ],
  section: [
    // Karta W2-B: etykieta była identyczna z 'show-sc-source' menu GPZ mimo innego
    // przedmiotu akcji (sekcja, nie źródło) — naprawione przy wpięciu realnej nawigacji.
    { id: 'show-sc-data', labelPl: 'Pokaż dane zwarciowe sekcji', section: 'Otwórz' },
    { id: 'add-bay', labelPl: 'Dodaj pole SN', section: 'Dodaj' },
    /* Karta S9-5: szyna sekcji jest punktem, z którego ciąg i odgałęzienie
     * wychodzą fizycznie — `elementType==='Bus'` jest obsługiwany przez oba
     * resolvery kontekstu (`continue_trunk_segment_sn`,
     * `start_branch_segment_sn`), więc pozycje mają realne pokrycie. */
    { id: 'continue-trunk', labelPl: 'Wyprowadź ciąg główny SN', section: 'Dodaj' },
    { id: 'start-branch', labelPl: 'Rozpocznij odgałęzienie', section: 'Dodaj' },
    /* K5-A (H-4): wejście do kreatora baterii kondensatorów SN — realna
     * operacja add_shunt_compensator_sn (bus_ref = kliknięta szyna). */
    { id: 'add-compensator', labelPl: 'Dodaj kompensator mocy biernej', section: 'Dodaj' },
    { id: 'show-readiness', labelPl: 'Pokaż kontrolę konfiguracji', section: 'Analizuj' },
  ],
  bay: [
    { id: 'open-bay', labelPl: 'Otwórz okno pola', section: 'Otwórz' },
    { id: 'show-measurements', labelPl: 'Pokaż pomiary pola', section: 'Otwórz' },
    { id: 'configure-equipment', labelPl: 'Skonfiguruj aparaturę', section: 'Edytuj' },
    { id: 'configure-cts-vts', labelPl: 'Skonfiguruj przekładniki', section: 'Edytuj' },
    { id: 'configure-protection', labelPl: 'Skonfiguruj zabezpieczenia', section: 'Edytuj' },
    { id: 'start-branch', labelPl: 'Rozpocznij odgałęzienie', section: 'Dodaj' },
    /* K5-A (H-4): ogranicznik przepięć na field_spec pola — realna operacja
     * add_surge_arrester_sn (field_ref = kliknięte pole). */
    { id: 'add-arrester', labelPl: 'Dodaj ogranicznik przepięć', section: 'Dodaj' },
    /* Phase 0B (operator-grade SLD plan v2): Append-on-Endpoint workflow */
    { id: 'append-station-on-endpoint', labelPl: 'Zakończ ciąg w stacji', section: 'Dodaj' },
    { id: 'show-results', labelPl: 'Pokaż wyniki pola', section: 'Wyniki' },
    { id: 'show-rationale', labelPl: 'Pokaż uzasadnienie inżynierskie', section: 'Uzasadnienie' },
    /* W5-C: stan łącznika pola — operacje kanoniczne `open_switch`/`close_switch`
     * i `set_normal_open_point` na JEDYNYM łączniku pola (`lacznikTematu`). Dawna
     * pozycja „Zmień stan łącznika" otwierała kreator punktu podziału z refem POLA jako
     * łącznikiem — backend zawsze odmawiał (martwa pozycja pod mylącą etykietą). */
    ...POZYCJE_STANU_LACZNIKA,
    { id: 'delete-bay', labelPl: 'Usuń pole', section: 'Usuń' },
  ],
  apparatus: [
    { id: 'open-bay', labelPl: 'Otwórz kartę pola', section: 'Otwórz' },
    { id: 'configure-equipment', labelPl: 'Skonfiguruj aparat', section: 'Edytuj' },
    { id: 'configure-cts-vts', labelPl: 'Skonfiguruj przekładniki', section: 'Edytuj' },
    { id: 'configure-protection', labelPl: 'Skonfiguruj zabezpieczenia', section: 'Edytuj' },
    { id: 'extend-trunk', labelPl: 'Wyprowadź ciąg główny z głowicy', section: 'Dodaj' },
    /* K5-A (H-4): aparat sceny niesie ref pola macierzystego (bayRef) —
     * ta sama operacja add_surge_arrester_sn co z menu pola. */
    { id: 'add-arrester', labelPl: 'Dodaj ogranicznik przepięć', section: 'Dodaj' },
    { id: 'show-results', labelPl: 'Pokaż wyniki aparatu', section: 'Wyniki' },
    { id: 'show-rationale', labelPl: 'Pokaż uzasadnienie inżynierskie', section: 'Uzasadnienie' },
    /* W5-C: aparat łącznikowy (gałąź `switch`/`breaker`/`disconnector`/`bus_coupler`/
     * `fuse` albo aparat pola) — te same trzy operacje stanu co w menu pola. */
    ...POZYCJE_STANU_LACZNIKA,
  ],
  cable_segment_sn: [
    { id: 'open-segment-card', labelPl: 'Otwórz kartę odcinka', section: 'Otwórz' },
    { id: 'change-catalog', labelPl: 'Zmień katalog kabla', section: 'Edytuj' },
    { id: 'edit-laying', labelPl: 'Edytuj parametry ułożenia', section: 'Edytuj' },
    { id: 'change-family-to-overhead', labelPl: 'Zmień rodzinę na linię napowietrzną SN', section: 'Edytuj' },
    { id: 'continue-trunk-from-endpoint', labelPl: 'Kontynuuj ciąg główny', section: 'Dodaj' },
    { id: 'insert-station', labelPl: 'Zakończ odcinek stacją SN/nN', section: 'Dodaj' },
    { id: 'insert-zksn', labelPl: 'Zakończ odcinek w ZK SN', section: 'Dodaj' },
    { id: 'insert-sectional', labelPl: 'Wstaw łącznik sekcyjny', section: 'Dodaj' },
    /* Karta S9-5: pozycja „Wstaw mufę kablową" USUNIĘTA — obietnica bez
     * dostawcy. `CANONICAL_OPS` backendu nie ma operacji wstawienia mufy, a
     * `Branch.cable_joints` nie ma edytora na żadnym ekranie (pole jest tylko
     * CZYTANE — etykieta „mufa" na rysunku i symbol `jointSleeve`). Zdolność
     * wraca do menu RAZEM z operacją domenową, nie wcześniej. */
    { id: 'show-thermal', labelPl: 'Pokaż obciążalność cieplną', section: 'Analizuj' },
    { id: 'show-results', labelPl: 'Pokaż wyniki odcinka', section: 'Wyniki' },
    { id: 'show-rationale', labelPl: 'Pokaż uzasadnienie inżynierskie', section: 'Uzasadnienie' },
    /* Phase 0C (operator-grade SLD plan v2): świadomy split z preview */
    { id: 'conscious-split-on-segment', labelPl: 'Podziel odcinek (świadomy)', section: 'Operacje' },
    { id: 'delete-segment', labelPl: 'Usuń odcinek', section: 'Usuń' },
  ],
  overhead_line_sn: [
    { id: 'open-segment-card', labelPl: 'Otwórz kartę odcinka', section: 'Otwórz' },
    { id: 'change-catalog', labelPl: 'Zmień katalog przewodu', section: 'Edytuj' },
    { id: 'edit-line', labelPl: 'Edytuj parametry linii', section: 'Edytuj' },
    { id: 'change-family-to-cable', labelPl: 'Zmień rodzinę na kabel SN', section: 'Edytuj' },
    { id: 'continue-trunk-from-endpoint', labelPl: 'Kontynuuj ciąg główny', section: 'Dodaj' },
    { id: 'insert-station', labelPl: 'Zakończ odcinek stacją SN/nN', section: 'Dodaj' },
    { id: 'insert-pole', labelPl: 'Zakończ odcinek słupem rozgałęźnym', section: 'Dodaj' },
    { id: 'insert-sectional', labelPl: 'Wstaw łącznik sekcyjny', section: 'Dodaj' },
    { id: 'show-thermal', labelPl: 'Pokaż obciążalność cieplną', section: 'Analizuj' },
    { id: 'show-results', labelPl: 'Pokaż wyniki odcinka', section: 'Wyniki' },
    { id: 'show-rationale', labelPl: 'Pokaż uzasadnienie inżynierskie', section: 'Uzasadnienie' },
    { id: 'conscious-split-on-segment', labelPl: 'Podziel odcinek (świadomy)', section: 'Operacje' },
    { id: 'delete-segment', labelPl: 'Usuń odcinek', section: 'Usuń' },
  ],
  station: [
    { id: 'open-station-config', labelPl: 'Otwórz konfigurator stacji', section: 'Otwórz' },
    /* V12K-351: karty konfiguratora stacji otwierane WPROST (deep-link `defaultCard`,
     * `ACTION_DEFAULT_CARD` wykonawcy, czytany przez `stationDefaultCard`). Strona nN jest
     * kartą przeglądową (bilans rozdzielnic i odbiorów) — stąd „Pokaż", nie „Edytuj". */
    { id: 'show-station-nn', labelPl: 'Pokaż stronę nN stacji', section: 'Otwórz' },
    { id: 'edit-station-bays', labelPl: 'Edytuj pola SN stacji', section: 'Edytuj' },
    { id: 'edit-station-transformer', labelPl: 'Edytuj transformator SN/nN', section: 'Edytuj' },
    { id: 'continue-trunk', labelPl: 'Kontynuuj ciąg główny', section: 'Dodaj' },
    { id: 'start-branch', labelPl: 'Rozpocznij odgałęzienie', section: 'Dodaj' },
    { id: 'add-source', labelPl: 'Dodaj źródło PV/BESS/FW z katalogu', section: 'Dodaj' },
    { id: 'add-load', labelPl: 'Dodaj obciążenie nN', section: 'Dodaj' },
    /* K5-A (H-4): źródła dyspozycyjne nN stacji — realne operacje
     * add_genset_nn / add_ups_nn (kreator „Źródło dyspozycyjne nN"). */
    { id: 'add-genset', labelPl: 'Dodaj agregat prądotwórczy nN', section: 'Dodaj' },
    { id: 'add-ups', labelPl: 'Dodaj zasilacz UPS nN', section: 'Dodaj' },
    /* V12K-351: dawna pozycja „Pokaż konfigurację stacji" (`show-readiness`) prowadziła do
     * GLOBALNEJ listy braków modelu (E-04 nie filtruje po obiekcie) — etykieta obiecywała
     * stację, a ekran pokazywał całą sieć. Teraz karta „Gotowość" konfiguratora TEJ stacji. */
    { id: 'show-station-readiness', labelPl: 'Sprawdź gotowość stacji', section: 'Analizuj' },
    { id: 'show-results', labelPl: 'Pokaż wyniki stacji', section: 'Wyniki' },
    { id: 'show-rationale', labelPl: 'Pokaż uzasadnienie inżynierskie', section: 'Uzasadnienie' },
    { id: 'delete-station', labelPl: 'Usuń stację', section: 'Usuń' },
  ],
  zksn: [
    { id: 'open-zksn-card', labelPl: 'Otwórz kartę ZK SN', section: 'Otwórz' },
    { id: 'start-branch', labelPl: 'Wyprowadź odgałęzienie kablowe', section: 'Dodaj' },
    { id: 'show-results', labelPl: 'Pokaż wyniki ZK SN', section: 'Wyniki' },
    { id: 'delete-zksn', labelPl: 'Usuń ZK SN', section: 'Usuń' },
  ],
  branch_pole: [
    { id: 'open-branch-pole-card', labelPl: 'Otwórz kartę słupa', section: 'Otwórz' },
    { id: 'start-branch', labelPl: 'Wyprowadź odgałęzienie napowietrzne', section: 'Dodaj' },
    { id: 'show-results', labelPl: 'Pokaż wyniki słupa', section: 'Wyniki' },
    { id: 'delete-branch-pole', labelPl: 'Usuń słup', section: 'Usuń' },
  ],
  der_pv: [
    { id: 'open-pv-config', labelPl: 'Otwórz kartę PV', section: 'Otwórz' },
    ...POZYCJE_ZRODLA_EDYCJA,
    { id: 'show-frt-hvrt', labelPl: 'Pokaż krzywe FRT/HVRT', section: 'Analizuj' },
    ...POZYCJE_ZRODLA_OCENA,
    ...POZYCJE_ZRODLA_WYNIKI,
    { id: 'delete-pv', labelPl: 'Usuń źródło PV', section: 'Usuń' },
  ],
  der_bess: [
    { id: 'open-bess-config', labelPl: 'Otwórz kartę BESS', section: 'Otwórz' },
    ...POZYCJE_ZRODLA_EDYCJA,
    { id: 'show-frt-hvrt', labelPl: 'Pokaż krzywe FRT/HVRT', section: 'Analizuj' },
    ...POZYCJE_ZRODLA_OCENA,
    ...POZYCJE_ZRODLA_WYNIKI,
    { id: 'delete-bess', labelPl: 'Usuń magazyn BESS', section: 'Usuń' },
  ],
  der_fw: [
    { id: 'open-fw-config', labelPl: 'Otwórz kartę FW', section: 'Otwórz' },
    ...POZYCJE_ZRODLA_EDYCJA,
    { id: 'show-frt-hvrt', labelPl: 'Pokaż krzywe FRT/HVRT', section: 'Analizuj' },
    ...POZYCJE_ZRODLA_OCENA,
    ...POZYCJE_ZRODLA_WYNIKI,
    { id: 'delete-fw', labelPl: 'Usuń farmę wiatrową', section: 'Usuń' },
  ],
  /**
   * Karta SLD-P (GAP P-1 „menu kontekstowe DER na v3") — DER-MENU-V3: kanwa v3
   * niesie podtyp DER w `meta.derKind` (REALNA wartość `SldSourceView.kind`), więc
   * `pv`/`bess`/`wind` trafiają do PEŁNYCH kategorii `der_pv`/`der_bess`/`der_fw`
   * wyżej BEZ zgadywania. TEN generyczny rejestr `der` obsługuje WYŁĄCZNIE UCZCIWĄ
   * DEGRADACJĘ: `generator` (brak osobnej kategorii) oraz `unknown`/brak `derKind`
   * (`Generator.gen_type` nierozpoznany/`null` — honest-unknown,
   * `domain_no_guessing_guard`: NIGDY domysł podtypu). Niesie wyłącznie pozycje
   * niezależne od podtypu (`POZYCJE_ZRODLA_*` wyżej). `open-*-config`/`show-frt-hvrt`/
   * `delete-*` NIE są tu przeniesione (brak realnego ekranu docelowego bez znanego
   * podtypu) — poprawna degradacja dla źródła nierozpoznanego.
   */
  der: [...POZYCJE_ZRODLA_EDYCJA, ...POZYCJE_ZRODLA_OCENA, ...POZYCJE_ZRODLA_WYNIKI],
};

/** S9-10: powód blokady „Rozpocznij odgałęzienie" — jeden tekst dla menu kanwy,
 *  paska działań i karty technicznej inspektora. */
export const POWOD_BRAKU_STARTU_ODGALEZIENIA_PL =
  'Brak wolnego pola odgałęźnego SN z wolnym zaciskiem. Najpierw dodaj pole odgałęźne w rozdzielni.';

/**
 * KARTA S95-START: uczciwy powód blokady pozycji kontynuacji ciągu SN — po polsku, bez
 * identyfikatorów, z nazwaniem, co projektant może zrobić. Ten sam tekst pokazuje menu
 * kanwy, pasek działań inspektora i wykonawca akcji (gdy akcja przyjdzie inną drogą niż menu).
 */
export function powodBrakuStartuCiagu(kind: SldElementKindForMenu): string {
  switch (kind) {
    case 'gpz':
    case 'section':
      return 'Brak wolnego pola liniowego SN w tej rozdzielni. Dodaj pole liniowe wyjściowe albo kontynuuj ciąg z istniejącego odcinka.';
    case 'station':
      return 'Stacja nie ma wolnego pola liniowego wyjściowego SN. Dodaj pole liniowe wyjściowe w konfiguratorze stacji albo kontynuuj ciąg z końca odcinka.';
    case 'cable_segment_sn':
    case 'overhead_line_sn':
      return 'Nie rozpoznano wolnego końca tego ciągu. Kontynuuj ciąg ze stacji albo pola na jego końcu.';
    default:
      return 'Ten obiekt nie ma wolnego pola SN, z którego można wyprowadzić ciąg.';
  }
}

/**
 * Filtruje akcje menu wg dostępności (np. zakaz "Wyprowadź ciąg główny" gdy
 * pole już ma wyprowadzony ciąg).
 */
export function getMenuActions(
  kind: SldElementKindForMenu,
  context?: {
    readonly bayHasOutgoingRun?: boolean;
    readonly bayIsRunEndpoint?: boolean;  // Phase 0B: czy pole jest endpointem ciągu (free terminal)
    /** S9-10 (predykaty parami): punkt startu ODGAŁĘZIENIA liczony TYM SAMYM
     *  resolverem co kreator (`resolveBranchStartAvailability`). Zastępuje
     *  martwe `stationHasFreeBay` (S9-5: bramka bez żadnego pisarza). */
    readonly branchStartAvailable?: boolean;
    readonly hasResults?: boolean;
    readonly apparatusKind?: string;
    /** K5-A: czy stacja ma szynę nN (realne FK substation.bus_refs → bus nN);
     *  `false` blokuje agregat/UPS z uczciwym powodem, `undefined` = brak danych. */
    readonly stationHasNnBus?: boolean;
    /** Karta S9-5 → S95-START: dostępność punktu startu ciągu SN dla KAŻDEJ pozycji
     *  kontynuacji ciągu w menu obiektu (klucz = id pozycji). Wartość liczy
     *  `resolveTrunkStartAvailability` (`shared/sldActionExecutor.ts`) TYM SAMYM
     *  rozstrzygnięciem, które buduje kontekst operacji i które czyta kreator magistrali
     *  (`maStartOperacjiCiagu`). `false` blokuje pozycję z uczciwym powodem zamiast
     *  otwierać kreator bez punktu startu; brak klucza = brak pomiaru (bez blokady). */
    readonly trunkStartAvailable?: Readonly<Partial<Record<string, boolean>>>;
    /** W5-C: stan łącznika obiektu (pozycje otwórz/zamknij/punkt podziału);
     *  brak klucza = brak pomiaru (bez blokady). */
    readonly lacznik?: StanLacznikaMenu;
  },
): SldMenuAction[] {
  const baseActions = SLD_MENU_REGISTRY[kind];
  const ctx = context ?? {};

  return baseActions.map((a) => {
    if (ctx.lacznik && POZYCJE_STANU_LACZNIKA.some((pozycja) => pozycja.id === a.id)) {
      const powod = powodBlokadyStanuLacznika(a.id, ctx.lacznik);
      return powod ? { ...a, disabled: true, disabledReasonPl: powod } : a;
    }
    if (a.id === 'extend-trunk' && ctx.bayHasOutgoingRun === true) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Pole ma już wyprowadzony ciąg główny.',
      };
    }
    if (kind === 'apparatus' && a.id === 'extend-trunk' && ctx.apparatusKind !== 'cable_head') {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Ciąg główny można wyprowadzić tylko z głowicy kablowej / portu odpływu pola SN.',
      };
    }
    /* Phase 0B (operator-grade SLD plan v2): append-on-endpoint dostępny TYLKO
     * gdy pole jest free endpointem ciągu (bus z topology_terminal tag). */
    if (a.id === 'append-station-on-endpoint' && ctx.bayIsRunEndpoint === false) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Pole nie jest końcem ciągu. Najpierw wyprowadź ciąg lub wybierz endpoint.',
      };
    }
    /* K5-A: agregat/UPS przyłączają się do szyny nN stacji — stacja bez szyny
     * nN (brak bloku nN/transformatora) dostaje uczciwą blokadę zamiast
     * kreatora bez możliwego zapisu. */
    if ((a.id === 'add-genset' || a.id === 'add-ups') && kind === 'station' && ctx.stationHasNnBus === false) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Stacja nie ma szyny nN. Najpierw dodaj transformator SN/nN z rozdzielnicą nN.',
      };
    }
    /* Karta S9-5 → S95-START: pozycja budowy ciągu MUSI mieć punkt startu — dla
     * KAŻDEGO rodzaju obiektu, nie tylko GPZ i sekcji. Kreator magistrali odmówiłby
     * zapisu (`maStartCiagu`), więc otwarcie go byłoby martwym klikiem opakowanym w
     * okno. Bramka rodzajowo-agnostyczna: o dostępności decyduje pisarz kontekstu
     * (`resolveTrunkStartAvailability`), powód — rodzaj obiektu. */
    if (ctx.trunkStartAvailable?.[a.id] === false) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: powodBrakuStartuCiagu(kind),
      };
    }
    /* S9-10 (klasa S9-5, predykaty PARAMI): pozycja „Rozpocznij odgałęzienie"
     * jest bramkowana TYM SAMYM resolverem, którego użyje kreator
     * (`resolveBranchStartAvailability` — patrz pisarze kontekstu). Pomiar
     * S9-10: bez tej bramki pozycja była aktywna na KAŻDEJ stacji, źródle GPZ
     * i szynie sekcji sieci referencyjnej, a kreator otwierał się z „Brak
     * wskazania źródła" i trwale zablokowanym zapisem. Bramka kind-agnostyczna:
     * o tym, dla których obiektów policzyć dostępność, decyduje PISARZ
     * kontekstu (ten sam obiekt = ten sam resolver co formularz). */
    if (a.id === 'start-branch' && ctx.branchStartAvailable === false) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: POWOD_BRAKU_STARTU_ODGALEZIENIA_PL,
      };
    }
    if (a.id === 'show-results' && ctx.hasResults === false) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Brak obliczeń. Uruchom obliczenia z prawego panelu.',
      };
    }
    return a;
  });
}

/* ---------------------------------------------------------------------------
   Toast feedback bus (brief 2 §17 pkt 10)
   --------------------------------------------------------------------------- */

export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';

export interface ToastEvent {
  readonly id: string;
  readonly severity: ToastSeverity;
  readonly messagePl: string;
  readonly timestamp: number;
}

type ToastListener = (event: ToastEvent) => void;

class ToastBus {
  private listeners: Set<ToastListener> = new Set();
  private nextId = 0;

  publish(severity: ToastSeverity, messagePl: string): ToastEvent {
    const event: ToastEvent = {
      id: `toast_${this.nextId++}`,
      severity,
      messagePl,
      timestamp: Date.now(),
    };
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Reset dla testów
  __reset_for_tests(): void {
    this.listeners.clear();
    this.nextId = 0;
  }
}

export const toastBus = new ToastBus();

/** Polskie wzorce komunikatów dla typowych operacji (brief 2 §17 pkt 10). */
export const COMMAND_FEEDBACK_PL = {
  bayCreated: (designation: string) => `Utworzono pole ${designation}.`,
  segmentSplit: 'Odcinek podzielono na dwa odcinki end-to-end.',
  derAttached: (kind: 'PV' | 'BESS' | 'FW', name: string) =>
    `Dodano źródło ${kind} "${name}" z punktem przyłączenia.`,
  missingInverterData: 'Brakuje danych falownika do obliczeń zwarciowych.',
  voltageMismatch: (fromKv: number, toKv: number) =>
    `Niespójność napięć: ${fromKv} kV ↔ ${toKv} kV. Wymagany transformator dedykowany.`,
  stationInserted: (name: string) => `Wstawiono stację "${name}" na ciągu.`,
  branchStarted: (origin: string) => `Rozpoczęto odgałęzienie z "${origin}".`,
  switchStateChanged: (designationQ: string, newState: string) =>
    `Aparat ${designationQ}: stan zmieniony na "${newState}".`,
  nopMarked: (stationName: string) => `Stacja "${stationName}" oznaczona jako punkt normalnie otwarty.`,
  /* Phase 0B (operator-grade SLD plan v2): Append-on-Endpoint workflow */
  appendStarted: 'Wskaż punkt zakończenia odcinka.',
  appendEndpointPicked: 'Wybrano koniec odcinka. Wybierz typ stacji.',
  appendPreviewReady: 'Podgląd: odcinek zostanie zakończony w stacji.',
  appendCommitted: (stationName: string) =>
    `Utworzono stację "${stationName}" na końcu odcinka i przypięto port wejściowy SN.`,
  appendCancelled: 'Operacja anulowana. Model bez zmian.',
  continueFromStation: 'Kontynuuj ciąg z portu wyjściowego stacji.',
  /* Phase 0C: Conscious Split workflow */
  splitPreviewReady: 'Podgląd świadomego podziału odcinka.',
  splitImpactSummary: (count: number) =>
    `Operacja unieważni ${count} wyników obliczeń.`,
  splitCommitted: 'Odcinek został podzielony na dwa odcinki end-to-end.',
  splitCancelled: 'Podział odcinka anulowany. Model bez zmian.',
} as const;
