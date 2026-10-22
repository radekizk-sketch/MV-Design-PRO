"""Testy własne `brama_pelna.py` — podział pełnej bramki lokalnej na współbieżne kroki.

Reguła KLASA pkt 2 i 4: obietnica „te same zbiory co dotąd, tylko współbieżnie” ma przypięty
test dla KAŻDEGO zbioru, który dzielimy albo szeregujemy (iloczyn: zbiór × liczba shardów),
oraz dla mechanizmów, na których współbieżność polega (budżet rdzeni, krok wyłączny, porty,
dysk, kod wyjścia całości).
"""

from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

import brama_pelna as brama
import e2e_shardy
import guardy_z_ci
import pytest

# --- podział zbiorów --------------------------------------------------------------------------


@pytest.mark.parametrize("liczba", [1, 2, 3, 4, 7])
def test_shardy_e2e_sa_rozlaczne_i_daja_komplet_specow(tmp_path: Path, liczba: int) -> None:
    """Iloczyn: liczba shardów × komplet `e2e/*.spec.ts` — żaden spec nie znika ani nie dubluje."""
    kroki = brama.kroki_e2e(tmp_path, liczba)
    assert len(kroki) == liczba
    pliki: list[str] = []
    for krok in kroki:
        pliki += [a for a in krok.polecenie if a.endswith(".spec.ts")]
    assert sorted(pliki) == e2e_shardy.speki(), "shardy e2e nie sa podzialem kompletu speckow"


def test_kazdy_shard_e2e_ma_wlasny_backend_porty_baze_i_cache(tmp_path: Path) -> None:
    """Izolacja: porty przydzielane przy starcie (dwa), raport i cache Vite osobne per shard;
    katalog bazy NIE jest podany — `playwright.config.ts` tworzy własny per proces runnera."""
    kroki = brama.kroki_e2e(tmp_path, 4)
    for krok in kroki:
        assert krok.zmienne_portow == ("PLAYWRIGHT_BACKEND_PORT", "PLAYWRIGHT_FRONTEND_PORT")
        srodowisko = dict(krok.srodowisko)
        assert "PLAYWRIGHT_E2E_TMP" not in srodowisko
        assert "PLAYWRIGHT_BACKEND_DATABASE_URL" not in srodowisko
        assert srodowisko["PLAYWRIGHT_BACKEND_PYTHON"] == sys.executable
        assert "--reporter=line,json" in krok.polecenie
    for klucz in ("PLAYWRIGHT_JSON_OUTPUT_NAME", "MVD_VITE_CACHE_DIR"):
        wartosci = [dict(k.srodowisko)[klucz] for k in kroki]
        assert len(set(wartosci)) == len(kroki), f"{klucz} wspolny dla shardow"


@pytest.mark.parametrize("liczba", [1, 2, 4, 5])
def test_shardy_vitest_pokrywaja_k_z_n_i_zachowuja_pojedynczy_plik_naraz(
    tmp_path: Path, liczba: int
) -> None:
    kroki = [k for k in brama.kroki_vitest(tmp_path, liczba) if not k.wylacznie]
    assert [next(a for a in k.polecenie if a.startswith("--shard=")) for k in kroki] == [
        f"--shard={k}/{liczba}" for k in range(1, liczba + 1)
    ]
    for krok in kroki:
        assert "--no-file-parallelism" in krok.polecenie
    assert len({dict(k.srodowisko)["MVD_VITE_CACHE_DIR"] for k in kroki}) == liczba


def test_budzety_vitest_to_jedyny_krok_wylaczny_i_nie_jest_shardowany(tmp_path: Path) -> None:
    plan = brama.zbuduj_plan(tmp_path, 3, 2, 4, 4)
    wylaczne = [k for k in plan if k.wylacznie]
    assert [k.nazwa for k in wylaczne] == ["vitest budzety"]
    assert "--mode" in wylaczne[0].polecenie and "budzety" in wylaczne[0].polecenie
    assert not any(a.startswith("--shard=") for a in wylaczne[0].polecenie)


def test_plan_zawiera_komplet_guardow_lintu_i_npm_z_ci(tmp_path: Path) -> None:
    """Warunek wejścia i wyjścia z JEDNEGO źródła: workflowy (przez `guardy_z_ci`)."""
    plan = brama.zbuduj_plan(tmp_path, 3, 2, 4, 4)
    guardy = [k.nazwa for k in plan if k.grupa == "guardy"]
    oczekiwane = [" ".join((n, *a)) for n, a in guardy_z_ci.wywolania_z_workflowow()]
    assert sorted(guardy) == sorted(oczekiwane)
    assert len(guardy) >= guardy_z_ci.MIN_GUARDOW
    assert sorted(k.nazwa for k in plan if k.grupa == "lint") == sorted(
        n for n, _p in guardy_z_ci.LINT_JAK_CI
    )
    assert sorted(k.nazwa for k in plan if k.grupa == "npm") == sorted(
        f"npm run {s}" for s in guardy_z_ci.NPM_JAK_CI
    )


def test_pytest_backendu_to_te_same_selekcja_i_dystrybucja_co_w_ci(tmp_path: Path) -> None:
    backend, samotesty = brama.kroki_pytest(tmp_path, 3, 2)
    # `-m pytest` (moduł) poprzedza `-m <selekcja markerów>`: bierzemy drugie wystąpienie.
    selekcja = backend.polecenie.index("-m", backend.polecenie.index("-m") + 1)
    assert backend.polecenie[selekcja + 1] == "not pandapower and not andes"
    assert backend.polecenie[backend.polecenie.index("--dist") + 1] == "loadfile"
    assert "-k" not in backend.polecenie and "--deselect" not in backend.polecenie
    assert backend.polecenie[backend.polecenie.index("-n") + 1] == "3" and backend.waga == 3.0
    assert str(guardy_z_ci.SCRIPTS_DIR) in samotesty.polecenie
    assert samotesty.polecenie[samotesty.polecenie.index("-n") + 1] == "2"
    assert "-k" not in samotesty.polecenie
    assert samotesty.polecenie.count("-m") == 1, "samotesty maja miec selekcje markerow"
    assert "not pandapower" not in " ".join(samotesty.polecenie)


# --- dowód kompletności -----------------------------------------------------------------------


def _raport_vitest(pliki: list[str], testow_na_plik: int = 2) -> dict:
    return {
        "numTotalTests": len(pliki) * testow_na_plik,
        "numPassedTests": len(pliki) * testow_na_plik,
        "numFailedTests": 0,
        "numPendingTests": 0,
        "numTodoTests": 0,
        "testResults": [{"name": p} for p in pliki],
    }


PELNY = [f"/f/src/t{i}.test.ts" for i in range(10)]


def test_kompletne_shardy_vitest_przechodza_i_licza_testy() -> None:
    raporty = [_raport_vitest(PELNY[0::2]), _raport_vitest(PELNY[1::2])]
    dowody, bledy = brama.sprawdz_shardy_vitest(raporty, PELNY, "v")
    assert bledy == []
    assert "10 plikow" in dowody[0] and "testow 20" in dowody[0]


@pytest.mark.parametrize(
    ("raporty", "fragment"),
    [
        ([_raport_vitest(PELNY[0::2]), _raport_vitest(PELNY[1::2][:-1])], "nie wykonany"),
        ([_raport_vitest(PELNY[0::2]), _raport_vitest(PELNY[1::2] + [PELNY[0]])], "dwoch shardach"),
        ([_raport_vitest(PELNY + ["/f/src/obcy.test.ts"])], "spoza pelnego zbioru"),
    ],
    ids=["utracony-plik", "plik-w-dwoch-shardach", "plik-spoza-zbioru"],
)
def test_niekompletne_shardy_vitest_sa_bledem(raporty: list[dict], fragment: str) -> None:
    _dowody, bledy = brama.sprawdz_shardy_vitest(raporty, PELNY, "v")
    assert any(fragment in b for b in bledy), bledy


def _raport_pw(spec: dict[str, int]) -> dict:
    """Raport w układzie JSON Playwrighta: plik -> liczba testów."""
    return {
        "suites": [
            {
                "file": plik,
                "specs": [{"tests": [{"status": "expected"}] * liczba}],
            }
            for plik, liczba in spec.items()
        ]
    }


def test_kompletne_shardy_e2e_przechodza_przez_liste_pelna() -> None:
    pelna = _raport_pw({"a.spec.ts": 3, "b.spec.ts": 2, "c.spec.ts": 1})
    pliki = ["e2e/a.spec.ts", "e2e/b.spec.ts", "e2e/c.spec.ts"]
    raporty = [_raport_pw({"a.spec.ts": 3}), _raport_pw({"b.spec.ts": 2, "c.spec.ts": 1})]
    dowody, bledy = brama.sprawdz_shardy_e2e(raporty, pelna, pliki)
    assert bledy == [] and "6 testow" in dowody[0]


@pytest.mark.parametrize(
    ("raporty", "fragment"),
    [
        ([_raport_pw({"a.spec.ts": 3}), _raport_pw({"b.spec.ts": 2})], "testow w shardach 5"),
        ([_raport_pw({"a.spec.ts": 2, "b.spec.ts": 2, "c.spec.ts": 1})], "testow w shardach 5"),
        (
            [
                _raport_pw({"a.spec.ts": 3, "b.spec.ts": 2}),
                _raport_pw({"b.spec.ts": 1, "c.spec.ts": 0}),
            ],
            "w wiecej niz jednym shardzie",
        ),
        ([_raport_pw({"a.spec.ts": 3, "b.spec.ts": 3})], "spec bez wykonanego testu"),
    ],
    ids=["zgubiony-shard", "zgubione-testy", "spec-w-dwoch-shardach", "spec-bez-testow"],
)
def test_niekompletne_shardy_e2e_sa_bledem(raporty: list[dict], fragment: str) -> None:
    pelna = _raport_pw({"a.spec.ts": 3, "b.spec.ts": 2, "c.spec.ts": 1})
    pliki = ["e2e/a.spec.ts", "e2e/b.spec.ts", "e2e/c.spec.ts"]
    _dowody, bledy = brama.sprawdz_shardy_e2e(raporty, pelna, pliki)
    assert any(fragment in b for b in bledy), bledy


# --- pula krokow -------------------------------------------------------------------------------


def _krok(nazwa: str, waga: float = 1.0, szacunek: float = 1.0, **ustawienia: object) -> brama.Krok:
    return brama.Krok(
        nazwa=nazwa,
        grupa="t",
        polecenie=("x",),
        katalog=Path("."),
        waga=waga,
        szacunek_s=szacunek,
        **ustawienia,  # type: ignore[arg-type]
    )


class _Zegar:
    """Sztuczny wykonawca: rejestruje jednoczesność i kolejność, zwraca zadany RC."""

    def __init__(self, rc: dict[str, int] | None = None, czas: float = 0.05) -> None:
        self.rc = rc or {}
        self.czas = czas
        self.blokada = threading.Lock()
        self.biegnie: list[brama.Krok] = []
        self.max_waga = 0.0
        self.max_liczba = 0
        self.zdarzenia: list[tuple[str, str]] = []

    def __call__(self, krok: brama.Krok, _logi: Path, t0: float) -> brama.Wynik:
        with self.blokada:
            self.biegnie.append(krok)
            self.max_waga = max(self.max_waga, sum(k.waga for k in self.biegnie))
            self.max_liczba = max(self.max_liczba, len(self.biegnie))
            self.zdarzenia.append(("start", krok.nazwa))
        time.sleep(self.czas)
        with self.blokada:
            self.biegnie.remove(krok)
            self.zdarzenia.append(("koniec", krok.nazwa))
        return brama.Wynik(krok=krok, rc=self.rc.get(krok.nazwa, 0), start_s=0.0, koniec_s=1.0)


def test_pula_nie_przekracza_budzetu_i_zwraca_wyniki_w_kolejnosci_planu(tmp_path: Path) -> None:
    kroki = [_krok(f"k{i}", waga=1.5 if i % 2 else 1.0, szacunek=float(i)) for i in range(12)]
    zegar = _Zegar()
    wyniki = brama.wykonaj(kroki, 4.0, tmp_path, uruchom=zegar, komunikat=lambda _t: None)
    assert [w.krok.nazwa for w in wyniki] == [k.nazwa for k in kroki]
    assert all(w.rc == 0 for w in wyniki)
    assert zegar.max_waga <= 4.0
    assert zegar.max_liczba >= 2, "pula nie uruchamia niczego wspolbieznie"


def test_najdluzszy_szacunek_startuje_pierwszy(tmp_path: Path) -> None:
    kroki = [
        _krok("krotki", szacunek=1),
        _krok("dlugi", szacunek=100),
        _krok("sredni", szacunek=10),
    ]
    zegar = _Zegar()
    brama.wykonaj(kroki, 1.0, tmp_path, uruchom=zegar, komunikat=lambda _t: None)
    startowe = [n for z, n in zegar.zdarzenia if z == "start"]
    assert startowe == ["dlugi", "sredni", "krotki"]


def test_krok_ciezki_nie_jest_glodzony_strumieniem_lekkich(tmp_path: Path) -> None:
    """Rezerwacja budżetu: ciężki krok, który się nie mieści, startuje przed lekkimi za nim."""
    kroki = [
        _krok("tlo", waga=3.0, szacunek=200),
        _krok("ciezki", waga=2.0, szacunek=100),
        *[_krok(f"lekki{i}", szacunek=1.0 - i / 100) for i in range(6)],
    ]
    zegar = _Zegar(czas=0.1)
    brama.wykonaj(kroki, 4.0, tmp_path, uruchom=zegar, komunikat=lambda _t: None)
    startowe = [n for z, n in zegar.zdarzenia if z == "start"]
    assert startowe[:2] == ["tlo", "ciezki"], startowe


def test_lekkie_kroki_wypelniaja_luki_obok_kroku_dlugiego(tmp_path: Path) -> None:
    """Rezerwacja nie może zamienić puli w kolejkę szeregową: lekkie kroki biegną obok."""
    kroki = [_krok("tlo", waga=2.0, szacunek=200)] + [
        _krok(f"l{i}", szacunek=1.0) for i in range(4)
    ]
    zegar = _Zegar(czas=0.1)
    brama.wykonaj(kroki, 4.0, tmp_path, uruchom=zegar, komunikat=lambda _t: None)
    assert zegar.max_liczba >= 3


def test_krok_ciezszy_niz_budzet_biegnie_sam_zamiast_zakleszczenia(tmp_path: Path) -> None:
    kroki = [_krok("gruby", waga=10.0, szacunek=5), _krok("cienki", szacunek=1)]
    zegar = _Zegar()
    wyniki = brama.wykonaj(kroki, 4.0, tmp_path, uruchom=zegar, komunikat=lambda _t: None)
    assert all(w.rc == 0 for w in wyniki)
    assert zegar.zdarzenia[:2] == [("start", "gruby"), ("koniec", "gruby")]


def test_krok_wylaczny_startuje_dopiero_po_wszystkich_pozostalych(tmp_path: Path) -> None:
    kroki = [_krok("budzety", szacunek=1000, wylacznie=True)] + [
        _krok(f"k{i}", szacunek=float(i)) for i in range(6)
    ]
    zegar = _Zegar()
    brama.wykonaj(kroki, 3.0, tmp_path, uruchom=zegar, komunikat=lambda _t: None)
    zdarzenia = zegar.zdarzenia
    assert zdarzenia[-2:] == [("start", "budzety"), ("koniec", "budzety")]
    assert sum(1 for z, _n in zdarzenia if z == "koniec") == 7


def test_czerwony_krok_nie_zatrzymuje_reszty_a_kod_calosci_jest_niezerowy(tmp_path: Path) -> None:
    kroki = [_krok(f"k{i}") for i in range(5)]
    zegar = _Zegar(rc={"k2": 1})
    wyniki = brama.wykonaj(kroki, 3.0, tmp_path, uruchom=zegar, komunikat=lambda _t: None)
    assert [w.rc for w in wyniki] == [0, 0, 1, 0, 0], "czerwony krok ucial pozostale"
    _tekst, dane, kod = brama.podsumuj(wyniki, ["d"], [], 1.0, 4)
    assert kod == 1 and sum(1 for k in dane["kroki"] if k["rc"] != 0) == 1


def test_wyjatek_wykonawcy_jest_czerwienia_kroku_a_nie_zawieszeniem(tmp_path: Path) -> None:
    def wybucha(krok: brama.Krok, _l: Path, _t: float) -> brama.Wynik:
        if krok.nazwa == "zly":
            raise RuntimeError("awaria")
        return brama.Wynik(krok=krok, rc=0)

    wyniki = brama.wykonaj(
        [_krok("zly"), _krok("dobry")], 2.0, tmp_path, uruchom=wybucha, komunikat=lambda _t: None
    )
    assert {w.krok.nazwa: w.rc for w in wyniki} == {"zly": 125, "dobry": 0}


def test_krok_z_wymaganiem_dysku_czeka_gdy_cos_biegnie(tmp_path: Path) -> None:
    kroki = [
        _krok("tlo", szacunek=100),
        _krok("duzy_dysk", szacunek=1, wymagane_dysku_mb=1000),
    ]
    zegar = _Zegar(czas=0.2)
    brama.wykonaj(
        kroki,
        4.0,
        tmp_path,
        uruchom=zegar,
        wolne_dysku=lambda: 10.0,
        komunikat=lambda _t: None,
    )
    assert zegar.zdarzenia == [
        ("start", "tlo"),
        ("koniec", "tlo"),
        ("start", "duzy_dysk"),
        ("koniec", "duzy_dysk"),
    ], "krok wymagajacy dysku ruszyl obok innych mimo braku miejsca"


def test_krok_z_wymaganiem_dysku_startuje_obok_innych_gdy_miejsca_dosc(tmp_path: Path) -> None:
    kroki = [_krok("tlo", szacunek=100), _krok("duzy_dysk", szacunek=1, wymagane_dysku_mb=1000)]
    zegar = _Zegar(czas=0.2)
    brama.wykonaj(
        kroki, 4.0, tmp_path, uruchom=zegar, wolne_dysku=lambda: 5000.0, komunikat=lambda _t: None
    )
    assert zegar.max_liczba == 2


# --- uruchamianie procesu i porty ---------------------------------------------------------------


def test_uruchom_krok_zwraca_kod_wyjscia_czas_procesora_i_log(tmp_path: Path) -> None:
    krok = brama.Krok(
        nazwa="probka",
        grupa="t",
        polecenie=(
            sys.executable,
            "-c",
            "x=sum(i*i for i in range(2_000_000)); print('ok'); exit(3)",
        ),
        katalog=tmp_path,
    )
    wynik = brama._uruchom_krok(krok, tmp_path / "logi", time.monotonic())
    assert wynik.rc == 3
    assert wynik.cpu_s > 0.0
    assert wynik.log is not None and "ok" in wynik.log.read_text(encoding="utf-8")


def test_uruchom_krok_przydziela_krokowi_porty_przez_zmienne_srodowiska(tmp_path: Path) -> None:
    krok = brama.Krok(
        nazwa="porty",
        grupa="t",
        polecenie=(
            sys.executable,
            "-c",
            "import os; print(os.environ['PA'], os.environ['PB'], os.environ['STALA'])",
        ),
        katalog=tmp_path,
        srodowisko=(("STALA", "wartosc"),),
        zmienne_portow=("PA", "PB"),
    )
    wynik = brama._uruchom_krok(krok, tmp_path / "logi", time.monotonic())
    assert wynik.rc == 0 and set(wynik.porty) == {"PA", "PB"}
    assert wynik.log is not None
    assert f"{wynik.porty['PA']} {wynik.porty['PB']} wartosc" in wynik.log.read_text(
        encoding="utf-8"
    )


def test_porty_sa_unikalne_miedzy_watkami_i_omijaja_zajete() -> None:
    import socket

    zajety = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    zajety.bind(("127.0.0.1", 0))
    zajety.listen()
    port_zajety = zajety.getsockname()[1]
    try:
        wyniki: list[list[int]] = []
        blokada = threading.Lock()

        def pobierz() -> None:
            porty = brama.zajmij_porty(2, od=port_zajety)
            with blokada:
                wyniki.append(porty)

        watki = [threading.Thread(target=pobierz) for _ in range(6)]
        for w in watki:
            w.start()
        for w in watki:
            w.join()
        wszystkie = [p for para in wyniki for p in para]
        assert len(wszystkie) == 12 and len(set(wszystkie)) == 12
        assert port_zajety not in wszystkie
    finally:
        zajety.close()


# --- kod wyjscia calosci -----------------------------------------------------------------------


def _wynik(nazwa: str, rc: int | None) -> brama.Wynik:
    return brama.Wynik(krok=_krok(nazwa), rc=rc, start_s=0.0, koniec_s=2.0, cpu_s=1.0)


def test_kod_calosci_zerowy_tylko_gdy_kazdy_krok_zielony_i_zbior_kompletny() -> None:
    zielone = [_wynik("a", 0), _wynik("b", 0)]
    assert brama.podsumuj(zielone, ["d"], [], 1.0, 4)[2] == 0
    assert brama.podsumuj([*zielone, _wynik("c", 1)], ["d"], [], 1.0, 4)[2] == 1
    assert brama.podsumuj([*zielone, _wynik("c", None)], ["d"], [], 1.0, 4)[2] == 1
    assert brama.podsumuj(zielone, ["d"], ["brak pliku"], 1.0, 4)[2] == 1


def test_wynik_zawiera_rc_i_czas_kazdego_kroku() -> None:
    tekst, dane, _kod = brama.podsumuj([_wynik("a", 0), _wynik("b", 2)], [], [], 5.0, 4)
    assert [(k["nazwa"], k["rc"], k["czas_s"]) for k in dane["kroki"]] == [
        ("a", 0, 2.0),
        ("b", 2, 2.0),
    ]
    assert "RC=2" in tekst and "CZERWONA" in tekst


def test_katalog_logow_w_drzewie_repozytorium_jest_bledem_uzycia() -> None:
    assert brama.main(["--logi", str(brama.PROJEKT / "tmp_logi"), "--tylko-plan"]) == 2
