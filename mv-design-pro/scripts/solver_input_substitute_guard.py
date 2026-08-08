#!/usr/bin/env python3
"""
CI Guard: solver_input_substitute_guard.py — karta QU-FABRYKACJA (2026-08-08).

Inwariant: gdy DANA WEJSCIOWA jest nieobecna, warstwa solvera MELDUJE BRAK albo
POMIJA element — nie podstawia w jej miejsce liczby, ktora idzie dalej do arytmetyki.

PO CO TA BRAMKA (pomiar, nie przekonanie). Karta QU-FABRYKACJA usunela siedem
stalych podstawianych za dane wejsciowe i nazwala dziewiec dalszych jako dlug.
Nadzorca sprawdzil naprawe INIEKCJA i pokazal, ze jest INWENTARZOWA, a nie
zabezpieczona: dopisanie NOWEGO zastepnika w SASIEDNIEJ funkcji tego samego pliku
(`_power_quality`: `harmonic = f_hz / (model.base_frequency_hz or 50.0)`) przeszlo
26 z 26 testow nowego pliku karty i 114 testow rodziny V12.6 na zielono. Pin
roznicowy 50/60 Hz tego nie widzi, bo uspiony `or` odpala sie tylko przy wartosci
falsy, a w testach jej nie ma. Naprawiono siedem pozycji, ale nic nie stalo na
drodze pozycji dziesiatej.

DOWOD, ZE KLASA JEST REALNA — TEN SAM PLIK, TA SAMA DANA, DWA ZACHOWANIA:
  * `v126_academic.py` w. 249 (`_grid_source_shunt_admittance`):
        if not bus.fault_level_mva:
            continue                      # UCZCIWIE pomija wezel bez danej
  * `v126_academic.py` (`_voltage_stability`, przed karta):
        fault_level = bus.fault_level_mva or max(25.0, bus.nominal_kv * 10.0)
                                          # PODSTAWIA 150 MVA dla szyny 15 kV
Pole `fault_level_mva` jest podane dla 1 z 315 szyn sieci odniesienia, wiec druga
forma zmyslala wejscie dla 99,7 % wezlow. Roznica miedzy tymi dwoma wierszami jest
dokladnie tym, co ta bramka mierzy.

CO WYKRYWA (analiza skladni, nie dopasowanie tekstu)
----------------------------------------------------
Trafieniem jest ODCZYT POLA KONTRAKTU WEJSCIOWEGO z GALEZIA ZAPASOWA LICZBOWA:
  A. `<obiekt>.<pole> or <wyrazenie liczbowe>`
  B. `... <obiekt>.<pole> ... if <warunek> else <wyrazenie liczbowe>`
  C. `getattr(<obiekt>, "<pole>", <wyrazenie liczbowe>)`

ODCZYT PRZEZ `getattr` LICZY SIE TAK SAMO, CO PRZEZ KROPKE (2026-08-08, karta
MOST-WEJSCIA-V126): w formach A i B `<obiekt>.<pole>` obejmuje rowniez
`getattr(<obiekt>, "<pole>")`. Bez tego zlozenie
`getattr(obiekt, "pole", None) or <liczba>` bylo NIEWIDZIALNE, mimo ze jest
doslownie forma A — tylko innym zapisem odczytu. Pomiar: cztery takie zlozenia
zyly w `solver_input/v126_contracts.py`, a bramka meldowala RC=0 „PASS".
Jedno miejsce w kodzie daje JEDNA pozycje budzetu: gdy `getattr` ma zapas
liczbowy, jest forma C i nie liczy sie po raz drugi jako A (`getattr_read`).

WYRAZENIEM LICZBOWYM JEST TEZ STALA MODULU zwiazana z literalem liczbowym
(`numeric_module_constants`). Bez tego kazdy zastepnik chowal sie jednym ruchem —
przeniesieniem liczby do nazwanej stalej. Wykryte na wlasnej skorze przy tej samej
karcie: sprowadzenie zdublowanego literalu 0,1 (stosunek R/X wg IEC 60909-0) do
jednej stalej sprawilo, ze pozycja budzetu ZNIKNELA SAMA, bez zmiany zachowania
kodu. Cicha zielen jest gorsza niz czerwien — nie da sie jej odroznic od naprawy.

Dwa warunki musza zajsc RAZEM i oba sa czytane Z KODU, nie z listy w bramce:

1. `<pole>` jest POLEM ZADEKLAROWANYM w modelu wejsciowym — zbior pol powstaje
   z adnotacji klas w `solver_input/**` i `enm/models.py` (`contract_fields`).
   Dzieki temu odczyt slownika (`parameters.get("H", 1.0)`, `entry.get("step_norm", 0)`)
   NIE JEST trafieniem Z KONSTRUKCJI REGULY, a nie przez wyjatek w komentarzu:
   klucz slownika nie jest zadeklarowanym polem kontraktu. To rozroznienie realizuje
   wymog „parametr projektowy z kontrolka w oknie nie wchodzi do budzetu" —
   parametry projektowe docieraja przez `model.parameters`, czyli slownik, a ich
   parytet z kontrolkami pilnuje OSOBNY, istniejacy mechanizm
   (`backend/tests/ci/test_v126_rodzaje_parytet.py::test_kazdy_czytany_parametr_ma_kontrolke`).
   Bramka nie powtarza tamtej roboty (reuzycie zamiast duplikacji).

2. Galaz zapasowa jest WYRAZENIEM LICZBOWYM (`is_numeric`) — stala, dzialanie
   arytmetyczne, `float/int/abs/max/min/round`. Galaz `None` NIE jest trafieniem,
   bo `None` to wlasnie uczciwy meldunek braku; napis i wartosc logiczna tez nie,
   bo nie wchodza do arytmetyki fizyki. NIE JEST TEZ trafieniem jawna NIE-LICZBA
   `float("nan")` (`is_not_a_number_literal`): NaN nie moze udawac pomiaru, bo
   kazde dzialanie na nim daje NaN, a warstwa wiarygodnosci lapie go jako wynik
   niefizyczny — to meldunek braku w typie liczbowym. Rozroznienie jest
   strukturalne (argument `float` jest napisem „nan"), nie lista wyjatkow;
   `float(base_p)` — konwersja realnej danej — nadal jest liczba.

   NIESKONCZONOSC JEST TRAFIENIEM (zawezone przy odbiorze rundy 4, 2026-08-08).
   Regula obejmowala pierwotnie takze `float("inf")` z uzasadnieniem „kazde
   dzialanie daje NaN/inf". Uzasadnienie jest prawdziwe dla NaN i FALSZYWE dla
   nieskonczonosci — dzielenie ja POCHLANIA. Iniekcja nadzorcy w pliku w zakresie
   skanu (`power_flow_newton.py`): `gen.internal_impedance_pu or float("inf")`,
   a nastepnie `1.0 / impedancja` daje `0.0`, dla ktorego `math.isfinite` jest
   prawda — czyli liczbe udajaca pomiar, przepuszczana przez `_finite`. Bramka
   meldowala wtedy RC=0. Ten sam wzorzec zyje w repozytorium: tabela wspolczynnika
   mu w `machine_sc_iec60909.py` (w. 75) uzywa `float("inf")` tam, gdzie
   `e^{-0.38 I''_k/I_r}` daje 0,0. Zawezenie kosztowalo ZERO nowych pozycji
   budzetu — zadne zywe `or float("inf")` na polu kontraktu nie istnieje.
   Pomiar tej granicy: bez warunku liczbowosci skan warstwy solverow daje 40
   trafien, z czego 26 to formy UCZCIWE albo niefizyczne (`... else None`, nazwa
   do wyswietlenia, flaga `in_service`, sposob uziemienia jako napis) — budzet,
   w ktorym dwie trzecie pozycji to falszywe alarmy, uczy ludzi ignorowac bramke
   i zamraza poprawne konstrukcje. Bez reguly NaN doszlyby 4 pozycje
   z `power_flow_oltc_studies.py`, gdzie podstawiona wartosc trafia WYLACZNIE do
   tekstu sladu. Z obiema granicami: 24 trafienia w warstwie solverow, realne.

GRANICE BRAMKI — czego ta detekcja NIE wykrywa (jawnie, zamiast cicho)
----------------------------------------------------------------------
 1. **Naga stala w dzialaniu** — `0.15 * z`, `0.45 ** 2`, `0.12 * saifi`,
    `mcov * 2.8`, `betavariate(5, 2)`. Skladniowo nierozroznialne od stalej
    normowej (`0.157` z rownan IEEE 80) i od parametru metody: obie sa literalem
    w wyrazeniu. Rozstrzyga TYLKO czlowiek, wiec te pozycje sa nazwane imiennie
    w `docs/audit/INWENTARZ_STALYCH_V126_2026-08-08.md`, a nie w budzecie tej
    bramki. To jest najwazniejsza granica: **budzet ponizej NIE pokrywa dziewieciu
    dlugow karty QU-FABRYKACJA** — one naleza do tej drugiej, niedetekowalnej
    formy. Twierdzenie odwrotne byloby falszywa pewnoscia.
 2. **Podloga i sufit na danej** — `max(bus.load_mw, 0.05)`, `min(x, 0.98)`.
    To inny defekt (ciche przycinanie danej OBECNEJ), a nie podstawienie za
    nieobecna; do tego forma zlewa sie z zabezpieczeniem dzielenia
    (`max(nominal_kv, 1e-6)`). Pomiar: 1 trafienie w warstwie solverow i jest to
    epsilon `1e-6`, wiec budzet zlozony z samych falszywych alarmow.
 3. **Podstawienie o dwa kroki dalej** — `x = pole; ...; if x is None: x = 1.0`
    (instrukcja `if`, nie wyrazenie warunkowe) oraz podstawienie w innej funkcji
    niz odczyt. Wymagaloby analizy przeplywu danych; forma wyrazeniowa jest
    wykrywana, instrukcyjna nie.
 4. **Wartosc domyslna w SYGNATURZE pola kontraktu** — `ampacity_a: float = 300.0`
    w modelu pydantic. To swiadoma czesc kontraktu (i osobna decyzja projektowa),
    a nie podstawienie w kodzie liczacym. Bramka patrzy na warstwe solverow i
    mostu, nie na definicje modeli.
 5. **Dana, ktora NIE JEST polem zadeklarowanym w zadnym z `CONTRACT_SOURCES`** —
    czyli odczyt przez `dict`/`Any` bez modelu, przez klase spoza wymienionych
    korzeni albo przez pole nadane dynamicznie (`setattr`). Regula stoi na zbiorze
    zadeklarowanych pol i widzi DOKLADNIE tyle, ile ten zbior obejmuje.

    UWAGA — TA GRANICA BYLA MYLACA I TO KOSZTOWALO PRAWDZIWA LUKE (runda 3,
    2026-08-08). Poprzednie brzmienie mowilo „pole nieistniejace w ZADNYM modelu
    wejsciowym", z czego czytelnik wyciagal wniosek, ze pole ZADEKLAROWANE jest
    pokryte. Nie bylo: `CONTRACT_SOURCES` obejmowalo tylko kontrakt V12.6 i model
    ENM, a klasyczne solvery czytaja model domenowy z `network_model/core/**`.
    Zmierzona luka: 54 pola `core` poza mapa, 165 ich odczytow w warstwie objetej
    skanem; iniekcja `return gen.cos_phi or 0.95` w `power_flow_newton.py` dawala
    RC=0 „PASS". Zdanie granicy WYLACZALO CZUJNOSC zamiast ja kierowac — a to
    grozniejsze niz sam defekt (regula KLASA §4). Korzen zostal dolozony.

    TA SAMA KLASA WROCILA W RUNDZIE 4 — DRUGA DROGA. Pin z rundy 3 wyprowadza
    korzenie Z IMPORTOW, a kontrakt zadeklarowany WEWNATRZ skanowanej warstwy nie
    jest przez nia importowany, wiec pin z konstrukcji nie mogl o niego zapytac.
    Pomiar: warstwa deklaruje 976 pol w 36 plikach (675 nazw unikalnych, 314 poza
    mapa; zawezone do `*Input`/`*Options` z typem liczbowym — 28 pol, m.in.
    `CableSelectionInput.transformer_current_a`, `GridSourcePreviewInput.tk_s`).
    Iniekcja `wejscie.transformer_current_a or 250.0` dawala RC=0. Warstwa zostala
    dolozona do zrodel pol.

    ZEBY TO SIE NIE POWTORZYLO PO RAZ TRZECI, granica ma DWA PINY domykajace klase
    z OBU stron, nie akapit:
      * `test_kazdy_model_czytany_przez_zakres_jest_w_mapie` — korzenie ZEWNETRZNE:
        kazdy model IMPORTOWANY przez warstwe ma decyzje (mapa albo wykluczenie
        z powodem); solver na NOWYM kontrakcie zapala czerwien;
      * `test_kazdy_skanowany_korzen_jest_zrodlem_pol` — korzenie WEWNETRZNE:
        co skanujemy, to tez czytamy jako model, wiec kontrakt zadeklarowany
        w skanowanej warstwie nie moze byc dla bramki niewidzialny.
    Trzecia droga do tej samej luki musialaby ominac oba warunki naraz.
 6. **Wykonanie z napisu** (`eval`, `exec`) — poza zasiegiem analizy skladni.

ZAKRES SKANU
------------
`network_model/solvers/**` (tam mieszka fizyka — regula NOT-A-SOLVER),
`solver_input/**` (tam wejscia solvera POWSTAJA) ORAZ `enm/**` (drugi most tego
samego modelu: ENM -> graf domenowy dla solverow klasycznych). Korzenie mostow sa
w zakresie, bo zastepnik wstrzykniety PO DRODZE do solvera jest w skutku
identyczny, a nawet gorszy: solver nie ma jak odroznic go od pomiaru.

`enm/**` DOLOZONY 2026-08-08 (karta MOST-WEJSCIA-V126). Poprzednia wersja tego
akapitu zapowiadala rozszerzenie i odkladala je „na pozniej"; to sie stalo.
Pomiar dolozenia: +17 trafien, WSZYSTKIE w `enm/**`, ZERO kolateralnych w
warstwie skanowanej wczesniej (mapa pol urosla o 115 pozycji bez ani jednego
nowego trafienia gdzie indziej). Wczesniejsza liczba „33 dla enm/**" krazaca
w opisie karty NIE POTWIERDZILA SIE pomiarem: 33 dotyczylo calego `backend/src`
POZA zakresem skanu, a nie samego `enm/**`.

CO POZOSTAJE POZA ZAKRESEM (jawnie, pomiar 2026-08-08 na zbiorze 1807 pol):
38 trafien — `application/**` (29), `network_model/catalog/**` (3),
`infrastructure/**` (2), `network_model/core/**` (2), `api/**` (1),
`diagnostics/**` (1). To warstwy INTERPRETACJI, katalogu i dostepu, a nie tor
WEJSCIA solvera; kolejne rozszerzenie wymaga wlasnego pomiaru i wlasnego budzetu,
bo bez tego zamrozilibysmy liczbe, ktorej nikt nie przeczytal.

ZAPADKA (`ZASTANE_ZASTEPNIKI`)
-----------------------------
Konwencja `no_direct_fault_params_guard.py` i `mypy_ratchet_guard.py`: budzet
wiaze KONKRETNE zastane wystapienia w postaci `{"<forma>:<cel>": liczba}` na plik,
zmierzona na stanie zamrozenia. Plik z zapadki jest normalnie parsowany i liczony.
Zapadka dziala W OBIE STRONY: NADWYZKA ponad budzet to naruszenie (nowy zastepnik
zapala CI), a NIEDOBOR tez jest czerwony i zada obnizenia budzetu — inaczej
poprawa nie zostaje utrwalona i dlug wraca po cichu. Kazdy wpis ma POWOD.
"""

from __future__ import annotations

import ast
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

#: Korzenie skanowania (wzgledem `BACKEND_SRC`) — patrz „ZAKRES SKANU".
SCAN_ROOTS: tuple[str, ...] = ("network_model/solvers", "solver_input", "enm")

#: Zrodla zbioru pol modeli WEJSCIOWYCH. Zbior jest CZYTANY Z KODU, zeby zmiana
#: kontraktu nie rozbrajala reguly po cichu.
#:
#: `network_model/core` DOLOZONE 2026-08-08 (runda 3, znalezisko nadzorcy).
#: Poprzedni zbior obejmowal wylacznie kontrakt V12.6 i model ENM, a KLASYCZNE
#: solvery (IEC 60909, Newton-Raphson, ZIP) czytaja model DOMENOWY z
#: `network_model/core/**`. Pomiar luki: 120 pol zadeklarowanych w `core`, z czego
#: **54 nie bylo w mapie**, a warstwa objeta skanem czytala je **165 razy**
#: (`node_id` 68x, `voltage_level` 24x, `cos_phi` 8x, `un_kv` 3x). Iniekcja
#: `return gen.cos_phi or 0.95` dopisana do `power_flow_newton.py` — pliku W
#: ZAKRESIE SKANU — dawala **RC=0 „PASS"**, czyli dokladnie ta forme, ktora ta
#: bramka zwalcza, przepuszczala w warstwie zadeklarowanej jako wlasny zakres.
#:
#: WYROCZNIA MUSI CHODZIC PO TYM SAMYM ZBIORZE, CO KOD. Zbior zrodel modeli i
#: zakres skanu nie moga sie rozjezdzac — pilnuje tego
#: `test_solver_input_substitute_guard.py::test_kazdy_model_czytany_przez_zakres_jest_w_mapie`,
#: ktore wyprowadza korzenie modeli Z IMPORTOW warstwy objetej skanem, a nie
#: z listy pisanej recznie. Nowy solver na nowym kontrakcie nie powtorzy tej luki.
CONTRACT_SOURCES: tuple[str, ...] = (
    # Kontrakty wejsciowe i model ENM (zakres pierwotny).
    "solver_input",
    # CALY `enm` — dolozony 2026-08-08 razem z rozszerzeniem zakresu skanu
    # (karta MOST-WEJSCIA-V126). Warunek zamykajacy `test_kazdy_skanowany_korzen_
    # jest_zrodlem_pol` zada, zeby korzen SKANOWANY byl tez zrodlem pol; inaczej
    # kontrakt zadeklarowany w `enm/**` (np. `enm/domain_ops_models.py`, ktory i
    # tak byl juz wymieniony osobno) bylby dla bramki niewidzialny — luka rundy 4
    # w nowym miejscu. Pomiar dolozenia: +115 pol (1543 -> 1658) i ZERO nowych
    # trafien w warstwie skanowanej wczesniej, czyli czysty zysk zasiegu.
    # `enm/models.py` jest podzbiorem tego korzenia (wpis zdjety jako zbedny).
    "enm",
    # WLASNE deklaracje warstwy objetej skanem (runda 4). Kontrakt zadeklarowany
    # WEWNATRZ warstwy nie jest przez nia IMPORTOWANY, wiec pin mapy — ktory
    # wyprowadza korzenie z importow — z konstrukcji nie mogl zazadac o nim
    # decyzji. Pomiar luki: 36 plikow warstwy deklaruje 976 pol w klasach, 675
    # nazw unikalnych, **314 poza mapa**; zawezone do klas `*Input`/`*Options`
    # z typem liczbowym — **28 pol**, m.in. `CableSelectionInput.transformer_current_a`,
    # `BlockTransformerSelectionInput.sum_apparent_power_mva`, `GridSourcePreviewInput.tk_s`.
    # Iniekcja `wejscie.transformer_current_a or 250.0` w `der_selection_preview.py`
    # dawala RC=0 „PASS". Przyrost po dolozeniu: +5 trafien, wszystkie realne
    # (0 kolizji — patrz `MODEL_ROOTS_POZA_MAPA` i `is_not_a_number_literal`).
    "network_model/solvers",
    # Model DOMENOWY klasycznych solverow (runda 3 — patrz akapit wyzej).
    "network_model/core",
    # Pozostale moduly-modele IMPORTOWANE przez warstwe objeta skanem. Lista jest
    # WYPROWADZONA z importow (`model_roots_read_by_scope`), a nie pisana z glowy;
    # kompletnosc pilnuje test `test_kazdy_model_czytany_przez_zakres_jest_w_mapie`.
    # Pomiar przyrostowy per korzen: 21 z nich kosztuje +0 trafien (czysty zysk
    # precyzji), `enm/domain_ops_models.py` ujawnia 2 realne, a
    # `network_model/solvers/power_flow_newton.py` — 1 realne.
    #
    # DZIESIEC KORZENI DOLOZONYCH 2026-08-08 (karta MOST-WEJSCIA-V126) — pin mapy
    # zazadal o nie decyzji, gdy `enm` wszedl do zakresu skanu i warstwa zaczela
    # importowac wlasne modele. Pomiar per korzen: KAZDY kosztuje +0 trafien
    # (lacznie +149 pol, 1658 -> 1807, zero nowych trafien i zero kolizji nazw),
    # wiec decyzja brzmi „do mapy", a nie „poza mapa" — szerszy zasieg bez halasu.
    "application/automation/trace.py",
    "application/compliance/source_compliance.py",
    "application/proof_engine/packs/phase_state_sn.py",
    "application/stability/dynamic_stability.py",
    "application/stability/voltage_trajectory.py",
    "domain/canonical_operations.py",
    "domain/study_case.py",
    "enm/domain_ops_models.py",
    "infrastructure/persistence/models.py",
    "network_model/catalog/audit2_catalogs.py",
    "network_model/catalog/bay_templates.py",
    "network_model/catalog/materialization.py",
    "network_model/catalog/repository.py",
    "network_model/catalog/types.py",
    "network_model/solvers/cable_ampacity_derating.py",
    "network_model/solvers/cable_voltage_drop.py",
    "network_model/solvers/conductor_thermal_withstand.py",
    "network_model/solvers/equipment_checks/cable_thermal_aging.py",
    "network_model/solvers/equipment_checks/ct_burden_saturation.py",
    "network_model/solvers/equipment_checks/transformer_losses.py",
    "network_model/solvers/equipment_checks/vt_burden_voltage_drop.py",
    "network_model/solvers/fault_loop_iec60364.py",
    "network_model/solvers/frt_hvrt/contracts.py",
    "network_model/solvers/power_flow_inverter.py",
    "network_model/solvers/power_flow_newton.py",
    "network_model/solvers/power_flow_oltc.py",
    "network_model/solvers/power_flow_types.py",
    "network_model/solvers/power_flow_zip.py",
    "network_model/solvers/short_circuit_contributions.py",
    "network_model/solvers/short_circuit_core.py",
    "network_model/solvers/state_estimation_wls.py",
    "network_model/whitebox/tracer.py",
    "reference_engine/validation.py",
)

#: Korzenie modeli SWIADOMIE POZA mapa pol — z POWODEM MERYTORYCZNYM, nie „poza
#: zakresem". Zbior jest drugim koncem pary: `test_kazdy_model_czytany_przez_zakres_jest_w_mapie`
#: zada, zeby KAZDY korzen wyprowadzony z importow byl albo w `CONTRACT_SOURCES`,
#: albo TUTAJ. Nowy solver na nowym kontrakcie nie moze wiec po cichu wypasc poza
#: zasieg reguly — musi dostac DECYZJE. Ten sam wzorzec, co
#: „prezentowane + nieprezentowane = komplet kontraktu".
MODEL_ROOTS_POZA_MAPA: dict[str, str] = {
    "network_model/solvers/stability_rms/contracts.py": (
        "Deklaruje pola `real` i `imag` (fazor jako model danych), a to sa NAZWY "
        "ATRYBUTOW WBUDOWANEGO typu `complex`. Mapa pol jest plaskim zbiorem NAZW, "
        "wiec wlaczenie tego korzenia zamienia kazdy odczyt `z.real` / `z.imag` "
        "w warstwie solverow w trafienie: pomiar dal 8 falszywych alarmow "
        "(`losses_total.real`, `loss_total.imag`, `voltage.imag`, `z.imag`), czyli "
        "kolizje nazw, a nie odczyty danych modelu. Zamrozenie ich w budzecie "
        "byloby dokladnie tym halasem, przed ktorym bronila runda 2. Pola tego "
        "modulu nie sa danymi wejsciowymi fizyki — to postac wyniku."
    ),
}

#: Wywolania, ktore na pewno daja liczbe — galaz zapasowa z nimi jest zastepnikiem.
_NUMERIC_CALLS: frozenset[str] = frozenset(
    {"float", "int", "abs", "max", "min", "round", "sum", "len"}
)

#: Zapadka zastanych zastepnikow: plik -> {"<forma>:<cel>": liczba}.
#: Pomiar zamrozenia 2026-08-08 (karta QU-FABRYKACJA, rundy 2 i 3):
#: 24 wystapienia w warstwie solverow + 8 w moscie wejsc = 32 w 8 plikach.
#: Runda 3 dolozyla `network_model/core` do mapy pol (+54 pola, 563 -> 617)
#: (563 -> 1249 pol po dolozeniu wszystkich korzenii z importow) i ujawnila
#: 5 nowych pozycji: 2 w `power_flow_newton_internal.py`, 2 w
#: `der_selection_preview.py`, 1 w `power_flow_oltc_studies.py`.
#: KAZDY wpis niesie powod. „Poza zakresem karty" powodem NIE jest.
ZASTANE_ZASTEPNIKI: dict[str, dict[str, int]] = {
    # Rozdzial mocy odbioru na czesc stala ZIP: gdy `base_p/base_q` nie podano,
    # brana jest moc ze specyfikacji odbioru — czyli dana RZECZYWISTA, a nie stala.
    # Trafienie wynika z `float(base_p)` w galezi `else` (wywolanie liczbowe), nie
    # ze zmyslonej liczby. DLUG: forma jest nieodroznialna dla bramki, wiec pozycje
    # zostaja w budzecie jako zamrozone; rozstrzygniecie merytoryczne — bez zmiany.
    "network_model/solvers/power_flow_zip.py": {
        "B:ifexp:spec.p_mw": 1,
        "B:ifexp:spec.q_mvar": 1,
    },
    # Dobor DER — wspolczynnik jednoczesnosci i obciazalnosc podstawiane JEDYNKA,
    # gdy podano wartosc niedodatnia. Jedynka nie jest neutralna: znaczy „brak
    # redukcji jednoczesnoscia", czyli najostrzejszy przypadek doboru, i wchodzi
    # wprost do mocy obliczeniowej. DLUG NAZWANY: dana niedodatnia to blad wejscia
    # — nalezy go ODRZUCIC walidacja (jak dwa wiersze wyzej robia napiecia), a nie
    # zastepowac liczba. Ujawnione dopiero w rundzie 3, po dolozeniu
    # `enm/domain_ops_models.py` do mapy pol.
    "network_model/solvers/der_selection_preview.py": {
        "B:ifexp:data.loadability_pu": 1,
        # `reserve_pu` (3x) dolozone w rundzie 4 — ta sama rodzina, co dwa wpisy
        # obok, ale widoczna dopiero po dolozeniu WLASNYCH deklaracji warstwy do
        # mapy: `CableSelectionInput`/`BlockTransformerSelectionInput` mieszkaja
        # w `network_model/solvers/**`, wiec warstwa ich nie IMPORTUJE i pin mapy
        # nie mogl o nie zapytac.
        "B:ifexp:data.reserve_pu": 3,
        "B:ifexp:data.simultaneity_factor": 1,
    },
    # Odczyt WYNIKU rozplywu z wartoscia zastepcza zero: `getattr(solution,
    # "losses_total", 0.0 + 0.0j)`. Zero strat nie jest brakiem strat — to zero
    # udajace pomiar, dokladnie ta klasa, ktora karta zdjela z `q_available_mvar`.
    # DLUG NAZWANY: brak pola wyniku powinien byc bledem programistycznym
    # (rozplyw ZAWSZE oddaje straty), a nie cicho zerowany.
    "network_model/solvers/power_flow_oltc_studies.py": {
        "C:getattr:losses_total": 1,
    },
    # Prad znamionowy maszyny w mianowniku ilorazu I_p/I_r: przy braku danej
    # (`ir_a <= 0`) iloraz przyjmuje 0,0 i tak wchodzi do `mu_factor`, czyli do
    # wspolczynnika wygaszania IEC 60909 §6.6/§6.7 — a wiec ZMIENIA WYNIK, a nie
    # tylko zabezpiecza dzielenie. DLUG NAZWANY: maszyna bez pradu znamionowego
    # powinna zostac POMINIETA z meldunkiem braku (wzorzec
    # `_grid_source_shunt_admittance`), a nie liczona ze wspolczynnikiem z zera.
    # Ujawnione w rundzie 4 razem z wlasnymi deklaracjami warstwy.
    "network_model/solvers/machine_sc_iec60909.py": {
        "B:ifexp:m.ir_a": 2,
    },
    # PUNKT STARTOWY ITERACJI, NIE WIELKOSC WEJSCIOWA — jedyny wpis budzetu
    # uzasadniony MERYTORYCZNIE, a nie nazwany dlugiem. `_build_initial_voltage`
    # podstawia 1,0 pu / 0 rad za brakujace napiecie wezla, ale jest to kanoniczny
    # „plaski start" metody Newtona: wynik ZBIEZNY nie zalezy od punktu startowego,
    # zmienia sie tylko droga do niego. Forma jest ta sama, co w defekcie, wiec
    # rozstrzyga merytoryka — i dlatego twierdzenie MA PRZYPIETY TEST (regula
    # „deklaracja bez testu = falszywa pewnosc"):
    # `backend/tests/network_model/solvers/test_punkt_startowy_nie_zmienia_wyniku.py`
    # przechodzi iloczyn {plaski start · cieply z kompletem napiec · cieply z BRAKIEM
    # napiec, czyli ta galezia · cieply z napieciami ODLEGLYMI od rozwiazania w obie
    # strony} i sprawdza rownosc rozwiazan do 1e-7 pu. Pomiar, ktory wymusil ten
    # test: WSZYSTKIE 6 testow repozytorium uzywajacych `flat_start` ustawialo
    # `True`, wiec galaz z podstawieniem nie byla wykonywana ANI RAZU i uzasadnienie
    # tego wpisu bylo nie do sprawdzenia.
    "network_model/solvers/power_flow_newton_internal.py": {
        "B:ifexp:node.voltage_angle": 1,
        "B:ifexp:node.voltage_magnitude": 1,
    },
    # Slad K_t transformatora: impedancja zastepcza liczona z danych znamionowych,
    # gdy gałąź ich nie ma. DLUG NAZWANY — patrz inwentarz stalych, pozycja
    # „dane znamionowe transformatora w sladzie".
    "network_model/solvers/short_circuit_iec60909.py": {
        "B:ifexp:branch.rated_power_mva": 1,
    },
    # Karta falownika (SSCI): pola nieobowiazkowe podstawiane zerem/jednostka.
    # Trzy pola OBOWIAZKOWE (pasmo petli pradowej, pasmo PLL, indukcyjnosc filtra)
    # sa juz uczciwe — ich brak daje `ValueError` i meldunek „dane niekompletne",
    # bez zadnej wartosci zastepczej. Pozostale (rezystancja filtra, opoznienie
    # regulacji, punkt pracy P/Q, moc i napiecie znamionowe) maja udokumentowane
    # zalozenie w docstringu `_z_conv_components`. DLUG NAZWANY: zalozenie
    # udokumentowane to nadal zalozenie — do zamiany na meldunek braku.
    # Dwa wpisy `A:or:item.*` to koordynacja izolacji: napiecie obnizone i TOV
    # podstawiane z krotnosci MCOV, gdy karta katalogowa ogranicznika nie istnieje
    # (`mcov * 2.8`). To pozycja z inwentarza stalych — jedyna z dziewieciu dlugow
    # karty, ktora ta bramka w ogole WIDZI, bo ma forme zapasowa; osiem pozostalych
    # to nagie stale w dzialaniu (granica nr 1).
    "network_model/solvers/v126_academic.py": {
        "A:or:converter.p_mw": 1,
        "A:or:converter.q_mvar": 1,
        "A:or:item.arrester_residual_10ka_kv": 1,
        "A:or:item.predicted_tov_kv": 1,
        "B:ifexp:converter.control_delay_ms": 2,
        "B:ifexp:converter.filter_r_pu": 2,
        "B:ifexp:converter.rated_mva": 3,
    },
    # Most ENM -> wejscie V12.6. CZTERY POZYCJE ZDJETE karta MOST-WEJSCIA-V126
    # (2026-08-08): `C:getattr:length_km`, `C:getattr:r_ohm_per_km`,
    # `C:getattr:x_ohm_per_km` byly MARTWYMI wartosciami zapasowymi (pola sa
    # WYMAGANE w `OverheadLine`/`Cable`, wiec pydantic nie dopusci obiektu bez
    # nich — galaz zapasowa nie mogla sie wykonac ANI RAZU, a wygladala na
    # zalozenie projektowe); `C:getattr:b_siemens_per_km` zamieniony na jawne
    # `None` w kontrakcie („susceptancja nieznana" != „susceptancja zerowa").
    # Ta sama karta usunela z tego pliku podstawienia NIEWIDZIALNE dla poprzedniej
    # wersji reguly (`getattr(..., None) or <liczba>`): obciazalnosc 300 A odcinka,
    # obciazalnosc 630 A KAZDEGO aparatu oraz `r_ohm/x_ohm or 0.001` kasujace
    # JAWNE 0,0 Ω aparatu — patrz `reads_contract_field`.
    "solver_input/v126_contracts.py": {
        # Czestotliwosc bazowa sieci: brak -> 50 Hz. DLUG NAZWANY — wartosc
        # znamionowa systemu, ale nadal podstawienie; do zamiany na wymog danej.
        "A:or:enm.frequency_hz": 1,
        "B:ifexp:enm.frequency_hz": 1,
        # Moc bierna wytworcy nieokreslona -> 0 Mvar (praca przy cos φ = 1).
        # DLUG NAZWANY: to zalozenie o trybie regulacji, nie pomiar.
        "A:or:generator.q_mvar": 1,
        # Straty jalowe transformatora nieokreslone -> 0 kW. DLUG NAZWANY: brak
        # danej tabliczkowej udaje transformator bezstratny w stanie jalowym.
        "A:or:transformer.p0_kw": 1,
    },
    # --- korzen `enm` dolozony do zakresu karta MOST-WEJSCIA-V126 (2026-08-08) ---
    # Pomiar dolozenia: +17 trafien, WSZYSTKIE w `enm/**`, zero kolateralnych w
    # warstwie skanowanej wczesniej. Nadzorca podawal wczesniej liczbe 33 dla
    # `enm/**` — pomiar wlasny jej NIE POTWIERDZIL: 33 to bylo cale `backend/src`
    # POZA zakresem skanu, a nie samo `enm/**`.
    #
    # Drugi most modelu: ENM -> graf domenowy (`NetworkGraph`) dla solverow
    # klasycznych. Pozycje `B:ifexp:*` maja tu forme `X if X is not None else <liczba>`
    # PO naprawie: karta zamienila operator `or` na predykat `is None`, bo `or` nie
    # odroznial BRAKU od jawnego zera. Najostrzej przy skoku zaczepu — jawnie podane
    # 0,0 % (transformator bez regulacji) stawalo sie 2,5 %, czyli regulacja, ktorej
    # model NIE MA, a to wchodzi wprost do przekladni t = 1 + poz·skok/100.
    # Same wartosci zapasowe zostaja w budzecie, bo naleza do kontraktu
    # `TransformerBranch`/`Switch` (`i0_percent: float = 0.0`, `tap_step_percent:
    # float = 2.5`) — czyli do granicy nr 4, ktora jest OSOBNA decyzja projektowa.
    "enm/mapping.py": {
        # Liczba jednostek rownoleglych: brak -> 1. To KARDYNALNOSC elementu
        # („ile sztuk reprezentuje ta pozycja"), a nie wielkosc mierzona —
        # element bez podanej liczby jest jedna sztuka. Powod merytoryczny.
        "A:or:gen.n_parallel": 1,
        "A:or:trafo.n_parallel": 1,
        # Moc bierna wytworcy -> 0 Mvar. Ta sama pozycja, co w moscie V12.6 wyzej
        # (jeden defekt, dwa mosty) — DLUG NAZWANY, do rozstrzygniecia razem.
        "A:or:gen.q_mvar": 1,
        # Stosunek R/X zasilania systemowego wg IEC 60909-0 §3.2 dla sieci WN.
        # Wartosc NORMOWA z przypisem, nie wymyslona; karta sprowadzila ja do
        # JEDNEJ stalej modulu (byly DWIE niezalezne kopie tego obliczenia).
        # Zostaje w budzecie, bo norma podaje ja jako wartosc TYPOWA, a nie jako
        # wlasciwosc konkretnego przylacza.
        "B:ifexp:source.rx_ratio": 1,
        # Prad/napiecie znamionowe bezpiecznika -> 0. Wartosc nalezy do kontraktu
        # `Switch` (`rated_current_a: float = 0.0`); rola mostu ogranicza sie do
        # odroznienia braku od danej i to zostalo naprawione (`is None`).
        "B:ifexp:branch.rated_current_a": 1,
        "B:ifexp:branch.rated_voltage_kv": 1,
        # Dane jalowe i zaczepowe transformatora — jak wyzej, wartosci naleza do
        # kontraktu `TransformerBranch`. DLUG NAZWANY dla `tap_step_percent`:
        # 2,5 % to typowy skok, a nie skok TEGO transformatora.
        "B:ifexp:trafo.i0_percent": 1,
        "B:ifexp:trafo.p0_kw": 1,
        "B:ifexp:trafo.tap_position": 1,
        "B:ifexp:trafo.tap_step_percent": 1,
    },
    # Skladowa zerowa transformatora. Dane OBOWIAZKOWE sa juz uczciwe: rezystor
    # NER bez R_N i cewka Petersena bez X_N koncza sie `ValueError` z polskim
    # powodem, bez zadnej wartosci zastepczej. W budzecie zostaja wylacznie
    # skladowe TOWARZYSZACE (reaktancja rezystora, rezystancja tlumienia dlawika),
    # ktorych pominiecie jest udokumentowanym uproszczeniem modelu, oraz
    # zabezpieczenie dzielenia przez moc znamionowa.
    "enm/zero_sequence_transformer.py": {
        "B:ifexp:grounding.r_ohm": 1,
        "B:ifexp:grounding.x_ohm": 1,
        # `r_pu = (pk/1000)/Sn if Sn > 0 else 0.0` — ZABEZPIECZENIE DZIELENIA na
        # danej niepoprawnej (Sn <= 0), nie podstawienie za brak. Powod
        # merytoryczny; dana niepoprawna nalezy odrzucic walidacja modelu.
        "B:ifexp:trafo.sn_mva": 1,
    },
    # Rzut grafu domenowego na kanoniczna specyfikacje mocy wezla. `active_power`
    # jest `float | None`, gdzie `None` znaczy „wezel nie ma wstrzykniecia" — a
    # BRAK WSTRZYKNIECIA JEST ZEREM WATOW, nie brakiem pomiaru. Powod
    # merytoryczny, nie dlug.
    "enm/canonical_analysis.py": {
        "A:or:node.active_power": 1,
        "A:or:node.reactive_power": 1,
    },
    # Numeracja rewizji dokumentu (`revision if existing else 0`). Ksiegowosc
    # magazynu, nie wielkosc fizyczna — pierwsza rewizja startuje od zera z
    # definicji. Powod merytoryczny, nie dlug.
    "enm/store.py": {
        "B:ifexp:existing.revision": 1,
    },
}


def contract_fields() -> set[str]:
    """Nazwy pol zadeklarowanych w modelach wejsciowych — CZYTANE Z KODU.

    Zbior powstaje z adnotacji `nazwa: typ` w cialach klas z `CONTRACT_SOURCES`.
    To on odsiewa odczyty slownikowe: klucz `parameters` nie jest zadeklarowanym
    polem, wiec nie moze byc trafieniem.

    PREDYKATY PARAMI (regula KLASA §3). Wykluczenie `MODEL_ROOTS_POZA_MAPA` jest
    stosowane TUTAJ, a nie tylko w tescie pinujacym mape. Do rundy 4 wykluczenie
    dzialalo wylacznie „przez nieobecnosc" — modul po prostu nie byl wymieniony
    w `CONTRACT_SOURCES`. Dwa niezaleznie utrzymywane warunki, ktore „dzis sie
    zgadzaja", sa defektem czekajacym na dane brzegowe: gdy runda 4 dolozyla
    `network_model/solvers` jako calosc, wykluczony `stability_rms/contracts.py`
    WROCIL do mapy tylnymi drzwiami i przywrocil 8 kolizji `real`/`imag`.
    Teraz wejscie i wyjscie ze zbioru pochodza z JEDNEGO zrodla prawdy.
    """
    fields: set[str] = set()
    for entry in CONTRACT_SOURCES:
        root = BACKEND_SRC / entry
        files = sorted(root.rglob("*.py")) if root.is_dir() else ([root] if root.is_file() else [])
        for path in files:
            rel = path.relative_to(BACKEND_SRC).as_posix()
            if rel in MODEL_ROOTS_POZA_MAPA:
                continue
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except (OSError, SyntaxError, UnicodeDecodeError):
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.ClassDef):
                    continue
                for stmt in node.body:
                    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                        fields.add(stmt.target.id)
    return fields


def declares_model_fields(path: Path) -> bool:
    """Czy modul DEKLARUJE model danych (klasa z polami adnotowanymi).

    Kryterium jest strukturalne: klasa z co najmniej jednym `nazwa: typ` w ciele.
    Obejmuje pydantic i dataclass bez rozrozniania — z punktu widzenia tej bramki
    obie sa tym samym: nosnikiem pola, ktore mozna podstawic liczba.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except (OSError, SyntaxError, UnicodeDecodeError):
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for stmt in node.body:
                if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                    return True
    return False


def _module_to_path(module: str) -> Path | None:
    """`a.b.c` -> sciezka w `BACKEND_SRC` (plik albo pakiet), gdy istnieje lokalnie."""
    base = BACKEND_SRC / Path(*module.split("."))
    if base.with_suffix(".py").is_file():
        return base.with_suffix(".py")
    if (base / "__init__.py").is_file():
        return base / "__init__.py"
    return None


def model_roots_read_by_scope() -> dict[str, set[str]]:
    """Moduly-modele IMPORTOWANE przez warstwe objeta skanem.

    Zwraca {sciezka modulu wzgledem BACKEND_SRC -> zbior plikow, ktore go importuja}.
    Wyrocznia mapy pol jest wyprowadzana Z KODU (z importow), a nie z listy pisanej
    recznie — inaczej nastepny solver na nowym kontrakcie powtorzylby luke rundy 3.
    """
    found: dict[str, set[str]] = {}
    for root_name in SCAN_ROOTS:
        root = BACKEND_SRC / root_name
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*.py")):
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except (OSError, SyntaxError, UnicodeDecodeError):
                continue
            modules: set[str] = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                    modules.add(node.module)
                elif isinstance(node, ast.Import):
                    modules.update(alias.name for alias in node.names)
            for module in modules:
                target = _module_to_path(module)
                if target is None or not declares_model_fields(target):
                    continue
                rel = target.relative_to(BACKEND_SRC).as_posix()
                found.setdefault(rel, set()).add(path.relative_to(BACKEND_SRC).as_posix())
    return found


def is_covered_by_contract_sources(rel: str) -> bool:
    """Czy modul jest objety zbiorem zrodel pol (`CONTRACT_SOURCES`)."""
    return any(rel == entry or rel.startswith(f"{entry}/") for entry in CONTRACT_SOURCES)


def leftmost_name(expr: ast.expr) -> str | None:
    """Najbardziej lewa NAZWA lancucha atrybutow/indeksow/wywolan."""
    current: ast.expr = expr
    while isinstance(current, ast.Attribute | ast.Subscript | ast.Call):
        if isinstance(current, ast.Attribute | ast.Subscript):
            current = current.value
        else:
            current = current.func
    return current.id if isinstance(current, ast.Name) else None


def getattr_read(expr: ast.expr, stale: set[str] | None = None) -> tuple[str, str | None] | None:
    """`getattr(<obiekt>, "<pole>"[, <zapas>])` -> (pole, nazwa obiektu).

    Zwraca None, gdy wywolanie nie jest odczytem pola przez `getattr` ALBO gdy
    wartosc zapasowa `getattr` jest LICZBA — bo wtedy to samo miejsce w kodzie
    jest juz trafieniem formy C i policzenie go po raz drugi rozdmuchaloby budzet
    o pozycje-widmo. PREDYKATY PARAMI: warunek wejscia do formy D i warunek
    wejscia do formy C pochodza z jednego pomiaru (`is_numeric` na trzecim
    argumencie), a nie z dwoch niezaleznie utrzymywanych list.
    """
    if not isinstance(expr, ast.Call) or not isinstance(expr.func, ast.Name):
        return None
    if expr.func.id != "getattr" or len(expr.args) not in (2, 3):
        return None
    klucz = expr.args[1]
    if not isinstance(klucz, ast.Constant) or not isinstance(klucz.value, str):
        return None
    if len(expr.args) == 3 and is_numeric(expr.args[2], stale):
        return None
    return klucz.value, leftmost_name(expr.args[0])


def reads_contract_field(
    expr: ast.expr, fields: set[str], stale: set[str] | None = None
) -> str | None:
    """`<baza>.<pole>` gdy wyrazenie czyta zadeklarowane pole kontraktu.

    ODCZYT PRZEZ `getattr` LICZY SIE TAK SAMO, CO PRZEZ KROPKE (dolozone
    2026-08-08, karta MOST-WEJSCIA-V126). Do tej karty regula patrzyla wylacznie
    na `ast.Attribute`, wiec zlozenie `getattr(obiekt, "pole", None) or <liczba>`
    bylo dla niej NIEWIDZIALNE — mimo ze jest doslownie ta sama forma, tylko
    zapisana innym zapisem odczytu.

    POMIAR, KTORY TO WYMUSIL: w `solver_input/v126_contracts.py` — pliku, ktory
    docstring tej bramki nazywa „NAJGORSZA rodzina w calym zakresie" — zyly
    CZTERY takie zlozenia, w tym `getattr(rating, "in_a", None) or 300.0`
    (obciazalnosc odcinka) i `getattr(branch, "r_ohm", None) or 0.001`
    (rezystancja aparatu, kasujaca JAWNE 0,0 na kazdym aparacie tworzonym przez
    operacje domenowe). Bramka meldowala wtedy RC=0 „PASS". To byla TRZECIA droga
    do klasy, ktora docstring uznawal za domknieta „z obu stron" — dwa piny mapy
    pilnowaly, CZY pole jest znane, a nie CZY odczyt pola jest rozpoznawany.
    """
    if isinstance(expr, ast.Attribute) and expr.attr in fields:
        base = leftmost_name(expr)
        if base is not None:
            return f"{base}.{expr.attr}"
    odczyt = getattr_read(expr, stale)
    if odczyt is not None and odczyt[0] in fields:
        pole, baza = odczyt
        return f"{baza or 'getattr'}.{pole}"
    return None


def nested_contract_field(
    expr: ast.expr, fields: set[str], stale: set[str] | None = None
) -> str | None:
    """Pierwsze (deterministycznie: najplytsze, potem najwczesniejsze) pole w drzewie."""
    for node in ast.walk(expr):
        target = reads_contract_field(node, fields, stale)
        if target is not None:
            return target
    return None


def is_not_a_number_literal(expr: ast.expr) -> bool:
    """Czy wyrazenie to jawna NIE-LICZBA: `float("nan")`. WYLACZNIE NaN.

    NaN nie moze udawac pomiaru: kazde dzialanie na nim daje NaN, a warstwa
    wiarygodnosci analiz (`_finite` w `v126_academic.py`) lapie go jako wynik
    niefizyczny. Podstawienie NaN jest wiec forma MELDUNKU BRAKU, a nie zmyslonej
    wielkosci — tak samo jak `None`, tylko w typie liczbowym.

    NIESKONCZONOSC NIE MA TEJ WLASNOSCI — zawezone przy odbiorze rundy 4
    (2026-08-08). Regula obejmowala pierwotnie takze `float("inf")`, z tym samym
    uzasadnieniem („kazde dzialanie daje NaN/inf"). Uzasadnienie jest prawdziwe
    dla NaN i FALSZYWE dla nieskonczonosci: dzielenie ja POCHLANIA i daje wynik
    SKONCZONY, ktory przechodzi przez `_finite` jak pomiar.

    POMIAR NADZORCY (iniekcja w `power_flow_newton.py`, plik w zakresie skanu):

        impedancja = gen.internal_impedance_pu or float("inf")
        return 1.0 / impedancja        # -> 0.0, math.isfinite(...) == True

    Bramka meldowala RC=0. Zero jako „impedancja wewnetrzna nieobecna" jest
    dokladnie ta klasa, ktora ta bramka zwalcza — liczba udajaca pomiar.
    Ten sam wzorzec zyje w repozytorium: `machine_sc_iec60909.py` w. 75 uzywa
    `float("inf")` w tabeli wspolczynnika mu, gdzie `e^{-0.38 I''_k/I_r}` przy
    nieskonczonosci daje 0,0 — wartosc skonczona i uzyta dalej.

    Przypiete `test_solver_input_substitute_guard.py` (NaN uczciwy / inf gryzie).

    Rozroznienie pozostaje STRUKTURALNE (argument `float` jest napisem „nan"),
    a nie lista wyjatkow. `float(base_p)` — konwersja realnej danej — pozostaje
    liczba i nadal jest trafieniem, gdy stoi w galezi zapasowej.
    """
    if not isinstance(expr, ast.Call) or not isinstance(expr.func, ast.Name):
        return False
    if expr.func.id != "float" or len(expr.args) != 1:
        return False
    arg = expr.args[0]
    if not isinstance(arg, ast.Constant) or not isinstance(arg.value, str):
        return False
    tekst = arg.value.strip().lower().lstrip("+-")
    return tekst == "nan"


def numeric_module_constants(tree: ast.AST) -> set[str]:
    """Nazwy stalych MODULU zwiazanych z literalem liczbowym.

    PO CO. Bez tego kazdy zastepnik chowa sie przed regula jednym ruchem:
    przeniesieniem liczby do stalej (`... or _DOMYSLNY_RX`). Nazwa nie jest
    `ast.Constant`, wiec `is_numeric` meldowala falsz i trafienie znikalo —
    „naprawa" polegajaca na nadaniu liczbie nazwy wygaszalaby bramke, zamiast
    zmniejszac dlug. Wykryte przy tej samej karcie, ktora zamieniala zdublowany
    literal 0,1 (stosunek R/X wg IEC 60909-0) na jedna stala: pozycja budzetu
    zniknela SAMA, bez zadnej zmiany zachowania kodu. Cicha zielen jest gorsza
    niz czerwien, bo nie da sie jej odroznic od naprawy.

    Zasieg celowo waski i strukturalny: WYLACZNIE przypisania na poziomie modulu
    o postaci `NAZWA = <literal liczbowy>` (takze ze znakiem i z adnotacja typu).
    Wyrazenia, wywolania i stale importowane z innych modulow pozostaja poza
    regula — to granica nazwana, nie przeoczenie.
    """
    stale: set[str] = set()
    for node in getattr(tree, "body", []):
        cele: list[ast.expr] = []
        if isinstance(node, ast.Assign):
            cele = list(node.targets)
            wartosc = node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            cele = [node.target]
            wartosc = node.value
        else:
            continue
        if isinstance(wartosc, ast.UnaryOp) and isinstance(wartosc.op, ast.USub | ast.UAdd):
            wartosc = wartosc.operand
        if not isinstance(wartosc, ast.Constant):
            continue
        if not isinstance(wartosc.value, int | float) or isinstance(wartosc.value, bool):
            continue
        for cel in cele:
            if isinstance(cel, ast.Name):
                stale.add(cel.id)
    return stale


def is_numeric(expr: ast.expr, stale: set[str] | None = None) -> bool:
    """Czy wyrazenie NA PEWNO daje liczbe wchodzaca dalej do arytmetyki JAKO POMIAR.

    `None` (uczciwy meldunek braku), napis, wartosc logiczna oraz jawna NIE-LICZBA
    (`float("nan")`) sa POZA regula — to granica, ktora odsiewa dwie trzecie
    falszywych alarmow (patrz docstring modulu).
    """
    if is_not_a_number_literal(expr):
        return False
    if isinstance(expr, ast.Constant):
        return isinstance(expr.value, int | float) and not isinstance(expr.value, bool)
    if isinstance(expr, ast.Name):
        # Stala modulu zwiazana z literalem liczbowym — patrz
        # `numeric_module_constants`: nadanie liczbie nazwy nie moze wygaszac reguly.
        return expr.id in (stale or set())
    if isinstance(expr, ast.UnaryOp) and isinstance(expr.op, ast.USub | ast.UAdd):
        return is_numeric(expr.operand, stale)
    if isinstance(expr, ast.BinOp):
        return is_numeric(expr.left, stale) or is_numeric(expr.right, stale)
    if isinstance(expr, ast.Call) and isinstance(expr.func, ast.Name):
        return expr.func.id in _NUMERIC_CALLS
    if isinstance(expr, ast.IfExp):
        return is_numeric(expr.body, stale) or is_numeric(expr.orelse, stale)
    return False


def collect_findings(tree: ast.AST, fields: set[str]) -> list[tuple[str, int]]:
    """Lista (`<forma>:<cel>`, wiersz) dla jednego pliku."""
    findings: list[tuple[str, int]] = []
    stale = numeric_module_constants(tree)
    for node in ast.walk(tree):
        # A. dana or <liczba>
        if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
            for index, value in enumerate(node.values[:-1]):
                target = reads_contract_field(value, fields, stale)
                if target is not None and is_numeric(node.values[index + 1], stale):
                    findings.append((f"A:or:{target}", node.lineno))
        # B. ... dana ... if <warunek> else <liczba>
        if isinstance(node, ast.IfExp):
            target = nested_contract_field(node.body, fields, stale)
            if (
                target is not None
                and is_numeric(node.orelse, stale)
                and nested_contract_field(node.orelse, fields, stale) is None
            ):
                findings.append((f"B:ifexp:{target}", node.lineno))
        # C. getattr(obj, "dana", <liczba>)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id == "getattr" and len(node.args) == 3:
                key = node.args[1].value if isinstance(node.args[1], ast.Constant) else None
                if isinstance(key, str) and key in fields and is_numeric(node.args[2], stale):
                    findings.append((f"C:getattr:{key}", node.lineno))
    return findings


def apply_ratchet(
    rel: str,
    findings: list[tuple[str, int]],
    budget: dict[str, int],
) -> list[str]:
    """Porownaj znaleziska pliku z budzetem — W OBIE STRONY."""
    violations: list[str] = []
    counted = Counter(signature for signature, _ in findings)

    for signature in sorted(set(counted) | set(budget)):
        found = counted.get(signature, 0)
        allowed = budget.get(signature, 0)
        if found == allowed:
            continue
        lines = ", ".join(
            str(ln) for sig, ln in sorted(findings, key=lambda f: f[1]) if sig == signature
        )
        if found > allowed:
            violations.append(
                f"  {rel}: zapadka zastanych zastepnikow '{signature}': budzet {allowed}, "
                f"znaleziono {found} (wiersze: {lines or 'brak'}). NOWE podstawienie liczby "
                "za nieobecna dana wejsciowa jest naruszeniem — pomin element albo zamelduj "
                "brak (`None` + powod), tak jak `_grid_source_shunt_admittance`."
            )
        else:
            violations.append(
                f"  {rel}: zapadka zastanych zastepnikow '{signature}': budzet {allowed}, "
                f"znaleziono {found} (wiersze: {lines or 'brak'}). Dlug ZMALAL — obniz budzet "
                "w ZASTANE_ZASTEPNIKI, inaczej poprawa nie zostaje utrwalona."
            )
    return violations


def check_file(path: Path, fields: set[str]) -> list[str]:
    """Naruszenia w jednym pliku (pusta lista = plik czysty)."""
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        print(f"WARN: {path}:{exc.lineno}: nie da sie sparsowac ({exc.msg})")
        return []

    rel = path.relative_to(BACKEND_SRC).as_posix()
    findings = collect_findings(tree, fields)
    budget = ZASTANE_ZASTEPNIKI.get(rel)
    if budget is not None:
        return apply_ratchet(rel, findings, budget)

    return [
        f"  {rel}:{lineno}: podstawienie liczby za nieobecna dana wejsciowa "
        f"('{signature}'). Gdy danej nie ma, POMIN element albo zamelduj brak "
        "(`None` + powod po polsku) — nie podstawiaj liczby, ktora wejdzie do "
        "arytmetyki jako pomiar."
        for signature, lineno in findings
    ]


def main() -> int:
    if not BACKEND_SRC.is_dir():
        print(f"FAIL: brak korzenia skanowania: {BACKEND_SRC}")
        print("Bramka, ktora nie dosiega swojego korzenia, to falszywa zielen.")
        return 1

    fields = contract_fields()
    if not fields:
        print("FAIL: zbior pol kontraktow wejsciowych jest PUSTY.")
        print("Cala regula stoi na tym zbiorze — bez niego bramka milczalaby o wszystkim.")
        return 1

    violations: list[str] = []
    scanned = 0
    for root_name in SCAN_ROOTS:
        root = BACKEND_SRC / root_name
        if not root.is_dir():
            print(f"FAIL: korzen skanowania '{root_name}' nie istnieje pod {BACKEND_SRC}.")
            print("Zmiana ukladu katalogow nie moze po cichu wylaczyc zakresu bramki.")
            return 1
        for path in sorted(root.rglob("*.py")):
            scanned += 1
            violations.extend(check_file(path, fields))

    print(f"Pol kontraktow wejsciowych: {len(fields)}.")
    print(f"Przeskanowano {scanned} plikow w zakresie: {', '.join(SCAN_ROOTS)}.")

    if scanned == 0:
        print("FAIL: PUSTY SKAN — 0 plikow. Bramka, ktora nic nie obejrzala, nic nie dowodzi.")
        return 1

    # Wpis zapadki wskazujacy plik, ktorego nie ma, to martwy budzet: rejestr
    # moze tylko malec, wiec nieaktualny wpis jest bledem, nie ozdoba.
    martwe = [rel for rel in ZASTANE_ZASTEPNIKI if not (BACKEND_SRC / rel).is_file()]
    if martwe:
        print("FAIL: zapadka wskazuje pliki, ktorych nie ma:")
        for rel in sorted(martwe):
            print(f"  {rel} — zdejmij wpis z ZASTANE_ZASTEPNIKI.")
        return 1

    if violations:
        print("FAIL: podstawianie liczb za nieobecne dane wejsciowe:")
        for violation in sorted(violations):
            print(violation)
        print(f"\n{len(violations)} naruszen.")
        return 1

    print("PASS: zadnego nowego podstawienia liczby za nieobecna dana wejsciowa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
