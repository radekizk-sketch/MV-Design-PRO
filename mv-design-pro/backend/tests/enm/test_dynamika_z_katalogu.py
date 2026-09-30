"""Materializacja katalogowego modelu dynamicznego do kopii `Generator.dynamika` (karta AB-P1).

Testy jako ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):

* rodzaj wytwórcy z katalogu {PV, BESS, wiatr typ 1/3/4, maszyna synchroniczna, bez rodzaju}
  × profil {zgodny nadążny, zgodny tworzący sieć, niezgodny, nieznany};
* wiązanie {nowe, zmiana na inny profil, odwiązanie, odwiązanie przy bloku własnym};
* tabliczka {z mocą jednostki, bez mocy jednostki, kilka jednostek};
* droga zmiany tabliczki {operacja wiązania, dowolna inna operacja (synchronizacja
  w `_response`), migawka zapisana z pominięciem operacji (bramka biegu i gotowości)}.
"""

from __future__ import annotations

import copy
from uuid import NAMESPACE_URL, uuid5

import pytest
from application.calculation_readiness.service import CalculationReadinessService
from enm.domain_operations import execute_domain_operation
from enm.dynamika_z_katalogu import (
    KOD_KOPIA_NIEAKTUALNA,
    KOD_PROFIL_NIEZGODNY,
    KOD_RODZINA_BEZ_PROFILI,
    KOD_TABLICZKA_BRAK,
    BladMaterializacjiDynamiki,
    OdmowaKopiiDynamiki,
    braki_kopii_dynamiki,
    materializuj_dynamike,
    odmow_gdy_kopia_nieaktualna,
    profile_zgodne,
    stan_dynamiki_generatorow,
    synchronizuj_dynamike_z_wiazan,
)
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.catalog.der_dynamic import get_profile, list_all_profile_ids

#: Blok własny wytwórcy (karta producenta) — dane spoza katalogu.
_BLOK_WLASNY = {
    "rodzina": "przeksztaltnikowa_gfl",
    "proweniencja": {"zrodlo": "karta_producenta", "odniesienie": "Karta DS-7", "data": None},
    "s_n_mva": 2.0,
    "i_max_pu": 1.1,
    "priorytet_ogranicznika": "czynna",
    "pll_kp": 30.0,
    "pll_ki": 300.0,
    "reg_pradu_kp": 1.0,
    "reg_pradu_ki": 50.0,
    "k_frt": 3.0,
    "prog_frt_pu": 0.9,
    "tp_s": 0.02,
    "tiq_s": 0.02,
    "p_odbudowa_pu_na_s": 1.0,
    "p_odbudowa_opoznienie_s": 0.1,
    "droop_p_f_pu": 0.04,
    "martwa_strefa_f_hz": 0.02,
    "droop_q_u_pu": 0.05,
    "martwa_strefa_u_pu": 0.01,
    "u_min_ciagle_pu": 0.85,
    "u_max_ciagle_pu": 1.1,
}

#: Karta OD-17a: magazyn bez danych zasobnika z karty producenta — kod nazwanej odmowy braku
#: pakietu kart producentów (pola w kolejności kontraktu `Magazyn`).
KOD_BRAKU_KARTY_ZASOBNIKA = (
    "BRAK_KARTY_PRODUCENTA:sprawnosc_ladowania,sprawnosc_rozladowania,soc_min,soc_max"
)


def _generator(ref: str, gen_type: str | None, *, sn_mva: float | None = 2.0, **pola) -> dict:
    tabliczka = {"un_kv": 15.0}
    if sn_mva is not None:
        tabliczka["sn_mva"] = sn_mva
    return {
        "id": str(uuid5(NAMESPACE_URL, f"gen:{ref}")),
        "ref_id": ref,
        "name": f"Wytwórca {ref}",
        "tags": [],
        "meta": {},
        "bus_ref": "bus_1",
        "p_mw": 1.0,
        "q_mvar": 0.0,
        "gen_type": gen_type,
        "materialized_params": tabliczka,
        **pola,
    }


def _enm(*generatory: dict) -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="dynamika-z-katalogu", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    enm["buses"] = [
        {
            "id": str(uuid5(NAMESPACE_URL, "bus:bus_1")),
            "ref_id": "bus_1",
            "name": "Szyna 1",
            "tags": [],
            "meta": {},
            "voltage_kv": 15.0,
            "phase_system": "3ph",
        }
    ]
    enm["generators"] = list(generatory)
    return enm


def _wiaz(enm: dict, ref: str, profil: str | None) -> dict:
    return execute_domain_operation(
        enm, "set_der_catalog_bindings", {"generator_ref": ref, "dynamic_model_ref": profil}
    )


def _gen(wynik: dict, ref: str) -> dict:
    return next(g for g in wynik["snapshot"]["generators"] if g["ref_id"] == ref)


# ---------------------------------------------------------------------------
# Rodzaj wytwórcy × profil
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("gen_type", "profil", "rodzina"),
    [
        ("pv_inverter", "default_pv_gfl", "przeksztaltnikowa_gfl"),
        ("pv_inverter", "default_pv_gfm", "przeksztaltnikowa_gfm"),
        ("fw_scig", "default_wind_type_1", "wiatr_typ_1"),
        ("fw_dfig", "default_wind_type_3", "wiatr_typ_3"),
        ("fw_pmsg", "default_wind_type_4", "wiatr_typ_4"),
        ("wind_inverter", "default_wind_type_4", "wiatr_typ_4"),
    ],
)
def test_wiazanie_zgodnego_profilu_tworzy_kopie_rodziny_profilu(
    gen_type: str, profil: str, rodzina: str
) -> None:
    wynik = _wiaz(_enm(_generator("g1", gen_type)), "g1", profil)
    assert wynik.get("error") is None, wynik.get("error")
    generator = _gen(wynik, "g1")
    assert generator["materialized_params"]["dynamic_model_ref"] == profil
    assert generator["dynamika"]["rodzina"] == rodzina
    assert generator["dynamika"]["proweniencja"]["zrodlo"] == "profil_typowy_normy"
    # Kopia jest DOKŁADNIE materializacją (ta sama funkcja, ten sam wynik).
    assert generator["dynamika"] == materializuj_dynamike(profil, generator)
    stan = stan_dynamiki_generatorow(wynik["snapshot"])[0]
    assert stan.stan == "z_katalogu"


@pytest.mark.parametrize(
    ("gen_type", "profil", "kod"),
    [
        ("pv_inverter", "default_wind_type_4", KOD_PROFIL_NIEZGODNY),
        ("fw_pmsg", "default_pv_gfl", KOD_PROFIL_NIEZGODNY),
        ("bess", "default_pv_gfl", KOD_PROFIL_NIEZGODNY),
        ("fw_scig", "default_wind_type_2", KOD_PROFIL_NIEZGODNY),
        ("synchronous", "default_pv_gfl", KOD_RODZINA_BEZ_PROFILI),
        (None, "default_pv_gfl", KOD_RODZINA_BEZ_PROFILI),
    ],
)
def test_wiazanie_profilu_niezgodnego_z_rodzajem_odmawia_bez_skutku(
    gen_type: str | None, profil: str, kod: str
) -> None:
    enm = _enm(_generator("g1", gen_type))
    przed = copy.deepcopy(enm)
    wynik = _wiaz(enm, "g1", profil)
    assert wynik["error_code"] == kod
    assert wynik["snapshot"] is None
    assert enm == przed, "odmowa operacji nie może zostawić skutku w modelu"


def test_wiazanie_nieznanego_profilu_odmawia_istniejacym_kodem() -> None:
    wynik = _wiaz(_enm(_generator("g1", "pv_inverter")), "g1", "profil_nieistniejacy")
    assert wynik["error_code"] == "der_bindings.catalog_ref_unknown"


def test_lista_zgodnych_profili_jest_tym_samym_predykatem_co_operacja() -> None:
    """Predykaty parami: KAŻDY profil z listy wyboru przechodzi operację, KAŻDY spoza
    listy odmawia — dla każdego rodzaju wytwórcy modelu."""
    for gen_type in (
        "pv_inverter",
        "bess",
        "fw_scig",
        "fw_dfig",
        "fw_pmsg",
        "wind_inverter",
        "synchronous",
    ):
        zgodne = set(profile_zgodne(gen_type))
        for profil in list_all_profile_ids():
            wynik = _wiaz(_enm(_generator("g1", gen_type)), "g1", profil)
            if profil in zgodne:
                assert wynik.get("error") is None, (gen_type, profil, wynik.get("error"))
            else:
                assert wynik["error_code"] in (KOD_PROFIL_NIEZGODNY, KOD_RODZINA_BEZ_PROFILI)
    assert profile_zgodne("synchronous") == ()


# ---------------------------------------------------------------------------
# Wiązanie: nowe × zmiana × odwiązanie
# ---------------------------------------------------------------------------


def test_zmiana_wiazania_zmienia_kopie_na_nowy_profil() -> None:
    pierwszy = _wiaz(_enm(_generator("g1", "pv_inverter")), "g1", "default_pv_gfl")
    drugi = _wiaz(pierwszy["snapshot"], "g1", "default_pv_gfm")
    assert _gen(pierwszy, "g1")["dynamika"]["rodzina"] == "przeksztaltnikowa_gfl"
    assert _gen(drugi, "g1")["dynamika"]["rodzina"] == "przeksztaltnikowa_gfm"


def test_odwiazanie_usuwa_kopie_katalogu_razem_z_wiazaniem() -> None:
    zwiazany = _wiaz(_enm(_generator("g1", "pv_inverter")), "g1", "default_pv_gfl")
    odwiazany = _wiaz(zwiazany["snapshot"], "g1", None)
    generator = _gen(odwiazany, "g1")
    assert "dynamic_model_ref" not in generator["materialized_params"]
    assert generator.get("dynamika") is None
    assert stan_dynamiki_generatorow(odwiazany["snapshot"])[0].stan == "brak"


def test_odwiazanie_bez_wiazania_nie_rusza_bloku_wlasnego() -> None:
    enm = _enm(_generator("g1", "pv_inverter", dynamika=copy.deepcopy(_BLOK_WLASNY)))
    wynik = _wiaz(enm, "g1", None)
    assert _gen(wynik, "g1")["dynamika"]["proweniencja"]["zrodlo"] == "karta_producenta"
    assert stan_dynamiki_generatorow(wynik["snapshot"])[0].stan == "wlasny"


def test_wiazanie_ma_pierwszenstwo_przed_blokiem_wlasnym() -> None:
    enm = _enm(_generator("g1", "pv_inverter", dynamika=copy.deepcopy(_BLOK_WLASNY)))
    wynik = _wiaz(enm, "g1", "default_pv_gfl")
    assert _gen(wynik, "g1")["dynamika"]["proweniencja"]["zrodlo"] == "profil_typowy_normy"


def test_to_samo_wiazanie_daje_te_sama_kopie_deterministycznie() -> None:
    a = _wiaz(_enm(_generator("g1", "fw_dfig")), "g1", "default_wind_type_3")
    b = _wiaz(_enm(_generator("g1", "fw_dfig")), "g1", "default_wind_type_3")
    assert _gen(a, "g1")["dynamika"] == _gen(b, "g1")["dynamika"]
    # Synchronizacja migawki z kopią aktualną nie zmienia NIC (ten sam obiekt).
    assert synchronizuj_dynamike_z_wiazan(a["snapshot"]) is a["snapshot"]


# ---------------------------------------------------------------------------
# Tabliczka: moc jednostki × liczba jednostek × magazyn
# ---------------------------------------------------------------------------


def test_baza_mocy_to_moc_jednostki_razy_liczba_jednostek() -> None:
    wynik = _wiaz(
        _enm(_generator("g1", "pv_inverter", sn_mva=0.5, quantity=4)), "g1", "default_pv_gfl"
    )
    assert _gen(wynik, "g1")["dynamika"]["s_n_mva"] == pytest.approx(2.0)


def test_brak_mocy_jednostki_zostawia_wiazanie_bez_kopii_z_powodem() -> None:
    wynik = _wiaz(_enm(_generator("g1", "pv_inverter", sn_mva=None)), "g1", "default_pv_gfl")
    assert wynik.get("error") is None
    generator = _gen(wynik, "g1")
    assert generator["materialized_params"]["dynamic_model_ref"] == "default_pv_gfl"
    assert generator.get("dynamika") is None
    stan = stan_dynamiki_generatorow(wynik["snapshot"])[0]
    assert (stan.stan, stan.odmowa_kod) == ("odmowa", KOD_TABLICZKA_BRAK)


@pytest.mark.parametrize("profil", ["default_bess_gfl", "default_bess_gfm"])
def test_magazyn_bez_danych_zasobnika_odmawia_nazwanym_kodem(profil: str) -> None:
    """Profil BESS opisuje przekształtnik; kontrakt `Magazyn` wymaga sprawności i granic
    SOC, których nie ma katalog — kopia NIE powstaje, zamiast innej rodziny urządzenia."""
    wynik = _wiaz(_enm(_generator("g1", "bess")), "g1", profil)
    assert wynik.get("error") is None
    assert _gen(wynik, "g1").get("dynamika") is None
    stan = stan_dynamiki_generatorow(wynik["snapshot"])[0]
    # Karta OD-17a: brak danych zasobnika z karty producenta = nazwana odmowa braku pakietu
    # kart producentów (kod w polu); początkowy stan naładowania NIE jest daną karty
    # (warunek początkowy punktu pracy, O-57 pkt 3), więc nie należy do tej odmowy.
    assert (stan.stan, stan.odmowa_kod) == ("odmowa", KOD_BRAKU_KARTY_ZASOBNIKA)
    komunikat = stan.odmowa_komunikat or ""
    for opis in ("sprawność ładowania", "sprawność rozładowania", "stan naładowania"):
        assert opis in komunikat
    assert "początkowy stan naładowania" not in komunikat
    assert "soc_" not in komunikat and "sprawnosc_" not in komunikat


# ---------------------------------------------------------------------------
# Rodzaj odmowy × treść dla projektanta (karty #142 i #144: nazwy, nie identyfikatory)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("gen_type", "profil", "sn_mva", "kod"),
    [
        ("pv_inverter", "profil_nieistniejacy", 2.0, "der_bindings.catalog_ref_unknown"),
        ("synchronous", "default_pv_gfl", 2.0, KOD_RODZINA_BEZ_PROFILI),
        ("pv_inverter", "default_wind_type_3", 2.0, KOD_PROFIL_NIEZGODNY),
        ("pv_inverter", "default_pv_gfl", None, KOD_TABLICZKA_BRAK),
        ("bess", "default_bess_gfl", 2.0, KOD_BRAKU_KARTY_ZASOBNIKA),
    ],
)
def test_kazda_odmowa_nazywa_wytworce_i_profil_bez_identyfikatorow(
    gen_type: str, profil: str, sn_mva: float | None, kod: str
) -> None:
    """Każdy rodzaj odmowy materializacji: wytwórca nazwą z modelu, profil nazwą z katalogu,
    rodzaj wytwórcy słowem formularza — ani `ref_id`, ani identyfikator profilu, ani kod
    rodzaju w treści (kod błędu zostaje w polu maszynowym)."""
    generator = _generator("gen-x-01", gen_type, sn_mva=sn_mva)
    with pytest.raises(BladMaterializacjiDynamiki) as odmowa:
        materializuj_dynamike(profil, generator)
    assert odmowa.value.kod == kod
    tresc = odmowa.value.komunikat
    assert "„Wytwórca gen-x-01”" in tresc
    assert "gen-x-01”" in tresc and "'gen-x-01'" not in tresc
    for identyfikator in (profil, gen_type, "sn_mva"):
        assert identyfikator not in tresc.replace("„Wytwórca gen-x-01”", ""), tresc
    if kod in (KOD_PROFIL_NIEZGODNY, KOD_BRAKU_KARTY_ZASOBNIKA):
        assert f"„{get_profile(profil).profile_name_pl}”" in tresc


def test_wytworca_bez_nazwy_ma_opis_rodzaju_a_nie_identyfikator() -> None:
    """Stan wytwórcy bez nazwy w modelu: opis rodzaju z jednego źródła nazw (karta #144)."""
    generator = _generator("gen-bez-nazwy", "pv_inverter", name="")
    stan = stan_dynamiki_generatorow(_enm(generator))[0]
    assert stan.nazwa == "Generator bez nazwy"
    with pytest.raises(BladMaterializacjiDynamiki) as odmowa:
        materializuj_dynamike("default_wind_type_3", generator)
    assert "gen-bez-nazwy" not in odmowa.value.komunikat


# ---------------------------------------------------------------------------
# Zmiana tabliczki: operacja inna niż wiązanie × migawka z pominięciem operacji
# ---------------------------------------------------------------------------


def test_dowolna_operacja_przelicza_kopie_po_zmianie_tabliczki() -> None:
    """Klasa operacji zmieniających tabliczkę: synchronizacja jest w `_response`, więc
    obejmuje KAŻDĄ operację — tu wiązanie niezwiązane z dynamiką (przekładnik CT)."""
    zwiazany = _wiaz(_enm(_generator("g1", "pv_inverter", sn_mva=2.0)), "g1", "default_pv_gfl")
    migawka = copy.deepcopy(zwiazany["snapshot"])
    migawka["generators"][0]["materialized_params"]["sn_mva"] = 3.0
    wynik = execute_domain_operation(
        migawka,
        "set_der_catalog_bindings",
        {"generator_ref": "g1", "ct_catalog_ref": "ct_200_5_5p10_10va_abb"},
    )
    assert wynik.get("error") is None, wynik.get("error")
    assert _gen(wynik, "g1")["dynamika"]["s_n_mva"] == pytest.approx(3.0)


def test_operacja_usuwa_kopie_gdy_tabliczka_przestala_wystarczac() -> None:
    zwiazany = _wiaz(_enm(_generator("g1", "pv_inverter")), "g1", "default_pv_gfl")
    migawka = copy.deepcopy(zwiazany["snapshot"])
    del migawka["generators"][0]["materialized_params"]["sn_mva"]
    wynik = execute_domain_operation(
        migawka,
        "set_der_catalog_bindings",
        {"generator_ref": "g1", "ct_catalog_ref": "ct_200_5_5p10_10va_abb"},
    )
    assert _gen(wynik, "g1").get("dynamika") is None


def test_kopia_nieaktualna_w_migawce_odmawia_bieg_i_gotowosc_parami() -> None:
    """Migawka zapisana z pominięciem operacji: kopia inna niż materializacja wiązania.
    Bramka gotowości i bramka biegu czytają TEN SAM predykat (`braki_kopii_dynamiki`)."""
    zwiazany = _wiaz(_enm(_generator("g1", "pv_inverter")), "g1", "default_pv_gfl")
    aktualna = zwiazany["snapshot"]
    nieaktualna = copy.deepcopy(aktualna)
    nieaktualna["generators"][0]["dynamika"]["pll_kp"] = 7.0
    bez_tabliczki_z_blokiem = copy.deepcopy(aktualna)
    del bez_tabliczki_z_blokiem["generators"][0]["materialized_params"]["sn_mva"]

    for migawka, oczekiwane in (
        (aktualna, ()),
        (nieaktualna, ("g1",)),
        (bez_tabliczki_z_blokiem, ("g1",)),
    ):
        assert braki_kopii_dynamiki(migawka) == oczekiwane
        gotowosc = CalculationReadinessService().evaluate_single(
            EnergyNetworkModel.model_validate(migawka), "dynamika_rms", punkt_pracy_rozplywu=True
        )
        zablokowana_kopia = KOD_KOPIA_NIEAKTUALNA in " ".join(gotowosc.missing_fields_pl)
        if oczekiwane:
            with pytest.raises(OdmowaKopiiDynamiki) as odmowa:
                odmow_gdy_kopia_nieaktualna(migawka)
            assert KOD_KOPIA_NIEAKTUALNA in str(odmowa.value)
            # Treść nazywa wytwórcę nazwą z modelu; identyfikator zostaje w `elementy`.
            assert "„Wytwórca g1”" in str(odmowa.value) and odmowa.value.elementy == ("g1",)
            assert zablokowana_kopia and gotowosc.status == "blocked"
        else:
            odmow_gdy_kopia_nieaktualna(migawka)
            assert not zablokowana_kopia


def test_profil_typu_jest_podpowiedzia_a_nie_kopia() -> None:
    """Profil wskazany przez TYP katalogowy nie tworzy kopii bez jawnego wyboru (W6-1)."""
    enm = _enm(_generator("g1", "pv_inverter"))
    enm["generators"][0]["materialized_params"]["dynamic_profile_id"] = "default_pv_gfm"
    wynik = execute_domain_operation(
        enm, "set_der_catalog_bindings", {"generator_ref": "g1", "ct_catalog_ref": None}
    )
    assert _gen(wynik, "g1").get("dynamika") is None
    stan = stan_dynamiki_generatorow(wynik["snapshot"])[0]
    assert (stan.stan, stan.profil_typu) == ("brak", "default_pv_gfm")


def test_materializacja_kazdego_profilu_katalogu_jest_zbadana() -> None:
    """Pomiar katalogu (karta AB-P1 §0.3): każdy profil ma rodzaj wytwórcy, dla którego
    materializuje się do kopii, ALBO nazwany powód, dlaczego nie."""
    wyniki: dict[str, str] = {}
    for profil in list_all_profile_ids():
        rodzaje = [
            g
            for g in ("pv_inverter", "bess", "fw_scig", "fw_dfig", "fw_pmsg", "wind_inverter")
            if profil in profile_zgodne(g)
        ]
        if not rodzaje:
            wyniki[profil] = "brak rodzaju wytwórcy"
            continue
        try:
            materializuj_dynamike(profil, _generator("g1", rodzaje[0]))
        except BladMaterializacjiDynamiki as blad:
            wyniki[profil] = blad.kod
        else:
            wyniki[profil] = "kopia"
    assert wyniki == {
        "default_bess_gfl": KOD_BRAKU_KARTY_ZASOBNIKA,
        "default_bess_gfm": KOD_BRAKU_KARTY_ZASOBNIKA,
        "default_pv_gfl": "kopia",
        "default_pv_gfm": "kopia",
        "default_wind_type_1": "kopia",
        "default_wind_type_2": "brak rodzaju wytwórcy",
        "default_wind_type_3": "kopia",
        "default_wind_type_4": "kopia",
    }
    assert get_profile("default_wind_type_2").iec_type == "type_2"
