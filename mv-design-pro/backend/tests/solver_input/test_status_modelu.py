"""Testy dwóch osi statusu modelu urządzenia (karta AB-1a D3, plan A/B §6.8).

Iloczyn cech: status równań (3) × status parametrów (4) × stopień docelowy (4) —
predykat awansu jest JEDNYM źródłem prawdy, więc test przechodzi PEŁNY iloczyn,
nie przykład z karty. Rejestr rodzin: wyczerpujący wobec kontraktu ENM w obie
strony, fail-closed dla rodziny nieznanej.
"""

from __future__ import annotations

import itertools

import pytest
from enm.dynamika_modele import RODZINY_PARAMETROW_DYNAMICZNYCH, ProweniencjaParametrow
from solver_input import provenance
from solver_input.provenance import CapabilityEvidence, EvidenceTier, FieldQuality
from solver_input.status_modelu import (
    StatusParametrow,
    StatusRownan,
    czy_awans_dopuszczalny,
    rodziny_w_rejestrze,
    status_modelu_rodzin_do_dict,
    status_parametrow,
    status_rownan_rodziny,
    wpis_statusu_rownan,
    zdolnosci_z_awansem_bez_podstawy,
)


@pytest.mark.parametrize(
    ("tier", "rownania", "parametry"),
    list(itertools.product(EvidenceTier, StatusRownan, StatusParametrow)),
)
def test_predykat_awansu_iloczyn_cech(
    tier: EvidenceTier, rownania: StatusRownan, parametry: StatusParametrow
) -> None:
    oczekiwane = tier is not EvidenceTier.VALIDATED_SIMULATION or (
        rownania is StatusRownan.VALIDATED
        and parametry is StatusParametrow.MODEL_ZWALIDOWANY_POMIAREM
    )
    assert czy_awans_dopuszczalny(tier, rownania, parametry) is oczekiwane


def test_symulacja_zwalidowana_dokladnie_jedna_kombinacja_z_dwunastu() -> None:
    dopuszczalne = [
        (r, p)
        for r, p in itertools.product(StatusRownan, StatusParametrow)
        if czy_awans_dopuszczalny(EvidenceTier.VALIDATED_SIMULATION, r, p)
    ]
    assert len(list(itertools.product(StatusRownan, StatusParametrow))) == 12
    assert dopuszczalne == [
        (StatusRownan.VALIDATED, StatusParametrow.MODEL_ZWALIDOWANY_POMIAREM)
    ]


def test_os_parametrow_nie_ma_statusu_certyfikatu() -> None:
    # Przegląd adwersarialny §6.5: certyfikat badania typu nie waliduje parametrów RMS.
    assert not any("CERT" in s.value for s in StatusParametrow)
    assert not any("OUTSIDE" in s.value for s in (*StatusParametrow, *StatusRownan))


def test_etykiety_wspoldzielone_z_field_quality() -> None:
    assert StatusParametrow.KARTA_KATALOGOWA.label_pl == FieldQuality.DATASHEET.label_pl
    assert StatusParametrow.OSZACOWANE.label_pl == FieldQuality.ESTIMATED.label_pl
    assert len({s.label_pl for s in StatusParametrow}) == len(StatusParametrow)
    assert len({s.label_pl for s in StatusRownan}) == len(StatusRownan)


def test_rejestr_rodzin_wyczerpujacy_wobec_kontraktu_enm_w_obie_strony() -> None:
    rodziny_rdzenia_spoza_enm = {"maszyna_klasyczna"}
    assert set(rodziny_w_rejestrze()) == set(RODZINY_PARAMETROW_DYNAMICZNYCH) | (
        rodziny_rdzenia_spoza_enm
    )


def test_tylko_maszyna_klasyczna_ma_rownania_zwalidowane() -> None:
    zwalidowane = [
        r
        for r in rodziny_w_rejestrze()
        if status_rownan_rodziny(r) is StatusRownan.VALIDATED
    ]
    assert zwalidowane == ["maszyna_klasyczna"]
    assert "R10" in wpis_statusu_rownan("maszyna_klasyczna").audit_ref
    # ENM `synchroniczna` = 6. rząd + AVR/GOV/PSS — wyrocznia 2. rzędu jej nie obejmuje.
    assert status_rownan_rodziny("synchroniczna") is StatusRownan.UNVALIDATED
    for rodzina in RODZINY_PARAMETROW_DYNAMICZNYCH:
        wpis = wpis_statusu_rownan(rodzina)
        assert wpis.status is StatusRownan.UNVALIDATED
        assert "OPUS_PRZEGLAD_LUK_DYNAMIKI_2026-09-23.md §3" in wpis.audit_ref


@pytest.mark.parametrize(
    "rodzina", ["", "synchroniczna_6", "SYNCHRONICZNA", "nowa_rodzina"]
)
def test_rodzina_nieznana_fail_closed(rodzina: str) -> None:
    assert status_rownan_rodziny(rodzina) is StatusRownan.UNKNOWN


def test_odczyt_statusu_parametrow_brak_to_unknown() -> None:
    assert status_parametrow(None) is StatusParametrow.UNKNOWN
    prow = ProweniencjaParametrow(zrodlo="karta_producenta", odniesienie="DS-1")
    # Źródło „karta_producenta" NIE jest statusem — brak statusu = nieznany.
    assert status_parametrow(prow) is StatusParametrow.UNKNOWN
    for status in StatusParametrow:
        z_statusem = ProweniencjaParametrow(
            zrodlo="profil_typowy_normy",
            odniesienie="EN 50549",
            status_walidacji=status,
        )
        assert status_parametrow(z_statusem) is status


def test_rejestr_dowodowy_nie_ma_awansu_bez_podstawy() -> None:
    assert zdolnosci_z_awansem_bez_podstawy() == ()


def test_awans_wpisany_do_rejestru_bez_podstawy_jest_wykrywany(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Mutacja: ktoś podnosi zdolność do VALIDATED_SIMULATION samym wpisem.
    rejestr = dict(provenance._DYNAMIC_CAPABILITY_EVIDENCE)
    rejestr["dynamika_rms.przebieg_czasowy"] = CapabilityEvidence(
        capability_id="dynamika_rms.przebieg_czasowy",
        tier=EvidenceTier.VALIDATED_SIMULATION,
        rationale_pl="mutacja testowa",
        audit_ref="test",
    )
    monkeypatch.setattr(provenance, "_DYNAMIC_CAPABILITY_EVIDENCE", rejestr)
    assert zdolnosci_z_awansem_bez_podstawy() == ("dynamika_rms.przebieg_czasowy",)


def test_kontrakt_odczytu_rejestru() -> None:
    dane = status_modelu_rodzin_do_dict()
    assert sorted(dane["rodziny"]) == list(rodziny_w_rejestrze())  # type: ignore[call-overload]
    assert [s["kod"] for s in dane["statusy_parametrow"]] == [s.value for s in StatusParametrow]  # type: ignore[attr-defined]
