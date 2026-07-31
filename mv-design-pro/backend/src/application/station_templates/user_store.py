"""Szablony stacji ZAPISANE PRZEZ UZYTKOWNIKA (B-8, karta KD-3).

DLUG, KTORY TO ZAMYKA (B-8). Biblioteka szablonow stacji byla WYLACZNIE wbudowana:
projektant, ktory poskladal w kreatorze wlasna konfiguracje (rodzaj stacji, pola SN
z aparatami, transformator, blok nN, uziemienie), nie mial jak jej zachowac. Przy
nastepnej stacji tego samego typu musial wyklikac wszystko od nowa.

ZASADY (kanon katalog-first + determinizm):
  * szablony WBUDOWANE sa NIETKNIETE — ten modul ich nie czyta ani nie modyfikuje;
    zapis uzytkownika to OSOBNY zbior z wlasna przestrzenia identyfikatorow,
  * identyfikator jest WYPROWADZONY z tresci (SHA-256 kanonicznego zapisu), wiec
    dwa zapisy tej samej konfiguracji daja ten sam identyfikator — bez licznikow,
    bez znacznikow czasu w kluczu, bez losowosci (Determinism Rule),
  * serializacja kanoniczna (`sort_keys`, staly separator, UTF-8 bez escape),
    dzieki czemu plik jest porownywalny bajtowo miedzy biegami,
  * zapis atomowy (plik tymczasowy + podmiana), wzorzec `enm/store.py`.

Katalog zapisu wskazuje `STATION_USER_TEMPLATES_DIR`; domyslnie `.station_templates`
obok modulu backendu (ta sama konwencja co magazyn ENM).
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Any

_DEFAULT_STORE_DIR = Path(__file__).resolve().parents[3] / ".station_templates"
_PLIK = "user_templates.json"

#: Prefiks przestrzeni identyfikatorow szablonow uzytkownika. Rozdziela je od
#: wbudowanych JEDNOZNACZNIE — konsument nie musi zgadywac po nazwie.
PREFIKS_UZYTKOWNIKA = "user_"

#: Zrodlo szablonu w odpowiedzi (konsument rozroznia je etykieta PL, nie nazwa).
ZRODLO_WBUDOWANY = "WBUDOWANY"
ZRODLO_UZYTKOWNIKA = "UZYTKOWNIKA"


def _store_dir() -> Path:
    configured = os.getenv("STATION_USER_TEMPLATES_DIR")
    return Path(configured) if configured else _DEFAULT_STORE_DIR


def _sciezka() -> Path:
    return _store_dir() / _PLIK


def _kanoniczny_zapis(dane: Any) -> str:
    """Kanoniczna serializacja JSON — jedno zrodlo formatu dla hasza i pliku."""
    return json.dumps(dane, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def identyfikator_szablonu(nazwa: str, konfiguracja: dict[str, Any]) -> str:
    """Deterministyczny identyfikator szablonu z jego TRESCI.

    Ta sama nazwa i ta sama konfiguracja daja ten sam identyfikator, wiec
    powtorny zapis nadpisuje wpis zamiast mnozyc duplikaty. Znacznik czasu NIE
    wchodzi do hasza — inaczej kazdy zapis tworzylby nowy szablon.
    """
    odcisk = sha256(_kanoniczny_zapis({"nazwa": nazwa, "konfiguracja": konfiguracja}).encode())
    return f"{PREFIKS_UZYTKOWNIKA}{odcisk.hexdigest()[:16]}"


def _wczytaj() -> list[dict[str, Any]]:
    sciezka = _sciezka()
    if not sciezka.exists():
        return []
    try:
        payload = json.loads(sciezka.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    szablony = payload.get("templates") if isinstance(payload, dict) else None
    if not isinstance(szablony, list):
        return []
    return [s for s in szablony if isinstance(s, dict) and isinstance(s.get("id"), str)]


def _zapisz_plik(szablony: list[dict[str, Any]]) -> None:
    katalog = _store_dir()
    katalog.mkdir(parents=True, exist_ok=True)
    sciezka = _sciezka()
    tymczasowy = sciezka.with_suffix(".tmp")
    tymczasowy.write_text(
        _kanoniczny_zapis({"templates": sorted(szablony, key=lambda s: str(s["id"]))}),
        encoding="utf-8",
    )
    tymczasowy.replace(sciezka)


def lista_szablonow_uzytkownika() -> list[dict[str, Any]]:
    """Szablony uzytkownika posortowane po identyfikatorze (determinizm listy)."""
    return sorted(_wczytaj(), key=lambda s: str(s["id"]))


def pobierz_szablon_uzytkownika(template_id: str) -> dict[str, Any] | None:
    for szablon in _wczytaj():
        if szablon.get("id") == template_id:
            return szablon
    return None


def zapisz_szablon_uzytkownika(
    *,
    nazwa: str,
    opis: str | None,
    konfiguracja: dict[str, Any],
) -> dict[str, Any]:
    """Zapisz konfiguracje kreatora jako szablon uzytkownika.

    Konfiguracja jest przechowywana BEZ ZMIAN i backend jej NIE INTERPRETUJE —
    to stan formularza kreatora, ktory tylko kreator potrafi odtworzyc. Kazde
    tlumaczenie ksztaltu po drodze byloby miejscem, w ktorym zapis i odtworzenie
    moglyby sie rozjechac (a przy odtworzeniu nikt by tego nie zauwazyl).
    """
    template_id = identyfikator_szablonu(nazwa, konfiguracja)
    wpis = {
        "id": template_id,
        "name_pl": nazwa,
        "description_pl": opis or "",
        "source": ZRODLO_UZYTKOWNIKA,
        "saved_at": datetime.now(UTC).isoformat(),
        "configuration": konfiguracja,
    }
    szablony = [s for s in _wczytaj() if s.get("id") != template_id]
    szablony.append(wpis)
    _zapisz_plik(szablony)
    return wpis


def usun_szablon_uzytkownika(template_id: str) -> bool:
    """Usun szablon uzytkownika; zwraca ``True``, gdy istnial."""
    szablony = _wczytaj()
    pozostale = [s for s in szablony if s.get("id") != template_id]
    if len(pozostale) == len(szablony):
        return False
    _zapisz_plik(pozostale)
    return True
