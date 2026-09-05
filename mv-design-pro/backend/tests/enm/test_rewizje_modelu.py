"""Rewizje modelu ENM — migawka kazdej rewizji, `checkout(n)`, koperta bez luk (CV-2).

Trzy twierdzenia, ktore ten plik przypina testami (nie deklaracja w docstringu):
1. KAZDA rewizja zapisana przez `set_enm` ma migawke, a `checkout(n)` oddaje model,
   ktorego hash tresci rowna sie hashowi zapisanemu w dzienniku dla rewizji n —
   dla sekwencji PRAWDZIWYCH komend domenowych, nie modeli podstawionych recznie.
2. Awaria po KAZDYM z pieciu krokow zapisu (dziennik roboczy, migawka robocza,
   podmiana HEAD, podmiana migawki, podmiana dziennika) zostawia stan = ostatnia
   rewizja spojna: pamiec, HEAD co do bajtu, brak migawki n, brak wpisu n — takze
   po ponownym wczytaniu z nosnika w nowym „procesie".
3. Magazyn sprzed rejestru rewizji (HEAD bez katalogu `.rev/`, dziennik bez wpisu
   rewizji biezacej) jest domykany przy wczytaniu bez utraty i bez zgadywania.
"""

from __future__ import annotations

import gzip
import json
import uuid
from pathlib import Path
from typing import Any

import enm.rewizje as rewizje
import enm.store as store
import pytest
from enm.domain_operations import execute_domain_operation
from enm.dziennik_zmian import (
    OPIS_PRZENIESIENIA_Z_PRZYPADKU,
    OPIS_PRZYWROCENIA_Z_ARCHIWUM,
    OPIS_WPISU_ODTWORZONEGO,
    PrzygotowanyWpis,
    WpisDziennika,
    wpis_rewizji,
    wszystkie_wpisy,
    wyczysc_dziennik,
)
from enm.hash import compute_enm_hash
from enm.rewizje import (
    RewizjaNieistniejeError,
    RewizjaUszkodzonaError,
    dostepne_rewizje,
    katalog_rewizji,
    sciezka_rewizji,
)
from enm.store import (
    ZrodloZmiany,
    checkout,
    get_enm,
    migruj_klucz_przypadku_do_projektu,
    reset_enm_store,
    restore_enm,
    rewizja_biezaca,
    set_enm,
)

CATALOG_VERSION = "2026.1"
CABLE_ID = "cable-tfk-yakxs-3x120"
SOURCE_ID = "src-gpz-15kv-250mva-rx010"


@pytest.fixture(autouse=True)
def _czysty_magazyn(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield
    reset_enm_store()
    wyczysc_dziennik()


def _binding(namespace: str, item_id: str) -> dict[str, str]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": CATALOG_VERSION,
    }


def _operacja(enm_dict: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm_dict=enm_dict, op_name=nazwa, payload=payload)
    assert not wynik.get("error"), wynik.get("error")
    snapshot = wynik.get("snapshot")
    assert isinstance(snapshot, dict)
    return snapshot


def _komendy_magistrali(liczba_odcinkow: int) -> list[tuple[str, dict[str, Any]]]:
    komendy: list[tuple[str, dict[str, Any]]] = [
        (
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "rx_ratio": 0.1,
                # FAB-G: tabliczka transformatora GPZ WN/SN wylacznie z typu
                # katalogowego — para (kV, MVA) wskazuje pozycje jednoznacznie.
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
                "catalog_binding": _binding("ZRODLO_SN", SOURCE_ID),
            },
        )
    ]
    for numer in range(liczba_odcinkow):
        komendy.append(
            (
                "continue_trunk_segment_sn",
                {
                    "segment": {
                        "rodzaj": "KABEL",
                        "dlugosc_m": 100 + 10 * numer,
                        "name": f"Odcinek {numer + 1}",
                        "catalog_binding": _binding("KABEL_SN", CABLE_ID),
                    },
                },
            )
        )
    return komendy


def _wykonaj_komendy(klucz: str, komendy: list[tuple[str, dict[str, Any]]]) -> list[int]:
    """Kazda komenda przechodzi PRODUKCYJNA sciezke: operacja → `set_enm` ze zrodlem
    zmiany i pelnym ladunkiem (jak `api/enm.py`). Zwraca numery rewizji po kazdej."""
    rewizje_po: list[int] = []
    for nazwa, payload in komendy:
        enm_dict = get_enm(klucz).model_dump(mode="json")
        snapshot = _operacja(enm_dict, nazwa, payload)
        nowy = store.EnergyNetworkModel.model_validate(snapshot)
        zapisany = set_enm(klucz, nowy, zrodlo_zmiany=ZrodloZmiany(operacja=nazwa, ladunek=payload))
        rewizje_po.append(zapisany.header.revision)
    return rewizje_po


def _wczytaj_na_nowo_z_nosnika() -> None:
    """Symulacja nowego procesu: pamiec magazynu i dziennika pusta, pliki zostaja."""
    reset_enm_store(remove_persisted=False)
    wyczysc_dziennik(usun_pliki=False)


# ---------------------------------------------------------------------------
# 1. checkout(n) × sekwencja komend domenowych
# ---------------------------------------------------------------------------


class TestCheckoutRewizji:
    @pytest.mark.parametrize("liczba_odcinkow", [1, 4])
    def test_kazda_rewizja_ma_migawke_o_hashu_z_dziennika(self, liczba_odcinkow: int) -> None:
        klucz = str(uuid.uuid4())
        rewizje_po = _wykonaj_komendy(klucz, _komendy_magistrali(liczba_odcinkow))

        assert rewizje_po == sorted(rewizje_po)
        assert dostepne_rewizje(klucz) == rewizje_po
        for n in rewizje_po:
            wpis = wpis_rewizji(klucz, n)
            assert wpis is not None, f"rewizja {n} bez wpisu dziennika"
            model = checkout(klucz, n)
            assert model.header.revision == n
            assert compute_enm_hash(model) == wpis.hash_sha256
            # `rodzic` wskazuje rewizje, z ktorej powstala ta rewizja.
            assert wpis.rodzic == n - 1
            # Ladunek komendy jest w dzienniku W CALOSCI (nie tylko nazwa).
            assert isinstance(wpis.ladunek, dict) and wpis.ladunek

    def test_checkout_rewizji_biezacej_jest_kopia_a_nie_aliasem(self) -> None:
        klucz = str(uuid.uuid4())
        _wykonaj_komendy(klucz, _komendy_magistrali(1))
        biezaca = rewizja_biezaca(klucz)
        kopia = checkout(klucz, biezaca)
        kopia.header.name = "Zmieniona kopia"
        assert get_enm(klucz).header.name != "Zmieniona kopia"

    def test_checkout_starszej_rewizji_nie_zmienia_biezacej(self) -> None:
        klucz = str(uuid.uuid4())
        rewizje_po = _wykonaj_komendy(klucz, _komendy_magistrali(2))
        pierwsza, ostatnia = rewizje_po[0], rewizje_po[-1]
        stary = checkout(klucz, pierwsza)
        assert len(stary.branches) < len(get_enm(klucz).branches)
        assert rewizja_biezaca(klucz) == ostatnia
        # Migawki sa niezmienne: ponowny odczyt daje ten sam hash.
        assert compute_enm_hash(checkout(klucz, pierwsza)) == compute_enm_hash(stary)

    def test_rewizja_bez_migawki_zglasza_brak_wprost(self) -> None:
        klucz = str(uuid.uuid4())
        _wykonaj_komendy(klucz, _komendy_magistrali(1))
        with pytest.raises(RewizjaNieistniejeError) as blad:
            checkout(klucz, 999)
        assert blad.value.rewizja == 999

    def test_uszkodzona_migawka_nie_jest_udawana(self) -> None:
        klucz = str(uuid.uuid4())
        rewizje_po = _wykonaj_komendy(klucz, _komendy_magistrali(1))
        pierwsza = rewizje_po[0]
        sciezka = sciezka_rewizji(klucz, pierwsza)
        payload = json.loads(gzip.decompress(sciezka.read_bytes()))
        payload["snapshot"]["header"]["name"] = "Podmieniona tresc"
        sciezka.write_bytes(
            gzip.compress(json.dumps(payload, sort_keys=True).encode("utf-8"), mtime=0)
        )
        with pytest.raises(RewizjaUszkodzonaError):
            checkout(klucz, pierwsza)

    def test_migawka_jest_deterministyczna_co_do_bajtu(self) -> None:
        klucz = str(uuid.uuid4())
        rewizje_po = _wykonaj_komendy(klucz, _komendy_magistrali(2))
        # Round-trip: model odczytany z migawki, zserializowany ponownie, daje
        # DOKLADNIE bajty pliku (kanoniczny JSON + gzip z mtime=0) — dla rewizji
        # biezacej (kopia z pamieci) i starszych (odczyt z pliku).
        for n in rewizje_po:
            model = checkout(klucz, n)
            ponownie = rewizje._serializuj(klucz, model, compute_enm_hash(model))
            assert ponownie == sciezka_rewizji(klucz, n).read_bytes(), f"rewizja {n}"


# ---------------------------------------------------------------------------
# 2. Awaria po kazdym kroku zapisu × dwie sieci
# ---------------------------------------------------------------------------

KROKI = (
    "dziennik_roboczy",
    "migawka_robocza",
    "podmiana_head",
    "podmiana_migawki",
    "podmiana_dziennika",
)


def _iniekcja(krok: str, podmiana: pytest.MonkeyPatch) -> None:
    """Awaria nosnika DOKLADNIE w jednym z pieciu krokow zapisu rewizji."""
    oryginalny_replace = Path.replace
    oryginalny_write_bytes = Path.write_bytes
    oryginalny_write_text = Path.write_text

    if krok == "dziennik_roboczy":

        def write_text_z_awaria(self: Path, *args: Any, **kwargs: Any) -> int:
            if ".dziennik.json." in self.name:
                raise OSError(28, "dziennik roboczy: brak miejsca")
            return oryginalny_write_text(self, *args, **kwargs)

        podmiana.setattr(Path, "write_text", write_text_z_awaria)
    elif krok == "migawka_robocza":

        def write_bytes_z_awaria(self: Path, dane: bytes) -> int:
            if self.parent.name.endswith(".rev"):
                raise OSError(28, "migawka robocza: brak miejsca")
            return oryginalny_write_bytes(self, dane)

        podmiana.setattr(Path, "write_bytes", write_bytes_z_awaria)
    elif krok == "podmiana_head":

        def replace_z_awaria(self: Path, cel: Any) -> Path:
            if str(cel).endswith(".json") and not str(cel).endswith(".dziennik.json"):
                raise OSError(5, "podmiana HEAD odmowila")
            return oryginalny_replace(self, cel)

        podmiana.setattr(Path, "replace", replace_z_awaria)
    elif krok == "podmiana_migawki":

        def replace_z_awaria_migawki(self: Path, cel: Any) -> Path:
            if str(cel).endswith(".json.gz"):
                raise OSError(5, "podmiana migawki odmowila")
            return oryginalny_replace(self, cel)

        podmiana.setattr(Path, "replace", replace_z_awaria_migawki)
    elif krok == "podmiana_dziennika":

        def replace_z_awaria_dziennika(self: Path, cel: Any) -> Path:
            if str(cel).endswith(".dziennik.json"):
                raise OSError(5, "podmiana dziennika odmowila")
            return oryginalny_replace(self, cel)

        podmiana.setattr(Path, "replace", replace_z_awaria_dziennika)
    else:  # pragma: no cover - lista krokow jest zamknieta
        raise AssertionError(krok)


class TestAwariaPoKazdymKroku:
    @pytest.mark.parametrize("krok", KROKI)
    @pytest.mark.parametrize("liczba_odcinkow", [1, 3])
    def test_stan_po_awarii_to_ostatnia_rewizja_spojna(
        self, krok: str, liczba_odcinkow: int
    ) -> None:
        klucz = str(uuid.uuid4())
        rewizje_po = _wykonaj_komendy(klucz, _komendy_magistrali(liczba_odcinkow))
        ostatnia = rewizje_po[-1]
        hash_przed = get_enm(klucz).header.hash_sha256
        bajty_head = store._case_path(klucz).read_bytes()
        bajty_dziennika = (
            store._store_dir() / f"{rewizje.digest_klucza(klucz)}.dziennik.json"
        ).read_bytes()
        migawki_przed = dostepne_rewizje(klucz)

        nazwa, payload = _komendy_magistrali(liczba_odcinkow + 1)[-1]
        snapshot = _operacja(get_enm(klucz).model_dump(mode="json"), nazwa, payload)
        nowy = store.EnergyNetworkModel.model_validate(snapshot)
        with pytest.MonkeyPatch.context() as podmiana:
            _iniekcja(krok, podmiana)
            with pytest.raises(OSError):
                set_enm(klucz, nowy, zrodlo_zmiany=ZrodloZmiany(operacja=nazwa, ladunek=payload))

        # Pamiec: rewizja i hash sprzed operacji.
        assert get_enm(klucz).header.revision == ostatnia
        assert get_enm(klucz).header.hash_sha256 == hash_przed
        # Nosnik: HEAD i dziennik co do bajtu, brak migawki n+1, brak plikow roboczych.
        assert store._case_path(klucz).read_bytes() == bajty_head
        assert (
            store._store_dir() / f"{rewizje.digest_klucza(klucz)}.dziennik.json"
        ).read_bytes() == bajty_dziennika
        assert dostepne_rewizje(klucz) == migawki_przed
        assert sorted(p.name for p in katalog_rewizji(klucz).glob("*.tmp")) == []
        assert sorted(p.name for p in store._store_dir().glob("*.tmp")) == []
        assert wpis_rewizji(klucz, ostatnia + 1) is None

        # Nowy „proces": wczytanie z nosnika daje ten sam stan i dzialajacy checkout.
        _wczytaj_na_nowo_z_nosnika()
        assert get_enm(klucz).header.revision == ostatnia
        assert get_enm(klucz).header.hash_sha256 == hash_przed
        assert dostepne_rewizje(klucz) == migawki_przed
        for n in migawki_przed:
            wpis = wpis_rewizji(klucz, n)
            assert wpis is not None
            assert compute_enm_hash(checkout(klucz, n)) == wpis.hash_sha256

        # Po awarii kolejna, udana operacja dostaje numer n+1 i pelny komplet.
        zapisany = set_enm(klucz, nowy, zrodlo_zmiany=ZrodloZmiany(operacja=nazwa, ladunek=payload))
        assert zapisany.header.revision == ostatnia + 1
        assert dostepne_rewizje(klucz) == [*migawki_przed, ostatnia + 1]
        assert wpis_rewizji(klucz, ostatnia + 1) is not None


# ---------------------------------------------------------------------------
# 3. Magazyn zastany, sieroty, luki w dzienniku
# ---------------------------------------------------------------------------


class TestUzgodnieniePrzyWczytaniu:
    def test_magazyn_sprzed_rejestru_rewizji_dostaje_migawke_biezacej(self) -> None:
        klucz = str(uuid.uuid4())
        _wykonaj_komendy(klucz, _komendy_magistrali(2))
        biezaca = rewizja_biezaca(klucz)
        # Symulacja magazynu sprzed CV-2: brak katalogu `.rev/` i brak wpisu
        # biezacej rewizji w dzienniku (dziennik obciety dawnym limitem).
        import shutil

        shutil.rmtree(katalog_rewizji(klucz))
        sciezka_dziennika = store._store_dir() / f"{rewizje.digest_klucza(klucz)}.dziennik.json"
        dziennik = json.loads(sciezka_dziennika.read_text(encoding="utf-8"))
        dziennik["wpisy"] = [w for w in dziennik["wpisy"] if w["rewizja"] != biezaca]
        sciezka_dziennika.write_text(json.dumps(dziennik), encoding="utf-8")

        _wczytaj_na_nowo_z_nosnika()
        model = get_enm(klucz)
        assert model.header.revision == biezaca
        assert dostepne_rewizje(klucz) == [biezaca]
        odtworzony = wpis_rewizji(klucz, biezaca)
        assert odtworzony is not None
        assert odtworzony.operacja is None
        assert odtworzony.opis_pl == OPIS_WPISU_ODTWORZONEGO
        assert odtworzony.hash_sha256 == compute_enm_hash(model)
        assert compute_enm_hash(checkout(klucz, biezaca)) == odtworzony.hash_sha256
        # Rewizje sprzed rejestru nie maja tresci — brak jest nazwany, nie zmyslony.
        with pytest.raises(RewizjaNieistniejeError):
            checkout(klucz, biezaca - 1)

    def test_sierota_powyzej_head_jest_usuwana_i_nigdy_promowana(self) -> None:
        klucz = str(uuid.uuid4())
        rewizje_po = _wykonaj_komendy(klucz, _komendy_magistrali(1))
        biezaca = rewizja_biezaca(klucz)
        assert biezaca == rewizje_po[-1]
        # Sierota: migawka `biezaca + 3` bez HEAD i bez wpisu (awaria po podmianie
        # migawki, ktorej wycofanie nie zdazylo sprzatnac).
        model = get_enm(klucz).model_copy(deep=True)
        model.header.revision = biezaca + 3
        rewizje.przygotuj_rewizje(klucz, model).zatwierdz()
        (katalog_rewizji(klucz) / "smiec.json.gz.1.abc.tmp").write_bytes(b"x")
        assert dostepne_rewizje(klucz) == [*rewizje_po, biezaca + 3]

        _wczytaj_na_nowo_z_nosnika()
        assert rewizja_biezaca(klucz) == biezaca
        assert dostepne_rewizje(klucz) == rewizje_po
        assert list(katalog_rewizji(klucz).glob("*.tmp")) == []
        assert wpis_rewizji(klucz, biezaca + 3) is None

    def test_migawka_biezacej_o_innym_hashu_jest_zastapiona_trescia_head(self) -> None:
        klucz = str(uuid.uuid4())
        _wykonaj_komendy(klucz, _komendy_magistrali(1))
        biezaca = rewizja_biezaca(klucz)
        obcy = get_enm(klucz).model_copy(deep=True)
        obcy.header.name = "Obca tresc pod tym samym numerem"
        rewizje.przygotuj_rewizje(klucz, obcy).zatwierdz()
        assert rewizje.hash_migawki(klucz, biezaca) != compute_enm_hash(get_enm(klucz))

        _wczytaj_na_nowo_z_nosnika()
        model = get_enm(klucz)
        assert rewizje.hash_migawki(klucz, biezaca) == compute_enm_hash(model)
        assert checkout(klucz, biezaca).header.name == model.header.name


# ---------------------------------------------------------------------------
# 4. Zapisy bez podniesienia rewizji: import archiwum, migracja klucza
# ---------------------------------------------------------------------------


class TestZapisyBezPodniesieniaRewizji:
    def test_restore_enm_daje_migawke_i_wpis_nazywajacy_import(self) -> None:
        zrodlo = str(uuid.uuid4())
        _wykonaj_komendy(zrodlo, _komendy_magistrali(1))
        snapshot = get_enm(zrodlo).model_dump(mode="json")
        hash_eksportu = compute_enm_hash(get_enm(zrodlo))
        rewizja_eksportu = rewizja_biezaca(zrodlo)

        cel = str(uuid.uuid4())
        przywrocony = restore_enm(cel, snapshot)
        assert przywrocony is not None
        # LV-INV-10: rewizja i hash bez zmian.
        assert przywrocony.header.revision == rewizja_eksportu
        assert compute_enm_hash(przywrocony) == hash_eksportu
        assert dostepne_rewizje(cel) == [rewizja_eksportu]
        wpis = wpis_rewizji(cel, rewizja_eksportu)
        assert wpis is not None
        assert wpis.operacja is None
        assert wpis.opis_pl == OPIS_PRZYWROCENIA_Z_ARCHIWUM
        assert wpis.hash_sha256 == hash_eksportu
        assert compute_enm_hash(checkout(cel, rewizja_eksportu)) == hash_eksportu

    def test_migracja_promowanego_przypadku_zabiera_dziennik_i_migawki(self) -> None:
        case_id = str(uuid.uuid4())
        rewizje_po = _wykonaj_komendy(case_id, _komendy_magistrali(2))
        wpisy_przypadku = wszystkie_wpisy(case_id)
        klucz_projektu = f"projekt:{uuid.uuid4()}"

        wynik = migruj_klucz_przypadku_do_projektu(
            case_id, klucz_projektu, przyjmij_jako_model_projektu=True
        )
        assert wynik.status == "PRZENIESIONY"
        # Historia przypadku jest pod kluczem projektu: te same rewizje, te same hashe.
        assert dostepne_rewizje(klucz_projektu) == rewizje_po
        for wpis in wpisy_przypadku:
            pod_projektem = wpis_rewizji(klucz_projektu, wpis.rewizja)
            assert pod_projektem is not None
            assert pod_projektem.hash_sha256 == wpis.hash_sha256
            assert pod_projektem.operacja == wpis.operacja
            assert compute_enm_hash(checkout(klucz_projektu, wpis.rewizja)) == wpis.hash_sha256
        # Pliki przypadku (HEAD, dziennik, migawki) leza w legacy — nic nie zginelo.
        legacy = store._store_dir() / store.KATALOG_LEGACY
        digest = rewizje.digest_klucza(case_id)
        assert (legacy / f"{digest}.json").exists()
        assert (legacy / f"{digest}.dziennik.json").exists()
        assert (legacy / f"{digest}.rev").is_dir()
        assert not katalog_rewizji(case_id).exists()

    def test_migracja_rozbieznego_przypadku_odklada_migawki_do_legacy(self) -> None:
        case_id = str(uuid.uuid4())
        _wykonaj_komendy(case_id, _komendy_magistrali(1))
        klucz_projektu = f"projekt:{uuid.uuid4()}"
        _wykonaj_komendy(klucz_projektu, _komendy_magistrali(2))
        migawki_projektu = dostepne_rewizje(klucz_projektu)

        wynik = migruj_klucz_przypadku_do_projektu(
            case_id, klucz_projektu, przyjmij_jako_model_projektu=False
        )
        assert wynik.status == "ROZBIEZNY"
        assert dostepne_rewizje(klucz_projektu) == migawki_projektu
        legacy = store._store_dir() / store.KATALOG_LEGACY
        assert (legacy / f"{rewizje.digest_klucza(case_id)}.rev").is_dir()
        assert not katalog_rewizji(case_id).exists()

    def test_wpis_przeniesienia_gdy_przypadek_nie_mial_dziennika(self) -> None:
        case_id = str(uuid.uuid4())
        _wykonaj_komendy(case_id, _komendy_magistrali(1))
        biezaca = rewizja_biezaca(case_id)
        # Dziennik przypadku znika (magazyn sprzed rejestru) — migracja i tak
        # zostawia wpis nazywajacy przeniesienie, nie zgadnieta operacje.
        wyczysc_dziennik(usun_pliki=False)
        (store._store_dir() / f"{rewizje.digest_klucza(case_id)}.dziennik.json").unlink()
        klucz_projektu = f"projekt:{uuid.uuid4()}"
        wynik = migruj_klucz_przypadku_do_projektu(
            case_id, klucz_projektu, przyjmij_jako_model_projektu=True
        )
        assert wynik.status == "PRZENIESIONY"
        wpis = wpis_rewizji(klucz_projektu, biezaca)
        assert wpis is not None
        assert wpis.operacja is None
        assert wpis.opis_pl == OPIS_PRZENIESIENIA_Z_PRZYPADKU


# ---------------------------------------------------------------------------
# 5. Dziennik: bez limitu, pola addytywne, dane zastane
# ---------------------------------------------------------------------------


class TestDziennikJakoRejestrRewizji:
    def test_dziennik_nie_obcina_historii(self) -> None:
        klucz = str(uuid.uuid4())
        bazowy = get_enm(klucz)
        for numer in range(520):
            model = get_enm(klucz).model_copy(deep=True)
            model.header.name = f"Rewizja {numer}"
            set_enm(klucz, model, zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay"))
        wpisy = wszystkie_wpisy(klucz)
        assert len(wpisy) == 520
        assert len(dostepne_rewizje(klucz)) == 520
        assert bazowy.header.revision + 520 == rewizja_biezaca(klucz)

    def test_wpis_zastany_bez_nowych_pol_wczytuje_sie_z_none(self) -> None:
        wpis = WpisDziennika.from_dict(
            {"rewizja": 3, "znacznik_czasu": "2026-01-01T00:00:00+00:00", "operacja": "add_sn_bay"}
        )
        assert wpis is not None
        assert wpis.hash_sha256 is None and wpis.rodzic is None and wpis.ladunek is None
        assert (
            WpisDziennika.from_dict({"rewizja": 4, "rodzic": True, "ladunek": "x"}).rodzic is None
        )

    def test_to_dict_niesie_hash_rodzica_i_ladunek(self) -> None:
        wpis = WpisDziennika(
            rewizja=7,
            znacznik_czasu="t",
            operacja="add_sn_bay",
            opis_pl="opis",
            hash_sha256="abc",
            rodzic=6,
            ladunek={"a": 1},
        )
        slownik = wpis.to_dict()
        assert (slownik["hash_sha256"], slownik["rodzic"], slownik["ladunek"]) == (
            "abc",
            6,
            {"a": 1},
        )
        assert WpisDziennika.from_dict(slownik) == wpis

    def test_opis_wolno_podac_tylko_bez_operacji(self) -> None:
        from enm.dziennik_zmian import przygotuj_dopisanie

        with pytest.raises(ValueError):
            przygotuj_dopisanie("k", rewizja=1, operacja="add_sn_bay", opis_pl="nie")
        przygotowany: PrzygotowanyWpis = przygotuj_dopisanie(
            "k", rewizja=1, operacja=None, opis_pl="Zapis testowy bez komendy"
        )
        assert przygotowany.wpis.opis_pl == "Zapis testowy bez komendy"
        przygotowany.porzuc()
