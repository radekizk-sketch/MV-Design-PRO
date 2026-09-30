"""Fabryka rekordu „ocena niewykonana" — cienka nakładka na ``werdykt.decyzja.ocen_kryterium``.

Kontrakt werdyktu wyjaśnialnego (``docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md``): typy
z pakietu ``werdykt`` są JEDYNYMI typami rekordu oceny w produkcie. Powierzchnie, które nie
mają podstawy do werdyktu (trajektorie FRT z profilu wejściowego, tor stabilności z kątów
wpisanych przez użytkownika, jakość energii z solvera niezwalidowanego, SSCI z Z_grid bez
przekładni transformatora, pole LoM bez sprawdzeń), dostają pełny rekord poziomu K
``OcenaKryterium`` zbudowany regułą K z ``wynik=None`` i dowodem ``BRAK_METODY``: reguła daje
wtedy ``NIE_OCENIONO``, etykietę „Ocena niewykonana" (semantyka neutralna) z jedynego słownika
etykiet i zdanie z jedynego generatora wyjaśnień (``werdykt/wyjasnienie.py``). Konkretne
braki powierzchni (czego brakuje i co trzeba dostarczyć) wchodzą jako ``braki_dodatkowe`` —
po brakach nazwanych przez regułę.

Moduł nie ma własnego typu rekordu, etykiety ani tekstu werdyktu — tylko składa pola kontraktu
z parametrów wołającego. Importuje wyłącznie pakiet ``werdykt`` (liść), więc jest importowalny
z warstw analizy, aplikacji i ENM.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Final

from werdykt import (
    ClaimKind,
    EvidenceTier,
    Kryterium,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    WynikWymagania,
    ZakresWaznosci,
    ocen_kryterium,
)
from werdykt.kontrakt import StatusModelu

#: Status maszynowy rekordu tej fabryki — wyprowadza go reguła K (krok METODA), tu tylko nazwa.
STATUS_NIE_OCENIONO: Final = "NIE_OCENIONO"


def ocena_niewykonana(
    *,
    kryterium_id: str,
    przedmiot: Przedmiot,
    opis_kryterium_pl: str,
    podstawa: PodstawaWymagania,
    powod_stosowalnosci_pl: str,
    rodzaj_twierdzenia: ClaimKind,
    poziom: EvidenceTier,
    status_modelu: StatusModelu,
    zakres_waznosci: ZakresWaznosci,
    powod_braku_niepewnosci_pl: str,
    czego_brakuje: Sequence[str],
    status_danych: StatusDanych | None = None,
    odniesienie_dowodu: str | None = None,
    slad: Sequence[OdnosnikSladu] = (),
) -> OcenaKryterium:
    """Rekord K ``NIE_OCENIONO``: kryterium logiczne bez wyniku, dowód ``BRAK_METODY``.

    Kryterium jest logiczne (relacja ``LOGICZNE``, bez limitu skalarnego i bez warunku
    w LaTeX) — powierzchnia nie ma metody, która rozstrzygnęłaby kryterium, więc nie ma też
    wielkości porównywanej z limitem. ``podstawa`` to RZECZYWISTA podstawa kryterium (np.
    obwiednia z profilu operatora z jej stanem źródła) albo jawnie ``NIEUSTALONA``.

    Raises:
        ValueError: gdy pola nie spełniają kontraktu (walidacja pydantic ``werdykt``) albo
            ``czego_brakuje`` jest puste — ocena niewykonana ZAWSZE nazywa konkretny brak.
    """
    if not czego_brakuje:
        raise ValueError(
            "Ocena niewykonana musi nazwać konkretny brak powierzchni (czego_brakuje)."
        )
    return ocen_kryterium(
        kryterium_id=kryterium_id,
        przedmiot=przedmiot,
        kryterium=Kryterium(opis_pl=opis_kryterium_pl, warunek_latex="", relacja="LOGICZNE"),
        podstawa=podstawa,
        stosowalnosc=Stosowalnosc(dotyczy=True, powod_pl=powod_stosowalnosci_pl),
        wynik=None,
        limit=None,
        niepewnosc=Niepewnosc(nie_dotyczy=True, powod_pl=powod_braku_niepewnosci_pl),
        dowod=StatusDowodu(
            metoda="BRAK_METODY",
            poziom=poziom,
            rodzaj_twierdzenia=rodzaj_twierdzenia,
            status_modelu=status_modelu,
            status_danych=status_danych or StatusDanych(stan="ZWALIDOWANE"),
            odniesienie=odniesienie_dowodu,
        ),
        zakres_waznosci=zakres_waznosci,
        slad=slad,
        braki_dodatkowe=czego_brakuje,
    )


def rekord_json(ocena: OcenaKryterium | WynikWymagania) -> dict[str, Any]:
    """Rekord (poziom K albo W) w postaci JSON odpowiedzi API (``model_dump(mode="json")``,
    bez pominięć)."""
    return ocena.model_dump(mode="json")
