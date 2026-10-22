"""Linia napowietrzna 110 kV: przewód z katalogu + geometria słupa → R′, X′, B′, Z′0 (karta LINIA-110).

JEDNO miejsce, w którym model sieci (ENM) spotyka solver
``network_model.solvers.parametry_linii_napowietrznej``:

* ``tabliczka_przewodu_linii_wn`` — predykat „zmaterializowana tabliczka jest przewodem linii
  110 kV” (klucze unikalne kontraktu ``PRZEWOD_LINII_WN``, przypięte testem); każda ścieżka
  materializacji gałęzi (przypisanie katalogu, tworzenie odcinków, podział odcinka) przechodzi
  przez ``_apply_materialized_branch_fields``, który dla takiej tabliczki woła
  ``zastosuj_parametry_z_geometrii`` — nie ma drogi, na której przewód 110 kV trafiłby do
  gałęzi bez przeliczenia;
* ``wejscie_linii`` — wejście solvera z tabliczki przewodu, geometrii projektu
  (``OverheadLine.geometria_slupa``) i wartości roboczych rejestru (zasada nr 4);
* ``zastosuj_parametry_z_geometrii`` — wpis wyniku do pól impedancji linii i proweniencji
  ``parametry_z_geometrii``;
* ``zalozenia_linii_wn`` — założenia biegu (zwarcia i rozpływ) dla linii liczonych z wartością
  roboczą geometrii.

Geometria jest daną projektu; wartości zmierzone albo podane przez OSD (R, X, B linii) idą
istniejącą ścieżką ręczną ``source_mode = EKSPERCKI_RECZNY`` (bez kategorii katalogu) — ta
ścieżka nie przelicza niczego z geometrii.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from network_model.catalog.repository import CatalogRepository
from network_model.catalog.types import MATERIALIZATION_CONTRACTS, CatalogNamespace
from network_model.catalog.wartosci_robocze import (
    DaneLiniiRozstrzygniete,
    GeometriaProjektuLinii,
    dane_przyjete_linii_wn,
    rozstrzygnij_dane_linii_wn,
)
from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana
from network_model.solvers.parametry_linii_napowietrznej import (
    DanePrzewodu,
    GeometriaLinii,
    ParametryLiniiNapowietrznej,
    PolozeniePrzewodu,
    WejscieParametrowLinii,
    oblicz_parametry_linii,
)

from .models import EnergyNetworkModel, GeometriaSlupaLinii, OverheadLine, PolozeniePrzewoduLinii
from .nazwy_elementow import nazwa_elementu

#: Przestrzeń katalogu przewodów linii 110 kV.
PRZESTRZEN_PRZEWODU_WN = CatalogNamespace.PRZEWOD_LINII_WN.value

#: Kod założenia biegu i rejestru gotowości: linia 110 kV liczona z wartością roboczą
#: geometrii, przewodu odgromowego albo rezystywności gruntu (poziom informacyjny).
KOD_GEOMETRIA_ROBOCZA = "line.geometria_wartosc_robocza"
#: Odmowa: geometria słupa sprzeczna (położenia, wiązka) albo typ przewodu niepoprawny.
KOD_GEOMETRIA_NIEPOPRAWNA = "line.geometria_niepoprawna"
#: Odmowa: wskazany typ przewodu odgromowego nie istnieje w katalogu przewodów linii 110 kV.
KOD_PRZEWOD_ODGROMOWY_NIEZNANY = "line.przewod_odgromowy_nieznany"
#: Odmowa: ręczna zmiana R′/X′/B′ linii, której parametry wynikają z geometrii.
KOD_PARAMETRY_Z_GEOMETRII = "line.parametry_z_geometrii"
#: Odmowa: geometria słupa na gałęzi, która nie jest linią z przewodem 110 kV z katalogu.
KOD_GEOMETRIA_BEZ_PRZEWODU_WN = "line.geometria_bez_przewodu_wn"
#: Odmowa: fazę linii wiąże pozycja katalogu przeznaczona na przewód odgromowy.
KOD_PRZEWOD_NIE_FAZOWY = "line.przewod_wn_nie_fazowy"

#: Pola impedancji linii WYNIKAJĄCE z geometrii — nie są edytowane ręcznie na linii z
#: przewodem z katalogu ``PRZEWOD_LINII_WN`` (drogą ręczną jest ``EKSPERCKI_RECZNY``).
POLA_Z_GEOMETRII: tuple[str, ...] = (
    "r_ohm_per_km",
    "x_ohm_per_km",
    "b_siemens_per_km",
    "r0_ohm_per_km",
    "x0_ohm_per_km",
    "b0_siemens_per_km",
)


def _klucze_unikalne_kontraktu() -> frozenset[str]:
    """Pola WYMAGANE kontraktu ``PRZEWOD_LINII_WN``, których nie ma żaden inny kontrakt.

    Pole opcjonalne (``gmr_mm``) materializacja pomija, gdy typ go nie podaje — nie może więc
    rozpoznawać tabliczki (przewód bez GMR w tablicy byłby wtedy „nie przewodem 110 kV").
    """
    kontrakt = MATERIALIZATION_CONTRACTS[PRZESTRZEN_PRZEWODU_WN]
    wlasne = set(kontrakt.solver_fields) - set(kontrakt.pola_opcjonalne)
    for przestrzen, kontrakt in MATERIALIZATION_CONTRACTS.items():
        if przestrzen != PRZESTRZEN_PRZEWODU_WN:
            wlasne -= set(kontrakt.solver_fields)
    return frozenset(wlasne)


#: Klucze, po których tabliczka gałęzi jest rozpoznawana jako przewód linii 110 kV.
KLUCZE_TABLICZKI_PRZEWODU_WN: frozenset[str] = _klucze_unikalne_kontraktu()


class BladParametrowLiniiWN(OdmowaNazwana):
    """Odmowa danych linii 110 kV (geometria, przewód odgromowy) — kod w polu ``kod``."""


def tabliczka_przewodu_linii_wn(materialized_params: Mapping[str, Any] | None) -> bool:
    """Czy zmaterializowana tabliczka gałęzi pochodzi z katalogu ``PRZEWOD_LINII_WN``."""
    if not isinstance(materialized_params, Mapping):
        return False
    return KLUCZE_TABLICZKI_PRZEWODU_WN.issubset(materialized_params.keys())


def linia_z_geometrii(element: Mapping[str, Any]) -> bool:
    """Linia napowietrzna, której R′/X′/B′/Z′0 wynikają z geometrii (przewód z katalogu 110 kV).

    JEDEN predykat dla operacji domenowych, gotowości i założeń biegu: rodzaj gałęzi + tabliczka
    przewodu 110 kV + pochodzenie katalogowe (ścieżka ręczna ``EKSPERCKI_RECZNY`` nie przelicza).
    """
    return (
        element.get("type") == "line_overhead"
        and element.get("source_mode") == "KATALOG"
        and tabliczka_przewodu_linii_wn(element.get("materialized_params"))
    )


def geometria_projektu(element: Mapping[str, Any]) -> GeometriaProjektuLinii:
    """Dane geometrii z elementu modelu (``geometria_slupa``) w postaci rejestru wartości."""
    surowa = element.get("geometria_slupa")
    if not isinstance(surowa, Mapping):
        return GeometriaProjektuLinii()

    # Kształt i wartości domyślne geometrii (np. pojedynczy przewód w fazie) — JEDNO źródło:
    # model ``GeometriaSlupaLinii``; tu brak składowej zostaje brakiem (``None``), który rejestr
    # wartości roboczych rozstrzyga jawnie (zasada nr 4).
    geometria = GeometriaSlupaLinii.model_validate(dict(surowa))

    def polozenia(
        lista: list[PolozeniePrzewoduLinii] | None,
    ) -> tuple[tuple[float, float], ...] | None:
        if lista is None:
            return None
        return tuple((p.x_m, p.y_m) for p in lista)

    return GeometriaProjektuLinii(
        fazy=polozenia(geometria.fazy),
        liczba_w_wiazce=geometria.liczba_w_wiazce,
        odstep_wiazki_m=geometria.odstep_wiazki_m,
        odgromowe=polozenia(geometria.odgromowe),
        przewod_odgromowy_ref=geometria.przewod_odgromowy_ref or None,
        rezystywnosc_gruntu_ohm_m=geometria.rezystywnosc_gruntu_ohm_m,
    )


def dane_przewodu(tabliczka: Mapping[str, Any], *, nazwa: str) -> DanePrzewodu:
    """Dane przewodu solvera z tabliczki (materializacja albo ``to_dict`` typu katalogowego)."""
    gmr = tabliczka.get("gmr_mm")
    return DanePrzewodu(
        identyfikator=str(tabliczka.get("oznaczenie") or nazwa),
        nazwa=nazwa,
        srednica_mm=float(tabliczka["srednica_mm"]),
        r20_ohm_per_km=float(tabliczka["r20_dc_ohm_per_km"]),
        alfa_1_per_k=float(tabliczka["alfa_1_per_k"]),
        gmr_mm=float(gmr) if gmr is not None else None,
        warstwy_al=tuple(int(w) for w in tabliczka["warstwy_al"]),
        srednica_drutu_al_mm=float(tabliczka["srednica_drutu_al_mm"]),
        srednica_rdzenia_mm=float(tabliczka["srednica_rdzenia_mm"]),
    )


def _przewod_odgromowy(
    dane: DaneLiniiRozstrzygniete, katalog: CatalogRepository
) -> DanePrzewodu | None:
    if dane.przewod_odgromowy_ref is None:
        return None
    ref = str(dane.przewod_odgromowy_ref.wartosc)
    typ = katalog.get_overhead_conductor_type(ref)
    if typ is None:
        raise BladParametrowLiniiWN(
            "Wskazanego typu przewodu odgromowego nie ma w katalogu przewodów linii 110 kV — "
            "wybierz pozycję z listy katalogu.",
            kod=KOD_PRZEWOD_ODGROMOWY_NIEZNANY,
            dane={"przewod_odgromowy_ref": ref},
        )
    return dane_przewodu(typ.to_dict(), nazwa=typ.name)


def wejscie_linii(
    element: Mapping[str, Any], katalog: CatalogRepository, czestotliwosc_hz: float
) -> tuple[WejscieParametrowLinii, DaneLiniiRozstrzygniete]:
    """Wejście solvera dla linii z przewodem 110 kV: tabliczka + geometria + wartości robocze."""
    tabliczka = element.get("materialized_params")
    if not tabliczka_przewodu_linii_wn(tabliczka):
        raise AssertionError("wejscie_linii dla gałęzi bez tabliczki przewodu linii 110 kV")
    assert isinstance(tabliczka, Mapping)
    miejsce = f"linia {nazwa_elementu(element, 'branches')}"
    # JEDNA brama przeznaczenia przewodu dla KAŻDEJ ścieżki (przypisanie katalogu, zmiana
    # geometrii, przeliczenie po zmianie częstotliwości, podgląd, bieg): faza linii to przewód
    # fazowy, pozycja „ODGROMOWY” wchodzi wyłącznie jako przewód odgromowy geometrii.
    if tabliczka.get("przeznaczenie") != "FAZOWY":
        raise BladParametrowLiniiWN(
            f"Przewód {tabliczka.get('oznaczenie')} ({miejsce}) jest w katalogu przewodem "
            "odgromowym — fazy linii wiąże przewód fazowy; przewód odgromowy wskazuje się "
            "w geometrii słupa.",
            kod=KOD_PRZEWOD_NIE_FAZOWY,
            dane={"przeznaczenie": tabliczka.get("przeznaczenie")},
        )
    dane = rozstrzygnij_dane_linii_wn(geometria_projektu(element))
    fazy = tuple(PolozeniePrzewodu(x, y) for x, y in dane.fazy.wartosc)
    if len(fazy) != 3:
        raise BladParametrowLiniiWN(
            f"Geometria słupa ({miejsce}) wymaga położeń dokładnie trzech faz.",
            kod=KOD_GEOMETRIA_NIEPOPRAWNA,
            dane={"liczba_faz": len(fazy)},
        )
    wejscie = WejscieParametrowLinii(
        przewod_fazowy=dane_przewodu(tabliczka, nazwa=str(tabliczka.get("oznaczenie"))),
        geometria=GeometriaLinii(
            fazy=(fazy[0], fazy[1], fazy[2]),
            liczba_w_wiazce=dane.liczba_w_wiazce,
            odstep_wiazki_m=dane.odstep_wiazki_m,
            odgromowe=tuple(PolozeniePrzewodu(x, y) for x, y in dane.odgromowe.wartosc),
        ),
        rezystywnosc_gruntu_ohm_m=float(dane.rezystywnosc_gruntu.wartosc),
        czestotliwosc_hz=czestotliwosc_hz,
        temperatura_przewodu_c=float(tabliczka["max_temperature_c"]),
        przewod_odgromowy=_przewod_odgromowy(dane, katalog),
        dane_przyjete=dane_przyjete_linii_wn(dane, miejsce_pl=miejsce),
    )
    return wejscie, dane


def oblicz_linie(
    element: Mapping[str, Any], katalog: CatalogRepository, czestotliwosc_hz: float
) -> tuple[ParametryLiniiNapowietrznej, DaneLiniiRozstrzygniete]:
    """Wynik solvera dla linii (odmowa danych solvera → ``BladParametrowLiniiWN``)."""
    wejscie, dane = wejscie_linii(element, katalog, czestotliwosc_hz)
    try:
        wynik = oblicz_parametry_linii(wejscie)
    except BladParametrowLiniiWN:
        raise
    except OdmowaDanychError as blad:
        raise BladParametrowLiniiWN(
            f"Linia {nazwa_elementu(element, 'branches')}: {blad}", kod=KOD_GEOMETRIA_NIEPOPRAWNA
        ) from blad
    return wynik, dane


def zastosuj_parametry_z_geometrii(
    target: dict[str, Any], katalog: CatalogRepository, czestotliwosc_hz: float
) -> None:
    """Wpisz R′/X′/B′/Z′0 z geometrii do linii i zostaw proweniencję ``parametry_z_geometrii``.

    ``r_ohm_per_km`` = R′ w 20 °C (konwencja gałęzi: tor I″k,min koryguje temperaturę osobno);
    R′ w temperaturze dopuszczalnej przewodu stoi w proweniencji i w śladzie.
    """
    if target.get("type") != "line_overhead":
        raise BladParametrowLiniiWN(
            "Przewód linii napowietrznej 110 kV można przypisać wyłącznie linii napowietrznej.",
            kod=KOD_GEOMETRIA_BEZ_PRZEWODU_WN,
        )
    wynik, dane = oblicz_linie(target, katalog, czestotliwosc_hz)
    target["r_ohm_per_km"] = wynik.r1_ohm_per_km
    target["x_ohm_per_km"] = wynik.x1_ohm_per_km
    target["b_siemens_per_km"] = wynik.b1_s_per_km
    target["r0_ohm_per_km"] = wynik.r0_ohm_per_km
    target["x0_ohm_per_km"] = wynik.x0_ohm_per_km
    target["b0_siemens_per_km"] = wynik.b0_s_per_km
    target["parametry_z_geometrii"] = {
        "metoda": wynik.metoda,
        "wersja_metody": wynik.wersja_metody,
        "odcisk_wejscia": wynik.odcisk_wejscia,
        "kompletnosc_dowodu": wynik.kompletnosc_dowodu,
        "czestotliwosc_hz": czestotliwosc_hz,
        "temperatura_przewodu_c": wynik.temperatura_przewodu_c,
        "r1_temperatura_ohm_per_km": wynik.r1_temperatura_ohm_per_km,
        "r0_bez_odgromowych_ohm_per_km": wynik.r0_bez_odgromowych_ohm_per_km,
        "x0_bez_odgromowych_ohm_per_km": wynik.x0_bez_odgromowych_ohm_per_km,
        "gmd_m": wynik.gmd_m,
        "gmr_fazy_m": wynik.gmr_fazy_m,
        "wartosci_robocze": [s.parametr for s in dane.robocze],
    }


def linie_modelu_z_geometrii(enm: EnergyNetworkModel) -> list[OverheadLine]:
    """Linie modelu z przewodem z katalogu 110 kV (parametry z geometrii) — kolejność gałęzi."""
    return [
        galaz
        for galaz in enm.branches
        if isinstance(galaz, OverheadLine)
        and linia_z_geometrii(galaz.model_dump(mode="json", include=_POLA_PREDYKATU))
    ]


_POLA_PREDYKATU = {"type", "source_mode", "materialized_params"}


def linie_z_wartoscia_robocza(enm: EnergyNetworkModel) -> list[OverheadLine]:
    """Linie 110 kV, których parametry policzono z co najmniej jedną wartością roboczą.

    JEDNO źródło zbioru dla założeń wszystkich biegów (zwarcia, rozpływ symetryczny
    i niesymetryczny) — kolejność gałęzi modelu (deterministycznie).
    """
    return [
        linia
        for linia in linie_modelu_z_geometrii(enm)
        if linia.parametry_z_geometrii is not None and linia.parametry_z_geometrii.wartosci_robocze
    ]


def zalozenia_linii_wn(enm: EnergyNetworkModel, scenario: str | None) -> tuple[dict[str, Any], ...]:
    """Założenia biegu: jedno na KAŻDĄ linię 110 kV liczoną z wartością roboczą danych linii.

    Wzorzec założeń biegu (``fault.c_tolerancja_nn_robocza``): kod, element, zdanie, scenariusz,
    parametr (pole, w którym projektant zmienia wartość). Linia z kompletem danych projektu
    nie daje założenia. ``scenario`` = scenariusz współczynnika c biegu zwarciowego; rozpływ
    (bez scenariusza c) podaje ``None`` i klucz ``scenariusz`` jest pominięty.
    """
    zalozenia: list[dict[str, Any]] = []
    for linia in linie_z_wartoscia_robocza(enm):
        dane = rozstrzygnij_dane_linii_wn(geometria_projektu(linia.model_dump(mode="json")))
        opisy = " ".join(s.opis_zrodla_pl() for s in dane.robocze)
        zalozenia.append(
            {
                "code": KOD_GEOMETRIA_ROBOCZA,
                "element_ref": linia.ref_id,
                "message_pl": (
                    f"{nazwa_elementu(linia, 'branches')}: R′, X′, B′ i Z′0 linii 110 kV policzone z "
                    f"geometrii słupa z wartościami roboczymi. {opisy} Zmień wartość: "
                    "geometria słupa w parametrach linii."
                ),
                **({"scenariusz": scenario} if scenario is not None else {}),
                "parametr": "geometria_slupa",
            }
        )
    return tuple(zalozenia)
