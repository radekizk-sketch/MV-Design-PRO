"""Podstawa reguły sposobu wykazania (``WynikWymagania.podstawa_sposobu_wykazania``) i
informacyjne składowe przy ``BRAK_METODY`` — karta AB-1a Pakiet C, sekcja C3.

Po co: certyfikat urządzenia wykazuje wymaganie tylko wtedy, gdy reguła warstwy WiPWC mówi,
że certyfikat pokrywa to wymaganie dla typu modułu. Ta reguła ma własną podstawę; dopóki jej
stan jest ``NIEUSTALONE`` (punkt WiPWC niewskazany), sam certyfikat nie może dać ``SPELNIA`` —
wynik to ``BRAK_DOWODU`` z powodem nazywającym regułę (plan AB §6 p. 5, O-17).

Iloczyn cech (KLASA, NIE INSTANCJA): sposób wykazania {CERTYFIKAT, DEKLARACJA, DOWOD_LACZONY,
BRAK_METODY} × stan podstawy reguły {brak, ZWERYFIKOWANE, WSKAZANE, NIEUSTALONE} × składowe
{spełnione z dowodem pełnym, naruszone, nieocenione, brak}. Oczekiwanie wprost z kontraktu:
reguła NIEUSTALONE daje niepełny dowód (powód z nazwą reguły), reguła WSKAZANE — zastrzeżenie,
ZWERYFIKOWANE — nic; BRAK_METODY nie przyjmuje podstawy reguły; blok dokumentu niesie regułę
w pozycji „Sposób wykazania"; rekord jest deterministyczny i odtwarzalny z JSON.
"""

from __future__ import annotations

import itertools

import pytest
from pydantic import ValidationError
from werdykt import (
    MetodaDowodu,
    OcenaKryterium,
    StanZrodla,
    WynikWymagania,
    blok_wymagania,
    decyzja,
)
from werdykt.kontrakt import KOLEJNOSC_METOD
from werdykt.proweniencja import POZIOMY_DOPUSZCZALNE_DLA_TWIERDZENIA, ClaimKind, EvidenceTier
from werdykt.wyjasnienie import NAZWA_STANU_ZRODLA_PL

from tests.werdykt import fabryki as f

SPOSOBY: tuple[MetodaDowodu, ...] = ("CERTYFIKAT", "DEKLARACJA", "DOWOD_LACZONY", "BRAK_METODY")
STANY_REGULY: tuple[StanZrodla | None, ...] = (None, "ZWERYFIKOWANE", "WSKAZANE", "NIEUSTALONE")
SKLADOWE: tuple[str, ...] = ("spelnia", "nie_spelnia", "nie_oceniono", "brak")


def _skladowa(rodzaj: str, sposob: MetodaDowodu) -> OcenaKryterium | None:
    if rodzaj == "brak":
        return None
    if sposob == "CERTYFIKAT":
        dowod = f.dowod(metoda="CERTYFIKAT", twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE)
        return f.ocena(
            "LOGICZNE",
            kryterium_id="certyfikat.pokrycie",
            metoda_wyniku="CERTYFIKAT",
            dowod_oceny=dowod,
            stan_logiczny=rodzaj != "nie_spelnia",
            jest_wynik=rodzaj != "nie_oceniono",
        )
    return f.ocena(
        kryterium_id="kryterium.a",
        m=-2.0 if rodzaj == "nie_spelnia" else 2.0,
        jest_wynik=rodzaj != "nie_oceniono",
    )


def _oczekiwany_status(sposob: MetodaDowodu, stan: StanZrodla | None, rodzaj: str) -> str:
    if sposob == "BRAK_METODY":
        return "BRAK_DOWODU"
    if rodzaj == "nie_spelnia":
        return "NIE_SPELNIA"
    if rodzaj == "nie_oceniono":
        return "NIE_OCENIONO"
    if stan == "NIEUSTALONE":
        return "BRAK_DOWODU"
    return "SPELNIA"


PRZYPADKI = [
    (sposob, stan, rodzaj)
    for sposob, stan, rodzaj in itertools.product(SPOSOBY, STANY_REGULY, SKLADOWE)
    # Pusta lista składowych jest dopuszczalna wyłącznie przy BRAK_METODY (§4.2).
    if not (rodzaj == "brak" and sposob != "BRAK_METODY")
]


@pytest.mark.parametrize(
    "sposob, stan, rodzaj", PRZYPADKI, ids=[f"{a}-{b}-{c}" for a, b, c in PRZYPADKI]
)
def test_iloczyn_cech_sposob_stan_reguly_skladowe(
    sposob: MetodaDowodu, stan: StanZrodla | None, rodzaj: str
) -> None:
    skladowa = _skladowa(rodzaj, sposob)
    oceny = [] if skladowa is None else [skladowa]
    podstawa = None if stan is None else f.podstawa_reguly_sposobu(stan)
    if sposob == "BRAK_METODY" and podstawa is not None:
        with pytest.raises(ValidationError, match="BRAK_METODY nie ma reguły"):
            f.wymaganie(oceny, sposob=sposob, podstawa_sposobu=podstawa)
        return
    rekord = f.wymaganie(oceny, sposob=sposob, podstawa_sposobu=podstawa)
    assert rekord.status_maszynowy == _oczekiwany_status(sposob, stan, rodzaj)
    assert rekord.podstawa_sposobu_wykazania == podstawa
    powody_reguly = [p for p in rekord.powody_niepelnosci if p.startswith("Reguła sposobu")]
    zastrzezenia_reguly = [
        z for z in rekord.wyjasnienie.zastrzezenia if z.startswith("Reguła sposobu")
    ]
    if stan == "NIEUSTALONE":
        assert rekord.kompletnosc_dowodu == "NIEPELNY"
        assert len(powody_reguly) == 1
        assert "WiPWC" in powody_reguly[0]
        assert "pokrycie bez wskazania punktu WiPWC" in powody_reguly[0]
        # Powód niepełności jest też brakiem wymagania (czego brakuje), niezależnie od statusu.
        assert powody_reguly[0] in rekord.wyjasnienie.czego_brakuje
    else:
        assert powody_reguly == []
    if stan in ("WSKAZANE", "NIEUSTALONE"):
        assert len(zastrzezenia_reguly) == 1
        # Stan źródła reguły nazwany po polsku; kod wyłącznie w `podstawa_sposobu_wykazania`.
        assert f"„{NAZWA_STANU_ZRODLA_PL[stan]}”" in zastrzezenia_reguly[0]
        assert stan not in zastrzezenia_reguly[0]
    else:
        assert zastrzezenia_reguly == []
    pozycja = next(p for p in blok_wymagania(rekord) if p.etykieta_pl == "Sposób wykazania")
    assert ("podstawa reguły" in pozycja.tresc_pl) == (podstawa is not None)
    # Determinizm i odtwarzalność z JSON (walidator wyprowadza pola ponownie z tą samą regułą).
    assert (
        rekord.kanoniczny_json()
        == f.wymaganie(oceny, sposob=sposob, podstawa_sposobu=podstawa).kanoniczny_json()
    )
    assert WynikWymagania.model_validate_json(rekord.model_dump_json()) == rekord


def test_sam_certyfikat_z_regula_nieustalona_to_brak_dowodu_nigdy_spelnia() -> None:
    """Sonda (2) karty repo na poziomie kontraktu: certyfikat spełnia kryterium pokrycia, ale
    reguła pokrycia WiPWC ma stan NIEUSTALONE → BRAK_DOWODU (krok KOMPLETNOSC)."""
    skladowa = _skladowa("spelnia", "CERTYFIKAT")
    assert skladowa is not None and skladowa.kompletnosc_dowodu == "PELNY"
    rekord = f.wymaganie(
        [skladowa], sposob="CERTYFIKAT", podstawa_sposobu=f.podstawa_reguly_sposobu()
    )
    assert rekord.status_maszynowy == "BRAK_DOWODU"
    assert "Reguła sposobu wykazania „certyfikat urządzenia”" in rekord.wyjasnienie.przyczyna_pl
    # Ta sama para bez reguły NIEUSTALONE — SPELNIA (reguła, nie certyfikat, decyduje).
    wskazana = f.wymaganie(
        [skladowa], sposob="CERTYFIKAT", podstawa_sposobu=f.podstawa_reguly_sposobu("WSKAZANE")
    )
    assert wskazana.status_maszynowy == "SPELNIA"


def test_rekord_z_podmieniona_kompletnoscia_bez_reguly_jest_odrzucany() -> None:
    """Predykaty parami: rekord zbudowany ręcznie z kompletnością policzoną BEZ reguły
    sposobu wykazania różni się od wyprowadzenia walidatora — konstrukcja jest odrzucana."""
    skladowa = _skladowa("spelnia", "CERTYFIKAT")
    assert skladowa is not None
    rekord = f.wymaganie(
        [skladowa], sposob="CERTYFIKAT", podstawa_sposobu=f.podstawa_reguly_sposobu()
    )
    dane = rekord.model_dump()
    dane["podstawa_sposobu_wykazania"] = None
    with pytest.raises(ValidationError, match="kompletność dowodu"):
        WynikWymagania.model_validate(dane)


def test_kompletnosc_wymagania_bez_reguly_nie_zna_powodu_reguly() -> None:
    """Czysta funkcja reguły: ta sama składowa, z regułą NIEUSTALONE i bez niej."""
    skladowa = _skladowa("spelnia", "CERTYFIKAT")
    assert skladowa is not None
    dowod = f.dowod(metoda="CERTYFIKAT", twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE)
    podstawa = f.podstawa()
    bez, powody_bez = decyzja.kompletnosc_wymagania(
        dotyczy=True, dowod=dowod, podstawa=podstawa, oceny=[skladowa]
    )
    z, powody_z = decyzja.kompletnosc_wymagania(
        dotyczy=True,
        dowod=dowod,
        podstawa=podstawa,
        oceny=[skladowa],
        podstawa_sposobu_wykazania=f.podstawa_reguly_sposobu(),
    )
    assert (bez, powody_bez) == ("PELNY", [])
    assert z == "NIEPELNY"
    assert len(powody_z) == 1 and powody_z[0].startswith("Reguła sposobu wykazania")


@pytest.mark.parametrize("rodzaj", ["spelnia", "nie_spelnia", "nie_oceniono"])
def test_brak_metody_ze_skladowa_informacyjna(rodzaj: str) -> None:
    """BRAK_METODY z oceną składową (np. koordynacja nastaw RoCoF przy RFG_13_1B): status
    BRAK_DOWODU niezależnie od składowej, składowa pokazana w zdaniu jako informacyjna, jej
    braki przeniesione do wymagania."""
    skladowa = _skladowa(rodzaj, "DEKLARACJA")
    assert skladowa is not None
    rekord = f.wymaganie([skladowa], sposob="BRAK_METODY")
    assert rekord.status_maszynowy == "BRAK_DOWODU"
    assert rekord.oceny_skladowe == (skladowa,)
    # Kontrakt §4.2 „Składowe informacyjne przy BRAK_METODY": krok 2 reguły W rozstrzyga przed
    # składowymi — naruszona składowa nie trafia do kryteriów naruszonych, a wymaganie bez
    # metody nie ma kryterium najbliżej granicy ani podstawy reguły sposobu wykazania.
    assert rekord.kryteria_naruszone == ()
    assert rekord.kryterium_najblizej_granicy is None
    assert rekord.podstawa_sposobu_wykazania is None
    assert "Kryteria składowe (informacyjnie — nie wykazują wymagania)" in (
        rekord.wyjasnienie.zdanie_pl
    )
    for brak in skladowa.wyjasnienie.czego_brakuje:
        assert any(brak in b for b in rekord.wyjasnienie.czego_brakuje)


def test_brak_metody_bez_skladowych_nie_ma_zdania_o_skladowych() -> None:
    rekord = f.wymaganie([], sposob="BRAK_METODY")
    assert rekord.status_maszynowy == "BRAK_DOWODU"
    assert "informacyjnie" not in rekord.wyjasnienie.zdanie_pl


# ---------------------------------------------------------------------------
# Poziom certyfikatu badania typu (odbiór Pakietu C, plan AB O-50; kontrakt §3 tabela poziomów)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("metoda", "poziom"), itertools.product(KOLEJNOSC_METOD, EvidenceTier))
def test_poziom_certyfikatu_badania_typu_wylacznie_z_certyfikatem(
    metoda: MetodaDowodu, poziom: EvidenceTier
) -> None:
    """Metoda × poziom: dowód certyfikatem niesie WYŁĄCZNIE poziom ``TYPE_TEST_CERTIFICATE``, a
    ten poziom towarzyszy wyłącznie certyfikatowi i dowodowi łączonemu (najsłabszy poziom
    składników). Wyrocznia: ``f.poziomy_metody`` wprost z tekstu kontraktu."""
    dozwolone = poziom in f.poziomy_metody(metoda)
    bieg = metoda in ("SYMULACJA", "OBLICZENIE")
    zbuduj = lambda: f.dowod(  # noqa: E731
        metoda=metoda,
        poziom=poziom,
        w_domenie=True if bieg else None,
        domena=f.DOMENA_WALIDACJI if bieg else None,
    )
    if dozwolone:
        assert zbuduj().poziom is poziom
    else:
        with pytest.raises(ValidationError, match="certyfikat"):
            zbuduj()


@pytest.mark.parametrize("stan", ["ZWERYFIKOWANE", "NIEUSTALONE"])
@pytest.mark.parametrize(
    "twierdzenie", [ClaimKind.DYNAMIC_PERFORMANCE, ClaimKind.DECLARED_CONFIGURATION]
)
def test_rekord_ze_sposobem_certyfikat_niesie_poziom_certyfikatu(
    twierdzenie: ClaimKind, stan: StanZrodla
) -> None:
    """Rekord W ze sposobem CERTYFIKAT: ``dowod.poziom == TYPE_TEST_CERTIFICATE`` niezależnie od
    stanu reguły pokrycia i rodzaju twierdzenia; kompletność rozstrzyga reguła (NIEUSTALONE →
    BRAK_DOWODU), nie poziom."""
    skladowa = _skladowa("spelnia", "CERTYFIKAT")
    assert skladowa is not None
    rekord = f.wymaganie(
        [skladowa],
        sposob="CERTYFIKAT",
        dowod_wymagania=f.dowod(metoda="CERTYFIKAT", twierdzenie=twierdzenie),
        podstawa_sposobu=f.podstawa(stan),
    )
    assert rekord.dowod.poziom is EvidenceTier.TYPE_TEST_CERTIFICATE
    assert skladowa.dowod.poziom is EvidenceTier.TYPE_TEST_CERTIFICATE
    assert rekord.status_maszynowy == ("SPELNIA" if stan == "ZWERYFIKOWANE" else "BRAK_DOWODU")


def test_dowod_laczony_z_poziomem_certyfikatu_wymaga_skladowej_certyfikatu() -> None:
    """Rekord bez certyfikatu nigdy nie niesie poziomu certyfikatu: dowód łączony z poziomem
    ``TYPE_TEST_CERTIFICATE`` bez stosowalnej składowej wykazanej certyfikatem jest odrzucany;
    ze składową certyfikatu — przyjmowany."""
    laczony = f.dowod(
        metoda="DOWOD_LACZONY",
        poziom=EvidenceTier.TYPE_TEST_CERTIFICATE,
        twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE,
    )
    with pytest.raises(ValidationError, match="bez stosowalnej składowej wykazanej certyfikatem"):
        f.wymaganie([f.ocena()], sposob="DOWOD_LACZONY", dowod_wymagania=laczony)
    certyfikat = _skladowa("spelnia", "CERTYFIKAT")
    assert certyfikat is not None
    rekord = f.wymaganie([certyfikat, f.ocena()], sposob="DOWOD_LACZONY", dowod_wymagania=laczony)
    assert rekord.dowod.poziom is EvidenceTier.TYPE_TEST_CERTIFICATE


def test_poziomy_dopuszczalne_dla_twierdzenia() -> None:
    """Tabela poziomów × rodzaj twierdzenia (kontrakt §3): certyfikat badania typu jest
    dopuszczalny dla zachowania dynamicznego i konfiguracji zadeklarowanej, nie dla obliczenia
    statycznego (zwalidowany solver); deklaracja wyłącznie dla konfiguracji zadeklarowanej."""
    assert POZIOMY_DOPUSZCZALNE_DLA_TWIERDZENIA == {
        ClaimKind.DYNAMIC_PERFORMANCE: frozenset(
            {EvidenceTier.VALIDATED_SIMULATION, EvidenceTier.TYPE_TEST_CERTIFICATE}
        ),
        ClaimKind.DECLARED_CONFIGURATION: frozenset(
            {
                EvidenceTier.VALIDATED_SIMULATION,
                EvidenceTier.TYPE_TEST_CERTIFICATE,
                EvidenceTier.DECLARATION,
            }
        ),
        ClaimKind.STATIC_CALCULATION: frozenset({EvidenceTier.VALIDATED_SIMULATION}),
    }
    for poziom in EvidenceTier:
        assert poziom.regulatory_evidence_eligible == any(
            poziom in POZIOMY_DOPUSZCZALNE_DLA_TWIERDZENIA[t]
            for t in (ClaimKind.DYNAMIC_PERFORMANCE, ClaimKind.STATIC_CALCULATION)
        ), poziom
