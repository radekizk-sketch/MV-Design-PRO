"""Skladanie pakietu dowodow audytu 2 z konfiguracji stacji i z modelu (karta PROOFPACK-KONTRAKT).

ILOCZYN CECH, W KTORYM DEFEKT MOGL SIE SCHOWAC:
  rodzaj dowodu (5) × dane konfiguracji obecne / brak × nazwa elementu w modelu obecna /
  brak × jedna stacja / kilka stacji — plus przypadki elementu: element spoza modelu, dana
  karty nieustalona, wpis wyczyszczony w konfiguratorze (pusty napis), zapis w starym
  ksztalcie. Niezmiennik pakietu (przypiety na KAZDYM przypadku): kazdy z pieciu rodzajow
  ma w pakiecie stacji dowod albo jawny brak z przyczyna — nigdy nie znika po cichu.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from application.proof_engine.packs.audit2_skladanie import (
    BRAK_KONFIGURACJI,
    BRAK_MAGAZYNU,
    BRAK_PRZEKLADNIKOW,
    BRAK_PRZELACZNIKOW,
    BRAK_UZIEMIENIA,
    BRAK_WYTRZYMALOSCI,
    BRAK_ZRODEL,
    KONFIGURACJA_NIEPOPRAWNA,
    MAGAZYN_SPOZA_MODELU,
    RODZAJE_DOWODOW,
    STACJA_BEZ_SZYN,
    TRANSFORMATOR_SPOZA_MODELU,
    UZIEMIENIE_SPOZA_KATALOGU,
    ZRODLO_SPOZA_MODELU,
    moce_odbiorow_stacji_kw,
    zdolnosci_przeksztaltnika,
    zloz_pakiet_stacji,
    zloz_pakiety_projektu,
)
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    Substation,
    TapChanger,
    Transformer,
)
from network_model.catalog.types import ConverterKind, ConverterType

MAGAZYN_GFM = "conv-bess-tesla-megapack-3p9mw-15kv"  # qmin<0<qmax, GRID_FORMING
MAGAZYN_GFL = "conv-bess-1mw-2mwh-15kv"  # qmin<0<qmax, tryb sterowania nieznany
VT_19 = "vt_20kv_fz_100_3_05_3p_siemens"


def _model(
    *,
    nazwa_magazynu: str = "Magazyn Łąkowa",
    katalog_magazynu: str = MAGAZYN_GFM,
    avr_w_modelu: bool = False,
    uhv_kv: float = 15.0,
    ulv_kv: float = 0.4,
    odbiory_mw: tuple[float, ...] = (1.0,),
    druga_stacja: bool = False,
) -> EnergyNetworkModel:
    stacje = [
        Substation(ref_id="st-A", name="Stacja Łąkowa", station_type="mv_lv", bus_refs=["bus-a"])
    ]
    szyny = [
        Bus(ref_id="bus-sn", name="Szyna SN", voltage_kv=uhv_kv),
        Bus(ref_id="bus-a", name="Szyna nN A", voltage_kv=ulv_kv),
    ]
    generatory = [
        Generator(
            ref_id="gen/9f3c21aa/bess",
            name=nazwa_magazynu,
            bus_ref="bus-a",
            p_mw=0.5,
            gen_type="bess",
            catalog_ref=katalog_magazynu,
        ),
        Generator(
            ref_id="gen/pv-1", name="PV Łąkowa", bus_ref="bus-a", p_mw=0.4, gen_type="pv_inverter"
        ),
    ]
    odbiory = [
        Load(ref_id=f"ld-{i}", name=f"Odbiór {i}", bus_ref="bus-a", p_mw=p, q_mvar=0.0)
        for i, p in enumerate(odbiory_mw)
    ]
    if druga_stacja:
        szyny.append(Bus(ref_id="bus-b", name="Szyna nN B", voltage_kv=0.4))
        stacje.append(
            Substation(ref_id="st-B", name="Stacja Polna", station_type="mv_lv", bus_refs=["bus-b"])
        )
        generatory.append(Generator(ref_id="gen/pv-b", name="PV Polna", bus_ref="bus-b", p_mw=0.1))
        odbiory.append(Load(ref_id="ld-b", name="Odbiór B", bus_ref="bus-b", p_mw=0.1, q_mvar=0))
    transformator = Transformer(
        ref_id="tr/5b0f7d1e",
        name="Transformator T1 Łąkowa",
        hv_bus_ref="bus-sn",
        lv_bus_ref="bus-a",
        sn_mva=0.63,
        uhv_kv=uhv_kv,
        ulv_kv=ulv_kv,
        uk_percent=6.0,
        pk_kw=6.5,
        tap_changer=(
            TapChanger(regulation_type="OLTC", control_mode="AUTOMATIC") if avr_w_modelu else None
        ),
    )
    return EnergyNetworkModel(
        header=ENMHeader(name="Audyt 2 — skladanie"),
        buses=szyny,
        substations=stacje,
        transformers=[transformator],
        generators=generatory,
        loads=odbiory,
    )


def _konfiguracja_pelna(**zmiany: Any) -> dict[str, Any]:
    konfiguracja: dict[str, Any] = {
        "mv_neutral_grounding_ref": "mng_petersen",
        "tap_changer_refs": [],
        "der_specs": [
            {
                "der_id": "gen/9f3c21aa/bess",
                "der_kind": "BESS",
                "bess_operation_mode_refs": ["mode_voltage_support", "mode_island_backup"],
                "nominal_power_kw": 500.0,
            },
            {"der_id": "gen/pv-1", "der_kind": "PV", "nominal_power_kw": 700.0},
        ],
        "transformer_tap_changers": {"tr/5b0f7d1e": "tc_detc_snnn_5_25"},
        "bay_hv_fuses": {},
        "bay_vts": {"Pole 01": VT_19},
        "bay_device_withstand": {
            "Pole 02": {
                "device_id": "wstd_breaker_vacuum_15_25",
                "i_peak_calculated_ka": 50,
                "i_thermal_calculated_ka": 20,
                "t_clearing_s": 1.0,
            }
        },
    }
    konfiguracja.update(zmiany)
    return konfiguracja


def _rodzaje(pakiet: dict[str, Any]) -> tuple[set[str], set[str]]:
    return (
        {d["proof_type"] for d in pakiet["proofs"]},
        {b["proof_type"] for b in pakiet["braki_danych"]},
    )


def _pakiet(konfiguracja: dict[str, Any], model: EnergyNetworkModel | None) -> dict[str, Any]:
    pakiet = zloz_pakiet_stacji("st-A", konfiguracja, model).to_dict()
    dowody, braki = _rodzaje(pakiet)
    # NIEZMIENNIK: kazdy rodzaj ma dowod albo jawny brak — nic nie znika po cichu.
    assert dowody | braki == set(RODZAJE_DOWODOW), pakiet
    for brak in pakiet["braki_danych"]:
        assert brak["przyczyna_pl"] and brak["rodzaj_pl"]
    return pakiet


def _teksty(pakiet: dict[str, Any]) -> list[str]:
    teksty = [pakiet["station_nazwa"]]
    for dowod in pakiet["proofs"]:
        teksty.append(dowod["summary_pl"])
        teksty.extend(dowod["details"].get("issues", []))
    teksty.extend(b["przyczyna_pl"] for b in pakiet["braki_danych"])
    return teksty


def test_pelna_konfiguracja_daje_piec_rodzajow_z_nazwami_z_modelu() -> None:
    pakiet = _pakiet(_konfiguracja_pelna(), _model())
    assert pakiet["braki_danych"] == []
    assert pakiet["proof_count"] == 5
    assert pakiet["station_nazwa"] == "Stacja Łąkowa"
    teksty = " ".join(_teksty(pakiet))
    assert "Magazyn Łąkowa" in teksty
    assert "Transformator T1 Łąkowa" in teksty
    for identyfikator in ("gen/9f3c21aa/bess", "tr/5b0f7d1e", "st-A", "wstd_breaker", VT_19):
        assert identyfikator not in teksty
    # Arytmetyka bilansu w backendzie: 500 + 700 kW zrodel, 1000 kW odbiorow stacji.
    eksport = next(d for d in pakiet["proofs"] if d["proof_type"] == RODZAJE_DOWODOW[2])
    assert eksport["details"]["p_export_kw"] == 1200.0
    assert eksport["details"]["p_import_kw"] == 1000.0
    assert eksport["details"]["status"] == "normal_export"
    # Karta GFM z granicami Q po obu stronach zera: oba tryby zgodne.
    bess = next(d for d in pakiet["proofs"] if d["proof_type"] == RODZAJE_DOWODOW[0])
    assert bess["pass_status"] is True
    assert pakiet["all_pass"] is True


@pytest.mark.parametrize(
    ("zmiana", "rodzaj", "przyczyna"),
    [
        ({"der_specs": []}, RODZAJE_DOWODOW[0], BRAK_MAGAZYNU),
        ({"transformer_tap_changers": {}}, RODZAJE_DOWODOW[1], BRAK_PRZELACZNIKOW),
        # Wybor wyczyszczony w konfiguratorze zapisuje sie jako pusty napis.
        ({"transformer_tap_changers": {"tr/5b0f7d1e": ""}}, RODZAJE_DOWODOW[1], BRAK_PRZELACZNIKOW),
        ({"der_specs": []}, RODZAJE_DOWODOW[2], BRAK_ZRODEL),
        ({"bay_device_withstand": {}}, RODZAJE_DOWODOW[3], BRAK_WYTRZYMALOSCI),
        ({"bay_vts": {}}, RODZAJE_DOWODOW[4], BRAK_PRZEKLADNIKOW),
        ({"bay_vts": {"Pole 01": ""}}, RODZAJE_DOWODOW[4], BRAK_PRZEKLADNIKOW),
        ({"mv_neutral_grounding_ref": None}, RODZAJE_DOWODOW[4], BRAK_UZIEMIENIA),
        (
            {"mv_neutral_grounding_ref": "mng_z_innego_swiata"},
            RODZAJE_DOWODOW[4],
            UZIEMIENIE_SPOZA_KATALOGU,
        ),
    ],
    ids=[
        "bess_brak_magazynu",
        "zaczepy_brak_przypisania",
        "zaczepy_wpis_wyczyszczony",
        "eksport_brak_zrodel",
        "wytrzymalosc_brak_danych",
        "przekladniki_brak_przypisania",
        "przekladniki_wpis_wyczyszczony",
        "przekladniki_brak_uziemienia",
        "przekladniki_uziemienie_spoza_katalogu",
    ],
)
def test_rodzaj_bez_danych_jest_jawnym_brakiem_a_pozostale_zostaja(
    zmiana: dict[str, Any], rodzaj: str, przyczyna: str
) -> None:
    pakiet = _pakiet(_konfiguracja_pelna(**zmiana), _model())
    dowody, braki = _rodzaje(pakiet)
    assert rodzaj in braki and rodzaj not in dowody
    assert przyczyna in [b["przyczyna_pl"] for b in pakiet["braki_danych"]]
    # Brak danych nie jest zgodnoscia, ale tez nie jest dowodem niezaliczonym.
    assert pakiet["fail_count"] == 0


def test_magazyn_spoza_modelu_i_bez_trybow_to_braki_pozycji() -> None:
    konfiguracja = _konfiguracja_pelna(
        der_specs=[
            {
                "der_id": "gen/usuniety",
                "der_kind": "BESS",
                "bess_operation_mode_refs": ["mode_peak_shaving"],
                "nominal_power_kw": 100,
            },
            {
                "der_id": "gen/9f3c21aa/bess",
                "der_kind": "BESS",
                "bess_operation_mode_refs": [],
                "nominal_power_kw": 500,
            },
        ]
    )
    pakiet = _pakiet(konfiguracja, _model())
    przyczyny = [b["przyczyna_pl"] for b in pakiet["braki_danych"]]
    assert MAGAZYN_SPOZA_MODELU in przyczyny
    assert "Magazyn energii Magazyn Łąkowa: nie wybrano trybów pracy." in przyczyny
    # Zrodlo spoza modelu psuje tez bilans eksportu — bez dowodu z polowa zrodel.
    assert ZRODLO_SPOZA_MODELU in przyczyny
    assert RODZAJE_DOWODOW[2] not in _rodzaje(pakiet)[0]


@pytest.mark.parametrize(
    ("katalog", "zgodny", "fragment"),
    [
        (MAGAZYN_GFM, True, None),
        # Karta bez trybu sterowania: tworzenie napiecia nieustalone — tryb wyspowy
        # nie dostaje zgodnosci na domysl.
        (MAGAZYN_GFL, False, "karta przekształtnika nie podaje trybu sterowania"),
        # Typ spoza katalogu: obie zdolnosci nieustalone.
        ("conv-spoza-katalogu", False, "karta przekształtnika nie podaje granic mocy biernej"),
    ],
    ids=["karta_gfm", "karta_bez_trybu_sterowania", "typ_spoza_katalogu"],
)
def test_zdolnosci_pcs_z_karty_typu_zrodla_w_modelu(
    katalog: str, zgodny: bool, fragment: str | None
) -> None:
    pakiet = _pakiet(_konfiguracja_pelna(), _model(katalog_magazynu=katalog))
    bess = next(d for d in pakiet["proofs"] if d["proof_type"] == RODZAJE_DOWODOW[0])
    assert bess["pass_status"] is zgodny
    if fragment is not None:
        assert any(fragment in pozycja for pozycja in bess["details"]["issues"])


@pytest.mark.parametrize(
    ("typ", "oczekiwane"),
    [
        (None, (None, None)),
        ({"qmin_mvar": -1.0, "qmax_mvar": 1.0, "control_mode": "GRID_FORMING"}, (True, True)),
        ({"qmin_mvar": 0.0, "qmax_mvar": 1.0, "control_mode": "Q_U_DROOP"}, (False, False)),
        ({"qmin_mvar": None, "qmax_mvar": 1.0, "control_mode": None}, (None, None)),
        ({"qmin_mvar": -1.0, "qmax_mvar": None, "control_mode": "GRID_FORMING"}, (None, True)),
    ],
    ids=["brak_karty", "4q_gfm", "bez_4q_gfl", "brak_qmin_brak_trybu", "brak_qmax"],
)
def test_zdolnosci_przeksztaltnika_brak_danej_to_nieustalone(
    typ: dict[str, Any] | None, oczekiwane: tuple[bool | None, bool | None]
) -> None:
    karta = (
        None
        if typ is None
        else ConverterType(
            id="t", name="Typ", kind=ConverterKind.BESS, un_kv=0.4, sn_mva=1.0, pmax_mw=1.0, **typ
        )
    )
    assert zdolnosci_przeksztaltnika(karta) == oczekiwane


@pytest.mark.parametrize(
    ("uhv", "ulv", "avr", "przelacznik", "zgodny"),
    [
        (15.0, 0.4, False, "tc_detc_snnn_5_25", True),
        (20.0, 0.4, False, "tc_detc_snnn_5_25", True),
        # Model deklaruje sterowanie automatyczne — DETC bez AVR nie wystarcza (dawny
        # warunek `requires_avr = tc.supports_avr` nie mogl nigdy zawiesc).
        (15.0, 0.4, True, "tc_detc_snnn_5_25", False),
        (15.0, 0.4, True, "tc_oltc_snnn_9_15", True),
        (110.0, 15.0, True, "tc_oltc_110sn_19_125", True),
        # Klasa z napiec modelu, nie „pierwsza pozycja katalogu" (dawny domysl zawsze zgodny).
        (110.0, 20.0, False, "tc_detc_snnn_5_25", False),
        (15.0, 0.4, False, "tc_z_innego_swiata", False),
    ],
)
def test_plan_zaczepow_klasa_i_avr_z_modelu(
    uhv: float, ulv: float, avr: bool, przelacznik: str, zgodny: bool
) -> None:
    pakiet = _pakiet(
        _konfiguracja_pelna(transformer_tap_changers={"tr/5b0f7d1e": przelacznik}),
        _model(uhv_kv=uhv, ulv_kv=ulv, avr_w_modelu=avr),
    )
    dowod = next(d for d in pakiet["proofs"] if d["proof_type"] == RODZAJE_DOWODOW[1])
    assert dowod["pass_status"] is zgodny
    assert dowod["details"]["requires_avr"] is avr
    assert "tr/5b0f7d1e" not in " ".join(_teksty(pakiet))


def test_transformator_spoza_klas_i_spoza_modelu_to_braki() -> None:
    pakiet = _pakiet(_konfiguracja_pelna(), _model(uhv_kv=110.0, ulv_kv=30.0))
    przyczyny = [b["przyczyna_pl"] for b in pakiet["braki_danych"]]
    assert any("Transformator T1 Łąkowa (110/30 kV)" in p for p in przyczyny)
    pakiet = _pakiet(
        _konfiguracja_pelna(transformer_tap_changers={"tr/usuniety": "tc_detc_snnn_5_25"}),
        _model(),
    )
    assert TRANSFORMATOR_SPOZA_MODELU in [b["przyczyna_pl"] for b in pakiet["braki_danych"]]


@pytest.mark.parametrize("moc", [None, 0.0, -5.0], ids=["brak", "zero", "ujemna"])
def test_zrodlo_bez_mocy_znamionowej_blokuje_bilans(moc: float | None) -> None:
    konfiguracja = _konfiguracja_pelna()
    konfiguracja["der_specs"][1]["nominal_power_kw"] = moc
    pakiet = _pakiet(konfiguracja, _model())
    assert RODZAJE_DOWODOW[2] not in _rodzaje(pakiet)[0]
    assert (
        "Źródło PV Łąkowa nie ma mocy znamionowej z katalogu — bilans eksportu byłby zaniżony."
        in [b["przyczyna_pl"] for b in pakiet["braki_danych"]]
    )


def test_stacja_bez_odbiorow_to_zero_importu_a_stacja_spoza_modelu_to_brak() -> None:
    # Stacja w modelu bez odbiorow: import 0 jest wiedza — caly eksport do OSD, stosunek
    # nieokreslony (None, nie nieskonczonosc wypisana w tekscie).
    pakiet = _pakiet(_konfiguracja_pelna(), _model(odbiory_mw=()))
    eksport = next(d for d in pakiet["proofs"] if d["proof_type"] == RODZAJE_DOWODOW[2])
    assert eksport["details"]["p_import_kw"] == 0.0
    assert eksport["details"]["export_to_import_ratio"] is None
    assert eksport["details"]["status"] == "requires_ramp_down"
    assert "inf" not in eksport["summary_pl"]
    # Projekt bez modelu: import nieznany — brak, nie zero.
    pakiet = _pakiet(_konfiguracja_pelna(), None)
    assert STACJA_BEZ_SZYN in [b["przyczyna_pl"] for b in pakiet["braki_danych"]]
    assert pakiet["station_nazwa"] == "Stacja spoza modelu"


def test_element_bez_nazwy_w_modelu_nazwany_rodzajem_nigdy_identyfikatorem() -> None:
    # Nazwa pusta po obcieciu spacji to brak nazwy (jeden predykat `network_model.nazwy`).
    pakiet = _pakiet(_konfiguracja_pelna(), _model(nazwa_magazynu="   "))
    bess = next(d for d in pakiet["proofs"] if d["proof_type"] == RODZAJE_DOWODOW[0])
    assert "Generator bez nazwy" in bess["summary_pl"]
    assert "gen/9f3c21aa/bess" not in bess["summary_pl"]
    assert bess["details"]["der_id"] == "gen/9f3c21aa/bess"


def test_przekladnik_spoza_katalogu_daje_dowod_niezaliczony_z_powodem() -> None:
    pakiet = _pakiet(
        _konfiguracja_pelna(bay_vts={"Pole 01": VT_19, "Pole 03": "vt_widmo"}), _model()
    )
    vt = {
        d["details"]["bay_designation"]: d
        for d in pakiet["proofs"]
        if d["proof_type"] == RODZAJE_DOWODOW[4]
    }
    assert vt["Pole 01"]["pass_status"] is True
    assert vt["Pole 03"]["pass_status"] is False
    assert "nieznany" in vt["Pole 03"]["summary_pl"]
    assert "petersen_coil" not in vt["Pole 01"]["summary_pl"]


def test_zapis_w_niepoprawnym_ksztalcie_oznacza_wszystkie_rodzaje() -> None:
    konfiguracja = _konfiguracja_pelna(
        bay_device_withstand={"Pole 02": {"device_id": "wstd_breaker_vacuum_15_25"}}
    )
    pakiet = _pakiet(konfiguracja, _model())
    assert pakiet["proofs"] == []
    assert {b["przyczyna_pl"] for b in pakiet["braki_danych"]} == {KONFIGURACJA_NIEPOPRAWNA}


def test_kilka_stacji_kazda_ma_wlasny_pakiet_w_kolejnosci_identyfikatorow() -> None:
    model = _model(druga_stacja=True)
    wiersze = [
        {
            "station_id": "st-B",
            "der_specs": [{"der_id": "gen/pv-b", "der_kind": "PV", "nominal_power_kw": 100}],
        },
        {"station_id": "st-A", **_konfiguracja_pelna()},
        {"station_id": "st-usunieta"},
    ]
    pakiety = [p.to_dict() for p in zloz_pakiety_projektu(wiersze, model)]
    assert [p["station_id"] for p in pakiety] == ["st-A", "st-B", "st-usunieta"]
    assert [p["station_nazwa"] for p in pakiety] == [
        "Stacja Łąkowa",
        "Stacja Polna",
        "Stacja spoza modelu",
    ]
    assert pakiety[0]["proof_count"] == 5
    # Stacja B: bilans z WLASNYCH zrodel i odbiorow (100 kW / 100 kW), nie z pierwszej stacji.
    eksport_b = pakiety[1]["proofs"][0]
    assert eksport_b["details"]["p_export_kw"] == 100.0
    assert eksport_b["details"]["p_import_kw"] == 100.0
    for pakiet in pakiety:
        dowody, braki = _rodzaje(pakiet)
        assert dowody | braki == set(RODZAJE_DOWODOW)


def test_stacja_modelu_bez_konfiguracji_nie_znika_z_pakietu() -> None:
    """Zakres pakietu = stacje modelu ∪ stacje z konfiguracja: stacja bez zapisanej
    konfiguracji dostaje piec jawnych brakow, a nie znika (i nie jest „bez zastrzezen")."""
    pakiety = [
        p.to_dict()
        for p in zloz_pakiety_projektu(
            [{"station_id": "st-A", **_konfiguracja_pelna()}], _model(druga_stacja=True)
        )
    ]
    assert [p["station_nazwa"] for p in pakiety] == ["Stacja Łąkowa", "Stacja Polna"]
    polna = pakiety[1]
    assert polna["proofs"] == []
    assert [b["przyczyna_pl"] for b in polna["braki_danych"]] == [BRAK_KONFIGURACJI] * 5
    assert {b["proof_type"] for b in polna["braki_danych"]} == set(RODZAJE_DOWODOW)


def test_determinizm_te_same_dane_te_same_bajty_i_identyfikatory() -> None:
    wiersze = [{"station_id": "st-A", **_konfiguracja_pelna()}]
    pierwszy = json.dumps([p.to_dict() for p in zloz_pakiety_projektu(wiersze, _model())])
    drugi = json.dumps([p.to_dict() for p in zloz_pakiety_projektu(wiersze, _model())])
    assert pierwszy == drugi
    # Zmiana danych zmienia identyfikator dowodu (UUID v5 z rodzaju i specyfikacji).
    inne = [{"station_id": "st-A", **_konfiguracja_pelna(bay_vts={"Pole 09": VT_19})}]
    trzeci = json.dumps([p.to_dict() for p in zloz_pakiety_projektu(inne, _model())])
    assert trzeci != pierwszy


def test_moce_odbiorow_stacja_bez_szyn_nie_ma_wpisu() -> None:
    model = _model(odbiory_mw=(1.5, 0.5))
    model.substations.append(
        Substation(ref_id="st-pusta", name="Stacja pusta", station_type="mv_lv", bus_refs=[])
    )
    assert moce_odbiorow_stacji_kw(model) == {"st-A": 2000.0}
    assert moce_odbiorow_stacji_kw(None) == {}
    # Odbior o mocy zero zostaje w sumie jako 0.0 (klasa: or-lancuch gubiacy zero).
    assert moce_odbiorow_stacji_kw(_model(odbiory_mw=(0.0,))) == {"st-A": 0.0}
