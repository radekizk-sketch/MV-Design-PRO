"""Ocena doboru przekroju odcinka i ciągu magistrali SN — rekordy werdyktu wyjaśnialnego.

Karta MAGISTRALA-OCENA (plan AB §8 F24, fala WW-4). Kreator magistrali SN pokazywał gołe
„OK" z porównań liczonych w interfejsie (`ocenaDoboru`, `lacznySpadekPct`, zaszyty
`LIMIT_SPADKU_PCT = 5`). Ocena powstaje teraz TUTAJ i dociera do projektanta wyłącznie jako
rekordy ``werdykt.OcenaKryterium`` (status, margines, kompletność, etykieta i wyjaśnienie
liczy pakiet ``werdykt``):

* ``magistrala_sn.obciazalnosc_odcinka`` — prąd roboczy odcinka I_B wobec obciążalności
  długotrwałej typu I_z z karty katalogowej (dla kabla przez JEDYNE mnożenie korekty
  ``obciazalnosc_skorygowana`` przy warunkach katalogowych — kreator nie zna warunków
  ułożenia, co zakres ważności mówi wprost);
* ``magistrala_sn.spadek_napiecia_odcinka`` — spadek napięcia odcinka (solver
  ``cable_voltage_drop``) wobec dopuszczalnego spadku wzdłuż ciągu SN;
* ``magistrala_sn.spadek_napiecia_ciagu`` — spadek skumulowany wzdłuż budowanego ciągu
  (odcinki już zapisane w tej sesji kreatora + odcinek bieżący), suma w solverze
  (``compute_trunk_voltage_drop``).

Limit spadku pochodzi z JEDNEGO źródła kryteriów napięciowych
(``analysis.normative.kryteria_napiecia``, kryterium 4) razem z podstawą i stanem źródła;
limit obciążalności — z rekordu katalogowego typu, a stan źródła tej podstawy wynika ze
statusu weryfikacji rekordu (tylko rekord ``ZWERYFIKOWANY`` przenosi dokument — ta sama
reguła co ``dziedziny.sekcje``). Brak danych (typ, długość, prąd) daje ``NIE_OCENIONO``
z nazwanym brakiem, nigdy „spełnia" ani ciche pominięcie.

Warstwa aplikacji: zero fizyki — spadki liczy solver, obciążalność skorygowaną liczy
``cable_ampacity_derating``; tu wyłącznie składanie rekordów i sumowanie długości (geometria
ciągu do opisu przedmiotu oceny).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from analysis.normative.kryteria_napiecia import (
    KRYTERIUM_SPADKU_CIAGU_SN_DOKUMENT_PL,
    KRYTERIUM_SPADKU_CIAGU_SN_JEDNOSTKA_REDAKCYJNA,
    KRYTERIUM_SPADKU_CIAGU_SN_PODSTAWA_PL,
    KRYTERIUM_SPADKU_CIAGU_SN_PROCENT,
    KRYTERIUM_SPADKU_CIAGU_SN_RODZAJ_PODSTAWY,
    KRYTERIUM_SPADKU_CIAGU_SN_STAN_ZRODLA,
    KRYTERIUM_SPADKU_CIAGU_SN_WYDANIE,
)
from enm.slownik_komunikatow import NAZWY_STATUSOW_WERYFIKACJI_PL
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CableType, LineType
from network_model.pochodne import kv_na_v, m_na_km
from network_model.solvers.cable_ampacity_derating import (
    WARUNKI_KATALOGOWE,
    obciazalnosc_skorygowana,
)
from network_model.solvers.cable_voltage_drop import (
    CableVoltageDropInput,
    CableVoltageDropResult,
    TrunkVoltageDropResult,
    compute_cable_voltage_drop,
    compute_trunk_voltage_drop,
)
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    FieldQuality,
    Kryterium,
    LimitKryterium,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    ZakresWaznosci,
    format_liczba,
    ocen_kryterium,
)

RodzajOdcinka = Literal["KABEL", "LINIA"]

#: Identyfikatory kryteriów (rekordy K) — stabilne, bez numeru odcinka (jedna ocena odcinka
#: bieżącego i jedna ocena ciągu na odpowiedź).
KRYTERIUM_OBCIAZALNOSCI = "magistrala_sn.obciazalnosc_odcinka"
KRYTERIUM_SPADKU_ODCINKA = "magistrala_sn.spadek_napiecia_odcinka"
KRYTERIUM_SPADKU_CIAGU = "magistrala_sn.spadek_napiecia_ciagu"
#: Zdolności w rejestrze dowodowym (``solver_input.provenance``).
ZDOLNOSC_OBCIAZALNOSCI = "magistrala_sn.obciazalnosc_dlugotrwala"
ZDOLNOSC_SPADKU = "magistrala_sn.spadek_napiecia"

#: Zaokrąglenie wartości wyjściowych — determinizm zapisu rekordu.
_ZAOKR = 6
_J_A = "A"
_J_PROC = "%"

_NAZWA_RODZAJU_PL: dict[RodzajOdcinka, str] = {
    "KABEL": "kabel SN",
    "LINIA": "linia napowietrzna SN",
}
_NAZWA_KATALOGU_PL: dict[RodzajOdcinka, str] = {
    "KABEL": "katalogu kabli SN",
    "LINIA": "katalogu przewodów linii napowietrznych SN",
}
#: Podstawa KRYTERIUM obciążalności długotrwałej (norma projektowania linii) — stan
#: NIEUSTALONE: wydanie i jednostka redakcyjna nie są ustalone w rejestrze podstaw.
_PODSTAWA_KRYTERIUM_OBCIAZALNOSCI: dict[RodzajOdcinka, PodstawaWymagania] = {
    "KABEL": PodstawaWymagania(
        rodzaj="NORMA",
        dokument=(
            "N SEP-E-004 Elektroenergetyczne i sygnalizacyjne linie kablowe — Projektowanie "
            "i budowa (dobór przekroju na obciążalność długotrwałą)"
        ),
        status="NIEUSTALONE",
        uwagi_pl="wydanie i jednostka redakcyjna nieustalone w rejestrze podstaw",
    ),
    "LINIA": PodstawaWymagania(
        rodzaj="NORMA",
        dokument=(
            "PN-EN 50341-1 Elektroenergetyczne linie napowietrzne prądu przemiennego powyżej "
            "1 kV (obciążalność prądowa przewodów)"
        ),
        status="NIEUSTALONE",
        uwagi_pl="wydanie i jednostka redakcyjna nieustalone w rejestrze podstaw",
    ),
}

_NIEPEWNOSC_OBCIAZALNOSCI = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "porównanie prądu roboczego podanego przez projektanta z wartością z karty "
        "katalogowej — niepewność numeryczna nie dotyczy"
    ),
)
_NIEPEWNOSC_SPADKU = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "błąd przybliżenia składowej podłużnej spadku napięcia nie jest oszacowany — "
        "rzeczywisty profil napięcia daje rozpływ mocy zapisanego modelu"
    ),
)
_WYKLUCZENIA_SPADKU: tuple[str, ...] = (
    "kąt między napięciami końców odcinka (przybliżenie składowej podłużnej spadku)",
    "napięcie szyn SN GPZ różne od Un (położenie zaczepów, obciążenie transformatora)",
    "odbiory i generacja rozłożone wzdłuż odcinka",
)


@dataclass(frozen=True)
class OdcinekMagistrali:
    """Dane odcinka z kreatora: typ z katalogu, długość, prąd roboczy, cosφ.

    ``None`` = projektant nie podał wartości — ocena nazywa brak, niczego nie zgaduje.
    """

    rodzaj: RodzajOdcinka
    catalog_ref: str | None
    dlugosc_m: float | None
    prad_roboczy_a: float | None
    cos_phi: float
    nazwa: str | None = None


@dataclass(frozen=True)
class SpadekOdcinka:
    """Spadek napięcia odcinka bieżącego (WHITE BOX solvera) i prąd, przy którym policzony."""

    wynik: CableVoltageDropResult
    prad_obliczeniowy_a: float
    prad_z_obciazalnosci: bool


@dataclass(frozen=True)
class PodsumowanieCiagu:
    """Ciąg budowany w kreatorze: liczba odcinków, długość i spadek skumulowany (albo braki)."""

    liczba_odcinkow: int
    dlugosc_m: float | None
    spadek: TrunkVoltageDropResult | None


@dataclass(frozen=True)
class OcenaDoboruMagistrali:
    """Wynik oceny: podgląd spadku odcinka, podsumowanie ciągu i rekordy werdyktu."""

    spadek_odcinka: SpadekOdcinka | None
    ciag: PodsumowanieCiagu
    oceny_odcinka: tuple[OcenaKryterium, OcenaKryterium]
    ocena_ciagu: OcenaKryterium


class KatalogTypowSn(Protocol):
    """Wąski interfejs katalogu typów SN (domyślnie katalog kanoniczny; w testach atrapa)."""

    def get_cable_type(self, type_id: str) -> CableType | None: ...

    def get_line_type(self, type_id: str) -> LineType | None: ...


@dataclass(frozen=True)
class _Rozwiazany:
    """Odcinek po rozwiązaniu typu z katalogu: wejście solvera albo nazwane braki."""

    indeks: int
    odcinek: OdcinekMagistrali
    typ: CableType | LineType | None
    wejscie: CableVoltageDropInput | None
    prad_z_obciazalnosci: bool
    #: Brak typu z katalogu (pusty wybór albo pozycja nieistniejąca) — osobno, bo bez typu
    #: nie ma przedmiotu oceny obciążalności.
    brak_typu: str | None
    #: Wszystkie braki odcinka dla obliczenia spadku (typ, długość, prąd) w stałej kolejności.
    braki: tuple[str, ...]


def _r(wartosc: float) -> float:
    return round(float(wartosc), _ZAOKR)


def _typ(odcinek: OdcinekMagistrali, katalog: KatalogTypowSn) -> CableType | LineType | None:
    ref = (odcinek.catalog_ref or "").strip()
    if not ref:
        return None
    if odcinek.rodzaj == "KABEL":
        return katalog.get_cable_type(ref)
    return katalog.get_line_type(ref)


def _rozwiaz(
    indeks: int, odcinek: OdcinekMagistrali, napiecie_kv: float, katalog: KatalogTypowSn
) -> _Rozwiazany:
    typ = _typ(odcinek, katalog)
    brak_typu: str | None = None
    if not (odcinek.catalog_ref or "").strip():
        brak_typu = (
            f"typ odcinka z {_NAZWA_KATALOGU_PL[odcinek.rodzaj]} (rezystancja, reaktancja "
            "i obciążalność)"
        )
    elif typ is None:
        brak_typu = (
            f"typ „{odcinek.catalog_ref}” w {_NAZWA_KATALOGU_PL[odcinek.rodzaj]} — pozycja "
            "nie istnieje"
        )
    braki: list[str] = [brak_typu] if brak_typu is not None else []
    if odcinek.dlugosc_m is None:
        braki.append("długość odcinka")
    prad = odcinek.prad_roboczy_a
    prad_z_obciazalnosci = False
    if prad is None and typ is not None:
        # Brak prądu roboczego: spadek liczony przy obciążalności typu — dana PRZYJĘTA,
        # jawnie w statusie danych dowodu (`_dana_pradu`), nigdy cicho.
        if typ.rated_current_a > 0.0:
            prad = typ.rated_current_a
            prad_z_obciazalnosci = True
        else:
            braki.append(
                "prąd roboczy odcinka — typ nie ma obciążalności długotrwałej w karcie "
                "katalogowej, więc nie ma czym go zastąpić w obliczeniu spadku"
            )
    wejscie: CableVoltageDropInput | None = None
    if not braki and typ is not None and prad is not None and odcinek.dlugosc_m is not None:
        wejscie = CableVoltageDropInput(
            current_a=prad,
            length_km=m_na_km(odcinek.dlugosc_m),
            r_ohm_per_km=typ.r_ohm_per_km,
            x_ohm_per_km=typ.x_ohm_per_km,
            cos_phi=odcinek.cos_phi,
            line_voltage_v=kv_na_v(napiecie_kv),
        )
    return _Rozwiazany(
        indeks=indeks,
        odcinek=odcinek,
        typ=typ,
        wejscie=wejscie,
        prad_z_obciazalnosci=prad_z_obciazalnosci,
        brak_typu=brak_typu,
        braki=tuple(braki),
    )


def _liczba_odcinkow_pl(n: int) -> str:
    """Liczebnik z rzeczownikiem „odcinek" w poprawnej formie (1 odcinek, 2–4 odcinki,
    5–21 odcinków, 22–24 odcinki …)."""
    if n == 1:
        return "1 odcinek"
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return f"{n} odcinki"
    return f"{n} odcinków"


def _nazwa_odcinka(r: _Rozwiazany) -> str:
    nazwa = (r.odcinek.nazwa or "").strip()
    return f"Odcinek {r.indeks} magistrali SN" + (f" „{nazwa}”" if nazwa else "")


def _opis_odcinka(r: _Rozwiazany, napiecie_kv: float) -> str:
    typ = f"typu {r.typ.name}" if r.typ is not None else "bez typu z katalogu"
    dlugosc = (
        f"długość {format_liczba(_r(r.odcinek.dlugosc_m))} m"
        if r.odcinek.dlugosc_m is not None
        else "długość niepodana"
    )
    return (
        f"{_NAZWA_RODZAJU_PL[r.odcinek.rodzaj]} {typ}, {dlugosc}, napięcie ciągu "
        f"{format_liczba(_r(napiecie_kv))} kV"
    )


def _przedmiot_odcinka(r: _Rozwiazany, napiecie_kv: float) -> Przedmiot:
    return Przedmiot(
        element_ref=None,
        nazwa_pl=_nazwa_odcinka(r),
        opis_pl=_opis_odcinka(r, napiecie_kv),
    )


def _podstawa_obciazalnosci_katalogu(typ: CableType | LineType) -> PodstawaWymagania:
    """Podstawa limitu I_z: rekord katalogowy typu. Stan źródła wynika ze statusu weryfikacji
    rekordu — tylko ``ZWERYFIKOWANY`` przenosi dokument źródłowy (``WSKAZANE``: dokument
    i pozycja wskazane, treść karty producenta poza repozytorium)."""
    status_rekordu = typ.verification_status
    nazwa_statusu = NAZWY_STATUSOW_WERYFIKACJI_PL.get(status_rekordu, status_rekordu.lower())
    if status_rekordu == "ZWERYFIKOWANY":
        return PodstawaWymagania(
            rodzaj="KATALOG_PRODUCENTA",
            dokument=typ.source_reference,
            wydanie=f"katalog typów SN, kontrakt katalogu {typ.contract_version}",
            jednostka_redakcyjna=f"pozycja „{typ.name}” — obciążalność długotrwała",
            status="WSKAZANE",
        )
    return PodstawaWymagania(
        rodzaj="KATALOG_PRODUCENTA",
        dokument=typ.source_reference,
        status="NIEUSTALONE",
        uwagi_pl=(
            f"rekord katalogowy „{typ.name}” ma status weryfikacji „{nazwa_statusu.lower()}” "
            "— obciążalność nie jest przeniesiona z zweryfikowanej karty producenta"
        ),
    )


def _zakres_obciazalnosci(r: _Rozwiazany) -> ZakresWaznosci:
    if r.odcinek.rodzaj == "KABEL":
        opis = (
            "Obciążalność długotrwała kabla z karty katalogowej w warunkach odniesienia "
            f"producenta. {WARUNKI_KATALOGOWE.zalozenie_pl()} Podstawa wartości: "
            f"{WARUNKI_KATALOGOWE.podstawa}"
        )
        wykluczenia: tuple[str, ...] = (
            "warunki ułożenia trasy (rezystywność cieplna i temperatura gruntu, głębokość, "
            "grupowanie kabli) — kreator ich nie zna, obciążalność nie jest korygowana",
            "obciążenie cykliczne i przeciążenia krótkotrwałe",
            "wytrzymałość cieplna zwarciowa (ocenia ją bieg zwarciowy)",
        )
    else:
        opis = (
            "Obciążalność długotrwała przewodu linii napowietrznej z karty katalogowej "
            "w warunkach odniesienia producenta (temperatura otoczenia, prędkość wiatru, "
            "nasłonecznienie)."
        )
        wykluczenia = (
            "warunki atmosferyczne trasy inne niż warunki odniesienia producenta",
            "obciążenie cykliczne i przeciążenia krótkotrwałe",
            "wytrzymałość cieplna zwarciowa (ocenia ją bieg zwarciowy)",
        )
    return ZakresWaznosci(opis_pl=opis, wykluczenia=wykluczenia)


def _ocena_obciazalnosci(r: _Rozwiazany, napiecie_kv: float) -> OcenaKryterium:
    """JEDYNA budowa rekordu K obciążalności odcinka."""
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_OBCIAZALNOSCI)
    rodzaj = r.odcinek.rodzaj
    braki: list[str] = []
    wynik: WynikKryterium | None = None
    limit: LimitKryterium | None = None
    sladu_iz = "brak"
    if r.brak_typu is not None:
        braki.append(r.brak_typu)
    if r.odcinek.prad_roboczy_a is None:
        braki.append("prąd roboczy odcinka I_B — bez niego nie ma czego porównać z obciążalnością")
    if r.typ is not None:
        if r.odcinek.prad_roboczy_a is not None:
            wynik = WynikKryterium(
                wielkosc_pl="prąd roboczy odcinka podany przez projektanta",
                symbol_latex="I_B",
                wartosc=Wielkosc(wartosc=_r(r.odcinek.prad_roboczy_a), jednostka=_J_A),
                metoda="DEKLARACJA",
            )
        if r.typ.rated_current_a > 0.0:
            iz = (
                obciazalnosc_skorygowana(r.typ.rated_current_a, WARUNKI_KATALOGOWE)
                if rodzaj == "KABEL"
                else r.typ.rated_current_a
            )
            sladu_iz = f"{format_liczba(_r(iz))} A"
            limit = LimitKryterium(
                wartosc=Wielkosc(wartosc=_r(iz), jednostka=_J_A),
                podstawa=_podstawa_obciazalnosci_katalogu(r.typ),
                zakres_stosowalnosci_pl=(
                    f"obciążalność długotrwała typu {r.typ.name} w warunkach odniesienia "
                    "producenta"
                ),
            )
        else:
            braki.append(
                f"obciążalność długotrwała w karcie katalogowej typu {r.typ.name} (pole puste "
                "albo zero)"
            )
    prad_sladu = (
        f"{format_liczba(_r(r.odcinek.prad_roboczy_a))} A"
        if r.odcinek.prad_roboczy_a is not None
        else "niepodany"
    )
    return ocen_kryterium(
        kryterium_id=KRYTERIUM_OBCIAZALNOSCI,
        przedmiot=_przedmiot_odcinka(r, napiecie_kv),
        kryterium=Kryterium(
            opis_pl=(
                "Prąd roboczy odcinka nie przekracza obciążalności długotrwałej typu kabla "
                "albo przewodu"
            ),
            warunek_latex=r"I_B \le I_z",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_KRYTERIUM_OBCIAZALNOSCI[rodzaj],
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl=(
                "każdy odcinek magistrali SN przenosi prąd roboczy ciągu — przekrój dobiera "
                "się co najmniej na obciążalność długotrwałą"
            ),
        ),
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_OBCIAZALNOSCI,
        dowod=StatusDowodu(
            metoda="DEKLARACJA",
            poziom=zdolnosc.tier,
            rodzaj_twierdzenia=zdolnosc.claim_kind,
            status_modelu="NIE_DOTYCZY",
            status_danych=StatusDanych(stan="ZWALIDOWANE"),
            odniesienie=(f"karta katalogowa typu {r.typ.name}" if r.typ is not None else None),
        ),
        zakres_waznosci=_zakres_obciazalnosci(r),
        slad=(
            OdnosnikSladu(
                krok=f"magistrala-sn:odcinek-{r.indeks}:obciazalnosc",
                opis_pl=(
                    f"I_B = {prad_sladu} (projektant); I_z = {sladu_iz} (karta katalogowa, "
                    "warunki odniesienia producenta)"
                ),
            ),
        ),
        braki_dodatkowe=braki,
    )


def _podstawa_spadku() -> PodstawaWymagania:
    """Podstawa limitu spadku — JEDNO źródło: ``kryteria_napiecia`` (kryterium 4)."""
    return PodstawaWymagania(
        rodzaj=KRYTERIUM_SPADKU_CIAGU_SN_RODZAJ_PODSTAWY,
        dokument=KRYTERIUM_SPADKU_CIAGU_SN_DOKUMENT_PL,
        wydanie=KRYTERIUM_SPADKU_CIAGU_SN_WYDANIE,
        jednostka_redakcyjna=KRYTERIUM_SPADKU_CIAGU_SN_JEDNOSTKA_REDAKCYJNA,
        status=KRYTERIUM_SPADKU_CIAGU_SN_STAN_ZRODLA,
        uwagi_pl=KRYTERIUM_SPADKU_CIAGU_SN_PODSTAWA_PL,
    )


def _limit_spadku(podstawa: PodstawaWymagania) -> LimitKryterium:
    return LimitKryterium(
        wartosc=Wielkosc(wartosc=KRYTERIUM_SPADKU_CIAGU_SN_PROCENT, jednostka=_J_PROC),
        podstawa=podstawa,
        zakres_stosowalnosci_pl=(
            "spadek napięcia wzdłuż ciągu SN liczony od szyn SN GPZ o napięciu równym Un"
        ),
    )


def _dana_pradu(r: _Rozwiazany) -> DanaPrzyjeta:
    assert r.wejscie is not None and r.typ is not None
    return DanaPrzyjeta(
        nazwa_pl=f"prąd obliczeniowy odcinka {r.indeks} (spadek napięcia)",
        wartosc=Wielkosc(wartosc=_r(r.wejscie.current_a), jednostka=_J_A),
        powod_pl=(
            f"projektant nie podał prądu roboczego — przyjęto obciążalność długotrwałą typu "
            f"{r.typ.name}, czyli największy prąd długotrwały odcinka"
        ),
        jakosc=FieldQuality.SYSTEM_DEFAULT,
    )


def _status_danych(odcinki: Sequence[_Rozwiazany]) -> StatusDanych:
    przyjete = tuple(_dana_pradu(r) for r in odcinki if r.prad_z_obciazalnosci and r.wejscie)
    if przyjete:
        return StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=przyjete)
    return StatusDanych(stan="ZWALIDOWANE")


def _dowod_spadku(odcinki: Sequence[_Rozwiazany], odniesienie: str) -> StatusDowodu:
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_SPADKU)
    return StatusDowodu(
        metoda="OBLICZENIE",
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu="NIE_DOTYCZY",
        status_danych=_status_danych(odcinki),
        odniesienie=odniesienie,
    )


def _opis_wejscia_sladu(r: _Rozwiazany, wynik: CableVoltageDropResult) -> str:
    assert r.wejscie is not None
    w = r.wejscie
    return (
        f"odcinek {r.indeks}: I = {format_liczba(_r(w.current_a))} A, "
        f"L = {format_liczba(_r(w.length_km))} km, R = {format_liczba(_r(wynik.r_total_ohm))} Ω, "
        f"X = {format_liczba(_r(wynik.x_total_ohm))} Ω, cosφ = {format_liczba(_r(w.cos_phi))}, "
        f"ΔU = {format_liczba(_r(wynik.delta_u_v))} V "
        f"({format_liczba(_r(wynik.delta_u_pct))} %)"
    )


def _ocena_spadku_odcinka(
    r: _Rozwiazany, napiecie_kv: float, wynik_solvera: CableVoltageDropResult | None
) -> OcenaKryterium:
    """JEDYNA budowa rekordu K spadku napięcia odcinka."""
    podstawa = _podstawa_spadku()
    wynik: WynikKryterium | None = None
    slad_opis = "spadek nie policzony — brak danych odcinka"
    if wynik_solvera is not None:
        wynik = WynikKryterium(
            wielkosc_pl="spadek napięcia na odcinku względem napięcia ciągu",
            symbol_latex=r"\Delta U_{\%}",
            wartosc=Wielkosc(wartosc=_r(wynik_solvera.delta_u_pct), jednostka=_J_PROC),
            punkt_krytyczny_pl="koniec odcinka (odbiór skupiony na końcu)",
            metoda="OBLICZENIE",
        )
        slad_opis = f"{wynik_solvera.formula_ref}; {_opis_wejscia_sladu(r, wynik_solvera)}"
    return ocen_kryterium(
        kryterium_id=KRYTERIUM_SPADKU_ODCINKA,
        przedmiot=_przedmiot_odcinka(r, napiecie_kv),
        kryterium=Kryterium(
            opis_pl=(
                "Spadek napięcia na odcinku nie przekracza dopuszczalnego spadku napięcia "
                "wzdłuż ciągu SN"
            ),
            warunek_latex=r"\Delta U_{\%} \le \Delta U_{\mathrm{dop}}",
            relacja="NIE_WIECEJ",
        ),
        podstawa=podstawa,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl=(
                "odcinek jest częścią ciągu SN — jego spadek nie może sam przekroczyć "
                "dopuszczalnego spadku całego ciągu"
            ),
        ),
        wynik=wynik,
        limit=_limit_spadku(podstawa),
        niepewnosc=_NIEPEWNOSC_SPADKU,
        dowod=_dowod_spadku((r,), "podgląd spadku napięcia odcinka (solver spadku napięcia)"),
        zakres_waznosci=ZakresWaznosci(
            rodzaj_analizy="POWER_FLOW",
            opis_pl=(
                "Spadek napięcia na jednym odcinku przy prądzie odcinka skupionym na jego "
                "końcu, przybliżenie składowej podłużnej ΔU = √3·I·(R·cosφ + X·sinφ), odbiór "
                "o charakterze indukcyjnym, napięcie szyn SN GPZ równe Un."
            ),
            wykluczenia=_WYKLUCZENIA_SPADKU,
        ),
        slad=(
            OdnosnikSladu(
                krok=f"magistrala-sn:odcinek-{r.indeks}:spadek-napiecia", opis_pl=slad_opis
            ),
        ),
        braki_dodatkowe=r.braki,
    )


def _ocena_spadku_ciagu(
    odcinki: Sequence[_Rozwiazany],
    napiecie_kv: float,
    ciag: PodsumowanieCiagu,
) -> OcenaKryterium:
    """JEDYNA budowa rekordu K spadku skumulowanego ciągu."""
    podstawa = _podstawa_spadku()
    braki = [f"odcinek {r.indeks}: {b}" for r in odcinki for b in r.braki]
    wynik: WynikKryterium | None = None
    if ciag.spadek is not None:
        wynik = WynikKryterium(
            wielkosc_pl="spadek napięcia skumulowany wzdłuż ciągu względem napięcia ciągu",
            symbol_latex=r"\Delta U_{\%,\mathrm{ciąg}}",
            wartosc=Wielkosc(wartosc=_r(ciag.spadek.delta_u_pct), jednostka=_J_PROC),
            punkt_krytyczny_pl=f"koniec odcinka {len(odcinki)} (koniec budowanego ciągu)",
            metoda="OBLICZENIE",
        )
        slad_opisy = [
            _opis_wejscia_sladu(r, w) for r, w in zip(odcinki, ciag.spadek.segments, strict=True)
        ]
        slad_tekst = (
            f"{ciag.spadek.formula_ref}; "
            + "; ".join(slad_opisy)
            + f"; suma ΔU = {format_liczba(_r(ciag.spadek.delta_u_v))} V"
        )
    else:
        slad_tekst = "spadek ciągu nie policzony — odcinki bez kompletu danych: " + ", ".join(
            str(r.indeks) for r in odcinki if r.braki
        )
    dlugosc = (
        f"łączna długość {format_liczba(_r(ciag.dlugosc_m))} m"
        if ciag.dlugosc_m is not None
        else "łączna długość nieznana (odcinek bez długości)"
    )
    return ocen_kryterium(
        kryterium_id=KRYTERIUM_SPADKU_CIAGU,
        przedmiot=Przedmiot(
            element_ref=None,
            nazwa_pl="Ciąg magistrali SN budowany w kreatorze",
            opis_pl=(
                f"{_liczba_odcinkow_pl(ciag.liczba_odcinkow)} od startu ciągu (odcinki zapisane "
                f"w tej sesji i odcinek bieżący), {dlugosc}, napięcie ciągu "
                f"{format_liczba(_r(napiecie_kv))} kV"
            ),
        ),
        kryterium=Kryterium(
            opis_pl=(
                "Spadek napięcia skumulowany wzdłuż budowanego ciągu SN nie przekracza "
                "dopuszczalnego spadku napięcia"
            ),
            warunek_latex=r"\sum_i \Delta U_{\%,i} \le \Delta U_{\mathrm{dop}}",
            relacja="NIE_WIECEJ",
        ),
        podstawa=podstawa,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl=(
                "napięcie na końcu ciągu SN wyznacza zapas na spadek napięcia w sieci nN "
                "odbiorców zasilanych z tego ciągu"
            ),
        ),
        wynik=wynik,
        limit=_limit_spadku(podstawa),
        niepewnosc=_NIEPEWNOSC_SPADKU,
        dowod=_dowod_spadku(odcinki, "suma spadków odcinków (solver spadku napięcia ciągu)"),
        zakres_waznosci=ZakresWaznosci(
            rodzaj_analizy="POWER_FLOW",
            opis_pl=(
                "Ciąg promieniowy od startu (szyny SN GPZ o napięciu Un) przez odcinki "
                "zapisane w tej sesji kreatora do końca odcinka bieżącego; każdy odcinek "
                "liczony przy prądzie roboczym podanym dla tego odcinka (prąd płynący przez "
                "odcinek, obejmujący odbiory dalej w ciągu), spadki odcinków sumowane."
            ),
            wykluczenia=(
                *_WYKLUCZENIA_SPADKU,
                "odcinki ciągu zbudowane przed otwarciem kreatora (poza tą sesją budowy)",
            ),
        ),
        slad=(OdnosnikSladu(krok="magistrala-sn:ciag:spadek-napiecia", opis_pl=slad_tekst),),
        braki_dodatkowe=braki,
    )


def ocen_dobor_magistrali(
    *,
    napiecie_kv: float,
    odcinek: OdcinekMagistrali,
    odcinki_zbudowane: Sequence[OdcinekMagistrali] = (),
    katalog: KatalogTypowSn | None = None,
) -> OcenaDoboruMagistrali:
    """Oceń odcinek bieżący i ciąg (odcinki zbudowane w kolejności od startu + bieżący).

    Raises:
        ValueError: napięcie ciągu nie jest dodatnie albo dane odcinka łamią dziedzinę solvera
            (cosφ poza (0, 1], długość albo prąd niedodatnie).
    """
    if napiecie_kv <= 0.0:
        raise ValueError("Napięcie ciągu musi być dodatnie.")
    kat: KatalogTypowSn = katalog if katalog is not None else get_default_mv_catalog()
    wszystkie = [*odcinki_zbudowane, odcinek]
    rozwiazane = [_rozwiaz(i, o, napiecie_kv, kat) for i, o in enumerate(wszystkie, start=1)]
    biezacy = rozwiazane[-1]

    spadek_odcinka: SpadekOdcinka | None = None
    if biezacy.wejscie is not None:
        spadek_odcinka = SpadekOdcinka(
            wynik=compute_cable_voltage_drop(biezacy.wejscie),
            prad_obliczeniowy_a=biezacy.wejscie.current_a,
            prad_z_obciazalnosci=biezacy.prad_z_obciazalnosci,
        )

    kompletne = all(r.wejscie is not None for r in rozwiazane)
    spadek_ciagu = (
        compute_trunk_voltage_drop(tuple(r.wejscie for r in rozwiazane if r.wejscie is not None))
        if kompletne
        else None
    )
    dlugosci = [r.odcinek.dlugosc_m for r in rozwiazane]
    ciag = PodsumowanieCiagu(
        liczba_odcinkow=len(rozwiazane),
        dlugosc_m=(
            _r(sum(d for d in dlugosci if d is not None))
            if all(d is not None for d in dlugosci)
            else None
        ),
        spadek=spadek_ciagu,
    )
    return OcenaDoboruMagistrali(
        spadek_odcinka=spadek_odcinka,
        ciag=ciag,
        oceny_odcinka=(
            _ocena_obciazalnosci(biezacy, napiecie_kv),
            _ocena_spadku_odcinka(
                biezacy,
                napiecie_kv,
                spadek_odcinka.wynik if spadek_odcinka is not None else None,
            ),
        ),
        ocena_ciagu=_ocena_spadku_ciagu(rozwiazane, napiecie_kv, ciag),
    )
