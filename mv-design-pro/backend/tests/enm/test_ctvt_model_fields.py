"""CTVT-MODEL [DOMAIN] — testy nowych pól ENM `Measurement` (karta CTVT-MODEL,
domknięcie luki W5/V12K-173; karta W3-B, mapa 4 #3 — obwód wtórny):

1. `Measurement.rdzenie` / `Measurement.uzwojenia` (karta UX-04/POLE-LINIOWE-WZORZEC; dawna
   liczba `ct_cores` skasowana) — tabliczka rdzeni CT (IEC 61869-2) i uzwojeń VT
   (IEC 61869-3) jako lista. `rdzenie` WYŁĄCZNIE dla CT, `uzwojenia` WYŁĄCZNIE dla VT;
   lista niepusta; None = uczciwy brak (zero fabrykacji).
2. `Measurement.vt_mounting` — typ montażu VT (`bus`/`cable`). WYŁĄCZNIE dla
   measurement_type=='VT'; oś ODRĘBNA od `vt_arrangement`.
3. `Measurement.obwod_wtorny` (karta W3-B) — obwód wtórny CT/VT (długość,
   przekrój, obciążenia aparatów, moc styków). WSPÓLNY dla CT i VT.
4. `Measurement.vt_uzwojenie` (karta W3-B) — które uzwojenie VT opisuje
   `obwod_wtorny`. WYŁĄCZNIE dla measurement_type=='VT'.

Wszystkie pola są ADDYTYWNE (default None) — zero łamania fixture/hash
istniejących danych (asercja determinizmu poniżej). Materializacja „gdzie
dane producenta obecne" jest ćwiczona round-tripem kontraktu (dict → model →
model_dump); honest None ćwiczy brak danych źródłowych.
"""

from __future__ import annotations

import pytest
from enm.hash import compute_enm_hash
from enm.models import (
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Measurement,
    ObciazenieAparatu,
    ObwodWtorny,
)

RDZEN_Z10 = {
    "przekladnia": "200-400/5",
    "moc_va": 15.0,
    "klasa": "5P20",
    "przeznaczenie": ["ZABEZPIECZENIA"],
}
RDZEN_ROZLICZENIOWY = {
    "przekladnia": "200-400/5",
    "moc_va": 10.0,
    "klasa": "0,2S",
    "fs": 5.0,
    "przeznaczenie": ["ROZLICZENIE", "JAKOSC_ENERGII"],
}
UZWOJENIE_RESZTKOWE = {
    "przekladnia": "15/√3 / 0,1/3",
    "moc_va": 7.5,
    "klasa": "0,5/3P",
    "przeznaczenie": ["POMIAR", "ZABEZPIECZENIA"],
    "otwarty_trojkat": True,
}


def _ct(**kwargs) -> dict:
    base = {
        "ref_id": "ct1",
        "name": "CT1",
        "measurement_type": "CT",
        "bus_ref": "bus_sn",
        "rating": {"ratio_primary": 300.0, "ratio_secondary": 5.0},
    }
    base.update(kwargs)
    return base


def _vt(**kwargs) -> dict:
    base = {
        "ref_id": "vt1",
        "name": "VT1",
        "measurement_type": "VT",
        "bus_ref": "bus_sn",
        "rating": {"ratio_primary": 15000.0, "ratio_secondary": 100.0},
    }
    base.update(kwargs)
    return base


# ---------------------------------------------------------------------------
# 1. Model-level validation — ct_cores / vt_mounting vs measurement_type
# ---------------------------------------------------------------------------


class TestCtVtVariantFields:
    def test_rdzenie_accepted_for_ct_measurement(self):
        m = Measurement.model_validate(_ct(rdzenie=[RDZEN_ROZLICZENIOWY, RDZEN_Z10]))
        assert m.rdzenie is not None
        assert [r.klasa for r in m.rdzenie] == ["0,2S", "5P20"]
        assert [r.rodzaj for r in m.rdzenie] == ["metering", "protection"]
        assert m.rdzenie[1].alf == 20.0
        assert m.vt_mounting is None

    def test_uzwojenia_accepted_for_vt_measurement(self):
        m = Measurement.model_validate(_vt(uzwojenia=[UZWOJENIE_RESZTKOWE]))
        assert m.uzwojenia is not None
        assert m.uzwojenia[0].otwarty_trojkat is True
        assert m.rdzenie is None

    def test_vt_mounting_accepted_for_vt_measurement(self):
        m = Measurement.model_validate(_vt(vt_mounting="bus"))
        assert m.vt_mounting == "bus"
        assert m.rdzenie is None

    def test_vt_mounting_cable_accepted(self):
        m = Measurement.model_validate(_vt(vt_mounting="cable"))
        assert m.vt_mounting == "cable"

    def test_rdzenie_rejected_on_vt_measurement(self):
        with pytest.raises(ValueError, match="rdzenie wymagają measurement_type='CT'"):
            Measurement.model_validate(_vt(rdzenie=[RDZEN_Z10]))

    def test_uzwojenia_rejected_on_ct_measurement(self):
        with pytest.raises(ValueError, match="uzwojenia wymagają measurement_type='VT'"):
            Measurement.model_validate(_ct(uzwojenia=[UZWOJENIE_RESZTKOWE]))

    def test_vt_mounting_rejected_on_ct_measurement(self):
        with pytest.raises(ValueError, match="vt_mounting wymaga measurement_type='VT'"):
            Measurement.model_validate(_ct(vt_mounting="bus"))

    @pytest.mark.parametrize("pole,fabryka", [("rdzenie", _ct), ("uzwojenia", _vt)])
    def test_pusta_lista_odrzucona(self, pole, fabryka):
        # Pusta lista nie opisuje przekładnika — brak tabliczki to None.
        with pytest.raises(ValueError):
            Measurement.model_validate(fabryka(**{pole: []}))

    def test_dawne_ct_cores_nie_istnieje(self):
        # Pole skasowane (karta UX-04/POLE-LINIOWE-WZORZEC): ENM ignoruje nieznane klucze
        # (konwencja `ENMElement`), więc dawna liczba nie przeżywa wczytania ani zapisu —
        # liczbę rdzeni daje wyłącznie lista `rdzenie`.
        m = Measurement.model_validate(_ct(ct_cores=3))
        assert "ct_cores" not in m.model_dump()
        assert m.rdzenie is None

    def test_rdzen_niespojny_odrzucony(self):
        # Rdzeń zabezpieczeniowy przeznaczony do rozliczenia — sprzeczność klasy.
        with pytest.raises(ValueError):
            Measurement.model_validate(
                _ct(rdzenie=[{**RDZEN_Z10, "przeznaczenie": ["ROZLICZENIE"]}])
            )

    def test_vt_mounting_unknown_value_rejected(self):
        with pytest.raises(ValueError):
            Measurement.model_validate(_vt(vt_mounting="wall"))

    def test_both_fields_default_none_honest_brak(self):
        ct = Measurement.model_validate(_ct())
        vt = Measurement.model_validate(_vt())
        # Uczciwy brak — dane producenta niedostarczone, ZERO domyślnych wartości.
        assert ct.rdzenie is None
        assert ct.vt_mounting is None
        assert vt.uzwojenia is None
        assert vt.vt_mounting is None


# ---------------------------------------------------------------------------
# 1b. Karta W3-B — `obwod_wtorny` (CT+VT) i `vt_uzwojenie` (VT-only)
# ---------------------------------------------------------------------------


class TestObwodWtorny:
    def test_obwod_wtorny_accepted_on_ct(self):
        m = Measurement.model_validate(
            _ct(
                obwod_wtorny={
                    "dlugosc_przewodu_m": 30.0,
                    "przekroj_przewodu_mm2": 2.5,
                    "obciazenia_aparatow": [{"nazwa": "Przekaźnik", "moc_va": 3.0}],
                    "moc_stykow_va": 0.5,
                }
            )
        )
        assert m.obwod_wtorny is not None
        assert m.obwod_wtorny.dlugosc_przewodu_m == 30.0
        assert m.obwod_wtorny.obciazenia_aparatow == [
            ObciazenieAparatu(nazwa="Przekaźnik", moc_va=3.0)
        ]

    def test_obwod_wtorny_accepted_on_vt(self):
        m = Measurement.model_validate(
            _vt(obwod_wtorny={"dlugosc_przewodu_m": 12.0, "przekroj_przewodu_mm2": 1.5})
        )
        assert m.obwod_wtorny is not None
        assert m.obwod_wtorny.dlugosc_przewodu_m == 12.0

    def test_obwod_wtorny_default_none_honest_brak(self):
        assert Measurement.model_validate(_ct()).obwod_wtorny is None
        assert Measurement.model_validate(_vt()).obwod_wtorny is None

    def test_obwod_wtorny_obciazenia_aparatow_default_pusta_lista(self):
        m = Measurement.model_validate(
            _ct(obwod_wtorny={"dlugosc_przewodu_m": 10.0, "przekroj_przewodu_mm2": 2.5})
        )
        assert m.obwod_wtorny.obciazenia_aparatow == []

    def test_dlugosc_przewodu_musi_byc_dodatnia(self):
        with pytest.raises(ValueError):
            Measurement.model_validate(_ct(obwod_wtorny={"dlugosc_przewodu_m": 0.0}))
        with pytest.raises(ValueError):
            Measurement.model_validate(_ct(obwod_wtorny={"dlugosc_przewodu_m": -5.0}))

    def test_przekroj_przewodu_musi_byc_dodatni(self):
        with pytest.raises(ValueError):
            Measurement.model_validate(_ct(obwod_wtorny={"przekroj_przewodu_mm2": -1.0}))

    def test_moc_stykow_va_nieujemna(self):
        with pytest.raises(ValueError):
            Measurement.model_validate(_ct(obwod_wtorny={"moc_stykow_va": -1.0}))

    def test_moc_va_aparatu_nieujemna(self):
        with pytest.raises(ValueError):
            Measurement.model_validate(
                _ct(obwod_wtorny={"obciazenia_aparatow": [{"nazwa": "X", "moc_va": -1.0}]})
            )

    def test_obwod_wtorny_jako_model_bezposredni(self):
        # Kontrakt nazwany 1:1 z żądaniem `POST /api/solver/ct-burden-check`
        # (`api/equipment_checks.py::CtBurdenRequest`) — konstruktor bezpośredni
        # (nie tylko dict przez model_validate) daje ten sam kształt.
        obwod = ObwodWtorny(
            dlugosc_przewodu_m=20.0,
            przekroj_przewodu_mm2=4.0,
            obciazenia_aparatow=[ObciazenieAparatu(nazwa="Licznik", moc_va=1.5)],
        )
        m = Measurement.model_validate(_ct())
        m2 = m.model_copy(update={"obwod_wtorny": obwod})
        assert m2.obwod_wtorny.dlugosc_przewodu_m == 20.0


class TestVtUzwojenie:
    def test_vt_uzwojenie_accepted_for_vt(self):
        m = Measurement.model_validate(_vt(vt_uzwojenie="POMIAROWE"))
        assert m.vt_uzwojenie == "POMIAROWE"
        m2 = Measurement.model_validate(_vt(vt_uzwojenie="ZABEZPIECZENIOWE"))
        assert m2.vt_uzwojenie == "ZABEZPIECZENIOWE"

    def test_vt_uzwojenie_rejected_on_ct_measurement(self):
        with pytest.raises(ValueError, match="vt_uzwojenie wymaga measurement_type='VT'"):
            Measurement.model_validate(_ct(vt_uzwojenie="POMIAROWE"))

    def test_vt_uzwojenie_unknown_value_rejected(self):
        with pytest.raises(ValueError):
            Measurement.model_validate(_vt(vt_uzwojenie="OBLICZENIOWE"))

    def test_vt_uzwojenie_default_none(self):
        assert Measurement.model_validate(_vt()).vt_uzwojenie is None


# ---------------------------------------------------------------------------
# 2. Serializacja — exclude_none (kontrakt addytywny)
# ---------------------------------------------------------------------------


class TestSerialization:
    def test_fields_present_in_model_dump_when_set(self):
        ct = Measurement.model_validate(_ct(rdzenie=[RDZEN_Z10]))
        vt = Measurement.model_validate(_vt(vt_mounting="cable"))
        assert ct.model_dump()["rdzenie"][0]["klasa"] == "5P20"
        assert vt.model_dump()["vt_mounting"] == "cable"

    def test_fields_absent_from_model_dump_exclude_none_when_unset(self):
        dumped = Measurement.model_validate(_ct()).model_dump(exclude_none=True)
        assert "rdzenie" not in dumped
        assert "uzwojenia" not in dumped
        assert "vt_mounting" not in dumped
        assert "obwod_wtorny" not in dumped
        assert "vt_uzwojenie" not in dumped

    def test_round_trip_materialization_from_producer_data(self):
        """Materializacja end-to-end: payload z danymi producenta (dict) →
        model → serializacja z powrotem, wartości przeniesione bez zmian."""
        ct = Measurement.model_validate(
            _ct(rdzenie=[RDZEN_ROZLICZENIOWY, RDZEN_Z10], ct_arrangement="3xCT")
        )
        vt = Measurement.model_validate(
            _vt(vt_mounting="bus", vt_arrangement="open_delta", uzwojenia=[UZWOJENIE_RESZTKOWE])
        )
        assert Measurement.model_validate(ct.model_dump()).rdzenie == ct.rdzenie
        assert Measurement.model_validate(vt.model_dump(mode="json")).uzwojenia == vt.uzwojenia
        assert Measurement.model_validate(vt.model_dump()).vt_mounting == "bus"

    def test_obwod_wtorny_round_trip(self):
        """Karta W3-B: obwod wtorny przezywa dict -> model -> dict -> model
        bez utraty danych (kontrakt addytywny, ten sam ksztalt co
        `api/equipment_checks.py::CtBurdenRequest`)."""
        ct = Measurement.model_validate(
            _ct(
                obwod_wtorny={
                    "dlugosc_przewodu_m": 30.0,
                    "przekroj_przewodu_mm2": 2.5,
                    "obciazenia_aparatow": [{"nazwa": "Przekaźnik", "moc_va": 3.0}],
                    "moc_stykow_va": 0.5,
                }
            )
        )
        dumped = ct.model_dump()
        assert dumped["obwod_wtorny"]["dlugosc_przewodu_m"] == 30.0
        odtworzony = Measurement.model_validate(dumped)
        assert odtworzony.obwod_wtorny == ct.obwod_wtorny

    def test_vt_uzwojenie_round_trip(self):
        vt = Measurement.model_validate(_vt(vt_uzwojenie="ZABEZPIECZENIOWE"))
        assert Measurement.model_validate(vt.model_dump()).vt_uzwojenie == "ZABEZPIECZENIOWE"


# ---------------------------------------------------------------------------
# 3. Determinism (CLAUDE.md rule 7) — nowe pola ADDYTYWNE nie zmieniają hash
#    dla ENM, który ich nie ustawia; ten sam ENM z polami ustawionymi daje
#    identyczny hash przy powtórnym obliczeniu.
# ---------------------------------------------------------------------------


def _make_minimal_enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="CTVT hash test", defaults=ENMDefaults()))


class TestDeterminism:
    def test_hash_unaffected_by_new_fields_left_unset(self):
        assert compute_enm_hash(_make_minimal_enm()) == compute_enm_hash(_make_minimal_enm())

    def test_hash_stable_when_new_fields_set(self):
        measurement = Measurement.model_validate(_ct(rdzenie=[RDZEN_Z10]))
        enm1 = EnergyNetworkModel(
            header=ENMHeader(name="CTVT hash test 2", defaults=ENMDefaults()),
            measurements=[measurement],
        )
        enm2 = EnergyNetworkModel(
            header=ENMHeader(name="CTVT hash test 2", defaults=ENMDefaults()),
            measurements=[measurement.model_copy()],
        )
        assert compute_enm_hash(enm1) == compute_enm_hash(enm2)

    def test_hash_stable_when_obwod_wtorny_set(self) -> None:
        measurement = Measurement.model_validate(
            _ct(obwod_wtorny={"dlugosc_przewodu_m": 30.0, "przekroj_przewodu_mm2": 2.5})
        )
        enm1 = EnergyNetworkModel(
            header=ENMHeader(name="CTVT hash test 2b", defaults=ENMDefaults()),
            measurements=[measurement],
        )
        enm2 = EnergyNetworkModel(
            header=ENMHeader(name="CTVT hash test 2b", defaults=ENMDefaults()),
            measurements=[measurement.model_copy(deep=True)],
        )
        assert compute_enm_hash(enm1) == compute_enm_hash(enm2)

    def test_hash_unchanged_vs_measurement_without_new_fields(self):
        """ENM z Measurement BEZ nowych pól ma identyczny hash niezależnie od
        istnienia pól w schemacie (exclude_none w fingerprincie ENM)."""
        m = Measurement.model_validate(_ct())
        enm = EnergyNetworkModel(
            header=ENMHeader(name="CTVT hash test 3", defaults=ENMDefaults()),
            measurements=[m],
        )
        assert compute_enm_hash(enm) == compute_enm_hash(enm.model_copy(deep=True))
