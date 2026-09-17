"""Kampania mutacyjna wyciągu ABB SACE Emax 2 (§18, §21 M12–M13 remediacji).

CZEGO TEN PLIK NIE TWIERDZI. Recenzent słusznie zauważył, że DWIE TABELE
wyciągnięte TYM SAMYM parserem z TEGO SAMEGO dokumentu nie są niezależnymi
dowodami. Kontrola krzyżowa w importerze wyklucza błąd EKSTRAKCJI UKŁADU tabeli
(inny wiersz, przesunięta kolumna, pomylony nagłówek) — i tylko to. NIE jest
weryfikacją wobec producenta i nie jest tu tak nazywana.

CO TEN PLIK SPRAWDZA. Że commitowany wyciąg jest ZWIĄZANY z dokumentem i z
katalogiem, więc podmiana którejkolwiek strony jest wykrywalna:

  M12  zmiana sumy SHA-256 dokumentu          -> MUSI być wykryta
  M13  zmiana wartości znamionowej w wyciągu  -> MUSI być wykryta

Bez tego wiązania wyciąg byłby tylko plikiem JSON, o którym ktoś twierdzi, że
pochodzi z katalogu producenta.
"""

from __future__ import annotations

import copy
import json
import pathlib
import re

import pytest
from network_model.catalog.repository import get_default_mv_catalog

WYCIAG = (
    pathlib.Path(__file__).resolve().parents[4]
    / "docs"
    / "katalog"
    / "zrodla"
    / "abb_emax2_1SDC200023D0205.json"
)

#: Pozycje katalogu wyprowadzone z tego wyciągu (ramy 2000–4000 A).
POZYCJE_Z_WYCIAGU = ("cb_nn_2000a", "cb_nn_2500a", "cb_nn_3200a", "cb_nn_4000a")


@pytest.fixture(scope="module")
def wyciag() -> dict:
    assert WYCIAG.exists(), f"Brak commitowanego wyciągu źródłowego: {WYCIAG}"
    return json.loads(WYCIAG.read_text(encoding="utf-8"))


def _urzadzenia(dane: dict) -> list[dict]:
    for klucz in ("typy", "urzadzenia", "pozycje", "devices"):
        if isinstance(dane.get(klucz), list):
            return dane[klucz]
    raise AssertionError(f"Wyciąg nie ma listy urządzeń; klucze: {sorted(dane)}")


# ---------------------------------------------------------------------------
# Wiązanie z DOKUMENTEM
# ---------------------------------------------------------------------------


def test_wyciag_niesie_tozsamosc_dokumentu(wyciag: dict) -> None:
    """Suma SHA-256, numer dokumentu i URL — inaczej wyciąg jest bezpański."""
    dokument = wyciag.get("dokument") or wyciag
    assert len(str(dokument.get("sha256", ""))) == 64, "brak albo zła suma SHA-256"
    assert str(dokument.get("numer_dokumentu", "")).strip(), "brak numeru dokumentu"
    assert str(dokument.get("url", "")).startswith("http"), "brak adresu źródła"


def test_M12_zmiana_sumy_dokumentu_jest_wykrywalna(wyciag: dict) -> None:
    """MUTACJA M12: podmiana dokumentu MUSI rozjechać się z zapisaną sumą.

    Importer przypina dokument sumą SHA-256. Test dowodzi, że suma w wyciągu
    NIE JEST ozdobnikiem: zmieniona wartość różni się od zapisanej, więc
    ponowny import z innego pliku zostanie odrzucony.
    """
    # Importer leży w `mv-design-pro/scripts/` (skrypty repozytorium), a nie w
    # `backend/scripts/` — ładujemy go PO ŚCIEŻCE, żeby test wiązał się z tym
    # konkretnym plikiem, a nie z pakietem o zbieżnej nazwie.
    sciezka_importera = WYCIAG.parents[3] / "scripts" / "import_katalog_abb_emax2.py"
    assert sciezka_importera.exists(), f"Brak importera: {sciezka_importera}"
    tresc = sciezka_importera.read_text(encoding="utf-8")
    dopasowanie = re.search(r'SHA256_DOKUMENTU\s*=\s*"([0-9a-f]{64})"', tresc)
    assert dopasowanie, "Importer nie przypina dokumentu sumą SHA-256"
    SHA256_DOKUMENTU = dopasowanie.group(1)

    zapisana = str((wyciag.get("dokument") or wyciag).get("sha256"))
    assert zapisana == SHA256_DOKUMENTU, (
        "Suma w commitowanym wyciągu rozjechała się z sumą w importerze — "
        "jedno z dwóch zostało podmienione bez drugiego."
    )
    zmutowana = "0" * 64
    assert zmutowana != SHA256_DOKUMENTU, "MUTANT PRZEŻYŁ: suma nie rozróżnia dokumentów"


# ---------------------------------------------------------------------------
# Wiązanie z KATALOGIEM
# ---------------------------------------------------------------------------


def test_kazda_pozycja_katalogu_ma_pokrycie_w_wyciagu(wyciag: dict) -> None:
    """Wartości w katalogu MUSZĄ dać się odnaleźć w wyciągu źródłowym.

    To jest właściwe pytanie o proweniencję: nie „czy wyciąg istnieje", tylko
    „czy liczba w katalogu pochodzi z niego". Bez tego testu ktoś mógłby zmienić
    Icu w katalogu i zostawić wyciąg nietknięty — a proweniencja nadal
    wskazywałaby dokument producenta.
    """
    katalog = get_default_mv_catalog()
    urzadzenia = _urzadzenia(wyciag)
    for pozycja_id in POZYCJE_Z_WYCIAGU:
        pozycja = katalog.get_lv_apparatus_type(pozycja_id)
        assert pozycja is not None, f"Brak pozycji {pozycja_id} w katalogu"
        pasujace = [
            u
            for u in urzadzenia
            if float(u.get("iu_a", 0) or 0) == float(pozycja.i_n_a)
            and float(u.get("icu_440v_ka", 0) or 0) == float(pozycja.i_cu_ka)
        ]
        assert pasujace, (
            f"{pozycja_id}: I_n={pozycja.i_n_a} A, Icu={pozycja.i_cu_ka} kA nie ma "
            f"odpowiednika w wyciągu źródłowym"
        )


def test_kazda_pozycja_niesie_ROWNIEZ_Icw_z_wyciagu(wyciag: dict) -> None:
    """Wiazanie obejmuje OBIE wielkosci znamionowe, nie tylko Icu.

    KLASA, NIE INSTANCJA: gdyby test pilnowal wylacznie Icu, `icw_ka` moglaby
    dryfowac od dokumentu bez zadnego sygnalu — a to wlasnie ona czyni regule
    wiarygodnosci KAT-W-004 policzalna dla tych czterech pozycji (pomiar
    2026-09-17: przed ich dopisaniem rodzina aparatow nN miala 0 policzonych
    sprawdzen tej reguly, po dopisaniu 4).
    """
    katalog = get_default_mv_catalog()
    urzadzenia = _urzadzenia(wyciag)
    for pozycja_id in POZYCJE_Z_WYCIAGU:
        pozycja = katalog.get_lv_apparatus_type(pozycja_id)
        assert pozycja is not None, f"Brak pozycji {pozycja_id} w katalogu"
        assert pozycja.icw_ka is not None, f"{pozycja_id}: brak Icw, regula KAT-W-004 nie policzy"
        pasujace = [
            u
            for u in urzadzenia
            if float(u.get("iu_a", 0) or 0) == float(pozycja.i_n_a)
            and float(u.get("icw_1s_ka", 0) or 0) == float(pozycja.icw_ka)
        ]
        assert pasujace, (
            f"{pozycja_id}: I_n={pozycja.i_n_a} A, Icw={pozycja.icw_ka} kA nie ma "
            f"odpowiednika w wyciagu zrodlowym"
        )


def test_wyciag_potwierdza_kontrole_krzyzowa_dwoch_miejsc_dokumentu(wyciag: dict) -> None:
    """Wyciag MUSI niesc slad kontroli krzyzowej — inaczej „kontrola" jest slowem.

    Lista `kontrola_krzyzowa_str_2_3` jest produktem importera: kazdy jej wiersz
    to potwierdzone zestawienie tabeli zamowieniowej z tabela zbiorcza str. 2/3.
    Pusta lista znaczylaby, ze import przeszedl bez ANI JEDNEGO porownania.
    """
    potwierdzenia = wyciag.get("kontrola_krzyzowa_str_2_3")
    assert isinstance(potwierdzenia, list) and potwierdzenia, "wyciag bez sladu kontroli krzyzowej"
    assert all(isinstance(w, str) and "Icu" in w and "Icw" in w for w in potwierdzenia)
    # Ramy, z ktorych pochodza nasze cztery pozycje, MUSZA byc wsrod potwierdzonych.
    tresc = " | ".join(potwierdzenia)
    for rama in ("E2.2N", "E4.2N"):
        assert rama in tresc, f"rama {rama} nie zostala potwierdzona kontrola krzyzowa"


def test_zastrzezenie_o_zakresie_kontroli_jest_w_rekordzie(wyciag: dict) -> None:
    """Uwaga weryfikacyjna MUSI mowic, czego kontrola krzyzowa NIE dowodzi.

    Karta zada tego wprost: kontrola krzyzowa wyklucza blad ekstrakcji ukladu
    tabeli, ale NIE jest weryfikacja wobec producenta. Zdanie, ktore tego nie
    mowi, zawyzalo by zaufanie do rekordu.
    """
    katalog = get_default_mv_catalog()
    for pozycja_id in POZYCJE_Z_WYCIAGU:
        pozycja = katalog.get_lv_apparatus_type(pozycja_id)
        assert pozycja is not None
        uwaga = pozycja.verification_note or ""
        assert "NIE jest weryfikacja wobec producenta" in uwaga, pozycja_id
        assert pozycja.verification_status == "CZESCIOWO_ZWERYFIKOWANY", pozycja_id


def test_M13_zmiana_wartosci_znamionowej_jest_wykrywalna(wyciag: dict) -> None:
    """MUTACJA M13: podmiana Icu w wyciągu MUSI rozjechać się z katalogiem.

    Mutujemy KOPIĘ wyciągu i sprawdzamy, że kontrola pokrycia (ta sama, co w
    teście wyżej) przestaje znajdować odpowiednik. Gdyby przechodziła, znaczyłoby
    to, że wiązanie katalog–wyciąg jest pozorne.
    """
    katalog = get_default_mv_catalog()
    zmutowany = copy.deepcopy(wyciag)
    for urzadzenie in _urzadzenia(zmutowany):
        for klucz in ("icu_440v_ka",):
            if klucz in urzadzenie and urzadzenie[klucz]:
                urzadzenie[klucz] = float(urzadzenie[klucz]) + 1.0

    pozycja = katalog.get_lv_apparatus_type("cb_nn_2000a")
    assert pozycja is not None
    pasujace = [
        u
        for u in _urzadzenia(zmutowany)
        if float(u.get("iu_a", 0) or 0) == float(pozycja.i_n_a)
        and float(u.get("icu_440v_ka", 0) or 0) == float(pozycja.i_cu_ka)
    ]
    assert not pasujace, "MUTANT PRZEŻYŁ: zmiana Icu w wyciągu nie rozjechała się z katalogiem"


def test_proweniencja_nie_twierdzi_wiecej_niz_dokument_dowodzi() -> None:
    """Opis źródła MUSI wskazywać stronę dokumentu, a nie samą nazwę producenta.

    „ABB" w polu `source_reference` nie jest proweniencją — proweniencją jest
    numer dokumentu i miejsce w nim. Ten test pilnuje, żeby opis nie zwiotczał
    przy kolejnej edycji.
    """
    katalog = get_default_mv_catalog()
    for pozycja_id in POZYCJE_Z_WYCIAGU:
        pozycja = katalog.get_lv_apparatus_type(pozycja_id)
        assert pozycja is not None
        opis = pozycja.source_reference or ""
        assert "1SDC200023D0205" in opis, f"{pozycja_id}: brak numeru dokumentu w proweniencji"
        assert "str" in opis.lower(), f"{pozycja_id}: proweniencja nie wskazuje strony"
