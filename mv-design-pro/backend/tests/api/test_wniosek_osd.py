"""Testy generatora wniosku OSD — serwis kompozycji + końcówki API.

Wniosek OSD to czysta kompozycja gotowych wyników: bilans mocy z walidacji
energetycznej przebiegu rozpływu (``PF``), zwarcia w punkcie przyłączenia
z przebiegu zwarciowego (``short_circuit_sn``) oraz zgodność NC RfG z ZATWIERDZONEGO
MODELU przypadku tą samą oceną co certyfikat zgodności (karta AB-1a Pakiet C pkt 10):
sekcja zgodności to bloki rekordów W per moduł, bez liczników i werdyktu zbiorczego;
braki NC RfG to rekordy W (``braki_ncrfg`` + ``braki_ncrfg_pl``), braki bilansu i zwarć —
lista po polsku. Iloczyn cech: przebiegi {komplet, zły rodzaj, niezakończony, węzeł
nieznany} × model NC RfG {bez wymagań stosowalnych (magazyn), moduł A bez certyfikatu,
bez źródeł, źródło pominięte} × wyjście {JSON, DOCX, PDF} × wejście HTTP {z przypadkiem,
bez przypadku, ciało z biegiem „co-jeśli", operator nieznany}.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

import pymupdf
import pytest
from application.analyses.wniosek_osd import (
    WniosekOsdBrakiError,
    WniosekOsdIdentyfikacja,
    _bilans_mocy_sekcja,
    build_wniosek_osd_view,
    render_wniosek_osd_docx,
    render_wniosek_pdf,
    zbierz_braki_wniosku,
)
from application.ncrfg_compliance import NcRfgCaseComplianceResponse, zgodnosc_ncrfg_przypadku
from docx import Document
from enm.canonical_analysis import (
    CanonicalRun,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel, GenLimits
from enm.store import reset_enm_store, set_enm
from werdykt import WynikWymagania

from tests import ncrfg_fabryki as f
from tests.cgmes.golden_enm import build_golden_enm

OSD_JSON = "/api/oze-analysis/osd-application"
OSD_DOCX = "/api/oze-analysis/osd-application.docx"
OSD_PDF = "/api/oze-analysis/osd-application.pdf"


def _model_magazynu() -> EnergyNetworkModel:
    """Magazyn samodzielny — wymagania NC RfG nie dotyczą (O-28), więc zgodność nie blokuje."""
    return f.model(f.generator("bess-1", p_mw=2.0, gen_type="bess"))


def _model_a() -> EnergyNetworkModel:
    """Moduł A bez certyfikatu — wymagania bez metody wykazania dają rekordy W braków."""
    return f.model(f.generator("pv-a", p_mw=0.05), napiecie_kv=0.4)


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _augmented_enm():
    enm = build_golden_enm()
    gens = list(enm.generators)
    gens[1] = gens[1].model_copy(
        update={
            "limits": GenLimits(q_min_mvar=-0.9, q_max_mvar=0.9),
            "materialized_params": {"sn_mva": 2.75},
        }
    )
    return enm.model_copy(update={"generators": gens})


def _pf_run() -> CanonicalRun:
    set_enm("c-pf", _augmented_enm())
    return execute_run(create_run(case_id="c-pf", klucz_twin="c-pf", analysis_type="PF").id)


def _sc_run() -> CanonicalRun:
    set_enm("c-sc", _augmented_enm())
    return execute_run(
        create_run(case_id="c-sc", klucz_twin="c-sc", analysis_type="short_circuit_sn").id
    )


def _ncrfg(enm: EnergyNetworkModel | None = None) -> NcRfgCaseComplianceResponse:
    return zgodnosc_ncrfg_przypadku(
        enm if enm is not None else _model_magazynu(), operator_id=f.OPERATOR, case_id="c-1"
    )


def _identyfikacja() -> WniosekOsdIdentyfikacja:
    return WniosekOsdIdentyfikacja(
        nazwa_projektu="Farma PV Wschód",
        nazwa_przypadku="Wariant bazowy",
        wnioskodawca="OZE Sp. z o.o.",
        adres_przylaczenia="Stacja B",
    )


def _fake_run(analysis_type: str, status: str) -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="c",
        project_id="p",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="h",
        input_hash="h",
        snapshot={"header": {"name": "Projekt"}, "buses": [], "generators": []},
        validation={},
        readiness={},
        raw_result={},
    )


def _view():
    return build_wniosek_osd_view(
        _pf_run(),
        _sc_run(),
        _ncrfg(),
        bus_ref="bus_nn",
        identyfikacja=_identyfikacja(),
    )


def _docx_text(data: bytes) -> str:
    doc = Document(BytesIO(data))
    parts = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            parts.extend(cell.text for cell in row.cells)
    return "\n".join(parts)


def _pdf_text(data: bytes) -> str:
    with pymupdf.open(stream=data, filetype="pdf") as dokument:
        return "\n".join(strona.get_text() for strona in dokument)


def _payload(**extra) -> dict:
    body = {
        "nazwa_projektu": "Farma PV Wschód",
        "nazwa_przypadku": "Wariant bazowy",
        "wnioskodawca": "OZE Sp. z o.o.",
        "adres_przylaczenia": "Stacja B",
        "bus_ref": "bus_nn",
        "operator_id": f.OPERATOR,
    }
    body.update(extra)
    return body


def _przypadek(app_client, enm: EnergyNetworkModel | None = None) -> str:
    """REALNY projekt + przypadek z zatwierdzonym modelem (klucz projektu, CV-1-W)."""
    from application.twin_key import klucz_twin_dla_przypadku

    projekt = app_client.post("/api/projects", json={"name": "Wniosek OSD — test"})
    assert projekt.status_code == 201, projekt.text
    przypadek = app_client.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Wariant"}
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    set_enm(
        klucz_twin_dla_przypadku(case_id, app_client.app.state.uow_factory),
        enm if enm is not None else _model_magazynu(),
    )
    return case_id


def _post(app_client, sciezka: str, *, case_id: str | None = None, **extra):
    pf, sc = _pf_run(), _sc_run()
    cialo = _payload(pf_run_id=str(pf.id), sc_run_id=str(sc.id))
    cialo.update(extra)
    params = {} if case_id is None else {"case_id": case_id}
    return app_client.post(sciezka, params=params, json=cialo)


# --------------------------------------------------------------------------- #
# Serwis kompozycji — happy path
# --------------------------------------------------------------------------- #
def test_komplet_zrodel_daje_trzy_sekcje() -> None:
    view = _view()
    assert view["kontrakt"] == "WniosekOkresleniaWarunkowPrzylaczeniaV2"
    assert "bilans_mocy" in view
    assert "zwarcia_punkt_przylaczenia" in view
    assert "zgodnosc_nc_rfg" in view
    assert view["identyfikacja"]["wezel_przylaczenia"] == "bus_nn"


def test_bilans_zawiera_moc_zainstalowana() -> None:
    bilans = _view()["bilans_mocy"]
    assert bilans["moc_zainstalowana_zrodel_mva"] == pytest.approx(2.75)
    assert bilans["moc_zainstalowana_w_punkcie_mva"] == pytest.approx(2.75)


def _pf_run_plain_golden() -> CanonicalRun:
    """PF na CZYSTYM golden network (bez augmentacji tego pliku testowego) —
    ``gen_pv`` nie ma ``materialized_params``, a jego ``catalog_ref`` w golden
    nie odpowiada żadnej pozycji katalogu domyślnego (rozjazd nazwy), więc
    jego moc zainstalowana jest GENUINIE nieznana solverowi/katalogowi."""
    set_enm("c-pf-plain", build_golden_enm())
    return execute_run(
        create_run(case_id="c-pf-plain", klucz_twin="c-pf-plain", analysis_type="PF").id
    )


def test_moc_w_punkcie_nieznana_nie_fabrykuje_zera() -> None:
    """FAB-E (E1): źródło IBG w punkcie przyłączenia bez znanej mocy znamionowej
    (brak ``materialized_params``, ``catalog_ref`` bez odpowiednika w katalogu)
    → ``moc_zainstalowana_w_punkcie_mva`` JEST ``None``, nie fikcyjne 0.0
    (przed naprawą ``_installed_mva_by_bus`` sentinel 0.0 przechodził tu
    niezauważony, bo węzeł nie miał żadnego INNEGO, znanego źródła)."""
    bilans = _bilans_mocy_sekcja(_pf_run_plain_golden(), "bus_nn")
    assert bilans["moc_zainstalowana_w_punkcie_mva"] is None
    # Suma całkowita też nie crashuje i nie liczy nieznanego wkładu jako 0 MVA —
    # jedyne źródło IBG w całej sieci jest nieznane, więc suma jest 0.0 (pusta
    # po odrzuceniu nieznanych, E3 klasa (b) — nie fabrykacja z fragmentu).
    assert bilans["moc_zainstalowana_zrodel_mva"] == 0.0


def test_zwarcia_sekcja_ma_ik_i_sk() -> None:
    zwarcia = _view()["zwarcia_punkt_przylaczenia"]
    assert zwarcia["bus_ref"] == "bus_nn"
    assert zwarcia["ik_ss_ka"] is not None
    assert zwarcia["sk_mva"] is not None


def test_zgodnosc_nc_rfg_bloki_rekordow_bez_licznikow() -> None:
    zgodnosc = _view()["zgodnosc_nc_rfg"]
    for pole in ("status", "etykieta_pl", "liczba_modulow", "modulow_zgodnych"):
        assert pole not in zgodnosc
    assert zgodnosc["case_id"] == "c-1"
    [modul] = zgodnosc["moduly"]
    assert modul["der_ref"] == "bess-1" and modul["technologia"] == "MAGAZYN"
    assert all(w["rekord"]["status_maszynowy"] == "NIE_DOTYCZY" for w in modul["wymagania"])
    assert "certyfikacie zgodności" in zgodnosc["odeslanie_pl"]


def test_zgodnosc_nc_rfg_ta_sama_sekcja_co_certyfikat() -> None:
    from application.analyses.certyfikat_zgodnosci import build_certyfikat_view

    zgodnosc = _ncrfg()
    certyfikat = build_certyfikat_view(zgodnosc, nazwa_projektu="—")
    assert _view()["zgodnosc_nc_rfg"]["moduly"] == certyfikat["moduly"]


# --------------------------------------------------------------------------- #
# Bramka braków
# --------------------------------------------------------------------------- #
def test_braki_bez_pf_zly_rodzaj() -> None:
    braki = zbierz_braki_wniosku(
        _fake_run("short_circuit_sn", "FINISHED"), _sc_run(), "bus_nn", _ncrfg()
    )
    assert any("nie jest rozpływem" in b for b in braki)


def test_braki_pf_niezakonczony() -> None:
    braki = zbierz_braki_wniosku(_fake_run("PF", "RUNNING"), _sc_run(), "bus_nn", _ncrfg())
    assert any("nie jest zakończony" in b for b in braki)


def test_braki_bez_sc_zly_rodzaj() -> None:
    braki = zbierz_braki_wniosku(_pf_run(), _fake_run("PF", "FINISHED"), "bus_nn", _ncrfg())
    assert any("nie jest zwarciowy" in b for b in braki)


def test_braki_nieznany_bus_ref() -> None:
    braki = zbierz_braki_wniosku(_pf_run(), _sc_run(), "bus_nieznany", _ncrfg())
    assert any("nie występuje w wynikach zwarciowych" in b for b in braki)


def test_braki_modulow_nc_rfg_to_rekordy_w() -> None:
    """Moduł A bez certyfikatu: braki zgodności to rekordy W (ta sama bramka co certyfikat),
    nie tekst — lista tekstowa niesie wyłącznie braki bilansu i zwarć."""
    ncrfg = _ncrfg(_model_a())
    assert zbierz_braki_wniosku(_pf_run(), _sc_run(), "bus_nn", ncrfg) == []
    with pytest.raises(WniosekOsdBrakiError) as exc:
        build_wniosek_osd_view(
            _pf_run(), _sc_run(), ncrfg, bus_ref="bus_nn", identyfikacja=_identyfikacja()
        )
    assert exc.value.braki == []
    assert exc.value.braki_ncrfg and all(
        isinstance(b.rekord, WynikWymagania) for b in exc.value.braki_ncrfg
    )
    detail = exc.value.detail()
    # Odbiór Pakietu C (plan AB O-50 pkt 7): każda pozycja braku niesie moduł.
    assert detail["braki_ncrfg_pl"] == [
        {"der_ref": b.der_ref, "der_name": b.der_name, "zdanie_pl": b.rekord.wyjasnienie.zdanie_pl}
        for b in exc.value.braki_ncrfg
    ]
    assert [b["der_ref"] for b in detail["braki_ncrfg"]] == [
        b.der_ref for b in exc.value.braki_ncrfg
    ]


def test_braki_model_bez_zrodel_i_zrodlo_pominiete() -> None:
    bez_zrodel = zbierz_braki_wniosku(_pf_run(), _sc_run(), "bus_nn", _ncrfg(f.model()))
    assert any(b.startswith("Zgodność NC RfG:") for b in bez_zrodel)
    pominiety = _ncrfg(f.model(f.generator("pv-0", p_mw=0.0)))
    with pytest.raises(WniosekOsdBrakiError) as exc:
        build_wniosek_osd_view(
            _pf_run(), _sc_run(), pominiety, bus_ref="bus_nn", identyfikacja=_identyfikacja()
        )
    assert [p.der_ref for p in exc.value.pominiete] == ["pv-0"]


def test_braki_blokuja_generacje() -> None:
    with pytest.raises(WniosekOsdBrakiError) as exc:
        build_wniosek_osd_view(
            _pf_run(),
            _sc_run(),
            _ncrfg(),
            bus_ref="bus_nieznany",
            identyfikacja=_identyfikacja(),
        )
    assert exc.value.braki


def test_kolejnosc_brakow_deterministyczna() -> None:
    # Bilans (PF) → zwarcia (SC) → zgodność (NC RfG).
    braki = zbierz_braki_wniosku(
        _fake_run("short_circuit_sn", "FINISHED"),
        _fake_run("PF", "FINISHED"),
        "bus_nn",
        _ncrfg(f.model()),
    )
    assert "nie jest rozpływem" in braki[0]
    assert "nie jest zwarciowy" in braki[1]
    assert braki[-1].startswith("Zgodność NC RfG:")


# --------------------------------------------------------------------------- #
# Determinizm i odciski
# --------------------------------------------------------------------------- #
def test_docx_determinizm_bajtowy() -> None:
    view = _view()
    first = render_wniosek_osd_docx(view)
    second = render_wniosek_osd_docx(view)
    assert first == second
    assert len(first) > 0


def test_odciski_stabilne_dla_tego_samego_widoku() -> None:
    view = _view()
    assert set(view["odciski_sekcji_sha256"]) == {
        "bilans_mocy",
        "zwarcia_punkt_przylaczenia",
        "zgodnosc_nc_rfg",
    }
    assert view["input_hash"]
    # Odciski sekcji są funkcją zawartości — powtórne zbudowanie tej samej
    # sekcji daje ten sam odcisk.
    assert render_wniosek_osd_docx(view) == render_wniosek_osd_docx(view)


# --------------------------------------------------------------------------- #
# Etykiety PL i adnotacje w DOCX
# --------------------------------------------------------------------------- #
def test_docx_etykiety_pl() -> None:
    text = _docx_text(render_wniosek_osd_docx(_view()))
    assert "Wniosek o określenie warunków przyłączenia do sieci OSD" in text
    assert "Bilans mocy" in text
    assert "Zwarcia w punkcie przyłączenia" in text
    assert "Zgodność z wymaganiami NC RfG" in text
    assert "Moduł wytwarzania energii: Źródło bess-1" in text
    assert "Sposób wykazania:" in text
    assert "Farma PV Wschód" in text
    assert "Odcisk SHA-256 wejścia wniosku" in text
    assert "Werdykt zbiorczy" not in text and "zgodnych:" not in text


def test_docx_adnotacje_schemat_i_zestawienia() -> None:
    text = _docx_text(render_wniosek_osd_docx(_view()))
    assert "dołączany jest do wniosku odrębnie" in text
    assert "Zestawienia materiałowe nie są jeszcze generowane" in text


def test_dokument_bez_kodow_projektowych() -> None:
    text = _docx_text(render_wniosek_osd_docx(_view()))
    for pattern in (r"\bP\d{2}\b", r"\bE\d{2}\b", r"\bW-\d{3}\b", r"\bAB-1"):
        assert re.search(pattern, text) is None, pattern


def test_t13_to_samo_zdanie_rekordu_w_json_docx_i_pdf() -> None:
    view = _view()
    docx = re.sub(r"\s+", " ", _docx_text(render_wniosek_osd_docx(view)))
    pdf = re.sub(r"\s+", " ", _pdf_text(render_wniosek_pdf(view)))
    for wymaganie in view["zgodnosc_nc_rfg"]["moduly"][0]["wymagania"]:
        zdanie = re.sub(r"\s+", " ", wymaganie["rekord"]["wyjasnienie"]["zdanie_pl"])
        assert f"Wyjaśnienie: {zdanie}" in docx
        assert zdanie in pdf


# --------------------------------------------------------------------------- #
# Końcówki API
# --------------------------------------------------------------------------- #
def test_endpoint_json_200_komplet(app_client) -> None:
    case_id = _przypadek(app_client)
    resp = _post(app_client, OSD_JSON, case_id=case_id)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["identyfikacja"]["projekt"] == "Farma PV Wschód"
    assert "bilans_mocy" in data and "zwarcia_punkt_przylaczenia" in data
    assert data["zgodnosc_nc_rfg"]["case_id"] == case_id


@pytest.mark.parametrize("sciezka", [OSD_JSON, OSD_DOCX, OSD_PDF])
def test_endpoint_bez_przypadku_to_422(app_client, sciezka: str) -> None:
    assert _post(app_client, sciezka).status_code == 422


@pytest.mark.parametrize("sciezka", [OSD_JSON, OSD_DOCX, OSD_PDF])
def test_endpoint_cialo_z_biegiem_co_jesli_to_422(app_client, sciezka: str) -> None:
    case_id = _przypadek(app_client)
    resp = _post(app_client, sciezka, case_id=case_id, run_request={"modules": [dict(f.KOMPLET)]})
    assert resp.status_code == 422


@pytest.mark.parametrize("sciezka", [OSD_JSON, OSD_DOCX, OSD_PDF])
def test_endpoint_braki_ncrfg_422_z_rekordami(app_client, sciezka: str) -> None:
    case_id = _przypadek(app_client, _model_a())
    resp = _post(app_client, sciezka, case_id=case_id)
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert detail["braki"] == []
    assert detail["braki_ncrfg"] and len(detail["braki_ncrfg"]) == len(detail["braki_ncrfg_pl"])
    for brak, brak_pl in zip(detail["braki_ncrfg"], detail["braki_ncrfg_pl"], strict=True):
        assert set(brak) == {"der_ref", "der_name", "rekord"}
        assert set(brak_pl) == {"der_ref", "der_name", "zdanie_pl"}
        assert (brak["der_ref"], brak["der_name"]) == (brak_pl["der_ref"], brak_pl["der_name"])
        assert brak["rekord"]["wyjasnienie"]["zdanie_pl"] == brak_pl["zdanie_pl"]


def test_endpoint_json_braki_422(app_client) -> None:
    resp = _post(app_client, OSD_JSON, case_id=_przypadek(app_client), bus_ref="bus_nieznany")
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert isinstance(detail["braki"], list)
    assert any("nie występuje w wynikach zwarciowych" in b for b in detail["braki"])


def test_endpoint_nieznany_przebieg_404(app_client) -> None:
    resp = _post(app_client, OSD_JSON, case_id=_przypadek(app_client), pf_run_id=str(uuid4()))
    assert resp.status_code == 404
    assert "nie istnieje" in resp.json()["detail"]


def test_endpoint_nieznany_operator_404(app_client) -> None:
    resp = _post(app_client, OSD_JSON, case_id=_przypadek(app_client), operator_id="nieistniejacy")
    assert resp.status_code == 404
    assert "nieistniejacy" in resp.json()["detail"]


def test_endpoint_docx_content_type(app_client) -> None:
    resp = _post(app_client, OSD_DOCX, case_id=_przypadek(app_client))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.content[:2] == b"PK"


def test_endpoint_docx_determinizm(app_client) -> None:
    pf, sc = _pf_run(), _sc_run()
    payload = _payload(pf_run_id=str(pf.id), sc_run_id=str(sc.id))
    params = {"case_id": _przypadek(app_client)}
    first = app_client.post(OSD_DOCX, params=params, json=payload)
    second = app_client.post(OSD_DOCX, params=params, json=payload)
    assert first.status_code == 200
    assert first.content == second.content


def test_endpoint_walidacja_422_pusta_nazwa(app_client) -> None:
    resp = _post(app_client, OSD_JSON, case_id=_przypadek(app_client), nazwa_projektu="")
    assert resp.status_code == 422


# --------------------------------------------------------------------------- #
# Wariant PDF (D16)
# --------------------------------------------------------------------------- #
def test_pdf_powstaje_naglowek_i_niepusty() -> None:
    data = render_wniosek_pdf(_view())
    assert data[:4] == b"%PDF"
    assert len(data) > 0


def test_pdf_determinizm_bajtowy() -> None:
    view = _view()
    assert render_wniosek_pdf(view) == render_wniosek_pdf(view)


def test_pdf_etykiety_pl() -> None:
    text = _pdf_text(render_wniosek_pdf(_view()))
    assert "Bilans mocy" in text
    assert "Moc zwarciowa" in text
    assert "Rodzaj zwarcia" in text
    assert "Zgodność z wymaganiami NC RfG" in text
    assert "Werdykt zbiorczy" not in text


def test_pdf_dokument_bez_kodow_projektowych() -> None:
    text = _pdf_text(render_wniosek_pdf(_view()))
    for pattern in (r"\bP\d{2}\b", r"\bE\d{2}\b", r"\bW-\d{3}\b", r"\bAB-1"):
        assert re.search(pattern, text) is None, pattern


def test_endpoint_pdf_content_type(app_client) -> None:
    resp = _post(app_client, OSD_PDF, case_id=_przypadek(app_client))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.content[:4] == b"%PDF"


def test_endpoint_pdf_determinizm(app_client) -> None:
    pf, sc = _pf_run(), _sc_run()
    payload = _payload(pf_run_id=str(pf.id), sc_run_id=str(sc.id))
    params = {"case_id": _przypadek(app_client)}
    first = app_client.post(OSD_PDF, params=params, json=payload)
    second = app_client.post(OSD_PDF, params=params, json=payload)
    assert first.status_code == 200
    assert first.content == second.content


def test_endpoint_pdf_braki_422(app_client) -> None:
    resp = _post(app_client, OSD_PDF, case_id=_przypadek(app_client), bus_ref="bus_nieznany")
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert any("nie występuje w wynikach zwarciowych" in b for b in detail["braki"])


def test_endpoint_pdf_nieznany_przebieg_404(app_client) -> None:
    resp = _post(app_client, OSD_PDF, case_id=_przypadek(app_client), pf_run_id=str(uuid4()))
    assert resp.status_code == 404


def test_zalozenia_bez_identyfikatorow_zrodla_w_stopce_docx_i_pdf() -> None:
    """Karta #145 — iloczyn cech {JSON założeń, DOCX, PDF} × {identyfikator przebiegu
    rozpływu, przebiegu zwarciowego, odcisk wejścia oceny NC RfG}: zdania założeń nie
    niosą identyfikatorów, a dokument nie traci śladu źródeł — stopka źródeł niesie je
    jawnie podpisane."""
    view = _view()
    identyfikatory = [
        view["zrodla"]["pf_run_id"],
        view["zrodla"]["sc_run_id"],
        view["zrodla"]["nc_rfg_input_hash"],
    ]
    zalozenia = " ".join(view["zalozenia_pl"])
    for identyfikator in identyfikatory:
        assert identyfikator not in zalozenia
    assert "run_id" not in zalozenia
    for tekst in (
        re.sub(r"\s+", " ", _docx_text(render_wniosek_osd_docx(view))),
        re.sub(r"\s+", " ", _pdf_text(render_wniosek_pdf(view))),
    ):
        assert f"Przebieg rozpływu mocy: {view['zrodla']['pf_run_id']}" in tekst
        assert f"Przebieg zwarciowy: {view['zrodla']['sc_run_id']}" in tekst
        assert (
            f"Odcisk wejścia oceny zgodności NC RfG: {view['zrodla']['nc_rfg_input_hash']}" in tekst
        )


def test_status_walidacji_po_polsku_dla_kazdego_kodu_i_bez_kodu_spoza_slownika() -> None:
    """Karta #145: każdy stan walidacji energetycznej ma polską etykietę w dokumencie
    wniosku, a stan spoza słownika daje zdanie, nigdy kod."""
    from analysis.energy_validation.models import EnergyValidationStatus
    from application.analyses.wniosek_osd import _status_pl

    for stan in EnergyValidationStatus:
        assert _status_pl(stan.value) != stan.value
    assert _status_pl("NOWY_STAN") == "stan spoza słownika aplikacji"
