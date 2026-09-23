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
 * `kompensacja-wynik|sila-sieci|odbior-zgodnosc|estymacja|migotanie`
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
// HARNESS-RESZTA-2: JEDEN model stacji demo dla scen kreatorow, zbudowany TYMI
// SAMYMI operacjami domenowymi, ktorymi buduje go projektant (GPZ 15 kV ->
// odcinek kablowy -> stacja SN/nN z transformatorem i odplywem nN). Wczesniej
// harness niosl ten model CZTERY RAZY, przepisany recznie.
import stacjaDemoScenyMigawka from './harness-fixtures/generated/stacja_demo_scena_migawka.json';
// HARNESS-RESZTA-2: migawki sieci zlotej dla scen, ktore interpretuja wyniki
// liczone na TEJ sieci (kompensacja) oraz dla pulpitu projektu (z warunkami
// przylaczenia w naglowku jako dana wejsciowa).
import sieckZlotaScenyMigawka from './harness-fixtures/generated/siec_zlota_scena_migawka.json';
import przebiegPfScenyZlotej from './harness-fixtures/generated/przebieg_pf_sceny_zlotej.json';
import pulpitScenyMigawka from './harness-fixtures/generated/pulpit_scena_migawka.json';
import pulpitScenyPrzebieg from './harness-fixtures/generated/pulpit_scena_przebieg.json';
// HARNESS-RESZTA-2: scena „diagnoza" — REALNY raport silnika diagnostycznego
// (blokada SC 1F z braku danych Z0) i REALNY bieg PF przerwany limitem iteracji.
import diagnozaScenyDiagnostyka from './harness-fixtures/generated/diagnoza_scena_diagnostyka.json';
import diagnozaScenyPreflight from './harness-fixtures/generated/diagnoza_scena_preflight.json';
import diagnozaScenyPrzebieg from './harness-fixtures/generated/diagnoza_scena_przebieg.json';
import diagnozaScenyBieg from './harness-fixtures/generated/diagnoza_scena_bieg.json';
// HARNESS-RESZTA-2: modele scen OZE budowane operacjami domenowymi backendu
// (`add_converter_source` + `set_der_catalog_bindings`) — moduły warsztatu
// wytwórców front wyprowadza z nich odwzorowaniem produkcyjnym `deryZModelu`.
import ozeScenyMigawka from './harness-fixtures/generated/oze_scena_migawka.json';
import macierzScenyMigawka from './harness-fixtures/generated/macierz_scena_migawka.json';
import wiazaniaScenyPrzekladniki from './harness-fixtures/generated/wiazania_scena_przekladniki.json';
import wiazaniaScenyFunkcjeZabezpieczen from './harness-fixtures/generated/wiazania_scena_funkcje_zabezpieczen.json';
// HARNESS-RESZTA-2: scena „porownanie" w trybie ZABEZPIECZENIA — lista biegów,
// wynik porównania A/B i ślad White Box z REALNYCH biegów `protection_sn`
// (dwa warianty tej samej sieci: magistrala 0,9 km wobec 1,5 km).
import porownanieScenyBiegiZabezpieczen from './harness-fixtures/generated/porownanie_scena_biegi_zabezpieczen.json';
import porownanieScenyWynikZabezpieczen from './harness-fixtures/generated/porownanie_scena_wynik_zabezpieczen.json';
import porownanieScenySladZabezpieczen from './harness-fixtures/generated/porownanie_scena_slad_zabezpieczen.json';
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
  deryZModelu,
  selectAllDers,
  useStationDerStore,
} from './ui/network-build/station-der';
import type { EnergyNetworkModel } from './types/enm';
import { PvSourceSurface } from './ui/workspace/surfaces/DerSurfaces';
import { HubDokumentacji } from './ui2/spaces/dokumentacja';
import { PulpitProjektu } from './ui2/spaces/projekt';
import { PanelDiagnozy } from './ui2/spaces/obliczenia/diagnoza';
import { PrzegladarkaSzablonow } from './ui2/spaces/model/szablony';
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
  // HARNESS-RESZTA-2: wpis rejestru REALNEGO biegu PF policzonego na modelu tej
  // sceny (`pulpit_scena_przebieg.json` — `CanonicalRun.to_execution_dict`).
  // Zakres przypadku to etykieta SCENY (lista przypadków K1/K2 niżej), więc
  // `study_case_id` zostaje podmieniony — cała reszta (identyfikator, odcisk
  // wejścia solvera, rewizja modelu, odcisk migawki, czasy) pochodzi z biegu.
  ...pulpitScenyPrzebieg,
  study_case_id: 'K1',
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

const RUN_KONTRAKT_SCENY: Record<string, string> = {
  // K3-B3: scena „cieplna" jest CELOWO wariantem NIEAKTUALNYM znacznika
  // świeżości — wariant bierze się z ROZJAZDU REWIZJI (migawka rev. 2 vs
  // `rewizja_modelu: 1` w kontrakcie biegu niżej), nie z tożsamości biegu.
  // HARNESS-RESZTA-2: dawna ręczna etykieta 'run-sc-7' ustąpiła identyfikatorowi
  // REALNEGO biegu zwarciowego, z którego policzono treść sekcji cieplnej
  // (`cieplna_scena_wynik.json` — ta sama kotwica co sceny „zwarcia"/„arcflash").
  // Wariant „nieaktualne" zostaje nietknięty: rewizje rozjeżdżają się dalej.
  cieplna: cieplnaScenyWynik.run_id,
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

// --- Model stacji demo scen kreatorow (HARNESS-RESZTA-2) -------------------
/**
 * Referencje elementow stacji demo czytane Z MIGAWKI, nie wpisane: kreatory
 * dostaja dokladnie te referencje, ktore niesie model zbudowany operacjami
 * domenowymi. Brak elementu w migawce = blad budowy fixtury, wiec funkcja
 * odmawia glosno zamiast po cichu podstawiac pusty tekst.
 */
function refZMigawkiStacji(sufiks: string, kolekcja: 'buses' | 'substations'): string {
  const element = (stacjaDemoScenyMigawka[kolekcja] as { ref_id: string }[]).find((pozycja) =>
    pozycja.ref_id.endsWith(sufiks),
  );
  if (element === undefined) {
    throw new Error(`Migawka stacji demo nie ma elementu ${kolekcja}${sufiks}`);
  }
  return element.ref_id;
}

const SZYNA_SN_STACJI_DEMO = refZMigawkiStacji('/sn_bus', 'buses');
const SZYNA_NN_STACJI_DEMO = refZMigawkiStacji('/nn_bus', 'buses');
const STACJA_DEMO = refZMigawkiStacji('/station', 'substations');
const NAZWA_SZYNY_SN_STACJI_DEMO = (stacjaDemoScenyMigawka.buses as { ref_id: string; name: string }[])
  .find((szyna) => szyna.ref_id === SZYNA_SN_STACJI_DEMO)!.name;
const NAPIECIE_SZYNY_NN_STACJI_DEMO = (
  stacjaDemoScenyMigawka.buses as { ref_id: string; voltage_kv: number }[]
).find((szyna) => szyna.ref_id === SZYNA_NN_STACJI_DEMO)!.voltage_kv;
const NAPIECIE_SZYNY_SN_STACJI_DEMO = (
  stacjaDemoScenyMigawka.buses as { ref_id: string; voltage_kv: number }[]
).find((szyna) => szyna.ref_id === SZYNA_SN_STACJI_DEMO)!.voltage_kv;
const NAZWA_STACJI_DEMO = (stacjaDemoScenyMigawka.substations as { ref_id: string; name: string }[])
  .find((stacja) => stacja.ref_id === STACJA_DEMO)!.name;

/**
 * WEJŚCIA kreatora GPZ sceny „stacja" — czytane z TEGO SAMEGO modelu, który
 * fixtura zbudowała tymi samymi operacjami domenowymi (`add_grid_source_sn`).
 * Scena buduje w realnym backendzie sieć równoważną migawce stacji demo, więc
 * dane wejściowe formularza mają JEDNO źródło: model. Przepisane ręcznie
 * (stan sprzed HARNESS-RESZTA-2) były drugą kopią tych samych liczb — rozjazd
 * z fixturą nie miał czego zapalić.
 */
const ZRODLO_STACJI_DEMO = (
  stacjaDemoScenyMigawka.sources as { sk3_mva: number; rx_ratio: number }[]
)[0];
const TRAFO_WN_SN_STACJI_DEMO = (
  stacjaDemoScenyMigawka.transformers as { sn_mva: number; ulv_kv: number }[]
).find((trafo) => trafo.ulv_kv === NAPIECIE_SZYNY_SN_STACJI_DEMO)!;
const SK3_ZRODLA_STACJI_DEMO = ZRODLO_STACJI_DEMO.sk3_mva;
const RX_ZRODLA_STACJI_DEMO = ZRODLO_STACJI_DEMO.rx_ratio;
const MOC_TRAFO_WN_SN_STACJI_DEMO = TRAFO_WN_SN_STACJI_DEMO.sn_mva;
const NAPIECIE_WN_STACJI_DEMO = (
  stacjaDemoScenyMigawka.buses as { voltage_kv: number }[]
).reduce((maks, szyna) => Math.max(maks, szyna.voltage_kv), 0);

/**
 * Moduły warsztatu wytwórców Z MODELU — odwzorowanie PRODUKCYJNE
 * (`station-der/zModelu.ts::deryZModelu`, to samo, które w aplikacji wpina
 * `useSynchronizacjaDerZModelu`). Scena podaje migawkę fixtury i identyfikator
 * projektu; referencje, napięcia przyłączenia, wiązania katalogowe i liczba
 * jednostek pochodzą z modelu, nie z rekordu przepisanego w harnessie.
 */
function zasiejWytworcowZModelu(migawka: unknown, projectId: string): void {
  useSnapshotStore.setState({ snapshot: migawka } as never);
  useStationDerStore
    .getState()
    .synchronizujZModelu(deryZModelu(migawka as EnergyNetworkModel, projectId));
}

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
    if (url.includes('/instrument-transformers')) {
      // HARNESS-RESZTA-2: dobór przekładników pola wytwórcy — REALNA odpowiedź
      // backendu (`eksport_fixtur_harnessu.py::wiazania_scena_przekladniki`, TA
      // SAMA funkcja `get_der_instrument_transformers`, którą woła końcówka) na
      // modelu tej sceny i na REALNYM biegu zwarciowym (Ik″/ip z solvera
      // IEC 60909). Wcześniej cały rachunek — z prądem roboczym toru i napięciem
      // sieci — był wpisany ręcznie.
      return jsonOK(wiazaniaScenyPrzekladniki);
    }
    if (url.includes('/protection-functions')) {
      // HARNESS-RESZTA-2: wymagane funkcje zabezpieczeniowe pola wytwórcy —
      // REALNA odpowiedź końcówki (`get_der_protection_functions`) na modelu
      // tej sceny: wymagania wynikają z FAKTÓW modelu (strona przyłączenia,
      // sposób uziemienia sieci, tory pomiarowe), a nazwane kwestie otwarte z
      // tego, czego model NIE niesie. Wcześniej cała lista była wpisana ręcznie.
      return jsonOK(wiazaniaScenyFunkcjeZabezpieczen);
    }
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
    // (White Box, na zadanie) — HARNESS-RESZTA-2: REALNY slad serwisu
    // (`ProtectionComparisonService.get_comparison_trace`, TA SAMA droga co
    // koncowka) dla pary biegow tej sceny; kroki, progi i liczby z backendu.
    return jsonOK(porownanieScenySladZabezpieczen);
  }
  if (url.includes('/protection-runs') && !url.includes('/execute')) {
    // Scena "porownanie" (CV-3.3-B2): lista zakonczonych przebiegow zabezpieczen
    // projektu — HARNESS-RESZTA-2: REALNA odpowiedz koncowki
    // (`api/protection_runs.py::list_protection_runs`) dla projektu sceny.
    return jsonOK(porownanieScenyBiegiZabezpieczen);
  }
  if (url.includes('/api/protection-comparisons')) {
    // Scena "porownanie" (CV-3.3-B2), tryb "Zabezpieczenia": wynik porownania
    // A/B — HARNESS-RESZTA-2: REALNY wynik `ProtectionComparisonService.compare`
    // na DWoCH biegach `protection_sn` tej samej sieci w dwoch wariantach
    // modelu (magistrala 0,9 km wobec 1,5 km). Delty pradu i czasu sa skutkiem
    // FIZYKI (dluzszy odcinek = wieksza impedancja petli zwarciowej), a nie
    // innych liczb w atrapie; proweniencja obu biegow (`provenance_a/b`)
    // pochodzi z kopert rewizji tych biegow.
    return jsonOK(porownanieScenyWynikZabezpieczen);
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
  if (url.includes('/v126/')) {
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
  // Scena "ssci" USUNIĘTA (rejestr domen i biegów, 2026-09-23): okno SSCI zeszło z
  // ekranu razem z wycofaniem analizy badawczej (backend: 410 na POST i na werdykcie).
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
    ...stacjaDemoScenyMigawka,
  },
} as never);

const creator = new URLSearchParams(window.location.search).get('creator') ?? 'pole';


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
  // HARNESS-RESZTA-2: model i przebieg hubu „Dokumentacja" to MIGAWKA
  // ZATWIERDZONA i WPIS REJESTRU jednego REALNEGO biegu PF sieci złotej
  // (`siec_zlota_scena_migawka.json` + `przebieg_pf_sceny_zlotej.json`).
  // Wcześniej panel „Analizowany model" liczył elementy modelu ZMYŚLONEGO
  // (osiem gałęzi `l1…l8` bez końców), a tabliczka wersji układu pokazywała
  // rewizję i odcisk wpisane z palca — teraz jedno i drugie pochodzi z biegu.
  useSnapshotStore.setState({
    rewizjaBiezacegoModelu: sieckZlotaScenyMigawka.header.revision,
    snapshot: sieckZlotaScenyMigawka,
  } as never);
  const run = przebiegPfScenyZlotej as unknown as ExecutionRun;
  useExecutionRunsStore.setState({
    runs: [run], activeRunId: przebiegPfScenyZlotej.id,
  } as never);
} else if (creator === 'diagnoza') {
  // Diagnoza przebiegu (D7): najbardziej informacyjny stan do oceny wizualnej —
  // preflight z blokadą analizy + problemy modelu + bieg NIEZBIEŻNY (limit
  // iteracji). HARNESS-RESZTA-2: trzy trasy diagnostyki karmione REALNYMI
  // artefaktami backendu (`eksport_fixtur_harnessu.py`: `DiagnosticEngine.run`
  // na sieci złotej — blokada SC 1F z powodu dwóch gałęzi bez danych Z0;
  // `zbuduj_diagnoze_przebiegu` na biegu PF sieci ×8 z `max_iterations: 1`,
  // przerwanym realnie kodem `PRZ-NIEZBIEZNY-LIMIT`). Wcześniej scena czytała
  // fikstury testów FRONTU (kształt pilnowany kontraktem, liczby pisane ręcznie).
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
    if (url.includes('/diagnostics/preflight')) return odpowiedzJson(diagnozaScenyPreflight);
    if (url.includes('/api/execution/runs/') && url.includes('/diagnostics'))
      return odpowiedzJson(diagnozaScenyPrzebieg);
    if (url.includes('/api/cases/') && url.includes('/diagnostics'))
      return odpowiedzJson(diagnozaScenyDiagnostyka);
    return oryginalneFetch(wejscie, init);
  };
  const biegDiagnozy = diagnozaScenyBieg as unknown as ExecutionRun;
  useExecutionRunsStore.setState({
    runs: [biegDiagnozy],
    activeRunId: diagnozaScenyBieg.id,
    activeStudyCaseId: diagnozaScenyBieg.study_case_id,
  } as never);
} else if (creator === 'pulpit') {
  // Pulpit projektu (E1 — K2/V12K-103): kafel „Warunki przyłączenia" z warunkami
  // OSD z nagłówka modelu + werdykt bilansu mocy znamionowej (generacja modelu
  // ponad limitem OSD zapisanym operacją `set_connection_conditions`).
  useSnapshotStore.setState({
    rewizjaBiezacegoModelu: 9,
    snapshot: {
      // HARNESS-RESZTA-2: model sieci zlotej z WARUNKAMI PRZYLACZENIA w naglowku
      // (dana wejsciowa projektu, moc przylaczeniowa PONIZEJ realnej sumy mocy
      // generatorow modelu) — kafel „Warunki przylaczenia" liczy werdykt
      // przekroczenia z modelu, a nie z liczb wpisanych w harnessie.
      ...pulpitScenyMigawka,
      header: { ...pulpitScenyMigawka.header, revision: 9 },
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
  // HARNESS-RESZTA-2: migawka sieci zlotej — TEJ SAMEJ, na ktorej policzono
  // wynik doboru kompensacji; nazwy i napiecia szyn z modelu, nie z listy
  // przepisanej w harnessie.
  useSnapshotStore.setState({ snapshot: sieckZlotaScenyMigawka } as never);
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
} else if (creator === 'migotanie') {
  // Runda dowodowa V-B: migotanie — przebieg zwarciowy podawany propem sekcji. Pusta galaz chroni
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
  // HARNESS-RESZTA-2: wytwórca Z MODELU sceny (`oze_scena_migawka.json` — GPZ
  // 110/15 kV + farma PV 1 MW w polu SN z wiązaniami zapisanymi operacją
  // `set_der_catalog_bindings`). Trzy stany, których dowodzi ta scena, są w
  // modelu: zabezpieczenie i przekładnik prądowy przypisane, przekładnik
  // napięciowy BEZ wiązania (polecenie wyboru).
  zasiejWytworcowZModelu(ozeScenyMigawka, 'proj-demo');
} else if (creator === 'frt') {
  // Scena „frt" (V-A): moduł DER z typem przekształtnika (selectAllDers) +
  // zakończony przebieg zwarciowy do doboru kontekstu siły sieci (T-B).
  // HARNESS-RESZTA-2: TEN SAM model pola wytwórcy co scena „wiazania" — moduł
  // niesie model dynamiczny (`default_pv_gfl`) i profil LVRT operatora, bo oba
  // są zapisane w modelu operacją `set_der_catalog_bindings`.
  zasiejWytworcowZModelu(ozeScenyMigawka, 'proj-demo');
  // HARNESS-RESZTA-2: kontekst siły sieci sceny „frt" bierze się z ZAKOŃCZONEGO
  // biegu zwarciowego — tu REALNY bieg kotwicy analiz OZE backendu (ten sam,
  // z którego policzono `sila_sieci_scena_wynik.json`), nie wymyślone 'run-sc-9'.
  const runSc: ExecutionRun = {
    id: silaSieciScenyWynik.context.run_id, analysis_type: 'SC_3F', status: 'DONE',
    started_at: '2026-07-22T09:15:00Z', finished_at: '2026-07-22T09:15:04Z',
  } as unknown as ExecutionRun;
  useExecutionRunsStore.setState({ runs: [runSc] } as never);
} else if (creator === 'macierz') {
  // Scena „macierz" (V-A): dwa moduły DER z modelu (kolejność `selectAllDers`
  // jest deterministyczna — sort po referencji) — gotowe do biegu NC RfG.
  useAppStateStore.setState({
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseName: 'Stan normalny',
  } as never);
  // HARNESS-RESZTA-2: moduły Z MODELU sceny (`macierz_scena_migawka.json` —
  // TEN SAM model, z którego policzono raport zgodności przekrojowej). Moduły
  // klasy B wg progów OD-5 (1 MW / 50 MW) przyłączone po stronie SN
  // transformatorem blokowym: BESS 3 × ABB PCS100 500 kW, PV 9 × Huawei
  // SUN2000-215KTL 215 kW (moce = liczba jednostek × moc katalogowa).
  // Wcześniej scena niosła DRUGI opis tych samych modułów, pilnowany tylko
  // porównaniem 409 przy trasie zgodności.
  zasiejWytworcowZModelu(macierzScenyMigawka, 'proj-demo');
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
    station_ref: STACJA_DEMO,
    bus_nn_ref: SZYNA_NN_STACJI_DEMO,
    bus_name: 'Szyna nN',
    voltage_kv: NAPIECIE_SZYNY_NN_STACJI_DEMO,
    station_label: NAZWA_STACJI_DEMO,
  });
} else if (creator === 'odgalezienie') {
  // Karta Z-2: kreator odgałęzienia SN startuje nowy ciąg od jawnego zacisku
  // źródła (szyna SN stacji demo) — kontekst z jawnymi etykietami źródła.
  useNetworkBuildStore.getState().openOperationForm('start_branch_segment_sn' as never, {
    from_ref: SZYNA_SN_STACJI_DEMO,
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
      ...stacjaDemoScenyMigawka,
      // Odcinek, na ktorym scena wstawia slup/ZK SN — DOKLADANY do modelu
      // stacji demo (kreator startuje od jawnego zacisku tego odcinka).
      branches: [
        ...stacjaDemoScenyMigawka.branches,
        { id: segmentId, ref_id: segmentId, name: segmentName, type: segmentType, tags: [], meta: {} },
      ],
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
      ...stacjaDemoScenyMigawka,
      // Pole odplywowe SN stacji demo — kontrakt `Bay` czytany przez
      // `useFieldReadModel` w trybie syntezy z migawki; referencje stacji i
      // szyny pochodza z modelu, nie z literalu.
      bays: [{
        id: 'bay-odplyw-1', ref_id: 'bay-odplyw-1', name: 'Pole odpływowe L-1',
        tags: [], meta: {}, bay_role: 'OUT', substation_ref: STACJA_DEMO,
        bus_ref: SZYNA_SN_STACJI_DEMO,
        gpz_section_id: null, equipment_refs: [], protection_ref: null,
      }],
    },
  } as never);
  useNetworkBuildStore.getState().openOperationForm(
    (creator === 'przekaznik' ? 'add_relay' : 'add_ct') as never,
    {},
  );
} else if (creator === 'pole-nn') {
  // Karta Z-2: pole odpływowe nN — jedyny publiczny write-path pola nN.
  useNetworkBuildStore.getState().openOperationForm('add_nn_outgoing_field' as never, {
    station_ref: STACJA_DEMO,
    bus_nn_ref: SZYNA_NN_STACJI_DEMO,
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
      ...stacjaDemoScenyMigawka,
      // K3-B3: scena „cieplna" jest CELOWO wariantem NIEAKTUALNYM znacznika
      // swiezosci — migawka rewizji 2 wobec wyniku rewizji 1.
      header: { ...stacjaDemoScenyMigawka.header, revision: 2 },
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
    station_ref: STACJA_DEMO,
    bus_ref: SZYNA_SN_STACJI_DEMO,
    bus_nn_ref: SZYNA_NN_STACJI_DEMO,
    bus_name: NAZWA_SZYNY_SN_STACJI_DEMO,
    voltage_kv: NAPIECIE_SZYNY_SN_STACJI_DEMO,
    length_m: 2500,
    from_terminal_id: 'term-demo',
    terminalId: 'term-demo',
    terminal_voltage_label: `${NAPIECIE_SZYNY_SN_STACJI_DEMO} kV`,
    feeder_ref: 'feeder-demo',
    bus_voltage_kv: NAPIECIE_SZYNY_NN_STACJI_DEMO,
    station_label: NAZWA_STACJI_DEMO,
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
            // Wytwórca Z MODELU sceny — ten sam, którego opisują fixtury
            // doboru przekładników i funkcji zabezpieczeniowych.
            entityRef: wiazaniaScenyPrzekladniki.generator_ref,
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
    // HARNESS-RESZTA-2: identyfikator biegu z fixtury REALNEGO biegu backendu
    // (`cieplna_scena_wynik.json`) — JEDNA tożsamość dla kontraktu przebiegu
    // (RUN_KONTRAKT_SCENY.cieplna) i dla sekcji; wariant „nieaktualne" nadal
    // z rozjazdu rewizji modelu, nie z wymyślonego identyfikatora.
    node = (
      <SekcjaWytrzymaloscCieplna
        przebieg={{
          id: cieplnaScenyWynik.run_id, analysis_type: 'SC_3F', status: 'DONE',
        } as unknown as ExecutionRun}
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
          'kompensacja-wynik', 'sila-sieci', 'odbior-zgodnosc', 'estymacja', 'migotanie', 'cieplna',
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
      voltage_level_kv: NAPIECIE_SZYNY_SN_STACJI_DEMO,
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
    voltage_kv: NAPIECIE_SZYNY_SN_STACJI_DEMO,
    sk3_mva: SK3_ZRODLA_STACJI_DEMO,
    rx_ratio: RX_ZRODLA_STACJI_DEMO,
    catalog_binding: wiazanie('ZRODLO_SN', 'src-gpz-15kv-250mva-rx010'),
    hv_voltage_kv: NAPIECIE_WN_STACJI_DEMO,
    transformer_sn_mva: MOC_TRAFO_WN_SN_STACJI_DEMO,
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
