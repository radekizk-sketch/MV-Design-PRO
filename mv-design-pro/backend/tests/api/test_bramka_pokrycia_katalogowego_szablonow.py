"""BRAMKA POKRYCIA (§23): żaden wspierany szablon nie kończy się brakiem katalogu.

CO TA BRAMKA CHRONI. Pomiar 2026-09-11 na żywym backendzie: biblioteka 57
szablonów stacji przeszła z **0/57** do **57/57** `ready`, a blokada
`switch.catalog_ref_missing` zniknęła z całej biblioteki (było 57/57). Wynik
osiągnęły dwie naprawy — dobór wyłącznika głównego nN z katalogu (zamiast
fantomu tworzonego bezwarunkowo) i wyprowadzenie przestrzeni katalogu aparatu
pola źródłowego DER z NAPIĘCIA SZYNY (zamiast zaszytego `APARAT_NN`).

DLACZEGO BRAMKA, A NIE POMIAR W DOKUMENCIE. Bez niej pierwszy nowy szablon albo
pierwsza zmiana ścieżki materializacji przywróci blokadę po cichu: kody
gotowości nie wywalają testów jednostkowych, a dokument audytu nie jest
uruchamiany. Ten test jest JEDYNYM miejscem, w którym wynik 57/57 jest
egzekwowany.

DROGA UŻYTKOWNIKA: szablony aplikują się przez ENDPOINT, a gotowość czyta się z
`/engineering-readiness` — to samo przejście, którym idzie kreator, więc test nie
może przejść „obok" bramek API.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.station_templates.templates import ALL_TEMPLATES

pytest.importorskip("fastapi")

from tests.api.test_szablony_pole_transformatorowe import _magistrala  # noqa: E402

#: Kody gotowości, które NIE MOGĄ wystąpić po zastosowaniu szablonu — każdy
#: oznacza element wymagający pozycji katalogowej, której szablon nie dostarczył.
KODY_BRAKU_KATALOGU = ("switch.catalog_ref_missing",)


def _zastosuj_i_zmierz(app_client: Any, template_id: str) -> dict[str, Any]:
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
    return gotowosc.json()


@pytest.mark.parametrize("template_id", [t.id for t in ALL_TEMPLATES])
def test_szablon_nie_zostawia_elementu_bez_pozycji_katalogowej(
    app_client: Any, template_id: str
) -> None:
    """Parametryzacja po CAŁEJ bibliotece — nie po wybranych przedstawicielach.

    Defekt, który ta bramka zamyka, dotyczył różnych podzbiorów w zależności od
    przyczyny: 38 szablonów miało fantomowy wyłącznik główny, 26 niezwiązany
    aparat pola DER, a jedna z tych grup dzieliła się dalej na 66 pól SN i 12 nN.
    Każdy „reprezentatywny" podzbiór przepuściłby którąś z nich.
    """
    gotowosc = _zastosuj_i_zmierz(app_client, template_id)
    braki = [
        problem
        for problem in (gotowosc.get("issues") or [])
        if problem.get("code") in KODY_BRAKU_KATALOGU
    ]
    assert (
        not braki
    ), f"Szablon '{template_id}' materializuje element bez pozycji katalogowej: " + "; ".join(
        f"{p.get('code')} @ {p.get('element_ref')} ({p.get('message_pl')})" for p in braki
    )


def test_biblioteka_nie_skurczyla_sie_ponizej_zmierzonego_zakresu() -> None:
    """Przesłanka parametryzacji: bramka na bibliotece obciętej do dwóch pozycji
    byłaby zielona i bez pokrycia."""
    assert len(ALL_TEMPLATES) >= 57, f"Biblioteka ma {len(ALL_TEMPLATES)} szablonów"
