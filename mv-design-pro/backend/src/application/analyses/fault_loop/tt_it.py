"""Dane pętli zwarcia doziemnego TT/IT wyławiane Z MODELU (karta W5-E-TTIT) — warstwa aplikacji.

Zero fizyki: tu wyłącznie ODCZYT pól ENM i nazwane odmowy, gdy danej nie ma. Fizyka
(pętla doziemna, U_dotyk, I_d, drugie zwarcie IT) żyje w
``network_model/solvers/petla_zwarcia_tt_it.py`` wołanym przez jedyne wejście
``fault_loop_iec60364.compute_fault_loop``.

Nośniki danych (jedno źródło każdej danej):

* R_A — ``Load.earth_electrode_r_ohm`` odbiorów na szynie punktu (instalacja odbiorcza);
  przy kilku odbiorach z R_A bierzemy NAJWIĘKSZY (największa impedancja pętli, najmniejszy
  prąd doziemny, największe napięcie dotykowe — najgorszy przypadek, nazwany w śladzie);
* R_B — ``Transformer.lv_neutral`` typu ``directly_grounded`` z ``r_ohm`` (uziom punktu
  neutralnego nN); inny typ punktu neutralnego albo brak ``r_ohm`` = odmowa;
* RCD — OSTATNI na trasie (najbliższy punktowi) aparat z wiązaniem ``APARAT_NN_RCD``
  i zmaterializowanymi parametrami (I_Δn, czasy);
* C_e sieci IT — ``b0_siemens_per_km`` KAŻDEGO odcinka (kabel, linia) osiągalnego z zacisków
  nN transformatora po zamkniętych gałęziach; brak na którymkolwiek = odmowa nazywająca
  odcinki (zero fabrykacji pojemności).

Każda odmowa niesie ``kod_odmowy`` z rejestru kodów gotowości (``domain/canonical_operations``)
— akcja naprawcza prowadzi projektanta do nośnika danej.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from enm.models import (
    Cable,
    EnergyNetworkModel,
    Load,
    OverheadLine,
    SwitchBranch,
    Transformer,
    liczba_torow,
)
from enm.nazwy_elementow import nazwa_elementu, nazwa_po_identyfikatorze
from enm.slownik_komunikatow import opis_obiektu
from enm.zdania_odmow_rdzenia import nazwy_w_odmowach_elementow
from network_model.solvers.petla_zwarcia_tt_it import DaneTtIt, PojemnoscDoziemnaOdcinka

from .route import LvBusPath, RouteExtractionError, bfs_paths_from

#: Kody odmów nazwanych (rejestr: ``domain/canonical_operations.READINESS_CODES``).
KOD_BRAK_R_A = "nn.brak_r_a"
KOD_BRAK_R_B = "nn.brak_r_b"
KOD_BRAK_RCD = "nn.brak_rcd"
KOD_BRAK_POJEMNOSCI = "nn.brak_pojemnosci_doziemnej"

#: Przestrzeń katalogu wyłącznika różnicowoprądowego (``network_model.catalog.types``).
PRZESTRZEN_RCD = "APARAT_NN_RCD"


@dataclass(frozen=True)
class RcdNaTrasie:
    """Parametry RCD najbliższego punktowi (z ``materialized_params`` gałęzi)."""

    branch_ref: str
    nazwa: str
    catalog_ref: str | None
    i_delta_n_a: float
    t_a_s: float | None
    t_a_2idn_s: float | None
    t_a_5idn_s: float | None
    in_a: float | None
    rcd_type: str | None
    selective: bool
    verification_status: str | None
    source_reference: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_ref": self.branch_ref,
            "nazwa": self.nazwa,
            "catalog_ref": self.catalog_ref,
            "i_delta_n_a": self.i_delta_n_a,
            "t_a_s": self.t_a_s,
            "t_a_2idn_s": self.t_a_2idn_s,
            "t_a_5idn_s": self.t_a_5idn_s,
            "in_a": self.in_a,
            "rcd_type": self.rcd_type,
            "selective": self.selective,
            "verification_status": self.verification_status,
            "source_reference": self.source_reference,
        }


@dataclass(frozen=True)
class UziomInstalacji:
    load_ref: str
    nazwa: str
    r_a_ohm: float
    #: Odbiory na szynie z R_A, których uziom NIE został wybrany (mniejsze R_A).
    pominiete_load_refs: tuple[str, ...]


@dataclass(frozen=True)
class DanePunktuTtIt:
    """Komplet danych TT/IT punktu (wejście solvera + kontekst werdyktu)."""

    dane: DaneTtIt
    uziom: UziomInstalacji | None
    r_b_ohm: float | None
    rcd: RcdNaTrasie | None
    czestotliwosc_hz: float | None
    odcinki_pojemnosci: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "r_a": (
                {
                    "load_ref": self.uziom.load_ref,
                    "nazwa": self.uziom.nazwa,
                    "r_a_ohm": self.uziom.r_a_ohm,
                    "pominiete_load_refs": list(self.uziom.pominiete_load_refs),
                }
                if self.uziom is not None
                else None
            ),
            "r_b_ohm": self.r_b_ohm,
            "rcd": self.rcd.to_dict() if self.rcd is not None else None,
            "czestotliwosc_hz": self.czestotliwosc_hz,
            "odcinki_pojemnosci": list(self.odcinki_pojemnosci),
        }


def odmowa_tt_it(
    context: dict[str, Any], *, kod: str, reason_pl: str, missing_data: list[str]
) -> dict[str, Any]:
    """Odmowa NAZWANA danych TT/IT — ten sam kształt co pozostałe odmowy widoków nN."""
    return {
        **context,
        "status": "brak danych",
        "kod_odmowy": kod,
        "missing_data": missing_data,
        "reason_pl": reason_pl,
    }


def uziom_instalacji_dla_punktu(enm: EnergyNetworkModel, bus_ref: str) -> UziomInstalacji | None:
    """R_A instalacji w punkcie: największy zadeklarowany uziom odbiorów na szynie."""
    # Odbiory BEZ zadeklarowanego uziomu są pomijane (brak danej ≠ zero omów).
    odbiory: list[tuple[Load, float]] = [
        (ld, float(ld.earth_electrode_r_ohm))
        for ld in enm.loads
        if ld.bus_ref == bus_ref and ld.earth_electrode_r_ohm is not None
    ]
    if not odbiory:
        return None
    odbiory.sort(key=lambda para: (-para[1], para[0].ref_id))
    wybrany, r_a = odbiory[0]
    return UziomInstalacji(
        load_ref=wybrany.ref_id,
        nazwa=nazwa_elementu(wybrany, "loads"),
        r_a_ohm=r_a,
        pominiete_load_refs=tuple(ld.ref_id for ld, _ in odbiory[1:]),
    )


def r_b_transformatora(trafo: Transformer) -> tuple[float | None, str | None]:
    """R_B: rezystancja uziomu punktu neutralnego nN (``lv_neutral`` uziemiony bezpośrednio)."""
    cfg = trafo.lv_neutral
    opis = opis_obiektu(trafo, "Transformator")
    if cfg is None:
        return None, (
            f"{opis} nie ma opisu punktu neutralnego strony nN — układ TT wymaga punktu "
            "neutralnego uziemionego bezpośrednio z rezystancją uziomu R_B."
        )
    # ``lv_neutral.r_ohm`` jest rezystancją uziomu R_B wyłącznie przy punkcie bezpośrednio
    # uziemionym (słownik typów: ``network_model.core.uziemienie.TypPunktuNeutralnego``).
    if cfg.type != "directly_grounded":
        return None, (
            f"{opis}: punkt neutralny nN opisany jako „{cfg.type}” — układ TT wymaga punktu "
            "neutralnego uziemionego bezpośrednio (R_B = rezystancja uziomu)."
        )
    if cfg.r_ohm is None or cfg.r_ohm <= 0:
        return None, (
            f"{opis}: punkt neutralny nN uziemiony bezpośrednio bez rezystancji uziomu R_B — "
            "pętla doziemna TT domyka się przez R_B; uzupełnij rezystancję uziomu stacji."
        )
    return float(cfg.r_ohm), None


def rcd_na_trasie(path: LvBusPath) -> RcdNaTrasie | None:
    """RCD najbliższy punktowi: ostatnia gałąź trasy z wiązaniem ``APARAT_NN_RCD``."""
    for branch in reversed(path.branches):
        if not isinstance(branch, SwitchBranch) or branch.catalog_namespace != PRZESTRZEN_RCD:
            continue
        params = branch.materialized_params if isinstance(branch.materialized_params, dict) else {}
        i_delta_n = params.get("i_delta_n_a")
        if i_delta_n is None or float(i_delta_n) <= 0:
            continue
        return RcdNaTrasie(
            branch_ref=branch.ref_id,
            nazwa=nazwa_elementu(branch, "branches"),
            catalog_ref=branch.catalog_ref,
            i_delta_n_a=float(i_delta_n),
            t_a_s=(float(params["t_a_s"]) if params.get("t_a_s") is not None else None),
            t_a_2idn_s=(
                float(params["t_a_2idn_s"]) if params.get("t_a_2idn_s") is not None else None
            ),
            t_a_5idn_s=(
                float(params["t_a_5idn_s"]) if params.get("t_a_5idn_s") is not None else None
            ),
            in_a=(float(params["in_a"]) if params.get("in_a") is not None else None),
            rcd_type=params.get("rcd_type"),
            selective=bool(params.get("selective", False)),
            verification_status=params.get("verification_status"),
            source_reference=params.get("source_reference"),
        )
    return None


def pojemnosci_sieci_it(
    enm: EnergyNetworkModel, trafo: Transformer
) -> tuple[tuple[PojemnoscDoziemnaOdcinka, ...], list[str]]:
    """Pojemności doziemne WSZYSTKICH odcinków sieci IT zasilanej z transformatora.

    Sieć IT = wszystko osiągalne z zacisków nN transformatora po zamkniętych gałęziach
    (ta sama definicja aktywnej topologii co trasa pętli). Zwraca odcinki z ``b_0`` i listę
    referencji odcinków BEZ ``b0_siemens_per_km`` (niepusta = odmowa u wołającego).
    """
    paths = bfs_paths_from(enm, trafo.lv_bus_ref)
    widziane: dict[str, Cable | OverheadLine] = {}
    for path in paths.values():
        for branch in path.branches:
            if isinstance(branch, Cable | OverheadLine):
                widziane.setdefault(branch.ref_id, branch)
    odcinki: list[PojemnoscDoziemnaOdcinka] = []
    braki: list[str] = []
    for ref in sorted(widziane):
        branch = widziane[ref]
        if branch.b0_siemens_per_km is None:
            braki.append(ref)
            continue
        n_parallel = liczba_torow(branch)
        nazwa = nazwa_elementu(branch, "branches")
        # Partia integracji 10: odmowa danych odcinka z rdzenia TT/IT niesie odwołanie do
        # gałęzi modelu — zdanie z nazwą odcinka składa granica zdań.
        with nazwy_w_odmowach_elementow(((ref, nazwa),)):
            odcinki.append(
                PojemnoscDoziemnaOdcinka(
                    label=f"Odcinek {nazwa}",
                    branch_ref=ref,
                    b0_siemens_per_km=float(branch.b0_siemens_per_km),
                    length_km=float(branch.length_km),
                    n_parallel=n_parallel,
                )
            )
    return tuple(odcinki), braki


def czestotliwosc_sieci_hz(enm: EnergyNetworkModel) -> float | None:
    """Częstotliwość studium z nagłówka ENM (``ENMDefaults.frequency_hz``); brak = ``None``."""
    defaults = getattr(enm.header, "defaults", None)
    wartosc = getattr(defaults, "frequency_hz", None) if defaults is not None else None
    return float(wartosc) if wartosc is not None and wartosc > 0 else None


def dane_tt_dla_punktu(
    enm: EnergyNetworkModel,
    trafo: Transformer,
    path: LvBusPath | None,
    bus_ref: str,
    context: dict[str, Any],
) -> DanePunktuTtIt | dict[str, Any]:
    """Komplet danych pętli TT dla punktu ALBO odmowa nazwana (R_B → R_A → RCD)."""
    r_b, powod_r_b = r_b_transformatora(trafo)
    if r_b is None:
        return odmowa_tt_it(
            context, kod=KOD_BRAK_R_B, reason_pl=str(powod_r_b), missing_data=["lv_neutral.r_ohm"]
        )
    uziom = uziom_instalacji_dla_punktu(enm, bus_ref)
    if uziom is None:
        return odmowa_tt_it(
            context,
            kod=KOD_BRAK_R_A,
            reason_pl=(
                "Pętla zwarcia doziemnego układu TT domyka się przez uziom instalacji odbiorczej "
                f"R_A — żaden odbiór na szynie „{nazwa_po_identyfikatorze(bus_ref, enm)}” nie deklaruje rezystancji uziomu "
                "(pole odbioru nN „rezystancja uziomu instalacji”). Uzupełnij R_A odbioru w tym "
                "punkcie; napięcie dotykowe i prąd doziemny nie są liczone bez niej."
            ),
            missing_data=["earth_electrode_r_ohm"],
        )
    rcd = rcd_na_trasie(path) if path is not None else None
    if rcd is None:
        return odmowa_tt_it(
            context,
            kod=KOD_BRAK_RCD,
            reason_pl=(
                "Ochrona przeciwporażeniowa w układzie TT opiera się na wyłączniku "
                f"różnicowoprądowym — na trasie do punktu „{nazwa_po_identyfikatorze(bus_ref, enm)}” nie ma aparatu z wiązaniem "
                "katalogowym wyłącznika różnicowoprądowego (prąd różnicowy znamionowy I_Δn, czasy "
                "wyłączenia). Dodaj wyłącznik różnicowoprądowy w torze instalacji odbiorczej."
            ),
            missing_data=["rcd"],
        )
    return DanePunktuTtIt(
        dane=DaneTtIt(r_a_ohm=uziom.r_a_ohm, r_b_ohm=r_b, i_delta_n_a=rcd.i_delta_n_a),
        uziom=uziom,
        r_b_ohm=r_b,
        rcd=rcd,
        czestotliwosc_hz=None,
        odcinki_pojemnosci=(),
    )


@dataclass(frozen=True)
class DaneSieciIt:
    """Dane sieci IT WSPÓLNE dla wszystkich punktów zasilanych z transformatora."""

    odcinki: tuple[PojemnoscDoziemnaOdcinka, ...]
    czestotliwosc_hz: float


def dane_sieci_it(
    enm: EnergyNetworkModel, trafo: Transformer, context: dict[str, Any]
) -> DaneSieciIt | dict[str, Any]:
    """Pojemności doziemne i częstotliwość sieci IT ALBO odmowa nazwana.

    Dane są własnością SIECI (nie punktu): widok odpływów odmawia nimi w całości,
    a punkt — tym samym czytnikiem (jedno źródło prawdy odmowy `nn.brak_pojemnosci_doziemnej`).
    """
    try:
        odcinki, braki = pojemnosci_sieci_it(enm, trafo)
    except RouteExtractionError as exc:
        # Szyna nN transformatora poza modelem: sieci IT nie da się wyznaczyć — odmowa tym
        # samym kształtem co punkt bez trasy w widoku odpływów (`service.py`).
        return {
            **context,
            "status": "brak danych",
            "reason_pl": str(exc),
            "missing_data": [f"{trafo.ref_id}:lv_bus_ref"],
        }
    if braki or not odcinki:
        return odmowa_tt_it(
            context,
            kod=KOD_BRAK_POJEMNOSCI,
            reason_pl=(
                "Prąd pierwszego zwarcia doziemnego układu IT płynie przez pojemności doziemne "
                "sieci — odcinki bez susceptancji zerowej b_0 (pojemności doziemnej) na kilometr: "
                f"{', '.join(braki) if braki else 'brak odcinków sieci nN'}. Uzupełnij pojemność "
                "doziemną odcinków (pole b0_siemens_per_km z karty kabla); pojemność nie jest "
                "zgadywana."
            ),
            missing_data=[f"{ref}:b0_siemens_per_km" for ref in braki] or ["b0_siemens_per_km"],
        )
    f_hz = czestotliwosc_sieci_hz(enm)
    if f_hz is None:
        return odmowa_tt_it(
            context,
            kod=KOD_BRAK_POJEMNOSCI,
            reason_pl=(
                "Prąd pierwszego zwarcia doziemnego układu IT wymaga częstotliwości sieci "
                "(nagłówek modelu) — brak wartości."
            ),
            missing_data=["header.defaults.frequency_hz"],
        )
    return DaneSieciIt(odcinki=odcinki, czestotliwosc_hz=f_hz)


def dane_it_dla_punktu(
    enm: EnergyNetworkModel,
    trafo: Transformer,
    path: LvBusPath | None,
    bus_ref: str,
    context: dict[str, Any],
) -> DanePunktuTtIt | dict[str, Any]:
    """Komplet danych sieci IT dla punktu ALBO odmowa nazwana (pojemności → częstotliwość).

    R_A jest OPCJONALNE (bez niego solver nie liczy napięcia dotykowego pierwszego zwarcia,
    a werdykt nazywa brak); RCD nie jest wymagany w IT.
    """
    siec = dane_sieci_it(enm, trafo, context)
    if isinstance(siec, dict):
        return siec
    odcinki, f_hz = siec.odcinki, siec.czestotliwosc_hz
    uziom = uziom_instalacji_dla_punktu(enm, bus_ref)
    return DanePunktuTtIt(
        dane=DaneTtIt(
            r_a_ohm=uziom.r_a_ohm if uziom is not None else None,
            pojemnosci=odcinki,
            czestotliwosc_hz=f_hz,
        ),
        uziom=uziom,
        r_b_ohm=None,
        rcd=rcd_na_trasie(path) if path is not None else None,
        czestotliwosc_hz=f_hz,
        odcinki_pojemnosci=tuple(o.branch_ref for o in odcinki),
    )


def dane_tt_it_dla_punktu(
    enm: EnergyNetworkModel,
    trafo: Transformer,
    uklad: str,
    path: LvBusPath | None,
    bus_ref: str,
    context: dict[str, Any],
) -> DanePunktuTtIt | dict[str, Any]:
    """Dyspozycja po układzie — jedyne wejście dla widoków pętli, SWZ, dowodu i arkusza."""
    if uklad == "TT":
        return dane_tt_dla_punktu(enm, trafo, path, bus_ref, context)
    if uklad == "IT":
        return dane_it_dla_punktu(enm, trafo, path, bus_ref, context)
    raise AssertionError(f"Błąd programu: układ {uklad!r} nie jest układem TT/IT.")
