"""Ocena doboru przekroju magistrali SN rekordami werdyktu (karta MAGISTRALA-OCENA).

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA pkt 2): kryterium {obciążalność odcinka, spadek
odcinka, spadek ciągu} × stan {spełnia, nie spełnia, na granicy, brak danych} × napięcie
{15 kV, 20 kV}. Warstwa „rozwiązanie w backendzie" — ten plik; warstwa „trasa API" —
`tests/api/test_ocena_doboru_magistrali_api.py`; warstwa „render kreatora" —
`frontend/src/ui2/kreatory/magistrala/__tests__/KreatorMagistralaSn.test.tsx`.

Rozstrzygnięcie spadku (SPELNIA / NIE_SPELNIA) wymaga podstawy limitu o ustalonym
pochodzeniu. Kryterium 4 `kryteria_napiecia` ma dziś podstawę NIEUSTALONE (brak dokumentu
operatora z wydaniem i punktem) — stan domyślny daje BRAK_PODSTAWY z zachowanym wynikiem,
limitem i marginesem (test osobny). Iloczyn stanów rozstrzygniętych podnosi podstawę
w JEDNYM źródle (nazwy modułu oceny importowane z `kryteria_napiecia`) — ten sam
mechanizm, którym przyszły dokument operatora podniesie stan dla wszystkich ocen.
"""

from __future__ import annotations

import math
from dataclasses import replace
from typing import Any

import pytest
from analysis.normative import kryteria_napiecia
from application.analyses import ocena_doboru_magistrali as modul
from application.analyses.ocena_doboru_magistrali import (
    KRYTERIUM_OBCIAZALNOSCI,
    KRYTERIUM_SPADKU_CIAGU,
    KRYTERIUM_SPADKU_ODCINKA,
    OdcinekMagistrali,
    ocen_dobor_magistrali,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CableType, LineType
from werdykt import OcenaKryterium

KABEL_ZWERYFIKOWANY = "cable-nkt-n2xs2y-1x150"
KABEL_BAZOWY = "cable-base-epr-al-1c-120"
COS_PHI = 0.95
NAPIECIA_KV = (15.0, 20.0)
STANY = ("spelnia", "nie_spelnia", "granica", "brak_danych")
KRYTERIA = (KRYTERIUM_OBCIAZALNOSCI, KRYTERIUM_SPADKU_ODCINKA, KRYTERIUM_SPADKU_CIAGU)
OCZEKIWANY_STATUS = {
    "spelnia": "SPELNIA",
    "nie_spelnia": "NIE_SPELNIA",
    "granica": "SPELNIA",
    "brak_danych": "NIE_OCENIONO",
}


def _kabel(type_id: str) -> CableType:
    typ = get_default_mv_catalog().get_cable_type(type_id)
    assert typ is not None
    return typ


def _dlugosc_dla_spadku_m(typ: CableType, prad_a: float, napiecie_kv: float, pct: float) -> float:
    """Wyrocznia niezależna od solvera: długość, przy której ΔU% = pct (wzór jawny)."""
    sin_phi = math.sqrt(1.0 - COS_PHI * COS_PHI)
    na_km = math.sqrt(3.0) * prad_a * (typ.r_ohm_per_km * COS_PHI + typ.x_ohm_per_km * sin_phi)
    return pct / 100.0 * napiecie_kv * 1000.0 / na_km * 1000.0


def _odcinek(**zmiany: Any) -> OdcinekMagistrali:
    baza = OdcinekMagistrali(
        rodzaj="KABEL",
        catalog_ref=KABEL_ZWERYFIKOWANY,
        dlugosc_m=500.0,
        prad_roboczy_a=100.0,
        cos_phi=COS_PHI,
    )
    return replace(baza, **zmiany)


def _rekord(wynik: modul.OcenaDoboruMagistrali, kryterium_id: str) -> OcenaKryterium:
    rekordy = {r.kryterium_id: r for r in (*wynik.oceny_odcinka, wynik.ocena_ciagu)}
    return rekordy[kryterium_id]


@pytest.fixture()
def podstawa_spadku_wskazana(monkeypatch: pytest.MonkeyPatch) -> None:
    """Podstawa limitu spadku podniesiona w źródle, z którego czyta moduł oceny."""
    monkeypatch.setattr(modul, "KRYTERIUM_SPADKU_CIAGU_SN_WYDANIE", "wydanie testowe")
    monkeypatch.setattr(modul, "KRYTERIUM_SPADKU_CIAGU_SN_JEDNOSTKA_REDAKCYJNA", "pkt testowy")
    monkeypatch.setattr(modul, "KRYTERIUM_SPADKU_CIAGU_SN_STAN_ZRODLA", "WSKAZANE")


def _scenariusz(kryterium_id: str, stan: str, napiecie_kv: float) -> modul.OcenaDoboruMagistrali:
    typ = _kabel(KABEL_ZWERYFIKOWANY)
    iz = typ.rated_current_a
    limit = kryteria_napiecia.KRYTERIUM_SPADKU_CIAGU_SN_PROCENT
    if kryterium_id == KRYTERIUM_OBCIAZALNOSCI:
        prad = {"spelnia": iz * 0.6, "nie_spelnia": iz * 1.2, "granica": iz, "brak_danych": None}[
            stan
        ]
        return ocen_dobor_magistrali(napiecie_kv=napiecie_kv, odcinek=_odcinek(prad_roboczy_a=prad))
    prad = 150.0
    granica_m = _dlugosc_dla_spadku_m(typ, prad, napiecie_kv, limit)
    dlugosc = {
        "spelnia": granica_m * 0.5,
        "nie_spelnia": granica_m * 1.3,
        "granica": granica_m,
        "brak_danych": None,
    }[stan]
    if kryterium_id == KRYTERIUM_SPADKU_ODCINKA:
        return ocen_dobor_magistrali(
            napiecie_kv=napiecie_kv, odcinek=_odcinek(prad_roboczy_a=prad, dlugosc_m=dlugosc)
        )
    # Ciąg: dwa odcinki, suma spadków rozstrzyga; w stanie „nie spełnia" KAŻDY odcinek osobno
    # ma 65 % limitu (sam odcinek spełnia, ciąg nie) — defekt sumy nie schowa się za odcinkiem.
    udzial = {"spelnia": 0.25, "nie_spelnia": 0.65, "granica": 0.5, "brak_danych": 0.25}[stan]
    zbudowany = _odcinek(
        prad_roboczy_a=prad, dlugosc_m=None if stan == "brak_danych" else granica_m * udzial
    )
    return ocen_dobor_magistrali(
        napiecie_kv=napiecie_kv,
        odcinek=_odcinek(prad_roboczy_a=prad, dlugosc_m=granica_m * udzial),
        odcinki_zbudowane=[zbudowany],
    )


@pytest.mark.usefixtures("podstawa_spadku_wskazana")
@pytest.mark.parametrize("napiecie_kv", NAPIECIA_KV)
@pytest.mark.parametrize("stan", STANY)
@pytest.mark.parametrize("kryterium_id", KRYTERIA)
def test_iloczyn_kryterium_stan_napiecie(kryterium_id: str, stan: str, napiecie_kv: float) -> None:
    rekord = _rekord(_scenariusz(kryterium_id, stan, napiecie_kv), kryterium_id)
    assert rekord.status_maszynowy == OCZEKIWANY_STATUS[stan]
    # Rekord przechodzi walidację kontraktu także po odczycie z JSON (reguła ma jedno ciało).
    assert OcenaKryterium.model_validate(rekord.model_dump(mode="json")) == rekord
    assert rekord.wyjasnienie.zdanie_pl
    assert rekord.limit is not None or stan == "brak_danych"
    if stan == "brak_danych":
        assert rekord.wynik is None
        assert rekord.wyjasnienie.czego_brakuje, "brak danych musi nazwać brak"
        assert rekord.etykieta.semantyka == "neutralna"
        return
    assert rekord.wynik is not None and rekord.margines is not None
    margines = rekord.margines.wartosc
    assert margines is not None
    if stan == "granica":
        assert margines.wartosc == pytest.approx(0.0, abs=1e-6)
    elif stan == "spelnia":
        assert margines.wartosc > 0.0
    else:
        assert margines.wartosc < 0.0
        assert rekord.etykieta.semantyka == "negatywna"
    if kryterium_id != KRYTERIUM_OBCIAZALNOSCI:
        # Spadek zależy od napięcia: ta sama długość graniczna wyprowadzona dla KAŻDEGO napięcia.
        assert rekord.limit is not None
        assert rekord.limit.wartosc is not None
        assert rekord.limit.wartosc.wartosc == kryteria_napiecia.KRYTERIUM_SPADKU_CIAGU_SN_PROCENT
        assert rekord.zakres_waznosci.rodzaj_analizy == "POWER_FLOW"


@pytest.mark.parametrize("napiecie_kv", NAPIECIA_KV)
def test_podstawa_spadku_domyslnie_nieustalona_daje_brak_podstawy_z_wynikiem(
    napiecie_kv: float,
) -> None:
    """Stan zastany: limit 5 % bez dokumentu z wydaniem i punktem → BRAK_PODSTAWY, a wynik,
    limit i margines zostają pokazane (werdykt niewydany, liczby są)."""
    wynik = ocen_dobor_magistrali(napiecie_kv=napiecie_kv, odcinek=_odcinek(dlugosc_m=3000.0))
    for kryterium_id in (KRYTERIUM_SPADKU_ODCINKA, KRYTERIUM_SPADKU_CIAGU):
        rekord = _rekord(wynik, kryterium_id)
        assert rekord.status_maszynowy == "BRAK_PODSTAWY"
        assert rekord.wynik is not None and rekord.margines is not None
        assert rekord.limit is not None
        assert (
            rekord.limit.podstawa.status == kryteria_napiecia.KRYTERIUM_SPADKU_CIAGU_SN_STAN_ZRODLA
        )
        assert (
            rekord.limit.podstawa.dokument
            == kryteria_napiecia.KRYTERIUM_SPADKU_CIAGU_SN_DOKUMENT_PL
        )
        assert rekord.wyjasnienie.przyczyna_pl is not None


def test_limit_spadku_wyprowadzony_z_kryterium_ostrzezenia() -> None:
    """Kryterium 4 nie jest drugą kopią liczby: to ta sama wartość co kryterium 2."""
    assert (
        kryteria_napiecia.KRYTERIUM_SPADKU_CIAGU_SN_PROCENT
        == kryteria_napiecia.KRYTERIUM_OSTRZEZENIE_PROCENT
    )


def test_obciazalnosc_katalogu_czesciowo_zweryfikowanego_nie_rozstrzyga() -> None:
    """Rekord katalogowy bez statusu „zweryfikowany" nie przenosi dokumentu: limit I_z ma
    podstawę NIEUSTALONE → BRAK_PODSTAWY (ta sama reguła co `dziedziny.sekcje`)."""
    typ = _kabel(KABEL_BAZOWY)
    assert typ.verification_status != "ZWERYFIKOWANY"
    wynik = ocen_dobor_magistrali(
        napiecie_kv=15.0, odcinek=_odcinek(catalog_ref=KABEL_BAZOWY, prad_roboczy_a=300.0)
    )
    rekord = _rekord(wynik, KRYTERIUM_OBCIAZALNOSCI)
    assert rekord.status_maszynowy == "BRAK_PODSTAWY"
    assert rekord.limit is not None and rekord.limit.podstawa.status == "NIEUSTALONE"
    assert rekord.limit.wartosc is not None and rekord.limit.wartosc.wartosc == typ.rated_current_a
    assert rekord.margines is not None and rekord.margines.wartosc is not None
    assert rekord.margines.wartosc.wartosc == pytest.approx(typ.rated_current_a - 300.0)


def test_obciazalnosc_katalogu_zweryfikowanego_ma_podstawe_wskazana() -> None:
    typ = _kabel(KABEL_ZWERYFIKOWANY)
    rekord = _rekord(
        ocen_dobor_magistrali(napiecie_kv=20.0, odcinek=_odcinek()), KRYTERIUM_OBCIAZALNOSCI
    )
    assert rekord.limit is not None
    assert rekord.limit.podstawa.status == "WSKAZANE"
    assert rekord.limit.podstawa.dokument == typ.source_reference
    assert "warunkach odniesienia" in rekord.zakres_waznosci.opis_pl
    assert any("ułożenia" in w for w in rekord.zakres_waznosci.wykluczenia)


def test_brak_pradu_roboczego_spadek_przy_obciazalnosci_jako_dana_przyjeta() -> None:
    """Bez I_B: obciążalność NIE_OCENIONO; spadek liczony przy I = I_z (dana przyjęta,
    kompletność NIEPELNY z nazwanym powodem) — nigdy ciche przyjęcie."""
    typ = _kabel(KABEL_ZWERYFIKOWANY)
    wynik = ocen_dobor_magistrali(napiecie_kv=15.0, odcinek=_odcinek(prad_roboczy_a=None))
    assert _rekord(wynik, KRYTERIUM_OBCIAZALNOSCI).status_maszynowy == "NIE_OCENIONO"
    assert wynik.spadek_odcinka is not None
    assert wynik.spadek_odcinka.prad_z_obciazalnosci is True
    assert wynik.spadek_odcinka.prad_obliczeniowy_a == typ.rated_current_a
    for kryterium_id in (KRYTERIUM_SPADKU_ODCINKA, KRYTERIUM_SPADKU_CIAGU):
        rekord = _rekord(wynik, kryterium_id)
        assert rekord.dowod.status_danych.stan == "UNVALIDATED_INPUT"
        assert rekord.kompletnosc_dowodu == "NIEPELNY"
        assert any("prąd obliczeniowy" in p for p in rekord.powody_niepelnosci)


def test_typ_nieistniejacy_nazwany_w_brakach() -> None:
    wynik = ocen_dobor_magistrali(
        napiecie_kv=20.0, odcinek=_odcinek(catalog_ref="kabel-ktorego-nie-ma")
    )
    for kryterium_id in KRYTERIA:
        rekord = _rekord(wynik, kryterium_id)
        assert rekord.status_maszynowy == "NIE_OCENIONO"
        assert any("nie istnieje" in b for b in rekord.wyjasnienie.czego_brakuje)
    assert wynik.spadek_odcinka is None
    assert wynik.ciag.spadek is None


class _KatalogBezObciazalnosci:
    """Atrapa katalogu: typ kabla z pustą obciążalnością (pole 0 w karcie)."""

    def __init__(self) -> None:
        self._typ = replace(_kabel(KABEL_ZWERYFIKOWANY), rated_current_a=0.0)

    def get_cable_type(self, type_id: str) -> CableType | None:
        return self._typ if type_id == self._typ.id else None

    def get_line_type(self, type_id: str) -> LineType | None:
        return None


def test_typ_bez_obciazalnosci_w_katalogu() -> None:
    """Typ bez I_z: obciążalność BRAK_PODSTAWY (jest wynik, nie ma limitu) z nazwanym
    brakiem; bez I_B spadek nie ma prądu zastępczego → NIE_OCENIONO z nazwanym brakiem."""
    katalog = _KatalogBezObciazalnosci()
    z_pradem = ocen_dobor_magistrali(napiecie_kv=15.0, odcinek=_odcinek(), katalog=katalog)
    obciazalnosc = _rekord(z_pradem, KRYTERIUM_OBCIAZALNOSCI)
    assert obciazalnosc.status_maszynowy == "BRAK_PODSTAWY"
    assert any("obciążalność długotrwała" in b for b in obciazalnosc.wyjasnienie.czego_brakuje)
    assert _rekord(z_pradem, KRYTERIUM_SPADKU_ODCINKA).wynik is not None
    bez_pradu = ocen_dobor_magistrali(
        napiecie_kv=15.0, odcinek=_odcinek(prad_roboczy_a=None), katalog=katalog
    )
    spadek = _rekord(bez_pradu, KRYTERIUM_SPADKU_ODCINKA)
    assert spadek.status_maszynowy == "NIE_OCENIONO"
    assert any("nie ma czym go zastąpić" in b for b in spadek.wyjasnienie.czego_brakuje)


def test_linia_napowietrzna_bez_korekty_ulozenia() -> None:
    linia = get_default_mv_catalog().list_line_types()[0]
    wynik = ocen_dobor_magistrali(
        napiecie_kv=15.0,
        odcinek=_odcinek(rodzaj="LINIA", catalog_ref=linia.id, prad_roboczy_a=100.0),
    )
    rekord = _rekord(wynik, KRYTERIUM_OBCIAZALNOSCI)
    assert rekord.limit is not None and rekord.limit.wartosc is not None
    assert rekord.limit.wartosc.wartosc == linia.rated_current_a
    assert "linii napowietrznej" in rekord.zakres_waznosci.opis_pl
    assert "PN-EN 50341" in rekord.podstawa.dokument
    assert wynik.spadek_odcinka is not None


def test_ciag_z_odcinkiem_bez_danych_jest_nieoceniony_z_numerem_odcinka() -> None:
    """Odcinek zbudowany bez długości: odcinek bieżący oceniony, ciąg NIE_OCENIONO z brakiem
    nazwanym numerem odcinka (dawny defekt V12K-227: suma nieznanych składników)."""
    wynik = ocen_dobor_magistrali(
        napiecie_kv=15.0,
        odcinek=_odcinek(),
        odcinki_zbudowane=[_odcinek(dlugosc_m=None)],
    )
    assert _rekord(wynik, KRYTERIUM_SPADKU_ODCINKA).wynik is not None
    ciag = _rekord(wynik, KRYTERIUM_SPADKU_CIAGU)
    assert ciag.status_maszynowy == "NIE_OCENIONO"
    assert any(b.startswith("odcinek 1: długość") for b in ciag.wyjasnienie.czego_brakuje)
    assert wynik.ciag.spadek is None and wynik.ciag.dlugosc_m is None
    assert wynik.ciag.liczba_odcinkow == 2


def test_ciag_sumuje_w_solverze_i_dlugosc() -> None:
    wynik = ocen_dobor_magistrali(
        napiecie_kv=20.0,
        odcinek=_odcinek(dlugosc_m=800.0),
        odcinki_zbudowane=[_odcinek(dlugosc_m=1200.0)],
    )
    assert wynik.ciag.dlugosc_m == 2000.0
    assert wynik.ciag.spadek is not None
    assert len(wynik.ciag.spadek.segments) == 2
    ciag = _rekord(wynik, KRYTERIUM_SPADKU_CIAGU)
    assert ciag.wynik is not None
    assert ciag.wynik.wartosc.wartosc == round(wynik.ciag.spadek.delta_u_pct, 6)
    assert "2 odcinki" in ciag.przedmiot.opis_pl


def test_niedodatnie_napiecie_odrzucone() -> None:
    with pytest.raises(ValueError, match="Napięcie ciągu"):
        ocen_dobor_magistrali(napiecie_kv=0.0, odcinek=_odcinek())


def test_determinizm() -> None:
    def zrzut() -> list[dict[str, Any]]:
        wynik = ocen_dobor_magistrali(
            napiecie_kv=15.0, odcinek=_odcinek(), odcinki_zbudowane=[_odcinek(dlugosc_m=700.0)]
        )
        return [r.model_dump(mode="json") for r in (*wynik.oceny_odcinka, wynik.ocena_ciagu)]

    assert zrzut() == zrzut()
