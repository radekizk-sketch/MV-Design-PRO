"""Serwis aplikacyjny: wniosek o określenie warunków przyłączenia (OSD).

Warstwa APPLICATION — czysta KOMPOZYCJA gotowych wyników, NIE fizyka i NIE
ocena. Wniosek powstaje WYŁĄCZNIE z istniejących źródeł, każda sekcja cytuje
swoje źródło (run_id / odcisk wejścia):

- **bilans mocy** ← widok walidacji energetycznej przebiegu rozpływu (``PF``)
  (``application.analyses.energy_validation.build_energy_validation_view`` —
  obciążenia gałęzi/transformatorów, bilans mocy biernej slack, straty sieciowe)
  uzupełniony o moc zainstalowaną źródeł falownikowych ze snapshotu (wzorzec
  ``grid_strength._installed_mva_by_bus`` z krotnością ``n_parallel``),
- **zwarcia w punkcie przyłączenia** ← przebieg zwarciowy (``short_circuit_sn``)
  zakończony: Ik'' / S_k'' wskazanego węzła
  (wzorzec ``grid_strength._sk_mva_by_bus`` → ``build_short_circuit_results``),
- **zgodność NC RfG** ← ocena zgodności ZATWIERDZONEGO MODELU przypadku
  (``application.ncrfg_compliance.zgodnosc_ncrfg_przypadku`` — ta sama, z której powstaje
  certyfikat zgodności): per moduł klasyfikacja, technologia, dowód certyfikatu urządzenia i
  bloki rekordów ``WynikWymagania`` (``werdykt.blok_wymagania``) — bez liczników i bez werdyktu
  zbiorczego (plan AB O-13).

Poza zakresem (uczciwe adnotacje w ``zalozenia_pl``): schemat elektryczny
(światło techniczne SLD — osobny wątek) oraz zestawienia materiałowe (jeszcze
nie generowane przez narzędzie).

Uczciwa bramka kompletności (lista braków przed generacją, kolejność
deterministyczna: bilans → zwarcia → zgodność):
- przebieg rozpływu złego rodzaju lub niezakończony,
- przebieg zwarciowy złego rodzaju lub niezakończony,
- wskazany węzeł przyłączenia bez wyniku zwarciowego,
- zgodność NC RfG: rekordy W wymagań stosowalnych bez ``SPELNIA`` (ta sama bramka co
  certyfikat zgodności), źródła modelu pominięte przez most, model bez źródła objętego NC RfG.
Przy jakimkolwiek braku wniosek NIE powstaje — braki bilansu i zwarć to lista po polsku, braki
zgodności NC RfG to rekordy W z ich zdaniami.

Determinizm: identyczne wejście → identyczny widok JSON, identyczne odciski
sekcji, identyczny ``input_hash`` i bajtowo identyczny eksport DOCX.
"""

from __future__ import annotations

import hashlib
import json
from io import BytesIO
from typing import Any

from application.analyses.certyfikat_zgodnosci import KOMUNIKAT_BEZ_MODULOW, zbierz_braki
from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.grid_strength import _installed_mva_by_bus
from application.analyses.kontrakt_liczb import kwantyzuj_kontrakt
from application.analyses.opis_przebiegu import rodzaj_przebiegu_pl, stan_przebiegu_pl
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
)
from enm.canonical_analysis import CanonicalRun, build_short_circuit_results
from enm.nazwy_elementow import opis_bez_nazwy
from network_model.nazwy import nazwa_nadana
from network_model.reporting.czcionki import zarejestruj_czcionki
from network_model.reporting.docx_determinism import make_docx_bytes_deterministic
from pydantic import BaseModel, Field

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

WNIOSEK_OSD_CONTRACT = "WniosekOkresleniaWarunkowPrzylaczeniaV2"
WNIOSEK_OSD_TYTUL = "Wniosek o określenie warunków przyłączenia do sieci OSD"

_ADNOTACJA_SCHEMAT = (
    "Schemat elektryczny (światło techniczne) dołączany jest do wniosku odrębnie "
    "— poza zakresem niniejszego dokumentu."
)
_ADNOTACJA_ZESTAWIENIA = (
    "Zestawienia materiałowe nie są jeszcze generowane przez narzędzie — sekcja "
    "pominięta (bez danych zastępczych)."
)


class WniosekOsdIdentyfikacja(BaseModel):
    """Dane identyfikacyjne wniosku (pola tekstowe — opcjonalne poza nazwą)."""

    nazwa_projektu: str = Field(min_length=1)
    nazwa_przypadku: str | None = None
    wnioskodawca: str | None = None
    adres_przylaczenia: str | None = None


KOMUNIKAT_BRAKOW_WNIOSKU = (
    "Wniosek nie może powstać — dane przyłączeniowe niekompletne. Uzupełnij braki i powtórz "
    "generację."
)


class WniosekOsdBrakiError(Exception):
    """Wniosek nie powstaje: braki bilansu i zwarć (lista po polsku), rekordy W zgodności NC RfG
    bez ``SPELNIA`` i źródła modelu nieobjęte oceną."""

    def __init__(
        self,
        braki: list[str],
        braki_ncrfg: list[BrakWymaganiaModulu],
        pominiete: list[NcRfgDerPominiety],
    ) -> None:
        self.braki = braki
        self.braki_ncrfg = braki_ncrfg
        self.pominiete = pominiete
        super().__init__(KOMUNIKAT_BRAKOW_WNIOSKU)

    def detail(self) -> dict[str, Any]:
        """Treść odpowiedzi 422: braki tekstowe, rekordy W z modułem (``der_ref``, ``der_name``) i
        ich zdaniami, źródła pominięte — odbiorca grupuje braki NC RfG po module."""
        return {
            "komunikat": KOMUNIKAT_BRAKOW_WNIOSKU,
            "braki": list(self.braki),
            "braki_ncrfg": [brak_json(brak) for brak in self.braki_ncrfg],
            "braki_ncrfg_pl": [brak_pl(brak) for brak in self.braki_ncrfg],
            "pominiete": [p.model_dump(mode="json") for p in self.pominiete],
            "pominiete_pl": [opis_pominietego(p) for p in self.pominiete],
        }


def _odcisk(payload: Any) -> str:
    """Deterministyczny odcisk SHA-256 sekcji: kanoniczny JSON (sortowane klucze) nad sekcją
    skwantyzowaną regułą kontraktu wyjściowego (``kontrakt_liczb.kwantyzuj_kontrakt``,
    ``CYFRY_ZNACZACE`` = 9). Surowe liczby solvera (Ik″, ip, Ith, S″k z algebry macierzowej)
    różnią się między maszynami szumem BLAS rzędu 1e-12 względnie ≪ 1e-9 granicy kwantyzacji —
    odcisk nad surową reprezentacją ``float`` byłby funkcją MASZYNY, nie danych (pomiar
    sondą szumu, karta AB-1a Pakiet D2 §5.2). Sekcje widoku są kwantyzowane tą samą funkcją,
    więc dokument pokazuje dokładnie te liczby, nad którymi liczono odcisk."""
    canonical = json.dumps(
        kwantyzuj_kontrakt(payload), sort_keys=True, ensure_ascii=False, default=str
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _sc_row_for_bus(sc_run: CanonicalRun, bus_ref: str) -> dict[str, Any] | None:
    """Wiersz wyniku zwarciowego dla węzła przyłączenia (``element_id == bus_ref``)."""
    for row in build_short_circuit_results(sc_run).get("rows", []):
        if row.get("element_id") == bus_ref:
            wiersz: dict[str, Any] = row
            return wiersz
    return None


def zbierz_braki_wniosku(
    pf_run: CanonicalRun,
    sc_run: CanonicalRun,
    bus_ref: str,
    zgodnosc: NcRfgCaseComplianceResponse,
) -> list[str]:
    """Zbierz braki tekstowe blokujące generację (kolejność deterministyczna).

    Kolejność: bilans mocy (przebieg PF) → zwarcia (przebieg SC + węzeł) → model bez źródła
    objętego NC RfG. Braki zgodności NC RfG per wymaganie to rekordy W (``zbierz_braki``
    certyfikatu), nie tekst — wnosi je ``build_wniosek_osd_view``.
    """
    braki: list[str] = []

    # 1. Bilans mocy — przebieg rozpływu.
    if pf_run.analysis_type != "PF":
        braki.append(
            "Bilans mocy: wskazany przebieg nie jest rozpływem mocy; "
            f"wskazany przebieg: {rodzaj_przebiegu_pl(pf_run.analysis_type)}."
        )
    elif pf_run.status != "FINISHED":
        braki.append(
            "Bilans mocy: przebieg rozpływu nie jest zakończony "
            f"(stan: {stan_przebiegu_pl(pf_run.status)})."
        )

    # 2. Zwarcia — przebieg zwarciowy + obecność węzła przyłączenia.
    if sc_run.analysis_type != "short_circuit_sn":
        braki.append(
            "Zwarcia w punkcie przyłączenia: wskazany przebieg nie jest zwarciowy; "
            f"wskazany przebieg: {rodzaj_przebiegu_pl(sc_run.analysis_type)}."
        )
    elif sc_run.status != "FINISHED":
        braki.append(
            "Zwarcia w punkcie przyłączenia: przebieg zwarciowy nie jest zakończony "
            f"(stan: {stan_przebiegu_pl(sc_run.status)})."
        )
    elif _sc_row_for_bus(sc_run, bus_ref) is None:
        braki.append(
            "Zwarcia w punkcie przyłączenia: węzeł przyłączenia wskazany we wniosku nie "
            "występuje w wynikach zwarciowych wskazanego przebiegu."
        )

    # 3. Zgodność NC RfG — model bez źródła objętego wymaganiami (rekordy W i źródła pominięte
    # niesie osobno ``WniosekOsdBrakiError``).
    if zgodnosc.bieg is None and not zgodnosc.pominiete:
        braki.append(f"Zgodność NC RfG: {KOMUNIKAT_BEZ_MODULOW}")

    return braki


def _bilans_mocy_sekcja(pf_run: CanonicalRun, bus_ref: str) -> dict[str, Any]:
    """Zbuduj sekcję bilansu mocy z widoku walidacji energetycznej + snapshotu."""
    view = build_energy_validation_view(pf_run)
    items = view.get("items", [])
    summary = view.get("summary", {})

    obciazenia = [
        item
        for item in items
        if item.get("check_type") in {"BRANCH_LOADING", "TRANSFORMER_LOADING"}
        and item.get("observed_value") is not None
    ]
    najwyzsze = max(obciazenia, key=lambda i: i["observed_value"], default=None)
    reactive = next((i for i in items if i.get("check_type") == "REACTIVE_BALANCE"), None)
    straty = next((i for i in items if i.get("check_type") == "LOSS_BUDGET"), None)

    installed_by_bus = _installed_mva_by_bus(pf_run.snapshot or {})
    # Suma WYŁĄCZNIE węzłów o ZNANEJ mocy zainstalowanej — węzeł z nieznaną mocą
    # (``None``, np. źródło bez materializacji Sn) jest pominięty w sumie, a nie
    # liczony jako 0 MVA (FAB-E, E1: brak wyniku ≠ zero; suma zaczyna się od 0.0
    # dla zbioru pustego, co jest matematycznie poprawne — E3 klasa (b)).
    moc_calkowita = round(sum((v for v in installed_by_bus.values() if v is not None), 0.0), 6)
    moc_w_punkcie = installed_by_bus.get(bus_ref)

    return {
        "moc_zainstalowana_zrodel_mva": moc_calkowita,
        "moc_zainstalowana_w_punkcie_mva": (
            round(moc_w_punkcie, 6) if moc_w_punkcie is not None else None
        ),
        "liczba_wezlow_ze_zrodlami": len(installed_by_bus),
        "obciazenie_najwyzsze_pct": (round(najwyzsze["observed_value"], 4) if najwyzsze else None),
        "obciazenie_element": (najwyzsze.get("target_name") if najwyzsze else None),
        "wspolczynnik_mocy_slack": (
            round(reactive["observed_value"], 4)
            if reactive and reactive.get("observed_value") is not None
            else None
        ),
        "bilans_q_status": reactive.get("status") if reactive else "NOT_COMPUTED",
        "straty_pct": (
            round(straty["observed_value"], 4)
            if straty and straty.get("observed_value") is not None
            else None
        ),
        "straty_status": straty.get("status") if straty else "NOT_COMPUTED",
        "podsumowanie_walidacji": {
            "spelnione": summary.get("pass_count", 0),
            "ostrzezenia": summary.get("warning_count", 0),
            "niespelnione": summary.get("fail_count", 0),
            "nieobliczone": summary.get("not_computed_count", 0),
        },
    }


def _zwarcia_sekcja(sc_run: CanonicalRun, bus_ref: str) -> dict[str, Any]:
    """Zbuduj sekcję zwarć w punkcie przyłączenia z wiersza wyniku zwarciowego."""
    row = _sc_row_for_bus(sc_run, bus_ref)
    assert row is not None  # gwarantowane przez bramkę braków
    return {
        "bus_ref": bus_ref,
        "nazwa_wezla": nazwa_nadana(row.get("target_name")) or opis_bez_nazwy("buses"),
        "ik_ss_ka": row.get("ikss_ka"),
        "sk_mva": row.get("sk_mva"),
        "ip_ka": row.get("ip_ka"),
        "ith_ka": row.get("ith_ka"),
        "rodzaj_zwarcia": row.get("fault_type"),
    }


def _zgodnosc_sekcja(zgodnosc: NcRfgCaseComplianceResponse) -> dict[str, Any]:
    """Sekcja zgodności NC RfG: per moduł klasyfikacja, technologia, dowód certyfikatu
    urządzenia i bloki rekordów W — ten sam serializer co certyfikat zgodności."""
    bieg = zgodnosc.bieg
    assert bieg is not None  # gwarantowane przez bramkę braków
    return {
        "case_id": zgodnosc.case_id,
        "operator_id": zgodnosc.operator_id,
        "procedura": bieg.procedure_version.model_dump(mode="json"),
        "moduly": sekcje_modulow(zgodnosc),
        "odeslanie_pl": (
            "Rekordy testów procedury (kryteria składowe) i ślad obliczeń podano w certyfikacie "
            "zgodności NC RfG (dokument odrębny, ta sama ocena zatwierdzonego modelu)."
        ),
        "odcisk_wejscia_nc_rfg_sha256": bieg.input_hash,
    }


def build_wniosek_osd_view(
    pf_run: CanonicalRun,
    sc_run: CanonicalRun,
    zgodnosc_ncrfg: NcRfgCaseComplianceResponse,
    *,
    bus_ref: str,
    identyfikacja: WniosekOsdIdentyfikacja,
) -> dict[str, Any]:
    """Zbuduj widok JSON wniosku OSD z istniejących wyników i oceny zgodności NC RfG
    zatwierdzonego modelu przypadku.

    Rzuca ``WniosekOsdBrakiError`` gdy dane są niekompletne (bramka kompletności).
    """
    braki = zbierz_braki_wniosku(pf_run, sc_run, bus_ref, zgodnosc_ncrfg)
    braki_ncrfg = zbierz_braki(zgodnosc_ncrfg)
    if braki or braki_ncrfg or zgodnosc_ncrfg.pominiete:
        raise WniosekOsdBrakiError(braki, braki_ncrfg, list(zgodnosc_ncrfg.pominiete))
    bieg = zgodnosc_ncrfg.bieg
    assert bieg is not None  # model bez modułów jest brakiem tekstowym powyżej

    # Sekcje skwantyzowane regułą kontraktu wyjściowego (patrz `_odcisk`): dokument pokazuje
    # te same liczby, nad którymi liczony jest odcisk sekcji.
    bilans = kwantyzuj_kontrakt(_bilans_mocy_sekcja(pf_run, bus_ref))
    zwarcia = kwantyzuj_kontrakt(_zwarcia_sekcja(sc_run, bus_ref))
    zgodnosc = kwantyzuj_kontrakt(_zgodnosc_sekcja(zgodnosc_ncrfg))

    zalozenia_pl = [
        "Wniosek zestawia gotowe wyniki obliczeń — nie przelicza żadnej wielkości "
        "i nie zastępuje uzgodnień z operatorem systemu dystrybucyjnego.",
        # Karta #145: zdania dla projektanta bez identyfikatorów — przebiegi i odcisk
        # nazywa stopka źródeł dokumentu (`zrodla`, DOCX/PDF) i widok audytowy ekranu.
        "Bilans mocy pochodzi z zakończonego przebiegu rozpływu mocy wskazanego w stopce "
        "źródeł dokumentu.",
        "Zwarcia w punkcie przyłączenia pochodzą z zakończonego przebiegu zwarciowego "
        "wskazanego w stopce źródeł dokumentu.",
        "Zgodność NC RfG wyznaczono z zatwierdzonego modelu przypadku tą samą oceną co "
        "certyfikat zgodności (odcisk wejścia oceny w stopce źródeł dokumentu).",
        _ADNOTACJA_SCHEMAT,
        _ADNOTACJA_ZESTAWIENIA,
    ]

    odciski_sekcji = {
        "bilans_mocy": _odcisk(bilans),
        "zwarcia_punkt_przylaczenia": _odcisk(zwarcia),
        "zgodnosc_nc_rfg": _odcisk(zgodnosc),
    }
    input_hash = _odcisk(
        {
            "pf_run_id": str(pf_run.id),
            "sc_run_id": str(sc_run.id),
            "bus_ref": bus_ref,
            "nc_rfg_input_hash": bieg.input_hash,
            "case_id": zgodnosc_ncrfg.case_id,
            "identyfikacja": identyfikacja.model_dump(mode="json"),
        }
    )

    return {
        "kontrakt": WNIOSEK_OSD_CONTRACT,
        "tytul": WNIOSEK_OSD_TYTUL,
        "identyfikacja": {
            "projekt": identyfikacja.nazwa_projektu,
            "przypadek": identyfikacja.nazwa_przypadku,
            "wnioskodawca": identyfikacja.wnioskodawca,
            "adres_przylaczenia": identyfikacja.adres_przylaczenia,
            "wezel_przylaczenia": bus_ref,
        },
        "bilans_mocy": bilans,
        "zwarcia_punkt_przylaczenia": zwarcia,
        "zgodnosc_nc_rfg": zgodnosc,
        "zalozenia_pl": zalozenia_pl,
        "odciski_sekcji_sha256": odciski_sekcji,
        "zrodla": {
            "pf_run_id": str(pf_run.id),
            "sc_run_id": str(sc_run.id),
            "nc_rfg_input_hash": bieg.input_hash,
            "case_id": zgodnosc_ncrfg.case_id,
        },
        "input_hash": input_hash,
    }


def _linie_zrodel(view: dict[str, Any]) -> list[str]:
    """Stopka źródeł dokumentu: identyfikatory przebiegów i odcisk wejścia oceny NC RfG
    (jedno źródło treści dla DOCX i PDF)."""
    zrodla = view["zrodla"]
    return [
        f"Przebieg rozpływu mocy: {zrodla['pf_run_id']}",
        f"Przebieg zwarciowy: {zrodla['sc_run_id']}",
        f"Odcisk wejścia oceny zgodności NC RfG: {zrodla['nc_rfg_input_hash']}",
    ]


def _status_pl(status: str) -> str:
    """Etykieta polska statusu walidacji energetycznej."""
    return {
        "PASS": "spełnia",
        "WARNING": "ostrzeżenie",
        "FAIL": "nie spełnia",
        "NOT_COMPUTED": "brak danych",
    }.get(status, "stan spoza słownika aplikacji")


def _fmt(value: Any, unit: str = "") -> str:
    """Sformatuj wartość liczbową dla DOCX (myślnik gdy brak)."""
    if value is None:
        return "—"
    return f"{value} {unit}".strip()


def render_wniosek_osd_docx(view: dict[str, Any]) -> bytes:
    """Zrenderuj deterministyczny DOCX wniosku OSD z widoku JSON.

    Zwraca bajty znormalizowane przez ``make_docx_bytes_deterministic`` — dwa
    wywołania na tym samym widoku dają identyczne bajty.
    """
    if not _DOCX_AVAILABLE:  # pragma: no cover
        raise ImportError("Eksport DOCX wymaga python-docx. Zainstaluj: pip install python-docx")

    doc = Document()

    tytul = doc.add_heading(view["tytul"], level=0)
    tytul.alignment = WD_ALIGN_PARAGRAPH.CENTER

    identyfikacja = view["identyfikacja"]
    id_para = doc.add_paragraph()
    id_para.add_run("Projekt: ").bold = True
    id_para.add_run(str(identyfikacja["projekt"]))
    if identyfikacja.get("przypadek"):
        id_para.add_run("  |  Przypadek: ").bold = True
        id_para.add_run(str(identyfikacja["przypadek"]))
    if identyfikacja.get("wnioskodawca"):
        wn_para = doc.add_paragraph()
        wn_para.add_run("Wnioskodawca: ").bold = True
        wn_para.add_run(str(identyfikacja["wnioskodawca"]))
    if identyfikacja.get("adres_przylaczenia"):
        ad_para = doc.add_paragraph()
        ad_para.add_run("Adres przyłączenia: ").bold = True
        ad_para.add_run(str(identyfikacja["adres_przylaczenia"]))
    wezel_para = doc.add_paragraph()
    wezel_para.add_run("Węzeł przyłączenia: ").bold = True
    wezel_para.add_run(str(identyfikacja["wezel_przylaczenia"]))

    # Sekcja 1 — bilans mocy.
    bilans = view["bilans_mocy"]
    doc.add_heading("1. Bilans mocy", level=1)
    doc.add_paragraph(
        "Moc zainstalowana źródeł: "
        f"{_fmt(bilans['moc_zainstalowana_zrodel_mva'], 'MVA')}"
        "  (w węźle przyłączenia: "
        f"{_fmt(bilans['moc_zainstalowana_w_punkcie_mva'], 'MVA')})"
    )
    doc.add_paragraph(
        "Najwyższe obciążenie elementu: "
        f"{_fmt(bilans['obciazenie_najwyzsze_pct'], '%')}"
        f" ({bilans['obciazenie_element'] or '—'})"
    )
    doc.add_paragraph(
        "Współczynnik mocy w punkcie bilansowym: "
        f"{_fmt(bilans['wspolczynnik_mocy_slack'])}"
        f" — {_status_pl(bilans['bilans_q_status'])}"
    )
    doc.add_paragraph(
        f"Straty sieciowe: {_fmt(bilans['straty_pct'], '%')}"
        f" — {_status_pl(bilans['straty_status'])}"
    )

    # Sekcja 2 — zwarcia w punkcie przyłączenia.
    zwarcia = view["zwarcia_punkt_przylaczenia"]
    doc.add_heading("2. Zwarcia w punkcie przyłączenia", level=1)
    tabela = doc.add_table(rows=1, cols=2)
    tabela.style = "Table Grid"
    hdr = tabela.rows[0].cells
    hdr[0].text = "Wielkość"
    hdr[1].text = "Wartość"
    hdr[0].paragraphs[0].runs[0].bold = True
    hdr[1].paragraphs[0].runs[0].bold = True
    wiersze = [
        ("Węzeł", zwarcia["nazwa_wezla"]),
        ("Początkowy prąd zwarciowy Ik'' [kA]", _fmt(zwarcia["ik_ss_ka"])),
        ("Moc zwarciowa S_k'' [MVA]", _fmt(zwarcia["sk_mva"])),
        ("Prąd udarowy ip [kA]", _fmt(zwarcia["ip_ka"])),
        ("Prąd cieplny Ith [kA]", _fmt(zwarcia["ith_ka"])),
        ("Rodzaj zwarcia", zwarcia["rodzaj_zwarcia"] or "—"),
    ]
    for etykieta, wartosc in wiersze:
        row = tabela.add_row().cells
        row[0].text = str(etykieta)
        row[1].text = str(wartosc)

    # Sekcja 3 — zgodność NC RfG (bloki rekordów W per moduł).
    zgodnosc = view["zgodnosc_nc_rfg"]
    doc.add_heading("3. Zgodność z wymaganiami NC RfG", level=1)
    doc.add_paragraph(f"Procedura testowania: {zgodnosc['procedura']['tytul']}")
    dopisz_sekcje_docx(doc, zgodnosc["moduly"], poziom_naglowka=2)
    doc.add_paragraph(str(zgodnosc["odeslanie_pl"]))

    # Założenia i źródła.
    doc.add_heading("Założenia i źródła", level=1)
    for pozycja in view["zalozenia_pl"]:
        doc.add_paragraph(pozycja, style="List Bullet")

    # Stopka — źródła obliczeń i odciski (karta #145: identyfikatory przebiegów tutaj,
    # nie w zdaniach założeń).
    doc.add_paragraph()
    for linia in _linie_zrodel(view):
        doc.add_paragraph().add_run(linia).font.size = Pt(8)
    stopka = doc.add_paragraph()
    stopka.add_run(f"Odcisk SHA-256 wejścia wniosku: {view['input_hash']}").font.size = Pt(8)
    odciski = view["odciski_sekcji_sha256"]
    for nazwa, odcisk in odciski.items():
        p = doc.add_paragraph()
        p.add_run(f"Odcisk sekcji {nazwa}: {odcisk}").font.size = Pt(8)

    buffer = BytesIO()
    doc.save(buffer)
    return make_docx_bytes_deterministic(buffer.getvalue())


def render_wniosek_pdf(view: dict[str, Any]) -> bytes:
    """Zrenderuj deterministyczny PDF wniosku OSD z widoku JSON (układ 1:1 z DOCX).

    Determinizm bajtowy: canvas z ``invariant=1`` (stały ``CreationDate`` i ``ID``
    dokumentu) oraz ``pageCompression=0`` — dwa wywołania na tym samym widoku dają
    identyczne bajty. Czcionki DejaVu Sans (polskie diakrytyki) rejestrowane wspólnym
    modułem ``network_model.reporting.czcionki`` (subset TTF jest deterministyczny).
    """
    if not _PDF_AVAILABLE:  # pragma: no cover
        raise ImportError("Eksport PDF wymaga reportlab. Zainstaluj: pip install reportlab")

    buffer = BytesIO()
    zarejestruj_czcionki()
    c = canvas.Canvas(buffer, pagesize=A4, invariant=1, pageCompression=0)
    page_width, page_height = A4
    left_margin = 25 * mm
    right_edge = page_width - 25 * mm
    top_margin = page_height - 25 * mm
    bottom_margin = 25 * mm
    line_height = 5 * mm
    content_width = right_edge - left_margin

    y = top_margin

    def new_page() -> None:
        nonlocal y
        c.showPage()
        y = top_margin

    def ensure(needed: float) -> None:
        nonlocal y
        if y - needed < bottom_margin:
            new_page()

    def para(text: str, *, size: int = 10, bold: bool = False, indent: float = 0.0) -> None:
        nonlocal y
        font = "DejaVuSans-Bold" if bold else "DejaVuSans"
        for line in simpleSplit(text, font, size, content_width - indent):
            ensure(line_height)
            c.setFont(font, size)
            c.setFillColorRGB(0, 0, 0)
            c.drawString(left_margin + indent, y, line)
            y -= line_height

    # Tytuł (wyśrodkowany).
    c.setFont("DejaVuSans-Bold", 16)
    c.drawCentredString(page_width / 2, y, str(view["tytul"]))
    y -= 10 * mm

    # Identyfikacja.
    identyfikacja = view["identyfikacja"]
    id_line = f"Projekt: {identyfikacja['projekt']}"
    if identyfikacja.get("przypadek"):
        id_line += f"  |  Przypadek: {identyfikacja['przypadek']}"
    para(id_line)
    if identyfikacja.get("wnioskodawca"):
        para(f"Wnioskodawca: {identyfikacja['wnioskodawca']}")
    if identyfikacja.get("adres_przylaczenia"):
        para(f"Adres przyłączenia: {identyfikacja['adres_przylaczenia']}")
    para(f"Węzeł przyłączenia: {identyfikacja['wezel_przylaczenia']}")
    y -= line_height

    # Sekcja 1 — bilans mocy.
    bilans = view["bilans_mocy"]
    para("1. Bilans mocy", size=12, bold=True)
    para(
        "Moc zainstalowana źródeł: "
        f"{_fmt(bilans['moc_zainstalowana_zrodel_mva'], 'MVA')}"
        "  (w węźle przyłączenia: "
        f"{_fmt(bilans['moc_zainstalowana_w_punkcie_mva'], 'MVA')})"
    )
    para(
        "Najwyższe obciążenie elementu: "
        f"{_fmt(bilans['obciazenie_najwyzsze_pct'], '%')}"
        f" ({bilans['obciazenie_element'] or '—'})"
    )
    para(
        "Współczynnik mocy w punkcie bilansowym: "
        f"{_fmt(bilans['wspolczynnik_mocy_slack'])}"
        f" — {_status_pl(bilans['bilans_q_status'])}"
    )
    para(
        f"Straty sieciowe: {_fmt(bilans['straty_pct'], '%')}"
        f" — {_status_pl(bilans['straty_status'])}"
    )
    y -= line_height

    # Sekcja 2 — zwarcia w punkcie przyłączenia (tabela).
    zwarcia = view["zwarcia_punkt_przylaczenia"]
    para("2. Zwarcia w punkcie przyłączenia", size=12, bold=True)
    wiersze = [
        ("Węzeł", zwarcia["nazwa_wezla"]),
        ("Początkowy prąd zwarciowy Ik'' [kA]", _fmt(zwarcia["ik_ss_ka"])),
        ("Moc zwarciowa S_k'' [MVA]", _fmt(zwarcia["sk_mva"])),
        ("Prąd udarowy ip [kA]", _fmt(zwarcia["ip_ka"])),
        ("Prąd cieplny Ith [kA]", _fmt(zwarcia["ith_ka"])),
        ("Rodzaj zwarcia", zwarcia["rodzaj_zwarcia"] or "—"),
    ]
    label_col = content_width * 0.6
    for etykieta, wartosc in wiersze:
        ensure(line_height)
        c.setFont("DejaVuSans", 10)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(left_margin, y, str(etykieta))
        c.drawString(left_margin + label_col, y, str(wartosc))
        y -= line_height
    y -= line_height

    # Sekcja 3 — zgodność NC RfG (te same wiersze co DOCX).
    zgodnosc = view["zgodnosc_nc_rfg"]
    para("3. Zgodność z wymaganiami NC RfG", size=12, bold=True)
    para(f"Procedura testowania: {zgodnosc['procedura']['tytul']}")
    for sekcja in zgodnosc["moduly"]:
        para(f"{TYTUL_SEKCJI_MODULU}: {sekcja['der_name']}", bold=True)
        for etykieta, tresc, poziom in wiersze_sekcji(sekcja):
            para(f"{etykieta}: {tresc}", size=9, indent=poziom * 4 * mm)
    para(str(zgodnosc["odeslanie_pl"]))
    y -= line_height

    # Założenia i źródła.
    para("Założenia i źródła", size=12, bold=True)
    for pozycja in view["zalozenia_pl"]:
        para(f"• {pozycja}", indent=4 * mm)

    # Stopka — źródła obliczeń i odciski (układ 1:1 z DOCX).
    y -= line_height
    for linia in _linie_zrodel(view):
        para(linia, size=8)
    para(f"Odcisk SHA-256 wejścia wniosku: {view['input_hash']}", size=8)
    for nazwa, odcisk in view["odciski_sekcji_sha256"].items():
        para(f"Odcisk sekcji {nazwa}: {odcisk}", size=8)

    c.showPage()
    c.save()
    return buffer.getvalue()
