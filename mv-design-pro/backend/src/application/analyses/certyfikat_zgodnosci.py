"""Serwis aplikacyjny: certyfikat zgodności projektu z wymaganiami NC RfG.

Warstwa APPLICATION — czysta KOMPOZYCJA rekordów, NIE fizyka i NIE ocena. Certyfikat powstaje
WYŁĄCZNIE z oceny zgodności ZATWIERDZONEGO MODELU przypadku
(``application.ncrfg_compliance.zgodnosc_ncrfg_przypadku`` — most model → solver PTPiREE → ocena
wymagań profilu), tej samej, którą zwraca ``GET /api/ncrfg-tests/cases/{case_id}/compliance``.
Bieg „co-jeśli" z danych żądania nie ma drogi do certyfikatu (plan AB O-27): dane klienta są bez
walidacji w modelu, a certyfikatu urządzenia klient nie może podać.

Bramka (lista braków przed generacją): certyfikat twierdzi zgodność, więc powstaje wyłącznie
wtedy, gdy KAŻDE wymaganie stosowalne każdego modułu ma rekord ``WynikWymagania`` o statusie
``SPELNIA`` (``ocena_wymagan.braki``), każde źródło przekształtnikowe modelu zostało objęte
oceną (brak źródeł pominiętych) i model ma co najmniej jedno takie źródło. Braki to rekordy W
(nie tekst tego modułu) — odpowiedź 422 niesie rekordy i ich zdania. Moduł poniżej progu
istotności nie jest brakiem: jego wymagania nie dotyczą modułu, a sekcja dokumentu niesie
klasyfikację z powodem.

Dokument: per moduł klasyfikacja (z podstawą i powodem), technologia, dowód certyfikatu
urządzenia (rekord wykazu albo powód odrzucenia tabliczki) i bloki wymagań
``werdykt.blok_wymagania`` (z blokami kryteriów składowych). Żadnych liczników ani werdyktu
zbiorczego (plan AB O-13). DOCX i PDF renderują te same wiersze (``wiersze_sekcji``).

Determinizm: identyczny model → identyczny widok JSON, identyczne odciski i bajtowo identyczne
DOCX/PDF.
"""

from __future__ import annotations

from io import BytesIO
from typing import Any

from application.analyses.sekcja_zgodnosci_ncrfg import (
    TYTUL_SEKCJI_MODULU,
    dopisz_sekcje_docx,
    opis_pominietego,
    sekcje_modulow,
    wiersze_sekcji,
)
from application.ncrfg_compliance import (
    BrakWymaganiaModulu,
    NcRfgCaseComplianceResponse,
    NcRfgDerPominiety,
    brak_json,
    brak_pl,
    braki,
)
from network_model.reporting.czcionki import zarejestruj_czcionki
from network_model.reporting.docx_determinism import make_docx_bytes_deterministic
from pydantic import BaseModel, ConfigDict, Field

try:  # pragma: no cover - zależy od środowiska
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt

    _DOCX_AVAILABLE = True
except ImportError:  # pragma: no cover
    _DOCX_AVAILABLE = False

try:  # pragma: no cover - zależy od środowiska
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas

    _PDF_AVAILABLE = True
except ImportError:  # pragma: no cover
    _PDF_AVAILABLE = False

CERTYFIKAT_CONTRACT = "CertyfikatZgodnosciNcRfgV2"
CERTYFIKAT_TYTUL = "Certyfikat zgodności projektu z wymaganiami NC RfG"

KOMUNIKAT_BRAKOW = (
    "Certyfikat nie może powstać — nie każde wymaganie stosowalne NC RfG jest wykazane w "
    "zatwierdzonym modelu przypadku. Uzupełnij braki i powtórz generację."
)
KOMUNIKAT_BEZ_MODULOW = (
    "Certyfikat nie może powstać — zatwierdzony model przypadku nie zawiera źródła "
    "przekształtnikowego objętego wymaganiami NC RfG."
)


class CertyfikatZgodnosciRequest(BaseModel):
    """Wejście końcówki certyfikatu: identyfikacja projektu i operator (profil wymagań).

    Dane modułów i certyfikaty urządzeń pochodzą WYŁĄCZNIE z zatwierdzonego modelu przypadku
    (``case_id`` w zapytaniu) — ciało żądania nie ma na nie pól."""

    model_config = ConfigDict(extra="forbid")

    nazwa_projektu: str = Field(min_length=1)
    nazwa_przypadku: str | None = None
    operator_id: str = Field(min_length=1)


class CertyfikatBrakiError(Exception):
    """Certyfikat nie powstaje: rekordy W wymagań stosowalnych bez ``SPELNIA``, źródła
    pominięte przez most albo model bez źródła objętego wymaganiami."""

    def __init__(
        self, braki: list[BrakWymaganiaModulu], pominiete: list[NcRfgDerPominiety]
    ) -> None:
        self.braki = braki
        self.pominiete = pominiete
        self.komunikat = KOMUNIKAT_BRAKOW if braki or pominiete else KOMUNIKAT_BEZ_MODULOW
        super().__init__(self.komunikat)

    def detail(self) -> dict[str, Any]:
        """Treść odpowiedzi 422: rekordy braków z modułem (``der_ref``, ``der_name``) i ich
        zdaniami oraz źródła pominięte — odbiorca grupuje braki po module."""
        return {
            "komunikat": self.komunikat,
            "braki": [brak_json(brak) for brak in self.braki],
            "braki_pl": [brak_pl(brak) for brak in self.braki],
            "pominiete": [p.model_dump(mode="json") for p in self.pominiete],
            "pominiete_pl": [opis_pominietego(p) for p in self.pominiete],
        }


def zbierz_braki(zgodnosc: NcRfgCaseComplianceResponse) -> list[BrakWymaganiaModulu]:
    """Rekordy W blokujące certyfikat z modułem, którego dotyczą (kolejność modułów modelu,
    potem wymagań profilu)."""
    if zgodnosc.bieg is None:
        return []
    return braki(zgodnosc.bieg.ocena_wymagan)


def build_certyfikat_view(
    zgodnosc: NcRfgCaseComplianceResponse,
    *,
    nazwa_projektu: str,
    nazwa_przypadku: str | None = None,
) -> dict[str, Any]:
    """Zbuduj widok JSON certyfikatu z oceny zgodności zatwierdzonego modelu.

    Rzuca ``CertyfikatBrakiError``, gdy którekolwiek wymaganie stosowalne nie ma ``SPELNIA``,
    gdy most pominął źródło modelu albo gdy model nie ma źródła objętego wymaganiami.
    """
    rekordy_brakow = zbierz_braki(zgodnosc)
    if rekordy_brakow or zgodnosc.pominiete or zgodnosc.bieg is None:
        raise CertyfikatBrakiError(rekordy_brakow, list(zgodnosc.pominiete))
    bieg = zgodnosc.bieg
    procedura = bieg.procedure_version
    operatorzy = sorted(
        {f"{m.operator_name_pl}, wersja profilu {m.profile_version}" for m in bieg.modules}
    )
    return {
        "kontrakt": CERTYFIKAT_CONTRACT,
        "tytul": CERTYFIKAT_TYTUL,
        "identyfikacja": {
            "projekt": nazwa_projektu,
            "przypadek": nazwa_przypadku,
            "case_id": zgodnosc.case_id,
            "operator_id": zgodnosc.operator_id,
            "procedura": procedura.model_dump(mode="json"),
            "wersja_narzedzia": bieg.solver_version,
        },
        "moduly": sekcje_modulow(zgodnosc),
        "zalozenia_i_zrodla": [
            "Certyfikat zestawia rekordy oceny wymagań NC RfG policzone z zatwierdzonego "
            "modelu przypadku — nie przelicza testów i nie zastępuje badań terenowych ani "
            "sprawdzeń u operatora systemu.",
            f"Procedura testowania: {procedura.tytul}, wydanie "
            f"{procedura.wydanie or 'nieustalone'} (stan źródła: {procedura.status}).",
            f"Wersja narzędzia obliczeniowego: {bieg.solver_version}.",
            "Profil operatora: " + "; ".join(operatorzy) + ".",
        ],
        "odcisk_wejscia_sha256": bieg.input_hash,
        "odcisk_wyniku_sha256": bieg.deterministic_hash,
    }


def _wiersze_naglowka(view: dict[str, Any]) -> list[str]:
    identyfikacja = view["identyfikacja"]
    procedura = identyfikacja["procedura"]
    wiersz = f"Projekt: {identyfikacja['projekt']}"
    if identyfikacja.get("przypadek"):
        wiersz += f"  |  Przypadek: {identyfikacja['przypadek']}"
    return [
        wiersz,
        f"Procedura: {procedura['tytul']}  |  Narzędzie: {identyfikacja['wersja_narzedzia']}",
    ]


def render_certyfikat_docx(view: dict[str, Any]) -> bytes:
    """Zrenderuj deterministyczny DOCX certyfikatu z widoku JSON.

    Zwraca bajty znormalizowane przez ``make_docx_bytes_deterministic`` — dwa wywołania na tym
    samym widoku dają identyczne bajty.
    """
    if not _DOCX_AVAILABLE:  # pragma: no cover
        raise ImportError("Eksport DOCX wymaga python-docx. Zainstaluj: pip install python-docx")

    doc = Document()
    tytul = doc.add_heading(view["tytul"], level=0)
    tytul.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for wiersz in _wiersze_naglowka(view):
        doc.add_paragraph(wiersz)

    dopisz_sekcje_docx(doc, view["moduly"], poziom_naglowka=1)

    doc.add_heading("Założenia i źródła", level=1)
    for pozycja in view["zalozenia_i_zrodla"]:
        doc.add_paragraph(pozycja, style="List Bullet")

    stopka = doc.add_paragraph()
    stopka.add_run(f"Odcisk SHA-256 wejścia: {view['odcisk_wejscia_sha256']}").font.size = Pt(8)

    buffer = BytesIO()
    doc.save(buffer)
    return make_docx_bytes_deterministic(buffer.getvalue())


def render_certyfikat_pdf(view: dict[str, Any]) -> bytes:
    """Zrenderuj deterministyczny PDF certyfikatu z widoku JSON (te same wiersze co DOCX).

    Determinizm bajtowy: canvas z ``invariant=1`` i ``pageCompression=0``. Czcionki DejaVu Sans
    (polskie diakrytyki) rejestrowane wspólnym modułem ``network_model.reporting.czcionki``.
    """
    if not _PDF_AVAILABLE:  # pragma: no cover
        raise ImportError("Eksport PDF wymaga reportlab. Zainstaluj: pip install reportlab")

    buffer = BytesIO()
    zarejestruj_czcionki()
    c = canvas.Canvas(buffer, pagesize=A4, invariant=1, pageCompression=0)
    page_width, page_height = A4
    left_margin = 25 * mm
    content_width = page_width - 50 * mm
    top_margin = page_height - 25 * mm
    bottom_margin = 25 * mm
    line_height = 5 * mm
    y = top_margin

    def para(text: str, *, size: int = 10, bold: bool = False, indent: float = 0.0) -> None:
        nonlocal y
        font = "DejaVuSans-Bold" if bold else "DejaVuSans"
        for line in simpleSplit(text, font, size, content_width - indent):
            if y - line_height < bottom_margin:
                c.showPage()
                y = top_margin
            c.setFont(font, size)
            c.setFillColorRGB(0, 0, 0)
            c.drawString(left_margin + indent, y, line)
            y -= line_height

    c.setFont("DejaVuSans-Bold", 16)
    c.drawCentredString(page_width / 2, y, str(view["tytul"]))
    y -= 10 * mm
    for wiersz in _wiersze_naglowka(view):
        para(wiersz)
    y -= line_height

    for sekcja in view["moduly"]:
        para(
            f"{TYTUL_SEKCJI_MODULU}: {sekcja['der_name'] or sekcja['der_ref']}",
            size=12,
            bold=True,
        )
        for etykieta, tresc, poziom in wiersze_sekcji(sekcja):
            para(f"{etykieta}: {tresc}", size=9, indent=poziom * 4 * mm)
        y -= line_height

    para("Założenia i źródła", size=12, bold=True)
    for pozycja in view["zalozenia_i_zrodla"]:
        para(f"• {pozycja}", indent=4 * mm)
    y -= line_height
    para(f"Odcisk SHA-256 wejścia: {view['odcisk_wejscia_sha256']}", size=8)

    c.showPage()
    c.save()
    return buffer.getvalue()


__all__ = [
    "CERTYFIKAT_CONTRACT",
    "CERTYFIKAT_TYTUL",
    "KOMUNIKAT_BEZ_MODULOW",
    "KOMUNIKAT_BRAKOW",
    "CertyfikatBrakiError",
    "CertyfikatZgodnosciRequest",
    "build_certyfikat_view",
    "render_certyfikat_docx",
    "render_certyfikat_pdf",
    "zbierz_braki",
]
