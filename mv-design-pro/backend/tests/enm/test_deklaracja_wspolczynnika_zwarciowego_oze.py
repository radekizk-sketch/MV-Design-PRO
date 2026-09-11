"""Deklarowany współczynnik wkładu zwarciowego DOCIERA z żądania do modelu.

PHANTOM, KTÓRY TO ZAMYKA (pomiar 2026-09-11). `MaterializedSourceParams.k_sc`
istniał w kontrakcie operacji domenowych ORAZ w jego lustrze TypeScript
(`frontend/src/types/domainOps.ts`), ale ŻADNA operacja go nie zapisywała.
Skutek: `enm.mapping` czytał `mp.get("k_sc")` i ZAWSZE dostawał ``None``, więc
wkład zwarciowy KAŻDEGO źródła OZE w produkcie brał się z domyślki systemowej,
a projektant nie miał żadnej drogi, żeby podać wartość z karty producenta albo
certyfikatu jednostki wytwórczej.

To jest phantom w rozumieniu dyrektywy „zero fabrykacji": pole kontraktu, którego
backend nie czyta, jest kontrolką, która niczego nie robi.

DLACZEGO TEGO NIE MA W KATALOGU. Współczynnik zależy od ogranicznika prądu
KONKRETNEGO egzemplarza, nie od rodzaju technologii — pomiar katalogu: 0 ze 176
pozycji przekształtników niesie `sc_model`, a samego pola `k_sc` typ katalogowy
w ogóle nie ma. Dlatego `k_sc` jest jawnie wyłączony z kontroli rozbieżności
„formularz kontra pozycja katalogowa" (`_POLA_TABLICZKI_SPOZA_KATALOGU`), a nie
uzupełniany wartością rodziny — to byłaby fabrykacja danej producenta.

DROGA UŻYTKOWNIKA, NIE WEWNĘTRZNA FUNKCJA: testy idą przez
`execute_domain_operation`, czyli to samo przejście, którym idzie kreator.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation

from tests.enm.test_brama_katalogowa_operacji_v2 import (
    REF_BESS,
    _payload_zrodla,
    _siec_ze_stacja,
)


def _zastosuj(payload: dict[str, Any]) -> dict[str, Any]:
    enm = _siec_ze_stacja()
    wynik = execute_domain_operation(enm_dict=enm, op_name="add_converter_source", payload=payload)
    assert not wynik.get("error"), wynik.get("error")
    return wynik["snapshot"]


def _tabliczka(snapshot: dict[str, Any]) -> dict[str, Any]:
    generatory = snapshot.get("generators") or []
    assert len(generatory) == 1, f"oczekiwano jednego generatora, jest {len(generatory)}"
    return generatory[0].get("materialized_params") or {}


def test_deklaracja_trafia_do_tabliczki_zrodla() -> None:
    """Wartość z żądania MUSI być w `materialized_params` — tam czyta ją mapowanie."""
    snapshot = _zastosuj(_payload_zrodla(_siec_ze_stacja(), catalog_ref=REF_BESS, k_sc=1.42))
    assert _tabliczka(snapshot).get("k_sc") == pytest.approx(1.42)


def test_brak_deklaracji_nie_wpisuje_liczby() -> None:
    """Uczciwy stan zerowy: brak klucza, nie ``null`` udający daną ani domyślka.

    Gdyby operacja wpisywała tu wartość zastępczą, ślad White Box nie miałby jak
    odróżnić deklaracji projektanta od liczby wstawionej przez system — czyli
    dokładnie tego, co ta naprawa przywraca.
    """
    snapshot = _zastosuj(_payload_zrodla(_siec_ze_stacja(), catalog_ref=REF_BESS))
    assert "k_sc" not in _tabliczka(snapshot)


@pytest.mark.parametrize(
    "wartosc",
    [0, 0.0, -1.5, "1.4", "abc", True, False, float("nan"), float("inf"), float("-inf")],
)
def test_deklaracja_niemozliwa_do_przyjecia_jest_BLEDEM_a_nie_cichym_brakiem(
    wartosc: object,
) -> None:
    """KOREKTA PO RECENZJI NIEZALEŻNEJ (P1-DELTA-04).

    Poprzednia wersja tego testu żądała, żeby niepoprawna wartość CICHO stała się
    brakiem danych — i przypinała tym samym defekt. Brak (`None`) i dana podana,
    ale niemożliwa do przyjęcia, to dwie różne sprawy: pierwsza jest stanem
    normalnym, druga błędem wejścia. Zrównanie ich gubiło informację, że ktoś
    próbował coś zadeklarować i mu się nie udało.

    ILOCZYN CECH: ``bool`` ma własne przypadki, bo jest podklasą ``int`` (bez
    jawnej gałęzi ``True`` przeszłoby jako ``k_sc = 1.0``); ``+Inf`` ma własny,
    bo poprzedni predykat sprawdzał wyłącznie ``> 0`` i przepuszczał go jako
    deklarację, dając ``I_k = inf`` z etykietą „użytkownik to podał" — ten
    przypadek recenzent wykonał niezależnie.
    """
    enm = _siec_ze_stacja()
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="add_converter_source",
        payload=_payload_zrodla(enm, catalog_ref=REF_BESS, k_sc=wartosc),
    )
    assert wynik.get("error"), f"Wartość {wartosc!r} została przyjęta bez błędu"
    assert wynik.get("error_code") == "converter.k_sc_invalid", wynik.get("error_code")


def test_pominiecie_pola_nie_jest_bledem() -> None:
    """DRUGA STRONA PREDYKATU: brak deklaracji to stan normalny, nie awaria.

    Bez tego przypadku bramka wyżej przechodziłaby też dla implementacji, która
    ŻĄDA ``k_sc`` przy każdym źródle — a to zablokowałoby TWORZENIE modelu
    zamiast zablokować zdolności zwarciowe, czyli przeniosłoby granicę w złe
    miejsce.
    """
    snapshot = _zastosuj(_payload_zrodla(_siec_ze_stacja(), catalog_ref=REF_BESS))
    assert "k_sc" not in _tabliczka(snapshot)


def test_deklaracja_zmienia_wklad_zwarciowy_w_modelu_obliczeniowym() -> None:
    """PEŁNY ŁAŃCUCH: żądanie → tabliczka → mapowanie ENM → `InverterSource`.

    Bez tego przypadku poprzednie testy dowodzą tylko, że liczba wylądowała w
    migawce. Dopiero tutaj widać, że dociera do rachunku — a droga z migawki do
    grafu obliczeniowego to właśnie ogniwo, które było przerwane.
    """
    from enm.mapping import map_enm_to_network_graph
    from enm.models import EnergyNetworkModel

    def _k_sc_grafu(payload: dict[str, Any]) -> tuple[float, str]:
        model = EnergyNetworkModel.model_validate(_zastosuj(payload))
        graf = map_enm_to_network_graph(model)
        zrodla = list(graf.inverter_sources.values())
        assert len(zrodla) == 1, f"oczekiwano jednego źródła falownikowego, jest {len(zrodla)}"
        return zrodla[0].k_sc, zrodla[0].k_sc_zrodlo

    bez_deklaracji, zrodlo_bez = _k_sc_grafu(
        _payload_zrodla(_siec_ze_stacja(), catalog_ref=REF_BESS)
    )
    z_deklaracja, zrodlo_z = _k_sc_grafu(
        _payload_zrodla(_siec_ze_stacja(), catalog_ref=REF_BESS, k_sc=1.42)
    )

    assert zrodlo_bez == "DOMYSLNE_SYSTEMOWE"
    assert zrodlo_z == "DEKLARACJA"
    assert z_deklaracja == pytest.approx(1.42)
    assert z_deklaracja != pytest.approx(
        bez_deklaracji
    ), "Deklaracja dotarła do migawki, ale nie zmieniła rachunku — to nadal phantom"
