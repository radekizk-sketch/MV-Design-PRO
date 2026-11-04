"""Budowa sterownika zabezpieczeń (``ProtectionAssignment``) w testach — jeden kształt modelu.

Karta OCHRONA-JEDNO-ZRODLO (ADR-022): zabezpieczenie modelu to sterownik pola z funkcjami
z rejestru (`network_model.catalog.funkcje_eaz`), nastawami w grupach 1–4 i macierzą wyzwoleń.
Ten moduł nie ma własnych reguł — składa rekord, który waliduje kontrakt modelu
(`enm.models.ProtectionAssignment` + `enm.nastawy_zabezpieczen.bledy_sterownika`), żeby testy
nie powielały ręcznie zagnieżdżonych list.

``stopnie`` — sekwencja ``(kod, nastawy)``; drugi stopień tego samego kodu dostaje ``ref``
``<kod>-2`` (trzeci ``<kod>-3`` …). Funkcja rodzaju ZABEZPIECZENIE działa na ``wylacznik``
(wiersz macierzy wyzwoleń), gdy go podano; automatyka i blokady nie wyzwalają.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from enm.models import ProtectionAssignment
from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ

Stopien = tuple[str, Mapping[str, Any]]


def stopien(kod: str, **nastawy: Any) -> Stopien:
    """Funkcja ``kod`` z nastawami (klucze schematu rejestru; ``None`` pomija nastawę)."""
    return kod, {k: v for k, v in nastawy.items() if v is not None}


def _refy(stopnie: Sequence[Stopien]) -> list[str]:
    licznik: dict[str, int] = {}
    refy: list[str] = []
    for kod, _ in stopnie:
        licznik[kod] = licznik.get(kod, 0) + 1
        refy.append(kod if licznik[kod] == 1 else f"{kod}-{licznik[kod]}")
    return refy


def rekord_sterownika(
    ref_id: str = "prot/01",
    *,
    name: str | None = "Zabezpieczenie pola",
    bay_ref: str | None = None,
    wylacznik: str | Iterable[str] | None = None,
    stopnie: Sequence[Stopien] = (),
    ct_ref: str | None = None,
    vt_ref: str | None = None,
    wejscia: Mapping[str, Any] | None = None,
    catalog_ref: str | None = None,
    catalog_namespace: str | None = None,
    is_enabled: bool = True,
    grupa: int = 1,
    aktywna_grupa: int | None = None,
    wylaczone: Iterable[str] = (),
    pochodzenie: str = "PROJEKTANT",
    pobudza_spz: Iterable[str] = (),
    **pola: Any,
) -> dict[str, Any]:
    """Rekord sterownika w kształcie migawki (``model_dump(mode="json")``)."""
    refy = _refy(stopnie)
    wylaczniki = (
        []
        if wylacznik is None
        else [wylacznik]
        if isinstance(wylacznik, str)
        else list(wylacznik)
    )
    wylaczone_refy = set(wylaczone)
    spz = set(pobudza_spz)
    funkcje = [
        {"ref": ref, "kod": kod, "wlaczona": ref not in wylaczone_refy}
        for ref, (kod, _) in zip(refy, stopnie, strict=True)
    ]
    wpisy = [
        {
            "funkcja_ref": ref,
            "nastawy": [
                {"klucz": k, "wartosc": v, "pochodzenie": pochodzenie}
                for k, v in sorted(nastawy.items())
            ],
        }
        for ref, (_, nastawy) in zip(refy, stopnie, strict=True)
        if nastawy
    ]
    macierz = [
        {"funkcja_ref": ref, "aparat_refs": list(wylaczniki), "pobudza_spz": ref in spz}
        for ref, (kod, _) in zip(refy, stopnie, strict=True)
        if wylaczniki
        and (wpis := FUNKCJE_EAZ.get(kod)) is not None
        and wpis.rodzaj == "ZABEZPIECZENIE"
    ]
    wejscia_rekordu = {"ct_ref": ct_ref, "vt_ref": vt_ref, **dict(wejscia or {})}
    return {
        "ref_id": ref_id,
        "name": name,
        "bay_ref": bay_ref,
        "catalog_ref": catalog_ref,
        "catalog_namespace": catalog_namespace,
        "wejscia": {k: v for k, v in wejscia_rekordu.items() if v is not None},
        "funkcje": funkcje,
        "grupy_nastaw": [{"numer": grupa, "funkcje": wpisy}] if wpisy else [],
        "aktywna_grupa": aktywna_grupa if aktywna_grupa is not None else grupa,
        "macierz_wyzwolen": macierz,
        "is_enabled": is_enabled,
        **pola,
    }


def sterownik(ref_id: str = "prot/01", **kwargs: Any) -> ProtectionAssignment:
    """Sterownik zwalidowany kontraktem modelu (argumenty jak `rekord_sterownika`)."""
    return ProtectionAssignment.model_validate(rekord_sterownika(ref_id, **kwargs))


def stopien_51(
    prog: float = 5.0,
    *,
    jednostka_progu: str = "A_WTORNY",
    krzywa: str = "DT",
    zwloka_s: float | None = 0.3,
    tms: float | None = None,
) -> Stopien:
    """Stopień zwłoczny I> (51) — domyślnie 5 A wtórne, czas niezależny 0,3 s."""
    return stopien(
        "51",
        prog=prog,
        jednostka_progu=jednostka_progu,
        krzywa=krzywa,
        zwloka_s=zwloka_s if krzywa == "DT" else None,
        tms=tms if krzywa != "DT" else None,
    )


def stopien_50(
    prog: float = 50.0, *, jednostka_progu: str = "A_WTORNY", zwloka_s: float = 0.05
) -> Stopien:
    """Stopień zwarciowy I>> (50) — czas niezależny (zwłoka dodatnia, reguła PZ-09)."""
    return stopien("50", prog=prog, jednostka_progu=jednostka_progu, krzywa="DT", zwloka_s=zwloka_s)


__all__ = ["Stopien", "rekord_sterownika", "sterownik", "stopien", "stopien_50", "stopien_51"]
