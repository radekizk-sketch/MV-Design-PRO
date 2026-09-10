"""Most SYGNAL -> KANON kodow gotowosci (karta F-K6, V12K-206, znalezisko Z8).

Testy pilnuja trzech rzeczy, ktorych brak byl istota Z8:
1. kanon ma DROGE do uzytkownika (przez odwzorowanie kodu walidatora albo emiter),
2. brak odwzorowania NIE podstawia cudzej tresci (to bylaby fabrykacja instrukcji naprawy),
3. kazda luka jest JAWNA i ma powod — cicha luka jest nierozpoznawalna od zdolnosci.
"""

from __future__ import annotations

from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import (
    KODY_KANONU_ZAREZERWOWANE,
    KODY_WALIDATORA_BEZ_KANONU,
    ODWZOROWANIE_WALIDATOR_NA_KANON,
    kod_kanoniczny,
    kody_bez_emitera,
    opis_kanoniczny,
    widok_rejestru,
)


def test_kod_walidatora_dostaje_kanoniczna_tresc() -> None:
    """E001 („Brak zrodla zasilania") == kanoniczne `source.grid_supply_missing`."""
    opis = opis_kanoniczny("E001")

    assert opis is not None
    assert opis["canonical_code"] == "source.grid_supply_missing"
    assert opis["canonical_level"] == "BLOCKER"
    assert opis["canonical_fix_navigation"]
    # Tresc pochodzi z kanonu, nie z kopii w module mostu.
    assert opis["canonical_message_pl"] == READINESS_CODES["source.grid_supply_missing"].message_pl


def test_kod_kanoniczny_przechodzi_przez_siebie() -> None:
    """Kod juz kanoniczny nie wymaga odwzorowania (np. z analizy nastaw)."""
    assert kod_kanoniczny("protection.fault_current_missing") == "protection.fault_current_missing"
    opis = opis_kanoniczny("protection.fault_current_missing")
    assert opis is not None
    assert opis["canonical_code"] == "protection.fault_current_missing"


def test_brak_odwzorowania_nie_podstawia_cudzej_tresci() -> None:
    """E004 dotyczy napiecia SZYNY, a kanon ma kod napiecia STACJI — rozne obiekty.

    Podstawienie „prawie pasujacego" komunikatu byloby fabrykacja instrukcji naprawy:
    projektant dostalby polecenie uzupelnienia innego pola niz to, ktorego brakuje.
    """
    assert kod_kanoniczny("E004") is None
    assert opis_kanoniczny("E004") is None
    assert "napiecia SZYNY" in KODY_WALIDATORA_BEZ_KANONU["E004"]


def test_kazdy_kod_walidatora_jest_rozstrzygniety() -> None:
    """Kod walidatora jest albo odwzorowany, albo jawnie bez odpowiednika."""
    import re
    from pathlib import Path

    plik = Path(__file__).resolve().parents[2] / "src" / "enm" / "validator.py"
    kody = set(re.findall(r'code="([^"]+)"', plik.read_text(encoding="utf-8")))

    nierozstrzygniete = sorted(
        kod
        for kod in kody
        if kod not in ODWZOROWANIE_WALIDATOR_NA_KANON and kod not in KODY_WALIDATORA_BEZ_KANONU
    )
    assert nierozstrzygniete == [], f"kody bez rozstrzygniecia: {nierozstrzygniete}"


def test_odwzorowanie_nie_ma_sierot() -> None:
    for kod_walidatora, kod_kanonu in ODWZOROWANIE_WALIDATOR_NA_KANON.items():
        assert kod_kanonu in READINESS_CODES, f"{kod_walidatora} -> {kod_kanonu} nie istnieje"


def test_rezerwacja_ma_powod_i_dotyczy_realnego_kodu() -> None:
    """Rezerwacja bez powodu byla by tym samym co cicha luka."""
    for kod, powod in KODY_KANONU_ZAREZERWOWANE.items():
        assert kod in READINESS_CODES, f"rezerwacja opisuje nieistniejacy kod: {kod}"
        assert powod and powod.strip(), f"rezerwacja bez powodu: {kod}"


def test_kody_bez_emitera_zwracaja_powod_albo_none() -> None:
    """`None` w wyniku znaczy „nikt nie wyjasnil braku" — to stan do naprawy."""
    braki = kody_bez_emitera({"protection.fault_current_missing"})

    assert "protection.fault_current_missing" not in braki
    # Kod przeniesiony z frontu jest zarezerwowany z powodem, nie milczy.
    assert braki["nn.source.field_missing"] is not None
    assert "tablicy frontu" in braki["nn.source.field_missing"]


def test_kody_nn_przeniesione_z_frontu_maja_komplet_pol() -> None:
    """Tresc z usunietej tablicy frontu musi byc w kanonie kompletna.

    Kody przeniesiono w V12K-206 z `ui/engineering-readiness/nnSourceReadinessCodes.ts`,
    ktora nie miala ani emitera w backendzie, ani konsumenta produkcyjnego. Ten test
    zastepuje 28 testow struktury tamtej tablicy — sprawdza to samo, ale na kanonie.

    `pv.control_mode_missing` dostal realny emiter w karcie FAB-D2 (D6,
    `application/calculation_readiness/service.py::_check_power_flow`) — rezerwacja
    w `readiness_bridge.py` zostala zdjeta, bo kod ma juz droge do projektanta.
    Ten JEDEN kod z listy jest wiec sprawdzany odwrotnie: MUSI NIE byc zarezerwowany
    (inaczej rezerwacja bylaby falszywa deklaracja "brak emitera").
    """
    przeniesione = [
        "nn.source.field_missing",
        "nn.source.switch_missing",
        "nn.source.catalog_missing",
        "nn.source.parameters_missing",
        "nn.voltage_missing",
        "pv.control_mode_missing",
        "bess.energy_module_missing",
        "bess.soc_limits_invalid",
        "ups.backup_time_invalid",
        "nn.switch.catalog_ref_missing",
        "nn.measurement.required_missing",
        "genset.fuel_type_missing",
    ]
    kody_z_emiterem_juz = {"pv.control_mode_missing"}
    for kod in przeniesione:
        spec = READINESS_CODES[kod]
        assert spec.message_pl.strip(), f"{kod}: pusty komunikat PL"
        assert spec.fix_navigation, f"{kod}: brak nawigacji naprawczej"
        assert 1 <= spec.priority <= 5, f"{kod}: priorytet poza zakresem"
        if kod in kody_z_emiterem_juz:
            assert (
                kod not in KODY_KANONU_ZAREZERWOWANE
            ), f"{kod}: ma emiter (FAB-D2/D6) — rezerwacja powinna byc zdjeta"
        else:
            assert kod in KODY_KANONU_ZAREZERWOWANE, f"{kod}: brak jawnej rezerwacji"


def test_widok_rejestru_niesie_luki_i_jest_deterministyczny() -> None:
    widok = widok_rejestru()

    assert widok == widok_rejestru()
    assert widok["summary"]["codes_total"] == len(READINESS_CODES)
    assert widok["summary"]["reserved_total"] == len(KODY_KANONU_ZAREZERWOWANE)
    assert widok["summary"]["validator_mapped_total"] == len(ODWZOROWANIE_WALIDATOR_NA_KANON)
    # Kolejnosc kodow stala (sortowanie po kodzie) — prezentacja nie tasuje wierszy.
    kody = [k["code"] for k in widok["codes"]]
    assert kody == sorted(kody)
    # Kod zarezerwowany niesie powod WPROST w widoku, nie tylko w module.
    zarezerwowany = next(k for k in widok["codes"] if k["code"] == "nn.voltage_missing")
    assert zarezerwowany["reserved_reason"]


# ---------------------------------------------------------------------------
# DROGA kanonu do UI: wzbogacenie zgloszen walidatora w koncowce gotowosci.
# To jest sedno Z8 — kanon dostaje realnego konsumenta w czasie dzialania.
# ---------------------------------------------------------------------------


def test_zgloszenie_walidatora_w_koncowce_niesie_kanoniczna_tresc() -> None:
    """Pusty model daje E001 („Brak zrodla") — zgloszenie musi dojsc z kanonem.

    Test idzie przez REALNY walidator ENM (nie atrape), zeby sprawdzic droge, ktora
    faktycznie zasila panel gotowosci: walidator -> odwzorowanie -> kanon.
    """
    from enm.models import EnergyNetworkModel, ENMHeader
    from enm.validator import ENMValidator

    model = EnergyNetworkModel(header=ENMHeader(name="model pusty (test mostu)"))
    wynik = ENMValidator().validate(model)

    kody = {issue.code for issue in wynik.issues}
    assert "E001" in kody, f"spodziewane E001 w pustym modelu, jest: {sorted(kody)}"

    wzbogacone = [
        (issue.code, opis_kanoniczny(issue.code))
        for issue in wynik.issues
        if opis_kanoniczny(issue.code) is not None
    ]
    assert wzbogacone, "zadne zgloszenie pustego modelu nie dostalo tresci kanonicznej"
    kody_kanoniczne = {opis["canonical_code"] for _, opis in wzbogacone}
    assert "source.grid_supply_missing" in kody_kanoniczne
