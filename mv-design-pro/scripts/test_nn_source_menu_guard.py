"""Samotest nn_source_menu_guard (V12K-352).

Intencja: blok rejestru czytany przez strażnika obejmuje tablice per rodzaj `SLD_MENU_REGISTRY`
ORAZ wspólne listy `POZYCJE_*`. Kotwica na pierwszym wystąpieniu nazwy rejestru (komentarz
dokumentacyjny) gubiła kategorię `station` i pomijała etykiety list wspólnych.
"""

from __future__ import annotations

import nn_source_menu_guard as guard


def _tresc() -> str:
    return guard.SLD_COMMAND_SERVICE_PATH.read_text(encoding="utf-8")


def test_rzeczywiste_drzewo_kategoria_stacji_i_etykiety() -> None:
    blok = guard.extract_registry_block(_tresc())
    assert blok is not None
    assert guard.check_station_menu_entries(blok) == []
    assert guard.check_english_labels(blok) == []
    # Lista wspólna zdefiniowana przed literałem rejestru należy do bloku.
    assert "POZYCJE_ZRODLA_WYNIKI" in blok
    assert "edit-source-module" in blok


def test_komentarz_z_nazwa_rejestru_przed_listami_nie_ucina_bloku() -> None:
    tresc = "/** Opis `SLD_MENU_REGISTRY` w komentarzu. */\n" + _tresc()
    blok = guard.extract_registry_block(tresc)
    assert blok is not None
    assert guard.check_station_menu_entries(blok) == []


def test_iniekcja_angielskiej_etykiety_w_liscie_wspolnej_jest_czerwona() -> None:
    tresc = _tresc()
    kotwica = "const POZYCJE_ZRODLA_WYNIKI: readonly SldMenuAction[] = ["
    assert kotwica in tresc
    tresc = tresc.replace(
        kotwica,
        kotwica + "\n  { id: 'show-x', labelPl: 'Delete source', section: 'Wyniki' },",
        1,
    )
    blok = guard.extract_registry_block(tresc)
    assert blok is not None
    naruszenia = guard.check_english_labels(blok)
    assert any("Delete source" in n.message for n in naruszenia)
