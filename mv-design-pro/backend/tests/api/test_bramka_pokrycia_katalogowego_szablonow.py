"""Miary pokrycia biblioteki szablonów — KAŻDA nazwana tym, co naprawdę mierzy.

KOREKTA PO RECENZJI NIEZALEŻNEJ (P1-DELTA-05). Poprzednia wersja tego pliku
filtrowała problemy gotowości do jednego kodu (`switch.catalog_ref_missing`) i
NIE sprawdzała ``ready is True`` ani braku innych blokad — a mimo to była
jedynym wykonywalnym oparciem dla zdania „57/57 gotowych szablonów". Recenzent
pokazał, że odpowiedź ``{"ready": false, "issues":[{"code":"other.blocker"}]}``
przechodziła tę bramkę.

TU NIE MA JEDNEJ LICZBY, BO ZDOLNOŚCI SIĘ RÓŻNIĄ. Zamiast agregatu publikujemy
miary rozłączne, każda ze swoim testem (pomiar 2026-09-11, ta sama ścieżka API):

    materializacja szablonu              57/57
    brak `switch.catalog_ref_missing`    57/57
    `engineering-readiness.ready`        57/57
    LOAD_FLOW eligible                   57/57
    SC_3F eligible                       31/57   (26 szablonów DER blokuje k_sc)
    SC_1F eligible                        0/57   (brak Z₀ źródła — W002)
    SC_2F eligible                        0/57   (kontrakt Z₂ nieukończony)
    FAULT_LOOP_NN / SWZ_NN eligible       0/57   (brak odcinków kablowych nN)

Zlepienie tego w „57/57 READY" ukrywało cztery różne stany pod jedną liczbą.

DROGA UŻYTKOWNIKA: szablony aplikują się przez ENDPOINT, gotowość i macierz
zdolności czyta się z API — to samo przejście, którym idzie kreator.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.station_templates.templates import ALL_TEMPLATES

pytest.importorskip("fastapi")

from tests.api.test_szablony_pole_transformatorowe import _magistrala  # noqa: E402

#: Kod gotowości oznaczający element, który wymaga pozycji katalogowej, a jej nie ma.
KOD_BRAKU_WIAZANIA = "switch.catalog_ref_missing"

#: Zmierzone pokrycie zdolności (2026-09-11). Liczby są PRZYPIĘTE: zmiana w którąkolwiek
#: stronę ma wywalić test i zmusić do aktualizacji nagłówka razem z kodem.
#: SC_3F < 57 jest ZAMIERZONE — blokada niemiarodajnego ``k_sc`` (P0-DELTA-03).
POKRYCIE_ZDOLNOSCI: dict[str, int] = {
    "LOAD_FLOW": 57,
    "SC_3F": 31,
    "SC_1F": 0,
    "SC_2F": 0,
    "FAULT_LOOP_NN": 0,
    "SWZ_NN": 0,
}


def _zastosuj_i_zmierz(app_client: Any, template_id: str) -> tuple[dict[str, Any], dict[str, bool]]:
    """(gotowość inżynierska, macierz zdolności) po zastosowaniu szablonu."""
    case_id, segment_ref = _magistrala(app_client)
    odpowiedz = app_client.post(
        f"/api/station-templates/{template_id}/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segment_ref,
            "insert_at_ratio": 0.5,
            "params_override": {},
            "catalog_profile": None,
        },
    )
    assert odpowiedz.status_code in (200, 201), f"{template_id}: {odpowiedz.text}"

    gotowosc = app_client.get(f"/api/cases/{case_id}/engineering-readiness")
    assert gotowosc.status_code == 200, gotowosc.text

    zdolnosci = app_client.get(f"/api/cases/{case_id}/analysis-eligibility")
    assert zdolnosci.status_code == 200, zdolnosci.text
    mapa = {
        str(poz.get("analysis_type")): poz.get("status") == "ELIGIBLE"
        for poz in zdolnosci.json().get("matrix") or []
    }
    return gotowosc.json(), mapa


# ---------------------------------------------------------------------------
# (a) MIARA 1 — pokrycie wiązań katalogowych
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("template_id", [t.id for t in ALL_TEMPLATES])
def test_szablon_nie_zostawia_elementu_bez_pozycji_katalogowej(
    app_client: Any, template_id: str
) -> None:
    """Parametryzacja po CAŁEJ bibliotece — nie po wybranych przedstawicielach.

    Defekt, który ta miara zamyka, dotyczył różnych podzbiorów zależnie od
    przyczyny: 38 szablonów miało fantomowy wyłącznik główny, 26 niezwiązany
    aparat pola DER, a ta druga grupa dzieliła się dalej na 66 pól SN i 12 nN.
    Każdy „reprezentatywny" podzbiór przepuściłby którąś z nich.
    """
    gotowosc, _ = _zastosuj_i_zmierz(app_client, template_id)
    braki = [p for p in (gotowosc.get("issues") or []) if p.get("code") == KOD_BRAKU_WIAZANIA]
    assert (
        not braki
    ), f"Szablon '{template_id}' materializuje element bez pozycji katalogowej: " + "; ".join(
        f"{p.get('code')} @ {p.get('element_ref')}" for p in braki
    )


# ---------------------------------------------------------------------------
# (b) MIARA 2 — PEŁNY kontrakt gotowości, nie jeden kod
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("template_id", [t.id for t in ALL_TEMPLATES])
def test_szablon_osiaga_pelna_gotowosc_inzynierska(app_client: Any, template_id: str) -> None:
    """``ready is True`` ORAZ zero blokad DOWOLNEGO kodu.

    To jest asercja, której brakowało: poprzednia wersja filtrowała problemy do
    jednego kodu, więc odpowiedź z ``ready=False`` i innym blokerem przechodziła.
    Sprawdzamy teraz kontrakt, a nie jego wycinek — i nie nazywamy wyniku
    „gotowością inżynierską" ogólnie, bo to nadal jest gotowość MODELU, nie
    dowód przydatności do konkretnej analizy (tę mierzy część (c)).
    """
    gotowosc, _ = _zastosuj_i_zmierz(app_client, template_id)
    blokady = [
        p for p in (gotowosc.get("issues") or []) if str(p.get("severity")).upper() == "BLOCKER"
    ]
    # KOMPLETNOSC STRUKTURALNA, NIE „GOTOWOSC" BEZ PRZYMIOTNIKA (P1-DELTA-08).
    # Endpoint nie niesie juz golego `ready`: ta sama liczba 57/57 opisywala
    # kompletnosc modelu, a dawala sie czytac jako ogolne potwierdzenie gotowosci
    # inzynierskiej — mimo ze 26 szablonow DER mialo prawidlowo ZABLOKOWANE
    # zwarcie 3F. Zdolnosci sa mierzone osobno, w czesci (c) tego pliku.
    assert (
        gotowosc.get("kompletnosc_modelu") == "MODEL_COMPLETE"
    ), f"Szablon '{template_id}': {gotowosc.get('kompletnosc_modelu')}, blokady=" + "; ".join(
        f"{p.get('code')} @ {p.get('element_ref')}" for p in blokady
    )
    assert not blokady, [p.get("code") for p in blokady]


# ---------------------------------------------------------------------------
# (c) MIARA 3 — pokrycie ZDOLNOŚCI, osobno dla każdej
# ---------------------------------------------------------------------------


def test_pokrycie_zdolnosci_jest_zmierzone_osobno_dla_kazdej(app_client: Any) -> None:
    """Jedna liczba na zdolność — bo zdolności NIE są gotowe w tym samym stopniu.

    Ten test jest sercem korekty P1-DELTA-05. Gotowość modelu (część (b)) mówi
    „model jest kompletny"; NIE mówi „da się na nim policzyć zwarcie". Różnica
    jest zmierzona i duża: rozpływ mocy 57/57, zwarcie 3F 31/57, zwarcie 1F i 2F
    oraz pętla zwarcia nN 0/57.

    SC_3F = 31/57 jest ZAMIERZONE: 26 szablonów DER blokuje granica
    miarodajności ``k_sc`` (P0-DELTA-03). Gdyby ta liczba wróciła do 57 bez
    zmiany w danych wejściowych, znaczyłoby to, że granica przestała działać.
    """
    zliczenia = dict.fromkeys(POKRYCIE_ZDOLNOSCI, 0)
    for template in ALL_TEMPLATES:
        _, zdolnosci = _zastosuj_i_zmierz(app_client, template.id)
        for nazwa in POKRYCIE_ZDOLNOSCI:
            if zdolnosci.get(nazwa):
                zliczenia[nazwa] += 1

    assert zliczenia == POKRYCIE_ZDOLNOSCI, (
        f"Pokrycie zdolności rozjechało się z pomiarem: zmierzono {zliczenia}, "
        f"przypięto {POKRYCIE_ZDOLNOSCI}. Zaktualizuj nagłówek pliku i audyt "
        f"RAZEM z kodem — liczba bez opisu znów stanie się 'gotowością'."
    )


def test_zwarcie_3f_jest_zablokowane_DOKLADNIE_tam_gdzie_brak_deklaracji_k_sc(
    app_client: Any,
) -> None:
    """Blokada trafia w szablony DER, a nie „gdzieś".

    PREDYKAT PARZYSTY: zbiór zablokowanych MUSI równać się zbiorowi szablonów z
    czynnym źródłem przekształtnikowym bez deklaracji ``k_sc``. Sama liczba
    31/57 przeszłaby też dla implementacji blokującej przypadkowe 26 szablonów.
    """
    zablokowane: set[str] = set()
    z_falownikiem: set[str] = set()
    for template in ALL_TEMPLATES:
        _, zdolnosci = _zastosuj_i_zmierz(app_client, template.id)
        if not zdolnosci.get("SC_3F"):
            zablokowane.add(template.id)
        if template.schema.der_options and template.schema.der_total_count.default > 0:
            z_falownikiem.add(template.id)
    assert zablokowane == z_falownikiem, (
        f"tylko zablokowane: {sorted(zablokowane - z_falownikiem)}; "
        f"tylko z falownikiem: {sorted(z_falownikiem - zablokowane)}"
    )


def test_biblioteka_nie_skurczyla_sie_ponizej_zmierzonego_zakresu() -> None:
    """Przesłanka wszystkich miar: bramka na bibliotece obciętej byłaby pusta."""
    assert len(ALL_TEMPLATES) >= 57, f"Biblioteka ma {len(ALL_TEMPLATES)} szablonów"
