"""Treść blokad macierzy wykonalności nazywa elementy nazwą z modelu, nigdy identyfikatorem.

Decyzja B-01 partii integracji 9 (delegacja O-59), pozycja 6: blokada
`ELIG_FLNN_MISSING_TRANSFORMER_LOOP_DATA` pisała „Transformator 'tr-…' (stacja 'st-…')"
i listę kluczy maszynowych (`sn_mva`, `vector_group`, …). Inwentarz klasy objął każdy
`message_pl` z `ref_id` w `application/eligibility_service.py` (czternaście miejsc,
piętnaście identyfikatorów) — identyfikator wędruje teraz wyłącznie w `element_ref`
i akcji naprawczej, treść niesie „Rodzaj „nazwa”" albo „Rodzaj bez nazwy"
(`enm/slownik_komunikatow.opis_obiektu`).

Iloczyn cech: miejsce blokady (kod × rodzaj elementu) × element {z nazwą, bez nazwy}; dla listy braków transformatora: gałąź czytnika impedancji pętli {pole modelu
puste, brak grupy połączeń, grupa bez lokalnego uziemienia nN, Pk sprzeczne z uk} ×
układ {TN-S, TT, IT}. Strażnik AST pilnuje, że żaden `message_pl` modułów emitujących kody
ELIG nie czyta identyfikatora elementu.

Partia integracji 11 (scalenie karty WSPOLCZYNNIK-C-JEDEN-NOSNIK): blokada
`ELIG_SC_NN_VOLTAGE_TOLERANCE_MISSING` weszła z treścią „Transformator 'tr-…'" i listą
identyfikatorów szyn — strażnik AST jej nie widział, bo treść szła do `message_pl` przez
parametr funkcji pomocniczej (pozycyjnie), a lista szyn kończyła się na `_refs`. Blokada
nazywa teraz elementy nazwą z modelu (trzy powody braku tolerancji × {z nazwą, bez nazwy}),
a strażnik czyta KAŻDY f-napis modułu blokad (identyfikator: `ref_id`, `*_ref`, `*_refs`).
"""

from __future__ import annotations

import ast
import sys
from collections.abc import Callable
from pathlib import Path

import pytest
from application.analyses.fault_loop.service import (
    KOD_BRAK_LOKALNEGO_UZIEMIENIA_NN,
    KOD_PK_SPRZECZNE_Z_UK,
    OPISY_BRAKOW_PREDYKATU_PL,
    POLA_BRAKOW_TRANSFORMATORA,
    impedancja_transformatora_dla_ukladu,
    opis_braku_transformatora,
)
from application.eligibility_service import EligibilityService
from domain.eligibility_models import AnalysisType
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    GroundingConfig,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)
from enm.slownik_komunikatow import etykieta_parametru
from enm.validator import ENMValidator

#: Identyfikatory celowo nie do pomylenia ze słowem treści — każde ich wystąpienie
#: w komunikacie to wyciek identyfikatora, nie zbieżność liter.
REF_SZYNA_SN = "id-szyna-sn-7q"
REF_SZYNA_NN = "id-szyna-nn-7q"
REF_SZYNA_B1 = "id-szyna-b1-7q"
REF_SZYNA_B2 = "id-szyna-b2-7q"
REF_ZRODLO = "id-zrodlo-7q"
REF_TRAFO = "id-trafo-7q"
REF_KABEL = "id-kabel-7q"
REF_APARAT = "id-aparat-7q"
REF_STACJA = "id-stacja-7q"
REF_ZRODLO_NN = "id-zrodlo-nn-7q"
REF_SZYNA_NN_OSOBNA = "id-szyna-nn-osobna-7q"
WSZYSTKIE_REFY = (
    REF_SZYNA_SN,
    REF_SZYNA_NN,
    REF_SZYNA_B1,
    REF_SZYNA_B2,
    REF_ZRODLO,
    REF_TRAFO,
    REF_KABEL,
    REF_APARAT,
    REF_STACJA,
    REF_ZRODLO_NN,
    REF_SZYNA_NN_OSOBNA,
)


def _enm() -> EnergyNetworkModel:
    """Stacja SN/nN z kompletem danych pętli nN (ten sam kształt co `_ready_nn_enm`
    w `test_eligibility_service_nn.py`, z identyfikatorami nie do pomylenia z treścią)."""
    return EnergyNetworkModel(
        header=ENMHeader(name="nazwy w blokadach", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id=REF_SZYNA_SN, name="Szyna SN GPZ", voltage_kv=15.0),
            Bus(ref_id=REF_SZYNA_NN, name="Rozdzielnia nN", voltage_kv=0.4),
            Bus(ref_id=REF_SZYNA_B1, name="Złącze kablowe 1", voltage_kv=0.4),
            Bus(ref_id=REF_SZYNA_B2, name="Odbiorca 2", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id=REF_ZRODLO,
                name="Sieć zasilająca GPZ Północ",
                bus_ref=REF_SZYNA_SN,
                model="thevenin",
                sk3_mva=200.0,
                r_ohm=0.1,
                x_ohm=0.5,
                catalog_ref="SRC_CAT",
            )
        ],
        transformers=[
            Transformer(
                ref_id=REF_TRAFO,
                name="TR1 630 kVA",
                hv_bus_ref=REF_SZYNA_SN,
                lv_bus_ref=REF_SZYNA_NN,
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
                lv_earthing_system="TN-C-S",
                lv_voltage_tolerance="PLUS_10",
                catalog_ref="TR_CAT",
            )
        ],
        branches=[
            Cable(
                ref_id=REF_KABEL,
                name="YAKXS 4x120 obwód 1",
                from_bus_ref=REF_SZYNA_NN,
                to_bus_ref=REF_SZYNA_B1,
                length_km=0.05,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                catalog_ref="KABEL_NN_CAT",
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
            ),
            SwitchBranch(
                ref_id=REF_APARAT,
                name="Wyłącznik nadprądowy C32",
                type="breaker",
                from_bus_ref=REF_SZYNA_B1,
                to_bus_ref=REF_SZYNA_B2,
                catalog_ref="MCB_C32_CAT",
                catalog_namespace="APARAT_NN_MCB",
                materialized_params={"in_a": 32.0, "curve_class": "C"},
            ),
        ],
        substations=[
            Substation(
                ref_id=REF_STACJA,
                name="Stacja Lipowa",
                station_type="mv_lv",
                bus_refs=[REF_SZYNA_SN, REF_SZYNA_NN],
                transformer_refs=[REF_TRAFO],
            )
        ],
    )


def _zmien(enm: EnergyNetworkModel, kolekcja: str, ref: str, **pola: object) -> EnergyNetworkModel:
    elementy = [e.model_copy(update=pola) if e.ref_id == ref else e for e in getattr(enm, kolekcja)]
    return enm.model_copy(update={kolekcja: elementy})


def _ze_zrodlem_nn(enm: EnergyNetworkModel, tolerancja: str | None) -> EnergyNetworkModel:
    """Druga sieć zasilająca przyłączona wprost do szyny nN (nośnik tolerancji sieci nN)."""
    zrodlo = Source(
        ref_id=REF_ZRODLO_NN,
        name="Przyłącze nN z sieci sąsiedniej",
        bus_ref=REF_SZYNA_NN,
        model="thevenin",
        sk3_mva=10.0,
        r_ohm=0.001,
        x_ohm=0.005,
        catalog_ref="SRC_CAT",
        lv_voltage_tolerance=tolerancja,
    )
    return enm.model_copy(update={"sources": [*enm.sources, zrodlo]})


def _blokady(enm: EnergyNetworkModel, rodzaj_analizy: AnalysisType):
    walidator = ENMValidator()
    gotowosc = walidator.readiness(walidator.validate(enm))
    macierz = EligibilityService().compute_matrix(enm=enm, readiness=gotowosc, case_id="c-nazwy")
    return next(r for r in macierz.matrix if r.analysis_type == rodzaj_analizy).blockers


#: Miejsce blokady: (kod, rodzaj analizy, uszkodzenie modelu, element w treści
#: (kolekcja, ref, słowo rodzaju), drugi element w treści albo None, element_ref blokady).
Uszkodzenie = Callable[[EnergyNetworkModel], EnergyNetworkModel]
MIEJSCA: dict[str, tuple[str, AnalysisType, Uszkodzenie, tuple[str, str, str], object, str]] = {
    "szyna_bez_napiecia": (
        "ELIG_LF_BUS_NO_VOLTAGE",
        AnalysisType.LOAD_FLOW,
        lambda m: _zmien(m, "buses", REF_SZYNA_B2, voltage_kv=0.0),
        ("buses", REF_SZYNA_B2, "Szyna"),
        None,
        REF_SZYNA_B2,
    ),
    "kabel_bez_katalogu_sc3": (
        "ELIG_SC3_MISSING_CATALOG_REF",
        AnalysisType.SC_3F,
        lambda m: _zmien(m, "branches", REF_KABEL, catalog_ref=None),
        ("branches", REF_KABEL, "Kabel"),
        None,
        REF_KABEL,
    ),
    "transformator_bez_katalogu": (
        "ELIG_SC3_MISSING_CATALOG_REF",
        AnalysisType.SC_3F,
        lambda m: _zmien(m, "transformers", REF_TRAFO, catalog_ref=None),
        ("transformers", REF_TRAFO, "Transformator"),
        None,
        REF_TRAFO,
    ),
    "zrodlo_bez_katalogu": (
        "ELIG_SC3_MISSING_CATALOG_REF",
        AnalysisType.SC_3F,
        lambda m: _zmien(m, "sources", REF_ZRODLO, catalog_ref=None),
        ("sources", REF_ZRODLO, "Źródło"),
        None,
        REF_ZRODLO,
    ),
    "kabel_zerowa_impedancja": (
        "ELIG_SC3_MISSING_IMPEDANCE",
        AnalysisType.SC_3F,
        lambda m: _zmien(m, "branches", REF_KABEL, r_ohm_per_km=0.0, x_ohm_per_km=0.0),
        ("branches", REF_KABEL, "Kabel"),
        None,
        REF_KABEL,
    ),
    "transformator_bez_uk": (
        "ELIG_SC3_MISSING_IMPEDANCE",
        AnalysisType.SC_3F,
        lambda m: _zmien(m, "transformers", REF_TRAFO, uk_percent=0.0),
        ("transformers", REF_TRAFO, "Transformator"),
        None,
        REF_TRAFO,
    ),
    "zrodlo_bez_parametrow_zwarciowych": (
        "ELIG_SC3_SOURCE_NO_SC_PARAMS",
        AnalysisType.SC_3F,
        lambda m: _zmien(m, "sources", REF_ZRODLO, sk3_mva=None, r_ohm=None, x_ohm=None),
        ("sources", REF_ZRODLO, "Źródło"),
        None,
        REF_ZRODLO,
    ),
    "kabel_bez_z0": (
        "ELIG_SC1_MISSING_Z0",
        AnalysisType.SC_1F,
        lambda m: m,
        ("branches", REF_KABEL, "Kabel"),
        None,
        REF_KABEL,
    ),
    "zrodlo_bez_z0": (
        "ELIG_SC1_MISSING_Z0",
        AnalysisType.SC_1F,
        lambda m: m,
        ("sources", REF_ZRODLO, "Źródło"),
        None,
        REF_ZRODLO,
    ),
    "transformator_bez_ukladu_nn": (
        "ELIG_FLNN_MISSING_EARTHING_SYSTEM",
        AnalysisType.FAULT_LOOP_NN,
        lambda m: _zmien(m, "transformers", REF_TRAFO, lv_earthing_system=None),
        ("transformers", REF_TRAFO, "Transformator"),
        ("substations", REF_STACJA, "stacja"),
        REF_TRAFO,
    ),
    "stacja_bez_transformatora": (
        "ELIG_FLNN_MISSING_TRANSFORMER",
        AnalysisType.FAULT_LOOP_NN,
        lambda m: _zmien(m, "substations", REF_STACJA, transformer_refs=[]),
        ("substations", REF_STACJA, "Stacja"),
        None,
        REF_STACJA,
    ),
    "transformator_bez_danych_petli": (
        "ELIG_FLNN_MISSING_TRANSFORMER_LOOP_DATA",
        AnalysisType.FAULT_LOOP_NN,
        lambda m: _zmien(m, "transformers", REF_TRAFO, vector_group=None),
        ("transformers", REF_TRAFO, "Transformator"),
        ("substations", REF_STACJA, "stacja"),
        REF_TRAFO,
    ),
    "odcinek_nn_bez_katalogu": (
        "ELIG_FLNN_MISSING_NN_CATALOG_REF",
        AnalysisType.FAULT_LOOP_NN,
        lambda m: _zmien(m, "branches", REF_KABEL, catalog_ref=None),
        ("branches", REF_KABEL, "Odcinek kablowy nN"),
        None,
        REF_KABEL,
    ),
    "transformator_bez_tolerancji_nn": (
        "ELIG_SC_NN_VOLTAGE_TOLERANCE_MISSING",
        AnalysisType.SC_3F,
        lambda m: _zmien(m, "transformers", REF_TRAFO, lv_voltage_tolerance=None),
        ("transformers", REF_TRAFO, "Transformator"),
        None,
        REF_TRAFO,
    ),
    "zrodlo_nn_bez_tolerancji_nn": (
        "ELIG_SC_NN_VOLTAGE_TOLERANCE_MISSING",
        AnalysisType.SC_3F,
        lambda m: _ze_zrodlem_nn(m, None),
        ("sources", REF_ZRODLO_NN, "Źródło sieciowe"),
        None,
        REF_ZRODLO_NN,
    ),
    "tolerancje_sprzeczne_transformator": (
        "ELIG_SC_NN_VOLTAGE_TOLERANCE_MISSING",
        AnalysisType.SC_3F,
        lambda m: _ze_zrodlem_nn(m, "PLUS_6"),
        ("transformers", REF_TRAFO, "Transformator"),
        ("sources", REF_ZRODLO_NN, "Źródło sieciowe"),
        REF_TRAFO,
    ),
    "tolerancje_sprzeczne_zrodlo": (
        "ELIG_SC_NN_VOLTAGE_TOLERANCE_MISSING",
        AnalysisType.SC_3F,
        lambda m: _ze_zrodlem_nn(m, "PLUS_6"),
        ("sources", REF_ZRODLO_NN, "Źródło sieciowe"),
        ("transformers", REF_TRAFO, "Transformator"),
        REF_ZRODLO_NN,
    ),
    "odcinek_nn_bez_zyly_powrotnej": (
        "ELIG_FLNN_MISSING_RETURN_CONDUCTOR",
        AnalysisType.FAULT_LOOP_NN,
        lambda m: _zmien(m, "branches", REF_KABEL, return_conductor_r_ohm_per_km_20c=None),
        ("branches", REF_KABEL, "Odcinek kablowy nN"),
        None,
        REF_KABEL,
    ),
}


def _nazwa(enm: EnergyNetworkModel, kolekcja: str, ref: str) -> str:
    return next(e.name for e in getattr(enm, kolekcja) if e.ref_id == ref)


def _bez_nazw(enm: EnergyNetworkModel, *elementy: tuple[str, str, str]) -> EnergyNetworkModel:
    for kolekcja, ref, _ in elementy:
        enm = _zmien(enm, kolekcja, ref, name="")
    return enm


def _oczekiwany_opis(enm: EnergyNetworkModel, element: tuple[str, str, str]) -> str:
    kolekcja, ref, slowo = element
    nazwa = _nazwa(enm, kolekcja, ref)
    return f"{slowo} „{nazwa}”" if nazwa else f"{slowo} bez nazwy"


@pytest.mark.parametrize("nazwane", [True, False], ids=["z_nazwa", "bez_nazwy"])
@pytest.mark.parametrize("miejsce", sorted(MIEJSCA))
def test_blokada_nazywa_element_nazwa_z_modelu_nigdy_identyfikatorem(
    miejsce: str, nazwane: bool
) -> None:
    kod, rodzaj_analizy, uszkodz, element, drugi, element_ref = MIEJSCA[miejsce]
    enm = uszkodz(_enm())
    elementy_tresci = [element] + ([drugi] if drugi is not None else [])
    if not nazwane:
        enm = _bez_nazw(enm, *elementy_tresci)
    blokady = [
        b for b in _blokady(enm, rodzaj_analizy) if b.code == kod and b.element_ref == element_ref
    ]
    assert len(blokady) == 1, [(b.code, b.element_ref) for b in _blokady(enm, rodzaj_analizy)]
    tresc = blokady[0].message_pl
    for e in elementy_tresci:
        assert _oczekiwany_opis(enm, e) in tresc, tresc  # type: ignore[arg-type]
    # Identyfikator ani klucz kontraktu nie trafia do treści (zostaje w element_ref i akcji).
    assert not [ref for ref in WSZYSTKIE_REFY if ref in tresc], tresc
    assert "_" not in tresc and "<=" not in tresc, tresc
    assert blokady[0].fix_action is not None
    assert blokady[0].fix_action.element_ref == element_ref


@pytest.mark.parametrize("nazwane", [True, False], ids=["z_nazwa", "bez_nazwy"])
def test_blokada_wyspy_nn_bez_zasilajacego_nazywa_szyne(nazwane: bool) -> None:
    """Trzeci powód braku tolerancji (wyspa nN bez transformatora i źródła): treść nazywa
    szynę wyspy nazwą z modelu; akcji naprawczej brak (nie ma elementu, na którym zapisać
    deklarację), identyfikator tylko w `element_ref`."""
    szyna = Bus(
        ref_id=REF_SZYNA_NN_OSOBNA,
        name="Rozdzielnia nN wydzielona" if nazwane else "",
        voltage_kv=0.4,
    )
    enm = _enm().model_copy(update={"buses": [*_enm().buses, szyna]})
    blokady = [
        b
        for b in _blokady(enm, AnalysisType.SC_3F)
        if b.code == "ELIG_SC_NN_VOLTAGE_TOLERANCE_MISSING"
    ]
    assert len(blokady) == 1, [(b.code, b.element_ref) for b in blokady]
    tresc = blokady[0].message_pl
    assert blokady[0].element_ref == REF_SZYNA_NN_OSOBNA
    assert blokady[0].fix_action is None
    oczekiwany = "szyna „Rozdzielnia nN wydzielona”" if nazwane else "szyna bez nazwy"
    assert oczekiwany in tresc, tresc
    assert not [ref for ref in WSZYSTKIE_REFY if ref in tresc], tresc
    assert "_" not in tresc, tresc


@pytest.mark.parametrize("tolerancja", ["PLUS_6", "PLUS_10"])
def test_tolerancja_zadeklarowana_zgodnie_bez_blokady(tolerancja: str) -> None:
    """Predykat parami: zgodne deklaracje transformatora i źródła nN — brak blokady."""
    enm = _ze_zrodlem_nn(
        _zmien(_enm(), "transformers", REF_TRAFO, lv_voltage_tolerance=tolerancja), tolerancja
    )
    assert "ELIG_SC_NN_VOLTAGE_TOLERANCE_MISSING" not in [
        b.code for b in _blokady(enm, AnalysisType.SC_3F)
    ]


# ---------------------------------------------------------------------------
# Lista braków transformatora: opisy dla projektanta, jedno źródło kodów
# ---------------------------------------------------------------------------

#: Uszkodzenie transformatora → kody, jakie czytnik impedancji pętli MA zgłosić.
USZKODZENIA_TRAFO: dict[str, tuple[dict[str, object], tuple[str, ...], tuple[str, ...]]] = {
    # nazwa: (pola, układy, w których czytnik zgłasza brak, oczekiwane kody)
    "bez_mocy_i_uk": (
        {"sn_mva": 0.0, "uk_percent": 0.0},
        ("TN-S", "TT", "IT"),
        ("sn_mva", "uk_percent"),
    ),
    "bez_napiecia_dn": ({"ulv_kv": 0.0}, ("TN-S", "TT", "IT"), ("ulv_kv",)),
    "bez_grupy_polaczen": ({"vector_group": None}, ("TN-S", "TT"), ("vector_group",)),
    "grupa_bez_uziemienia_nn": (
        {"vector_group": "YNd11"},
        ("TN-S", "TT"),
        (KOD_BRAK_LOKALNEGO_UZIEMIENIA_NN,),
    ),
    "pk_sprzeczne_z_uk": ({"pk_kw": 100.0}, ("IT",), (KOD_PK_SPRZECZNE_Z_UK,)),
}


def _trafo(**pola: object) -> Transformer:
    return _enm().transformers[0].model_copy(update=pola)


@pytest.mark.parametrize("uklad", ["TN-S", "TT", "IT"])
@pytest.mark.parametrize("uszkodzenie", sorted(USZKODZENIA_TRAFO))
def test_czytnik_impedancji_petli_zglasza_kody_z_jednego_zrodla(
    uszkodzenie: str, uklad: str
) -> None:
    pola, uklady, kody = USZKODZENIA_TRAFO[uszkodzenie]
    _, braki = impedancja_transformatora_dla_ukladu(_trafo(**pola), uklad)
    if uklad not in uklady:
        assert KOD_PK_SPRZECZNE_Z_UK not in braki and not set(kody) & set(braki)
        return
    assert tuple(braki) == kody
    for kod in braki:
        opis = opis_braku_transformatora(kod)
        assert kod not in opis and "_" not in opis, opis
        assert opis != etykieta_parametru("__klucz_spoza_slownika__"), kod


def test_kody_brakow_transformatora_parami_z_czytnikiem() -> None:
    """Predykat parami: zbiór kodów, które czytnik potrafi zgłosić (iloczyn uszkodzeń ×
    układów) = zbiór kodów z opisem (pola modelu ∪ predykaty) — bez kodu bez opisu i bez
    opisu martwego."""
    zgloszone: set[str] = set()
    for pola, _, _ in USZKODZENIA_TRAFO.values():
        for uklad in ("TN-S", "TT", "IT"):
            zgloszone |= set(impedancja_transformatora_dla_ukladu(_trafo(**pola), uklad)[1])
    assert zgloszone == set(POLA_BRAKOW_TRANSFORMATORA) | set(OPISY_BRAKOW_PREDYKATU_PL)
    assert not set(POLA_BRAKOW_TRANSFORMATORA) & set(OPISY_BRAKOW_PREDYKATU_PL)


@pytest.mark.parametrize(
    "uszkodzenie", ["bez_mocy_i_uk", "bez_grupy_polaczen", "grupa_bez_uziemienia_nn"]
)
@pytest.mark.parametrize("uklad", ["TN-C-S", "TT"])
def test_blokada_danych_petli_wymienia_braki_po_polsku(uszkodzenie: str, uklad: str) -> None:
    """Ścieżka użytkownika (macierz wykonalności): treść niesie opis KAŻDEGO braku."""
    pola, _, kody = USZKODZENIA_TRAFO[uszkodzenie]
    enm = _zmien(_enm(), "transformers", REF_TRAFO, lv_earthing_system=uklad, **pola)
    if uklad == "TT" and pola.get("vector_group") != "YNd11":
        # Uziom R_B tylko na uzwojeniu z wyprowadzonym punktem neutralnym (yn) — na trójkącie
        # konfiguracja uziemienia jest sprzecznością (przypadek osobnego testu niżej).
        enm = _zmien(
            enm,
            "transformers",
            REF_TRAFO,
            lv_neutral=GroundingConfig(type="directly_grounded", r_ohm=2.0),
        )
    blokada = next(
        b
        for b in _blokady(enm, AnalysisType.FAULT_LOOP_NN)
        if b.code == "ELIG_FLNN_MISSING_TRANSFORMER_LOOP_DATA"
    )
    for kod in kody:
        assert opis_braku_transformatora(kod) in blokada.message_pl
    assert "_" not in blokada.message_pl, blokada.message_pl


# ---------------------------------------------------------------------------
# Strażnik klasy: żaden message_pl modułów emitujących kody ELIG nie czyta identyfikatora
# ---------------------------------------------------------------------------

_SRC = Path(__file__).resolve().parents[2] / "src"
MODULY_ELIG = (
    "application/eligibility_service.py",
    "application/fault_scenario_service.py",
)


#: Moduł, w którym KAŻDY f-napis jest treścią blokady albo jej częścią (treść bywa składana
#: w funkcji pomocniczej i przekazywana pozycyjnie — sam `message_pl=` tego nie widzi).
MODUL_TRESCI_BLOKAD = "application/eligibility_service.py"


def _czyta_identyfikator(nazwa: object) -> bool:
    return isinstance(nazwa, str) and (
        nazwa == "ref_id" or nazwa.endswith("_ref") or nazwa.endswith("_refs")
    )


def _odczyty_identyfikatora(modul: str) -> list[str]:
    drzewo = ast.parse((_SRC / modul).read_text(encoding="utf-8"))
    wynik: list[str] = []
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.keyword) and wezel.arg == "message_pl":
            korzen: ast.AST = wezel.value
        elif modul == MODUL_TRESCI_BLOKAD and isinstance(wezel, ast.FormattedValue):
            korzen = wezel.value
        else:
            continue
        for w in ast.walk(korzen):
            nazwa = w.attr if isinstance(w, ast.Attribute) else getattr(w, "id", None)
            if _czyta_identyfikator(nazwa):
                wynik.append(f"{modul}:{w.lineno}: {nazwa}")
    return sorted(set(wynik))


def test_moduly_kodow_elig_istnieja_i_emituja_kody() -> None:
    for modul in MODULY_ELIG:
        assert '"ELIG_' in (_SRC / modul).read_text(encoding="utf-8"), modul


@pytest.mark.parametrize("modul", MODULY_ELIG)
def test_tresc_blokady_nie_czyta_identyfikatora_elementu(modul: str) -> None:
    assert _odczyty_identyfikatora(modul) == []


def test_straznik_widzi_tresc_skladana_w_funkcji_pomocniczej(tmp_path, monkeypatch) -> None:
    """Samotest strażnika: wzorzec, który przeszedł niezauważony (treść z identyfikatorem
    w f-napisie przekazanym pozycyjnie do pomocnika, lista szyn `*_refs`), jest czerwony."""
    katalog = tmp_path / "application"
    katalog.mkdir()
    (katalog / "eligibility_service.py").write_text(
        "def zgloszenie(ref, tresc):\n"
        "    return dict(message_pl=tresc, element_ref=ref)\n"
        "def blokady(z, wyspa):\n"
        "    zgloszenie(z.ref_id, f\"Transformator '{z.ref_id}'\")\n"
        "    zgloszenie(z.ref_id, f\"szyny: {', '.join(wyspa.bus_refs)}\")\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(sys.modules[__name__], "_SRC", tmp_path)
    assert _odczyty_identyfikatora(MODUL_TRESCI_BLOKAD) == [
        f"{MODUL_TRESCI_BLOKAD}:4: ref_id",
        f"{MODUL_TRESCI_BLOKAD}:5: bus_refs",
    ]


#: Konfiguracja uziemienia sprzeczna z grupą połączeń albo niekompletna: (strona, grupa,
#: konfiguracja). Iloczyn strona {górne, dolne} × rodzaj sprzeczności {uziemienie bez
#: wyprowadzonego punktu, rezystor bez R_N}.
SPRZECZNE_UZIEMIENIE = {
    "dolne_trojkat_uziemiony": (
        "lv_neutral",
        "YNd11",
        GroundingConfig(type="directly_grounded", r_ohm=2.0),
    ),
    "gorne_trojkat_uziemiony": ("hv_neutral", "Dyn11", GroundingConfig(type="directly_grounded")),
    "dolne_rezystor_bez_r": ("lv_neutral", "Dyn11", GroundingConfig(type="resistor_grounded")),
    "gorne_rezystor_bez_r": ("hv_neutral", "YNyn0", GroundingConfig(type="resistor_grounded")),
}


@pytest.mark.parametrize("nazwane", [True, False], ids=["z_nazwa", "bez_nazwy"])
@pytest.mark.parametrize("uklad", ["TN-C-S", "TT"])
@pytest.mark.parametrize("sprzecznosc", sorted(SPRZECZNE_UZIEMIENIE))
def test_sprzeczne_uziemienie_transformatora_to_blokada_stacji_nie_awaria_macierzy(
    sprzecznosc: str, uklad: str, nazwane: bool
) -> None:
    """Odmowa czytnika impedancji pętli (uziemienie na uzwojeniu bez punktu neutralnego albo
    bez impedancji uziemiającej) przerywała CAŁĄ macierz wykonalności wyjątkiem z
    identyfikatorem w treści. Teraz: blokada danych pętli tej stacji, nazwy z modelu,
    pozostałe analizy macierzy dostają status."""
    pole, grupa, konfiguracja = SPRZECZNE_UZIEMIENIE[sprzecznosc]
    enm = _zmien(
        _enm(),
        "transformers",
        REF_TRAFO,
        vector_group=grupa,
        lv_earthing_system=uklad,
        **{pole: konfiguracja},
    )
    elementy = (("transformers", REF_TRAFO, "Transformator"), ("substations", REF_STACJA, "stacja"))
    if not nazwane:
        enm = _bez_nazw(enm, *elementy)
    blokada = next(
        b
        for b in _blokady(enm, AnalysisType.FAULT_LOOP_NN)
        if b.code == "ELIG_FLNN_MISSING_TRANSFORMER_LOOP_DATA"
    )
    assert blokada.element_ref == REF_TRAFO
    assert _oczekiwany_opis(enm, elementy[0]) in blokada.message_pl
    assert _oczekiwany_opis(enm, elementy[1]) in blokada.message_pl
    strona = "górne" if pole == "hv_neutral" else "dolne"
    assert f"uzwojenie {strona}" in blokada.message_pl, blokada.message_pl
    assert not [ref for ref in WSZYSTKIE_REFY if ref in blokada.message_pl], blokada.message_pl
    # Bez kluczy kontraktu i kodów walidatora (symbol R_N z indeksem jest dozwolony).
    klucze = ("_grounded", "_neutral", "E-W5", "HV", "LV")
    assert not [k for k in klucze if k in blokada.message_pl], blokada.message_pl
    # Macierz liczy się dla wszystkich analiz (SWZ dziedziczy ten sam warunek).
    assert "ELIG_FLNN_MISSING_TRANSFORMER_LOOP_DATA" in [
        b.code for b in _blokady(enm, AnalysisType.SWZ_NN)
    ]
