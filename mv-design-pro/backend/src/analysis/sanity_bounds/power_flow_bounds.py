"""Sanity-bounds dla rozpływu mocy: napięcia, obciążenia gałęzi, straty (K-08).

Warstwa INTERPRETACJI (Z15), siostra ``short_circuit_bounds.py`` — ten sam
werdykt trójstanowy (w paśmie wiarygodności / poza zakresem wiarygodności / dane
niekompletne), ta sama zasada: czyta GOTOWY wynik solvera (rozpływu, FROZEN) i
ocenia jego WIARYGODNOŚĆ, NIE liczy fizyki. Karta W3-G2 (KARTA_W3_KONWERGENCJA_
FIZYKI_2026-09.md §0.17, mapa aneks D4): do tej karty ``analysis/sanity_bounds/``
dawał pasma wiarygodności WYŁĄCZNIE dla zwarć — rozpływ nie miał żadnej bramki
„czy ten wynik jest fizycznie sensowny".

Trzy niezależne oceny (§0.17, dosłownie):
1. Napięcia szyn w paśmie Un ± 10 % — norma PN-EN 50160 (cytat w
   ``NORMA_NAPIECIA_PL``, jedno miejsce; mapa 6 #10 „zintegrowany raport EN
   50160 — 6 plików z progiem 50160 lokalnie": ten moduł jest odtąd JEDNYM
   źródłem prawdy progu KREDYBILNOŚCI napięcia — domknięcie CZĘŚCIOWE 6 #10,
   bo pełny zintegrowany raport PQ/EN 50160 to osobna, większa zdolność, patrz
   inwentarz klasy w meldunku karty).
2. Obciążenie gałęzi wobec prądu znamionowego KAŻDEGO zacisku (decyzja O-51):
   linia i kabel — In z katalogu na obu zaciskach; transformator — prąd znamionowy
   zacisku I_r = S_n/(√3·U_n,strona) (IEC 60076-1, przez `network_model/pochodne`).
   Obciążenie = max(I_od/I_r,od; I_do/I_r,do) z JEDNEJ funkcji
   (`analysis/obciazenie_galezi.py`, ta sama co tabela gałęzi i walidacja
   energetyczna) — kabel z susceptancją i transformator mają na końcach różne
   prądy, więc ocena z jednego zacisku zaniżała obciążenie. Brak danej
   znamionowej albo prądu zacisku daje stan „dane niekompletne" z nazwanym
   powodem, NIGDY podstawienie 0/inf (solver_input_substitute_guard).
3. Straty czynne sieci wobec sumy mocy czynnej odbiorów — próg JAWNY,
   NAZWANY parametr z uzasadnieniem inżynierskim (``DOMYSLNY_PROG_STRAT_
   PROCENT``/``UZASADNIENIE_PROGU_STRAT_PL``), nie zaszyta stała bez źródła.

Różnica wobec ``analysis/energy_validation`` (istniejący, ODDZIELNY moduł —
NIE duplikat, inna klasa): tamten ocenia ZGODNOŚĆ PROJEKTOWĄ (PASS/WARNING/FAIL
wobec progów jakości 80 %/100 %/5 %/10 %, cel: czy sieć spełnia kryteria
inżynierskie). Ten moduł ocenia KREDYBILNOŚĆ WYNIKU SOLVERA (w paśmie
wiarygodności/poza zakresem wiarygodności/dane niekompletne, cel: czy liczba w ogóle jest
wiarygodna fizycznie, zanim trafi do pakietu OSD) — dokładnie ta sama różnica
celu, która już istnieje między tym pakietem a ``energy_validation`` dla zwarć
(Ik'' ma OBA: „poza zakresem wiarygodności" tutaj ORAZ osobne progi jakości
gdzie indziej). Progi liczbowe (±10 % napięcia, 100 % obciążenia) CELOWO
pokrywają się z granicami FAIL walidacji energetycznej — to nie przypadek: obie
klasy patrzą na tę samą fizyczną granicę normy, z różnym pytaniem.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from analysis.normative.kryteria_napiecia import PASMO_WIARYGODNOSCI_PROCENT
from analysis.obciazenie_galezi import ObciazenieGalezi, Zacisk
from analysis.sanity_bounds.oceny import (
    CREDIBLE,
    INCOMPLETE,
    OUT_OF_RANGE,
    PODSTAWA_PASMA_NAPIECIA,
    PODSTAWA_PASMA_OBCIAZENIA,
    kod_wiarygodnosci,
    liczba_pl,
    ocena_pasma,
    podstawa_pasma_strat,
)
from network_model.pochodne import a_na_ka
from werdykt import OcenaKryterium, WyjasnienieWerdyktu

__all__ = [
    "CREDIBLE",
    "DOMYSLNY_PROG_STRAT_PROCENT",
    "INCOMPLETE",
    "NORMA_NAPIECIA_PL",
    "OUT_OF_RANGE",
    "PASMO_NAPIECIA_PROCENT",
    "UZASADNIENIE_PROGU_STRAT_PL",
    "BranchLoadingSanityVerdict",
    "NetworkLossesSanityVerdict",
    "VoltageBandSanityVerdict",
    "evaluate_branch_loading",
    "evaluate_bus_voltage",
    "evaluate_network_losses",
    "ocena_napiecia_szyny",
    "ocena_obciazenia_galezi",
    "loading_verdict_bez_wyniku",
    "losses_verdict_bez_wyniku",
    "ocena_strat_sieci",
    "voltage_verdict_bez_wyniku",
]

#: Cytat normy dla pasma napięciowego (jedno miejsce — mapa 6 #10, domknięcie
#: częściowe). PN-EN 50160 określa dopuszczalne odchylenia napięcia zasilającego
#: w publicznych sieciach elektroenergetycznych; ± 10 % Un to granica normalnej
#: pracy sieci przywołana w §0.17 karty W3.
NORMA_NAPIECIA_PL = (
    "PN-EN 50160 (Parametry napięcia zasilającego w publicznych sieciach "
    "elektroenergetycznych) — zmiany napięcia zasilającego w warunkach normalnej "
    "pracy: Un ± 10 %."
)

#: Szerokość pasma wiarygodności napięcia [%] wokół Un (± PASMO_NAPIECIA_PROCENT).
#: Jedno źródło prawdy (karta W3-J): `analysis.normative.kryteria_napiecia.
#: PASMO_WIARYGODNOSCI_PROCENT` — nazwa pola tego modułu i wynik (10.0)
#: bit w bit bez zmian, wyłącznie źródło liczby jest wspólne.
PASMO_NAPIECIA_PROCENT: float = PASMO_WIARYGODNOSCI_PROCENT

#: Domyślny próg wiarygodności strat czynnych rozpływu, jako % sumy mocy czynnej
#: odbiorów (JAWNY parametr — patrz ``evaluate_network_losses``, nie zaszyta
#: stała bez źródła). UZASADNIENIE INŻYNIERSKIE: typowe straty czynne sieci SN
#: mieszczą się w przedziale ok. 2-6 % mocy dostarczonej do odbiorów (dane
#: eksploatacyjne OSD, sprawozdawczość strat sieciowych); 10 % to górna granica
#: WIARYGODNOŚCI wyniku solvera (nie granica projektowa energy_validation) —
#: prawie dwukrotność typowej górnej wartości technicznej, więc przekroczenie
#: tego progu wskazuje raczej błąd modelu (zawyżona impedancja gałęzi, błędna
#: topologia, zdegenerowany przypadek obliczeniowy) niż rzeczywistą fizykę sieci.
DOMYSLNY_PROG_STRAT_PROCENT: float = 10.0

#: Uzasadnienie progu strat — towarzyszy KAŻDEMU werdyktowi (API/UI), żeby próg
#: nigdy nie był „zaszytą stałą bez źródła".
UZASADNIENIE_PROGU_STRAT_PL = (
    "Typowe straty czynne sieci SN wynoszą ok. 2-6 % mocy dostarczonej do "
    "odbiorów (dane eksploatacyjne OSD). 10 % to górna granica WIARYGODNOŚCI "
    "wyniku solvera (nie granica projektowa) — powyżej niej wynik prawdopodobnie "
    "sygnalizuje błąd modelu (zawyżona impedancja gałęzi, błędna topologia), a "
    "nie rzeczywistą fizykę sieci."
)


def _is_finite(value: float) -> bool:
    return value == value and value not in (float("inf"), float("-inf"))


# =============================================================================
# 1. Napięcia szyn — Un ± 10 % (PN-EN 50160)
# =============================================================================


@dataclass(frozen=True)
class VoltageBandSanityVerdict:
    nominal_kv: float | None
    actual_kv: float | None
    lower_kv: float | None
    upper_kv: float | None
    deviation_pct: float | None
    in_range: bool
    status: str
    ocena: OcenaKryterium
    wyjasnienie: WyjasnienieWerdyktu
    why_pl: str

    def to_dict(self) -> dict[str, object]:
        return {
            "ocena": self.ocena.model_dump(mode="json"),
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "nominal_kv": self.nominal_kv,
            "actual_kv": self.actual_kv,
            "lower_kv": self.lower_kv,
            "upper_kv": self.upper_kv,
            "deviation_pct": self.deviation_pct,
            "in_range": self.in_range,
            "status": self.status,
            "why_pl": self.why_pl,
        }


def ocena_napiecia_szyny(
    *, wynik_kv: float | None, pasmo_kv: tuple[float, float] | None, braki: tuple[str, ...] = ()
) -> OcenaKryterium:
    """Rekord K napięcia szyny wobec pasma Un ± 10 % — jedno ciało dla biegu zbieżnego
    i niezbieżnego (``wynik_kv is None`` z nazwanym brakiem)."""
    return ocena_pasma(
        kryterium_id="wiarygodnosc.napiecie_szyny",
        opis_pl="Napięcie szyny w paśmie Un ± 10 % (wiarygodność wyniku rozpływu)",
        warunek_latex=r"U_n (1 - 0{,}1) \le U \le U_n (1 + 0{,}1)",
        wielkosc_pl="napięcie szyny",
        symbol_latex="U",
        jednostka="kV",
        relacja="PASMO",
        wynik=wynik_kv,
        pasmo=pasmo_kv,
        nazwa_pl="szyna",
        opis_przedmiotu_pl="Szyna w stanie ustalonym biegu rozpływu",
        podstawa=PODSTAWA_PASMA_NAPIECIA,
        rodzaj_analizy="POWER_FLOW",
        braki=braki,
    )


def _werdykt_napiecia(
    *,
    nominal_kv: float | None,
    actual_kv: float | None,
    lower_kv: float | None,
    upper_kv: float | None,
    deviation_pct: float | None,
    why_pl: str,
    braki: tuple[str, ...] = (),
) -> VoltageBandSanityVerdict:
    ocena = ocena_napiecia_szyny(
        wynik_kv=actual_kv,
        pasmo_kv=None if lower_kv is None or upper_kv is None else (lower_kv, upper_kv),
        braki=braki,
    )
    status = kod_wiarygodnosci(ocena)
    return VoltageBandSanityVerdict(
        nominal_kv=nominal_kv,
        actual_kv=actual_kv,
        lower_kv=lower_kv,
        upper_kv=upper_kv,
        deviation_pct=deviation_pct,
        in_range=status == CREDIBLE,
        status=status,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        why_pl=why_pl,
    )


def voltage_verdict_bez_wyniku(nominal_kv: float | None, powod_pl: str) -> VoltageBandSanityVerdict:
    """Werdykt napięcia bez wyniku solvera (np. bieg niezbieżny) — ``powod_pl`` nazywa brak."""
    return _werdykt_napiecia(
        nominal_kv=nominal_kv,
        actual_kv=None,
        lower_kv=None,
        upper_kv=None,
        deviation_pct=None,
        why_pl=powod_pl,
        braki=(powod_pl,),
    )


def evaluate_bus_voltage(
    nominal_kv: float | None,
    actual_kv: float | None,
) -> VoltageBandSanityVerdict:
    """Ocena wiarygodności napięcia szyny wobec pasma Un ± 10 % (PN-EN 50160)."""
    if (
        nominal_kv is None
        or actual_kv is None
        or nominal_kv <= 0.0
        or not _is_finite(nominal_kv)
        or not _is_finite(actual_kv)
    ):
        powod = "Brak poprawnego napięcia znamionowego lub wyniku napięcia do oceny wiarygodności."
        return voltage_verdict_bez_wyniku(nominal_kv, powod)
    lower_kv = nominal_kv * (1.0 - PASMO_NAPIECIA_PROCENT / 100.0)
    upper_kv = nominal_kv * (1.0 + PASMO_NAPIECIA_PROCENT / 100.0)
    deviation_pct = abs(actual_kv - nominal_kv) / nominal_kv * 100.0
    # Jedno zdanie liczbowe dla każdego stanu — rozstrzygnięcie niesie rekord ``ocena``.
    why = (
        f"U = {liczba_pl(actual_kv, '.3f')} kV wobec pasma "
        f"[{liczba_pl(lower_kv, '.3f')}; {liczba_pl(upper_kv, '.3f')}] kV "
        f"(Un = {liczba_pl(nominal_kv, 'g')} kV ± {PASMO_NAPIECIA_PROCENT:.0f} %, odchylenie "
        f"{liczba_pl(deviation_pct, '.2f')} %)."
    )
    werdykt = _werdykt_napiecia(
        nominal_kv=nominal_kv,
        actual_kv=actual_kv,
        lower_kv=lower_kv,
        upper_kv=upper_kv,
        deviation_pct=deviation_pct,
        why_pl=why,
    )
    if werdykt.status != OUT_OF_RANGE:
        return werdykt
    # Skutek dla projektanta (nie słowo werdyktu): liczba poza pasmem wskazuje błąd modelu.
    return replace(werdykt, why_pl=why + " Wynik fizycznie wątpliwy — sprawdź model i jednostki.")


# =============================================================================
# 2. Obciążenie gałęzi — prądy obu zacisków wobec prądów znamionowych zacisków
# =============================================================================


@dataclass(frozen=True)
class BranchLoadingSanityVerdict:
    """Werdykt wiarygodności obciążenia gałęzi.

    `current_ka` i `rated_current_a` dotyczą zacisku DECYDUJĄCEGO (`zacisk_decydujacy`);
    pola `*_od_*` / `*_do_*` niosą oba zaciski (addytywnie, decyzja O-51).
    """

    current_ka: float | None
    rated_current_a: float | None
    loading_pct: float | None
    in_range: bool
    status: str
    ocena: OcenaKryterium
    wyjasnienie: WyjasnienieWerdyktu
    why_pl: str
    zacisk_decydujacy: Zacisk | None = None
    current_od_ka: float | None = None
    current_do_ka: float | None = None
    rated_current_od_a: float | None = None
    rated_current_do_a: float | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "current_ka": self.current_ka,
            "rated_current_a": self.rated_current_a,
            "loading_pct": self.loading_pct,
            "in_range": self.in_range,
            "status": self.status,
            "ocena": self.ocena.model_dump(mode="json"),
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "why_pl": self.why_pl,
            "zacisk_decydujacy": self.zacisk_decydujacy,
            "current_od_ka": self.current_od_ka,
            "current_do_ka": self.current_do_ka,
            "rated_current_od_a": self.rated_current_od_a,
            "rated_current_do_a": self.rated_current_do_a,
        }


def _ka_lub_brak(prad_a: float | None) -> float | None:
    return a_na_ka(prad_a) if prad_a is not None else None


def ocena_obciazenia_galezi(
    *, loading_pct: float | None, braki: tuple[str, ...] = ()
) -> OcenaKryterium:
    """Rekord K obciążenia gałęzi wobec 100 % prądu znamionowego zacisku decydującego."""
    return ocena_pasma(
        kryterium_id="wiarygodnosc.obciazenie_galezi",
        opis_pl="Obciążenie gałęzi nie większe od 100 % prądu znamionowego zacisku",
        warunek_latex=r"\varepsilon \le 100\%",
        wielkosc_pl="obciążenie gałęzi (zacisk decydujący)",
        symbol_latex=r"\varepsilon",
        jednostka="%",
        relacja="NIE_WIECEJ",
        wynik=loading_pct,
        limit=100.0,
        nazwa_pl="gałąź",
        opis_przedmiotu_pl="Gałąź w stanie ustalonym biegu rozpływu",
        podstawa=PODSTAWA_PASMA_OBCIAZENIA,
        rodzaj_analizy="POWER_FLOW",
        braki=braki,
    )


def loading_verdict_bez_wyniku(
    powod_pl: str,
    *,
    rated_current_od_a: float | None = None,
    rated_current_do_a: float | None = None,
    current_od_ka: float | None = None,
    current_do_ka: float | None = None,
) -> BranchLoadingSanityVerdict:
    """Werdykt obciążenia bez rozstrzygnięcia (brak prądu zacisku albo danej znamionowej,
    bieg niezbieżny) — ``powod_pl`` nazywa brak w rekordzie i w zdaniu."""
    ocena = ocena_obciazenia_galezi(loading_pct=None, braki=(powod_pl,))
    status = kod_wiarygodnosci(ocena)
    return BranchLoadingSanityVerdict(
        current_ka=None,
        rated_current_a=None,
        loading_pct=None,
        in_range=status == CREDIBLE,
        status=status,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        why_pl=powod_pl,
        zacisk_decydujacy=None,
        current_od_ka=current_od_ka,
        current_do_ka=current_do_ka,
        rated_current_od_a=rated_current_od_a,
        rated_current_do_a=rated_current_do_a,
    )


def evaluate_branch_loading(obciazenie: ObciazenieGalezi) -> BranchLoadingSanityVerdict:
    """Ocena wiarygodności obciążenia gałęzi wobec prądów znamionowych zacisków.

    Wejście pochodzi z JEDNEJ funkcji obciążenia (`analysis/obciazenie_galezi.py`).
    Brak prądu zacisku albo danej znamionowej daje „dane niekompletne" z powodem tej
    funkcji — NIGDY podstawienie 0/inf za brakującą daną (solver_input_substitute_guard,
    karta W3-G2 §Granice). W paśmie: obciążenie ≤ 100 % (prąd zacisku decydującego nie
    przekracza jego prądu znamionowego).
    """
    wspolne = {
        "current_od_ka": _ka_lub_brak(obciazenie.prad_od_a),
        "current_do_ka": _ka_lub_brak(obciazenie.prad_do_a),
        "rated_current_od_a": obciazenie.prad_znamionowy_od_a,
        "rated_current_do_a": obciazenie.prad_znamionowy_do_a,
    }
    if obciazenie.obciazenie_pct is None or obciazenie.zacisk_decydujacy is None:
        return loading_verdict_bez_wyniku(
            obciazenie.powod_braku_pl or "Brak danych do wyznaczenia obciążenia gałęzi.",
            **wspolne,
        )
    loading_pct = obciazenie.obciazenie_pct
    prad_ka = _ka_lub_brak(obciazenie.prad_decydujacy_a)
    znamionowy_a = obciazenie.prad_znamionowy_decydujacy_a
    assert prad_ka is not None and znamionowy_a is not None
    znamionowy_ka = a_na_ka(znamionowy_a)
    zacisk = obciazenie.zacisk_decydujacy
    ocena = ocena_obciazenia_galezi(loading_pct=loading_pct)
    status = kod_wiarygodnosci(ocena)
    # Jedno zdanie liczbowe dla każdego stanu — rozstrzygnięcie niesie rekord ``ocena``.
    why = (
        f"I = {liczba_pl(abs(prad_ka), '.4f')} kA (zacisk {zacisk}) wobec "
        f"I_r = {liczba_pl(znamionowy_ka, '.4f')} kA "
        f"tego zacisku (obciążenie {liczba_pl(loading_pct, '.1f')} %)."
    )
    if status == OUT_OF_RANGE:
        why += " Wynik fizycznie wątpliwy — sprawdź model i dobór przekroju gałęzi."
    return BranchLoadingSanityVerdict(
        current_ka=prad_ka,
        rated_current_a=znamionowy_a,
        loading_pct=loading_pct,
        in_range=status == CREDIBLE,
        status=status,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        why_pl=why,
        zacisk_decydujacy=zacisk,
        **wspolne,
    )


# =============================================================================
# 3. Straty czynne sieci — wobec sumy mocy czynnej odbiorów
# =============================================================================


@dataclass(frozen=True)
class NetworkLossesSanityVerdict:
    losses_active_mw: float | None
    load_active_total_mw: float | None
    losses_pct_of_load: float | None
    threshold_pct: float
    threshold_why_pl: str
    in_range: bool
    status: str
    ocena: OcenaKryterium
    wyjasnienie: WyjasnienieWerdyktu
    why_pl: str

    def to_dict(self) -> dict[str, object]:
        return {
            "losses_active_mw": self.losses_active_mw,
            "load_active_total_mw": self.load_active_total_mw,
            "losses_pct_of_load": self.losses_pct_of_load,
            "threshold_pct": self.threshold_pct,
            "threshold_why_pl": self.threshold_why_pl,
            "in_range": self.in_range,
            "status": self.status,
            "ocena": self.ocena.model_dump(mode="json"),
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "why_pl": self.why_pl,
        }


def ocena_strat_sieci(
    *, losses_pct: float | None, threshold_pct: float, braki: tuple[str, ...] = ()
) -> OcenaKryterium:
    """Rekord K strat czynnych sieci wobec progu wiarygodności."""
    return ocena_pasma(
        kryterium_id="wiarygodnosc.straty_sieci",
        opis_pl="Straty czynne sieci nie większe od progu wiarygodności wyniku rozpływu",
        warunek_latex=r"\Delta P\% \le \Delta P\%_{\text{próg}}",
        wielkosc_pl="straty czynne sieci odniesione do sumy mocy czynnej odbiorów",
        symbol_latex=r"\Delta P\%",
        jednostka="%",
        relacja="NIE_WIECEJ",
        wynik=losses_pct,
        limit=threshold_pct,
        nazwa_pl="sieć",
        opis_przedmiotu_pl="Cała sieć modelu w stanie ustalonym biegu rozpływu",
        podstawa=podstawa_pasma_strat(UZASADNIENIE_PROGU_STRAT_PL),
        rodzaj_analizy="POWER_FLOW",
        braki=braki,
    )


def losses_verdict_bez_wyniku(
    powod_pl: str,
    *,
    threshold_pct: float = DOMYSLNY_PROG_STRAT_PROCENT,
    losses_active_mw: float | None = None,
    load_active_total_mw: float | None = None,
) -> NetworkLossesSanityVerdict:
    """Werdykt strat bez rozstrzygnięcia — ``powod_pl`` nazywa brak w rekordzie i w zdaniu."""
    ocena = ocena_strat_sieci(losses_pct=None, threshold_pct=threshold_pct, braki=(powod_pl,))
    status = kod_wiarygodnosci(ocena)
    return NetworkLossesSanityVerdict(
        losses_active_mw=losses_active_mw,
        load_active_total_mw=load_active_total_mw,
        losses_pct_of_load=None,
        threshold_pct=threshold_pct,
        threshold_why_pl=UZASADNIENIE_PROGU_STRAT_PL,
        in_range=status == CREDIBLE,
        status=status,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        why_pl=powod_pl,
    )


def evaluate_network_losses(
    losses_active_mw: float | None,
    load_active_total_mw: float | None,
    threshold_pct: float = DOMYSLNY_PROG_STRAT_PROCENT,
) -> NetworkLossesSanityVerdict:
    """Ocena wiarygodności strat czynnych wobec sumy mocy czynnej odbiorów.

    ``threshold_pct`` jest JAWNYM parametrem z domyślną wartością nazwaną i
    uzasadnioną (``DOMYSLNY_PROG_STRAT_PROCENT``/``UZASADNIENIE_PROGU_STRAT_PL``)
    — nigdy zaszytym literałem bez źródła.
    """
    if (
        losses_active_mw is None
        or load_active_total_mw is None
        or not _is_finite(losses_active_mw)
        or not _is_finite(load_active_total_mw)
    ):
        return losses_verdict_bez_wyniku(
            "Brak strat czynnych lub sumy mocy czynnej odbiorów w wyniku "
            "rozpływu — budżet strat nieoznaczony.",
            threshold_pct=threshold_pct,
            losses_active_mw=losses_active_mw,
            load_active_total_mw=load_active_total_mw,
        )
    if load_active_total_mw <= 0.0:
        return losses_verdict_bez_wyniku(
            "Sieć bez odbiorów (suma mocy czynnej odbiorów = 0) — budżet strat nieoznaczony.",
            threshold_pct=threshold_pct,
            losses_active_mw=losses_active_mw,
            load_active_total_mw=load_active_total_mw,
        )
    losses_pct = abs(losses_active_mw) / load_active_total_mw * 100.0
    ocena = ocena_strat_sieci(losses_pct=losses_pct, threshold_pct=threshold_pct)
    status = kod_wiarygodnosci(ocena)
    # Jedno zdanie liczbowe dla każdego stanu — rozstrzygnięcie niesie rekord ``ocena``.
    why = (
        f"Straty czynne {liczba_pl(abs(losses_active_mw), '.4f')} MW = "
        f"{liczba_pl(losses_pct, '.2f')} % sumy mocy czynnej odbiorów "
        f"({liczba_pl(load_active_total_mw, '.4f')} MW) wobec progu wiarygodności "
        f"{liczba_pl(threshold_pct, '.1f')} %."
    )
    if status == OUT_OF_RANGE:
        why += " Wynik fizycznie wątpliwy — sprawdź impedancje gałęzi i topologię."
    return NetworkLossesSanityVerdict(
        losses_active_mw=losses_active_mw,
        load_active_total_mw=load_active_total_mw,
        losses_pct_of_load=losses_pct,
        threshold_pct=threshold_pct,
        threshold_why_pl=UZASADNIENIE_PROGU_STRAT_PL,
        in_range=status == CREDIBLE,
        status=status,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        why_pl=why,
    )
