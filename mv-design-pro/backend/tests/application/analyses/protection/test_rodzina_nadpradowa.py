"""Rodzina nadprądowa 50/51 w rejestrze rodzin (karta EKRANY-EAZ-ZIEMNOZWARCIOWE, punkt 1
kontynuacji) — wiersze koordynacji na REALNYCH biegach sceny koordynacji (sieć złota G08:
bieg MAX, MIN i rozpływu; te same biegi co fikstura ekranu).

ILOCZYN CECH:
* urządzenie {z kompletem nastaw i parą stopniowania (podrzędne), z kompletem nastaw bez
  nadrzędnego (Δt brak), z odmową — braki nastaw} × kolumna rodziny (progi, I″k,min, k_c,
  I_obc,max, k_b, t, charakterystyka, Δt) — parytet z JEDNYM źródłem liczb (sprawdzenia
  koordynacji, nastawy, ``czas_urzadzenia``);
* kryteria koordynacji {domyślne — wiersz tabeli źródeł (założenie inżynierskie), podane
  w żądaniu — wartość projektanta} × wynik {spełnia, nie spełnia}: stan wiersza z rekordów
  werdyktu, komórka ``spelnia`` z tego samego wymagania co rekord (predykaty parami);
* jedno źródło liczby wymaganej: domyślne kryteria koordynacji = tabela źródeł.
"""

from __future__ import annotations

import importlib.util
from functools import cache
from pathlib import Path
from typing import Any

import pytest
from application.analyses.protection.coordination.models import CoordinationConfig
from application.analyses.protection.coordination.z_biegow import koordynacja_z_biegow
from application.analyses.protection.ocena_nadpradowa import czas_urzadzenia
from application.analyses.protection.rodziny_eaz import (
    REJESTR_RODZIN,
    RODZINA_NADPRADOWA,
    zrodlo_wymagania,
)
from enm.store import get_enm

_SKRYPT = Path(__file__).resolve().parents[4] / "scripts" / "eksport_fixtur_harnessu.py"
_spec = importlib.util.spec_from_file_location("eksport_fixtur_harnessu_rodzina", _SKRYPT)
assert _spec is not None and _spec.loader is not None
eksport = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eksport)


@cache
def _koordynacja(k_c: float | None = None, k_b: float | None = None) -> dict[str, Any]:
    config = CoordinationConfig(
        **({"sensitivity_ratio_required": k_c} if k_c is not None else {}),
        **({"overload_ratio_required": k_b} if k_b is not None else {}),
    )
    with eksport._biegi_sceny_koordynacja() as (bieg_max, bieg_min, bieg_pf, _m, _l):
        wynik = koordynacja_z_biegow(
            model=get_enm(eksport.CASE_ID_HARNESSU),
            project_id="p",
            sc_run_id=str(bieg_max.id),
            sc_run_id_min=str(bieg_min.id),
            pf_run_id=str(bieg_pf.id),
            pary_wskazane=None,
            config=config,
        )
    return {"wynik": wynik, "dict": wynik.to_dict()}


def test_domyslne_kryteria_koordynacji_z_tabeli_zrodel() -> None:
    c = CoordinationConfig()
    assert c.sensitivity_ratio_required == zrodlo_wymagania("k_c.nadpradowe").wartosc
    assert c.overload_ratio_required == zrodlo_wymagania("k_b.nadpradowe").wartosc
    for klucz in ("k_c.nadpradowe", "k_b.nadpradowe"):
        z = zrodlo_wymagania(klucz)
        # Bez weryfikacji źródłowej nie ma stanu ENEA (wymaganie właściciela 3).
        assert z.stan == "ZALOZENIE_INZYNIERSKIE" and "niesprawdzone" in z.odwolanie_pl
    assert REJESTR_RODZIN["NADPRADOWE"] is RODZINA_NADPRADOWA


def test_wiersze_rowne_sprawdzeniom_koordynacji() -> None:
    k = _koordynacja()
    wynik, dane = k["wynik"], k["dict"]
    n = dane["nadpradowe"]
    assert n["rodziny"] == [RODZINA_NADPRADOWA.to_dict()]
    kolumny = {kol.klucz for kol in RODZINA_NADPRADOWA.kolumny}
    urzadzenia = {d["id"] for d in dane["devices"] if d["device_type"] == "RELAY"}
    assert {w["urzadzenie_ref"] for w in n["wiersze"]} == urzadzenia
    czulosc = {c.device_id: c for c in wynik.sensitivity_checks}
    przeciaz = {c.device_id: c for c in wynik.overload_checks}
    pelne = [w for w in n["wiersze"] if not w["braki"]]
    z_odmowa = [w for w in n["wiersze"] if w["braki"]]
    assert pelne and z_odmowa
    for w in z_odmowa:
        assert w["wartosci"] == {} and w["stan"] == "NIE_OCENIONO" and w["braki_pl"]
    z_dt = bez_dt = 0
    for w in pelne:
        ref = w["urzadzenie_ref"]
        v = w["wartosci"]
        assert set(v) <= kolumny
        sc, oc = czulosc[ref], przeciaz[ref]
        assert v["ik_min"]["wartosc"] == sc.i_fault_min_a
        assert v["k_c"]["wartosc"] == sc.ratio
        assert v["k_c"]["spelnia"] is (sc.ratio >= sc.required_ratio)
        assert v["i_obc"]["wartosc"] == oc.i_operating_a
        assert v["k_b"]["wartosc"] == oc.ratio
        progi = {s.funkcja: s.prog_pierwotny_a for s in _nastawy_biegu()[ref].stopnie}
        assert v["prog_i1"]["wartosc"] == progi["51"]
        assert v["prog_i2"]["wartosc"] == progi["50"]
        _, decydujacy = czas_urzadzenia(_nastawy_biegu()[ref].stopnie, sc.i_fault_min_a)
        assert decydujacy is not None and v["t"]["wartosc"] == decydujacy["t_s"]
        assert v["charakterystyka"]["tekst"].startswith(decydujacy["etykieta_pl"])
        odstepy = [
            c.margin_s
            for c in wynik.selectivity_checks
            if c.downstream_device_id == ref and c.margin_s is not None
        ]
        if odstepy:
            z_dt += 1
            assert v["delta_t"]["wartosc"] == min(odstepy)
        else:
            bez_dt += 1
            assert "delta_t" not in v
        assert w["stan"] == "SPELNIA"
        assert {r.split(".")[-1] for r in w["kryteria"]} >= {
            "WSPOLCZYNNIK_CZULOSCI",
            "WSPOLCZYNNIK_ODSTROJENIA",
        }
        assert w["wymagania"]["k_c"]["stan"] == "ZALOZENIE_INZYNIERSKIE"
    assert z_dt and bez_dt, "scena: podrzędne z parą i nadrzędne bez pary"
    # Rekordy niosą wyjaśnienie (werdykt wyjaśnialny) i dowód niepełny (wymaganie przyjęte).
    for o in n["oceny"]:
        assert o["zdanie_pl"] and o["limit_pl"] and o["wynik_pl"]


@cache
def _nastawy_biegu() -> dict[str, Any]:
    """Nastawy urządzeń (``StopienNastaw``) z tej samej ścieżki oceny na biegu MAX sceny."""
    from enm.canonical_analysis import ocen_zabezpieczenia_biegu

    with eksport._biegi_sceny_koordynacja() as (bieg_max, _bmin, _pf, _m, _l):
        ocena = ocen_zabezpieczenia_biegu(get_enm(eksport.CASE_ID_HARNESSU), bieg_max)
    return {n.urzadzenie_ref: n for n in ocena.nastawy}


@pytest.mark.parametrize(
    ("k_c", "k_b", "spelnia"),
    [(2.0, 1.5, True), (100.0, 1.2, False), (1.5, 50.0, False)],
)
def test_kryteria_z_zadania_to_wartosc_projektanta(k_c: float, k_b: float, spelnia: bool) -> None:
    n = _koordynacja(k_c, k_b)["dict"]["nadpradowe"]
    pelne = [w for w in n["wiersze"] if not w["braki"]]
    for w in pelne:
        for klucz, wym in (("k_c", k_c), ("k_b", k_b)):
            wymaganie = w["wymagania"][klucz]
            assert wymaganie["wartosc"] == wym
            tabela = zrodlo_wymagania(f"{klucz}.nadpradowe").wartosc
            assert wymaganie["stan"] == (
                "ZALOZENIE_INZYNIERSKIE" if wym == tabela else "WARTOSC_PROJEKTANTA"
            )
            assert w["wartosci"][klucz]["spelnia"] is (w["wartosci"][klucz]["wartosc"] >= wym)
        assert (w["stan"] == "SPELNIA") is spelnia
        if not spelnia:
            assert w["stan"] == "NIE_SPELNIA" and w["przyczyna_pl"]


@pytest.mark.parametrize("format_", ["DOCX", "PDF"])
def test_raport_niesie_wiersze_rodziny_50_51(format_: str, monkeypatch: pytest.MonkeyPatch) -> None:
    """Raport × {DOCX, PDF}: tabela rodziny 50/51 = wiersze funkcji prezentacji, a te = liczby
    wiersza wyniku (parytet ekran ↔ raport) i zdania rekordów werdyktu."""
    import tempfile

    from network_model.catalog.wartosci_robocze import liczba_pl
    from network_model.reporting.protection_tcc_presentation import (
        NAGLOWEK_NADPRADOWYCH_PL,
        tabela_rodziny_nadpradowej,
        zdania_rodziny_nadpradowej,
    )

    pytest.importorskip("docx")
    pytest.importorskip("reportlab")
    dane = _koordynacja()["dict"]
    naglowki, wiersze = tabela_rodziny_nadpradowej(dane["nadpradowe"])
    kolumny = [k.klucz for k in RODZINA_NADPRADOWA.kolumny]
    assert naglowki[1:-1] == tuple(k.naglowek_pl for k in RODZINA_NADPRADOWA.kolumny)
    for w, wiersz in zip(dane["nadpradowe"]["wiersze"], wiersze, strict=True):
        for klucz, tekst in zip(kolumny, wiersz[1:-1], strict=True):
            kom = w["wartosci"].get(klucz)
            oczekiwany = (
                "—"
                if not kom
                else (liczba_pl(kom["wartosc"]) if kom["wartosc"] is not None else kom["tekst"])
            )
            assert tekst == oczekiwany
        assert wiersz[-1] == w["etykieta"]["etykieta_pl"]
    zdania = zdania_rodziny_nadpradowej(dane["nadpradowe"])
    assert zdania
    with tempfile.TemporaryDirectory() as katalog:
        if format_ == "DOCX":
            from docx import Document
            from network_model.reporting.protection_report_docx import (
                export_protection_coordination_to_docx,
            )

            sciezka = Path(katalog) / "r.docx"
            export_protection_coordination_to_docx(dane, sciezka, deterministic=True)
            dok = Document(str(sciezka))
            assert NAGLOWEK_NADPRADOWYCH_PL in [p.text for p in dok.paragraphs]
            tabela = next(
                t for t in dok.tables if tuple(c.text for c in t.rows[0].cells) == naglowki
            )
            assert [tuple(c.text for c in r.cells) for r in tabela.rows[1:]] == wiersze
            assert set(zdania) <= {p.text for p in dok.paragraphs}
        else:
            import network_model.reporting.protection_report_pdf as modul_pdf
            from reportlab.pdfgen.canvas import Canvas

            narysowane: list[str] = []
            oryginal = Canvas.drawString

            def szpieg(self: Canvas, x: float, y: float, tekst: str, *a: Any, **k: Any) -> Any:
                narysowane.append(tekst)
                return oryginal(self, x, y, tekst, *a, **k)

            monkeypatch.setattr(Canvas, "drawString", szpieg)
            modul_pdf.export_protection_coordination_to_pdf(dane, Path(katalog) / "r.pdf")
            assert NAGLOWEK_NADPRADOWYCH_PL in narysowane
            tekst = " ".join(" ".join(narysowane).split())
            for wiersz in wiersze:
                for komorka in wiersz:
                    assert komorka.split()[0] in tekst, komorka
            for zdanie in zdania:
                assert " ".join(zdanie.split()) in tekst
