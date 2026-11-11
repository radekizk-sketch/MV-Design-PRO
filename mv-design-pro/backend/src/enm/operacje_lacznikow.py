"""W5-C: operacje stanu łączeniowego — jedna prawda w modelu bazowym.

``BranchBase.status`` jest JEDYNYM stanem łącznika czytanym przez fizykę (bieżące
położenie w modelu bazowym); ``SwitchBranch.normal_state`` — pozycją normalną z projektu
(punkt normalnie otwarty = ``"open"``). Trzy operacje kanoniczne:

* ``open_switch`` / ``close_switch`` — zmieniają WYŁĄCZNIE ``status`` łącznika (każdego
  typu łącznikowego, łącznie z bezpiecznikiem — ``RODZAJE_GALEZI_APARATU``). Pozycji normalnej
  nie ruszają: chwilowe otwarcie łącznika nie jest deklaracją punktu podziału.
* ``set_normal_open_point`` — ATOMOWO: wskazany łącznik dostaje ``normal_state="open"``
  i ``status="open"``, a poprzedni punkt podziału TEGO SAMEGO pierścienia
  (``enm.topology.poprzednie_punkty_podzialu``) — ``normal_state="closed"`` i
  ``status="closed"``. Dawna wersja otwierała łącznik, zapisywała go w PIERWSZEJ
  z brzegu magistrali i niczego nie zamykała (pierścień zostawał z dwoma podziałami).

Stan łącznika w SCENARIUSZU ruchowym (bez zmiany modelu bazowego) niesie
``OperatingScenario.switch_states`` (``enm/scenariusze.py``) — to osobne pojęcie.

Każda odmowa zostawia model bez zmian (praca na kopii granicznej; sukces = jedna
migawka wynikowa przez ``_response``).
"""

from __future__ import annotations

from typing import Any, Literal

from .domain_operations import _error_response, _response
from .kopia_graniczna import kopia_graniczna_enm
from .models import RODZAJE_GALEZI_APARATU
from .slownik_komunikatow import lista_pl, opis_elementu, pole
from .stan_normalny import RODZAJE_GALEZI_LACZNIKA
from .topology import poprzednie_punkty_podzialu

StanLacznika = Literal["closed", "open"]

#: Słowo stanu w zdaniu dla projektanta.
_NAZWA_STANU_PL: dict[str, str] = {"open": "otwarty", "closed": "zamknięty"}


def _galaz(enm: dict[str, Any], ref: str) -> dict[str, Any] | None:
    for galaz in enm.get("branches", []):
        if isinstance(galaz, dict) and galaz.get("ref_id") == ref:
            return galaz
    return None


def _zmien_stan(enm: dict[str, Any], payload: dict[str, Any], stan: StanLacznika) -> dict[str, Any]:
    """Wspólny rdzeń ``open_switch``/``close_switch`` — zmiana ``status`` łącznika."""
    ref = payload.get("switch_ref")
    if not isinstance(ref, str) or not ref.strip():
        nazwa_pola = (
            pole("switch_ref", "open_switch")
            if stan == "open"
            else pole("switch_ref", "close_switch")
        )
        return _error_response(
            f"Uzupełnij pole {nazwa_pola} — wskaż łącznik, którego stan ma zostać zmieniony.",
            "switch.ref_missing",
        )
    nowy = kopia_graniczna_enm(enm)
    galaz = _galaz(nowy, ref)
    if galaz is None:
        return _error_response("Wskazany łącznik nie istnieje w modelu sieci.", "switch.not_found")
    if galaz.get("type") not in RODZAJE_GALEZI_APARATU:
        return _error_response(
            f"{opis_elementu(enm, ref, 'Element')} nie jest łącznikiem — stan otwarty albo "
            "zamknięty mają wyłącznie łączniki i bezpieczniki.",
            "switch.not_a_switch",
        )
    if (galaz.get("status") or "closed") == stan:
        return _error_response(
            f"{opis_elementu(enm, ref, 'Łącznik')} jest już {_NAZWA_STANU_PL[stan]} — "
            "operacja niczego by nie zmieniła.",
            "switch.state_unchanged",
        )
    galaz["status"] = stan
    return _response(
        nowy,
        updated=[ref],
        selection_id=ref,
        selection_type="switch",
        events=[
            {
                "event_seq": 1,
                "event_type": "SWITCH_OPENED" if stan == "open" else "SWITCH_CLOSED",
                "element_id": ref,
            }
        ],
    )


def open_switch(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Otwórz łącznik w modelu bazowym (``status="open"``); pozycja normalna bez zmian."""
    return _zmien_stan(enm, payload, "open")


def close_switch(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Zamknij łącznik w modelu bazowym (``status="closed"``); pozycja normalna bez zmian."""
    return _zmien_stan(enm, payload, "closed")


def set_normal_open_point(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Przenieś punkt normalnie otwarty pierścienia na wskazany łącznik — atomowo.

    ``switch_ref`` — łącznik nowego punktu podziału (typ ``SwitchBranch``: wyłącznik,
    rozłącznik, odłącznik, sprzęgło; bezpiecznik nie jest punktem podziału).
    ``close_ref`` — opcjonalnie: który z poprzednich punktów podziału zamknąć, gdy łącznik
    jest wspólny dla kilku (topologia „theta"); przy jednym kandydacie musi go wskazywać
    albo zostać pominięty. Łącznik promieniowy (bez pierścienia) staje się punktem podziału
    bez zamykania czegokolwiek.
    """
    ref = payload.get("switch_ref")
    if not isinstance(ref, str) or not ref.strip():
        return _error_response(
            f"Uzupełnij pole {pole('switch_ref', 'set_normal_open_point')} — wskaż łącznik, "
            "który ma być punktem normalnie otwartym.",
            "nop.switch_missing",
        )
    nowy = kopia_graniczna_enm(enm)
    galaz = _galaz(nowy, ref)
    if galaz is None:
        return _error_response(
            "Wskazany łącznik nie istnieje w modelu sieci.", "nop.switch_not_found"
        )
    if galaz.get("type") not in RODZAJE_GALEZI_LACZNIKA:
        return _error_response(
            f"{opis_elementu(enm, ref, 'Element')} nie może być punktem normalnie otwartym — "
            "punktem podziału jest wyłącznik, rozłącznik, odłącznik albo sprzęgło "
            "(bezpiecznik i odcinek linii nie mają pozycji normalnej).",
            "nop.not_a_switch",
        )

    kandydaci = poprzednie_punkty_podzialu(enm, ref)
    wskazany = payload.get("close_ref")
    if wskazany is not None and (not isinstance(wskazany, str) or wskazany not in kandydaci):
        opis = (
            "żaden poprzedni punkt podziału tego pierścienia nie zależy od wskazanego łącznika"
            if not kandydaci
            else "poprzednim punktem podziału tego pierścienia może być wyłącznie "
            + lista_pl(opis_elementu(enm, k, "łącznik") for k in kandydaci)
        )
        return _error_response(
            f"Pole {pole('close_ref', 'set_normal_open_point')}: wskazany łącznik nie jest "
            f"poprzednim punktem podziału pierścienia — {opis}.",
            "nop.close_ref_invalid",
        )
    if wskazany is None and len(kandydaci) > 1:
        return _error_response(
            f"Pierścień ma kilka punktów podziału zależnych od "
            f"{opis_elementu(enm, ref, 'łącznika')}: "
            f"{lista_pl((opis_elementu(enm, k, 'łącznik') for k in kandydaci), 'i')}. "
            f"Wskaż w polu {pole('close_ref', 'set_normal_open_point')}, który z nich zamknąć "
            "— zamknięcie wszystkich utworzyłoby pętlę.",
            "nop.previous_ambiguous",
        )
    do_zamkniecia = [wskazany] if isinstance(wskazany, str) else list(kandydaci)

    galaz["normal_state"] = "open"
    galaz["status"] = "open"
    zaktualizowane = [ref]
    zdarzenia: list[dict[str, Any]] = [{"event_seq": 1, "event_type": "NOP_SET", "element_id": ref}]
    indeks = {g.get("ref_id"): g for g in nowy.get("branches", []) if isinstance(g, dict)}
    for poprzedni in do_zamkniecia:
        galaz_poprzednia = indeks[poprzedni]  # kandydat pochodzi z gałęzi tej migawki
        galaz_poprzednia["normal_state"] = "closed"
        galaz_poprzednia["status"] = "closed"
        zaktualizowane.append(poprzedni)
        zdarzenia.append(
            {
                "event_seq": len(zdarzenia) + 1,
                "event_type": "NOP_CLEARED",
                "element_id": poprzedni,
            }
        )
    return _response(
        nowy,
        updated=zaktualizowane,
        selection_id=ref,
        selection_type="switch",
        events=zdarzenia,
    )
