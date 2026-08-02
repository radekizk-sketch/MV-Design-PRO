/*
 * Grupowanie problemów gotowości WG CELU inżyniera (karta E6.1 §1, W-401:
 * AUDYT_RADY_SPECJALISTOW_2026-07.md linia 84: „grupowanie braków wg celu
 * (do zwarć brakuje…, do wniosku OSD brakuje…); postęp per cel").
 *
 * Czysta funkcja: `ReadinessIssue[]` (typ istniejący — `ui/types.ts`, ponowne
 * użycie logiki niewizualnej dozwolone przez `MODEL_INTERAKCJI` §1) → grupy
 * celów. Zero Reacta, zero store'ów — testowalna fixture'ami.
 *
 * ====================================================================
 * MAPOWANIE KODU → CEL (badanie realnych kodów, plik:linia — karta §2)
 * ====================================================================
 *
 * Źródło NAJWYŻSZEGO zaufania — kanoniczny rejestr kodów gotowości (moduł
 * jawnie oznaczony jako „JEDYNYM ZRODLEM PRAWDY... dla kodow gotowosci"):
 *   `backend/src/domain/canonical_operations.py:479-885` (`READINESS_CODES`,
 *   klasa `ReadinessCodeSpec.area: ReadinessArea`), oraz funkcja
 *   `get_blockers_for_analysis` (tamże, linie 888-912), która wprost wiąże
 *   `ReadinessArea` z typem analizy:
 *     SC_3F/SC_2F/SC_1F  -> {TOPOLOGY, SOURCES, CATALOGS}           (linie 891-893)
 *     LOAD_FLOW          -> {TOPOLOGY, SOURCES, CATALOGS, GENERATORS} (894-899)
 *     PROTECTION         -> {TOPOLOGY, SOURCES, CATALOGS, PROTECTION} (900-905)
 *   STATIONS nie występuje w żadnym z powyższych zbiorów — obszar ten
 *   blokuje wyłącznie gotowość schematu/modelu (patrz `domain/readiness.py`
 *   linie 118-127: `sld_issues` = TOPOLOGY ∪ STATIONS ∪ GENERATORS).
 *
 * Z powyższego wynika mapowanie OBSZAR -> CEL użyte poniżej:
 *   SOURCES     -> 'zwarcia'   (parametry źródła to wprost dane zwarciowe —
 *                  patrz też `enm/validator.py:287` kod
 *                  `sources.no_short_circuit_params`, message_pl: „Źródło...
 *                  nie ma parametrów zwarciowych"; współwymagane też przez
 *                  LOAD_FLOW — TODO-KARTA niżej)
 *   TOPOLOGY, CATALOGS, ANALYSIS -> 'wspolne' (wymóg wspólny SC/LF/zabezp.)
 *   GENERATORS  -> 'rozplyw'   (wyłącznie LOAD_FLOW wg rejestru)
 *   PROTECTION  -> 'zabezpieczenia' (wyłącznie PROTECTION wg rejestru)
 *   STATIONS    -> 'stacje'    (poza `get_blockers_for_analysis` — gotowość
 *                  schematu/modelu, nie gotowość konkretnej analizy)
 *
 * Wyjątek jawny (nadpisanie prefiksu, kod dokładny):
 *   `oze.card_field_not_accepted` (canonical_operations.py:657-668, obszar
 *   GENERATORS wg rejestru) -> 'wniosekOsd', ponieważ
 *   `backend/src/solver_input/provenance.py:379-381,395` definiuje go WPROST
 *   jako `OSD_CARD_FIELD_BLOCKER_CODE` — bramkę pakietu OSD (dokumentacji
 *   przyłączeniowej), NIE bramkę obliczeń rozpływowych.
 *
 * Kody dokładne spoza rejestru (znalezione grepem w `backend/src/**`,
 * potwierdzone w miejscu wywołania — patrz też
 * `docs/ui/MACIERZ_OKIEN_DIALOGOWYCH_I_AKCJI.md` linie 34-50 dla kontekstu
 * dialogów wizarda):
 *   `sources.no_short_circuit_params` (enm/validator.py:287)      -> zwarcia
 *   `pv_bess.transformer_required`   (enm/domain_operations.py:1228,1239) -> rozplyw
 *   `branch_point.invalid_parent_medium/required_port_missing/
 *    catalog_ref_missing/switch_state_missing`, `zksn.branch_count_invalid`
 *                                    (enm/domain_operations.py:1249-1345)  -> wspolne
 *   `switch.catalog_ref_missing`     (enm/domain_operations.py:1346-1377) -> wspolne
 *   `protection.binding_missing`     (domain/station_field_validation.py:203) -> zabezpieczenia
 *   `relay.ct_missing`               (enm/domain_operations_v2.py:676)    -> zabezpieczenia
 *   `tcc.relay_missing`              (enm/domain_operations_v2.py:818)    -> zabezpieczenia
 *
 * Bramy katalogowe (karta W4, dług nazwany w V12K-317): siedemnaście kodów
 * przestrzeni `catalog.` emitowanych przez bramy (`api/domain_ops_policy.py`,
 * `api/enm.py`, `enm/domain_operations*.py`,
 * `network_model/catalog/materialization.py`) nie miało wpisu ani w kanonicznym
 * rejestrze, ani tutaj — projektant dostawał goły kod bez zdania po polsku i bez
 * nawigacji naprawczej. Od karty W4 wszystkie są w `READINESS_CODES` (stamtąd
 * płynie opis i `fix_navigation`) oraz w `KOD_Z_REJESTRU_DO_CELU` niżej.
 * Kompletność przypina test klasy backendu (skan AST kodu bram), który czyta
 * OBA pliki — rejestr i tę mapę.
 *
 * Fallback PREFIKSU (część kodu przed pierwszą kropką) — użyty tylko tam,
 * gdzie WSZYSTKIE zaobserwowane kody danego prefiksu zgodnie należą do
 * jednego celu (grep `"<prefiks>\."` w `backend/src/**`):
 *   source/sources -> zwarcia; generator/oze/pv_bess/bess -> rozplyw;
 *   protection/relay/tcc -> zabezpieczenia; station/apparatus/field -> stacje;
 *   trunk/ring/branch_point/zksn/switch/catalog/import/load/study_case/
 *   analysis -> wspolne.
 * Prefiksy „nn" i „transformer" NIE dostają fallbacku prefiksu — kody w ich
 * obrębie należą do RÓŻNYCH obszarów rejestru (np. `nn.bus_missing` = STATIONS,
 * `nn.cable_catalog_missing` = CATALOGS; `transformer.catalog_missing` =
 * CATALOGS, `transformer.connection_missing` = STATIONS) — mapowane WYŁĄCZNIE
 * kodem dokładnym; nieznany, nowy kod tych prefiksów -> „Pozostałe" (bez
 * zgadywania, zgodnie z kartą §2).
 *
 * TODO-KARTA (ograniczenia — bez zgadywania):
 * 1. Kody generyczne bez separatora kropkowego (`E001`..`E042`, `W001`..`W040`,
 *    `I001`..`I005` z `enm/validator.py`) NIE MAJĄ przestrzeni nazw (prefiksu)
 *    wskazującej cel — trafiają do „Pozostałe". Ich znaczenie jest czytelne
 *    z `wizard_step_hint` (K2..K6) i treści `message_pl`, ale to inny sygnał
 *    niż „prefiks kodu" wskazany przez kartę — pytanie do zarządcy, czy
 *    rozszerzyć mapowanie o `wizard_step_hint` w kolejnej karcie.
 * 2. Kody z `network_model/validation/validator.py` i
 *    `network_model/catalog/readiness_checker.py` (np. `transformer.hv_invalid`,
 *    `transformer.polarity_reversed`) pochodzą z ODRĘBNEGO modułu walidacji
 *    (starszy `network_model`, nie ENM) — nie potwierdzono, czy zasilają
 *    `useSnapshotStore.readiness` (adapter czyta WYŁĄCZNIE odpowiedź ENM
 *    domain-ops). Pominięte w mapowaniu zamiast zgadywania.
 * 3. `domain/station_field_validation.py`/`generator_validation.py` (kody
 *    `field.device_missing.*`, `generator.*`, `catalog.ref_missing` w tych
 *    plikach) nie mają dziś potwierdzonego wywołującego w kodzie produkcyjnym
 *    (grep nie znalazł żadnego callera `validate_station_fields(`/
 *    `validate_pv_bess_variant_*(`) — mapowanie zachowane na wypadek
 *    przyszłego wpięcia (ta sama `ReadinessAreaV1` co rejestr), ale nie
 *    potwierdzono jako aktualnie żywe w odpowiedzi backendu.
 * 4. `source.*`/`sources.*` blokuje RÓWNIEŻ `LOAD_FLOW` (rejestr, linie
 *    894-899) — grupowanie pod „zwarcia" jest wyborem głównym (parametry
 *    zwarciowe źródła to jego dominująca treść), nie oznacza wyłączności.
 */

import type { FixAction, ReadinessIssue, ReadinessSeverity } from '../../../ui/types';
import { GOTOWOSC_STRINGS } from './strings';

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

/** Waga problemu — wyłącznie dwie wartości pokazywane w UI (karta §3). */
export type WagaProblemu = 'BLOKADA' | 'OSTRZEZENIE';

/** Cel inżyniera, do którego dany brak jest przypisany (patrz mapowanie wyżej). */
export type CelGotowosci =
  | 'stacje'
  | 'zgodnoscReferencyjna'
  | 'wspolne'
  | 'zwarcia'
  | 'rozplyw'
  | 'zabezpieczenia'
  | 'wniosekOsd'
  | 'pozostale';

/** Kolejność wyświetlania sekcji celów — kolejność pracy inżyniera (N2→N7). */
export const KOLEJNOSC_CELOW: readonly CelGotowosci[] = [
  'stacje',
  'zgodnoscReferencyjna',
  'wspolne',
  'zwarcia',
  'rozplyw',
  'zabezpieczenia',
  'wniosekOsd',
  'pozostale',
];

/** Etykieta PL celu (strings.ts — jedno źródło tekstu). */
export const ETYKIETA_CELU: Record<CelGotowosci, string> = {
  stacje: GOTOWOSC_STRINGS.celStacje,
  zgodnoscReferencyjna: GOTOWOSC_STRINGS.celZgodnoscReferencyjna,
  wspolne: GOTOWOSC_STRINGS.celWspolne,
  zwarcia: GOTOWOSC_STRINGS.celZwarcia,
  rozplyw: GOTOWOSC_STRINGS.celRozplyw,
  zabezpieczenia: GOTOWOSC_STRINGS.celZabezpieczenia,
  wniosekOsd: GOTOWOSC_STRINGS.celWniosekOsd,
  pozostale: GOTOWOSC_STRINGS.celPozostale,
};

/** Problem gotowości — projekcja `ReadinessIssue` wzbogacona o wagę PL i cel. */
export interface ProblemGotowosci {
  code: string;
  waga: WagaProblemu;
  elementRef: string | null;
  opisPl: string;
  cel: CelGotowosci;
  fixAction: FixAction | null;
}

/** Grupa celu — problemy + liczniki + postęp (karta §1: „postęp per cel"). */
export interface GrupaCelu {
  cel: CelGotowosci;
  problemy: ProblemGotowosci[];
  blokady: number;
  ostrzezenia: number;
  /**
   * Udział ostrzeżeń wśród zgłoszonych problemów w tym celu, w procentach
   * [0, 100]. Sygnał orientacyjny warstwy UI (NIE fizyczny wskaźnik gotowości
   * sieci, NIE wynik solvera) — 100, gdy brak blokad (w tym: brak problemów
   * w ogóle); poniżej 100 proporcjonalnie do udziału blokad, gdy blokady > 0.
   */
  postepProcent: number;
}

// ---------------------------------------------------------------------------
// Mapowanie kod -> cel
// ---------------------------------------------------------------------------

/** Wyjątek kodu dokładnego — nadpisuje wynik fallbacku prefiksu (patrz nagłówek). */
const KOD_DOKLADNY_DO_CELU: Readonly<Record<string, CelGotowosci>> = {
  'oze.card_field_not_accepted': 'wniosekOsd',
};

/**
 * Kody dokładne z kanonicznego rejestru `READINESS_CODES`
 * (`backend/src/domain/canonical_operations.py:479-885`) — przepisane po
 * kodzie (nie po prefiksie), bo pojedynczy prefiks („nn", „transformer")
 * bywa rozdzielony na różne obszary/cele w samym rejestrze.
 */
const KOD_Z_REJESTRU_DO_CELU: Readonly<Record<string, CelGotowosci>> = {
  // SOURCES (canonical_operations.py:481-516)
  'source.voltage_invalid': 'zwarcia',
  'source.sk3_invalid': 'zwarcia',
  'source.grid_supply_missing': 'zwarcia',
  'source.connection_missing': 'zwarcia',
  // TOPOLOGY (:518-553, :670-687)
  'trunk.terminal_missing': 'wspolne',
  'trunk.segment_missing': 'wspolne',
  'trunk.segment_length_missing': 'wspolne',
  'trunk.segment_length_invalid': 'wspolne',
  'ring.endpoints_missing': 'wspolne',
  'ring.nop_required': 'wspolne',
  // CATALOGS (:554-562, :601-609, :736-793, :849-870, :872-884)
  'trunk.catalog_missing': 'wspolne',
  'transformer.catalog_missing': 'wspolne',
  'catalog.ref_required': 'wspolne',
  'import.catalog_mapping_required': 'wspolne',
  'catalog.binding_version_missing': 'wspolne',
  'catalog.binding_missing': 'wspolne',
  'catalog.materialization_failed': 'wspolne',
  // Bramy katalogowe (karta W4, dług V12K-317). Do tej karty rejestr znał tylko
  // cztery kody przestrzeni `catalog.`, a bramy emitują ich siedemnaście więcej —
  // z `catalog.item_not_found` na czele, bo po ujednoliceniu parytetu torów
  // (V12K-307/315/316) jest to JEDYNY kod złej referencji katalogowej. Wpis
  // DOKŁADNY (nie fallback prefiksu), żeby kod był tu widoczny i policzalny:
  // fallback grupuje milcząco, więc kod spoza rejestru wyglądałby jak obsłużony.
  'catalog.item_not_found': 'wspolne',
  'catalog.ref_missing': 'wspolne',
  'catalog.item_missing': 'wspolne',
  'catalog.item_id_missing': 'wspolne',
  'catalog.binding_required': 'wspolne',
  'catalog.binding_invalid': 'wspolne',
  'catalog.namespace_missing': 'wspolne',
  'catalog.namespace_required': 'wspolne',
  'catalog.unknown_namespace': 'wspolne',
  'catalog.namespace_mismatch': 'wspolne',
  'catalog.element_missing': 'wspolne',
  'catalog.element_not_found': 'wspolne',
  'catalog.clear_forbidden': 'wspolne',
  'catalog.materialization_required': 'wspolne',
  'catalog.materialization_incomplete': 'wspolne',
  'catalog.nameplate_mismatch': 'wspolne',
  'catalog.gate_result_mismatch': 'wspolne',
  'load.catalog_missing': 'wspolne',
  'load.power_zero': 'wspolne',
  'nn.cable_catalog_missing': 'wspolne',
  // STATIONS (:564-599, :610-618, :620-637, :822-847)
  'station.type_invalid': 'stacje',
  'station.voltage_missing': 'stacje',
  'station.nn_outgoing_min_1': 'stacje',
  'station.required_field_missing': 'stacje',
  'transformer.connection_missing': 'stacje',
  'nn.bus_missing': 'stacje',
  'nn.main_breaker_missing': 'stacje',
  'apparatus.sn_catalog_missing': 'stacje',
  'apparatus.nn_catalog_missing': 'stacje',
  // GENERATORS (:639-668, :795-820) — poza wyjątkiem OSD wyżej
  'oze.transformer_required': 'rozplyw',
  'oze.nn_bus_required': 'rozplyw',
  'oze.pv_no_transformer': 'rozplyw',
  'oze.bess_no_transformer': 'rozplyw',
  // PROTECTION (:689-715)
  'protection.ct_required': 'zabezpieczenia',
  'protection.vt_required': 'zabezpieczenia',
  'protection.settings_incomplete': 'zabezpieczenia',
  // ANALYSIS (:717-734)
  'study_case.missing_base_snapshot': 'wspolne',
  'analysis.blocked_by_readiness': 'wspolne',
};

/**
 * Kody zgodności referencyjnej (Reference Engine V1). Źródło kontraktu:
 * `docs/sld/REFERENCE_ENGINE_UI_HANDOFF_2026-07.md` §1.2 — walidator ENM emituje
 * te kody severity IMPORTANT z `fix_action.modal_type="BayModal"`. Warstwa UI
 * NIE liczy tych reguł (HANDOFF §4) — wyłącznie grupuje istniejący wynik
 * walidatora w odrębny cel „Zgodność referencyjna" (HANDOFF pkt 2.2). Prefiks
 * `reference` (niżej) obejmuje ewentualne nowe kody tej samej rodziny.
 */
const KOD_REFERENCJI_DO_CELU: Readonly<Record<string, CelGotowosci>> = {
  'reference.bays.missing_required_apparatus': 'zgodnoscReferencyjna',
  'reference.bays.missing_switching_function': 'zgodnoscReferencyjna',
  'reference.bays.forbidden_apparatus': 'zgodnoscReferencyjna',
  'reference.bays.apparatus_order_mismatch': 'zgodnoscReferencyjna',
  'reference.bays.earth_switch_in_main_path': 'zgodnoscReferencyjna',
  'reference.bays.family_mismatch': 'zgodnoscReferencyjna',
};

/** Kody dokładne spoza rejestru, potwierdzone w miejscu wywołania (patrz nagłówek). */
const KOD_DOMENOWY_DO_CELU: Readonly<Record<string, CelGotowosci>> = {
  'sources.no_short_circuit_params': 'zwarcia',
  'pv_bess.transformer_required': 'rozplyw',
  'branch_point.invalid_parent_medium': 'wspolne',
  'branch_point.required_port_missing': 'wspolne',
  'branch_point.catalog_ref_missing': 'wspolne',
  'branch_point.switch_state_missing': 'wspolne',
  'zksn.branch_count_invalid': 'wspolne',
  'switch.catalog_ref_missing': 'wspolne',
  // `catalog.ref_missing` przeniesiony do KOD_Z_REJESTRU_DO_CELU (karta W4) —
  // od tej karty JEST w kanonicznym rejestrze `READINESS_CODES`, więc trzymanie
  // go tutaj czyniłoby nagłówek tej mapy („kody spoza rejestru") nieprawdziwym.
  'protection.binding_missing': 'zabezpieczenia',
  'relay.ct_missing': 'zabezpieczenia',
  'tcc.relay_missing': 'zabezpieczenia',
};

/**
 * Fallback prefiksu — WYŁĄCZNIE dla przedrostków, gdzie wszystkie
 * zaobserwowane kody danego prefiksu zgodnie należą do jednego celu (patrz
 * nagłówek). Prefiksy o rozdzielonych celach („nn", „transformer") celowo
 * pominięte — mapowane tylko kodem dokładnym wyżej.
 */
const PREFIKS_DO_CELU: Readonly<Record<string, CelGotowosci>> = {
  reference: 'zgodnoscReferencyjna',
  source: 'zwarcia',
  sources: 'zwarcia',
  generator: 'rozplyw',
  oze: 'rozplyw',
  pv_bess: 'rozplyw',
  bess: 'rozplyw',
  protection: 'zabezpieczenia',
  relay: 'zabezpieczenia',
  tcc: 'zabezpieczenia',
  station: 'stacje',
  apparatus: 'stacje',
  field: 'stacje',
  trunk: 'wspolne',
  ring: 'wspolne',
  branch_point: 'wspolne',
  zksn: 'wspolne',
  switch: 'wspolne',
  catalog: 'wspolne',
  import: 'wspolne',
  load: 'wspolne',
  study_case: 'wspolne',
  analysis: 'wspolne',
};

/** Wyznacza cel dla pojedynczego kodu gotowości (kod dokładny > fallback prefiksu > „Pozostałe"). */
export function celDlaKodu(code: string): CelGotowosci {
  if (code in KOD_DOKLADNY_DO_CELU) return KOD_DOKLADNY_DO_CELU[code];
  if (code in KOD_Z_REJESTRU_DO_CELU) return KOD_Z_REJESTRU_DO_CELU[code];
  if (code in KOD_REFERENCJI_DO_CELU) return KOD_REFERENCJI_DO_CELU[code];
  if (code in KOD_DOMENOWY_DO_CELU) return KOD_DOMENOWY_DO_CELU[code];

  const idxKropki = code.indexOf('.');
  if (idxKropki <= 0) return 'pozostale';
  const prefiks = code.slice(0, idxKropki);
  return PREFIKS_DO_CELU[prefiks] ?? 'pozostale';
}

// ---------------------------------------------------------------------------
// Waga
// ---------------------------------------------------------------------------

/** `ReadinessSeverity` (ang., typ istniejący) -> `WagaProblemu` PL (karta §3). INFO traktowane jako ostrzeżenie. */
export function wagaZSeverity(severity: ReadinessSeverity): WagaProblemu {
  return severity === 'BLOCKER' ? 'BLOKADA' : 'OSTRZEZENIE';
}

// ---------------------------------------------------------------------------
// Projekcja + grupowanie
// ---------------------------------------------------------------------------

/** Projekcja pojedynczego `ReadinessIssue` na `ProblemGotowosci` (waga PL + cel). */
export function naProblemGotowosci(issue: ReadinessIssue): ProblemGotowosci {
  return {
    code: issue.code,
    waga: wagaZSeverity(issue.severity),
    elementRef: issue.element_ref ?? issue.element_refs[0] ?? null,
    opisPl: issue.message_pl,
    cel: celDlaKodu(issue.code),
    fixAction: issue.fix_action,
  };
}

function postepProcentDlaGrupy(blokady: number, ostrzezenia: number): number {
  const suma = blokady + ostrzezenia;
  if (suma === 0 || blokady === 0) return 100;
  return Math.round((ostrzezenia / suma) * 100);
}

/**
 * Grupuje problemy gotowości wg celu inżyniera. Zwraca WYŁĄCZNIE grupy z co
 * najmniej jednym problemem, w stałej kolejności `KOLEJNOSC_CELOW`
 * (determinizm — karta §6/§8: sam wynik nie zależy od kolejności wejścia).
 */
export function grupujProblemyWgCelu(issues: ReadinessIssue[]): GrupaCelu[] {
  const problemy = issues.map(naProblemGotowosci);
  const wgCelu = new Map<CelGotowosci, ProblemGotowosci[]>();
  for (const problem of problemy) {
    const lista = wgCelu.get(problem.cel);
    if (lista) lista.push(problem);
    else wgCelu.set(problem.cel, [problem]);
  }

  const grupy: GrupaCelu[] = [];
  for (const cel of KOLEJNOSC_CELOW) {
    const listaProblemow = wgCelu.get(cel);
    if (!listaProblemow || listaProblemow.length === 0) continue;
    const blokady = listaProblemow.filter((p) => p.waga === 'BLOKADA').length;
    const ostrzezenia = listaProblemow.length - blokady;
    grupy.push({
      cel,
      problemy: listaProblemow,
      blokady,
      ostrzezenia,
      postepProcent: postepProcentDlaGrupy(blokady, ostrzezenia),
    });
  }
  return grupy;
}
