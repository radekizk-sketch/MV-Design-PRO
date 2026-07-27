#!/usr/bin/env python3
"""Most rozmowy Claude <-> GPT SOL (Codex CLI, `codex exec`).

SOL to recenzent/doradca/audytor uruchamiany w trybie read-only na tym repo.
Skrypt trzyma wątek rozmowy na dysku (`.sol/threads/<slug>/`), żeby kolejne
tury były kontynuacją tej samej sesji, a nie nową rozmową od zera.

Użycie:
    sol.py check
    sol.py ask   --thread <slug> --mode audit --message-file brief.md [--paths a.py b.ts]
    sol.py reply --thread <slug> --message "..."
    sol.py show  --thread <slug> [--last]
    sol.py list
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent

CODEX_BIN = os.environ.get("SOL_CODEX_BIN", "codex")
DEFAULT_MODEL = os.environ.get("SOL_MODEL", "gpt-5.6")
DEFAULT_EFFORT = os.environ.get("SOL_EFFORT", "xhigh")
DEFAULT_SANDBOX = os.environ.get("SOL_SANDBOX", "read-only")
DEFAULT_TIMEOUT = int(os.environ.get("SOL_TIMEOUT", "1500"))

# Kolejność degradacji poziomu rozumowania, gdy zainstalowany Codex nie zna
# żądanej wartości. `None` = nie wysyłaj `-c model_reasoning_effort` w ogóle.
EFFORT_FALLBACKS: tuple[str | None, ...] = ("high", None)

SESSION_KEYS = ("session_id", "thread_id", "conversation_id", "rollout_id")

# Powyżej tego progu materiał nie leci w argv (limit ~128 kB na argument),
# tylko jako plik, który SOL czyta sam w sandboxie read-only.
INLINE_PROMPT_LIMIT = 60_000


# --------------------------------------------------------------------------
# ścieżki i stan wątku
# --------------------------------------------------------------------------


def repo_root() -> Path:
    env = os.environ.get("SOL_REPO_ROOT")
    if env:
        return Path(env).resolve()
    return SKILL_DIR.parents[2]


def thread_dir(slug: str) -> Path:
    return repo_root() / ".sol" / "threads" / slug


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_meta(slug: str) -> dict | None:
    path = thread_dir(slug) / "meta.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_meta(slug: str, meta: dict) -> None:
    path = thread_dir(slug) / "meta.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_reference(*parts: str) -> str:
    path = SKILL_DIR.joinpath(*parts)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8").strip()


# --------------------------------------------------------------------------
# budowanie promptu
# --------------------------------------------------------------------------


def message_text(args: argparse.Namespace) -> str:
    if args.message_file:
        path = Path(args.message_file)
        if not path.is_absolute():
            path = Path.cwd() / path
        if not path.exists():
            fail(f"Nie ma pliku z wiadomością: {path}")
        return path.read_text(encoding="utf-8").strip()
    if args.message:
        return args.message.strip()
    fail("Podaj --message albo --message-file.")
    return ""  # nieosiągalne


def paths_block(paths: list[str]) -> str:
    if not paths:
        return ""
    lines = "\n".join(f"- `{p}`" for p in paths)
    return f"## Pliki do przejrzenia\n\n{lines}\n"


def compose_prompt(
    *,
    message: str,
    paths: list[str],
    mode: str,
    persona: bool,
    first_turn: bool,
    replay: str = "",
) -> str:
    parts: list[str] = []
    if first_turn or replay:
        if persona:
            text = read_reference("references", "PERSONA_SOL.md")
            if text:
                parts.append(text)
        mode_text = read_reference("references", "modes", f"{mode}.md")
        if mode_text:
            parts.append(mode_text)
        parts.append(
            "## Kontekst techniczny\n\n"
            f"- Repozytorium: `{repo_root()}` (jesteś w nim, tryb read-only).\n"
            "- Możesz czytać dowolne pliki repo, żeby zweryfikować twierdzenia.\n"
            "- Nie modyfikujesz plików i nie uruchamiasz zmian — twoje wyjście to sama recenzja.\n"
            "- Rozmówcą jest Claude (agent kodujący). Odpowiadaj po polsku."
        )
    if replay:
        parts.append(
            "## Dotychczasowa rozmowa\n\n"
            "Sesja Codeksa została utracona, poniżej pełny zapis wątku. "
            "Kontynuuj go, nie zaczynaj od nowa.\n\n" + replay
        )
    parts.append(f"## Wiadomość od Claude\n\n{message}")
    block = paths_block(paths)
    if block:
        parts.append(block)
    return "\n\n---\n\n".join(p for p in parts if p.strip()) + "\n"


# --------------------------------------------------------------------------
# wywołanie codex
# --------------------------------------------------------------------------


def codex_available() -> str | None:
    return shutil.which(CODEX_BIN)


def build_cmd(
    *,
    prompt_arg: str,
    resume_id: str | None,
    model: str,
    effort: str | None,
    sandbox: str,
    out_file: Path,
) -> list[str]:
    cmd = [CODEX_BIN, "exec"]
    if resume_id:
        cmd += ["resume", resume_id]
    cmd += [
        "--cd",
        str(repo_root()),
        "--sandbox",
        sandbox,
        "--json",
        "--output-last-message",
        str(out_file),
        "-m",
        model,
    ]
    if effort:
        cmd += ["-c", f'model_reasoning_effort="{effort}"']
    cmd += ["--", prompt_arg]
    return cmd


def looks_like_effort_error(stderr: str) -> bool:
    low = stderr.lower()
    return "reasoning" in low or "effort" in low


def looks_like_resume_error(stderr: str) -> bool:
    low = stderr.lower()
    return any(
        token in low
        for token in ("resume", "session", "rollout", "not found", "no such", "unrecognized")
    )


def search_session_id(node) -> str | None:
    if isinstance(node, dict):
        for key in SESSION_KEYS:
            value = node.get(key)
            if isinstance(value, str) and len(value) >= 8:
                return value
        for value in node.values():
            found = search_session_id(value)
            if found:
                return found
    elif isinstance(node, list):
        for value in node:
            found = search_session_id(value)
            if found:
                return found
    return None


def parse_events(stdout: str) -> tuple[str | None, str]:
    """Zwraca (session_id, ostatnia wiadomość agenta) z JSONL Codeksa."""
    session_id: str | None = None
    messages: list[str] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if session_id is None:
            session_id = search_session_id(obj)
        item = obj.get("item")
        if isinstance(item, dict) and item.get("type") == "agent_message":
            text = item.get("text") or ""
            if text.strip():
                messages.append(text)
        msg = obj.get("msg")
        if isinstance(msg, dict) and msg.get("type") == "agent_message":
            text = msg.get("message") or ""
            if text.strip():
                messages.append(text)
    return session_id, (messages[-1].strip() if messages else "")


def invoke(
    *,
    prompt_arg: str,
    resume_id: str | None,
    model: str,
    effort: str,
    sandbox: str,
    timeout: int,
    out_file: Path,
) -> tuple[str, str | None, str]:
    """Uruchamia codex exec. Zwraca (odpowiedź, session_id, użyty effort)."""
    attempts: list[str | None] = [effort]
    attempts += [e for e in EFFORT_FALLBACKS if e != effort]
    last_stderr = ""
    for eff in attempts:
        cmd = build_cmd(
            prompt_arg=prompt_arg,
            resume_id=resume_id,
            model=model,
            effort=eff,
            sandbox=sandbox,
            out_file=out_file,
        )
        if out_file.exists():
            out_file.unlink()
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=str(repo_root()),
            )
        except subprocess.TimeoutExpired:
            fail(
                f"codex exec przekroczył limit {timeout} s. "
                "Zwiększ SOL_TIMEOUT albo podziel pytanie na mniejsze."
            )
            raise
        session_id, answer = parse_events(proc.stdout)
        if out_file.exists():
            file_answer = out_file.read_text(encoding="utf-8").strip()
            if file_answer:
                answer = file_answer
        if proc.returncode == 0 and answer:
            return answer, session_id, (eff or "domyślny")
        last_stderr = proc.stderr.strip() or proc.stdout.strip()
        if proc.returncode != 0 and eff and looks_like_effort_error(last_stderr):
            continue  # spróbuj niższego poziomu rozumowania
        break

    detail = last_stderr[-2000:] if last_stderr else "(brak stderr)"
    raise CodexError(detail)


class CodexError(RuntimeError):
    pass


# --------------------------------------------------------------------------
# zapis tury
# --------------------------------------------------------------------------


def next_turn(slug: str) -> int:
    meta = load_meta(slug) or {}
    return int(meta.get("turns", 0)) + 1


def write_turn(slug: str, turn: int, message: str, answer: str) -> tuple[Path, Path]:
    directory = thread_dir(slug)
    directory.mkdir(parents=True, exist_ok=True)
    claude_path = directory / f"{turn:03d}-claude.md"
    sol_path = directory / f"{turn:03d}-sol.md"
    claude_path.write_text(message.rstrip() + "\n", encoding="utf-8")
    sol_path.write_text(answer.rstrip() + "\n", encoding="utf-8")
    transcript = directory / "transcript.md"
    with transcript.open("a", encoding="utf-8") as handle:
        handle.write(f"\n## Tura {turn} — Claude ({now_iso()})\n\n{message.rstrip()}\n")
        handle.write(f"\n## Tura {turn} — SOL ({now_iso()})\n\n{answer.rstrip()}\n")
    return claude_path, sol_path


def transcript_text(slug: str) -> str:
    path = thread_dir(slug) / "transcript.md"
    return path.read_text(encoding="utf-8").strip() if path.exists() else ""


# --------------------------------------------------------------------------
# komendy
# --------------------------------------------------------------------------


def fail(message: str) -> None:
    print(f"BŁĄD: {message}", file=sys.stderr)
    raise SystemExit(2)


def cmd_check(args: argparse.Namespace) -> int:
    binary = codex_available()
    print(f"repo:     {repo_root()}")
    print(f"wątki:    {repo_root() / '.sol' / 'threads'}")
    print(f"model:    {args.model}")
    print(f"effort:   {args.effort}")
    print(f"sandbox:  {DEFAULT_SANDBOX}")
    print(f"timeout:  {DEFAULT_TIMEOUT} s")
    if not binary:
        print(f"codex:    BRAK (`{CODEX_BIN}` nie jest w PATH)")
        print("\nInstalacja: npm install -g @openai/codex   (potem: codex login)")
        return 1
    print(f"codex:    {binary}")
    try:
        proc = subprocess.run(
            [CODEX_BIN, "--version"], capture_output=True, text=True, timeout=60
        )
        print(f"wersja:   {(proc.stdout or proc.stderr).strip()}")
    except Exception as exc:  # noqa: BLE001 - diagnostyka środowiska
        print(f"wersja:   nie udało się odczytać ({exc})")
    return 0


def send(args: argparse.Namespace, *, first_turn: bool) -> int:
    slug = args.thread
    if not codex_available():
        fail(
            f"`{CODEX_BIN}` nie jest zainstalowany. Uruchom `sol.py check`, "
            "zainstaluj Codex CLI (`npm install -g @openai/codex`) i zaloguj się (`codex login`)."
        )

    meta = load_meta(slug)
    if first_turn and meta and not args.reset:
        fail(f"Wątek '{slug}' już istnieje ({meta.get('turns', 0)} tur). Użyj `reply` albo --reset.")
    if not first_turn and not meta:
        fail(f"Wątek '{slug}' nie istnieje. Zacznij od `ask`.")
    if first_turn and args.reset and thread_dir(slug).exists():
        shutil.rmtree(thread_dir(slug))
        meta = None

    message = message_text(args)
    mode = getattr(args, "mode", None) or (meta or {}).get("mode", "free")
    model = args.model or (meta or {}).get("model") or DEFAULT_MODEL
    effort = args.effort or (meta or {}).get("effort") or DEFAULT_EFFORT
    turn = 1 if first_turn else next_turn(slug)

    prompt = compose_prompt(
        message=message,
        paths=args.paths or [],
        mode=mode,
        persona=not args.no_persona,
        first_turn=first_turn,
    )

    directory = thread_dir(slug)
    directory.mkdir(parents=True, exist_ok=True)
    prompt_path = directory / f"{turn:03d}-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    out_file = directory / f"{turn:03d}-last-message.txt"

    if len(prompt) > INLINE_PROMPT_LIMIT:
        rel = prompt_path.relative_to(repo_root())
        prompt_arg = (
            f"Przeczytaj plik `{rel}` w tym repo — to pełna treść tej tury rozmowy "
            "(persona, tryb pracy i materiał od Claude). Wykonaj zadanie opisane w tym pliku."
        )
    else:
        prompt_arg = prompt

    resume_id = None if first_turn else (meta or {}).get("session_id")
    try:
        answer, session_id, used_effort = invoke(
            prompt_arg=prompt_arg,
            resume_id=resume_id,
            model=model,
            effort=effort,
            sandbox=DEFAULT_SANDBOX,
            timeout=args.timeout,
            out_file=out_file,
        )
    except CodexError as exc:
        if resume_id and looks_like_resume_error(str(exc)):
            # Sesja Codeksa przepadła — odtwórz wątek z lokalnego zapisu.
            replay_prompt = compose_prompt(
                message=message,
                paths=args.paths or [],
                mode=mode,
                persona=not args.no_persona,
                first_turn=True,
                replay=transcript_text(slug),
            )
            prompt_path.write_text(replay_prompt, encoding="utf-8")
            rel = prompt_path.relative_to(repo_root())
            replay_arg = (
                replay_prompt
                if len(replay_prompt) <= INLINE_PROMPT_LIMIT
                else (
                    f"Przeczytaj plik `{rel}` w tym repo — to pełny kontekst wątku "
                    "i bieżąca wiadomość. Kontynuuj tę rozmowę."
                )
            )
            try:
                answer, session_id, used_effort = invoke(
                    prompt_arg=replay_arg,
                    resume_id=None,
                    model=model,
                    effort=effort,
                    sandbox=DEFAULT_SANDBOX,
                    timeout=args.timeout,
                    out_file=out_file,
                )
            except CodexError as exc2:
                fail(f"codex exec nie zwrócił odpowiedzi (po odtworzeniu wątku):\n{exc2}")
                raise
        else:
            fail(f"codex exec nie zwrócił odpowiedzi:\n{exc}")
            raise

    claude_path, sol_path = write_turn(slug, turn, message, answer)
    new_meta = {
        "slug": slug,
        "title": getattr(args, "title", None) or (meta or {}).get("title") or slug,
        "mode": mode,
        "model": model,
        "effort": effort,
        "effort_used": used_effort,
        "session_id": session_id or (meta or {}).get("session_id"),
        "created": (meta or {}).get("created") or now_iso(),
        "updated": now_iso(),
        "turns": turn,
    }
    save_meta(slug, new_meta)

    print(f"=== SOL — wątek '{slug}', tura {turn} (model {model}, rozumowanie {used_effort}) ===\n")
    print(answer.strip())
    print(
        f"\n=== koniec odpowiedzi SOL ===\n"
        f"zapis: {sol_path.relative_to(repo_root())} | "
        f"wiadomość: {claude_path.relative_to(repo_root())}"
    )
    return 0


def cmd_ask(args: argparse.Namespace) -> int:
    return send(args, first_turn=True)


def cmd_reply(args: argparse.Namespace) -> int:
    return send(args, first_turn=False)


def cmd_show(args: argparse.Namespace) -> int:
    meta = load_meta(args.thread)
    if not meta:
        fail(f"Wątek '{args.thread}' nie istnieje.")
    if args.last:
        turn = int(meta["turns"])
        path = thread_dir(args.thread) / f"{turn:03d}-sol.md"
        print(path.read_text(encoding="utf-8"))
        return 0
    print(transcript_text(args.thread))
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    root = repo_root() / ".sol" / "threads"
    if not root.exists():
        print("Brak wątków.")
        return 0
    rows = []
    for directory in sorted(root.iterdir()):
        meta_path = directory / "meta.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        rows.append(
            f"{meta['slug']:<28} tur={meta.get('turns', 0):<3} "
            f"tryb={meta.get('mode', '?'):<8} {meta.get('updated', '')}"
        )
    print("\n".join(rows) if rows else "Brak wątków.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Most rozmowy Claude <-> GPT SOL (Codex CLI).")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--thread", required=True, help="Identyfikator wątku, np. sld-lod-audit.")
        sp.add_argument("--message", help="Treść wiadomości do SOL.")
        sp.add_argument("--message-file", help="Plik z treścią wiadomości (preferowane dla briefów).")
        sp.add_argument("--paths", nargs="*", default=[], help="Pliki, które SOL ma przejrzeć.")
        sp.add_argument("--no-persona", action="store_true", help="Nie wysyłaj persony SOL.")
        sp.add_argument("--model", default=None, help=f"Model (domyślnie {DEFAULT_MODEL}).")
        sp.add_argument("--effort", default=None, help=f"Poziom rozumowania (domyślnie {DEFAULT_EFFORT}).")
        sp.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Limit sekund.")

    p_check = sub.add_parser("check", help="Sprawdź dostępność Codex CLI i konfigurację.")
    p_check.add_argument("--model", default=DEFAULT_MODEL)
    p_check.add_argument("--effort", default=DEFAULT_EFFORT)
    p_check.set_defaults(func=cmd_check)

    p_ask = sub.add_parser("ask", help="Otwórz nowy wątek z SOL.")
    add_common(p_ask)
    p_ask.add_argument("--title", help="Tytuł wątku.")
    p_ask.add_argument(
        "--mode",
        choices=("review", "advise", "audit", "free"),
        default="review",
        help="Tryb pracy SOL.",
    )
    p_ask.add_argument("--reset", action="store_true", help="Skasuj istniejący wątek o tym slugu.")
    p_ask.set_defaults(func=cmd_ask)

    p_reply = sub.add_parser("reply", help="Kolejna tura w istniejącym wątku.")
    add_common(p_reply)
    p_reply.set_defaults(func=cmd_reply)

    p_show = sub.add_parser("show", help="Pokaż zapis wątku.")
    p_show.add_argument("--thread", required=True)
    p_show.add_argument("--last", action="store_true", help="Tylko ostatnia odpowiedź SOL.")
    p_show.set_defaults(func=cmd_show)

    p_list = sub.add_parser("list", help="Lista wątków.")
    p_list.set_defaults(func=cmd_list)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
