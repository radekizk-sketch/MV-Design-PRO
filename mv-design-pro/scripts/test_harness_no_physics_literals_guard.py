"""Testy `harness_no_physics_literals_guard.py` (karta HARNESS-RESZTA, 2026-09-16).

Dowod czerwonej iniekcji: wzorce LAPIA nowy literal fizyki i nowy reczny
`run_id`, a NIE lapia odczytu z importu fixtury (`stanFazowyScenyWyniki.
run_id`, `wiersz.ikss_ka`) — deklaracja bez testu jest falszywa pewnoscia
(CLAUDE.md, regula KLASA NIE INSTANCJA pkt 4).
"""

from __future__ import annotations

import harness_no_physics_literals_guard as guard


class TestWzorzecLiteraluFizyki:
    def test_lapie_pole_z_sufiksem_ka(self) -> None:
        assert guard.WZORZEC_LITERALU_FIZYKI.search("ikss_ka: 8.4,")

    def test_lapie_pole_z_sufiksem_mw(self) -> None:
        assert guard.WZORZEC_LITERALU_FIZYKI.search("p_mw: 3.9, q_mvar: 0.8,")

    def test_lapie_pole_loading_pct(self) -> None:
        assert guard.WZORZEC_LITERALU_FIZYKI.search("loading_pct: 38.5,")

    def test_lapie_liczbe_ujemna(self) -> None:
        assert guard.WZORZEC_LITERALU_FIZYKI.search("delta_v_pu: -0.024,")

    def test_nie_lapie_pola_bez_jednostki(self) -> None:
        # `min_position`/`iterations` sa konfiguracja/licznikami, nie fizyka.
        assert guard.WZORZEC_LITERALU_FIZYKI.search("min_position: -9,") is None
        assert guard.WZORZEC_LITERALU_FIZYKI.search("iterations: 4,") is None

    def test_nie_lapie_odczytu_z_importu_fixtury(self) -> None:
        # `stanFazowyScenyWyniki.rows[0].ikss_ka` uzyte w warunku/logu — brak
        # dwukropka + cyfry wprost po nazwie pola, wiec to NIE jest literal.
        assert (
            guard.WZORZEC_LITERALU_FIZYKI.search("const x = wiersz.ikss_ka > prog;")
            is None
        )


class TestWzorzecRecznegoRunId:
    def test_lapie_run_id_literal(self) -> None:
        assert guard.WZORZEC_RECZNEGO_RUN_ID.search("run_id: 'run-lf-1',")

    def test_lapie_id_literal_w_zasiewie_biegu(self) -> None:
        assert guard.WZORZEC_RECZNEGO_RUN_ID.search(
            "id: 'run-dyn', analysis_type: 'X',"
        )

    def test_nie_lapie_odczytu_run_id_z_importu(self) -> None:
        assert (
            guard.WZORZEC_RECZNEGO_RUN_ID.search("id: stanFazowyScenyWyniki.run_id,")
            is None
        )

    def test_nie_lapie_run_id_spoza_prefiksu_run(self) -> None:
        # Kontrakt scen wymaga prefiksu `run-` (`run_id = "run-<rodzaj>-scena-<nazwa>"`,
        # docstring `eksport_fixtur_harnessu.py`) — inny identyfikator nie jest bieegiem.
        assert guard.WZORZEC_RECZNEGO_RUN_ID.search("id: 'case-demo',") is None


class TestZnajdzNaruszeniaCzerwonaIniekcja:
    """Dowod klasy: wstrzykniecie JEDNEGO nowego literalu/run_id do tresci
    podnosi licznik o dokladnie jeden — guard, wpiety w main(), zapaliby sie
    na tej roznicy wobec PROG (test integracyjny main() nizej)."""

    def test_wstrzykniety_literal_fizyki_podnosi_licznik_o_jeden(self) -> None:
        bazowy = "const X = {\n  status: 'PASS',\n};\n"
        literaly_bazowe, _ = guard.znajdz_naruszenia(bazowy)
        wstrzykniety = bazowy.replace(
            "status: 'PASS',", "status: 'PASS',\n  ikss_ka: 12.3,"
        )
        literaly_po, _ = guard.znajdz_naruszenia(wstrzykniety)
        assert len(literaly_po) == len(literaly_bazowe) + 1

    def test_wstrzykniety_reczny_run_id_podnosi_licznik_o_jeden(self) -> None:
        bazowy = "const X = {\n  status: 'PASS',\n};\n"
        _, run_idy_bazowe = guard.znajdz_naruszenia(bazowy)
        wstrzykniety = bazowy.replace(
            "status: 'PASS',", "status: 'PASS',\n  run_id: 'run-nowy-1',"
        )
        _, run_idy_po = guard.znajdz_naruszenia(wstrzykniety)
        assert len(run_idy_po) == len(run_idy_bazowe) + 1

    def test_odczyt_z_fixtury_nie_podnosi_zadnego_licznika(self) -> None:
        bazowy = "const X = {\n  status: 'PASS',\n};\n"
        literaly_bazowe, run_idy_bazowe = guard.znajdz_naruszenia(bazowy)
        z_importem = bazowy.replace(
            "status: 'PASS',",
            "status: 'PASS',\n  run_id: stanFazowyScenyWyniki.run_id,\n"
            "  ikss_ka: wiersz.ikss_ka,",
        )
        literaly_po, run_idy_po = guard.znajdz_naruszenia(z_importem)
        assert len(literaly_po) == len(literaly_bazowe)
        assert len(run_idy_po) == len(run_idy_bazowe)


class TestBiezacyStanDrzewaMatchujePROG:
    """Pin miedzy zapadka a stanem repo: PROG w tym pliku musi byc DOKLADNIE
    licznikiem realnych plikow harnessu — inaczej `main()` klamie w jedna albo
    druga strone bez zadnej zmiany kodu produktu."""

    def test_prog_odpowiada_zmierzonemu_stanowi_plikow(self) -> None:
        for nazwa, (prog_lit, prog_run) in guard.PROG.items():
            sciezka = guard.FRONTEND_SRC / nazwa
            literaly, run_idy = guard.znajdz_naruszenia(
                sciezka.read_text(encoding="utf-8")
            )
            assert len(literaly) == prog_lit, (nazwa, len(literaly), prog_lit)
            assert len(run_idy) == prog_run, (nazwa, len(run_idy), prog_run)

    def test_main_jest_zielony_na_biezacym_drzewie(self) -> None:
        assert guard.main() == 0
