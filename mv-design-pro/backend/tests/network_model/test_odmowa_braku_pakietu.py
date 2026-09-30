"""Jedna nazwana odmowa braku pakietu danych właściciela (karta OD-17a, decyzja OD-17).

CO TO PRZYPINA. Każdy konsument danych dostarczanych przez właściciela w pakietach P1 (wykaz
certyfikatów PTPiREE), P2 (karty producentów) i P3 (pakiety wymagań operatorów) przy ich braku
kończy się JEDNĄ nazwaną odmową ``OdmowaBrakuPakietuDanych`` (albo jej rekordem
``RekordBrakuPakietu``) — nigdy pustym wynikiem, ``None`` ani własnym komunikatem.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA): {brak P1, brak P2, brak P3} × {każdy konsument
z inwentarza karty}:

* P1 × {gotowość modelu (``execute_domain_operation``), most zgodności NC RfG, ocena wymagań
  NC RfG, weryfikacje typu dla dokumentu studium, wiersze dowodu sekcji dokumentów};
* P2 × {wejście V12.6 harmonicznych + jego gotowość, koordynacja izolacji (gotowość + bieg),
  materializacja modelu dynamicznego magazynu + stan dynamiki w gotowości};
* P3 × {raport zgodności referencyjnej przypadku dla KAŻDEGO operatora listy produktu}.

Każdy konsument jest sprawdzany tym samym predykatem ``_odmowa_poprawna``: kod w polu z prefiksem
rodzaju, pakiet zgodny z rodzajem, zdanie po polsku z NAZWĄ elementu z modelu, bez kodu
maszynowego w zdaniu, status z rodziny „brak danych" z niepustym wyjaśnieniem.

PREDYKATY PARAMI: ten sam brak rozpoznany jednakowo w gotowości i w wykonaniu — tabliczka
certyfikatu (gotowość ↔ most NC RfG) po iloczynie wariantów tabliczki, widmo (gotowość V12.6 ↔
wejście biegu), poziom izolacji (warunek gotowości ↔ zapis biegu), magazyn (stan dynamiki ↔
wyjątek materializacji). API (422 z polem ``kod``) — ``tests/api/test_odmowa_braku_pakietu_api``.
"""

from __future__ import annotations

import copy
from types import SimpleNamespace
from typing import Any

import pytest
from application.analyses.sekcja_zgodnosci_ncrfg import wiersze_dowodu
from application.analyses.v126_gotowosc import ocen_gotowosc_v126
from application.ncrfg_compliance import (
    build_ncrfg_module_inputs_from_enm,
    weryfikacje_certyfikatow_typu,
    zgodnosc_ncrfg_przypadku,
)
from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from enm.dynamika_z_katalogu import (
    KOD_MAGAZYN_DANE,
    BladMaterializacjiDynamiki,
    materializuj_dynamike,
    stan_dynamiki_generatorow,
)
from enm.models import EnergyNetworkModel, ENMHeader, Generator
from enm.odmowy_pakietow_danych import odmowa_braku_certyfikatu
from network_model.odmowa_danych import OdmowaNazwana
from network_model.odmowa_pakietu import (
    PAKIET_RODZAJU,
    OdmowaBrakuPakietuDanych,
    RekordBrakuPakietu,
    brak_certyfikatu_wipwc,
    brak_karty_producenta,
    brak_pakietu_osd,
)
from reference_engine import evaluate_enm
from reference_engine.registry import (
    REFERENCE_PACK_REGISTRY,
    pack_id_operatora,
    pakiet_osd_operatora,
    wymagaj_pakietu,
)
from solver_input.v126_contracts import (
    V126AnalysisType,
    braki_poziomu_izolacji,
    build_v126_input_from_enm,
    pominiete_zrodla_v126,
)

from tests.cgmes.golden_enm import build_golden_enm
from tests.enm.test_certyfikat_ptpiree_gotowosc import (
    KOD_NIEPOWIAZANY,
    _gotowosc_z_der,
    migawka_ze_stacja,  # noqa: F401 — fikstura modułowa (produkcyjna migawka ze stacją)
)

_STATUSY_BRAKU = {"NIE_OCENIONO", "BRAK_PODSTAWY", "BRAK_DOWODU"}
_PREFIKS_PAKIETU = {
    "P1": "BRAK_CERTYFIKATU_WIPWC:",
    "P2": "BRAK_KARTY_PRODUCENTA:",
    "P3": "BRAK_PAKIETU_OSD:",
}


def _odmowa_poprawna(
    rekord: RekordBrakuPakietu | dict[str, Any], *, pakiet: str, nazwa: str
) -> None:
    """JEDEN predykat „nazwana odmowa braku pakietu" dla każdego konsumenta."""
    r = (
        rekord
        if isinstance(rekord, RekordBrakuPakietu)
        else RekordBrakuPakietu.model_validate(rekord)
    )
    assert r.pakiet == pakiet
    assert r.kod.startswith(_PREFIKS_PAKIETU[pakiet]), r.kod
    assert r.kod == f"{r.rodzaj}:{r.identyfikator}"
    assert PAKIET_RODZAJU[r.rodzaj] == pakiet
    assert r.nazwa_elementu == nazwa
    assert f"„{nazwa}”" in r.komunikat_pl, "zdanie nazywa element nazwą z modelu"
    assert (
        r.kod not in r.komunikat_pl and r.rodzaj not in r.komunikat_pl
    ), "kod w polu, nie w zdaniu"
    assert "właściciela systemu" in r.komunikat_pl, "zdanie mówi, który pakiet dostarcza dane"
    assert r.status_maszynowy in _STATUSY_BRAKU, "brak danych ≠ spełnia"
    assert r.wyjasnienie.zdanie_pl == r.komunikat_pl
    assert r.wyjasnienie.czego_brakuje and r.wyjasnienie.przyczyna_pl


# ---------------------------------------------------------------------------
# Typ i fabryki
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("odmowa", "pakiet", "status"),
    [
        (
            brak_certyfikatu_wipwc(
                "SUN2000-215KTL-H3",
                nazwa_elementu="Farma PV",
                opis_typu_pl="typ przekształtnika „SUN2000”",
            ),
            "P1",
            "BRAK_DOWODU",
        ),
        (
            brak_karty_producenta(
                [("soc_min", "minimalny stan naładowania")],
                nazwa_elementu="Farma PV",
                rodzaj_elementu_pl="Magazyn",
                skutek_pl="Modelu nie zbudowano.",
            ),
            "P2",
            "NIE_OCENIONO",
        ),
        (
            brak_pakietu_osd(
                "energa", nazwa_operatora_pl="Energa Operator", nazwa_elementu="Farma PV"
            ),
            "P3",
            "BRAK_PODSTAWY",
        ),
    ],
)
def test_fabryka_daje_jeden_typ_z_kodem_w_polu(
    odmowa: OdmowaBrakuPakietuDanych, pakiet: str, status: str
) -> None:
    assert isinstance(odmowa, OdmowaNazwana), "handler API daje 422 z polami kod/dane"
    assert odmowa.dane["pakiet"] == pakiet
    assert odmowa.dane["nazwa_elementu"] == "Farma PV"
    assert odmowa.status == status
    rekord = odmowa.rekord()
    _odmowa_poprawna(rekord, pakiet=pakiet, nazwa="Farma PV")
    assert rekord.kod == odmowa.kod and rekord.komunikat_pl == str(odmowa)


def test_kod_wielu_pol_karty_w_kolejnosci_konsumenta_i_bez_dwukropka_w_identyfikatorze() -> None:
    odmowa = brak_karty_producenta(
        [("b:x", "pole b"), ("a", "pole a")],
        nazwa_elementu="M1",
        rodzaj_elementu_pl="Magazyn",
        skutek_pl="Skutek.",
    )
    assert odmowa.kod == "BRAK_KARTY_PRODUCENTA:b_x,a"
    assert "pole b i pole a" in odmowa.komunikat


def test_odmowa_bez_nazwy_elementu_albo_pol_jest_bledem_programu() -> None:
    with pytest.raises(ValueError):
        brak_pakietu_osd("energa", nazwa_operatora_pl="Energa Operator", nazwa_elementu="  ")
    with pytest.raises(ValueError):
        brak_karty_producenta([], nazwa_elementu="M", rodzaj_elementu_pl="M", skutek_pl="S.")


# ---------------------------------------------------------------------------
# P1 × konsumenci + predykaty parami (gotowość ↔ most NC RfG)
# ---------------------------------------------------------------------------

_REF_REJESTRU = "ptpiree-wipwc-1.3-001"

#: Iloczyn wariantów tabliczki: (tabliczka, czy brak certyfikatu = brak danych P1).
_WARIANTY_TABLICZKI: list[tuple[str, dict[str, Any] | None, bool]] = [
    ("bez_tabliczki", None, True),
    ("pusta", {}, True),
    ("niepowiazany", {"ptpiree_status": "NIEPOWIAZANY"}, True),
    (
        "niepowiazany_z_pozycja",
        {"ptpiree_status": "NIEPOWIAZANY", "catalog_item_id": "conv-x"},
        True,
    ),
    (
        "niepowiazany_z_modelem",
        {"ptpiree_status": "NIEPOWIAZANY", "model": "SUN2000-215KTL-H3"},
        True,
    ),
    ("referencja_pusta", {"ptpiree_certificate_ref": "   "}, True),
    (
        "powiazany_z_referencja",
        {"ptpiree_status": "POWIAZANY", "ptpiree_certificate_ref": _REF_REJESTRU},
        False,
    ),
    ("sama_referencja", {"ptpiree_certificate_ref": _REF_REJESTRU}, False),
    ("powiazany_bez_referencji", {"ptpiree_status": "POWIAZANY"}, False),
]


def _model_der(
    tabliczka: dict[str, Any] | None, *, gen_type: str = "pv_inverter"
) -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="od17a").model_dump(),
            "buses": [{"ref_id": "BUS_SN", "name": "Szyna SN", "voltage_kv": 15.0}],
            "generators": [
                {
                    "ref_id": "DER1",
                    "name": "Farma PV Zachód",
                    "bus_ref": "BUS_SN",
                    "p_mw": 2.0,
                    "gen_type": gen_type,
                    "materialized_params": tabliczka,
                }
            ],
        }
    )


@pytest.mark.parametrize(
    ("nazwa", "tabliczka", "brak"), _WARIANTY_TABLICZKI, ids=[w[0] for w in _WARIANTY_TABLICZKI]
)
def test_p1_most_nc_rfg_i_budowa_odmowy_z_jednego_predykatu(
    nazwa: str, tabliczka: dict[str, Any] | None, brak: bool
) -> None:
    enm = _model_der(tabliczka)
    wejscia = build_ncrfg_module_inputs_from_enm(enm, operator_id="enea")
    odmowa = odmowa_braku_certyfikatu(enm.generators[0])
    assert (odmowa is not None) is brak
    assert ("DER1" in wejscia.certyfikaty_brakujace) is brak, "most i budowa odmowy parami"
    if brak:
        assert odmowa is not None
        _odmowa_poprawna(
            wejscia.certyfikaty_brakujace["DER1"], pakiet="P1", nazwa="Farma PV Zachód"
        )
        assert wejscia.certyfikaty_brakujace["DER1"] == odmowa.rekord()
        # Nigdy pusty wynik: DER bez certyfikatu nie znika z żadnej listy mostu.
        assert "DER1" not in wejscia.certyfikaty
        assert all(o.der_ref != "DER1" for o in wejscia.certyfikaty_odrzucone)
    else:
        # Tabliczka wskazuje certyfikat: dowód albo odrzucenie z powodem — nie brak danych.
        assert "DER1" in wejscia.certyfikaty or any(
            o.der_ref == "DER1" for o in wejscia.certyfikaty_odrzucone
        )


def test_p1_identyfikator_kodu_model_potem_pozycja_potem_typ_nieprzypisany() -> None:
    kody = {
        n: odmowa_braku_certyfikatu(_model_der(t).generators[0])
        for n, t, _ in _WARIANTY_TABLICZKI[:5]
    }
    assert kody["niepowiazany_z_modelem"].kod == "BRAK_CERTYFIKATU_WIPWC:SUN2000-215KTL-H3"
    assert kody["niepowiazany_z_pozycja"].kod == "BRAK_CERTYFIKATU_WIPWC:conv-x"
    assert kody["niepowiazany"].kod == "BRAK_CERTYFIKATU_WIPWC:typ_nieprzypisany"
    assert (
        "conv-x" not in kody["niepowiazany_z_pozycja"].komunikat
    ), "pozycja katalogu nazwą, nie id"


@pytest.mark.parametrize(
    ("nazwa", "tabliczka", "brak"), _WARIANTY_TABLICZKI, ids=[w[0] for w in _WARIANTY_TABLICZKI]
)
def test_p1_gotowosc_modelu_parami_z_mostem(
    migawka_ze_stacja: dict[str, Any],  # noqa: F811 — fikstura modułowa
    nazwa: str,
    tabliczka: dict[str, Any] | None,
    brak: bool,
) -> None:
    """Gotowość (droga `execute_domain_operation`) rozpoznaje brak dokładnie wtedy, gdy most."""
    wynik = _gotowosc_z_der(migawka_ze_stacja, tabliczka=copy.deepcopy(tabliczka))
    ostrzezenia = [o for o in wynik["readiness"]["warnings"] if o.get("code") == KOD_NIEPOWIAZANY]
    # Ostrzeżenie „niepowiązany" niesie każda tabliczka bez statusu powiązania; odmowę braku
    # pakietu — wyłącznie brak danych (ten sam predykat co most). Tabliczka z referencją bez
    # statusu to niespójność (most ją odrzuca z powodem), nie brak danych P1.
    oczekiwane_ostrzezenie = (tabliczka or {}).get("ptpiree_status") != "POWIAZANY"
    assert bool(ostrzezenia) is oczekiwane_ostrzezenie
    if brak:
        (ostrzezenie,) = ostrzezenia
        _odmowa_poprawna(ostrzezenie["odmowa_pakietu"], pakiet="P1", nazwa="Falownik testowy")
        assert ostrzezenie["message_pl"] == ostrzezenie["odmowa_pakietu"]["komunikat_pl"]
    else:
        assert all("odmowa_pakietu" not in o for o in ostrzezenia)


def test_p1_ocena_wymagan_nc_rfg_nazywa_brak_z_pakietem() -> None:
    enm = _model_der({"ptpiree_status": "NIEPOWIAZANY"})
    zgodnosc = zgodnosc_ncrfg_przypadku(enm, operator_id="enea", case_id="c")
    assert zgodnosc.bieg is not None
    rekord = zgodnosc.certyfikaty_brakujace["DER1"]
    _odmowa_poprawna(rekord, pakiet="P1", nazwa="Farma PV Zachód")
    braki = [
        b
        for w in zgodnosc.bieg.ocena_wymagan[0].wymagania
        for b in w.wyjasnienie.czego_brakuje
        if "dane dostarcza pakiet wykazu" in b
    ]
    assert braki, "wymaganie bez metody wykazania nazywa brak danych pakietu wykazu"
    assert all(rekord.kod not in b for b in braki)


def test_p1_dokument_studium_i_wiersze_dowodu() -> None:
    enm = _model_der({"ptpiree_status": "NIEPOWIAZANY", "catalog_item_id": "conv-x"})
    ((der_ref, weryfikacja),) = weryfikacje_certyfikatow_typu(enm, "conv-x", operator_id="enea")
    assert der_ref == "DER1"
    assert isinstance(weryfikacja, RekordBrakuPakietu), "studium: odmowa, nie None"
    _odmowa_poprawna(weryfikacja, pakiet="P1", nazwa="Farma PV Zachód")
    (wiersz,) = wiersze_dowodu(None, None, weryfikacja)
    assert wiersz.tresc_pl == weryfikacja.komunikat_pl


# ---------------------------------------------------------------------------
# P2 × konsumenci + predykaty parami
# ---------------------------------------------------------------------------


def _zlota_z_karta_pv(**zmiany: Any) -> EnergyNetworkModel:
    enm = build_golden_enm().model_copy(deep=True)
    for gen in enm.generators:
        if gen.ref_id == "gen_pv":
            gen.materialized_params = {"un_kv": 0.4, "sn_mva": 2.2, "control_mode": "Q_OF_U"}
            for klucz, wartosc in zmiany.items():
                setattr(gen, klucz, wartosc)
    return enm


def _nazwa_pv(enm: EnergyNetworkModel) -> str:
    return next(g.name for g in enm.generators if g.ref_id == "gen_pv")


@pytest.mark.parametrize(
    ("wariant", "parametry", "karta_widmowa", "oczekiwana_odmowa"),
    [
        ("brak_widma_i_karty_widmowej", {}, False, True),
        ("widmo_reczne_poprawne", {"harmonic_spectra": {"gen_pv": {"5": 4.0}}}, False, False),
        ("widmo_reczne_odrzucone", {"harmonic_spectra": {"gen_pv": {"1": 4.0}}}, False, False),
        ("karta_widmowa_przypisana", {}, True, False),
    ],
)
def test_p2_widmo_harmonicznych_gotowosc_i_wejscie_parami(
    wariant: str, parametry: dict[str, Any], karta_widmowa: bool, oczekiwana_odmowa: bool
) -> None:
    enm = _zlota_z_karta_pv()
    if karta_widmowa:
        # Wariant „dane producenta SĄ w modelu": wystarczy niepusta lista źródeł kart — most
        # rozróżnia wyłącznie obecność karty (projekcja karty na wejście V12.6 to tor
        # harmonicznych), więc atrapa zamiast pełnego kontraktu karty jest tu wystarczająca.
        enm.generators = [
            (
                g.model_copy(update={"modele_widmowe": SimpleNamespace(zrodla=("karta-1",))})
                if g.ref_id == "gen_pv"
                else g
            )
            for g in enm.generators
        ]
    pominiete = pominiete_zrodla_v126(enm, parameters=parametry)
    wpis = next((p for p in pominiete if p["ref"] == "gen_pv"), None)
    gotowosc = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, parametry)
    braki_gotowosci = [r for w in gotowosc.warunki for r in w.to_dict().get("braki_pakietow", [])]
    model = build_v126_input_from_enm(enm, parameters=parametry)
    w_wejsciu = any(z.source_ref == "gen_pv" for z in model.harmonic_sources)
    assert ("odmowa_pakietu" in (wpis or {})) is oczekiwana_odmowa
    if oczekiwana_odmowa:
        assert not w_wejsciu, "źródło bez widma nie wchodzi do wejścia"
        rekord = wpis["odmowa_pakietu"]  # type: ignore[index]
        _odmowa_poprawna(rekord, pakiet="P2", nazwa=_nazwa_pv(enm))
        assert rekord["kod"] == "BRAK_KARTY_PRODUCENTA:widmo_harmoniczne"
        assert wpis["powod"] == rekord["komunikat_pl"]  # type: ignore[index]
        assert braki_gotowosci == [rekord], "gotowość i wejście biegu: ta sama odmowa"
    else:
        assert braki_gotowosci == []


def _model_ogranicznika(*, catalog_ref: str | None) -> EnergyNetworkModel:
    urzadzenie: dict[str, Any] = {
        "device_ref": "fv1",
        "symbol_ref": "surge_arrester_10ka",
        "kind": "SURGE_ARRESTER",
        "placement": "GROUND_BRANCH",
    }
    if catalog_ref is not None:
        urzadzenie["catalog_ref"] = catalog_ref
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="od17a-izolacja").model_dump(),
            "buses": [{"ref_id": "BUS_SN", "name": "Szyna SN Północ", "voltage_kv": 20.0}],
            "sources": [
                {
                    "ref_id": "SRC_SN",
                    "name": "Zasilanie SN",
                    "bus_ref": "BUS_SN",
                    "model": "short_circuit_power",
                    "neutral_grounding": {"type": "petersen_coil", "x_ohm": 120.0},
                }
            ],
            "substations": [
                {
                    "ref_id": "ST1",
                    "name": "Stacja 1",
                    "station_type": "mv_lv",
                    "bus_refs": ["BUS_SN"],
                }
            ],
            "bays": [
                {
                    "ref_id": "POLE-IN",
                    "name": "Pole liniowe",
                    "bay_role": "IN",
                    "substation_ref": "ST1",
                    "bus_ref": "BUS_SN",
                    "primary_devices": [urzadzenie],
                }
            ],
        }
    )


@pytest.mark.parametrize("catalog_ref", [None, "arrester-abb-polim-d-24kv-10ka"])
def test_p2_poziom_izolacji_gotowosc_i_bieg_parami(catalog_ref: str | None) -> None:
    """Karta ogranicznika (lub jej brak) nie niesie poziomu izolacji chronionych aparatów —
    brak danych P2 w obu wariantach; gotowość i zapis biegu z tej samej funkcji."""
    enm = _model_ogranicznika(catalog_ref=catalog_ref)
    model = build_v126_input_from_enm(enm)
    assert len(model.insulation) == 1
    braki = braki_poziomu_izolacji(enm, model.insulation)
    (rekord,) = braki
    _odmowa_poprawna(rekord, pakiet="P2", nazwa="Szyna SN Północ")
    assert rekord.status_maszynowy == "BRAK_PODSTAWY", "wynik informacyjny wobec poziomu normowego"
    assert rekord.kod == "BRAK_KARTY_PRODUCENTA:poziom_izolacji_udarowej"
    gotowosc = ocen_gotowosc_v126(enm, V126AnalysisType.INSULATION_COORDINATION, {})
    warunek = next(w for w in gotowosc.warunki if w.kod == "ograniczniki.poziom_izolacji_z_karty")
    assert not warunek.blokujacy, "brak podstawy nie blokuje liczenia"
    assert list(warunek.braki_pakietow) == [r.model_dump(mode="json") for r in braki]


def test_p2_poziom_izolacji_bez_ogranicznikow_nie_ma_odmowy() -> None:
    enm = _model_ogranicznika(catalog_ref=None)
    enm.bays[0].primary_devices = []
    assert braki_poziomu_izolacji(enm, build_v126_input_from_enm(enm).insulation) == []


def _magazyn(tabliczka_dodatkowa: dict[str, Any]) -> dict[str, Any]:
    return {
        "ref_id": "BESS1",
        "name": "Magazyn Wschód",
        "bus_ref": "BUS_SN",
        "p_mw": 1.0,
        "gen_type": "bess",
        "materialized_params": {
            "sn_mva": 2.2,
            "dynamic_model_ref": "default_bess_gfl",
            **tabliczka_dodatkowa,
        },
    }


_POLA_ZASOBNIKA = ("sprawnosc_ladowania", "sprawnosc_rozladowania", "soc_min", "soc_max")


@pytest.mark.parametrize(
    "obecne",
    [(), ("sprawnosc_ladowania",), ("soc_min", "soc_max"), _POLA_ZASOBNIKA[:3]],
    ids=["zadne", "jedno", "okno_soc", "bez_soc_max"],
)
def test_p2_magazyn_materializacja_i_stan_dynamiki_parami(obecne: tuple[str, ...]) -> None:
    generator = _magazyn({pole: 0.9 for pole in obecne})
    with pytest.raises(BladMaterializacjiDynamiki) as blad:
        materializuj_dynamike("default_bess_gfl", generator)
    odmowa = blad.value.odmowa_pakietu
    assert odmowa is not None
    brakujace = [p for p in _POLA_ZASOBNIKA if p not in obecne]
    assert odmowa.kod == "BRAK_KARTY_PRODUCENTA:" + ",".join(brakujace)
    assert blad.value.kod == odmowa.kod and blad.value.komunikat == odmowa.komunikat
    _odmowa_poprawna(odmowa.rekord(), pakiet="P2", nazwa="Magazyn Wschód")
    assert "początkowy stan" not in odmowa.komunikat, "SOC początkowy to punkt pracy, nie karta"
    (stan,) = stan_dynamiki_generatorow({"generators": [generator]})
    assert stan.stan == "odmowa"
    assert (stan.odmowa_kod, stan.odmowa_komunikat) == (odmowa.kod, odmowa.komunikat)


def test_p2_magazyn_z_kompletem_danych_karty_odmawia_bez_braku_pakietu() -> None:
    """Komplet danych zasobnika z karty: brak pakietu właściciela znika; zostaje odmowa
    z powodu warunku początkowego punktu pracy (to nie jest dana P2)."""
    generator = _magazyn({pole: 0.9 if "sprawnosc" in pole else 0.1 for pole in _POLA_ZASOBNIKA})
    generator["materialized_params"]["soc_max"] = 0.9
    with pytest.raises(BladMaterializacjiDynamiki) as blad:
        materializuj_dynamike("default_bess_gfl", generator)
    assert blad.value.odmowa_pakietu is None
    assert blad.value.kod == KOD_MAGAZYN_DANE
    assert "początkowy stan naładowania" in blad.value.komunikat


def test_p2_magazyn_wartosc_logiczna_nie_jest_dana_karty() -> None:
    generator = _magazyn({pole: True for pole in _POLA_ZASOBNIKA})
    with pytest.raises(BladMaterializacjiDynamiki) as blad:
        materializuj_dynamike("default_bess_gfl", generator)
    assert blad.value.odmowa_pakietu is not None


# ---------------------------------------------------------------------------
# P3 × każdy operator listy produktu (raport przypadku ↔ jawne żądanie pakietu parami)
# ---------------------------------------------------------------------------


def _model_stacji() -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="od17a-osd").model_dump(),
            "buses": [{"ref_id": "BUS_SN", "name": "Szyna SN", "voltage_kv": 15.0}],
            "substations": [
                {"ref_id": "ST1", "name": "Stacja", "station_type": "mv_lv", "bus_refs": ["BUS_SN"]}
            ],
        }
    )


@pytest.mark.parametrize("operator", list_available_operators())
def test_p3_raport_przypadku_dla_kazdego_operatora(operator: str) -> None:
    raport = evaluate_enm(_model_stacji(), operator_przypadku=operator, nazwa_przypadku="Wariant A")
    osd_w_raporcie = [p.pack_id for p in raport.packs if p.kind == "osd"]
    ma_pakiet = pack_id_operatora(operator) in REFERENCE_PACK_REGISTRY
    if ma_pakiet:
        assert osd_w_raporcie == [pack_id_operatora(operator)]
        assert raport.braki_pakietow == []
        assert wymagaj_pakietu(pack_id_operatora(operator), nazwa_przypadku="Wariant A")
    else:
        assert osd_w_raporcie == [], "standard innego operatora nie jest podstawą oceny"
        (rekord,) = raport.braki_pakietow
        _odmowa_poprawna(rekord, pakiet="P3", nazwa="Wariant A")
        assert rekord.kod == f"BRAK_PAKIETU_OSD:{operator}"
        assert load_nc_rfg_profile(operator).operator_name_pl in rekord.komunikat_pl
        # Jawne żądanie pakietu tego operatora: TA SAMA odmowa (predykat parami).
        with pytest.raises(OdmowaBrakuPakietuDanych) as odmowa:
            wymagaj_pakietu(pack_id_operatora(operator), nazwa_przypadku="Wariant A")
        assert odmowa.value.rekord() == rekord
    # Pakiety norm i producentów oceniane zawsze — raport nigdy nie jest pusty.
    assert {p.kind for p in raport.packs} >= {"norm", "manufacturer"}


def test_p3_istnieje_operator_bez_pakietu_i_operator_z_pakietem() -> None:
    """Anty-pusto: iloczyn wyżej ćwiczy OBIE gałęzie (dziś ENEA z pakietem, pozostali bez)."""
    z_pakietem = [
        o for o in list_available_operators() if pack_id_operatora(o) in REFERENCE_PACK_REGISTRY
    ]
    bez_pakietu = [o for o in list_available_operators() if o not in z_pakietem]
    assert z_pakietem and bez_pakietu


def test_p3_operator_spoza_listy_tez_jest_nazwana_odmowa() -> None:
    with pytest.raises(OdmowaBrakuPakietuDanych) as odmowa:
        pakiet_osd_operatora("xyz", nazwa_przypadku="Wariant A")
    assert odmowa.value.kod == "BRAK_PAKIETU_OSD:xyz"
    assert "xyz" not in odmowa.value.komunikat


def test_p3_raport_bez_kontekstu_przypadku_ocenia_caly_rejestr() -> None:
    raport = evaluate_enm(_model_stacji())
    assert [p.pack_id for p in raport.packs] == sorted(REFERENCE_PACK_REGISTRY)
    assert raport.braki_pakietow == []


def test_p3_raport_przypadku_bez_nazwy_to_blad_programu() -> None:
    with pytest.raises(ValueError):
        evaluate_enm(_model_stacji(), operator_przypadku="energa")


def test_generator_modelu_jako_obiekt_i_slownik_daje_te_sama_odmowe() -> None:
    tabliczka = {"ptpiree_status": "NIEPOWIAZANY", "model": "M-1"}
    obiekt = Generator.model_validate(
        {
            "ref_id": "G",
            "name": "Źródło G",
            "bus_ref": "B",
            "p_mw": 1.0,
            "gen_type": "pv_inverter",
            "materialized_params": tabliczka,
        }
    )
    slownik = obiekt.model_dump(mode="json")
    a, b = odmowa_braku_certyfikatu(obiekt), odmowa_braku_certyfikatu(slownik)
    assert a is not None and b is not None and a.rekord() == b.rekord()
