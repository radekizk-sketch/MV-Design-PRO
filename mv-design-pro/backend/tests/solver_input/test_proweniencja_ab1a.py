"""Kontrakty proweniencji karty AB-1a: `KodFailClosed` (D6), `StatusZrodla` +
`WartoscZProweniencja` (D5) i rejestr dowodowy zdolnosci solverow (D1).

Kazda mocna deklaracja z docstringow `solver_input/provenance.py` ma tu przypiety
test (regula KLASA, NIE INSTANCJA p. 4): slownik kodow ZAMKNIETY, zero wartosci
domyslnych parametru z proweniencja, rozlacznosc dwoch rejestrow dowodowych,
`VALIDATED_SIMULATION` wylacznie z istniejaca wyrocznia.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from application.solvers.solver_capability_registry import PhysicsDomain
from solver_input import provenance
from solver_input.provenance import (
    EvidenceTier,
    FieldQuality,
    KodFailClosed,
    SourceKind,
    StatusZrodla,
    WartoscZProweniencja,
    classify_capability,
    registered_capabilities,
    registered_dynamic_capabilities,
    registered_solver_capabilities,
)

_KORZEN_BACKENDU = Path(__file__).resolve().parents[2]


# --------------------------------------------------------------------------- #
# D6 — KodFailClosed (W-99): slownik zamkniety, kazdy kod z etykieta i opisem
# --------------------------------------------------------------------------- #
def test_kody_fail_closed_slownik_zamkniety() -> None:
    assert [kod.value for kod in KodFailClosed] == [
        "UNVALIDATED_INPUT",
        "MODEL_MISSING",
        "OUTSIDE_DOMAIN",
        "REQUIREMENT_UNVERIFIED",
    ]
    assert set(provenance._KOD_FAIL_CLOSED_LABEL_PL) == set(KodFailClosed)
    assert set(provenance._KOD_FAIL_CLOSED_OPIS_PL) == set(KodFailClosed)


@pytest.mark.parametrize("kod", list(KodFailClosed))
def test_kazdy_kod_ma_etykiete_i_opis_co_zrobic(kod: KodFailClosed) -> None:
    assert kod.label_pl.strip()
    assert kod.opis_pl.strip()
    assert kod.label_pl != kod.opis_pl
    assert kod.to_dict() == {"kod": kod.value, "label_pl": kod.label_pl, "opis_pl": kod.opis_pl}
    # Bez kodow projektowych w tekstach dla uzytkownika.
    assert not re.search(r"\b(?:P\d{1,2}|W-\d{2}|AB-\d)\b", kod.label_pl + kod.opis_pl)


# --------------------------------------------------------------------------- #
# D5 — StatusZrodla + WartoscZProweniencja (W-98)
# --------------------------------------------------------------------------- #
def test_status_zrodla_zamkniety_z_etykietami() -> None:
    assert [status.value for status in StatusZrodla] == ["UNVERIFIED_SOURCE", "VERIFIED_SOURCE"]
    assert set(provenance._STATUS_ZRODLA_LABEL_PL) == set(StatusZrodla)


def _wartosc(**nadpisania: object) -> WartoscZProweniencja[float]:
    pola: dict[str, object] = {
        "value": 2.0,
        "unit": "Hz/s",
        "source": SourceKind.CATALOG,
        "version": None,
        "status": StatusZrodla.UNVERIFIED_SOURCE,
        "domain": PhysicsDomain.RMS_DYNAMICS,
    }
    pola.update(nadpisania)
    return WartoscZProweniencja(**pola)  # type: ignore[arg-type]


@pytest.mark.parametrize("pole", ["value", "unit", "source", "version", "status", "domain"])
def test_zadne_pole_parametru_nie_ma_wartosci_domyslnej(pole: str) -> None:
    pola: dict[str, object] = {
        "value": 2.0,
        "unit": "Hz/s",
        "source": SourceKind.CATALOG,
        "version": None,
        "status": StatusZrodla.UNVERIFIED_SOURCE,
        "domain": None,
    }
    del pola[pole]
    with pytest.raises(TypeError):
        WartoscZProweniencja(**pola)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "zle",
    [
        {"status": "UNVERIFIED_SOURCE"},
        {"status": None},
        {"source": "CATALOG"},
        {"domain": "POWER_FLOW"},
    ],
)
def test_typy_pol_wymuszone_przy_budowie(zle: dict[str, object]) -> None:
    with pytest.raises(TypeError):
        _wartosc(**zle)


def test_pusta_jednostka_odrzucona() -> None:
    with pytest.raises(ValueError, match="unit"):
        _wartosc(unit="")


@pytest.mark.parametrize(
    "status", [*list(StatusZrodla), *list(FieldQuality)], ids=lambda status: status.value
)
@pytest.mark.parametrize("domena", [None, *list(PhysicsDomain)], ids=str)
def test_serializacja_stabilna_dla_kazdego_statusu_i_domeny(
    status: StatusZrodla | FieldQuality, domena: PhysicsDomain | None
) -> None:
    wartosc = _wartosc(status=status, domain=domena, version="2019")
    slownik = wartosc.to_dict()
    assert list(slownik) == ["value", "unit", "source", "version", "status", "status_pl", "domain"]
    assert slownik["status"] == status.value
    assert slownik["status_pl"] == status.label_pl
    assert slownik["domain"] == (domena.value if domena is not None else None)
    assert json.dumps(slownik, sort_keys=True) == json.dumps(
        _wartosc(status=status, domain=domena, version="2019").to_dict(), sort_keys=True
    )


def test_wartosc_jest_niezmienna() -> None:
    wartosc = _wartosc()
    with pytest.raises(AttributeError):
        wartosc.value = 3.0  # type: ignore[misc]


# --------------------------------------------------------------------------- #
# D1 — rejestr dowodowy zdolnosci solverow
# --------------------------------------------------------------------------- #
def test_rejestry_dowodowe_sa_rozlaczne_i_skladaja_sie_na_calosc() -> None:
    solverowe = set(registered_solver_capabilities())
    dynamiczne = set(registered_dynamic_capabilities())
    assert solverowe.isdisjoint(dynamiczne)
    assert set(registered_capabilities()) == solverowe | dynamiczne


def test_classify_capability_fail_closed_dla_nieznanego() -> None:
    ocena = classify_capability("nieistniejaca.zdolnosc")
    assert ocena.tier is EvidenceTier.UNVALIDATED_MODEL
    assert ocena.regulatory_evidence_eligible is False


@pytest.mark.parametrize("capability_id", registered_solver_capabilities())
def test_zwalidowana_zdolnosc_wskazuje_istniejaca_wyrocznie(capability_id: str) -> None:
    """`VALIDATED_SIMULATION` tylko z wyrocznia, ktora ISTNIEJE w repozytorium.

    Kazda sciezka `tests/...py` wymieniona w `audit_ref` wpisu zwalidowanego musi
    istniec, a nazwana funkcja testowa (po `::`) — byc zdefiniowana w tym pliku.
    Wpis nieraportowalny musi miec niepuste uzasadnienie braku.
    """
    ocena = classify_capability(capability_id)
    assert ocena.rationale_pl.strip()
    if ocena.tier is not EvidenceTier.VALIDATED_SIMULATION:
        assert ocena.regulatory_evidence_eligible is False
        return
    sciezki = re.findall(r"(tests/[\w/]+\.py)(?:::(\w+))?", ocena.audit_ref)
    assert sciezki, f"{capability_id}: audit_ref bez sciezki testu wyroczni"
    for sciezka, funkcja in sciezki:
        plik = _KORZEN_BACKENDU / sciezka
        assert plik.exists(), f"{capability_id}: brak pliku wyroczni {sciezka}"
        if funkcja:
            tekst = plik.read_text(encoding="utf-8")
            assert re.search(
                rf"^\s*(?:def|class) {funkcja}\b", tekst, re.MULTILINE
            ), f"{capability_id}: brak {funkcja} w {sciezka}"


def test_wpisy_rejestru_solverow_maja_rodzaj_twierdzenia_wielkosc_fizyczna() -> None:
    """Odbior AB-1a (wykonawca 1 nazwal dlug): wynik solvera stanu ustalonego/zwarc
    jest WIELKOSCIA FIZYCZNA, nie zachowaniem modulu w czasie — bez tego pinu
    zwarcia nosilyby etykiete „zachowanie_dynamiczne" przez domyslke ClaimKind."""
    from solver_input.provenance import (
        ClaimKind,
        classify_capability,
        registered_solver_capabilities,
    )

    for capability_id in registered_solver_capabilities():
        ewidencja = classify_capability(capability_id)
        assert ewidencja.claim_kind is ClaimKind.PHYSICAL_QUANTITY, capability_id
        assert ewidencja.claim_kind.label_pl == "wielkosc_fizyczna"
