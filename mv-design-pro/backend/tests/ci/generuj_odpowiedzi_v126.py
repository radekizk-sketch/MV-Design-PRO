"""Generator fixtur odpowiedzi solvera V12.6 dla strażnika prezentacji (V126-JEZYK).

Fixtury są REALNYMI odpowiedziami solvera `V126AcademicSolver` — strażnik
prezentacji w warstwie frontu (`ui2/wyniki/akademickie/__tests__/prezentacja.straznik.test.tsx`)
renderuje na nich każdy z rodzajów kontraktu i sprawdza, że na ekranie
projektanta nie pojawia się ani jeden kod produkcyjny (ścieżka klucza,
indeks tablicy, surowa referencja, JSON, anglicyzm).

Referencje obiektów mają POSTAĆ PRODUKCYJNĄ (`gpz/<odcisk>/section/001/bus_sn`) —
dokładnie taką, jaką właściciel zobaczył na zrzucie ocenionym na 0/10. Fixtura
z ładnym `B1` nie sprawdziłaby niczego: strażnik ma widzieć to, co widzi
projektant.

Uruchomienie (z katalogu `backend/`):
    poetry run python -m tests.ci.generuj_odpowiedzi_v126
Parytet pliku z bieżącym solverem pilnuje `tests/ci/test_v126_odpowiedzi_fixtury.py`.

PRZELICZENIA FIXTURY — ŚWIADOME, Z WARTOŚCIAMI PRZED I PO
---------------------------------------------------------
Fixtura jest odciskiem odpowiedzi solvera, więc każda zmiana numeryki ją
przelicza. Przeliczenie MILCZĄCE jest zabronione — poniżej rejestr zmian.

2026-08-08, karta QU-FABRYKACJA, rodzaj `voltage_stability`
(wersja solvera 1.1 → 1.2). Solver przestał wyznaczać wielkości stojące na
współczynnikach bez pokrycia w danych i na zmyślonej mocy zwarciowej węzła.

  wielkość                            PRZED                     PO
  ----------------------------------- ------------------------- ------
  voltage_stability_margin_percent    250,0                      None
  pv_curves[].lambda_max              3,5 (obie szyny)           None
  pv_curves[].margin_percent          250,0 (obie szyny)         None
  pv_curves[].u_at_max                0,7 (obie szyny)           None
  qv_curves[].q_min_mvar              −0,0175 · −0,385           None
  qv_curves[].q_available_mvar        0,0 · 0,045                None
  qv_curves[].margin_mvar             −0,0175 · −0,34            None
  l_index_per_bus[].l_index           0,0008 · 0,055             None
  l_index_per_bus[].alert             false (obie szyny)         None
  modal_analysis.smallest_eigenvalue  0,945                      None
  critical_mode.participating_buses   [szyna stacji]             []
  sanity.status                       „zweryfikowany"            „dane niekompletne"
  sanity.checks_passed                4                          0

Trzy liczby warte odnotowania, bo pokazują, czym te wielkości były naprawdę:
`margin_percent` wychodził 250,0 dla KAŻDEJ szyny (nasycenie zaszytego 2,5),
`u_at_max` — 0,7 dla każdej (obcięcie dolne), a `q_available_mvar` = 0,0 dla
szyny GPZ było ZEREM UDAJĄCYM POMIAR: nie znaczyło „zmierzono brak zapasu",
tylko „nie było czego liczyć". Dokładnie tego rozróżnienia pilnuje teraz `None`.

Klucze DOPISANE (kontrakt addytywny, FROZEN nietknięty): `brak_danych` na
poziomie wyniku, w każdym wierszu `pv_curves`/`qv_curves`/`l_index_per_bus`
oraz w `modal_analysis` — powód po polsku mówiący, jakich danych brakuje.

2026-09-05, karta FAB-D2 (D2), rodzaj `opf_loss_lcc`. `V126TransformerInput.p0_kw`
niesie teraz `None` zamiast cichego 0.0 (`solver_input/v126_contracts.py` przestał
podstawiać `transformer.p0_kw or 0.0`), a model wejściowy tej fixtury dostał
JAWNĄ stratę jałową (18,0 kW — nameplate 16 MVA), zamiast dalej polegać na
cichym zerze. `transformer_losses_kw` = `p0_kw + pk_kw·0,45²`.

  wielkość                 PRZED       PO
  ------------------------ ----------- -----------
  transformer_losses_kw    18,225      36,225
  total_losses_kw          23,39789    41,39789
  annual_losses_kwh        93591,556   165591,556
  annual_co2_kg            67385,92    119225,92
  lcc_loss_opex_pv_pln     935175,54   1654606,25

Straty jałowe transformatora BYŁY pomijane w LCC strat — 16 MVA GPZ bez
uwzględnienia strat jałowych zaniżało roczne zużycie energii i koszt cyklu
życia strat o realną wielkość (18 kW × 8760 h ≈ 158 MWh/rok pominięte).

Skutek uboczny UJAWNIONY, nie ukryty: rodzaj `hosting_capacity` (Monte Carlo)
też przesunął `hosting_capacity_mw` 7,6 → 7,8 MW dla szyny stacji — ziarno
losowania (`_hosting_capacity_bus_seed`) pochodzi z SKRÓTU CAŁEGO ładunku
wejściowego (odtwarzalność wymaga, by ten sam ładunek dawał ten sam wynik), więc
KAŻDA zmiana ładunku — nawet pola, którego ta analiza fizycznie nie czyta —
przesuwa ziarno i wynik losowania w paśmie niepewności Monte Carlo. To nie jest
zmiana merytoryczna zdolności przyłączeniowej, tylko przesunięcie próbki losowej.

2026-09-23, uczciwość natychmiastowa (audyty harmonicznych i dynamiki). Fixtura przestaje być
odciskiem SUROWEGO solvera, a staje się odciskiem ODPOWIEDZI API (granica
`application/v126_artifacts.py::wynik_v126_dla_powierzchni`). Wartości liczbowe solvera bez
zmian (solver FROZEN nietknięty); zmienia się kształt i etykiety:

  rodzaj / pole                                  PRZED                    PO
  ---------------------------------------------- ------------------------ ------------------------
  każdy rodzaj: sanity.status (w paśmie)         „zweryfikowany"          „w paśmie wiarygodności"
  power_quality_harmonics: nodes, sanity         na wierzchu ładunku      w `wynik_audytowy`
  power_quality_harmonics: compatibility_status  „zgodny"/„niezgodny"     „NIE_OCENIONO"
  power_quality_harmonics: violated_limits       lista „limitów"          usunięte (werdykty)
  power_quality_harmonics / ssci_impedance       —                        `ocena` (NIE_OCENIONO)
  reliability_contingency: contingency_ranking   obecny                   zdjęty + `ranking_n1`

2026-10-28, karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (rodzaje `earth_fault_detection`,
`neutral_earthing_design`, `transient_trv`). Parametr biegu `neutral_grounding` przestał
nadpisywać model (skasowany); sposób uziemienia przychodzi z modelu (`uziemienie_sn`:
dławik o regulacji nadążnej, sieć SN = kabel fixtury, U_n = 15 kV), a kabel dostał jawną
pojemność zerową b0 = 120 µS/km (dawniej brak → „C0 nieoznaczalne").

  rodzaj / wielkość                              PRZED                         PO
  ---------------------------------------------- ----------------------------- ---------------
  earth_fault_detection.neutral_grounding        petersen_tuned (z parametru)  petersen_tuned (z modelu)
  neutral_earthing_design                        dane niekompletne (brak B0)   projekt dławika, I_C = √3·15 kV·0,48 mS = 12,47 A
  transient_trv.ferroresonance                   z parametru                   z modelu (sieć skompensowana)

Skutek uboczny UJAWNIONY (ten sam mechanizm co 2026-09-05): `hosting_capacity_mw` szyny stacji
7,8 → 7,7 MW — ziarno Monte Carlo pochodzi ze skrótu całego ładunku wejściowego, a ładunek
zmienił się (b0 kabla, `uziemienie_sn`); przesunięcie próbki losowej, nie zmiana merytoryczna.

2026-10-29, ta sama karta, odcinek B0 / TRV / NER cieplny (rdzeń B-01 `v126_academic`).
Solver TRV przestał podstawiać wartości zastępcze (dawne U_r = największe U_n szyn = 15 kV,
f_n = 12 kHz, τ = 180 µs, krotność załączania 8·I_n — bez podstawy normowej); brak parametru
jest brakiem nazwanym (`missing_fields`, `message_pl`). Bieg TRV fixtury dostaje te parametry
JAWNIE (`PARAMETRY_TRV_PROJEKTANTA`, tylko w biegu TRV — odcisk innych rodzajów bez zmian),
z U_r = U_m = 17,5 kV zamiast dawnych 15 kV (napięcie znamionowe ≠ najwyższe napięcie
urządzenia): krzywa i obwiednia rosną ×17,5/15, margines TRV bez zmian (−1194,8609 %),
bo obie strony skalują się z U_r.
Projekt uziemienia dostał sprawdzenie cieplne rezystora z prądu największego (c_max, Z_0,TU);
w tej fixturze (dławik) sprawdzenie cieplne nie dotyczy rezystora.

  rodzaj / wielkość                              PRZED                         PO
  ---------------------------------------------- ----------------------------- ---------------
  transient_trv: parametry obwodu                zastępcze solvera             jawne z biegu
  transient_trv.trv_curve[t=2 µs].u_trv_kv       8,8286                        10,30003
  transient_trv.trv_curve[t=2 µs].envelope_kv    0,68182                       0,79545
  transient_trv.trv_margin_percent               −1194,8609                    −1194,8609
  neutral_earthing_design.dane_przyjete          brak klucza                   [] (B′0 z modelu)
  neutral_earthing_design.kompletnosc_dowodu     brak klucza                   PELNY

2026-10-29, ta sama karta, sposób pracy punktu neutralnego (warunek odbioru właściciela;
wersja solvera v126-academic-whitebox-1.3). Fixtura dostała dwa wejścia, które dotąd były
martwe: wiersz koordynacji izolacji leżał w `parameters["insulation"]` (solver go nie czyta —
w API przenosi go granica `api.v126_academic._with_parameter_payloads`), a sieć SN niosła pole `prad_dlawikow_a`
spoza kontraktu (pydantic je pomijał; kontrakt wejścia V12.6 odrzuca teraz pola spoza
kontraktu — `extra="forbid"`). Projekt uziemienia liczy prąd resztkowy solverem doziemienia
sieci z punktu uziemienia modelu (dławik 15 A, Z_0,TU = 1,5 + j6 Ω) zamiast z założonego
rozstrojenia 5 % i tłumienia 0; stan „dostrojony” był skutkiem założenia, nie modelu.
Przesunięcie `hosting_capacity_mw` szyny stacji 7,7 → 7,0 MW to ten sam mechanizm ziarna
Monte Carlo co 2026-09-05 (odcisk całego wejścia, n = 64 próbek), nie zmiana merytoryczna.

  rodzaj / wielkość                              PRZED                         PO
  ---------------------------------------------- ----------------------------- ---------------
  insulation_coordination.arresters              [] (wiersz martwy)            1 wiersz: tryb
                                                                               kompensowany,
                                                                               k = √3, U_TOV
                                                                               17,5 kV, margines
                                                                               35,714 %
  neutral_earthing_design.tuning_status          dostrojony (założenie 5 %)    rozstrojony_poza_10pct
  neutral_earthing_design.detuning_model         brak (detuning_assumed 0,05)  −0,19866
  neutral_earthing_design.residual_current_a     brak                          2,477474 A
  neutral_earthing_design.residual_current_at_   0,0 (tłumienie założone 0)    0,012901 A (R_0,TU)
    resonance_a
  earth_fault_detection.dane_przyjete            brak klucza                   metody przekaźnika
                                                                               ESTIMATED
  hosting_capacity[stacja].hosting_capacity_mw   7,7                           7,0 (ziarno)

2026-10-30, ta sama karta, odcinek 3 (werdykty V12.6 → rekordy werdyktu wyjaśnialnego; rdzeń
B-01 `v126_academic`). Statusy werdyktów solvera skasowane — ocenę niosą rekordy
`OcenaKryterium`/`WynikWymagania` pod kluczem `oceny` (granica `wynik_v126_dla_powierzchni`,
kryteria z rejestru założeń `application/analyses/v126_oceny.py`); `kompletnosc_dowodu` z rekordów.
Kontrakt wejścia V12.6 nie ma wartości domyślnych pól liczonych: uziom fixtury dostał komplet
danych projektanta (liczby równe dawnym domyślnym — wielkości uziomu bez zmian), silnik
przeszedł z martwego `parameters["motors"]` (solver go nie czytał — tabela silników była
pusta) do pola kontraktu `motors`, a niezawodność kabla wchodzi jak w moście API: wartości
robocze rejestru niezawodności (λ na km długości) z danymi przyjętymi ESTIMATED.
Ziarno Monte Carlo przepustowości pochodzi z pól, które analiza czyta (`POLA_HOSTINGU_*`
solvera), nie z odcisku całego wejścia — próbka losowa przesunięta raz, świadomie.

  rodzaj / wielkość                              PRZED                         PO
  ---------------------------------------------- ----------------------------- ---------------
  earthing_safety.safety_status                  niezgodny                     usunięte; `oceny`:
                                                                               v126.uziom NIE_SPELNIA
                                                                               (dotykowe NIE_SPELNIA,
                                                                               krokowe SPELNIA)
  insulation_coordination.arresters[]            verification_status,          usunięte; `oceny`:
    .{verification_status,margin_ok,mcov_ok,     uzasadnienie_pl, ...          wymaganie miejsca
    tov_ok,uzasadnienie_pl,kompletnosc_dowodu}                                 BRAK_DOWODU (U_c dobór
                                                                               wstępny ESTIMATED)
  earth_fault_detection.relay_support_status     spelniony (komplet metod      usunięte; `oceny`:
                                                 przyjęty)                     NIE_OCENIONO (funkcje
                                                                               przekaźnika niepodane)
  transient_trv.{trv_status,trv_margin_percent,  niespelniony, −1194,86 %,     usunięte; `trv_peak_kv`
    trv_curve[].envelope_kv}                     obwiednia bez podstawy        38,01894; `oceny`:
                                                                               BRAK_PODSTAWY (obwiednia)
  neutral_earthing_design.tuning_status          rozstrojony_poza_10pct        usunięte; `oceny`:
                                                                               prąd resztkowy
                                                                               19,866 % > 10 % (Z-6)
                                                                               NIE_SPELNIA
  neutral_earthing_design.kompletnosc_dowodu     PELNY                         NIEPELNY (kryterium
                                                                               z założenia Z-6)
  benchmark_validation.{status,                  PASS                          usunięte; `oceny`:
    validation_report[].status}                                                NIE_OCENIONO (wartość
                                                                               „obliczona" deklarowana)
  motor_starting.motors                          [] (wiersz martwy)            1 silnik: I_rozr 450,44 A,
                                                                               zapad 13,946 %, `oceny`
                                                                               BRAK_DOWODU (cos φ_n,
                                                                               η_n ESTIMATED)
  reliability_contingency.indices.saifi_per_year 0,015 (λ = 0,015/rok          0,06 (λ = 0,015/(km·rok)
                                                 bez długości, domyślna)       · 4 km, rejestr)
  reliability_contingency.indices.saidi_min_     10,8                          43,2
    per_year
  power_quality_harmonics.wynik_audytowy.        NIE_OCENIONO                  usunięte (solver nie
    nodes[].compatibility_status                                               wystawia statusu)
  hosting_capacity[stacja].hosting_capacity_mw   7,0 (ograniczenie U_max)      7,4 (ograniczenie
                                                                               I_galaz) — ziarno
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Any

# Uruchomienie jako skrypt CLI (poza pytest) wymaga `src` na sciezce importu.
# Sciezka podana WPROST — guard `test_testy_nie_cieniuja_pakietow_zrodlowych`
# czyta tekst argumentu, a nie wartosc zmiennej, i ma racje: nazwa katalogu
# musi byc widoczna w miejscu wstrzykniecia.
if str(Path(__file__).resolve().parents[2] / "src") not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from application.v126_artifacts import wynik_v126_dla_powierzchni  # noqa: E402
from network_model.solvers.v126_academic import V126AcademicSolver  # noqa: E402
from solver_input.v126_contracts import (  # noqa: E402
    ANALIZY_UZIEMIENIA_SN,
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126HarmonicSourceInput,
    V126InsulationInput,
    V126MotorInput,
    V126PunktNeutralnySnInput,
    V126SiecSnInput,
    V126TransformerInput,
    V126UziemienieSnInput,
    _NiezawodnoscGalezi,
)

# Ścieżka fixtury czytanej przez strażnika frontu.
SCIEZKA_FIXTURY = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "ui2"
    / "wyniki"
    / "akademickie"
    / "__tests__"
    / "odpowiedziSolvera.json"
)

# Referencje w postaci produkcyjnej — takie widział właściciel na zrzucie.
REF_GPZ_SZYNA = "gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn"
REF_STACJA_SZYNA = "station/1f4c9a02b7d84e6690ab5cc31d772e18/bus_sn"
REF_KABEL = "corridor/6d2b81f0c4e34a1b9f5d70ae2c8b4913/segment/001"
NAZWA_KABLA = "Kabel SN GPZ Zachód – Ogrodowa"


# Parametry biegu napięcia powrotnego (TRV) i prądu załączania — dane projektanta z formularza
# biegu: U_r = U_m sieci 15 kV (17,5 kV, IEC 60038 / IEC 62271-1 — propozycja gotowości),
# f_n, τ i krotność prądu załączania transformatora jako wartości obwodu wpisane przez projektanta.
PARAMETRY_TRV_PROJEKTANTA: dict[str, float] = {
    "breaker_rated_voltage_kv": 17.5,
    "trv_natural_frequency_hz": 12000.0,
    "trv_tau_s": 0.00018,
    "inrush_multiple_in": 8.0,
}


def model_wejsciowy() -> V126AcademicInput:
    """Model wejściowy odwzorowujący realny fragment sieci SN (GPZ + stacja)."""
    # Intensywność uszkodzeń i czas odnowy kabla — projektant ich nie podał, więc jak w moście
    # API (`build_v126_input_from_enm`) wchodzą wartości robocze rejestru niezawodności z danymi
    # przyjętymi ESTIMATED; ta sama klasa podstawia wartość i zbiera daną przyjętą.
    niezawodnosc = _NiezawodnoscGalezi({})
    niezawodnosc_kabla = niezawodnosc.galaz(REF_KABEL, NAZWA_KABLA, "cable", 4.0)
    return V126AcademicInput(
        buses=[
            V126BusInput(
                ref=REF_GPZ_SZYNA,
                name="GPZ Zachód — szyny SN",
                nominal_kv=15.0,
                fault_level_mva=250.0,
            ),
            V126BusInput(
                ref=REF_STACJA_SZYNA,
                name="Stacja SN/nN Ogrodowa",
                nominal_kv=15.0,
                load_mw=1.4,
                load_mvar=0.45,
                generation_mw=0.3,
                customer_count=120,
                fault_level_mva=80.0,
            ),
        ],
        branches=[
            V126BranchInput(
                ref=REF_KABEL,
                from_bus_ref=REF_GPZ_SZYNA,
                to_bus_ref=REF_STACJA_SZYNA,
                kind="cable",
                length_km=4.0,
                r_ohm_per_km=0.206,
                x_ohm_per_km=0.118,
                b_siemens_per_km=2.5e-6,
                # Pojemność zerowa kabla ekranowanego indywidualnie (C0 = C ≈ 0,38 µF/km,
                # b0 = ω·C0) — dana projektanta odcinka; bez niej I_C nieoznaczalne.
                b0_siemens_per_km=1.2e-4,
                ampacity_a=260.0,
                **niezawodnosc_kabla,
            )
        ],
        dane_przyjete_niezawodnosci=niezawodnosc.dane_przyjete(),
        transformers=[
            V126TransformerInput(
                ref="transformer/9a71c3de5b8f42079d16e0b4a2c85f31",
                hv_bus_ref=REF_GPZ_SZYNA,
                lv_bus_ref=REF_STACJA_SZYNA,
                sn_mva=16.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.5,
                pk_kw=90.0,
                p0_kw=18.0,
            )
        ],
        harmonic_sources=[
            V126HarmonicSourceInput(
                bus_ref=REF_STACJA_SZYNA,
                source_ref="pv/3c8e2a94",
                base_current_a=80.0,
                spectrum_percent={5: 3.0, 7: 2.0, 11: 1.0},
                # Karta AB-H0: proweniencja widma jest polem WYMAGANYM (bez domyślki
                # „KATALOG”) — wejście solvera zbudowane ręcznie w teście to widmo RĘCZNE.
                spectrum_provenance="RECZNE",
            )
        ],
        parameters={
            # Uziom stacji — dane projektanta (kontrakt V12.6 nie ma wartości domyślnych pól
            # liczonych). Liczby równe dawnym domyślnym solvera, więc wielkości liczbowe fixtury
            # się nie przesuwają; zmienia się tylko to, że są daną WPISANĄ.
            "earthing": {
                "gpz_ref": REF_GPZ_SZYNA,
                "rho1_ohm_m": 100.0,
                "rho2_ohm_m": 500.0,
                "h1_m": 0.5,
                "length_m": 60.0,
                "width_m": 40.0,
                "mesh_spacing_m": 6.0,
                "buried_depth_m": 0.6,
                "rods_total_length_m": 40.0,
                "split_factor": 0.65,
                "fault_current_ka": 8.0,
                "fault_clearing_time_s": 0.5,
                "surface_layer_rho_ohm_m": 2500.0,
                "surface_layer_derating": 0.74,
            },
            "benchmark_references": [
                {
                    "network": "IEEE 14-bus",
                    "test": "rozpływ mocy — napięcie węzła 4",
                    "reference": 1.0186,
                    "calculated": 1.0184,
                    "tolerance_percent": 0.5,
                }
            ],
            "hosting_monte_carlo_n": 64,
        },
        # Silnik rozruchu bezpośredniego — pole kontraktu `motors` (dawniej wiersz leżał
        # w `parameters["motors"]`, którego solver nie czyta: fixtura miała pustą tabelę
        # silników). Dane projektanta (kontrakt bez wartości domyślnych); cos φ_n i η_n
        # tabliczki niepodane — wartości robocze rejestru maszyn (dane przyjęte ESTIMATED).
        motors=[
            V126MotorInput(
                # `ref` to „Oznaczenie silnika” wpisane przez projektanta (formularz parametrów
                # V12.6) — oznaczenie inżynierskie, nie identyfikator maszynowy: stoi w nazwie
                # przedmiotu rekordu werdyktu.
                ref="M1",
                bus_ref=REF_STACJA_SZYNA,
                rated_kw=630.0,
                rated_voltage_kv=6.0,
                locked_rotor_multiplier=6.0,
                start_power_factor=0.22,
                start_time_s=8.0,
                allowable_locked_rotor_time_s=20.0,
                max_torque_pu=2.0,
                critical_slip=0.2,
                load_start_torque_pu=0.6,
            )
        ],
        # Miejsce zainstalowania ogranicznika z MODELU (w API: most `build_v126_insulation_from_enm`
        # albo `wiersze_izolacji_projektanta`, sposób pracy punktu neutralnego i k z solvera
        # doziemienia sieci). Dawniej wiersz leżał w `parameters["insulation"]`, którego
        # solver nie czyta (przenosi go tylko granica API) — fixtura pokazywała pustą tabelę
        # ograniczników i strażnik prezentacji nie widział żadnej kolumny koordynacji izolacji.
        insulation=[
            V126InsulationInput(
                location_bus_ref=REF_STACJA_SZYNA,
                u_m_kv=17.5,
                network_neutral="kompensowany",
                earth_fault_factor=math.sqrt(3.0),
                earth_fault_factor_zrodlo_pl="solver doziemienia sieci SN",
                arrester_residual_10ka_kv=70.0,
            )
        ],
        # Uziemienie sieci SN z MODELU (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4): zespół
        # z dławikiem gaszącym o regulacji nadążnej — w API buduje je `uziemienie_sn_v126`.
        uziemienie_sn=V126UziemienieSnInput(
            wariant="dlawik",
            wariant_awsc_zalaczony="dlawik",
            regulacja_nadazna=True,
            opis_pl="Punkt neutralny sieci 15 kV: sieć skompensowana (Z.13) (Zespół uziemiający sekcji 1).",
            sieci=[
                V126SiecSnInput(
                    szyna_ref=REF_GPZ_SZYNA,
                    nazwa_pl="Sieć SN 15 kV — GPZ Zachód — szyny SN",
                    wariant="dlawik",
                    opis_pl=(
                        "Punkt neutralny sieci 15 kV: sieć skompensowana (Z.13) "
                        "(Zespół uziemiający sekcji 1)."
                    ),
                    napiecie_kv=15.0,
                    szyny=[REF_GPZ_SZYNA, REF_STACJA_SZYNA],
                    galezie_sieci=[REF_KABEL],
                    # Punkt uziemienia w ruchu (w API: `UziemienieSekcji.dane_doziemienia`):
                    # dławik o nastawie 15 A (X_L = U_f/I_L = 8660,25 V/15 A) w punkcie
                    # neutralnym transformatora uziemiającego Z_0,TU = 1,5 + j6 Ω/fazę. Dawne pole
                    # `prad_dlawikow_a` nie należy do kontraktu wejścia (pydantic je pomijał) —
                    # projekt uziemienia meldował brak punktów uziemienia sieci.
                    punkty_neutralne=[
                        V126PunktNeutralnySnInput(
                            nazwa_pl="Zespół uziemiający sekcji 1",
                            z_n_r_ohm=0.0,
                            z_n_x_ohm=15e3 / math.sqrt(3.0) / 15.0,
                            z0_r_ohm=1.5,
                            z0_x_ohm=6.0,
                        )
                    ],
                    dlawik_w_ruchu=True,
                )
            ],
        ),
    )


def zbuduj_odpowiedzi() -> dict[str, Any]:
    """Uruchamia solver dla KAŻDEGO rodzaju kontraktu i zwraca ładunki wyników TAK, jak
    widzi je ekran: przez granicę `wynik_v126_dla_powierzchni` (ta sama funkcja, którą woła
    `enm/canonical_analysis.py::_execute_v126` przed zapisem wyniku biegu). Fixtura strażnika
    prezentacji jest odciskiem ODPOWIEDZI API — surowy ładunek solvera pokazywałby strażnikowi
    pola, których ekran nigdy nie dostaje (ranking N-1, liczby jakości energii poza sekcją
    audytową, etykietę „zweryfikowany"), i odwrotnie."""
    solver = V126AcademicSolver()
    model = model_wejsciowy()
    # Indeks nazw modelu — w ścieżce API buduje go `enm.nazwy_elementow.zbuduj_indeks_nazw`
    # z migawki biegu; tu źródłem nazw są szyny modelu wejściowego (karta #144).
    # Gałęzie wejścia V12.6 nie niosą nazwy — w API indeks obejmuje każdy element migawki.
    nazwy = {szyna.ref: szyna.name for szyna in model.buses} | {REF_KABEL: NAZWA_KABLA}
    # Uziemienie sieci SN niosą WYŁĄCZNIE analizy zależne od punktu neutralnego — tak jak
    # w ścieżce API (`build_v126_input_from_enm(analysis_type=...)`); pozostałe rodzaje
    # dostają wejście bez niego (ich odcisk wejścia, np. ziarno Monte Carlo przepustowości
    # przyłączeniowej, nie zależy od uziemienia).
    bez_uziemienia = model.model_copy(update={"uziemienie_sn": None})

    def wejscie(analysis_type: V126AnalysisType) -> V126AcademicInput:
        wybrane = model if analysis_type in ANALIZY_UZIEMIENIA_SN else bez_uziemienia
        if analysis_type is V126AnalysisType.TRANSIENT_TRV:
            # Parametry obwodu napięcia powrotnego wpisuje projektant w formularzu biegu (solver
            # nie ma wartości zastępczych) — tylko w biegu TRV, jak w ścieżce API.
            return wybrane.model_copy(
                update={"parameters": {**wybrane.parameters, **PARAMETRY_TRV_PROJEKTANTA}}
            )
        return wybrane

    return {
        analysis_type.value: wynik_v126_dla_powierzchni(
            analysis_type.value,
            solver.run(analysis_type, wejscie(analysis_type)),
            nazwy=nazwy,
        )["result"]
        for analysis_type in V126AnalysisType
    }


def main() -> None:
    odpowiedzi = zbuduj_odpowiedzi()
    from tests.golden.zapis_fikstur import json_fikstury

    SCIEZKA_FIXTURY.write_text(json_fikstury(odpowiedzi), encoding="utf-8")
    print(f"zapisano {len(odpowiedzi)} rodzajów → {SCIEZKA_FIXTURY}")


if __name__ == "__main__":
    main()
