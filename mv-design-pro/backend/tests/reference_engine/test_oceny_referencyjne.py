"""Rekordy K zgodności referencyjnej (karta WERDYKT-MIGRACJA-190, E61/D71/D72).

Dawniej sprawdzenie niosło goły status ``pass``/``fail``, a trzy ekrany tłumaczyły go na ✓/✗.
Teraz każde sprawdzenie niesie rekord K. Iloczyn cech:

- rodzaj pakietu {norma, producent, operator} × stan sprawdzenia {spełnione, naruszone} —
  rodzaj podstawy, status, etykieta, zdanie z nazwą elementu, stan stwierdzony;
- predykaty parami: liczniki pakietu z rekordów; znaleziska walidacji na żywo ⇔ rekordy
  ``NIE_SPELNIA`` tych samych reguł (jedno źródło — ``Sprawdzenie.spelniony``);
- ta sama reguła wielokrotnie dla jednego elementu — identyfikatory kryteriów unikalne;
- lista reguł zamknięta: każdy kod reguły w silniku ma opis kryterium;
- brak sprawdzeń pakietu ≠ zgodny (``score_percent is None``, zero rekordów);
- determinizm.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from enm.models import Bay
from reference_engine import evaluate_enm, get_reference_pack, reference_validation_issues
from reference_engine.oceny import ocena_sprawdzenia, opis_reguly

from tests.reference_engine.test_compliance_engine import _device, _enm, _rmu_line_bay

_RODZAJ_PODSTAWY = {"norm": "NORMA", "manufacturer": "KATALOG_PRODUCENTA", "osd": "OSD"}
_PAKIET_RODZAJU = {"norm": "iec62271", "manufacturer": "abb_safering", "osd": "osd_enea"}
_REGULA_RODZAJU = {
    "norm": "profile.order",
    "manufacturer": "family.cell_match",
    "osd": "osd_enea.station.bay_composition",
}


@pytest.mark.parametrize("rodzaj", sorted(_PAKIET_RODZAJU))
@pytest.mark.parametrize("spelniony", [True, False])
def test_rekord_sprawdzenia_rodzaj_pakietu_razy_stan(rodzaj: str, spelniony: bool) -> None:
    pack = get_reference_pack(_PAKIET_RODZAJU[rodzaj])
    ocena = ocena_sprawdzenia(
        pack=pack,
        element_ref="bay/x",
        nazwa_elementu_pl="Pole „Próbne”",
        rule_code=_REGULA_RODZAJU[rodzaj],
        wystapienie=1,
        spelniony=spelniony,
        message_pl="Stan stwierdzony przez silnik.",
    )
    assert ocena.status_maszynowy == ("SPELNIA" if spelniony else "NIE_SPELNIA")
    assert ocena.etykieta.semantyka == ("pozytywna" if spelniony else "negatywna")
    assert ocena.podstawa.rodzaj == _RODZAJ_PODSTAWY[rodzaj]
    assert ocena.podstawa.jednostka_redakcyjna == opis_reguly(_REGULA_RODZAJU[rodzaj]).jednostka_pl
    assert pack.version in (ocena.podstawa.wydanie or "")
    assert ocena.przedmiot.nazwa_pl == "Pole „Próbne”"
    assert "Pole „Próbne”" in ocena.wyjasnienie.zdanie_pl
    assert ocena.wynik is not None
    assert ocena.wynik.punkt_krytyczny_pl == "Stan stwierdzony przez silnik."
    assert ocena.dowod.metoda == "DEKLARACJA"
    assert ocena.dowod.poziom == "DECLARATION"


def _pole_z_dwoma_uziemnikami() -> Bay:
    bay = _rmu_line_bay("bay/2es")
    bay.primary_devices.append(_device("bay/2es/qe2", "ES", "MIDSTREAM"))
    return bay


def _pole_zla_kolejnosc() -> Bay:
    bay = _rmu_line_bay("bay/cb")
    bay.primary_devices.insert(0, _device("bay/cb/q0", "CB"))
    return bay


def _model():
    return _enm([_rmu_line_bay("bay/ok"), _pole_zla_kolejnosc(), _pole_z_dwoma_uziemnikami()])


def test_liczniki_pakietu_z_rekordow_i_unikalne_kryteria() -> None:
    raport = evaluate_enm(_model())
    zbadane = 0
    for pakiet in raport.packs:
        statusy = [c.ocena.status_maszynowy for c in pakiet.checks]
        assert pakiet.passed == statusy.count("SPELNIA")
        assert pakiet.failed == statusy.count("NIE_SPELNIA")
        assert pakiet.passed + pakiet.failed == pakiet.applicable == len(pakiet.checks)
        identyfikatory = [c.ocena.kryterium_id for c in pakiet.checks]
        assert len(identyfikatory) == len(set(identyfikatory)), pakiet.pack_id
        for c in pakiet.checks:
            assert c.ocena.przedmiot.element_ref == c.element_ref
            assert c.ocena.wynik is not None
            assert c.ocena.wynik.punkt_krytyczny_pl == c.message_pl
            # Nazwa z modelu, nigdy identyfikator (karta #142).
            assert c.element_ref not in c.ocena.przedmiot.nazwa_pl
        if pakiet.checks:
            zbadane += 1
    assert zbadane >= 2
    # Dwa uziemniki tego samego pola: ta sama reguła dwa razy — dwa różne kryteria.
    iec = next(p for p in raport.packs if p.pack_id == "iec62271")
    powtorzone = [
        c.ocena.kryterium_id
        for c in iec.checks
        if c.element_ref == "bay/2es" and c.rule_code == "profile.lateral_placement.ES"
    ]
    assert len(powtorzone) == 2 and len(set(powtorzone)) == 2


def test_znaleziska_na_zywo_wtedy_i_tylko_wtedy_gdy_rekord_naruszony() -> None:
    """Predykat parami: walidacja na żywo i raport czytają ten sam ``Sprawdzenie.spelniony``."""
    enm = _model()
    iec = next(p for p in evaluate_enm(enm, pack_ids=["iec62271"]).packs)
    naruszone = {
        (c.element_ref, c.message_pl)
        for c in iec.checks
        if c.ocena.status_maszynowy == "NIE_SPELNIA"
        and c.rule_code != "iec62271.interlock.es_vs_main"
    }
    znaleziska = {
        (f.element_ref, f.message_pl.split(": ", 1)[1]) for f in reference_validation_issues(enm)
    }
    assert naruszone, "model musi mieć naruszone sprawdzenie profilu"
    assert znaleziska == naruszone


def test_pakiet_bez_sprawdzen_nie_jest_zgodny() -> None:
    pakiet = next(p for p in evaluate_enm(_model()).packs if p.pack_id == "osd_enea")
    assert pakiet.checks == []
    assert pakiet.score_percent is None
    assert pakiet.passed == pakiet.failed == pakiet.applicable == 0


def test_kazda_regula_silnika_ma_opis_kryterium() -> None:
    """Lista reguł zamknięta: każdy kod reguły zapisany w silniku ma opis kryterium."""
    zrodlo = (
        Path(__file__).resolve().parents[2] / "src" / "reference_engine" / "compliance.py"
    ).read_text(encoding="utf-8")
    kody = set(re.findall(r'"((?:profile|family|iec\d+|osd_enea)\.[A-Za-z0-9_.]*)', zrodlo))
    kody |= {
        f"{prefiks}PROBA" for prefiks in re.findall(r'f"((?:profile|family)\.[a-z_]+\.)\{', zrodlo)
    }
    assert len(kody) >= 15
    for kod in sorted(kody):
        opis_reguly(kod)
    with pytest.raises(KeyError):
        opis_reguly("regula.spoza.listy")


def test_rekordy_deterministyczne() -> None:
    a = evaluate_enm(_model()).model_dump(mode="json")
    b = evaluate_enm(_model()).model_dump(mode="json")
    assert a == b
