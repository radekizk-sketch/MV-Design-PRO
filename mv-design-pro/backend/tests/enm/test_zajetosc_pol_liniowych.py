"""Karta POLE-ZAJĘTE — zajętość pola liniowego SN z JEDNEGO źródła prawdy (`enm.zajetosc_pol`).

Defekt (karta S95-START, dowód `dowod_dwa_kable_z_pola.py`): dwa kolejne
`continue_trunk_segment_sn` z tym samym polem liniowym stacji kończyły się sukcesem — z
zacisku jednego pola wychodziły dwa kable. Kanon (dyrektywa właściciela 2026-07-17) backend
egzekwował tylko przy odgałęzieniach z GPZ, a front liczył zajętość własnym predykatem.

Iloczyn cech (reguła KLASA, NIE INSTANCJA):
  rodzaj elementu × stan pól × operacja × warstwa
  - rodzaj: stacja SN/nN na odcinku, stacja końcowa, GPZ z zaciskami pól, GPZ bez zacisków
    pól (migawki bez aparatu pól), sekcja 2 GPZ;
  - stan pól: wolne kilka, wolne jedno, zajęte wszystkie, brak pól liniowych;
  - operacja: `continue_trunk_segment_sn` (pole wskazane `field_ref`), ta sama operacja
    z zaciskiem pola jako `from_terminal_id`, `start_branch_segment_sn`,
    `connect_secondary_ring_sn` (koniec pierścienia na zacisku pola);
  - warstwa: operacja domenowa, API (`POST /enm/domain-ops`), model odczytu
    (`logical_views.line_fields`) i walidator (stan zastany, E022).
Wyrocznia: pole wolne ⇒ operacja się udaje i pole ma DOKŁADNIE jeden odcinek; pole zajęte ⇒
nazwana odmowa `field.line_field_occupied` bez identyfikatorów (wyjątek kanonu: odgałęzienie
z GPZ dostaje INNE wolne albo nowe pole); po każdej operacji żadne pole nie ma dwóch odcinków.
"""

from __future__ import annotations

import copy
import re
import uuid
from typing import Any

import pytest
from enm.models import EnergyNetworkModel
from enm.validator import ENMValidator
from enm.zajetosc_pol import KOD_POLE_ZAJETE, zajetosc_pol, zajetosc_pola

from tests.reference_networks.sceny_zajetosci_pol import (
    OPERACJE,
    RODZAJE,
    STANY,
    koniec_ciagu,
    odcinek,
    ok,
    op,
    zbuduj_scene,
)

_op = op
_ok = ok
_odcinek = odcinek
_koniec_ciagu = koniec_ciagu
_scena = zbuduj_scene

#: Identyfikator w zdaniu dla projektanta = defekt (karta #144).
WZOR_IDENTYFIKATORA = re.compile(r"\b(?:stn|gpz|seg|bus|corridor)/")


def _zacisk(enm: dict[str, Any], field_ref: str) -> str | None:
    z = zajetosc_pola(enm, field_ref)
    return z.punkt_przylaczenia if z and z.wlasny_zacisk else None


def _wykonaj(enm: dict[str, Any], operacja: str, field_ref: str) -> dict[str, Any] | None:
    """Operacja przyłączająca odcinek do pola; None, gdy operacja nie dotyczy pola."""
    if operacja == "ciag_z_pola":
        return _op(
            enm, "continue_trunk_segment_sn", {"field_ref": field_ref, "segment": _odcinek()}
        )
    if operacja == "ciag_z_zacisku":
        zacisk = _zacisk(enm, field_ref)
        if zacisk is None:
            return None
        return _op(
            enm, "continue_trunk_segment_sn", {"from_terminal_id": zacisk, "segment": _odcinek()}
        )
    if operacja == "odgalezienie":
        return _op(
            enm,
            "start_branch_segment_sn",
            {"from_ref": f"{field_ref}.BRANCH", "segment": _odcinek(150)},
        )
    zacisk = _zacisk(enm, field_ref)
    odcinki = [b for b in enm["branches"] if b.get("type") == "cable"]
    if zacisk is None or not odcinki:
        # Pierścień łączy dwa końce ISTNIEJĄCEJ sieci — sam GPZ bez odcinków nie ma drugiego
        # końca, więc operacja pierścienia tej sceny nie dotyczy.
        return None
    return _op(
        enm,
        "connect_secondary_ring_sn",
        {"from_bus_ref": _koniec_ciagu(enm), "to_bus_ref": zacisk, "segment": _odcinek(400)},
    )


def _bez_dwoch_odcinkow_na_polu(enm: dict[str, Any]) -> None:
    przeciazone = {ref: z.odcinki_fizyczne for ref, z in zajetosc_pol(enm).items() if z.przeciazone}
    assert przeciazone == {}, f"pole z więcej niż jednym odcinkiem: {przeciazone}"
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    assert not [i for i in wynik.issues if i.code == "E022"]


def _przypadki() -> list[tuple[str, str, str]]:
    return [(r, s, o) for r in RODZAJE for s in STANY for o in OPERACJE]


@pytest.mark.parametrize(("rodzaj", "stan", "operacja"), _przypadki())
def test_iloczyn_rodzaj_stan_operacja(rodzaj: str, stan: str, operacja: str) -> None:
    scena = _scena(rodzaj, stan)
    _bez_dwoch_odcinkow_na_polu(scena.enm)
    if stan == "brak_pol":
        assert scena.pola == [], "stan „brak pól” nie ma pola liniowego"
        return

    for field_ref in scena.pola:
        przed = zajetosc_pola(scena.enm, field_ref)
        assert przed is not None
        odpowiedz = _wykonaj(scena.enm, operacja, field_ref)
        if odpowiedz is None:
            # Operacja przez zacisk dotyczy tylko pól z własnym zaciskiem; pierścień — tylko
            # sieci, która ma już odcinki (drugi koniec pierścienia).
            assert operacja in ("ciag_z_zacisku", "pierscien")
            continue
        if not przed.zajete:
            enm_po = _ok(odpowiedz)
            po = zajetosc_pola(enm_po, field_ref)
            assert po is not None and po.zajete
            assert len(po.odcinki_fizyczne) == 1
            _bez_dwoch_odcinkow_na_polu(enm_po)
        elif scena.gpz and operacja == "odgalezienie":
            # Kanon GPZ: odgałęzienie ze wskazanego ZAJĘTEGO pola dostaje inne wolne albo NOWE
            # pole — i odcinek wychodzi z punktu przyłączenia TEGO pola, nie zajętego.
            enm_po = _ok(odpowiedz)
            po = zajetosc_pola(enm_po, field_ref)
            assert po is not None and po.odcinki_fizyczne == przed.odcinki_fizyczne
            _bez_dwoch_odcinkow_na_polu(enm_po)
        else:
            assert odpowiedz.get("error_code") == KOD_POLE_ZAJETE, odpowiedz.get("error")
            assert odpowiedz.get("snapshot") is None
            komunikat = str(odpowiedz.get("error"))
            assert "zajęte" in komunikat
            assert not WZOR_IDENTYFIKATORA.search(komunikat), komunikat


def test_dowod_s95start_dwa_kable_z_jednego_pola_stacji_odrzucone() -> None:
    """Dowód z karty S95-START jako test: drugi odcinek z tego samego pola wyjściowego stacji
    kończył się sukcesem (czerwony na bazie `9215e42c`), teraz nazwana odmowa."""
    scena = _scena("stacja_na_odcinku", "wolne_kilka")
    pole_wy = next(p for p in scena.pola if zajetosc_pola(scena.enm, p).bay_role == "OUT")
    pierwszy = _ok(
        _op(scena.enm, "continue_trunk_segment_sn", {"field_ref": pole_wy, "segment": _odcinek()})
    )
    drugi = _op(
        pierwszy,
        "continue_trunk_segment_sn",
        {"field_ref": pole_wy, "segment": _odcinek(301, "Drugi")},
    )
    assert drugi.get("error_code") == KOD_POLE_ZAJETE
    assert "Stacja Lipowa" in str(drugi.get("error"))


def test_podzial_odcinka_nie_przenosi_pochodzenia_z_pola_na_dalsza_polowke() -> None:
    """Wstawienie stacji: pochodzenie z pola GPZ zostaje wyłącznie przy połówce, która nadal
    kończy się na zacisku pola (dawniej obie połówki „wychodziły” z pola GPZ)."""
    scena = _scena("stacja_na_odcinku", "wolne_kilka")
    z_pochodzeniem = [
        b
        for b in scena.enm["branches"]
        if b.get("type") == "cable" and (b.get("meta") or {}).get("origin_bay_ref")
    ]
    assert len(z_pochodzeniem) == 1
    gpz_pole = z_pochodzeniem[0]["meta"]["origin_bay_ref"]
    zacisk = zajetosc_pola(scena.enm, gpz_pole).punkt_przylaczenia
    assert zacisk in (z_pochodzeniem[0]["from_bus_ref"], z_pochodzeniem[0]["to_bus_ref"])


def test_migawka_zastana_z_pochodzeniem_na_obu_polowkach_nie_daje_falszywego_przeciazenia() -> None:
    """Model sprzed karty (połówka odległa niesie `origin_bay_ref`) nie jest błędem modelu:
    reguła R1 liczy odcinek tylko z końcem w punkcie przyłączenia pola."""
    scena = _scena("stacja_na_odcinku", "wolne_kilka")
    enm = copy.deepcopy(scena.enm)
    zrodlo = next(b for b in enm["branches"] if (b.get("meta") or {}).get("origin_bay_ref"))
    for galaz in enm["branches"]:
        if galaz.get("type") == "cable" and galaz is not zrodlo:
            galaz.setdefault("meta", {}).update(copy.deepcopy(zrodlo["meta"]))
    _bez_dwoch_odcinkow_na_polu(enm)


def test_walidator_e022_stan_zastany_dwa_odcinki_na_polu() -> None:
    """Model z archiwum z dwoma odcinkami na jednym zacisku pola: błąd modelu E022 z akcją
    naprawczą, zdanie bez identyfikatorów, kod kanonu gotowości przez odwzorowanie."""
    from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON

    scena = _scena("stacja_na_odcinku", "wolne_kilka")
    pole_wy = next(p for p in scena.pola if zajetosc_pola(scena.enm, p).bay_role == "OUT")
    enm = _ok(
        _op(scena.enm, "continue_trunk_segment_sn", {"field_ref": pole_wy, "segment": _odcinek()})
    )
    enm = copy.deepcopy(enm)
    wzor = next(
        b for b in enm["branches"] if (b.get("meta") or {}).get("origin_bay_ref") == pole_wy
    )
    drugi = copy.deepcopy(wzor)
    drugi["ref_id"] = "seg/zastany/segment"
    drugi["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, "mv-design-pro:test:seg/zastany/segment"))
    drugi["name"] = "Odcinek zdublowany"
    enm["branches"].append(drugi)

    assert zajetosc_pola(enm, pole_wy).przeciazone
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    e022 = [i for i in wynik.issues if i.code == "E022"]
    assert len(e022) == 1
    assert pole_wy in e022[0].element_refs
    assert e022[0].fix_action is not None
    assert e022[0].fix_action.payload_hint["field_ref"] == pole_wy
    assert not WZOR_IDENTYFIKATORA.search(e022[0].message_pl), e022[0].message_pl
    assert "Odcinek zdublowany" in e022[0].message_pl
    assert ODWZOROWANIE_WALIDATOR_NA_KANON["E022"] == "station.line_field_multiple_segments"


@pytest.mark.parametrize("stan", STANY)
@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_model_odczytu_line_fields_to_ta_sama_funkcja(rodzaj: str, stan: str) -> None:
    """`logical_views.line_fields` odpowiedzi operacji = `zajetosc_pol` tej samej migawki —
    front czyta zajętość stąd i nie liczy jej sam."""
    scena = _scena(rodzaj, stan)
    odpowiedz = _op(scena.enm, "refresh_snapshot", {})
    enm = _ok(odpowiedz)
    widok = {w["field_ref"]: w for w in odpowiedz["logical_views"]["line_fields"]}
    zajetosc = zajetosc_pol(enm)
    assert set(widok) == set(zajetosc)
    for ref, z in zajetosc.items():
        assert widok[ref]["occupied"] == z.zajete
        assert widok[ref]["segment_refs"] == list(z.odcinki_fizyczne)
        assert widok[ref]["station_ref"] == z.station_ref
    for field_ref in scena.pola:
        oczekiwane = stan == "zajete_wszystkie" or (
            stan == "wolne_jedno" and field_ref != scena.pola[-1]
        )
        assert widok[field_ref]["occupied"] is oczekiwane


def test_determinizm_zajetosci_i_widoku() -> None:
    scena = _scena("stacja_na_odcinku", "wolne_jedno")
    a = _op(scena.enm, "refresh_snapshot", {})["logical_views"]["line_fields"]
    b = _op(copy.deepcopy(scena.enm), "refresh_snapshot", {})["logical_views"]["line_fields"]
    assert a == b
