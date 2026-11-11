"""Jedna reguła zapisu sterownika zabezpieczeń dla każdego pisarza (karta OCHRONA-JEDNO-ZRODLO).

Deklaracja modułu ``enm.nastawy_zabezpieczen``: „JEDNA dla każdego pisarza i odczytu" — zapis
przyjmuje nastawy NIEKOMPLETNE (brak nazywa ocena), odrzuca SPRZECZNE i zapisuje postać
deterministyczną (nastawy funkcji posortowane po kluczu, funkcje grupy w kolejności funkcji
sterownika, grupy po numerze). Ten test przypina deklarację: gdyby któryś pisarz przepuszczał
sprzeczność albo zapisywał w innej postaci, ten sam model dawałby różne migawki zależnie od drogi
zapisu, a wczytanie migawki (kontrakt ``ProtectionAssignment`` woła tę samą regułę) odrzuciłoby
zapis, który operacja przyjęła.

Iloczyn cech:
  pisarz {``update_protection_settings`` (operacja domenowa V2), ``attach_protection``,
          ``update_protection`` (operacje topologiczne)} ×
  grupa {1, 2, 3, 4} × nastawy {komplet, niekompletne ×2 (bez nastaw; próg ze stroną bez
          charakterystyki) — przyjęte; sprzeczne ×13 — odrzucone} ×
  skutek {odmowa: model wejściowy nietknięty i brak nowego sterownika, kod odmowy operacji V2
          ``relay.settings_invalid``; przyjęcie: ta sama postać zapisu z każdego pisarza i dla
          wejścia w odwróconej kolejności}.
``add_relay`` NIE pisze nastaw (dodaje sterownik z funkcjami i wiązaniami wejść; nastawy pisze
wyłącznie ``update_protection_settings``) — przypięte osobnym testem.
Sieć: G08 bez przekaźników (magistrala z wyłącznikiem liniowym i przekładnikiem z katalogu),
budowana operacjami domenowymi.
"""

from __future__ import annotations

import copy
from functools import cache
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import ProtectionAssignment
from enm.nastawy_zabezpieczen import NUMERY_GRUP_NASTAW, bledy_sterownika
from enm.topology_ops import attach_protection, update_protection
from enm.zabezpieczenie import zapisz_nastawy_funkcji

from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    KATALOG_APARATU,
    KATALOG_PRZEKAZNIKA,
    KATALOG_PRZEKLADNIKA,
    NASTAWY_Q1,
    POLOZENIE_WYLACZNIKA,
    operacja,
    siec_magistrali,
)

Nastawy = dict[str, dict[str, Any]]

KOMPLET: Nastawy = copy.deepcopy(NASTAWY_Q1)

NIEKOMPLETNE: dict[str, Nastawy] = {
    "bez_nastaw": {"51": {}},
    "prog_bez_charakterystyki": {"51": {"prog": 2.0, "jednostka_progu": "A_WTORNY"}},
}

_I51 = {"prog": 2.0, "jednostka_progu": "A_WTORNY"}

SPRZECZNE: dict[str, Nastawy] = {
    "prog_niedodatni": {"51": {**_I51, "prog": 0.0, "krzywa": "DT", "zwloka_s": 0.3}},
    "prog_bez_jednostki": {"51": {"prog": 2.0, "krzywa": "DT", "zwloka_s": 0.3}},
    "prog_nie_liczba": {"51": {**_I51, "prog": "2,0"}},
    "jednostka_spoza_listy": {"51": {"prog": 2.0, "jednostka_progu": "kA"}},
    "krzywa_spoza_listy": {"51": {**_I51, "krzywa": "IEC_XX", "tms": 0.2}},
    "mnoznik_niedodatni": {"51": {**_I51, "krzywa": "IEC_SI", "tms": -0.1}},
    "zwloka_ujemna": {"51": {**_I51, "krzywa": "DT", "zwloka_s": -0.1}},
    "zwloka_zero_funkcji_pradowej": {"51": {**_I51, "krzywa": "DT", "zwloka_s": 0.0}},
    "zwloka_przy_charakterystyce_zaleznej": {
        "51": {**_I51, "krzywa": "IEC_SI", "tms": 0.2, "zwloka_s": 0.3}
    },
    "mnoznik_przy_czasie_niezaleznym": {
        "51": {**_I51, "krzywa": "DT", "zwloka_s": 0.3, "tms": 0.2}
    },
    "nastawa_spoza_schematu_funkcji": {"51": {**_I51, "prog_hz": 50.0}},
    "nastawa_pradowa_w_funkcji_czestotliwosciowej": {"50": {"prog_hz_s": 2.0}},
    "funkcja_spoza_sterownika": {"81R": {"prog_hz_s": 2.0}},
}


@cache
def _siec_bazowa() -> tuple[dict[str, Any], str, str]:
    """G08 bez przekaźnika: wyłącznik liniowy na odcinku GPZ i przekładnik z katalogu."""
    enm, odcinek_gpz, _odcinek_s01 = siec_magistrali()
    przed = {g["ref_id"] for g in enm["branches"]}
    enm = operacja(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": odcinek_gpz,
            "insert_at": {"mode": "RATIO", "value": POLOZENIE_WYLACZNIKA},
            "switch_type": "WYLACZNIK",
            "catalog_ref": KATALOG_APARATU,
            "switch_name": "Wyłącznik liniowy testu",
        },
    )
    (wylacznik,) = (
        g["ref_id"] for g in enm["branches"] if g["ref_id"] not in przed and g["type"] == "breaker"
    )
    wynik_ct = execute_domain_operation(
        enm,
        "add_ct",
        {
            "breaker_ref": wylacznik,
            "catalog_ref": KATALOG_PRZEKLADNIKA,
            "ratio_primary_a": 600.0,
            "ratio_secondary_a": 5.0,
            "accuracy_class": "5P20",
            "burden_va": 15.0,
            "name": "Przekładnik testu",
        },
    )
    assert wynik_ct.get("error") is None, wynik_ct.get("error")
    return wynik_ct["snapshot"], wylacznik, wynik_ct["selection_hint"]["element_id"]


def _siec() -> tuple[dict[str, Any], str, str]:
    enm, wylacznik, przekladnik = _siec_bazowa()
    return copy.deepcopy(enm), wylacznik, przekladnik


def _add_relay(enm: dict[str, Any], wylacznik: str, przekladnik: str) -> dict[str, Any]:
    return execute_domain_operation(
        enm,
        "add_relay",
        {
            "breaker_ref": wylacznik,
            "wejscia": {"ct_ref": przekladnik},
            "relay_type": "NADPRADOWY",
            "catalog_ref": KATALOG_PRZEKAZNIKA,
            "name": "Zabezpieczenie testu",
        },
    )


def _siec_z_przekaznikiem() -> tuple[dict[str, Any], str]:
    enm, wylacznik, przekladnik = _siec()
    wynik = _add_relay(enm, wylacznik, przekladnik)
    assert wynik.get("error") is None, wynik.get("error")
    return wynik["snapshot"], wynik["selection_hint"]["element_id"]


def _rekord_z_nastawami(
    enm: dict[str, Any], ref: str, nastawy: Nastawy, grupa: int
) -> dict[str, Any]:
    """Rekord sterownika ``ref`` z nastawami zapisanymi wspólnym akcesorem domeny."""
    (rekord,) = (copy.deepcopy(p) for p in enm["protection_assignments"] if p["ref_id"] == ref)
    for funkcja_ref, wartosci in nastawy.items():
        zapisz_nastawy_funkcji(rekord, numer_grupy=grupa, funkcja_ref=funkcja_ref, nastawy=wartosci)
    if not any(g["numer"] == rekord["aktywna_grupa"] for g in rekord["grupy_nastaw"]):
        rekord["grupy_nastaw"] = sorted(
            [*rekord["grupy_nastaw"], {"numer": rekord["aktywna_grupa"], "funkcje": []}],
            key=lambda g: g["numer"],
        )
    return rekord


def _zapis(
    pisarz: str, nastawy: Nastawy, grupa: int
) -> tuple[bool, dict[str, Any], dict[str, Any], str | None]:
    """Wykonaj zapis wskazanym pisarzem. Zwraca (przyjęty, model przed, model po, kod odmowy);
    przy przyjęciu „model po” to migawka z zapisem, przy odmowie — model wejściowy po wywołaniu."""
    enm, zabezpieczenie = _siec_z_przekaznikiem()
    if pisarz == "attach_protection":
        rekord = _rekord_z_nastawami(enm, zabezpieczenie, nastawy, grupa)
        enm["protection_assignments"] = [
            p for p in enm["protection_assignments"] if p["ref_id"] != zabezpieczenie
        ]
        przed = copy.deepcopy(enm)
        wynik_topo = attach_protection(enm, rekord)
        return wynik_topo.success, przed, (wynik_topo.enm if wynik_topo.success else enm), None
    przed = copy.deepcopy(enm)
    if pisarz == "update_protection_settings":
        wynik = execute_domain_operation(
            enm,
            "update_protection_settings",
            {"protection_ref": zabezpieczenie, "grupa": grupa, "nastawy": nastawy},
        )
        if wynik.get("error") is not None:
            return False, przed, enm, wynik.get("error_code")
        return True, przed, wynik["snapshot"], None
    rekord = _rekord_z_nastawami(enm, zabezpieczenie, nastawy, grupa)
    wynik_topo = update_protection(
        enm, {"ref_id": zabezpieczenie, "grupy_nastaw": rekord["grupy_nastaw"]}
    )
    return wynik_topo.success, przed, (wynik_topo.enm if wynik_topo.success else enm), None


PISARZE = ("update_protection_settings", "attach_protection", "update_protection")


# Identyfikator sterownika testu (deterministyczny: `referencja_sterownika_pola` wyłącznika).
def _ref_testu() -> str:
    return _siec_z_przekaznikiem()[1]


def _sterownik(enm: dict[str, Any]) -> dict[str, Any]:
    ref = _ref_testu()
    (sterownik,) = (p for p in enm["protection_assignments"] if p["ref_id"] == ref)
    return sterownik


def _grupy(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return _sterownik(enm)["grupy_nastaw"]


def _wartosci(enm: dict[str, Any], grupa: int) -> dict[str, dict[str, Any]]:
    (wpis,) = (g for g in _grupy(enm) if g["numer"] == grupa)
    return {
        f["funkcja_ref"]: {n["klucz"]: n["wartosc"] for n in f["nastawy"]} for f in wpis["funkcje"]
    }


@pytest.mark.parametrize("grupa", NUMERY_GRUP_NASTAW)
@pytest.mark.parametrize("pisarz", PISARZE)
@pytest.mark.parametrize("nazwa,nastawy", [("komplet", KOMPLET), *NIEKOMPLETNE.items()])
def test_nastawy_kompletne_i_niekompletne_zapisane_w_jednej_postaci(
    pisarz: str, grupa: int, nazwa: str, nastawy: Nastawy
) -> None:
    przyjety, _przed, po, kod = _zapis(pisarz, copy.deepcopy(nastawy), grupa)
    assert przyjety, f"{pisarz} odrzucił nastawy {nazwa} (kod {kod})"
    oczekiwane = {f: dict(sorted(w.items())) for f, w in nastawy.items() if w}
    assert _wartosci(po, grupa) == oczekiwane
    # Migawka po zapisie wczytuje się kontraktem modelu (ta sama reguła co zapis).
    ProtectionAssignment.model_validate(_sterownik(po))
    # Ta sama treść w odwróconej kolejności daje ten sam zapis (determinizm migawki).
    odwrocone = {f: dict(reversed(list(w.items()))) for f, w in reversed(list(nastawy.items()))}
    przyjety_odwr, _p, po_odwr, _k = _zapis(pisarz, odwrocone, grupa)
    assert przyjety_odwr
    assert _grupy(po_odwr) == _grupy(po)


@pytest.mark.parametrize("pisarz", PISARZE)
@pytest.mark.parametrize("nazwa", sorted(SPRZECZNE))
def test_nastawy_sprzeczne_odrzucone_bez_skutku(pisarz: str, nazwa: str) -> None:
    nastawy = copy.deepcopy(SPRZECZNE[nazwa])
    przyjety, przed, po, kod = _zapis(pisarz, nastawy, 1)
    assert not przyjety, f"{pisarz} zapisał sprzeczne nastawy {nazwa}"
    assert po == przed, f"{pisarz} zmienił model wejściowy mimo odmowy ({nazwa})"
    if pisarz == "update_protection_settings":
        assert kod == "relay.settings_invalid"


def test_odmowa_operacji_nazywa_kazda_sprzecznosc_zdaniem_po_polsku() -> None:
    """Operacja zwraca w treści odmowy WSZYSTKIE zdania reguły (nie tylko pierwsze) — te same,
    które nazywa reguła wczytania modelu (`bledy_sterownika`)."""
    nastawy: Nastawy = {
        "51": {"prog": 2.0, "krzywa": "DT"},
        "50": {"prog": -1.0, "jednostka_progu": "A_WTORNY"},
    }
    enm, zabezpieczenie = _siec_z_przekaznikiem()
    rekord = _rekord_z_nastawami(enm, zabezpieczenie, nastawy, 1)
    zdania = bledy_sterownika(rekord)
    assert len(zdania) == 2
    odmowa = execute_domain_operation(
        enm,
        "update_protection_settings",
        {"protection_ref": zabezpieczenie, "nastawy": nastawy},
    )
    assert odmowa["error_code"] == "relay.settings_invalid"
    for zdanie in zdania:
        assert zdanie in odmowa["error"]


def test_add_relay_nie_pisze_nastaw_a_niesie_funkcje_wejscia_i_macierz() -> None:
    """``add_relay`` dodaje sterownik z funkcjami rodzaju, wejściem prądowym i macierzą wyzwoleń
    na wyłącznik kotwicy — bez nastaw (nazwany brak gotowości oceny, nie wartość domyślna; dawne
    domyślne 0,3 s DT dawało stałe 0,36 s czasu wyłączenia)."""
    enm, wylacznik, przekladnik = _siec()
    wynik = _add_relay(enm, wylacznik, przekladnik)
    assert wynik.get("error") is None, wynik.get("error")
    (sterownik,) = (
        p
        for p in wynik["snapshot"]["protection_assignments"]
        if p["ref_id"] == wynik["selection_hint"]["element_id"]
    )
    assert [f["kod"] for f in sterownik["funkcje"]] == ["50", "51"]
    assert sterownik["grupy_nastaw"] == []
    assert sterownik["wejscia"]["ct_ref"] == przekladnik
    assert {w["funkcja_ref"]: w["aparat_refs"] for w in sterownik["macierz_wyzwolen"]} == {
        "50": [wylacznik],
        "51": [wylacznik],
    }


def test_nastawy_w_grupie_nieaktywnej_nie_zmieniaja_grupy_aktywnej() -> None:
    """Zapis do grupy 2 zostawia grupę 1 (aktywną) nietkniętą, a zmiana aktywnej grupy to
    jedna wartość sterownika — nie kopia nastaw (predykat parami grupa zapisu × grupa czytana)."""
    enm, zabezpieczenie = _siec_z_przekaznikiem()
    enm = operacja(
        enm,
        "update_protection_settings",
        {"protection_ref": zabezpieczenie, "grupa": 1, "nastawy": KOMPLET},
    )
    druga = {"51": {**KOMPLET["51"], "tms": 0.5}}
    enm = operacja(
        enm,
        "update_protection_settings",
        {"protection_ref": zabezpieczenie, "grupa": 2, "nastawy": druga},
    )
    assert _wartosci(enm, 1) == {f: dict(sorted(w.items())) for f, w in KOMPLET.items()}
    assert _wartosci(enm, 2) == {"51": dict(sorted(druga["51"].items()))}
    assert _sterownik(enm)["aktywna_grupa"] == 1
    enm = operacja(
        enm, "update_protection_settings", {"protection_ref": zabezpieczenie, "aktywna_grupa": 2}
    )
    assert _sterownik(enm)["aktywna_grupa"] == 2
    assert _wartosci(enm, 1) == {f: dict(sorted(w.items())) for f, w in KOMPLET.items()}


# ---------------------------------------------------------------------------
# Bramka przekładnika prądowego ``add_relay`` — iloczyn: funkcja dokładana {prądowa, LoM bez
# prądu} × funkcja prądowa już w sterowniku {nie, tak} × przekładnik {brak}. Predykat parami:
# bramka pyta o funkcje DOKŁADANE (zbiór nowych kodów), brak wejścia funkcji istniejącej nazywa
# ocena (`enm.zabezpieczenie.brakujace_wejscia`).
# ---------------------------------------------------------------------------


@cache
def _siec_bez_przekladnika_bazowa() -> tuple[dict[str, Any], str]:
    enm, odcinek_gpz, _odcinek_s01 = siec_magistrali()
    przed = {g["ref_id"] for g in enm["branches"]}
    enm = operacja(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": odcinek_gpz,
            "insert_at": {"mode": "RATIO", "value": POLOZENIE_WYLACZNIKA},
            "switch_type": "WYLACZNIK",
            "catalog_ref": KATALOG_APARATU,
            "switch_name": "Wyłącznik liniowy bez przekładnika",
        },
    )
    (wylacznik,) = (
        g["ref_id"] for g in enm["branches"] if g["ref_id"] not in przed and g["type"] == "breaker"
    )
    return enm, wylacznik


def _relay_bez_ct(enm: dict[str, Any], wylacznik: str, funkcje: list[str]) -> dict[str, Any]:
    return execute_domain_operation(
        copy.deepcopy(enm),
        "add_relay",
        {
            "breaker_ref": wylacznik,
            "funkcje": funkcje,
            "catalog_ref": KATALOG_PRZEKAZNIKA,
            "name": "Sterownik bez przekładnika",
        },
    )


@pytest.mark.parametrize(
    ("istniejace", "dokladane", "odmowa"),
    [
        ([], ["51"], True),
        ([], ["81R"], False),
        (["51", "81R"], ["51", "81R", "81U"], False),
        (["51", "81R"], ["51", "81R", "81U", "50"], True),
    ],
    ids=["nowa_pradowa", "nowa_lom", "lom_przy_istniejacej_pradowej", "nowa_pradowa_przy_lom"],
)
def test_bramka_przekladnika_dotyczy_wylacznie_funkcji_dokladanych(
    istniejace: list[str], dokladane: list[str], odmowa: bool
) -> None:
    enm, wylacznik = _siec_bez_przekladnika_bazowa()
    if istniejace:
        pierwszy = _relay_bez_ct(enm, wylacznik, ["81R"])
        assert pierwszy.get("error") is None, pierwszy.get("error")
        enm = operacja(
            pierwszy["snapshot"],
            "update_protection_settings",
            {"protection_ref": pierwszy["selection_hint"]["element_id"], "funkcje": istniejace},
        )
    wynik = _relay_bez_ct(enm, wylacznik, dokladane)
    if odmowa:
        assert wynik.get("error_code") == "relay.ct_missing"
        return
    assert wynik.get("error") is None, wynik.get("error")
    (sterownik,) = (
        p
        for p in wynik["snapshot"]["protection_assignments"]
        if p["ref_id"] == wynik["selection_hint"]["element_id"]
    )
    assert sorted(f["kod"] for f in sterownik["funkcje"]) == sorted(
        set(istniejace) | set(dokladane)
    )


# ---------------------------------------------------------------------------
# Charakterystyki funkcji — odwołanie OSOBNE od wyrobu. Predykat parami: zapis przyjmuje profil
# wtedy i tylko wtedy, gdy ocena czyta go jako profil projektanta (jeden predykat
# `catalog_store.profil_charakterystyk`) — dla KAŻDEGO rekordu katalogu analitycznego.
# ---------------------------------------------------------------------------


def _profile_analityczne() -> list[str]:
    from application.analyses.protection.catalog.catalog_store import list_devices

    return [d.device_id for d in list_devices()]


@pytest.mark.parametrize("profil", [*_profile_analityczne(), "PROFIL-NIEISTNIEJACY"])
def test_zapis_profilu_charakterystyk_i_ocena_z_jednego_predykatu(profil: str) -> None:
    from application.analyses.protection.catalog.catalog_store import profil_charakterystyk
    from application.analyses.protection.ocena_nadpradowa import (
        ZRODLO_CHARAKTERYSTYK_PROJEKTANT,
        charakterystyki_sterownika,
    )
    from enm.models import EnergyNetworkModel

    enm, zabezpieczenie = _siec_z_przekaznikiem()
    przed = copy.deepcopy(enm)
    wynik = execute_domain_operation(
        enm,
        "update_protection_settings",
        {"protection_ref": zabezpieczenie, "charakterystyki_ref": profil},
    )
    uzyteczny = profil_charakterystyk(profil) is not None
    if not uzyteczny:
        assert wynik.get("error_code") == "relay.characteristics_invalid"
        # Odmowa nazywa sterownik NAZWĄ i nie niesie identyfikatora profilu (komunikaty
        # odmów bez identyfikatorów — strażnik ``odmowa_bez_identyfikatora_guard``).
        komunikat = str(wynik.get("error"))
        assert "„Zabezpieczenie testu”" in komunikat
        assert "profil charakterystyk" in komunikat
        assert profil not in komunikat
        assert enm == przed
        return
    assert wynik.get("error") is None, wynik.get("error")
    model = EnergyNetworkModel.model_validate(wynik["snapshot"])
    (sterownik,) = (p for p in model.protection_assignments if p.ref_id == zabezpieczenie)
    assert sterownik.charakterystyki_ref == profil
    assert sterownik.catalog_ref == KATALOG_PRZEKAZNIKA  # wyrób nietknięty
    charakterystyki, braki = charakterystyki_sterownika(model, sterownik)
    assert braki == []
    assert charakterystyki is not None
    assert (charakterystyki.zrodlo, charakterystyki.zdolnosc.device_id) == (
        ZRODLO_CHARAKTERYSTYK_PROJEKTANT,
        profil,
    )
    # ``None`` zdejmuje wskazanie — ocena wraca do profilu wyrobu (KATALOG_PRZEKAZNIKA).
    zdjete = operacja(
        wynik["snapshot"],
        "update_protection_settings",
        {"protection_ref": zabezpieczenie, "charakterystyki_ref": None},
    )
    (rekord,) = (p for p in zdjete["protection_assignments"] if p["ref_id"] == zabezpieczenie)
    assert rekord.get("charakterystyki_ref") is None


def test_brak_aktywnej_grupy_to_sprzecznosc_nie_grupa_1() -> None:
    """Sterownik bez ``aktywna_grupa`` nie dostaje zastępczej grupy 1 (ta wskazałaby po cichu
    inne nastawy niż wybrane): reguła zapisu nazywa brak, odczyt grupy efektywnej odmawia."""
    from enm.zabezpieczenie import aktywna_grupa_sterownika, numer_grupy_efektywnej

    sterownik = {"funkcje": [], "grupy_nastaw": [], "macierz_wyzwolen": []}
    assert "Sterownik nie wskazuje aktywnej grupy nastaw (1–4)." in bledy_sterownika(sterownik)
    with pytest.raises(ValueError, match="bez aktywnej grupy nastaw"):
        aktywna_grupa_sterownika(sterownik)
    with pytest.raises(ValueError, match="bez aktywnej grupy nastaw"):
        numer_grupy_efektywnej(sterownik)
    # Wybór przypadku (delta scenariusza) ma pierwszeństwo przed grupą bazową.
    assert numer_grupy_efektywnej(sterownik, 3) == 3
    assert numer_grupy_efektywnej({**sterownik, "aktywna_grupa": 2}) == 2
