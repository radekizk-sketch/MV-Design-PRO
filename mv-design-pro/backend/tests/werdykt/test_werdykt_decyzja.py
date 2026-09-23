"""Reguły werdyktu: K (§2.2), W (§2.3), kompletność dowodu (§3), margines i skala (§2.4).

Intencja: reguły są sprawdzane NIEZALEŻNĄ wyrocznią napisaną wprost z tekstu kontraktu na
iloczynie cech (stosowalność × metoda dopuszczalna × wynik × stan źródła × znak marginesu ×
niepewność × relacja; dla W: stosowalność × sposób wykazania × zestaw statusów składowych ×
kompletność × pokrycie programu), a nie na przykładach z karty. Testy mutacyjne (T19) podmieniają
kolejność PRAWDZIWYCH kroków reguły (krotki ``_KROKI_REGULY_K`` / ``_KROKI_REGULY_W``)
i wymagają, żeby ten sam iloczyn cech wykrył każdą zmianę kolejności, która zmienia znaczenie
reguły — m.in. sprawdzenie marginesu przed stosowalnością, podstawy przed brakiem biegu,
``BRAK_METODY`` po ``NIE_OCENIONO``.
"""

from __future__ import annotations

import itertools
import math
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from typing import get_args

import pytest
from solver_input.provenance import ClaimKind, EvidenceTier
from werdykt import (
    KompletnoscDowodu,
    MetodaDowodu,
    OcenaKryterium,
    PokrycieProgramu,
    Relacja,
    StanDanych,
    StanZrodla,
    StatusModelu,
    StatusWerdyktu,
    decyzja,
    kompletnosc_dowodu,
    margines,
    metody_dopuszczalne,
    status_kryterium,
    status_wymagania,
)
from werdykt.wyjasnienie import format_wielkosc, nazwa_skladowej

from tests.werdykt import fabryki as f

METODY: tuple[MetodaDowodu, ...] = get_args(MetodaDowodu)
STATUSY_MODELU: tuple[StatusModelu, ...] = get_args(StatusModelu)

# ---------------------------------------------------------------------------
# Reguła K — wyrocznia i iloczyn cech
# ---------------------------------------------------------------------------

#: Stan podstawy w iloczynie: trzy stany źródła i brak limitu (relacje liczbowe).
PODSTAWY_K: tuple[str, ...] = ("ZWERYFIKOWANE", "WSKAZANE", "NIEUSTALONE", "BRAK_LIMITU")
#: Stan źródła podstawy odpowiadający pozycji iloczynu (brak limitu — podstawa zweryfikowana).
STAN_PODSTAWY: dict[str, StanZrodla] = {
    "ZWERYFIKOWANE": "ZWERYFIKOWANE",
    "WSKAZANE": "WSKAZANE",
    "NIEUSTALONE": "NIEUSTALONE",
    "BRAK_LIMITU": "ZWERYFIKOWANE",
}
NIEPEWNOSCI: tuple[str, ...] = ("brak", "mala", "rowna", "duza")
PREFIKS_BRAKU = {
    "metoda": "Metoda dowodu właściwa",
    "wynik": "Wynik wielkości ocenianej",
    "limit": "Limit kryterium",
    "podstawa_limitu": "Podstawa limitu",
    "podstawa_kryterium": "Podstawa kryterium",
    "rozstrzygniecie": "Rozstrzygnięcie wyniku",
}


@dataclass(frozen=True)
class PrzypadekK:
    relacja: Relacja
    dotyczy: bool
    dopuszczalna: bool
    jest_wynik: bool
    podstawa: str
    m: float
    stan_logiczny: bool
    niepewnosc: str

    def u(self) -> float | None:
        if self.niepewnosc == "brak":
            return None
        krok = f.KROK_MARGINESU.get(self.relacja, 1.0)
        return {"mala": abs(self.m) / 2, "rowna": abs(self.m), "duza": abs(self.m) + krok}[
            self.niepewnosc
        ]


def oczekiwany_status_k(p: PrzypadekK) -> StatusWerdyktu:
    """§2.2 wprost z tekstu kontraktu (po korekcie 2026-09-23)."""
    if not p.dotyczy:
        return "NIE_DOTYCZY"
    if not p.dopuszczalna:
        return "NIE_OCENIONO"
    if not p.jest_wynik:
        return "NIE_OCENIONO"
    if p.podstawa in ("NIEUSTALONE", "BRAK_LIMITU"):
        return "BRAK_PODSTAWY"
    if p.relacja == "LOGICZNE":
        return "SPELNIA" if p.stan_logiczny else "NIE_SPELNIA"
    u = p.u()
    if u is not None and abs(p.m) <= u:
        return "NIEJEDNOZNACZNY"
    return "SPELNIA" if p.m >= 0 else "NIE_SPELNIA"


def oczekiwane_braki_k(p: PrzypadekK) -> list[str]:
    """Rodzaje braków nazwanych po drodze — niezależnie od statusu, który wygrał."""
    if not p.dotyczy:
        return []
    rodzaje: list[str] = []
    if not p.dopuszczalna:
        rodzaje.append("metoda")
    if not p.jest_wynik:
        rodzaje.append("wynik")
    if p.relacja == "LOGICZNE":
        if p.podstawa == "NIEUSTALONE":
            rodzaje.append("podstawa_kryterium")
    elif p.podstawa == "BRAK_LIMITU":
        rodzaje.append("limit")
    elif p.podstawa == "NIEUSTALONE":
        rodzaje.append("podstawa_limitu")
    u = p.u()
    if (
        p.relacja != "LOGICZNE"
        and p.jest_wynik
        and p.podstawa != "BRAK_LIMITU"
        and u is not None
        and abs(p.m) <= u
    ):
        rodzaje.append("rozstrzygniecie")
    return rodzaje


def przypadki_k(relacje: Sequence[Relacja] = f.RELACJE) -> Iterator[PrzypadekK]:
    for relacja in relacje:
        krok = f.KROK_MARGINESU.get(relacja, 0.0)
        logiczne = relacja == "LOGICZNE"
        podstawy = PODSTAWY_K[:3] if logiczne else PODSTAWY_K
        marginesy = (0.0,) if logiczne else (krok, 0.0, -krok)
        stany = (True, False) if logiczne else (True,)
        niepewnosci = ("brak",) if logiczne else NIEPEWNOSCI
        for dotyczy, dopuszczalna, jest_wynik, podstawa, m, stan, niepewnosc in itertools.product(
            (True, False), (True, False), (True, False), podstawy, marginesy, stany, niepewnosci
        ):
            yield PrzypadekK(
                relacja, dotyczy, dopuszczalna, jest_wynik, podstawa, m, stan, niepewnosc
            )


def status_i_braki(p: PrzypadekK) -> tuple[StatusWerdyktu, list[str]]:
    logiczne = p.relacja == "LOGICZNE"
    stan_limitu = STAN_PODSTAWY[p.podstawa]
    stan_kryterium = STAN_PODSTAWY[p.podstawa] if logiczne else STAN_PODSTAWY["ZWERYFIKOWANE"]
    limit = None if (logiczne or p.podstawa == "BRAK_LIMITU") else f.limit(p.relacja, stan_limitu)
    wynik = f.wynik(p.relacja, p.m, stan_logiczny=p.stan_logiczny) if p.jest_wynik else None
    m = None
    if wynik is not None and (limit is not None or logiczne):
        m = margines(
            p.relacja,
            wynik.wartosc,
            limit,
            chwila_s=wynik.chwila_s,
            punkt_pl=wynik.punkt_krytyczny_pl,
        )
    return status_kryterium(
        dotyczy=p.dotyczy,
        relacja=p.relacja,
        podstawa=f.podstawa(stan_kryterium),
        dowod=f.dowod(
            twierdzenie=(
                ClaimKind.DECLARED_CONFIGURATION
                if p.dopuszczalna
                else ClaimKind.DYNAMIC_PERFORMANCE
            )
        ),
        limit=limit,
        wynik=wynik,
        margines=m,
        niepewnosc=f.niepewnosc(p.u(), f.JEDNOSTKA[p.relacja]),
    )


def rozbieznosci_k(relacje: Sequence[Relacja] = f.RELACJE) -> list[str]:
    bledy: list[str] = []
    for p in przypadki_k(relacje):
        status, braki = status_i_braki(p)
        oczekiwany = oczekiwany_status_k(p)
        if status != oczekiwany:
            bledy.append(f"{p}: status {status} ≠ {oczekiwany}")
        rodzaje = oczekiwane_braki_k(p)
        if len(braki) != len(rodzaje) or not all(
            b.startswith(PREFIKS_BRAKU[r]) for b, r in zip(braki, rodzaje, strict=False)
        ):
            bledy.append(f"{p}: braki {braki} ≠ rodzaje {rodzaje}")
    return bledy


@pytest.mark.parametrize("relacja", f.RELACJE)
def test_regula_k_zgodna_z_wyrocznia_na_iloczynie_cech(relacja: Relacja) -> None:
    """Stosowalność × metoda dopuszczalna × wynik × stan podstawy × znak marginesu ×
    niepewność (dla relacji logicznej: × stan logiczny) — status i braki zgodne z §2.2."""
    assert rozbieznosci_k([relacja]) == []


def _przestaw(
    kroki: Sequence[tuple[str, object]], nazwa: str, przed: str | None
) -> tuple[tuple[str, object], ...]:
    """Przenieś krok ``nazwa`` przed krok ``przed`` (``None`` — na koniec)."""
    przenoszony = next(k for k in kroki if k[0] == nazwa)
    reszta = [k for k in kroki if k[0] != nazwa]
    if przed is None:
        return (*reszta, przenoszony)
    indeks = next(i for i, k in enumerate(reszta) if k[0] == przed)
    return (*reszta[:indeks], przenoszony, *reszta[indeks:])


MUTACJE_K = [
    ("margines_przed_stosowalnoscia", "MARGINES", "STOSOWALNOSC"),
    ("podstawa_przed_brakiem_biegu", "PODSTAWA", "WYNIK"),
    ("margines_przed_brakiem_podstawy", "MARGINES", "PODSTAWA"),
    ("margines_przed_niejednoznacznoscia", "MARGINES", "NIEJEDNOZNACZNOSC"),
    ("niejednoznacznosc_przed_podstawa", "NIEJEDNOZNACZNOSC", "PODSTAWA"),
    ("metoda_po_podstawie", "METODA", "NIEJEDNOZNACZNOSC"),
    ("stosowalnosc_na_koncu", "STOSOWALNOSC", None),
    ("podstawa_przed_metoda", "PODSTAWA", "METODA"),
]


@pytest.mark.parametrize("nazwa, krok, przed", MUTACJE_K, ids=[m[0] for m in MUTACJE_K])
def test_t19_mutacja_kolejnosci_reguly_k_jest_wykrywana(
    monkeypatch: pytest.MonkeyPatch, nazwa: str, krok: str, przed: str | None
) -> None:
    """Zmiana kolejności kroków reguły K musi zapalić iloczyn cech (T19)."""
    zmutowane = _przestaw(decyzja._KROKI_REGULY_K, krok, przed)
    assert [k[0] for k in zmutowane] != [k[0] for k in decyzja._KROKI_REGULY_K]
    monkeypatch.setattr(decyzja, "_KROKI_REGULY_K", zmutowane)
    assert rozbieznosci_k() != [], f"mutacja {nazwa} niewykryta"


# ---------------------------------------------------------------------------
# T11 — |m| ≤ u na granicy i tuż za nią
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("znak", [1.0, -1.0])
@pytest.mark.parametrize("relacja", f.RELACJE_LICZBOWE)
def test_t11_granica_niejednoznacznosci(relacja: Relacja, znak: float) -> None:
    """|m| = u → NIEJEDNOZNACZNY także dla m ≥ 0; u tuż poniżej |m| → werdykt ze znaku m."""
    krok = f.KROK_MARGINESU[relacja]
    m = znak * krok
    for u, oczekiwany in (
        (krok, "NIEJEDNOZNACZNY"),
        (math.nextafter(krok, 0.0), "SPELNIA" if znak > 0 else "NIE_SPELNIA"),
    ):
        rekord = f.ocena(relacja, m=m, u=u)
        assert rekord.status_maszynowy == oczekiwany, (u, rekord.margines)


@pytest.mark.parametrize("relacja", f.RELACJE_LICZBOWE)
def test_t11_margines_zerowy_przy_zerowej_niepewnosci_jest_niejednoznaczny(
    relacja: Relacja,
) -> None:
    assert f.ocena(relacja, m=0.0, u=0.0).status_maszynowy == "NIEJEDNOZNACZNY"
    assert f.ocena(relacja, m=0.0).status_maszynowy == "SPELNIA"


# ---------------------------------------------------------------------------
# T14 — metoda niedopuszczalna dla rodzaju twierdzenia
# ---------------------------------------------------------------------------


def test_metody_dopuszczalne_dokladnie_wg_korekty() -> None:
    assert metody_dopuszczalne(ClaimKind.DYNAMIC_PERFORMANCE) == frozenset(
        {"SYMULACJA", "RAPORT_Z_TESTU", "POMIAR", "CERTYFIKAT", "DOWOD_LACZONY"}
    )
    assert metody_dopuszczalne(ClaimKind.DECLARED_CONFIGURATION) == frozenset(
        {
            "DEKLARACJA",
            "OBLICZENIE",
            "CERTYFIKAT",
            "RAPORT_Z_TESTU",
            "POMIAR",
            "OCENA_OPERATORA",
            "DOWOD_LACZONY",
        }
    )
    for twierdzenie in ClaimKind:
        assert "BRAK_METODY" not in metody_dopuszczalne(twierdzenie)


@pytest.mark.parametrize("stan_limitu", f.STANY_ZRODLA)
@pytest.mark.parametrize("znak", [1.0, -1.0])
@pytest.mark.parametrize("relacja", f.RELACJE)
def test_t14_deklaracja_zachowania_dynamicznego_nie_daje_werdyktu_mimo_wyniku(
    relacja: Relacja, znak: float, stan_limitu: StanZrodla
) -> None:
    """Porównanie deklaracji nigdy nie daje SPELNIA ani NIE_SPELNIA dla zachowania
    dynamicznego: status NIE_OCENIONO, wynik i margines zostają informacyjnie."""
    krok = f.KROK_MARGINESU.get(relacja, 0.0)
    rekord = f.ocena(
        relacja,
        m=znak * krok,
        stan_logiczny=znak > 0,
        stan_limitu=stan_limitu,
        dowod_oceny=f.dowod(twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE),
    )
    assert rekord.status_maszynowy == "NIE_OCENIONO"
    assert rekord.wynik is not None and rekord.margines is not None
    assert rekord.wyjasnienie.czego_brakuje[0].startswith(PREFIKS_BRAKU["metoda"])


@pytest.mark.parametrize("metoda", METODY)
@pytest.mark.parametrize("twierdzenie", list(ClaimKind))
def test_t14_kazda_metoda_spoza_dopuszczalnych_daje_nie_ocenione(
    twierdzenie: ClaimKind, metoda: MetodaDowodu
) -> None:
    status, braki = status_kryterium(
        dotyczy=True,
        relacja="LOGICZNE",
        podstawa=f.podstawa(),
        dowod=f.dowod(metoda=metoda, twierdzenie=twierdzenie),
        limit=None,
        wynik=f.wynik("LOGICZNE"),
        margines=margines("LOGICZNE", f.wielkosc(1.0, "1"), None),
        niepewnosc=f.niepewnosc(None),
    )
    if metoda in metody_dopuszczalne(twierdzenie):
        assert status == "SPELNIA" and braki == []
    else:
        assert status == "NIE_OCENIONO"
        assert braki[0].startswith(PREFIKS_BRAKU["metoda"])


# ---------------------------------------------------------------------------
# Spójność wejścia reguły K
# ---------------------------------------------------------------------------


def test_regula_k_odrzuca_brak_marginesu_przy_wyniku_i_limicie() -> None:
    with pytest.raises(ValueError, match="margines skalarny"):
        status_kryterium(
            dotyczy=True,
            relacja="NIE_WIECEJ",
            podstawa=f.podstawa(),
            dowod=f.dowod(),
            limit=f.limit("NIE_WIECEJ"),
            wynik=f.wynik("NIE_WIECEJ"),
            margines=None,
            niepewnosc=f.niepewnosc(None),
        )


def test_regula_k_odrzuca_niepewnosc_w_innej_jednostce_niz_margines() -> None:
    wynik = f.wynik("NIE_WIECEJ")
    limit = f.limit("NIE_WIECEJ")
    with pytest.raises(ValueError, match="bez konwersji"):
        status_kryterium(
            dotyczy=True,
            relacja="NIE_WIECEJ",
            podstawa=f.podstawa(),
            dowod=f.dowod(),
            limit=limit,
            wynik=wynik,
            margines=margines("NIE_WIECEJ", wynik.wartosc, limit),
            niepewnosc=f.niepewnosc(1.0, "s"),
        )


# ---------------------------------------------------------------------------
# Margines i skala (§2.4, T20)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("m", [2.0, 0.0, -2.0, 0.5, -0.125])
@pytest.mark.parametrize("relacja", f.RELACJE_LICZBOWE)
def test_margines_wg_definicji_relacji(relacja: Relacja, m: float) -> None:
    wynik = f.wynik(relacja, m)
    wynik_marginesu = margines(
        relacja, wynik.wartosc, f.limit(relacja), chwila_s=wynik.chwila_s, punkt_pl="P"
    )
    assert wynik_marginesu.wartosc is not None
    assert wynik_marginesu.wartosc.wartosc == m
    assert wynik_marginesu.wartosc.jednostka == f.JEDNOSTKA[relacja]
    assert wynik_marginesu.definicja_latex and wynik_marginesu.punkt_pl == "P"
    assert wynik_marginesu.skala_rodzaj == "LIMIT"


@pytest.mark.parametrize(
    "x, m, granica",
    [
        (51.5, 0.5, 52.0),
        (48.5, 0.5, 48.0),
        (50.0, 2.0, 48.0),
        (47.0, -1.0, 48.0),
        (53.0, -1.0, 52.0),
    ],
)
def test_margines_pasma_wobec_blizszej_granicy(x: float, m: float, granica: float) -> None:
    """Pasmo: m = min(x − dolna, górna − x); skala = |granica bliższa|, remis → dolna."""
    wynik_marginesu = margines("PASMO", f.wielkosc(x, "Hz"), f.limit("PASMO"))
    assert wynik_marginesu.wartosc is not None and wynik_marginesu.wartosc.wartosc == m
    assert wynik_marginesu.skala == f.wielkosc(granica, "Hz")
    assert wynik_marginesu.wzgledny == m / granica


@pytest.mark.parametrize("tolerancja", [None, 1.0])
@pytest.mark.parametrize("granica", [40.0, 0.0])
@pytest.mark.parametrize("u", [None, 0.0, 0.5])
def test_t20_skala_tolerancja_przed_limitem_przed_niepewnoscia(
    tolerancja: float | None, granica: float, u: float | None
) -> None:
    """Pierwszeństwo skali: TOLERANCJA > LIMIT (|limit| ≠ 0) > NIEPEWNOSC (u > 0) > brak."""
    m = 2.0
    limit = f.limit("NIE_WIECEJ", wartosc_limitu=granica)
    wynik = f.wielkosc(granica - m, "ms")
    wynik_marginesu = margines(
        "NIE_WIECEJ",
        wynik,
        limit,
        tolerancja=None if tolerancja is None else f.wielkosc(tolerancja, "ms"),
        niepewnosc=None if u is None else f.wielkosc(u, "ms"),
    )
    if tolerancja is not None:
        oczekiwany_rodzaj, skala = "TOLERANCJA", tolerancja
    elif granica != 0.0:
        oczekiwany_rodzaj, skala = "LIMIT", abs(granica)
    elif u is not None and u > 0.0:
        oczekiwany_rodzaj, skala = "NIEPEWNOSC", u
    else:
        oczekiwany_rodzaj, skala = None, None
    assert wynik_marginesu.skala_rodzaj == oczekiwany_rodzaj
    assert wynik_marginesu.wzgledny == (None if skala is None else m / skala)


@pytest.mark.parametrize(
    "tolerancja, niepewnosc, fragment",
    [
        ((0.0, "ms"), None, "dodatnia"),
        ((-1.0, "ms"), None, "dodatnia"),
        ((1.0, "s"), None, "tolerancji"),
        (None, (1.0, "s"), "niepewności"),
    ],
)
def test_t20_skala_niespojna_jest_bledem(
    tolerancja: tuple[float, str] | None, niepewnosc: tuple[float, str] | None, fragment: str
) -> None:
    with pytest.raises(ValueError, match=fragment):
        margines(
            "NIE_WIECEJ",
            f.wielkosc(38.0, "ms"),
            f.limit("NIE_WIECEJ"),
            tolerancja=None if tolerancja is None else f.wielkosc(*tolerancja),
            niepewnosc=None if niepewnosc is None else f.wielkosc(*niepewnosc),
        )


def test_margines_ze_skala_tolerancji_w_rekordzie() -> None:
    """Tolerancja z profilu przechodzi do rekordu jako skala i walidator ją odtwarza."""
    rekord = f.ocena(tolerancja=f.wielkosc(8.0, "ms"))
    assert rekord.margines is not None
    assert rekord.margines.skala_rodzaj == "TOLERANCJA" and rekord.margines.wzgledny == 0.25


@pytest.mark.parametrize(
    "relacja, limit_relacji, chwila_s, tolerancja, fragment",
    [
        ("LOGICZNE", "NIE_WIECEJ", None, None, "logiczne"),
        ("LOGICZNE", None, None, 1.0, "logiczne"),
        ("NIE_WIECEJ", None, None, None, "wymaga limitu"),
        ("NIE_WIECEJ", "PASMO", None, None, "wartości"),
        ("PASMO", "NIE_WIECEJ", None, None, "pasma"),
        ("OBWIEDNIA_DOLNA", "NIE_WIECEJ", None, None, "obwiedni"),
        ("OBWIEDNIA_DOLNA", "OBWIEDNIA_DOLNA", None, None, "chwili"),
        ("OBWIEDNIA_DOLNA", "OBWIEDNIA_DOLNA", 3.0, None, "ekstrapolacja"),
    ],
)
def test_margines_odrzuca_wejscie_niespojne(
    relacja: Relacja,
    limit_relacji: Relacja | None,
    chwila_s: float | None,
    tolerancja: float | None,
    fragment: str,
) -> None:
    limit = None if limit_relacji is None else f.limit(limit_relacji)
    jednostka = limit.jednostka if limit is not None else f.JEDNOSTKA[relacja]
    with pytest.raises(ValueError, match=fragment):
        margines(
            relacja,
            f.wielkosc(1.0, jednostka),
            limit,
            chwila_s=chwila_s,
            tolerancja=None if tolerancja is None else f.wielkosc(tolerancja, jednostka),
        )


@pytest.mark.parametrize("relacja", f.RELACJE_LICZBOWE)
def test_margines_nigdy_nie_konwertuje_jednostek(relacja: Relacja) -> None:
    with pytest.raises(ValueError, match="bez konwersji"):
        margines(relacja, f.wielkosc(1.0, "kV"), f.limit(relacja), chwila_s=0.5)


def test_margines_logiczny_jest_niedefiniowalny_z_powodem() -> None:
    wynik_marginesu = margines("LOGICZNE", f.wielkosc(1.0, "1"), None, punkt_pl="stan")
    assert wynik_marginesu.niedefiniowalny and wynik_marginesu.powod_pl
    assert wynik_marginesu.wartosc is None and wynik_marginesu.wzgledny is None


# ---------------------------------------------------------------------------
# Kompletność dowodu (§3, T6, T7)
# ---------------------------------------------------------------------------


def przydatnosc_wg_kontraktu(
    metoda: MetodaDowodu, poziom: EvidenceTier, twierdzenie: ClaimKind, model: StatusModelu
) -> bool:
    if metoda in ("CERTYFIKAT", "RAPORT_Z_TESTU", "POMIAR"):
        return True
    if metoda == "SYMULACJA":
        return poziom is EvidenceTier.VALIDATED_SIMULATION and model in (
            "VALIDATED_AGAINST_TEST",
            "CERTIFIED_MODEL",
        )
    return twierdzenie is ClaimKind.DECLARED_CONFIGURATION and metoda == "DEKLARACJA"


@pytest.mark.parametrize("metoda", METODY)
def test_przydatnosc_dowodowa_na_iloczynie_cech(metoda: MetodaDowodu) -> None:
    """Metoda × poziom zdolności × rodzaj twierdzenia × status modelu (9 × 4 × 2 × 4)."""
    for poziom, twierdzenie, model in itertools.product(EvidenceTier, ClaimKind, STATUSY_MODELU):
        dowod = f.dowod(metoda=metoda, poziom=poziom, twierdzenie=twierdzenie, status_modelu=model)
        assert dowod.przydatnosc_dowodowa == przydatnosc_wg_kontraktu(
            metoda, poziom, twierdzenie, model
        ), (poziom, twierdzenie, model)


@pytest.mark.parametrize("stan_podstawy", f.STANY_ZRODLA)
@pytest.mark.parametrize("metoda", METODY)
def test_kompletnosc_dowodu_na_iloczynie_cech(
    metoda: MetodaDowodu, stan_podstawy: StanZrodla
) -> None:
    """Metoda × poziom × twierdzenie × status modelu × stan danych × stan podstawy: PEŁNY
    wyłącznie przy komplecie warunków §3; każdy NIEPEŁNY niesie konkretne powody (T6, T7)."""
    podstawa = f.podstawa(stan_podstawy)
    for poziom, twierdzenie, model, stan_danych in itertools.product(
        EvidenceTier, ClaimKind, STATUSY_MODELU, f.STANY_DANYCH
    ):
        dowod = f.dowod(
            metoda=metoda,
            poziom=poziom,
            twierdzenie=twierdzenie,
            status_modelu=model,
            stan_danych=stan_danych,
        )
        kompletnosc, powody = kompletnosc_dowodu(dowod, [podstawa])
        pelny = (
            przydatnosc_wg_kontraktu(metoda, poziom, twierdzenie, model)
            and model != "UNVALIDATED_MODEL"
            and stan_danych == "ZWALIDOWANE"
            and stan_podstawy != "NIEUSTALONE"
        )
        opis = (poziom, twierdzenie, model, stan_danych)
        assert kompletnosc == ("PELNY" if pelny else "NIEPELNY"), opis
        assert bool(powody) == (not pelny), opis
        if model == "UNVALIDATED_MODEL":
            assert any("UNVALIDATED_MODEL" in p for p in powody), opis
        if stan_danych == "UNVALIDATED_INPUT":
            assert any("moc zwarciowa sieci" in p and "120 MVA" in p for p in powody), opis
        if stan_podstawy == "NIEUSTALONE":
            assert any(podstawa.dokument in p for p in powody), opis
        if metoda == "SYMULACJA" and not poziom.regulatory_evidence_eligible:
            assert any(poziom.value in p for p in powody), opis
        assert len(set(powody)) == len(powody), opis


@pytest.mark.parametrize("stan_kryterium", f.STANY_ZRODLA)
@pytest.mark.parametrize("stan_limitu", f.STANY_ZRODLA)
def test_kompletnosc_kryterium_obejmuje_podstawe_kryterium_i_limitu(
    stan_kryterium: StanZrodla, stan_limitu: StanZrodla
) -> None:
    rekord = f.ocena(stan_kryterium=stan_kryterium, stan_limitu=stan_limitu)
    pelny = "NIEUSTALONE" not in (stan_kryterium, stan_limitu)
    assert rekord.kompletnosc_dowodu == ("PELNY" if pelny else "NIEPELNY")


def test_kompletnosc_kryterium_niestosowalnego_nie_dotyczy() -> None:
    rekord = f.ocena(dotyczy=False, stan_limitu="NIEUSTALONE")
    assert (rekord.kompletnosc_dowodu, rekord.powody_niepelnosci) == ("NIE_DOTYCZY", ())


@pytest.mark.parametrize("model", STATUSY_MODELU)
@pytest.mark.parametrize("stan_danych", f.STANY_DANYCH)
def test_t6_t7_wymaganie_dziedziczy_niepelnosc_skladowych(
    model: StatusModelu, stan_danych: StanDanych
) -> None:
    """Model niezwalidowany albo dana przyjęta w którymkolwiek składniku wpływa na wynik
    wymagania: kompletność wymagania NIEPEŁNA, powód z nazwą składnika (T6, T7 na W)."""
    skladowa = f.ocena(
        dowod_oceny=f.dowod_symulacji(status_modelu=model, stan_danych=stan_danych),
        metoda_wyniku="SYMULACJA",
        u=0.5,
    )
    rekord = f.wymaganie([skladowa, f.ocena("PASMO")], sposob="SYMULACJA")
    pelny_skladnik = model in ("VALIDATED_AGAINST_TEST", "CERTIFIED_MODEL") and (
        stan_danych == "ZWALIDOWANE"
    )
    assert skladowa.kompletnosc_dowodu == ("PELNY" if pelny_skladnik else "NIEPELNY")
    assert rekord.kompletnosc_dowodu == skladowa.kompletnosc_dowodu
    assert rekord.status_maszynowy == ("SPELNIA" if pelny_skladnik else "BRAK_DOWODU")
    for powod in skladowa.powody_niepelnosci:
        assert f"{nazwa_skladowej(skladowa)}: {powod}" in rekord.powody_niepelnosci


def test_dowod_laczony_wymaga_przydatnych_skladowych() -> None:
    """Dowód łączony jest pełny, gdy każdy stosowalny składnik ma dowód przydatny; składnik
    z deklaracją zachowania dynamicznego czyni go niepełnym; bez składników — niepełny."""
    certyfikat = f.ocena(
        "LOGICZNE",
        kryterium_id="certyfikat",
        metoda_wyniku="CERTYFIKAT",
        dowod_oceny=f.dowod(metoda="CERTYFIKAT", twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE),
    )
    pelny = f.wymaganie([certyfikat, f.ocena()], sposob="DOWOD_LACZONY")
    assert (pelny.kompletnosc_dowodu, pelny.status_maszynowy) == ("PELNY", "SPELNIA")
    deklaracja_dynamiki = f.ocena(
        kryterium_id="dynamika", dowod_oceny=f.dowod(twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE)
    )
    niepelny = f.wymaganie([certyfikat, deklaracja_dynamiki], sposob="DOWOD_LACZONY")
    assert niepelny.kompletnosc_dowodu == "NIEPELNY"
    assert niepelny.status_maszynowy == "NIE_OCENIONO"
    bez_skladowych = decyzja.kompletnosc_wymagania(
        dotyczy=True,
        dowod=f.dowod(metoda="DOWOD_LACZONY", twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE),
        podstawa=f.podstawa(),
        oceny=[f.ocena(dotyczy=False)],
    )
    assert bez_skladowych[0] == "NIEPELNY"
    assert any("Dowód łączony" in p for p in bez_skladowych[1])


@pytest.mark.parametrize("stan_podstawy", f.STANY_ZRODLA)
def test_podstawa_wymagania_nieustalona_daje_niepelny_dowod(stan_podstawy: StanZrodla) -> None:
    rekord = f.wymaganie([f.ocena()], stan_podstawy=stan_podstawy)
    oczekiwany: KompletnoscDowodu = "NIEPELNY" if stan_podstawy == "NIEUSTALONE" else "PELNY"
    assert rekord.kompletnosc_dowodu == oczekiwany
    assert rekord.status_maszynowy == ("BRAK_DOWODU" if oczekiwany == "NIEPELNY" else "SPELNIA")


# ---------------------------------------------------------------------------
# Reguła W — wyrocznia i iloczyn cech
# ---------------------------------------------------------------------------

STATUSY_SKLADOWYCH: tuple[StatusWerdyktu, ...] = (
    "SPELNIA",
    "NIE_SPELNIA",
    "NIEJEDNOZNACZNY",
    "NIE_OCENIONO",
    "BRAK_PODSTAWY",
    "NIE_DOTYCZY",
)


def _skladowa(status: StatusWerdyktu, pozycja: int) -> OcenaKryterium:
    kryterium_id = f"k{pozycja}.{status.lower()}"
    relacja: Relacja = "NIE_WIECEJ" if pozycja == 0 else "PASMO"
    krok = f.KROK_MARGINESU[relacja]
    if status == "SPELNIA":
        return f.ocena(relacja, kryterium_id=kryterium_id)
    if status == "NIE_SPELNIA":
        return f.ocena(relacja, kryterium_id=kryterium_id, m=-krok)
    if status == "NIEJEDNOZNACZNY":
        return f.ocena(relacja, kryterium_id=kryterium_id, u=krok)
    if status == "NIE_OCENIONO":
        return f.ocena(relacja, kryterium_id=kryterium_id, jest_wynik=False)
    if status == "BRAK_PODSTAWY":
        return f.ocena(relacja, kryterium_id=kryterium_id, stan_limitu="NIEUSTALONE")
    return f.ocena(relacja, kryterium_id=kryterium_id, dotyczy=False)


SKLADOWE = {(s, i): _skladowa(s, i) for s in STATUSY_SKLADOWYCH for i in (0, 1)}
SPOSOBY_W: tuple[MetodaDowodu, ...] = ("BRAK_METODY", "DEKLARACJA")
KOMPLETNOSCI_W: tuple[KompletnoscDowodu, ...] = ("PELNY", "NIEPELNY")
POKRYCIA_W: tuple[PokrycieProgramu, ...] = ("PELNE", "CZESCIOWE", "NIE_DOTYCZY")
ZESTAWY_SKLADOWYCH: list[tuple[StatusWerdyktu, ...]] = [
    zestaw
    for rozmiar in (0, 1, 2)
    for zestaw in itertools.combinations_with_replacement(STATUSY_SKLADOWYCH, rozmiar)
]


def oczekiwany_status_w(
    dotyczy: bool,
    sposob: MetodaDowodu,
    statusy: Sequence[StatusWerdyktu],
    kompletnosc: KompletnoscDowodu,
    pokrycie: PokrycieProgramu,
) -> StatusWerdyktu:
    """§2.3 po korekcie 2026-09-23, wprost z tekstu."""
    if not dotyczy:
        return "NIE_DOTYCZY"
    if sposob == "BRAK_METODY":
        return "BRAK_DOWODU"
    if all(s == "NIE_DOTYCZY" for s in statusy):
        return "NIE_OCENIONO"
    if "NIE_SPELNIA" in statusy:
        return "NIE_SPELNIA"
    if "NIEJEDNOZNACZNY" in statusy:
        return "NIEJEDNOZNACZNY"
    if "NIE_OCENIONO" in statusy:
        return "NIE_OCENIONO"
    if "BRAK_PODSTAWY" in statusy:
        return "BRAK_PODSTAWY"
    if pokrycie == "CZESCIOWE":
        return "BRAK_DOWODU"
    if kompletnosc != "PELNY":
        return "BRAK_DOWODU"
    return "SPELNIA"


def rozbieznosci_w() -> list[str]:
    bledy: list[str] = []
    for zestaw in ZESTAWY_SKLADOWYCH:
        oceny = [SKLADOWE[(s, i)] for i, s in enumerate(zestaw)]
        for dotyczy, sposob, kompletnosc, pokrycie in itertools.product(
            (True, False), SPOSOBY_W, KOMPLETNOSCI_W, POKRYCIA_W
        ):
            status, naruszone, najblizej = status_wymagania(
                dotyczy=dotyczy,
                sposob_wykazania=sposob,
                oceny=oceny,
                kompletnosc=kompletnosc,
                pokrycie_programu=pokrycie,
            )
            oczekiwany = oczekiwany_status_w(dotyczy, sposob, zestaw, kompletnosc, pokrycie)
            opis = (zestaw, dotyczy, sposob, kompletnosc, pokrycie)
            if status != oczekiwany:
                bledy.append(f"{opis}: status {status} ≠ {oczekiwany}")
            oczekiwane_naruszone = (
                [o.kryterium_id for o in oceny if o.status_maszynowy == "NIE_SPELNIA"]
                if oczekiwany == "NIE_SPELNIA"
                else []
            )
            if naruszone != oczekiwane_naruszone:
                bledy.append(f"{opis}: naruszone {naruszone} ≠ {oczekiwane_naruszone}")
            if oczekiwany == "SPELNIA":
                kandydaci = sorted(
                    (o.margines.wzgledny, o.kryterium_id)
                    for o in oceny
                    if o.status_maszynowy == "SPELNIA"
                    and o.margines is not None
                    and o.margines.wzgledny is not None
                )
                if najblizej != (kandydaci[0][1] if kandydaci else None):
                    bledy.append(f"{opis}: najbliżej {najblizej}")
            elif najblizej is not None:
                bledy.append(f"{opis}: najbliżej {najblizej} poza SPELNIA")
    return bledy


def test_regula_w_zgodna_z_wyrocznia_na_iloczynie_cech() -> None:
    """Stosowalność × sposób wykazania × każdy zestaw statusów składowych (0–2 składniki,
    z powtórzeniami) × kompletność × pokrycie programu — status, naruszone i najbliższe
    granicy zgodne z §2.3."""
    assert rozbieznosci_w() == []


MUTACJE_W = [
    ("brak_metody_po_nie_ocenionym", "BRAK_METODY", "BRAK_PODSTAWY"),
    ("brak_metody_po_skladowych_nie_dotyczacych", "BRAK_METODY", "NARUSZENIE"),
    ("skladowe_nie_dotyczace_na_koncu", "SKLADOWE_NIE_DOTYCZA", None),
    ("kompletnosc_przed_naruszeniem", "KOMPLETNOSC", "NARUSZENIE"),
    ("pokrycie_przed_naruszeniem", "POKRYCIE", "NARUSZENIE"),
    ("niejednoznacznosc_przed_naruszeniem", "NIEJEDNOZNACZNOSC", "NARUSZENIE"),
    ("brak_podstawy_przed_nieocenionymi", "BRAK_PODSTAWY", "NIEOCENIONE"),
    ("stosowalnosc_na_koncu", "STOSOWALNOSC", None),
    ("spelnienie_przed_kompletnoscia", "SPELNIENIE", "KOMPLETNOSC"),
]


@pytest.mark.parametrize("nazwa, krok, przed", MUTACJE_W, ids=[m[0] for m in MUTACJE_W])
def test_t19_mutacja_kolejnosci_reguly_w_jest_wykrywana(
    monkeypatch: pytest.MonkeyPatch, nazwa: str, krok: str, przed: str | None
) -> None:
    """Zmiana kolejności kroków agregacji W musi zapalić iloczyn cech (T19)."""
    zmutowane = _przestaw(decyzja._KROKI_REGULY_W, krok, przed)
    assert [k[0] for k in zmutowane] != [k[0] for k in decyzja._KROKI_REGULY_W]
    monkeypatch.setattr(decyzja, "_KROKI_REGULY_W", zmutowane)
    assert rozbieznosci_w() != [], f"mutacja {nazwa} niewykryta"


# ---------------------------------------------------------------------------
# T8, T9, T16, T18, T5 na rekordach W
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "relacje_naruszone",
    [relacje for rozmiar in (1, 2, 3) for relacje in itertools.combinations(f.RELACJE, rozmiar)],
    ids=lambda r: "+".join(r),
)
def test_t8_wszystkie_naruszone_skladowe_nazwane_z_marginesem(
    relacje_naruszone: tuple[Relacja, ...],
) -> None:
    """1–3 naruszone składniki dowolnych relacji obok składnika spełnionego:
    ``kryteria_naruszone`` = WSZYSTKIE, każdy nazwany w zdaniu z marginesem (liczbowe) albo
    stanem (logiczne)."""
    naruszone = [
        f.ocena(
            relacja,
            kryterium_id=f"n{i}.{relacja.lower()}",
            m=-f.KROK_MARGINESU.get(relacja, 0.0),
            stan_logiczny=False,
            nazwa_przedmiotu=f"Moduł {i}",
        )
        for i, relacja in enumerate(relacje_naruszone)
    ]
    spelniona = f.ocena("NIE_MNIEJ", kryterium_id="s.spelniona", nazwa_przedmiotu="Moduł S")
    rekord = f.wymaganie([*naruszone, spelniona])
    assert rekord.status_maszynowy == "NIE_SPELNIA"
    assert rekord.kryteria_naruszone == tuple(o.kryterium_id for o in naruszone)
    zdanie = rekord.wyjasnienie.zdanie_pl
    for ocena in naruszone:
        assert nazwa_skladowej(ocena) in zdanie
        if ocena.margines is not None and ocena.margines.wartosc is not None:
            assert format_wielkosc(ocena.margines.wartosc, znak=True) in zdanie
        else:
            assert ocena.wynik is not None and str(ocena.wynik.punkt_krytyczny_pl) in zdanie
    assert nazwa_skladowej(spelniona) in zdanie


def test_t9_najblizej_granicy_z_marginesu_wzglednego_logiczne_nie_uczestnicza() -> None:
    skladowe = [
        f.ocena("NIE_WIECEJ", kryterium_id="a", m=2.0),  # 2/40 = 0,05
        f.ocena("PASMO", kryterium_id="b", m=0.5),  # 0,5/48 ≈ 0,0104
        f.ocena("OBWIEDNIA_DOLNA", kryterium_id="c", m=0.125),  # 0,125/0,5 = 0,25
        f.ocena("LOGICZNE", kryterium_id="0.logiczne"),
    ]
    rekord = f.wymaganie(skladowe)
    assert rekord.status_maszynowy == "SPELNIA"
    assert rekord.kryterium_najblizej_granicy == "b"
    assert nazwa_skladowej(skladowe[1]) in str(rekord.wyjasnienie.przyczyna_pl)


def test_t9_remis_marginesu_wzglednego_rozstrzyga_mniejszy_identyfikator() -> None:
    skladowe = [
        f.ocena("NIE_WIECEJ", kryterium_id="z.drugi", nazwa_przedmiotu="Moduł 2"),
        f.ocena("NIE_WIECEJ", kryterium_id="a.pierwszy", nazwa_przedmiotu="Moduł 1"),
    ]
    assert f.wymaganie(skladowe).kryterium_najblizej_granicy == "a.pierwszy"
    assert f.wymaganie(list(reversed(skladowe))).kryterium_najblizej_granicy == "a.pierwszy"


def test_t9_skladnik_bez_skali_nie_uczestniczy() -> None:
    """Limit zerowy bez tolerancji i niepewności → margines względny None → poza wyborem;
    ten sam limit z oszacowaną niepewnością → skala NIEPEWNOSC w rekordzie (T20)."""
    limit_zerowy = f.limit("NIE_WIECEJ", wartosc_limitu=0.0)
    assert limit_zerowy is not None
    zerowy = decyzja.ocen_kryterium(
        kryterium_id="a.zero",
        przedmiot=f.przedmiot(),
        kryterium=f.kryterium("NIE_WIECEJ"),
        podstawa=f.podstawa(),
        stosowalnosc=f.stosowalnosc(),
        wynik=f.wynik("NIE_WIECEJ", 40.0),
        limit=limit_zerowy,
        niepewnosc=f.niepewnosc(None),
        dowod=f.dowod(),
        zakres_waznosci=f.zakres(),
        slad=f.slad(),
    )
    assert zerowy.margines is not None and zerowy.margines.wzgledny is None
    rekord = f.wymaganie([zerowy, f.ocena("PASMO", kryterium_id="b")])
    assert rekord.kryterium_najblizej_granicy == "b"
    ze_skala_niepewnosci = OcenaKryterium.model_validate(
        {
            **zerowy.model_dump(mode="json"),
            "niepewnosc": f.niepewnosc(0.5, "ms").model_dump(mode="json"),
            "margines": margines(
                "NIE_WIECEJ",
                f.wielkosc(0.0, "ms"),
                limit_zerowy,
                niepewnosc=f.wielkosc(0.5, "ms"),
            ).model_dump(mode="json"),
            "status_maszynowy": "NIEJEDNOZNACZNY",
            "etykieta": {
                "etykieta_pl": "Wynik niejednoznaczny — wymaga weryfikacji",
                "semantyka": "ostrzegawcza",
            },
            "wyjasnienie": {
                **zerowy.wyjasnienie.model_dump(mode="json"),
                "przyczyna_pl": "|m| = 0 ms nie przekracza niepewności u = 0,5 ms",
                "czego_brakuje": [
                    "Rozstrzygnięcie wyniku: |m| = 0 ms nie przekracza niepewności u = 0,5 ms — "
                    "potrzebny wynik o mniejszej niepewności (dokładniejsze obliczenie albo "
                    "pomiar)."
                ],
            },
        }
    )
    assert ze_skala_niepewnosci.margines is not None
    assert ze_skala_niepewnosci.margines.skala_rodzaj == "NIEPEWNOSC"
    assert ze_skala_niepewnosci.margines.wzgledny == 0.0


def test_t16_sam_certyfikat_spelnia_bez_kryterium_najblizej_granicy() -> None:
    certyfikat = f.ocena(
        "LOGICZNE",
        kryterium_id="certyfikat.pokrycie",
        metoda_wyniku="CERTYFIKAT",
        dowod_oceny=f.dowod(metoda="CERTYFIKAT", twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE),
    )
    rekord = f.wymaganie([certyfikat], sposob="CERTYFIKAT")
    assert rekord.status_maszynowy == "SPELNIA"
    assert rekord.kryterium_najblizej_granicy is None
    assert "brak kryterium z marginesem względnym" in str(rekord.wyjasnienie.przyczyna_pl)


def test_t16_brak_metody_z_pustymi_skladowymi_daje_brak_dowodu() -> None:
    rekord = f.wymaganie([], sposob="BRAK_METODY")
    assert (rekord.status_maszynowy, rekord.kompletnosc_dowodu) == ("BRAK_DOWODU", "NIEPELNY")
    assert rekord.wyjasnienie.czego_brakuje


@pytest.mark.parametrize("liczba", [1, 2, 3])
def test_t16_stosowalne_wymaganie_o_samych_niestosowalnych_skladowych_nie_jest_ocenione(
    liczba: int,
) -> None:
    oceny = [f.ocena(kryterium_id=f"nd{i}", dotyczy=False) for i in range(liczba)]
    rekord = f.wymaganie(oceny)
    assert rekord.status_maszynowy == "NIE_OCENIONO"
    assert rekord.wyjasnienie.czego_brakuje


@pytest.mark.parametrize("sposob", ["SYMULACJA", "RAPORT_Z_TESTU", "DOWOD_LACZONY", "OBLICZENIE"])
@pytest.mark.parametrize("relacje", [("NIE_WIECEJ",), ("PASMO", "LOGICZNE"), f.RELACJE])
def test_t18_pokrycie_czesciowe_nigdy_nie_spelnia(
    sposob: MetodaDowodu, relacje: tuple[Relacja, ...]
) -> None:
    oceny = [f.ocena(r, kryterium_id=f"k.{r.lower()}") for r in relacje]
    rekord = f.wymaganie(oceny, sposob=sposob, pokrycie="CZESCIOWE")
    assert rekord.status_maszynowy == "BRAK_DOWODU"
    assert any("Pełne pokrycie programu badań" in b for b in rekord.wyjasnienie.czego_brakuje)


@pytest.mark.parametrize("sposob", ["SYMULACJA", "RAPORT_Z_TESTU", "DOWOD_LACZONY"])
@pytest.mark.parametrize("relacje", [("NIE_WIECEJ",), ("PASMO", "LOGICZNE"), f.RELACJE])
def test_t18_pokrycie_pelne_nie_blokuje_spelnienia(
    sposob: MetodaDowodu, relacje: tuple[Relacja, ...]
) -> None:
    oceny = [f.ocena(r, kryterium_id=f"k.{r.lower()}") for r in relacje]
    assert f.wymaganie(oceny, sposob=sposob, pokrycie="PELNE").status_maszynowy == "SPELNIA"


@pytest.mark.parametrize("twierdzenie", list(ClaimKind))
@pytest.mark.parametrize("poziom", list(EvidenceTier))
def test_obliczenie_nie_jest_dowodem_przydatnym_wg_formuly_paragrafu_3(
    twierdzenie: ClaimKind, poziom: EvidenceTier
) -> None:
    """Formuła przydatności §3 (karta pakietu A) nie obejmuje metody OBLICZENIE przy żadnym
    poziomie zdolności i rodzaju twierdzenia: wymaganie wykazywane obliczeniem ma dowód
    niepełny z nazwaną metodą (stan przypięty do czasu rozstrzygnięcia w kontrakcie)."""
    rekord = f.wymaganie(
        [f.ocena()],
        sposob="OBLICZENIE",
        pokrycie="PELNE",
        dowod_wymagania=f.dowod(metoda="OBLICZENIE", poziom=poziom, twierdzenie=twierdzenie),
    )
    assert (rekord.status_maszynowy, rekord.kompletnosc_dowodu) == ("BRAK_DOWODU", "NIEPELNY")
    assert any("„obliczenie”" in p for p in rekord.powody_niepelnosci)


def test_t5_spelnia_na_poziomie_wymagania_zawsze_z_dowodem_pelnym() -> None:
    """Na całym iloczynie składowych: wymaganie SPELNIA ⇒ kompletność PELNY."""
    for zestaw in ZESTAWY_SKLADOWYCH:
        if not zestaw:
            continue
        oceny = [SKLADOWE[(s, i)] for i, s in enumerate(zestaw)]
        for stan_podstawy in f.STANY_ZRODLA:
            rekord = f.wymaganie(oceny, stan_podstawy=stan_podstawy)
            if rekord.status_maszynowy == "SPELNIA":
                assert rekord.kompletnosc_dowodu == "PELNY", zestaw


def test_naruszenie_na_modelu_niezwalidowanym_pozostaje_naruszeniem() -> None:
    """Kierunek zachowawczy §2.4: fałszywy alarm tańszy niż fałszywa zgodność."""
    rekord = f.ocena(
        m=-2.0,
        dowod_oceny=f.dowod_symulacji(status_modelu="UNVALIDATED_MODEL"),
        metoda_wyniku="SYMULACJA",
        u=0.5,
    )
    assert rekord.status_maszynowy == "NIE_SPELNIA"
    assert f.wymaganie([rekord], sposob="SYMULACJA").status_maszynowy == "NIE_SPELNIA"
