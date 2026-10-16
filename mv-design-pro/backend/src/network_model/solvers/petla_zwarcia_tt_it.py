"""Pętla zwarcia doziemnego nN w układach TT i IT (IEC 60364-4-41) — WHITE BOX.

Karta W5-E-TTIT (decyzje OD-25 + D-11 + O-68, zgoda B-01 w ramach O-59). JEDYNYM wejściem
fizyki prądu zwarcia jednofazowego nN pozostaje ``fault_loop_iec60364.compute_fault_loop``:
dyspozycja po ``network_type`` sprowadza układ TT/IT do TEGO modułu, a jądro pętli
(sumowanie składowych, prąd z napięcia i modułu impedancji) jest WSPÓLNE z układem TN
(``fault_loop_iec60364.zsumuj_skladowe_petli`` / ``prad_z_petli``) — jedna fizyka Ik1 nN
(ADR-015), bez drugiej kopii sumowania.

Co liczy ten moduł (fizyka obwodu, bez żadnej liczby z tekstu normy):

* Układ TT — pętla zwarcia doziemnego L → uszkodzenie → uziom instalacji R_A → ziemia →
  uziom punktu neutralnego transformatora R_B → uzwojenie. Przewód ochronny PE kabla
  zasilającego NIE jest drogą powrotu (odmowa przy niezerowej składowej powrotnej).
  Wielkości: Z_s = Z_zasilania + Z_TR + Z_L + R_B + R_A, I_d = c·U_0/|Z_s| (MIN/MAX),
  napięcie dotykowe przy prądzie różnicowym znamionowym U_dotyk = R_A·I_Δn.
* Układ IT — pierwsze zwarcie doziemne domyka się przez pojemności doziemne zdrowych faz:
  B_e = Σ b_0,i·l_i·n_i, C_e = B_e/ω, I_d = 3·ω·C_e·U_0; napięcie dotykowe pierwszego
  zwarcia U_dotyk = R_A·I_d (gdy R_A podane). Drugie zwarcie doziemne na innej fazie
  (części przewodzące dostępne połączone wspólnym PE): pętla L1 → PE → L2 tym samym jądrem
  co TN (Z_s = Z_zasilania + Z_TR(1) + Z_L + Z_PE), z napięciem napędowym U_LL/2 dla dwóch
  jednakowych dróg w szeregu: I_d2 = c·U_LL/(2·|Z_s|), U_LL = √3·U_0.

Czego ten moduł NIE robi: nie porównuje z żadnym limitem normy (dopuszczalne napięcie
dotykowe, warunki §411.6 dla IT, czasy wyłączenia) — to warstwa interpretacji
``application/analyses/swz/werdykt_tt_it.py`` z danymi repo i statusem BRAK_PODSTAWY tam,
gdzie tekst normy nie jest w repo (pakiet danych właściciela P-C).

Niezmienniki: brak heurystyk, brak wartości zastępczych za brakujące dane (brak = odmowa
nazwana), determinizm, ślad WHITE BOX dla każdego kroku, zamrożone klasy danych.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from network_model.odmowa_danych import (
    RODZAJ_ELEMENT,
    OdmowaDanychError,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)
from network_model.solvers.fault_loop_iec60364 import (
    C_MAX_LV,
    C_MIN_LV,
    FaultLoopInput,
    FaultLoopResult,
    LoopImpedanceComponent,
    NetworkType,
    prad_z_petli,
    zsumuj_skladowe_petli,
)

#: Etykiety składowych ziemnych pętli TT (po polsku, do śladu i dowodu).
ETYKIETA_R_B = "Uziom punktu neutralnego transformatora R_B"
ETYKIETA_R_A = "Uziom instalacji odbiorczej R_A"

#: Opis prądu niesionego przez ``FaultLoopResult.ik_min_a`` dla każdego układu (pole
#: ``WynikTtIt.rodzaj_pradu_pl``) — bez niego wartość „Ik1_min" układu IT byłaby czytana
#: jak prąd pętli L-PE układu TN.
RODZAJ_PRADU_TT_PL = "prąd zwarcia doziemnego przez uziomy R_A i R_B (pętla TT)"
RODZAJ_PRADU_IT_PL = (
    "prąd drugiego zwarcia doziemnego na dwóch fazach z części przewodzącymi dostępnymi na "
    "wspólnym przewodzie ochronnym (obie usterki w tym samym punkcie, napięcie napędowe U_LL/2)"
)


#: Kod odmowy danych odcinka sieci IT (pole `kod` rekordu odmowy rdzenia).
KOD_ODCINEK_IT_DANE = "petla_tt_it.odcinek_dane"

#: Dana pętli TT/IT → (symbol, opis po polsku) — JEDNO źródło słów odmów `DaneTtIt`
#: i `_wymagana`; klucz pola nie trafia do treści (partia integracji 10).
OPISY_DANYCH_TT_IT: dict[str, tuple[str, str]] = {
    "r_a_ohm": ("R_A", "rezystancja uziomu instalacji odbiorczej"),
    "r_b_ohm": ("R_B", "rezystancja uziomu punktu neutralnego transformatora"),
    "i_delta_n_a": ("I_Δn", "prąd różnicowy znamionowy wyłącznika RCD"),
    "czestotliwosc_hz": ("f", "częstotliwość sieci"),
}


@dataclass(frozen=True)
class PojemnoscDoziemnaOdcinka:
    """Pojemność doziemna JEDNEGO odcinka sieci IT — dane SUROWE z modelu.

    ``b0_siemens_per_km`` — susceptancja zerowa na km z katalogu/modelu gałęzi
    (``Cable.b0_siemens_per_km``); ``length_km`` — długość; ``n_parallel`` — liczba
    identycznych torów równoległych (pojemności torów równoległych SUMUJĄ się).
    """

    label: str
    branch_ref: str
    b0_siemens_per_km: float
    length_km: float
    n_parallel: int = 1

    def __post_init__(self) -> None:
        # Partia integracji 10: odmowa strukturalna (odcinek w odwołaniu `RODZAJ_ELEMENT`,
        # treść bez identyfikatora i kluczy pól; nazwę dokłada `enm/zdania_odmow_rdzenia`).
        if self.b0_siemens_per_km < 0.0:
            raise self._odmowa(
                "Susceptancja zerowa b_0 odcinka sieci IT nie może być ujemna, otrzymano "
                f"{self.b0_siemens_per_km} S/km."
            )
        if self.length_km <= 0.0:
            raise self._odmowa(
                f"Długość odcinka sieci IT musi być dodatnia, otrzymano {self.length_km} km."
            )
        if self.n_parallel < 1:
            raise self._odmowa(
                "Liczba torów równoległych odcinka sieci IT musi wynosić co najmniej 1, "
                f"otrzymano {self.n_parallel}."
            )

    def _odmowa(self, tresc: str) -> OdmowaWejsciaRdzenia:
        return OdmowaWejsciaRdzenia(
            [
                RekordOdmowy(
                    KOD_ODCINEK_IT_DANE,
                    tresc,
                    (OdwolanieElementu(RODZAJ_ELEMENT, self.branch_ref),),
                )
            ]
        )


@dataclass(frozen=True)
class DaneTtIt:
    """Dane wejściowe pętli TT/IT ponad kontraktem pętli TN (``FaultLoopInput``).

    TT wymaga: ``r_a_ohm`` (uziom instalacji odbiorczej), ``r_b_ohm`` (uziom punktu
    neutralnego nN transformatora), ``i_delta_n_a`` (prąd różnicowy znamionowy RCD
    chroniącego obwód). IT wymaga: ``pojemnosci`` (odcinki sieci IT z b_0) i
    ``czestotliwosc_hz``; ``r_a_ohm`` opcjonalne (bez niego napięcie dotykowe pierwszego
    zwarcia nie jest liczone — pole ``None``, nie zero).
    """

    r_a_ohm: float | None = None
    r_b_ohm: float | None = None
    i_delta_n_a: float | None = None
    pojemnosci: tuple[PojemnoscDoziemnaOdcinka, ...] = ()
    czestotliwosc_hz: float | None = None

    def __post_init__(self) -> None:
        for nazwa, wartosc in (
            ("r_a_ohm", self.r_a_ohm),
            ("r_b_ohm", self.r_b_ohm),
            ("i_delta_n_a", self.i_delta_n_a),
            ("czestotliwosc_hz", self.czestotliwosc_hz),
        ):
            if wartosc is not None and (not math.isfinite(wartosc) or wartosc <= 0.0):
                symbol, opis = OPISY_DANYCH_TT_IT[nazwa]
                raise OdmowaDanychError(
                    f"Dane pętli TT/IT: {opis} {symbol} musi być liczbą skończoną i dodatnią, "
                    f"otrzymano {wartosc}."
                )


@dataclass(frozen=True)
class WynikTtIt:
    """Wielkości pętli TT/IT ponad kontraktem ``FaultLoopResult`` (wszystkie z jednostką w nazwie)."""

    uklad: NetworkType
    rodzaj_pradu_pl: str
    r_a_ohm: float | None
    # TT
    r_b_ohm: float | None = None
    i_delta_n_a: float | None = None
    u_dotyk_v: float | None = None
    # IT — pierwsze zwarcie
    b_e_s: float | None = None
    c_e_f: float | None = None
    czestotliwosc_hz: float | None = None
    i_d_pierwsze_zwarcie_a: float | None = None
    u_dotyk_pierwsze_zwarcie_v: float | None = None
    # IT — drugie zwarcie
    u_ll_v: float | None = None
    i_d2_min_a: float | None = None
    i_d2_max_a: float | None = None
    pojemnosci: tuple[dict[str, Any], ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "uklad": self.uklad.value,
            "rodzaj_pradu_pl": self.rodzaj_pradu_pl,
            "r_a_ohm": self.r_a_ohm,
            "r_b_ohm": self.r_b_ohm,
            "i_delta_n_a": self.i_delta_n_a,
            "u_dotyk_v": self.u_dotyk_v,
            "b_e_s": self.b_e_s,
            "c_e_f": self.c_e_f,
            "czestotliwosc_hz": self.czestotliwosc_hz,
            "i_d_pierwsze_zwarcie_a": self.i_d_pierwsze_zwarcie_a,
            "u_dotyk_pierwsze_zwarcie_v": self.u_dotyk_pierwsze_zwarcie_v,
            "u_ll_v": self.u_ll_v,
            "i_d2_min_a": self.i_d2_min_a,
            "i_d2_max_a": self.i_d2_max_a,
            "pojemnosci": list(self.pojemnosci),
        }


def _skladowa_zerowa(component: LoopImpedanceComponent) -> bool:
    return component.r_ohm == 0.0 and component.x_ohm == 0.0


def _wymagana(dane: DaneTtIt, nazwa: str, uklad: NetworkType) -> float:
    wartosc = getattr(dane, nazwa)
    if wartosc is None:
        symbol, opis = OPISY_DANYCH_TT_IT[nazwa]
        raise OdmowaDanychError(
            f"Układ {uklad.value}: brak danej {symbol} ({opis}) — pętla zwarcia doziemnego "
            "nie jest liczona bez niej; brak nie jest zastępowany żadną wartością."
        )
    return float(wartosc)


def oblicz_petle_tt(data: FaultLoopInput) -> FaultLoopResult:
    """Pętla zwarcia doziemnego układu TT (L → R_A → ziemia → R_B → transformator)."""
    if data.dane_tt_it is None:
        raise OdmowaDanychError(
            "Układ TT: brak danych pętli doziemnej (R_A, R_B, I_Δn) — pętla nie jest liczona."
        )
    dane = data.dane_tt_it
    r_a = _wymagana(dane, "r_a_ohm", NetworkType.TT)
    r_b = _wymagana(dane, "r_b_ohm", NetworkType.TT)
    i_delta_n = _wymagana(dane, "i_delta_n_a", NetworkType.TT)
    if not _skladowa_zerowa(data.return_conductor):
        raise OdmowaDanychError(
            "Układ TT: przewód powrotny PE/PEN kabla nie jest drogą powrotu prądu zwarcia "
            f"doziemnego, a otrzymano niezerową składową powrotną (R={data.return_conductor.r_ohm}, "
            f"X={data.return_conductor.x_ohm}). Droga powrotu w TT to uziomy R_A i R_B."
        )

    trace: list[dict[str, Any]] = [
        {
            "step": "uklad_tt_droga_powrotu",
            "method": (
                "TT: droga powrotu prądu zwarcia doziemnego przez uziom instalacji R_A i uziom "
                "punktu neutralnego R_B; przewód ochronny kabla zasilającego nie należy do pętli"
            ),
            "r_a_ohm": r_a,
            "r_b_ohm": r_b,
            "return_conductor_pominiety": data.return_conductor.label,
        }
    ]
    components = [data.phase_conductor, data.transformer_impedance]
    if data.upstream_impedance is not None:
        components.append(data.upstream_impedance)
    components.append(LoopImpedanceComponent(label=ETYKIETA_R_B, r_ohm=r_b, x_ohm=0.0))
    components.append(LoopImpedanceComponent(label=ETYKIETA_R_A, r_ohm=r_a, x_ohm=0.0))

    z_loop, krok_sumy = zsumuj_skladowe_petli(components)
    trace.append(krok_sumy)
    ik_min, ik_max, krok_pradu = prad_z_petli(
        u_v=data.u_nom_v, z_magnitude=abs(z_loop), fault_node_id=data.fault_node_id
    )
    krok_pradu = {**krok_pradu, "method": "I_d = c · U_0 / |Z_s| (pętla doziemna TT)"}
    trace.append(krok_pradu)

    u_dotyk = r_a * i_delta_n
    trace.append(
        {
            "step": "napiecie_dotykowe_rcd",
            "method": "U_dotyk = R_A · I_Δn (napięcie na uziomie instalacji przy prądzie "
            "różnicowym znamionowym RCD)",
            "r_a_ohm": r_a,
            "i_delta_n_a": i_delta_n,
            "u_dotyk_v": u_dotyk,
        }
    )
    if u_dotyk < 0.0:
        raise OdmowaDanychError(
            f"Sanity: U_dotyk = {u_dotyk} V < 0 — iloczyn dodatnich R_A i I_Δn nie może być ujemny."
        )

    return FaultLoopResult(
        fault_node_id=data.fault_node_id,
        network_type=data.network_type,
        protection_arrangement=data.protection_arrangement,
        u_nom_v=data.u_nom_v,
        components=tuple(components),
        z_loop_ohm=z_loop,
        ik_min_a=ik_min,
        ik_max_a=ik_max,
        white_box_trace=tuple(trace),
        tt_it=WynikTtIt(
            uklad=NetworkType.TT,
            rodzaj_pradu_pl=RODZAJ_PRADU_TT_PL,
            r_a_ohm=r_a,
            r_b_ohm=r_b,
            i_delta_n_a=i_delta_n,
            u_dotyk_v=u_dotyk,
        ),
    )


def oblicz_petle_it(data: FaultLoopInput) -> FaultLoopResult:
    """Pierwsze zwarcie doziemne (pojemnościowe) i drugie zwarcie (L-PE-L) układu IT."""
    if data.dane_tt_it is None:
        raise OdmowaDanychError(
            "Układ IT: brak danych sieci IT (pojemności doziemne odcinków, częstotliwość) — "
            "prąd pierwszego zwarcia nie jest liczony."
        )
    dane = data.dane_tt_it
    if not dane.pojemnosci:
        raise OdmowaDanychError(
            "Układ IT: brak pojemności doziemnych odcinków sieci (b_0 kabli) — prąd pierwszego "
            "zwarcia doziemnego nie jest liczony bez nich."
        )
    f_hz = _wymagana(dane, "czestotliwosc_hz", NetworkType.IT)

    trace: list[dict[str, Any]] = []
    # Pierwsze zwarcie: susceptancja doziemna całej sieci IT (tory równoległe sumują się).
    b_e = 0.0
    pojemnosci_slad: list[dict[str, Any]] = []
    for odcinek in dane.pojemnosci:
        b_i = odcinek.b0_siemens_per_km * odcinek.length_km * odcinek.n_parallel
        b_e += b_i
        pojemnosci_slad.append(
            {
                "label": odcinek.label,
                "branch_ref": odcinek.branch_ref,
                "b0_siemens_per_km": odcinek.b0_siemens_per_km,
                "length_km": odcinek.length_km,
                "n_parallel": odcinek.n_parallel,
                "b_i_s": b_i,
            }
        )
    omega = 2.0 * math.pi * f_hz
    c_e = b_e / omega
    i_d1 = 3.0 * omega * c_e * data.u_nom_v
    trace.append(
        {
            "step": "pojemnosc_doziemna_sieci_it",
            "method": "B_e = Σ b_0,i · l_i · n_i ; C_e = B_e / ω ; ω = 2πf",
            "odcinki": pojemnosci_slad,
            "czestotliwosc_hz": f_hz,
            "omega_rad_s": omega,
            "b_e_s": b_e,
            "c_e_f": c_e,
        }
    )
    trace.append(
        {
            "step": "prad_pierwszego_zwarcia_it",
            "method": "I_d = 3 · ω · C_e · U_0 (prąd pierwszego zwarcia doziemnego przez "
            "pojemności doziemne dwóch zdrowych faz)",
            "u0_v": data.u_nom_v,
            "i_d_pierwsze_zwarcie_a": i_d1,
        }
    )
    u_dotyk1: float | None = None
    if dane.r_a_ohm is not None:
        u_dotyk1 = dane.r_a_ohm * i_d1
        trace.append(
            {
                "step": "napiecie_dotykowe_pierwszego_zwarcia_it",
                "method": "U_dotyk = R_A · I_d",
                "r_a_ohm": dane.r_a_ohm,
                "i_d_pierwsze_zwarcie_a": i_d1,
                "u_dotyk_pierwsze_zwarcie_v": u_dotyk1,
            }
        )
        if u_dotyk1 < 0.0:
            raise OdmowaDanychError(
                f"Sanity: U_dotyk = {u_dotyk1} V < 0 — iloczyn dodatnich R_A i I_d nie może być "
                "ujemny."
            )
    else:
        trace.append(
            {
                "step": "napiecie_dotykowe_pierwszego_zwarcia_it",
                "method": "U_dotyk = R_A · I_d",
                "r_a_ohm": None,
                "result": "nie liczone — brak R_A instalacji w punkcie (dana nieobecna, nie zero)",
            }
        )

    # Drugie zwarcie: pętla L1 → PE → L2 tym samym jądrem co TN.
    components = [data.phase_conductor, data.return_conductor, data.transformer_impedance]
    if data.upstream_impedance is not None:
        components.append(data.upstream_impedance)
    z_loop, krok_sumy = zsumuj_skladowe_petli(components)
    trace.append({**krok_sumy, "step": "sum_components_drugie_zwarcie_it"})
    z_magnitude = abs(z_loop)
    u_ll = math.sqrt(3.0) * data.u_nom_v
    u_napedowe = u_ll / 2.0
    i_d2_min, i_d2_max, krok_pradu = prad_z_petli(
        u_v=u_napedowe, z_magnitude=z_magnitude, fault_node_id=data.fault_node_id
    )
    trace.append(
        {
            **krok_pradu,
            "step": "prad_drugiego_zwarcia_it",
            "method": (
                "I_d2 = c · U_LL / (2·|Z_s|) — dwa jednakowe tory L-PE w szeregu napędzane "
                "napięciem międzyfazowym U_LL = √3 · U_0; |Z_s| to moduł pętli jednego toru"
            ),
            "u_ll_v": u_ll,
            "u_napedowe_v": u_napedowe,
        }
    )

    return FaultLoopResult(
        fault_node_id=data.fault_node_id,
        network_type=data.network_type,
        protection_arrangement=data.protection_arrangement,
        u_nom_v=data.u_nom_v,
        components=tuple(components),
        z_loop_ohm=z_loop,
        ik_min_a=i_d2_min,
        ik_max_a=i_d2_max,
        white_box_trace=tuple(trace),
        tt_it=WynikTtIt(
            uklad=NetworkType.IT,
            rodzaj_pradu_pl=RODZAJ_PRADU_IT_PL,
            r_a_ohm=dane.r_a_ohm,
            b_e_s=b_e,
            c_e_f=c_e,
            czestotliwosc_hz=f_hz,
            i_d_pierwsze_zwarcie_a=i_d1,
            u_dotyk_pierwsze_zwarcie_v=u_dotyk1,
            u_ll_v=u_ll,
            i_d2_min_a=i_d2_min,
            i_d2_max_a=i_d2_max,
            pojemnosci=tuple(pojemnosci_slad),
        ),
    )


#: Dyspozycja po układzie — jedyny słownik czytany przez ``compute_fault_loop``.
OBLICZ_WG_UKLADU = {
    NetworkType.TT: oblicz_petle_tt,
    NetworkType.IT: oblicz_petle_it,
}

__all__ = [
    "C_MAX_LV",
    "C_MIN_LV",
    "DaneTtIt",
    "ETYKIETA_R_A",
    "ETYKIETA_R_B",
    "OBLICZ_WG_UKLADU",
    "PojemnoscDoziemnaOdcinka",
    "RODZAJ_PRADU_IT_PL",
    "RODZAJ_PRADU_TT_PL",
    "WynikTtIt",
    "oblicz_petle_it",
    "oblicz_petle_tt",
]
