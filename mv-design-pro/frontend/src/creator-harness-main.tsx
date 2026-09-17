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
import przegladWiarygodnosciKatalogu from './harness-fixtures/generated/przeglad_wiarygodnosci_katalogu.json';
// HARNESS-RESZTA-2 (2026-09-17): sceny "wyniki-skladowe" (E-29) i
// "wyniki-zbieznosc" (E-30) karmione WYLACZNIE wynikami REALNEGO biegu
// backendu (`eksport_fixtur_harnessu.py` — DOKLADNIE tymi funkcjami, ktore
// woluja koncowki `/results/short-circuit`, `/results/trace`, `/snapshot`
// oraz `/power-flow-runs/{id}`, `.../results`, `.../trace`): bieg
// `short_circuit_sn` z `fault_type: 1F` na sieci zlotej (skladowe Z1/Z2/Z0 ze
// sladu solvera FROZEN) i bieg `PF` tej samej sieci z regulatorem OLTC na
// transformatorze `tr_hv_sn` (iteracje Newtona-Raphsona + decyzje regulatora).
import skladoweScenyWynik from './harness-fixtures/generated/skladowe_scena_wynik.json';
import skladoweScenySlad from './harness-fixtures/generated/skladowe_scena_slad.json';
import skladoweScenyMigawka from './harness-fixtures/generated/skladowe_scena_migawka.json';
import zbieznoscScenyNaglowek from './harness-fixtures/generated/zbieznosc_scena_naglowek.json';
import zbieznoscScenyWynik from './harness-fixtures/generated/zbieznosc_scena_wynik.json';
import zbieznoscScenySlad from './harness-fixtures/generated/zbieznosc_scena_slad.json';
import zbieznoscScenyMigawka from './harness-fixtures/generated/zbieznosc_scena_migawka.json';
// HARNESS-RESZTA-2 (2026-09-17): scena "koordynacja" (E-28) — magistrala SN z
// dwiema stacjami zbudowana TYMI SAMYMI operacjami domenowymi, ktorymi buduje ja
// projektant; dwa biegi `short_circuit_sn` (MAX/MIN), bieg `PF`, dostepnosc
// pakietu nastaw, nastawy metoda Hoppela, dopasowanie aparatu i wynik REALNEGO
// analizatora koordynacji (`OvercurrentCoordinationAnalyzer` przez koncowke).
import koordynacjaScenyMigawka from './harness-fixtures/generated/koordynacja_scena_migawka.json';
import koordynacjaScenyZwarciaMax from './harness-fixtures/generated/koordynacja_scena_zwarcia_max.json';
import koordynacjaScenyZwarciaMin from './harness-fixtures/generated/koordynacja_scena_zwarcia_min.json';
import koordynacjaScenyGalezie from './harness-fixtures/generated/koordynacja_scena_galezie.json';
import koordynacjaScenyPakietDostepnoscMax from './harness-fixtures/generated/koordynacja_scena_pakiet_dostepnosc_max.json';
import koordynacjaScenyPakietDostepnoscMin from './harness-fixtures/generated/koordynacja_scena_pakiet_dostepnosc_min.json';
import koordynacjaScenyNastawy from './harness-fixtures/generated/koordynacja_scena_nastawy.json';
import koordynacjaScenyNastawyDopasowanie from './harness-fixtures/generated/koordynacja_scena_nastawy_dopasowanie.json';
import koordynacjaScenyWynik from './harness-fixtures/generated/koordynacja_scena_wynik.json';
// HARNESS-RESZTA-2: scena "porownanie" (A/B rozplywu) — dwa REALNE biegi PF
// jednego projektu (siec zlota i ta sama siec z obciazeniem x1,6) + wynik i slad
// `PowerFlowComparisonService`; scena "oltc" — REALNY bieg PF z opcja badania
// `oltc_study: "sweep"` na sieci z regulatorem zaczepow.
import porownanieScenyBiegiPf from './harness-fixtures/generated/porownanie_scena_biegi_pf.json';
import porownanieScenyWynikPf from './harness-fixtures/generated/porownanie_scena_wynik_pf.json';
import porownanieScenySladPf from './harness-fixtures/generated/porownanie_scena_slad_pf.json';
import oltcScenyPrzebieg from './harness-fixtures/generated/oltc_scena_przebieg.json';
import oltcScenyWynik from './harness-fixtures/generated/oltc_scena_wynik.json';
// HARNESS-RESZTA-2: sceny "estymacja" (WLS) i "odbior-zgodnosc" — REALNY bieg PF
// sieci zlotej; telemetria i protokol odbioru sa DANA WEJSCIOWA sceny (wartosc
// modelu + nazwana odchylka), a rezydua, chi-kwadrat, odchylki i werdykty liczy
// backend TYMI SAMYMI funkcjami, ktore wolaja koncowki.
import estymacjaScenyWymagania from './harness-fixtures/generated/estymacja_scena_wymagania.json';
import estymacjaScenyWynik from './harness-fixtures/generated/estymacja_scena_wynik.json';
import odbiorZgodnoscScenyWynik from './harness-fixtures/generated/odbior_zgodnosc_scena_wynik.json';
// HARNESS-RESZTA-2: sceny "frt" i "lom" — REALNE widoki backendu na REALNEJ
// karcie przeksztaltnika i REALNYM profilu operatora NC RfG.
import frtScenyTrajektorie from './harness-fixtures/generated/frt_scena_trajektorie.json';
import frtScenySekwencja from './harness-fixtures/generated/frt_scena_sekwencja.json';
import lomScenyWynik from './harness-fixtures/generated/lom_scena_wynik.json';
import odbiorScenyPradZnamionowy from './harness-fixtures/generated/odbior_scena_prad_znamionowy.json';
// HARNESS-RESZTA-2: scena "akademickie" — REALNE biegi V12.6 na sieci zlotej
// (koperta, wynik, slad WHITE BOX, pakiet dowodowy, raport) plus przestrzen nazw
// katalogu rodzajow analiz; wczesniej slad/dowod/raport skladala recznie funkcja
// `sladDemoV126` w tym pliku.
import akademickieScenyBiegi from './harness-fixtures/generated/akademickie_scena_biegi.json';
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
import { PrzegladarkaSzablonow } from './ui2/spaces/model/szablony';
import {
  diagnostykaZBrakamiFixture,
  diagnozaNiezbieznaFixture,
  preflightZablokowanyFixture,
} from './ui2/spaces/obliczenia/diagnoza/__tests__/fixtures';
import { EkranCoWymagaUwagi } from './ui2/wyniki/co-wymaga-uwagi';
import { PozycjeDoPrzegladu } from './ui/catalog/PozycjeDoPrzegladu';
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

// --- Fixture'y scen dowodowych E-29..E-32 -------------------------------
// HARNESS-RESZTA-2 (2026-09-17): sceny E-29 „Składowe symetryczne i sieć zerowa"
// oraz E-30 „Zbieżność rozpływu i zaczepy" karmione WYŁĄCZNIE odpowiedziami
// REALNEGO biegu backendu (`skladoweScenyWynik`/`skladoweScenySlad`/
// `skladoweScenyMigawka` — bieg `short_circuit_sn` z `fault_type: 1F` na sieci
// złotej; `zbieznoscScenyNaglowek`/`zbieznoscScenyWynik`/`zbieznoscScenySlad`/
// `zbieznoscScenyMigawka` — bieg `PF` tej samej sieci z regulatorem OLTC na
// transformatorze `tr_hv_sn`), zaimportowanymi u góry pliku. Poprzednio oba
// komplety były blokami JSON pisanymi RĘCZNIE: bilans 1F, składowe Z1/Z2/Z0,
// iteracje Newtona-Raphsona i pętla OLTC wyglądały jak wynik solvera, ale
// żaden solver ich nie policzył.
//
// E-31 „Stan fazowy SN" i E-32 „Stabilność dynamiczna": fixtury realnego biegu
// (`stanFazowyScenyWyniki`/`stabilnoscScenyWyniki`/`stabilnoscScenySlad`,
// HARNESS-RESZTA, 2026-09-16).

/**
 * Scena E-28 „Koordynacja zabezpieczeń" (V12K-262). Najbardziej graficzny ekran
 * systemu (krzywe czasowo-prądowe log-log, marginesy CTI, werdykty par).
 *
 * Łańcuch odtworzony w całości, bo ekran go WYMAGA i nie da się go obejść:
 * zakończony bieg zwarciowy → wiersze wyniku → prądy koordynacji (zero
 * losowania, F-K4) → analiza → wynik z krzywymi. Kadr powstaje po NATYWNYCH
 * klikach (szablon urządzenia → wskazanie lokalizacji → uruchom analizę), a nie
 * po wymuszeniu stanu store — inaczej zrzut dowodziłby działania atrapy.
 *
 * HARNESS-RESZTA-2 (2026-09-17): wszystkie liczby sceny pochodzą z REALNYCH
 * biegów backendu (`harness-fixtures/generated/koordynacja_scena_*.json`) —
 * patrz importy u góry pliku i podmieniony `fetch` niżej.
 */

/** Wynik analizy koordynacji zwrócony w tym biegu sceny (spójny między `/run`,
 *  `/tcc` i pełnym wynikiem — ekran woła trzy końcówki po kolei). */
type WynikKoordynacjiSceny = typeof koordynacjaScenyWynik;
let wynikKoordynacjiSceny: WynikKoordynacjiSceny | null = null;

/**
 * Tożsamości zabezpieczeń są WYMYŚLANE PRZEZ EKRAN (`crypto.randomUUID()` w
 * `ProtectionCoordinationPage.handleApplyTemplate`), więc fixtura policzona
 * backendem nie może ich znać. Mapujemy je po `location_element_id` — tożsamość
 * domenowa, jedyna wspólna dla obu stron. Fizyka (werdykty, marginesy, krzywe,
 * ślad) zostaje BEZ ZMIAN z realnego biegu.
 */
function podmienTozsamosciZabezpieczen(
  wynik: WynikKoordynacjiSceny,
  mapa: ReadonlyMap<string, string>,
): WynikKoordynacjiSceny {
  let tekst = JSON.stringify(wynik);
  for (const [zFixtury, zZadania] of mapa) tekst = tekst.split(zFixtury).join(zZadania);
  return JSON.parse(tekst) as WynikKoordynacjiSceny;
}

/**
 * Odcisk nastaw zabezpieczenia — WYŁĄCZNIE wielkości, które wchodzą do fizyki
 * koordynacji (prądy rozruchowe, czas członu bezzwłocznego, rodzina i wariant
 * krzywej, mnożnik czasowy). Porównanie całych obiektów `settings` jest
 * niemożliwe: żądanie niesie postać SZABLONU ekranu, a fixtura postać
 * KANONICZNĄ backendu (dopisane `stage_50_high`/`stage_51n` = null,
 * `reset_time_s`, `definite_time_s`, liczby jako float). Odcisk porównuje
 * dokładnie to, od czego zależy wynik — nie kształt serializacji.
 */
function odciskNastaw(settings: unknown): string {
  const stopien = (dane: unknown): string => {
    if (dane === null || typeof dane !== 'object') return 'brak';
    const s = dane as {
      enabled?: boolean;
      pickup_current_a?: number;
      time_s?: number | null;
      curve_settings?: { standard?: string; variant?: string; time_multiplier?: number } | null;
    };
    const krzywa = s.curve_settings
      ? `${s.curve_settings.standard}/${s.curve_settings.variant}/${s.curve_settings.time_multiplier}`
      : 'bez-krzywej';
    return `${s.enabled === true}|${Number(s.pickup_current_a)}|${s.time_s ?? 'null'}|${krzywa}`;
  };
  const s = (settings ?? {}) as Record<string, unknown>;
  return ['stage_51', 'stage_50', 'stage_50_high', 'stage_51n', 'stage_50n']
    .map((klucz) => `${klucz}=${stopien(s[klucz] ?? null)}`)
    .join(';');
}

/** Prądy zwarciowe [A] lokalizacji wprost z fixtur obu biegów (ta sama droga
 *  kA → A, co `pradyZBiegow.ts`), do porównania z prądami żądania. */
function pradAZFixtury(
  fixtura: { rows: readonly { element_id?: string | null; ikss_ka?: number | null }[] },
  lokalizacja: string,
): number | null {
  for (const wiersz of fixtura.rows) {
    if (wiersz.element_id === lokalizacja && typeof wiersz.ikss_ka === 'number') {
      return wiersz.ikss_ka * 1000;
    }
  }
  return null;
}

/**
 * Wynik koordynacji dla ŻĄDANIA ekranu — albo nazwana odmowa 409.
 *
 * PARA PREDYKATÓW (KLASA, NIE INSTANCJA — wzorzec sceny `macierz`): fixtura
 * opisuje DOKŁADNIE jedno żądanie (dwa zabezpieczenia z szablonu 50/51 na
 * szynach SN obu stacji, prądy zwarciowe z biegów MAX i MIN). Gdy ekran wyśle
 * co innego, atrapa ODMAWIA zamiast podać wynik policzony dla innych danych.
 * Tolerancja porównania prądów 1e-9 względna — DOKŁADNIE ta sama, którą stosuje
 * backend (`TOLERANCJA_WZGLEDNA_PRADU`, `application/autorytet_biegu_
 * zwarciowego.py`); to margines podwójnego przeliczenia jednostek (A → kA → A),
 * nie tolerancja inżynierska.
 *
 * PRĄDY ROBOCZE NIE SĄ CZĘŚCIĄ PARY — NAZWANY BRAK PRODUKTU. Prąd zwarciowy
 * jest kluczowany SZYNĄ, prąd roboczy GAŁĘZIĄ rozpływu, a kontrakt koordynacji
 * ma jedno pole `location_id` na obie wielkości; relacji „zabezpieczenie →
 * chroniona gałąź" model jeszcze nie niesie (nazwane w docstringu końcówki
 * `run_coordination_analysis` jako decyzja A-4). Ekran uczciwie melduje ten brak
 * panelem „brak prądu roboczego", a analizator zwraca werdykt ERROR — scena
 * pokazuje obie strony tego braku zamiast go zakrywać wierszami gałęziowymi o
 * identyfikatorach szyn (tak robiła atrapa sprzed tej karty).
 */
function wynikKoordynacjiDlaZadania(cialo: BodyInit | null | undefined): WynikKoordynacjiSceny | Response {
  const odmowa = (powod: string): Response =>
    new Response(JSON.stringify({ detail: `atrapa koordynacji: ${powod} — uruchom scripts/eksport_fixtur_harnessu.py` }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });

  const zadanie = JSON.parse(String(cialo ?? '{}')) as {
    devices?: { id?: string; location_element_id?: string; settings?: unknown }[];
    fault_currents?: { location_id?: string; ik_max_3f_a?: number; ik_min_3f_a?: number }[];
  };
  const zZadania = zadanie.devices ?? [];
  const zFixtury = koordynacjaScenyWynik.devices;
  if (zZadania.length !== zFixtury.length) {
    return odmowa(`fixtura opisuje ${zFixtury.length} zabezpieczeń, żądanie niesie ${zZadania.length}`);
  }

  const mapa = new Map<string, string>();
  for (const urzadzenieFixtury of zFixtury) {
    const dopasowane = zZadania.find(
      (u) => u.location_element_id === urzadzenieFixtury.location_element_id,
    );
    if (dopasowane?.id === undefined) {
      return odmowa(`żądanie nie ma zabezpieczenia w lokalizacji ${urzadzenieFixtury.location_element_id}`);
    }
    if (odciskNastaw(dopasowane.settings) !== odciskNastaw(urzadzenieFixtury.settings)) {
      return odmowa(
        `nastawy zabezpieczenia w lokalizacji ${urzadzenieFixtury.location_element_id} różnią się od nastaw fixtury `
        + `(żądanie: ${odciskNastaw(dopasowane.settings)}; fixtura: ${odciskNastaw(urzadzenieFixtury.settings)})`,
      );
    }
    mapa.set(urzadzenieFixtury.id, dopasowane.id);
  }

  for (const pozycja of zadanie.fault_currents ?? []) {
    const lokalizacja = pozycja.location_id ?? '';
    for (const [klucz, fixtura] of [
      ['ik_max_3f_a', koordynacjaScenyZwarciaMax],
      ['ik_min_3f_a', koordynacjaScenyZwarciaMin],
    ] as const) {
      const podany = pozycja[klucz];
      const zBiegu = pradAZFixtury(fixtura, lokalizacja);
      if (typeof podany !== 'number') continue;
      if (zBiegu === null) return odmowa(`bieg nie ma prądu zwarciowego dla lokalizacji ${lokalizacja}`);
      if (Math.abs(podany - zBiegu) > 1e-9 * Math.max(Math.abs(zBiegu), 1)) {
        return odmowa(`${lokalizacja}.${klucz}: żądanie ${podany} A, bieg ${zBiegu} A`);
      }
    }
  }

  return podmienTozsamosciZabezpieczen(koordynacjaScenyWynik, mapa);
}

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
  estymacja: estymacjaScenyWynik.analysis_id,
  'odbior-zgodnosc': odbiorZgodnoscScenyWynik.analysis_id,
  // Ekran zbieznosci dostal znacznik swiezosci naglowka (karta wynikow), wiec
  // od tej chwili WOLA kontrakt przebiegu. Bez wpisu zapytanie szlo do realnego
  // backendu i wracalo 404 — bramka „zero bledow konsoli" specow zrzutowych
  // slusznie to lapala. Wartosc czytana z TEGO SAMEGO bytu, ktory scena zasiewa
  // (naglowek REALNEGO biegu backendu — HARNESS-RESZTA-2), zeby nie powstal
  // drugi identyfikator tego samego biegu.
  'wyniki-zbieznosc': zbieznoscScenyNaglowek.id,
  // Scena E-29 czyta wyniki biegu 1F REALNEGO backendu (HARNESS-RESZTA-2).
  'wyniki-skladowe': skladoweScenyWynik.run_id,
  arcflash: arcflashScenyWynik.context.run_id,
  migotanie: migotanieScenyWynik.context.run_id,
};

const originalFetch = window.fetch.bind(window);

/**
 * Identyfikator sceny z adresu URL, niezależny od stałej modułowej `creator`
 * (zadeklarowanej niżej w pliku) — funkcja jest odpytywana wewnątrz zamknięcia
 * `window.fetch` PODCZAS wywołań fetch (po pełnym załadowaniu modułu), więc
 * odczyt wprost z `window.location.search` w miejscu użycia jest bezpieczniejszy
 * niż poleganie na kolejności deklaracji stałej modułowej.
 */
function creatorZUrl(): string {
  return new URLSearchParams(window.location.search).get('creator') ?? 'pole';
}

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
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // --- Sceny dowodowe E-29..E-32 (karta Z-1) ---------------------------------
  // Kształty odpowiedzi 1:1 z kontraktami backendu (te same fixture'y, których
  // używają testy jednostkowe modułów). Gate po `creator`, bo endpointy
  // rozpływu kolidują z szeroką regułą `/power-flow-runs` sceny „porownanie".
  const jsonOK = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  // Scena „przeglad-wiarygodnosci" (karta KATALOG-NIEZMIENNIKI): odpowiedz
  // WYLICZONA przez backend na zywym katalogu (eksport_fixtur_harnessu.py),
  // nie recznie wpisane liczby — parytet pilnuje tests/ci/test_fixtury_harnessu.py.
  if (creator === 'przeglad-wiarygodnosci' && url.includes('/api/catalog/przeglad-wiarygodnosci')) {
    return jsonOK(przegladWiarygodnosciKatalogu);
  }

  if (creator === 'wyniki-skladowe') {
    if (url.endsWith('/results/short-circuit')) return jsonOK(skladoweScenyWynik);
    if (url.endsWith('/results/trace')) return jsonOK(skladoweScenySlad);
    if (url.endsWith('/snapshot')) return jsonOK(skladoweScenyMigawka);
  } else if (creator === 'wyniki-zbieznosc') {
    if (url.includes('/power-flow-runs/') && url.endsWith('/results')) return jsonOK(zbieznoscScenyWynik);
    if (url.includes('/power-flow-runs/') && url.endsWith('/trace')) return jsonOK(zbieznoscScenySlad);
    if (url.includes('/power-flow-runs/')) return jsonOK(zbieznoscScenyNaglowek);
  } else if (creator === 'wyniki-stan-fazowy') {
    if (url.includes('/results/phase-state')) return jsonOK(stanFazowyScenyWyniki);
  } else if (creator === 'koordynacja') {
    // HARNESS-RESZTA-2 (2026-09-17): CALA scena E-28 karmiona REALNYM biegiem
    // backendu (`eksport_fixtur_harnessu.py`, sekcja „scena koordynacja"):
    // magistrala SN z dwiema stacjami zbudowana TYMI SAMYMI operacjami
    // domenowymi, ktorymi buduje ja projektant, dwa biegi `short_circuit_sn`
    // (wariant MAX i MIN), bieg `PF`, dostepnosc pakietu nastaw, nastawy
    // Hoppela, dopasowanie aparatu i wynik analizatora koordynacji.
    // Poprzednio KAZDA z tych liczb byla wpisana recznie na siec, ktora nie
    // istnieje (refy `gpz/sekcja_a/bus_sn`, `stacja_s02/bus_sn`).
    if (url.includes('/results/short-circuit')) {
      const min = url.includes(koordynacjaScenyZwarciaMin.run_id);
      return jsonOK(min ? koordynacjaScenyZwarciaMin : koordynacjaScenyZwarciaMax);
    }
    if (url.includes('/results/branches')) return jsonOK(koordynacjaScenyGalezie);
    if (url.includes('/enm')) return jsonOK(koordynacjaScenyMigawka);
    // Sekcja nastaw probuje kandydatow SC_3F DONE od NAJNOWSZEGO —
    // bieg MINIMALNY jest w zasiewie sceny celowo NOWSZY niz maksymalny, tak jak
    // w realnej sieci moga wspolistniec oba warianty; backend (nie UI) osadza
    // c_max, wiec scena pokazuje dokladnie te odmowe (tresc `powod_pl` z
    // REALNEJ odpowiedzi `dostepnosc_pakietu_nastaw`) i przejscie do kolejnego
    // kandydata.
    if (url.includes(`/analysis-runs/${koordynacjaScenyZwarciaMin.run_id}/pakiet-dowodowy-nastaw/dostepnosc`)) {
      return jsonOK(koordynacjaScenyPakietDostepnoscMin);
    }
    if (url.includes(`/analysis-runs/${koordynacjaScenyZwarciaMax.run_id}/pakiet-dowodowy-nastaw/dostepnosc`)) {
      return jsonOK(koordynacjaScenyPakietDostepnoscMax);
    }
    if (url.includes(`/analysis-runs/${koordynacjaScenyZwarciaMax.run_id}/nastawy/dopasowanie`)) {
      return jsonOK(koordynacjaScenyNastawyDopasowanie);
    }
    if (url.includes(`/analysis-runs/${koordynacjaScenyZwarciaMax.run_id}/nastawy`)) {
      return jsonOK(koordynacjaScenyNastawy);
    }
    if (url.includes('/api/protection-coordination/') && url.endsWith('/run')) {
      const wynik = wynikKoordynacjiDlaZadania(init?.body);
      if (wynik instanceof Response) return wynik;
      wynikKoordynacjiSceny = wynik;
      return jsonOK({
        run_id: wynik.run_id,
        project_id: wynik.project_id,
        overall_verdict: wynik.overall_verdict,
        overall_verdict_pl: wynik.summary.overall_verdict_pl,
        total_devices: wynik.summary.total_devices,
        total_checks: wynik.summary.total_checks,
        sensitivity_pass: wynik.summary.sensitivity.pass,
        sensitivity_fail: wynik.summary.sensitivity.fail,
        selectivity_pass: wynik.summary.selectivity.pass,
        selectivity_fail: wynik.summary.selectivity.fail,
        overload_pass: wynik.summary.overload.pass,
        overload_fail: wynik.summary.overload.fail,
      });
    }
    if (url.includes('/api/protection-coordination/') && url.endsWith('/tcc')) {
      const wynik = wynikKoordynacjiSceny ?? koordynacjaScenyWynik;
      return jsonOK({ curves: wynik.tcc_curves, fault_markers: wynik.fault_markers });
    }
    if (url.includes('/api/protection-coordination/')) {
      return jsonOK(wynikKoordynacjiSceny ?? koordynacjaScenyWynik);
    }
  } else if (creator === 'odbior') {
    // Podglad pradu odbioru liczy SOLVER (I = S/(√3·U)). Bez tej atrapy scena
    // pokazywala baner awarii uslugi zamiast wyniku — a zrzut do oceny wygladalby
    // jak zepsuty ekran (V12K-260). HARNESS-RESZTA-2: odpowiedz policzona przez
    // `compute_cable_rated_current` (TEN SAM solver, ktory wola koncowka) na
    // danych formularza sceny (50 kW, cosφ 0,93, 0,4 kV) — wczesniej prad i moc
    // pozorna byly WPISANE recznie razem z tekstem podstawienia.
    if (url.includes('/cable-rated-current-preview')) return jsonOK(odbiorScenyPradZnamionowy);
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
    // HARNESS-RESZTA-2: lista zakonczonych przebiegow rozplywu projektu sceny
    // "porownanie" — REALNE biegi backendu (`eksport_fixtur_harnessu.py::
    // porownanie_scena_biegi_pf`, ksztalt 1:1 z koncowka
    // `api/power_flow_runs.py::list_power_flow_runs`): wariant A = siec zlota,
    // wariant B = ta sama siec z obciazeniem x1,6.
    return jsonOK(porownanieScenyBiegiPf);
  }
  if (url.includes('/api/power-flow-comparisons') && url.endsWith('/trace')) {
    // Slad WHITE BOX porownania (dopasowanie szyn/galezi, progi rankingu) —
    // `PowerFlowComparisonService.get_comparison_trace`, TA SAMA usluga, ktora
    // wola koncowka.
    return jsonOK(porownanieScenySladPf);
  }
  if (url.includes('/api/power-flow-comparisons')) {
    // Wynik porownania A/B — REALNE delty, ranking i proweniencja OBU biegow
    // (`PowerFlowComparisonService.compare`). Szyna bilansowa GPZ wychodzi z
    // ZEROWA roznica napiecia (u = 1,0 pu w obu wariantach) — to na niej
    // spec sprawdza filtr "tylko roznice".
    return jsonOK(porownanieScenyWynikPf);
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
    // HARNESS-RESZTA-2: scena "odbior-zgodnosc" — REALNY bieg backendu
    // (`eksport_fixtur_harnessu.py::odbior_zgodnosc_scena_wynik`, TA SAMA
    // funkcja `build_zgodnosc_powykonawcza_view`, ktora wola koncowka) na biegu
    // PF sieci zlotej. Pomiary sceny sa DANA WEJSCIOWA protokolu odbioru
    // (wartosc modelu + nazwana odchylka); wszystkie odchylki, tolerancje i
    // werdykty liczy backend.
    return jsonOK(odbiorZgodnoscScenyWynik);
  }
  if (url.includes('/api/quality/state-estimation/requirements')) {
    // Scena "estymacja": wymagane wejscia WLS — REALNY bieg backendu
    // (`build_state_estimation_requirements`, TA SAMA funkcja co koncowka).
    return jsonOK(estymacjaScenyWymagania);
  }
  if (url.includes('/api/quality/state-estimation')) {
    // Scena "estymacja": wynik WLS — REALNY solver na telemetrii sceny
    // (`build_state_estimation_view`). Jeden pomiar napiecia niesie JAWNIE
    // nazwany blad gruby (uszkodzony przetwornik), zeby ekran pokazal sekcje
    // detekcji zlych danych: test chi-kwadrat i najwieksze rezyduum
    // znormalizowane — liczby z solvera, nie z atrapy.
    return jsonOK(estymacjaScenyWynik);
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
    // HARNESS-RESZTA-2: przestrzen nazw katalogu rodzajow analiz z REALNEGO
    // backendu (`get_v126_catalog("analysis-types")`).
    return jsonOK(akademickieScenyBiegi.typy);
  }
  if (url.includes('/v126/') && !url.includes('ssci_impedance')) {
    // Scena "akademickie": koperta biegu, wynik, slad WHITE BOX, pakiet
    // dowodowy i raport z REALNYCH biegow V12.6 na sieci zlotej
    // (`eksport_fixtur_harnessu.py::akademickie_scena_biegi` — DOKLADNIE te
    // funkcje, ktore woluja koncowki). Wczesniej slad, dowod i raport skladala
    // funkcja `sladDemoV126` W TYM PLIKU: kroki, podstawienia i wyniki posrednie
    // pisane recznie, z wymyslonym `run-akad-1` jako tozsamoscia biegu.
    const biegi = akademickieScenyBiegi.biegi as Record<string, {
      koperta: unknown; wynik: unknown; slad: unknown; dowod: unknown; raport: unknown;
    }>;
    const rodzaj = Object.keys(biegi).find((kod) => url.includes(kod));
    if (rodzaj === undefined) {
      // Rodzaj, ktorego siec sceny NIE UMIE policzyc (brak karty
      // przeksztaltnika z moca znamionowa, brak danych izolacji) albo wycofany
      // z powierzchni — odmowa NAZWANA, nie wynik policzony "na oko". Ekran i
      // tak nie pusci uruchomienia: gotowosc tych rodzajow jest
      // NIEPOTWIERDZONA w fixturze `gotowosc_v126_scena_akademickie`.
      return new Response(
        JSON.stringify({
          detail:
            'Scena harnessu nie ma biegu tego rodzaju analizy — siec sceny nie spelnia '
            + 'jego warunkow gotowosci (patrz fixtura gotowosci).',
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const bieg = biegi[rodzaj];
    if (url.includes('/trace')) return jsonOK(bieg.slad);
    if (url.includes('/proof')) return jsonOK(bieg.dowod);
    if (url.includes('/report')) return jsonOK(bieg.raport);
    if (url.includes('/results/v126/')) return jsonOK(bieg.wynik);
    return jsonOK(bieg.koperta);
  }
  if (url.includes('/runs/v126/ssci_impedance')) {
    // Scena "ssci": utworzenie przebiegu SSCI (koperta V126RunResponse) —
    // HARNESS-RESZTA-2: koperta REALNEGO biegu backendu.
    return jsonOK(akademickieScenyBiegi.biegi.ssci_impedance.koperta);
  }
  if (url.includes('/results/v126/ssci_impedance/stability')) {
    // Scena "ssci": werdykt stabilnosci SSCI (kryterium impedancyjne Nyquista)
    // — HARNESS-RESZTA-2: REALNY widok backendu (`get_v126_ssci_stability`, TA
    // SAMA funkcja co koncowka) na REALNYM biegu `ssci_impedance` sieci zlotej
    // z ZMATERIALIZOWANA karta przeksztaltnika. Wczesniej caly werdykt wraz z
    // wywodem White Box byl wpisany recznie.
    return jsonOK(akademickieScenyBiegi.biegi.ssci_impedance.stabilnosc);
  }
  // Karta FAB-L (§0 L6): USUNIĘTA kompozycja `/api/catalog/complete-bay-templates`
  // budowana w harnessie (refy szablonów niezgodne z konwencją backendu —
  // `ZPUE__ROTOBLOK__*` zamiast realnego `ZPUE_WLOSZCZOWA__ROTOBLOK__*`).
  // Backend jest stateless/deterministyczny (`list_complete_bay_templates_endpoint`,
  // zero zależności DB) i zwraca bogatszy, realny skład (44 szablony dla ZPUE
  // Włoszczowa, 13 dla ABB — zweryfikowane pomiarem) — trasa idzie do niego.
  if (url.includes('/api/station-templates') && creatorZUrl() !== 'szablony') {
    // Biblioteka szablonów stacji — krok 0 kreatora. Pusta lista = uczciwy stan
    // „brak szablonów", ekran działa dalej (ścieżka „od zera").
    return new Response(JSON.stringify({ templates: [], total: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('/api/station-templates') && creatorZUrl() === 'szablony') {
    // Scena „szablony" (V12T-016, karta SZABLONY-ROLA-A): przeglądarka
    // biblioteki szablonów (`ui2/spaces/model/szablony`) — w odróżnieniu od
    // kreatora stacji (mock pustej listy wyżej) ta scena istnieje WPROST po
    // to, żeby pokazać rzeczywistą, pełną bibliotekę (73 szablony, 15
    // kategorii, rola A „Zasilanie sieci" już niepusta) — atrapa
    // przeczyłaby własnemu celowi sceny. Przechodzi do PRAWDZIWEGO
    // backendu (ten sam wzorzec co scena „stacja" — `zasiejSceneStacji`
    // niżej — realny projekt/przypadek zamiast ręcznie sklejonej liczby).
    return originalFetch(input, init);
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
    // HARNESS-RESZTA-2: scena "lom" — REALNY widok backendu
    // (`eksport_fixtur_harnessu.py::lom_scena_wynik`, TA SAMA funkcja
    // `build_ochrona_lom_view`, ktora wola koncowka) na sieci zlotej: okna
    // normatywne z CYTOWANYCH zrodel, pola przylaczeniowe modulow i uczciwe
    // INFO przy brakach danych. Wczesniej caly widok — z wywodami per
    // porownanie — byl wpisany recznie.
    return jsonOK(lomScenyWynik);
  }
  if (url.includes('/api/oze-analysis/frt-trajectories')) {
    // HARNESS-RESZTA-2: scena "frt" — REALNY widok backendu
    // (`build_frt_trajectories_view` na REALNEJ karcie przeksztaltnika
    // `conv-pv-1mw-15kv` i REALNYM profilu operatora `pse`): obwiednia profilu,
    // trajektorie scenariuszy i wywod marginesu. Zero recznych punktow.
    return jsonOK(frtScenyTrajektorie);
  }
  if (url.includes('/api/oze-analysis/frt-sequence')) {
    // Sekwencja zapadow z kontekstem sily sieci — `build_frt_sekwencja_view`
    // z wierszem SCR widoku D1 biegu kotwicy analiz OZE (TEN SAM bieg, ktory
    // karmi scene "sila-sieci"). Program badania (glebokosc:czas) jest DANA
    // WEJSCIOWA testu odbiorowego; werdykty liczy backend.
    return jsonOK(frtScenySekwencja);
  }
  if (
    url.includes('/api/execution/study-cases/') &&
    url.endsWith('/runs') &&
    (init?.method ?? 'GET').toUpperCase() === 'POST'
  ) {
    // Scena "oltc": utworzenie przebiegu LF z opcja badania OLTC (kontrakt H1)
    // — HARNESS-RESZTA-2: kontrakt przebiegu z REALNEGO biegu backendu
    // (`to_execution_dict`), ze statusem PENDING sprzed wykonania.
    return jsonOK({ ...oltcScenyPrzebieg, status: 'PENDING', started_at: null, finished_at: null });
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
    // HARNESS-RESZTA-2: kontrakt przebiegu po wykonaniu — REALNY bieg backendu.
    return jsonOK(oltcScenyPrzebieg);
  }
  if (url.includes('/api/execution/runs/') && url.endsWith('/results')) {
    // Scena "oltc": wynik badania PRZEMIATANIA ZACZEPOW — HARNESS-RESZTA-2:
    // REALNY bieg backendu (`eksport_fixtur_harnessu.py::oltc_scena_wynik`,
    // TA SAMA funkcja `build_execution_result_set`, ktora wola koncowka) z
    // opcja `oltc_study: "sweep"` na sieci sceny E-30 (jedynej z regulatorem
    // OLTC). `global_results.oltc_sweep` niesie punkty policzone solverem
    // FROZEN (`network_model/solvers/power_flow_oltc_studies.py`) wraz z
    // wywodem — zero recznie wpisanych liczb.
    return jsonOK(oltcScenyWynik);
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
  const runOdbioru: ExecutionRun = {
    // HARNESS-RESZTA-2: identyfikator z fixtury REALNEGO biegu backendu.
    id: odbiorZgodnoscScenyWynik.analysis_id, analysis_type: 'LOAD_FLOW', status: 'DONE',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({
    runs: [runOdbioru], activeRunId: odbiorZgodnoscScenyWynik.analysis_id,
  } as never);
} else if (creator === 'estymacja') {
  // Runda dowodowa V-B: „Estymacja stanu (WLS)" — wymaga zakonczonego
  // przebiegu rozplywu (zrodlo Y-bus); wymagania + wynik z podmienionego fetch.
  const runEstymacji: ExecutionRun = {
    // HARNESS-RESZTA-2: identyfikator z fixtury REALNEGO biegu backendu.
    id: estymacjaScenyWynik.analysis_id, analysis_type: 'LOAD_FLOW', status: 'DONE',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({
    runs: [runEstymacji], activeRunId: estymacjaScenyWynik.analysis_id,
  } as never);
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
        // HARNESS-RESZTA-2: identyfikator z fixtury REALNEGO biegu 1F backendu.
        id: skladoweScenyWynik.run_id,
        analysis_type: 'SC_1F',
        status: 'DONE',
        finished_at: '2026-07-21T10:00:00Z',
        started_at: '2026-07-21T09:59:00Z',
      } as unknown as ExecutionRun,
    ],
  } as never);
} else if (creator === 'wyniki-zbieznosc') {
  // Scena E-30 (karta Z-1): zakończony rozpływ (LOAD_FLOW) + snapshot z
  // transformatorem OLTC (założenia zaczepów modelu) — HARNESS-RESZTA-2:
  // migawka i przebieg pochodzą z TEGO SAMEGO realnego biegu backendu.
  useShellStore.setState({ advancementMode: 'expert' });
  useAppStateStore.getState().setActiveProject('proj-demo', 'Przyłączenie farmy PV 8 MW');
  useSnapshotStore.setState({
    snapshot: zbieznoscScenyMigawka,
    rewizjaBiezacegoModelu: zbieznoscScenyMigawka.header.revision,
  } as never);
  useExecutionRunsStore.setState({
    runs: [
      {
        id: zbieznoscScenyNaglowek.id,
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
        // HARNESS-RESZTA-2: identyfikatory z fixtur REALNYCH biegow backendu.
        id: koordynacjaScenyZwarciaMax.run_id,
        analysis_type: 'SC_3F',
        status: 'DONE',
        finished_at: '2026-07-28T08:00:00Z',
        started_at: '2026-07-28T07:59:00Z',
      } as unknown as ExecutionRun,
      {
        // Bieg MINIMALNY (c_min) — bez niego czulosc jest niesprawdzalna, a
        // `zbudujPradyKoordynacji` w ogole nie tworzy pozycji pradowej.
        id: koordynacjaScenyZwarciaMin.run_id,
        analysis_type: 'SC_3F',
        status: 'DONE',
        finished_at: '2026-07-28T08:02:00Z',
        started_at: '2026-07-28T08:01:00Z',
      } as unknown as ExecutionRun,
      {
        id: koordynacjaScenyGalezie.run_id,
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
  else if (creator === 'przeglad-wiarygodnosci') node = <PozycjeDoPrzegladu />;
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
  else if (creator === 'szablony')
    // Scena „szablony" (V12T-016, karta SZABLONY-ROLA-A): przeglądarka
    // biblioteki szablonów stacji z widoczną rolą A „Zasilanie sieci"
    // (GPZ 110/SN, rozdzielnia sieciowa RS/RSM) — dotąd licznik zero.
    // Dane REALNE z backendu (patrz wyjątek fetch-mocka wyżej), nie atrapa.
    node = <PrzegladarkaSzablonow onZastosuj={() => undefined} />;
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
