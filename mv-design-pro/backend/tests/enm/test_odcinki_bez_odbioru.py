"""Koniec odcinka bez odbioru — predykat, walidator W065/W066 i gotowość (karta PRZEGLAD-SIECI).

Iloczyn cech (reguła KLASA §2), w którym defekt mógłby się schować:
  * rodzaj gałęzi: kabel, linia napowietrzna (odcinki) × łącznik, bezpiecznik (nie odcinki);
  * przyłączenie szyny końcowej: nic; tylko pomiar; inna gałąź; transformator (strona WN i nN);
    źródło; odbiór; generator; bateria kondensatorów; szyna stacji; zacisk pola SN; szyna pola;
    sekcja szyn GPZ (SN, WN) i nN; punkt odgałęźny;
  * koniec: `to_bus_ref` / `from_bus_ref`; oba końce wolne (wyspa z jednego odcinka);
  * pasmo: SN (W065 → `topology.segment_open_end`) / nN (W066 → `topology.lv_segment_open_end`);
  * gotowość: kod jest ostrzeżeniem — obliczenia NIE są blokowane (kabel jałowy jest fizycznie
    poprawny);
  * determinizm: kolejność kolekcji nie zmienia wyniku.
"""

from __future__ import annotations

import copy
import random
from typing import Any

import pytest
from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import kod_kanoniczny
from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader, Source
from enm.odcinki_bez_odbioru import KoniecOtwarty, konce_otwarte
from enm.validator import ENMValidator


def _model(**dodatki: Any) -> dict[str, Any]:
    """Szyna zasilana `A` → kabel `K` → szyna końcowa `B` (bez niczego innego)."""
    model: dict[str, Any] = {
        "buses": [{"ref_id": "A", "voltage_kv": 15.0}, {"ref_id": "B", "voltage_kv": 15.0}],
        "branches": [{"ref_id": "K", "type": "cable", "from_bus_ref": "A", "to_bus_ref": "B"}],
        "sources": [{"ref_id": "Q", "bus_ref": "A"}],
    }
    for klucz, wartosc in dodatki.items():
        model[klucz] = [*model.get(klucz, []), *wartosc]
    return model


OTWARTY = (KoniecOtwarty(odcinek_ref="K", szyna_ref="B"),)

PRZYLACZENIA: dict[str, dict[str, Any]] = {
    "inna_galaz": {
        "branches": [{"ref_id": "K2", "type": "cable", "from_bus_ref": "B", "to_bus_ref": "A"}]
    },
    "lacznik": {
        "branches": [{"ref_id": "S", "type": "switch", "from_bus_ref": "B", "to_bus_ref": "A"}]
    },
    "transformator_wn": {"transformers": [{"ref_id": "T", "hv_bus_ref": "B", "lv_bus_ref": "N"}]},
    "transformator_nn": {"transformers": [{"ref_id": "T", "hv_bus_ref": "N", "lv_bus_ref": "B"}]},
    "zrodlo": {"sources": [{"ref_id": "Q2", "bus_ref": "B"}]},
    "odbior": {"loads": [{"ref_id": "L", "bus_ref": "B"}]},
    "generator": {"generators": [{"ref_id": "G", "bus_ref": "B"}]},
    "bateria": {"shunt_capacitors": [{"ref_id": "C", "bus_ref": "B"}]},
    "szyna_stacji": {"substations": [{"ref_id": "ST", "bus_refs": ["B"]}]},
    "zacisk_pola": {"bays": [{"ref_id": "P", "bus_ref": "X", "terminal_bus_ref": "B"}]},
    "szyna_pola": {"bays": [{"ref_id": "P", "bus_ref": "B"}]},
    "sekcja_gpz_sn": {"substations": [{"ref_id": "GPZ", "gpz_sections": [{"bus_ref": "B"}]}]},
    "sekcja_gpz_wn": {"substations": [{"ref_id": "GPZ", "gpz_hv_sections": [{"bus_ref": "B"}]}]},
    "sekcja_nn": {"substations": [{"ref_id": "ST", "nn_sections": [{"bus_ref": "B"}]}]},
    "punkt_odgalezny": {"branch_points": [{"ref_id": "ZK", "bus_ref": "B"}]},
}


class TestPredykat:
    def test_kabel_bez_niczego_na_koncu_jest_otwarty(self) -> None:
        assert konce_otwarte(_model()) == OTWARTY

    def test_linia_napowietrzna_jest_odcinkiem(self) -> None:
        model = _model()
        model["branches"][0]["type"] = "line_overhead"
        assert konce_otwarte(model) == OTWARTY

    @pytest.mark.parametrize("rodzaj", ["switch", "breaker", "bus_coupler", "disconnector", "fuse"])
    def test_lacznik_i_bezpiecznik_nie_sa_odcinkami(self, rodzaj: str) -> None:
        model = _model()
        model["branches"][0]["type"] = rodzaj
        assert konce_otwarte(model) == ()

    @pytest.mark.parametrize("przylaczenie", sorted(PRZYLACZENIA))
    def test_kazde_przylaczenie_zamyka_koniec(self, przylaczenie: str) -> None:
        assert konce_otwarte(_model(**PRZYLACZENIA[przylaczenie])) == ()

    def test_pomiar_nie_jest_odbiorem(self) -> None:
        model = _model(measurements=[{"ref_id": "VT", "bus_ref": "B", "measurement_type": "VT"}])
        assert konce_otwarte(model) == OTWARTY

    def test_koniec_poczatkowy_tez_jest_badany(self) -> None:
        model = _model()
        model["branches"][0].update(from_bus_ref="B", to_bus_ref="A")
        assert konce_otwarte(model) == OTWARTY

    def test_wyspa_z_jednego_odcinka_ma_dwa_konce(self) -> None:
        model = _model(
            branches=[{"ref_id": "W", "type": "cable", "from_bus_ref": "U", "to_bus_ref": "V"}]
        )
        assert konce_otwarte(model) == (
            *OTWARTY,
            KoniecOtwarty(odcinek_ref="W", szyna_ref="U"),
            KoniecOtwarty(odcinek_ref="W", szyna_ref="V"),
        )

    def test_ciag_dwoch_odcinkow_otwarty_tylko_na_koncu(self) -> None:
        model = _model(
            branches=[{"ref_id": "K2", "type": "cable", "from_bus_ref": "B", "to_bus_ref": "C"}]
        )
        assert konce_otwarte(model) == (KoniecOtwarty(odcinek_ref="K2", szyna_ref="C"),)

    def test_model_pydantic_i_slownik_daja_ten_sam_wynik(self) -> None:
        enm = _enm_otwarty(15.0)
        assert konce_otwarte(enm) == konce_otwarte(enm.model_dump(mode="json")) == OTWARTY

    def test_determinizm_kolejnosci(self) -> None:
        model = _model(
            branches=[
                {"ref_id": "W", "type": "cable", "from_bus_ref": "U", "to_bus_ref": "V"},
                {"ref_id": "K2", "type": "line_overhead", "from_bus_ref": "B", "to_bus_ref": "C"},
            ]
        )
        wzorzec = konce_otwarte(model)
        los = random.Random(7)
        for _ in range(5):
            kopia = copy.deepcopy(model)
            for lista in kopia.values():
                los.shuffle(lista)
            assert konce_otwarte(kopia) == wzorzec


def _enm_otwarty(napiecie_kv: float) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Koniec otwarty"),
        buses=[
            Bus(ref_id="A", name="Szyna zasilająca", voltage_kv=napiecie_kv),
            Bus(ref_id="B", name="Koniec", voltage_kv=napiecie_kv),
        ],
        branches=[
            Cable(
                ref_id="K",
                name="Kabel K1",
                from_bus_ref="A",
                to_bus_ref="B",
                length_km=1.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
            )
        ],
        sources=[
            Source(
                ref_id="Q",
                name="Sieć",
                bus_ref="A",
                model="short_circuit_power",
                sk3_mva=250.0,
            )
        ],
    )


class TestWalidatorIGotowosc:
    @pytest.mark.parametrize(
        ("napiecie_kv", "kod", "kanon", "akcja"),
        [
            (15.0, "W065", "topology.segment_open_end", "OPEN_MODAL"),
            (0.4, "W066", "topology.lv_segment_open_end", "NAVIGATE_TO_ELEMENT"),
        ],
    )
    def test_kod_poziom_akcja_i_brak_blokady(
        self, napiecie_kv: float, kod: str, kanon: str, akcja: str
    ) -> None:
        walidator = ENMValidator()
        wynik = walidator.validate(_enm_otwarty(napiecie_kv))
        zgloszenia = [i for i in wynik.issues if i.code in {"W065", "W066"}]
        assert [i.code for i in zgloszenia] == [kod]
        zgloszenie = zgloszenia[0]
        assert zgloszenie.severity == "IMPORTANT"
        assert zgloszenie.element_refs == ["K", "B"]
        assert "Kabel K1" in zgloszenie.message_pl
        assert zgloszenie.fix_action is not None
        assert zgloszenie.fix_action.action_type == akcja
        assert zgloszenie.fix_action.element_ref == "K"
        if akcja == "OPEN_MODAL":
            assert zgloszenie.fix_action.modal_type == "insert_station_on_segment_sn"
        # Most do kanonu i poziom kanonu: ostrzeżenie, nie blokada.
        assert kod_kanoniczny(kod) == kanon
        assert READINESS_CODES[kanon].level.value == "WARNING"
        # Gotowość: koniec otwarty nie trafia do blokad (kabel jałowy jest fizycznie poprawny).
        assert all(b.code != kod for b in walidator.readiness(wynik).blockers)

    def test_zamkniecie_konca_odbiorem_usuwa_kod(self) -> None:
        enm = _enm_otwarty(15.0).model_dump(mode="json")
        enm["loads"] = [
            {"ref_id": "L", "name": "Odbiór", "bus_ref": "B", "p_mw": 0.1, "q_mvar": 0.0}
        ]
        wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
        assert not [i for i in wynik.issues if i.code in {"W065", "W066"}]
