"""Ochrona LoM: pole bez żadnego sprawdzenia nie jest „OK", a etykiety niesie rekord werdyktu.

Dawny `_field_status` zwracał „OK" dla pustej listy sprawdzeń — brak oceny wyglądał jak
ochrona poprawna. Stan docelowy: `NIE_OCENIONO` z wyjaśnieniem (czego brakuje, co zrobić).
Moduł nie ma słownika „status → etykieta": KAŻDE porównanie niesie rekord ``OcenaKryterium``,
pole — rekord ``WynikWymagania`` (agregacja §2.3), całość — rekord wymagania sieci; etykieta,
zdanie i braki pochodzą z rekordu (interfejs mapuje wyłącznie semantykę na kolor).
"""

from __future__ import annotations

from typing import Any

import application.analyses.ochrona_lom as ochrona_lom
import pytest
from application.analyses.ochrona_lom import (
    _FUNCTION_ORDER,
    _KRYTERIA_OKIEN,
    _ocena_pola,
    _pole_widoku,
    build_ochrona_lom_view,
)
from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    ProtectionAssignment,
    ProtectionSetting,
)
from werdykt import OcenaKryterium, WynikWymagania

from tests.uczciwosc.pomocnicze import braki_tekstem, eksport_fixtur, sprawdz_ocene_niewykonana

#: Pole OZE bez przypisanego zabezpieczenia — przedmiot rekordu oceny niewykonanej.
_POLE = Bay(
    ref_id="bay-oze-bez-sprawdzen",
    name="Pole OZE bez sprawdzeń",
    bay_role="OZE",
    substation_ref="st-1",
    bus_ref="bus-1",
)


def _rekord_pola(dane: dict[str, Any]) -> OcenaKryterium | WynikWymagania:
    """Rekord pola odczytany kontraktem (walidacja wyprowadza status, etykietę i zdanie
    ponownie — rekord złożony poza regułą jest odrzucany)."""
    if "wymaganie_id" in dane:
        return WynikWymagania.model_validate(dane)
    return OcenaKryterium.model_validate(dane)


def test_pole_bez_sprawdzen_to_ocena_niewykonana() -> None:
    pole, skladowe = _pole_widoku(_POLE, [], [], [])
    assert pole["status"] == "NIE_OCENIONO" and pole["status"] != "OK"
    rekord = sprawdz_ocene_niewykonana(pole["ocena"])
    assert rekord.przedmiot.element_ref == _POLE.ref_id
    braki = braki_tekstem(pole["ocena"])
    assert "81R" in braki and "oknami normatywnymi" in braki and "SPZ" in braki
    # Ten sam predykat (pusta lista rekordów) wyznacza rekord pola i składowe oceny sieci.
    assert [s.kryterium_id for s in skladowe] == [rekord.kryterium_id]


def test_modul_nie_ma_slownika_status_etykieta() -> None:
    assert not hasattr(ochrona_lom, "ETYKIETY_STATUSU_LOM")
    assert not hasattr(ochrona_lom, "_SEVERITY_RANK")


def test_kazda_funkcja_lom_ma_kryterium_okna() -> None:
    assert set(_KRYTERIA_OKIEN) == set(_FUNCTION_ORDER) == set(ochrona_lom.LOM_FUNCTION_TYPES)


def _enm(bays: list[Bay], generators: list[Generator], settings: list[ProtectionSetting]) -> Any:
    return EnergyNetworkModel(
        header=ENMHeader(name="LoM uczciwość", hash_sha256="hash-lom-uczciwosc"),
        buses=[
            Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15.0),
            Bus(ref_id="bus_bez_pola", name="Szyna bez pola", voltage_kv=15.0),
        ],
        generators=generators,
        bays=bays,
        protection_assignments=[
            ProtectionAssignment(
                ref_id="prot_lom",
                name="Zabezpieczenie LoM",
                breaker_ref="cb_1",
                device_type="custom",
                settings=settings,
            )
        ],
    )


def _pole(kody: list[str] | None = None, zabezpieczenie: str | None = "prot_lom") -> Bay:
    return Bay(
        ref_id="bay_oze",
        name="Pole OZE",
        bay_role="OZE",
        substation_ref="stac_1",
        bus_ref="bus_oze",
        protection_ref=zabezpieczenie,
        protection_codes=kody or [],
    )


_GEN = Generator(ref_id="gen_pv", name="PV", bus_ref="bus_oze", p_mw=2.0, gen_type="pv_inverter")

#: Iloczyn cech porównania LoM: rodzaj porównania × dane (brak funkcji, nastawa w oknie, poza
#: oknem, brak nastawy, brak okna, brak przerwy SPZ). Oczekiwany status rekordu porównania: bez
#: ustalonej podstawy okna/wymagania żadne porównanie nie wydaje „spełnia" ani „nie spełnia".
_PRZYPADKI: list[tuple[str, list[Bay], list[ProtectionSetting], str, str | None, str]] = [
    ("brak funkcji LoM", [_pole(zabezpieczenie=None)], [], "obecnosc", None, "BRAK_PODSTAWY"),
    (
        "81R w oknie",
        [_pole()],
        [ProtectionSetting(function_type="rocof_81R", threshold_hz_s=2.5)],
        "okno_normatywne",
        "81R",
        "BRAK_PODSTAWY",
    ),
    (
        "81R poniżej okna",
        [_pole()],
        [ProtectionSetting(function_type="rocof_81R", threshold_hz_s=1.0)],
        "okno_normatywne",
        "81R",
        "BRAK_PODSTAWY",
    ),
    (
        "81U poza oknem",
        [_pole()],
        [ProtectionSetting(function_type="underfrequency_81U", threshold_hz=48.0)],
        "okno_normatywne",
        "81U",
        "BRAK_PODSTAWY",
    ),
    (
        "81O w oknie",
        [_pole()],
        [ProtectionSetting(function_type="overfrequency_81O", threshold_hz=51.5)],
        "okno_normatywne",
        "81O",
        "BRAK_PODSTAWY",
    ),
    (
        "78 bez okna",
        [_pole()],
        [ProtectionSetting(function_type="vector_shift_78", threshold_deg=10.0)],
        "okno_normatywne",
        "78",
        "BRAK_PODSTAWY",
    ),
    ("81U z kodu bez nastaw", [_pole(kody=["81U"])], [], "obecnosc", "81U", "NIE_OCENIONO"),
    (
        "koordynacja SPZ bez przerwy SPZ",
        [_pole()],
        [ProtectionSetting(function_type="rocof_81R", threshold_hz_s=2.5, time_delay_s=0.2)],
        "koordynacja_spz",
        None,
        "NIE_OCENIONO",
    ),
]


@pytest.mark.parametrize(
    ("nazwa", "pola", "nastawy", "rodzaj", "ansi", "oczekiwany"),
    _PRZYPADKI,
    ids=[p[0] for p in _PRZYPADKI],
)
def test_kazde_porownanie_niesie_rekord_z_regula(
    nazwa: str,
    pola: list[Bay],
    nastawy: list[ProtectionSetting],
    rodzaj: str,
    ansi: str | None,
    oczekiwany: str,
) -> None:
    widok = build_ochrona_lom_view(_enm(pola, [_GEN], nastawy))
    (pole,) = widok["fields"]
    porownania = [c for c in pole["checks"] if c["kind"] == rodzaj and c["function_ansi"] == ansi]
    assert porownania, nazwa
    rekord = OcenaKryterium.model_validate(porownania[0]["ocena"])
    assert rekord.status_maszynowy == oczekiwany, nazwa
    assert rekord.status_maszynowy not in ("SPELNIA", "NIE_SPELNIA")
    assert "etykieta" not in porownania[0], "etykieta porównania tylko z rekordu"
    if oczekiwany == "NIE_OCENIONO":
        assert rekord.wyjasnienie.czego_brakuje


def test_rekordy_widoku_sa_jedynym_zrodlem_etykiet_i_statusow() -> None:
    # Scena „lom" harnessu: pola wytwórców z przekaźnikiem funkcji LoM (realny model domenowy),
    # dołożony moduł bez pola — rekordy każdego poziomu i predykaty parami z jednego źródła.
    enm = eksport_fixtur()._enm_sceny_lom()
    widok = build_ochrona_lom_view(enm)
    assert widok["fields"], "scena ma pola przyłączeniowe modułów wytwórczych"
    skladowe: list[str] = []
    for pole in widok["fields"]:
        rekord = _rekord_pola(pole["ocena"])
        assert pole["status"] == rekord.status_maszynowy
        assert "etykieta" not in pole
        if pole["checks"]:
            assert isinstance(rekord, WynikWymagania)
            identyfikatory = [c["ocena"]["kryterium_id"] for c in pole["checks"]]
            assert [o.kryterium_id for o in rekord.oceny_skladowe] == identyfikatory
            skladowe.extend(identyfikatory)
        else:
            assert isinstance(rekord, OcenaKryterium)
            skladowe.append(rekord.kryterium_id)
    podsumowanie = widok["summary"]
    assert not {"by_status", "overall_status", "overall_etykieta"} & set(podsumowanie)
    siec = WynikWymagania.model_validate(podsumowanie["ocena"])
    moduly = [f"lom.modul.{ref}" for ref in widok["modules_without_field"]]
    assert [o.kryterium_id for o in siec.oceny_skladowe] == skladowe + moduly
    assert sum(pozycja["liczba"] for pozycja in podsumowanie["statusy"]) == len(widok["fields"])
    for pozycja in podsumowanie["statusy"]:
        rekordy = [
            p["ocena"]
            for p in widok["fields"]
            if p["ocena"]["status_maszynowy"] == pozycja["status"]
        ]
        assert pozycja["etykieta"] in [r["etykieta"] for r in rekordy]


def test_siec_bez_modulow_wytworczych_nie_dotyczy() -> None:
    widok = build_ochrona_lom_view(_enm([], [], []))
    siec = WynikWymagania.model_validate(widok["summary"]["ocena"])
    assert siec.status_maszynowy == "NIE_DOTYCZY"
    assert widok["summary"]["statusy"] == []


def test_modul_bez_pola_to_ocena_niewykonana_w_wymaganiu_sieci() -> None:
    samotny = Generator(
        ref_id="gen_x", name="PV bez pola", bus_ref="bus_bez_pola", p_mw=1.0, gen_type="pv_inverter"
    )
    widok = build_ochrona_lom_view(_enm([], [samotny], []))
    siec = WynikWymagania.model_validate(widok["summary"]["ocena"])
    assert siec.status_maszynowy == "NIE_OCENIONO"
    (modul,) = siec.oceny_skladowe
    sprawdz_ocene_niewykonana(modul.model_dump(mode="json"))
    assert modul.przedmiot.nazwa_pl == "PV bez pola"


def test_ocena_pola_ze_sprawdzeniami_to_rekord_wymagania() -> None:
    widok = build_ochrona_lom_view(
        _enm([_pole()], [_GEN], [ProtectionSetting(function_type="rocof_81R", threshold_hz_s=2.5)])
    )
    (pole,) = widok["fields"]
    oceny = [OcenaKryterium.model_validate(c["ocena"]) for c in pole["checks"]]
    rekord = _ocena_pola(_POLE, oceny)
    assert isinstance(rekord, WynikWymagania)
    assert rekord.status_maszynowy == WynikWymagania.model_validate(pole["ocena"]).status_maszynowy
