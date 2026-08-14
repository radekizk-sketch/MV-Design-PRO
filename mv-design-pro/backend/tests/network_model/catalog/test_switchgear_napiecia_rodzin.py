"""Semantyka napięć rodziny rozdzielnicy — iloczyn cech na TRZECH kanałach.

Kanon: `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §4 (walidator rodziny)
i §10 (stan po karcie K-J).

CO TEN PLIK PILNUJE. Rodzina deklaruje DWIE różne wielkości napięciowe:
`network_voltages_kv` (napięcia SIECI z karty producenta) i `um_classes_kv`
(klasy URZĄDZENIA wg PN-EN 62271-1). Jedno pole `voltage_levels` mieszało obie,
więc walidacja napięciowa musiała być wyłączona — pole stacji powstawało na
dowolnej szynie. Po rozdzieleniu reguła ma JEDNO źródło
(`family_validation.czy_rodzina_obsluguje_napiecie`) i jest włączona w obu
kanałach produkcyjnych.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA §2 — nie przykład z karty):

    rodzaj deklaracji rodziny   ×   napięcie szyny        ×   kanał
    (sieciowa / klasowa /           (pasujące /               (predykat /
     bez danych)                     niepasujące /             operacja domenowa /
                                     brzegowe równe Um)        lista sprawdzeń V1)

Komórka, w której defekt mógłby się schować, a której NIE ma w karcie:
rodzina SIECIOWA wobec napięcia, które przeszłoby po klasie izolacji, ale nie
ma go na liście sieci (Rotoblok: sieć 15/20 kV, klasy 17,5/24 kV — szyna 12 kV
i szyna 24 kV muszą ODPAŚĆ). Reguła „max(...) >= Un", którą kod miał wcześniej
w Reference Engine, przepuściłaby oba te przypadki.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import (
    Bay,
    BayPrimaryDevice,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Substation,
)
from network_model.catalog.switchgear import (
    SWITCHGEAR_FAMILY_REGISTRY,
    SwitchgearFamily,
    czy_rodzina_obsluguje_napiecie,
    family_supports_voltage,
)
from network_model.catalog.switchgear.errors import NiezgodnoscKonfiguracjiError
from reference_engine import evaluate_enm

from tests.enm.test_brama_katalogowa_operacji_v2 import (
    _siec_ze_stacja,
    _stacja_ref,
    _szyna_sn_ref,
)

# ---------------------------------------------------------------------------
# Oś 1 — RODZAJ DEKLARACJI NAPIĘCIOWEJ RODZINY
# ---------------------------------------------------------------------------

#: Rodzina, której karta wymienia napięcia SIECI (wzorzec: ZPUE Rotoblok —
#: sieć 15/20 kV przy klasach urządzenia 17,5/24 kV).
SIECIOWA = {"network_voltages_kv": [15.0, 20.0], "um_classes_kv": [17.5, 24.0]}

#: Rodzina, której karta podaje wyłącznie klasy URZĄDZENIA (wzorzec: ABB
#: SafeRing, Elektrometal e²ALPHA — „rated voltage 12/17,5/24 kV").
KLASOWA = {"network_voltages_kv": [], "um_classes_kv": [12.0, 24.0]}

#: Rodzina o JEDNEJ klasie urządzenia (wzorzec: TPM Air, SM6-24) — osobny
#: przypadek, bo tu brzeg „równe Um" jest jednocześnie maksimum.
KLASOWA_JEDNA = {"network_voltages_kv": [], "um_classes_kv": [24.0]}

#: Rodzina bez ŻADNEJ deklaracji napięciowej. W rejestrze taka nie występuje
#: (pin klasy w `test_switchgear_families.py`), ale reguła musi odpowiadać na
#: nią „nie" — cicha zgoda przy braku danych to fabrykacja zgodności.
BEZ_DANYCH: dict[str, list[float]] = {"network_voltages_kv": [], "um_classes_kv": []}

# ---------------------------------------------------------------------------
# Oś 2 — NAPIĘCIE SZYNY (pasujące / niepasujące / brzegowe)
# ---------------------------------------------------------------------------

#: (id, deklaracja rodziny, napięcie szyny [kV], czy ma przejść)
PRZYPADKI: list[tuple[str, dict[str, Any], float, bool]] = [
    # — rodzina SIECIOWA: rozstrzyga lista sieci, nie zapas izolacji —
    ("sieciowa_szyna_z_listy_dolna", SIECIOWA, 15.0, True),
    ("sieciowa_szyna_z_listy_gorna", SIECIOWA, 20.0, True),
    # Komórka dyskryminująca nr 1: 12 kV mieści się pod klasą 17,5 kV, ale
    # karta nie oferuje wyrobu do sieci 12 kV.
    ("sieciowa_szyna_ponizej_listy_ale_pod_klasa", SIECIOWA, 12.0, False),
    # Komórka dyskryminująca nr 2 (brzeg RÓWNY klasie Um): 24 kV to dokładnie
    # najwyższa klasa urządzenia — reguła „max(Um) >= Un" by przepuściła,
    # deklaracja sieci nie.
    ("sieciowa_szyna_rowna_klasie_um", SIECIOWA, 24.0, False),
    ("sieciowa_szyna_ponad_wszystkim", SIECIOWA, 30.0, False),
    # — rodzina KLASOWA: rozstrzyga istnienie klasy Um >= Un —
    ("klasowa_szyna_pod_najnizsza_klasa", KLASOWA, 6.0, True),
    ("klasowa_szyna_miedzy_klasami", KLASOWA, 17.5, True),
    ("klasowa_szyna_rowna_klasie_dolnej", KLASOWA, 12.0, True),
    ("klasowa_szyna_rowna_klasie_gornej", KLASOWA, 24.0, True),
    ("klasowa_szyna_ponad_najwyzsza_klasa", KLASOWA, 25.0, False),
    ("klasowa_jedna_szyna_ponizej", KLASOWA_JEDNA, 15.0, True),
    ("klasowa_jedna_szyna_rowna_um", KLASOWA_JEDNA, 24.0, True),
    ("klasowa_jedna_szyna_ponad_um", KLASOWA_JEDNA, 24.5, False),
    # — rodzina BEZ DANYCH: brak deklaracji to nie jest zgoda —
    ("bez_danych_szyna_typowa", BEZ_DANYCH, 15.0, False),
    ("bez_danych_szyna_niska", BEZ_DANYCH, 6.0, False),
    # — napięcie, którego nie ma: nie jest napięciem szyny —
    ("szyna_bez_napiecia", SIECIOWA, 0.0, False),
]

#: Rodzina modułowa z katalogowym polem transformatorowym — nośnik podmiany
#: danych napięciowych w kanale operacji domenowej.
RODZINA_MODULOWA_REF = "ZPUE_WLOSZCZOWA__ROTOBLOK"
POLE_MODULARNE = "ZPUE_WLOSZCZOWA__ROTOBLOK__TRANSFORMER"

#: Rodzina RMU wskazywana przez pakiet Reference Engine V1 `abb_safering` —
#: nośnik podmiany danych napięciowych w kanale listy sprawdzeń.
RODZINA_PAKIETU_V1_REF = "ABB__SAFERING"
PAKIET_V1 = "abb_safering"

KOD_NIEZGODNOSCI = "sn.pole_katalogowe_niezgodne"


def _rodzina_z_deklaracja(ref: str, deklaracja: dict[str, Any]) -> SwitchgearFamily:
    """Rodzina rejestru z PODMIENIONĄ deklaracją napięciową (reszta bez zmian).

    Podmieniamy DANE katalogowe, a nie ścieżkę kodu: operacja i lista sprawdzeń
    przechodzą tę samą drogę, co w produkcji, tylko karta rodziny mówi co innego.
    """
    wzorzec = SWITCHGEAR_FAMILY_REGISTRY[ref]
    return wzorzec.model_copy(update=dict(deklaracja))


# ---------------------------------------------------------------------------
# KANAŁ 1 — predykat i twarda brama walidatora
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("nazwa", "deklaracja", "napiecie_kv", "przechodzi"),
    [pytest.param(*p, id=p[0]) for p in PRZYPADKI],
)
def test_predykat_napieciowy_iloczyn_cech(
    nazwa: str, deklaracja: dict[str, Any], napiecie_kv: float, przechodzi: bool
) -> None:
    rodzina = _rodzina_z_deklaracja(RODZINA_MODULOWA_REF, deklaracja)
    assert czy_rodzina_obsluguje_napiecie(rodzina, napiecie_kv) is przechodzi


@pytest.mark.parametrize(
    ("nazwa", "deklaracja", "napiecie_kv", "przechodzi"),
    [pytest.param(*p, id=p[0]) for p in PRZYPADKI],
)
def test_twarda_brama_napieciowa_iloczyn_cech(
    monkeypatch,
    nazwa: str,
    deklaracja: dict[str, Any],
    napiecie_kv: float,
    przechodzi: bool,
) -> None:
    """`family_supports_voltage` jest CIENKĄ nakładką na predykat — para
    „predykat mówi tak / brama nie rzuca" musi trzymać na całym iloczynie,
    inaczej dwa warunki zaczną żyć osobno."""
    monkeypatch.setitem(
        SWITCHGEAR_FAMILY_REGISTRY,
        RODZINA_MODULOWA_REF,
        _rodzina_z_deklaracja(RODZINA_MODULOWA_REF, deklaracja),
    )
    if przechodzi:
        family_supports_voltage(RODZINA_MODULOWA_REF, napiecie_kv)
    else:
        with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie obsluguje napiecia"):
            family_supports_voltage(RODZINA_MODULOWA_REF, napiecie_kv)


def test_komunikat_bledu_mowi_co_karta_deklaruje() -> None:
    """Odmowa bez powodu zmusza projektanta do zgadywania. Komunikat nazywa
    RODZAJ deklaracji, bo od niego zależy, co trzeba zmienić: napięcie sieci
    czy dobór rodziny."""
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="napiecia sieci: 15, 20 kV"):
        family_supports_voltage(RODZINA_MODULOWA_REF, 12.0)
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="klasy napieciowe urzadzenia"):
        family_supports_voltage(RODZINA_PAKIETU_V1_REF, 30.0)


# ---------------------------------------------------------------------------
# KANAŁ 2 — operacja domenowa `add_sn_bay_from_catalog`
# ---------------------------------------------------------------------------


def _snapshot_o_napieciu(napiecie_kv: float) -> tuple[dict[str, Any], str, str]:
    """Sieć testowa z szyną SN o zadanym napięciu znamionowym.

    Zwraca (migawka, referencja stacji, referencja szyny SN). Referencje
    ustalamy PRZED podmianą napięcia, bo pomocnik `_szyna_sn_ref` rozpoznaje
    szynę SN właśnie po napięciu 15 kV fikstury.
    """
    snapshot = copy.deepcopy(_siec_ze_stacja())
    stacja_ref = _stacja_ref(snapshot)
    szyna_ref = _szyna_sn_ref(snapshot)
    for szyna in snapshot["buses"]:
        if szyna.get("ref_id") == szyna_ref:
            szyna["voltage_kv"] = napiecie_kv
    return snapshot, stacja_ref, szyna_ref


@pytest.mark.parametrize(
    ("nazwa", "deklaracja", "napiecie_kv", "przechodzi"),
    [pytest.param(*p, id=p[0]) for p in PRZYPADKI if p[2] > 0],
)
def test_operacja_domenowa_bramkuje_napiecie_iloczyn_cech(
    monkeypatch,
    nazwa: str,
    deklaracja: dict[str, Any],
    napiecie_kv: float,
    przechodzi: bool,
) -> None:
    """Pole stacji powstaje TYLKO na szynie, którą karta rodziny obejmuje.

    Przypadek `szyna_bez_napiecia` nie wchodzi do tego kanału: operacja odbija
    brak napięcia szyny WCZEŚNIEJ, własnym kodem `sn.bus_voltage_missing`
    (osobny test poniżej), więc nie da się przez nią sprawdzić bramy rodziny.
    """
    monkeypatch.setitem(
        SWITCHGEAR_FAMILY_REGISTRY,
        RODZINA_MODULOWA_REF,
        _rodzina_z_deklaracja(RODZINA_MODULOWA_REF, deklaracja),
    )
    snapshot, stacja_ref, szyna_ref = _snapshot_o_napieciu(napiecie_kv)
    payload = {
        "station_ref": stacja_ref,
        "bus_ref": szyna_ref,
        "complete_bay_template_ref": POLE_MODULARNE,
    }

    przed = copy.deepcopy(snapshot)
    odpowiedz = execute_domain_operation(snapshot, "add_sn_bay_from_catalog", payload)

    if przechodzi:
        assert not odpowiedz.get("error"), odpowiedz.get("error")
        assert odpowiedz.get("snapshot"), "Pole zgodne z karta rodziny musi powstac"
    else:
        assert odpowiedz.get("error_code") == KOD_NIEZGODNOSCI
        assert "nie obsluguje napiecia" in str(odpowiedz.get("error"))
        assert not odpowiedz.get("snapshot"), "Odrzucone pole nie moze zostawic migawki"
        assert snapshot == przed, "Odrzucona operacja nie moze zmienic modelu"


@pytest.mark.parametrize(
    ("nazwa", "deklaracja", "napiecie_kv", "przechodzi"),
    [pytest.param(*p, id=p[0]) for p in PRZYPADKI if p[2] > 0 and not p[3]],
)
def test_proba_i_wykonanie_daja_ten_sam_werdykt_napieciowy(
    monkeypatch,
    nazwa: str,
    deklaracja: dict[str, Any],
    napiecie_kv: float,
    przechodzi: bool,
) -> None:
    """Tryb próby (`dry_run`) melduje TO SAMO co wykonanie.

    Werdykt próby, który mówi VALID, a wykonanie odmawia, jest gorszy niż brak
    próby — kreator pokazałby projektantowi zielone światło do ściany.
    """
    monkeypatch.setitem(
        SWITCHGEAR_FAMILY_REGISTRY,
        RODZINA_MODULOWA_REF,
        _rodzina_z_deklaracja(RODZINA_MODULOWA_REF, deklaracja),
    )
    snapshot, stacja_ref, szyna_ref = _snapshot_o_napieciu(napiecie_kv)
    payload = {
        "station_ref": stacja_ref,
        "bus_ref": szyna_ref,
        "complete_bay_template_ref": POLE_MODULARNE,
        "dry_run": True,
    }

    przed = copy.deepcopy(snapshot)
    odpowiedz = execute_domain_operation(snapshot, "add_sn_bay_from_catalog", payload)

    assert odpowiedz.get("error_code") == KOD_NIEZGODNOSCI
    assert odpowiedz["dry_run"] is True
    assert odpowiedz["preview"]["werdykt"] == "INVALID"
    # Próba nie zostawia śladu w modelu — brak migawki znaczy brak zapisu.
    assert not odpowiedz.get("snapshot")
    assert snapshot == przed, "Tryb proby nie moze zmienic modelu"


def test_brak_napiecia_szyny_odbija_wlasnym_kodem_przed_brama_rodziny() -> None:
    """Predykaty parami: brak danych o szynie ma SWÓJ kod błędu, a nie kod
    niezgodności katalogowej — inaczej „nie znam napięcia" wyglądałoby jak
    „rodzina nie pasuje" i projektant szukałby innej rozdzielnicy."""
    snapshot, stacja_ref, szyna_ref = _snapshot_o_napieciu(0.0)

    odpowiedz = execute_domain_operation(
        snapshot,
        "add_sn_bay_from_catalog",
        {
            "station_ref": stacja_ref,
            "bus_ref": szyna_ref,
            "complete_bay_template_ref": POLE_MODULARNE,
        },
    )

    assert odpowiedz.get("error_code") == "sn.bus_voltage_missing"


# ---------------------------------------------------------------------------
# KANAŁ 3 — lista sprawdzeń Reference Engine V1
# ---------------------------------------------------------------------------


def _enm_o_napieciu(napiecie_kv: float) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Zgodnosc napieciowa rodziny"),
        buses=[Bus(ref_id="bus/sn", name="Szyna SN", voltage_kv=napiecie_kv)],
        substations=[
            Substation(
                ref_id="st/01",
                name="Stacja testowa",
                station_type="mv_lv",
                bus_refs=["bus/sn"],
            )
        ],
        bays=[
            Bay(
                ref_id="bay/ok",
                name="Pole liniowe RMU",
                bay_role="OUT",
                substation_ref="st/01",
                bus_ref="bus/sn",
                primary_devices=[
                    BayPrimaryDevice(
                        device_ref="bay/ok/q1",
                        symbol_ref="bay/ok/q1",
                        kind="LOAD_SWITCH",
                        placement="MIDSTREAM",
                    ),
                    BayPrimaryDevice(
                        device_ref="bay/ok/qe1",
                        symbol_ref="bay/ok/qe1",
                        kind="ES",
                        placement="GROUND_BRANCH",
                    ),
                ],
            )
        ],
    )


@pytest.mark.parametrize(
    ("nazwa", "deklaracja", "napiecie_kv", "przechodzi"),
    [pytest.param(*p, id=p[0]) for p in PRZYPADKI if p[2] > 0],
)
def test_lista_sprawdzen_v1_czyta_ten_sam_predykat(
    monkeypatch,
    nazwa: str,
    deklaracja: dict[str, Any],
    napiecie_kv: float,
    przechodzi: bool,
) -> None:
    """Reference Engine V1 RAPORTUJE tę samą regułę, którą egzekwuje operacja.

    To jest właśnie miejsce, w którym wcześniej stały DWA niezależne warunki:
    operacja nie sprawdzała nic, a V1 miało własne „max(voltage_levels) >=
    napięcie". Wiersze `sieciowa_*` tego iloczynu wywalają każdą próbę powrotu
    do tamtej reguły.
    """
    monkeypatch.setitem(
        SWITCHGEAR_FAMILY_REGISTRY,
        RODZINA_PAKIETU_V1_REF,
        _rodzina_z_deklaracja(RODZINA_PAKIETU_V1_REF, deklaracja),
    )

    raport = evaluate_enm(_enm_o_napieciu(napiecie_kv), pack_ids=[PAKIET_V1])
    sprawdzenia = [
        sprawdzenie
        for pakiet in raport.packs
        for sprawdzenie in pakiet.checks
        if sprawdzenie.rule_code == "family.voltage"
    ]

    if not (deklaracja["network_voltages_kv"] or deklaracja["um_classes_kv"]):
        # Rodzina bez ŻADNEJ deklaracji nie ma czym odpowiedzieć — V1 nie
        # zmyśla sprawdzenia, którego nie da się wykonać.
        assert sprawdzenia == []
        return

    assert sprawdzenia, "brak sprawdzenia family.voltage mimo deklaracji rodziny"
    assert all(s.status == ("pass" if przechodzi else "fail") for s in sprawdzenia)
