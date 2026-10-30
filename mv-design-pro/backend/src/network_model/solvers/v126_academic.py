from __future__ import annotations

import cmath
import hashlib
import json
import math
import random
from dataclasses import dataclass
from itertools import combinations
from typing import Any

import numpy as np
from network_model.core.uziemienie import (
    ETYKIETA_PL_WARIANTU_UZIEMIENIA,
    TrybDoziemienia,
    tryb_doziemienia_wariantu,
)
from network_model.odmowa_danych import (
    RODZAJ_ELEMENT,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)
from network_model.solvers.doziemienie_sn import (
    ETYKIETA_PL_TRYBU,
    DaneDoziemienia,
    PunktNeutralnyDoziemienia,
    WynikDoziemienia,
    oblicz_doziemienie,
)
from network_model.solvers.short_circuit_core import compute_post_fault_quantities
from solver_input.v126_contracts import (
    PROJEKT_UZIEMIENIA_WARIANTU,
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126PrzypadekPraduUziomowegoInput,
    V126PunktNeutralnySnInput,
    V126RezystorSnInput,
    V126SiecSnInput,
    brak_uziemienia_sn,
)

JsonDict = dict[str, Any]

#: Kod odmowy wejścia (rekord strukturalny `RekordOdmowy`): bilans strat bez P0 transformatora.
KOD_TRANSFORMATOR_BEZ_STRAT_JALOWYCH = "v126.transformator_bez_strat_jalowych"
#: Kod odmowy wejścia: karta przekształtnika bez pól obowiązkowych modelu Z_conv(f) (SSCI).
KOD_SSCI_BRAK_POL_KARTY = "v126.ssci_brak_pol_karty_falownika"
#: Pola obowiązkowe karty przekształtnika dla Z_conv(f) → opis dla projektanta. JEDNO źródło
#: predykatu braku (`_brakujace_pola_karty_zconv`) dla odmowy modelu i wyniku „dane
#: niekompletne" analizy SSCI (partia integracji 10: treść bez kluczy pól kontraktu).
POLA_KARTY_ZCONV: tuple[tuple[str, str], ...] = (
    ("current_loop_bandwidth_hz", "pasmo pętli prądowej"),
    ("pll_bandwidth_hz", "pasmo pętli synchronizacji fazowej (PLL)"),
    ("filter_l_pu", "indukcyjność filtra wyjściowego"),
)

# 1.1 (V126-JEZYK, 2026-08-07): ślad WHITE BOX niesie DODATKOWO polską postać
# wyniku kroku z jednostką (`result_pl`), a teksty podstawień i sprawdzeń jednostek
# przepisano na język inżynierski z pełną polszczyzną. Kontrakt maszynowy (`result`,
# `formula`, `data`) NIETKNIĘTY — zmiana jest addytywna; odcisk przebiegu zmienia się
# raz, bo ślad jest częścią wyniku, więc wersja solvera idzie w górę razem z nim.
# 1.2 (karta QU-FABRYKACJA, 2026-08-08): solver przestał podstawiać współczynniki
# w miejsce danych wejściowych. `_voltage_stability` nie wyznacza już żadnej
# wielkości (wszystkie stały na zmyślonej mocy zwarciowej węzła i na zdolności
# wytwórczej mocy biernej, której kontrakt nie niesie) — pola kontraktu zostają,
# wartością jest jawny brak z powodem. `_z_conv_components` bierze częstotliwość
# podstawową z kontraktu zamiast z zaszytego 50 Hz. Odciski przebiegów obu
# rodzajów zmieniają się RAZ, razem z wersją.
# 1.3 (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, warunek odbioru 2026-10-29): sposób pracy punktu
# neutralnego rozstrzyga model doziemienia — projekt dławika i rezystora oraz detekcja
# doziemień liczą prąd solverem ``doziemienie_sn`` (I_C, prąd resztkowy z I_w, I_R z Z_0,TU
# albo Z_T0), sprawdzenie cieplne rezystora — prądem największym IEC 60909-0, koordynacja
# izolacji — przepięciem dorywczym k·U_m/√3 z k trybu (sieć z rezystorem nie jest już
# „uziemiona skutecznie”), zdolność ogranicznika z karty nie udaje przepięcia sieci.
# 1.4 (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek 3): solver przestał wystawiać werdykty —
# statusy „zgodny/spełniony/bezpieczny/dostrojony/PASS" i ich flagi logiczne zeszły z wyniku,
# a ocenę kryteriów budują rekordy werdyktu wyjaśnialnego na granicy wyniku
# (`application/analyses/v126_oceny.py`). Rozruch silnika: wskaźnik cieplny t_r/t_utyku (czas
# utyku jest dopuszczalny przy prądzie zablokowanego wirnika — dawny mnożnik k_LR² liczył prąd
# dwa razy), prąd znamionowy z cos φ i η silnika (wartości robocze rejestru maszyn zamiast
# zaszytego 0,9), impedancja źródła z Z_Q modelu, bez wartości 0,1 + j0,4 Ω z powietrza. Uziom
# bez danych — nazwany brak zamiast uziomu domyślnego. Detekcja doziemień: metoda złożona
# (51N+67N, 51N/50N) wymaga swoich funkcji w przekaźniku. Niezawodność: dane przyjęte
# intensywności uszkodzeń, czasu odnowy i MAIFI. Ziarno losowania przepustowości — odcisk pól,
# które analiza czyta, nie całego modelu.
# 1.5 (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5, decyzja architekta wariant (a)):
# impedancja zastępcza sieci w szynie przepustowości i rozruchu silnika przychodzi z wejścia
# (`V126BusInput.thevenin_*`, most liczy ją kanonicznym budowniczym sieci zwarciowej IEC 60909
# z przekładnią i K_T) — szyny zasilane przez transformator (SN za transformatorem WN/SN, nN)
# mają wynik zamiast braku; własna macierz omowa V12.6 bez przekładni nie służy już tym
# analizom. Kryterium prądowe przepustowości pomija gałęzie otwarte. Uziom: prąd uziomowy
# I_E z modelu (EN 50522 tab. 1 wg sposobu pracy punktu neutralnego) albo wartość projektanta.
V126_SOLVER_VERSION = "v126-academic-whitebox-1.5"


#: Typ projektu uziemienia punktu neutralnego (słownik `PROJEKT_UZIEMIENIA_WARIANTU`) po polsku —
#: tekst podstawienia śladu White Box (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).
_PROJEKT_UZIEMIENIA_PL: dict[str, str] = {
    "petersen_coil": "projekt dławika gaszącego",
    "resistor_grounded": "projekt rezystora uziemiającego",
}


#: Podstawa wyboru prądu uziomowego (prąd odprowadzany przez uziom stacji przed redukcją).
PODSTAWA_PRADU_UZIOMOWEGO_PL = (
    "EN 50522:2010 tab. 1 — prąd miarodajny dla napięć rażeniowych uziomu wg sposobu pracy "
    "punktu neutralnego; $I_E = r\\,I_F$; uziom wymiaruje się na przypadek najniekorzystniejszy"
)


@dataclass(frozen=True)
class WielkoscPraduUziomowego:
    """Prąd miarodajny jednego przypadku zwarcia doziemnego stacji (EN 50522:2010 tab. 1).

    ``prad_a`` — I_F przed redukcją [A] albo ``None`` (``brak_pl`` nazywa przyczynę z modelu);
    ``symbol`` — identyfikator wielkości (klucz wiersza), ``symbol_latex`` — jej zapis LaTeX
    (ekran składa go KaTeX-em), ``opis_pl`` — wiersz tablicy z symbolami jako `$…$`;
    ``dane_przyjete`` — dane przyjęte TEJ wielkości (doziemienia sieci albo I″k1 rdzenia
    IEC 60909)."""

    prad_a: float | None
    symbol: str
    symbol_latex: str
    opis_pl: str
    brak_pl: str | None
    dane_przyjete: tuple[JsonDict, ...]


def wielkosc_pradu_uziomowego(
    przypadek: V126PrzypadekPraduUziomowegoInput,
) -> WielkoscPraduUziomowego:
    """Wielkość miarodajna EN 50522:2010 tab. 1 przypadku — JEDNA reguła solvera i gotowości.

    Sieć WN stacji oraz sieć SN uziemiona przez rezystor albo bezpośrednio (mała impedancja):
    I″k1 rdzenia IEC 60909. Sieć SN izolowana: I_C. Sieć SN skompensowana: I_res, a gdy dławik
    gaszący stoi w tej stacji — √(I_L² + I_res²) (przez uziom płynie także prąd dławika).
    """
    dane_doz = tuple(d.model_dump(mode="json") for d in przypadek.dane_przyjete_doziemienia)
    dane_ikss = tuple(d.model_dump(mode="json") for d in przypadek.dane_przyjete_ikss)
    if przypadek.strona == "WN" or przypadek.tryb in ("rezystor", "bezposrednie"):
        opis = (
            "sieć WN uziemiona przez małą impedancję — $I_E = r\\,I''_{k1}$; pełny $I''_{k1}$ "
            "bez odjęcia prądu powracającego przez uziemione punkty neutralne transformatorów "
            "stacji (zapas)"
            if przypadek.strona == "WN"
            else "sieć SN uziemiona przez małą impedancję (rezystor albo bezpośrednio) — "
            "$I_E = r\\,I''_{k1}$"
        )
        return WielkoscPraduUziomowego(
            prad_a=przypadek.ikss_a,
            symbol="I″k1",
            symbol_latex="I''_{k1}",
            opis_pl=opis,
            brak_pl=None if przypadek.ikss_a is not None else przypadek.brak_ikss_pl,
            dane_przyjete=dane_ikss,
        )
    brak = None if przypadek.prad_doziemienia_a is not None else przypadek.brak_doziemienia_pl
    if przypadek.tryb == "izolowany":
        return WielkoscPraduUziomowego(
            prad_a=przypadek.prad_doziemienia_a,
            symbol="I_C",
            symbol_latex="I_C",
            opis_pl="sieć SN z izolowanym punktem neutralnym — $I_E = r\\,I_C$",
            brak_pl=brak,
            dane_przyjete=dane_doz,
        )
    if przypadek.tryb == "kompensowany" and przypadek.dlawik_w_stacji:
        prad = (
            None
            if przypadek.prad_doziemienia_a is None or przypadek.i_l_a is None
            else math.hypot(przypadek.i_l_a, przypadek.prad_doziemienia_a)
        )
        return WielkoscPraduUziomowego(
            prad_a=prad,
            symbol="√(I_L² + I_res²)",
            symbol_latex="\\sqrt{I_L^2 + I_{\\mathrm{res}}^2}",
            opis_pl=(
                "sieć SN skompensowana, dławik gaszący w tej stacji — "
                "$I_E = r\\sqrt{I_L^2 + I_{\\mathrm{res}}^2}$"
            ),
            brak_pl=(
                None if prad is not None else brak or "Prąd dławików sieci nie został wyznaczony."
            ),
            dane_przyjete=dane_doz,
        )
    return WielkoscPraduUziomowego(
        prad_a=przypadek.prad_doziemienia_a,
        symbol="I_res",
        symbol_latex="I_{\\mathrm{res}}",
        opis_pl="sieć SN skompensowana, dławik gaszący poza tą stacją — $I_E = r\\,I_{\\mathrm{res}}$",
        brak_pl=brak,
        dane_przyjete=dane_doz,
    )


def _brakujace_pola_karty_zconv(converter: Any) -> list[str]:
    """Klucze pól obowiązkowych karty przekształtnika, których brak (kolejność kontraktu)."""
    return [pole for pole, _opis in POLA_KARTY_ZCONV if getattr(converter, pole) is None]


def _odmowa_brak_pol_karty_zconv(converter: Any) -> OdmowaWejsciaRdzenia:
    """Odmowa strukturalna: kod, treść bez identyfikatora i kluczy, odwołanie do przekształtnika
    (element migawki ENM — zdanie z nazwą składa `enm.zdania_odmow_rdzenia`)."""
    brakujace = _brakujace_pola_karty_zconv(converter)
    opisy = [opis for pole, opis in POLA_KARTY_ZCONV if pole in brakujace]
    return OdmowaWejsciaRdzenia(
        [
            RekordOdmowy(
                KOD_SSCI_BRAK_POL_KARTY,
                "Model impedancji przekształtnika w funkcji częstotliwości wymaga pól karty "
                "przekształtnika; "
                f"brakuje: {', '.join(opisy)}.",
                (OdwolanieElementu(RODZAJ_ELEMENT, converter.ref),),
            )
        ]
    )


def _canonical_payload(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(payload: Any) -> str:
    return hashlib.sha256(_canonical_payload(payload).encode("utf-8")).hexdigest()


def _round(value: float, digits: int = 6) -> float:
    if not math.isfinite(value):
        return value
    return round(value, digits)


def _metoda_detekcji_wariantu(wariant: str, *, nadazna: bool) -> str:
    """Kategoria sieci dla wyboru metody detekcji doziemień z wariantu uziemienia sekcji SN
    (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4) — przez JEDNĄ tablicę trybów doziemienia
    (`network_model.core.uziemienie.tryb_doziemienia_wariantu`, ta sama co wiersz zwarcia
    jednofazowego i projekt uziemienia).

    Sieć skompensowana (dławik, także z AWSC — Z.13) z regulacją nadążną dławika (strojenie do
    rezonansu) → „petersen_tuned"; bez regulacji nadążnej → „petersen_detuned"; rezystor
    i dławik‖rezystor (Z.15, Z.14 — składowa czynna prądu doziemienia) → „resistor"; punkt
    neutralny bez impedancji → „solid"; izolowany → „isolated".
    """
    tryb = tryb_doziemienia_wariantu(wariant)
    if tryb == "izolowany":
        return "isolated"
    if tryb == "kompensowany":
        return "petersen_tuned" if nadazna else "petersen_detuned"
    if tryb == "rezystor":
        return "resistor"
    return "solid"


def _odmowa_uziemienia_sn(trace: TraceBuilder, krok: str, powod: str) -> JsonDict:
    trace.add(
        krok,
        "Analiza wymaga sposobu uziemienia punktu neutralnego sieci SN z modelu",
        {"uziemienie_sn": None},
        powod,
        {"status": "dane niekompletne"},
        "Brak opisu modelu — wartości zastępczej się nie podstawia.",
        result_pl="Brak sposobu uziemienia sieci SN w modelu",
    )
    return {
        "status": "dane niekompletne",
        "message_pl": powod,
        "missing_fields": ["uziemienie_sn"],
        "sanity": _sanity_block([], has_inputs=False),
    }


def _zestawienie_sieci(
    scheme: str, sieci: list[V126SiecSnInput], wyniki: list[JsonDict]
) -> JsonDict:
    """Wynik projektu uziemienia modelu z KILKU galwanicznie połączonych sieci SN.

    Każda sieć ma własny wiersz z pełnym wynikiem (`sieci`) — agregat nie zastępuje wyników
    składowych (kontrakt werdyktu wyjaśnialnego). Blok wiarygodności: naruszenie w którejkolwiek
    sieci → „poza zakresem wiarygodności"; sieć bez danych → „dane niekompletne"; inaczej
    „zweryfikowany". Status całości „dane niekompletne" WYŁĄCZNIE, gdy żadnej sieci nie
    policzono — wynik policzony dla jednej sieci nie znika za brakiem danych drugiej."""
    wiersze: list[JsonDict] = [
        {"szyna_ref": siec.szyna_ref, "nazwa_pl": siec.nazwa_pl, **wynik}
        for siec, wynik in zip(sieci, wyniki, strict=True)
    ]
    bloki = [w["sanity"] for w in wyniki]
    naruszenia = [
        {**n, "detail_pl": f"{siec.nazwa_pl}: {n['detail_pl']}"}
        for siec, blok in zip(sieci, bloki, strict=True)
        for n in blok["violations"]
    ]
    niekompletne = [b for b in bloki if b["status"] == "dane niekompletne"]
    sanity: JsonDict = {
        "status": (
            "poza zakresem wiarygodności"
            if naruszenia
            else ("dane niekompletne" if niekompletne else "zweryfikowany")
        ),
        "violations": naruszenia,
        "checks_total": sum(b["checks_total"] for b in bloki),
        "checks_passed": sum(b["checks_passed"] for b in bloki),
    }
    wynik: JsonDict = {
        "neutral_earthing_type": scheme,
        "network_count": len(sieci),
        "sieci": wiersze,
        "sanity": sanity,
    }
    if len(niekompletne) == len(bloki):
        wynik["status"] = "dane niekompletne"
        wynik["message_pl"] = " ".join(str(w.get("message_pl", "")) for w in wyniki).strip()
    return wynik


# D-14 (K-08): jednolita warstwa sanity-bounds dla analiz V12.6. Status wg §6.1:
# "zweryfikowany" (w zakresie) / "poza zakresem wiarygodności" (przekroczona granica
# fizyczna) / "dane niekompletne" (brak wejść do oceny). NIE liczy fizyki — ocenia
# wiarygodność już policzonych wyników, blokuje absurdy przed pakietem OSD (DEF-01).
def _sanity_block(
    checks: list[tuple[str, bool, str]],
    *,
    has_inputs: bool = True,
) -> JsonDict:
    """checks: lista (nazwa, w_zakresie, opis_pl). Zwraca blok wiarygodności."""
    if not has_inputs:
        return {
            "status": "dane niekompletne",
            "violations": [],
            "checks_total": len(checks),
            "checks_passed": 0,
        }
    violations = [{"check": name, "detail_pl": detail} for name, ok, detail in checks if not ok]
    return {
        "status": "zweryfikowany" if not violations else "poza zakresem wiarygodności",
        "violations": violations,
        "checks_total": len(checks),
        "checks_passed": sum(1 for _, ok, _ in checks if ok),
    }


def _finite(*values: float) -> bool:
    """True gdy wszystkie wartości są liczbami skończonymi (nie NaN/inf)."""
    return all(isinstance(v, int | float) and math.isfinite(v) for v in values)


#: Podział impedancji z mocy zwarciowej szyny Z = U_n²/S_k na R = 0,15·Z i X = 0,99·Z —
#: wartość robocza wejścia BEZ impedancji Z_Q modelu (wejście zbudowane poza mostem ENM);
#: most ENM podaje Z_Q z `enm.mapping.impedancja_zrodla_sieciowego` (IEC 60909-0 eq. 6).
PODZIAL_R_Z_ROBOCZY = 0.15
PODZIAL_X_Z_ROBOCZY = 0.99


def _z_zrodla_szyny(bus: Any) -> tuple[complex, bool] | None:
    """Impedancja zasilania systemowego szyny przy 50 Hz i znacznik wartości roboczej.

    Z_Q modelu (``source_r_ohm``/``source_x_ohm``) — dana modelu; bez niej moc zwarciowa
    szyny z podziałem roboczym (``True`` — dana przyjęta); bez obu — ``None`` (szyna bez
    źródła sieciowego, żadnej liczby zastępczej)."""
    if bus.source_r_ohm is not None and bus.source_x_ohm is not None:
        return complex(bus.source_r_ohm, bus.source_x_ohm), False
    if bus.fault_level_mva:
        z = bus.nominal_kv**2 / bus.fault_level_mva
        return complex(PODZIAL_R_Z_ROBOCZY * z, PODZIAL_X_Z_ROBOCZY * z), True
    return None


#: Polskie nazwy parametrów obwodu napięcia powrotnego (komunikat braku, ślad WHITE BOX).
_NAZWY_PARAMETROW_TRV: dict[str, str] = {
    "breaker_rated_voltage_kv": "napięcie znamionowe wyłącznika",
    "trv_natural_frequency_hz": "częstotliwość własna obwodu napięcia powrotnego",
    "trv_tau_s": "stała czasowa τ",
}


def _parametr_dodatni(model: V126AcademicInput, klucz: str) -> float | None:
    """Parametr biegu jako liczba dodatnia; brak, wartość nieliczbowa albo niedodatnia —
    ``None`` (nazwany brak u wołającego, bez wartości zastępczej)."""
    wartosc = model.parameters.get(klucz)
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    liczba = float(wartosc)
    return liczba if math.isfinite(liczba) and liczba > 0.0 else None


def _czas_dopuszczalny_rezystora_s(
    i_k_a: float, z_petli_ohm: complex, u_n_v: float, i_n2_t_n: float
) -> float:
    """Czas t_dop [s], po którym całka Joule'a prądu rezystora I_th(t)²·t osiąga I_n²·t_n.

    I_th(t)²·t = I_k²·(m(t) + n)·t rośnie z t (składnik m·t dąży do stałej energii składowej
    nieokresowej), więc pierwiastek jest jeden; górna granica I_n²·t_n/I_k² (m ≥ 0).
    Bisekcja o stałej liczbie kroków — wynik deterministyczny (ten sam bit dla tego samego
    wejścia), dokładność względna 2⁻⁶⁰. m(t) z jedynego źródła I_th
    (`compute_post_fault_quantities`, IEC 60909-0 §12)."""
    gorna = i_n2_t_n / i_k_a**2
    dolna = 0.0
    for _ in range(60):
        srodek = 0.5 * (dolna + gorna)
        ith = compute_post_fault_quantities(
            ikss=i_k_a, un_v=u_n_v, z_equiv=z_petli_ohm, tk_s=srodek
        ).ith_a
        if ith**2 * srodek <= i_n2_t_n:
            dolna = srodek
        else:
            gorna = srodek
    return dolna


class TraceBuilder:
    def __init__(self, analysis_type: V126AnalysisType) -> None:
        self.analysis_type = analysis_type.value
        self.steps: list[JsonDict] = []

    def add(
        self,
        key: str,
        formula: str,
        data: JsonDict,
        substitution: str,
        result: JsonDict,
        unit_check: str,
        *,
        result_pl: str,
    ) -> None:
        """Dopisuje krok śladu WHITE BOX.

        `result` pozostaje słownikiem kontraktu (maszynowa postać wyniku kroku,
        nietknięta — czytają ją pakiet dowodowy i raport). `result_pl` to
        DODANE pole prezentacyjne (V126-JEZYK): wynik kroku jako liczba
        Z JEDNOSTKĄ, po polsku. Powód: ekran projektanta pokazywał w kolumnie
        „Wynik" surowy zapis `{"smallest_eigenvalue":0.998667}` — ocena
        właściciela 0/10 z 2026-08-07. Pole jest WYMAGANE (argument nazwany bez
        wartości domyślnej), więc nowy krok śladu nie może powstać bez polskiej
        postaci wyniku — to zamyka klasę, a nie jedną instancję.
        """
        self.steps.append(
            {
                "step": len(self.steps) + 1,
                "key": key,
                "formula": formula,
                "data": data,
                "substitution": substitution,
                "result": result,
                "result_pl": result_pl,
                "unit_check": unit_check,
                "proof_ref": f"proof:v126:{self.analysis_type}:{key}",
                "proof_status": "complete",
                "reporting_status": "reportable",
            }
        )


#: Poziomy izolacji znormalizowane IEC 60071-1:2019 tab. 2 (zakres I): U_m [kV] →
#: (znamionowe napięcie wytrzymywane udarowe piorunowe LIWL/BIL [kV], krótkotrwałe 50 Hz
#: [kV]). Dla U_m ≤ 36 kV — wyższa z dwóch klasycznych wartości LIWL (lista 2); 52 i 72,5 kV
#: mają jedną wartość; 123 kV — 550/230 kV (poziom sieci 110 kV). JEDNO źródło dla solvera
#: i katalogu `GET /api/catalog/v126/insulation-levels`. U_m powyżej tabeli — brak podstawy
#: poziomu izolacji (miejsce bez marginesu, nazwane), nie wartość ostatniego wiersza.
POZIOMY_IZOLACJI_IEC60071: tuple[tuple[float, float, float], ...] = (
    (3.6, 40.0, 10.0),
    (7.2, 60.0, 20.0),
    (12.0, 75.0, 28.0),
    (17.5, 95.0, 38.0),
    (24.0, 125.0, 50.0),
    (36.0, 170.0, 70.0),
    (52.0, 250.0, 95.0),
    (72.5, 325.0, 140.0),
    (123.0, 550.0, 230.0),
)

#: Współczynnik zwarcia doziemnego k — wartość robocza trybu, gdy solver doziemienia sieci
#: nie podaje k (szyna poza siecią SN modelu, sieć bez danych do doziemienia): sieć
#: izolowana, kompensowana i z rezystorem ograniczającym prąd to sieci nieskutecznie
#: uziemione — doziemienie metaliczne podnosi fazy zdrowe do napięcia międzyfazowego
#: (k = √3); sieć uziemiona bezpośrednio — granica sieci skutecznie uziemionej k = 1,4
#: (IEC 60071-1, definicja sieci skutecznie uziemionej).
K_ROBOCZY_TRYBU: dict[str, tuple[float, str]] = {
    "izolowany": (
        math.sqrt(3.0),
        "k = √3 — sieć o izolowanym punkcie neutralnym, doziemienie metaliczne "
        "(IEC 60071-1: sieć nieskutecznie uziemiona)",
    ),
    "kompensowany": (
        math.sqrt(3.0),
        "k = √3 — sieć kompensowana, doziemienie metaliczne (IEC 60071-1: sieć "
        "nieskutecznie uziemiona)",
    ),
    "rezystor": (
        math.sqrt(3.0),
        "k = √3 — sieć z rezystorem ograniczającym prąd doziemny jest siecią nieskutecznie "
        "uziemioną (IEC 60071-1: k > 1,4); wartość górna doziemienia metalicznego",
    ),
    "bezposrednie": (
        1.4,
        "k = 1,4 — granica sieci skutecznie uziemionej (IEC 60071-1)",
    ),
}

#: Dobór wstępny ogranicznika bez karty katalogowej — stosunki parametrów ograniczników ZnO
#: SN katalogu programu (`mv_surge_arrester_catalog`; test przypina je do katalogu):
#: U_res(10 kA)/U_c — NAJWIĘKSZY w katalogu (zachowawczo: mniejszy margines ochrony),
#: TOV(10 s)/U_c — NAJMNIEJSZY (zachowawczo), U_r/U_c — największy.
U_RES_DO_U_C_ROBOCZY = 4.0
TOV_10S_DO_U_C_ROBOCZY = 1.4
U_R_DO_U_C_ROBOCZY = 1.2

#: Czas wyłączenia doziemienia, do którego porównuje się wytrzymałość TOV 10 s ogranicznika
#: w sieci z rezystorem i uziemionej bezpośrednio [s] (założenie: zabezpieczenie ziemnozwarciowe
#: wyłącza doziemienie w czasie ≤ 10 s; dłuższy czas wymaga krzywej TOV(t) producenta).
CZAS_TOV_ZALOZONY_S = 10.0

TRYBY_DOZIEMIENIA_DLUGOTRWALEGO = frozenset({"izolowany", "kompensowany"})

#: Funkcje przekaźnika, z których składa się metoda złożona detekcji doziemień: 51N+67N —
#: nadprądowa zwłoczna i kierunkowa ziemnozwarciowa razem, 51N/50N — nadprądowa zwłoczna
#: i bezzwłoczna (sieć uziemiona bezpośrednio). Metoda prosta wymaga samej siebie.
SKLADNIKI_METODY_DETEKCJI: dict[str, tuple[str, ...]] = {
    "51N+67N": ("51N", "67N"),
    "51N/50N": ("51N", "50N"),
}

#: Słownik funkcji detekcji doziemień przekaźnika, które projektant wskazuje w wyposażeniu
#: (`relay_methods`): metody proste i funkcje składowe metod złożonych — jedno źródło dla
#: formularza (`ui2/wyniki/akademickie/parametry.ts`) i nazw polskich (`v126_wzory`), parytet
#: pilnowany testem.
METODY_DETEKCJI_KOMPLET: tuple[str, ...] = (
    "wattmetric",
    "admittance",
    "transient_directional",
    "fifth_harmonic",
    "51N",
    "67N",
    "50N",
)


def _dana_przyjeta_izolacji(
    nazwa_pl: str, wartosc: float, jednostka: str, powod_pl: str
) -> JsonDict:
    return {
        "nazwa_pl": nazwa_pl,
        "wartosc": {"wartosc": _round(wartosc, 4), "jednostka": jednostka},
        "powod_pl": powod_pl,
        "jakosc": "ESTIMATED",
    }


def _poziom_izolacji(u_m_kv: float) -> tuple[float, float] | None:
    return next(
        ((bil, w) for um, bil, w in POZIOMY_IZOLACJI_IEC60071 if u_m_kv <= um + 1e-9),
        None,
    )


def _wiersz_izolacji(item: Any) -> JsonDict:
    """Wiersz koordynacji izolacji jednego miejsca zainstalowania (``_insulation``)."""
    u_m = float(item.u_m_kv)
    tryb = str(item.network_neutral)
    dane: list[JsonDict] = []
    if item.earth_fault_factor is not None:
        k = float(item.earth_fault_factor)
        zrodlo_k = item.earth_fault_factor_zrodlo_pl or "solver doziemienia sieci"
    else:
        k, zrodlo_k = K_ROBOCZY_TRYBU[tryb]
        dane.append(
            _dana_przyjeta_izolacji(
                "Współczynnik zwarcia doziemnego k",
                k,
                "1",
                f"{zrodlo_k}. Wynik doziemienia sieci szyny nie jest dostępny w modelu.",
            )
        )
    u_tov = k * u_m / math.sqrt(3.0)
    dlugotrwale = tryb in TRYBY_DOZIEMIENIA_DLUGOTRWALEGO
    u_c_wymagane = u_tov if dlugotrwale else u_m / math.sqrt(3.0)
    if item.arrester_mcov_kv is not None:
        mcov = float(item.arrester_mcov_kv)
    else:
        # Dobór wstępny spełnia OBA kryteria napięciowe tym samym stosunkiem, którym liczy się
        # wytrzymałość TOV doboru wstępnego (jedno źródło): przy doziemieniu wyłączanym
        # U_c ≥ U_m/√3 i TOV(10 s) = 1,4·U_c ≥ U_TOV, czyli U_c ≥ U_TOV/1,4.
        mcov = u_c_wymagane if dlugotrwale else max(u_c_wymagane, u_tov / TOV_10S_DO_U_C_ROBOCZY)
        dane.append(
            _dana_przyjeta_izolacji(
                "Napięcie trwałej pracy ogranicznika (dobór wstępny)",
                mcov,
                "kV",
                "Brak karty katalogowej ogranicznika — napięcie trwałej pracy "
                + (
                    "równe wymaganemu przepięciu dorywczemu (doziemienie długotrwałe, "
                    "IEC 60099-5)."
                    if dlugotrwale
                    else "równe większej z wartości: napięcie najwyższe sieci przez √3 albo "
                    "przepięcie dorywcze przez "
                    f"{_lp(TOV_10S_DO_U_C_ROBOCZY)} — napięcie trwałej pracy i wytrzymałość na "
                    "przepięcie dorywcze 10 s doboru wstępnego (doziemienie wyłączane "
                    "samoczynnie, IEC 60099-5)."
                ),
            )
        )
    if item.arrester_rated_kv is not None:
        u_r = float(item.arrester_rated_kv)
    else:
        u_r = mcov * U_R_DO_U_C_ROBOCZY
        dane.append(
            _dana_przyjeta_izolacji(
                "Napięcie znamionowe ogranicznika (dobór wstępny)",
                u_r,
                "kV",
                f"Napięcie znamionowe równe {_lp(U_R_DO_U_C_ROBOCZY)}-krotności napięcia trwałej "
                "pracy — największy stosunek ograniczników ZnO SN katalogu programu (do "
                "potwierdzenia kartą producenta).",
            )
        )
    if item.arrester_residual_10ka_kv is not None:
        residual = float(item.arrester_residual_10ka_kv)
    else:
        residual = mcov * U_RES_DO_U_C_ROBOCZY
        dane.append(
            _dana_przyjeta_izolacji(
                "Napięcie obniżone ogranicznika przy 10 kA (dobór wstępny)",
                residual,
                "kV",
                f"Napięcie obniżone równe {_lp(U_RES_DO_U_C_ROBOCZY)}-krotności napięcia trwałej "
                "pracy — największy stosunek ograniczników ZnO SN katalogu programu, zachowawczo "
                "(do potwierdzenia kartą producenta).",
            )
        )
    if item.arrester_tov_10s_kv is not None:
        tov_cap = float(item.arrester_tov_10s_kv)
    else:
        tov_cap = mcov * TOV_10S_DO_U_C_ROBOCZY
        dane.append(
            _dana_przyjeta_izolacji(
                "Wytrzymałość ogranicznika na przepięcie dorywcze 10 s (dobór wstępny)",
                tov_cap,
                "kV",
                f"Wytrzymałość na przepięcie dorywcze 10 s równa {_lp(TOV_10S_DO_U_C_ROBOCZY)}"
                "-krotności napięcia trwałej pracy — najmniejszy stosunek ograniczników ZnO SN "
                "katalogu programu, zachowawczo (do potwierdzenia kartą producenta).",
            )
        )
    if not dlugotrwale:
        dane.append(
            _dana_przyjeta_izolacji(
                "Czas trwania przepięcia dorywczego (wyłączenie doziemienia)",
                CZAS_TOV_ZALOZONY_S,
                "s",
                "Założenie: zabezpieczenie ziemnozwarciowe wyłącza doziemienie w czasie "
                "≤ 10 s — porównanie z wytrzymałością TOV 10 s ogranicznika; dłuższy czas "
                "wymaga krzywej TOV(t) producenta.",
            )
        )
    poziom = _poziom_izolacji(u_m)
    wiersz: JsonDict = {
        "location_bus_ref": item.location_bus_ref,
        "u_m_kv": u_m,
        "network_neutral": tryb,
        "earth_fault_factor": _round(k, 6),
        "earth_fault_factor_zrodlo_pl": zrodlo_k,
        "tov_duration": "dlugotrwale" if dlugotrwale else "do_wylaczenia",
        "predicted_tov_kv": _round(u_tov, 4),
        "mcov_required_kv": _round(u_c_wymagane, 4),
        "mcov_kv": _round(mcov, 4),
        "u_rated_kv": _round(u_r, 4),
        "u_residual_at_10ka_kv": _round(residual, 4),
        "tov_10s_kv": _round(tov_cap, 4),
    }
    if poziom is None:
        wiersz.update(
            {
                "bil_protected_kv": None,
                "short_duration_50hz_kv": None,
                "bil_margin_percent": None,
                "message_pl": (
                    f"Napięcie najwyższe sieci {_lp(u_m)} kV powyżej tabeli poziomów izolacji "
                    "solvera "
                    "(IEC 60071-1 tab. 2 do 123 kV) — marginesu ochrony nie wyznaczono."
                ),
            }
        )
    else:
        bil, withstand = poziom
        margin = (bil - residual) / max(residual, 1e-9) * 100.0
        wiersz.update(
            {
                "bil_protected_kv": bil,
                "short_duration_50hz_kv": withstand,
                "bil_margin_percent": _round(margin, 3),
            }
        )
    wiersz["dane_przyjete"] = dane
    return wiersz


def _lp(wartosc: Any, wzor: str = "g") -> str:
    """Liczba w zapisie polskim (przecinek dziesiętny) do tekstów wyjaśnień izolacji."""
    return format(float(wartosc), wzor).replace(".", ",")


def _lp_tekst(wartosc: Any) -> str:
    """Wynik liczbowy w zdaniu dla projektanta (``result_pl``, uzasadnienia): przecinek
    dziesiętny, cyfry takie, jakie niesie zaokrąglona wartość wyniku; brak liczby nazwany.
    """
    if wartosc is None:
        return "nie wyznaczono"
    return str(wartosc).replace(".", ",")


#: Pola wejścia CZYTANE przez analizę zdolności przyłączeniowej — JEDNO źródło dla projekcji
#: wejścia (`V126AcademicSolver._projekcja_hostingu`, na której biegnie obliczenie) i dla
#: odcisku ziarna Monte Carlo (`_ziarno_hostingu`): pole spoza tych list nie wchodzi ani do
#: obliczenia, ani do ziarna (predykaty parami — B-01, karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).
POLA_HOSTINGU_SZYNY: tuple[str, ...] = (
    "ref",
    "nominal_kv",
    "voltage_pu",
    "load_mw",
    "thevenin_r_ohm",
    "thevenin_x_ohm",
)
POLA_HOSTINGU_GALEZI: tuple[str, ...] = (
    "ref",
    "to_bus_ref",
    "is_open",
    "ampacity_a",
)


def _pola_elementu(element: Any, nazwy: tuple[str, ...]) -> JsonDict:
    return {nazwa: getattr(element, nazwa) for nazwa in nazwy}


class V126AcademicSolver:
    def run(
        self,
        analysis_type: V126AnalysisType,
        model: V126AcademicInput,
    ) -> JsonDict:
        trace = TraceBuilder(analysis_type)
        if analysis_type == V126AnalysisType.POWER_QUALITY_HARMONICS:
            result = self._power_quality(model, trace)
        elif analysis_type == V126AnalysisType.SSCI_IMPEDANCE:
            result = self._ssci_impedance(model, trace)
        elif analysis_type == V126AnalysisType.VOLTAGE_STABILITY:
            result = self._voltage_stability(model, trace)
        elif analysis_type == V126AnalysisType.RELIABILITY_CONTINGENCY:
            result = self._reliability(model, trace)
        elif analysis_type == V126AnalysisType.EARTHING_SAFETY:
            result = self._earthing(model, trace)
        elif analysis_type == V126AnalysisType.NEUTRAL_EARTHING_DESIGN:
            result = self._neutral_earthing_design(model, trace)
        elif analysis_type == V126AnalysisType.INSULATION_COORDINATION:
            result = self._insulation(model, trace)
        elif analysis_type == V126AnalysisType.EARTH_FAULT_DETECTION:
            result = self._earth_fault_detection(model, trace)
        elif analysis_type == V126AnalysisType.TRANSIENT_TRV:
            result = self._transient(model, trace)
        elif analysis_type == V126AnalysisType.MOTOR_STARTING:
            result = self._motor_starting(model, trace)
        elif analysis_type == V126AnalysisType.HOSTING_CAPACITY:
            result = self._hosting_capacity(model, trace)
        elif analysis_type == V126AnalysisType.OPF_LOSS_LCC:
            result = self._opf_loss_lcc(model, trace)
        elif analysis_type == V126AnalysisType.BENCHMARK_VALIDATION:
            result = self._benchmark_validation(model, trace)
        elif analysis_type == V126AnalysisType.UNCERTAINTY_SENSITIVITY:
            result = self._uncertainty(model, trace)
        else:
            raise ValueError(f"Nieobsługiwany typ analizy V12.6: {analysis_type}")

        envelope = {
            "contract": "AcademicAnalysisResultV1",
            "analysis_type": analysis_type.value,
            "solver_version": V126_SOLVER_VERSION,
            "input_hash": _hash(model.model_dump(mode="json")),
            "result": result,
            "white_box_trace": trace.steps,
        }
        envelope["deterministic_hash"] = _hash(envelope)
        return envelope

    def _bus_index(self, model: V126AcademicInput) -> dict[str, int]:
        return {bus.ref: index for index, bus in enumerate(model.buses)}

    def _nominal_kv(self, model: V126AcademicInput, bus_ref: str) -> float:
        bus = next((item for item in model.buses if item.ref == bus_ref), None)
        return bus.nominal_kv if bus is not None else model.buses[0].nominal_kv

    def _branch_z_ohm(self, branch: Any) -> complex:
        return complex(
            branch.r_ohm_per_km * branch.length_km, branch.x_ohm_per_km * branch.length_km
        )

    def _indeks_wezla_elektrycznego(self, model: V126AcademicInput) -> dict[str, int]:
        """Odwzorowanie szyna → indeks WĘZŁA ELEKTRYCZNEGO (karta MOST-WEJSCIA-V126).

        Gałąź ZAMKNIĘTA o zerowej impedancji szeregowej to POŁĄCZENIE IDEALNE:
        obie szyny są tym samym węzłem elektrycznym i mają identyczny potencjał.
        Kanoniczne ujęcie w metodzie węzłowej to REDUKCJA (sklejenie) węzłów — tak
        samo robi ``AdmittanceMatrixBuilder`` dla łączników w modelu domenowym.

        PO CO TO JEST. Przed tą kartą ``_ybus`` na gałęzi o ``abs(z) == 0``
        wykonywał ``continue``, czyli po cichu ROZSPAJAŁ sieć w miejscu aparatu.
        Defekt był uśpiony wyłącznie dlatego, że most wstawiał każdemu aparatowi
        zmyśloną impedancję 0,001 Ω/km — dopiero uczciwe przeniesienie jawnego
        ``r_ohm = 0,0`` z modelu (ta sama karta) postawiłoby sieć na tej ścieżce.
        Naprawa jednego defektu nie może budzić drugiego.

        DETERMINIZM I ZGODNOŚĆ WSTECZ: reprezentantem grupy jest szyna o
        NAJMNIEJSZYM indeksie w kolejności modelu, a numeracja węzłów idzie w
        kolejności pierwszego wystąpienia reprezentanta. Gdy sieć nie ma ani
        jednego połączenia idealnego, odwzorowanie jest TOŻSAMOŚCIĄ i macierz
        wychodzi bajtowo taka sama jak przed kartą.
        """
        kolejnosc = [bus.ref for bus in model.buses]
        pozycja = {ref: idx for idx, ref in enumerate(kolejnosc)}
        rodzic = list(range(len(kolejnosc)))

        def znajdz(i: int) -> int:
            while rodzic[i] != i:
                rodzic[i] = rodzic[rodzic[i]]
                i = rodzic[i]
            return i

        for branch in model.branches:
            if branch.is_open:
                continue
            i = pozycja.get(branch.from_bus_ref)
            j = pozycja.get(branch.to_bus_ref)
            if i is None or j is None or i == j:
                continue
            if abs(self._branch_z_ohm(branch)) != 0:
                continue
            a, b = znajdz(i), znajdz(j)
            if a != b:
                # Reprezentantem zostaje MNIEJSZY indeks — jedno, deterministyczne
                # kryterium niezależne od kolejności gałęzi w modelu.
                rodzic[max(a, b)] = min(a, b)

        numer_wezla: dict[int, int] = {}
        wynik: dict[str, int] = {}
        for idx, ref in enumerate(kolejnosc):
            reprezentant = znajdz(idx)
            if reprezentant not in numer_wezla:
                numer_wezla[reprezentant] = len(numer_wezla)
            wynik[ref] = numer_wezla[reprezentant]
        return wynik

    def _ybus(self, model: V126AcademicInput, harmonic: float = 1.0) -> np.ndarray[Any, Any]:
        """Macierz admitancyjna nad WĘZŁAMI ELEKTRYCZNYMI (nie nad szynami).

        Rozmiar równa się liczbie szyn dopóki sieć nie zawiera połączeń idealnych
        (patrz :meth:`_indeks_wezla_elektrycznego`); wtedy jest o tyle mniejszy,
        ile szyn skleiły zwarte aparaty bez impedancji styku.
        """
        index = self._indeks_wezla_elektrycznego(model)
        size = len(set(index.values()))
        ybus = np.zeros((size, size), dtype=complex)
        for branch in model.branches:
            if branch.is_open:
                continue
            i = index.get(branch.from_bus_ref)
            j = index.get(branch.to_bus_ref)
            if i is None or j is None:
                continue
            z = complex(
                branch.r_ohm_per_km * branch.length_km,
                harmonic * branch.x_ohm_per_km * branch.length_km,
            )
            if abs(z) == 0 or i == j:
                # Połączenie idealne jest już uwzględnione REDUKCJĄ węzłów (oba
                # zaciski mają ten sam indeks), więc nie ma czego stemplować.
                # `continue` nie rozspaja tu niczego — w odróżnieniu od stanu
                # sprzed karty, gdzie ten sam wiersz gubił połączenie.
                continue
            y = 1 / z
            # Susceptancja NIEZNANA (`None`) to nie zero: gałąź bez danej o
            # pojemności doczepnej nie wnosi bocznika i mówi o tym wprost tam,
            # gdzie decyzja od tego zależy (ryzyko ferrorezonansu).
            b_per_km = branch.b_siemens_per_km
            shunt = 1j * harmonic * b_per_km * branch.length_km / 2 if b_per_km is not None else 0j
            ybus[i, i] += y + shunt
            ybus[j, j] += y + shunt
            ybus[i, j] -= y
            ybus[j, i] -= y
        for transformer in model.transformers:
            i = index.get(transformer.hv_bus_ref)
            j = index.get(transformer.lv_bus_ref)
            if i is None or j is None or i == j:
                continue
            z_base = (transformer.uhv_kv**2) / transformer.sn_mva
            z = complex(
                transformer.pk_kw / (1000.0 * transformer.sn_mva**2),
                transformer.uk_percent / 100 * z_base,
            )
            if abs(z) == 0:
                continue
            y = 1 / complex(z.real, harmonic * z.imag)
            ybus[i, i] += y
            ybus[j, j] += y
            ybus[i, j] -= y
            ybus[j, i] -= y
        if size:
            ybus[0, 0] += 1e6
        return ybus

    def _grid_source_shunt_admittance(
        self, model: V126AcademicInput, harmonic: float
    ) -> dict[int, complex]:
        """Frequency-dependent grid-source shunt admittance Y_src(f) per bus.

        For every bus that carries a grid source impedance (``_z_zrodla_szyny``:
        Z_Q of the model from the ENM bridge, otherwise the fault-level split as a
        stated working value), the external grid behind it is a series Thevenin
        source impedance ``Z_src(f) = R_src + j*(f/50)*X_src`` whose admittance
        ``Y_src = 1/Z_src`` is shunted to ground at that bus (the network
        reference) — the same helper feeds motor starting and hosting capacity
        (:meth:`_impedancja_zastepcza_szyny`), one truth for the grid impedance. The
        reactance scales linearly with frequency (``harmonic = f/50``); the
        resistance is held constant (skin effect is out of scope — stated
        assumption). This shunt is added ONLY on the SSCI path so the existing
        power-quality Z-scan stays byte-identical.
        """
        # Indeks WĘZŁA ELEKTRYCZNEGO — ta sama przestrzeń, co macierz `_ybus`.
        # Gdy dwie szyny sklejone połączeniem idealnym niosą własne moce zwarciowe,
        # ich boczniki sumują się na wspólnym węźle (równoległe źródła zastępcze),
        # zamiast nadpisywać się nawzajem.
        index = self._indeks_wezla_elektrycznego(model)
        shunt: dict[int, complex] = {}
        for bus in model.buses:
            zrodlo = _z_zrodla_szyny(bus)
            if zrodlo is None:
                continue
            bus_idx = index.get(bus.ref)
            if bus_idx is None:
                continue
            z_50 = zrodlo[0]
            z_src = complex(z_50.real, harmonic * z_50.imag)
            if abs(z_src) == 0:
                continue
            shunt[bus_idx] = shunt.get(bus_idx, 0j) + 1.0 / z_src
        return shunt

    def _driving_point_impedance(
        self,
        model: V126AcademicInput,
        harmonic: float,
        *,
        with_source_shunt: bool,
    ) -> np.ndarray[Any, Any]:
        """Driving-point bus-impedance diagonal at one harmonic.

        Builds the frequency-dependent ``Y_bus(f)`` via :meth:`_ybus` and inverts
        it (``Z_bus = pinv(Y_bus)``), returning the diagonal ``Z_bus[i, i]`` (the
        driving-point impedance seen at each bus). Shared by the power-quality
        Z-scan and the SSCI grid-impedance sweep.

        ``with_source_shunt`` controls whether the frequency-dependent grid-source
        shunt ``Y_src(f)`` is added at the grid buses (see
        :meth:`_grid_source_shunt_admittance`). The power-quality scan calls this
        with ``False`` (no shunt) so its output is byte-identical to before; the
        SSCI sweep calls it with ``True`` to obtain the correct system Thevenin
        impedance the converter sees.

        On the SSCI path the artificial 1e6 reference stiffening that
        :meth:`_ybus` puts on bus 0 (a numerical "infinite bus" used only to make
        the harmonic-scan matrix non-singular) is REMOVED and the physical finite
        grid Thevenin ``Y_src(f)`` is used as the grounding path instead — so the
        driving-point impedance reflects the real (finite) grid strength rather
        than a near-short. If the model carries no grid-source bus at all, a tiny
        reference is retained to keep the matrix invertible (stated fallback,
        affects only an otherwise-floating network).
        """
        ybus = self._ybus(model, harmonic)
        if with_source_shunt:
            # Undo the artificial 1e6 reference (power-quality-only stiffening) so
            # the physical grid Thevenin governs the SSCI driving-point impedance.
            if ybus.shape[0]:
                ybus[0, 0] -= 1e6
            shunts = self._grid_source_shunt_admittance(model, harmonic)
            for bus_idx, y_src in shunts.items():
                ybus[bus_idx, bus_idx] += y_src
            if not shunts and ybus.shape[0]:
                # No grid-source bus: keep a small reference to avoid singularity.
                ybus[0, 0] += 1e-6
        zbus = np.linalg.pinv(ybus)
        przekatna_wezlowa = np.diag(zbus)
        # ROZWINIĘCIE DO PORZĄDKU SZYN. Macierz stoi na węzłach elektrycznych, a
        # wołający indeksują wynik szyną (`_bus_index`). Szyny sklejone
        # połączeniem idealnym są JEDNYM węzłem, więc widzą tę samą impedancję
        # widzianą z zacisków — i to jest ścisłe, a nie przybliżenie.
        index = self._indeks_wezla_elektrycznego(model)
        return np.array([przekatna_wezlowa[index[bus.ref]] for bus in model.buses], dtype=complex)

    def _solve_linear(
        self, ybus: np.ndarray[Any, Any], injections: np.ndarray[Any, Any]
    ) -> np.ndarray[Any, Any]:
        try:
            return np.linalg.solve(ybus, injections)
        except np.linalg.LinAlgError:
            return np.linalg.pinv(ybus) @ injections

    def _power_quality(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        harmonics = sorted({2, 3, 5, 7, 11, 13, 17, 19, 23, 25, 29, 31, 35, 37, 41, 43, 47, 49})
        # `index` adresuje SZYNY (wyniki po szynach), `indeks_wezla` — WĘZŁY
        # ELEKTRYCZNE macierzy. Bez połączeń idealnych oba są tożsame.
        index = self._bus_index(model)
        indeks_wezla = self._indeks_wezla_elektrycznego(model)
        liczba_wezlow = len(set(indeks_wezla.values()))
        bus_results: dict[str, JsonDict] = {
            bus.ref: {
                "bus_ref": bus.ref,
                "u_h": [],
                "i_h": [],
                "thd_u_percent": 0.0,
                "tdd_percent": 0.0,
                "k_factor": 0.0,
                "z_scan": [],
                "resonance_peaks": [],
                "flicker_pst": None,
                "flicker_plt": None,
                "voltage_unbalance_u2_u1": 0.0,
            }
            for bus in model.buses
        }
        u_square: dict[str, float] = {bus.ref: 0.0 for bus in model.buses}
        i_square: dict[str, float] = {bus.ref: 0.0 for bus in model.buses}
        k_factor: dict[str, float] = {bus.ref: 0.0 for bus in model.buses}
        for h in harmonics:
            ybus = self._ybus(model, float(h))
            # Wstrzyknięcia sumują się na WĘZLE: dwie szyny sklejone połączeniem
            # idealnym to jeden punkt sieci, więc ich prądy harmoniczne wchodzą
            # do jednego bilansu prądowego (prawo Kirchhoffa), a nie do dwóch.
            injections = np.zeros(liczba_wezlow, dtype=complex)
            for source in model.harmonic_sources:
                bus_idx = indeks_wezla.get(source.bus_ref)
                if bus_idx is None:
                    continue
                percent = source.spectrum_percent.get(h, 0.0) / 100.0
                current = source.base_current_a * percent
                injections[bus_idx] += complex(current, 0.0)
                i_square[source.bus_ref] += current**2
                k_factor[source.bus_ref] += current**2 * h**2
            voltages = self._solve_linear(ybus, injections)
            for bus in model.buses:
                bus_idx = indeks_wezla[bus.ref]
                voltage = voltages[bus_idx] / 1000.0
                magnitude_kv = abs(voltage)
                phase = (
                    math.degrees(math.atan2(voltage.imag, voltage.real)) if magnitude_kv else 0.0
                )
                bus_results[bus.ref]["u_h"].append(
                    {"h": h, "magnitude_kv": _round(magnitude_kv), "phase_deg": _round(phase, 3)}
                )
                u_square[bus.ref] += magnitude_kv**2

        for bus in model.buses:
            nominal_phase_kv = bus.nominal_kv / math.sqrt(3)
            thd = math.sqrt(u_square[bus.ref]) / max(nominal_phase_kv, 1e-9) * 100
            load_current = max(abs(bus.load_mw) * 1000 / (math.sqrt(3) * bus.nominal_kv), 1.0)
            tdd = math.sqrt(i_square[bus.ref]) / load_current * 100
            # Solver harmoniczny jest niezwalidowany — kompatybilności z limitami THD/TDD nie
            # ocenia (ocena niewykonana na granicy wyniku, `application/v126_artifacts.py`).
            bus_results[bus.ref]["thd_u_percent"] = _round(thd, 4)
            bus_results[bus.ref]["tdd_percent"] = _round(tdd, 4)
            bus_results[bus.ref]["k_factor"] = _round(
                math.sqrt(k_factor[bus.ref]) / load_current, 4
            )

        z50: dict[str, float] = {}
        for f_hz in range(50, 2501, 10):
            harmonic = f_hz / model.base_frequency_hz
            # Shared driving-point-impedance helper WITHOUT the grid-source shunt:
            # the power-quality Z-scan keeps its exact prior numerics (byte-identical
            # golden). The SSCI sweep calls the same helper WITH the shunt.
            zdiag = self._driving_point_impedance(model, harmonic, with_source_shunt=False)
            for bus in model.buses:
                z = zdiag[index[bus.ref]]
                z_abs = abs(z)
                if f_hz == 50:
                    z50[bus.ref] = max(z_abs, 1e-9)
                if f_hz % 100 == 50:
                    phase = math.degrees(math.atan2(z.imag, z.real)) if z_abs else 0.0
                    bus_results[bus.ref]["z_scan"].append(
                        {"f_hz": f_hz, "z_ohm": _round(z_abs), "phase_deg": _round(phase, 3)}
                    )
                if f_hz > 50 and z_abs > 10 * z50.get(bus.ref, z_abs):
                    bus_results[bus.ref]["resonance_peaks"].append(
                        {"f_hz": f_hz, "z_peak_ohm": _round(z_abs), "severity": "ALERT"}
                    )

        trace.add(
            "harmonic_power_flow",
            "U_h = Y_h^-1 * I_h, THD_U = sqrt(sum(|U_h|^2))/U_1 * 100%",
            {"harmonics": harmonics, "sources": len(model.harmonic_sources)},
            "Macierz admitancyjna budowana osobno dla każdej harmonicznej; wektor prądów "
            "wymuszających z widm źródeł odkształcających.",
            {"buses_evaluated": len(bus_results)},
            "Iloraz napięć [kV/kV] i prądów [A/A] wyrażony w %.",
            result_pl=(f"Zbadano węzłów: {len(bus_results)}"),
        )
        nodes = list(bus_results.values())
        # K-08: sanity-bounds wiarygodności PQ — THD/TDD/K-factor skończone i fizyczne
        # (IEC 61000 / PN-EN 50160 to limity zgodności; tu sprawdzamy granicę wiarygodności).
        thd_values = [float(n["thd_u_percent"]) for n in nodes]
        tdd_values = [float(n["tdd_percent"]) for n in nodes]
        kf_values = [float(n["k_factor"]) for n in nodes]
        sanity = _sanity_block(
            [
                ("thd_finite", _finite(*thd_values), "THDu nieskończone albo nieokreślone"),
                ("thd_max", max(thd_values, default=0.0) <= 100.0, "THDu > 100% (niefizyczne)"),
                ("tdd_finite", _finite(*tdd_values), "TDD nieskończone/NaN"),
                (
                    "k_factor_nonneg",
                    _finite(*kf_values) and all(v >= 0.0 for v in kf_values),
                    "K-factor < 0 lub nieskończony",
                ),
            ],
            has_inputs=len(model.harmonic_sources) > 0,
        )
        return {"nodes": nodes, "sanity": sanity}

    # =========================================================================
    # D-03 SSCI — impedance-based stability (PHYSICS half: Z_grid, Z_conv, L).
    # The Nyquist / minor-loop verdict is a SEPARATE analysis-layer follow-up;
    # this solver only emits the white-box impedance arrays it will consume.
    # =========================================================================

    @staticmethod
    def _phasor(z: complex) -> JsonDict:
        """Serialize a complex impedance/gain as {re, im, mag, phase_deg}."""
        mag = abs(z)
        phase = math.degrees(math.atan2(z.imag, z.real)) if mag else 0.0
        return {
            "re": _round(z.real),
            "im": _round(z.imag),
            "mag": _round(mag),
            "phase_deg": _round(phase, 3),
        }

    def _ssci_frequencies_hz(self) -> list[float]:
        """Sub-synchronous-focused, log-spaced sweep ~1..250 Hz (61 points).

        Dense enough to resolve the PLL-band behaviour (negative-resistance
        region below f_pll) and the low-frequency minor-loop interaction. The
        vector is fixed and deterministic (no input-dependent point selection).
        """
        lo, hi, n = 1.0, 250.0, 61
        step = (math.log10(hi) - math.log10(lo)) / (n - 1)
        return [round(10 ** (math.log10(lo) + step * k), 4) for k in range(n)]

    def _z_conv_components(
        self, converter: Any, f_hz: float, *, f_base_hz: float
    ) -> tuple[complex, dict[str, complex]]:
        """Positive-sequence small-signal output impedance Z_conv(jw) of one
        grid-following current-controlled VSC at frequency ``f_hz`` (ohms), plus
        the intermediate transfer functions (for the white-box trace).

        MODEL (impedance-based SSCI; positive-sequence reduced form):
        Sun (2011) "Impedance-Based Stability Criterion for Grid-Connected
        Inverters", IEEE TPEL 26(11); Cespedes & Sun (2014) "Impedance Modeling
        and Analysis of Grid-Connected Voltage-Source Converters", IEEE TPEL
        29(3); Wen et al. (2016) "Analysis of D-Q Small-Signal Impedance of
        Grid-Tied Inverters", IEEE TPEL 31(1).

            Z_conv(jw) = [ Z_f(jw) + G_d(jw)*G_ci(jw) ]
                         / [ 1 - G_d(jw)*H_pll(jw)*(I0*G_ci(jw) - V0)/V0 ]

        where (all impedances per-unit on Z_base = Un^2/Sn, then scaled to ohms):
          - Z_f(jw) = R_f + j*w_pu*L_f          physical LCL/L filter (pu),
            w_pu = w / w_base, w_base = 2*pi*f_base;
          - G_ci(jw) = a_ci*(L_f + R_f/(j*w_pu)) IMC-tuned current PI in pu,
            a_ci = 2*pi*f_ci / w_base (current-loop crossover); equivalently
            K_p = w_ci*L_f, K_i = w_ci*R_f with the loop gain G_ci/Z_f = a_ci/(j*w_pu);
          - G_d(jw) = exp(-j*w*T_d)              control/PWM delay, T_d = control_delay_ms*1e-3;
          - H_pll(jw) = a_pll/(j*w_pu + a_pll)   PLL closed loop, a_pll = 2*pi*f_pll / w_base;
          - V0, I0                               terminal voltage / current at the
            operating point (pu). The denominator PLL term, scaled by the
            operating-point current I0, is the operating-point-dependent coupling
            that creates the sub-synchronous negative-resistance region (the SSCI
            mechanism). Outside the PLL band H_pll -> 0 (coupling vanishes); inside
            the current-loop band G_ci is large (current-source-like high Z); as
            w -> inf, G_ci/Z_f -> 0 so Z_conv -> Z_f.

        ASSUMPTIONS (stated, no fabrication):
          - positive-sequence SISO reduction of the full dq impedance (the
            dominant axis for sub-synchronous SSCI); the dq cross-coupling is
            folded into the single PLL term above (Cespedes-Sun positive-seq form);
          - IMC current-loop tuning K_p=w_ci*L_f, K_i=w_ci*R_f (one-degree-of-
            freedom PI; the standard textbook tuning, Yazdani & Iravani 2010 ch.8);
          - control delay T_d = 0 if control_delay_ms is None (delay term G_d = 1);
          - outer voltage loop included as a low-frequency stiffening of the
            current reference ONLY when voltage_loop_bandwidth_hz is present (see
            below); omitted cleanly otherwise;
          - resistance R_f is frequency-independent (skin effect out of scope).

        MANDATORY card fields: current_loop_bandwidth_hz, pll_bandwidth_hz,
        filter_l_pu. Missing any of these raises the structural refusal
        `KOD_SSCI_BRAK_POL_KARTY` (`OdmowaWejsciaRdzenia`, reference to the converter); the
        caller `_ssci_impedance` checks the SAME predicate (`_brakujace_pola_karty_zconv`)
        first and surfaces missing-data — NO fallback / NO fabricated value.

        ``f_base_hz`` — częstotliwość podstawowa sieci, KEYWORD BEZ WARTOŚCI
        DOMYŚLNEJ. Wcześniej ``w_base`` stało tu na zaszytym ``2π·50``, mimo że
        kontrakt wejściowy niesie ``V126AcademicInput.base_frequency_hz`` i ten
        sam plik czyta je w czterech innych miejscach (jakość energii, przemiatanie
        SSCI, projekt uziemienia punktu neutralnego). Był to ten sam defekt, co
        w `_voltage_stability`: zmyślone wejście przy dostępnej danej rzeczywistej
        (reguła KLASA §5 — uczciwość w obrębie jednego pliku). Brak wartości
        domyślnej sprawia, że nowe wywołanie nie powstanie bez podania podstawy.
        """
        f_ci = converter.current_loop_bandwidth_hz
        f_pll = converter.pll_bandwidth_hz
        l_f = converter.filter_l_pu
        if f_ci is None or f_pll is None or l_f is None:
            raise _odmowa_brak_pol_karty_zconv(converter)
        r_f = converter.filter_r_pu if converter.filter_r_pu is not None else 0.0
        t_d = converter.control_delay_ms * 1e-3 if converter.control_delay_ms is not None else 0.0

        w = 2.0 * math.pi * f_hz
        w_base = 2.0 * math.pi * f_base_hz
        w_pu = w / w_base
        s_pu = complex(0.0, w_pu)
        a_ci = 2.0 * math.pi * f_ci / w_base
        a_pll = 2.0 * math.pi * f_pll / w_base

        # Operating point (pu): V0 at rated (1.0); I0 = |S|/V0 from the converter
        # P/Q if given, else rated injection (1.0). No physics recomputed here —
        # the values come from the model/params.
        v0 = 1.0
        if converter.p_mw is not None or converter.q_mvar is not None:
            p = converter.p_mw or 0.0
            q = converter.q_mvar or 0.0
            s_mva = math.hypot(p, q)
            i0 = (s_mva / converter.rated_mva) / v0 if converter.rated_mva else 1.0
        else:
            i0 = 1.0

        z_f = complex(r_f, 0.0) + s_pu * l_f
        g_ci = a_ci * (complex(l_f, 0.0) + complex(r_f, 0.0) / s_pu)
        # Optional outer voltage loop: low-frequency current-reference stiffening
        # H_v = a_cv/(s_pu + a_cv). Applied as (1 + H_v) gain on the synthesized
        # active impedance G_ci, raising the in-band output impedance below the
        # voltage-loop corner. Omitted entirely when the bandwidth is absent.
        if converter.voltage_loop_bandwidth_hz is not None:
            a_cv = 2.0 * math.pi * converter.voltage_loop_bandwidth_hz / w_base
            h_v = a_cv / (s_pu + a_cv)
            g_ci = g_ci * (1.0 + h_v)
        g_d = cmath.exp(complex(0.0, -w * t_d))
        h_pll = a_pll / (s_pu + a_pll)

        numerator = z_f + g_d * g_ci
        denominator = 1.0 - g_d * h_pll * (i0 * g_ci - v0) / v0
        z_conv_pu = numerator / denominator

        z_base = converter.rated_kv**2 / converter.rated_mva if converter.rated_kv else 1.0
        z_conv = z_conv_pu * z_base

        components = {
            "z_f_pu": z_f,
            "g_ci": g_ci,
            "g_d": g_d,
            "h_pll": h_pll,
            "z_conv_pu": z_conv_pu,
            "z_conv_ohm": z_conv,
        }
        return z_conv, components

    def _ssci_select_converter(self, model: V126AcademicInput) -> Any:
        """The converter under SSCI study: explicit ``parameters['ssci_converter_ref']``
        if given, else the first declared converter. Returns None if none exist.
        """
        ref = model.parameters.get("ssci_converter_ref")
        if ref is not None:
            return next((c for c in model.converters if c.ref == ref), None)
        return model.converters[0] if model.converters else None

    def _ssci_impedance(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        converter = self._ssci_select_converter(model)
        if converter is None:
            trace.add(
                "ssci_impedance_no_converter",
                "Z_conv(jω) wymaga przekształtnika sieciowego (VSC) w modelu",
                {"converters": 0},
                "W modelu nie ma przekształtnika, dla którego można wyznaczyć impedancję wyjściową.",
                {"status": "dane niekompletne"},
                "Brak danych wejściowych — przekształtnik nieokreślony.",
                result_pl=("Brak danych do wyznaczenia impedancji przekształtnika"),
            )
            return {
                "status": "dane niekompletne",
                "message_pl": (
                    "Analiza SSCI (impedancja sieci względem impedancji przekształtnika) wymaga "
                    "przekształtnika (falownika) "
                    "w modelu. Brak przekształtnika — analiza niewykonana."
                ),
                "missing_fields": ["converter"],
                "sanity": _sanity_block([], has_inputs=False),
            }

        index = self._bus_index(model)
        bus_idx = index.get(converter.bus_ref)
        if bus_idx is None:
            return {
                "status": "dane niekompletne",
                "converter_ref": converter.ref,
                "bus_ref": converter.bus_ref,
                "message_pl": "Przekształtnik wskazuje węzeł przyłączenia, którego nie ma w modelu.",
                "missing_fields": ["converter.bus_ref"],
                "sanity": _sanity_block([], has_inputs=False),
            }

        frequencies = self._ssci_frequencies_hz()

        # Probe Z_conv mandatory fields once (clear missing-data, no fabrication) — ten sam
        # predykat co odmowa `_z_conv_components` (`_brakujace_pola_karty_zconv`).
        missing = _brakujace_pola_karty_zconv(converter)
        if missing:
            opisy = [opis for pole, opis in POLA_KARTY_ZCONV if pole in missing]
            trace.add(
                "ssci_impedance_missing_card_fields",
                "Z_conv(jw) wymaga: current_loop_bandwidth_hz, pll_bandwidth_hz, filter_l_pu",
                {"converter_ref": converter.ref, "missing": missing},
                "Brak obowiązkowych pól karty przekształtnika dla modelu impedancji "
                "przekształtnika: " + ", ".join(opisy),
                {"status": "dane niekompletne"},
                "Brak danych karty przekształtnika; wartości zastępczych się nie podstawia.",
                result_pl=("Brak danych karty przekształtnika"),
            )
            return {
                "status": "dane niekompletne",
                "converter_ref": converter.ref,
                "bus_ref": converter.bus_ref,
                "message_pl": (
                    "Analiza SSCI wymaga pól karty falownika (pasmo pętli prądowej, "
                    "pasmo PLL, indukcyjność filtra). Brakuje: " + ", ".join(opisy)
                ),
                "missing_fields": missing,
                "sanity": _sanity_block([], has_inputs=False),
            }

        z_grid_rows: list[JsonDict] = []
        z_conv_rows: list[JsonDict] = []
        l_rows: list[JsonDict] = []
        re_zconv_min = math.inf
        re_zconv_min_f = 0.0
        for f_hz in frequencies:
            harmonic = f_hz / model.base_frequency_hz
            zdiag = self._driving_point_impedance(model, harmonic, with_source_shunt=True)
            z_grid = complex(zdiag[bus_idx])
            z_conv, _components = self._z_conv_components(
                converter, f_hz, f_base_hz=model.base_frequency_hz
            )
            minor_loop = z_grid / z_conv if abs(z_conv) else complex(math.inf, 0.0)
            z_grid_rows.append({"f_hz": f_hz, **self._phasor(z_grid)})
            z_conv_rows.append({"f_hz": f_hz, **self._phasor(z_conv)})
            l_rows.append({"f_hz": f_hz, **self._phasor(minor_loop)})
            if z_conv.real < re_zconv_min:
                re_zconv_min = z_conv.real
                re_zconv_min_f = f_hz

        # White-box trace: emit the model + the per-step transfer functions at a
        # representative low (sub-PLL) frequency so the proof shows the mechanism.
        probe_f = frequencies[0]
        _z_probe, comp = self._z_conv_components(
            converter, probe_f, f_base_hz=model.base_frequency_hz
        )
        f_pll = float(converter.pll_bandwidth_hz)
        z_base = converter.rated_kv**2 / converter.rated_mva if converter.rated_kv else 1.0
        t_d_ms = converter.control_delay_ms if converter.control_delay_ms is not None else 0.0
        trace.add(
            "ssci_zconv_model",
            "Z_conv(jw) = [Z_f + G_d*G_ci] / [1 - G_d*H_pll*(I0*G_ci - V0)/V0]",
            {
                "ref": "Sun 2011 (IEEE TPEL 26-11); Cespedes&Sun 2014 (29-3); Wen 2016 (31-1)",
                "current_loop_bandwidth_hz": float(converter.current_loop_bandwidth_hz),
                "voltage_loop_bandwidth_hz": (
                    float(converter.voltage_loop_bandwidth_hz)
                    if converter.voltage_loop_bandwidth_hz is not None
                    else None
                ),
                "pll_bandwidth_hz": f_pll,
                "control_delay_ms": float(t_d_ms),
                "filter_l_pu": float(converter.filter_l_pu),
                "filter_r_pu": (
                    float(converter.filter_r_pu) if converter.filter_r_pu is not None else 0.0
                ),
                "z_base_ohm": _round(z_base),
            },
            (
                f"w_ci=2*pi*{converter.current_loop_bandwidth_hz} rad/s; "
                f"w_pll=2*pi*{f_pll} rad/s; T_d={t_d_ms} ms; "
                "K_p=w_ci*L_f, K_i=w_ci*R_f (IMC); Z_base=Un^2/Sn"
            ),
            {
                "probe_f_hz": probe_f,
                "G_ci": self._phasor(comp["g_ci"]),
                "H_pll": self._phasor(comp["h_pll"]),
                "G_d": self._phasor(comp["g_d"]),
                "Z_f_pu": self._phasor(comp["z_f_pu"]),
                "Z_conv_pu": self._phasor(comp["z_conv_pu"]),
                "Z_conv_ohm": self._phasor(comp["z_conv_ohm"]),
            },
            "Impedancja filtru w jednostkach względnych, skalowana impedancją bazową [Ω]; wzmocnienia regulatorów bezwymiarowe.",
            result_pl=(
                f"Impedancja wyjściowa przekształtnika przy {_lp(probe_f)} Hz: "
                f"{_lp_tekst(_round(abs(comp['z_conv_ohm']), 4))} \u03a9"
            ),
        )
        trace.add(
            "ssci_zgrid_sweep",
            "Z_grid(f) = diag(pinv(Y_bus(f) + Y_src(f))) @ bus(falownika)",
            {
                "bus_ref": converter.bus_ref,
                "f_min_hz": frequencies[0],
                "f_max_hz": frequencies[-1],
                "points": len(frequencies),
            },
            (
                "Macierz admitancyjna jak w skanie jakości energii, powiększona o bocznik źródła "
                "zasilającego; impedancja sterująca wyznaczona na węźle przyłączenia przekształtnika."
            ),
            {"z_grid_at_f_min": self._phasor(complex(z_grid_rows[0]["re"], z_grid_rows[0]["im"]))},
            "Odwrócenie macierzy admitancyjnej [S] daje impedancję [Ω].",
            result_pl=(
                f"Impedancja sieci przy {_lp(frequencies[0])} Hz: "
                f"{_lp_tekst(_round(math.hypot(z_grid_rows[0]['re'], z_grid_rows[0]['im']), 4))} \u03a9"
            ),
        )
        trace.add(
            "ssci_minor_loop_gain",
            "L(jw) = Z_grid(jw) / Z_conv(jw)",
            {"points": len(frequencies)},
            (
                "Iloraz impedancji sieci i impedancji wyjściowej przekształtnika; bliskość punktu "
                "krytycznego (kryterium Nyquista) ocenia warstwa analizy — tutaj wyłącznie fizyka."
            ),
            {
                "re_zconv_min": _round(re_zconv_min),
                "re_zconv_min_f_hz": re_zconv_min_f,
                "negative_resistance_region": re_zconv_min < 0.0,
            },
            "Iloraz impedancji [Ω/Ω] jest bezwymiarowy.",
            result_pl=(
                f"Najmniejsza część rzeczywista impedancji przekształtnika: "
                f"{_lp_tekst(_round(re_zconv_min, 4))} \u03a9 przy {_lp(re_zconv_min_f)} Hz"
            ),
        )

        # K-08: sanity-bounds — impedancje skonczone; obecnosc strefy ujemnej
        # rezystancji Z_conv (mechanizm SSCI) ponizej pasma PLL.
        z_grid_finite = all(_finite(row["re"], row["im"]) for row in z_grid_rows)
        z_conv_finite = all(_finite(row["re"], row["im"]) for row in z_conv_rows)
        l_finite = all(_finite(row["re"], row["im"]) for row in l_rows)
        sanity = _sanity_block(
            [
                ("z_grid_finite", z_grid_finite, "Impedancja sieci nieskończona albo nieokreślona"),
                (
                    "z_conv_finite",
                    z_conv_finite,
                    "Impedancja przekształtnika nieskończona albo nieokreślona",
                ),
                ("minor_loop_finite", l_finite, "Wzmocnienie pętli nieskończone albo nieokreślone"),
                (
                    "negative_resistance_present",
                    re_zconv_min < 0.0,
                    "Brak strefy ujemnej rezystancji przekształtnika poniżej pasma PLL — "
                    "mechanizm SSCI nieobecny",
                ),
            ],
            has_inputs=True,
        )
        return {
            "converter_ref": converter.ref,
            "bus_ref": converter.bus_ref,
            "base_frequency_hz": model.base_frequency_hz,
            "frequencies_hz": frequencies,
            "z_grid": z_grid_rows,
            "z_conv": z_conv_rows,
            "minor_loop_gain": l_rows,
            "z_conv_negative_resistance": {
                "re_min_ohm": _round(re_zconv_min),
                "f_at_re_min_hz": re_zconv_min_f,
                "present": re_zconv_min < 0.0,
            },
            "sanity": sanity,
        }

    def _voltage_stability(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        """Stabilność napięciowa — analiza WSTRZYMANA (karta QU-FABRYKACJA).

        DLACZEGO SOLVER PRZESTAJE TU LICZYĆ. Każda z czterech wielkości, jakie ta
        analiza podawała, powstawała ze WSPÓŁCZYNNIKA BEZ POKRYCIA W DANYCH albo
        z wejścia, którego model nie niesie i które solver sobie DOMYŚLAŁ:

        1. ZAPAS MOCY BIERNEJ (`qv_curves`) — zdolność wytwórcza brana jako
           ``0,15 · P``, zapotrzebowanie jako ``0,35 · P``. Zapotrzebowanie model
           NIESIE (``bus.load_mvar``, używane niżej w `_branch_current_a`), więc
           liczenie go z krotności mocy czynnej było fabrykacją przy dostępnej
           danej rzeczywistej. Zdolność wytwórcza NIE MA DROGI DO SOLVERA:
           `V126BusInput` ani `V126ConverterInput` nie mają pola zdolności biernej,
           a w modelu ENM (pomiar 2026-08-08 na `sldSubstrate52s` i `demo_oze_sc`)
           `Generator.limits.q_min_mvar/q_max_mvar` nie niesie ŻADEN z 35 wytwórców,
           krzywej producenta `pq_curve` — żaden, ``cosphi_min`` — żaden;
           ``materialized_params.qmin_mvar`` niesie 7 z 35 (20 %). Margines jest
           RÓŻNICĄ obu członów, więc jest tak uczciwy, jak jego gorszy człon:
           pokrycie 0 %. Nazwa „krzywa Q–U" była do tego fałszywym rodowodem —
           we wzorze nie występowało napięcie w żadnej postaci.
        2. MARGINES OBCIĄŻALNOŚCI P–U (`pv_curves`,
           `voltage_stability_margin_percent`) — ``1 + min(2,5; S_sc/P/20)``,
           dalej ``0,7`` i ``0,12`` w napięciu w punkcie krytycznym. Zdjęty
           z ekranu kartą V126-WYGASZENIE z długiem nazwanym wprost („albo liczyć
           realną krzywą P–U rozpływem, albo zdjąć pole"). Ta karta dług ZAMYKA:
           pole kontraktu zostaje, znika liczba.
        3. WSKAŹNIK L (`l_index_per_bus`) — ``P/S_sc · 4`` z obcięciem na ``0,98``.
           Czwórka nie ma pokrycia ani w danych, ani w normie. Opublikowany
           wskaźnik L (Kessel–Glavitsch 1986) liczy się z macierzy F wyprowadzonej
           z Y-bus przy ZBIEŻNYM rozpływie — to inny wzór, więc nazwa „L" była
           trzecim fałszywym rodowodem tego samego pliku.
        4. WARTOŚĆ WŁASNA (`modal_analysis`) — ``(1 − L) · U_pu``, czyli pochodna
           punktu 3, do tego ważona napięciem, które model wypełnia wartością
           domyślną kontraktu (pomiar: ``voltage_pu ≠ 1,0`` dla 0 z 408 szyn).

        WSPÓLNY MIANOWNIK: moc zwarciowa węzła. Wszystkie cztery stały na
        ``bus.fault_level_mva or max(25; U_n · 10)`` — a pomiar pokazał, że pole
        jest podane dla 1 z 315 szyn (`sldSubstrate52s`) i 1 z 93 (`demo_oze_sc`),
        czyli dla 99,7 % węzłów liczba wchodziła ZMYŚLONA. Zmyślone wejście psuje
        nie tylko ekran, ale i zapis audytowy oraz pakiet dowodowy.

        CO ZOSTAJE: kontrakt odpowiedzi (FROZEN) w komplecie — te same klucze,
        ta sama struktura, wartości ``None`` i DODATKOWE pole ``brak_danych``
        z powodem po polsku. Nigdy zero udające pomiar: zero jest wynikiem
        pomiaru, ``None`` jest jego brakiem i te dwa stany nie mogą wyglądać
        tak samo. Blok wiarygodności melduje „dane niekompletne".

        JAK PRZYWRÓCIĆ (dług nazwany, `docs/v12xx/REJESTR_KONFLIKTOW.md`,
        wiersz QU-FABRYKACJA): (a) doprowadzić do kontraktu moc zwarciową węzła
        i zdolność wytwórczą mocy biernej (`GenLimits` → most ENM→V12.6), (b)
        policzyć wskaźnik L z macierzy F na Y-bus przy rozpływie (moduł `_ybus`
        w tym pliku już istnieje), (c) krzywą P–U liczyć rozpływem, nie ze
        sztywności węzła. Do tego czasu analiza melduje uczciwy brak.
        """
        powod_qu = (
            "Zapas mocy biernej nie jest wyznaczany: kontrakt wejściowy nie niesie "
            "zdolności wytwórczej mocy biernej (ani granic Q wytwórcy, ani krzywej "
            "producenta P–Q), a poprzednia wartość powstawała z krotności mocy czynnej "
            "bez pokrycia w danych. Uzupełnij granice mocy biernej źródeł, aby "
            "przywrócić tę wielkość."
        )
        powod_pu = (
            "Margines obciążalności P–U nie jest wyznaczany: powstawał z przybliżenia "
            "ze sztywności węzła o zaszytych współczynnikach, a nie z krzywej P–U "
            "liczonej rozpływem. Wymaga rozpływu mocy na modelu przypadku."
        )
        powod_l = (
            "Wskaźnik bliskości załamania napięcia nie jest wyznaczany: poprzedni wzór "
            "mnożył stosunek obciążenia do mocy zwarciowej przez współczynnik bez "
            "pokrycia w danych i w normie. Wymaga wyznaczenia z macierzy admitancyjnej "
            "przy zbieżnym rozpływie oraz mocy zwarciowej węzłów w modelu."
        )
        pv_curves: list[JsonDict] = [
            {
                "bus_ref": bus.ref,
                "lambda_max": None,
                "u_at_max": None,
                "margin_percent": None,
                "brak_danych": powod_pu,
            }
            for bus in model.buses
        ]
        qv_curves: list[JsonDict] = [
            {
                "bus_ref": bus.ref,
                "q_min_mvar": None,
                "q_available_mvar": None,
                "margin_mvar": None,
                "brak_danych": powod_qu,
            }
            for bus in model.buses
        ]
        l_indices: list[JsonDict] = [
            {
                "bus_ref": bus.ref,
                "l_index": None,
                "alert": None,
                "brak_danych": powod_l,
            }
            for bus in model.buses
        ]
        trace.add(
            "voltage_stability_indices",
            r"\text{brak danych wejściowych} \Rightarrow \text{wielkość niewyznaczana}",
            {
                "buses": len(model.buses),
                "buses_with_fault_level": sum(
                    1 for bus in model.buses if bus.fault_level_mva is not None
                ),
                "reactive_capability_source": None,
            },
            "Żadna z wielkości stabilności napięciowej nie została wyznaczona — "
            "brakuje mocy zwarciowej węzłów oraz zdolności wytwórczej mocy biernej, "
            "a poprzednie wzory zastępowały te dane współczynnikami bez pokrycia.",
            {
                "pv_curves": None,
                "qv_curves": None,
                "l_index_per_bus": None,
                "modal_analysis": None,
            },
            "Brak wielkości do sprawdzenia jednostek — analiza nie wyznacza liczb.",
            result_pl=(
                "Analiza wstrzymana: brak danych wejściowych (moc zwarciowa węzłów "
                f"podana dla {sum(1 for bus in model.buses if bus.fault_level_mva is not None)} "
                f"z {len(model.buses)} szyn; zdolność wytwórcza mocy biernej nieprzenoszona "
                "przez kontrakt wejściowy)."
            ),
        )
        # Blok wiarygodności: nie ma czego oceniać, więc melduje „dane niekompletne"
        # — ten sam stan, co każda inna analiza V12.6 bez kompletu wejść. Lista
        # kontroli pozostaje nazwana, żeby przywrócenie wielkości wracało razem
        # ze swoimi granicami, a nie do bloku bez kontroli.
        sanity = _sanity_block(
            [
                ("margin_finite", False, "Margines P-V nieskończony/NaN"),
                ("margin_nonneg", False, "Margines P-V < 0 (układ za punktem kolapsu)"),
                ("l_index_range", False, "L-index poza [0,1] (niefizyczny)"),
                ("eigenvalue_positive", False, "Zapas do załamania <= 0 (kolaps napięciowy)"),
            ],
            has_inputs=False,
        )
        return {
            "pv_curves": pv_curves,
            "qv_curves": qv_curves,
            "modal_analysis": {
                "smallest_eigenvalue": None,
                "critical_mode": {
                    "eigenvalue": None,
                    "participating_buses": [],
                },
                "brak_danych": powod_l,
            },
            "l_index_per_bus": l_indices,
            "voltage_stability_margin_percent": None,
            "brak_danych": powod_pu,
            "sanity": sanity,
        }

    def _branch_current_a(self, model: V126AcademicInput, branch: Any) -> float:
        to_bus = next((bus for bus in model.buses if bus.ref == branch.to_bus_ref), None)
        if to_bus is None:
            return 0.0
        apparent_mva = math.hypot(
            to_bus.load_mw - to_bus.generation_mw, to_bus.load_mvar - to_bus.generation_mvar
        )
        return apparent_mva * 1000.0 / (math.sqrt(3) * max(to_bus.nominal_kv, 1e-6))

    def _reliability(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        contingencies: list[JsonDict] = []
        customers_total = max(sum(bus.customer_count for bus in model.buses), 1)
        saidi = 0.0
        saifi = 0.0
        bez_obciazalnosci: list[str] = []
        bez_niezawodnosci: list[str] = []
        for branch in model.branches:
            current = self._branch_current_a(model, branch)
            affected = sum(
                bus.customer_count for bus in model.buses if bus.ref == branch.to_bus_ref
            )
            # Obciążalność NIEZNANA ⇒ stopnia obciążenia NIE DA SIĘ policzyć i
            # człon przeciążeniowy dotkliwości nie powstaje. Przed kartą
            # MOST-WEJSCIA-V126 most wstawiał tu 630 A każdemu aparatowi i 300 A
            # każdemu odcinkowi bez obciążalności, więc iloraz I/I_dop wychodził
            # zawsze — tylko z liczby, której nikt nie zmierzył.
            pozycja: JsonDict = {
                "contingency": branch.ref,
                "order": "N-1",
            }
            if branch.ampacity_a is None:
                bez_obciazalnosci.append(branch.ref)
                severity = affected / customers_total * 10.0
                pozycja["max_loading_percent"] = None
                pozycja["brak_danych"] = (
                    "Element nie ma obciążalności długotrwałej w modelu ani w karcie "
                    "katalogowej — stopnia obciążenia i przeciążenia nie policzono. "
                    "Dotkliwość obejmuje wyłącznie skutek odbiorowy."
                )
            else:
                overload = max(0.0, current / branch.ampacity_a - 1.0)
                severity = overload * 100.0 + affected / customers_total * 10.0
                pozycja["max_loading_percent"] = _round(current / branch.ampacity_a * 100.0, 2)
            pozycja["severity"] = _round(severity, 4)
            contingencies.append(pozycja)
            if branch.failure_rate_per_year is None or branch.mttr_h is None:
                # Element bez danej niezawodnościowej nie wnosi do wskaźników ZERA — jest
                # nazwany (dawne domyślne 0,015/rok i 12 h liczyły go jak opisany).
                bez_niezawodnosci.append(branch.ref)
                continue
            saidi += (
                branch.failure_rate_per_year * branch.mttr_h * 60.0 * affected / customers_total
            )
            saifi += branch.failure_rate_per_year * affected / customers_total
        for first, second in combinations(model.branches[:80], 2):
            contingencies.append(
                {
                    "contingency": f"{first.ref}+{second.ref}",
                    "order": "N-2",
                    "severity": (
                        None
                        if first.failure_rate_per_year is None
                        or second.failure_rate_per_year is None
                        else _round(first.failure_rate_per_year + second.failure_rate_per_year, 5)
                    ),
                }
            )
        caidi = saidi / saifi if saifi else 0.0
        # D-14: sanity-bounds (IEEE 1366 — wielkości fizycznie ograniczone).
        minutes_per_year = 525600.0
        # `max_loading_percent` bywa teraz `None` (gałąź bez obciążalności) — brak
        # nie jest ani przeciążeniem, ani jego brakiem, więc nie wchodzi do zliczenia.
        # Porównanie `None > 100.0` podniosłoby TypeError, a `get(..., 0.0)` cicho
        # zaliczyłoby brak do „bez przeciążenia" — obie formy byłyby nieuczciwe.
        overloaded = [
            c
            for c in contingencies
            if isinstance(c.get("max_loading_percent"), int | float)
            and c["max_loading_percent"] > 100.0
        ]
        raw_customers = sum(bus.customer_count for bus in model.buses)
        sanity = _sanity_block(
            [
                ("saidi_nonneg", saidi >= 0.0, "SAIDI < 0 (niefizyczne)"),
                (
                    "saidi_max",
                    saidi <= minutes_per_year,
                    f"SAIDI > {minutes_per_year:.0f} min/rok (> rok przerwy)",
                ),
                ("saifi_nonneg", saifi >= 0.0, "SAIFI < 0 (niefizyczne)"),
                ("saifi_max", saifi <= 1000.0, "SAIFI > 1000/rok (nierealne)"),
            ],
            has_inputs=raw_customers > 0 and len(model.branches) > 0,
        )
        if overloaded:
            sanity.setdefault("violations", []).append(
                {
                    "check": "n1_overload",
                    "detail_pl": f"{len(overloaded)} kontyngencji N-1 z przeciążeniem > 100%",
                }
            )
            if sanity["status"] == "zweryfikowany":
                sanity["status"] = "poza zakresem wiarygodności"
        trace.add(
            "reliability_indices",
            "SAIDI = sum(lambda_e * MTTR_e * 60 * N_e) / N_t; SAIFI = sum(lambda_e * N_e)/N_t",
            {"branches": len(model.branches), "customers_total": customers_total},
            "Dla każdej gałęzi wyznaczono liczbę odbiorców zasilanych za nią oraz roczny "
            "wkład jej awaryjności do wskaźników przerw.",
            {"saidi_min_per_year": _round(saidi, 4), "saifi_per_year": _round(saifi, 5)},
            "Intensywność uszkodzeń [1/rok] razy czas odtworzenia [h] razy 60 daje [min/rok].",
            result_pl=(
                f"Przerwy na odbiorcę: {_lp_tekst(_round(saidi, 4))} min/rok, {_lp_tekst(_round(saifi, 5))} 1/rok"
            ),
        )
        from network_model.catalog.wartosci_robocze import (
            ODNIESIENIE_MAIFI,
            UDZIAL_MAIFI_DO_SAIFI,
        )

        dane_przyjete: list[JsonDict] = [
            dana.model_dump(mode="json") for dana in model.dane_przyjete_niezawodnosci
        ]
        dane_przyjete.append(
            {
                "nazwa_pl": "Udział przerw krótkich w przerwach długich (MAIFI/SAIFI)",
                "wartosc": {"wartosc": UDZIAL_MAIFI_DO_SAIFI, "jednostka": "1"},
                "powod_pl": f"MAIFI = {_lp(UDZIAL_MAIFI_DO_SAIFI)}·SAIFI — {ODNIESIENIE_MAIFI}.",
                "jakosc": "ESTIMATED",
            }
        )
        # Ranking: zdarzenia z ciężkością malejąco, za nimi zdarzenia bez ciężkości (element bez
        # danych niezawodności) — ciężkość nieobecna nie jest zastępowana liczbą.
        z_ciezkoscia = sorted(
            (item for item in contingencies if item["severity"] is not None),
            key=lambda item: (-item["severity"], item["contingency"]),
        )
        bez_ciezkosci = sorted(
            (item for item in contingencies if item["severity"] is None),
            key=lambda item: item["contingency"],
        )
        wynik: JsonDict = {
            "contingency_ranking": (z_ciezkoscia + bez_ciezkosci)[:100],
            "indices": {
                "saidi_min_per_year": _round(saidi, 4),
                "saifi_per_year": _round(saifi, 5),
                "caidi_min_per_interruption": _round(caidi, 4),
                "maifi_per_year": _round(UDZIAL_MAIFI_DO_SAIFI * saifi, 5),
            },
            "dane_przyjete": dane_przyjete,
            "sanity": sanity,
        }
        if bez_niezawodnosci:
            wynik["elementy_bez_danych_niezawodnosci"] = sorted(bez_niezawodnosci)
            wynik["brak_danych_niezawodnosci"] = (
                f"{len(bez_niezawodnosci)} z {len(model.branches)} elementów nie ma intensywności "
                "uszkodzeń albo czasu odnowy — nie weszły do wskaźników przerw."
            )
        if bez_obciazalnosci:
            # Meldunek ZBIORCZY obok meldunków przy pozycjach: czytelnik ma
            # zobaczyć zasięg braku raz, a nie składać go z rankingu przyciętego
            # do stu pozycji.
            wynik["brak_danych"] = (
                f"{len(bez_obciazalnosci)} z {len(model.branches)} elementów nie ma "
                "obciążalności długotrwałej (model ani karta katalogowa) — dla nich "
                "stopnia obciążenia N-1 nie policzono."
            )
            wynik["elementy_bez_obciazalnosci"] = sorted(bez_obciazalnosci)
        return wynik

    def _earthing(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        data = model.earthing
        if data is None:
            surowe = model.parameters.get("earthing")
            if not isinstance(surowe, dict):
                # Uziom bez danych to NAZWANY brak — dawny uziom domyślny (ρ = 100 Ω·m,
                # siatka 60 × 40 m, 10 kA) liczył stację, której nikt nie opisał.
                return {
                    "status": "dane niekompletne",
                    "message_pl": (
                        "Brak danych uziomu stacji (rezystywność gruntu, geometria siatki, "
                        "prąd i czas zwarcia doziemnego, warstwa powierzchniowa) — napięć "
                        "rażeniowych nie wyznaczono."
                    ),
                    "missing_fields": ["earthing"],
                    "sanity": _sanity_block([], has_inputs=False),
                }
            from solver_input.v126_contracts import V126EarthingInput

            data = V126EarthingInput.model_validate(surowe)
        prad = self._prad_uziomowy(model, data, trace)
        if "i_f_ka" not in prad:
            return prad
        area = data.length_m * data.width_m
        conductors_x = math.floor(data.width_m / data.mesh_spacing_m) + 1
        conductors_y = math.floor(data.length_m / data.mesh_spacing_m) + 1
        lc = conductors_x * data.length_m + conductors_y * data.width_m + data.rods_total_length_m
        rg = data.rho1_ohm_m * (
            1 / max(lc, 1e-9)
            + 1 / math.sqrt(20 * area) * (1 + 1 / (1 + data.buried_depth_m * math.sqrt(20 / area)))
        )
        ig_ka = prad["i_f_ka"] * data.split_factor
        gpr_kv = ig_ka * rg
        n = max(conductors_x, conductors_y)
        ki = 1 + 0.172 * n
        km = 0.8 + data.mesh_spacing_m / max(16 * data.buried_depth_m, 1e-9)
        ks = 0.6 + data.mesh_spacing_m / max(20 * data.buried_depth_m, 1e-9)
        u_touch = data.rho1_ohm_m * km * ki * ig_ka * 1000 / max(lc, 1e-9)
        u_step = data.rho1_ohm_m * ks * ki * ig_ka * 1000 / max(lc, 1e-9)
        u_touch_allow = (
            (1000 + 1.5 * data.surface_layer_derating * data.surface_layer_rho_ohm_m)
            * 0.157
            / math.sqrt(data.fault_clearing_time_s)
        )
        u_step_allow = (
            (1000 + 6 * data.surface_layer_derating * data.surface_layer_rho_ohm_m)
            * 0.157
            / math.sqrt(data.fault_clearing_time_s)
        )
        trace.add(
            "ieee80_sverak",
            "Rg = rho * [1/Lc + 1/sqrt(20A)*(1 + 1/(1+h*sqrt(20/A)))]",
            {"area_m2": area, "lc_m": lc, "rho_ohm_m": data.rho1_ohm_m},
            f"R_g = {data.rho1_ohm_m} Ω·m · (1/{_round(lc, 3)} m + człon powierzchniowy siatki)",
            {"r_g_ohm": _round(rg, 6), "gpr_kv": _round(gpr_kv, 6)},
            "Rezystywność [Ω·m] razy odwrotność długości [1/m] daje rezystancję [Ω]; prąd [kA] razy rezystancja [Ω] daje napięcie [kV].",
            result_pl=(
                f"Rezystancja uziomu: {_lp_tekst(_round(rg, 6))} \u03a9; wzrost potencjału: {_lp_tekst(_round(gpr_kv, 6))} kV"
            ),
        )
        # K-08: sanity-bounds IEEE 80 / EN 50522 — Rg, GPR, napięcia rażenia skończone i ≥ 0.
        sanity = _sanity_block(
            [
                ("rg_nonneg", _finite(rg) and rg >= 0.0, "Rg < 0 lub nieskończone"),
                ("gpr_nonneg", _finite(gpr_kv) and gpr_kv >= 0.0, "GPR < 0 lub nieskończone"),
                (
                    "u_touch_nonneg",
                    _finite(u_touch) and u_touch >= 0.0,
                    "Napięcie dotykowe ujemne albo nieskończone",
                ),
                (
                    "u_step_nonneg",
                    _finite(u_step) and u_step >= 0.0,
                    "Napięcie krokowe ujemne albo nieskończone",
                ),
            ],
            has_inputs=True,
        )
        return {
            "sanity": sanity,
            "bus_ref": data.bus_ref,
            "soil_model": {"rho1": data.rho1_ohm_m, "rho2": data.rho2_ohm_m, "h1": data.h1_m},
            "grid_geometry": {
                "length_m": data.length_m,
                "width_m": data.width_m,
                "mesh_spacing_m": data.mesh_spacing_m,
                "buried_depth_m": data.buried_depth_m,
            },
            "r_g_ohm": _round(rg, 6),
            "gpr_kv": _round(gpr_kv, 6),
            "i_f_ka": _round(prad["i_f_ka"], 6),
            "i_g_ka": _round(ig_ka, 6),
            "split_factor": data.split_factor,
            "prad_uziomowy": prad["prad_uziomowy"],
            "dane_przyjete": prad["dane_przyjete"],
            "u_touch_calculated_v": _round(u_touch, 3),
            "u_touch_allowable_v": _round(u_touch_allow, 3),
            "u_step_calculated_v": _round(u_step, 3),
            "u_step_allowable_v": _round(u_step_allow, 3),
            "fault_clearing_time_s": data.fault_clearing_time_s,
        }

    @staticmethod
    def _prad_uziomowy(model: V126AcademicInput, data: Any, trace: TraceBuilder) -> JsonDict:
        """Prąd zwarcia doziemnego stacji I_F przed redukcją (EN 50522:2010 tab. 1).

        Przypadki z modelu (``model.prad_uziomowy``): wielkość miarodajna każdego wg
        ``wielkosc_pradu_uziomowego``, rozstrzyga największa (uziom wymiaruje się na przypadek
        najniekorzystniejszy). ``fault_current_ka`` projektanta nadpisuje model — dana przyjęta
        ESTIMATED z wartością z modelu w powodzie. Bez obu — nazwany brak (przyczyny z modelu),
        nigdy prąd domyślny. Zwraca ``i_f_ka``, ``prad_uziomowy`` (przypadki i rozstrzygnięcie)
        i ``dane_przyjete`` albo wynik braku (bez ``i_f_ka``)."""
        przypadki = [] if model.prad_uziomowy is None else model.prad_uziomowy.przypadki
        wiersze: list[JsonDict] = []
        policzalne: list[tuple[float, str, JsonDict, WielkoscPraduUziomowego]] = []
        for przypadek in przypadki:
            wielkosc = wielkosc_pradu_uziomowego(przypadek)
            wiersz = {
                "strona": przypadek.strona,
                "nazwa_pl": przypadek.nazwa_pl,
                "bus_ref": przypadek.bus_ref,
                "tryb": przypadek.tryb,
                "tryb_pl": (None if przypadek.tryb is None else ETYKIETA_PL_TRYBU[przypadek.tryb]),
                "stan_awsc": przypadek.stan_awsc,
                "wielkosc": wielkosc.symbol,
                "wielkosc_latex": wielkosc.symbol_latex,
                "opis_pl": wielkosc.opis_pl,
                "prad_a": (None if wielkosc.prad_a is None else _round(wielkosc.prad_a, 4)),
                "brak_pl": wielkosc.brak_pl,
            }
            wiersze.append(wiersz)
            if wielkosc.prad_a is not None:
                policzalne.append((wielkosc.prad_a, przypadek.nazwa_pl, wiersz, wielkosc))
        najwiekszy = max(policzalne, key=lambda p: (p[0], p[1])) if policzalne else None
        dane_modelu: list[JsonDict] = []
        for _prad, _nazwa, _wiersz, wielkosc in policzalne:
            for dana in wielkosc.dane_przyjete:
                if dana not in dane_modelu:
                    dane_modelu.append(dana)
        # Przyczyny braku prądu z modelu — jedna lista dla nadpisania i dla braku.
        przyczyny = [str(w["brak_pl"]) for w in wiersze if w["brak_pl"]]
        if model.prad_uziomowy is not None and model.prad_uziomowy.brak_pl:
            przyczyny.insert(0, model.prad_uziomowy.brak_pl)
        if model.prad_uziomowy is None:
            przyczyny.append("nie wskazano szyny stacji w modelu")
        if data.fault_current_ka is not None:
            i_f_ka = float(data.fault_current_ka)
            z_modelu = (
                f"prąd z modelu {_lp_tekst(_round(najwiekszy[0] / 1000.0, 6))} kA — {najwiekszy[1]}"
                if najwiekszy is not None
                else "model nie wyznaczył prądu"
                + (": " + "; ".join(przyczyny) if przyczyny else "")
            )
            rozstrzyga = "nadpisanie projektanta"
            powod = (
                f"Prąd zwarcia doziemnego stacji wpisany przez projektanta zamiast prądu "
                f"z modelu ({z_modelu})."
            )
            podstawienie = powod
            dane: list[JsonDict] = [
                {
                    "nazwa_pl": "Prąd zwarcia doziemnego stacji (nadpisanie projektanta)",
                    "wartosc": {"wartosc": _round(i_f_ka, 6), "jednostka": "kA"},
                    "powod_pl": powod,
                    "jakosc": "ESTIMATED",
                }
            ]
        elif najwiekszy is not None:
            i_f_ka = najwiekszy[0] / 1000.0
            rozstrzyga = najwiekszy[1]
            prad_tekst = f"{_lp_tekst(_round(najwiekszy[0], 4))} A"
            zakres = (
                f" — największy prąd przypadków stacji policzonych z modelu (policzono "
                f"{len(policzalne)} z {len(wiersze)})."
            )
            # Uzasadnienie wyniku (proza z wzorami `$…$`, ekran składa je przez KaTeX) i
            # podstawienie kroku śladu (pole PROZY kontraktu kroku — bez LaTeX-u,
            # `slad_proza_bez_latex_guard`; symbol wielkości niesie kolumna `wielkosc_latex`
            # przypadku w danych kroku) — z tych samych wartości.
            powod = (
                f"Rozstrzyga przypadek „{najwiekszy[1]}” (${najwiekszy[3].symbol_latex}$"
                f" = {prad_tekst}){zakres}"
            )
            podstawienie = f"Rozstrzyga przypadek „{najwiekszy[1]}” ({prad_tekst}){zakres}"
            dane = dane_modelu
        else:
            komunikat = (
                "Prąd zwarcia doziemnego stacji nieoznaczalny — model nie daje prądu "
                "odprowadzanego przez uziom (EN 50522 tab. 1), a projektant nie podał wartości"
                + (": " + "; ".join(przyczyny) if przyczyny else "")
                + ". Napięć rażeniowych nie wyznaczono."
            )
            trace.add(
                "en50522_prad_uziomowy",
                "I_F = max po przypadkach stacji wielkości miarodajnej EN 50522 tab. 1",
                {"przypadki": wiersze},
                komunikat,
                {"i_f_ka": None},
                "Prąd [A].",
                result_pl=komunikat,
            )
            return {
                "status": "dane niekompletne",
                "message_pl": komunikat,
                "missing_fields": ["prad_uziomowy"],
                "bus_ref": data.bus_ref,
                "prad_uziomowy": {"przypadki": wiersze, "rozstrzyga": None},
                "sanity": _sanity_block([], has_inputs=False),
            }
        trace.add(
            "en50522_prad_uziomowy",
            "I_F = max po przypadkach stacji wielkości miarodajnej EN 50522 tab. 1",
            {
                "przypadki": wiersze,
                "nadpisanie_projektanta_ka": data.fault_current_ka,
                "podstawa": PODSTAWA_PRADU_UZIOMOWEGO_PL,
            },
            podstawienie,
            {"i_f_ka": _round(i_f_ka, 6), "rozstrzyga": rozstrzyga},
            "Prąd [A] dzielony przez 1000 daje prąd [kA].",
            result_pl=(
                f"Prąd zwarcia doziemnego stacji przed redukcją: {_lp_tekst(_round(i_f_ka, 6))} kA "
                f"({rozstrzyga})"
            ),
        )
        return {
            "i_f_ka": i_f_ka,
            "prad_uziomowy": {
                "przypadki": wiersze,
                "rozstrzyga": rozstrzyga,
                "uzasadnienie_pl": powod,
                "podstawa_pl": PODSTAWA_PRADU_UZIOMOWEGO_PL,
            },
            "dane_przyjete": dane,
        }

    # D-06a/b: PROJEKT UZIEMIENIA PUNKTU NEUTRALNEGO SIECI (dławik Petersena /
    # rezystor uziemiający NER). Fizyka pierwszych zasad (NIE tablica) — kompensacja
    # prądu pojemnościowego doziemienia i dobór rezystancji punktu neutralnego.
    # Odrębne od _earthing() (IEEE 80 — siatka uziemiająca, napięcia rażenia).
    # Źródło C0: B0 = b0_siemens_per_km × length_km galwanicznie połączonej sieci SN.
    # Referencje (wzory pierwszych zasad, nie współczynniki tablicowe):
    #   - W. Petersen, kompensacja rezonansowa: ωL = 1/(3ωC0) → L = 1/(3ω²C0).
    #   - IEC 62271-203 / IEC 60071 / VDE praktyka sieci skompensowanych.
    #   - Prąd pojemnościowy: Ic = 3·ω·C0·U_f = √3·ω·C0·U_l (tożsame, U_f = U_l/√3).
    #   - Stopień rozstrojenia v = (I_L − I_C)/I_C; prąd resztkowy I_res = I_C·√(d²+v²).
    #   - NER: R = U_f / I_ef; sprawdzenie cieplne I_ef²·R·t ≤ E_rating.
    def _neutral_earthing_design(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        omega = 2.0 * math.pi * model.base_frequency_hz
        # Typ uziemienia WYŁĄCZNIE z modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4):
        # zespół uziemiający sekcji SN wyznacza wariant (dławik → projekt dławika, rezystor
        # albo dławik‖rezystor → projekt rezystora). Parametr biegu go nie nadpisuje, a brak
        # zespołu jest nazwanym brakiem MODELU — nie domyślnym „petersen_coil".
        powod = brak_uziemienia_sn(model.uziemienie_sn, projekt_zespolu=True)
        if powod is not None:
            return _odmowa_uziemienia_sn(trace, "neutral_earthing_no_grounding_model", powod)
        assert model.uziemienie_sn is not None and model.uziemienie_sn.wariant is not None
        scheme = PROJEKT_UZIEMIENIA_WARIANTU[model.uziemienie_sn.wariant]
        trace.add(
            "neutral_earthing_scheme_from_model",
            "Typ projektu = f(wariant zespołu uziemiającego sekcji SN z modelu)",
            {
                "wariant": model.uziemienie_sn.wariant,
                "wariant_awsc_zalaczony": model.uziemienie_sn.wariant_awsc_zalaczony,
            },
            (
                f"{ETYKIETA_PL_WARIANTU_UZIEMIENIA[model.uziemienie_sn.wariant]} → "
                f"{_PROJEKT_UZIEMIENIA_PL[scheme]}"
            ),
            {"neutral_earthing_type": scheme},
            "Wybór projektu jest decyzją logiczną — bez jednostek fizycznych.",
            result_pl=f"Uziemienie sieci z modelu: {model.uziemienie_sn.opis_pl}",
        )

        # Każda galwanicznie połączona sieć SN osobno (IEC 60909-0 / PN-EN 50522:
        # I_C = √3·ω·C_0·U_n sieci połączonej galwanicznie): dwie sekcje GPZ przy otwartym
        # sprzęgle mają własną pojemność doziemną i własny zespół — suma po całym modelu
        # zawyżałaby I_C każdej z nich i fałszowała dobór dławika albo rezystora.
        sieci = model.uziemienie_sn.sieci
        wiele = len(sieci) > 1
        wyniki = [
            self._projekt_uziemienia_sieci(model, trace, siec, scheme, omega, wiele=wiele)
            for siec in sieci
        ]
        if not wiele:
            # Tożsamość sieci także przy jednej sieci (przedmiot rekordów oceny nazywa sieć).
            return {"szyna_ref": sieci[0].szyna_ref, "nazwa_pl": sieci[0].nazwa_pl, **wyniki[0]}
        return _zestawienie_sieci(scheme, sieci, wyniki)

    def _projekt_uziemienia_sieci(
        self,
        model: V126AcademicInput,
        trace: TraceBuilder,
        siec: V126SiecSnInput,
        scheme: str,
        omega: float,
        *,
        wiele: bool,
    ) -> JsonDict:
        """Projekt uziemienia punktu neutralnego JEDNEJ galwanicznie połączonej sieci SN."""
        # Kroki śladu niosą sieć, gdy model ma ich kilka (ślad czytelny sieć po sieci).
        dopisek = {"siec_sn": siec.nazwa_pl} if wiele else {}
        przedrostek = f"{siec.nazwa_pl}: " if wiele else ""
        # --- Krok 1: zsumuj pojemność doziemną C0 sieci galwanicznie połączonej. ---
        # Tylko linie/kable z jawnym b0 (zero-sequence / line-to-earth). Element bez
        # b0 → "dane niekompletne" (zakaz fabrykacji C0). Łączniki otwarte pomijane.
        # Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (B-01): wyłącznie gałęzie TEJ sieci SN z jedynej
        # prawdy (`galezie_sieci` składowej galwanicznej przy stanach łączników); linie
        # 110 kV, kable nN i gałęzie drugiej sekcji przy otwartym sprzęgle do niej nie należą.
        galezie_sieci = frozenset(siec.galezie_sieci)
        b0_total_s = 0.0
        contributing: list[JsonDict] = []
        missing_b0: list[str] = []
        for branch in model.branches:
            if branch.kind not in {"line_overhead", "cable"}:
                continue
            if branch.ref not in galezie_sieci:
                continue
            if getattr(branch, "is_open", False):
                continue
            b0_per_km = getattr(branch, "b0_siemens_per_km", None)
            if b0_per_km is None:
                missing_b0.append(branch.ref)
                continue
            b0_branch = float(b0_per_km) * branch.length_km
            b0_total_s += b0_branch
            contributing.append(
                {
                    "branch_ref": branch.ref,
                    "kind": branch.kind,
                    "length_km": branch.length_km,
                    "b0_siemens_per_km": float(b0_per_km),
                    "b0_total_siemens": _round(b0_branch, 12),
                }
            )

        # Karta UX-04/POLE-BKR-MODEL (B-01): baterie kondensatorów. Gwiazda z uziemionym
        # punktem gwiazdy ma każdą fazę między przewodem a ziemią — jej susceptancja fazy
        # B0 = B (Y0 = Y1, policzona w moście wejścia z pierwszych zasad) dokłada się do
        # pojemności doziemnej sieci tak samo jak B0 linii; gwiazda izolowana, podwójna
        # gwiazda izolowana i trójkąt nie mają drogi zerowej (B0 = 0) i nie wnoszą prądu
        # pojemnościowego. Bateria otwarta pomijana jak łącznik otwarty. Wyłącznie baterie TEJ
        # sieci (`baterie_sieci` z `enm.uziemienie_sekcji.baterie_sieci_sn` — ten sam
        # predykat, z którego jedyna prawda dokłada B0 baterii): bateria drugiej sekcji przy
        # otwartym sprzęgle nie wnosi prądu do tej sieci.
        baterie_w_sieci = frozenset(siec.baterie_sieci)
        banks_contributing: list[JsonDict] = []
        banks_without_zero_path: list[str] = []
        b0_banks_s = 0.0
        baterie_sieci = [b for b in model.shunt_capacitors if b.ref in baterie_w_sieci]
        for bank in baterie_sieci:
            if bank.is_open:
                continue
            if not bank.wnosi_pojemnosc_doziemna:
                banks_without_zero_path.append(bank.ref)
                continue
            b0_banks_s += bank.b0_siemens
            b0_total_s += bank.b0_siemens
            banks_contributing.append(
                {
                    "shunt_capacitor_ref": bank.ref,
                    "bus_ref": bank.bus_ref,
                    "uklad_polaczen": bank.uklad_polaczen,
                    "b0_total_siemens": _round(bank.b0_siemens, 12),
                }
            )
        if baterie_sieci:
            trace.add(
                "neutral_earthing_shunt_capacitors",
                "B0_bat = B_bat (gwiazda uziemiona, Y0 = Y1); B0_bat = 0 (gwiazda izolowana, "
                "podwójna gwiazda, trójkąt)",
                {
                    "banks_contributing": banks_contributing,
                    "banks_without_zero_path": banks_without_zero_path,
                    **dopisek,
                },
                "Σ B0_bat = "
                + (
                    " + ".join(str(b["b0_total_siemens"]) for b in banks_contributing)
                    if banks_contributing
                    else "0"
                ),
                {"b0_banks_siemens": _round(b0_banks_s, 12)},
                "Metoda składowych symetrycznych: admitancja zerowa elementu poprzecznego to "
                "admitancja trzech faz równolegle z powrotem przez ziemię.",
                result_pl=(
                    f"Baterie kondensatorów w gwieździe uziemionej: {len(banks_contributing)}; "
                    f"bez drogi zerowej: {len(banks_without_zero_path)}"
                ),
            )

        # Napięcie sieci (linia–linia) SN z jedynej prawdy o uziemieniu sieci (karta
        # UX-04/POLE-ZU-SKLADOWA-ZEROWA, B-01): dawniej najwyższe napięcie szyny MODELU —
        # w modelu GPZ 110 kV, co zawyżało I_C sieci SN 110/15 = 7,3 raza.
        # Brak napięcia sieci to nazwana odmowa niżej — bez podstawionej liczby.
        u_line_kv = siec.napiecie_kv

        # Brak jakiejkolwiek pojemności doziemnej → C0 nie do policzenia (nie zgadujemy).
        # Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (B-01, B′0): odcinek sieci bez B′0 i bez podstawy
        # wartości roboczej (B′1 nieznane — most wejścia daje B′0 z modelu albo z reguły
        # `enm.skladowa_zerowa_galezi`) to też brak C0: suma bez niego zaniżałaby I_C, a z I_C
        # dobór dławika i rezystora — wynik częściowy nie jest wynikiem. Ten sam predykat co
        # `UziemienieSekcji.prad_pojemnosciowy_a` i gotowość (`galezie.b0`).
        if b0_total_s <= 0.0 or missing_b0 or u_line_kv is None or u_line_kv <= 0.0:
            reason = (
                f"Odcinki sieci SN bez susceptancji jednostkowej składowej zerowej i bez podstawy "
                f"wartości roboczej (susceptancja jednostkowa składowej zgodnej nieznana): "
                f"{len(missing_b0)} — suma pojemności doziemnej bez nich zaniżałaby prąd "
                "pojemnościowy doziemienia, projekt uziemienia nie jest liczony z sumy częściowej."
                if missing_b0
                else (
                    "Brak jawnej susceptancji składowej zerowej linii i kabli sieci SN — "
                    "pojemność doziemna nieoznaczalna (zakaz fabrykacji)."
                    if b0_total_s <= 0.0
                    else "Brak napięcia znamionowego sieci — projekt niewykonalny."
                )
            )
            trace.add(
                "neutral_earthing_no_c0",
                "C0 = (1/ω)·Σ(b0_branch_total); Ic = √3·ω·C0·U_l",
                {
                    "branches_with_b0": len(contributing),
                    "branches_missing_b0": missing_b0,
                    "u_line_kv": u_line_kv,
                    **dopisek,
                },
                przedrostek + reason,
                {"status": "dane niekompletne"},
                "Brak danych wejściowych (susceptancja składowej zerowej albo napięcie "
                "znamionowe sieci) — brak oszacowania zastępczego.",
                result_pl=("Brak danych do wyznaczenia prądu pojemnościowego doziemienia"),
            )
            return {
                "status": "dane niekompletne",
                "neutral_earthing_type": scheme,
                "message_pl": przedrostek + reason,
                "missing_fields": (
                    ["b0_siemens_per_km"] if missing_b0 or b0_total_s <= 0.0 else ["nominal_kv"]
                ),
                "branches_missing_b0": missing_b0,
                "sanity": _sanity_block([], has_inputs=False),
            }

        u_line_v = u_line_kv * 1000.0
        u_phase_v = u_line_v / math.sqrt(3.0)
        # C0 [F] z sumy susceptancji doziemnych: B0 = ω·C0 ⇒ C0 = B0/ω.
        c0_farad = b0_total_s / omega
        # Prąd pojemniczy doziemienia (1-fazowe doziemienie metaliczne): Ic = √3·ω·C0·U_l.
        ic_a = math.sqrt(3.0) * omega * c0_farad * u_line_v
        trace.add(
            "neutral_earthing_capacitive_current",
            "C0 = (1/ω)·Σ(b0·len);  Ic = 3·ω·C0·U_f = √3·ω·C0·U_l",
            {
                "ref": "Petersen resonant earthing; IEC 62271-203 / VDE practice",
                "zakres_sieci_pl": (
                    "linie, kable i baterie w gwieździe uziemionej sieci SN połączonej "
                    "galwanicznie przy stanach łączników modelu (sekcje rozdzielone otwartym "
                    "sprzęgłem liczone osobno); napięcie sieci SN z modelu"
                ),
                **dopisek,
                "omega_rad_s": _round(omega, 6),
                "b0_total_siemens": _round(b0_total_s, 12),
                "u_line_kv": u_line_kv,
                "branches_contributing": len(contributing),
                "branches_missing_b0": missing_b0,
            },
            f"C0={_round(b0_total_s, 12)}/{_round(omega, 4)}; "
            f"Ic=√3·{_round(omega, 4)}·{_round(c0_farad, 12)}·{u_line_v}",
            {"c0_farad": _round(c0_farad, 12), "ic_a": _round(ic_a, 4)},
            "S/(rad/s)=F; (rad/s)·F·V=A. U_f=U_l/√3 ⇒ 3ωC0U_f=√3ωC0U_l.",
            result_pl=(
                f"{przedrostek}Prąd pojemnościowy doziemienia sieci: {_lp_tekst(_round(ic_a, 4))} A"
            ),
        )

        if scheme == "resistor_grounded" or scheme == "resistor":
            result = self._ner_design(
                model, trace, siec, b0_total_s, ic_a, u_phase_v, dopisek, przedrostek
            )
        else:
            result = self._petersen_design(
                trace, siec, c0_farad, b0_total_s, ic_a, omega, dopisek, przedrostek
            )
        # Dane przyjęte ESTIMATED wejścia tej sieci (zasada nr 4): B′0 odcinków z wartości
        # roboczej (I_C — wchodzi do OBU projektów) i parametry urządzeń punktu neutralnego
        # (rezystor, Z_0,TU, dławik Z.14) — wynik na nich ma kompletność dowodu NIEPELNY.
        dane_przyjete = [d.model_dump(mode="json") for d in siec.dane_przyjete]
        result["dane_przyjete"] = dane_przyjete
        result["neutral_earthing_type"] = scheme
        result["capacitive_earth_fault_current_a"] = _round(ic_a, 4)
        result["c0_farad"] = _round(c0_farad, 12)
        result["network_line_voltage_kv"] = u_line_kv
        result["branches_missing_b0"] = missing_b0
        result["branches_contributing"] = contributing
        if baterie_sieci:
            result["shunt_capacitors_contributing"] = banks_contributing
            result["shunt_capacitors_without_zero_path"] = banks_without_zero_path
        return result

    def _doziemienie_sieci(
        self,
        siec: V126SiecSnInput,
        tryb: TrybDoziemienia,
        b0_total_s: float,
        punkty: list[V126PunktNeutralnySnInput],
    ) -> WynikDoziemienia:
        """Prąd doziemienia sieci z JEDNEGO solvera (`doziemienie_sn`) — tego samego, który
        liczy wiersz zwarcia jednofazowego (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, warunek
        odbioru 2026-10-29): punkty neutralne w ruchu z mostu wejścia, B_0 tej sieci."""
        assert siec.napiecie_kv is not None
        return oblicz_doziemienie(
            DaneDoziemienia(
                tryb=tryb,
                napiecie_kv=siec.napiecie_kv,
                b0_s=b0_total_s,
                punkty=tuple(
                    PunktNeutralnyDoziemienia(
                        nazwa_pl=p.nazwa_pl,
                        z_n_ohm=complex(p.z_n_r_ohm, p.z_n_x_ohm),
                        z0_tu_ohm=(
                            None
                            if p.z0_r_ohm is None or p.z0_x_ohm is None
                            else complex(p.z0_r_ohm, p.z0_x_ohm)
                        ),
                    )
                    for p in punkty
                ),
                dlawik_w_ruchu=siec.dlawik_w_ruchu,
                droga_szeregowa=siec.droga_szeregowa,
            )
        )

    def _petersen_design(
        self,
        trace: TraceBuilder,
        siec: V126SiecSnInput,
        c0_farad: float,
        b0_total_s: float,
        ic_a: float,
        omega: float,
        dopisek: JsonDict,
        przedrostek: str,
    ) -> JsonDict:
        # Rezonans: ωL = 1/(3ωC0) ⇒ L = 1/(3·ω²·C0); X_L = ωL.
        x_coil_ohm = 1.0 / (3.0 * omega * c0_farad)
        l_coil_h = 1.0 / (3.0 * omega**2 * c0_farad)
        # Prąd dławika w rezonansie kompensuje Ic: I_L = Ic.
        i_coil_a = ic_a
        trace.add(
            "petersen_resonance_tuning",
            "ωL = 1/(3ωC0)  ⇒  L = 1/(3·ω²·C0);  X_L = ωL;  I_L(rezonans)=Ic",
            {
                "ref": "W. Petersen, kompensacja rezonansowa (sieć skompensowana)",
                "c0_farad": _round(c0_farad, 12),
                "omega_rad_s": _round(omega, 6),
                "ic_a": _round(ic_a, 4),
                **dopisek,
            },
            f"L=1/(3·{_round(omega, 4)}²·{_round(c0_farad, 12)}); "
            f"X_L=1/(3·{_round(omega, 4)}·{_round(c0_farad, 12)})",
            {
                "l_coil_h": _round(l_coil_h, 8),
                "x_coil_ohm": _round(x_coil_ohm, 4),
                "i_coil_rating_a": _round(i_coil_a, 4),
            },
            "1/((rad/s)²·F)=H; 1/((rad/s)·F)=Ω; prąd dławika [A] = Ic [A].",
            result_pl=(
                f"{przedrostek}Dławik gaszący dostrojony do rezonansu: {_lp_tekst(_round(l_coil_h, 8))} H, "
                f"{_lp_tekst(_round(x_coil_ohm, 4))} Ω, prąd znamionowy {_lp_tekst(_round(i_coil_a, 4))} A"
            ),
        )
        projekt: JsonDict = {
            "design_mode": "petersen_coil",
            "coil_reactance_ohm": _round(x_coil_ohm, 4),
            "coil_inductance_h": _round(l_coil_h, 8),
            "coil_current_rating_a": _round(i_coil_a, 4),
        }
        kontrole_projektu = [
            (
                "l_coil_positive",
                _finite(l_coil_h) and l_coil_h > 0.0,
                "Indukcyjność dławika ≤ 0 lub nieskończona",
            ),
            (
                "x_coil_positive",
                _finite(x_coil_ohm) and x_coil_ohm > 0.0,
                "Reaktancja dławika ≤ 0 lub nieskończona",
            ),
        ]

        # Prąd resztkowy DŁAWIKA MODELU (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, warunek odbioru
        # 2026-10-29): dawne parametry biegu „stopień rozstrojenia 0,05" i „tłumienie 0"
        # opisywały inny dławik niż ten w zespole uziemiającym — I_L, I_w i v idą z impedancji
        # punktów neutralnych w ruchu (dławik, rezystor wymuszający AWSC, Z_0 transformatora
        # uziemiającego), tym samym solverem co wiersz zwarcia jednofazowego.
        if not siec.punkty_neutralne:
            powod = (
                "Wejście nie niesie punktów uziemienia sieci w ruchu (impedancja dławika i "
                "transformatora uziemiającego) — prądu resztkowego dławika modelu nie wyznaczono."
            )
            trace.add(
                "petersen_residual_current",
                "I_res = √(I_w² + (I_C − I_L)²);  v = (I_C − I_L)/I_C",
                {"missing": ["uziemienie_sn.sieci.punkty_neutralne"], **dopisek},
                przedrostek + powod,
                {"status": "dane niekompletne"},
                "Brak danych urządzenia punktu neutralnego — bez wartości zgadywanej.",
                result_pl="Brak punktów uziemienia w ruchu — prądu resztkowego nie wyznaczono",
            )
            return {
                **projekt,
                "status": "dane niekompletne",
                "message_pl": przedrostek + powod,
                "missing_fields": ["uziemienie_sn.sieci.punkty_neutralne"],
                "sanity": _sanity_block(kontrole_projektu, has_inputs=False),
            }
        spoczynek = self._doziemienie_sieci(siec, "kompensowany", b0_total_s, siec.punkty_neutralne)
        assert spoczynek.prad_a is not None and spoczynek.i_l_a is not None
        assert spoczynek.i_w_a is not None
        awsc = (
            self._doziemienie_sieci(siec, "kompensowany", b0_total_s, siec.punkty_neutralne_awsc)
            if siec.punkty_neutralne_awsc
            else None
        )
        i_res_a = spoczynek.prad_a
        i_l_a = spoczynek.i_l_a
        i_w_a = spoczynek.i_w_a
        v = spoczynek.rozstrojenie
        trace.add(
            "petersen_residual_current",
            "I_N = Σ U_f/(Z_N + Z_0/3);  I_w = Re I_N;  I_L = −Im I_N;  "
            "I_res = √(I_w² + (I_C − I_L)²);  v = (I_C − I_L)/I_C",
            {
                "ic_a": _round(ic_a, 4),
                "i_l_a": _round(i_l_a, 4),
                "i_w_a": _round(i_w_a, 4),
                "detuning_v": None if v is None else _round(v, 6),
                "i_w_awsc_a": (
                    None if awsc is None or awsc.i_w_a is None else _round(awsc.i_w_a, 4)
                ),
                "punkty": [p.model_dump(mode="json") for p in siec.punkty_neutralne],
                **dopisek,
            },
            f"I_res=√({_round(i_w_a, 4)}²+({_round(ic_a, 4)}−{_round(i_l_a, 4)})²)"
            + ("" if v is None else f"; v=({_round(ic_a, 4)}−{_round(i_l_a, 4)})/{_round(ic_a, 4)}")
            + (
                ""
                if awsc is None or awsc.prad_a is None
                else f"; po załączeniu AWSC I_res={_round(awsc.prad_a, 4)}"
            ),
            {
                "i_residual_a": _round(i_res_a, 6),
                "detuning_v": None if v is None else _round(v, 6),
                "i_residual_awsc_a": (
                    None if awsc is None or awsc.prad_a is None else _round(awsc.prad_a, 6)
                ),
            },
            "√(A²+A²)=A; (A−A)/A — bezwymiarowe.",
            result_pl=(
                f"{przedrostek}Prąd resztkowy dławika modelu: {_lp_tekst(_round(i_res_a, 4))} A"
                + ("" if v is None else f" (rozstrojenie {_lp_tekst(_round(100.0 * v, 2))} %)")
                + (
                    ""
                    if awsc is None or awsc.prad_a is None
                    else f"; po załączeniu AWSC {_lp_tekst(_round(awsc.prad_a, 4))} A"
                )
            ),
        )
        # K-08: sanity-bounds — wartości skończone i nieujemne (prąd resztkowy dławika modelu
        # NIE jest ograniczony przez I_C: dławik przekompensowany dwukrotnie daje I_res ≈ I_C,
        # a składowa czynna AWSC dodaje się w kwadraturze).
        sanity = _sanity_block(
            [
                *kontrole_projektu,
                (
                    "residual_finite",
                    _finite(i_res_a, i_l_a, i_w_a) and i_res_a >= 0.0 and i_w_a >= 0.0,
                    "Prąd resztkowy lub jego składowe ujemne albo nieskończone (niefizyczne)",
                ),
            ],
            has_inputs=True,
        )
        return {
            **projekt,
            "sanity": sanity,
            "residual_current_a": _round(i_res_a, 6),
            # Udział prądu resztkowego w prądzie pojemnościowym sieci — wielkość kryterium
            # prądu resztkowego (próg z rejestru założeń inżynierskich, `v126_oceny`).
            "residual_share_percent": _round(100.0 * i_res_a / ic_a, 6),
            "detuning_model": None if v is None else _round(v, 6),
            "coil_current_model_a": _round(i_l_a, 4),
            "active_component_a": _round(i_w_a, 4),
            # Dławik dostrojony dokładnie do rezonansu (I_L = I_C): zostaje składowa czynna I_w.
            "residual_current_at_resonance_a": _round(i_w_a, 6),
            "residual_current_awsc_a": (
                None if awsc is None or awsc.prad_a is None else _round(awsc.prad_a, 6)
            ),
            "active_component_awsc_a": (
                None if awsc is None or awsc.i_w_a is None else _round(awsc.i_w_a, 4)
            ),
            "zastrzezenia_pl": list(spoczynek.zastrzezenia_pl),
        }

    def _ner_design(
        self,
        model: V126AcademicInput,
        trace: TraceBuilder,
        siec: V126SiecSnInput,
        b0_total_s: float,
        ic_a: float,
        u_phase_v: float,
        dopisek: JsonDict,
        przedrostek: str,
    ) -> JsonDict:
        # Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4 (B-01): sprawdzenie REZYSTORA MODELU.
        # Dawne parametry biegu „docelowy prąd doziemienia" (R = U_f/I_ef) i „energia
        # znamionowa rezystora" opisywały inny rezystor niż ten w zespole uziemiającym —
        # nadpisywały model. R, I_n i t_n idą z zespołu (albo z uzwojenia TR uziemionego przez
        # rezystor); wartość robocza urządzenia jest daną przyjętą ESTIMATED (zasada nr 4).
        rezystory = sorted(siec.rezystory, key=lambda r: r.ref)
        kompensacja = siec.wariant == "dlawik_rezystor"
        brak = (
            ["uziemienie_sn.sieci.rezystory"]
            if not rezystory
            else (["uziemienie_sn.sieci.punkty_neutralne"] if not siec.punkty_neutralne else [])
        )
        if brak:
            reason = (
                "Sieć SN uziemiona przez rezystor, ale wejście nie niesie danych rezystora "
                "punktu neutralnego (rezystancja, prąd znamionowy i czas znamionowy) — "
                "sprawdzenia rezystora nie wykonano."
                if not rezystory
                else "Wejście nie niesie punktów uziemienia sieci w ruchu (impedancje rezystora, "
                "dławika Z.14 i transformatora uziemiającego) — prądu doziemienia nie wyznaczono."
            )
            trace.add(
                "ner_no_resistor",
                "R_N = R_{zespołu};  I_ef = |Σ U_f/(Z_N + Z_0/3) + j·I_C|",
                {"missing": brak, **dopisek},
                przedrostek + reason,
                {"status": "dane niekompletne"},
                "Brak danych urządzenia punktu neutralnego — bez wartości zgadywanej.",
                result_pl="Brak danych rezystora punktu neutralnego — sprawdzenia nie wykonano",
            )
            return {
                "status": "dane niekompletne",
                "design_mode": "resistor_grounded",
                "message_pl": przedrostek + reason,
                "missing_fields": brak,
                "sanity": _sanity_block([], has_inputs=False),
            }

        # R_N rezystorów w ruchu równolegle — wielkość opisowa projektu.
        r_ohm = 1.0 / sum(1.0 / r.r_ohm for r in rezystory)
        # Prąd doziemienia z JEDNEGO solvera (warunek odbioru 2026-10-29): I_N = Σ U_f/(Z_N +
        # Z_0/3) po punktach w ruchu (rezystor, dławik Z.14 łącznie, Z_0,TU zespołu albo Z_T0
        # transformatora w szeregu), I_ef = |I_N + j·I_C| — składowa czynna I_w = Re I_N,
        # bierna I_C − I_L (I_L = −Im I_N; bez dławika I_L to tylko część indukcyjna Z_0).
        wynik = self._doziemienie_sieci(siec, "rezystor", b0_total_s, siec.punkty_neutralne)
        assert wynik.prad_a is not None and wynik.i_w_a is not None and wynik.i_l_a is not None
        i_ef_a = wynik.prad_a
        i_resistive_a = wynik.i_w_a
        i_coil_a = wynik.i_l_a
        i_reactive_a = ic_a - i_coil_a
        trace.add(
            "ner_resistance_sizing",
            "R_N = (Σ 1/R_k)⁻¹;  I_N = Σ U_f/(Z_N + Z_0/3);  I_R = Re I_N;  I_L = −Im I_N;  "
            "I_ef = √(I_R² + (I_C − I_L)²)",
            {
                "ref": "Resistance-earthed neutral; ENEA Zeszyt 1 §16 (Z.14, Z.15)",
                "u_phase_v": _round(u_phase_v, 4),
                "resistors": [
                    {"ref": r.ref, "nazwa_pl": r.nazwa_pl, "r_ohm": r.r_ohm} for r in rezystory
                ],
                "punkty": [p.model_dump(mode="json") for p in siec.punkty_neutralne],
                "ic_a": _round(ic_a, 4),
                "i_resistive_a": _round(i_resistive_a, 4),
                "i_coil_a": _round(i_coil_a, 4),
                **dopisek,
            },
            f"R_N={_round(r_ohm, 4)}; I_R={_round(i_resistive_a, 4)}; "
            f"I_ef=√({_round(i_resistive_a, 4)}²+({_round(ic_a, 4)}−{_round(i_coil_a, 4)})²)",
            {
                "r_ohm": _round(r_ohm, 4),
                "i_resistive_a": _round(i_resistive_a, 4),
                "i_ef_resultant_a": _round(i_ef_a, 4),
            },
            "V/Ω=A; √(A²+A²)=A.",
            result_pl=(
                f"{przedrostek}Rezystancja uziemiająca punktu neutralnego: {_lp_tekst(_round(r_ohm, 4))} Ω; "
                f"wynikowy prąd doziemienia: {_lp_tekst(_round(i_ef_a, 4))} A"
            ),
        )

        thermal = self._ner_thermal(model, trace, siec, rezystory, u_phase_v, dopisek, przedrostek)

        # K-08: sanity-bounds — R i I_ef skończone i dodatnie.
        sanity = _sanity_block(
            [
                ("r_positive", _finite(r_ohm) and r_ohm > 0.0, "R ≤ 0 lub nieskończone"),
                (
                    "i_ef_positive",
                    _finite(i_ef_a) and i_ef_a > 0.0,
                    "Prąd doziemienia niedodatni albo nieskończony",
                ),
            ],
            has_inputs=True,
        )
        return {
            "sanity": sanity,
            "design_mode": "resistor_grounded",
            "resistor_ohm": _round(r_ohm, 4),
            "resultant_earth_fault_current_a": _round(i_ef_a, 4),
            "resistive_component_a": _round(i_resistive_a, 4),
            "coil_current_a": _round(i_coil_a, 4) if kompensacja else None,
            "reactive_component_a": _round(i_reactive_a, 4),
            "zastrzezenia_pl": list(wynik.zastrzezenia_pl),
            "thermal_check": thermal,
        }

    def _ner_thermal(
        self,
        model: V126AcademicInput,
        trace: TraceBuilder,
        siec: V126SiecSnInput,
        rezystory: list[V126RezystorSnInput],
        u_phase_v: float,
        dopisek: JsonDict,
        przedrostek: str,
    ) -> JsonDict:
        """Obciążalność zwarciowa cieplna KAŻDEGO rezystora punktu neutralnego w ruchu.

        Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (B-01). Przez rezystor płynie wyłącznie jego prąd
        (składowa pojemnościowa zamyka się przez pojemności doziemne faz zdrowych, nie przez
        punkt neutralny). Prąd NAJWIĘKSZY wg IEC 60909-0: doziemienie metaliczne na szynach,
        napięcie zastępcze c_max·U_f (tab. 1 — z jedynego nośnika c, wejście sieci), droga
        zerowa gałęzi uziemiającej Z_0,TU + 3·R_k ⇒ I_R,k = 3·c·U_f/(Z_0,TU + 3·R_k) =
        c·U_f/|R_k + Z_0,TU/3|; impedancje zgodna i przeciwna sieci pominięte (zawyżają prąd —
        strona bezpieczna). Prąd cieplny zastępczy I_th = I_R,k·√(m + n) (IEC 60909-0 §12,
        jedyne źródło `compute_post_fault_quantities` z R/X pętli Z_0,TU/3 + R_k; n = 1 — zwarcie
        odległe). Kryterium adiabatyczne: E_k = I_th²·R_k·t_wył ≤ E_n,k = I_n,k²·R_k·t_n,k
        (prąd i czas znamionowy rezystora — znamionowanie czasowe IEEE Std C57.32; ogrzewanie
        bez oddawania ciepła jest górnym oszacowaniem temperatury). Dopuszczalny czas trwania
        doziemienia t_dop: I_th(t_dop)²·t_dop = I_n,k²·t_n,k — liczony zawsze, także bez czasu
        wyłączenia (kryterium nastawy czasowej zabezpieczenia ziemnozwarciowego zespołu).
        """
        brak_c = siec.c_max is None
        t_clear_raw = model.parameters.get("ner_clearing_time_s")
        formula = (
            "I_R,k = c_max·U_f/|R_k + Z_0,TU/3|;  I_th = I_R,k·√(m+n);  "
            "E_k = I_th²·R_k·t_wył ≤ E_n,k = I_n,k²·R_k·t_n,k;  "
            "I_th(t_dop)²·t_dop = I_n,k²·t_n,k"
        )
        if brak_c:
            trace.add(
                "ner_thermal_incomplete",
                formula,
                {"missing": ["uziemienie_sn.sieci.c_max"], **dopisek},
                "Brak maksymalnego współczynnika napięciowego sieci (IEC 60909-0 tab. 1).",
                {"status": "dane niekompletne"},
                "Bez maksymalnego współczynnika napięciowego największego prądu rezystora nie da "
                "się wyznaczyć — bez zgadywania.",
                result_pl=(
                    "Sprawdzenia cieplnego nie wykonano — brak maksymalnego współczynnika "
                    "napięciowego sieci"
                ),
            )
            return {
                "status": "dane niekompletne",
                "missing_fields": ["uziemienie_sn.sieci.c_max"],
            }
        assert siec.c_max is not None
        c_max = float(siec.c_max)
        u_n_v = u_phase_v * math.sqrt(3.0)
        t_clear_s = None if t_clear_raw is None else float(t_clear_raw)
        wiersze: list[JsonDict] = []
        for rez in rezystory:
            z0_tu = (
                complex(rez.z0_tu_r_ohm, rez.z0_tu_x_ohm)
                if rez.z0_tu_r_ohm is not None and rez.z0_tu_x_ohm is not None
                else None
            )
            z_petli = complex(rez.r_ohm, 0.0) + (z0_tu / 3.0 if z0_tu is not None else 0.0)
            i_k = c_max * u_phase_v / abs(z_petli)
            e_n = rez.i_n_a**2 * rez.r_ohm * rez.t_n_s
            t_dop = _czas_dopuszczalny_rezystora_s(i_k, z_petli, u_n_v, e_n / rez.r_ohm)
            wiersz: JsonDict = {
                "ref": rez.ref,
                "nazwa_pl": rez.nazwa_pl,
                "r_ohm": rez.r_ohm,
                "z0_tu_ohm": (
                    None
                    if z0_tu is None
                    else {
                        "r_ohm": _round(z0_tu.real, 6),
                        "x_ohm": _round(z0_tu.imag, 6),
                    }
                ),
                "z_loop_ohm": {
                    "r_ohm": _round(z_petli.real, 6),
                    "x_ohm": _round(z_petli.imag, 6),
                },
                "i_resistor_a": _round(i_k, 4),
                "i_n_a": rez.i_n_a,
                "t_n_s": rez.t_n_s,
                "energy_rating_j": _round(e_n, 4),
                "permissible_time_s": _round(t_dop, 4),
            }
            if t_clear_s is not None:
                pozwarciowe = compute_post_fault_quantities(
                    ikss=i_k, un_v=u_n_v, z_equiv=z_petli, tk_s=t_clear_s
                )
                e_k = pozwarciowe.ith_a**2 * rez.r_ohm * t_clear_s
                wiersz.update(
                    {
                        "kappa": _round(pozwarciowe.kappa, 6),
                        "m_factor": _round(pozwarciowe.m_factor, 6),
                        "n_factor": _round(pozwarciowe.n_factor, 6),
                        "i_thermal_a": _round(pozwarciowe.ith_a, 4),
                        "energy_dissipated_j": _round(e_k, 4),
                    }
                )
            wiersze.append(wiersz)
        # Rozstrzyga rezystor o NAJKRÓTSZYM czasie dopuszczalnym: czas wyłączenia jest wspólny
        # dla sieci, a I_th(t)²·t rośnie z t, więc E_k ≤ E_n,k ⇔ t_wył ≤ t_dop,k — rezystor
        # o najmniejszym t_dop jako pierwszy przestaje spełniać kryterium (ten sam rezystor
        # niesie wielkości główne obu kroków: czasu dopuszczalnego i energii).
        rozstrzygajacy = min(wiersze, key=lambda w: (w["permissible_time_s"], w["ref"]))
        podstawa_c = siec.c_max_zrodlo_pl or "IEC 60909-0 tab. 1"
        trace.add(
            "ner_thermal_permissible_time",
            "I_R,k = c_max·U_f/|R_k + Z_0,TU/3|;  I_th(t_dop)²·t_dop = I_n,k²·t_n,k",
            {
                "c_max": c_max,
                "c_max_zrodlo_pl": podstawa_c,
                "u_phase_v": _round(u_phase_v, 4),
                "resistors": wiersze,
                **dopisek,
            },
            "; ".join(
                f"{w['nazwa_pl']}: I_R={c_max}·{_round(u_phase_v, 4)}/"
                f"|{w['z_loop_ohm']['r_ohm']}+j{w['z_loop_ohm']['x_ohm']}|; "
                f"t_dop: I_th²·t = {w['i_n_a']}²·{w['t_n_s']}"
                for w in wiersze
            ),
            {
                "permissible_time_s": rozstrzygajacy["permissible_time_s"],
                "i_resistor_a": rozstrzygajacy["i_resistor_a"],
            },
            "V/Ω = A; A²·s = A²·s ⇒ s.",
            result_pl=(
                f"{przedrostek}Dopuszczalny czas trwania doziemienia dla rezystora "
                f"{rozstrzygajacy['nazwa_pl']}: {_lp_tekst(rozstrzygajacy['permissible_time_s'])} s "
                f"(prąd rezystora {_lp_tekst(rozstrzygajacy['i_resistor_a'])} A)"
            ),
        )
        wspolne: JsonDict = {
            "c_max": c_max,
            "c_max_zrodlo_pl": podstawa_c,
            "i_resistor_a": rozstrzygajacy["i_resistor_a"],
            "permissible_time_s": rozstrzygajacy["permissible_time_s"],
            "energy_rating_j": rozstrzygajacy["energy_rating_j"],
            "resistors": wiersze,
            "podstawa_pl": (
                "IEC 60909-0: prąd największy (maksymalny współczynnik napięciowy, tab. 1) "
                "i zastępczy prąd cieplny jako prąd zwarciowy pomnożony przez pierwiastek z sumy "
                "współczynników składowej nieokresowej i okresowej (§12); IEEE Std C57.32: prąd "
                "i czas znamionowy rezystora uziemiającego — kryterium adiabatyczne: całka "
                "kwadratu zastępczego prądu cieplnego po czasie wyłączenia nie przekracza "
                "kwadratu prądu znamionowego pomnożonego przez czas znamionowy"
            ),
        }
        if t_clear_s is None:
            trace.add(
                "ner_thermal_incomplete",
                formula,
                {"missing": ["ner_clearing_time_s"], **dopisek},
                "Brak czasu wyłączenia zwarcia doziemnego.",
                {"status": "dane niekompletne"},
                "Porównanie z czasem wyłączenia wymaga czasu wyłączenia — bez zgadywania; czas "
                "dopuszczalny policzono.",
                result_pl=(
                    "Porównania z czasem wyłączenia nie wykonano — brak czasu wyłączenia; "
                    f"czas dopuszczalny {rozstrzygajacy['permissible_time_s']} s"
                ),
            )
            return {
                "status": "dane niekompletne",
                "missing_fields": ["ner_clearing_time_s"],
                **wspolne,
            }
        trace.add(
            "ner_thermal_withstand",
            formula,
            {
                "t_clear_s": t_clear_s,
                "c_max": c_max,
                "c_max_zrodlo_pl": podstawa_c,
                "resistors": wiersze,
                **dopisek,
            },
            "; ".join(
                f"{w['nazwa_pl']}: E={w['i_thermal_a']}²·{w['r_ohm']}·{t_clear_s} ≤ "
                f"{w['i_n_a']}²·{w['r_ohm']}·{w['t_n_s']}"
                for w in wiersze
            ),
            {
                "energy_dissipated_j": rozstrzygajacy["energy_dissipated_j"],
                "energy_rating_j": rozstrzygajacy["energy_rating_j"],
            },
            "A²·Ω·s = W·s = J; porównanie J z J.",
            result_pl=(
                f"{przedrostek}Energia wydzielona w rezystorze: "
                f"{_lp_tekst(rozstrzygajacy['energy_dissipated_j'])} J "
                f"(znamionowa: {_lp_tekst(rozstrzygajacy['energy_rating_j'])} J)"
            ),
        )
        return {
            **wspolne,
            "energy_dissipated_j": rozstrzygajacy["energy_dissipated_j"],
            "energy_rating_j": rozstrzygajacy["energy_rating_j"],
            "i_thermal_a": rozstrzygajacy["i_thermal_a"],
            "clearing_time_s": t_clear_s,
        }

    def _insulation(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        """Koordynacja izolacji IEC 60071 wg sposobu pracy punktu neutralnego sieci.

        Przepięcie dorywcze przy doziemieniu U_TOV = k·U_m/√3 (IEC 60071-1: współczynnik
        zwarcia doziemnego k; IEC 60071-2: reprezentatywne przepięcie dorywcze). Czas jego
        trwania wynika z trybu: sieć izolowana i kompensowana pracuje z doziemieniem
        długotrwale — wymagane U_c ≥ U_TOV (IEC 60099-5); sieć z rezystorem i uziemiona
        bezpośrednio wyłącza doziemienie samoczynnie — U_c ≥ U_m/√3 oraz wytrzymałość TOV
        ogranicznika ≥ U_TOV (czas wyłączenia ≤ 10 s — założenie jawne w wyniku). Margines
        ochrony M = (BIL − U_res)/U_res wobec poziomu normowego IEC 60071-1 tab. 2.
        """
        rows: list[JsonDict] = []
        for item in model.insulation:
            rows.append(_wiersz_izolacji(item))
        trace.add(
            "iec60071_arrester_margin",
            "U_TOV = k·U_m/√3; U_c ≥ U_TOV (doziemienie długotrwałe) albo U_c ≥ U_m/√3 "
            "i TOV_10s ≥ U_TOV; Margin_BIL = (BIL - U_res) / U_res * 100%",
            {
                "locations": len(rows),
                "miejsca": [
                    {
                        "location_bus_ref": row["location_bus_ref"],
                        "tryb": row["network_neutral"],
                        "k": row["earth_fault_factor"],
                        "u_m_kv": row["u_m_kv"],
                    }
                    for row in rows
                ],
            },
            "Przepięcie dorywcze przy doziemieniu z współczynnika zwarcia doziemnego sieci "
            "(solver doziemienia albo wartość robocza trybu) i napięcia najwyższego sieci; "
            "wymagane napięcie trwałej pracy ogranicznika wg czasu trwania doziemienia "
            "(sieć izolowana i kompensowana — długotrwale, z rezystorem i uziemiona "
            "bezpośrednio — do wyłączenia); napięcie obniżone przy 10 kA i wytrzymałość TOV "
            "z karty katalogowej, a przy jej braku z doboru wstępnego (wartości robocze).",
            {
                "locations": len(rows),
                "bil_margin_percent": [row["bil_margin_percent"] for row in rows],
            },
            "Napięcia [kV]; margines — iloraz napięć [kV/kV] wyrażony w %.",
            result_pl=(
                f"Wyznaczono przepięcie dorywcze, napięcia ogranicznika i margines ochrony "
                f"izolacji w miejscach zainstalowania: {len(rows)}"
            ),
        )
        # K-08: sanity-bounds IEC 60071 — MCOV/BIL/margines skończone i nieujemne.
        mcov_values = [float(r["mcov_kv"]) for r in rows]
        bil_values = [float(r["bil_protected_kv"]) for r in rows if r["bil_protected_kv"]]
        margin_values = [
            float(r["bil_margin_percent"]) for r in rows if r["bil_margin_percent"] is not None
        ]
        sanity = _sanity_block(
            [
                (
                    "mcov_nonneg",
                    _finite(*mcov_values) and all(v >= 0.0 for v in mcov_values),
                    "MCOV < 0 lub nieskończone",
                ),
                (
                    "bil_positive",
                    _finite(*bil_values) and all(v > 0.0 for v in bil_values),
                    "BIL <= 0 lub nieskończone",
                ),
                ("margin_finite", _finite(*margin_values), "Margines BIL nieskończony/NaN"),
            ],
            has_inputs=len(model.insulation) > 0,
        )
        return {"arresters": rows, "sanity": sanity}

    def _earth_fault_detection(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        # Sposób uziemienia WYŁĄCZNIE z modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4)
        # — dawny domyślny „petersen_tuned" zgadywał sieć, której model nie opisał.
        powod = brak_uziemienia_sn(model.uziemienie_sn)
        if powod is not None:
            return _odmowa_uziemienia_sn(trace, "earth_fault_no_grounding_model", powod)
        assert model.uziemienie_sn is not None and model.uziemienie_sn.wariant is not None
        neutral = _metoda_detekcji_wariantu(
            model.uziemienie_sn.wariant, nadazna=model.uziemienie_sn.regulacja_nadazna
        )
        # Wyposażenie przekaźnika — dana projektanta (gotowość NIE blokuje biegu bez niej, zasada
        # nr 4). Bez niej lista jest pusta, a sprawdzenia dostępności funkcji nie wykonuje się
        # (rekord oceny NIE_OCENIONO z nazwanym brakiem): dawny „komplet metod" jako wartość
        # robocza rozstrzygał kryterium samym założeniem — sprawdzenie zawsze spełnione nie jest
        # sprawdzeniem.
        metody_podane = "relay_methods" in model.parameters
        relay_methods = sorted(set(model.parameters.get("relay_methods", [])))
        table = {
            "isolated": ("wattmetric", "transient_directional"),
            "petersen_tuned": ("wattmetric", "fifth_harmonic"),
            "petersen_detuned": ("admittance", "wattmetric"),
            "resistor": ("51N+67N", "admittance"),
            "solid": ("51N/50N", None),
        }
        recommended, alternative = table[neutral]
        # Metoda złożona (51N+67N, 51N/50N) wymaga KAŻDEJ swojej funkcji w przekaźniku — dawne
        # „metoda ze znakiem + albo / jest zawsze dostępna" zaliczało przekaźnik bez 67N.
        skladniki = SKLADNIKI_METODY_DETEKCJI.get(recommended, (recommended,))
        trace.add(
            "earth_fault_method_selection",
            "Metoda detekcji = f(sposób uziemienia punktu neutralnego); funkcje wymagane = "
            "składniki metody zalecanej",
            {
                "neutral_grounding": neutral,
                "wariant_uziemienia_sn": model.uziemienie_sn.wariant,
                "relay_methods": relay_methods,
            },
            f"{neutral} -> {recommended} ({' + '.join(skladniki)})",
            {"recommended_method": recommended, "required_functions": list(skladniki)},
            "Wybór metody jest decyzją logiczną — bez jednostek fizycznych.",
            result_pl=(
                f"Metoda zalecana: {recommended}; funkcje wymagane w przekaźniku: "
                f"{', '.join(skladniki)}"
            ),
        )
        u0_start = 5.0
        # K-08: sanity (analiza decyzyjna) — wybór metody dobrze określony, nastawa U0 fizyczna.
        sanity = _sanity_block(
            [
                ("method_selected", bool(recommended), "Brak rekomendowanej metody detekcji"),
                ("u0_start_range", 0.0 < u0_start <= 100.0, "Nastawa U0 poza zakresem (0,100]%"),
            ],
            has_inputs=True,
        )
        return {
            "neutral_grounding": neutral,
            "recommended_method": recommended,
            "alternative_method": alternative,
            "required_functions": list(skladniki),
            "relay_methods": relay_methods,
            "relay_methods_podane": metody_podane,
            "settings": {
                "u0_start_percent": u0_start,
                "p0_set_w": 1.0 if recommended == "wattmetric" else None,
                "i5_multiplier": 3.0 if recommended == "fifth_harmonic" else None,
            },
            "settings_podstawa_pl": (
                "Nastawy startowe metody zalecanej (napięcie składowej zerowej 5 % napięcia "
                "fazowego, moc czynna składowej zerowej 1 W, krotność 5. harmonicznej 3) — "
                "propozycja praktyki zabezpieczeń ziemnozwarciowych SN bez wartości "
                "normowej; dobór ostateczny w projekcie zabezpieczeń."
            ),
            "sanity": sanity,
        }

    def _transient(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        # Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (B-01): napięcie znamionowe wyłącznika U_r jest
        # parametrem biegu — proponuje je gotowość z MODELU (U_r = U_m sieci SN, IEC 60038
        # tab. 3–5 / IEC 62271-1: napięcie znamionowe aparatu równe napięciu najwyższemu
        # urządzenia). Dawna wartość zastępcza „najwyższe napięcie szyny modelu" dawała w modelu
        # GPZ 110 kV dla wyłącznika SN (ta sama klasa co dawne U_l projektu uziemienia); brak
        # U_r to nazwany brak przebiegu napięcia powrotnego, bez liczby zastępczej.
        # Ta sama klasa: częstotliwość własna f_n i stała czasowa τ napięcia powrotnego oraz
        # krotność prądu załączania są WŁAŚCIWOŚCIAMI obwodu i transformatora (katalog analiz:
        # parametry wymagane, „model ich nie niesie"; gotowość blokuje bieg bez nich) — dawne
        # wartości zastępcze solvera (12 kHz, 180 µs, 8·I_n) nie miały podstawy normowej
        # (parametry u_c, t_3 tabel IEC 62271-100 nie są danymi programu). Brak albo wartość
        # niedodatnia = nazwany brak, bez liczby.
        u_r = _parametr_dodatni(model, "breaker_rated_voltage_kv")
        natural_frequency_hz = _parametr_dodatni(model, "trv_natural_frequency_hz")
        tau_s = _parametr_dodatni(model, "trv_tau_s")
        brak_trv = [
            klucz
            for klucz, wartosc in (
                ("breaker_rated_voltage_kv", u_r),
                ("trv_natural_frequency_hz", natural_frequency_hz),
                ("trv_tau_s", tau_s),
            )
            if wartosc is None
        ]
        # Przebieg napięcia powrotnego BEZ obwiedni wytrzymałości: dawna „obwiednia modelowa"
        # (narost liniowy do 2·U_r w 88 µs) nie miała podstawy — obwiednię wyłącznika wyznaczają
        # parametry u_c, t_3 tabel IEC 62271-100, których program nie ma (nazwany brak; rekord
        # oceny BRAK_PODSTAWY, `application/analyses/v126_oceny.py`). Margines wobec obwiedni bez
        # podstawy był werdyktem z liczby wymyślonej.
        points: list[JsonDict] = []
        szczyt_kv: float | None = None
        if u_r is not None and natural_frequency_hz is not None and tau_s is not None:
            for i in range(1, 51):
                t = i * 2e-6
                u = u_r * (1 - math.cos(2 * math.pi * natural_frequency_hz * t)) * math.exp(
                    -t / tau_s
                ) + u_r / math.sqrt(3)
                szczyt_kv = u if szczyt_kv is None else max(szczyt_kv, u)
                points.append({"t_us": _round(t * 1e6, 3), "u_trv_kv": _round(u, 5)})
        inrush_multiple = _parametr_dodatni(model, "inrush_multiple_in")
        second_harmonic_percent = None if inrush_multiple is None else 63.0 / inrush_multiple
        # Ryzyko ferrorezonansu stoi na POJEMNOŚCI DOCZEPNEJ sieci (suma B·ℓ).
        # Gałąź bez danej o susceptancji nie wnosi do tej sumy ZERA — ona po
        # prostu nic o pojemności nie mówi. Rozróżnienie ma skutek: gdy żaden
        # element nie niesie B, suma wychodzi 0 i przed kartą MOST-WEJSCIA-V126
        # ocena meldowała „brak ryzyka" wyłącznie z braku danych.
        # Pary (B, ℓ) wyłącznie gałęzi z daną o susceptancji — ta sama kolejność i te same
        # mnożenia co przed decyzją B-01 partii integracji 9 (zawężenie typu `float | None`
        # wprost w parze, nie w drugim przebiegu po liście).
        # Punkt neutralny sieci WYŁĄCZNIE z modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0
        # pkt 4) — dawny domyślny „isolated" zgadywał sieć, której model nie opisał.
        powod_uziemienia = brak_uziemienia_sn(model.uziemienie_sn)
        # Pojemność doczepna SIECI SN (ta sama prawda co punkt neutralny): gałęzie spoza sieci
        # SN (linie 110 kV, kable nN) nie należą do obwodu ferrorezonansowego sieci SN, a każda
        # galwanicznie połączona sieć SN (sekcje rozdzielone otwartym sprzęgłem) jest osobnym
        # obwodem — ryzyko rozstrzyga sieć o największej pojemności, nie suma po modelu.
        sieci_sn = (
            model.uziemienie_sn.sieci
            if powod_uziemienia is None and model.uziemienie_sn is not None
            else []
        )
        b_i_dlugosc_sieci = [
            [
                (b, branch.length_km)
                for branch in model.branches
                if (b := branch.b_siemens_per_km) is not None and branch.ref in galezie
            ]
            for galezie in (frozenset(siec.galezie_sieci) for siec in sieci_sn)
        ]
        b_i_dlugosc = [para for pary in b_i_dlugosc_sieci for para in pary]
        suma_b_l = max(
            (sum(b * length_km for b, length_km in pary) for pary in b_i_dlugosc_sieci),
            default=0.0,
        )
        siec_izolowana = (
            powod_uziemienia is None
            and model.uziemienie_sn is not None
            and model.uziemienie_sn.wariant == "izolowany"
        )
        ferro_ocenialne = powod_uziemienia is None and (bool(b_i_dlugosc) or not siec_izolowana)
        ferro_risk: bool | None = (
            None if powod_uziemienia is not None else siec_izolowana and suma_b_l > 1e-5
        )
        szczyt = None if szczyt_kv is None else _round(szczyt_kv, 5)
        opis_braku_trv = (
            "Brak parametrów obwodu napięcia powrotnego ("
            + ", ".join(_NAZWY_PARAMETROW_TRV[k] for k in brak_trv)
            + ") — przebiegu napięcia powrotnego nie wyznaczono; wartości zastępczej nie przyjęto."
        )
        trace.add(
            "trv_inrush_ferro",
            "u_TRV(t)=Ur*(1-cos(wn*t))*exp(-t/tau)+Ur/sqrt(3)",
            {
                "u_r_kv": u_r,
                "f_n_hz": natural_frequency_hz,
                "tau_s": tau_s,
                "inrush_multiple_in": inrush_multiple,
            },
            (
                opis_braku_trv
                if brak_trv
                else "Przebieg napięcia powrotnego 2–100 µs wyznaczono z parametrów obwodu; "
                "obwiedni wytrzymałości wyłącznika nie przyjęto (wartość szczytowa obwiedni "
                "i czas do jej osiągnięcia z tabel IEC 62271-100 nie są danymi programu)."
            ),
            {"trv_peak_kv": szczyt, "ferro_risk": ferro_risk},
            "Napięcie powrotne w [kV] (iloczyn napięcia [kV] i czynników bezwymiarowych).",
            result_pl=(
                "Przebiegu napięcia powrotnego nie wyznaczono — brak parametrów obwodu"
                if szczyt is None
                else f"Największa wartość napięcia powrotnego: {_lp_tekst(szczyt)} kV"
            ),
        )
        # K-08: sanity-bounds IEC 62271 — szczyt TRV skończony, krotność udaru i 2. harmoniczna fizyczne.
        sanity = _sanity_block(
            [
                (
                    "trv_peak_finite",
                    szczyt_kv is not None and _finite(szczyt_kv) and szczyt_kv >= 0.0,
                    "Szczyt napięcia powrotnego ujemny, nieskończony albo niewyznaczony",
                ),
                (
                    "inrush_multiple_range",
                    inrush_multiple is not None
                    and _finite(inrush_multiple)
                    and 0.0 < inrush_multiple <= 30.0,
                    "Krotność prądu załączania poza przedziałem do 30-krotności prądu "
                    "znamionowego (nierealna)",
                ),
                (
                    "second_harmonic_range",
                    second_harmonic_percent is not None
                    and _finite(second_harmonic_percent)
                    and 0.0 <= second_harmonic_percent <= 100.0,
                    "Udział 2. harmonicznej poza [0,100]%",
                ),
            ],
            has_inputs=len(model.buses) > 0 and not brak_trv and inrush_multiple is not None,
        )
        brakujace = [
            *brak_trv,
            *([] if inrush_multiple is not None else ["inrush_multiple_in"]),
        ]
        opis_braku_udaru = (
            "Brak krotności prądu załączania transformatora (właściwość transformatora, model "
            "jej nie niesie) — udziału 2. harmonicznej nie wyznaczono; wartości zastępczej nie "
            "przyjęto."
        )
        # Komunikat braku we wspólnym kluczu kontraktu V12.6 (``message_pl`` + ``missing_fields``
        # — sekcja braków ekranu, ``SCIEZKA_BRAKOW``).
        komunikaty_brakow = [
            *([opis_braku_trv] if brak_trv else []),
            *([opis_braku_udaru] if inrush_multiple is None else []),
        ]
        return {
            "sanity": sanity,
            "trv_curve": points,
            "trv_peak_kv": szczyt,
            **({"message_pl": " ".join(komunikaty_brakow)} if komunikaty_brakow else {}),
            **({"missing_fields": brakujace} if brakujace else {}),
            "inrush": (
                {
                    "peak_multiple_in": inrush_multiple,
                    "second_harmonic_percent_of_peak": _round(second_harmonic_percent, 4),
                    "blocking_87t_recommended": second_harmonic_percent >= 10,
                }
                if inrush_multiple is not None and second_harmonic_percent is not None
                else {
                    "peak_multiple_in": None,
                    "second_harmonic_percent_of_peak": None,
                    "blocking_87t_recommended": None,
                    "brak_danych": opis_braku_udaru,
                }
            ),
            "ferroresonance": {
                "risk": ferro_risk,
                "recommendation": (
                    "zastosować rezystor tłumiący w obwodzie otwartego trójkąta "
                    "przekładników napięciowych"
                    if ferro_risk
                    else (
                        "ryzyka nie oceniono — sposób uziemienia sieci nieustalony"
                        if powod_uziemienia is not None
                        else "brak przesłanek do ferrorezonansu"
                    )
                ),
                **(
                    {}
                    if ferro_ocenialne
                    else {
                        "brak_danych": (
                            powod_uziemienia
                            if powod_uziemienia is not None
                            else (
                                "Sieć z punktem neutralnym izolowanym, a żaden element nie "
                                "niesie susceptancji doziemnej — pojemności doczepnej nie "
                                "zsumowano, więc ocena „brak przesłanek” wynika z braku danych, "
                                "nie z pomiaru."
                            )
                        )
                    }
                ),
            },
        }

    def _motor_starting(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        """Rozruch bezpośredni silnika: zapad napięcia, czas rozruchu wobec czasu utyku,
        moment rozruchowy wobec momentu obciążenia (bez werdyktu — ocenę kryteriów budują
        rekordy werdyktu na granicy wyniku, `application/analyses/v126_oceny.py`).

        I_n = P_n/(√3·U_n·cos φ_n·η_n) — cos φ_n i η_n z tabliczki silnika, a bez nich wartości
        robocze rejestru maszyn indukcyjnych (dane przyjęte ESTIMATED; dawne zaszyte 0,9 było
        iloczynem bez nazwy). I_r = k_LR·I_n. ΔU = |Z_th|·I_r/U_f — Z_th impedancja zastępcza
        sieci w węźle silnika (`_impedancja_zastepcza_szyny`; bez niej zapadu nie wyznacza się).
        Wskaźnik cieplny t_r/t_utyku: dopuszczalny czas utyku jest podany PRZY prądzie
        zablokowanego wirnika, więc porównuje się czasy (dawny mnożnik k_LR² liczył ten prąd
        drugi raz). M_r = 2·M_max/(1/s_k + s_k) — wzór Klossa przy s = 1, napięcie znamionowe.
        """
        from network_model.catalog.wartosci_robocze import (
            PARAMETR_COS_PHI_MASZYNY,
            PARAMETR_SPRAWNOSC,
            PROPOZYCJE_MASZYNY,
            RODZINA_MASZYNA_ASYNCHRONICZNA,
        )

        propozycje = PROPOZYCJE_MASZYNY[RODZINA_MASZYNA_ASYNCHRONICZNA]
        rows: list[JsonDict] = []
        for motor in model.motors:
            dane: list[JsonDict] = []
            cos_phi = motor.rated_power_factor
            if cos_phi is None:
                propozycja = propozycje[PARAMETR_COS_PHI_MASZYNY]
                assert propozycja.wartosc is not None
                cos_phi = float(propozycja.wartosc)
                dane.append(
                    {
                        "nazwa_pl": "Znamionowy współczynnik mocy silnika",
                        "wartosc": {"wartosc": cos_phi, "jednostka": "1"},
                        "powod_pl": f"{propozycja.uzasadnienie_pl} ({propozycja.odniesienie}).",
                        "jakosc": "ESTIMATED",
                    }
                )
            sprawnosc = motor.rated_efficiency
            if sprawnosc is None:
                propozycja = propozycje[PARAMETR_SPRAWNOSC]
                assert propozycja.wartosc is not None
                sprawnosc = float(propozycja.wartosc)
                dane.append(
                    {
                        "nazwa_pl": "Sprawność znamionowa silnika",
                        "wartosc": {"wartosc": sprawnosc, "jednostka": "1"},
                        "powod_pl": f"{propozycja.uzasadnienie_pl} ({propozycja.odniesienie}).",
                        "jakosc": "ESTIMATED",
                    }
                )
            i_n = motor.rated_kw / (math.sqrt(3) * motor.rated_voltage_kv * cos_phi * sprawnosc)
            i_start = i_n * motor.locked_rotor_multiplier
            z_th, powod_braku_z = self._impedancja_zastepcza_szyny(model, motor.bus_ref)
            du = (
                None
                if z_th is None
                else abs(z_th)
                * i_start
                / max(motor.rated_voltage_kv * 1000 / math.sqrt(3), 1e-9)
                * 100
            )
            time_ratio = motor.start_time_s / motor.allowable_locked_rotor_time_s
            torque_start = motor.max_torque_pu * 2 / (1 / motor.critical_slip + motor.critical_slip)
            wiersz: JsonDict = {
                "motor_ref": motor.ref,
                "bus_ref": motor.bus_ref,
                "rated_current_a": _round(i_n, 3),
                "i_start_a": _round(i_start, 3),
                "thevenin_impedance_ohm": (
                    None
                    if z_th is None
                    else {"r_ohm": _round(z_th.real, 6), "x_ohm": _round(z_th.imag, 6)}
                ),
                "voltage_dip_percent": None if du is None else _round(du, 4),
                "start_time_s": motor.start_time_s,
                "allowable_locked_rotor_time_s": motor.allowable_locked_rotor_time_s,
                "locked_rotor_time_ratio": _round(time_ratio, 4),
                "torque_start_pu": _round(torque_start, 4),
                "load_start_torque_pu": motor.load_start_torque_pu,
                "torque_margin_pu": _round(torque_start - motor.load_start_torque_pu, 4),
                "dane_przyjete": dane,
            }
            if powod_braku_z is not None:
                wiersz["message_pl"] = powod_braku_z
            rows.append(wiersz)
        trace.add(
            "motor_starting",
            "I_n = P_n/(√3·U_n·cos φ_n·η_n); I_r = k_LR·I_n; ΔU = |Z_th|·I_r/U_f·100 %; "
            "t_r/t_utyku; M_r = 2·M_max/(1/s_k + s_k)",
            {"motors": len(model.motors)},
            "Impedancja zastępcza sieci w węźle silnika — przekątna macierzy Z-bus sieci "
            "zwarciowej IEC 60909 modelu (przekładnia i współczynnik korekcyjny impedancji "
            "transformatorów, impedancja sieci zasilającej, impedancja podprzejściowa maszyn), "
            "odniesiona do napięcia znamionowego szyny; czas rozruchu odniesiony do "
            "dopuszczalnego czasu utyku przy prądzie zablokowanego wirnika.",
            {
                "voltage_dip_percent": [row["voltage_dip_percent"] for row in rows],
                "locked_rotor_time_ratio": [row["locked_rotor_time_ratio"] for row in rows],
                "torque_margin_pu": [row["torque_margin_pu"] for row in rows],
            },
            "Iloczyn prądu [A] i impedancji [Ω] odniesiony do napięcia [V] jest bezwymiarowy; "
            "razy 100 daje %; iloraz czasów [s/s] i momenty [p.u.] bezwymiarowe.",
            result_pl=(f"Wyznaczono wielkości rozruchu silników: {len(rows)}"),
        )
        # K-08: sanity-bounds — prąd rozruchu ≥ 0, zapad napięcia w [0,100]%, krotność LR fizyczna.
        i_start_values = [float(r["i_start_a"]) for r in rows]
        dip_values = [
            float(r["voltage_dip_percent"]) for r in rows if r["voltage_dip_percent"] is not None
        ]
        ratio_values = [float(r["locked_rotor_time_ratio"]) for r in rows]
        lr_values = [float(m.locked_rotor_multiplier) for m in model.motors]
        sanity = _sanity_block(
            [
                (
                    "i_start_nonneg",
                    _finite(*i_start_values) and all(v >= 0.0 for v in i_start_values),
                    "Prąd rozruchu < 0 lub nieskończony",
                ),
                (
                    "voltage_dip_range",
                    _finite(*dip_values) and all(0.0 <= v <= 100.0 for v in dip_values),
                    "Zapad napięcia poza [0,100]%",
                ),
                (
                    "lr_multiple_range",
                    _finite(*lr_values) and all(0.0 < v <= 12.0 for v in lr_values),
                    "Krotność prądu zablokowanego wirnika poza przedziałem do 12-krotności "
                    "prądu znamionowego",
                ),
                (
                    "time_ratio_nonneg",
                    _finite(*ratio_values) and all(v >= 0.0 for v in ratio_values),
                    "Iloraz czasu rozruchu i czasu utyku < 0 lub nieskończony",
                ),
            ],
            has_inputs=len(model.motors) > 0,
        )
        return {"motors": rows, "sanity": sanity}

    @staticmethod
    def _impedancja_zastepcza_szyny(
        model: V126AcademicInput, bus_ref: str
    ) -> tuple[complex | None, str | None]:
        """Impedancja zastępcza sieci (Thévenin) w węźle przy 50 Hz — z WEJŚCIA szyny
        (``thevenin_r_ohm``/``thevenin_x_ohm``): most modelu liczy ją kanonicznym budowniczym
        sieci zwarciowej IEC 60909 (`solver_input.v126_contracts.impedancje_zastepcze_szyn` —
        przekładnia transformatora, K_T, Z_Q, Z″ maszyn), solver jej nie odtwarza własną
        macierzą (decyzja O-26: bez czwartego budowniczego admitancji; dawna przekątna macierzy
        omowej V12.6 nie miała przekładni, więc szyna zasilana przez transformator zostawała
        bez wyniku).

        Zwraca ``(Z_th, powód braku)``; ``Z_th = None`` (nazwany brak, bez liczby zastępczej),
        gdy szyny nie ma w modelu albo wejście nie niesie jej impedancji zastępczej (wyspa bez
        źródła sieciowego i maszyny wirującej — brak impedancji do odniesienia)."""
        szyna = next((bus for bus in model.buses if bus.ref == bus_ref), None)
        if szyna is None:
            return None, f"Szyna {bus_ref} nie należy do modelu."
        if szyna.thevenin_r_ohm is None or szyna.thevenin_x_ohm is None:
            return (
                None,
                "Węzeł nie ma impedancji zastępczej sieci — w jego wyspie nie ma źródła "
                "sieciowego ani maszyny wirującej z impedancją do odniesienia.",
            )
        return complex(szyna.thevenin_r_ohm, szyna.thevenin_x_ohm), None

    @staticmethod
    def _hosting_capacity_bus_seed(seed_modelu: int, bus_ref: str) -> int:
        """Ziarno losowania WYŁĄCZNIE dla jednej szyny (karta HOSTING-RNG-IZOLACJA).

        Czysta funkcja pary (ziarno modelu, referencja szyny) — ten sam
        mechanizm haszujący co ziarno modelu (`_hash`). Bycie funkcją
        WYŁĄCZNIE tych dwóch argumentów dowodzi izolacji: podstrumień szyny nie
        może zależeć od niczego poza jej WŁASNĄ referencją i ziarnem modelu —
        obecność, liczba czy kolejność INNYCH szyn w modelu nie mają jak go
        poruszyć. Testowalna wprost (`test_v126_hosting_rng_izolacja.py`).
        """
        return int(_hash(f"{seed_modelu}:{bus_ref}")[:12], 16)

    @staticmethod
    def _projekcja_hostingu(model: V126AcademicInput) -> V126AcademicInput:
        """Wejście analizy zdolności przyłączeniowej zawężone do pól, które ta analiza CZYTA.

        JEDNO źródło zbioru pól dla ziarna losowania i dla obliczenia (predykaty parami):
        `_hosting_capacity` liczy WYŁĄCZNIE na tej projekcji, a ziarno modelu jest odciskiem
        tej samej projekcji. Projekcja budowana bez walidacji (`model_construct`) nie niesie
        wartości modelu spoza listy — pole wymagane spoza niej nie istnieje (odczyt kończy się
        błędem atrybutu), pole z wartością domyślną ma wartość domyślną kontraktu, nie modelu;
        wynik nie może więc zależeć od danych spoza odcisku. Dawne ziarno było
        odciskiem CAŁEGO modelu: zmiana liczby odbiorców, danych silnika czy uziomu zmieniała
        losowanie Monte Carlo, a więc wynik zdolności przyłączeniowej.

        Pola czytane: szyny — referencja, napięcie znamionowe, napięcie robocze, obciążenie
        czynne i impedancja zastępcza sieci Z_th (z mostu modelu — niesie w sobie sieć:
        gałęzie, transformatory z przekładnią, Z_Q i maszyny, więc ich zmiana zmienia ziarno
        przez Z_th); gałęzie — zacisk odbiorczy, stan i obciążalność (kryterium prądowe toru
        zasilającego szynę); liczba losowań Monte Carlo. Transformatory nie są czytane wprost.
        """
        szyny = [
            V126BusInput.model_construct(**_pola_elementu(bus, POLA_HOSTINGU_SZYNY))
            for bus in model.buses
        ]
        galezie = [
            V126BranchInput.model_construct(**_pola_elementu(branch, POLA_HOSTINGU_GALEZI))
            for branch in model.branches
        ]
        return V126AcademicInput.model_construct(
            buses=szyny,
            branches=galezie,
            parameters={
                "hosting_monte_carlo_n": int(model.parameters.get("hosting_monte_carlo_n", 1000))
            },
        )

    @staticmethod
    def _ziarno_hostingu(projekcja: V126AcademicInput) -> int:
        """Ziarno modelu analizy przepustowości: odcisk projekcji czytanych pól w postaci
        KANONICZNEJ — szyny i gałęzie posortowane wg referencji (to zbiory
        elementów sieci; kolejność wpisów jest artefaktem budowy modelu i nie może poruszyć
        losowania żadnej szyny — karta HOSTING-RNG-IZOLACJA, własność T1)."""

        odcisk = {
            "buses": sorted(
                (_pola_elementu(b, POLA_HOSTINGU_SZYNY) for b in projekcja.buses),
                key=lambda b: str(b["ref"]),
            ),
            "branches": sorted(
                (_pola_elementu(g, POLA_HOSTINGU_GALEZI) for g in projekcja.branches),
                key=lambda g: str(g["ref"]),
            ),
            "monte_carlo_n": projekcja.parameters["hosting_monte_carlo_n"],
        }
        return int(_hash(odcisk)[:12], 16)

    def _hosting_capacity(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        # Obliczenie i ziarno stoją na JEDNEJ projekcji czytanych pól (`_projekcja_hostingu`).
        model = self._projekcja_hostingu(model)
        seed = self._ziarno_hostingu(model)
        results: list[JsonDict] = []
        seeds_by_bus: JsonDict = {}
        impedancje_zastepcze: JsonDict = {}
        simulations = int(model.parameters["hosting_monte_carlo_n"])
        for bus in model.buses:
            # HOSTING-RNG-IZOLACJA (dług zarejestrowany przy MOST-WEJSCIA-V126,
            # ok. linii 1978-2005 sprzed naprawy): PRZED naprawą `rng` był
            # JEDNYM strumieniem DZIELONYM między WSZYSTKIE szyny — pętla
            # kandydatów kończyła się `break` w różnym miejscu per szyna, więc
            # LICZBA zużytych losowań szyny k przesuwała podstrumień szyny
            # k+1: wynik szyny zależał od losowań szyn POPRZEDNICH (dołożenie
            # niepowiązanej szyny albo zmiana kolejności szyn zmieniały wyniki
            # INNYCH szyn — fizycznie bezsensowne sprzężenie; determinizm
            # same-input=same-output był formalnie zachowany, ale izolacja
            # przedmiotowa złamana). Każda szyna dostaje teraz WŁASNY,
            # niezależny podstrumień wyprowadzony jawnie z pary (ziarno
            # modelu, `bus.ref`).
            seed_bus = self._hosting_capacity_bus_seed(seed, bus.ref)
            seeds_by_bus[bus.ref] = seed_bus
            rng = random.Random(seed_bus)
            z_th, powod_braku_z = self._impedancja_zastepcza_szyny(model, bus.ref)
            impedancje_zastepcze[bus.ref] = (
                None
                if z_th is None
                else {"r_ohm": _round(z_th.real, 6), "x_ohm": _round(z_th.imag, 6)}
            )
            if z_th is None:
                results.append(
                    {
                        "bus_ref": bus.ref,
                        "hosting_capacity_mw": None,
                        "critical_limit": None,
                        "confidence_percent": 95,
                        "monte_carlo_n": simulations,
                        "brak_danych": powod_braku_z,
                    }
                )
                continue
            z = abs(z_th)
            accepted = 0.0
            limiting = "U_max"
            # Obciążalność toru zasilającego szynę — WYŁĄCZNIE z elementów, które
            # ją niosą. Przed kartą MOST-WEJSCIA-V126 stało tu `default=300.0`,
            # więc szyna bez ani jednego dowiązanego elementu z obciążalnością
            # (np. szyna GPZ, do której nic nie wchodzi) dostawała kryterium
            # prądowe policzone z liczby wziętej z powietrza. Odczyt wyniesiony
            # też POZA pętlę Monte Carlo — nie zależy od losowania, a liczył się
            # sto tysięcy razy na szynę.
            # Gałąź otwarta nie jest torem zasilającym — jej obciążalność nie ogranicza szyny.
            obciazalnosci = [
                branch.ampacity_a
                for branch in model.branches
                if branch.to_bus_ref == bus.ref
                and not branch.is_open
                and branch.ampacity_a is not None
            ]
            ampacity = max(obciazalnosci) if obciazalnosci else None
            for candidate_mw in [x * 0.1 for x in range(1, 101)]:
                ok = 0
                for _ in range(simulations):
                    load_factor = rng.betavariate(5, 2)
                    pv_factor = min(1.2, max(0.0, rng.gauss(0.75, 0.15)))
                    net_gen = candidate_mw * pv_factor - bus.load_mw * load_factor
                    dv = net_gen * z / max(bus.nominal_kv**2, 1e-9)
                    voltage = bus.voltage_pu + dv
                    current = abs(net_gen) * 1000 / (math.sqrt(3) * bus.nominal_kv)
                    # Kryterium napięciowe stoi na danych, które są, więc liczy się
                    # zawsze. Kryterium prądowe NIE JEST stosowane, gdy nie ma z
                    # czym porównać — wynik ogranicza wtedy samo napięcie, a brak
                    # obciążalności jest zameldowany przy szynie (nigdy udawany
                    # domyślną liczbą, nigdy też cicho pomijany).
                    kryterium_pradowe = ampacity is None or current <= ampacity
                    if 0.90 <= voltage <= 1.10 and kryterium_pradowe:
                        ok += 1
                probability = ok / simulations
                if probability >= 0.95:
                    accepted = candidate_mw
                else:
                    limiting = "I_galaz" if ampacity is not None and current > ampacity else "U_max"
                    break
            pozycja: JsonDict = {
                "bus_ref": bus.ref,
                "hosting_capacity_mw": _round(accepted, 3),
                "critical_limit": limiting,
                "confidence_percent": 95,
                "monte_carlo_n": simulations,
            }
            if ampacity is None:
                pozycja["brak_danych"] = (
                    "Żaden element zasilający tę szynę nie ma obciążalności długotrwałej "
                    "— kryterium prądowe pominięto, ograniczeniem jest wyłącznie napięcie."
                )
            results.append(pozycja)
        trace.add(
            "stochastic_hosting_capacity",
            "P_przyl = max(P_gen) przy prawdopodobieństwie spełnienia kryteriów ≥ 95%",
            {
                "simulations": simulations,
                "seed_model": seed,
                "seed_bus_rule": "int(sha256(f'{seed_model}:{bus_ref}')[:12], 16)",
                "seeds_by_bus": seeds_by_bus,
                "impedancje_zastepcze_ohm": impedancje_zastepcze,
            },
            "Zmiana napięcia jako iloczyn mocy netto i modułu impedancji zastępczej sieci "
            "odniesiony do kwadratu napięcia znamionowego; impedancja zastępcza to przekątna "
            "macierzy Z-bus sieci zwarciowej IEC 60909 modelu w szynie (przekładnia i współczynnik "
            "korekcyjny impedancji transformatorów, impedancja sieci zasilającej, impedancja "
            "podprzejściowa maszyn). "
            "Obciążenie losowane z rozkładu beta, generacja z rozkładu normalnego obciętego "
            "do zakresu fizycznego; KAŻDA szyna losuje z WŁASNEGO podstrumienia — ziarno "
            "szyny wyprowadzone jawnie z pary (ziarno modelu, referencja szyny), więc "
            "wynik jednej szyny nie zależy od losowań zużytych przez inne szyny (karta "
            "HOSTING-RNG-IZOLACJA); ziarno modelu wyprowadzone z odcisku WYŁĄCZNIE pól, "
            "które analiza czyta (powtarzalność wyniku; zmiana danych, których analiza nie "
            "czyta, nie porusza losowania).",
            {"buses": len(results)},
            "Moc przyłączeniowa w [MW]; prawdopodobieństwo bezwymiarowe.",
            result_pl=(f"Zbadano węzłów: {len(results)}"),
        )
        # K-08: sanity-bounds — pojemność przyłączeniowa ≥ 0, skończona, w obrębie skanu (≤ 10 MW).
        hc_values = [
            float(r["hosting_capacity_mw"]) for r in results if r["hosting_capacity_mw"] is not None
        ]
        sanity = _sanity_block(
            [
                (
                    "hc_nonneg",
                    _finite(*hc_values) and all(v >= 0.0 for v in hc_values),
                    "Pojemność przyłączeniowa < 0 lub nieskończona",
                ),
                (
                    "hc_within_scan",
                    all(v <= 10.0 for v in hc_values),
                    "Pojemność > zakresu skanowania (10 MW) — błąd procedury",
                ),
            ],
            has_inputs=len(model.buses) > 0,
        )
        return {"hosting_capacity": results, "sanity": sanity}

    def _opf_loss_lcc(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        branch_rows: list[JsonDict] = []
        total_kw = 0.0
        for branch in model.branches:
            current = self._branch_current_a(model, branch)
            losses_kw = 3 * current**2 * branch.r_ohm_per_km * branch.length_km / 1000
            total_kw += losses_kw
            branch_rows.append(
                {
                    "branch_ref": branch.ref,
                    "loss_kw": _round(losses_kw, 5),
                    "current_a": _round(current, 3),
                }
            )
        # Straty jałowe P0 nieznane (`p0_kw is None`, legalny brak w modelu) to brak danych,
        # nie zero strat: bilans strat i LCC odmawia z rekordem strukturalnym (decyzja B-01
        # partii integracji 9; wcześniej `None + float` kończył bieg błędem programu).
        bez_p0 = sorted(t.ref for t in model.transformers if t.p0_kw is None)
        if bez_p0:
            raise OdmowaWejsciaRdzenia(
                [
                    RekordOdmowy(
                        KOD_TRANSFORMATOR_BEZ_STRAT_JALOWYCH,
                        "Bilans strat i koszt cyklu życia wymagają strat jałowych z karty "
                        "katalogowej transformatora; transformatorów bez strat jałowych: "
                        f"{len(bez_p0)}.",
                        tuple(OdwolanieElementu(RODZAJ_ELEMENT, ref) for ref in bez_p0),
                    )
                ]
            )
        transformer_kw = sum(
            p0_kw + transformer.pk_kw * 0.45**2
            for transformer in model.transformers
            if (p0_kw := transformer.p0_kw) is not None
        )
        total_kw += transformer_kw
        energy_price = float(model.parameters.get("energy_price_pln_per_kwh", 0.65))
        discount = float(model.parameters.get("discount_rate", 0.05))
        years = int(model.parameters.get("lcc_years", 30))
        annual_kwh = total_kw * float(model.parameters.get("loss_hours_per_year", 4000.0))
        opex_pv = sum(
            annual_kwh * energy_price / ((1 + discount) ** year) for year in range(1, years + 1)
        )
        co2_factor = float(model.parameters.get("co2_kg_per_kwh", 0.72))
        # D-14: sanity-bounds — straty i koszty fizycznie nieujemne i skończone.
        annual_co2 = annual_kwh * co2_factor
        sanity = _sanity_block(
            [
                ("losses_nonneg", total_kw >= 0.0, "Straty całkowite < 0 (niefizyczne)"),
                ("losses_finite", math.isfinite(total_kw), "Straty nieskończone/NaN"),
                ("losses_upper", total_kw <= 1.0e6, "Straty > 1 GW na sieci SN (absurd)"),
                ("opex_nonneg", opex_pv >= 0.0, "LCC OPEX PV < 0 (niefizyczne)"),
                ("co2_nonneg", annual_co2 >= 0.0, "Emisja CO2 < 0 (niefizyczne)"),
            ],
            has_inputs=len(model.branches) > 0 or len(model.transformers) > 0,
        )
        trace.add(
            "opf_losses_lcc",
            "DeltaP = 3*I^2*R; LCC = CAPEX + sum(OPEX_t/(1+r)^t)",
            {"branches": len(model.branches), "years": years, "discount_rate": discount},
            "Prąd gałęzi wyznaczony z obciążenia węzła docelowego; wariant o najmniejszych "
            "stratach wybierany przy ograniczeniach napięcia, obciążalności i mocy biernej.",
            {"total_losses_kw": _round(total_kw, 5), "annual_kwh": _round(annual_kwh, 3)},
            "Kwadrat prądu [A²] razy rezystancja [Ω] daje moc [W]; moc [kW] razy czas [h] daje energię [kWh].",
            result_pl=(
                f"Straty mocy: {_lp_tekst(_round(total_kw, 5))} kW; straty energii: {_lp_tekst(_round(annual_kwh, 3))} kWh/rok"
            ),
        )
        return {
            "objective": "min_delta_p_losses",
            "branch_losses": branch_rows,
            "transformer_losses_kw": _round(transformer_kw, 5),
            "total_losses_kw": _round(total_kw, 5),
            "annual_losses_kwh": _round(annual_kwh, 3),
            "lcc_loss_opex_pv_pln": _round(opex_pv, 2),
            "annual_co2_kg": _round(annual_co2, 3),
            "decision_variables": {
                "oltc_tap_position": 0,
                "nop_position_ref": next(
                    (branch.ref for branch in model.branches if branch.is_open), None
                ),
                "q_set_strategy": "minimize_losses_with_voltage_limits",
            },
            "sanity": sanity,
        }

    def _benchmark_validation(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        references = model.parameters.get("benchmark_references")
        if not isinstance(references, list) or not references:
            # D-14 / K-09: NIE fabrykujemy zaliczających literałów (calc≈ref) — to
            # był cichy fałsz (zawsze PASS niezależnie od solvera). Bez realnych
            # referencji (IEEE 9/14/39, CIGRE MV) z wartościami policzonymi przez
            # solver werdykt NIE jest wystawiany.
            trace.add(
                "benchmark_regression",
                "delta_percent = |calc - ref| / |ref| * 100%",
                {"benchmarks": 0, "references_provided": False},
                "Brak wartości referencyjnych w danych wejściowych — walidacji nie wykonano.",
                {"status": "dane niekompletne"},
                "Brak wartości referencyjnych sieci odniesienia.",
                result_pl=("Walidacji nie wykonano — brak wartości referencyjnych"),
            )
            return {
                "validation_report": [],
                "status": "dane niekompletne",
                "references_provided": False,
                "message_pl": (
                    "Walidacja benchmarkowa wymaga referencji (IEEE 9/14/39-bus, "
                    "CIGRE MV) z wartościami policzonymi przez solver. Bez nich "
                    "odchyłki nie wyznacza się i oceny nie wystawia (zakaz cichego fałszu K-09)."
                ),
                "sanity": _sanity_block([], has_inputs=False),
            }
        rows: list[JsonDict] = []
        proof_types: set[str] = set()
        for item in references:
            ref = float(item["reference"])
            calc = float(item["calculated"])
            delta = abs(calc - ref) / max(abs(ref), 1e-9) * 100.0
            tol = float(item["tolerance_percent"])
            # K-09: each reference may declare its provenance/proof type. When a row
            # carries a cross-validation marker (e.g. IEEE 9/14/39 vs pandapower) we
            # surface it so the proof can state HOW the reference was obtained. Refs
            # without a marker keep the generic benchmark-regression type.
            row_proof_type = str(item.get("proof_type", "benchmark_regression"))
            proof_types.add(row_proof_type)
            rows.append(
                {
                    "network": item["network"],
                    "test": item["test"],
                    "reference": ref,
                    "calculated": calc,
                    "tolerance_percent": tol,
                    "delta_percent": _round(delta, 5),
                    "proof_type": row_proof_type,
                }
            )
        # A single overall proof type when homogeneous; otherwise the neutral label.
        overall_proof_type = (
            next(iter(proof_types)) if len(proof_types) == 1 else "benchmark_regression"
        )
        trace.add(
            "benchmark_regression",
            "delta_percent = |calc - ref| / |ref| * 100%",
            {"benchmarks": len(rows), "proof_type": overall_proof_type},
            "Porównanie wyników solvera z wartościami referencyjnymi sieci odniesienia "
            "IEEE / CIGRE.",
            {"max_deviation_percent": max((row["delta_percent"] for row in rows), default=0.0)},
            "Wielkości tego samego rodzaju; odchyłka wyrażona w %.",
            result_pl=(
                f"Największa odchyłka od referencji: "
                f"{_lp_tekst(max((row['delta_percent'] for row in rows), default=0.0))} %"
            ),
        )
        return {
            "validation_report": rows,
            "references_provided": True,
            "proof_type": overall_proof_type,
        }

    def _uncertainty(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        sensitivities: list[JsonDict] = []
        total_variance = 0.0
        for transformer in model.transformers:
            influence = 0.10 * transformer.uk_percent
            total_variance += influence**2
            sensitivities.append(
                {
                    "parameter": f"{transformer.ref}.uk_percent",
                    "sigma_contribution_percent": _round(influence, 5),
                }
            )
        for branch in model.branches:
            z = abs(self._branch_z_ohm(branch))
            influence = 0.05 * z
            total_variance += influence**2
            sensitivities.append(
                {
                    "parameter": f"{branch.ref}.z_ohm",
                    "sigma_contribution_percent": _round(influence, 5),
                }
            )
        for bus in model.buses:
            if bus.fault_level_mva:
                influence = 0.10 * bus.fault_level_mva / 100.0
                total_variance += influence**2
                sensitivities.append(
                    {
                        "parameter": f"{bus.ref}.s_sc_mva",
                        "sigma_contribution_percent": _round(influence, 5),
                    }
                )
        expanded = 2 * math.sqrt(total_variance)
        trace.add(
            "uncertainty_propagation",
            "sigma_Y^2 = sum((dY/dx_i * sigma_x_i)^2); U95 = 2*sigma_Y",
            {"parameters": len(sensitivities)},
            "Tolerancje katalogowe propagowane jako niezależne składowe wariancji wyniku.",
            {"expanded_uncertainty_percent_k2": _round(expanded, 5)},
            "Pierwiastek z sumy kwadratów udziałów procentowych daje niepewność w %.",
            result_pl=(f"Niepewność rozszerzona (k = 2): {_lp_tekst(_round(expanded, 5))} %"),
        )
        ranked = sorted(sensitivities, key=lambda item: -item["sigma_contribution_percent"])
        total = sum(item["sigma_contribution_percent"] for item in ranked) or 1.0
        for item in ranked:
            item["share_percent"] = _round(item["sigma_contribution_percent"] / total * 100.0, 4)
        # D-14: sanity — niepewność rozszerzona k=2 nieujemna, skończona; > 100%
        # oznacza wynik bezużyteczny (poza zakresem wiarygodności).
        sanity = _sanity_block(
            [
                ("u_nonneg", expanded >= 0.0, "Niepewność k=2 < 0 (niefizyczne)"),
                ("u_finite", math.isfinite(expanded), "Niepewność nieskończona/NaN"),
                (
                    "u_upper",
                    expanded <= 100.0,
                    "Niepewność rozszerzona k=2 > 100% — wynik niewiarygodny",
                ),
            ],
            has_inputs=len(sensitivities) > 0,
        )
        return {
            "expanded_uncertainty_percent_k2": _round(expanded, 5),
            "sensitivity_ranking": ranked[:20],
            "display_contract": "wartość nominalna ± niepewność rozszerzona k=2",
            "sanity": sanity,
        }
