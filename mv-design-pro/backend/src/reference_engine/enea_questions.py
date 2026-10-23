"""Odpowiedzi na pytania o wymagania ENEA Operator: wyłącznie z dowodem źródłowym.

Nie jest to model językowy ani automat do wydawania opinii. Silnik udostępnia
karty wymagań sprawdzone ręcznie i dowody z lokalnego indeksu FTS5.
Brak wyniku oznacza brak potwierdzenia W ZASOBIE, nigdy brak wymagania w ENEA.
"""
from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from datetime import date
from pathlib import Path
from typing import Any

_PACK_DIR = Path(__file__).resolve().parent / "packs" / "osd_enea"
_CATALOG = _PACK_DIR / "source_catalog.json"
_REQUIREMENTS = _PACK_DIR / "curated_requirements.json"

_STOP_WORDS = frozenset({
    "a", "aby", "albo", "bez", "bo", "by", "byc", "bylo", "czy", "czym", "dla",
    "do", "enea", "jest", "jak", "jaka", "jakie", "jakiego", "jaki", "kiedy", "ktore",
    "moge", "mozna", "musi", "na", "od", "operator", "operatora", "oraz", "powinien",
    "przy", "sie", "sa", "standard", "standardach", "standardzie", "standardu",
    "ten", "to", "w", "we", "wedlug", "z", "za", "ze", "znajduje",
})


def _ascii(text: str) -> str:
    norm = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in norm if not unicodedata.combining(c))


def _roots(question: str) -> list[str]:
    """Bez ukrytych synonimów: jawne rdzenie do wyszukiwania odmian PL."""
    words = re.findall(r"[a-z0-9]+", _ascii(question))
    roots: list[str] = []
    for word in words:
        if word in _STOP_WORDS or len(word) < 3:
            continue
        # Rdzenie specjalistyczne rozpoznają różne odmiany (słupowej/słupową).
        mapping = (
            ("slup", "slup"), ("stac", "stac"), ("kabl", "kabl"),
            ("podej", "podej"), ("przyl", "przyl"), ("uziem", "uziem"),
            ("rozdziel", "rozdziel"), ("napowietrz", "napowietrz"),
            ("transformator", "transformator"), ("telemechan", "telemechan"),
            ("zabezpiecz", "zabezpiecz"), ("pomiar", "pomiar"),
            ("pradow", "prad"), ("pradu", "prad"), ("prad", "prad"),
            ("now", "now"), ("przebud", "przebud"), ("kompakt", "kompakt"),
        )
        root = next((short for prefix, short in mapping if word.startswith(prefix)), word)
        if len(root) > 7 and root.isalpha():
            root = root[:7]
        if root not in roots:
            roots.append(root)
    return roots[:12]


def _valid_on(row: dict[str, Any], day: str) -> bool:
    start, end = row.get("effective_from"), row.get("effective_to")
    return (not start or start <= day) and (not end or day <= end)


def _source_data() -> tuple[dict[str, Any], dict[str, Any]]:
    catalog = json.loads(_CATALOG.read_text(encoding="utf-8"))
    rules = json.loads(_REQUIREMENTS.read_text(encoding="utf-8"))
    return catalog, rules


def _compact_excerpt(text: str, roots: list[str], max_chars: int = 200) -> str:
    """Zwraca mały urywek strony do sprawdzenia, bez kopiowania całego PDF."""
    if not text:
        return ""
    clean = re.sub(r"\s+", " ", text).strip()
    folded = _ascii(clean)
    positions = [folded.find(root) for root in roots if root in folded]
    pos = min((x for x in positions if x >= 0), default=0)
    start = max(0, pos - 55)
    end = min(len(clean), start + max_chars)
    excerpt = clean[start:end].strip()
    return ("…" if start else "") + excerpt + ("…" if end < len(clean) else "")


def _indexed_matches(
    database: Path,
    roots: list[str],
    by_id: dict[str, dict[str, Any]],
    as_of: str,
    limit: int,
) -> tuple[int, list[dict[str, Any]]]:
    """Odczyt tylko z już utworzonej bazy, bez samoczynnego pobierania."""
    if not database.is_file():
        return 0, []
    uri = "file:" + database.resolve().as_posix() + "?mode=ro"
    try:
        with sqlite3.connect(uri, uri=True) as conn:
            count = conn.execute("SELECT COUNT(*) FROM indexed_files").fetchone()[0]
            if not roots:
                return count, []
            expr = " OR ".join('"' + re.sub(r"[^a-z0-9]", "", root) + '"*'
                               for root in roots if root)
            rows = conn.execute(
                "SELECT f.doc_id, f.page_no, f.body, i.sha256 "
                "FROM pages_fts AS f "
                "JOIN indexed_files AS i ON f.doc_id = i.doc_id "
                "WHERE pages_fts MATCH ? ORDER BY bm25(pages_fts) LIMIT 150",
                (expr,),
            ).fetchall()
    except sqlite3.DatabaseError:
        return 0, []

    scored: list[tuple[int, dict[str, Any]]] = []
    for doc_id, page_str, body, sha in rows:
        doc = by_id.get(doc_id)
        if not doc or not _valid_on(doc, as_of):
            continue
        folded = _ascii(body or "")
        title = _ascii(doc["title"])
        matched = [r for r in roots if r in folded]
        # Jeden niepowiązany wyraz na całej stronie to słaba przesłanka.
        min_terms = min(2, len(roots))
        if len(matched) < min_terms:
            continue
        score = 3 * len(matched) + sum(2 for r in roots if r in title)
        page = int(page_str)
        result = {
            "source_id": doc_id,
            "title": doc["title"],
            "section": None,  # Nie wyprowadzaj numeru punktu z losowego wiersza.
            "page_pdf": page,
            "page_printed": None,
            "edition": doc.get("edition"),
            "effective_from": doc.get("effective_from"),
            "url": (doc.get("url") or doc["index_url"]) + "#page=" + str(page),
            "excerpt": _compact_excerpt(body, matched),
            "sha256": sha,
            "provenance": "indeks_lokalny_pdf",
            "needs_manual_interpretation": True,
        }
        scored.append((score, result))
    scored.sort(key=lambda v: (-v[0], v[1]["source_id"], v[1]["page_pdf"]))
    return count, [item for _, item in scored[:limit]]


def answer_question(
    question: str,
    *,
    data_dir: Path,
    as_of: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Dowody i werdykt tylko dla ręcznie zweryfikowanej karty źródłowej.

    Zwrócone urywki pełnotekstowe nie są interpretowane jako normatywny nakaz.
    """
    question = question.strip()
    if len(question) < 3 or len(question) > 600:
        raise ValueError("Pytanie musi zawierać od 3 do 600 znaków.")
    day = date.fromisoformat(as_of).isoformat() if as_of else date.today().isoformat()
    limit = max(1, min(10, limit))
    catalog, cards = _source_data()
    by_id = {doc["id"]: doc for doc in catalog["sources"]}
    roots = _roots(question)

    indexed_count, indexed = _indexed_matches(
        data_dir / "search.sqlite3", roots, by_id, day, limit,
    )
    curated: list[dict[str, Any]] = []
    for rule in cards["requirements"]:
        doc = by_id.get(rule["source_id"])
        required = rule["required_roots"]
        if doc and _valid_on(doc, day) and all(root in roots for root in required):
            curated.append(rule)
    curated.sort(key=lambda item: (-len(item["required_roots"]), item["id"]))
    top = curated[0] if curated else None

    evidence: list[dict[str, Any]] = []
    if top:
        doc = by_id[top["source_id"]]
        page = top["source_pdf_page"]
        evidence.append({
            "source_id": top["source_id"],
            "title": doc["title"],
            "section": top["source_section"],
            "page_pdf": page,
            "page_printed": top["source_printed_page"],
            "edition": top["edition"],
            "effective_from": top["effective_from"],
            "url": doc["url"] + "#page=" + str(page),
            "excerpt": None,  # Parafraza w karcie; nie powielamy tekstu źródłowego.
            "sha256": None,
            "provenance": "karta_wymagania_zweryfikowana",
            "verified_on": top["verified_on"],
            "needs_manual_interpretation": False,
        })
    for hit in indexed:
        if len(evidence) >= limit:
            break
        if not any(x["source_id"] == hit["source_id"]
                   and x["page_pdf"] == hit["page_pdf"] for x in evidence):
            evidence.append(hit)
    if top:
        status = "POTWIERDZONE_W_KARCIE"
        verdict = top["verdict"]
        answer = top["answer_pl"]
        scope = top["scope_pl"]
    elif evidence:
        status = "ZNALEZIONO_FRAGMENTY"
        verdict = None
        answer = "Znaleziono fragmenty dokumentów. Bez pełnej analizy ich treści nie można wydać wiążącego werdyktu."
        scope = "Sprawdź wskazane strony i zakres obowiązywania dokumentu."
    elif indexed_count == 0:
        status = "BRAK_INDEKSU"
        verdict = None
        answer = "Brak lokalnego indeksu PDF. Nie można rozstrzygnąć pytania wyłącznie na podstawie tytułów dokumentów."
        scope = "Pobierz oficjalne pliki i wykonaj indeksowanie albo sprawdź je w źródle."
    else:
        status = "BRAK_POTWIERDZENIA"
        verdict = None
        answer = "Nie odnaleziono wystarczająco powiązanych fragmentów w zaindeksowanym zasobie. To nie oznacza, że wymóg nie istnieje."
        scope = "Możliwy brak dokumentu, inne słownictwo albo wymaganie z innego źródła."

    # Proponuj odpowiednie źródła niezależnie od statusu indeksu.
    recommended: list[tuple[int, dict[str, Any]]] = []
    for doc in catalog["sources"]:
        if not _valid_on(doc, day):
            continue
        title = _ascii(doc["title"])
        matched = sum(1 for root in roots if root in title)
        if matched:
            recommended.append((matched, {
                "source_id": doc["id"],
                "title": doc["title"],
                "url": doc.get("url") or doc["index_url"],
                "effective_from": doc.get("effective_from"),
            }))
    recommended.sort(key=lambda x: (-x[0], x[1]["source_id"]))
    return {
        "question": question,
        "as_of": day,
        "status": status,
        "verdict": verdict,
        "answer_pl": answer,
        "scope_pl": scope,
        "rule_id": top["id"] if top else None,
        "sources": evidence,
        "suggested_documents": [x for _, x in recommended[:4]],
        "indexed_documents": indexed_count,
        "catalog_documents": len(catalog["sources"]),
        "requires_review": bool(not top or indexed_count < len(catalog["sources"])),
        "method": "weryfikowane_karty_i_lokalne_wyszukiwanie_FTS5_bez_generowania_tresci",
    }
