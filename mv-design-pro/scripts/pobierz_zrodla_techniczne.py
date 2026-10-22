#!/usr/bin/env python3
"""Lokalna biblioteka oficjalnych PDF ENEA i prywatnej kopii Dołęgi.

Nie publikuje PDF w repozytorium. Python 3.11+, wyłącznie biblioteka standardowa.
Uruchamiaj z dowolnego katalogu.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from urllib import error, parse, request

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "docs" / "zrodla"
REGISTER = LIBRARY / "rejestr_zrodel.json"
TARGET = LIBRARY / "pobrane"
MAX_BYTES = 75 * 1024 * 1024


def manifest() -> list[dict]:
    data = json.loads(REGISTER.read_text(encoding="utf-8"))
    sources = data["sources"]
    ids = [item["id"] for item in sources]
    if len(ids) != len(set(ids)):
        raise ValueError("Powtarzające się identyfikatory w rejestrze źródeł")
    filenames = [item["filename"] for item in sources]
    if len(filenames) != len(set(filenames)):
        raise ValueError("Powtarzające się nazwy plików w rejestrze źródeł")
    for item in sources:
        if Path(item["filename"]).name != item["filename"]:
            raise ValueError(f"Nieprawidłowa nazwa pliku: {item['id']}")
    return sources


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for part in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(part)
    return digest.hexdigest()


def check_pdf(path: Path, item: dict) -> dict:
    if not path.is_file():
        raise ValueError(f"Brak PDF: {path}")
    if path.stat().st_size < 100:
        raise ValueError(f"Podejrzanie krótki plik: {path}")
    with path.open("rb") as handle:
        if handle.read(5) != b"%PDF-":
            raise ValueError(f"Plik nie jest PDF (możliwa strona blokady): {path}")
    checksum = sha256_of(path)
    expected = item.get("expected_sha256")
    if expected and checksum.lower() != expected.lower():
        raise ValueError(
            f"Niepoprawny SHA-256 źródła {item['id']}:\n"
            f"  aktualny  {checksum}\n  wymagany  {expected}"
        )
    return {
        "id": item["id"], "filename": item["filename"],
        "sha256": checksum, "size_bytes": path.stat().st_size,
        "checked_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": item.get("url", "plik dostarczony przez użytkownika"),
    }


def save_receipt(receipt: dict) -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    receipt_path = TARGET / (receipt["filename"] + ".proweniencja.json")
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")


def store_file(src: Path, item: dict, replace: bool) -> None:
    dest = TARGET / item["filename"]
    TARGET.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not replace:
        print(f"ISTNIEJE: {dest} (użyj --replace dla jawnej podmiany)")
        print(f"  {check_pdf(dest, item)['sha256']}")
        return
    with tempfile.NamedTemporaryFile(dir=TARGET, prefix=".pobieranie-", delete=False) as file:
        temp = Path(file.name)
        try:
            with src.open("rb") as source:
                shutil.copyfileobj(source, file)
        except BaseException:
            temp.unlink(missing_ok=True)
            raise
    try:
        receipt = check_pdf(temp, item)
        temp.replace(dest)
        save_receipt(receipt)
        print(f"ZAPISANO: {dest} ({receipt['size_bytes']} bajtów)")
        print(f"  SHA-256: {receipt['sha256']}")
    finally:
        temp.unlink(missing_ok=True)


def download_file(item: dict, replace: bool) -> None:
    if item["kind"] != "official_public_pdf":
        raise ValueError("Nie wolno pobierać przez sieć prywatnego podręcznika")
    url = item["url"]
    parsed = parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "www.operator.enea.pl":
        raise ValueError(f"Adres spoza oficjalnego hosta ENEA: {url}")
    dest = TARGET / item["filename"]
    if dest.exists() and not replace:
        print(f"ISTNIEJE: {item['id']} — {check_pdf(dest, item)['sha256']}")
        return
    print(f"POBIERAM: {item['id']} ← {url}", flush=True)
    req = request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; MV-DESIGN-PRO-zrodla/1.0)",
        "Accept": "application/pdf",
    })
    TARGET.mkdir(parents=True, exist_ok=True)
    try:
        with request.urlopen(req, timeout=30) as response:
            final = parse.urlparse(response.geturl())
            if final.scheme != "https" or final.hostname != "www.operator.enea.pl":
                raise ValueError("Przekierowanie poza oficjalny host ENEA")
            with tempfile.NamedTemporaryFile(dir=TARGET, prefix=".pobieranie-", delete=False) as file:
                temp = Path(file.name)
                total = 0
                try:
                    while True:
                        part = response.read(1024 * 1024)
                        if not part:
                            break
                        total += len(part)
                        if total > MAX_BYTES:
                            raise ValueError(f"Dokument przekracza {MAX_BYTES} bajtów")
                        file.write(part)
                except BaseException:
                    temp.unlink(missing_ok=True)
                    raise
    except error.HTTPError as exc:
        raise RuntimeError(
            f"ENEA odmawia pobrania (HTTP {exc.code}). Otwórz oficjalny URL "
            f"w przeglądarce i użyj --import-pdf {item['id']} PLIK.pdf"
        ) from exc
    except error.URLError as exc:
        raise RuntimeError(
            f"Nie udało się połączyć z ENEA ({exc.reason}). "
            f"Można wczytać PDF przez --import-pdf {item['id']} PLIK.pdf"
        ) from exc
    try:
        receipt = check_pdf(temp, item)
        temp.replace(dest)
        save_receipt(receipt)
        print(f"ZAPISANO: {dest}, SHA-256: {receipt['sha256']}")
    finally:
        temp.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pobiera/ewidencjonuje lokalnie oficjalne PDF ENEA i własną kopię Dołęgi")
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--list", action="store_true", help="Wykaz identyfikatorów i linków")
    actions.add_argument("--all", action="store_true", help="Pobierz wszystkie publiczne PDF ENEA")
    actions.add_argument("--id", metavar="IDENTYFIKATOR", help="Pobierz jedno źródło ENEA")
    actions.add_argument("--verify", action="store_true", help="Sprawdź dostępne lokalne PDF")
    actions.add_argument("--dolega", metavar="PDF", type=Path,
                         help="Skopiuj egzemplarz Dołęgi dostarczony przez użytkownika")
    actions.add_argument("--import-pdf", nargs=2, metavar=("IDENTYFIKATOR", "PDF"),
                         help="Wczytaj ręcznie pobrany oryginalny PDF ENEA")
    parser.add_argument("--replace", action="store_true",
                        help="Jawna zgoda na zastąpienie lokalnej kopii PDF")
    args = parser.parse_args()
    by_id = {item["id"]: item for item in manifest()}

    if args.list:
        for item in by_id.values():
            print(f"{item['id']}: {item['title']}\n  {item.get('url', 'prywatny PDF właściciela')}")
        return 0

    if args.verify:
        missing = 0
        for item in by_id.values():
            path = TARGET / item["filename"]
            if not path.exists():
                missing += 1
                print(f"BRAK: {item['id']} — {path}")
                continue
            try:
                receipt = check_pdf(path, item)
                print(f"OK: {item['id']} — {receipt['sha256']}")
            except ValueError as exc:
                missing += 1
                print(f"NIEZGODNE: {item['id']}: {exc}")
        print(f"Stan: {len(by_id)-missing}/{len(by_id)} zweryfikowanych plików")
        return 1 if missing else 0

    if args.dolega:
        store_file(args.dolega, by_id["dolega_stacje_2007"], args.replace)
        return 0

    if args.import_pdf:
        key, name = args.import_pdf
        item = by_id.get(key)
        if item is None or item["kind"] != "official_public_pdf":
            parser.error("Podano nieznany albo niedozwolony identyfikator ENEA")
        store_file(Path(name), item, args.replace)
        return 0

    keys = [args.id] if args.id else [
        source["id"] for source in by_id.values() if source["kind"] == "official_public_pdf"
    ]
    bad = 0
    for key in keys:
        item = by_id.get(key)
        if item is None or item["kind"] != "official_public_pdf":
            parser.error(f"Nieznany identyfikator publicznego PDF: {key}")
        try:
            download_file(item, args.replace)
        except (ValueError, RuntimeError, OSError) as exc:
            print(f"NIEPOBRANE: {key}: {exc}", file=sys.stderr)
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
