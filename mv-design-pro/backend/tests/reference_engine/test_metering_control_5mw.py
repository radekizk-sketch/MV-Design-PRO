"""Walidacja normatywna: układ pomiarowo-kontrolny dla obiektów > 5 MW.

Karta POMIAR-RODZAJ, dyrektywa właściciela V12K-336 pkt 2 (w zw. z IRiESD;
taksonomia układów pomiarowych energii — [E-UP] pkt 3). Reguła jest
WALIDACJĄ NORMATYWNĄ w warstwie zgodności (`osd_enea.metering.
control_metering_above_5mw`), NIE twardą bramą domenową.

Test obu stron progu:
- obiekt > 5 MW z układem pomiarowym energii BEZ rodzaju KONTROLNY ⇒ fail;
- obiekt > 5 MW Z układem KONTROLNYM ⇒ pass;
- obiekt ≤ 5 MW z układem KONTROLNYM ⇒ BRAK sprawdzenia (standard wymaga
  układu kontrolnego OD progu, ale nie zakazuje go poniżej — rozstrzygnięcie
  udokumentowane w opisie reguły pakietu);
- brak mocy przyłączeniowej / brak układu energii ⇒ BRAK sprawdzenia
  (bramki danych, zero domysłu).
"""

from __future__ import annotations

from enm.models import (
    Bay,
    Bus,
    ConnectionConditions,
    EnergyNetworkModel,
    ENMHeader,
    Substation,
)
from reference_engine import evaluate_enm

KOD = "osd_enea.metering.control_metering_above_5mw"


def _enm(
    *,
    moc_mw: float | None,
    rodzaje_ukladow: list[str],
    rodzaje_ukladow_nn: list[str] | None = None,
) -> EnergyNetworkModel:
    """Model ze stacją kliencką niosącą pola pomiarowe o podanych rodzajach układu
    pomiarowego energii (rekordy `bays` z typowanymi `funkcja_pomiaru`/`rodzaj_pomiaru`,
    karta W5-B) + mocą przyłączeniową w nagłówku (dane dokumentu OSD, karta K2).
    `rodzaje_ukladow_nn` — pola pomiarowe na szynie nN (poza regułą układu SN)."""
    bays = [
        Bay(
            ref_id=f"field/{i}",
            name=f"Pole pomiarowe {i}",
            bay_role="MEASUREMENT",
            substation_ref="st/klient",
            bus_ref="bus/sn",
            funkcja_pomiaru="UKLAD_ENERGII",
            rodzaj_pomiaru=rodzaj,
        )
        for i, rodzaj in enumerate(rodzaje_ukladow, start=1)
    ]
    bays += [
        Bay(
            ref_id=f"field/nn/{i}",
            name=f"Pole pomiarowe nN {i}",
            bay_role="MEASUREMENT",
            substation_ref="st/klient",
            bus_ref="bus/nn",
            funkcja_pomiaru="UKLAD_ENERGII",
            rodzaj_pomiaru=rodzaj,
        )
        for i, rodzaj in enumerate(rodzaje_ukladow_nn or [], start=1)
    ]
    header = ENMHeader(name="Test 5 MW")
    if moc_mw is not None:
        header.connection_conditions = ConnectionConditions(moc_przylaczeniowa_mw=moc_mw)
    return EnergyNetworkModel(
        header=header,
        buses=[
            Bus(ref_id="bus/sn", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="bus/nn", name="Szyna nN", voltage_kv=0.4),
        ],
        substations=[
            Substation(
                ref_id="st/klient",
                name="Stacja abonencka",
                station_type="mv_lv",
                bus_refs=["bus/sn", "bus/nn"],
            )
        ],
        bays=bays,
    )


def _checks(enm: EnergyNetworkModel) -> list:
    report = evaluate_enm(enm, pack_ids=["osd_enea"])
    assert len(report.packs) == 1
    return [c for c in report.packs[0].checks if c.rule_code == KOD]


def test_obiekt_powyzej_5mw_bez_ukladu_kontrolnego_fail() -> None:
    checks = _checks(_enm(moc_mw=6.0, rodzaje_ukladow=["PODSTAWOWY"]))
    assert len(checks) == 1
    assert checks[0].status == "fail"
    assert "5 MW" in checks[0].message_pl


def test_obiekt_powyzej_5mw_z_ukladem_kontrolnym_pass() -> None:
    checks = _checks(_enm(moc_mw=6.0, rodzaje_ukladow=["PODSTAWOWY", "KONTROLNY"]))
    assert len(checks) == 1
    assert checks[0].status == "pass"


def test_obiekt_ponizej_progu_z_ukladem_kontrolnym_bez_sprawdzenia() -> None:
    """Strona przeciwna progu: standard nie zakazuje układu kontrolnego przy
    mocy ≤ 5 MW — brak jakiegokolwiek sprawdzenia (także pass), żeby reguła
    nie sugerowała wymogu, którego standard nie stawia."""
    assert _checks(_enm(moc_mw=4.0, rodzaje_ukladow=["PODSTAWOWY", "KONTROLNY"])) == []
    assert _checks(_enm(moc_mw=5.0, rodzaje_ukladow=["PODSTAWOWY"])) == []


def test_bramki_danych_bez_mocy_lub_bez_ukladu_energii() -> None:
    """Zero domysłu: brak mocy przyłączeniowej w nagłówku ⇒ reguła nieoceniana;
    brak jakiegokolwiek układu pomiarowego energii ⇒ reguła nieoceniana
    (ocenia WYPOSAŻENIE układu, nie jego istnienie)."""
    assert _checks(_enm(moc_mw=None, rodzaje_ukladow=["PODSTAWOWY"])) == []
    assert _checks(_enm(moc_mw=6.0, rodzaje_ukladow=[])) == []


def test_pole_pomiarowe_na_szynie_nn_nie_jest_ukladem_rozliczeniowym_sn() -> None:
    """Karta W5-B: kolekcja `bays` niesie pola SN i nN; reguła ocenia układ pomiarowy energii
    pól SN (poziom pola z napięcia szyny, `enm.pola.czy_pole_nn`). Iloczyn: {układ kontrolny
    w polu SN, w polu nN} — kontrolny wyłącznie w polu nN NIE spełnia wymogu SN, a pole nN
    samo (bez pola SN) nie uruchamia reguły."""
    tylko_nn_kontrolny = _checks(
        _enm(moc_mw=6.0, rodzaje_ukladow=["PODSTAWOWY"], rodzaje_ukladow_nn=["KONTROLNY"])
    )
    assert [c.status for c in tylko_nn_kontrolny] == ["fail"]
    assert _checks(_enm(moc_mw=6.0, rodzaje_ukladow=[], rodzaje_ukladow_nn=["KONTROLNY"])) == []
