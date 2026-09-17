/**
 * Creator Screenshot Harness — render żywych kreatorów ui2 do oceny wizualnej
 * (dyrektywa właściciela #8: zrzuty żywej aplikacji w obu motywach na stałej stronie
 * oceny). Renderuje REALNE komponenty kreatorów z zaszczepionym kontekstem/stanem
 * i podmienionym `fetch` (dane katalogowe), w motywie jasnym/ciemnym.
 *
 * Query: `?creator=pole|oze|transformator|kompensator|magistrala|odbior|zrodlo|arcflash&theme=light|dark`.
 * Sceny dowodowe OZE (karta V-A): `?creator=lom|frt|oltc|macierz` — ekrany z pełnym
 * wywodem akademickim (WHITE BOX/KaTeX) na realnych komponentach.
 * Sceny rundy dowodowej V-B (pełne wywody na żywych ekranach wyników):
 * `kompensacja-wynik|sila-sieci|odbior-zgodnosc|estymacja|ssci|migotanie`
 * (scena „odbior-zgodnosc" = ekran „Zgodność powykonawcza"; nazwa `odbior`
 * pozostaje zajęta przez kreator odbioru nN — kolizja nazw scen).
 * Używany wyłącznie przez: e2e/creator-screenshot.spec.ts (nie część bundla aplikacji).
 */

import { createRoot } from 'react-dom/client';
// Ten sam dostawca React Query co `main.tsx` (jeden klient z `./query-client`):
// komponenty montowane w harnessie czytają katalogi backendu przez `useQuery`
// (od karty FAB-J m.in. kreator OZE i snapshot audytu 2) — bez dostawcy strona
// harnessu padała przy montażu i korzeń z `data-status` nigdy nie powstawał
// (5 czerwonych specyfikacji `creator-screenshot` w CI). Klasa: KAŻDE wejście
// `*-harness-main.tsx`, nie tylko kreatora.
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './query-client';
import './ui2/theme/tokens.css';
// Warstwa `ui/**` (powierzchnie E-2x) stoi na Tailwindzie z `index.css`; bez tego
// arkusza scena renderuje sie BEZ STYLOW i zrzut nie pokazuje tego, co widzi projektant.
// Import jest globalny (Vite nie laduje CSS warunkowo), wiec sceny ui2 dostaja go tez —
// maja wlasne tokeny i klasy, wiec kolizji nie ma, ale to jest powod, dla ktorego
// arkusz jest tu wymieniony jawnie zamiast „przy okazji".
import './index.css';
// Scena „swiezosc" renderuje CaseBar poza AppShell — style paska ładuje shell.css.
import './ui2/shell/shell.css';

import { KreatorKompensatoraSn } from './ui2/kreatory/kompensator';
import { KreatorMagistralaSn } from './ui2/kreatory/magistrala';
import { KreatorOdbioruNn } from './ui2/kreatory/odbior';
import { KreatorPolaSn } from './ui2/kreatory/pole';
import { KreatorStacjiSnNn } from './ui2/kreatory/stacja';
import { KreatorTransformatoraSnNn } from './ui2/kreatory/transformator';
import { KreatorZrodloZasilania } from './ui2/kreatory/zrodlo';
import { KreatorZrodlaOze } from './ui2/kreatory/zrodlo-oze';
// Fala P-4/P-5 — 9 kreatorów ui2 (karta Z-2, dowody wizualne).
import { KreatorZrodloDyspozycyjne } from './ui2/kreatory/zrodlo-dyspozycyjne';
import { KreatorOdgalezienia } from './ui2/kreatory/odgalezienie';
import { KreatorSlupaOdgaleznego } from './ui2/kreatory/slup-odgalezny';
import { KreatorZksn } from './ui2/kreatory/zksn';
import { KreatorPrzekaznika } from './ui2/kreatory/przekaznik';
import { KreatorPomiaru } from './ui2/kreatory/pomiar';
import { KreatorPolaNn } from './ui2/kreatory/pole-nn';
import { KreatorPrzypisaniaKatalogu } from './ui2/kreatory/przypisanie-katalogu';
import { KreatorEdycjiParametrow } from './ui2/kreatory/edycja-parametrow';
import {
  SekcjaArcFlash,
  SekcjaMigotania,
  SekcjaWalidacji,
  SekcjaWytrzymaloscCieplna,
} from './ui2/wyniki/jakosc/EkranJakosci';
import { EkranOdbioru } from './ui2/wyniki/odbior';
import { EkranEstymacji } from './ui2/wyniki/estymacja';
import { EkranSsci } from './ui2/wyniki/ssci';
import { EkranAnalizAkademickich } from './ui2/wyniki/akademickie';
// V126-JEZYK: scena "wyniki-warsztat" sluzy POMIAROWI UKLADU paska zakladek
// (defekt ze zrzutu 3/3 wlasciciela: pasek wyjezdzal poza kadr) przy realnych
// szerokosciach 1280/1440/1920 px - jsdom ukladu nie prowadzi.
import { WynikiWarsztat } from './ui2/spaces/wyniki/WynikiWarsztat';
// V126-JEZYK: scena "akademickie" karmiona REALNYMI odpowiedziami solvera
// (ta sama fixtura, na ktorej stoi straznik prezentacji) - zrzut pokazuje
// dokladnie to, co zobaczy projektant, a nie wyidealizowana atrape.
import odpowiedziV126 from './ui2/wyniki/akademickie/__tests__/odpowiedziSolvera.json';
// E2E-FULL-FIX-3 (2026-09-10): atrapy końcówek czytających STAN przypadku (committed
// ENM, rejestr przebiegów) liczy BACKEND — `scripts/eksport_fixtur_harnessu.py` tymi
// samymi funkcjami, co trasy; JSON w repo pilnuje `tests/ci/test_fixtury_harnessu.py`.
import zgodnoscPrzekrojowaScenyMacierz from './harness-fixtures/generated/ncrfg_zgodnosc_przekrojowa_scena_macierz.json';
import werdyktProjektowyScenyUwaga from './harness-fixtures/generated/werdykt_projektowy_scena_uwaga.json';
// B-02 / W3-E (2026-09-10): katalog kart „Analizy specjalistyczne", gotowość analiz
// (bez parametrów i z parametrami sceny) oraz werdykty scen ekranu „Ocena techniczna
// wyników" — policzone BACKENDEM tym samym skryptem (realne biegi PF/SC złotej sieci,
// identyfikatory biegów stabilizowane). Migawka z nazwami sieci złotej — jedno
// miejsce z atrapą testów jednostkowych.
import katalogAnalizV126 from './harness-fixtures/generated/katalog_analiz_v126.json';
import gotowoscV126ScenyAkademickie from './harness-fixtures/generated/gotowosc_v126_scena_akademickie.json';
import gotowoscV126ScenyAkademickieParametry from './harness-fixtures/generated/gotowosc_v126_scena_akademickie_parametry.json';
import werdyktProjektowyScenyOcena from './harness-fixtures/generated/werdykt_projektowy_scena_ocena.json';
import werdyktProjektowyScenyOcenaPrzekroczenia from './harness-fixtures/generated/werdykt_projektowy_scena_ocena_przekroczenia.json';
// HARNESS-ZWARCIA-Z-BACKENDU (2026-09-16): sceny „zwarcia"/„zwarcia-rozplyw"
// karmione WYŁĄCZNIE wynikami REALNEGO biegu backendu (short_circuit_sn na
// sieci złotej `build_golden_enm`, `eksport_fixtur_harnessu.py` — DOKŁADNIE
// tymi funkcjami, które wołają końcówki `/results/short-circuit`,
// `/results/short-circuit/rozplyw`, `/results/short-circuit/pasmo` i
// `/api/proof/sc3f/contributions`) — zero ręcznie wpisanych liczb fizycznych,
// zastępuje dawne `run-sc-2`/`run-sc-th1-demo`.
import zwarciaWynikiScenyZwarcia from './harness-fixtures/generated/zwarcia_wyniki_scena_zwarcia.json';
import zwarciaWkladyScenyZwarcia from './harness-fixtures/generated/zwarcia_wklady_scena_zwarcia.json';
import zwarciaRozplywScenyZwarcia from './harness-fixtures/generated/zwarcia_rozplyw_scena_zwarcia.json';
import zwarciaPasmoScenyZwarcia from './harness-fixtures/generated/zwarcia_pasmo_scena_zwarcia.json';
// HARNESS-RESZTA (2026-09-16): sceny "wyniki-stan-fazowy"/"wyniki-stabilnosc"
// (E-31/E-32) karmione WYLACZNIE wynikami REALNEGO biegu backendu
// (phase_state_sn / dynamic_stability na sieci zlotej,
// `eksport_fixtur_harnessu.py` — DOKLADNIE tymi funkcjami, ktore woluja
// koncowki `/results/phase-state`, `/results/dynamic-stability`,
// `/results/automation-trace`) — zero recznie wpisanych liczb fizycznych.
import stanFazowyScenyWyniki from './harness-fixtures/generated/stan_fazowy_scena_wyniki.json';
import stabilnoscScenyWyniki from './harness-fixtures/generated/stabilnosc_scena_wyniki.json';
import stabilnoscScenySlad from './harness-fixtures/generated/stabilnosc_scena_slad.json';
// HARNESS-RESZTA (kontynuacja, 2026-09-16): sceny "sila-sieci"/"migotanie"
// (short_circuit_sn z catalog_ref na gen_pv), "kompensacja(-wynik)"/
// "rozplyw"/"walidacja"/"uwaga" (PF), "cieplna"/"arcflash" (reuzywaja bieg
// kotwicy sceny "zwarcia") — WYLACZNIE realny bieg backendu.
import silaSieciScenyWynik from './harness-fixtures/generated/sila_sieci_scena_wynik.json';
import migotanieScenyWynik from './harness-fixtures/generated/migotanie_scena_wynik.json';
import kompensacjaScenyWynik from './harness-fixtures/generated/kompensacja_scena_wynik.json';
import rozplywScenyWynik from './harness-fixtures/generated/rozplyw_scena_wynik.json';
import walidacjaScenyWynik from './harness-fixtures/generated/walidacja_scena_wynik.json';
import cieplnaScenyWynik from './harness-fixtures/generated/cieplna_scena_wynik.json';
import cieplnaScenyDowod from './harness-fixtures/generated/cieplna_scena_dowod.json';
import arcflashScenyWynik from './harness-fixtures/generated/arcflash_scena_wynik.json';
import { REWIZJA_SIECI_ZLOTEJ, migawkaSieciZlotej } from './harness-fixtures/migawkaSieciZlotej';
import { EkranOceny } from './ui2/wyniki/ocena';
import { SekcjaSilySieci } from './ui2/oze/pulpit';
import { EkranRozplywu } from './ui2/wyniki/rozplyw';
import { EkranZwarc } from './ui2/wyniki/zwarcia';
import { EkranPorownania } from './ui2/wyniki/porownanie';
import { useResultsInspectorStore } from './ui/results-inspector/store';
import { EkranFrt, EkranKompensacji, EkranLom, MacierzNcRfg } from './ui2/oze';
import { EkranBadanOltc } from './ui2/wyniki/oltc';
import { EkranKoordynacji } from './ui2/wyniki/koordynacja';
import { EkranSkladowych } from './ui2/wyniki/skladowe';
import { EkranZbieznosci } from './ui2/wyniki/zbieznosc';
import { EkranStanuFazowego } from './ui2/wyniki/stan-fazowy';
import { EkranStabilnosci } from './ui2/wyniki/stabilnosc';
import { useShellStore } from './ui2/shell/useShellStore';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  selectAllDers,
  useStationDerStore,
  type StationDerConnection,
} from './ui/network-build/station-der';
import { PvSourceSurface } from './ui/workspace/surfaces/DerSurfaces';
import { HubDokumentacji } from './ui2/spaces/dokumentacja';
import { PulpitProjektu } from './ui2/spaces/projekt';
import { PanelDiagnozy } from './ui2/spaces/obliczenia/diagnoza';
import {
  diagnostykaZBrakamiFixture,
  diagnozaNiezbieznaFixture,
  preflightZablokowanyFixture,
} from './ui2/spaces/obliczenia/diagnoza/__tests__/fixtures';
import { EkranCoWymagaUwagi } from './ui2/wyniki/co-wymaga-uwagi';
import { CaseBar } from './ui2/shell/CaseBar';
import { useShellCaseInfo } from './ui2/shell/shellStatus';
import { useAppStateStore } from './ui/app-state';
import { useSnapshotStore } from './ui/topology/snapshotStore';
import { useNetworkBuildStore } from './ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from './ui/study-cases/runStore';
import { useStudyCasesStore } from './ui/study-cases/store';
import { usePowerFlowResultsStore } from './ui/power-flow-results/store';
import type { ExecutionRun } from './ui/study-cases/types';

// --- Motyw ---------------------------------------------------------------
/**
 * Scena „pulpit": JEDEN kontrakt przebiegu zakresu K1 — czyta go i atrapa listy
 * przebiegow (`listRuns` wolane przez `useWszystkiePrzebiegiProjektu`), i zasiew
 * `useExecutionRunsStore`. Dwa niezalezne literaly tego samego biegu (stan sprzed
 * tej stalej) to dwa zrodla prawdy: rozjazd identyfikatora rozspaja kafel
 * „Ostatni przebieg" z rejestrem, a zapadka literalow harnessu liczy go dwa razy.
 */
const PULPIT_PRZEBIEG_K1 = {
  id: 'run-lf-2',
  study_case_id: 'K1',
  analysis_type: 'LOAD_FLOW',
  status: 'DONE',
  started_at: '2026-07-21T18:05:00Z',
  finished_at: '2026-07-21T18:05:04Z',
  solver_input_hash: 'pulpit-lf2',
  error_message: null,
} as const;

const theme = new URLSearchParams(window.location.search).get('theme') === 'light'
  ? 'light_technical'
  : 'dark_scada';
document.documentElement.setAttribute('data-theme', theme);
document.body.style.background = theme === 'light_technical' ? '#f5f7fa' : '#07111c';

// --- Podmiana fetch: dane katalogowe -------------------------------------
// Karta FAB-L (§0 L6, 2026-09-05): USUNIĘTE — `CATALOG_FIXTURES` mockowało 18
// tras katalogowych bezstanowych/deterministycznych (mv-apparatus-types,
// bay-apparatus-kinds, bay-protection-codes, manufacturers,
// mv-protection-device-types, transformer-types, switchgear-families +
// factory-configurations, lv-apparatus-types, pv/bess/wind-inverter-types,
// cable-types, line-types, source-system-types, branch-point-types,
// protection/device-types, ct-types, vt-types) — częściowo REALNYMI danymi
// (1:1 z backendem), częściowo identyfikatorami ZMYŚLONYMI (`pv-1`, `bess-1`,
// `fw-1`, `rel-1`, `ct-1`, `vt-1`, `lv-1`, `kab-120`…), które walidator
// backendu odrzucał, gdy scena próbowała je faktycznie zapisać. Druga kopia
// katalogu, który backend i tak serwuje deterministycznie — ten sam defekt
// klasy, który E2E-FULL-FIX (2026-09-05) zamknął dla `/api/ncrfg-tests/catalog`
// (patrz komentarz przy `originalFetch` niżej). Trasy idą dziś do REALNEGO
// backendu przez proxy Vite (`vite.config.ts`) — brak wpisu w tej funkcji
// oznacza właśnie to (fallthrough do `originalFetch` na końcu pliku).
// Dane scen, które odwoływały się do zmyślonych identyfikatorów, przepisane na
// identyfikatory realne (patrz historia zmian tej karty) — parytet pilnowany
// testem `backend/tests/e2e/test_creator_harness_katalogi_parytet.py`.

// --- Fixture'y scen dowodowych E-29..E-32 (karta Z-1) ----------------------
// Wartości przepisane 1:1 z kontraktów backendu (te same kształty, co w testach
// jednostkowych modułów). ZERO fizyki w harnessie — liczby pochodzą z solvera/
// śladu/snapshotu; harness jedynie serwuje odpowiedzi zamiast żywego backendu.

// E-29 „Składowe symetryczne i sieć zerowa" (ui2/wyniki/skladowe):
//  short-circuit (bilans F1 + werdykt), trace (krok „Zk" ze składowymi Z1/Z2/Z0),
//  snapshot (uziemienie punktu neutralnego).
const SKLADOWE_WYNIK = {
  run_id: 'run-1f',
  rows: [
    {
      target_id: 'node-1',
      element_id: 'bus/gpz/sn',
      target_name: 'Szyna GPZ',
      // Liczby SPÓJNE ze składowymi śladu (Z1=Z2=0,1+j0,4; Z0=0,3+j0,9):
      // ΣZ = 0,5+j1,7 → |Zk|=1,7720 Ω; Ik1″=√3·c·Un/|ΣZ|=√3·1,1·15000/1,7720=16,128 kA;
      // X/R=1,7/0,5=3,400; κ=1,02+0,98·e^(−3·0,5/1,7)=1,4255; ip=κ·√2·Ik″=32,51 kA.
      ikss_ka: 16.128,
      ip_ka: 32.51,
      ith_ka: 16.2,
      sk_mva: 419.0,
      fault_type: '1F',
      flags: [],
      rk_ohm: 0.5,
      xk_ohm: 1.7,
      zk_ohm: 1.772,
      xr_ratio: 3.4,
      kappa: 1.4255,
      c_factor: 1.1,
      tk_s: 1.0,
      reporting_status: 'reportable',
      reporting_status_pl: 'raportowalny',
      proof_status_pl: 'pelny',
      reporting_limitations: [],
    },
  ],
};

const SKLADOWE_SLAD = {
  run_id: 'run-1f',
  snapshot_id: 'snap-1',
  input_hash: 'hash-1',
  catalog_context: [],
  white_box_trace: [
    {
      key: 'Zk',
      step: 1,
      target_id: 'node-1',
      title: 'Impedancja zastępcza w punkcie zwarcia',
      formula_latex: 'Z_k = Z_1 + Z_2 + Z_0',
      // Pełne podstawienie dyplomowe (wzór → liczby → wynik z jednostką),
      // spójne z wierszem bilansu (|Zk|=1,7720 Ω).
      substitution:
        'Z_k = (0{,}1 + j\\,0{,}4) + (0{,}1 + j\\,0{,}4) + (0{,}3 + j\\,0{,}9) = 0{,}5 + j\\,1{,}7\\ \\Omega,\\quad |Z_k| = 1{,}7720\\ \\Omega',
      inputs: {
        z1_ohm: { re: 0.1, im: 0.4 },
        z2_ohm: { re: 0.1, im: 0.4 },
        z0_ohm: { re: 0.3, im: 0.9 },
      },
    },
  ],
};

const SKLADOWE_SNAPSHOT = {
  run_id: 'run-1f',
  snapshot_id: 'snap-1',
  snapshot: {
    buses: [
      {
        id: 'b1',
        ref_id: 'bus/gpz/sn',
        name: 'Szyna GPZ',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
    ],
    // W5-A: punkt neutralny sieci SN żyje na ŹRÓDLE stojącym na szynie
    // (`Source.neutral_grounding`), nie na szynie — `Bus.grounding` skasowane.
    sources: [
      {
        id: 's1',
        ref_id: 'src/gpz',
        name: 'Zasilanie GPZ',
        tags: [],
        meta: {},
        bus_ref: 'bus/gpz/sn',
        model: 'short_circuit_power',
        neutral_grounding: { type: 'petersen_coil', x_ohm: 120 },
      },
    ],
    transformers: [],
  },
};

// E-30 „Zbieżność rozpływu i zaczepy" (ui2/wyniki/zbieznosc): header + wynik
// rozpływu (summary) + ślad (iteracje + pętla OLTC).
const ZBIEZNOSC_HEADER = {
  id: 'run-lf-1',
  project_id: 'proj-demo',
  study_case_id: 'case-1',
  status: 'FINISHED',
  result_status: 'VALID',
  created_at: '2026-07-20T09:59:00Z',
  finished_at: '2026-07-20T10:00:00Z',
  input_hash: 'hash-1',
  converged: true,
  iterations: 4,
};

const ZBIEZNOSC_WYNIK = {
  result_version: '1.0',
  converged: true,
  iterations_count: 4,
  tolerance_used: 1e-6,
  base_mva: 100,
  slack_bus_id: 'BUS-GPZ',
  bus_results: [],
  branch_results: [],
  summary: {
    total_losses_p_mw: 0.1234,
    total_losses_q_mvar: 0.0456,
    min_v_pu: 0.978,
    max_v_pu: 1.012,
    slack_p_mw: 5.4321,
    slack_q_mvar: 1.2345,
  },
};

const ZBIEZNOSC_SLAD = {
  solver_version: 'load-flow-newton-raphson-v1',
  solver_method: 'newton-raphson',
  input_hash: 'hash-1',
  snapshot_id: 'snap-1',
  case_id: 'case-1',
  run_id: 'run-lf-1',
  init_state: {},
  init_method: 'flat_start',
  tolerance: 1e-6,
  max_iterations: 50,
  base_mva: 100,
  slack_bus_id: 'BUS-GPZ',
  pq_bus_ids: [],
  pv_bus_ids: [],
  // 4 iteracje SPÓJNE z werdyktem („zbieżny w 4 iteracjach") i tolerancją 1e-6
  // (ostatnia norma poniżej tolerancji).
  iterations: [
    { k: 1, norm_mismatch: 0.5, max_mismatch_pu: 0.2 },
    { k: 2, norm_mismatch: 0.012, max_mismatch_pu: 0.005 },
    { k: 3, norm_mismatch: 0.00035, max_mismatch_pu: 0.00011 },
    { k: 4, norm_mismatch: 8.7e-7, max_mismatch_pu: 2.9e-7 },
  ],
  converged: true,
  final_iterations_count: 4,
  oltc_control: {
    regulators: [
      {
        branch_id: 'uuid-tr-1',
        regulated_winding: 'HV',
        controlled_bus_id: 'BUS-SN',
        setpoint_kv: 15.2,
        deadband_kv: 0.2,
        initial_position: 0,
        min_position: -9,
        max_position: 9,
      },
    ],
    converged: true,
    iterations_count: 2,
    switch_counts: { 'uuid-tr-1': 2 },
    total_switch_count: 2,
    final_positions: { 'uuid-tr-1': -2 },
    initial_positions: { 'uuid-tr-1': 0 },
  },
};

const ZBIEZNOSC_SNAPSHOT = {
  header: { revision: 7, hash_sha256: 'abcdef1234567890' },
  buses: [],
  branches: [],
  transformers: [
    {
      ref_id: 'TR-1',
      name: 'TR 110/15',
      hv_bus_ref: 'B1',
      lv_bus_ref: 'B2',
      sn_mva: 16,
      uhv_kv: 110,
      ulv_kv: 15,
      uk_percent: 10,
      pk_kw: 80,
      tap_changer: {
        regulation_type: 'OLTC',
        regulated_winding: 'HV',
        neutral_position: 0,
        current_position: -1,
        min_position: -9,
        max_position: 9,
        step_percent: 1.25,
        control_mode: 'AUTOMATIC',
        voltage_setpoint_kv: 15.2,
        deadband_kv: 0.2,
      },
    },
  ],
  sources: [],
  loads: [],
  generators: [],
  substations: [],
  bays: [],
  junctions: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
};

// E-31 „Stan fazowy SN" (ui2/wyniki/stan-fazowy) i E-32 „Stabilność
// dynamiczna" (ui2/wyniki/stabilnosc): fixtury z REALNEGO biegu backendu —
// `stanFazowyScenyWyniki`/`stabilnoscScenyWyniki`/`stabilnoscScenySlad`
// zaimportowane u góry pliku (HARNESS-RESZTA, 2026-09-16).

/**
 * Scena E-28 „Koordynacja zabezpieczeń" (V12K-262). Do tej pory ekran TCC nie miał
 * ANI JEDNEJ sceny — najbardziej graficzny ekran systemu (krzywe czasowo-prądowe
 * log-log, marginesy CTI, werdykty par) nie był widziany przez żadną bramkę.
 *
 * Łańcuch odtworzony w całości, bo ekran go WYMAGA i nie da się go obejść:
 * zakończony bieg zwarciowy → wiersze wyniku dla szyn `bus_1`/`bus_2` → prądy
 * koordynacji (zero losowania, F-K4) → analiza → wynik z krzywymi. Kadr powstaje
 * po NATYWNYCH klikach (szablon urządzenia → uruchom analizę), a nie po wymuszeniu
 * stanu store — inaczej zrzut dowodziłby działania atrapy, nie ekranu.
 */
/**
 * Wiersze biegow zwarciowych sceny E-28.
 *
 * `element_id` to `ref_id` elementu ENM — DOKLADNIE ta przestrzen nazw, po ktorej
 * `pradyZBiegow` dopasowuje prady do urzadzenia (`canonical_analysis`:
 * `_build_snapshot_graph_element_context` ustawia `element_id = ref_id`).
 *
 * `c_factor` jest OBOWIAZKOWY: `podzielWierszeNaPrzypadki` klasyfikuje przypadek
 * maksymalny/minimalny wylacznie po nim (IEC 60909: c_max = 1,10, c_min = 0,95),
 * a koordynacja wymaga OBU. Wiersz bez `c_factor` nie trafia do zadnego zbioru —
 * scena bez tego pola pokazywala uczciwy, ale pusty stan „brak pradow".
 */
const KOORD_WIERSZE_SC_MAX = [
  {
    target_id: 'gpz/sekcja_a/bus_sn', element_id: 'gpz/sekcja_a/bus_sn',
    target_name: 'GPZ Wschod — szyna SN sekcja A',
    ikss_ka: 8.4, ip_ka: 21.0, ith_ka: 8.4, sk_mva: 218.2,
    fault_type: '3F', c_factor: 1.1, un_kv: 15.0, tk_s: 1.0, flags: [],
  },
  {
    target_id: 'stacja_s02/bus_sn', element_id: 'stacja_s02/bus_sn',
    target_name: 'Stacja S02 — szyna SN',
    ikss_ka: 3.1, ip_ka: 7.6, ith_ka: 3.1, sk_mva: 80.5,
    fault_type: '3F', c_factor: 1.1, un_kv: 15.0, tk_s: 1.0, flags: [],
  },
];

const KOORD_WIERSZE_SC_MIN = [
  {
    target_id: 'gpz/sekcja_a/bus_sn', element_id: 'gpz/sekcja_a/bus_sn',
    target_name: 'GPZ Wschod — szyna SN sekcja A',
    ikss_ka: 6.9, ip_ka: 17.2, ith_ka: 6.9, sk_mva: 179.3,
    fault_type: '3F', c_factor: 0.95, un_kv: 15.0, tk_s: 1.0, flags: [],
  },
  {
    target_id: 'stacja_s02/bus_sn', element_id: 'stacja_s02/bus_sn',
    target_name: 'Stacja S02 — szyna SN',
    ikss_ka: 2.4, ip_ka: 5.9, ith_ka: 2.4, sk_mva: 62.4,
    fault_type: '3F', c_factor: 0.95, un_kv: 15.0, tk_s: 1.0, flags: [],
  },
];

const KOORD_WYNIKI_GALEZI = {
  run_id: 'run-lf-koord',
  rows: [
    {
      branch_id: 'gpz/sekcja_a/bus_sn', element_id: 'gpz/sekcja_a/bus_sn',
      name: 'Pole liniowe GPZ → S02',
      from_bus: 'gpz/sekcja_a/bus_sn', to_bus: 'stacja_s02/bus_sn',
      i_a: 154.0, s_mva: 4.0, p_mw: 3.9, q_mvar: 0.8, loading_pct: 38.5, flags: [],
    },
    {
      branch_id: 'stacja_s02/bus_sn', element_id: 'stacja_s02/bus_sn',
      name: 'Pole liniowe S02 → odbiory',
      from_bus: 'stacja_s02/bus_sn', to_bus: 'stacja_s03/bus_sn',
      i_a: 96.0, s_mva: 2.5, p_mw: 2.4, q_mvar: 0.5, loading_pct: 24.0, flags: [],
    },
  ],
};

/**
 * Migawka modelu przypadku — zrodlo LISTY WYBORU lokalizacji (V12K-262).
 * Tylko pola, ktore czyta `lokalizacjeKoordynacji`; `ref_id` zgodne z wierszami
 * wynikow, bo to jedna przestrzen nazw.
 */
const KOORD_MIGAWKA_MODELU = {
  header: { schema_version: '1.0', project_id: 'proj-demo' },
  buses: [
    {
      id: 'b1', ref_id: 'gpz/sekcja_a/bus_sn', name: 'GPZ Wschod — szyna SN sekcja A',
      voltage_kv: 15.0, phase_system: '3ph', tags: [], meta: {},
    },
    {
      id: 'b2', ref_id: 'stacja_s02/bus_sn', name: 'Stacja S02 — szyna SN',
      voltage_kv: 15.0, phase_system: '3ph', tags: [], meta: {},
    },
  ],
  branches: [
    {
      id: 'l1', ref_id: 'lin/gpz_s02', name: 'Magistrala GPZ → S02',
      from_bus_ref: 'gpz/sekcja_a/bus_sn', to_bus_ref: 'stacja_s02/bus_sn',
      status: 'closed', type: 'line_overhead', tags: [], meta: {},
    },
  ],
  transformers: [],
  sources: [], loads: [], generators: [], substations: [], bays: [], junctions: [],
  corridors: [], measurements: [], protection_assignments: [],
};

const KOORD_KRZYWA_NADRZEDNA = [
  { current_a: 480, current_multiple: 1.0, time_s: 100 },
  { current_a: 960, current_multiple: 2.0, time_s: 3.4 },
  { current_a: 1920, current_multiple: 4.0, time_s: 1.05 },
  { current_a: 3840, current_multiple: 8.0, time_s: 0.52 },
  { current_a: 8400, current_multiple: 17.5, time_s: 0.33 },
];

const KOORD_KRZYWA_PODRZEDNA = [
  { current_a: 240, current_multiple: 1.0, time_s: 100 },
  { current_a: 480, current_multiple: 2.0, time_s: 1.9 },
  { current_a: 960, current_multiple: 4.0, time_s: 0.58 },
  { current_a: 1920, current_multiple: 8.0, time_s: 0.29 },
  { current_a: 3100, current_multiple: 12.9, time_s: 0.22 },
];

const KOORD_WYNIK = {
  run_id: 'run-koord-1',
  project_id: 'proj-demo',
  sensitivity_checks: [
    {
      device_id: 'dev-nadrzedne', analysis_current_a: 2900, pickup_current_a: 480,
      sensitivity_ratio: 6.04, required_ratio: 1.5, verdict: 'PASS',
      verdict_pl: 'Czułość zapewniona', notes_pl: 'Ik″ min 2,90 kA / I_pickup 480 A',
    },
    {
      device_id: 'dev-podrzedne', analysis_current_a: 1200, pickup_current_a: 240,
      sensitivity_ratio: 5.0, required_ratio: 1.5, verdict: 'PASS',
      verdict_pl: 'Czułość zapewniona', notes_pl: 'Ik″ min 1,20 kA / I_pickup 240 A',
    },
  ],
  selectivity_checks: [
    {
      upstream_device_id: 'dev-nadrzedne', downstream_device_id: 'dev-podrzedne',
      analysis_current_a: 3100, t_upstream_s: 0.33, t_downstream_s: 0.22,
      margin_s: 0.11, required_margin_s: 0.3, verdict: 'FAIL',
      verdict_pl: 'Brak selektywności',
      notes_pl: 'Margines CTI 0,11 s poniżej wymaganych 0,30 s przy Ik″ 3,10 kA',
    },
  ],
  overload_checks: [
    {
      device_id: 'dev-nadrzedne', operating_current_a: 154, pickup_current_a: 480,
      margin_ratio: 3.12, verdict: 'PASS', verdict_pl: 'Brak zadziałania',
      notes_pl: 'I_robocze 154 A / I_pickup 480 A',
    },
    {
      device_id: 'dev-podrzedne', operating_current_a: 154, pickup_current_a: 240,
      margin_ratio: 1.56, verdict: 'PASS', verdict_pl: 'Brak zadziałania',
      notes_pl: 'I_robocze 154 A / I_pickup 240 A',
    },
  ],
  tcc_curves: [
    {
      device_id: 'dev-nadrzedne', device_name: 'Zabezpieczenie nadrzędne GPZ (50/51)',
      curve_type: 'IEC_SI', pickup_current_a: 480, time_multiplier: 0.3,
      color: '#2563eb', points: KOORD_KRZYWA_NADRZEDNA,
    },
    {
      device_id: 'dev-podrzedne', device_name: 'Zabezpieczenie pola S02 (50/51)',
      curve_type: 'IEC_SI', pickup_current_a: 240, time_multiplier: 0.18,
      color: '#dc2626', points: KOORD_KRZYWA_PODRZEDNA,
    },
  ],
  fault_markers: [
    {
      id: 'fm-3f', label_pl: 'Ik″ 3-fazowe (Stacja S02)', current_a: 3100,
      fault_type: '3F', location: 'stacja_s02/bus_sn',
    },
    {
      id: 'fm-1f', label_pl: 'Ik″ 1-fazowe (Stacja S02)', current_a: 1200,
      fault_type: '1F', location: 'stacja_s02/bus_sn',
    },
  ],
  overall_verdict: 'FAIL',
  overall_verdict_pl: 'Brak selektywności w jednej parze',
  created_at: '2026-07-28T08:10:00Z',
  // `trace_steps` NIE JEST opcjonalne w kontrakcie (`CoordinationResult`) —
  // backend zawsze je emituje (`protection_coordination.py`: `result.get(..., [])`).
  // Scena bez tego pola wywracala CALY ekran bialym ekranem; od V12K-262 klient
  // API nazywa taki rozjazd, a atrapa trzyma pelny ksztalt.
  trace_steps: [
    {
      step: 'wejscia',
      description_pl: 'Prądy zwarciowe z biegów c = 1,10 i c = 0,95; prąd roboczy z rozpływu.',
      inputs: { ik_max_a: 8400, ik_min_a: 6900, i_rob_a: 154.0 },
      outputs: { pary_do_sprawdzenia: 1 },
    },
    {
      step: 'selektywnosc',
      description_pl: 'Różnica czasów zadziałania pary przy prądzie zwarciowym odbioru.',
      inputs: { t_nadrzedne_s: 0.33, t_podrzedne_s: 0.22 },
      outputs: { delta_t_s: 0.11, wymagane_s: 0.3 },
    },
  ],
  summary: {
    total_devices: 2,
    total_checks: 5,
    sensitivity: { pass: 2, marginal: 0, fail: 0, error: 0 },
    selectivity: { pass: 0, marginal: 0, fail: 1, error: 0 },
    overload: { pass: 2, marginal: 0, fail: 0, error: 0 },
    overall_verdict: 'FAIL',
    overall_verdict_pl: 'Brak selektywności w jednej parze',
  },
};

const DOBOR_FUNKCJI_WIAZANIA = {
  generator_ref: 'der-pv-1',
  bay_ref: 'bay-pv-1',
  fakty: {
    connection_side: 'SN',
    neutral_grounding_mode: 'petersen_coil',
    zero_sequence_current_source: 'przekladnik_ferrantiego',
    zero_sequence_voltage_source: 'brak',
  },
  dobor: {
    wymagane: [
      {
        kod: '50',
        nazwa_pl: 'Nadprądowe bezzwłoczne (I>>)',
        podstawa_pl: 'Szybkie wyłączenie zwarć międzyfazowych w polu wytwórcy (IEC 60255-151).',
        chroniony_obiekt_pl: 'pole wytwórcy DER-1',
        zrodlo_pomiaru_pl: 'przekładniki prądowe fazowe pola',
      },
      {
        kod: '51',
        nazwa_pl: 'Nadprądowe zwłoczne (I>)',
        podstawa_pl: 'Rezerwa dla zwarć o mniejszym prądzie i przeciążeń toru.',
        chroniony_obiekt_pl: 'pole wytwórcy DER-1',
        zrodlo_pomiaru_pl: 'przekładniki prądowe fazowe pola',
      },
      {
        kod: '50G',
        nazwa_pl: 'Ziemnozwarciowe z przekładnika ziemnozwarciowego',
        podstawa_pl:
          'Prąd zerowy mierzony przekładnikiem obejmującym wszystkie żyły (rodzina G, '
          + 'nie N — wynika z zadeklarowanego toru pomiaru).',
        chroniony_obiekt_pl: 'pole wytwórcy DER-1',
        zrodlo_pomiaru_pl: 'przekładnik ziemnozwarciowy (Ferrantiego)',
      },
      {
        kod: '27',
        nazwa_pl: 'Podnapięciowe',
        podstawa_pl: 'Wykrycie pracy wyspowej i zapadu napięcia (NC RfG Art. 14).',
        chroniony_obiekt_pl: 'wytwórca DER-1',
        zrodlo_pomiaru_pl: 'przekładnik napięciowy pola',
      },
      {
        kod: '81U',
        nazwa_pl: 'Podczęstotliwościowe',
        podstawa_pl: 'Zabezpieczenie anty-wyspowe częstotliwościowe (NC RfG Art. 13).',
        chroniony_obiekt_pl: 'wytwórca DER-1',
        zrodlo_pomiaru_pl: 'przekładnik napięciowy pola',
      },
    ],
    kwestie_otwarte: [
      {
        kod: 'protection.zero_sequence_voltage_missing',
        opis_pl: 'Model nie opisuje toru napięcia zerowego (otwarty trójkąt albo uzwojenie resztkowe).',
        skutek_pl:
          'Bez niego kryterium KIERUNKOWE ziemnozwarciowe (67N) nie jest wyprowadzane — '
          + 'w sieci kompensowanej to ono rozstrzyga kierunek zwarcia.',
      },
      {
        kod: 'protection.osd_requirements_not_modelled',
        opis_pl: 'Model nie niesie wymagań zabezpieczeniowych operatora sieci.',
        skutek_pl: 'Zweryfikuj listę z warunkami przyłączenia przed projektem nastaw.',
      },
    ],
  },
  urzadzenie: {
    protection_catalog_ref: 'ABB_REB670',
    nazwa: 'ABB Relion REB670',
    brakujace_funkcje: ['50G', '81U'],
    ostrzezenia_przeznaczenia: [
      'ABB Relion REB670 deklaruje funkcję 87B (różnicowe szyn zbiorczych), która należy '
      + 'do innej strefy zabezpieczeniowej niż pole wytwórcy — sprawdź, czy to właściwy '
      + 'wybór dla tego pola.',
    ],
    pokrywa_wymagania: false,
  },
};

const DOBOR_PRZEKLADNIKOW_WIAZANIA = {
  generator_ref: 'der-pv-1',
  bay_ref: 'bay-pv-1',
  wejscia: {
    napiecie_sieci_v: 15000.0,
    prad_roboczy_a: 308.0,
    ik_ka: null,
    ip_ka: null,
    run_ref_zwarciowy: null,
    tryb_uziemienia: 'cewka_petersena',
    zrodlo_napiecia_zerowego: 'brak',
    zrodlo_wejsc_urzadzenia: 'szereg_preferowany_IEC_60255_1',
  },
  przekladnik_pradowy: {
    catalog_ref: 'ct_200_5_5p10_10va_abb',
    nazwa: 'CT 200/5 A kl. 5P10 10 VA',
    wynik: {
      kryteria: [
        {
          kod: 'ct.przekladnia',
          nazwa_pl: 'Przekładnia wobec prądu roboczego toru',
          podstawa_pl: 'Prąd pierwotny przekładnika musi pokryć prąd roboczy toru.',
          werdykt: 'niespelnione',
          wymagane: '308.0 A',
          dostepne: '200.0 A',
          komentarz_pl:
            'Prąd roboczy przekracza prąd pierwotny — przekładnik pracowałby w '
            + 'przeciążeniu, a pomiar byłby zafałszowany.',
          // Karta W3-B: pola addytywne kontraktu `KryteriumDoboru.to_dict` (kody gotowosci
          // z jadra `ct_burden_saturation` + slad WHITE BOX) — puste dla kryteriow bez wlasnego jadra.
          kody_gotowosci: [],
          slad: [],
        },
        {
          kod: 'ct.rodzaj_rdzenia',
          nazwa_pl: 'Rodzaj rdzenia',
          podstawa_pl:
            'Funkcje zabezpieczeniowe wymagają rdzenia zabezpieczeniowego (IEC 61869-2).',
          werdykt: 'spelnione',
          wymagane: 'rdzeń zabezpieczeniowy (klasa z literą P)',
          dostepne: '5P10',
          komentarz_pl: null,
          // Karta W3-B: pola addytywne kontraktu `KryteriumDoboru.to_dict` (kody gotowosci
          // z jadra `ct_burden_saturation` + slad WHITE BOX) — puste dla kryteriow bez wlasnego jadra.
          kody_gotowosci: [],
          slad: [],
        },
        {
          kod: 'ct.wytrzymalosc_cieplna',
          nazwa_pl: 'Wytrzymałość cieplna zwarciowa',
          podstawa_pl: 'Ith ≥ Ik″·√tk — równoważność cieplna prądu zwarcia (IEC 61869-2).',
          werdykt: 'brak_danych',
          wymagane: null,
          dostepne: '20.0 kA / 1 s',
          komentarz_pl:
            'Brakuje prądu zwarciowego, czasu jego trwania albo prądu cieplnego przekładnika.',
          // Karta W3-B: pola addytywne kontraktu `KryteriumDoboru.to_dict` (kody gotowosci
          // z jadra `ct_burden_saturation` + slad WHITE BOX) — puste dla kryteriow bez wlasnego jadra.
          kody_gotowosci: [],
          slad: [],
        },
      ],
      dobor_potwierdzony: false,
      liczba_niespelnionych: 1,
      liczba_bez_danych: 1,
    },
  },
  przekladnik_napieciowy: { catalog_ref: null, nazwa: null, wynik: null },
};

/**
 * K3-B2: scena → identyfikator przebiegu, którego kontrakt (GET
 * /api/analysis-runs/<id>) zasila znacznik świeżości nagłówka. Wartości
 * odpowiadają 1:1 runId z zasiewu store'ów danej sceny (niżej w pliku);
 * scena „cieplna" celowo dostaje wynik na rev. 1 przy migawce rev. 2
 * (wariant NIEAKTUALNY, K3-B3).
 */
const RUN_KONTRAKT_SCENY: Record<string, string> = {
  // K3-B3: scena „cieplna" jest CELOWO wariantem NIEAKTUALNYM znacznika
  // świeżości (migawka rev. 2 vs kontrakt biegu rev. 1, patrz zasiew sceny
  // niżej) — 'run-sc-7' zostaje stałą etykietą TEGO scenariusza (nie
  // identyfikatorem żadnego liczonego biegu), zmiana na realny run_id
  // złamałaby dowodzony wariant „nieaktualne" bez żadnej korzyści (kontrakt
  // treści cieplnej — `cieplna_scena_wynik.json` — czyta OSOBNY endpoint,
  // niezależny od tej etykiety).
  cieplna: 'run-sc-7',
  // HARNESS-ZWARCIA-Z-BACKENDU / HARNESS-RESZTA: sceny czytają TEN SAM bieg
  // kotwicy realnego backendu (`*.run_id`/`*.context.run_id`), nie ręczne id.
  'zwarcia-rozplyw': zwarciaWynikiScenyZwarcia.run_id,
  zwarcia: zwarciaWynikiScenyZwarcia.run_id,
  rozplyw: rozplywScenyWynik.run_id,
  walidacja: walidacjaScenyWynik.context.run_id,
  estymacja: 'run-lf-6',
  'odbior-zgodnosc': 'run-lf-5',
  // Ekran zbieznosci dostal znacznik swiezosci naglowka (karta wynikow), wiec
  // od tej chwili WOLA kontrakt przebiegu. Bez wpisu zapytanie szlo do realnego
  // backendu i wracalo 404 — bramka „zero bledow konsoli" specow zrzutowych
  // slusznie to lapala. Wartosc czytana z TEGO SAMEGO bytu, ktory scena zasiewa
  // (`ZBIEZNOSC_HEADER.id`), zeby nie powstal drugi literal tego samego biegu;
  // przeniesienie sceny na fixture realnego biegu nalezy do karty harnessu.
  'wyniki-zbieznosc': ZBIEZNOSC_HEADER.id,
  arcflash: arcflashScenyWynik.context.run_id,
  migotanie: migotanieScenyWynik.context.run_id,
};

const originalFetch = window.fetch.bind(window);
/**
 * Konfiguracja zabezpieczeń przypadku zasiewu (`GET`/`PUT /api/study-cases/{id}/
 * protection-config`, P14c) — stan atrapy trzymany jak w backendzie (zapis widoczny
 * w kolejnym odczycie), kształt 1:1 z `domain/study_case.py::ProtectionConfig.to_dict`.
 */
let konfiguracjaZabezpieczenPrzypadku: Record<string, unknown> = {
  template_ref: null,
  template_fingerprint: null,
  library_manifest_ref: null,
  overrides: {},
  bound_at: null,
};
/**
 * Slad WHITE BOX sceny "akademickie" (V126-JEZYK) - ksztalt 1:1 z krokiem
 * `TraceBuilder.add` po naprawie u zrodla: kolumna "Wynik" niesie POLSKA
 * postac liczby z jednostka (`result_pl`), nie zrzut slownika.
 */
function sladDemoV126(rodzaj: string): Record<string, unknown>[] {
  const kroki: Record<string, Record<string, unknown>[]> = {
    earthing_safety: [
      {
        step: 1,
        key: 'ieee80_sverak',
        formula: 'Rg = rho * [1/Lc + 1/sqrt(20A)*(1 + 1/(1+h*sqrt(20/A)))]',
        data: { area_m2: 2400, lc_m: 1180, rho_ohm_m: 100 },
        substitution: 'R_g = 100 \u03a9\u00b7m \u00b7 (1/1180 m + cz\u0142on powierzchniowy siatki)',
        result: { r_g_ohm: 0.371939, gpr_kv: 1.784 },
        result_pl: 'Rezystancja uziomu: 0,371939 \u03a9; wzrost potencja\u0142u: 1,784 kV',
        unit_check:
          'Rezystywno\u015b\u0107 [\u03a9\u00b7m] razy odwrotno\u015b\u0107 d\u0142ugo\u015bci [1/m] daje rezystancj\u0119 [\u03a9]; '
          + 'pr\u0105d [kA] razy rezystancja [\u03a9] daje napi\u0119cie [kV].',
        proof_ref: 'proof:v126:earthing_safety:ieee80_sverak',
        proof_status: 'complete',
        reporting_status: 'reportable',
      },
    ],
    voltage_stability: [
      {
        step: 1,
        key: 'voltage_stability_indices',
        formula: 'L_j ~= P_load / S_sc * 4; PM = (lambda_max - 1) * 100%',
        data: { buses: 2 },
        substitution:
          'Dla ka\u017cdego w\u0119z\u0142a wyznaczono margines obci\u0105\u017calno\u015bci z krzywej P\u2013U, zapas mocy '
          + 'biernej z krzywej Q\u2013U oraz wska\u017anik blisko\u015bci za\u0142amania napi\u0119cia L.',
        result: { smallest_eigenvalue: 0.998667 },
        result_pl: 'Najmniejsza warto\u015b\u0107 w\u0142asna macierzy wra\u017cliwo\u015bci: 0,998667',
        unit_check: 'Wska\u017anik L jest bezwymiarowy; margines obci\u0105\u017calno\u015bci w %.',
        proof_ref: 'proof:v126:voltage_stability:voltage_stability_indices',
        proof_status: 'complete',
        reporting_status: 'reportable',
      },
    ],
  };
  return kroki[rodzaj] ?? kroki.voltage_stability;
}

window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // --- Sceny dowodowe E-29..E-32 (karta Z-1) ---------------------------------
  // Kształty odpowiedzi 1:1 z kontraktami backendu (te same fixture'y, których
  // używają testy jednostkowe modułów). Gate po `creator`, bo endpointy
  // rozpływu kolidują z szeroką regułą `/power-flow-runs` sceny „porownanie".
  const jsonOK = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  if (creator === 'wyniki-skladowe') {
    if (url.endsWith('/results/short-circuit')) return jsonOK(SKLADOWE_WYNIK);
    if (url.endsWith('/results/trace')) return jsonOK(SKLADOWE_SLAD);
    if (url.endsWith('/snapshot')) return jsonOK(SKLADOWE_SNAPSHOT);
  } else if (creator === 'wyniki-zbieznosc') {
    if (url.includes('/power-flow-runs/') && url.endsWith('/results')) return jsonOK(ZBIEZNOSC_WYNIK);
    if (url.includes('/power-flow-runs/') && url.endsWith('/trace')) return jsonOK(ZBIEZNOSC_SLAD);
    if (url.includes('/power-flow-runs/')) return jsonOK(ZBIEZNOSC_HEADER);
  } else if (creator === 'wyniki-stan-fazowy') {
    if (url.includes('/results/phase-state')) return jsonOK(stanFazowyScenyWyniki);
  } else if (creator === 'koordynacja') {
    // Dwa OSOBNE biegi zwarciowe (kanoniczny bieg liczy jeden scenariusz `c`):
    // maksymalny dla selektywnosci, minimalny dla czulosci.
    if (url.includes('/results/short-circuit')) {
      const min = url.includes('run-sc-koord-min');
      return jsonOK({
        run_id: min ? 'run-sc-koord-min' : 'run-sc-koord-max',
        rows: min ? KOORD_WIERSZE_SC_MIN : KOORD_WIERSZE_SC_MAX,
      });
    }
    if (url.includes('/results/branches')) return jsonOK(KOORD_WYNIKI_GALEZI);
    if (url.includes('/enm')) return jsonOK(KOORD_MIGAWKA_MODELU);
    // Karta W3-C1: metodyka nastaw jest Hoppel/IRiESD. Sekcja próbuje kandydatów
    // SC_3F DONE od NAJNOWSZEGO — `run-sc-koord-min` (c_min, 08:02) jest tu
    // celowo NOWSZY niż `run-sc-koord-max` (c_max, 08:00), tak jak w realnej
    // sieci mogą współistnieć oba warianty; backend (nie UI) osądza c_max, więc
    // scena pokazuje dokładnie tę odmowę i przejście do kolejnego kandydata.
    if (url.includes('/analysis-runs/run-sc-koord-min/pakiet-dowodowy-nastaw/dostepnosc')) {
      return jsonOK({
        run_id: 'run-sc-koord-min',
        dostepny: false,
        powod_pl: 'Ten przebieg jest wariantem MINIMALNYM (współczynnik napięciowy c < 1,0) — '
          + 'pakiet nastaw wymaga kotwicy z gałęzi MAKSYMALNEJ (c_max ≥ 1,0).',
        linie: [],
      });
    }
    if (url.includes('/analysis-runs/run-sc-koord-max/pakiet-dowodowy-nastaw/dostepnosc')) {
      return jsonOK({
        run_id: 'run-sc-koord-max',
        dostepny: true,
        powod_pl: null,
        linie: [
          { line_id: 'ln-koord-1', nazwa: 'Linia GPZ – Stacja przyłączeniowa', nastepne_szyny_kandydujace: ['bus_1'] },
        ],
      });
    }
    if (url.includes('/analysis-runs/run-sc-koord-max/nastawy/dopasowanie')) {
      return jsonOK({
        status: 'SUCCEEDED',
        compatible: true,
        violations: [],
        mapped_settings: { I51: 132.5, T51: 0.6, I50: 2480.0, CURVE: 'DT' },
        assumptions: ['LOGICAL_MAPPING_ONLY', 'NO_VENDOR_PARAM_IDS'],
        vendor_mapping: {
          vendor: 'ABB',
          vendor_settings: { 'ABB.OC.I51_PICKUP_A': 132.5, 'ABB.OC.T51_DELAY_S': 0.6, 'ABB.OC.I50_HIGHSET_A': 2480.0 },
          vendor_violations: [],
          vendor_assumptions: ['VENDOR_KEYS_SYMBOLIC_V0'],
        },
        wymaganie: {
          curve: 'DT', i_pickup_51_a: 132.5, tms_51: null, t_51_s: 0.6, i_inst_50_a: 2480.0,
          i_pickup_51n_a: null, tms_51n: null, i_inst_50n_a: null,
        },
        device_id: 'ABB_REF601',
        capability: {},
        proweniencja_nastaw: {
          kotwica_run_id: 'run-sc-koord-max', c_max: 1.1, c_min: 1.0, line_id: 'ln-koord-1',
          next_bus_id: 'bus_1', project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Wariant zimowy',
          line_name: 'Linia GPZ – Stacja przyłączeniowa', run_timestamp: '2026-07-28T08:00:00+00:00',
          solver_version: 'IEC_60909;load-flow-newton-raphson-v1', engine_input: {},
        },
      });
    }
    if (url.includes('/analysis-runs/run-sc-koord-max/nastawy')) {
      return jsonOK({
        wynik: {
          line_id: 'ln-koord-1', line_name: 'Linia GPZ – Stacja przyłączeniowa',
          delayed: {
            i_setting_a: 132.5, t_setting_s: 0.6, i_load_max_a: 110.4, k_b: 1.2,
            sensitivity_ratio: 12.4, is_valid: true, validation_notes: [], trace: [],
          },
          instantaneous: {
            i_setting_a: 2480.0, i_min_selectivity_a: 2200.0, i_max_thermal_a: 3500.0,
            i_max_sensitivity_a: 3100.0, range_valid: true, k_b: 1.2, k_bth: 1.1,
            is_valid: true, validation_notes: [], trace: [],
          },
          thermal: {
            i_th_dop_a: 9800.0, j_thn: 94.0, cross_section_mm2: 120.0, t_fault_s: 0.37,
            ik_max_a: 6200.0, is_adequate: true, margin_percent: 36.7, trace: [],
          },
          spz: {
            spz_allowed: true, total_fault_time_s: 0.6, i_th_required_a: 6200.0,
            i_th_available_a: 12000.0, blocking_recommended: false, trace: [],
          },
          overall_valid: true, summary_notes: [],
        },
        wejscie: {
          kotwica_run_id: 'run-sc-koord-max', c_max: 1.1, c_min: 1.0, line_id: 'ln-koord-1',
          next_bus_id: 'bus_1', project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Wariant zimowy',
          line_name: 'Linia GPZ – Stacja przyłączeniowa', run_timestamp: '2026-07-28T08:00:00+00:00',
          solver_version: 'IEC_60909;load-flow-newton-raphson-v1', engine_input: {},
        },
        dostepnosc_pakietu: true,
      });
    }
    if (url.includes('/api/protection-coordination/') && url.endsWith('/run')) {
      return jsonOK({ run_id: 'run-koord-1', ...KOORD_WYNIK.summary });
    }
    if (url.includes('/api/protection-coordination/') && url.endsWith('/tcc')) {
      return jsonOK({ curves: KOORD_WYNIK.tcc_curves, fault_markers: KOORD_WYNIK.fault_markers });
    }
    if (url.includes('/api/protection-coordination/')) {
      // Wynik pelny: pary, marginesy i krzywe z NAZWAMI urzadzen dodanych klikiem.
      return jsonOK(KOORD_WYNIK);
    }
  } else if (creator === 'odbior') {
    // Podglad pradu odbioru liczy SOLVER (I = S/(√3·U)). Bez tej atrapy scena pokazywala
    // baner awarii uslugi zamiast wyniku — a zrzut do oceny wygladalby jak zepsuty ekran
    // (V12K-260). Wartosci odpowiadaja danym sceny: 50 kW, cosφ 0,93, 0,4 kV.
    if (url.includes('/cable-rated-current-preview')) {
      return jsonOK({
        rated_current_a: 77.6,
        apparent_power_kva: 53.8,
        formula_ref: 'I = S / (√3·U)',
        assumptions: [
          'Uklad 3-fazowy symetryczny; wspolczynnik linii √3.',
          'S = P / cosφ = 50,0 kW / 0,93 = 53,8 kVA.',
          'U = 0,4 kV (napiecie szyny nN odplywu).',
        ],
      });
    }
  } else if (creator === 'wiazania') {
    if (url.includes('/instrument-transformers')) return jsonOK(DOBOR_PRZEKLADNIKOW_WIAZANIA);
    if (url.includes('/protection-functions')) return jsonOK(DOBOR_FUNKCJI_WIAZANIA);
  } else if (creator === 'wyniki-stabilnosc') {
    if (url.endsWith('/results/dynamic-stability')) return jsonOK(stabilnoscScenyWyniki);
    if (url.endsWith('/results/automation-trace')) return jsonOK(stabilnoscScenySlad);
  }

  // Kontrakt przebiegu dla znacznika świeżości nagłówka (V12K-264, rozszerzenie
  // K3-B2 na wszystkie sceny wynikowe z runId): `useSwiezoscNaglowka` →
  // `useAnalysisRunContract` woła GET /api/analysis-runs/<id>. Bez atrapy
  // zapytanie leciało do `originalFetch`, 404 wpadał do bramki „zero błędów
  // konsoli" speców zrzutowych (karta K1/A), a znacznik świeżości nie renderował
  // się w żadnej scenie. Kształt 1:1 z kontraktem backendu
  // `analysis_case_context.py` — `rewizja_modelu` LICZBOWE (V12K-264:
  // normalizator odrzuca tekst; brak = null, nigdy zero). Dopasowanie JAWNE
  // (endsWith pełnego adresu kontraktu) — pod-końcówki `/results/...`,
  // `/snapshot` itd. przechodzą dalej do atrap per scena.
  const runKontraktuSceny = RUN_KONTRAKT_SCENY[creator];
  if (runKontraktuSceny && url.endsWith(`/api/analysis-runs/${runKontraktuSceny}`)) {
    return jsonOK({
      id: runKontraktuSceny,
      analysis_type: runKontraktuSceny.startsWith('run-lf') ? 'LOAD_FLOW' : 'SC',
      status: 'FINISHED',
      result_status: 'VALID',
      results_valid: true,
      created_at: '2026-07-20T10:00:00Z',
      finished_at: '2026-07-20T10:00:05Z',
      input_hash: 'h-demo',
      summary_json: {},
      trace_summary: null,
      analysis_case_context: {
        case_ref: 'case-demo',
        case_kind: 'auto',
        snapshot_ref: 'sha256:h-demo',
        rewizja_modelu: 1,
        variant_ref: null,
        run_ref: runKontraktuSceny,
        proof_pack_ref: null,
        quality_gate: 'passed',
        applicability_scope: [],
        completeness: 'complete',
        missing_prerequisites: [],
        assumptions: {},
        lineage: {},
        reproducibility: null,
      },
    });
  }
  // K3-B3: scena „cieplna" = wariant NIEAKTUALNY (migawka rev. 2, wynik na
  // rev. 1) — panel „Co się zmieniło" (`PanelCoSieZmienilo` → `pobierzDziennikZmian`)
  // pyta GET /api/cases/<case>/enm/dziennik-zmian?od_rewizji=1. Kształt 1:1
  // z kontraktem `DziennikZmian` (frontend `freshness/dziennikApi.ts`,
  // backend `enm/dziennik_zmian.py`): jedna zmiana rev. 1→2 (spójnie z
  // `rewizja_biezaca: 2`), wpis PL z elementem klikalnym.
  if (creator === 'cieplna' && url.includes('/enm/dziennik-zmian')) {
    return jsonOK({
      case_id: 'case-demo',
      rewizja_biezaca: 2,
      od_rewizji: 1,
      aktualny: false,
      wpisy: [
        {
          rewizja: 2,
          znacznik_czasu: '2026-07-27T09:41:00Z',
          operacja: 'update_element_parameters',
          opis_pl: 'Zmieniono parametry odcinka magistrali SN (długość 2500 m → 2800 m).',
          utworzone: [],
          zmienione: ['odc-linia-7'],
          usuniete: [],
          liczba_elementow: 1,
        },
      ],
    });
  }

  if (url.includes('/api/quality/energy-validation')) {
    // Karta HARNESS-RESZTA (kontynuacja): scena "walidacja" (uzywana tez
    // przez "rozplyw" — kolumna obciazalnosci) — REALNY bieg backendu
    // (eksport_fixtur_harnessu.py::walidacja_scena_wynik, TA SAMA funkcja co
    // koncowka `build_energy_validation_view`) na PF biegu sieci zlotej z
    // obciazeniem x8 (ten sam bieg co scena "rozplyw") — zero recznie
    // wpisanych liczb fizycznych.
    return jsonOK(walidacjaScenyWynik);
  }
  if (url.includes('/api/proof/sc3f/contributions')) {
    // Sceny "zwarcia"/"zwarcia-rozplyw" (HARNESS-ZWARCIA-Z-BACKENDU,
    // 2026-09-16): mapa target_id -> odpowiedz REALNEGO backendu
    // (`eksport_fixtur_harnessu.py::zwarcia_wklady_scena_zwarcia`, TA SAMA
    // funkcja co koncowka `sc3f_contributions`) — zero recznie wpisanych
    // liczb fizycznych. `fault_node_id` z ciala zadania POST, jak w realnym
    // kliencie (`zwarcia/api.ts::fetchWkladyZwarciowe`).
    const cialoWkladow = JSON.parse(String(init?.body ?? '{}')) as { fault_node_id?: string };
    const wklady = (zwarciaWkladyScenyZwarcia as Record<string, unknown>)[cialoWkladow.fault_node_id ?? ''];
    if (wklady) return jsonOK(wklady);
  }
  if (url.includes('/results/short-circuit/rozplyw')) {
    // HARNESS-ZWARCIA-Z-BACKENDU: rozplyw galeziowy JEDNEGO punktu — ten,
    // ktory `EkranZwarc` wybiera domyslnie (pierwszy wiersz wynikow) — realny
    // bieg backendu (`zwarcia_rozplyw_scena_zwarcia`), tor sieci nadrzednej
    // (THEVENIN_GRID) ORAZ tor falownika (gen_pv) RAZEM w `branch_contributions`,
    // jak dotychczasowa scena Z-3 — bez zadnej recznej liczby.
    const targetId = new URL(url, location.origin).searchParams.get('target_id');
    if (targetId === zwarciaRozplywScenyZwarcia.target_id) return jsonOK(zwarciaRozplywScenyZwarcia);
  }
  if (url.includes('/results/short-circuit/pasmo')) {
    // Pasmo MIN/MAX zwarcia (karta W3-G3, aneks D7) — TEN SAM bieg kotwicy;
    // strona MIN `obliczony_na_zadanie` (bez wlasnego run_id) — realny ksztalt
    // `dobierz_pasmo_min_max_zwarcia` (`eksport_fixtur_harnessu.py::
    // zwarcia_pasmo_scena_zwarcia`).
    return jsonOK(zwarciaPasmoScenyZwarcia);
  }
  if (url.includes('/power-flow-runs')) {
    // Scena "porownanie": lista zakonczonych przebiegow rozplywu projektu.
    return new Response(
      JSON.stringify({
        runs: [
          { id: 'run-a', project_id: 'proj-demo', study_case_id: 'K1', status: 'FINISHED', result_status: 'FRESH', created_at: '2026-07-21T10:00:00Z', finished_at: '2026-07-21T10:00:04Z', input_hash: 'hash-a', snapshot_hash: 'snap-run-a', model_revision: 1, scenario_ref: null, converged: true, iterations: 5 },
          { id: 'run-b', project_id: 'proj-demo', study_case_id: 'K2', status: 'FINISHED', result_status: 'FRESH', created_at: '2026-07-21T11:00:00Z', finished_at: '2026-07-21T11:00:05Z', input_hash: 'hash-b', snapshot_hash: 'snap-run-b', model_revision: 2, scenario_ref: null, converged: true, iterations: 6 },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/power-flow-comparisons')) {
    // Scena "porownanie" (R3-C): wynik porownania A/B — ksztalt 1:1 z
    // `PowerFlowComparisonResult` (delty i ranking WYLACZNIE z backendu).
    return new Response(
      JSON.stringify({
        comparison_id: 'cmp-demo-1', run_a_id: 'run-a', run_b_id: 'run-b', project_id: 'proj-demo',
        bus_diffs: [
          { bus_id: 'SZ-GPZ', v_pu_a: 1.0, v_pu_b: 1.0, angle_deg_a: 0, angle_deg_b: 0, p_injected_mw_a: 6.4, p_injected_mw_b: 5.1, q_injected_mvar_a: 1.9, q_injected_mvar_b: 1.4, delta_v_pu: 0, delta_angle_deg: 0, delta_p_mw: -1.3, delta_q_mvar: -0.5 },
          { bus_id: 'SZ-ST7', v_pu_a: 0.941, v_pu_b: 0.972, angle_deg_a: -2.9, angle_deg_b: -2.1, p_injected_mw_a: -1.2, p_injected_mw_b: -1.2, q_injected_mvar_a: -0.4, q_injected_mvar_b: -0.1, delta_v_pu: 0.031, delta_angle_deg: 0.8, delta_p_mw: 0, delta_q_mvar: 0.3 },
          { bus_id: 'SZ-PV2', v_pu_a: 1.062, v_pu_b: 1.038, angle_deg_a: 1.4, angle_deg_b: 1.1, p_injected_mw_a: 3.9, p_injected_mw_b: 2.6, q_injected_mvar_a: 0.2, q_injected_mvar_b: 0.4, delta_v_pu: -0.024, delta_angle_deg: -0.3, delta_p_mw: -1.3, delta_q_mvar: 0.2 },
          // KD-1 (L-14): szyna BEZ ROZNIC miedzy A i B — filtr „tylko roznice" ma ja ukryc.
          { bus_id: 'SZ-ST3', v_pu_a: 0.995, v_pu_b: 0.995, angle_deg_a: -1.2, angle_deg_b: -1.2, p_injected_mw_a: -0.8, p_injected_mw_b: -0.8, q_injected_mvar_a: -0.3, q_injected_mvar_b: -0.3, delta_v_pu: 0, delta_angle_deg: 0, delta_p_mw: 0, delta_q_mvar: 0 },
        ],
        branch_diffs: [
          { branch_id: 'L-14', p_from_mw_a: 2.31, p_from_mw_b: 1.62, q_from_mvar_a: 0.72, q_from_mvar_b: 0.48, p_to_mw_a: -2.28, p_to_mw_b: -1.6, q_to_mvar_a: -0.7, q_to_mvar_b: -0.47, losses_p_mw_a: 0.031, losses_p_mw_b: 0.015, losses_q_mvar_a: 0.018, losses_q_mvar_b: 0.009, delta_p_from_mw: -0.69, delta_q_from_mvar: -0.24, delta_p_to_mw: 0.68, delta_q_to_mvar: 0.23, delta_losses_p_mw: -0.016, delta_losses_q_mvar: -0.009 },
          { branch_id: 'TR-1', p_from_mw_a: 1.66, p_from_mw_b: 1.31, q_from_mvar_a: 0.5, q_from_mvar_b: 0.38, p_to_mw_a: -1.64, p_to_mw_b: -1.3, q_to_mvar_a: -0.48, q_to_mvar_b: -0.37, losses_p_mw_a: 0.021, losses_p_mw_b: 0.013, losses_q_mvar_a: 0.02, losses_q_mvar_b: 0.012, delta_p_from_mw: -0.35, delta_q_from_mvar: -0.12, delta_p_to_mw: 0.34, delta_q_to_mvar: 0.11, delta_losses_p_mw: -0.008, delta_losses_q_mvar: -0.008 },
        ],
        ranking: [
          { issue_code: 'VOLTAGE_DELTA_HIGH', severity: 4, element_ref: 'SZ-ST7', description_pl: 'Napiecie na szynie ST-7 rosnie o 0.031 pu po zalaczeniu kompensacji.', evidence_ref: 1 },
          { issue_code: 'LOSSES_DECREASED', severity: 2, element_ref: 'L-14', description_pl: 'Straty czynne odcinka L-14 spadaja o 16 kW.', evidence_ref: 2 },
        ],
        summary: { total_buses: 4, total_branches: 2, converged_a: true, converged_b: true, total_losses_p_mw_a: 0.052, total_losses_p_mw_b: 0.028, delta_total_losses_p_mw: -0.024, max_delta_v_pu: 0.031, max_delta_angle_deg: 0.8, total_issues: 2, critical_issues: 0, major_issues: 1, moderate_issues: 0, minor_issues: 1 },
        input_hash: 'hash-cmp-demo', created_at: '2026-07-22T09:00:00Z',
        // B1 (karta CV-3.3-B): proweniencja obu biegow — pole WYMAGANE przez
        // `PowerFlowComparisonResult`, panel eksperckiego trybu (`mvd-por-
        // proweniencja`) czyta je bezposrednio, bez ochrony na `undefined`.
        provenance_a: {
          run_id: 'run-a', analysis_type: 'PF', status: 'FINISHED',
          snapshot_hash: 'snap-run-a', input_hash: 'hash-a', finished_at: '2026-07-21T10:00:04Z',
          envelope: {
            wersja: 1, project_id: 'proj-demo', model_revision: 1, snapshot_hash: 'snap-run-a',
            catalog_fingerprint: 'cat-demo', options_hash: 'opt-demo', semantic_fingerprint: 'sem-run-a',
          },
        },
        provenance_b: {
          run_id: 'run-b', analysis_type: 'PF', status: 'FINISHED',
          snapshot_hash: 'snap-run-b', input_hash: 'hash-b', finished_at: '2026-07-21T11:00:05Z',
          envelope: {
            wersja: 1, project_id: 'proj-demo', model_revision: 2, snapshot_hash: 'snap-run-b',
            catalog_fingerprint: 'cat-demo', options_hash: 'opt-demo', semantic_fingerprint: 'sem-run-b',
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/protection-comparisons') && url.endsWith('/trace')) {
    // Scena "porownanie" (CV-3.3-B2), tryb "Zabezpieczenia": slad porownania
    // (White Box, na zadanie) — ksztalt 1:1 z `ProtectionComparisonTraceResponse`
    // (`api/protection_comparisons.py`), kroki 1:1 ze steps `application/
    // protection_comparison/service.py` (nazwy krokow/pol/progow realne).
    return new Response(
      JSON.stringify({
        comparison_id: 'cmp-zab-demo-1', run_a_id: 'run-zab-a', run_b_id: 'run-zab-b',
        library_fingerprint_a: 'template_ref_oc_100@1', library_fingerprint_b: 'template_ref_oc_100@1',
        steps: [
          {
            step: 'MATCH_EVALUATIONS', description_pl: 'Dopasowanie ewaluacji po (element chroniony, punkt zwarcia)',
            inputs: { evaluations_a_count: 2, evaluations_b_count: 2 },
            outputs: { matched_pairs: 2, total_rows: 2 },
          },
          {
            step: 'COMPUTE_DELTAS', description_pl: 'Obliczanie różnic czasów i prądów',
            inputs: { row_count: 2 },
            outputs: { no_change_count: 1, trip_to_no_trip_count: 1, no_trip_to_trip_count: 0, invalid_change_count: 0 },
          },
          {
            step: 'RANK_ISSUES', description_pl: 'Generowanie rankingu problemów wg severity (5→1)',
            inputs: { row_count: 2, delay_threshold_s: 0.1, margin_threshold_percent: 5.0 },
            outputs: { total_issues: 1, critical: 1, major: 0, moderate: 0, minor: 0 },
          },
        ],
        created_at: '2026-07-22T09:05:00Z',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/protection-runs') && !url.includes('/execute')) {
    // Scena "porownanie" (CV-3.3-B2): lista zakonczonych przebiegow zabezpieczen
    // projektu — ksztalt 1:1 z `ProtectionRunListItemResponse` (karta CV-3.3-B).
    return new Response(
      JSON.stringify({
        runs: [
          { id: 'run-zab-a', project_id: 'proj-demo', study_case_id: 'K1', analysis_type: 'protection_sn', status: 'FINISHED', created_at: '2026-07-21T10:10:00Z', finished_at: '2026-07-21T10:10:04Z', input_hash: 'hash-zab-a', snapshot_hash: 'snap-zab-a', model_revision: 1, scenario_ref: null },
          { id: 'run-zab-b', project_id: 'proj-demo', study_case_id: 'K2', analysis_type: 'protection_sn', status: 'FINISHED', created_at: '2026-07-21T11:10:00Z', finished_at: '2026-07-21T11:10:05Z', input_hash: 'hash-zab-b', snapshot_hash: 'snap-zab-b', model_revision: 2, scenario_ref: null },
        ],
        total: 2,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/protection-comparisons')) {
    // Scena "porownanie" (CV-3.3-B2), tryb "Zabezpieczenia": wynik porownania
    // A/B — ksztalt 1:1 z `ProtectionComparisonResultResponse` (delty i ranking
    // WYLACZNIE z backendu; `i_fault_a_a/b` nullowalne — FAB-E).
    return new Response(
      JSON.stringify({
        comparison_id: 'cmp-zab-demo-1', run_a_id: 'run-zab-a', run_b_id: 'run-zab-b', project_id: 'proj-demo',
        rows: [
          { protected_element_ref: 'BRK-F01', fault_target_id: 'SZ-ST7', device_id_a: 'REL-OC-001', device_id_b: 'REL-OC-001', trip_state_a: 'TRIPS', trip_state_b: 'NO_TRIP', t_trip_s_a: 0.35, t_trip_s_b: null, i_fault_a_a: 1250.4, i_fault_a_b: 980.2, delta_t_s: null, delta_i_fault_a: -270.2, margin_percent_a: 12.5, margin_percent_b: 8.1, state_change: 'TRIP_TO_NO_TRIP' },
          { protected_element_ref: 'BRK-F02', fault_target_id: 'SZ-PV2', device_id_a: 'REL-OC-002', device_id_b: 'REL-OC-002', trip_state_a: 'TRIPS', trip_state_b: 'TRIPS', t_trip_s_a: 0.5, t_trip_s_b: 0.5, i_fault_a_a: 640.0, i_fault_a_b: 640.0, delta_t_s: 0, delta_i_fault_a: 0, margin_percent_a: 20.0, margin_percent_b: 14.0, state_change: 'NO_CHANGE' },
        ],
        ranking: [
          { issue_code: 'TRIP_LOST', severity: 5, element_ref: 'BRK-F01', fault_target_id: 'SZ-ST7', description_pl: 'Zabezpieczenie BRK-F01 traci zadziałanie na punkcie SZ-ST7 w wariancie B.', evidence_refs: [0] },
        ],
        summary: { total_rows: 2, no_change_count: 1, trip_to_no_trip_count: 1, no_trip_to_trip_count: 0, invalid_change_count: 0, total_issues: 1, critical_issues: 1, major_issues: 0, moderate_issues: 0, minor_issues: 0 },
        input_hash: 'hash-cmp-zab-demo', created_at: '2026-07-22T09:00:00Z',
        // B1 (karta CV-3.3-B): proweniencja obu biegow — pole WYMAGANE, panel
        // eksperckiego trybu (`mvd-por-proweniencja`) czyta je bezposrednio.
        provenance_a: {
          run_id: 'run-zab-a', analysis_type: 'protection_sn', status: 'FINISHED',
          snapshot_hash: 'snap-zab-a', input_hash: 'hash-zab-a', finished_at: '2026-07-21T10:10:04Z',
          envelope: {
            wersja: 1, project_id: 'proj-demo', model_revision: 1, snapshot_hash: 'snap-zab-a',
            catalog_fingerprint: 'cat-demo', options_hash: 'opt-demo', semantic_fingerprint: 'sem-zab-a',
          },
        },
        provenance_b: {
          run_id: 'run-zab-b', analysis_type: 'protection_sn', status: 'FINISHED',
          snapshot_hash: 'snap-zab-b', input_hash: 'hash-zab-b', finished_at: '2026-07-21T11:10:05Z',
          envelope: {
            wersja: 1, project_id: 'proj-demo', model_revision: 2, snapshot_hash: 'snap-zab-b',
            catalog_fingerprint: 'cat-demo', options_hash: 'opt-demo', semantic_fingerprint: 'sem-zab-b',
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/oze-analysis/grid-strength')) {
    // Karta HARNESS-RESZTA (kontynuacja): scena "sila-sieci" — REALNY bieg
    // backendu (eksport_fixtur_harnessu.py::sila_sieci_scena_wynik, TA SAMA
    // funkcja co koncowka `build_grid_strength_view`) na biegu kotwicy scen
    // "sila-sieci"/"migotanie" (siec zlota z catalog_ref na gen_pv) — zero
    // recznie wpisanych liczb fizycznych.
    return jsonOK(silaSieciScenyWynik);
  }
  if (url.includes('/api/oze-analysis/compensation-sizing')) {
    // Karta HARNESS-RESZTA (kontynuacja): sceny "kompensacja"/"kompensacja-
    // wynik" — REALNY bieg backendu (eksport_fixtur_harnessu.py::
    // kompensacja_scena_wynik, TA SAMA funkcja co koncowka
    // `build_compensation_sizing_view`) na PF biegu sieci zlotej, wezel
    // bus_sn_b — zero recznie wpisanych liczb fizycznych.
    return jsonOK(kompensacjaScenyWynik);
  }
  if (url.includes('/api/quality/flicker')) {
    // Karta HARNESS-RESZTA (kontynuacja): scena "migotanie" — REALNY bieg
    // backendu (eksport_fixtur_harnessu.py::migotanie_scena_wynik, TA SAMA
    // funkcja co koncowka `build_migotanie_view`) na biegu kotwicy scen
    // "sila-sieci"/"migotanie" (siec zlota z catalog_ref na gen_pv) — zero
    // recznie wpisanych liczb fizycznych.
    return jsonOK(migotanieScenyWynik);
  }
  if (url.includes('/api/quality/as-built-compliance')) {
    // Scena "odbior-zgodnosc" (V-B): raport zgodnosci powykonawczej — ksztalt
    // 1:1 z `application/analyses/zgodnosc_powykonawcza.py::build_zgodnosc_
    // powykonawcza_view`; slad_pl per wiersz (model -> pomiar -> odchylka ->
    // tolerancja -> werdykt); echo pomiarow wpisanych w edytorze speca.
    return new Response(
      JSON.stringify({
        analysis_id: 'run-lf-5',
        input_hash: 'zgodnosc-hash-demo',
        tolerancje: { napiecie_pct: 5, moc_pct: 10 },
        zrodlo_tolerancji: { napiecie_pct: 'jawna (żądanie)', moc_pct: 'jawna (żądanie)' },
        zalozenia_pl: [
          'Porównanie 1:1 pomiar–model (wynik rozpływu FROZEN); bez estymacji stanu '
          + '(solver WLS istnieje, ale nie jest używany) i bez korekt modelu.',
          'Napięcie U przeliczane na kV z u_pu przez napięcie znamionowe węzła (U = u_pu · U_n).',
          'Moce P/Q odczytywane z gałęzi w kierunku „from" (p_from_mw / q_from_mvar).',
          'Konwencja znaku Q nierozstrzygnięta (V12K-040): Q porównywane po wartości '
          + 'bezwzględnej |Q|; znak odchyłki nie jest interpretowany.',
          'Tolerancje wyłącznie jawne (z żądania); brak udokumentowanego źródła '
          + 'normatywnego dla wartości domyślnych, więc domyślnych nie przyjęto.',
        ],
        podsumowanie: {
          liczba_punktow: 4, w_tolerancji: 1, poza_tolerancja: 1,
          brak_odpowiednika: 1, brak_wyniku: 1,
          najwieksza_odchylka_pct: 12.5,
          najwieksza_odchylka_element_ref: 'LINE-2',
          najwieksza_odchylka_wielkosc: 'P',
        },
        wiersze: [
          {
            element_ref: 'BUS-1', wielkosc: 'U', jednostka: 'kV',
            wartosc_pomiar: 15.3, wartosc_model: 15.15,
            odchylka_bezwzgledna: 0.15, odchylka_pct: 0.99, tolerancja_pct: 5,
            werdykt: 'w tolerancji',
            slad_pl: [
              'Model U = u_pu × U_n = 1.010000 × 15.000000 = 15.150000 kV',
              'Pomiar U = 15.300000 kV',
              'Odchyłka = pomiar − model = 0.150000 kV (0.990099%)',
              'Tolerancja = ±5.000000%',
              'Werdykt: w tolerancji',
            ],
          },
          {
            element_ref: 'LINE-2', wielkosc: 'P', jednostka: 'MW',
            wartosc_pomiar: 4.5, wartosc_model: 4.0,
            odchylka_bezwzgledna: 0.5, odchylka_pct: 12.5, tolerancja_pct: 10,
            werdykt: 'poza tolerancją',
            slad_pl: [
              'Model P_from = 4.000000 MW',
              'Pomiar P = 4.500000 MW',
              'Odchyłka = pomiar − model = 0.500000 MW (12.500000%)',
              'Tolerancja = ±10.000000%',
              'Werdykt: poza tolerancją',
            ],
          },
          {
            element_ref: 'NIEZNANY-3', wielkosc: 'U', jednostka: 'kV',
            wartosc_pomiar: 10.0, wartosc_model: null,
            odchylka_bezwzgledna: null, odchylka_pct: null, tolerancja_pct: null,
            werdykt: 'brak odpowiednika w modelu',
            slad_pl: ['Element „NIEZNANY-3" nie występuje jako węzeł w wyniku rozpływu.'],
          },
          {
            element_ref: 'TRAFO-4', wielkosc: 'Q', jednostka: 'Mvar',
            wartosc_pomiar: 1.2, wartosc_model: null,
            odchylka_bezwzgledna: null, odchylka_pct: null, tolerancja_pct: null,
            werdykt: 'brak wyniku dla elementu',
            slad_pl: ['Brak wyniku Q (kierunek „from") dla gałęzi „TRAFO-4".'],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/quality/state-estimation/requirements')) {
    // Scena "estymacja" (V-B): wymagane wejscia WLS — ksztalt 1:1 z
    // `application/analyses/state_estimation/service.py` (requirements).
    return new Response(
      JSON.stringify({
        analysis_id: 'run-lf-6',
        context: {
          project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Stan normalny',
          run_timestamp: '2026-07-22T08:50:00Z', snapshot_id: 'snap-demo', trace_id: 'run-lf-6',
        },
        base_mva: 100.0,
        slack_bus_ref: 'BUS-1',
        slack_index: 0,
        n_buses: 3,
        n_states: 5,
        min_measurements: 5,
        buses: [
          { bus_ref: 'BUS-1', index: 0, name: 'Szyna GPZ', voltage_kv: 110.0, is_slack: true },
          { bus_ref: 'BUS-2', index: 1, name: 'Szyna SN', voltage_kv: 15.0, is_slack: false },
          { bus_ref: 'BUS-3', index: 2, name: null, voltage_kv: 15.0, is_slack: false },
        ],
        measurement_types: [
          { code: 'V_MAGNITUDE', label_pl: 'Moduł napięcia węzła |V| [pu]', requires_bus_j: false },
          { code: 'P_INJECTION', label_pl: 'Iniekcja mocy czynnej w węźle P [pu]', requires_bus_j: false },
          { code: 'Q_INJECTION', label_pl: 'Iniekcja mocy biernej w węźle Q [pu]', requires_bus_j: false },
          { code: 'P_FLOW', label_pl: 'Przepływ mocy czynnej w gałęzi P_ij [pu]', requires_bus_j: true },
          { code: 'Q_FLOW', label_pl: 'Przepływ mocy biernej w gałęzi Q_ij [pu]', requires_bus_j: true },
        ],
        note_pl:
          'Pomiary muszą być w jednostkach względnych (pu) na tej samej bazie mocy '
          + '(base_mva) co macierz Y-bus.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/quality/state-estimation')) {
    // Scena "estymacja" (V-B): wynik WLS — ksztalt 1:1 z `_serialize_result`.
    // Liczby spojne: 6 pomiarow (echo edytora speca), n=5 stanow, dof=1;
    // chi² = 27.8 > prog 6.635 (alfa 0.01, dof 1); LNR 5.2 > 3.0 na pomiarze
    // |V| BUS-1 (pomiar 1.05 vs estymata 1.029 -> rezyduum 0.021 = 5.25·sigma).
    return new Response(
      JSON.stringify({
        analysis_id: 'run-lf-6',
        context: {
          project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Stan normalny',
          run_timestamp: '2026-07-22T08:50:00Z', snapshot_id: 'snap-demo', trace_id: 'run-lf-6',
        },
        status: 'OK',
        status_pl: 'zbieżny',
        missing_data: [{ code: 'wezly_bez_pomiaru', bus_refs: ['BUS-3'] }],
        solver_version: 'state_estimation_wls@1.0.0',
        validation_status: 'SYNTETYCZNY (walidacja płaskim stanem, nie SCADA/PMU)',
        estimate_id: 'estymata-hash-demo',
        base_mva: 100.0,
        slack_bus_ref: 'BUS-1',
        slack_index: 0,
        converged: true,
        iterations: 3,
        n_states: 5,
        m_measurements: 6,
        degrees_of_freedom: 1,
        objective_j: 27.8,
        note: null,
        buses: [
          { bus_ref: 'BUS-1', index: 0, name: 'Szyna GPZ', voltage_kv: 110.0, is_slack: true, v_magnitude_pu: 1.029, v_angle_rad: 0.0, v_angle_deg: 0.0 },
          { bus_ref: 'BUS-2', index: 1, name: 'Szyna SN', voltage_kv: 15.0, is_slack: false, v_magnitude_pu: 0.9912, v_angle_rad: -0.0262, v_angle_deg: -1.5 },
          { bus_ref: 'BUS-3', index: 2, name: null, voltage_kv: 15.0, is_slack: false, v_magnitude_pu: 1.0103, v_angle_rad: 0.014, v_angle_deg: 0.8 },
        ],
        measurements: [
          { meas_type: 'V_MAGNITUDE', bus_ref: 'BUS-1', bus_j_ref: null, value: 1.05, sigma: 0.004, label: null, index: 0, normalized_residual: 5.2, residual: 0.021, suspect: true },
          { meas_type: 'V_MAGNITUDE', bus_ref: 'BUS-2', bus_j_ref: null, value: 0.99, sigma: 0.004, label: null, index: 1, normalized_residual: 0.3, residual: -0.0012, suspect: false },
          { meas_type: 'P_INJECTION', bus_ref: 'BUS-2', bus_j_ref: null, value: -0.35, sigma: 0.008, label: null, index: 2, normalized_residual: 0.4, residual: 0.002, suspect: false },
          { meas_type: 'Q_INJECTION', bus_ref: 'BUS-2', bus_j_ref: null, value: -0.12, sigma: 0.008, label: null, index: 3, normalized_residual: 0.2, residual: 0.001, suspect: false },
          { meas_type: 'P_FLOW', bus_ref: 'BUS-1', bus_j_ref: 'BUS-2', value: 0.36, sigma: 0.008, label: null, index: 4, normalized_residual: 0.5, residual: 0.003, suspect: false },
          { meas_type: 'Q_FLOW', bus_ref: 'BUS-1', bus_j_ref: 'BUS-2', value: 0.13, sigma: 0.008, label: null, index: 5, normalized_residual: 0.3, residual: -0.002, suspect: false },
        ],
        bad_data: {
          chi_square_value: 27.8,
          chi_square_threshold: 6.635,
          degrees_of_freedom: 1,
          alpha: 0.01,
          chi_square_flag: true,
          largest_normalized_residual: 5.2,
          lnr_measurement_index: 0,
          lnr_threshold: 3.0,
          lnr_flag: true,
          normalized_residuals: [5.2, 0.3, 0.4, 0.2, 0.5, 0.3],
          lnr_measurement: { index: 0, meas_type: 'V_MAGNITUDE', bus_ref: 'BUS-1', bus_j_ref: null, label: null },
        },
        white_box: [
          { iteration: 0, objective_j: 41.2, max_abs_residual: 0.062, step_norm: 0.031, h_jacobian: [[1, 0]], gain_matrix_g: [[2, 0]], residual_r: [0.062, 0.002], delta_x: [0.028, 0.001], state_x: [1.0, 0.0] },
          { iteration: 1, objective_j: 27.9, max_abs_residual: 0.021, step_norm: 0.0009, h_jacobian: [[1, 0]], gain_matrix_g: [[2, 0]], residual_r: [0.021, 0.002], delta_x: [0.0009, 0.0], state_x: [1.029, -0.026] },
          { iteration: 2, objective_j: 27.8, max_abs_residual: 0.021, step_norm: 0.00001, h_jacobian: [[1, 0]], gain_matrix_g: [[2, 0]], residual_r: [0.021, 0.002], delta_x: [0.0, 0.0], state_x: [1.029, -0.0262] },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  // ---- B-02 / W3-E: katalog kart „Analizy specjalistyczne" i gotowość analiz —
  // odpowiedzi policzone BACKENDEM (`scripts/eksport_fixtur_harnessu.py`:
  // `katalog_do_dict`, `odpowiedz_gotowosci` na złotej sieci). Gotowość Z parametrami
  // wraca WYŁĄCZNIE, gdy zapytanie niesie DOKŁADNIE parametry sceny dla rodzaju
  // (formularz wypełniony wartościami z fixtury `parametry`) — w każdym innym razie
  // stan bez parametrów. Atrapa NIE liczy gotowości sama (częściowo wypełniony
  // formularz dostaje stan bazowy, nie „policzone na oko"): liczy ją wyłącznie backend.
  if (url.includes('/api/catalog/v126/analysis-catalog')) return jsonOK(katalogAnalizV126);
  if (url.includes('/v126/gotowosc')) {
    const kanonJson = (dane: unknown): string =>
      JSON.stringify(dane, (_klucz, wartosc: unknown) =>
        wartosc !== null && typeof wartosc === 'object' && !Array.isArray(wartosc)
          ? Object.fromEntries(
              Object.entries(wartosc as Record<string, unknown>).sort(([a], [b]) =>
                a < b ? -1 : a > b ? 1 : 0,
              ),
            )
          : wartosc,
      );
    const zapytanie = new URL(url, location.origin).searchParams;
    const rodzaj = zapytanie.get('analysis_type');
    const parametry = zapytanie.get('parametry');
    if (rodzaj === null) return jsonOK(gotowoscV126ScenyAkademickie);
    const zParametrami = gotowoscV126ScenyAkademickieParametry as unknown as {
      parametry: Record<string, unknown>;
      analizy: { kod: string }[];
    };
    const oczekiwane = zParametrami.parametry[rodzaj];
    const zgodne =
      parametry !== null && oczekiwane !== undefined && kanonJson(JSON.parse(parametry)) === kanonJson(oczekiwane);
    const zrodlo = zgodne
      ? zParametrami.analizy
      : (gotowoscV126ScenyAkademickie as unknown as { analizy: { kod: string }[] }).analizy;
    const analiza = zrodlo.find((pozycja) => pozycja.kod === rodzaj);
    if (analiza === undefined) {
      return new Response(JSON.stringify({ detail: `Nieznany rodzaj analizy: ${rodzaj}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return jsonOK({ ...gotowoscV126ScenyAkademickie, analizy: [analiza] });
  }
  // ---- Scena "akademickie" (V126-JEZYK): pakiet analiz specjalistycznych V12.6.
  // Wszystkie rodzaje karmione REALNYMI odpowiedziami solvera z fixtury CI.
  if (url.includes('/api/catalog/v126/analysis-types')) {
    return new Response(
      JSON.stringify({ namespace: 'analysis-types', items: Object.keys(odpowiedziV126) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/v126/') && !url.includes('ssci_impedance')) {
    const rodzaj = Object.keys(odpowiedziV126).find((kod) => url.includes(kod)) ?? 'voltage_stability';
    const kroki = sladDemoV126(rodzaj);
    if (url.includes('/trace')) {
      return new Response(
        JSON.stringify({
          run_id: 'run-akad-1', analysis_type: rodzaj,
          trace_version: 'AcademicWhiteBoxTraceV1', deterministic_hash: 'akad-hash-demo',
          steps: kroki,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/proof')) {
      return new Response(
        JSON.stringify({
          contract: 'AcademicProofPackV1', proof_id: 'proof:v126:demo', run_id: 'run-akad-1',
          case_id: 'case-demo', analysis_type: rodzaj, source_result_hash: 'akad-hash-demo',
          trace_step_count: kroki.length,
          steps: kroki.map((krok, i) => ({ ...krok, ordinal: i + 1 })),
          proof_hash: 'akad-dowod-demo',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/report')) {
      return new Response(
        JSON.stringify({
          contract: 'AcademicReportV1', report_id: 'report:v126:demo', run_id: 'run-akad-1',
          case_id: 'case-demo', analysis_type: rodzaj, source_result_hash: 'akad-hash-demo',
          source_proof_hash: 'akad-dowod-demo', export_policy: 'frozen_result_and_proof_only',
          sections: [], report_hash: 'akad-raport-demo',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/results/v126/')) {
      return new Response(
        JSON.stringify({
          run_id: 'run-akad-1', case_id: 'case-demo', analysis_type: rodzaj, status: 'FINISHED',
          created_at: '2026-08-07T10:00:00+00:00',
          result: {
            contract: 'AcademicAnalysisResultV1', analysis_type: rodzaj,
            solver_version: 'v126-academic-whitebox-1.1', input_hash: 'akad-wejscie-demo',
            result: (odpowiedziV126 as Record<string, unknown>)[rodzaj],
            white_box_trace: kroki, deterministic_hash: 'akad-hash-demo',
          },
          proof_ref: 'proof:v126:demo', report_ref: 'report:v126:demo',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        run_id: 'run-akad-1', case_id: 'case-demo', analysis_type: rodzaj, status: 'FINISHED',
        result_url: '', trace_url: '', proof_url: '', report_url: '',
        deterministic_hash: 'akad-hash-demo',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/runs/v126/ssci_impedance')) {
    // Scena "ssci" (V-B): utworzenie przebiegu SSCI (koperta V126RunResponse).
    return new Response(
      JSON.stringify({ run_id: 'run-ssci-1', status: 'DONE', deterministic_hash: 'ssci-hash-demo' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/results/v126/ssci_impedance/stability')) {
    // Scena "ssci" (V-B): werdykt stabilnosci SSCI — ksztalt 1:1 z
    // `analysis/ssci_stability/serializer.py::view_to_dict` (kryterium
    // impedancyjne Nyquista; white_box: max|L| i margines fazy).
    return new Response(
      JSON.stringify({
        analysis_id: 'ssci-analysis-demo-01',
        context: {
          project_name: 'Przyłączenie farmy PV 8 MW', case_name: 'Stan normalny',
          run_timestamp: '2026-07-22T09:00:00Z', snapshot_id: 'snap-demo', trace_id: 'run-ssci-1',
        },
        gain_crossover_mag: 1.0,
        pm_risk_deg: 30.0,
        pm_unstable_deg: 0.0,
        verdict: {
          converter_ref: 'INV1',
          bus_ref: 'SZ-PV2',
          verdict: 'niestabilny',
          is_risk: true,
          why_pl: 'Przebieg L(jω) okrąża punkt −1 w paśmie przecięcia modułów — niestabilność SSCI.',
          max_minor_loop_gain: 1.42,
          has_magnitude_crossover: true,
          gain_crossover: { f_hz: 34.5, phase_l_deg: -178.0, phase_margin_deg: 2.0 },
          worst_phase_margin_deg: -3.5,
          worst_phase_margin_f_hz: 34.5,
          offending_frequency_hz: 34.5,
          nearest_to_minus_one: { f_hz: 34.5, mag: 1.42, phase_deg: -178.0, distance_to_minus_one: 0.42 },
          encirclement_count: 1,
          negative_resistance_present: true,
          negative_resistance_f_hz: 28.0,
          provenance: {
            worst_quality: 'ESTIMATED',
            worst_quality_label_pl: 'oszacowane',
            is_estimated: true,
            consumed_fields: ['current_loop_bandwidth_hz', 'pll_bandwidth_hz', 'filter_l_pu'],
            tag_pl: 'Werdykt oparty na oszacowanych polach karty falownika.',
          },
          missing_data: [],
          white_box: [
            {
              symbol: 'max|L|',
              formula_latex: '\\max_f |L(j\\omega)|',
              substitution_pl: 'maksimum modułu wzmocnienia pętli po częstotliwościach',
              result_pl: '1,42',
              unit_check_pl: '[-] (bezwymiarowe)',
            },
            {
              symbol: 'Δφ',
              formula_latex: '180^\\circ - |\\angle L|',
              substitution_pl: '180° − |∠L| w paśmie |L| ≥ 1: 180° − 183,5°',
              result_pl: '-3,50°',
              unit_check_pl: '[°]',
            },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  // Karta FAB-L (§0 L6): USUNIĘTA kompozycja `/api/catalog/complete-bay-templates`
  // budowana w harnessie (refy szablonów niezgodne z konwencją backendu —
  // `ZPUE__ROTOBLOK__*` zamiast realnego `ZPUE_WLOSZCZOWA__ROTOBLOK__*`).
  // Backend jest stateless/deterministyczny (`list_complete_bay_templates_endpoint`,
  // zero zależności DB) i zwraca bogatszy, realny skład (44 szablony dla ZPUE
  // Włoszczowa, 13 dla ABB — zweryfikowane pomiarem) — trasa idzie do niego.
  if (url.includes('/api/station-templates')) {
    // Biblioteka szablonów stacji — krok 0 kreatora. Pusta lista = uczciwy stan
    // „brak szablonów", ekran działa dalej (ścieżka „od zera").
    return new Response(JSON.stringify({ templates: [], total: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('/api/quality/conductor-thermal-withstand/proof')) {
    // Karta HARNESS-RESZTA (kontynuacja): dowod cieplny GALEZI Z NAJWIEKSZYM
    // pradem zwarciowym biegu kotwicy sceny "zwarcia" — REALNY bieg backendu
    // (eksport_fixtur_harnessu.py::cieplna_scena_dowod, TA SAMA funkcja co
    // koncowka `zbuduj_dowod_cieplny`), zero recznie wpisanych liczb fizycznych.
    if (url.includes(`branch_id=${cieplnaScenyDowod.branch_id}`)) return jsonOK(cieplnaScenyDowod);
  }
  if (url.includes('/api/quality/conductor-thermal-withstand')) {
    // Scena "cieplna": ocena per galaz — REALNY bieg backendu
    // (eksport_fixtur_harnessu.py::cieplna_scena_wynik, TA SAMA funkcja co
    // koncowka `build_wytrzymalosc_cieplna_view`) na biegu kotwicy sceny
    // "zwarcia" (siec zlota) — zero recznie wpisanych liczb fizycznych.
    return jsonOK(cieplnaScenyWynik);
  }
  if (url.includes('/api/quality/arc-flash')) {
    // Karta HARNESS-RESZTA (kontynuacja): scena "arcflash" — REALNY bieg
    // backendu (eksport_fixtur_harnessu.py::arcflash_scena_wynik, TA SAMA
    // funkcja co koncowka `build_arc_flash_view`, IEEE 1584-2018) na biegu
    // kotwicy sceny "zwarcia" (siec zlota) — zero recznie wpisanych liczb.
    return jsonOK(arcflashScenyWynik);
  }
  if (url.includes('/api/ncrfg-tests/run')) {
    // Scena „macierz" (E2E-FULL-FIX-3, 2026-09-10): bieg NC RfG/PTPiREE idzie do
    // REALNEGO solvera (bezstanowy i deterministyczny jak katalog wyżej). Dawna
    // ręczna atrapa niosła klasę modułu B dla 0,8 MW przy 0,4 kV (progi OD-5:
    // A < 1 MW) oraz werdykty dla danych, których scena nie wysyłała — trzeci
    // dryf tej samej klasy co katalog. Parametr `case_id` jest ZDEJMOWANY: dopina
    // on wyłącznie dowód certyfikatu z tabliczek modelu, a `case-demo` zasiewu nie
    // istnieje w backendzie (404); bez przypadku backend odsyła dowód z pustymi
    // polami (`dowody_certyfikatu(None, …)` — uczciwy stan zerowy).
    return originalFetch('/api/ncrfg-tests/run', init);
  }
  if (url.includes('/api/ncrfg-tests/cases/') && url.includes('/compliance')) {
    // Zgodność przekrojowa przypadku (karta S-3, dawniej W3-D) czyta committed ENM,
    // którego harness nie ma — odpowiedź liczy `scripts/eksport_fixtur_harnessu.py`
    // TĄ SAMĄ funkcją (`zgodnosc_ncrfg_przypadku`: most model → wejście solvera +
    // solver kanoniczny + koperta dowodowa S-1), co trasa
    // `run_ncrfg_compliance_from_model`. Para predykatów (KLASA, NIE INSTANCJA):
    // moduły biegu MUSZĄ opisywać moduły zasiane w tej scenie — rozjazd
    // ref/mocy/napięcia to odmowa 409 (łapie ją bramka „Nie udało się" specu),
    // nie cicha atrapa z poprzedniego zasiewu.
    const zasiane = selectAllDers(useStationDerStore.getState())
      .map((der) => `${der.id}|${der.nominal_power_kw}|${der.connection_voltage_kv}`)
      .sort();
    const zAtrapy = (zgodnoscPrzekrojowaScenyMacierz.bieg?.modules ?? [])
      .map((modul) => `${modul.der_ref}|${modul.p_max_kw}|${modul.voltage_kv}`)
      .sort();
    if (zasiane.join(';') !== zAtrapy.join(';')) {
      return new Response(
        JSON.stringify({
          detail:
            `atrapa zgodności przekrojowej opisuje moduły [${zAtrapy.join(', ')}], scena zasiewa `
            + `[${zasiane.join(', ')}] — uruchom scripts/eksport_fixtur_harnessu.py`,
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return jsonOK(zgodnoscPrzekrojowaScenyMacierz);
  }
  if (url.includes('/api/oze-analysis/lom-protection')) {
    // Scena "lom": ocena ochrony od pracy wyspowej — ksztalt 1:1 z
    // `application/analyses/ochrona_lom.py::build_ochrona_lom_view`; wywody
    // per porownanie 1:1 z `_wywod_okna` (kroki {tekst, latex}, zasada KaTeX).
    const zrodloRocof =
      'Rozporządzenie Komisji (UE) 2016/631 (NC RfG), Art. 13 ust. 1 lit. b '
      + '(zdolność pracy przy zmianach częstotliwości — ROCOF withstand); wartość krajowa PTPiREE 2 Hz/s';
    const zrodloFreq =
      'Rozporządzenie Komisji (UE) 2016/631 (NC RfG), Art. 13 ust. 1 lit. a '
      + '(pasmo częstotliwości pracy Europy kontynentalnej 47,5–51,5 Hz)';
    const zrodloSpz = 'SpzState.fast_time_s / slow_time_s jednostek nadrzędnych (BayProtectionControlUnit)';
    const komunikat81R =
      'Nastawa df/dt (1.0 Hz/s) poniżej dolnego okna (2.0 Hz/s) — ryzyko zbędnych '
      + 'wyłączeń (fałszywe wykrycie wyspy).';
    const komunikat81U = 'Próg 81U (47.5 Hz) w oknie normatywnym (≤ 47.5 Hz).';
    const komunikatSpz =
      'Brak danych o przerwie SPZ jednostek nadrzędnych (SpzState nieosiągalny w ENM) '
      + '— porównanie niemożliwe.';
    return new Response(
      JSON.stringify({
        analysis: 'ochrona_lom',
        context: { enm_name: 'Przyłączenie farmy PV 8 MW', enm_hash: 'enm-3c1d9f7b52a80e46' },
        input_hash: 'lom-9a4b7c2e6d1f0835',
        zalozenia_pl: [
          'Ocena LoM to interpretacja normatywna (porównania), nie symulacja fizyki wyspy.',
          'Moduł wytwórczy = generator w ENM; pole przyłączeniowe = pole (bay) na szynie '
          + 'modułu lub o roli OZE z przypisaniem zabezpieczeń.',
          'Okna normatywne pochodzą wyłącznie z cytowanych źródeł (NC RfG / PTPiREE); '
          + 'brak źródła → okno None + INFO, bez zmyślonych liczb.',
          'Czasy przerwy SPZ pochodzą z SpzState jednostek nadrzędnych; gdy nieosiągalne '
          + 'w ENM — uczciwy INFO.',
        ],
        normative_sources: {
          rocof_81R: { window_pl: 'df/dt ≥ 2.0 Hz/s', source_pl: zrodloRocof },
          vector_shift_78: { window_pl: null, source_pl: null },
          underfrequency_81U: { window_pl: 'próg f ≤ 47.5 Hz', source_pl: zrodloFreq },
          overfrequency_81O: { window_pl: 'próg f ≥ 51.5 Hz', source_pl: zrodloFreq },
        },
        fields: [
          {
            bay_ref: 'bay-pv-a', bay_name: 'Pole PV A', substation_ref: 'gpz-1',
            bus_ref: 'bus-oze-1', generating_module_refs: ['gen-pv-1'], status: 'ERROR',
            checks: [
              {
                kind: 'obecnosc', function_ansi: null, function_label_pl: null, severity: 'ERROR',
                message_pl:
                  'Pole modułu wytwórczego bez jakiejkolwiek funkcji ochrony od pracy '
                  + 'wyspowej (LoM: 81R / 78 / 81U / 81O).',
                value: null, unit: null, window: null, source_pl: null, wywod: [],
              },
            ],
          },
          {
            bay_ref: 'bay-bess-b', bay_name: 'Pole BESS B', substation_ref: 'gpz-1',
            bus_ref: 'bus-oze-2', generating_module_refs: ['gen-bess-1'], status: 'WARN',
            checks: [
              {
                kind: 'okno_normatywne', function_ansi: '81R',
                function_label_pl: 'Szybkość zmian częstotliwości (df/dt)', severity: 'WARN',
                message_pl: komunikat81R,
                value: 1.0, unit: 'Hz/s', window: 'df/dt ≥ 2.0 Hz/s', source_pl: zrodloRocof,
                // Wywod 1:1 z `_wywod_okna('rocof_81R', 1.0, WARN)`.
                wywod: [
                  {
                    tekst: 'Wzor: warunek okna normatywnego funkcji 81R (nastawa nie nizsza niz krawedz okna)',
                    latex: '\\left(\\tfrac{df}{dt}\\right)_{nast} \\ge 2.0\\ \\tfrac{\\text{Hz}}{\\text{s}}',
                  },
                  {
                    tekst: 'Dane: nastawa = 1.0000 (przekaznik pola), krawedz okna = 2.0 — dolna krawedz okna (NC RfG Art. 13(1)(b), PTPiREE 2 Hz/s).',
                    latex: null,
                  },
                  {
                    tekst: 'Podstawienie: 1.0000 >= 2.0 NIESPELNIONE',
                    latex: '1.0000 < 2.0\\ \\tfrac{\\text{Hz}}{\\text{s}}',
                  },
                  { tekst: `Werdykt: WARN — ${komunikat81R}`, latex: null },
                ],
              },
              {
                kind: 'koordynacja_spz', function_ansi: null,
                function_label_pl: 'Koordynacja czasowa z SPZ', severity: 'INFO',
                message_pl: komunikatSpz,
                value: 0.3, unit: 's',
                window: { spz_fast_time_s: null, spz_slow_time_s: null }, source_pl: zrodloSpz,
                wywod: [],
              },
            ],
          },
          {
            bay_ref: 'bay-fw-c', bay_name: 'Pole FW C', substation_ref: 'gpz-2',
            bus_ref: 'bus-oze-3', generating_module_refs: ['gen-fw-1', 'gen-fw-2'], status: 'INFO',
            checks: [
              {
                kind: 'okno_normatywne', function_ansi: '81U',
                function_label_pl: 'Podczęstotliwościowa (f<)', severity: 'OK',
                message_pl: komunikat81U,
                value: 47.5, unit: 'Hz', window: 'próg f ≤ 47.5 Hz', source_pl: zrodloFreq,
                // Wywod 1:1 z `_wywod_okna('underfrequency_81U', 47.5, OK)`.
                wywod: [
                  {
                    tekst: 'Wzor: warunek okna normatywnego funkcji 81U (nastawa nie wyzsza niz krawedz okna)',
                    latex: 'f_{81U} \\le 47.5\\ \\text{Hz}',
                  },
                  {
                    tekst: 'Dane: nastawa = 47.5000 (przekaznik pola), krawedz okna = 47.5 — gorna krawedz okna (NC RfG Art. 13(1)(a), pasmo 47,5-51,5 Hz).',
                    latex: null,
                  },
                  {
                    tekst: 'Podstawienie: 47.5000 <= 47.5 SPELNIONE',
                    latex: '47.5000 \\le 47.5\\ \\text{Hz}',
                  },
                  { tekst: `Werdykt: OK — ${komunikat81U}`, latex: null },
                ],
              },
              {
                kind: 'koordynacja_spz', function_ansi: null,
                function_label_pl: 'Koordynacja czasowa z SPZ', severity: 'INFO',
                message_pl: komunikatSpz,
                value: null, unit: 's',
                window: { spz_fast_time_s: null, spz_slow_time_s: null }, source_pl: zrodloSpz,
                wywod: [],
              },
            ],
          },
        ],
        modules_without_field: ['gen-pv-4'],
        summary: {
          fields_total: 3,
          generating_modules_total: 5,
          by_status: { OK: 0, INFO: 1, WARN: 1, ERROR: 1 },
          overall_status: 'ERROR',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/oze-analysis/frt-trajectories')) {
    // Scena "frt" (T-C): trajektorie LVRT z wywodem marginesu — ksztalt 1:1 z
    // `application/analyses/frt_trajektorie.py::build_frt_trajectories_view`
    // (wywod z `_wywod_scenariusza`: wzor -> dane -> podstawienie -> werdykt).
    const trajektoria = [
      { czas_s: 0.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
      { czas_s: 0.3, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
      { czas_s: 0.5, napiecie_pu: 0.05, iq_bierny_pu: 0.153, p_czynna_pu: 0.95 },
      { czas_s: 0.6, napiecie_pu: 0.05, iq_bierny_pu: 0.982, p_czynna_pu: 0.104 },
      { czas_s: 0.65, napiecie_pu: 0.05, iq_bierny_pu: 1.0, p_czynna_pu: 0.05 },
      { czas_s: 0.7, napiecie_pu: 0.525, iq_bierny_pu: 0.612, p_czynna_pu: 0.352 },
      { czas_s: 0.75, napiecie_pu: 1.0, iq_bierny_pu: 0.048, p_czynna_pu: 0.601 },
      { czas_s: 1.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 0.907 },
      { czas_s: 1.5, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 0.982 },
      { czas_s: 2.0, napiecie_pu: 1.0, iq_bierny_pu: 0.0, p_czynna_pu: 1.0 },
    ];
    return new Response(
      JSON.stringify({
        modul_der: { id: 'conv-pv-1mw-15kv', nazwa: 'Farma PV 1 MW / 15 kV', kind: 'PV', pmax_mw: 1.0, un_kv: 15.0 },
        operator: { id: 'pse', nazwa: 'PSE — Polskie Sieci Elektroenergetyczne' },
        test_kind: 'lvrt',
        status_solvera: 'ok',
        obwiednia_profilu: {
          rodzaj: 'lvrt',
          opis: 'Krzywa LVRT operatora: dozwolony przebieg napięcia (czas→napięcie) wg profilu NC RfG.',
          punkty: [
            { czas_s: 0.0, napiecie_pu: 0.05 },
            { czas_s: 0.15, napiecie_pu: 0.05 },
            { czas_s: 0.7, napiecie_pu: 0.5 },
            { czas_s: 1.5, napiecie_pu: 0.85 },
            { czas_s: 3.0, napiecie_pu: 0.9 },
          ],
        },
        scenariusze: [
          {
            scenario_id: 'lvrt_conv-pv-1mw-15kv',
            status: 'ok',
            stayed_connected: true,
            margin_to_curve_s: null,
            margin_to_curve_pu: 0.0,
            p_recovery_time_s: 0.31,
            werdykt_pl: 'w obwiedni',
            liczba_punktow_trajektorii: 10,
            // Wywod 1:1 z `_wywod_scenariusza` (liczby spojne: m_U = 0.000000,
            // 10 punktow trajektorii, t_odz = 0.310000 s).
            wywod: [
              {
                tekst:
                  'Scenariusz lvrt_conv-pv-1mw-15kv (LVRT): napiecie zaklocenia 0.0500 p.u. '
                  + 'przez 0.1500 s (wejscie solvera FROZEN frt_hvrt).',
                latex: null,
              },
              {
                tekst:
                  'Wzor: margines napieciowy trajektorii wzgledem krzywej minimalnej '
                  + '(minimum roznicy napiecia trajektorii i krzywej od poczatku zaklocenia)',
                latex: 'm_{U} = \\min_{t \\ge t_{z}}\\bigl(u(t) - u_{kr}(t)\\bigr)',
              },
              {
                tekst:
                  'Dane: margines z solvera m_U = 0.000000 p.u. '
                  + '(FrtScenarioResult.margin_to_curve_pu), liczba punktow trajektorii: 10.',
                latex: null,
              },
              {
                tekst: 'Podstawienie: warunek utrzymania w obwiedni m_U >= 0: 0.000000 >= 0 SPELNIONE',
                latex: 'm_{U} = 0.000000\\ \\text{p.u.} \\ge 0',
              },
              {
                tekst: 'Dane: czas odzysku mocy czynnej po zakloceniu t_odz = 0.310000 s (pole wyniku solvera).',
                latex: null,
              },
              { tekst: 'Werdykt: w obwiedni.', latex: null },
            ],
            trajektoria,
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/oze-analysis/frt-sequence')) {
    // Scena "frt" (T-B): sekwencja zapadow z kontekstem sily sieci — ksztalt 1:1
    // z `application/analyses/frt_sekwencja.py::build_frt_sekwencja_view`;
    // `kontekst_sily_sieci` = wiersz SCR z widoku sily sieci (D1) ze sladem
    // WHITE BOX (`KrokSladuSily`). Liczby spojne: SCR = 45,0 / 20,0 = 2,25.
    const wejscie = (glebokosc: number, czas: number) => ({
      test_kind: 'lvrt',
      voltage_dip_depth_pu: glebokosc,
      fault_duration_s: czas,
      target_der_ref: 'conv-pv-1mw-15kv',
    });
    return new Response(
      JSON.stringify({
        modul_der: { id: 'conv-pv-1mw-15kv', nazwa: 'Farma PV 1 MW / 15 kV', kind: 'PV', pmax_mw: 1.0, un_kv: 15.0 },
        operator: { id: 'pse', nazwa: 'PSE — Polskie Sieci Elektroenergetyczne' },
        status_solvera: 'der_dropped',
        obwiednia_profilu: {
          rodzaj: 'lvrt',
          opis: 'Krzywa LVRT operatora: dozwolony przebieg napięcia (czas→napięcie) wg profilu NC RfG.',
          punkty: [
            { czas_s: 0.0, napiecie_pu: 0.05 },
            { czas_s: 0.15, napiecie_pu: 0.05 },
            { czas_s: 0.7, napiecie_pu: 0.5 },
            { czas_s: 1.5, napiecie_pu: 0.85 },
            { czas_s: 3.0, napiecie_pu: 0.9 },
          ],
        },
        liczba_zapadow: 2,
        zapady: [
          {
            scenario_id: 'seq_0_conv-pv-1mw-15kv', glebokosc_pu: 0.05, czas_s: 0.15,
            status: 'ok', stayed_connected: true, margin_to_curve_pu: 0.0,
            margin_to_curve_s: null, p_recovery_time_s: 0.31, werdykt_pl: 'w obwiedni',
            wejscie_solvera: wejscie(0.05, 0.15),
          },
          {
            scenario_id: 'seq_1_conv-pv-1mw-15kv', glebokosc_pu: 0.02, czas_s: 0.5,
            status: 'der_dropped', stayed_connected: false, margin_to_curve_pu: -0.03,
            margin_to_curve_s: null, p_recovery_time_s: null, werdykt_pl: 'moduł wypadł',
            wejscie_solvera: wejscie(0.02, 0.5),
          },
        ],
        werdykt_sekwencji_pl: 'sekwencja niezaliczona — zapad 2',
        zalozenia_pl:
          'Stan modułu MIĘDZY zapadami (nagrzewanie, niepełny odzysk) nie jest modelowany: '
          + 'każdy zapad liczony od stanu ustalonego i oceniany niezależnie. Werdykt sekwencji '
          + 'to koniunkcja werdyktów poszczególnych zapadów — kompozycja wyników solvera, '
          + 'nie nowa fizyka.',
        kontekst_sily_sieci: {
          bus_ref: 'bus-oze-1',
          nominal_kv: 15.0,
          s_sc_mva: 45.0,
          s_installed_mva: 20.0,
          scr: 2.25,
          verdict: 'sieć słaba',
          is_weak: true,
          why_pl: 'SCR = 2,25 poniżej progu sieci słabej (3,0).',
          missing_data: [],
          white_box: [
            {
              symbol: 'SCR',
              formula_latex: 'SCR = S_sc / S_n',
              substitution_pl: 'SCR = 45,0 / 20,0',
              result_pl: 'SCR = 2,25',
            },
          ],
          modules: [
            { ref: 'gen-fw-karnice', name: 'Farma wiatrowa Karnice', sn_mva: 18.9 },
            { ref: 'der-pv-1', name: 'Farma PV 1 MW', sn_mva: 1.1 },
          ],
        },
        kontekst_sily_sieci_powod_pl: null,
        input_hash: 'frt-seq-2b8d4e6f9a1c0357',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (
    url.includes('/api/execution/study-cases/') &&
    url.endsWith('/runs') &&
    (init?.method ?? 'GET').toUpperCase() === 'POST'
  ) {
    // Scena "oltc": utworzenie przebiegu LF z opcja badania OLTC (kontrakt H1).
    return new Response(
      JSON.stringify({
        id: 'run-oltc-1', study_case_id: 'case-demo', analysis_type: 'LOAD_FLOW',
        solver_input_hash: 'oltc-in-5d7f2a91', status: 'PENDING',
        started_at: null, finished_at: null, error_message: null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (
    url.includes('/api/execution/study-cases/') &&
    url.endsWith('/runs') &&
    (init?.method ?? 'GET').toUpperCase() === 'GET'
  ) {
    // Lista przebiegow per przypadek (`listRuns`, `useWszystkiePrzebiegiProjektu`) —
    // wywolywana przez `PulpitProjektu` (scena "pulpit") dla KAZDEGO przypadku
    // projektu. Scena "pulpit" zasiewa `useExecutionRunsStore` TYM SAMYM
    // kontraktem (`PULPIT_PRZEBIEG_K1`) dla K1 (parytet wizualny z kafla
    // "Ostatni przebieg" sprzed tej trasy) — inne
    // przypadki dostaja uczciwa pusta liste (zero fabrykacji danych, ktorych
    // scena nie zasiala).
    const przypadekId = url.split('/api/execution/study-cases/')[1]?.split('/runs')[0] ?? '';
    if (przypadekId === 'K1') {
      return new Response(
        JSON.stringify({
          runs: [PULPIT_PRZEBIEG_K1],
          count: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ runs: [], count: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/execution/runs/') && url.endsWith('/execute')) {
    return new Response(
      JSON.stringify({
        id: 'run-oltc-1', study_case_id: 'case-demo', analysis_type: 'LOAD_FLOW',
        solver_input_hash: 'oltc-in-5d7f2a91', status: 'DONE',
        started_at: '2026-07-22T10:00:00Z', finished_at: '2026-07-22T10:00:03Z',
        error_message: null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/execution/runs/') && url.endsWith('/results')) {
    // Scena "oltc": wynik badania sweep — ksztalt 1:1 z
    // `power_flow_oltc_studies.py::TapSweepResult.to_dict()` w
    // `global_results.oltc_sweep`; wywod 1:1 z `_wywod_sweep` (liczby spojne
    // miedzy tabela punktow a krokami: t(n) = 1 + (n - 0) * 1.2500 / 100).
    const punkty = [
      { position: -2, tap_ratio: 0.975, controlled_bus_kv: 15.303, losses_mw: 0.2131, min_bus_kv: 14.883, max_bus_kv: 15.303 },
      { position: -1, tap_ratio: 0.9875, controlled_bus_kv: 15.109, losses_mw: 0.2094, min_bus_kv: 14.689, max_bus_kv: 15.109 },
      { position: 0, tap_ratio: 1.0, controlled_bus_kv: 14.92, losses_mw: 0.2067, min_bus_kv: 14.5, max_bus_kv: 14.92 },
      { position: 1, tap_ratio: 1.0125, controlled_bus_kv: 14.736, losses_mw: 0.2052, min_bus_kv: 14.316, max_bus_kv: 14.736 },
      { position: 2, tap_ratio: 1.025, controlled_bus_kv: 14.556, losses_mw: 0.2049, min_bus_kv: 14.136, max_bus_kv: 14.556 },
    ];
    return new Response(
      JSON.stringify({
        run_id: 'run-oltc-1', analysis_type: 'LOAD_FLOW',
        validation_snapshot: {}, readiness_snapshot: {}, element_results: [],
        global_results: {
          oltc_sweep: {
            branch_id: 'TR-1',
            controlled_bus_id: 'SZ-SN',
            points: punkty.map((p) => ({ ...p, converged: true })),
            wywod: [
              {
                tekst:
                  'Badanie: przeglad pozycji zaczepow (sweep) — rozplyw liczony solverem '
                  + 'FROZEN dla kazdej ustalonej pozycji zaczepu.',
                latex: null,
              },
              {
                tekst:
                  'Zakres pozycji: n = -2..2 (liczba punktow: 5); transformator TR-1, '
                  + 'szyna regulowana: SZ-SN.',
                latex: null,
              },
              {
                tekst: 'Wzor: przekladnia zaczepu t(n) = 1 + (n - n0) * du / 100',
                latex: 't(n) = 1 + \\frac{(n - n_{0}) \\cdot \\Delta u}{100}',
              },
              { tekst: 'Dane: krok zaczepu du = 1.2500 %, pozycja neutralna n0 = 0.', latex: null },
              ...punkty.map((p) => ({
                tekst:
                  `Pozycja n = ${p.position}: t = ${p.tap_ratio.toFixed(6)}, `
                  + `U szyny regulowanej = ${p.controlled_bus_kv.toFixed(3)} kV, `
                  + `straty = ${p.losses_mw.toFixed(6)} MW, zbiezny = TAK.`,
                latex:
                  `t(${p.position}) = 1 + \\frac{(${p.position} - 0) \\cdot 1.2500}{100}`
                  + ` = ${p.tap_ratio.toFixed(6)}`,
              })),
              {
                tekst:
                  'Kryterium odczytu: napiecie szyny regulowanej i straty czynne '
                  + 'pochodza z rozwiazania rozplywu (bez ocen w tej warstwie).',
                latex: null,
              },
            ],
          },
        },
        deterministic_signature: 'oltc-sweep-sig-8c3e1f5a',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/enm/field-view')) {
    // Sceny "przekaznik"/"pomiar" (karta Z-2): pusty widok pola z backendu —
    // useFieldReadModel spada wtedy na syntezę z bays snapshotu (fallback
    // udokumentowany w useFieldReadModel.ts), więc pole zasiane w snapshot
    // store staje się źródłem opcji formularza. Zero fabrykacji: kształt
    // odpowiedzi 1:1 z `FieldReadModelResponse` (pusty widok = uczciwy stan).
    return new Response(
      JSON.stringify({
        case_id: 'case-demo',
        enm_revision: 1,
        view_status: { data_source: 'ENM_FIELD_READ_MODEL', result_state: 'NONE', has_field_data: false },
        summary: {
          total_fields: 0, migrated_count: 0, requires_completion_count: 0,
          source_fields_count: 0, coupler_fields_count: 0, fields_with_results_count: 0,
        },
        fields: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/api/quality/design-verdict')) {
    // Werdykt projektowy (`build_werdykt_projektowy_view`) czyta rejestr przebiegów
    // backendu, którego zasiew harnessu nie zna — odpowiedź policzona przez
    // `scripts/eksport_fixtur_harnessu.py` tym samym agregatem, bez biegów:
    // wszystkie kryteria „niesprawdzone", a rejestr „Co wymaga uwagi" bierze
    // przekroczenia ze store'u rozpływu (`co-wymaga-uwagi/model.ts`). Bez atrapy
    // zapytanie leciało do realnego backendu i wracało 404 przy każdym renderze.
    // B-02 / W3-E: sceny ekranu „Ocena techniczna wyników" dostają werdykt z REALNYCH
    // biegów PF + zwarć złotej sieci (scena przekroczeń: obciążenie ×8 — realne
    // NIE SPEŁNIA napięć/gałęzi/transformatora), policzony tym samym agregatem.
    if (creator === 'ocena') return jsonOK(werdyktProjektowyScenyOcena);
    if (creator === 'ocena-przekroczenia') return jsonOK(werdyktProjektowyScenyOcenaPrzekroczenia);
    return jsonOK(werdyktProjektowyScenyUwaga);
  }
  if (url.includes('/api/study-cases/') && url.endsWith('/protection-config')) {
    // Konfiguracja zabezpieczeń przypadku (P14c) — scena „koordynacja" zapisuje
    // urządzenia NATYWNYM klikiem (`zapiszUrzadzeniaKoordynacji` → PUT). Bez atrapy
    // realny backend odpowiadał 400 dla `case-demo`, a zrzut do oceny niósł
    // notyfikację „Błąd zapisu" po każdym zapisie. PUT zachowuje się jak
    // `StudyCaseService.update_protection_config`: zapisana konfiguracja wraca
    // w odpowiedzi i w kolejnym GET, `bound_at` tylko przy związaniu szablonu.
    if ((init?.method ?? 'GET').toUpperCase() === 'PUT') {
      const zadanie = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      konfiguracjaZabezpieczenPrzypadku = {
        template_ref: zadanie.template_ref ?? null,
        template_fingerprint: zadanie.template_fingerprint ?? null,
        library_manifest_ref: zadanie.library_manifest_ref ?? null,
        overrides: zadanie.overrides ?? {},
        bound_at: zadanie.template_ref ? '2026-07-28T08:10:00+00:00' : null,
      };
    }
    return jsonOK(konfiguracjaZabezpieczenPrzypadku);
  }
  return originalFetch(input as RequestInfo, init);
}) as typeof window.fetch;

// --- Zaszczepienie stanu store ------------------------------------------
useAppStateStore.setState({ activeCaseId: 'case-demo' } as never);
// Rejestr przebiegów należy do aktywnego zakresu (jak po hydratacji K2) — bez
// tej pary warsztat wyników uczciwie pokazuje stan „wczytywanie rejestru", a nie
// sceny. Sceny z własnym zakresem zasiewają oba pola razem (pulpit, diagnoza).
useExecutionRunsStore.setState({ activeStudyCaseId: 'case-demo' } as never);
useSnapshotStore.setState({
  // S9-11 / W-5: znaczniki świeżości czytają JEDNO źródło rewizji bieżącego
  // modelu (`rewizjaBiezacegoModelu`), nie rewizję wyświetlanej migawki — sceny
  // harnessu zasiewają oba pola spójnie (jak każda odpowiedź domain-ops).
  rewizjaBiezacegoModelu: 1,
  snapshot: {
    // K3-B1: rewizja modelu w migawce globalnej — bez niej znacznik świeżości
    // nagłówka (`useSwiezoscNaglowka`) nie renderował
    // się w ŻADNEJ scenie mimo kontraktu przebiegu z `rewizja_modelu`. Sceny z
    // własnym zasiewem migawki (dokumentacja rev. 7, pulpit rev. 9, zbieżność —
    // ZBIEZNOSC_SNAPSHOT, cieplna rev. 2 = wariant NIEAKTUALNY) nadpisują ją niżej.
    header: { name: 'Projekt demonstracyjny', revision: 1 },
    substations: [{ ref_id: 'st-demo', name: 'Rozdzielnia GPZ-01', bus_refs: ['bus-sn-demo', 'bus-nn-demo'] }],
    transformers: [],
    buses: [
      { ref_id: 'bus-sn-demo', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-nn-demo', name: 'Szyna nN', voltage_kv: 0.4 },
    ],
    sources: [],
    loads: [],
    bays: [],
  },
} as never);

const creator = new URLSearchParams(window.location.search).get('creator') ?? 'pole';

/**
 * Rekord przyłączenia DER do zasiewu `useStationDerStore` (sceny dowodowe OZE:
 * frt/macierz). Pełny kształt `StationDerConnection` — wartości domyślne to
 * kompletne przyłączenie nN 0,4 kV w stacji demo (nadpisywane per scena).
 */
function derDemo(
  over: Partial<StationDerConnection> & Pick<StationDerConnection, 'id' | 'der_kind' | 'name'>,
): StationDerConnection {
  return {
    project_id: 'proj-demo',
    station_id: 'st-demo',
    connection_side: 'nN',
    bus_przylaczenia_ref: 'st-demo__szyna-nn__0.4',
    bay_ref: null,
    transformer_ref: null,
    lv_busbar_ref: 'szyna-nn',
    sn_connection_bus_ref: null,
    sn_connection_point_kind: null,
    connection_voltage_kv: 0.4,
    catalogs: EMPTY_DER_CATALOGS,
    profiles: EMPTY_DER_PROFILES,
    nominal_power_kw: null,
    unit_count: null,
    completeness: 'complete',
    readiness: EMPTY_DER_READINESS,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...over,
  };
}

if (creator === 'arcflash') {
  // Karta HARNESS-RESZTA (kontynuacja): identyfikator biegu z REALNEGO biegu
  // backendu (eksport_fixtur_harnessu.py::arcflash_scena_wynik, reuzywa
  // kotwice sceny "zwarcia") — zero recznego run_id.
  const run: ExecutionRun = {
    id: arcflashScenyWynik.context.run_id, analysis_type: 'SC_3F', status: 'DONE',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({
    runs: [run], activeRunId: arcflashScenyWynik.context.run_id,
  } as never);
} else if (creator === 'dokumentacja') {
  // Hub „Dokumentacja" (F-E8.1): pełny kontekst toru pracy — projekt, wariant,
  // wersja układu (rewizja + hash) i ZAKOŃCZONY przebieg → karty odblokowane
  // („można wytworzyć"), tabliczka pokazuje realne wartości (nie stan zerowy).
  useAppStateStore.setState({
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseName: 'Wariant zimowy',
  } as never);
  const szyna = (v: number, i: number) => ({ ref_id: `bus-${v}-${i}`, name: `Szyna ${v} kV`, voltage_kv: v });
  useSnapshotStore.setState({
    rewizjaBiezacegoModelu: 7,
    snapshot: {
      header: { name: 'Projekt demonstracyjny', revision: 7, hash_sha256: 'a1b2c3d4e5f60718' },
      substations: [{ ref_id: 'st-demo', name: 'GPZ-01', bus_refs: ['bus-110-0', 'bus-15-0'] }],
      // Realistyczna mała sieć SN — panel „Analizowany model" pokazuje realne liczby.
      buses: [szyna(110, 0), szyna(15, 0), szyna(15, 1), szyna(15, 2), szyna(0.4, 0), szyna(0.4, 1)],
      branches: [{ ref_id: 'l1' }, { ref_id: 'l2' }, { ref_id: 'l3' }, { ref_id: 'l4' }, { ref_id: 'l5' }, { ref_id: 'l6' }, { ref_id: 'l7' }, { ref_id: 'l8' }],
      transformers: [{ ref_id: 't1' }, { ref_id: 't2' }],
      sources: [{ ref_id: 's1' }],
      generators: [{ ref_id: 'g1' }, { ref_id: 'g2' }],
      loads: [{ ref_id: 'o1' }, { ref_id: 'o2' }, { ref_id: 'o3' }, { ref_id: 'o4' }, { ref_id: 'o5' }],
      bays: [],
    },
  } as never);
  const run: ExecutionRun = {
    id: 'run-lf-1', analysis_type: 'LOAD_FLOW', status: 'DONE',
    started_at: '2026-07-21T10:30:00Z', finished_at: '2026-07-21T10:30:00Z',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [run], activeRunId: 'run-lf-1' } as never);
} else if (creator === 'diagnoza') {
  // Diagnoza przebiegu (D7): najbardziej informacyjny stan do oceny wizualnej —
  // preflight z blokadami + problemy modelu + bieg NIEZBIEZNY (limit iteracji).
  // Harness jest frontend-only, wiec trzy trasy diagnostyki dostaja atrape fetch
  // na FIKSTURACH z testow kontraktu (te same ksztalty, ktore pilnuje adapter).
  const odpowiedzJson = (dane: unknown): Response =>
    new Response(JSON.stringify(dane), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  const oryginalneFetch = window.fetch.bind(window);
  window.fetch = async (wejscie: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof wejscie === 'string'
        ? wejscie
        : wejscie instanceof URL
          ? wejscie.toString()
          : wejscie.url;
    if (url.includes('/diagnostics/preflight')) return odpowiedzJson(preflightZablokowanyFixture());
    if (url.includes('/api/execution/runs/') && url.includes('/diagnostics'))
      return odpowiedzJson(diagnozaNiezbieznaFixture());
    if (url.includes('/api/cases/') && url.includes('/diagnostics'))
      return odpowiedzJson(diagnostykaZBrakamiFixture());
    return oryginalneFetch(wejscie, init);
  };
  const biegDiagnozy: ExecutionRun = {
    id: 'run-diagnoza-1',
    analysis_type: 'LOAD_FLOW',
    status: 'DONE',
    started_at: '2026-08-14T09:00:00Z',
    finished_at: '2026-08-14T09:00:04Z',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({
    runs: [biegDiagnozy],
    activeRunId: 'run-diagnoza-1',
    activeStudyCaseId: 'case-oceny-diagnozy',
  } as never);
} else if (creator === 'pulpit') {
  // Pulpit projektu (E1 — K2/V12K-103): kafel „Warunki przyłączenia" z warunkami
  // OSD z nagłówka + werdykt bilansu (generacja 6,2 MW > limit 5,0 MW).
  useSnapshotStore.setState({
    rewizjaBiezacegoModelu: 9,
    snapshot: {
      header: {
        name: 'Przyłączenie farmy PV 8 MW', revision: 9, hash_sha256: 'f00dfacecafe0123',
        connection_conditions: { moc_przylaczeniowa_mw: 5.0, wymagany_cos_phi: 0.95, tryb_pracy: 'praca równoległa z siecią' },
      },
      substations: [{ ref_id: 'st-1', name: 'GPZ-01', bus_refs: ['b110', 'b15'] }],
      buses: [
        { ref_id: 'b110', name: 'Szyna 110 kV', voltage_kv: 110 },
        { ref_id: 'b15', name: 'Szyna 15 kV', voltage_kv: 15 },
      ],
      branches: [{ ref_id: 'l1' }, { ref_id: 'l2' }, { ref_id: 'l3' }],
      transformers: [{ ref_id: 't1' }],
      sources: [{ ref_id: 's1', name: 'GPZ 110/15', bus_ref: 'b15', sk3_mva: 250, ik3_ka: 9.62 }],
      generators: [
        { ref_id: 'g1', bus_ref: 'b15', p_mw: 4.0 },
        { ref_id: 'g2', bus_ref: 'b15', p_mw: 2.2 },
      ],
      loads: [{ ref_id: 'o1', bus_ref: 'b15', p_mw: 1.4 }],
      bays: [], junctions: [], corridors: [], measurements: [], protection_assignments: [],
    },
    readiness: { ready: true, blockers: [], warnings: [] },
  } as never);
  useStudyCasesStore.setState({
    cases: [
      { id: 'K1', name: 'Stan normalny', description: 'Konfiguracja bazowa', result_status: 'FRESH', results_valid: true, is_active: true, updated_at: '2026-07-21T10:00:00Z' },
      { id: 'K2', name: 'Zwarcia maks.', description: 'c_max, pełna generacja', result_status: 'OUTDATED', results_valid: false, is_active: false, updated_at: '2026-07-20T09:00:00Z' },
    ],
    activeCase: { id: 'K1', name: 'Stan normalny', result_status: 'FRESH', results_valid: true } as never,
  } as never);
  const run = PULPIT_PRZEBIEG_K1 as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [run], activeStudyCaseId: 'K1' } as never);
} else if (creator === 'uwaga') {
  // Rejestr „Co wymaga uwagi" (A1/V12K-098 + kontekstowe akcje K1/V12K-101):
  // Karta HARNESS-RESZTA (kontynuacja) — REALNY bieg backendu
  // (eksport_fixtur_harnessu.py::rozplyw_scena_wynik, PF na sieci zlotej z
  // obciazeniem x8, realne przekroczenia napiec), zero recznie wpisanych
  // liczb fizycznych. TEN SAM bieg co scena "rozplyw" obok.
  usePowerFlowResultsStore.setState({
    results: rozplywScenyWynik,
    runHeader: { id: rozplywScenyWynik.run_id },
  } as never);
} else if (creator === 'walidacja') {
  // Walidacja energetyczna ze sladem WHITE BOX per pozycja (R2-A/V12K-105);
  // dane z podmienionego fetch (ksztalt 1:1 z builderem backendu).
} else if (creator === 'kompensacja' || creator === 'kompensacja-wynik') {
  // „Dobor kompensacji" z pre-selekcja wezla z deep-linku (R2-B/V12K-106):
  // wezly z realnego snapshot store, preselekcja przez props ekranu.
  // Ekran wymaga zakonczonego przebiegu rozplywu (uczciwa blokada) — zasiew.
  // Scena "kompensacja-wynik" (V-B) reuzywa ten sam zasiew: spec wybiera wezel
  // i klika „Oblicz" natywnie (bez preselekcji), wynik z podmienionego fetch.
  // Karta HARNESS-RESZTA (kontynuacja): identyfikator biegu i wezly
  // (bus_sn_b/bus_sn_main/bus_nn) z REALNEGO biegu backendu
  // (eksport_fixtur_harnessu.py::kompensacja_scena_wynik, PF sieci zlotej)
  // — zero recznie wpisanych identyfikatorow/liczb.
  const runKomp: ExecutionRun = {
    id: kompensacjaScenyWynik.context.run_id, analysis_type: 'LOAD_FLOW', status: 'DONE',
    started_at: '2026-07-22T08:00:00Z', finished_at: '2026-07-22T08:00:04Z',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({
    runs: [runKomp], activeRunId: kompensacjaScenyWynik.context.run_id,
  } as never);
  useSnapshotStore.setState({
    snapshot: {
      header: { name: 'CGMES Golden Net' },
      substations: [], transformers: [], sources: [], loads: [], bays: [],
      buses: [
        { ref_id: 'bus_sn_main', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus_sn_b', name: 'Stacja B SN', voltage_kv: 15 },
        { ref_id: 'bus_sn_c', name: 'Stacja C SN', voltage_kv: 15 },
      ],
    },
  } as never);
} else if (creator === 'rozplyw') {
  // Rozplyw z kolumna obciazalnosci (R3-A/V12K-110): wynik PF read-only +
  // werdykty z podmienionego endpointu walidacji (target_id = branch_id).
  // Karta HARNESS-RESZTA (kontynuacja) — REALNY bieg backendu (eksport_
  // fixtur_harnessu.py::rozplyw_scena_wynik, PF na sieci zlotej z
  // obciazeniem x8), zero recznie wpisanych liczb fizycznych.
  usePowerFlowResultsStore.setState({
    results: rozplywScenyWynik,
    runHeader: { id: rozplywScenyWynik.run_id },
  } as never);
} else if (creator === 'zwarcia') {
  // Wyniki zwarciowe z wkladami zrodel (R3-B/V12K-109): tabela punktow ze
  // store'u read-only, wklady/rozplyw/pasmo z podmienionych koncowek.
  // HARNESS-ZWARCIA-Z-BACKENDU (2026-09-16): fixtura REALNEGO biegu backendu
  // (`eksport_fixtur_harnessu.py::zwarcia_wyniki_scena_zwarcia`, sc na sieci
  // zlotej `build_golden_enm` — tor sieci nadrzednej + tor falownika `gen_pv`),
  // zero recznie wpisanych liczb fizycznych.
  useResultsInspectorStore.setState({
    shortCircuitResults: zwarciaWynikiScenyZwarcia,
    selectedRunId: zwarciaWynikiScenyZwarcia.run_id,
  } as never);
} else if (creator === 'zwarcia-rozplyw') {
  // Karta Z-3 (dowody wizualne pkt 7 karty właściciela): sekcja „Rozpływ
  // prądu zwarciowego" (RozplywZwarciowy) — TEN SAM bieg realny co scena
  // „zwarcia" (HARNESS-ZWARCIA-Z-BACKENDU); punkt domyślny (pierwszy wiersz
  // wg sortu kanonicznego, bez preselekcji) niesie tor sieci nadrzędnej
  // (THEVENIN_GRID) ORAZ tor falownika (gen_pv) RAZEM w `branch_contributions`
  // (podmieniony endpoint rozpływu), jak dotychczasowa scena Z-3.
  useResultsInspectorStore.setState({
    shortCircuitResults: zwarciaWynikiScenyZwarcia,
    selectedRunId: zwarciaWynikiScenyZwarcia.run_id,
  } as never);
} else if (creator === 'sila-sieci') {
  // Runda dowodowa V-B: sekcja sily sieci (SCR/WSCR) pulpitu OZE — wymaga
  // zakonczonego przebiegu zwarciowego; wywod white_box z grid-strength.
  // Karta HARNESS-RESZTA (kontynuacja): identyfikator biegu z REALNEGO biegu
  // backendu (eksport_fixtur_harnessu.py::sila_sieci_scena_wynik) — zero
  // recznego run_id.
  const runSc: ExecutionRun = {
    id: silaSieciScenyWynik.context.run_id, analysis_type: 'SC_3F', status: 'DONE',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({
    runs: [runSc], activeRunId: silaSieciScenyWynik.context.run_id,
  } as never);
} else if (creator === 'odbior-zgodnosc') {
  // Runda dowodowa V-B: „Zgodnosc powykonawcza" — wymaga zakonczonego
  // przebiegu rozplywu (slad_pl per wiersz z podmienionego fetch).
  const runLf5: ExecutionRun = {
    id: 'run-lf-5', analysis_type: 'LOAD_FLOW', status: 'DONE',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [runLf5], activeRunId: 'run-lf-5' } as never);
} else if (creator === 'estymacja') {
  // Runda dowodowa V-B: „Estymacja stanu (WLS)" — wymaga zakonczonego
  // przebiegu rozplywu (zrodlo Y-bus); wymagania + wynik z podmienionego fetch.
  const runLf6: ExecutionRun = {
    id: 'run-lf-6', analysis_type: 'LOAD_FLOW', status: 'DONE',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [runLf6], activeRunId: 'run-lf-6' } as never);
} else if (creator === 'akademickie') {
  // B-02 / W3-E: migawka z NAZWAMI obiektów sieci złotej (te same referencje, które
  // niosą fixtury gotowości liczone backendem — `bus_sn_b` → „Stacja B SN") oraz
  // obiektów pod referencjami produkcyjnymi fixtury odpowiedzi solvera — most
  // referencja → nazwa działa dla obu źródeł, nie etykieta zapasowa. Bez `rodzaj` w
  // adresie scena startuje w KATALOGU KART (widok domyślny okna).
  useSnapshotStore.setState({
    rewizjaBiezacegoModelu: REWIZJA_SIECI_ZLOTEJ,
    snapshot: migawkaSieciZlotej(),
  } as never);
} else if (creator === 'ocena' || creator === 'ocena-przekroczenia') {
  // B-02 / W3-E: ekran „Ocena techniczna wyników" — nazwy projektu/przypadku do
  // nagłówka PODSTAWA OCENY, migawka złotej sieci (nazwy obiektów pod referencjami
  // fixtury werdyktu), rewizja migawki = rewizja biegów fixtury (znacznik AKTUALNE).
  // Werdykt z podmienionego fetch — policzony backendem na realnych biegach.
  useAppStateStore.setState({
    activeProjectId: 'proj-demo',
    activeProjectName: 'CGMES Golden Net',
    activeCaseId: 'case-demo',
    activeCaseName: creator === 'ocena' ? 'Stan normalny' : 'Obciążenie ×8',
  } as never);
  useSnapshotStore.setState({
    rewizjaBiezacegoModelu: REWIZJA_SIECI_ZLOTEJ,
    snapshot: migawkaSieciZlotej(),
  } as never);
} else if (creator === 'ssci' || creator === 'migotanie') {
  // Runda dowodowa V-B: ssci — aktywny przypadek 'case-demo' zasiany globalnie;
  // migotanie — przebieg zwarciowy podawany propem sekcji. Pusta galaz chroni
  // przed otwarciem formularza operacji kreatora w galezi domyslnej.
} else if (creator === 'porownanie') {
  // Porownanie przebiegow A/B (R3-C/V12K-111): lista przebiegow i wynik
  // porownania z podmienionego fetch; nazwy przypadkow ze store'u.
  useStudyCasesStore.setState({
    cases: [
      { id: 'K1', name: 'Stan normalny' },
      { id: 'K2', name: 'Wariant z kompensacja' },
    ],
  } as never);
} else if (creator === 'swiezosc') {
  // Pasek aktywnego przypadku (K4/V12K-102): wyniki NIEAKTUALNE → klikalny znacznik.
  // Chip wyników renderuje się wyłącznie przy obecnym projekcie (projectPresent).
  useAppStateStore.setState({
    activeProjectId: 'proj-demo',
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseId: 'K1',
    activeCaseName: 'Stan normalny',
  } as never);
  useStudyCasesStore.setState({
    activeCase: { id: 'K1', name: 'Stan normalny', result_status: 'OUTDATED', results_valid: false } as never,
  } as never);
} else if (creator === 'lom') {
  // Scena „lom" (V-A): EkranLom czyta case_id z AKTYWNEGO przypadku (store
  // study-cases) — zasiew; ocena z podmienionego endpointu lom-protection.
  useStudyCasesStore.setState({
    activeCase: { id: 'case-demo', name: 'Stan normalny', result_status: 'FRESH', results_valid: true } as never,
  } as never);
} else if (creator === 'wiazania') {
  // Scena „wiazania" (V12K-242): ekran wyboru wiazan katalogowych wytworcy —
  // ostatnie ogniwo lancucha F-K8. Rekord celowo pokazuje TRZY stany naraz:
  // zabezpieczenie i przekladnik pradowy przypisane (nazwa z realnego katalogu),
  // przekladnik napieciowy pusty (polecenie wyboru). Projekt i przypadek ustawione,
  // bo bez nich zapis jest zablokowany — i ekran musi to umiec pokazac.
  useAppStateStore.setState({
    activeProjectId: 'proj-demo',
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseId: 'case-demo',
    activeCaseName: 'Wariant zimowy',
  } as never);
  useStationDerStore.setState({
    ders: {
      'der-pv-1': derDemo({
        id: 'der-pv-1',
        der_kind: 'PV',
        name: 'Farma PV 1 MW',
        connection_side: 'dedicated_transformer',
        sn_connection_point_kind: 'station_bus',
        bus_przylaczenia_ref: 'st-demo__szyna-sn__15',
        lv_busbar_ref: null,
        connection_voltage_kv: 15,
        nominal_power_kw: 1000,
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          // Karta FAB-L (§0 L6): dawne zmyślone `pv-1` → realny identyfikator
          // katalogu backendu (`conv-pv-1mw-15kv`, `GET /api/catalog/pv-inverter-types`).
          device_catalog_ref: 'conv-pv-1mw-15kv',
          protection_catalog_ref: 'ABB_REB670',
          ct_catalog_ref: 'ct_200_5_5p10_10va_abb',
        },
        profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'pse' },
      }),
    },
  } as never);
} else if (creator === 'frt') {
  // Scena „frt" (V-A): moduł DER z typem przekształtnika (selectAllDers) +
  // zakończony przebieg zwarciowy do doboru kontekstu siły sieci (T-B).
  useStationDerStore.setState({
    ders: {
      'der-pv-1': derDemo({
        id: 'der-pv-1',
        der_kind: 'PV',
        name: 'Farma PV 1 MW',
        connection_side: 'dedicated_transformer',
        sn_connection_point_kind: 'station_bus',
        bus_przylaczenia_ref: 'st-demo__szyna-sn__15',
        lv_busbar_ref: null,
        connection_voltage_kv: 15,
        nominal_power_kw: 1000,
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'conv-pv-1mw-15kv',
          // Karta FAB-L (§0 L6): dawny zmyślony `dyn-grid-following-pv` →
          // realny profil dynamiczny backendu (`default_pv_gfl`,
          // `GET /api/catalog/der-dynamic-profiles`).
          dynamic_model_ref: 'default_pv_gfl',
        },
        profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'pse', lvrt_curve_ref: 'pse' },
      }),
    },
  } as never);
  const runSc: ExecutionRun = {
    id: 'run-sc-9', analysis_type: 'SC_3F', status: 'DONE',
    started_at: '2026-07-22T09:15:00Z', finished_at: '2026-07-22T09:15:04Z',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [runSc] } as never);
} else if (creator === 'macierz') {
  // Scena „macierz" (V-A): dwa moduły DER (kolejność selectAllDers: bess-1,
  // pv-1) z mocą katalogową i poziomem napięcia — gotowe do biegu NC RfG.
  useAppStateStore.setState({
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseName: 'Stan normalny',
  } as never);
  // Zasiew (E2E-FULL-FIX-3, 2026-09-10): moduły klasy B wg progów OD-5 (1 MW / 50 MW),
  // przyłączone transformatorem blokowym do szyny 15 kV stacji — dawne 0,8/0,5 MW
  // przy 0,4 kV były klasą A, a ręczna atrapa biegu twierdziła „B". Moce = liczba
  // jednostek × moc katalogowa (ABB PCS100 500 kW; Huawei SUN2000-215KTL 215 kW).
  useStationDerStore.setState({
    ders: {
      'bess-1': derDemo({
        id: 'bess-1',
        der_kind: 'BESS',
        name: 'Magazyn energii 1,5 MW',
        connection_side: 'dedicated_transformer',
        bus_przylaczenia_ref: 'st-demo__szyna-sn__15',
        lv_busbar_ref: null,
        transformer_ref: 'tr-blok-bess-1',
        sn_connection_bus_ref: 'st-demo__szyna-sn__15',
        sn_connection_point_kind: 'station_bus',
        connection_voltage_kv: 15,
        nominal_power_kw: 1500,
        unit_count: 3,
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          // Karta FAB-L (§0 L6): realne identyfikatory katalogu backendu
          // (`GET /api/catalog/bess-inverter-types`, `.../bess-battery-types`).
          device_catalog_ref: 'bess_pcs_abb_500',
          battery_catalog_ref: 'bess_bat_lfp_2880kwh_1230vdc',
        },
        profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'enea' },
      }),
      'pv-1': derDemo({
        id: 'pv-1',
        der_kind: 'PV',
        name: 'Instalacja PV 1,9 MW',
        connection_side: 'dedicated_transformer',
        bus_przylaczenia_ref: 'st-demo__szyna-sn__15',
        lv_busbar_ref: null,
        transformer_ref: 'tr-blok-pv-1',
        sn_connection_bus_ref: 'st-demo__szyna-sn__15',
        sn_connection_point_kind: 'station_bus',
        connection_voltage_kv: 15,
        nominal_power_kw: 1935,
        unit_count: 9,
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          // Karta FAB-L (§0 L6): jedyny realny falownik PV z powiązanym certyfikatem
          // PTPiREE w katalogu backendu (`GET /api/catalog/pv-inverter-types`) i realny
          // profil dynamiczny (`GET /api/catalog/der-dynamic-profiles`).
          device_catalog_ref: 'conv-pv-card-huawei-sun2000-215ktl',
          ptpiree_certificate_ref:
            'ptpiree-wipwc-1-2-row-3254-huawei-technologies-co-ltd-pv-sun2000-215ktl-h3',
          // Karta CERTYFIKAT-Z-KATALOGU: backend zapisuje `ptpiree_status`
          // ZAWSZE razem z `ptpiree_certificate_ref` (jedna adnotacja,
          // `annotate_with_ptpiree_status`) — scena harnessu odzwierciedla ten
          // sam kształt tabliczki.
          ptpiree_status: 'POWIAZANY',
          dynamic_model_ref: 'default_pv_gfl',
        },
        profiles: {
          ...EMPTY_DER_PROFILES,
          nc_rfg_profile_ref: 'enea',
          lvrt_curve_ref: 'enea',
        },
      }),
    },
  } as never);
} else if (creator === 'oltc') {
  // Scena „oltc" (V-A): aktywny przypadek `case-demo` z zasiewu globalnego
  // (useAppStateStore) — bieg badania przez podmienione końcówki execution.
} else if (creator === 'wyniki-skladowe') {
  // Scena E-29 (karta Z-1): przebieg zwarcia NIESYMETRYCZNEGO (SC_1F) → ekran
  // wybiera go automatycznie; dane spływają z podmienionych końcówek wyników.
  useShellStore.setState({ advancementMode: 'expert' });
  useExecutionRunsStore.setState({
    runs: [
      {
        id: 'run-1f',
        analysis_type: 'SC_1F',
        status: 'DONE',
        finished_at: '2026-07-21T10:00:00Z',
        started_at: '2026-07-21T09:59:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'wyniki-zbieznosc') {
  // Scena E-30 (karta Z-1): zakończony rozpływ (LOAD_FLOW) + snapshot z
  // transformatorem OLTC (założenia zaczepów modelu).
  useShellStore.setState({ advancementMode: 'expert' });
  useAppStateStore.getState().setActiveProject('proj-demo', 'Przyłączenie farmy PV 8 MW');
  useSnapshotStore.setState({
    snapshot: ZBIEZNOSC_SNAPSHOT,
    rewizjaBiezacegoModelu: ZBIEZNOSC_SNAPSHOT.header.revision,
  } as never);
  useExecutionRunsStore.setState({
    runs: [
      {
        id: 'run-lf-1',
        analysis_type: 'LOAD_FLOW',
        status: 'DONE',
        finished_at: '2026-07-20T10:00:00Z',
        started_at: '2026-07-20T09:59:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'koordynacja') {
  // Scena E-28 (V12K-262): ekran koordynacji WYMAGA zakonczonego biegu zwarciowego —
  // bez niego pokazuje uczciwy stan zerowy. Prady koordynacji buduja sie z WIERSZY
  // wyniku (F-K4: zero losowania), wiec scena zasiewa bieg i podmienia koncowki
  // wynikow; urzadzenia dodaje sie NATYWNYM klikiem w tescie, nie wymuszeniem stanu.
  useShellStore.setState({ advancementMode: 'expert' });
  useAppStateStore.getState().setActiveProject('proj-demo', 'Przyłączenie farmy PV 8 MW');
  useAppStateStore.getState().setActiveCase('case-demo', 'Wariant zimowy', null, 'FRESH');
  useExecutionRunsStore.setState({
    runs: [
      {
        id: 'run-sc-koord-max',
        analysis_type: 'SC_3F',
        status: 'DONE',
        finished_at: '2026-07-28T08:00:00Z',
        started_at: '2026-07-28T07:59:00Z',
      } as unknown as ExecutionRun,
      {
        // Bieg MINIMALNY (c = 0,95) — bez niego czulosc jest niesprawdzalna, a
        // `zbudujPradyKoordynacji` w ogole nie tworzy pozycji pradowej.
        id: 'run-sc-koord-min',
        analysis_type: 'SC_3F',
        status: 'DONE',
        finished_at: '2026-07-28T08:02:00Z',
        started_at: '2026-07-28T08:01:00Z',
      } as unknown as ExecutionRun,
      {
        id: 'run-lf-koord',
        analysis_type: 'LOAD_FLOW',
        status: 'DONE',
        finished_at: '2026-07-28T08:05:00Z',
        started_at: '2026-07-28T08:04:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'wyniki-stan-fazowy') {
  // Scena E-31 (karta Z-1): zakończony przebieg stanu fazowego (PHASE_STATE_SN)
  // — identyfikator z fixtury REALNEGO biegu backendu (HARNESS-RESZTA).
  useShellStore.setState({ advancementMode: 'expert' });
  useAppStateStore.getState().setActiveProject('proj-demo', 'Przyłączenie farmy PV 8 MW');
  useExecutionRunsStore.setState({
    runs: [
      {
        id: stanFazowyScenyWyniki.run_id,
        analysis_type: 'PHASE_STATE_SN',
        status: 'DONE',
        finished_at: '2026-07-20T11:00:00Z',
        started_at: '2026-07-20T10:59:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'wyniki-stabilnosc') {
  // Scena E-32 (karta Z-1): zakończony przebieg stabilności (DYNAMIC_STABILITY)
  // — identyfikator z fixtury REALNEGO biegu backendu (HARNESS-RESZTA).
  useShellStore.setState({ advancementMode: 'expert' });
  useExecutionRunsStore.setState({
    runs: [
      {
        id: stabilnoscScenyWyniki.run_id,
        analysis_type: 'DYNAMIC_STABILITY',
        status: 'DONE',
        finished_at: '2026-07-21T10:00:00Z',
        started_at: '2026-07-21T09:59:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'zrodlo-dyspozycyjne') {
  // Karta Z-2 (fala P-4/P-5): kreator agregatu/UPS nN — kontekst szyny nN
  // stacji demo (op=add_genset_nn wybiera wariant „agregat"; snapshot globalny
  // z zasiewu wyżej ma już szynę nN stacji demo).
  useNetworkBuildStore.getState().openOperationForm('add_genset_nn' as never, {
    station_ref: 'st-demo',
    bus_nn_ref: 'bus-nn-demo',
    bus_name: 'Szyna nN',
    voltage_kv: 0.4,
    station_label: 'Rozdzielnia GPZ-01',
  });
} else if (creator === 'odgalezienie') {
  // Karta Z-2: kreator odgałęzienia SN startuje nowy ciąg od jawnego zacisku
  // źródła (szyna SN stacji demo) — kontekst z jawnymi etykietami źródła.
  useNetworkBuildStore.getState().openOperationForm('start_branch_segment_sn' as never, {
    from_ref: 'bus-sn-demo',
    source_type_label: 'Szyna SN',
    source_name: 'Szyna GPZ SN',
  });
} else if (creator === 'slup-odgalezny' || creator === 'zksn') {
  // Karta Z-2: słup rozgałęźny / ZKSN wstawiają węzeł na ISTNIEJĄCYM odcinku —
  // snapshot z jawnym odcinkiem SN właściwego toru (linia napowietrzna / kabel).
  const segmentType = creator === 'slup-odgalezny' ? 'line_overhead' : 'cable';
  const segmentId = creator === 'slup-odgalezny' ? 'odc-linia-7' : 'odc-kabel-3';
  const segmentName = creator === 'slup-odgalezny' ? 'Linia napowietrzna L-7' : 'Kabel SN K-3';
  useSnapshotStore.setState({
    snapshot: {
      header: { name: 'Projekt demonstracyjny' },
      substations: [{ ref_id: 'st-demo', name: 'Rozdzielnia GPZ-01', bus_refs: ['bus-sn-demo', 'bus-nn-demo'] }],
      buses: [
        { ref_id: 'bus-sn-demo', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus-nn-demo', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
      transformers: [], sources: [], loads: [], generators: [], bays: [],
      branches: [{ id: segmentId, ref_id: segmentId, name: segmentName, type: segmentType, tags: [], meta: {} }],
      junctions: [], corridors: [], measurements: [], protection_assignments: [],
    },
  } as never);
  useNetworkBuildStore.getState().openOperationForm(
    (creator === 'slup-odgalezny' ? 'insert_branch_pole_on_segment_sn' : 'insert_zksn_on_segment_sn') as never,
    { segment_id: segmentId },
  );
} else if (creator === 'przekaznik' || creator === 'pomiar') {
  // Karta Z-2: kreatory zabezpieczenia/pomiaru pola SN czytają opcje pola z
  // useFieldReadModel — endpoint field-view zwraca pusty widok (zasiew wyżej),
  // więc hak spada na syntezę z `snapshot.bays` (fallback udokumentowany w
  // useFieldReadModel.ts): pole odpływowe SN stacji demo z pełnym kontraktem Bay.
  useSnapshotStore.setState({
    snapshot: {
      header: { name: 'Projekt demonstracyjny' },
      substations: [{ ref_id: 'st-demo', name: 'Rozdzielnia GPZ-01', bus_refs: ['bus-sn-demo', 'bus-nn-demo'] }],
      buses: [
        { ref_id: 'bus-sn-demo', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus-nn-demo', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
      transformers: [], sources: [], loads: [], generators: [],
      bays: [{
        id: 'bay-odplyw-1', ref_id: 'bay-odplyw-1', name: 'Pole odpływowe L-1',
        tags: [], meta: {}, bay_role: 'OUT', substation_ref: 'st-demo', bus_ref: 'bus-sn-demo',
        gpz_section_id: null, equipment_refs: [], protection_ref: null,
      }],
      branches: [], junctions: [], corridors: [], measurements: [], protection_assignments: [],
    },
  } as never);
  useNetworkBuildStore.getState().openOperationForm(
    (creator === 'przekaznik' ? 'add_relay' : 'add_ct') as never,
    {},
  );
} else if (creator === 'pole-nn') {
  // Karta Z-2: pole odpływowe nN — jedyny publiczny write-path pola nN.
  useNetworkBuildStore.getState().openOperationForm('add_nn_outgoing_field' as never, {
    station_ref: 'st-demo',
    bus_nn_ref: 'bus-nn-demo',
  });
} else if (creator === 'przypisanie-katalogu') {
  // Karta Z-2: przypisanie typu katalogowego do istniejącego elementu (transformator demo).
  useNetworkBuildStore.getState().openOperationForm('assign_catalog_to_element' as never, {
    element_ref: 'TR-1',
    catalog_namespace: 'TRAFO_SN_NN',
    catalog_item_id: 'trafo-630-15-04',
  });
} else if (creator === 'stacja') {
  // Scena „stacja" zasiewa REALNY przypadek w backendzie biegu — patrz
  // `zasiejSceneStacji` niżej (zasiew asynchroniczny przed montażem).
} else if (creator === 'edycja-parametrow') {
  // Karta Z-2: ekspercki override parametru istniejącego elementu (transformator demo).
  useNetworkBuildStore.getState().openOperationForm('update_element_parameters' as never, {
    element_ref: 'TR-1',
    parameter_source: 'KATALOG',
    field: 'r_pct',
    value: '0.55',
  });
} else if (creator === 'cieplna') {
  // K3-B3: wariant NIEAKTUALNY znacznika świeżości — migawka w rew. 2, a
  // kontrakt przebiegu run-sc-7 niesie `rewizja_modelu: 1` (atrapa wyżej) →
  // nagłówek pokazuje „nieaktualne (rew. 1 → 2)" + panel „Co się zmieniło"
  // z atrapy dziennika zmian. Kształt migawki = zasiew globalny (ta sama sieć).
  useSnapshotStore.setState({
    rewizjaBiezacegoModelu: 2,
    snapshot: {
      header: { name: 'Projekt demonstracyjny', revision: 2 },
      substations: [{ ref_id: 'st-demo', name: 'Rozdzielnia GPZ-01', bus_refs: ['bus-sn-demo', 'bus-nn-demo'] }],
      transformers: [],
      buses: [
        { ref_id: 'bus-sn-demo', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus-nn-demo', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
      sources: [],
      loads: [],
      bays: [],
    },
  } as never);
} else {
  // Kontekst operacji (szyna/stacja) dla kreatorów pole/OZE/transformator.
  const op =
    creator === 'oze'
      ? 'add_converter_source'
      : creator === 'transformator'
      ? 'add_transformer_sn_nn'
      : creator === 'kompensator'
      ? 'add_shunt_compensator_sn'
      : creator === 'magistrala'
      ? 'continue_trunk_segment_sn'
      : creator === 'odbior'
      ? 'add_nn_load'
      : creator === 'zrodlo'
      ? 'add_grid_source_sn'
      : 'add_sn_bay';
  useNetworkBuildStore.getState().openOperationForm(op as never, {
    station_ref: 'st-demo',
    bus_ref: 'bus-sn-demo',
    bus_nn_ref: 'bus-nn-demo',
    bus_name: 'Szyna SN',
    voltage_kv: 15,
    length_m: 2500,
    from_terminal_id: 'term-demo',
    terminalId: 'term-demo',
    terminal_voltage_label: '15 kV',
    feeder_ref: 'feeder-demo',
    bus_voltage_kv: 0.4,
    station_label: 'Rozdzielnia GPZ-01',
  });
}

/** Pasek przypadku ze znacznikiem świeżości (K4) — info z realnego hooka powłoki. */
function SwiezoscScena() {
  const info = useShellCaseInfo();
  return <CaseBar info={info} onPrzejdzDoObliczen={() => undefined} />;
}

function Harness() {
  let node: React.ReactNode;
  if (creator === 'dokumentacja') node = <HubDokumentacji />;
  else if (creator === 'pulpit')
    node = (
      <PulpitProjektu
        onNawiguj={() => undefined}
        onOtworzProjekt={() => undefined}
        onZaznaczPrzypadek={() => undefined}
        onOtworzPrzypadek={() => undefined}
        onOtworzArchiwum={() => undefined}
        onOtworzImportArkusza={() => undefined}
        onAkcjaNaprawcza={() => undefined}
      />
    );
  else if (creator === 'diagnoza')
    node = <PanelDiagnozy onPrzejdzDoUruchomienia={() => undefined} />;
  else if (creator === 'uwaga') node = <EkranCoWymagaUwagi />;
  else if (creator === 'swiezosc') node = <SwiezoscScena />;
  else if (creator === 'walidacja')
    node = (
      <SekcjaWalidacji
        przebieg={{
          id: walidacjaScenyWynik.context.run_id, analysis_type: 'LOAD_FLOW', status: 'DONE',
        } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  else if (creator === 'rozplyw')
    node = <EkranRozplywu trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'zwarcia')
    node = <EkranZwarc trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'zwarcia-rozplyw')
    // Karta Z-3: tryb ekspercki — kolumna „źródło" widoczna (rozróżnienie
    // „sieć nadrzędna" vs identyfikator falownika w sekcji RozplywZwarciowy).
    node = <EkranZwarc trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'porownanie')
    node = <EkranPorownania projektId="proj-demo" trybZaawansowania="expert" />;
  else if (creator === 'kompensacja')
    // R2-B: preselekcja wezla z deep-linku — bus_sn_b, jedyny wezel zasiewu
    // (linie ok. 2320 nizej) dajacy realny dobor kandydata katalogowego
    // (HARNESS-RESZTA-kontynuacja: dawny literal 'SZ-ST7' nie istnial juz w
    // zasiewie po konwersji sceny na realny bieg backendu).
    node = (
      <EkranKompensacji
        trybZaawansowania="expert"
        preselekcjaWezla="bus_sn_b"
        onPreselekcjaSkonsumowana={() => undefined}
        onOtworzDowod={() => undefined}
      />
    );
  else if (creator === 'lom')
    node = <EkranLom trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'wiazania')
    node = (
      <PvSourceSurface
        surface={
          {
            surfaceId: 'harness-wiazania',
            screenCode: 'E-21',
            titlePl: 'Źródło PV',
            entityRef: 'der-pv-1',
            entityType: null,
            routeState: { payload: {} },
            breadcrumbs: [],
            supportsMiniSld: false,
            supportsChildren: false,
            sizeClass: 'C',
            stackLevel: 0,
            openMode: 'expand_workspace',
            subjectKind: 'helper_context',
            subjectRef: null,
          } as never
        }
      />
    );
  else if (creator === 'frt')
    node = <EkranFrt trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'oltc') node = <EkranBadanOltc />;
  else if (creator === 'macierz') node = <MacierzNcRfg trybZaawansowania="expert" />;
  else if (creator === 'koordynacja') node = <EkranKoordynacji />;
  else if (creator === 'wyniki-skladowe') node = <EkranSkladowych />;
  else if (creator === 'wyniki-zbieznosc') node = <EkranZbieznosci />;
  else if (creator === 'wyniki-stan-fazowy') node = <EkranStanuFazowego />;
  else if (creator === 'wyniki-stabilnosc') node = <EkranStabilnosci />;
  else if (creator === 'kompensacja-wynik')
    // V-B: bez preselekcji — spec wybiera wezel i klika „Oblicz" natywnie.
    node = <EkranKompensacji trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'sila-sieci') node = <SekcjaSilySieci trybEkspercki />;
  else if (creator === 'odbior-zgodnosc')
    node = <EkranOdbioru trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'estymacja')
    node = <EkranEstymacji trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'ssci') node = <EkranSsci trybZaawansowania="expert" />;
  else if (creator === 'wyniki-warsztat')
    node = (
      <WynikiWarsztat
        trybZaawansowania="expert"
        pozostale={<div />}
        onOtworzDokumentacje={() => undefined}
      />
    );
  else if (creator === 'akademickie') {
    // Bez `rodzaj` w adresie: katalog kart (widok domyślny); z nim — widok analizy.
    const rodzajZAdresu = new URLSearchParams(location.search).get('rodzaj');
    node = (
      <EkranAnalizAkademickich
        trybZaawansowania="expert"
        rodzajPoczatkowy={(rodzajZAdresu ?? undefined) as never}
      />
    );
  } else if (creator === 'ocena' || creator === 'ocena-przekroczenia')
    node = <EkranOceny trybZaawansowania="expert" onOtworzDowod={() => undefined} />;
  else if (creator === 'migotanie')
    node = (
      <SekcjaMigotania
        przebieg={{
          id: migotanieScenyWynik.context.run_id, analysis_type: 'SC_3F', status: 'DONE',
        } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  else if (creator === 'oze') node = <KreatorZrodlaOze />;
  else if (creator === 'transformator') node = <KreatorTransformatoraSnNn />;
  else if (creator === 'kompensator') node = <KreatorKompensatoraSn />;
  else if (creator === 'magistrala') node = <KreatorMagistralaSn />;
  else if (creator === 'odbior') node = <KreatorOdbioruNn />;
  else if (creator === 'zrodlo') node = <KreatorZrodloZasilania />;
  else if (creator === 'cieplna')
    // `id: 'run-sc-7'` CELOWO nieruszone (spójne z RUN_KONTRAKT_SCENY.cieplna
    // powyżej — ta sama etykieta wariantu K3-B3 „nieaktualne", nie
    // identyfikator liczonego biegu; treść sekcji czyta OSOBNY, już realny
    // endpoint `/api/quality/conductor-thermal-withstand`).
    node = (
      <SekcjaWytrzymaloscCieplna
        przebieg={{ id: 'run-sc-7', analysis_type: 'SC_3F', status: 'DONE' } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  else if (creator === 'arcflash') {
    node = (
      <SekcjaArcFlash
        przebieg={{
          id: arcflashScenyWynik.context.run_id, analysis_type: 'SC_3F', status: 'DONE',
        } as unknown as ExecutionRun}
        trybZaawansowania="expert"
        onOtworzDowod={() => undefined}
      />
    );
  }
  // Karta Z-2 (fala P-4/P-5): 9 kreatorów ui2 nowe w tej fali.
  else if (creator === 'zrodlo-dyspozycyjne') node = <KreatorZrodloDyspozycyjne />;
  else if (creator === 'odgalezienie') node = <KreatorOdgalezienia />;
  else if (creator === 'slup-odgalezny') node = <KreatorSlupaOdgaleznego />;
  else if (creator === 'zksn') node = <KreatorZksn />;
  else if (creator === 'przekaznik') node = <KreatorPrzekaznika />;
  else if (creator === 'pomiar') node = <KreatorPomiaru />;
  else if (creator === 'pole-nn') node = <KreatorPolaNn />;
  else if (creator === 'przypisanie-katalogu') node = <KreatorPrzypisaniaKatalogu />;
  else if (creator === 'edycja-parametrow') node = <KreatorEdycjiParametrow />;
  else if (creator === 'stacja') node = <KreatorStacjiSnNn />;
  else node = <KreatorPolaSn />;

  return (
    <div
      data-testid="creator-harness-root"
      data-status="ready"
      data-creator={creator}
      data-theme={theme}
      style={{
        // Sceny rundy dowodowej V-B mają szerokie tabele (kolumny decyzyjne +
        // informacyjne + werdykt) — szerszy kadr eliminuje przycięcie z prawej.
        width: [
          'kompensacja-wynik', 'sila-sieci', 'odbior-zgodnosc', 'estymacja', 'ssci', 'migotanie', 'cieplna',
          'wyniki-skladowe', 'wyniki-zbieznosc', 'wyniki-stan-fazowy', 'wyniki-stabilnosc', 'akademickie',
          'ocena', 'ocena-przekroczenia',
        ].includes(creator)
          ? 1400
          : 1180,
        // Kadr zrzutu NIE MOŻE być szerszy od okna, inaczej scena telefonu/tabletu
        // przewijałaby się poziomo z powodu samego harnessu i nie dałoby się zmierzyć,
        // czy przewija się badana powierzchnia (karta E21-5). Przy szerokościach
        // zrzutów desktopowych (≥1220 px) ograniczenie nie działa — kadr zostaje 1180/1400.
        maxWidth: '100%',
        minHeight: 800,
        padding: 16,
        background: 'var(--mvd-bg, #07111c)',
        color: 'var(--mvd-ink, #e5eef6)',
      }}
    >
      {node}
    </div>
  );
}

/**
 * Scena „stacja" (E2E-FULL-FIX-3, 2026-09-10): kreator stacji SN/nN woła TĘ SAMĄ
 * operację domenową co zapis z flagą `dry_run` (`pobierzPodgladStacji`) przy każdej
 * zmianie formularza, a werdykt walidatora backendu trafia do nagłówka kroku pól
 * (`statusKonfiguracji`). Zasiew `case-demo` nie istnieje w backendzie, więc realny
 * backend odpowiadał 404 „Przypadek case-demo nie należy do żadnego projektu", a
 * zrzuty do oceny (`mini-rmu-podglad`, `kreator-stacji-pole-tr`) niosły werdykt
 * INVALID z tym komunikatem. Atrapa werdyktu byłaby fabrykacją (walidator nie ma
 * prawa żyć w UI), dlatego scena buduje REALNY przypadek tą samą drogą co projektant
 * i testy krytyczne (`critical-run-flow.spec.ts`): projekt → przypadek → GPZ →
 * odcinek magistrali (1,2 km kabla) → kontekst „wstaw stację w odcinek" wskazujący
 * realny odcinek z migawki backendu.
 */
async function zasiejSceneStacji(): Promise<void> {
  const naglowki = { 'Content-Type': 'application/json' };
  const projektOdp = await originalFetch('/api/projects', {
    method: 'POST',
    headers: naglowki,
    body: JSON.stringify({
      name: 'Harness — kreator stacji SN/nN',
      description: 'Scena harnessu: stacja wstawiana w odcinek magistrali',
      mode: 'TO-BE',
      voltage_level_kv: 15,
      frequency_hz: 50,
    }),
  });
  if (!projektOdp.ok) throw new Error(`POST /api/projects → ${projektOdp.status}`);
  const projekt = (await projektOdp.json()) as { id: string };
  const przypadekOdp = await originalFetch('/api/study-cases', {
    method: 'POST',
    headers: naglowki,
    body: JSON.stringify({
      project_id: projekt.id,
      name: 'Stan normalny',
      description: '',
      config: {},
      set_active: true,
    }),
  });
  if (!przypadekOdp.ok) throw new Error(`POST /api/study-cases → ${przypadekOdp.status}`);
  const przypadek = (await przypadekOdp.json()) as { id: string };

  const wiazanie = (przestrzen: string, pozycja: string) => ({
    catalog_namespace: przestrzen,
    catalog_item_id: pozycja,
    catalog_item_version: '2024.1',
  });
  const wykonaj = useSnapshotStore.getState().executeDomainOperation;
  const gpz = await wykonaj(przypadek.id, 'add_grid_source_sn', {
    voltage_kv: 15,
    sk3_mva: 250,
    rx_ratio: 0.1,
    catalog_binding: wiazanie('ZRODLO_SN', 'src-gpz-15kv-250mva-rx010'),
    hv_voltage_kv: 110,
    transformer_sn_mva: 25,
  });
  if (!gpz || gpz.error) throw new Error(`add_grid_source_sn: ${gpz?.error ?? 'brak odpowiedzi'}`);
  const odcinek = await wykonaj(przypadek.id, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 1200,
      name: 'Odcinek magistrali',
      catalog_binding: wiazanie('KABEL_SN', 'cable-tfk-yakxs-3x120'),
    },
  });
  if (!odcinek || odcinek.error) {
    throw new Error(`continue_trunk_segment_sn: ${odcinek?.error ?? 'brak odpowiedzi'}`);
  }
  const odcinki = odcinek.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  const segmentRef = odcinki[odcinki.length - 1];
  if (!segmentRef) throw new Error('backend nie zwrócił odcinka magistrali w migawce');

  useAppStateStore.getState().setActiveProject(projekt.id, 'Harness — kreator stacji SN/nN');
  useAppStateStore.getState().setActiveCase(przypadek.id, 'Stan normalny', null, 'NONE');
  // Kontekst operacji = ten sam, który daje kanwa (świadomy podział odcinka).
  useNetworkBuildStore.getState().openOperationForm('insert_station_on_segment_sn' as never, {
    segment_id: segmentRef,
    position_on_segment: 0.5,
  });
}

const zasiewSceny: Promise<void> = creator === 'stacja' ? zasiejSceneStacji() : Promise.resolve();
zasiewSceny.then(
  () => {
    createRoot(document.getElementById('root')!).render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  },
  (blad: unknown) => {
    // Bez korzenia `creator-harness-root` spec zatrzymuje się na bramce gotowości
    // z NAZWANĄ przyczyną zamiast zrzucać scenę bez zasiewu.
    document.getElementById('root')!.textContent =
      `Zasiew sceny „${creator}" nie powiódł się: ${blad instanceof Error ? blad.message : String(blad)}`;
  },
);
