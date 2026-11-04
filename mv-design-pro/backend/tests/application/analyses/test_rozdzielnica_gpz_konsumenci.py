"""Dane rozdzielnicy sekcji GPZ w analizach-konsumentach — karta GPZ-DANE-ANALIZ.

DLACZEGO. `GPZSection.rozdzielnica` (`tests/enm/test_rozdzielnica_gpz.py` — nośnik, pisarz,
odcisk) ma sens tylko wtedy, gdy analizy ją CZYTAJĄ. Dwóch konsumentów:

- wytrzymałość aparatury stacji (`widok_wytrzymalosci_z_biegu`) — wiersz szyn zbiorczych
  KAŻDEJ sekcji GPZ: kryterium dynamiczne i cieplne (to samo jądro co aparat pola, znamiona
  szyn z jednego rozstrzygnięcia rejestru wartości roboczych), napięciowe (U_s ≤ U_r), prądu
  ciągłego (Σ I_r,T ≤ I_r) i łukowe IAC (I″k ≤ I_A, T_k ≤ t_A);
- łuk elektryczny (`build_arc_flash_view`) — geometria łuku węzła szyn sekcji z rozdzielnicy
  (dokument > projektant > parametr żądania > wartość robocza IEEE 1584-2018).

ILOCZYN CECH: {blok brak, bez dokumentu, z dokumentem} × {konsument: wytrzymałość szyn, łuk} ×
{scenariusz biegu MAX, MIN (łuk; wytrzymałość tylko MAX — odmowa MIN przypięta w
`tests/api/test_wytrzymalosc_aparatury_api.py`)} × {strona sekcji SN, 110 kV} × {parametr
żądania podany, brak} × {węzeł sekcji, węzeł poza sekcją}. Deklaracja konsumentów pól
(`KONSUMENCI_POL_ROZDZIELNICY`) jest przypięta testem: zmiana pola zmienia wynik każdego
zadeklarowanego konsumenta, a żadnego innego.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from application.analyses.arc_flash_view import (
    ZRODLO_LUKU_DOKUMENT,
    ZRODLO_LUKU_PARAMETR_BIEGU,
    ZRODLO_LUKU_PROJEKTANT,
    ZRODLO_LUKU_WARTOSC_ROBOCZA,
    build_arc_flash_view,
)
from application.analyses.szyny_sekcji_gpz import READINESS_CZAS_SZYN_NIEUSTALONY
from application.analyses.wytrzymalosc_aparatury_pol import (
    READINESS_SZYNY_BEZ_KLASYFIKACJI_IAC,
    READINESS_SZYNY_BEZ_NAPIECIA_ZNAMIONOWEGO,
    READINESS_SZYNY_BEZ_PRADU_ZNAMIONOWEGO,
    PradyPola,
    prady_szyn_z_biegu,
    widok_wytrzymalosci_z_biegu,
    zbuduj_widok_wytrzymalosci_aparatury,
)
from enm.canonical_analysis import build_short_circuit_results, reset_canonical_runs
from enm.mapping import ref_to_graph_id
from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    GPZSection,
    RozdzielnicaSekcjiGpz,
    Substation,
    Transformer,
)
from enm.rozdzielnica_gpz import (
    KLUCZE_ROZDZIELNICY,
    KONSUMENCI_POL_ROZDZIELNICY,
    KONSUMENT_LUK_ELEKTRYCZNY,
    KONSUMENT_WYTRZYMALOSC_SZYN,
)
from enm.store import reset_enm_store
from network_model.catalog.wartosci_robocze import (
    PARAMETRY_GEOMETRII_LUKU,
    propozycja_geometrii_luku,
)

from tests.enm.test_canonical_sc_c_per_pasmo import N0, N1, _bieg_zwarciowy, _build_mv_lv_enm

#: Blok pełny bez dokumentu (wartości projektanta) — spójny (I_p ≥ √2·I_k).
BLOK_PROJEKTANTA: dict[str, Any] = {
    "u_r_kv": 17.5,
    "i_r_a": 1250.0,
    "i_k_ka": 25.0,
    "t_k_s": 1.0,
    "i_p_ka": 63.0,
    "iac_dostepnosc": "A",
    "iac_strony": "FLR",
    "iac_i_a_ka": 25.0,
    "iac_t_a_s": 1.0,
    "konfiguracja_elektrod": "HCB",
    "odstep_elektrod_mm": 120.0,
    "odleglosc_robocza_mm": 800.0,
    "szerokosc_obudowy_mm": 1000.0,
    "wysokosc_obudowy_mm": 900.0,
    "glebokosc_obudowy_mm": 800.0,
}
BLOK_Z_DOKUMENTEM: dict[str, Any] = {**BLOK_PROJEKTANTA, "dokument_zrodlowy": "DTR RX-17,5"}

#: Druga wartość KAŻDEGO pola (test deklaracji konsumentów) — blok pozostaje spójny.
ZMIANA_POLA: dict[str, Any] = {
    "u_r_kv": 24.0,
    "i_r_a": 630.0,
    "i_k_ka": 20.0,
    "t_k_s": 3.0,
    "i_p_ka": 50.0,
    "iac_dostepnosc": "B",
    "iac_strony": "FL",
    "iac_i_a_ka": 16.0,
    "iac_t_a_s": 0.5,
    "konfiguracja_elektrod": "VCB",
    "odstep_elektrod_mm": 104.0,
    "odleglosc_robocza_mm": 600.0,
    "szerokosc_obudowy_mm": 1143.0,
    "wysokosc_obudowy_mm": 762.0,
    "glebokosc_obudowy_mm": 600.0,
    "dokument_zrodlowy": None,
}

RODZAJE_SZYN = (
    "dynamiczna",
    "cieplna",
    "wylaczanie",
    "napieciowa",
    "ciagla",
    "iac_prad",
    "iac_czas",
)


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


# ---------------------------------------------------------------------------
# Fikstury
# ---------------------------------------------------------------------------


def _siec_z_gpz(blok: dict[str, Any] | None) -> EnergyNetworkModel:
    """Sieć referencyjna SN+nN (bieg zwarciowy produkcyjnym torem) z GPZ na szynie źródła N0:
    sekcja S1 z blokiem ``blok`` i pole zasilające sekcji."""
    enm = _build_mv_lv_enm("Siec z GPZ")
    gpz = Substation(
        ref_id="GPZ",
        name="GPZ Sady",
        station_type="gpz",
        bus_refs=[N0],
        gpz_sections=[
            GPZSection(
                section_id="S1",
                order=1,
                name="Sekcja 1",
                bus_ref=N0,
                rozdzielnica=RozdzielnicaSekcjiGpz(**blok) if blok is not None else None,
            )
        ],
    )
    pole = Bay(
        ref_id="GPZ/pole/zas",
        name="Pole zasilające",
        bay_role="IN",
        substation_ref="GPZ",
        bus_ref=N0,
    )
    return enm.model_copy(
        update={"substations": [*enm.substations, gpz], "bays": [*enm.bays, pole]}
    )


def _gpz_jednostkowy(
    blok: dict[str, Any] | None, *, strona: str = "SN", z_transformatorem: bool = True
) -> EnergyNetworkModel:
    """GPZ 110/15 kV z jedną sekcją po stronie ``strona`` i transformatorem 25 MVA."""
    sekcja = GPZSection(
        section_id="S1",
        order=1,
        bus_ref="sn1" if strona == "SN" else "wn",
        rozdzielnica=RozdzielnicaSekcjiGpz(**blok) if blok is not None else None,
    )
    return EnergyNetworkModel(
        header=ENMHeader(name="gpz", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="wn", name="Szyna 110 kV", voltage_kv=110.0),
            Bus(ref_id="sn1", name="Szyna SN", voltage_kv=15.0),
        ],
        transformers=(
            [
                Transformer(
                    ref_id="T1",
                    name="T1",
                    hv_bus_ref="wn",
                    lv_bus_ref="sn1",
                    sn_mva=25.0,
                    uhv_kv=110.0,
                    ulv_kv=15.75,
                    uk_percent=12.0,
                    pk_kw=120.0,
                )
            ]
            if z_transformatorem
            else []
        ),
        substations=[
            Substation(
                ref_id="GPZ",
                name="GPZ Sady",
                station_type="gpz",
                bus_refs=["wn", "sn1"],
                **({"gpz_sections": [sekcja]} if strona == "SN" else {"gpz_hv_sections": [sekcja]}),
            )
        ],
        bays=[
            Bay(
                ref_id="pole/tr",
                name="TR1",
                bay_role="TR",
                substation_ref="GPZ",
                bus_ref="sn1" if strona == "SN" else "wn",
            )
        ],
    )


def _widok_jednostkowy(
    blok: dict[str, Any] | None,
    *,
    strona: str = "SN",
    t_clearing_s: float | None = 0.6,
    ik_ka: float = 12.0,
) -> dict[str, Any]:
    czasy = (
        {"pole/tr": {"t_clearing_s": t_clearing_s, "powod_pl": "nastawy pola", "zrodlo": "x"}}
        if t_clearing_s is not None
        else {}
    )
    return zbuduj_widok_wytrzymalosci_aparatury(
        enm=_gpz_jednostkowy(blok, strona=strona),
        station_ref="GPZ",
        prady_pol={},
        run_id="bieg",
        czasy_pol=czasy,
        prady_szyn={
            "S1": PradyPola(
                punkt_ref="sn1",
                punkt_nazwa="Szyna SN",
                ik_ka=ik_ka,
                ip_ka=2.5 * ik_ka,
                ith_ka=ik_ka * 1.02,
            )
        },
    )


def _oceny_szyn(widok: dict[str, Any]) -> dict[str, dict[str, Any]]:
    (wiersz,) = widok["szyny_sekcji"]
    return {o["kryterium_id"].rsplit(".", 1)[1]: o for o in wiersz["oceny"]}


def _dane(ocena: dict[str, Any]) -> list[dict[str, Any]]:
    return list(ocena["dowod"]["status_danych"]["dane_przyjete"])


def _luk_wezla(widok: dict[str, Any], wezel: str) -> dict[str, Any]:
    return next(w for w in widok["results"] if w["bus_ref"] in (wezel, ref_to_graph_id(wezel)))


# ---------------------------------------------------------------------------
# Wytrzymałość szyn sekcji — realny bieg
# ---------------------------------------------------------------------------


def test_szyny_sekcji_z_realnego_biegu_biora_prad_wiersza_szyny_sekcji() -> None:
    enm = _siec_z_gpz(BLOK_Z_DOKUMENTEM)
    bieg = _bieg_zwarciowy("gpz-szyny-max", enm, {"scenario": "max"})
    wiersze = build_short_circuit_results(bieg)["rows"]
    widok = widok_wytrzymalosci_z_biegu(
        enm=enm, station_ref="GPZ", wiersze_biegu=wiersze, run_id=str(bieg.id)
    )
    (wiersz,) = widok["szyny_sekcji"]
    wezel = next(
        w
        for w in wiersze
        if w["fault_type"] == "3F" and w["element_id"] in (N0, ref_to_graph_id(N0))
    )
    assert wiersz["prady_pola"]["ik_ka"] == wezel["ikss_ka"]
    assert wiersz["prady_pola"]["ip_ka"] == wezel["ip_ka"]
    assert wiersz["sekcja"]["section_id"] == "S1"
    assert wiersz["sekcja"]["rozdzielnica"] == {
        k: BLOK_Z_DOKUMENTEM[k] for k in sorted(BLOK_Z_DOKUMENTEM)
    }
    oceny = _oceny_szyn(widok)
    assert set(oceny) == set(RODZAJE_SZYN)
    # Prąd szyn z wiersza biegu jest wynikiem rekordu łukowego (nie liczba z żądania).
    assert oceny["iac_prad"]["wynik"]["wartosc"]["wartosc"] == wezel["ikss_ka"]
    assert oceny["dynamiczna"]["status_maszynowy"] == "SPELNIA"
    # Pole zasilające sekcji bez nastaw — czas wyłączenia szyn nieustalony z nazwaną przyczyną.
    assert READINESS_CZAS_SZYN_NIEUSTALONY in wiersz["kody_gotowosci"]
    # Brak wyniku (czasu) = kryterium nieocenione, nie „spełnia” ani „brak podstawy limitu”.
    assert oceny["iac_czas"]["status_maszynowy"] == "NIE_OCENIONO"
    # Pola stacji liczą się jak przed kartą — wiersz szyn nie wchodzi do listy pól.
    assert all(p.get("sekcja") is None for p in widok["pola"])


def test_blok_rozdzielnicy_nie_zmienia_wierszy_pol_stacji() -> None:
    """Predykat parami: blok czyta WYŁĄCZNIE wiersz szyn — pola stacji identyczne z blokiem
    i bez niego (ten sam bieg, ten sam model poza blokiem)."""
    enm_bez, enm_z = _siec_z_gpz(None), _siec_z_gpz(BLOK_PROJEKTANTA)
    bieg = _bieg_zwarciowy("gpz-pola", enm_bez, {"scenario": "max"})
    wiersze = build_short_circuit_results(bieg)["rows"]
    bez = widok_wytrzymalosci_z_biegu(
        enm=enm_bez, station_ref="GPZ", wiersze_biegu=wiersze, run_id="r"
    )
    z_blokiem = widok_wytrzymalosci_z_biegu(
        enm=enm_z, station_ref="GPZ", wiersze_biegu=wiersze, run_id="r"
    )
    assert bez["pola"] == z_blokiem["pola"]
    assert bez["szyny_sekcji"] != z_blokiem["szyny_sekcji"]


def test_stacja_bez_sekcji_gpz_nie_dostaje_klucza_szyn() -> None:
    enm = _build_mv_lv_enm("bez GPZ")
    stacja = Substation(ref_id="ST", name="Stacja", station_type="mv_lv", bus_refs=[N1])
    enm = enm.model_copy(update={"substations": [stacja]})
    widok = zbuduj_widok_wytrzymalosci_aparatury(
        enm=enm, station_ref="ST", prady_pol={}, run_id="r"
    )
    assert "szyny_sekcji" not in widok


def test_prady_szyn_bez_wiersza_biegu_sa_nazwanym_brakiem() -> None:
    enm = _siec_z_gpz(BLOK_PROJEKTANTA)
    prady = prady_szyn_z_biegu(enm=enm, station_ref="GPZ", wiersze_biegu=[])
    assert prady["S1"].ik_ka is None
    assert "szyn sekcji" in str(prady["S1"].powod_pl)
    widok = widok_wytrzymalosci_z_biegu(enm=enm, station_ref="GPZ", wiersze_biegu=[], run_id="r")
    oceny = _oceny_szyn(widok)
    for rodzaj in ("dynamiczna", "cieplna", "iac_prad"):
        assert oceny[rodzaj]["status_maszynowy"] == "NIE_OCENIONO", rodzaj
        assert oceny[rodzaj]["wynik"] is None


# ---------------------------------------------------------------------------
# Wytrzymałość szyn — iloczyn {blok brak / projektant / dokument} × kryterium
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wariant", ["brak", "projektant", "dokument"])
def test_kryteria_szyn_dla_wariantu_danych_rozdzielnicy(wariant: str) -> None:
    blok = {"brak": None, "projektant": BLOK_PROJEKTANTA, "dokument": BLOK_Z_DOKUMENTEM}[wariant]
    widok = _widok_jednostkowy(blok)
    (wiersz,) = widok["szyny_sekcji"]
    oceny = _oceny_szyn(widok)
    # Szyny nie przerywają prądu — kryterium wyłączania nie dotyczy (z rodzaju, nie z braku).
    assert oceny["wylaczanie"]["status_maszynowy"] == "NIE_DOTYCZY"
    # Prąd ciągły: Σ I_r,T = 25 MVA / (√3 · 15,75 kV) ≈ 916,4 A — z modelu, w każdym wariancie.
    assert oceny["ciagla"]["wynik"]["wartosc"]["wartosc"] == pytest.approx(916.429, rel=1e-5)
    assert oceny["napieciowa"]["wynik"]["wartosc"]["wartosc"] == 17.5
    if wariant == "brak":
        for rodzaj in ("dynamiczna", "cieplna", "napieciowa", "ciagla", "iac_prad", "iac_czas"):
            assert oceny[rodzaj]["status_maszynowy"] == "BRAK_PODSTAWY", rodzaj
            assert oceny[rodzaj]["limit"] is None, rodzaj
        assert {
            READINESS_SZYNY_BEZ_NAPIECIA_ZNAMIONOWEGO,
            READINESS_SZYNY_BEZ_PRADU_ZNAMIONOWEGO,
            READINESS_SZYNY_BEZ_KLASYFIKACJI_IAC,
        } <= set(wiersz["kody_gotowosci"])
        return
    for rodzaj in ("dynamiczna", "cieplna", "napieciowa", "ciagla", "iac_prad", "iac_czas"):
        ocena = oceny[rodzaj]
        assert ocena["status_maszynowy"] == "SPELNIA", (rodzaj, ocena["powody_niepelnosci"])
        assert ocena["kompletnosc_dowodu"] == "NIEPELNY"
        dane = _dane(ocena)
        rodzaj_podstawy = ocena["limit"]["podstawa"]["rodzaj"]
        if wariant == "dokument":
            # Liczby z dokumentu źródłowego: podstawa limitu = karta producenta, bez danej
            # przyjętej ROZDZIELNICY (prąd z biegu bez zastrzeżeń).
            assert rodzaj_podstawy == "KATALOG_PRODUCENTA", rodzaj
            assert "DTR RX-17,5" in ocena["limit"]["podstawa"]["dokument"], rodzaj
            assert not [d for d in dane if "sekcja" in d["nazwa_pl"]], rodzaj
        else:
            # Wartość projektanta bez dokumentu: nigdy „katalog producenta”, zawsze dana przyjęta.
            assert rodzaj_podstawy != "KATALOG_PRODUCENTA", rodzaj
            assert dane and {d["jakosc"] for d in dane} == {"ESTIMATED"}, rodzaj
    assert not {
        READINESS_SZYNY_BEZ_NAPIECIA_ZNAMIONOWEGO,
        READINESS_SZYNY_BEZ_PRADU_ZNAMIONOWEGO,
        READINESS_SZYNY_BEZ_KLASYFIKACJI_IAC,
    } & set(wiersz["kody_gotowosci"])


@pytest.mark.parametrize(
    ("zmiana", "rodzaj"),
    [
        ({"u_r_kv": 12.0}, "napieciowa"),
        ({"i_r_a": 800.0}, "ciagla"),
        ({"iac_i_a_ka": 10.0}, "iac_prad"),
        ({"iac_t_a_s": 0.5}, "iac_czas"),
        ({"i_k_ka": 6.3, "i_p_ka": 16.0}, "cieplna"),
        ({"i_k_ka": 6.3, "i_p_ka": 16.0}, "dynamiczna"),
    ],
)
def test_przekroczenie_danej_rozdzielnicy_daje_nie_spelnia(zmiana: dict, rodzaj: str) -> None:
    widok = _widok_jednostkowy({**BLOK_Z_DOKUMENTEM, **zmiana}, ik_ka=12.0)
    ocena = _oceny_szyn(widok)[rodzaj]
    assert ocena["status_maszynowy"] == "NIE_SPELNIA", ocena["wyjasnienie"]
    assert ocena["margines"] is not None


def test_t_k_i_i_p_bez_danych_proponuje_norma() -> None:
    """Zasada nr 4: I_k nadany, t_k i I_p — wartość robocza IEC 62271-1 (p. 5.8, p. 5.7)."""
    widok = _widok_jednostkowy({"i_k_ka": 25.0})
    (wiersz,) = widok["szyny_sekcji"]
    wartosci = wiersz["znamiona"]["wartosci"]
    assert wartosci["i_th_duration_s"]["pochodzenie"] == "PROPOZYCJA"
    assert wartosci["i_th_duration_s"]["wartosc"] == 1.0
    assert wartosci["i_dyn_ka"]["pochodzenie"] == "PROPOZYCJA"
    assert wartosci["i_dyn_ka"]["wartosc"] == pytest.approx(62.5)
    oceny = _oceny_szyn(widok)
    assert oceny["dynamiczna"]["status_maszynowy"] == "SPELNIA"
    assert any("IEC 62271-1:2017 p. 5.7" in d["powod_pl"] for d in _dane(oceny["dynamiczna"]))


def test_czas_szyn_to_najdluzszy_czas_pol_zasilajacych() -> None:
    enm = _gpz_jednostkowy(BLOK_Z_DOKUMENTEM)
    enm = enm.model_copy(
        update={
            "bays": [
                *enm.bays,
                Bay(
                    ref_id="pole/in", name="L1", bay_role="IN", substation_ref="GPZ", bus_ref="sn1"
                ),
                Bay(
                    ref_id="pole/out",
                    name="O1",
                    bay_role="OUT",
                    substation_ref="GPZ",
                    bus_ref="sn1",
                ),
            ]
        }
    )
    prady = {"S1": PradyPola(punkt_ref="sn1", punkt_nazwa="S", ik_ka=12.0, ip_ka=30.0, ith_ka=12.2)}
    czasy = {
        "pole/tr": {"t_clearing_s": 0.6, "powod_pl": "TR", "zrodlo": "nastawy_pola"},
        "pole/in": {"t_clearing_s": 0.9, "powod_pl": "IN", "zrodlo": "nastawy_pola"},
        # Pole odpływowe nie zasila sekcji — jego czas nie wchodzi do czasu szyn.
        "pole/out": {"t_clearing_s": 2.5, "powod_pl": "OUT", "zrodlo": "nastawy_pola"},
    }
    widok = zbuduj_widok_wytrzymalosci_aparatury(
        enm=enm, station_ref="GPZ", prady_pol={}, run_id="r", czasy_pol=czasy, prady_szyn=prady
    )
    (wiersz,) = widok["szyny_sekcji"]
    assert wiersz["czas_wylaczenia"]["t_clearing_s"] == 0.9
    assert wiersz["czas_wylaczenia"]["pole_decydujace_ref"] == "pole/in"
    # Pole zasilające bez czasu czyni czas szyn nieustalonym (krótszy czas by go zaniżył).
    bez_czasu_in = {k: v for k, v in czasy.items() if k != "pole/in"}
    widok = zbuduj_widok_wytrzymalosci_aparatury(
        enm=enm,
        station_ref="GPZ",
        prady_pol={},
        run_id="r",
        czasy_pol=bez_czasu_in,
        prady_szyn=prady,
    )
    (wiersz,) = widok["szyny_sekcji"]
    assert wiersz["czas_wylaczenia"]["t_clearing_s"] is None
    assert READINESS_CZAS_SZYN_NIEUSTALONY in wiersz["czas_wylaczenia"]["kody_gotowosci"]


def test_sekcja_110_kv_iac_nie_dotyczy_napiecie_wobec_123_kv() -> None:
    widok = _widok_jednostkowy({**BLOK_Z_DOKUMENTEM, "u_r_kv": 123.0}, strona="WN")
    (wiersz,) = widok["szyny_sekcji"]
    oceny = _oceny_szyn(widok)
    assert wiersz["sekcja"]["strona"] == "WN"
    assert oceny["iac_prad"]["status_maszynowy"] == "NIE_DOTYCZY"
    assert oceny["iac_czas"]["status_maszynowy"] == "NIE_DOTYCZY"
    assert oceny["napieciowa"]["wynik"]["wartosc"]["wartosc"] == 123.0
    assert oceny["napieciowa"]["status_maszynowy"] == "SPELNIA"
    # Strona 110 kV transformatora przy sekcji: I_r = 25 MVA / (√3 · 110 kV) ≈ 131,2 A.
    assert oceny["ciagla"]["wynik"]["wartosc"]["wartosc"] == pytest.approx(131.216, rel=1e-4)
    assert READINESS_SZYNY_BEZ_KLASYFIKACJI_IAC not in wiersz["kody_gotowosci"]


def test_sekcja_bez_transformatora_nazywa_brak_pradu_roboczego() -> None:
    widok = zbuduj_widok_wytrzymalosci_aparatury(
        enm=_gpz_jednostkowy(BLOK_Z_DOKUMENTEM, z_transformatorem=False),
        station_ref="GPZ",
        prady_pol={},
        run_id="r",
    )
    ocena = _oceny_szyn(widok)["ciagla"]
    assert ocena["status_maszynowy"] == "NIE_OCENIONO"
    assert ocena["wynik"] is None


def test_widok_szyn_deterministyczny() -> None:
    a = json.dumps(_widok_jednostkowy(BLOK_PROJEKTANTA), sort_keys=True, ensure_ascii=False)
    b = json.dumps(_widok_jednostkowy(BLOK_PROJEKTANTA), sort_keys=True, ensure_ascii=False)
    assert a == b


# ---------------------------------------------------------------------------
# Łuk elektryczny — realny bieg × scenariusz × pochodzenie geometrii
# ---------------------------------------------------------------------------


def _luk(enm: EnergyNetworkModel, scenariusz: str, **parametry: Any) -> dict[str, Any]:
    bieg = _bieg_zwarciowy(f"gpz-luk-{scenariusz}-{id(enm)}", enm, {"scenario": scenariusz})
    domyslne: dict[str, Any] = {"working_distance_mm": None, "conductor_gap_mm": None}
    return build_arc_flash_view(bieg, arc_time_s=0.2, **{**domyslne, **parametry})


@pytest.mark.parametrize("scenariusz", ["max", "min"])
def test_luk_wezla_sekcji_bez_bloku_liczy_sie_jak_przed_karta(scenariusz: str) -> None:
    enm_bez_gpz = _build_mv_lv_enm("Siec z GPZ")
    przed = _luk_wezla(
        _luk(enm_bez_gpz, scenariusz, working_distance_mm=455.0, conductor_gap_mm=25.0), N0
    )
    reset_canonical_runs()
    po = _luk_wezla(
        _luk(_siec_z_gpz(None), scenariusz, working_distance_mm=455.0, conductor_gap_mm=25.0), N0
    )
    assert "parametry_rozdzielnicy" not in po
    assert {k: v for k, v in po.items() if k != "white_box"} == {
        k: v for k, v in przed.items() if k != "white_box"
    }


@pytest.mark.parametrize("scenariusz", ["max", "min"])
@pytest.mark.parametrize("wariant", ["projektant", "dokument"])
def test_geometria_z_rozdzielnicy_wygrywa_z_parametrem_zadania(
    scenariusz: str, wariant: str
) -> None:
    blok = BLOK_PROJEKTANTA if wariant == "projektant" else BLOK_Z_DOKUMENTEM
    widok = _luk(_siec_z_gpz(blok), scenariusz, working_distance_mm=455.0, conductor_gap_mm=25.0)
    wynik = _luk_wezla(widok, N0)
    assert wynik["conductor_gap_mm"] == blok["odstep_elektrod_mm"]
    assert wynik["working_distance_mm"] == blok["odleglosc_robocza_mm"]
    assert wynik["electrode_config"] == "HCB"
    zrodlo = ZRODLO_LUKU_PROJEKTANT if wariant == "projektant" else ZRODLO_LUKU_DOKUMENT
    parametry = wynik["parametry_rozdzielnicy"]
    assert {p["zrodlo"] for p in parametry["parametry"].values()} == {zrodlo}
    assert parametry["konfiguracja_elektrod"] == {"wartosc": "HCB", "zrodlo": zrodlo}
    dane_geometrii = [d for d in wynik.get("dane_przyjete", []) if "sekcja" in d["nazwa_pl"]]
    if wariant == "projektant":
        assert len(dane_geometrii) == len(PARAMETRY_GEOMETRII_LUKU)
        assert {d["jakosc"] for d in dane_geometrii} == {"ESTIMATED"}
        assert wynik["status_danych"] == "UNVALIDATED_INPUT"
    else:
        assert dane_geometrii == []
    # Węzeł poza sekcją GPZ bierze parametry żądania (jak przed kartą).
    poza = _luk_wezla(widok, N1)
    assert poza["conductor_gap_mm"] == 25.0
    assert poza["working_distance_mm"] == 455.0
    assert "parametry_rozdzielnicy" not in poza


@pytest.mark.parametrize("scenariusz", ["max", "min"])
def test_brak_geometrii_w_bloku_i_w_zadaniu_daje_wartosc_robocza_klasy_15_kv(
    scenariusz: str,
) -> None:
    widok = _luk(_siec_z_gpz({"u_r_kv": 17.5}), scenariusz)
    wynik = _luk_wezla(widok, N0)
    propozycja = propozycja_geometrii_luku(15.0)
    assert propozycja is not None
    assert wynik["conductor_gap_mm"] == propozycja.wartosci["odstep_elektrod_mm"] == 152.0
    assert wynik["working_distance_mm"] == propozycja.wartosci["odleglosc_robocza_mm"] == 914.4
    parametry = wynik["parametry_rozdzielnicy"]["parametry"]
    assert {p["zrodlo"] for p in parametry.values()} == {ZRODLO_LUKU_WARTOSC_ROBOCZA}
    dane = [d for d in wynik["dane_przyjete"] if "sekcja" in d["nazwa_pl"]]
    assert len(dane) == len(PARAMETRY_GEOMETRII_LUKU)
    assert all("IEEE 1584-2018" in d["powod_pl"] for d in dane)
    assert wynik["status"] != "INCOMPLETE_INPUT"
    assert wynik["incident_energy_cal_cm2"] is not None
    # Węzeł poza sekcją bez parametrów żądania pozostaje „dane niekompletne” (bez zmyślania).
    assert _luk_wezla(widok, N1)["incident_energy_cal_cm2"] is None


def test_parametr_zadania_wypelnia_brak_w_bloku_przed_wartoscia_robocza() -> None:
    widok = _luk(_siec_z_gpz({"odstep_elektrod_mm": 120.0}), "max", working_distance_mm=455.0)
    parametry = _luk_wezla(widok, N0)["parametry_rozdzielnicy"]["parametry"]
    assert parametry["odstep_elektrod_mm"] == {"wartosc": 120.0, "zrodlo": ZRODLO_LUKU_PROJEKTANT}
    assert parametry["odleglosc_robocza_mm"] == {
        "wartosc": 455.0,
        "zrodlo": ZRODLO_LUKU_PARAMETR_BIEGU,
    }
    assert parametry["szerokosc_obudowy_mm"]["zrodlo"] == ZRODLO_LUKU_WARTOSC_ROBOCZA


@pytest.mark.parametrize(
    ("napiecie_kv", "odstep"),
    [(0.4, 32.0), (1.0, 32.0), (3.0, 104.0), (5.0, 104.0), (6.0, 152.0), (15.0, 152.0)],
)
def test_klasa_geometrii_roboczej_wg_napiecia(napiecie_kv: float, odstep: float) -> None:
    propozycja = propozycja_geometrii_luku(napiecie_kv)
    assert propozycja is not None
    assert propozycja.wartosci["odstep_elektrod_mm"] == odstep
    assert set(propozycja.wartosci) == set(PARAMETRY_GEOMETRII_LUKU)


@pytest.mark.parametrize("napiecie_kv", [None, 0.0, -1.0, float("nan"), 15.01, 20.0, 110.0])
def test_brak_geometrii_roboczej_poza_klasami_normy(napiecie_kv: float | None) -> None:
    assert propozycja_geometrii_luku(napiecie_kv) is None


# ---------------------------------------------------------------------------
# Deklaracja konsumentów pól — zmiana pola zmienia wynik WYŁĄCZNIE zadeklarowanych konsumentów
# ---------------------------------------------------------------------------


def _wynik_konsumentow(blok: dict[str, Any], bieg_max: Any, enm: EnergyNetworkModel) -> dict:
    wiersze = build_short_circuit_results(bieg_max)["rows"]
    czasy = {"GPZ/pole/zas": {"t_clearing_s": 2.0, "powod_pl": "nastawy", "zrodlo": "x"}}
    wytrzymalosc = zbuduj_widok_wytrzymalosci_aparatury(
        enm=enm,
        station_ref="GPZ",
        prady_pol={},
        run_id="r",
        czasy_pol=czasy,
        prady_szyn=prady_szyn_z_biegu(enm=enm, station_ref="GPZ", wiersze_biegu=wiersze),
    )
    luk = _luk_wezla(
        build_arc_flash_view(
            bieg_max, working_distance_mm=455.0, conductor_gap_mm=25.0, arc_time_s=0.2
        ),
        N0,
    )
    (wiersz,) = wytrzymalosc["szyny_sekcji"]
    return {
        KONSUMENT_WYTRZYMALOSC_SZYN: json.dumps(wiersz["oceny"], sort_keys=True),
        KONSUMENT_LUK_ELEKTRYCZNY: json.dumps(luk, sort_keys=True),
    }


@pytest.mark.parametrize("klucz", KLUCZE_ROZDZIELNICY)
def test_zmiana_pola_zmienia_wynik_zadeklarowanych_konsumentow(klucz: str) -> None:
    assert set(ZMIANA_POLA) == set(KLUCZE_ROZDZIELNICY)
    bazowy = BLOK_Z_DOKUMENTEM
    zmieniony = {k: v for k, v in {**bazowy, klucz: ZMIANA_POLA[klucz]}.items() if v is not None}
    wyniki = []
    for blok in (bazowy, zmieniony):
        reset_canonical_runs()
        enm = _siec_z_gpz(blok)
        bieg = _bieg_zwarciowy(f"gpz-dekl-{klucz}-{len(wyniki)}", enm, {"scenario": "max"})
        wyniki.append(_wynik_konsumentow(blok, bieg, enm))
    for konsument in (KONSUMENT_WYTRZYMALOSC_SZYN, KONSUMENT_LUK_ELEKTRYCZNY):
        zmienia = wyniki[0][konsument] != wyniki[1][konsument]
        assert zmienia is (konsument in KONSUMENCI_POL_ROZDZIELNICY[klucz]), (klucz, konsument)


# ---------------------------------------------------------------------------
# Raport łuku — geometria i dane przyjęte w KAŻDYM formacie (zasada nr 4 pkt 4)
# ---------------------------------------------------------------------------


def test_raport_luku_nazywa_geometrie_rozdzielnicy_i_dane_przyjete_w_kazdym_formacie() -> None:
    from io import BytesIO

    from analysis.reporting.arc_flash_report import (
        ArcFlashReportContext,
        render_arc_flash_report_docx,
        render_arc_flash_report_latex,
        render_arc_flash_report_pdf,
        render_arc_flash_report_text,
    )
    from docx import Document

    widok = _luk(_siec_z_gpz({"odstep_elektrod_mm": 120.0}), "max", working_distance_mm=455.0)
    ctx = ArcFlashReportContext(
        project_name="P", station_id="GPZ", station_name="GPZ Sady", arc_flash_view_dict=widok
    )
    tekst = render_arc_flash_report_text(ctx)
    latex = render_arc_flash_report_latex(ctx)
    dokument = Document(BytesIO(render_arc_flash_report_docx(ctx)))
    docx = "\n".join(p.text for p in dokument.paragraphs)
    for tresc in (tekst, latex, docx):
        assert "Geometria łuku i dane przyjęte" in tresc
        assert "geometria z danych rozdzielnicy sekcji Sekcja 1 (SN)" in tresc
        assert "odstęp szyn G 120.0 mm (nadane przez projektanta)" in tresc
        assert "odległość robocza D 455.0 mm (z parametrów analizy)" in tresc
        assert "wartość robocza IEEE 1584-2018" in tresc
        assert "dane przyjęte:" in tresc
    assert render_arc_flash_report_pdf(ctx) == render_arc_flash_report_pdf(ctx)
    assert render_arc_flash_report_text(ctx) == tekst
