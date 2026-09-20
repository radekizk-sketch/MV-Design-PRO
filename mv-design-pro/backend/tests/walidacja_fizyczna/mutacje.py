"""HARNESS MUTACJI: wstrzykniecie defektu fizycznego i sprawdzenie, czy bramki go widza.

PO CO. Zielona bramka nie dowodzi niczego, dopoki nie wiadomo, CO potrafi zaczerwienic.
Mutacja jest odwrotnoscia testu: psujemy jedno rownanie i zadamy, zeby aparat dowodowy
to zglosil. Mutacja, ktora PRZEZYWA, jest defektem ZESTAWU BRAMEK — i tak jest
raportowana, nie jako „drobiazg".

IZOLACJA. Zadna mutacja nie dotyka drzewa roboczego. Dla kazdej powstaje katalog
tymczasowy z LUSTREM `src/` zlozonym z dowiazan symbolicznych (`cp -as`); podmieniany
jest wylacznie ten JEDEN plik, ktory mutacja psuje, a bramki biegna w osobnym procesie
z `PYTHONPATH` wskazujacym lustro. Przerwanie biegu nie zostawia zmutowanego repo.

SAMOKONTROLA HARNESSU (R10 par. 24). Harness, ktory melduje „zabite" dla zmiany bez
skutku, jest gorszy od braku harnessu, bo produkuje falszywa pewnosc. Dlatego kazda
mutacja jest KWALIFIKOWANA przed biegiem przez porownanie DRZEW SKLADNIOWYCH pliku
przed i po podmianie:

* tekst sie nie zmienil            -> `BEZ ZMIANY TEKSTU` (wzorzec nie pasuje do zrodla),
* tekst inny, AST identyczne       -> `MUTACJA NIEWAZNA` (zmiana bez skutku, np. komentarz),
* AST inne, bramki czerwone/wyjatek-> `ZABITA`,
* AST inne, bramki zielone         -> `PRZEZYLA` (luka w zestawie bramek).

Wariant „MUTACJA NIEWAZNA" NIGDY nie jest liczony jako zabicie — pilnuje tego wlasny
test harnessu, ktory wstrzykuje zmiane samego komentarza.
"""

from __future__ import annotations

import ast
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

KORZEN_BACKENDU = Path(__file__).resolve().parents[2]
KATALOG_ZRODEL = KORZEN_BACKENDU / "src"


@dataclass(frozen=True)
class Mutacja:
    """Jeden wstrzykiwany defekt: co psuje fizycznie i ktora bramka ma to zlapac."""

    ident: str
    defekt_fizyczny: str
    plik: str
    przed: str
    po: str
    oczekiwany_detektor: str
    bramki: tuple[str, ...] = ()


#: Zamkniety zestaw mutacji rdzenia dynamiki. Kazda psuje INNE rownanie albo INNY
#: mechanizm ochronny; oczekiwany detektor jest nazwany, wiec „zabite przez cokolwiek"
#: nie przechodzi za dowod.
MUTACJE: tuple[Mutacja, ...] = (
    Mutacja(
        "M10",
        "Odwrocony znak tlumienia w rownaniu wahan: moment tlumiacy zaczyna "
        "pompowac energie zamiast ja rozpraszac.",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "- self.d_pu * odchylka_predkosci",
        "+ self.d_pu * odchylka_predkosci",
        "G4 (tlumienie modu) oraz G12 (monotoniczny spadek energii przy D > 0)",
        bramki=("g2_g4_mod_elektromechaniczny", "g11_g12_energia"),
    ),
    Mutacja(
        "M11",
        "Odwrocony znak mocy elektrycznej: maszyna przyspiesza tam, gdzie powinna hamowac.",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "                    - moc_elektryczna\n",
        "                    + moc_elektryczna\n",
        "G2 (czestotliwosc modu), G3 (ROCOF), G11 (calka pierwsza)",
        bramki=("g2_g4_mod_elektromechaniczny", "g3_rocof_w_chwili_zwarcia", "g11_g12_energia"),
    ),
    Mutacja(
        "M12",
        "Bezwladnosc 2H zamieniona na H: mod elektromechaniczny przyspiesza sqrt(2) razy.",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "                / (2.0 * self.h_s),",
        "                / (1.0 * self.h_s),",
        "G2 (czestotliwosc modu), G3 (ROCOF), G10 (czas krytyczny)",
        bramki=("g2_g4_mod_elektromechaniczny", "g3_rocof_w_chwili_zwarcia"),
    ),
    Mutacja(
        "M13",
        "Usunieta pulsacja bazowa z rownania kata: kat przestaje byc calka predkosci.",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "                self.omega_bazowa_rad_s * odchylka_predkosci,",
        "                odchylka_predkosci,",
        "G2 (czestotliwosc modu), G10 (czas krytyczny)",
        bramki=("g2_g4_mod_elektromechaniczny",),
    ),
    Mutacja(
        "M14",
        "Odwrocony KIERUNEK zmiany bazy stalej bezwladnosci (H skalowane jak impedancja).",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "        h_s=zmiana_bazy_stalej_bezwladnosci(\n",
        "        h_s=zmiana_bazy_impedancji(\n",
        "G6 (ta sama maszyna w innej bazie urzadzenia)",
        bramki=("g6_inna_baza_urzadzenia",),
    ),
    Mutacja(
        "M15",
        "Odwrocony KIERUNEK zmiany bazy reaktancji przejsciowej (X'd skalowane jak H).",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "        x_prim_pu=zmiana_bazy_impedancji(x_prim_pu, s_n_mva, s_bazowa_mva),",
        "        x_prim_pu=zmiana_bazy_stalej_bezwladnosci(x_prim_pu, s_n_mva, s_bazowa_mva),",
        "G6 (ta sama maszyna w innej bazie urzadzenia)",
        bramki=("g6_inna_baza_urzadzenia",),
    ),
    Mutacja(
        "M16",
        "Czestotliwosc wezlowa liczona z |V| zamiast |V|^2: tozsamosc przestaje byc "
        "niezmiennikiem skali napiecia.",
        "network_model/solvers/dynamika/obserwable.py",
        "    pochodna_kata = (pochodna_napiecia_pu_s * napiecie_pu.conjugate()).imag / (modul * modul)",
        "    pochodna_kata = (pochodna_napiecia_pu_s * napiecie_pu.conjugate()).imag / modul",
        "G7 (czestotliwosc wezlowa wobec pochodnej analitycznej)",
        bramki=("g7_czestotliwosc_wezlowa",),
    ),
    Mutacja(
        "M17",
        "Pominiety czlon czestotliwosci znamionowej: wezel melduje samo odchylenie.",
        "network_model/solvers/dynamika/obserwable.py",
        "    f_hz = f_bazowa_hz + pochodna_kata / (2.0 * math.pi)",
        "    f_hz = pochodna_kata / (2.0 * math.pi)",
        "G7 (czestotliwosc wezlowa wobec pochodnej analitycznej)",
        bramki=("g7_czestotliwosc_wezlowa",),
    ),
    Mutacja(
        "M18",
        "Bramka fail-closed czestotliwosci wylaczona: fazor wewnatrz wlasnej kuli "
        "niepewnosci nadal melduje kat jako wynik.",
        "network_model/solvers/dynamika/obserwable.py",
        "    if not math.isfinite(niepewnosc_napiecia_pu) or modul <= niepewnosc_napiecia_pu:",
        "    if False:",
        "test jednostkowy obserwabli (granica |V| <= u_V nieosiagalna z poziomu biegu)",
        bramki=("g8_granica_odmowy",),
    ),
    Mutacja(
        "M19",
        "Usuniety warunek istnienia punktu pracy: wyspa z odbiorem i bez zrodla wraca "
        "do „zbieznosci” przy |V| rzedu 1e11 pu albo do surowego OverflowError.",
        "network_model/solvers/dynamika/siec.py",
        "    sprawdz_zasilanie_wysp(",
        "    _wylaczone_sprawdz_zasilanie_wysp(",
        "G13 (wyspa bez zrodla konczy sie odmowa nazwana)",
        bramki=("g13_wyspa_bez_zrodla",),
    ),
    Mutacja(
        "M20",
        "Zdarzenie przyciagane do najblizszego wezla siatki zamiast wykonywane w "
        "chwili zadanej.",
        "network_model/solvers/dynamika/silnik.py",
        "            kandydaci.append(wpis.t_s)",
        "            kandydaci.append(round(wpis.t_s / nastawy.dt_s) * nastawy.dt_s)",
        "G5 (czas wykonania zdarzenia)",
        bramki=("g5_czas_zdarzenia",),
    ),
    Mutacja(
        "M21",
        "MUTACJA KONTROLNA BEZ SKUTKU — zmiana samego komentarza. Harness MUSI "
        "zakwalifikowac ja jako niewazna, a nie zameldowac zabicia.",
        "network_model/solvers/dynamika/siec.py",
        "#: Wspolczynnik warunku Armijo",
        "#: WSPOLCZYNNIK warunku Armijo",
        "BRAK — mutacja kontrolna samokontroli harnessu",
        bramki=(),
    ),
)


def _lustro_zrodel(katalog: Path) -> Path:
    """Katalog `src` zlozony z dowiazan symbolicznych — tani i nieniszczacy."""
    lustro = katalog / "src"
    subprocess.run(["cp", "-as", str(KATALOG_ZRODEL), str(lustro)], check=True)
    return lustro


def _podmien(lustro: Path, mutacja: Mutacja) -> tuple[str, str]:
    """Zamien dowiazanie na realny plik z podmieniona trescia. Zwroc (przed, po)."""
    cel = lustro / mutacja.plik
    tresc = cel.read_text()
    if mutacja.przed not in tresc:
        raise AssertionError(
            f"{mutacja.ident}: wzorzec nie wystepuje w {mutacja.plik} — "
            "mutacja opisuje kod, ktorego juz nie ma"
        )
    zmutowana = tresc.replace(mutacja.przed, mutacja.po, 1)
    cel.unlink()
    cel.write_text(zmutowana)
    return tresc, zmutowana


def kwalifikuj(przed: str, po: str) -> str:
    """BEZ ZMIANY TEKSTU / MUTACJA NIEWAZNA / MUTACJA WAZNA — z porownania AST."""
    if przed == po:
        return "BEZ ZMIANY TEKSTU"
    if ast.dump(ast.parse(przed)) == ast.dump(ast.parse(po)):
        return "MUTACJA NIEWAZNA"
    return "MUTACJA WAZNA"


def uruchom_bramki(lustro: Path, limit_s: float = 3600.0, wybrane: tuple[str, ...] = ()) -> dict:
    """Bramki w OSOBNYM procesie na zmutowanym lustrze zrodel."""
    srodowisko = dict(os.environ)
    if wybrane:
        srodowisko["WALIDACJA_BRAMKI"] = ",".join(wybrane)
    else:
        srodowisko.pop("WALIDACJA_BRAMKI", None)
    srodowisko["PYTHONPATH"] = f"{lustro}{os.pathsep}{KORZEN_BACKENDU}"
    srodowisko["PYTHONDONTWRITEBYTECODE"] = "1"
    proces = subprocess.run(
        [sys.executable, "-m", "tests.walidacja_fizyczna.bramki"],
        cwd=str(KORZEN_BACKENDU),
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=limit_s,
    )
    try:
        return json.loads(proces.stdout)
    except json.JSONDecodeError:
        return {
            "WSZYSTKIE_PASS": False,
            "WYJATEK": f"bieg bramek nie zwrocil JSON (kod {proces.returncode}): "
            + (proces.stderr or proces.stdout)[-400:],
        }


def wykonaj(mutacja: Mutacja, limit_s: float = 3600.0) -> dict:
    """Pelny cykl jednej mutacji: lustro -> podmiana -> kwalifikacja -> bramki -> werdykt."""
    katalog = Path(tempfile.mkdtemp(prefix=f"mutacja-{mutacja.ident}-"))
    try:
        lustro = _lustro_zrodel(katalog)
        przed, po = _podmien(lustro, mutacja)
        kwalifikacja = kwalifikuj(przed, po)
        if kwalifikacja != "MUTACJA WAZNA":
            return {
                "mutacja": mutacja.ident,
                "defekt_fizyczny": mutacja.defekt_fizyczny,
                "plik": mutacja.plik,
                "kwalifikacja": kwalifikacja,
                "oczekiwany_detektor": mutacja.oczekiwany_detektor,
                "faktyczny_detektor": None,
                "WERDYKT": kwalifikacja,
            }
        pomiary = uruchom_bramki(lustro, limit_s=limit_s, wybrane=mutacja.bramki)
        werdykt = pomiary.get("WERDYKT", {})
        czerwone = sorted(k for k, v in werdykt.items() if v == "FAIL")
        wyjatek = pomiary.get("WYJATEK")
        zabita = bool(czerwone) or bool(wyjatek)
        return {
            "mutacja": mutacja.ident,
            "defekt_fizyczny": mutacja.defekt_fizyczny,
            "plik": mutacja.plik,
            "kwalifikacja": kwalifikacja,
            "oczekiwany_detektor": mutacja.oczekiwany_detektor,
            "faktyczny_detektor": czerwone
            or (["WYJATEK: " + str(wyjatek)[:200]] if wyjatek else []),
            "WERDYKT": "ZABITA" if zabita else "PRZEZYLA",
        }
    finally:
        shutil.rmtree(katalog, ignore_errors=True)


if __name__ == "__main__":  # pragma: no cover — wejscie harnessu
    wybrane = sys.argv[1:] or [m.ident for m in MUTACJE]
    wyniki = [wykonaj(m) for m in MUTACJE if m.ident in wybrane]
    for wiersz in wyniki:
        print(json.dumps(wiersz, ensure_ascii=False), flush=True)
    print("=== PODSUMOWANIE ===")
    print(
        json.dumps(
            {
                "zabite": sorted(w["mutacja"] for w in wyniki if w["WERDYKT"] == "ZABITA"),
                "przezyly": sorted(w["mutacja"] for w in wyniki if w["WERDYKT"] == "PRZEZYLA"),
                "niewazne": sorted(
                    w["mutacja"] for w in wyniki if w["WERDYKT"] == "MUTACJA NIEWAZNA"
                ),
                "bez_zmiany_tekstu": sorted(
                    w["mutacja"] for w in wyniki if w["WERDYKT"] == "BEZ ZMIANY TEKSTU"
                ),
            },
            indent=1,
            ensure_ascii=False,
        )
    )
