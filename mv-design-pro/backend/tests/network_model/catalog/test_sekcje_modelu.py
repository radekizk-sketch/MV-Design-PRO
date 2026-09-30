"""Widok sekcji modelu typu katalogowego (karta AB-H0 §0.3, §0.7.4, §0.15).

Przypina: (1) KAŻDE pole klasy typu ma miejsce w widoku (nowe pole bez przypisania =
czerwień); (2) każda przestrzeń katalogu ma widok sekcji albo powód jego braku;
(3) predykaty parami — pola składników istnieją w klasie, a każde pole przypisane do
sekcji fizycznej zasila składnik tej sekcji; (4) pomiar całego katalogu: osiem sekcji,
sufit rekordu ``REFERENCYJNY``, ``VALIDATED`` nieosiągalne, certyfikat zgodności nie
podnosi sekcji fizycznej; (5) sonda 3 karty (typ referencyjny z kartą producenta);
(6) karta widmowa w repozytorium zasila sekcje ``harmonic``/``supraharmonic``;
(7) parytet przestrzeni ``CONVERTER`` ↔ projekcje ``ZRODLO_NN_PV``/``ZRODLO_NN_BESS``.
"""

from __future__ import annotations

import dataclasses
from typing import Any

import pytest
from dziedziny.sekcje import SEKCJE, SEKCJE_DOWODOWE, SEKCJE_FIZYCZNE, OcenaSekcji
from network_model.catalog import types as typy_katalogu
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.sekcje_modelu import (
    POLA_SEKCJI,
    PRZESTRZENIE_BEZ_SEKCJI,
    PRZESTRZENIE_Z_SEKCJAMI,
    SKLADNIKI_SEKCJI,
    dane_typu,
    dowod_certyfikatu_ptpiree,
    sekcje_typu,
)
from network_model.catalog.types import CatalogNamespace, CatalogVerificationStatus

from tests.dziedziny import fabryki as f

#: Przestrzeń → pole repozytorium z rekordami (pomiar całego katalogu).
POLE_REPOZYTORIUM = {
    "CONVERTER": "converter_types",
    "ZRODLO_NN_PV": "pv_inverter_types",
    "ZRODLO_NN_BESS": "bess_inverter_types",
    "GENERATOR_SN": "synchronous_generator_types",
    "ZRODLO_SN": "source_system_types",
    "KOMPENSATOR_SN": "shunt_capacitor_types",
    "OBCIAZENIE": "load_types",
    "TRAFO_SN_NN": "transformer_types",
    "KABEL_SN": "cable_types",
    "LINIA_SN": "line_types",
    "KABEL_NN": "lv_cable_types",
    "BATERIA_BESS": "bess_battery_types",
}
TYP_REFERENCYJNY = "conv-pv-card-huawei-sun2000-215ktl"


@pytest.fixture(scope="module")
def katalog() -> CatalogRepository:
    return get_default_mv_catalog()


def _statusy(oceny: tuple[OcenaSekcji, ...]) -> dict[str, str]:
    return {o.sekcja: o.status for o in oceny}


# ---------------------------------------------------------------------------
# Kompletność widoku
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("klasa", sorted(POLA_SEKCJI))
def test_kazde_pole_klasy_ma_miejsce_w_widoku(klasa: str) -> None:
    pola = {pole.name for pole in dataclasses.fields(getattr(typy_katalogu, klasa))}
    assert set(POLA_SEKCJI[klasa]) == pola, {
        "bez_miejsca": sorted(pola - set(POLA_SEKCJI[klasa])),
        "nie_istnieje": sorted(set(POLA_SEKCJI[klasa]) - pola),
    }


def test_kazda_przestrzen_katalogu_ma_widok_albo_powod(katalog: CatalogRepository) -> None:
    wszystkie = {przestrzen.value for przestrzen in CatalogNamespace}
    assert set(PRZESTRZENIE_Z_SEKCJAMI) | set(PRZESTRZENIE_BEZ_SEKCJI) == wszystkie
    assert not set(PRZESTRZENIE_Z_SEKCJAMI) & set(PRZESTRZENIE_BEZ_SEKCJI)
    assert all(powod.strip() for powod in PRZESTRZENIE_BEZ_SEKCJI.values())
    for klasa, akcesor in PRZESTRZENIE_Z_SEKCJAMI.values():
        assert klasa in POLA_SEKCJI and klasa in SKLADNIKI_SEKCJI
        assert callable(getattr(katalog, akcesor))
    assert set(POLE_REPOZYTORIUM) == set(PRZESTRZENIE_Z_SEKCJAMI)


@pytest.mark.parametrize("klasa", sorted(POLA_SEKCJI))
def test_predykaty_parami_pola_skladnikow_i_sekcji(klasa: str) -> None:
    """Pole składnika istnieje w klasie; pole przypisane do sekcji fizycznej zasila
    co najmniej jeden składnik TEJ sekcji (brak pól-sierot w widoku)."""
    mapa = POLA_SEKCJI[klasa]
    skladniki = SKLADNIKI_SEKCJI[klasa]
    assert set(skladniki) <= set(SEKCJE_FIZYCZNE)
    for sekcja, definicje in skladniki.items():
        for definicja in definicje:
            assert set(definicja.pola) <= set(mapa), (sekcja, definicja.nazwa)
            assert definicja.wymagany or definicja.pola or definicja.widmo
        assert any(d.wymagany for d in definicje), f"{klasa}.{sekcja}: brak składnika wymaganego"
    sieroty = sorted(
        f"{pole}→{miejsce}"
        for pole, miejsce in mapa.items()
        if miejsce in SEKCJE_FIZYCZNE
        and pole not in {p for d in skladniki.get(miejsce, ()) for p in d.pola}
    )
    assert not sieroty, f"{klasa}: pola sekcji fizycznej bez składnika: {sieroty}"


def test_przestrzen_bez_widoku_i_typ_nieistniejacy_to_odmowa_nazwana(
    katalog: CatalogRepository,
) -> None:
    with pytest.raises(KeyError, match="nie ma widoku sekcji modelu"):
        dane_typu(katalog, "CT", "dowolny")
    with pytest.raises(KeyError, match="nie istnieje"):
        dane_typu(katalog, "CONVERTER", "conv-nie-istnieje")


# ---------------------------------------------------------------------------
# Pomiar całego katalogu
# ---------------------------------------------------------------------------


def _wszystkie(katalog: CatalogRepository) -> list[tuple[str, str, tuple[OcenaSekcji, ...]]]:
    wynik = []
    for przestrzen, pole in sorted(POLE_REPOZYTORIUM.items()):
        for typ_id in sorted(getattr(katalog, pole)):
            wynik.append((przestrzen, typ_id, sekcje_typu(katalog, przestrzen, typ_id)))
    return wynik


def test_caly_katalog_osiem_sekcji_sufit_rekordu_i_brak_walidacji(
    katalog: CatalogRepository,
) -> None:
    wszystkie = _wszystkie(katalog)
    assert len(wszystkie) == sum(len(getattr(katalog, p)) for p in POLE_REPOZYTORIUM.values())
    for przestrzen, typ_id, oceny in wszystkie:
        assert tuple(o.sekcja for o in oceny) == SEKCJE, (przestrzen, typ_id)
        dane = dane_typu(katalog, przestrzen, typ_id)
        for ocena in oceny:
            assert ocena.status != "VALIDATED", (przestrzen, typ_id, ocena.sekcja)
            assert ocena.status != "OUTSIDE_DOMAIN"
            assert ocena.powod_pl.strip()
            if ocena.sekcja in SEKCJE_FIZYCZNE and not dane.dowody:
                # Brak dowodu: sekcja fizyczna co najwyżej UNVALIDATED (deklaracja ≠ walidacja).
                assert ocena.status in ("UNKNOWN", "UNVALIDATED"), (przestrzen, typ_id, ocena)
            if ocena.sekcja in SEKCJE_FIZYCZNE:
                # Certyfikat ZGODNOŚCI nie certyfikuje modelu symulacyjnego.
                assert ocena.status != "CERTIFIED", (przestrzen, typ_id, ocena.sekcja)


def test_certyfikat_zgodnosci_daje_certification_nie_sekcje_fizyczne(
    katalog: CatalogRepository,
) -> None:
    powiazane = [
        (przestrzen, typ_id, oceny)
        for przestrzen, typ_id, oceny in _wszystkie(katalog)
        if dowod_certyfikatu_ptpiree(dane_typu(katalog, przestrzen, typ_id).pola) is not None
    ]
    # Pomiar 2026-09-23: jeden typ z pozycją wykazu PTPiREE (CONVERTER i jego projekcja PV).
    assert sorted((p, t) for p, t, _ in powiazane) == [
        ("CONVERTER", TYP_REFERENCYJNY),
        ("ZRODLO_NN_PV", TYP_REFERENCYJNY),
    ]
    for _, _, oceny in powiazane:
        statusy = _statusy(oceny)
        assert statusy["certification"] == "CERTIFIED"
        assert statusy["dynamic"] != "CERTIFIED"
        assert statusy["fundamental"] != "CERTIFIED"


@pytest.mark.parametrize(
    ("przestrzen", "pole"),
    [("ZRODLO_NN_PV", "pv_inverter_types"), ("ZRODLO_NN_BESS", "bess_inverter_types")],
)
def test_parytet_przeksztaltnika_i_jego_projekcji(
    katalog: CatalogRepository, przestrzen: str, pole: str
) -> None:
    """Ten sam typ w przestrzeni ``CONVERTER`` i w projekcji nN ma te same statusy sekcji
    (jedna reguła jakości i dowodu; różne nazwy pól znamionowych nie zmieniają oceny)."""
    wspolne = sorted(set(getattr(katalog, pole)) & set(katalog.converter_types))
    assert len(wspolne) == len(getattr(katalog, pole))
    for typ_id in wspolne:
        assert _statusy(sekcje_typu(katalog, "CONVERTER", typ_id)) == _statusy(
            sekcje_typu(katalog, przestrzen, typ_id)
        ), typ_id


# ---------------------------------------------------------------------------
# Sonda 3 — typ referencyjny z kartą producenta
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("przestrzen", ["CONVERTER", "ZRODLO_NN_PV"])
def test_sonda_typu_referencyjnego(katalog: CatalogRepository, przestrzen: str) -> None:
    oceny = {o.sekcja: o for o in sekcje_typu(katalog, przestrzen, TYP_REFERENCYJNY)}
    assert {s: o.status for s, o in oceny.items()} == {
        "fundamental": "UNVALIDATED",
        "short_circuit": "UNKNOWN",
        "dynamic": "UNKNOWN",
        "harmonic": "UNKNOWN",
        "supraharmonic": "UNKNOWN",
        "certification": "CERTIFIED",
        "measurement": "UNKNOWN",
        "validation": "UNKNOWN",
    }
    fundamental = oceny["fundamental"]
    assert "deklaracja producenta nie jest walidacją" in fundamental.powod_pl
    migotanie = [d for d in fundamental.dane_przyjete if d.nazwa_pl == "flicker_c"]
    assert migotanie and migotanie[0].jakosc is not None
    assert migotanie[0].jakosc.value == "ESTIMATED"
    assert "k_sc" in oceny["short_circuit"].powod_pl
    harmonic = {s.nazwa: s for s in oceny["harmonic"].skladniki}
    assert harmonic["emisja"].status == "UNKNOWN"
    assert "karty widmowej" in harmonic["emisja"].powod_pl
    assert harmonic["parametry_z_conv"].status == "UNVALIDATED"
    assert "ESTIMATED" in harmonic["parametry_z_conv"].powod_pl
    assert "TC-GCC-DNVGL-SE-0124-07526-1" in oceny["certification"].powod_pl


# ---------------------------------------------------------------------------
# Karta widmowa w repozytorium zasila sekcje częstotliwościowe
# ---------------------------------------------------------------------------


def _z_kartami(katalog: CatalogRepository, *karty: Any) -> CatalogRepository:
    return dataclasses.replace(katalog, karty_widmowe={karta.id: karta for karta in karty})


def _typ_bez_z_conv(katalog: CatalogRepository) -> str:
    for typ_id, typ in sorted(katalog.converter_types.items()):
        if typ.current_loop_bandwidth_hz is None and typ.pll_bandwidth_hz is None:
            return typ_id
    raise AssertionError("pomiar: brak typu bez parametrów Z_conv")


@pytest.mark.parametrize(
    ("model", "dowod", "oczekiwany"),
    [
        # Widmo bez parametrów pomiaru: zakres ważności nieznany — sufit UNVALIDATED
        # nawet przy raporcie badań.
        ("bez_pomiaru", None, "UNVALIDATED"),
        ("bez_pomiaru", "RAPORT_BADAN", "UNVALIDATED"),
        ("z_pomiarem", None, "UNVALIDATED"),
        # Raport bez ustalonej podstawy przy rekordzie REFERENCYJNY nie podnosi statusu.
        ("z_pomiarem", "RAPORT_BADAN@NIEUSTALONE", "UNVALIDATED"),
        ("z_pomiarem", "RAPORT_BADAN", "MEASURED"),
        ("z_pomiarem", "POMIAR", "MEASURED"),
        ("z_pomiarem", "CERTYFIKAT_MODELU", "CERTIFIED"),
        # Widmo ZMIERZONE z kompletem pomiaru i podstawą ustaloną — MEASURED bez rekordu.
        ("zmierzony", None, "MEASURED"),
    ],
)
def test_karta_widmowa_zasila_sekcje_harmonic(
    katalog: CatalogRepository, model: str, dowod: str | None, oczekiwany: str
) -> None:
    typ_id = _typ_bez_z_conv(katalog)
    assert katalog.converter_types[typ_id].verification_status == (
        CatalogVerificationStatus.REFERENCYJNY.value
    )
    modele = {
        "bez_pomiaru": f.model(),
        "z_pomiarem": f.model(pomiar=f.pomiar_kompletny()),
        "zmierzony": f.model_zmierzony(),
    }
    rodzaj, _, stan = (dowod or "").partition("@")
    dowody = (
        ()
        if dowod is None
        else (f.dowod(rodzaj, ("HARMONIC_FREQUENCY_DOMAIN",), status=stan or "WSKAZANE"),)
    )
    karta = f.karta(id="karta-x", urzadzenie_ref=typ_id, modele=(modele[model],), dowody=dowody)
    oceny = {o.sekcja: o for o in sekcje_typu(_z_kartami(katalog, karta), "CONVERTER", typ_id)}
    assert oceny["harmonic"].status == oczekiwany, oceny["harmonic"].powod_pl
    assert oceny["supraharmonic"].status == "UNKNOWN"
    # Dowód widma nie rusza sekcji spoza dziedziny częstotliwości.
    assert oceny["fundamental"].status == "UNVALIDATED"
    oczekiwany_pomiar = {
        "RAPORT_BADAN": "MEASURED",
        "POMIAR": "MEASURED",
        "RAPORT_BADAN@NIEUSTALONE": "UNVALIDATED",
    }.get(dowod or "", "UNKNOWN")
    assert oceny["measurement"].status == oczekiwany_pomiar
    oczekiwana_certyfikacja = "CERTIFIED" if dowod == "CERTYFIKAT_MODELU" else "UNKNOWN"
    assert oceny["certification"].status == oczekiwana_certyfikacja


def test_karta_innego_typu_nie_zasila_sekcji(katalog: CatalogRepository) -> None:
    typ_id = _typ_bez_z_conv(katalog)
    karta = f.karta(id="karta-obca", urzadzenie_ref="conv-inny-typ")
    oceny = _statusy(sekcje_typu(_z_kartami(katalog, karta), "CONVERTER", typ_id))
    assert oceny["harmonic"] == "UNKNOWN"


def test_karta_supraharmoniczna_zasila_wylacznie_supraharmonic(
    katalog: CatalogRepository,
) -> None:
    typ_id = _typ_bez_z_conv(katalog)
    supra = f.model(
        ident="m-supra",
        dziedzina="SUPRAHARMONIC_FREQUENCY_DOMAIN",
        zakres_czestotliwosci=f.ZakresCzestotliwosci(f_min_hz=2000.0, f_max_hz=150000.0),
        skladowe=(f.skladowa(16000.0),),
    )
    karta = f.karta(id="karta-supra", urzadzenie_ref=typ_id, modele=(supra,))
    oceny = _statusy(sekcje_typu(_z_kartami(katalog, karta), "CONVERTER", typ_id))
    assert oceny["supraharmonic"] == "UNVALIDATED"
    assert oceny["harmonic"] == "UNKNOWN"


# ---------------------------------------------------------------------------
# Dowód certyfikatu z pozycji wykazu
# ---------------------------------------------------------------------------


def test_dowod_certyfikatu_ptpiree_wymaga_powiazania_i_nazywa_podstawe() -> None:
    assert dowod_certyfikatu_ptpiree({"ptpiree_status": "NIEPOWIAZANY"}) is None
    assert dowod_certyfikatu_ptpiree({"ptpiree_status": "POWIAZANY"}) is None
    pelny = dowod_certyfikatu_ptpiree(
        {
            "ptpiree_status": "POWIAZANY",
            "ptpiree_certificate_ref": "CERT-1",
            "ptpiree_document_number": "DOC-1",
            "ptpiree_publication_date": "2026-01-15",
        }
    )
    assert pelny is not None
    assert pelny.rodzaj == "CERTYFIKAT_ZGODNOSCI"
    assert pelny.podstawa.status == "WSKAZANE"
    assert pelny.podstawa.wydanie == "2026-01-15"
    assert set(pelny.pokrywa) == {"POWER_FLOW", "RMS_DYNAMICS"}
    bez_wydania = dowod_certyfikatu_ptpiree(
        {"ptpiree_status": "POWIAZANY", "ptpiree_certificate_ref": "CERT-1"}
    )
    assert bez_wydania is not None and bez_wydania.podstawa.status == "NIEUSTALONE"


def test_sekcje_dowodowe_nie_maja_skladnikow(katalog: CatalogRepository) -> None:
    for ocena in sekcje_typu(katalog, "CONVERTER", TYP_REFERENCYJNY):
        if ocena.sekcja in SEKCJE_DOWODOWE:
            assert ocena.skladniki == ()


# ---------------------------------------------------------------------------
# Klasa elementu generatora i jakość źródeł dynamiki
# ---------------------------------------------------------------------------


def test_jakosc_zrodla_dynamiki_pokrywa_literal_proweniencji() -> None:
    from typing import get_args

    from enm.dynamika_modele import ZrodloProweniencjiDynamiki
    from network_model.catalog.sekcje_modelu import JAKOSC_ZRODLA_DYNAMIKI

    assert set(JAKOSC_ZRODLA_DYNAMIKI) == set(get_args(ZrodloProweniencjiDynamiki))


def test_pola_skladnikow_elementu_generatora_sa_polami_tabliczki_albo_karty() -> None:
    """Predykat parami: składnik elementu czyta WYŁĄCZNIE pola, które materializacja
    generatora przekształtnikowego zapisuje (tabliczka elementu — pomiar torów
    `add_converter_source`/`_materialize_nn_source` — albo pola karty kopiowane, gdy
    obecne), plus jedno pole widoku modelu dynamicznego."""
    from network_model.catalog.sekcje_modelu import (
        KLASA_ELEMENTU_PRZEKSZTALTNIKOWEGO,
        POLE_MODELU_DYNAMICZNEGO_ELEMENTU,
    )
    from network_model.catalog.types import POLA_KARTY_MATERIALIZOWANE_GDY_OBECNE

    tabliczka = {"un_kv", "sn_mva", "pmax_mw", "qmin_mvar", "qmax_mvar", "control_mode", "k_sc"}
    dozwolone = (
        tabliczka | set(POLA_KARTY_MATERIALIZOWANE_GDY_OBECNE) | {POLE_MODELU_DYNAMICZNEGO_ELEMENTU}
    )
    definicje = SKLADNIKI_SEKCJI[KLASA_ELEMENTU_PRZEKSZTALTNIKOWEGO]
    pola = {p for skladniki in definicje.values() for d in skladniki for p in d.pola}
    assert pola <= dozwolone, sorted(pola - dozwolone)
    assert set(definicje) <= set(SEKCJE_FIZYCZNE)
