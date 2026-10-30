"""Położenie łącznika pola SN bez własnej gałęzi — operacja ``set_bay_apparatus_position``.

PO CO. Łącznik pola, który nie ma gałęzi łączeniowej w modelu fizyki (odłącznik szynowy
i liniowy, uziemnik, łącznik trójpołożeniowy, rozłącznik albo rozłącznik bezpiecznikowy
poza torem gałęzi pola), niesie położenie w rekordzie aparatu
(`BayPrimaryDevice.switch_state`). Do tej operacji jedynym pisarzem tego rekordu była budowa
pola liniowego GPZ, więc po wymianie wyposażenia pola położenie łączników nowych instancji
było nieustalone bez sposobu nadania, a położenia „uziemiony" łącznika trójpołożeniowego nie
dało się nadać w ogóle. Instancja niezmieniona zachowuje położenie przy ponownym zastosowaniu
szablonu (`enm.pola.aparaty_po_wymianie`). Referencja HMI właściciela (2026-10-29) wymaga stanu jednoznacznego na schemacie —
schemat nie może pokazywać stanu, którego model nie ma, ani go zgadywać.

JEDNA PRAWDA. Aparat opisujący gałąź łączeniową modelu (`linked_ref` — wyłącznik pola) ma
położenie w gałęzi (`status`), które czyta fizyka; zmieniają je wyłącznie ``open_switch`` /
``close_switch``. Ta operacja na takim aparacie odmawia ze wskazaniem właściwej operacji —
nigdy nie powstaje druga kopia stanu. Położenie aparatu bez gałęzi NIE wchodzi do modelu
fizyki (rozpływ i zwarcia czytają wyłącznie gałęzie), więc operacja nie zmienia wyników
obliczeń; zmienia rysunek, blokady i opis pola.

REGUŁY (każda odmowa zostawia model bez zmian):
* położenie „uziemiony" ma wyłącznie łącznik trójpołożeniowy (ENEA Zeszyt 1 §13; ta sama
  reguła co walidacja rekordu `BayPrimaryDevice`);
* łącznik trójpołożeniowy ma jeden styk ruchomy — z położenia zamkniętego do uziemionego
  i z powrotem przechodzi przez położenie otwarte (PN-EN 62271-102: rozłącznik/odłącznik
  z uziemnikiem w jednym napędzie); przejście wprost jest odmową z akcją naprawczą;
* zamknięcie uziemnika przy zamkniętym łączniku toru z nim skojarzonym i zamknięcie łącznika
  toru przy zamkniętym uziemniku jest odmową — ta sama reguła i te same pary co walidator
  (`enm.interlock_rules.blokady_zamkniecia`, IEC 62271-200 §5.11);
* położenie bez zmiany jest odmową (operacja niczego by nie zmieniła).
"""

from __future__ import annotations

from typing import Any

from network_model.catalog.rodzaje_aparatury import (
    RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO,
    RODZAJE_LACZNIKOW_POLA,
    STAN_UZIEMIONY,
)

from .domain_operations import _error_response, _response
from .interlock_rules import (
    blokady_zamkniecia,
    is_closed,
    pary_blokad,
    porty_aparatu,
    stan_aparatu_z_galezia,
)
from .kopia_graniczna import kopia_graniczna_enm
from .models import Bay
from .pola import napis_lub_none, zmien_pole
from .pola import pole as pole_modelu
from .slownik_komunikatow import lista_pl, opis_elementu, pole
from .wyposazenie_pola import NAZWY_RODZAJOW_APARATU_POLA_PL

__all__ = ["POLOZENIA_APARATU_POLA", "set_bay_apparatus_position"]

#: Położenia nadawane przez projektanta (stany telemetrii — awaria, nieznany, napęd
#: rozbrojony — pochodzą wyłącznie ze źródła ruchowego, nie z decyzji projektowej).
POLOZENIA_APARATU_POLA: tuple[str, ...] = ("zamkniety", "otwarty", STAN_UZIEMIONY)

_NAZWY_POLOZEN_PL: dict[str, str] = {
    "zamkniety": "zamknięty",
    "otwarty": "otwarty",
    STAN_UZIEMIONY: "uziemiony",
}


def _opis_aparatu_pl(rodzaj: str, oznaczenie: object) -> str:
    """„odłącznik Q1" — nazwa rodzaju i oznaczenie aparatu; bez oznaczenia sama nazwa rodzaju
    (identyfikator aparatu jest kluczem maszynowym, nie tekstem dla projektanta)."""
    nazwa = NAZWY_RODZAJOW_APARATU_POLA_PL.get(rodzaj, "aparat")
    znak = napis_lub_none(oznaczenie)
    return f"{nazwa} {znak}" if znak else nazwa


def set_bay_apparatus_position(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Nadaj położenie łącznikowi pola bez własnej gałęzi łączeniowej."""
    bay_ref = napis_lub_none(payload.get("bay_ref"))
    device_ref = napis_lub_none(payload.get("device_ref"))
    if bay_ref is None or device_ref is None:
        return _error_response(
            f"Uzupełnij pola {pole('bay_ref', 'set_bay_apparatus_position')} i "
            f"{pole('device_ref', 'set_bay_apparatus_position')} — wskaż pole i łącznik pola.",
            "bay_apparatus_position.target_missing",
        )
    polozenie = payload.get("actual_state")
    if polozenie not in POLOZENIA_APARATU_POLA:
        dozwolone = ", ".join(_NAZWY_POLOZEN_PL[p] for p in POLOZENIA_APARATU_POLA)
        return _error_response(
            f"Uzupełnij pole {pole('actual_state', 'set_bay_apparatus_position')} — wskaż "
            f"położenie łącznika: {dozwolone}.",
            "bay_apparatus_position.state_invalid",
        )
    nowy = kopia_graniczna_enm(enm)
    rekord = pole_modelu(nowy, bay_ref)
    if rekord is None:
        return _error_response(
            "Wskazane pole rozdzielnicy nie istnieje w modelu sieci.",
            "bay_apparatus_position.bay_not_found",
        )
    aparaty = [dict(a) for a in rekord.get("primary_devices") or [] if isinstance(a, dict)]
    aparat = next((a for a in aparaty if a.get("device_ref") == device_ref), None)
    if aparat is None:
        return _error_response(
            f"{opis_elementu(nowy, bay_ref, 'Pole')} nie ma wskazanego aparatu — wskaż łącznik "
            "z wyposażenia tego pola.",
            "bay_apparatus_position.device_not_found",
        )
    rodzaj = str(aparat.get("kind"))
    opis = _opis_aparatu_pl(rodzaj, aparat.get("designation"))
    opis = opis[:1].upper() + opis[1:]
    if rodzaj not in RODZAJE_LACZNIKOW_POLA:
        return _error_response(
            f"{opis} nie jest łącznikiem — położenie łączeniowe mają wyłącznie wyłącznik, "
            "rozłącznik, odłącznik, uziemnik, rozłącznik bezpiecznikowy i łącznik "
            "trójpołożeniowy.",
            "bay_apparatus_position.not_a_switch",
        )
    if aparat.get("linked_ref"):
        return _error_response(
            f"{opis} opisuje łącznik modelu sieci ({opis_elementu(nowy, str(aparat['linked_ref']), 'łącznik')}) "
            "— jego położenie czyta rozpływ i zwarcia, więc zmieniają je wyłącznie operacje "
            "„Otwórz łącznik” i „Zamknij łącznik”.",
            "bay_apparatus_position.linked_to_branch",
        )
    if polozenie == STAN_UZIEMIONY and rodzaj != RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO:
        return _error_response(
            f"{opis}: położenie „uziemiony” ma wyłącznie łącznik trójpołożeniowy (ENEA "
            "Zeszyt 1 §13) — uziemnik zamyka się położeniem „zamknięty”.",
            "bay_apparatus_position.earthed_not_allowed",
        )
    status_galezi = {
        str(g.get("ref_id")): g.get("status")
        for g in nowy.get("branches") or []
        if isinstance(g, dict)
    }
    pole_przed = Bay.model_validate(rekord)
    aparat_przed = next(d for d in pole_przed.primary_devices if d.device_ref == device_ref)
    biezace = stan_aparatu_z_galezia(pole_przed, aparat_przed, status_galezi)
    if biezace == polozenie:
        return _error_response(
            f"{opis} jest już w położeniu „{_NAZWY_POLOZEN_PL[polozenie]}” — operacja niczego "
            "by nie zmieniła.",
            "bay_apparatus_position.unchanged",
        )
    if rodzaj == RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO and {biezace, polozenie} == {
        "zamkniety",
        STAN_UZIEMIONY,
    }:
        return _error_response(
            f"{opis}: łącznik trójpołożeniowy ma jeden styk ruchomy i przechodzi przez "
            "położenie otwarte (PN-EN 62271-102) — najpierw ustaw położenie „otwarty”.",
            "bay_apparatus_position.three_position_sequence",
        )
    if polozenie == "zamkniety":
        stany = [
            (
                d.device_ref,
                d.kind,
                stan_aparatu_z_galezia(pole_przed, d, status_galezi),
                porty_aparatu(d),
            )
            for d in pole_przed.primary_devices
        ]
        if blokady_zamkniecia(stany).get(device_ref) is True:
            # Aparaty przeciwne z TYCH SAMYCH par co blokada (jedno źródło obu kierunków).
            pary = pary_blokad([(ref, kind, porty) for ref, kind, _, porty in stany])
            przeciwne_refy = (
                pary[device_ref]
                if device_ref in pary
                else {e for e, laczniki in pary.items() if device_ref in laczniki}
            )
            stan_wg_refu = {ref: stan for ref, _, stan, _ in stany}
            return _error_response(
                f"{opis}: zamknięcie zablokowane — zamknięty jest aparat przeciwny blokady "
                "uziemnik ↔ łącznik toru ("
                + lista_pl(
                    (
                        _opis_aparatu_pl(d.kind, d.designation)
                        for d in pole_przed.primary_devices
                        if d.device_ref in przeciwne_refy and is_closed(stan_wg_refu[d.device_ref])
                    ),
                    "i",
                )
                + "); IEC 62271-200 §5.11. Najpierw otwórz aparat przeciwny.",
                "bay_apparatus_position.interlock",
            )
    aparat["switch_state"] = {"actual_state": polozenie}
    zmien_pole(nowy, bay_ref, primary_devices=aparaty)
    return _response(
        nowy,
        updated=[bay_ref],
        selection_id=bay_ref,
        selection_type="bay",
        events=[
            {
                "event_seq": 1,
                "event_type": "BAY_APPARATUS_POSITION_SET",
                "element_id": device_ref,
            }
        ],
    )
