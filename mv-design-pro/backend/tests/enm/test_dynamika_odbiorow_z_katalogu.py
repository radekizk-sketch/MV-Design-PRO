"""Model dynamiczny ODBIORU z katalogu profili (karta modeli odbiorów, decyzja O-56).

Blok `Load.dynamika` jest KOPIĄ profilu katalogu `load_dynamic`, związanego z odbiorem jedną
operacją (`set_load_dynamic_binding`); kopię buduje jedna funkcja materializacji z profilu i
KSZTAŁTU charakterystyki odbioru (pola, których równania nie czytają, zostają puste). Testy
jako ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):

* kształt charakterystyki {stała moc bez wielomianu, czysty Z, czysty I, mieszany ZIP}
  × czułość częstotliwościowa {brak, k_pf, k_qf} — kopia wobec tablicy użycia pól;
* wiązanie {nowe, powtórzone, odwiązanie, profil nieznany, odbiór nieznany, brak odbioru,
  brak klucza wiązania, współczynniki odrzucone przez rozpływ} — odmowa bez skutku w modelu;
* droga zmiany kształtu {operacja wiązania, dowolna inna operacja (synchronizacja w
  `_response`), migawka zapisana z pominięciem operacji (bramka biegu i gotowości)};
* stan odbioru {z_katalogu, brak, nieaktualna, odmowa} — ten sam predykat w gotowości i biegu.
"""

from __future__ import annotations

import copy
from uuid import NAMESPACE_URL, uuid5

import pytest
from application.calculation_readiness.service import CalculationReadinessService
from enm.domain_operations import execute_domain_operation
from enm.dynamika_z_katalogu import (
    KOD_KOPIA_NIEAKTUALNA,
    KOD_PROFIL_ODBIORU_NIEZNANY,
    KOD_WSPOLCZYNNIKI_ODBIORU,
    BladMaterializacjiDynamiki,
    OdmowaKopiiDynamiki,
    braki_kopii_dynamiki,
    materializuj_dynamike_odbioru,
    odmow_gdy_kopia_nieaktualna,
    profile_odbiorow,
    stan_dynamiki_odbiorow,
)
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.catalog.load_dynamic import (
    PROFILE_ODBIOROW,
    get_load_profile,
    list_load_profile_ids,
)

PROFIL = "load_dyn_zagregowany_sn"

#: Kształt charakterystyki odbioru (współczynniki rozpływu w `materialized_params`).
KSZTALTY: dict[str, dict[str, float]] = {
    "stala_moc": {},
    "czysty_z": {"a_p": 1.0, "b_p": 0.0, "c_p": 0.0, "a_q": 1.0, "b_q": 0.0, "c_q": 0.0},
    "czysty_i": {"a_p": 0.0, "b_p": 1.0, "c_p": 0.0, "a_q": 0.0, "b_q": 1.0, "c_q": 0.0},
    "mieszany": {"a_p": 0.5, "b_p": 0.3, "c_p": 0.2, "a_q": 0.2, "b_q": 0.3, "c_q": 0.5},
}
CZULOSCI: dict[str, dict[str, float]] = {
    "brak": {},
    "k_pf": {"k_pf": 1.5},
    "k_qf": {"k_qf": -0.8},
}


def _uzycie_pol(ksztalt: str, czulosc: str) -> tuple[bool, bool]:
    """(U_min czytane, T_f czytane) z równań modelu — spisane NIEZALEŻNIE od rdzenia."""
    return ksztalt != "czysty_z", czulosc != "brak"


def _odbior(ref: str, parametry: dict | None, *, nazwa: str | None = None) -> dict:
    return {
        "id": str(uuid5(NAMESPACE_URL, f"load:{ref}")),
        "ref_id": ref,
        "name": nazwa if nazwa is not None else f"Odbiór {ref}",
        "tags": [],
        "meta": {},
        "bus_ref": "bus_1",
        "p_mw": 1.0,
        "q_mvar": 0.3,
        "materialized_params": parametry,
    }


def _enm(*odbiory: dict) -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="odbiory-z-katalogu", defaults=ENMDefaults(sn_nominal_kv=15.0)),
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
    enm["loads"] = list(odbiory)
    return enm


def _wiaz(enm: dict, ref: str | None, profil: str | None) -> dict:
    payload: dict = {"dynamic_model_ref": profil}
    if ref is not None:
        payload["load_ref"] = ref
    return execute_domain_operation(enm, "set_load_dynamic_binding", payload)


def _load(wynik: dict, ref: str) -> dict:
    return next(o for o in wynik["snapshot"]["loads"] if o["ref_id"] == ref)


# ---------------------------------------------------------------------------
# Kształt × czułość — kopia wobec tablicy użycia pól
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("czulosc", sorted(CZULOSCI))
@pytest.mark.parametrize("ksztalt", sorted(KSZTALTY))
def test_kopia_niesie_dokladnie_pola_czytane_przez_rownania(ksztalt: str, czulosc: str) -> None:
    parametry = {**KSZTALTY[ksztalt], **CZULOSCI[czulosc]} or None
    wynik = _wiaz(_enm(_odbior("o1", parametry)), "o1", PROFIL)
    assert wynik.get("error") is None, wynik.get("error")
    odbior = _load(wynik, "o1")
    profil = get_load_profile(PROFIL)
    u_min_uzyte, t_f_uzyte = _uzycie_pol(ksztalt, czulosc)
    assert odbior["materialized_params"]["dynamic_model_ref"] == PROFIL
    assert odbior["dynamika"] == {
        "proweniencja": profil.proweniencja.model_dump(mode="json"),
        "u_min_pu": profil.u_min_pu if u_min_uzyte else None,
        "t_pomiaru_czestotliwosci_s": profil.t_pomiaru_czestotliwosci_s if t_f_uzyte else None,
    }
    (stan,) = stan_dynamiki_odbiorow(wynik["snapshot"])
    assert (stan.stan, stan.wiazanie, stan.czuly_czestotliwosciowo) == (
        "z_katalogu",
        PROFIL,
        t_f_uzyte,
    )
    assert braki_kopii_dynamiki(wynik["snapshot"]) == ()


def test_to_samo_wiazanie_daje_te_sama_kopie_deterministycznie() -> None:
    pierwszy = _wiaz(_enm(_odbior("o1", dict(KSZTALTY["mieszany"]))), "o1", PROFIL)
    drugi = _wiaz(pierwszy["snapshot"], "o1", PROFIL)
    assert _load(pierwszy, "o1") == _load(drugi, "o1")


def test_odwiazanie_usuwa_wiazanie_i_kopie_razem() -> None:
    zwiazany = _wiaz(_enm(_odbior("o1", None)), "o1", PROFIL)
    odwiazany = _wiaz(zwiazany["snapshot"], "o1", None)
    odbior = _load(odwiazany, "o1")
    assert odbior.get("dynamika") is None and odbior["materialized_params"] is None
    (stan,) = stan_dynamiki_odbiorow(odwiazany["snapshot"])
    assert stan.stan == "brak"


def test_odwiazanie_zostawia_wspolczynniki_charakterystyki() -> None:
    zwiazany = _wiaz(_enm(_odbior("o1", dict(KSZTALTY["czysty_i"]))), "o1", PROFIL)
    odbior = _load(_wiaz(zwiazany["snapshot"], "o1", None), "o1")
    assert odbior["materialized_params"] == KSZTALTY["czysty_i"]


@pytest.mark.parametrize(
    ("ref", "payload_bez_klucza", "profil", "parametry", "kod"),
    [
        (None, False, PROFIL, None, "load_bindings.load_missing"),
        ("o1", True, PROFIL, None, "load_bindings.payload_empty"),
        ("o-nieistniejacy", False, PROFIL, None, "load_bindings.load_not_found"),
        ("o1", False, "profil_nieistniejacy", None, KOD_PROFIL_ODBIORU_NIEZNANY),
        (
            "o1",
            False,
            PROFIL,
            {"a_p": 0.7, "b_p": 0.0, "c_p": 0.0},
            KOD_WSPOLCZYNNIKI_ODBIORU,
        ),
    ],
)
def test_odmowa_operacji_nazwana_i_bez_skutku(
    ref: str | None, payload_bez_klucza: bool, profil: str, parametry: dict | None, kod: str
) -> None:
    enm = _enm(_odbior("o1", parametry, nazwa="Odbiór stacji Wschód"))
    przed = copy.deepcopy(enm)
    if payload_bez_klucza:
        wynik = execute_domain_operation(enm, "set_load_dynamic_binding", {"load_ref": ref})
    else:
        wynik = _wiaz(enm, ref, profil)
    assert wynik["error_code"] == kod
    assert wynik["snapshot"] is None
    assert enm == przed, "odmowa operacji nie może zostawić skutku w modelu"
    # Komunikat nazywa odbiór NAZWĄ (gdy go dotyczy) — nigdy identyfikatorem.
    assert "o1" not in str(wynik.get("error"))


# ---------------------------------------------------------------------------
# Droga zmiany kształtu: dowolna operacja synchronizuje kopię
# ---------------------------------------------------------------------------


def test_dowolna_operacja_przelicza_kopie_po_zmianie_ksztaltu() -> None:
    """Klasa operacji: synchronizacja jest w `_response`, więc obejmuje KAŻDĄ operację — tu
    wiązanie INNEGO odbioru po dopisaniu czułości częstotliwościowej pierwszemu."""
    zwiazany = _wiaz(_enm(_odbior("o1", None), _odbior("o2", None)), "o1", PROFIL)
    migawka = copy.deepcopy(zwiazany["snapshot"])
    migawka["loads"][0]["materialized_params"]["k_pf"] = 1.0
    assert braki_kopii_dynamiki(migawka) == ("o1",)
    wynik = _wiaz(migawka, "o2", PROFIL)
    assert wynik.get("error") is None, wynik.get("error")
    assert _load(wynik, "o1")["dynamika"]["t_pomiaru_czestotliwosci_s"] == pytest.approx(
        get_load_profile(PROFIL).t_pomiaru_czestotliwosci_s
    )
    assert braki_kopii_dynamiki(wynik["snapshot"]) == ()


def test_operacja_usuwa_kopie_gdy_wspolczynniki_staly_sie_niepoprawne() -> None:
    zwiazany = _wiaz(
        _enm(_odbior("o1", None, nazwa="Odbiór stacji Wschód"), _odbior("o2", None)), "o1", PROFIL
    )
    migawka = copy.deepcopy(zwiazany["snapshot"])
    migawka["loads"][0]["materialized_params"].update({"a_p": 0.7, "c_p": 0.0})
    wynik = _wiaz(migawka, "o2", PROFIL)
    assert _load(wynik, "o1").get("dynamika") is None
    stan = next(s for s in stan_dynamiki_odbiorow(wynik["snapshot"]) if s.ref_id == "o1")
    assert (stan.stan, stan.odmowa_kod) == ("odmowa", KOD_WSPOLCZYNNIKI_ODBIORU)
    komunikat = stan.odmowa_komunikat or ""
    # Nazwa z modelu, zmierzone udziały po polsku — bez identyfikatora i bez angielskiego
    # tekstu solvera rozpływu.
    assert "„Odbiór stacji Wschód”" in komunikat and "o1" not in komunikat
    assert "(suma 0.700000)" in komunikat
    assert "must" not in komunikat and "coefficients" not in komunikat


# ---------------------------------------------------------------------------
# Kopia nieaktualna: bieg i gotowość parami
# ---------------------------------------------------------------------------


def test_kopia_nieaktualna_w_migawce_odmawia_bieg_i_gotowosc_parami() -> None:
    """Migawka zapisana z pominięciem operacji. Bramka gotowości i bramka biegu czytają TEN
    SAM predykat (`braki_kopii_dynamiki`) — dla odbiorów tak samo jak dla wytwórców."""
    aktualna = _wiaz(_enm(_odbior("o1", None)), "o1", PROFIL)["snapshot"]
    zmieniona = copy.deepcopy(aktualna)
    zmieniona["loads"][0]["dynamika"]["u_min_pu"] = 0.5
    blok_bez_wiazania = copy.deepcopy(aktualna)
    del blok_bez_wiazania["loads"][0]["materialized_params"]["dynamic_model_ref"]
    wiazanie_bez_bloku = copy.deepcopy(aktualna)
    wiazanie_bez_bloku["loads"][0]["dynamika"] = None

    for migawka, oczekiwane, stan_oczekiwany in (
        (aktualna, (), "z_katalogu"),
        (zmieniona, ("o1",), "nieaktualna"),
        (blok_bez_wiazania, ("o1",), "nieaktualna"),
        (wiazanie_bez_bloku, ("o1",), "nieaktualna"),
    ):
        assert braki_kopii_dynamiki(migawka) == oczekiwane
        (stan,) = stan_dynamiki_odbiorow(migawka)
        assert stan.stan == stan_oczekiwany
        gotowosc = CalculationReadinessService().evaluate_single(
            EnergyNetworkModel.model_validate(migawka), "dynamika_rms", punkt_pracy_rozplywu=True
        )
        zablokowana_kopia = KOD_KOPIA_NIEAKTUALNA in " ".join(gotowosc.missing_fields_pl)
        if oczekiwane:
            with pytest.raises(OdmowaKopiiDynamiki) as odmowa:
                odmow_gdy_kopia_nieaktualna(migawka)
            assert "„Odbiór o1”" in str(odmowa.value) and odmowa.value.elementy == ("o1",)
            assert zablokowana_kopia and gotowosc.status == "blocked"
            assert "odbiór „Odbiór o1”" in " ".join(gotowosc.missing_fields_pl)
        else:
            odmow_gdy_kopia_nieaktualna(migawka)
            assert not zablokowana_kopia


# ---------------------------------------------------------------------------
# Katalog profili odbiorów
# ---------------------------------------------------------------------------


def test_katalog_profili_zero_domyslek_jakosc_i_podstawy() -> None:
    assert list_load_profile_ids() == tuple(p.profile_id for p in PROFILE_ODBIOROW)
    for profil in PROFILE_ODBIOROW:
        assert profil.jakosc == "ESTIMATED"
        assert 0.0 < profil.u_min_pu < 1.0 and profil.t_pomiaru_czestotliwosci_s > 0.0
        assert profil.podstawa_u_min_pl and profil.podstawa_t_pomiaru_pl and profil.opis_pl
        assert profil.proweniencja.zrodlo == "profil_typowy_normy"
    with pytest.raises(KeyError):
        get_load_profile("profil_nieistniejacy")
    # Pola profilu nie mają wartości domyślnych — profil bez danej się nie buduje.
    with pytest.raises(ValueError):
        type(PROFILE_ODBIOROW[0])(profile_id="x", profile_name_pl="x")


def test_lista_profili_dla_ekranu_to_ten_sam_katalog() -> None:
    assert [p["profile_id"] for p in profile_odbiorow()] == list(list_load_profile_ids())


@pytest.mark.parametrize("czulosc", sorted(CZULOSCI))
@pytest.mark.parametrize("ksztalt", sorted(KSZTALTY))
@pytest.mark.parametrize("profil", list_load_profile_ids())
def test_kazdy_profil_materializuje_sie_dla_kazdego_ksztaltu(
    profil: str, ksztalt: str, czulosc: str
) -> None:
    kopia = materializuj_dynamike_odbioru(
        profil,
        _odbior("o1", {**KSZTALTY[ksztalt], **CZULOSCI[czulosc]} or None),
        50.0,
    )
    u_min_uzyte, t_f_uzyte = _uzycie_pol(ksztalt, czulosc)
    assert (kopia["u_min_pu"] is not None, kopia["t_pomiaru_czestotliwosci_s"] is not None) == (
        u_min_uzyte,
        t_f_uzyte,
    )


def test_materializacja_nieznanego_profilu_to_odmowa_nazwana() -> None:
    with pytest.raises(BladMaterializacjiDynamiki) as blad:
        materializuj_dynamike_odbioru("profil_nieistniejacy", _odbior("o1", None), 50.0)
    assert blad.value.kod == KOD_PROFIL_ODBIORU_NIEZNANY
    assert "„Odbiór o1”" in blad.value.komunikat
