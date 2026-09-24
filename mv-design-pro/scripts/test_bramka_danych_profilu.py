"""Samotest bramki danych właściciela (`bramka_danych_profilu.py`, plan A/B §12.1, O-43).

POKRYCIE — ILOCZYN CECH:
  * rodzaj nośnika {`PodstawaWymagania` · `DokumentWarstwy` · sekcja-zbiór} × stan
    {`NIEUSTALONE` → wiersz · `WSKAZANE` → brak wiersza};
  * miejsce nośnika {parametr profilu · wymaganie (`zrodlo` / `pokrycie_zrodlo` /
    `wykonanie_prawa_zrodlo`) · dokument warstwy · pole NOWE (spoza dzisiejszego loadera) ·
    pole puste w instancji, obecne w typie};
  * operator {wspólna podstawa (deduplikacja) · podstawa różna per operator · kopia operatora};
  * plan {tabela zgodna → 0 · tabela zmieniona → 1 z różnicą · brak znaczników → 1 · brak
    pliku → 2};
  * deklaracje bramki {nośnik bez czytelników · martwy wpis · wymaganie nieistniejące · test
    spoza kanonu · sekcja-zbiór bez warstwy} → błąd kontraktu;
  * czytelnicy-testy wobec AST solvera PTPiREE (test → metoda kryterium → pola profilu) i
    czytelnicy spoza testów wobec AST oceny wymagań (`ocena_wymagan.py`: pola profilu).
"""

from __future__ import annotations

import ast
import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bramka_danych_profilu as bramka  # noqa: E402
from catalog.profiles.nc_rfg.loader import (  # noqa: E402
    NcRfgProfile,
    WarstwaProfilu,
    list_available_operators,
    load_nc_rfg_profile,
)
from pydantic import BaseModel, ConfigDict  # noqa: E402
from werdykt.kontrakt import PodstawaWymagania, StanZrodla  # noqa: E402

SOLVER_PTPIREE = (
    bramka.BACKEND_DIR / "src" / "network_model" / "solvers" / "ncrfg_ptpiree" / "engine.py"
)
OCENA_WYMAGAN = bramka.BACKEND_DIR / "src" / "application" / "ncrfg_compliance" / "ocena_wymagan.py"


@pytest.fixture(scope="module")
def profile() -> dict[str, NcRfgProfile]:
    return bramka.profile_repozytorium()


def _podstawa(status: str = "NIEUSTALONE", **pola: object) -> PodstawaWymagania:
    dane: dict[str, object] = {
        "rodzaj": "OSD",
        "dokument": "Dokument próbny",
        "wydanie": None,
        "jednostka_redakcyjna": None,
        "status": status,
        "uwagi_pl": "uwaga próbna",
    }
    dane.update(pola)
    return PodstawaWymagania.model_validate(dane)


def _slowniki_o_kluczach(dane: object, klucze: frozenset[str]) -> int:
    """Niezależne liczenie: słowniki `model_dump` o dokładnie tym zbiorze kluczy."""
    if isinstance(dane, dict):
        wlasny = 1 if frozenset(dane) == klucze else 0
        return wlasny + sum(_slowniki_o_kluczach(v, klucze) for v in dane.values())
    if isinstance(dane, list | tuple):
        return sum(_slowniki_o_kluczach(v, klucze) for v in dane)
    return 0


def _sciezki(pomiar: bramka.Pomiar) -> list[str]:
    return [w.sciezka for w, _ in pomiar.wiersze]


# ---------------------------------------------------------------------------
# Kompletność przeglądu (inwentarz klasy)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("operator_id", list_available_operators())
def test_liczba_podstaw_rowna_niezaleznemu_liczeniu_z_model_dump(operator_id: str) -> None:
    """PIN klasy: rekurencyjny przegląd znajduje KAŻDĄ `PodstawaWymagania` i każdy dokument
    warstwy — liczba równa liczbie słowników o tym zbiorze kluczy w `model_dump()`."""
    profil = load_nc_rfg_profile(operator_id)
    znalezione = bramka.nosniki(profil)
    zrzut = profil.model_dump(mode="json")
    podstawy = [n for n in znalezione if isinstance(n.obiekt, PodstawaWymagania)]
    dokumenty = [n for n in znalezione if isinstance(n.obiekt, WarstwaProfilu)]
    assert len(podstawy) == _slowniki_o_kluczach(zrzut, frozenset(PodstawaWymagania.model_fields))
    assert len(dokumenty) == _slowniki_o_kluczach(zrzut, frozenset(WarstwaProfilu.model_fields))
    assert len(podstawy) > 0 and len(dokumenty) == len(profil.warstwy)


def test_przeglad_typow_widzi_pola_puste_w_instancji() -> None:
    """Ścieżki typów obejmują pola, które w instancji są puste (dziś: pozycje Banku Nastaw,
    scenariusze programu badań) — nośnik dopisany tam jutro ma już czytelników."""
    sciezki = {s for s, _ in bramka.sciezki_typow(NcRfgProfile)}
    assert "bank_nastaw.pozycje[*].zrodlo" in sciezki
    assert "program_badan.scenariusze[*].zrodlo" in sciezki
    assert "bank_nastaw" in sciezki and "program_badan" in sciezki
    assert "warstwy[*]" in sciezki
    assert "wymagania[*].wykonanie_prawa_zrodlo" in sciezki


class _NowaPozycja(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    id: str
    zrodlo: PodstawaWymagania


class _NowaGrupa(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    wartosc: float
    zrodlo: PodstawaWymagania
    pozycje: tuple[_NowaPozycja, ...] = ()


class _ProfilZNowymPolem(NcRfgProfile):
    """Loader jutra: nowa grupa parametrów z podstawą (pole, którego skrypt nie zna)."""

    nowa_grupa: _NowaGrupa


def _profil_z_nowym_polem(profil: NcRfgProfile, status: str) -> _ProfilZNowymPolem:
    return _ProfilZNowymPolem.model_validate(
        {
            **profil.model_dump(),
            "nowa_grupa": {"wartosc": 1.0, "zrodlo": _podstawa(status).model_dump()},
        }
    )


def test_podstawa_w_nowym_polu_modelu_jest_znaleziona(profile: dict[str, NcRfgProfile]) -> None:
    """Test rekurencji: pole dopisane do modelu profilu jest znalezione bez zmiany skryptu, a
    brak jego czytelników jest błędem kontraktu (nie cichym pominięciem)."""
    rozszerzony = _profil_z_nowym_polem(profile["enea"], "NIEUSTALONE")
    sciezki_nosnikow = [n.sciezka for n in bramka.nosniki(rozszerzony)]
    assert "nowa_grupa.zrodlo" in sciezki_nosnikow
    assert "nowa_grupa.pozycje[*].zrodlo" in {s for s, _ in bramka.sciezki_typow(type(rozszerzony))}

    bledy = bramka.sprawdz_kontrakt({"enea": rozszerzony})
    assert any("nowa_grupa" in b and "bez czytelników" in b for b in bledy), bledy
    with pytest.raises(bramka.BladKontraktuBramki, match="nowa_grupa"):
        bramka.zmierz({"enea": rozszerzony})

    czytelnicy = {
        **bramka.CZYTELNICY,
        "nowa_grupa": bramka.Czytelnicy(testy=("T01",), opis_pl="grupa próbna"),
    }
    pomiar = bramka.zmierz({"enea": rozszerzony}, czytelnicy)
    wiersz = next(w for w, _ in pomiar.wiersze if w.sciezka == "nowa_grupa.zrodlo")
    assert wiersz.brakuje == "wydanie, jednostka redakcyjna"
    assert "testy: T01" in wiersz.odblokowuje and "RFG_13_2" in wiersz.odblokowuje


# ---------------------------------------------------------------------------
# Stan źródła → wiersz
# ---------------------------------------------------------------------------


def test_parametr_nieustalone_trafia_do_tabeli_a_wskazane_nie(
    profile: dict[str, NcRfgProfile],
) -> None:
    enea = profile["enea"]
    assert enea.zaprzestanie_generacji.zrodlo.status == "WSKAZANE"
    assert enea.frequency_response.zrodlo.status == "NIEUSTALONE"
    sciezki = _sciezki(bramka.zmierz({"enea": enea}))
    assert "zaprzestanie_generacji.zrodlo" not in sciezki
    assert "lfsm_o_granice.zrodlo" not in sciezki
    assert "frequency_response.zrodlo" in sciezki

    obnizona = enea.zaprzestanie_generacji.zrodlo.model_copy(
        update={"status": "NIEUSTALONE", "jednostka_redakcyjna": None}
    )
    zmieniony = enea.model_copy(
        update={
            "zaprzestanie_generacji": enea.zaprzestanie_generacji.model_copy(
                update={"zrodlo": obnizona}
            )
        }
    )
    pomiar = bramka.zmierz({"enea": zmieniony})
    wiersz = next(w for w, _ in pomiar.wiersze if w.sciezka == "zaprzestanie_generacji.zrodlo")
    assert wiersz.warstwa_rodzaj == "ROZPORZADZENIE_UE (podstawa)"
    assert wiersz.brakuje == "jednostka redakcyjna"
    assert wiersz.odblokowuje.startswith("testy: T12; wymagania: RFG_13_6")


@pytest.mark.parametrize(
    ("podstawa", "oczekiwane"),
    [
        (
            _podstawa(rodzaj="NIEUSTALONA"),
            "dokument źródłowy, wydanie i jednostka redakcyjna",
        ),
        (_podstawa(), "wydanie, jednostka redakcyjna"),
        (_podstawa(wydanie="1.0"), "jednostka redakcyjna"),
        (_podstawa(jednostka_redakcyjna="pkt 1"), "wydanie"),
        (
            _podstawa(wydanie="1.0", jednostka_redakcyjna="pkt 1"),
            "potwierdzenie jednostki redakcyjnej",
        ),
    ],
)
def test_czego_brakuje_wynika_z_pol_podstawy(podstawa: PodstawaWymagania, oczekiwane: str) -> None:
    assert bramka._brakuje_podstawy(podstawa).startswith(oczekiwane)


def test_wiersze_realnego_profilu_nazywaja_brak_i_czytelnikow(
    profile: dict[str, NcRfgProfile],
) -> None:
    pomiar = bramka.zmierz(profile)
    po_sciezce: dict[str, list[tuple[bramka.Wiersz, tuple[str, ...]]]] = {}
    for wiersz, operatorzy in pomiar.wiersze:
        po_sciezce.setdefault(wiersz.sciezka, []).append((wiersz, operatorzy))
    ((rfg_17_3, _),) = po_sciezce["wymagania[RFG_17_3].zrodlo"]
    assert rfg_17_3.brakuje.startswith("potwierdzenie jednostki redakcyjnej")
    ((pokrycie, _),) = po_sciezce["wymagania[RFG_14_3].pokrycie_zrodlo"]
    assert "reguła pusta" in pokrycie.odblokowuje and pokrycie.warstwa_rodzaj.startswith("WIPWC")
    ((program, _),) = po_sciezce["program_badan"]
    assert program.warstwa_rodzaj == "PROCEDURA_PTPIREE (sekcja-zbiór)"
    assert "zbiór pusty" in program.brakuje and "RFG_20_2B" in program.odblokowuje
    assert all(w.warstwa_rodzaj == "OSD (sekcja-zbiór)" for w, _ in po_sciezce["bank_nastaw"])
    ((magazyny, _),) = po_sciezce["warstwy[MAGAZYNY]"]
    assert "katalog wymagań warstwy pusty" in magazyny.odblokowuje


# ---------------------------------------------------------------------------
# Deduplikacja między operatorami
# ---------------------------------------------------------------------------


def test_deduplikacja_wspolnych_podstaw(profile: dict[str, NcRfgProfile]) -> None:
    pomiar = bramka.zmierz(profile)
    wspolne = [o for w, o in pomiar.wiersze if w.sciezka == "frequency_response.zrodlo"]
    assert wspolne == [pomiar.operatorzy], "podstawa wspólna = jedna linia ze wszystkimi"
    osd = sorted(o for w, o in pomiar.wiersze if w.sciezka == "warstwy[OSD]")
    assert osd == [(op,) for op in sorted(profile)], "dokument operatora różny per operator"
    hvrt = [o for w, o in pomiar.wiersze if w.sciezka == "voltage_levels.hvrt_zrodlo"]
    assert len(hvrt) == len(profile)

    kopia = profile["enea"].model_copy(update={"operator_id": "enea_kopia"})
    czesciowy = bramka.zmierz(
        {"enea": profile["enea"], "enea_kopia": kopia, "energa": profile["energa"]}
    )
    osd_czesciowy = sorted(o for w, o in czesciowy.wiersze if w.sciezka == "warstwy[OSD]")
    assert osd_czesciowy == [("enea", "enea_kopia"), ("energa",)]
    tekst = bramka.tabela(czesciowy)
    assert "| enea, enea_kopia |" in tekst and "| wspólna |" in tekst


# ---------------------------------------------------------------------------
# Kontrakt deklaracji bramki
# ---------------------------------------------------------------------------


def test_deklaracje_repozytorium_sa_spojne(profile: dict[str, NcRfgProfile]) -> None:
    assert bramka.sprawdz_kontrakt(profile) == []


@pytest.mark.parametrize(
    ("zmiana", "fragment"),
    [
        ({"martwy_klucz": bramka.Czytelnicy(testy=("T01",))}, "martwy wpis CZYTELNICY"),
        (
            {"bank_nastaw": bramka.Czytelnicy(wymagania=("RFG_99_9",))},
            "wymaganie RFG_99_9 nie istnieje",
        ),
        ({"frequency_response": bramka.Czytelnicy(testy=("T21",))}, "spoza kanonu"),
        ({"reactive_power": bramka.Czytelnicy()}, "wpis pusty"),
    ],
)
def test_bledne_deklaracje_czytelnikow_sa_bledem_kontraktu(
    profile: dict[str, NcRfgProfile], zmiana: dict[str, bramka.Czytelnicy], fragment: str
) -> None:
    czytelnicy = {**bramka.CZYTELNICY, **zmiana}
    assert any(fragment in b for b in bramka.sprawdz_kontrakt(profile, czytelnicy))


def test_brak_czytelnikow_grupy_profilu_jest_bledem(profile: dict[str, NcRfgProfile]) -> None:
    czytelnicy = {k: v for k, v in bramka.CZYTELNICY.items() if k != "kryteria_akceptacji"}
    bledy = bramka.sprawdz_kontrakt(profile, czytelnicy)
    assert any("kryteria_akceptacji.zrodlo" in b for b in bledy), bledy


def test_sekcja_zbior_bez_warstwy_jest_bledem(profile: dict[str, NcRfgProfile]) -> None:
    warstwy = {k: v for k, v in bramka.WARSTWA_SEKCJI.items() if k != "ProgramBadan"}
    bledy = bramka.sprawdz_kontrakt(profile, warstwa_sekcji=warstwy)
    assert any("ProgramBadan" in b for b in bledy), bledy


def test_nosnik_rozpoznawany_po_typie_pola_status_takze_z_none() -> None:
    class _ZOpcjonalnym(BaseModel):
        status: StanZrodla | None = None

    class _ZTekstem(BaseModel):
        status: str = "NIEUSTALONE"

    assert bramka.jest_nosnikiem(_ZOpcjonalnym)
    assert not bramka.jest_nosnikiem(_ZTekstem)


# ---------------------------------------------------------------------------
# Czytelnicy-testy wobec solvera (deklaracja z pokryciem)
# ---------------------------------------------------------------------------


def _testy_czytajace_pola_z_solvera() -> dict[str, set[str]]:
    """AST solvera: `_specyfikacja` (test → metoda kryterium) × metody (`*.profile.<pole>`)."""
    drzewo = ast.parse(SOLVER_PTPIREE.read_text(encoding="utf-8"))
    metody = {n.name: n for n in ast.walk(drzewo) if isinstance(n, ast.FunctionDef)}
    assert "_specyfikacja" in metody, "solver bez rozdziału test → kryterium (`_specyfikacja`)"
    test_metoda: dict[str, str] = {}
    for wezel in ast.walk(metody["_specyfikacja"]):
        if not (isinstance(wezel, ast.If) and isinstance(wezel.test, ast.Compare)):
            continue
        porownanie = wezel.test.comparators[0]
        if isinstance(porownanie, ast.Set):
            testy = [e.value for e in porownanie.elts if isinstance(e, ast.Constant)]
        elif isinstance(porownanie, ast.Constant):
            testy = [porownanie.value]
        else:
            continue
        zwrot = wezel.body[0]
        assert isinstance(zwrot, ast.Return) and isinstance(zwrot.value, ast.Call)
        assert isinstance(zwrot.value.func, ast.Attribute)
        for test_id in testy:
            test_metoda[str(test_id)] = zwrot.value.func.attr
    wynik: dict[str, set[str]] = {}
    for test_id, nazwa in test_metoda.items():
        for wezel in ast.walk(metody[nazwa]):
            if (
                isinstance(wezel, ast.Attribute)
                and isinstance(wezel.value, ast.Attribute)
                and wezel.value.attr == "profile"
            ):
                wynik.setdefault(wezel.attr, set()).add(test_id)
    assert len(test_metoda) == 20, f"rozdział testów niepełny: {sorted(test_metoda)}"
    return wynik


def _korzenie_nosnikow() -> set[str]:
    """Pola profilu (pierwszy segment), pod którymi może stać nośnik z czytelnikami."""
    return {
        bramka._segmenty(s)[0]
        for s, _ in bramka.sciezki_typow(NcRfgProfile)
        if not bramka._poza_czytelnikami(s)
    }


def test_czytelnicy_testy_zgodni_z_solverem() -> None:
    """Deklaracja `CZYTELNICY[*].testy` = odczyt solvera, dla każdego pola profilu niosącego
    podstawę (pole czytane przez solver, a nieobecne w deklaracji, też jest czerwone)."""
    z_solvera = _testy_czytajace_pola_z_solvera()
    zadeklarowane: dict[str, set[str]] = {}
    for klucz, wpis in bramka.CZYTELNICY.items():
        zadeklarowane.setdefault(klucz.split(".")[0], set()).update(wpis.testy)
    for pole in sorted(_korzenie_nosnikow()):
        assert zadeklarowane.get(pole, set()) == z_solvera.get(pole, set()), pole


def test_czytelnicy_spoza_testow_zgodni_z_ocena_wymagan() -> None:
    """Grupy profilu, które ocena wymagań czyta poza testami (program badań O-30, Bank Nastaw
    i obwiednia O-32), mają zadeklarowane wymagania albo testy; grupa zadeklarowana z samymi
    wymaganiami (bez testów) jest naprawdę czytana przez ocenę wymagań."""
    drzewo = ast.parse(OCENA_WYMAGAN.read_text(encoding="utf-8"))
    czytane = {
        wezel.attr
        for wezel in ast.walk(drzewo)
        if isinstance(wezel, ast.Attribute)
        and isinstance(wezel.value, ast.Attribute)
        and wezel.value.attr == "profile"
    } & _korzenie_nosnikow()
    assert {"bank_nastaw", "program_badan"} <= czytane, czytane
    deklarowane: dict[str, list[bramka.Czytelnicy]] = {}
    for klucz, wpis in bramka.CZYTELNICY.items():
        deklarowane.setdefault(klucz.split(".")[0], []).append(wpis)
    for pole in sorted(czytane):
        assert any(w.testy or w.wymagania for w in deklarowane.get(pole, [])), pole
    for pole, wpisy in sorted(deklarowane.items()):
        if pole in ("bank_nastaw", "program_badan"):
            assert all(w.wymagania for w in wpisy) and pole in czytane, pole


# ---------------------------------------------------------------------------
# Tryby i strażnik na pliku planu
# ---------------------------------------------------------------------------


def _plan_ze_znacznikami(tmp_path: Path) -> Path:
    plan = tmp_path / "plan.md"
    plan.write_text(
        "# Plan\n\n## 12. Bramka\n\n**12.1 Dane.** tekst wokół.\n\n"
        f"{bramka.ZNACZNIK_START}\n{bramka.ZNACZNIK_KONIEC}\n\nTekst po tabeli.\n",
        encoding="utf-8",
    )
    return plan


def test_zapisz_potem_straznik_zielony_a_dryf_czerwony(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    plan = _plan_ze_znacznikami(tmp_path)
    assert bramka.main(["--plan", str(plan)]) == 1, "pusty blok ≠ pomiar"
    assert bramka.main(["--zapisz", "--plan", str(plan)]) == 0
    tresc = plan.read_text(encoding="utf-8")
    assert tresc.startswith("# Plan\n\n## 12. Bramka\n\n**12.1 Dane.** tekst wokół.")
    assert tresc.endswith(f"{bramka.ZNACZNIK_KONIEC}\n\nTekst po tabeli.\n")
    capsys.readouterr()
    assert bramka.main(["--plan", str(plan)]) == 0
    assert "OK" in capsys.readouterr().out

    plan.write_text(tresc.replace("| wspólna |", "| enea |", 1), encoding="utf-8")
    assert bramka.main(["--plan", str(plan)]) == 1
    bledy = capsys.readouterr().err
    assert "rozjechała się" in bledy and "+| " in bledy and "-| " in bledy

    assert bramka.main(["--zapisz", "--plan", str(plan)]) == 0
    assert plan.read_text(encoding="utf-8") == tresc, "zapis jest idempotentny"


def test_brak_znacznikow_i_brak_planu(tmp_path: Path) -> None:
    bez_znacznikow = tmp_path / "bez.md"
    bez_znacznikow.write_text("# Plan bez znaczników\n", encoding="utf-8")
    assert bramka.main(["--plan", str(bez_znacznikow)]) == 1
    assert bramka.main(["--zapisz", "--plan", str(bez_znacznikow)]) == 1
    assert bramka.main(["--plan", str(tmp_path / "nie_ma.md")]) == 2


def test_interpreter_bez_zaleznosci_backendu_to_blad_srodowiska() -> None:
    """Interpreter bez pakietów zewnętrznych (`-S`: bez site-packages) → kod 2 z nazwanym
    brakiem, nie traceback i nie kod strażnika (1)."""
    wynik = subprocess.run(
        [sys.executable, "-S", str(Path(bramka.__file__)), "--zmierz"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert wynik.returncode == 2, wynik.stderr
    assert "BŁĄD ŚRODOWISKA" in wynik.stderr and "Traceback" not in wynik.stderr


def test_zmierz_wypisuje_tabele_bez_zapisu(capsys: pytest.CaptureFixture[str]) -> None:
    assert bramka.main(["--zmierz"]) == 0
    wyjscie = capsys.readouterr().out
    assert "| # | Ścieżka w profilu |" in wyjscie
    assert "`frequency_response.zrodlo`" in wyjscie


def test_tabela_deterministyczna(profile: dict[str, NcRfgProfile]) -> None:
    pierwsza = bramka.tabela(bramka.zmierz(profile))
    druga = bramka.tabela(bramka.zmierz(dict(reversed(list(profile.items())))))
    assert pierwsza == druga
    assert json.dumps(pierwsza, ensure_ascii=False)


def test_biezacy_plan_zgodny_z_pomiarem(capsys: pytest.CaptureFixture[str]) -> None:
    """PIN pozytywny na BIEŻĄCYM planie: tabela §12.1 odpowiada profilowi repozytorium."""
    assert bramka.main([]) == 0, capsys.readouterr().err
