"""Skladanie pakietu dowodow rozszerzen stacji Z MODELU sieci (karty PROOFPACK-KONTRAKT,
JEDNA-SCIEZKA-EDYCJI).

Kazda dana pakietu pochodzi z elementu modelu, ktory ja niesie: tryby pracy magazynu
z profili zrodla, moc zrodla z `Generator.p_mw`, przelacznik zaczepow z
`Transformer.tap_changer.catalog_ref`, przekladnik napieciowy pola z `Measurement` VT
wskazujacego pole. Dawna zapisana konfiguracja stacji obok modelu jest skasowana.

ILOCZYN CECH, W KTORYM DEFEKT MOGL SIE SCHOWAC:
  rodzaj dowodu (4) × dana w modelu obecna / brak / pusta × nazwa elementu obecna / brak ×
  jedna stacja / kilka stacji × przynaleznosc elementu do stacji (wskazanie stacji / szyna
  stacji / cudza stacja) — plus przypadki elementu: zrodlo synchroniczne (nie
  przeksztaltnikowe), przekladnik pradowy w polu, przekladnik VT w polu cudzej stacji,
  przelacznik bez pozycji katalogu, typ VT spoza katalogu. Niezmiennik pakietu (przypiety na
  KAZDYM przypadku): kazdy z czterech rodzajow ma w pakiecie stacji dowod albo jawny brak
  z przyczyna — nigdy nie znika po cichu.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from application.proof_engine.packs.pakiet_rozszerzen_stacji import (
    BRAK_MAGAZYNU,
    BRAK_PRZEKLADNIKOW,
    BRAK_PRZELACZNIKOW,
    BRAK_ZRODEL,
    RODZAJE_DOWODOW,
    STACJA_BEZ_SZYN_SN,
    STACJA_SPOZA_MODELU,
    STACJA_SPOZA_MODELU_UZIEMIENIE,
    moce_odbiorow_stacji_kw,
    tryby_pracy_magazynu,
    uziemienie_sn_stacji,
    zdolnosci_przeksztaltnika,
    zloz_pakiet_stacji,
    zloz_pakiety_projektu,
)
from enm.models import (
    Bay,
    Bus,
    DlawikGaszacy,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    Measurement,
    MeasurementRating,
    Substation,
    TapChanger,
    Transformer,
    ZespolUziemiajacy,
)
from network_model.catalog.types import ConverterKind, ConverterType

MAGAZYN_GFM = "conv-bess-tesla-megapack-3p9mw-15kv"  # qmin<0<qmax, GRID_FORMING
MAGAZYN_GFL = "conv-bess-1mw-2mwh-15kv"  # qmin<0<qmax, tryb sterowania nieznany
VT_19 = "vt_20kv_fz_100_3_05_3p_siemens"
TRYBY = ["mode_voltage_support", "mode_island_backup"]


def _vt(ref_id: str, bay_ref: str | None, catalog_ref: str | None = VT_19, **pola: Any):
    return Measurement(
        ref_id=ref_id,
        name=f"Przekładnik {ref_id}",
        measurement_type=pola.pop("measurement_type", "VT"),
        bus_ref="bus-sn",
        bay_ref=bay_ref,
        rating=MeasurementRating(ratio_primary=15000 / 3**0.5, ratio_secondary=100 / 3**0.5),
        catalog_ref=catalog_ref,
        **pola,
    )


def _model(
    *,
    nazwa_magazynu: str = "Magazyn Łąkowa",
    katalog_magazynu: str = MAGAZYN_GFM,
    tryby_magazynu: list[str] | None = None,
    magazyn: bool = True,
    przelacznik: str | None = "tc_detc_snnn_5_25",
    sterowanie: str = "MANUAL",
    uhv_kv: float = 15.0,
    ulv_kv: float = 0.4,
    odbiory_mw: tuple[float, ...] = (1.0,),
    moc_pv_mw: float = 0.7,
    druga_stacja: bool = False,
    szyna_sn_w_stacji: bool = True,
    zespoly: tuple[ZespolUziemiajacy, ...] = (),
    przekladniki: tuple[Measurement, ...] | None = None,
) -> EnergyNetworkModel:
    # Sposób uziemienia punktu neutralnego SN przekładników czyta JEDYNA prawda modelu
    # (`enm.uziemienie_sekcji`): szyna SN stacji + zespoły uziemiające na niej (karta
    # UX-04/POLE-ZU-SKLADOWA-ZEROWA). Bez zespołu i bez uzwojenia z drogą zerową sieć jest
    # izolowana.
    stacje = [
        Substation(
            ref_id="st-A",
            name="Stacja Łąkowa",
            station_type="mv_lv",
            bus_refs=["bus-sn", "bus-a"] if szyna_sn_w_stacji else ["bus-a"],
        )
    ]
    szyny = [
        Bus(ref_id="bus-sn", name="Szyna SN", voltage_kv=uhv_kv),
        Bus(ref_id="bus-a", name="Szyna nN A", voltage_kv=ulv_kv),
    ]
    generatory = [
        Generator(
            ref_id="gen/pv-1",
            name="PV Łąkowa",
            bus_ref="bus-a",
            p_mw=moc_pv_mw,
            gen_type="pv_inverter",
        ),
    ]
    if magazyn:
        generatory.append(
            Generator(
                ref_id="gen/9f3c21aa/bess",
                name=nazwa_magazynu,
                bus_ref="bus-a",
                p_mw=0.5,
                gen_type="bess",
                catalog_ref=katalog_magazynu,
                materialized_params={
                    "profiles": {
                        "bess_operation_mode_refs": (
                            TRYBY if tryby_magazynu is None else tryby_magazynu
                        )
                    }
                },
            )
        )
    odbiory = [
        Load(ref_id=f"ld-{i}", name=f"Odbiór {i}", bus_ref="bus-a", p_mw=p, q_mvar=0.0)
        for i, p in enumerate(odbiory_mw)
    ]
    if druga_stacja:
        szyny.append(Bus(ref_id="bus-b", name="Szyna nN B", voltage_kv=0.4))
        stacje.append(
            Substation(
                ref_id="st-B",
                name="Stacja Polna",
                station_type="mv_lv",
                bus_refs=["bus-b"],
            )
        )
        generatory.append(
            Generator(
                ref_id="gen/pv-b",
                name="PV Polna",
                bus_ref="bus-b",
                p_mw=0.1,
                gen_type="pv_inverter",
            )
        )
        odbiory.append(Load(ref_id="ld-b", name="Odbiór B", bus_ref="bus-b", p_mw=0.1, q_mvar=0))
        generatory.append(Generator(ref_id="gen/pv-b", name="PV Polna", bus_ref="bus-b", p_mw=0.1))
        odbiory.append(Load(ref_id="ld-b", name="Odbiór B", bus_ref="bus-b", p_mw=0.1, q_mvar=0))
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
            None
            if przelacznik is None
            else TapChanger(
                regulation_type="DETC",
                control_mode=sterowanie,
                catalog_ref=przelacznik or None,
            )
        ),
    )
    pola = [
        Bay(
            ref_id="bay-01",
            name="Pole 01",
            bay_number="Pole 01",
            bay_role="FEEDER",
            substation_ref="st-A",
            bus_ref="bus-sn",
        )
    ]
    return EnergyNetworkModel(
        header=ENMHeader(name="Rozszerzenia stacji — skladanie"),
        buses=szyny,
        substations=stacje,
        transformers=[transformator],
        generators=generatory,
        loads=odbiory,
        bays=pola,
        measurements=list((_vt("vt-01", "bay-01"),) if przekladniki is None else przekladniki),
        zespoly_uziemiajace=list(zespoly),
    )


def _zespol(ref_id: str = "zu-1", bus_ref: str = "bus-sn", **pola: Any) -> ZespolUziemiajacy:
    return ZespolUziemiajacy(ref_id=ref_id, name=f"ZU {ref_id}", bus_ref=bus_ref, **pola)


def _rodzaje(pakiet: dict[str, Any]) -> tuple[set[str], set[str]]:
    return (
        {d["proof_type"] for d in pakiet["proofs"]},
        {b["proof_type"] for b in pakiet["braki_danych"]},
    )


def _pakiet(model: EnergyNetworkModel | None, station_id: str = "st-A") -> dict[str, Any]:
    pakiet = zloz_pakiet_stacji(station_id, model).to_dict()
    dowody, braki = _rodzaje(pakiet)
    # NIEZMIENNIK: kazdy rodzaj ma dowod albo jawny brak — nic nie znika po cichu.
    assert dowody | braki == set(RODZAJE_DOWODOW), pakiet
    for brak in pakiet["braki_danych"]:
        assert brak["przyczyna_pl"] and brak["rodzaj_pl"]
    return pakiet


def _przyczyny(pakiet: dict[str, Any]) -> list[str]:
    return [b["przyczyna_pl"] for b in pakiet["braki_danych"]]


def _dowod(pakiet: dict[str, Any], indeks: int) -> dict[str, Any]:
    return next(d for d in pakiet["proofs"] if d["proof_type"] == RODZAJE_DOWODOW[indeks])


def _teksty(pakiet: dict[str, Any]) -> list[str]:
    teksty = [pakiet["station_nazwa"]]
    for dowod in pakiet["proofs"]:
        teksty.append(dowod["summary_pl"])
        teksty.extend(dowod["details"].get("issues", []))
    teksty.extend(b["przyczyna_pl"] for b in pakiet["braki_danych"])
    return teksty


def test_pelny_model_daje_cztery_rodzaje_z_nazwami_z_modelu() -> None:
    pakiet = _pakiet(_model())
    assert pakiet["braki_danych"] == []
    assert pakiet["proof_count"] == 4
    assert pakiet["station_nazwa"] == "Stacja Łąkowa"
    teksty = " ".join(_teksty(pakiet))
    assert "Magazyn Łąkowa" in teksty
    assert "Transformator T1 Łąkowa" in teksty
    for identyfikator in ("gen/9f3c21aa/bess", "tr/5b0f7d1e", "st-A", "bay-01", VT_19):
        assert identyfikator not in teksty
    # Arytmetyka bilansu w backendzie, moce z MODELU: 500 + 700 kW zrodel, 1000 kW odbiorow.
    eksport = _dowod(pakiet, 2)
    assert eksport["details"]["p_export_kw"] == 1200.0
    assert eksport["details"]["p_import_kw"] == 1000.0
    assert eksport["details"]["status"] == "normal_export"
    # Karta GFM z granicami Q po obu stronach zera: oba tryby zgodne.
    assert _dowod(pakiet, 0)["pass_status"] is True
    assert _dowod(pakiet, 3)["details"]["bay_designation"] == "Pole 01"
    assert pakiet["all_pass"] is True


@pytest.mark.parametrize(
    ("zmiana", "rodzaj", "przyczyna"),
    [
        ({"magazyn": False}, 0, BRAK_MAGAZYNU),
        ({"przelacznik": None}, 1, BRAK_PRZELACZNIKOW),
        # Przełącznik bez pozycji katalogu (np. sam tryb regulacji) nie jest planem zaczepów.
        ({"przelacznik": ""}, 1, BRAK_PRZELACZNIKOW),
        ({"przekladniki": ()}, 3, BRAK_PRZEKLADNIKOW),
        # Przekładnik prądowy w polu nie jest przekładnikiem napięciowym.
        (
            {"przekladniki": (_vt("ct-01", "bay-01", measurement_type="CT"),)},
            3,
            BRAK_PRZEKLADNIKOW,
        ),
        # Przekładnik napięciowy bez pozycji katalogu nie ma współczynnika do oceny.
        (
            {"przekladniki": (_vt("vt-01", "bay-01", catalog_ref=None),)},
            3,
            BRAK_PRZEKLADNIKOW,
        ),
        # Przekładnik bez wskazania pola nie należy do pola stacji.
        ({"przekladniki": (_vt("vt-01", None),)}, 3, BRAK_PRZEKLADNIKOW),
    ],
    ids=[
        "bess_brak_magazynu",
        "zaczepy_brak_przelacznika",
        "zaczepy_przelacznik_bez_katalogu",
        "przekladniki_brak",
        "przekladniki_tylko_pradowy",
        "przekladniki_vt_bez_katalogu",
        "przekladniki_vt_bez_pola",
    ],
)
def test_rodzaj_bez_danych_w_modelu_jest_jawnym_brakiem_a_pozostale_zostaja(
    zmiana: dict[str, Any], rodzaj: int, przyczyna: str
) -> None:
    pakiet = _pakiet(_model(**zmiana))
    dowody, braki = _rodzaje(pakiet)
    assert RODZAJE_DOWODOW[rodzaj] in braki and RODZAJE_DOWODOW[rodzaj] not in dowody
    assert przyczyna in _przyczyny(pakiet)
    # Brak danych nie jest zgodnoscia, ale tez nie jest dowodem niezaliczonym.
    assert pakiet["fail_count"] == 0


def test_stacja_bez_zrodel_przeksztaltnikowych_to_brak_bilansu_i_magazynu() -> None:
    model = _model(magazyn=False)
    # Źródło synchroniczne nie jest źródłem przekształtnikowym stacji (jedna lista typów
    # `GEN_TYPES_PRZEKSZTALTNIKOWE`) — tak samo dla bilansu i trybów pracy.
    model.generators[0] = model.generators[0].model_copy(update={"gen_type": "synchronous"})
    pakiet = _pakiet(model)
    assert BRAK_ZRODEL in _przyczyny(pakiet)
    assert BRAK_MAGAZYNU in _przyczyny(pakiet)


def test_magazyn_bez_trybow_w_modelu_to_brak_pozycji() -> None:
    pakiet = _pakiet(_model(tryby_magazynu=[]))
    assert "Magazyn energii Magazyn Łąkowa: nie wybrano trybów pracy." in _przyczyny(pakiet)
    assert RODZAJE_DOWODOW[0] not in _rodzaje(pakiet)[0]


@pytest.mark.parametrize(
    ("profile", "oczekiwane"),
    [
        ({"profiles": {"bess_operation_mode_refs": ["a", "b", "a"]}}, ("a", "b")),
        ({"profiles": {"bess_operation_mode_refs": ["", "  ", 7, "c"]}}, ("c",)),
        ({"profiles": {"bess_operation_mode_refs": "a"}}, ()),
        ({"profiles": "zly-ksztalt"}, ()),
        (None, ()),
    ],
    ids=[
        "powtorzenia",
        "puste_i_nie_lancuchy",
        "lancuch_zamiast_listy",
        "zly_ksztalt",
        "brak",
    ],
)
def test_tryby_pracy_magazynu_z_profili_modelu(
    profile: dict[str, Any] | None, oczekiwane: tuple[str, ...]
) -> None:
    generator = Generator(
        ref_id="g",
        name="M",
        bus_ref="b",
        p_mw=1.0,
        gen_type="bess",
        materialized_params=profile,
    )
    assert tryby_pracy_magazynu(generator) == oczekiwane


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
    bess = _dowod(_pakiet(_model(katalog_magazynu=katalog)), 0)
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
    ("uhv", "ulv", "sterowanie", "przelacznik", "zgodny"),
    [
        (15.0, 0.4, "MANUAL", "tc_detc_snnn_5_25", True),
        (20.0, 0.4, "MANUAL", "tc_detc_snnn_5_25", True),
        # Model deklaruje sterowanie automatyczne — DETC bez AVR nie wystarcza.
        (15.0, 0.4, "AUTOMATIC", "tc_detc_snnn_5_25", False),
        (15.0, 0.4, "AUTOMATIC", "tc_oltc_snnn_9_15", True),
        (110.0, 15.0, "AUTOMATIC", "tc_oltc_110sn_19_125", True),
        # Klasa z napiec modelu, nie „pierwsza pozycja katalogu".
        (110.0, 20.0, "MANUAL", "tc_detc_snnn_5_25", False),
        (15.0, 0.4, "MANUAL", "tc_z_innego_swiata", False),
    ],
)
def test_plan_zaczepow_klasa_i_avr_z_modelu(
    uhv: float, ulv: float, sterowanie: str, przelacznik: str, zgodny: bool
) -> None:
    pakiet = _pakiet(_model(uhv_kv=uhv, ulv_kv=ulv, sterowanie=sterowanie, przelacznik=przelacznik))
    dowod = _dowod(pakiet, 1)
    assert dowod["pass_status"] is zgodny
    assert dowod["details"]["requires_avr"] is (sterowanie == "AUTOMATIC")
    assert "tr/5b0f7d1e" not in " ".join(_teksty(pakiet))


def test_transformator_spoza_klas_to_brak_z_napieciami_modelu() -> None:
    pakiet = _pakiet(_model(uhv_kv=110.0, ulv_kv=30.0))
    assert any("Transformator T1 Łąkowa (110/30 kV)" in p for p in _przyczyny(pakiet))


@pytest.mark.parametrize("moc", [0.0, -5.0], ids=["zero", "ujemna"])
def test_zrodlo_bez_dodatniej_mocy_blokuje_bilans(moc: float) -> None:
    pakiet = _pakiet(_model(moc_pv_mw=moc))
    assert RODZAJE_DOWODOW[2] not in _rodzaje(pakiet)[0]
    assert (
        "Źródło PV Łąkowa nie ma w modelu dodatniej mocy czynnej — bilans eksportu byłby "
        "zaniżony." in _przyczyny(pakiet)
    )


def test_stacja_bez_odbiorow_to_zero_importu_a_stacja_spoza_modelu_to_brak() -> None:
    # Stacja w modelu bez odbiorow: import 0 jest wiedza — caly eksport do OSD, stosunek
    # nieokreslony (None, nie nieskonczonosc wypisana w tekscie).
    eksport = _dowod(_pakiet(_model(odbiory_mw=())), 2)
    assert eksport["details"]["p_import_kw"] == 0.0
    assert eksport["details"]["export_to_import_ratio"] is None
    assert eksport["details"]["status"] == "requires_ramp_down"
    assert "inf" not in eksport["summary_pl"]
    # Stacja spoza modelu (i projekt bez modelu): każdy rodzaj jawnym brakiem.
    for model in (None, _model()):
        pakiet = _pakiet(model, station_id="st-usunieta")
        assert _przyczyny(pakiet) == [STACJA_SPOZA_MODELU] * 4
        assert pakiet["station_nazwa"] == "Stacja spoza modelu"


def test_element_bez_nazwy_w_modelu_nazwany_rodzajem_nigdy_identyfikatorem() -> None:
    # Nazwa pusta po obcieciu spacji to brak nazwy (jeden predykat `network_model.nazwy`).
    bess = _dowod(_pakiet(_model(nazwa_magazynu="   ")), 0)
    assert "Generator bez nazwy" in bess["summary_pl"]
    assert "gen/9f3c21aa/bess" not in bess["summary_pl"]
    assert bess["details"]["der_id"] == "gen/9f3c21aa/bess"


def test_przekladnik_spoza_katalogu_daje_dowod_niezaliczony_z_powodem() -> None:
    model = _model(przekladniki=(_vt("vt-01", "bay-01"), _vt("vt-03", "bay-03", "vt_widmo")))
    model.bays.append(
        Bay(
            ref_id="bay-03",
            name="Pole 03",
            bay_number="Pole 03",
            bay_role="FEEDER",
            substation_ref="st-A",
            bus_ref="bus-sn",
        )
    )
    pakiet = _pakiet(model)
    vt = {
        d["details"]["bay_designation"]: d
        for d in pakiet["proofs"]
        if d["proof_type"] == RODZAJE_DOWODOW[3]
    }
    assert vt["Pole 01"]["pass_status"] is True
    assert vt["Pole 03"]["pass_status"] is False
    assert "nieznany" in vt["Pole 03"]["summary_pl"]
    assert "petersen_coil" not in vt["Pole 01"]["summary_pl"]


def test_przynaleznosc_elementow_do_stacji_wskazanie_szyna_i_cudza_stacja() -> None:
    """Źródło wskazujące stację należy do niej także na cudzej szynie; przekładnik w polu
    cudzej stacji nie należy do tej stacji."""
    model = _model(druga_stacja=True)
    model.generators.append(
        Generator(
            ref_id="gen/pv-wskazane",
            name="PV wskazane",
            bus_ref="bus-b",
            p_mw=0.2,
            gen_type="pv_inverter",
            station_ref="st-A",
        )
    )
    model.bays.append(
        Bay(
            ref_id="bay-b1",
            name="Pole B1",
            bay_number="B1",
            bay_role="FEEDER",
            substation_ref="st-B",
            bus_ref="bus-b",
        )
    )
    model.measurements.append(_vt("vt-b1", "bay-b1"))
    pakiet_a = _pakiet(model)
    assert _dowod(pakiet_a, 2)["details"]["p_export_kw"] == 1400.0
    przekladniki_a = [
        d["details"]["bay_designation"]
        for d in pakiet_a["proofs"]
        if d["proof_type"] == RODZAJE_DOWODOW[3]
    ]
    assert przekladniki_a == ["Pole 01"]


def test_kilka_stacji_kazda_ma_wlasny_pakiet_w_kolejnosci_identyfikatorow() -> None:
    pakiety = [p.to_dict() for p in zloz_pakiety_projektu(_model(druga_stacja=True))]
    assert [p["station_id"] for p in pakiety] == ["st-A", "st-B"]
    assert [p["station_nazwa"] for p in pakiety] == ["Stacja Łąkowa", "Stacja Polna"]
    assert pakiety[0]["proof_count"] == 4
    # Stacja B: bilans z WLASNYCH zrodel i odbiorow (100 kW / 100 kW), nie z pierwszej stacji.
    eksport_b = next(d for d in pakiety[1]["proofs"] if d["proof_type"] == RODZAJE_DOWODOW[2])
    assert eksport_b["details"]["p_export_kw"] == 100.0
    assert eksport_b["details"]["p_import_kw"] == 100.0
    # Stacja B bez magazynu, przełącznika i przekładników: trzy jawne braki, nie zniknięcie.
    assert {b["proof_type"] for b in pakiety[1]["braki_danych"]} == {
        RODZAJE_DOWODOW[0],
        RODZAJE_DOWODOW[1],
        RODZAJE_DOWODOW[3],
    }
    for pakiet in pakiety:
        dowody, braki = _rodzaje(pakiet)
        assert dowody | braki == set(RODZAJE_DOWODOW)
    assert zloz_pakiety_projektu(None) == []


def test_determinizm_te_same_dane_te_same_bajty_i_identyfikatory() -> None:
    pierwszy = json.dumps([p.to_dict() for p in zloz_pakiety_projektu(_model())])
    drugi = json.dumps([p.to_dict() for p in zloz_pakiety_projektu(_model())])
    assert pierwszy == drugi
    # Zmiana danych modelu zmienia identyfikator dowodu (UUID v5 z rodzaju i specyfikacji).
    trzeci = json.dumps([p.to_dict() for p in zloz_pakiety_projektu(_model(moc_pv_mw=0.9))])
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


# =============================================================================
# Przekładniki × sposób uziemienia SN z JEDYNEJ prawdy modelu (karta
# UX-04/POLE-ZU-SKLADOWA-ZEROWA). Iloczyn: wariant {izolowany, dławik, dławik+AWSC,
# rezystor, bezpośrednie, zespół bez elementu} × sekcje {jedna, dwie różnie uziemione z polem
# przypisanym / nieprzypisanym} × stacja {z szyną SN, bez szyny SN, spoza modelu}.
# =============================================================================


def _dowod_vt(pakiet: dict[str, Any]) -> dict[str, Any]:
    return next(d for d in pakiet["proofs"] if d["proof_type"] == RODZAJE_DOWODOW[3])


@pytest.mark.parametrize(
    ("zespoly", "typ"),
    [
        ((), "isolated"),
        ((_zespol(dlawik=DlawikGaszacy(i_nastawy_a=100.0)),), "petersen_coil"),
        # Z.13: w spoczynku sieć skompensowana, po załączeniu AWSC z rezystorem równolegle —
        # oba stany wymagają F_v = 1,9; dowód ocenia stan najbardziej wymagający.
        (
            (
                _zespol(
                    dlawik=DlawikGaszacy(
                        i_nastawy_a=100.0, awsc={"i_wymuszany_a": 30.0}  # type: ignore[arg-type]
                    )
                ),
            ),
            "petersen_coil",
        ),
        ((_zespol(rezystor={"r_ohm": 43.3}),), "resistor_grounded"),
        (
            (
                _zespol(
                    dlawik=DlawikGaszacy(i_nastawy_a=100.0),
                    rezystor={"r_ohm": 43.3},  # type: ignore[arg-type]
                ),
            ),
            "resistor_grounded",
        ),
        ((_zespol(uziemienie_bezposrednie=True),), "directly_grounded"),
    ],
    ids=["izolowany", "dlawik", "dlawik_awsc", "rezystor", "dlawik_rezystor", "bezposrednie"],
)
def test_dowod_przekladnika_czyta_wariant_uziemienia_z_modelu(
    zespoly: tuple[ZespolUziemiajacy, ...], typ: str
) -> None:
    pakiet = _pakiet(_model(zespoly=zespoly))
    assert _dowod_vt(pakiet)["details"]["grounding_type"] == typ


def test_zespol_za_otwartym_polem_nie_uziemia_sieci_dowod_widzi_siec_izolowana() -> None:
    # ZU na zacisku pola za otwartym łącznikiem nie leży w sieci szyny SN (topologia).
    model = _model(zespoly=(_zespol(bus_ref="bus-zu", dlawik=DlawikGaszacy(i_nastawy_a=50.0)),))
    model.buses.append(Bus(ref_id="bus-zu", name="Zacisk pola ZU", voltage_kv=15.0))
    pakiet = _pakiet(model)
    assert _dowod_vt(pakiet)["details"]["grounding_type"] == "isolated"


def test_zespol_bez_elementu_punktu_neutralnego_to_brak_nazwany() -> None:
    pakiet = _pakiet(_model(zespoly=(_zespol(),)))
    przyczyny = [b["przyczyna_pl"] for b in pakiet["braki_danych"]]
    assert any(
        "Sposób uziemienia punktu neutralnego sieci SN jest nieokreślony" in p
        and "brak elementu w punkcie neutralnym" in p
        for p in przyczyny
    ), przyczyny
    assert RODZAJE_DOWODOW[3] not in _rodzaje(pakiet)[0]


def test_stacja_bez_szyny_sn_to_brak_nazwany_nie_wariant_domyslny() -> None:
    # Stacja spoza modelu (i projekt bez modelu) — `test_stacja_bez_odbiorow_...` oraz odczyt
    # konfiguratora `test_uziemienie_sn_stacji_dla_konfiguratora_...`.
    pakiet = _pakiet(_model(szyna_sn_w_stacji=False))
    assert STACJA_BEZ_SZYN_SN in [b["przyczyna_pl"] for b in pakiet["braki_danych"]]
    assert RODZAJE_DOWODOW[3] not in _rodzaje(pakiet)[0]


def _model_dwie_sekcje(*, szyna_pola: str) -> EnergyNetworkModel:
    """Sekcja 1 (``bus-sn``) z rezystorem, sekcja 2 (``bus-sn2``, sprzęgło otwarte — brak
    gałęzi) izolowana; pole z przekładnikiem napięciowym na szynie ``szyna_pola``."""
    model = _model(zespoly=(_zespol(rezystor={"r_ohm": 43.3}),))  # type: ignore[arg-type]
    model.buses.append(Bus(ref_id="bus-sn2", name="Szyna SN sekcja 2", voltage_kv=15.0))
    model.substations[0].bus_refs.append("bus-sn2")
    model.bays[0] = model.bays[0].model_copy(update={"bus_ref": szyna_pola})
    return model


def test_dwie_sekcje_roznie_uziemione_pole_w_sekcji_czyta_swoja_sekcje() -> None:
    pakiet = _pakiet(_model_dwie_sekcje(szyna_pola="bus-sn2"))
    assert _dowod_vt(pakiet)["details"]["grounding_type"] == "isolated"
    pakiet = _pakiet(_model_dwie_sekcje(szyna_pola="bus-sn"))
    assert _dowod_vt(pakiet)["details"]["grounding_type"] == "resistor_grounded"


def test_dwie_sekcje_roznie_uziemione_pole_poza_sekcjami_sn_to_brak_nazwany() -> None:
    # Pole na szynie spoza sieci SN stacji nie wskazuje sekcji — typ stacji niejednoznaczny.
    pakiet = _pakiet(_model_dwie_sekcje(szyna_pola="bus-a"))
    przyczyny = [b["przyczyna_pl"] for b in pakiet["braki_danych"]]
    assert any("różny sposób uziemienia" in p and "Pole 01" in p for p in przyczyny), przyczyny


def test_uziemienie_sn_stacji_dla_konfiguratora_ta_sama_regula_co_dowod() -> None:
    """Odczyt konfiguratora (`_uziemienie-sn`) i dowód przekładnika — jedna funkcja pola."""
    model = _model_dwie_sekcje(szyna_pola="bus-sn2")
    odczyt = uziemienie_sn_stacji(model, "st-A", ["Pole 01", "Pole 01", "Pole X"])
    assert [p["oznaczenie"] for p in odczyt["pola"]] == ["Pole 01", "Pole X"]
    pole_01, pole_x = odczyt["pola"]
    assert pole_01["typ_punktu_neutralnego"] == "isolated"
    assert pole_01["przyczyna_braku"] is None
    # Pole spoza modelu w stacji o różnie uziemionych sekcjach: przyczyna, nie typ.
    assert pole_x["typ_punktu_neutralnego"] is None and pole_x["przyczyna_braku"]
    assert len(odczyt["sekcje"]) == 2 and odczyt["przyczyna_braku"] is None
    brak = uziemienie_sn_stacji(None, "st-A", ["Pole 01"])
    assert brak["przyczyna_braku"] == STACJA_SPOZA_MODELU_UZIEMIENIE
    assert brak["pola"][0]["przyczyna_braku"] == STACJA_SPOZA_MODELU_UZIEMIENIE
