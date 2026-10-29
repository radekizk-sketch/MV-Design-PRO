"""Stan obiektu pola SN — operacja ``set_object_state`` („oznacz jako istniejący" / „oznacz jako
projektowany").

PO CO. Zakaz gazów fluorowanych w nowych polach SN (rozporządzenie (UE) 2024/573, art. 13
ust. 9; dyrektywa właściciela 2026-10-28) dotyczy obiektów PROJEKTOWANYCH; aparat istniejący
w sieci (serwis — ust. 7, przeniesienie — ust. 10) może zawierać SF₆. Model niesie więc stan
obiektu na polu i na instancji aparatu pola (`enm.models.Bay.stan_obiektu`,
`BayPrimaryDevice.stan_obiektu`). Każda operacja tworząca nadaje ``PROJEKTOWANY`` jawnie;
``ISTNIEJACY`` ustawia WYŁĄCZNIE ta operacja (jawna decyzja projektanta, że obiekt jest zastany
w sieci) albo import istniejącej sieci niosący stan (arkusz importu — kolumna stanu szyny,
archiwum projektu — rekord pola wprost).

ZAKRES. Cel wskazuje DOKŁADNIE jeden z kluczy ``bay_ref`` albo ``switch_ref``. Z ``bay_ref`` bez
``device_ref`` operacja ustawia stan pola i KAŻDEGO jego aparatu (pole zastane jest zastane
w całości — aparat dobudowany później zostaje nową instancją, bo dodaje go operacja projektowa).
Z ``device_ref`` — stan jednej instancji aparatu (np. aparat przeniesiony z rozdzielnicy zastanej
do pola projektowanego: art. 13 ust. 10). Z ``switch_ref`` — stan gałęzi łączeniowej
(`SwitchBranch.stan_obiektu`: rozłącznik sekcyjny w ciągu, sprzęgło, łącznik pola bez lustra
w wyposażeniu pola). Gałąź opisana aparatem pola (`linked_ref`) ma stan wspólny z tym aparatem
(`enm.gaz_fluorowany_pola.stan_obiektu_lacznika`, jedno źródło) — ustawia się go na karcie pola
(``device_ref``: aparat i jego gałąź razem), więc operacja z ``switch_ref`` na niej odmawia ze
wskazaniem karty pola.

REGUŁA GAZU. Operacja nie ocenia gazu sama: strażnik KAŻDEJ operacji domenowej
(`domain_operations._odmowa_gazu_fluorowanego` → `enm.gaz_fluorowany_pola`) porównuje model
przed i po — oznaczenie pola z SF₆ jako projektowanego jest odmową ``pole.gaz_fluorowany``
z akcją „wybierz wykonanie bez gazów fluorowanych", oznaczenie jako istniejącego usuwa
naruszenie. Jedna reguła, żadnej kopii warunku tutaj.
"""

from __future__ import annotations

from typing import Any

from network_model.catalog.gazy_fluorowane import NAZWY_STANOW_OBIEKTU_PL, STANY_OBIEKTU

from .domain_operations import _error_response, _response
from .gaz_fluorowany_pola import RODZAJE_GALEZI_LACZENIOWYCH, aparat_lacznika
from .kopia_graniczna import kopia_graniczna_enm
from .pola import pole as pole_modelu
from .pola import zmien_pole
from .slownik_komunikatow import opis_elementu, opis_obiektu, pole

__all__ = ["set_object_state"]


def _napis(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


def set_object_state(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw stan obiektu pola (z aparatami), jednej instancji aparatu pola albo łącznika
    poza polem."""
    bay_ref = _napis(payload.get("bay_ref"))
    switch_ref = _napis(payload.get("switch_ref"))
    if bay_ref is None and switch_ref is None:
        return _error_response(
            f"Uzupełnij pole {pole('bay_ref', 'set_object_state')} albo "
            f"{pole('switch_ref', 'set_object_state')} — wskaż pole rozdzielnicy albo łącznik.",
            "object_state.bay_ref_missing",
        )
    if bay_ref is not None and switch_ref is not None:
        return _error_response(
            "Wskaż jeden obiekt: pole rozdzielnicy albo łącznik poza polem, nie oba naraz.",
            "object_state.target_ambiguous",
        )
    stan = payload.get("stan_obiektu")
    if stan not in STANY_OBIEKTU:
        dozwolone = ", ".join(NAZWY_STANOW_OBIEKTU_PL[s] for s in STANY_OBIEKTU)
        return _error_response(
            f"Uzupełnij pole {pole('stan_obiektu', 'set_object_state')} — wskaż stan obiektu: "
            f"{dozwolone}.",
            "object_state.state_invalid",
        )
    if switch_ref is not None:
        return _ustaw_stan_lacznika(enm, switch_ref, stan)
    nowy = kopia_graniczna_enm(enm)
    rekord = pole_modelu(nowy, bay_ref)
    if rekord is None:
        return _error_response(
            "Wskazane pole rozdzielnicy nie istnieje w modelu sieci.",
            "object_state.bay_not_found",
        )
    aparaty = [dict(a) for a in rekord.get("primary_devices") or [] if isinstance(a, dict)]
    device_ref = payload.get("device_ref")
    if device_ref is None:
        for aparat in aparaty:
            aparat["stan_obiektu"] = stan
        zmien_pole(nowy, bay_ref, stan_obiektu=stan, primary_devices=aparaty)
        # Łączniki pola (gałęzie z `equipment_refs` i wskazane przez aparaty pola) są
        # instancjami aparatu pola tak samo jak aparaty z listy — pole zastane jest zastane
        # w całości, a stan gałęzi łącznika i aparatu, który ją opisuje, jest jeden.
        _ustaw_stan_galezi(
            nowy,
            set(rekord.get("equipment_refs") or [])
            | {str(a["linked_ref"]) for a in aparaty if a.get("linked_ref")},
            stan,
        )
        zmienione = bay_ref
    else:
        if not isinstance(device_ref, str) or not device_ref.strip():
            return _error_response(
                f"Pole {pole('device_ref', 'set_object_state')} — wskaż aparat pola albo pomiń "
                "je, żeby ustawić stan całego pola.",
                "object_state.device_ref_invalid",
            )
        trafione = [a for a in aparaty if a.get("device_ref") == device_ref]
        if not trafione:
            return _error_response(
                f"{opis_elementu(nowy, bay_ref, 'Pole')} nie ma wskazanego aparatu — wskaż aparat "
                "z wyposażenia tego pola.",
                "object_state.device_not_found",
            )
        trafione[0]["stan_obiektu"] = stan
        zmien_pole(nowy, bay_ref, primary_devices=aparaty)
        if trafione[0].get("linked_ref"):
            _ustaw_stan_galezi(nowy, {str(trafione[0]["linked_ref"])}, stan)
        zmienione = device_ref
    return _response(
        nowy,
        updated=[bay_ref],
        selection_id=bay_ref,
        selection_type="bay",
        events=[{"event_seq": 1, "event_type": "OBJECT_STATE_SET", "element_id": zmienione}],
    )


def _ustaw_stan_galezi(enm: dict[str, Any], refy: set[str], stan: str) -> None:
    """Stan gałęzi łączeniowych o wskazanych identyfikatorach (MUTUJE prywatną kopię)."""
    for galaz in enm.get("branches") or []:
        if (
            isinstance(galaz, dict)
            and galaz.get("ref_id") in refy
            and galaz.get("type") in RODZAJE_GALEZI_LACZENIOWYCH
        ):
            galaz["stan_obiektu"] = stan


def _ustaw_stan_lacznika(enm: dict[str, Any], switch_ref: str, stan: str) -> dict[str, Any]:
    nowy = kopia_graniczna_enm(enm)
    galaz = next(
        (
            g
            for g in nowy.get("branches") or []
            if isinstance(g, dict)
            and g.get("ref_id") == switch_ref
            and g.get("type") in RODZAJE_GALEZI_LACZENIOWYCH
        ),
        None,
    )
    if galaz is None:
        return _error_response(
            "Wskazany łącznik nie istnieje w modelu sieci.",
            "object_state.switch_not_found",
        )
    if aparat_lacznika(nowy, switch_ref) is not None:
        return _error_response(
            f"{opis_obiektu(galaz, 'Łącznik')} opisuje aparat pola rozdzielnicy — ustaw stan "
            "tego aparatu na karcie pola.",
            "object_state.switch_has_bay_device",
        )
    galaz["stan_obiektu"] = stan
    return _response(
        nowy,
        updated=[switch_ref],
        selection_id=switch_ref,
        selection_type="switch",
        events=[{"event_seq": 1, "event_type": "OBJECT_STATE_SET", "element_id": switch_ref}],
    )
