"""Czas wyłączenia t_b rozstrzygany PER PUNKT ZWARCIA — iloczyn cech (karta TB-WARTOSC-ROBOCZA).

Rozstrzygnięcie §0.1 karty (jedna funkcja ``short_circuit_binding.czas_tb_punktu``):
(a) t_b scenariusza projektanta (``breaking_time_seconds``) — pochodzenie ``PROJEKTANT``;
(b) inaczej najkrótszy czas wyłączenia pól lokalnych szyny punktu zwarcia (PowerFactory
„break time: min. of local”) — człon nastawczy zabezpieczenia + czas własny wyłącznika,
pochodzenie ``Z_POL`` z odnośnikiem pola; czas własny roboczy przenosi się na t_b;
(c) inaczej wartość robocza z ``network_model.core.czas_wylaczenia`` — pochodzenie
``PROPOZYCJA``, jakość ``ESTIMATED``.

Iloczyn cech: {t_b podany · z pól lokalnych · wartość robocza} × {sieć odległa od generatora ·
maszyna synchroniczna · maszyna asynchroniczna · turbina DFIG · źródło przekształtnikowe}
oraz: dwa pola o różnych czasach (minimum), pole z nastawą obok pola bez nastaw, wszystkie
pola bez nastaw, czas własny z karty katalogowej (nie roboczy) wobec roboczego, t_b
niepoprawny projektanta (odmowa), determinizm (dwa biegi, odwrócona kolejność pól), odciski
biegów z t_b projektanta bit w bit jak przed kartą. Każda komórka idzie REALNĄ ścieżką:
migawka ENM → bieg kanoniczny (``wykonaj_bieg_w_pamieci``) → wiersz wyniku.

Wyrocznia ręczna μ (IEC 60909-0:2016 wzory (70)–(73)) i q (§ 6.6.3) z NIEZALEŻNEJ tablicy
testu ``test_prad_wylaczeniowy_iloczyn_cech`` — zamiana krzywej w rdzeniu czerwieni test.
"""

from __future__ import annotations

import copy
import dataclasses
import hashlib
import json
import math
import uuid
from typing import Any

import pytest
from application.analyses import aparaty_pol as modul_aparatow
from enm.canonical_analysis import CanonicalRun
from enm.mapping import _ref_to_uuid
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.wartosci_robocze import CZAS_WLASNY_PROFIL_S
from network_model.core.czas_wylaczenia import (
    CZAS_TB_ROBOCZY_S,
    KOD_CZAS_TB_NIEPOPRAWNY,
    KOD_CZAS_TB_WARTOSC_ROBOCZA,
    ZRODLO_CZASU_TB_ROBOCZEGO,
    OdmowaCzasuTbError,
)
from network_model.solvers.short_circuit_iec60909 import (
    PRZYPADEK_IB_BEZ_MASZYN,
    PRZYPADEK_IB_MASZYNY,
)

from tests.golden.enm_builders.iec60909_example import build_iec60909_example_enm
from tests.network_model.solvers.test_prad_wylaczeniowy_iloczyn_cech import (
    TOPOLOGIE,
    _bieg,
    _krok,
    _migawka,
    _q_reczne,
    _wiersz,
)

APARAT_KATALOG = "sw-cb-abb-vd4-24kv-630a"
PRZEKAZNIK_KATALOG = "REF-OC-200"
STACJA = "stn/sn-33"
#: Zwłoki członów DT pól lokalnych [s] — dwa pola o różnych czasach.
ZWLOKA_A_S = 0.30
ZWLOKA_B_S = 0.50
#: Czas własny z (podmienionej) karty katalogowej [s] — cecha „dana karty, nie robocza”.
CZAS_WLASNY_KARTY_S = 0.05

#: Niezależna tablica krzywych μ IEC 60909-0:2016 wzory (70)–(73) — (a, b, w) dla węzłów
#: t_min 0,02 / 0,05 / 0,10 / ≥ 0,25 s; przepisana z normy w tym teście.
_MU_WEZLY = {
    0.02: (0.84, 0.26, 0.26),
    0.05: (0.71, 0.51, 0.30),
    0.1: (0.62, 0.72, 0.32),
    0.25: (0.56, 0.94, 0.38),
}


def _wezel_krzywej(tb_s: float) -> float:
    """Węzeł krzywej μ/q użyty przez rdzeń dla t_b (progi w połowie między węzłami)."""
    for prog, wezel in ((0.035, 0.02), (0.075, 0.05), (0.175, 0.1)):
        if tb_s <= prog:
            return wezel
    return 0.25


def _mu_reczne(krotnosc: float, tb_s: float) -> float:
    if krotnosc <= 2.0:
        return 1.0
    a, b, w = _MU_WEZLY[_wezel_krzywej(tb_s)]
    return min(1.0, a + b * math.exp(-w * krotnosc))


# ---------------------------------------------------------------------------
# Fikstura: sieć IEC 60909-4 + stacja SN z polami przy szynie 33 kV punktu zwarcia
# ---------------------------------------------------------------------------


def _pole(
    sufiks: str,
    szyna_sn: str,
    *,
    zwloka_s: float | None,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any] | None, dict[str, Any]]:
    """Pole: (spec pola, [szyna zacisku, wyłącznik], przypisanie zabezpieczenia|None, CT)."""
    pole_ref = f"pole/{sufiks}"
    spec = {"field_ref": pole_ref, "name": f"P-{sufiks}", "bay_role": "FEEDER", "bus_ref": szyna_sn}
    zacisk = {
        "ref_id": f"zacisk/{sufiks}",
        "name": f"Zacisk pola {sufiks}",
        "voltage_kv": 33.0,
    }
    wylacznik = {
        "ref_id": f"wyl/{sufiks}",
        "name": f"Wyłącznik pola {sufiks}",
        "type": "breaker",
        "from_bus_ref": szyna_sn,
        "to_bus_ref": zacisk["ref_id"],
        "catalog_ref": APARAT_KATALOG,
        "catalog_namespace": "APARAT_SN",
        "meta": {"station_ref": STACJA, "bay_ref": pole_ref},
    }
    przekladnik = {
        "ref_id": f"ct/{sufiks}",
        "name": f"Przekładnik pola {sufiks}",
        "measurement_type": "CT",
        "bus_ref": szyna_sn,
        "rating": {"ratio_primary": 400.0, "ratio_secondary": 5.0, "accuracy_class": "5P20"},
    }
    przypisanie = (
        {
            "ref_id": f"zab/{sufiks}",
            "name": f"Zabezpieczenie pola {sufiks}",
            "breaker_ref": wylacznik["ref_id"],
            "ct_ref": przekladnik["ref_id"],
            "catalog_ref": PRZEKAZNIK_KATALOG,
            "device_type": "overcurrent",
            "is_enabled": True,
            "settings": [
                {
                    "function_type": "overcurrent_51",
                    "threshold_a": 5.0,  # A wtórne · 400/5 = 400 A pierwotne
                    "threshold_unit": "A_WTORNY",
                    "curve_type": "DT",
                    "time_delay_s": zwloka_s,
                }
            ],
        }
        if zwloka_s is not None
        else None
    )
    return spec, [zacisk, wylacznik], przypisanie, przekladnik


def _migawka_z_polami(
    topologia: str, zwloki: dict[str, float | None], *, odwrotnie: bool = False
) -> tuple[dict[str, Any], str]:
    """Sieć topologii + stacja SN z polami ``zwloki`` (sufiks → zwłoka DT albo None = pole
    bez zabezpieczenia) przy szynie 33 kV — szynie punktu zwarcia z maszyną."""
    migawka, wezel = _migawka(topologia)
    szyna_sn = build_iec60909_example_enm().bus_map["BUS-MV"]
    specy: list[dict[str, Any]] = []
    kolejnosc = sorted(zwloki, reverse=odwrotnie)
    for sufiks in kolejnosc:
        spec, (zacisk, wylacznik), przypisanie, przekladnik = _pole(
            sufiks, szyna_sn, zwloka_s=zwloki[sufiks]
        )
        specy.append(spec)
        migawka["buses"].append(zacisk)
        migawka["branches"].append(wylacznik)
        migawka["measurements"].append(przekladnik)
        if przypisanie is not None:
            migawka["protection_assignments"].append(przypisanie)
    migawka["substations"].append(
        {
            "ref_id": STACJA,
            "name": "Rozdzielnia SN 33 kV",
            "station_type": "mv_lv",
            "bus_refs": [szyna_sn],
            "meta": {"field_specs": specy},
        }
    )
    return migawka, wezel


class _KatalogZCzasemWlasnym:
    """Realny katalog APARAT_SN z czasem własnym dopisanym wyłącznikowi pól (karta z danymi)."""

    def __init__(self) -> None:
        self._katalog = get_default_mv_catalog()

    def __getattr__(self, nazwa: str) -> Any:
        return getattr(self._katalog, nazwa)

    def get_mv_apparatus_type(self, catalog_ref: str) -> Any:
        pozycja = self._katalog.get_mv_apparatus_type(catalog_ref)
        if pozycja is None or catalog_ref != APARAT_KATALOG:
            return pozycja
        return dataclasses.replace(pozycja, break_time_s=CZAS_WLASNY_KARTY_S)


@pytest.fixture()
def karta_z_czasem_wlasnym(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(modul_aparatow, "get_default_mv_catalog", _KatalogZCzasemWlasnym)


#: Rodzaj t_b × topologia — trzy gałęzie rozstrzygnięcia.
RODZAJE_TB = ("podany", "z_pol", "roboczy")
TB_PODANY_S = 0.25
#: t_b z pól = najmniejsza zwłoka + czas własny roboczy wyłącznika (rejestr wartości
#: roboczych, profil wyłącznika próżniowego SN).
TB_Z_POL_S = round(ZWLOKA_A_S + CZAS_WLASNY_PROFIL_S, 6)


def _bieg_rodzaju(topologia: str, rodzaj: str) -> tuple[CanonicalRun, dict[str, Any]]:
    if rodzaj == "roboczy":
        migawka, wezel = _migawka(topologia)
    else:
        migawka, wezel = _migawka_z_polami(topologia, {"a": ZWLOKA_A_S, "b": ZWLOKA_B_S})
    run = _bieg(migawka, TB_PODANY_S if rodzaj == "podany" else None)
    return run, _wiersz(run, wezel)


_OCZEKIWANE_TB = {"podany": TB_PODANY_S, "z_pol": TB_Z_POL_S, "roboczy": CZAS_TB_ROBOCZY_S}
_POCHODZENIE = {"podany": None, "z_pol": "Z_POL", "roboczy": "PROPOZYCJA"}


@pytest.mark.parametrize("topologia", list(TOPOLOGIE))
@pytest.mark.parametrize("rodzaj", RODZAJE_TB)
def test_iloczyn_rodzaj_tb_razy_topologia(rodzaj: str, topologia: str) -> None:
    """t_b punktu, jego pochodzenie, I_b (rozdz. 9, niezależne μ/q) i i_DC (rozdz. 10)."""
    run, wiersz = _bieg_rodzaju(topologia, rodzaj)
    tb_s = _OCZEKIWANE_TB[rodzaj]
    assert wiersz["tb_s"] == pytest.approx(tb_s, abs=1e-12)

    zrodlo = wiersz.get("tb_zrodlo")
    if rodzaj == "podany":
        # t_b projektanta: pole addytywne nieobecne (exclude-None) — wiersz bit w bit.
        assert zrodlo is None
    else:
        assert zrodlo["pochodzenie"] == _POCHODZENIE[rodzaj]
        assert zrodlo["wartosc_s"] == pytest.approx(tb_s, abs=1e-12)
        assert zrodlo["wartosc_robocza"] is True and zrodlo["jakosc"] == "ESTIMATED"
        maszyny = topologia in ("synchroniczna", "asynchroniczna", "dfig")
        assert zrodlo["ib_z_udzialem_maszyn"] is maszyny
    if rodzaj == "z_pol":
        assert zrodlo["pole_ref"] == "pole/a" and zrodlo["zabezpieczenie_ref"] == "zab/a"
        assert zrodlo["czlon_nastawczy_s"] == pytest.approx(ZWLOKA_A_S)
        assert zrodlo["czas_wlasny_s"] == pytest.approx(CZAS_WLASNY_PROFIL_S)
        assert zrodlo["czas_wlasny_pochodzenie"] == "PROPOZYCJA"
        assert zrodlo["prad_zwarciowy_a"] == pytest.approx(wiersz["ikss_a"], rel=1e-12)
    if rodzaj == "roboczy":
        assert zrodlo["zrodlo_pl"] == ZRODLO_CZASU_TB_ROBOCZEGO

    # i_DC(t_b) = √2·I''k,Th·e^(−2π·50·t_b·R/X) — przy t_b PUNKTU.
    reczne_idc = (
        math.sqrt(2.0)
        * wiersz["ik_thevenin_a"]
        * math.exp(-2.0 * math.pi * 50.0 * tb_s * wiersz["rx_ratio"])
    )
    assert wiersz["i_dc_a"] == pytest.approx(reczne_idc, rel=1e-12)

    krok = _krok(wiersz, "Ib")
    if topologia in ("odlegla", "przeksztaltnik"):
        assert krok["inputs"]["przypadek"] == PRZYPADEK_IB_BEZ_MASZYN
        assert wiersz["ib_a"] == wiersz["ikss_a"]
    else:
        assert krok["inputs"]["przypadek"] == PRZYPADEK_IB_MASZYNY
        (maszyna,) = krok["inputs"]["maszyny"]
        mu = _mu_reczne(maszyna["ratio_ik_ir"], tb_s)
        q = 1.0 if topologia == "synchroniczna" else _q_reczne(2.0, _wezel_krzywej(tb_s))
        assert maszyna["mu"] == pytest.approx(mu, rel=1e-12)
        assert maszyna["q"] == pytest.approx(q, rel=1e-12)
        reczne_ib = wiersz["ikss_a"] - maszyna["delta_u_wzgledne"] * (1.0 - mu * q) * (
            maszyna["ikss_czesciowy_a"]
        )
        assert wiersz["ib_a"] == pytest.approx(reczne_ib, rel=1e-12)

    # Założenie biegu: punkty z t_b roboczym (w tym ten), nigdy przy t_b projektanta.
    zalozenia = {z["code"]: z for z in run.raw_result.get("zalozenia", [])}
    if rodzaj == "podany":
        assert KOD_CZAS_TB_WARTOSC_ROBOCZA not in zalozenia
    else:
        punkty = {p["fault_node_id"]: p for p in zalozenia[KOD_CZAS_TB_WARTOSC_ROBOCZA]["punkty"]}
        assert punkty[wiersz["fault_node_id"]]["pochodzenie"] == _POCHODZENIE[rodzaj]
        assert "fault.czas_tb_brak" not in zalozenia


@pytest.mark.parametrize("topologia", ["synchroniczna", "asynchroniczna", "dfig"])
def test_tb_z_pol_zmienia_ib_maszyn_wobec_wartosci_roboczej(topologia: str) -> None:
    """Dłuższy t_b z pól (0,36 s) → mniejsze μ → mniejsze I_b niż przy wartości roboczej."""
    _, wiersz_pol = _bieg_rodzaju(topologia, "z_pol")
    _, wiersz_rob = _bieg_rodzaju(topologia, "roboczy")
    assert wiersz_pol["ikss_a"] == pytest.approx(wiersz_rob["ikss_a"], rel=1e-12)
    assert wiersz_pol["ib_a"] < wiersz_rob["ib_a"] < wiersz_pol["ikss_a"]


# ---------------------------------------------------------------------------
# Pola lokalne: minimum, pole bez nastaw, wszystkie bez nastaw, czas własny karty
# ---------------------------------------------------------------------------


def _zrodlo_tb(zwloki: dict[str, float | None], **kwargs: Any) -> tuple[dict, CanonicalRun]:
    migawka, wezel = _migawka_z_polami("synchroniczna", zwloki, **kwargs)
    run = _bieg(migawka, None)
    return _wiersz(run, wezel)["tb_zrodlo"], run


@pytest.mark.parametrize(
    ("zwloki", "pole"),
    [
        ({"a": 0.30, "b": 0.50}, "pole/a"),
        ({"a": 0.50, "b": 0.30}, "pole/b"),
        ({"a": 0.30, "b": 0.30}, "pole/a"),  # remis — referencja pola (determinizm)
    ],
    ids=["a_krotsze", "b_krotsze", "remis"],
)
def test_dwa_pola_bierze_minimum(zwloki: dict[str, float], pole: str) -> None:
    zrodlo, _ = _zrodlo_tb(zwloki)
    assert zrodlo["pochodzenie"] == "Z_POL" and zrodlo["pole_ref"] == pole
    assert zrodlo["wartosc_s"] == pytest.approx(min(zwloki.values()) + CZAS_WLASNY_PROFIL_S)
    assert "z 2 pól z aparatem przy szynie" in zrodlo["opis_pl"]


@pytest.mark.parametrize("odwrotnie", [False, True], ids=["kolejnosc_a_b", "kolejnosc_b_a"])
def test_pole_z_nastawa_obok_pola_bez_nastaw(odwrotnie: bool) -> None:
    """Pole bez zabezpieczenia nie daje czasu i nie zeruje minimum — t_b z pola z nastawą."""
    zrodlo, _ = _zrodlo_tb({"a": None, "b": 0.50}, odwrotnie=odwrotnie)
    assert zrodlo["pochodzenie"] == "Z_POL" and zrodlo["pole_ref"] == "pole/b"
    assert zrodlo["wartosc_s"] == pytest.approx(0.50 + CZAS_WLASNY_PROFIL_S)


def test_wszystkie_pola_bez_nastaw_daja_wartosc_robocza_z_powodem_per_pole() -> None:
    zrodlo, run = _zrodlo_tb({"a": None, "b": None})
    assert zrodlo["pochodzenie"] == "PROPOZYCJA"
    assert zrodlo["wartosc_s"] == CZAS_TB_ROBOCZY_S
    assert "pole P-a" in zrodlo["opis_pl"] and "pole P-b" in zrodlo["opis_pl"]
    assert "nie ma przypisanego czynnego zabezpieczenia" in zrodlo["opis_pl"]
    kody = [z["code"] for z in run.raw_result["zalozenia"]]
    assert kody.count(KOD_CZAS_TB_WARTOSC_ROBOCZA) == 1


def test_czas_wlasny_z_karty_daje_tb_projektowe_bez_zalozenia_punktu(
    karta_z_czasem_wlasnym: None,
) -> None:
    """Czas własny z karty katalogowej: t_b z pól nie jest wartością roboczą — wiersz bez
    jakości ESTIMATED, punkt poza listą założenia (pozostałe punkty biegu nadal na niej)."""
    zrodlo, run = _zrodlo_tb({"a": 0.30, "b": 0.50})
    assert zrodlo["pochodzenie"] == "Z_POL" and zrodlo["wartosc_robocza"] is False
    assert zrodlo["jakosc"] is None and zrodlo["czas_wlasny_pochodzenie"] == "KATALOG"
    assert zrodlo["wartosc_s"] == pytest.approx(0.30 + CZAS_WLASNY_KARTY_S)
    wezel = _ref_to_uuid(build_iec60909_example_enm().bus_map["BUS-MV"])
    (zalozenie,) = (
        z for z in run.raw_result["zalozenia"] if z["code"] == KOD_CZAS_TB_WARTOSC_ROBOCZA
    )
    assert wezel not in {p["fault_node_id"] for p in zalozenie["punkty"]}


def test_czas_wlasny_roboczy_przenosi_sie_na_pochodzenie_tb() -> None:
    zrodlo, _ = _zrodlo_tb({"a": 0.30})
    assert zrodlo["czas_wlasny_pochodzenie"] == "PROPOZYCJA"
    assert zrodlo["wartosc_robocza"] is True and zrodlo["jakosc"] == "ESTIMATED"
    assert "Czas własny wyłącznika jest wartością roboczą, więc t_b też" in zrodlo["opis_pl"]


def test_pola_nie_przy_szynie_punktu_nie_wplywaja_na_inne_punkty() -> None:
    """Pola przy szynie 33 kV nie są lokalne dla szyny 110 kV — tam wartość robocza."""
    migawka, _ = _migawka_z_polami("synchroniczna", {"a": 0.30})
    run = _bieg(migawka, None)
    wezel_wn = _ref_to_uuid(build_iec60909_example_enm().bus_map["BUS-HV"])
    assert _wiersz(run, wezel_wn)["tb_zrodlo"]["pochodzenie"] == "PROPOZYCJA"


# ---------------------------------------------------------------------------
# Odmowa, determinizm, niezmienność biegów z t_b projektanta
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("zly", [0.0, -0.1, "0,1", True, float("nan"), float("inf")], ids=repr)
def test_tb_niepoprawny_projektanta_odmowa_w_biegu(zly: object) -> None:
    migawka, _ = _migawka_z_polami("synchroniczna", {"a": 0.30})
    with pytest.raises(OdmowaCzasuTbError) as blad:
        _bieg(migawka, zly)  # type: ignore[arg-type]
    assert blad.value.kod == KOD_CZAS_TB_NIEPOPRAWNY


def _odcisk(run: CanonicalRun) -> str:
    return hashlib.sha256(
        json.dumps(run.raw_result, sort_keys=True, default=str).encode()
    ).hexdigest()


@pytest.mark.parametrize("rodzaj", RODZAJE_TB)
def test_determinizm_dwa_biegi_i_kolejnosc_pol(rodzaj: str) -> None:
    if rodzaj == "roboczy":
        migawka, _ = _migawka("synchroniczna")
        druga = copy.deepcopy(migawka)
    else:
        migawka, _ = _migawka_z_polami("synchroniczna", {"a": 0.30, "b": 0.50})
        druga, _ = _migawka_z_polami("synchroniczna", {"a": 0.30, "b": 0.50}, odwrotnie=True)
    tb = TB_PODANY_S if rodzaj == "podany" else None
    pierwszy = _odcisk(_bieg(migawka, tb))
    assert _odcisk(_bieg(copy.deepcopy(migawka), tb)) == pierwszy
    wynik_odwrocony = _bieg(druga, tb)
    # Odwrócona kolejność pól w modelu zmienia kolejność list migawki (graf, zrzut modelu),
    # ale nie t_b ani liczby wierszy.
    for wiersz in wynik_odwrocony.raw_result["results"]:
        oryginal = _wiersz(_bieg(migawka, tb), wiersz["fault_node_id"])
        for klucz in ("tb_s", "tb_zrodlo", "ib_a", "i_dc_a", "ikss_a"):
            assert wiersz.get(klucz) == oryginal.get(klucz)


#: Odciski ``raw_result["results"]`` biegów z t_b projektanta zmierzone na bazie karty
#: (``5517d6eff``, przed TB-WARTOSC-ROBOCZA) skryptem sondy na tych samych migawkach —
#: wynik i ślad biegu z podanym t_b są bit w bit te same (pole ``tb_zrodlo`` pominięte).
ODCISKI_BAZY: dict[tuple[str, float], str] = {
    ("asynchroniczna", 0.02): "59676fe8e05653b69b62d0da080865eebf1fa80321cb698696952eab9a63f71e",
    ("asynchroniczna", 0.1): "060b0b038e7244652d6d7ebbbfc408ca636943a26ecb453aada56e2a514852c5",
    ("asynchroniczna", 0.25): "c8ed7701ace478b33d0f5ca381cbf5477bbd0f9f172ccd3265b32c843248f81f",
    ("dfig", 0.02): "20e681e5e3a37e0b767a70e0c0da95f2a94b782be300525128e2c5f6983559ea",
    ("dfig", 0.1): "c92693c77d8e5847166f8b1b54ff3c72fe8245218c557b0f97289022d6725269",
    ("dfig", 0.25): "aeeff73d34d5114ae957f017262690552f8b4918fa252f618209ec035b060040",
    ("odlegla", 0.02): "844a60f9aaecd1bbd655cd64b672b00f7305fc1bad79aaca8f0bab84fea93023",
    ("odlegla", 0.1): "76e8930a1c8714324988028809e8fa65f4f242cad5a5ad86d498936c2996800c",
    ("odlegla", 0.25): "9dd1f6b29d7849b9726788f4e111f608b357455beba938b1a8c78961dd88ff4c",
    ("przeksztaltnik", 0.02): "a018b2eedaf9d682f732f7c30a005c1c294fe4d45209951dea3b4464cbfa7c13",
    ("przeksztaltnik", 0.1): "0007d06ca677b262c6b28b62d84c49095dfc18c957afcef7ed0a815590b3f23e",
    ("przeksztaltnik", 0.25): "447b1ddc0247b6788cf538975024ee83021856f71a92b8be4dc096e5e0d4123b",
    ("synchroniczna", 0.02): "8cbfba717b1c4d50baea04aaeaff5ea551981199608cf0c3d58e549b35ca57d7",
    ("synchroniczna", 0.1): "fce835b795ef4e768c2182262d21145bf916c9336df2cf97afbf24be5e366187",
    ("synchroniczna", 0.25): "4f5348ac22fe1d2c05e6216d6ad56cbe0edc945fb886c7a0d68c4c07231875a3",
}


@pytest.mark.parametrize(("topologia", "tb_s"), sorted(ODCISKI_BAZY))
def test_bieg_z_tb_projektanta_bit_w_bit_jak_przed_karta(topologia: str, tb_s: float) -> None:
    migawka, _ = _migawka(topologia)
    run = _bieg(migawka, tb_s)
    wyniki = json.dumps(run.raw_result["results"], sort_keys=True, default=str)
    assert hashlib.sha256(wyniki.encode()).hexdigest() == ODCISKI_BAZY[(topologia, tb_s)]
    assert all("tb_zrodlo" not in w for w in run.raw_result["results"])
    assert "zalozenia" not in run.raw_result


def _opcje_scenariusza(tb_s: float | None) -> dict[str, Any]:
    """Opcje biegu z REALNEJ projekcji scenariusza zwarciowego (kontrakt domeny)."""
    from domain.fault_scenario import FaultLocation, FaultScenario, FaultType, ShortCircuitConfig
    from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza

    return opcje_biegu_ze_scenariusza(
        OperatingScenario(
            scenario_id="s1",
            name="Zwarcie 3F na szynie",
            kind=RodzajScenariusza.FAULT_STUDY,
            fault_spec=FaultScenario(
                scenario_id=uuid.UUID(int=7),
                study_case_id=uuid.UUID(int=8),
                name="Zwarcie 3F",
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="b1", location_type="BUS"),
                config=ShortCircuitConfig(
                    scenariusz="MAX", thermal_time_seconds=1.0, breaking_time_seconds=tb_s
                ),
            ),
        )
    )


#: ``input_hash`` biegu z projekcji scenariusza bez t_b i z t_b = 0,1 s, zmierzone na bazie
#: karty (``5517d6eff``) tą samą funkcją — rozstrzyganie t_b w punkcie zwarcia nie dokłada
#: żadnego klucza do opcji biegu, więc hash istniejących biegów się nie zmienia.
INPUT_HASH_BEZ_TB = "2d7568c0308eab12f6f95c4c14b84ba89f225f77db2309514324f670167738fd"
INPUT_HASH_Z_TB = "79bc899587920bef79fd7d1680729e641f94771d9f6254d527ad47be3a2a444c"


def test_input_hash_biegu_bez_tb_i_z_tb_bez_zmian() -> None:
    from enm.canonical_analysis import _compute_input_hash

    wspolne = {"case_id": "przypadek", "analysis_type": "short_circuit_sn", "enm_hash": "e"}
    bez_tb = _opcje_scenariusza(None)
    assert "breaking_time_seconds" not in bez_tb
    assert _compute_input_hash(**wspolne, options=bez_tb) == INPUT_HASH_BEZ_TB
    assert _compute_input_hash(**wspolne, options=_opcje_scenariusza(0.1)) == INPUT_HASH_Z_TB


# ---------------------------------------------------------------------------
# Wkłady zwarciowe (`POST /api/proof/sc3f/contributions`): t_min = t_b punktu zwarcia
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", RODZAJE_TB)
def test_wklady_t_min_i_zrodlo_z_tego_samego_rozstrzygniecia_co_wiersz_biegu(rodzaj: str) -> None:
    """Rodzaj t_b × {t_min wkładów, pole ``t_min_zrodlo``, zdanie wywodu, μ maszyny}.

    Wkłady liczą μ z tym samym t_b co wiersz biegu (jedna funkcja ``czas_tb_punktu``).
    Pochodzenie spoza scenariusza (pola lokalne, wartość robocza) widać w odpowiedzi i w
    nagłówku wywodu — JEDEN predykat dla obu; t_b scenariusza: ani pola, ani zdania.
    """
    from api.main import app
    from fastapi.testclient import TestClient

    run, wiersz = _bieg_rodzaju("synchroniczna", rodzaj)
    payload: dict[str, Any] = {
        "snapshot": run.snapshot,
        "fault_node_id": build_iec60909_example_enm().bus_map["BUS-MV"],
        "scenariusz": "MAX",
    }
    if rodzaj == "podany":
        payload["t_min_s"] = TB_PODANY_S
    odpowiedz = TestClient(app).post("/api/proof/sc3f/contributions", json=payload)
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()

    tb_s = _OCZEKIWANE_TB[rodzaj]
    assert dane["t_min_s"] == pytest.approx(tb_s)
    (wklad,) = dane["contributions"]
    assert wklad["mu"] == pytest.approx(_mu_reczne(wklad["ratio_ik_ir"], tb_s), abs=1e-9)

    prefiks = "Czas t_min (= t_b punktu zwarcia): "
    zdania = [k["tekst"] for k in dane["wywod"] if k["tekst"].startswith(prefiks)]
    zdania_sekcji = [
        k["tekst"] for k in dane["wywod_sekcje"][0]["kroki"] if k["tekst"].startswith(prefiks)
    ]
    if rodzaj == "podany":
        assert "tb_zrodlo" not in wiersz
        assert "t_min_zrodlo" not in dane
        assert zdania == [] and zdania_sekcji == []
    else:
        # Wiersz biegu dokłada jedną cechę wiersza (czy I_b punktu zależy od t_b przez
        # maszyny); poza nią nośnik t_b wkładów i wiersza jest identyczny.
        zrodlo_wiersza = dict(wiersz["tb_zrodlo"])
        assert zrodlo_wiersza.pop("ib_z_udzialem_maszyn") is True
        assert dane["t_min_zrodlo"] == zrodlo_wiersza
        assert dane["t_min_zrodlo"]["pochodzenie"] == _POCHODZENIE[rodzaj]
        assert zdania == zdania_sekcji == [prefiks + wiersz["tb_zrodlo"]["opis_pl"]]
