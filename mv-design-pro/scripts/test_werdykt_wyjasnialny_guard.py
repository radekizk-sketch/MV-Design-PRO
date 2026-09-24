"""Samotest strażnika kontraktu werdyktu wyjaśnialnego (`werdykt_wyjasnialny_guard.py`).

Karta AB-1a Pakiet E1, pkt A.6: dla każdego z pięciu sprawdzeń przypadek pozytywny
i negatywny na plikach tymczasowych; typ kanoniczny i klasa z polem `WyjasnienieWerdyktu` nie
są naruszeniem; zapadka w dół; mapa po semantyce dozwolona w module karty, mapa po statusie
nigdzie; parser TypeScript na porównaniu z progiem; bieżące drzewo zielone z bieżącą listą.
Karta AB-1a Pakiet E2: szóste sprawdzenie (6a ładunek słownikowy, 6b tekst składany, 6c mapa
warunkowa) jako iloczyn cech w obu językach; słownictwo z jednego źródła (pakiet `werdykt/`).

POKRYCIE — ILOCZYN CECH (reguła KLASA, NIE INSTANCJA pkt 2), nie tylko przykłady z karty:
  backend: {Literal wprost · alias typu z innego modułu · Enum z innego modułu · kontener
    `list[...]` · `Optional`} × {pole z wyjaśnieniem wprost · odziedziczonym · opcjonalnym}
    × {nazwa werdyktu · rodzina `status` z wartościami słownika i bez · `status: str`}
    × {model przez `BaseModel` · przez bazę z drzewa · `@dataclass`} + funkcje-bramki
    {z adnotacją · bez adnotacji · nazwa poza wzorcem} + słownik {odmiana `ZGODNE` · `FAILED`
    obok `PENDING` · para `PASSED`/`FAILED`};
  HTTP: {enum wprost · przez `$ref` · przez `anyOf` z `null` · w `items`} × {wyjaśnienie
    wymagane · niewymagane · z alternatywą `null` · przez `allOf`};
  frontend: {mapa w pliku zwykłym · w module karty} × {klucze statusu · klucze semantyki}
    × {wartości tekstowe · odwołania przy jednym/dwóch kluczach · kody WIELKIMI LITERAMI}
    + {rekord z polem `ok`} + {`new Map`}; próg × {liczba · stała WIELKIMI · `const` z liczbą
    · parametr z domyślną stałą · wartość nie-stała} × {ujście `?:` z etykietą · nazwa
    `tone`/`ostrzezenie` · atrybut JSX · zwrot funkcji o nazwie werdyktu · `if` z `return`
    etykiety · `if` z blokiem układu}; testy wyłączone (`__tests__`, `*.test.*`);
  dokumenty: {renderer przez import `docx` · plik `application/analyses/*.py` · moduł spoza
    rendererów · `werdykt/dokument.py`} × {mapa na tekst · mapa na kod · liczniki};
  kod w tekście (pakiet D2, luka §5.1): korpus A {pole `*_pl` · lista `czego_brakuje` /
    `zastrzezenia` · pole rekordu} × {kod z podkreśleniem · z cyframi · jednowyrazowy kod osi
    stanu · identyfikator małymi literami · emfaza wersalikami · skrót prozy · nazwa polska};
    korpus B {argument nazwany · klucz słownika · przypisanie atrybutu · f-napis} × {pole
    tekstu · argument `code=` · docstring}; korpus {brak · pusty · uszkodzony};
  werdykt poza rekordem (pakiet E2): {ładunek słownikowy · tekst składany · mapa warunkowa}
    × {werdykt z `wyjasnienie` obok · bez wyjaśnienia · status spoza słownika werdyktów}
    × {Python · TypeScript} — 18 komórek, cechy brzegowe wypisane przy sekcji
    „Sprawdzenie 6” niżej; n-gramy kodu wersalikami zgodne w obu parserach.
KOMBINACJE ŚWIADOMIE NIEPOKRYTE: porównanie dwóch wartości nie-stałych (`pst > pst_limit`) —
strażnik go NIE wykrywa (karta: „między identyfikatorem a literałem liczbowym lub stałą"),
a test `test_frontend_porownanie_bez_stalej_nie_jest_naruszeniem` PRZYPINA tę granicę.
"""

from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import werdykt_wyjasnialny_guard as guard  # noqa: E402

# ---------------------------------------------------------------------------
# Drzewo backendu na plikach tymczasowych
# ---------------------------------------------------------------------------

KONTRAKT_ATRAPA = """
from typing import Literal
from pydantic import BaseModel

StatusWerdyktu = Literal["SPELNIA", "NIE_SPELNIA", "NIE_OCENIONO"]


class WyjasnienieWerdyktu(BaseModel):
    zdanie_pl: str


class WynikWymagania(BaseModel):
    # Celowo BEZ pola wyjaśnienia: wyjątek „typ kanoniczny" musi działać sam.
    status_maszynowy: StatusWerdyktu
"""


def _zapisz(korzen: Path, pliki: dict[str, str]) -> None:
    for sciezka, tresc in pliki.items():
        cel = korzen / sciezka
        cel.parent.mkdir(parents=True, exist_ok=True)
        cel.write_text(textwrap.dedent(tresc), encoding="utf-8")


def _backend(tmp_path: Path, pliki: dict[str, str]) -> guard.IndeksBackendu:
    korzen = tmp_path / "backend" / "src"
    _zapisz(korzen, {"werdykt/__init__.py": "", "werdykt/kontrakt.py": KONTRAKT_ATRAPA, **pliki})
    return guard.IndeksBackendu(korzen)


def _tozsamosci(naruszenia: list[guard.Naruszenie]) -> set[str]:
    return {n.tozsamosc for n in naruszenia}


def test_backend_pole_literal_werdyktu_bez_wyjasnienia_jest_naruszeniem(tmp_path: Path) -> None:
    indeks = _backend(
        tmp_path,
        {
            "app/__init__.py": "",
            "app/modele.py": """
                from typing import Literal
                from pydantic import BaseModel

                class Wynik(BaseModel):
                    wynik_testu: Literal["pass", "fail", "no_data"]
                    opis: str
                """,
        },
    )
    assert _tozsamosci(guard.sprawdz_backend(indeks)) == {"app.modele:Wynik.wynik_testu"}


def test_backend_typ_kanoniczny_i_klasa_z_wyjasnieniem_nie_sa_naruszeniem(tmp_path: Path) -> None:
    indeks = _backend(
        tmp_path,
        {
            "app/__init__.py": "",
            "app/modele.py": """
                from pydantic import BaseModel
                from werdykt.kontrakt import StatusWerdyktu, WyjasnienieWerdyktu

                class Rekord(BaseModel):
                    status: StatusWerdyktu
                    wyjasnienie: WyjasnienieWerdyktu

                class RekordPochodny(Rekord):
                    verdict: str
                """,
        },
    )
    naruszenia = _tozsamosci(guard.sprawdz_backend(indeks))
    assert "werdykt.kontrakt:WynikWymagania.status_maszynowy" not in naruszenia
    assert "app.modele:Rekord.status" not in naruszenia
    # Wyjaśnienie odziedziczone po bazie z drzewa też zwalnia.
    assert "app.modele:RekordPochodny.verdict" not in naruszenia
    assert naruszenia == set()


def test_backend_opcjonalne_wyjasnienie_nie_zwalnia(tmp_path: Path) -> None:
    """T1 kontraktu: rekord bez wyjaśnienia to błąd — pole `| None` na to pozwala."""
    indeks = _backend(
        tmp_path,
        {
            "app/modele.py": """
                from pydantic import BaseModel
                from werdykt.kontrakt import StatusWerdyktu, WyjasnienieWerdyktu

                class Rekord(BaseModel):
                    status: StatusWerdyktu
                    wyjasnienie: WyjasnienieWerdyktu | None = None
                """,
        },
    )
    assert _tozsamosci(guard.sprawdz_backend(indeks)) == {"app.modele:Rekord.status"}


def test_backend_alias_i_enum_z_innego_modulu_oraz_kontener(tmp_path: Path) -> None:
    indeks = _backend(
        tmp_path,
        {
            "app/__init__.py": "",
            "app/typy.py": """
                from enum import Enum
                from typing import Literal

                Ocena = Literal["zgodny", "niezgodny"]

                class Werdykt(str, Enum):
                    OK = "ok"
                    BLAD = "blad"
                """,
            "app/modele.py": """
                from dataclasses import dataclass
                from .typy import Ocena, Werdykt

                @dataclass
                class Pozycja:
                    oceny: list[Ocena]
                    stan: Werdykt | None
                    liczba: int
                """,
        },
    )
    assert _tozsamosci(guard.sprawdz_backend(indeks)) == {
        "app.modele:Pozycja.oceny",
        "app.modele:Pozycja.stan",
    }


def test_backend_model_przez_baze_z_drzewa_i_nazwy_werdyktu(tmp_path: Path) -> None:
    indeks = _backend(
        tmp_path,
        {
            "app/modele.py": """
                from pydantic import BaseModel

                class Baza(BaseModel):
                    pass

                class Widok(Baza):
                    is_adequate: bool
                    spelnia_warunek: bool
                    wscr_verdict: str
                    liczba_ok: int
                """,
        },
    )
    assert _tozsamosci(guard.sprawdz_backend(indeks)) == {
        "app.modele:Widok.is_adequate",
        "app.modele:Widok.spelnia_warunek",
        "app.modele:Widok.wscr_verdict",
    }


def test_backend_rodzina_status_wg_wartosci_i_typu(tmp_path: Path) -> None:
    """`status` z Literal bez słownika (stan źródła) — nie; `status: str` — tak (karta)."""
    indeks = _backend(
        tmp_path,
        {
            "app/modele.py": """
                from typing import Literal
                from pydantic import BaseModel

                class Podstawa(BaseModel):
                    status: Literal["ZWERYFIKOWANE", "WSKAZANE", "NIEUSTALONE"]

                class Bieg(BaseModel):
                    status: str

                class Wiersz(BaseModel):
                    status_obciazenia: Literal["PASS", "FAIL"]
                """,
        },
    )
    assert _tozsamosci(guard.sprawdz_backend(indeks)) == {
        "app.modele:Bieg.status",
        "app.modele:Wiersz.status_obciazenia",
    }


def test_backend_slownik_odmiana_i_regula_failed(tmp_path: Path) -> None:
    indeks = _backend(
        tmp_path,
        {
            "app/modele.py": """
                from enum import StrEnum
                from typing import Literal
                from pydantic import BaseModel

                class StanBiegu(StrEnum):
                    PENDING = "PENDING"
                    DONE = "DONE"
                    FAILED = "FAILED"

                class Bieg(BaseModel):
                    etap: StanBiegu
                    wynik_wzorca: Literal["ZGODNE", "GRANICZNE", "NIEZGODNE"]
                    wynik_testu: Literal["PASSED", "FAILED"]
                """,
        },
    )
    assert _tozsamosci(guard.sprawdz_backend(indeks)) == {
        "app.modele:Bieg.wynik_wzorca",
        "app.modele:Bieg.wynik_testu",
    }


def test_backend_funkcje_bramki(tmp_path: Path) -> None:
    indeks = _backend(
        tmp_path,
        {
            "app/bramki.py": """
                def osd_card_gate(x) -> tuple[bool, list[str]]:
                    return True, []

                def is_vt_valid(x):
                    if x:
                        return (True, "")
                    return (False, "za mało")

                def policz(x) -> tuple[bool, str]:
                    return True, ""

                class Walidator:
                    def is_ok(self) -> tuple[bool, str]:
                        return True, ""
                """,
        },
    )
    assert _tozsamosci(guard.sprawdz_backend(indeks)) == {
        "app.bramki:osd_card_gate()",
        "app.bramki:is_vt_valid()",
        "app.bramki:Walidator.is_ok()",
    }


def test_backend_tozsamosc_nie_zalezy_od_linii(tmp_path: Path) -> None:
    tresc = """
        from typing import Literal
        from pydantic import BaseModel

        class Wynik(BaseModel):
            verdict: Literal["pass", "fail"]
        """
    przed = guard.sprawdz_backend(_backend(tmp_path / "a", {"app/m.py": tresc}))
    po = guard.sprawdz_backend(
        _backend(tmp_path / "b", {"app/m.py": "# przesunięcie\n\n\n\n" + textwrap.dedent(tresc)})
    )
    assert [n.tozsamosc for n in przed] == [n.tozsamosc for n in po]
    assert [n.linia for n in przed] != [n.linia for n in po]


# ---------------------------------------------------------------------------
# Sprawdzenie 4 — renderery dokumentów
# ---------------------------------------------------------------------------


def test_dokumenty_mapa_statusu_w_rendererze_jest_naruszeniem(tmp_path: Path) -> None:
    indeks = _backend(
        tmp_path,
        {
            "network_model/reporting/raport_docx.py": """
                from docx import Document

                ETYKIETY = {"PASS": "Prawidłowa", "FAIL": "Nieskoordynowane"}
                """,
            "application/analyses/certyfikat.py": """
                _WERDYKT_PL = {"pass": "spełnia", "fail": "nie spełnia"}

                def buduj(wynik):
                    return {"zgodny": f"moduł {wynik}", "niezgodny": "moduł niezgodny"}
                """,
        },
    )
    assert _tozsamosci(guard.sprawdz_dokumenty(indeks)) == {
        "network_model.reporting.raport_docx:ETYKIETY",
        "application.analyses.certyfikat:_WERDYKT_PL",
        "application.analyses.certyfikat:buduj",
    }


def test_dokumenty_poza_rendererem_kod_i_liczniki_nie_sa_naruszeniem(tmp_path: Path) -> None:
    indeks = _backend(
        tmp_path,
        {
            "werdykt/dokument.py": """
                from docx import Document

                ETYKIETY = {"SPELNIA": "Kryterium spełnione", "NIE_SPELNIA": "Kryterium naruszone"}
                """,
            "domain/etykiety.py": """
                ETYKIETY = {"PASS": "Spełnia", "FAIL": "Nie spełnia"}
                """,
            "application/analyses/werdykt.py": """
                SPELNIA = "SPELNIA"
                _Z_STATUSU = {"PASS": SPELNIA, "FAIL": "NIE_SPELNIA"}

                def liczniki(spelnia, nie_spelnia):
                    return {"spelnia": spelnia, "nie_spelnia": nie_spelnia}
                """,
        },
    )
    assert guard.sprawdz_dokumenty(indeks) == []


# ---------------------------------------------------------------------------
# Sprawdzenie 2 — kontrakt HTTP (migawka OpenAPI)
# ---------------------------------------------------------------------------


def _migawka(tmp_path: Path, schematy: dict) -> Path:
    sciezka = tmp_path / "openapi.json"
    sciezka.write_text(json.dumps({"components": {"schemas": schematy}}), encoding="utf-8")
    return sciezka


def test_http_enum_werdyktu_bez_wyjasnienia_jest_naruszeniem(tmp_path: Path) -> None:
    sciezka = _migawka(
        tmp_path,
        {
            "Werdykt": {"enum": ["PASS", "FAIL"], "type": "string"},
            "WynikTestu": {
                "properties": {
                    "verdict": {"enum": ["pass", "fail", "no_data"], "type": "string"},
                    "przez_ref": {"$ref": "#/components/schemas/Werdykt"},
                    "opcjonalny": {"anyOf": [{"enum": ["zgodny", "niezgodny"]}, {"type": "null"}]},
                    "lista": {"type": "array", "items": {"enum": ["ok", "blad"]}},
                    "inny": {"enum": ["PPM", "SyPGM"], "type": "string"},
                },
                "type": "object",
            },
        },
    )
    assert _tozsamosci(guard.sprawdz_http(sciezka)) == {
        "openapi:WynikTestu.verdict",
        "openapi:WynikTestu.przez_ref",
        "openapi:WynikTestu.opcjonalny",
        "openapi:WynikTestu.lista",
    }


def test_http_wymagane_wyjasnienie_zwalnia_a_opcjonalne_nie(tmp_path: Path) -> None:
    wyjasnienie = {"properties": {"zdanie_pl": {"type": "string"}}, "type": "object"}
    status = {"enum": ["SPELNIA", "NIE_SPELNIA"], "type": "string"}
    sciezka = _migawka(
        tmp_path,
        {
            "WyjasnienieWerdyktu-Output": wyjasnienie,
            "Wprost": {
                "properties": {
                    "status": status,
                    "wyjasnienie": {"$ref": "#/components/schemas/WyjasnienieWerdyktu-Output"},
                },
                "required": ["status", "wyjasnienie"],
            },
            "PrzezAllOf": {
                "properties": {
                    "status": status,
                    "w": {"allOf": [{"$ref": "#/components/schemas/WyjasnienieWerdyktu-Output"}]},
                },
                "required": ["w"],
            },
            "Niewymagane": {
                "properties": {
                    "status": status,
                    "wyjasnienie": {"$ref": "#/components/schemas/WyjasnienieWerdyktu-Output"},
                },
                "required": ["status"],
            },
            "Nullowe": {
                "properties": {
                    "status": status,
                    "wyjasnienie": {
                        "anyOf": [
                            {"$ref": "#/components/schemas/WyjasnienieWerdyktu-Output"},
                            {"type": "null"},
                        ]
                    },
                },
                "required": ["status", "wyjasnienie"],
            },
        },
    )
    assert _tozsamosci(guard.sprawdz_http(sciezka)) == {
        "openapi:Niewymagane.status",
        "openapi:Nullowe.status",
    }


def test_http_brak_migawki_to_blad_srodowiska(tmp_path: Path) -> None:
    with pytest.raises(guard.BladSrodowiska):
        guard.sprawdz_http(tmp_path / "brak.json")


# ---------------------------------------------------------------------------
# Sprawdzenie 3 — frontend (AST TypeScript przez `node`; jeden bieg na zestaw)
# ---------------------------------------------------------------------------

PLIKI_FRONTENDU = {
    "ui2/wyniki/wzorzec/KartaWerdyktu.tsx": """
        export const KOLOR_SEMANTYKI = {
          pozytywna: 'var(--kolor-ok)',
          negatywna: 'var(--kolor-blad)',
          ostrzegawcza: 'var(--kolor-uwaga)',
          neutralna: 'var(--kolor-neutralny)',
        };
        export const ZAKAZANA_W_KARCIE = { SPELNIA: 'Kryterium spełnione', NIE_SPELNIA: 'Naruszone' };
        export function tonKarty(m: number) {
          return m < 0 ? 'error' : 'ok';
        }
        """,
    "ui2/oze/strings.ts": """
        export const ETYKIETY_WERDYKTU = { pass: 'spełniony', fail: 'niespełniony', no_data: 'brak' };
        export const KLASA = { PASS: styles.ok, FAIL: styles.bad };
        export const JEDEN_KLUCZ_ODWOLANIE = { ok: odpowiedz.ok, komunikat: 'Zapisano' };
        export const KODY = { OK: T.statusOk, INFO: T.info, WARN: T.warn };
        export const MAPA = new Map([['zgodny', 'Zgodny'], ['niezgodny', 'Niezgodny']]);
        export const SEMANTYKA_POZA_KARTA = { pozytywna: 'green', negatywna: 'red' };
        export const RANGI = { pass: 0, fail: 1 };
        """,
    "ui2/wyniki/progi.tsx": """
        const LIMIT_PCT = 5;
        export const PROG_MARGINESU = 0;
        export function ocenaDoboru(dU: number, limit: number = LIMIT_PCT) {
          const spadek = dU > limit ? 'ostrzezenie' : 'ok';
          return { spadek };
        }
        export function komorka(m: number) {
          return { ostrzezenie: m < PROG_MARGINESU };
        }
        export function napiecieNiezgodne(u: number) {
          return Math.abs(u - 15) > 0.5;
        }
        export function klasyfikuj(d: number) {
          if (d <= 2) return 'ok';
          if (d <= 5) return 'warn';
          return 'error';
        }
        export function uklad(n: number, xs: Wynik[]) {
          if (n >= 2) {
            for (const x of xs) {
              x.tone = 'ok';
            }
          }
          return n;
        }
        export function Kropka({ n }: { n: number }) {
          return <Status ok={n > 0} />;
        }
        export function bezStalej(pst: number, pstLimit: number) {
          const tone = pst > pstLimit ? 'error' : 'ok';
          return tone;
        }
        export function tylkoLiczba(x: number) {
          const szerokosc = x > 10 ? 'szeroka' : 'waska';
          return szerokosc;
        }
        """,
    "ui2/oze/__tests__/strings.test.ts": """
        export const W_TESCIE = { PASS: 'Spełnia', FAIL: 'Nie spełnia' };
        """,
    "ui2/oze/pomocnik.test.ts": """
        export const W_TESCIE = { PASS: 'Spełnia', FAIL: 'Nie spełnia' };
        """,
}


@pytest.fixture(scope="module")
def frontend(tmp_path_factory: pytest.TempPathFactory) -> dict[tuple[str, str], guard.Naruszenie]:
    korzen = tmp_path_factory.mktemp("fe") / "frontend" / "src"
    _zapisz(korzen, PLIKI_FRONTENDU)
    return {n.klucz: n for n in guard.sprawdz_frontend(korzen)}


def _fe(sprawdzenie: str, symbol: str) -> tuple[str, str]:
    return (sprawdzenie, symbol)


def test_frontend_mapa_po_statusie_jest_naruszeniem(frontend: dict) -> None:
    for symbol in ("ETYKIETY_WERDYKTU", "KLASA", "KODY", "MAPA"):
        assert _fe("3a_frontend_mapa", f"frontend/src/ui2/oze/strings.ts:{symbol}") in frontend


def test_frontend_rekord_i_mapa_na_liczby_nie_sa_mapa_etykiet(frontend: dict) -> None:
    for symbol in ("JEDEN_KLUCZ_ODWOLANIE", "RANGI"):
        assert _fe("3a_frontend_mapa", f"frontend/src/ui2/oze/strings.ts:{symbol}") not in frontend


def test_frontend_mapa_semantyki_dozwolona_tylko_w_karcie(frontend: dict) -> None:
    karta = "frontend/src/ui2/wyniki/wzorzec/KartaWerdyktu.tsx"
    assert _fe("3a_frontend_mapa", f"{karta}:KOLOR_SEMANTYKI") not in frontend
    assert (
        _fe("3a_frontend_mapa", "frontend/src/ui2/oze/strings.ts:SEMANTYKA_POZA_KARTA") in frontend
    )
    # Mapa po STATUSIE jest zakazana także w module karty.
    assert _fe("3a_frontend_mapa", f"{karta}:ZAKAZANA_W_KARCIE") in frontend


def test_frontend_porownanie_z_progiem_zasila_etykiete(frontend: dict) -> None:
    plik = "frontend/src/ui2/wyniki/progi.tsx"
    for symbol in (
        "ocenaDoboru.spadek",
        "komorka.ostrzezenie",
        "napiecieNiezgodne",
        "klasyfikuj",
        "Kropka.ok",
    ):
        assert _fe("3b_frontend_prog", f"{plik}:{symbol}") in frontend, symbol


def test_frontend_porownanie_bez_stalej_nie_jest_naruszeniem(frontend: dict) -> None:
    """GRANICA PRZYPIĘTA: porównanie dwóch wartości nie-stałych nie jest wykrywane (karta)."""
    plik = "frontend/src/ui2/wyniki/progi.tsx"
    assert _fe("3b_frontend_prog", f"{plik}:bezStalej.tone") not in frontend
    assert _fe("3b_frontend_prog", f"{plik}:tylkoLiczba.szerokosc") not in frontend
    # `if` z blokiem układu (etykieta głęboko w bloku) to nie gałąź etykiety.
    assert _fe("3b_frontend_prog", f"{plik}:uklad") not in frontend
    # Moduł karty jest zwolniony z reguły progu (kontrakt §12 pkt 3).
    karta = "frontend/src/ui2/wyniki/wzorzec/KartaWerdyktu.tsx"
    assert _fe("3b_frontend_prog", f"{karta}:tonKarty") not in frontend


def test_frontend_testy_sa_wylaczone(frontend: dict) -> None:
    assert not any("__tests__" in t or ".test." in t for _, t in frontend)


def test_frontend_tozsamosc_nie_zalezy_od_linii(tmp_path: Path) -> None:
    tresc = "export const ETYKIETY = { PASS: 'Spełnia', FAIL: 'Nie spełnia' };\n"
    _zapisz(tmp_path / "a", {"ui2/x.ts": tresc})
    _zapisz(tmp_path / "b", {"ui2/x.ts": "// przesunięcie\n\n\n" + tresc})
    przed = guard.sprawdz_frontend(tmp_path / "a")
    po = guard.sprawdz_frontend(tmp_path / "b")
    assert (
        [n.tozsamosc for n in przed]
        == [n.tozsamosc for n in po]
        == ["frontend/src/ui2/x.ts:ETYKIETY"]
    )
    assert przed[0].linia != po[0].linia


def test_frontend_brak_typescript_to_blad_srodowiska(tmp_path: Path) -> None:
    _zapisz(tmp_path / "src", {"ui2/x.ts": "export const A = 1;\n"})
    with pytest.raises(guard.BladSrodowiska):
        guard.sprawdz_frontend(tmp_path / "src", tmp_path / "brak_typescript")


def test_normalizacja_python_i_typescript_zgodne() -> None:
    """Predykaty parami: klucze FE normalizuje `node`, pola backendu — Python."""
    teksty = [
        "SPEŁNIA",
        "nie spełnia",
        "nonCompliant",
        "NIE_SPELNIA",
        "Poza obwiednią",
        "moduł wypadł",
        "notOk",
        "ZGODNE_Z_UWAGAMI",
        "Łódź",
    ]
    assert guard.normalizuj_w_typescript(teksty) == [guard.normalizuj(t) for t in teksty]


# ---------------------------------------------------------------------------
# Sprawdzenie 5 — kod wyliczenia w tekście dla człowieka (korpus A i B)
# ---------------------------------------------------------------------------

KONTRAKT_OSI_ATRAPA = """
from typing import Literal

StatusWerdyktu = Literal["SPELNIA", "NIE_SPELNIA", "NIE_DOTYCZY"]
KompletnoscDowodu = Literal["PELNY", "NIEPELNY", "NIE_DOTYCZY"]
StanZrodla = Literal["ZWERYFIKOWANE", "WSKAZANE", "NIEUSTALONE"]
Relacja = Literal["NIE_WIECEJ", "PASMO", "LOGICZNE"]
StatusModelu = Literal["UNVALIDATED_MODEL", "CERTIFIED_MODEL", "NIE_DOTYCZY"]
StanDanych = Literal["ZWALIDOWANE", "UNVALIDATED_INPUT"]
PokrycieProgramu = Literal["PELNE", "CZESCIOWE", "NIE_DOTYCZY"]
RodzajPodstawy = Literal["NORMA", "OSD", "WOS"]
KrokRegulyK = Literal["WYNIK", "METODA"]
"""

PROWENIENCJA_ATRAPA = """
from enum import StrEnum


class EvidenceTier(StrEnum):
    VALIDATED_SIMULATION = "VALIDATED_SIMULATION"
    DECLARATION = "DECLARATION"
"""

WALIDATOR_ATRAPA = '''
"""Moduł z kodem THD_U w docstringu — nie jest polem tekstu."""


def sprawdz(ref, Problem):
    yield Problem(code="E_KOD_MASZYNOWY", message_pl=f"Generator {ref} (REGULACJA_NAPIECIA).")
    yield {"powod_pl": "stan NIEUSTALONE", "kod": "NIE_DOTYCZY"}


class Wynik:
    def __init__(self) -> None:
        self.opis_pl = "program badań: PELNE"
'''


def _indeks_osi(tmp_path: Path, pliki: dict[str, str] | None = None) -> guard.IndeksBackendu:
    korzen = tmp_path / "backend" / "src"
    _zapisz(
        korzen,
        {
            "werdykt/__init__.py": "",
            "werdykt/kontrakt.py": KONTRAKT_OSI_ATRAPA,
            "werdykt/proweniencja.py": PROWENIENCJA_ATRAPA,
            **(pliki or {}),
        },
    )
    return guard.IndeksBackendu(korzen)


def _korpus(tmp_path: Path, fixtury: dict[str, object]) -> Path:
    katalog = tmp_path / "generated"
    katalog.mkdir(parents=True, exist_ok=True)
    for nazwa, dane in fixtury.items():
        (katalog / nazwa).write_text(json.dumps(dane, ensure_ascii=False), encoding="utf-8")
    return katalog


def test_kody_jednowyrazowe_z_osi_stanu_bez_skrotow_i_rzeczownikow(tmp_path: Path) -> None:
    """Zbiór wyprowadzony z aliasów osi STANU i wyliczeń proweniencji: bez skrótów prozy
    (`OSD`, `WOS`), bez rzeczowników spoza osi stanu (`NORMA`, `WYNIK`, `METODA`), bez kodów
    z podkreśleniem (te łapie wzorzec)."""
    assert guard.kody_jednowyrazowe(_indeks_osi(tmp_path)) == {
        "SPELNIA",
        "PELNY",
        "NIEPELNY",
        "ZWERYFIKOWANE",
        "WSKAZANE",
        "NIEUSTALONE",
        "PASMO",
        "LOGICZNE",
        "ZWALIDOWANE",
        "PELNE",
        "CZESCIOWE",
        "DECLARATION",
    }


def test_kody_jednowyrazowe_bez_aliasu_osi_to_blad_srodowiska(tmp_path: Path) -> None:
    indeks = _indeks_osi(tmp_path, {"werdykt/kontrakt.py": "StanZrodla = str\n"})
    with pytest.raises(guard.BladSrodowiska, match="nie jest aliasem"):
        guard.kody_jednowyrazowe(indeks)


@pytest.mark.parametrize(
    ("klucz", "tekst", "kody"),
    [
        # Kod z podkreśleniem w zdaniu `*_pl` (iniekcja z karty: VALIDATED_SIMULATION).
        ("zdanie_pl", "Symulacja na silniku VALIDATED_SIMULATION.", {"VALIDATED_SIMULATION"}),
        # Identyfikator wymagania z cyframi w segmentach.
        ("powod_pl", "wymaganie RFG_13_2 — LFSM-O", {"RFG_13_2"}),
        # Lista tekstów wyjaśnienia bez sufiksu `_pl`.
        ("czego_brakuje", ["Dana przyjęta (UNVALIDATED_INPUT)."], {"UNVALIDATED_INPUT"}),
        ("zastrzezenia", ["stan źródła NIEUSTALONE"], {"NIEUSTALONE"}),
        # Jednowyrazowy kod osi stanu w zdaniu.
        ("tresc_pl", "Kompletność dowodu: NIEPELNY", {"NIEPELNY"}),
        # Pole spoza tekstu dla człowieka — kod na swoim miejscu.
        ("status_maszynowy", "NIE_SPELNIA", set()),
        ("kryterium_id", "RFG_13_2", set()),
        # Identyfikator małymi literami — poza wzorcem karty (zmierzony w meldunku).
        ("zdanie_pl", "brak pola (harmonic_thdu_percent)", set()),
        # Rzeczownik wersalikami dla emfazy i skrót prozy — nie kod.
        ("recommended_action_pl", "WYNIK ROBOCZY; wymagania OSD i WOS", set()),
        # Nazwa polska zamiast kodu.
        ("zdanie_pl", "stan źródła „nieustalone”, model urządzenia niezwalidowany", set()),
    ],
)
def test_korpus_odpowiedzi_iloczyn_pola_i_ksztaltu_kodu(
    tmp_path: Path, klucz: str, tekst: object, kody: set[str]
) -> None:
    """Pole {`*_pl` · lista wyjaśnienia · pole rekordu} × kształt {kod z podkreśleniem · z
    cyframi · jednowyrazowy kod osi stanu · identyfikator małymi literami · emfaza · nazwa
    polska}, zagnieżdżony w liście obiektów (ścieżka `[]`)."""
    katalog = _korpus(tmp_path, {"scena.json": {"moduly": [{"ocena": {klucz: tekst}}]}})
    naruszenia = guard.sprawdz_kody_w_tekscie(_indeks_osi(tmp_path), katalog)
    sufiks = "[]" if isinstance(tekst, list) else ""
    assert _tozsamosci(naruszenia) == {
        f"scena.json:$.moduly[].ocena.{klucz}{sufiks}:{kod}" for kod in kody
    }
    assert all(n.sprawdzenie == "5_kod_w_tekscie" for n in naruszenia)


def test_korpus_literalow_argument_slownik_przypisanie_i_f_napis(tmp_path: Path) -> None:
    """Korpus B: literał w argumencie nazwanym, kluczu słownika, przypisaniu atrybutu
    i stałej części f-napisu; literał spoza pola tekstu (argument `code=`, klucz `kod`,
    docstring) nie jest naruszeniem."""
    indeks = _indeks_osi(tmp_path, {"app/__init__.py": "", "app/walidator.py": WALIDATOR_ATRAPA})
    naruszenia = guard.sprawdz_kody_w_tekscie(indeks, _korpus(tmp_path, {"pusta.json": {}}))
    assert _tozsamosci(naruszenia) == {
        "app.walidator:sprawdz.message_pl:REGULACJA_NAPIECIA",
        "app.walidator:sprawdz.powod_pl:NIEUSTALONE",
        "app.walidator:Wynik.__init__.self.opis_pl:PELNE",
    }
    assert {n.plik for n in naruszenia} == {"backend/src/app/walidator.py"}


def test_korpus_literalow_tozsamosc_nie_zalezy_od_linii(tmp_path: Path) -> None:
    tresc = 'def f(P):\n    return P(zdanie_pl="kod CERTIFIED_MODEL")\n'
    przed = guard.sprawdz_kody_w_tekscie(
        _indeks_osi(tmp_path / "a", {"app/__init__.py": "", "app/m.py": tresc}),
        _korpus(tmp_path / "a", {"x.json": {}}),
    )
    po = guard.sprawdz_kody_w_tekscie(
        _indeks_osi(tmp_path / "b", {"app/__init__.py": "", "app/m.py": "\n\n\n" + tresc}),
        _korpus(tmp_path / "b", {"x.json": {}}),
    )
    assert _tozsamosci(przed) == _tozsamosci(po) == {"app.m:f.zdanie_pl:CERTIFIED_MODEL"}
    assert [n.linia for n in przed] != [n.linia for n in po]


@pytest.mark.parametrize("stan", ["brak", "pusty", "uszkodzony"])
def test_korpus_odpowiedzi_brak_pusty_uszkodzony_to_blad_srodowiska(
    tmp_path: Path, stan: str
) -> None:
    """Zieleń bez korpusu nic by nie znaczyła — brak, pusty katalog i niepoprawny JSON to
    błąd środowiska (kod wyjścia 2), nie „zero naruszeń"."""
    katalog = tmp_path / "generated"
    if stan != "brak":
        katalog.mkdir()
    if stan == "uszkodzony":
        (katalog / "zla.json").write_text("{nie json", encoding="utf-8")
    with pytest.raises(guard.BladSrodowiska):
        guard.sprawdz_kody_w_tekscie(_indeks_osi(tmp_path), katalog)


# ---------------------------------------------------------------------------
# Sprawdzenie 6 — werdykt poza rekordem (karta AB-1a Pakiet E2)
#
# ILOCZYN CECH: {ładunek słownikowy (6a) · tekst składany (6b) · mapa warunkowa (6c)}
#   × {werdykt z `wyjasnienie` obok — dozwolony · bez wyjaśnienia — naruszenie · status spoza
#   słownika werdyktów — dozwolony} × {Python · TypeScript}. Każda z 18 komórek ma przypadek
#   w atrapach niżej (nazwy funkcji: `bez_wyjasnienia`/`z_wyjasnieniem`/`spoza_slownika` i ich
#   odpowiedniki TS), plus cechy brzegowe: `wyjasnienie: None`, klucz-mapy, samo `FAILED`,
#   stała importowana, człon wyliczenia, `dict(...)`, konstruktor z `wyjasnienie=`, dziennik,
#   proza zwykłą czcionką, `match`/`elif`/kolejne `if`/`?:`/`switch` z przejściem, tłumaczenie
#   słownika, rangi, rekord z wyjaśnieniem, renderer (sprawdzenie 4), pakiet `werdykt/`,
#   katalog wzorca i moduł karty.
# ---------------------------------------------------------------------------

STALE_ATRAPA = """
STAN_OK = "OK"
"""

LADUNKI_PY = """
from enum import Enum
from app.stale import STAN_OK


class Werdykt(str, Enum):
    PASS = "pass"
    FAIL = "fail"


def bez_wyjasnienia(x):
    return {"status": "OK", "wartosc": x}


def z_wyjasnieniem(x, w):
    return {"status": "PASS", "wartosc": x, "wyjasnienie": w}


def wyjasnienie_puste(x):
    return {"status": "PASS", "wyjasnienie": None}


def spoza_slownika(x):
    return {"status": "brak danych", "stan": "PENDING", "opis": "zgodny"}


def stala_i_enum(x):
    return {"verification_status": STAN_OK, "wynik": Werdykt.FAIL, "result": Werdykt.PASS.value}


def warunkowy(ok):
    return dict(status="PASS" if ok else "FAIL")


def klucz_mapy():
    return {"SPELNIA": "pass", "NIE_SPELNIA": "fail"}


def sam_failed():
    return {"status": "FAILED"}


def para_passed_failed(ok):
    return {"status": "PASSED" if ok else "FAILED"}


def mapa_w_galezi(s):
    return {"status": "OK" if s == "PASS" else "BLAD"}


def ladunek_lokalny(ok):
    wynik = "PASS" if ok else "FAIL"
    return {"status": wynik}


def lokalny_spoza_slownika(gotowy):
    stan = "GOTOWE" if gotowy else "W_TOKU"
    return {"status": stan}
"""

TEKSTY_PY = """
import logging

logger = logging.getLogger(__name__)
WERDYKT = "PASS"


def bez_wyjasnienia(n):
    return f"Wynik: {n} PASS"


def konkatenacja(n):
    return "Stan: " + str(n) + " — NIE SPEŁNIA"


def wstawka(ok, n):
    return f"Kryterium {n}: {'spełnia' if ok else 'nie spełnia'}"


def format_i_procent(n):
    a = "Werdykt: {} OK".format(n)
    b = "Werdykt %s: FAIL" % n
    return a, b


def proza(n):
    return f"Moduł {n} spełnia wymaganie art. 13 (PASSWORD, OKNO)."


def z_wyjasnieniem(n, w):
    return {"opis": f"Wynik: {n} PASS", "wyjasnienie": w}


def konstruktor(n, w, Rekord):
    return Rekord(opis=f"Wynik: {n} PASS", wyjasnienie=w)


def dziennik(n):
    logger.info(f"Walidacja {n}: OK")


def spoza_slownika(n):
    return f"Bieg {n}: FAILED, stan GOTOWE"


def stala_modulu(n):
    return f"Wynik {n}: {WERDYKT}"


def zmienna_lokalna(jednostki_zgodne, n):
    stan = "OK" if jednostki_zgodne else "BŁĄD"
    return f"Weryfikacja jednostek {n}: {stan}"


def zmienna_lokalna_w_dzienniku(ok, n):
    stan = "OK" if ok else "BŁĄD"
    logger.warning(f"Krok {n}: {stan}")
"""

MAPY_PY = """
from enum import Enum


class Stan(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"


ETYKIETY = {"PASS": "Spełnione", "FAIL": "Niespełnione"}
TLUMACZENIE = {"SPELNIA": "pass", "NIE_SPELNIA": "fail", "NIE_DOTYCZY": "not_required"}
RANGI = {"PASS": 0, "FAIL": 1}
STANY = {"PENDING": "W toku", "DONE": "Zakończony"}
Z_WYJASNIENIEM = {"PASS": {"etykieta": "Spełnione", "wyjasnienie": "zdanie"}}


def przez_match(s):
    match s:
        case "PASS":
            return "Spełnione"
        case "FAIL" | "ERROR":
            return "Niespełnione"
    return "—"


def przez_elif(s):
    if s == "OK":
        return "Warunek spełniony."
    elif s == "NOT_OK":
        return "Warunek niespełniony."
    return "Brak danych."


def kolejne_ify(s):
    if s == Stan.PASS:
        return "zielony"
    if s == Stan.FAIL:
        return "czerwony"
    return "szary"


def trojargumentowy(s):
    return "Spełnia" if s == "zgodny" else ("Nie spełnia" if s == "niezgodny" else "—")


def spoza_slownika(s):
    if s == "PENDING":
        return "W toku"
    return "Zakończony"


def z_wyjasnieniem(s, w):
    if s == "PASS":
        return {"etykieta": "Spełnione", "wyjasnienie": w}
    return {"etykieta": "—", "wyjasnienie": w}


def uklad(s, n):
    if s == "PASS":
        n += 1
    return n
"""


@pytest.fixture(scope="module")
def szesc_backend(tmp_path_factory: pytest.TempPathFactory) -> dict[str, set[str]]:
    korzen = tmp_path_factory.mktemp("s6") / "backend" / "src"
    _zapisz(
        korzen,
        {
            "werdykt/__init__.py": "",
            "werdykt/kontrakt.py": KONTRAKT_ATRAPA,
            "werdykt/wyjasnienie.py": 'def zdanie(n):\n    return f"Kryterium {n}: SPEŁNIA"\n',
            "app/__init__.py": "",
            "app/stale.py": STALE_ATRAPA,
            "app/ladunki.py": LADUNKI_PY,
            "app/teksty.py": TEKSTY_PY,
            "app/mapy.py": MAPY_PY,
            "app/raport_docx.py": "from docx import Document\n\nE = {'PASS': 'Spełnione'}\n",
        },
    )
    wynik: dict[str, set[str]] = {}
    for naruszenie in guard.sprawdz_werdykt_poza_rekordem(guard.IndeksBackendu(korzen)):
        wynik.setdefault(naruszenie.sprawdzenie, set()).add(naruszenie.tozsamosc)
    return wynik


def test_szesc_py_ladunek_iloczyn(szesc_backend: dict[str, set[str]]) -> None:
    """6a × Python: bez wyjaśnienia (także `wyjasnienie: None`, stała importowana, człon
    wyliczenia i `.value`, `dict(...)`, gałęzie `?:`, para PASSED/FAILED) — naruszenie; z
    wyjaśnieniem, spoza słownika, klucz mapy, samo FAILED — nie."""
    assert szesc_backend["6a_ladunek_werdyktu"] == {
        "app.ladunki:bez_wyjasnienia.status",
        "app.ladunki:wyjasnienie_puste.status",
        "app.ladunki:stala_i_enum.verification_status",
        "app.ladunki:stala_i_enum.wynik",
        "app.ladunki:stala_i_enum.result",
        "app.ladunki:warunkowy.status",
        "app.ladunki:para_passed_failed.status",
        # Status wybrany mapą warunkową (`"OK" if s == "PASS" else …`) to nadal ładunek z
        # werdyktem — 6c go nie zgłasza (wartość-kod), więc zwolnienie byłoby luką.
        "app.ladunki:mapa_w_galezi.status",
        # Zmienna lokalna funkcji (`wynik = "PASS" if ok else "FAIL"`) — wartości wszystkich
        # jej przypisań; zmienna o wartościach spoza słownika — nie.
        "app.ladunki:ladunek_lokalny.status",
    }


def test_szesc_py_tekst_iloczyn(szesc_backend: dict[str, set[str]]) -> None:
    """6b × Python: kod wersalikami w f-napisie, konkatenacji, `.format`, `%`, wstawka-literał
    i stała modułu — naruszenie; proza zwykłą czcionką (i słowa zawierające kod: PASSWORD,
    OKNO), rekord i konstruktor z `wyjasnienie`, dziennik, samo FAILED, pakiet `werdykt/` —
    nie."""
    assert szesc_backend["6b_tekst_werdyktu"] == {
        "app.teksty:bez_wyjasnienia:PASS",
        "app.teksty:konkatenacja:NIE_SPELNIA",
        "app.teksty:wstawka:SPELNIA",
        "app.teksty:wstawka:NIE_SPELNIA",
        "app.teksty:format_i_procent.a:OK",
        "app.teksty:format_i_procent.b:FAIL",
        "app.teksty:stala_modulu:PASS",
        "app.teksty:zmienna_lokalna:OK",
    }


def test_szesc_py_mapa_iloczyn(szesc_backend: dict[str, set[str]]) -> None:
    """6c × Python: literał słownika poza rendererem, `match` z alternatywą, `elif`, kolejne
    `if` na członach wyliczenia, łańcuch `a if x == … else …` — naruszenie; tłumaczenie
    słownika na słownik (`SPELNIA` → `pass`), gałąź-kod w ładunku (`"OK" if s == "PASS"`),
    rangi, stany spoza słownika, rekordy z `wyjasnienie`, gałąź bez `return`/przypisania,
    renderer (sprawdzenie 4) — nie."""
    assert szesc_backend["6c_mapa_statusu"] == {
        "app.mapy:ETYKIETY",
        "app.mapy:przez_match",
        "app.mapy:przez_elif",
        "app.mapy:kolejne_ify",
        "app.mapy:trojargumentowy",
    }


LADUNKI_TS = """
export const bezWyjasnienia = (x: number) => ({ status: 'OK', wartosc: x });
export const zWyjasnieniem = (x: number, wyjasnienie: string) => ({ status: 'PASS', wartosc: x, wyjasnienie });
export const wyjasnieniePuste = () => ({ status: 'PASS', wyjasnienie: null });
export const spozaSlownika = () => ({ status: 'PENDING', stan: 'brak danych', opis: 'zgodny' });
export const warunkowy = (ok: boolean) => ({ verificationStatus: ok ? 'pass' : 'fail' });
export const zEnumem = () => ({ wynik: Werdykt.PASS });
export const kluczMapy = { SPELNIA: 'Spełnia', NIE_SPELNIA: 'Nie spełnia' };
export const samFailed = () => ({ status: 'FAILED' });
"""

TEKSTY_TS = """
export const bezWyjasnienia = (n: number) => `Wynik: ${n} PASS`;
export const konkatenacja = (n: number) => 'Stan: ' + n + ' — NIE SPEŁNIA';
export const wstawka = (ok: boolean, n: number) => `Kryterium ${n}: ${ok ? 'spełnia' : 'nie spełnia'}`;
export const proza = (n: number) => `Moduł ${n} spełnia wymaganie art. 13 (PASSWORD, OKNO).`;
export const zWyjasnieniem = (n: number, w: string) => ({ opis: `Wynik: ${n} PASS`, wyjasnienie: w });
export function Plakietka({ ok }: { ok: boolean }) {
  return <span>{ok ? 'SPEŁNIA' : 'NIE SPEŁNIA'}</span>;
}
export function PlakietkaZWyjasnieniem({ ok, w }: { ok: boolean; w: string }) {
  return <Karta wyjasnienie={w}>{ok ? 'OK' : 'BŁĄD'}</Karta>;
}
export const dziennik = (n: number) => console.info(`Walidacja ${n}: OK`);
export const spozaSlownika = (n: number) => `Bieg ${n}: FAILED, stan GOTOWE`;
export function stalaLokalna(ok: boolean, n: number) {
  const stan = ok ? 'OK' : 'BŁĄD';
  return `Weryfikacja ${n}: ${stan}`;
}
export function stalaLokalnaSpozaSlownika(gotowy: boolean, n: number) {
  const stan = gotowy ? 'GOTOWE' : 'W TOKU';
  return `Bieg ${n}: ${stan}`;
}
"""

MAPY_TS = """
export function przezSwitch(s: string): string {
  switch (s) {
    case 'PASS':
      return 'Spełnione';
    case 'FAIL':
    case 'ERROR':
      return 'Niespełnione';
    default:
      return '—';
  }
}
export function przezIf(s: string): string {
  if (s === 'OK') return 'Warunek spełniony.';
  if (s === 'NOT_OK') return 'Warunek niespełniony.';
  return 'Brak danych.';
}
export function przezElse(s: string) {
  if (s === 'zgodny') {
    return T.zgodny;
  } else if (s === 'niezgodny') {
    return T.niezgodny;
  }
  return T.brak;
}
export const trojargumentowy = (s: string) => (s === 'PASS' ? 'Spełnia' : s === 'FAIL' ? 'Nie spełnia' : '—');
export function tlumaczenie(s: string) {
  switch (s) {
    case 'SPELNIA':
      return 'pass';
    case 'NIE_SPELNIA':
      return 'fail';
    default:
      return 'no_data';
  }
}
export function spozaSlownika(s: string) {
  switch (s) {
    case 'PENDING':
      return 'W toku';
    case 'DONE':
      return 'Zakończony';
  }
  return '';
}
export function zWyjasnieniem(s: string, w: string) {
  switch (s) {
    case 'PASS':
      return { etykieta: 'Spełnione', wyjasnienie: w };
    default:
      return { etykieta: '—', wyjasnienie: w };
  }
}
export function semantyka(s: string) {
  switch (s) {
    case 'pozytywna':
      return 'green';
    case 'negatywna':
      return 'red';
    default:
      return 'gray';
  }
}
"""

KARTA_TS = """
export function kolorSemantyki(s: string) {
  switch (s) {
    case 'pozytywna':
      return 'var(--ok)';
    case 'negatywna':
      return 'var(--blad)';
    default:
      return 'var(--neutralny)';
  }
}
export function etykietaStatusu(s: string) {
  switch (s) {
    case 'SPELNIA':
      return 'Kryterium spełnione';
    case 'NIE_SPELNIA':
      return 'Kryterium naruszone';
  }
  return '—';
}
"""

SLAD_TS = """
export function opisStatusu(status: string) {
  if (status === 'PASS') return 'Spełnione';
  if (status === 'FAIL') return 'Niespełnione';
  return 'Ostrzeżenie';
}
"""


@pytest.fixture(scope="module")
def szesc_frontend(tmp_path_factory: pytest.TempPathFactory) -> dict[str, set[str]]:
    korzen = tmp_path_factory.mktemp("s6fe") / "frontend" / "src"
    _zapisz(
        korzen,
        {
            "ui2/x/ladunki.ts": LADUNKI_TS,
            "ui2/x/teksty.tsx": TEKSTY_TS,
            "ui2/x/mapy.ts": MAPY_TS,
            "ui2/wyniki/wzorzec/KartaWerdyktu.tsx": KARTA_TS,
            "ui2/wyniki/wzorzec/SladSekcyjny.tsx": SLAD_TS,
            "ui2/x/__tests__/mapy.test.ts": MAPY_TS,
        },
    )
    wynik: dict[str, set[str]] = {}
    for naruszenie in guard.sprawdz_frontend(korzen):
        wynik.setdefault(naruszenie.sprawdzenie, set()).add(naruszenie.tozsamosc)
    return wynik


def test_szesc_ts_ladunek_iloczyn(szesc_frontend: dict[str, set[str]]) -> None:
    """6a × TypeScript: ta sama reguła klucza co w Pythonie (camelCase `verificationStatus`),
    wartość z `?:` i człon wyliczenia WIELKIMI LITERAMI — naruszenie; skrót `wyjasnienie`,
    spoza słownika, klucz mapy, samo FAILED — nie."""
    plik = "frontend/src/ui2/x/ladunki.ts"
    assert szesc_frontend["6a_ladunek_werdyktu"] == {
        f"{plik}:bezWyjasnienia.status",
        f"{plik}:wyjasnieniePuste.status",
        f"{plik}:warunkowy.verificationStatus",
        f"{plik}:zEnumem.wynik",
    }


def test_szesc_ts_tekst_iloczyn(szesc_frontend: dict[str, set[str]]) -> None:
    """6b × TypeScript: szablon, konkatenacja, wstawka-literał, plakietka `?:` w treści JSX —
    naruszenie; proza, obiekt i element JSX z `wyjasnienie`, `console.*`, samo FAILED — nie."""
    plik = "frontend/src/ui2/x/teksty.tsx"
    assert szesc_frontend["6b_tekst_werdyktu"] == {
        f"{plik}:bezWyjasnienia:PASS",
        f"{plik}:konkatenacja:NIE_SPELNIA",
        f"{plik}:wstawka:SPELNIA",
        f"{plik}:wstawka:NIE_SPELNIA",
        f"{plik}:Plakietka:SPELNIA",
        f"{plik}:Plakietka:NIE_SPELNIA",
        f"{plik}:stalaLokalna:OK",
    }


def test_szesc_ts_mapa_iloczyn(szesc_frontend: dict[str, set[str]]) -> None:
    """6c × TypeScript: `switch` z przejściem, kolejne `if`, `else if` na odwołaniach (dwa
    klucze słownika), łańcuch `?:`, semantyka poza kartą, mapa statusu w module karty i w
    katalogu wzorca, a w interfejsie także „tłumaczenie” na kody (`'pass'` — jak w 3a każdy
    literał tekstu) — naruszenie; stany spoza słownika, rekordy z `wyjasnienie`, semantyka
    w module karty, testy — nie."""
    mapy = "frontend/src/ui2/x/mapy.ts"
    wzorzec = "frontend/src/ui2/wyniki/wzorzec"
    assert szesc_frontend["6c_mapa_statusu"] == {
        f"{mapy}:przezSwitch",
        f"{mapy}:przezIf",
        f"{mapy}:przezElse",
        f"{mapy}:trojargumentowy",
        f"{mapy}:semantyka",
        f"{mapy}:tlumaczenie",
        f"{wzorzec}/KartaWerdyktu.tsx:etykietaStatusu",
        f"{wzorzec}/SladSekcyjny.tsx:opisStatusu",
    }


def test_szesc_tozsamosc_nie_zalezy_od_linii(tmp_path: Path) -> None:
    tresc = "def f(n):\n    return {'status': 'OK', 'opis': f'Wynik {n}: PASS'}\n"
    przed = guard.sprawdz_werdykt_poza_rekordem(_backend(tmp_path / "a", {"app/m.py": tresc}))
    po = guard.sprawdz_werdykt_poza_rekordem(
        _backend(tmp_path / "b", {"app/m.py": "\n\n\n" + tresc})
    )
    assert _tozsamosci(przed) == _tozsamosci(po) == {"app.m:f.status", "app.m:f.opis:PASS"}
    assert [n.linia for n in przed] != [n.linia for n in po]


@pytest.mark.parametrize(
    ("tekst", "kody"),
    [
        ("Wynik PASS.", ["PASS"]),
        ("stan: NIE SPEŁNIA", ["NIE_SPEŁNIA"]),
        ("NIE_SPELNIA", ["NIE_SPELNIA"]),
        ("OUT OF RANGE, NON-COMPLIANT", ["OUT_OF_RANGE", "NON_COMPLIANT"]),
        ("out of range", []),
        ("[OK] OKNO PASSWORD Ok", ["OK"]),
        ("POZA OBWIEDNIĄ", ["POZA_OBWIEDNIĄ"]),
        ("Stan: NIESPEŁNIONA", ["NIESPEŁNIONA"]),
        ("NIE SPEŁNIA", ["NIE_SPEŁNIA"]),
        ("NIE: SPEŁNIA", ["SPEŁNIA"]),
        ("FAILED", ["FAILED"]),
    ],
)
def test_kody_wersalikami_n_gramy(tekst: str, kody: list[str]) -> None:
    """N-gram WERSALIKAMI rozdzielony wyłącznie odstępem/dywizem; `FAILED` jest kandydatem,
    werdyktem staje się dopiero w parze z `PASSED` (`wartosci_werdyktowe`)."""
    assert guard.kody_werdyktu_wersalikami(tekst) == kody


def test_kody_wersalikami_python_i_typescript_zgodne() -> None:
    """Predykaty parami: kody w tekście backendu wyznacza Python, frontendu — `node`."""
    teksty = [
        "Wynik PASS.",
        "stan: NIE SPEŁNIA",
        "OUT OF RANGE, NON-COMPLIANT",
        "[OK] OKNO PASSWORD Ok",
        "POZA OBWIEDNIĄ i W OBWIEDNI",
        "NIE SPEŁNIA",
        "NIE: SPEŁNIA",
        "ZGODNE_Z_UWAGAMI, ZGODNE",
        "moduł spełnia wymaganie",
    ]
    assert guard.kody_w_typescript(teksty) == [guard.kody_werdyktu_wersalikami(t) for t in teksty]


def test_slownik_obejmuje_rozstrzygajace_statusy_kontraktu() -> None:
    """JEDNO ŹRÓDŁO słownika: statusy kontraktu o semantyce pozytywnej/negatywnej (słownik
    etykiet `werdykt.etykiety`, jedyne mapowanie §9) należą do słownika strażnika — zmiana
    nazwy statusu rozstrzygającego w kontrakcie zapala ten test, zamiast rozjechać strażnik."""
    sys.path.insert(0, str(guard.BACKEND_SRC))
    from werdykt.etykiety import SLOWNIK_ETYKIET  # noqa: PLC0415

    rozstrzygajace = {
        guard.normalizuj(pozycja.status)
        for pozycja in SLOWNIK_ETYKIET
        if pozycja.semantyka in ("pozytywna", "negatywna")
    }
    assert rozstrzygajace == {"spelnia", "nie_spelnia"}
    assert rozstrzygajace <= guard.SLOWNIK_WERDYKTOW


@pytest.mark.parametrize(
    ("klucz", "oczekiwany"),
    [
        ("status", True),
        ("verification_status", True),
        ("trvStatus", True),
        ("werdyktPass", True),
        ("wynik", True),
        ("result", True),
        ("ocena_ok", True),
        ("is_ok", True),
        ("stan", False),
        ("opis", False),
        ("statusy_liczba", False),
        ("tone", False),
    ],
)
def test_klucz_werdyktu(klucz: str, oczekiwany: bool) -> None:
    assert guard.klucz_werdyktu(klucz) is oczekiwany


# ---------------------------------------------------------------------------
# Lista dozwolona i zapadka
# ---------------------------------------------------------------------------


def _n(tozsamosc: str, sprawdzenie: str = "1_backend") -> guard.Naruszenie:
    return guard.Naruszenie(sprawdzenie, tozsamosc, "backend/src/x.py", 1, "opis")


def _wpis(tozsamosc: str, klasa: str = "MIGRACJA", sprawdzenie: str = "1_backend") -> dict:
    return {
        "sprawdzenie": sprawdzenie,
        "tozsamosc": tozsamosc,
        "klasa": klasa,
        "uzasadnienie_pl": "uzasadnienie" if klasa == "ENUM_WEWNETRZNY" else "",
        "wiersz_inwentarza": None,
    }


def test_zapadka_nowa_tozsamosc_jest_czerwona() -> None:
    bledy, _ = guard.porownaj_z_lista([_n("a:A.x"), _n("a:B.y")], [_wpis("a:A.x")])
    assert len(bledy) == 1 and "[nowa-tozsamosc]" in bledy[0] and "a:B.y" in bledy[0]


def test_zapadka_w_dol_wpis_migracja_bez_naruszenia_jest_czerwony() -> None:
    bledy, _ = guard.porownaj_z_lista([], [_wpis("a:A.x")])
    assert len(bledy) == 1
    assert "[zapadka-w-dol]" in bledy[0] and "usuń wpis z listy (zapadka w dół)" in bledy[0]


def test_zapadka_wpis_enum_bez_naruszenia_moze_trwac() -> None:
    bledy, informacje = guard.porownaj_z_lista([], [_wpis("a:A.x", "ENUM_WEWNETRZNY")])
    assert bledy == [] and len(informacje) == 1


def test_zapadka_klucz_obejmuje_sprawdzenie() -> None:
    """Ta sama tożsamość w innym sprawdzeniu to INNE naruszenie."""
    bledy, _ = guard.porownaj_z_lista(
        [_n("x:A", "3a_frontend_mapa")], [_wpis("x:A", sprawdzenie="3b_frontend_prog")]
    )
    assert len(bledy) == 2


@pytest.mark.parametrize(
    ("wpisy", "fragment"),
    [
        ([_wpis("a"), _wpis("a")], "powtórzona tożsamość"),
        ([{**_wpis("a", "ENUM_WEWNETRZNY"), "uzasadnienie_pl": " "}], "bez uzasadnienia"),
        ([{**_wpis("a"), "klasa": "LEGACY_USUNAC"}], "nieznana klasa"),
        ([{**_wpis("a"), "sprawdzenie": "5_inne"}], "nieznane sprawdzenie"),
        ([{k: v for k, v in _wpis("a").items() if k != "wiersz_inwentarza"}], "wiersz_inwentarza"),
    ],
)
def test_lista_uszkodzona_to_blad_srodowiska(tmp_path: Path, wpisy: list, fragment: str) -> None:
    sciezka = tmp_path / "lista.json"
    sciezka.write_text(json.dumps({"wpisy": wpisy}), encoding="utf-8")
    with pytest.raises(guard.BladSrodowiska, match=fragment):
        guard.wczytaj_liste(sciezka)


def test_main_blad_srodowiska_zwraca_2(monkeypatch: pytest.MonkeyPatch) -> None:
    def _brak(**_kwargs: object) -> list:
        raise guard.BladSrodowiska("brak `node`")

    monkeypatch.setattr(guard, "zmierz", _brak)
    assert guard.main([]) == 2


# ---------------------------------------------------------------------------
# Inwentarz — propozycja klasy (`--zmierz`)
# ---------------------------------------------------------------------------

INWENTARZ_ATRAPA = """
## 0. Podsumowanie
| MIGRACJA | 1 |

## Obszar A — solvery
### K. V12.6 (`v126.py`) — wszystko trafia do API
| 20 | `:45` (`_status`), `:1909` | status | S | L | API | MIGRACJA | powód |
| 31 | `:897` | `z_neg.present` | Re | n/a | API | ENUM_WEWNETRZNY | wskaźnik fizyczny |

## Obszar C — application
**15.** `application/analyses/hosting.py:110, :180` · wewnętrzny FAIL. **ENUM_WEWNETRZNY**.
**16.** `hosting.py:300` · `Raport.werdykt` bez limitu. **MIGRACJA**.

## Obszar D — ui2
1. `$UI2/oze/macierz/strings.ts:171-184` `ETYKIETY_WERDYKTU` → `MacierzNcRfg.tsx:633`. **MIGRACJA**.
2. `SekcjaZgodnosci.tsx:42` `KLASA_STATUSU`. **ENUM_WEWNETRZNY.**
"""


@pytest.fixture()
def inwentarz(tmp_path: Path) -> list[guard.WierszInwentarza]:
    _zapisz(
        tmp_path / "backend" / "src",
        {
            "network_model/solvers/v126.py": "",
            "api/v126.py": "",
            "application/analyses/hosting.py": "",
        },
    )
    _zapisz(
        tmp_path / "frontend" / "src",
        {
            "ui2/oze/macierz/strings.ts": "",
            "ui2/oze/macierz/MacierzNcRfg.tsx": "",
            "ui2/oze/macierz/SekcjaZgodnosci.tsx": "",
        },
    )
    sciezka = tmp_path / "inwentarz.md"
    sciezka.write_text(INWENTARZ_ATRAPA, encoding="utf-8")
    return guard.wczytaj_inwentarz(
        sciezka, tmp_path / "backend" / "src", tmp_path / "frontend" / "src"
    )


def test_inwentarz_parsuje_trzy_formaty_i_dziedziczy_plik_naglowka(inwentarz: list) -> None:
    wiersze = {w.identyfikator: w for w in inwentarz}
    assert set(wiersze) == {"A20", "A31", "C15", "C16", "D1", "D2"}
    # Plik z nagłówka sekcji, rozwiązany w zakresie obszaru A (nie `api/v126.py`).
    assert wiersze["A20"].odwolania == (
        ("network_model/solvers/v126.py", ((45, 45), (1909, 1909))),
    )
    # Skrócona nazwa pliku dostaje katalog z drzewa.
    assert wiersze["C16"].odwolania[0][0] == "application/analyses/hosting.py"
    assert wiersze["D2"].odwolania[0][0] == "ui2/oze/macierz/SekcjaZgodnosci.tsx"
    assert wiersze["C15"].klasa == "ENUM_WEWNETRZNY" and wiersze["D1"].klasa == "MIGRACJA"


def test_inwentarz_propozycja_klasy(inwentarz: list) -> None:
    def propozycja(sprawdzenie: str, tozsamosc: str, plik: str, linia: int, symbole: tuple):
        naruszenie = guard.Naruszenie(sprawdzenie, tozsamosc, plik, linia, "opis", symbole)
        return guard.zaproponuj_klase(naruszenie, inwentarz)

    # ENUM: linia w zakresie wiersza ENUM.
    klasa, uzasadnienie, wiersz = propozycja(
        "1_backend",
        "application.analyses.hosting:W.status",
        "backend/src/application/analyses/hosting.py",
        112,
        ("W", "str", "status"),
    )
    assert (klasa, wiersz) == ("ENUM_WEWNETRZNY", "C15") and "C15" in uzasadnienie
    # MIGRACJA: symbol swoisty wiersza MIGRACJA wygrywa z samym plikiem.
    klasa, _, wiersz = propozycja(
        "1_backend",
        "application.analyses.hosting:Raport.werdykt",
        "backend/src/application/analyses/hosting.py",
        700,
        ("Raport", "str", "werdykt"),
    )
    assert (klasa, wiersz) == ("MIGRACJA", "C16")
    # Tylko plik (bez linii i symbolu) — MIGRACJA z adnotacją, nawet gdy wiersz jest ENUM.
    klasa, _, wiersz = propozycja(
        "3a_frontend_mapa",
        "frontend/src/ui2/oze/macierz/SekcjaZgodnosci.tsx:INNA",
        "frontend/src/ui2/oze/macierz/SekcjaZgodnosci.tsx",
        500,
        ("INNA",),
    )
    assert klasa == "MIGRACJA" and wiersz == "D2 (dopasowanie po pliku)"
    # Spoza inwentarza.
    klasa, _, wiersz = propozycja(
        "1_backend", "api.inne:X.status", "backend/src/api/inne.py", 1, ("X", "status")
    )
    assert (klasa, wiersz) == ("MIGRACJA", None)


def test_lista_z_pomiaru_zachowuje_klase_istniejacych_tozsamosci() -> None:
    naruszenia = [_n("a:A.x"), _n("werdykt.decyzja:P.status")]
    stare = [{**_wpis("a:A.x", "ENUM_WEWNETRZNY"), "uzasadnienie_pl": "decyzja zarządcy"}]
    wpisy = guard.lista_z_pomiaru(naruszenia, stare, [])
    assert wpisy[0]["klasa"] == "ENUM_WEWNETRZNY"
    assert wpisy[0]["uzasadnienie_pl"] == "decyzja zarządcy"
    assert wpisy[1]["klasa"] == "ENUM_WEWNETRZNY" and "werdykt/" in wpisy[1]["uzasadnienie_pl"]


# ---------------------------------------------------------------------------
# Bieżące drzewo
# ---------------------------------------------------------------------------


def test_biezace_drzewo_zielone_z_biezaca_lista() -> None:
    """PIN: lista dozwolona jest POMIAREM drzewa (`--zmierz --zapisz`), nie decyzją.

    Czerwień tego testu razem z guardem znaczy: w drzewie pojawiła się nowa tożsamość
    z lakonicznym werdyktem albo zniknęło naruszenie MIGRACJA, którego wpisu nie zdjęto
    (zapadka w dół) — w obu przypadkach listę poprawia się w TYM SAMYM commicie.
    """
    assert guard.main([]) == 0
