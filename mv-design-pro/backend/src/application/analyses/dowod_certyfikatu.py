"""Dowód certyfikacji PTPiREE urządzenia — JEDNO źródło prawdy dla biegu i dokumentów.

PO CO. Numer dokumentu WOŚ/WiPWC, data akceptacji, zakres PPM i warunek ważności
to dane, NA KTÓRE powołuje się deklaracja zgodności modułu wytwórczego. Bieg
NC RfG/PTPiREE cytował je od karty dodającej ``certificate_evidence``, ale trzy
formalne dokumenty budowane z tego samego biegu (certyfikat zgodności, wniosek
OSD, dokument studium) ich nie niosły — załącznik do wniosku przyłączeniowego
nie pozwalał odczytać, na czym oparto deklarację.

SKĄD DANE (zero fabrykacji). WYŁĄCZNIE z tabliczki urządzenia w modelu
(``Generator.materialized_params``), którą kreator DER zapisał z rekordu
katalogowego (``mv_ptpiree_catalog.annotate_with_ptpiree_status``). Ten moduł
niczego nie wylicza i niczego nie dopowiada: brak danej = ``None`` (uczciwy stan
zerowy), nigdy wartość domyślna ani zgadnięta. Bez wskazanego przypadku (albo dla
urządzenia, którego w modelu nie ma) dowód powstaje z samą referencją i pustymi
polami — dokument działa dalej, a projektant widzi, że dowodu nie ma, zamiast
oglądać wartość wziętą znikąd.

DWIE TOŻSAMOŚCI URZĄDZENIA. Certyfikat zgodności i wniosek OSD identyfikują
urządzenie referencją modułu biegu (``der_ref``) — dla nich ``dowody_certyfikatu``.
Dokument studium przyłączeniowego nie uruchamia biegu NC RfG: jego urządzeniem
jest TYP KATALOGOWY przekształtnika (``catalog_item_id``), więc dla niego
``dowody_certyfikatu_typu`` dopasowuje urządzenia modelu po tabliczce tego samego
typu. Obie drogi czytają tę samą tabliczkę tym samym kodem.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from uuid import UUID

from enm.store import get_enm
from pydantic import BaseModel

#: Tytuł sekcji dowodowej w dokumentach (jedna etykieta dla JSON, DOCX i PDF).
TYTUL_DOWODU = "Dowód certyfikacji PTPiREE"

#: Uczciwy stan zerowy — urządzenia nie ma w modelu albo tabliczka jest pusta.
BRAK_TABLICZKI_PL = "Brak danych tabliczki urządzenia w modelu."

#: Uczciwy stan zerowy dokumentu studium — w modelu nie ma urządzenia tego typu.
BRAK_URZADZEN_TYPU_PL = (
    "Brak urządzenia tego typu katalogowego w modelu — brak danych tabliczki urządzenia."
)


class NcRfgCertificateEvidence(BaseModel):
    """Dowód certyfikacji PTPiREE urządzenia testowanego w biegu NC RfG.

    Wartości pochodzą WPROST z tabliczki urządzenia w modelu (``Generator.
    materialized_params``), którą kreator DER zapisał z rekordu katalogowego.
    Ten moduł niczego nie wylicza i niczego nie dopowiada: brak danej = ``None``
    (uczciwy stan zerowy), nigdy wartość domyślna ani zgadnięta.
    """

    der_ref: str
    document_number: str | None = None
    acceptance_date: str | None = None
    wos_version: str | None = None
    wipwc_version: str | None = None
    ppm_scope: str | None = None
    source_url: str | None = None
    certificate_condition: str | None = None


#: Mapa pole tabliczki → pole dowodu. Kolejność ustala kolejność wierszy renderu.
_POLA_TABLICZKI: tuple[tuple[str, str], ...] = (
    ("document_number", "ptpiree_document_number"),
    ("acceptance_date", "ptpiree_document_acceptance_date"),
    ("wos_version", "ptpiree_wos_version"),
    ("wipwc_version", "ptpiree_wipwc_version"),
    ("ppm_scope", "ptpiree_ppm_scope"),
    ("source_url", "ptpiree_source_url"),
    ("certificate_condition", "ptpiree_certificate_condition"),
)

#: Etykiety PL sekcji dowodowej: klucz widoku → nagłówek w dokumencie.
#: Kolejność jest kolejnością wierszy w DOCX i PDF (jedno źródło dla obu).
ETYKIETY_DOWODU: tuple[tuple[str, str], ...] = (
    ("numer_dokumentu", "Numer dokumentu"),
    ("data_akceptacji", "Data akceptacji"),
    ("wersja_wos", "Wersja WOŚ"),
    ("wersja_wipwc", "Wersja WiPWC"),
    ("zakres_ppm", "Zakres PPM"),
    ("warunek_waznosci", "Warunek ważności certyfikatu"),
    ("adres_zrodla", "Adres źródła"),
)

#: Klucz widoku → pole dowodu (przeniesienie 1:1, bez przeliczania).
_WIDOK_Z_DOWODU: tuple[tuple[str, str], ...] = (
    ("numer_dokumentu", "document_number"),
    ("data_akceptacji", "acceptance_date"),
    ("wersja_wos", "wos_version"),
    ("wersja_wipwc", "wipwc_version"),
    ("zakres_ppm", "ppm_scope"),
    ("warunek_waznosci", "certificate_condition"),
    ("adres_zrodla", "source_url"),
)


def _tabliczki(case_id: UUID | None) -> dict[str, dict[str, Any]]:
    """Tabliczki urządzeń modelu przypadku (ref_id → parametry zmaterializowane)."""
    if case_id is None:
        return {}
    enm = get_enm(str(case_id))
    return {generator.ref_id: generator.materialized_params or {} for generator in enm.generators}


def _dowod(der_ref: str, tabliczka: dict[str, Any]) -> NcRfgCertificateEvidence:
    """Zbuduj dowód jednego urządzenia z jego tabliczki (brak danej = ``None``)."""
    return NcRfgCertificateEvidence(
        der_ref=der_ref,
        **{pole: tabliczka.get(klucz) for pole, klucz in _POLA_TABLICZKI},
    )


def dowody_certyfikatu(
    case_id: UUID | None,
    der_refs: Sequence[str],
) -> list[NcRfgCertificateEvidence]:
    """Dowód certyfikatu per WSKAZANE urządzenie, w podanej kolejności referencji.

    Dopasowanie idzie PO REFERENCJI urządzenia — nigdy „pierwszy lepszy DER
    w modelu". Referencja spoza modelu daje dowód z pustymi polami.
    """
    tabliczki = _tabliczki(case_id)
    return [_dowod(der_ref, tabliczki.get(der_ref, {})) for der_ref in der_refs]


def dowody_certyfikatu_typu(
    case_id: UUID | None,
    catalog_item_id: str,
) -> list[NcRfgCertificateEvidence]:
    """Dowód certyfikatu urządzeń modelu związanych z danym TYPEM katalogowym.

    Tożsamość dokumentu studium to typ katalogowy przekształtnika, nie moduł
    biegu — dopasowanie idzie po ``catalog_item_id`` tabliczki (klucz, który
    zapisuje brama przypisania katalogu). Kolejność = kolejność urządzeń
    w modelu (deterministyczna). Brak dopasowania → pusta lista (uczciwy stan
    zerowy), nigdy dowód urządzenia innego typu.
    """
    if case_id is None:
        return []
    return [
        _dowod(ref_id, tabliczka)
        for ref_id, tabliczka in _tabliczki(case_id).items()
        if tabliczka.get("catalog_item_id") == catalog_item_id
    ]


def sekcja_dowodu(dowod: NcRfgCertificateEvidence) -> dict[str, Any]:
    """Sekcja „Dowód certyfikacji PTPiREE" widoku dokumentu (polskie klucze).

    ``stan_pl`` jest niepusty DOKŁADNIE wtedy, gdy nie ma ani jednej danej —
    dokument mówi wtedy wprost, że dowodu nie ma, zamiast pokazywać puste pola.
    Tabliczka niepełna niesie tylko to, co jest (bez uzupełniania).
    """
    sekcja: dict[str, Any] = {"der_ref": dowod.der_ref}
    for klucz, pole in _WIDOK_Z_DOWODU:
        sekcja[klucz] = getattr(dowod, pole)
    pusta = all(sekcja[klucz] is None for klucz, _ in _WIDOK_Z_DOWODU)
    sekcja["stan_pl"] = BRAK_TABLICZKI_PL if pusta else None
    return sekcja


def sekcje_dowodow(dowody: Sequence[NcRfgCertificateEvidence]) -> list[dict[str, Any]]:
    """Sekcje dowodowe w kolejności wejścia (kompozycja ``sekcja_dowodu``)."""
    return [sekcja_dowodu(dowod) for dowod in dowody]


def wiersze_dowodu_pl(sekcja: dict[str, Any]) -> list[tuple[str, str]]:
    """Pary „etykieta → wartość" sekcji dowodowej do renderu DOCX i PDF.

    Pola bez danych są POMIJANE (dokument nie pokazuje pustych wierszy), a brak
    całej tabliczki sygnalizuje ``stan_pl`` — jeden zestaw wierszy dla obu
    formatów, żeby układ DOCX i PDF nie mógł się rozjechać.
    """
    if sekcja.get("stan_pl"):
        return []
    return [
        (etykieta, str(sekcja[klucz]))
        for klucz, etykieta in ETYKIETY_DOWODU
        if sekcja.get(klucz) is not None
    ]
