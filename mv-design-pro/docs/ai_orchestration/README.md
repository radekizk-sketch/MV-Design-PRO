# MV-DESIGN-PRO — AI agent router

Cel: ograniczyć ręczne przekazywanie kontekstu pomiędzy Opus, GPT-6 Astra, GPT-5.6 Sol/Codex i Fable.

## Ważne ograniczenie

Ten mechanizm **nie uruchamia modeli innych dostawców samoczynnie**. Przy pracy wyłącznie na abonamentach użytkownik nadal ręcznie otwiera odpowiednią aplikację/model. Router automatyzuje natomiast decyzję **kto jest następny**, standaryzuje pakiet przekazania i minimalizuje zużycie limitu GPT-6 Astra.

## Role

- **OPUS** — wykonawca: implementacja, eksperymenty, katalogi, przygotowanie surowych dowodów.
- **SOL_CODEX** — tani filtr i sekretarz techniczny: zbiera stan repo, sprawdza wykonanie, kompresuje dowody i przygotowuje pakiet recenzencki.
- **ASTRA** — ograniczony zasób: niezależna recenzja problemów P0/P1 z matematyki, fizyki, numeryki i łańcucha dowodowego. Nie wykonuje masowej implementacji.
- **FABLE** — końcowa władza architektoniczna: podejmuje decyzje kanoniczne po otrzymaniu skondensowanych dowodów.

## Zasada routingu

1. Jeśli trzeba **wykonać pracę** → OPUS.
2. Jeśli trzeba **zebrać/streścić/zweryfikować repo lub testy** → SOL_CODEX.
3. Jeśli istnieje **nierozstrzygnięty problem P0/P1**, który wymaga profesorskiego arbitrażu matematycznego/fizycznego → ASTRA.
4. Jeśli trzeba **ustanowić lub zmienić architekturę kanoniczną** → FABLE.
5. Po werdykcie ASTRA/FABLE implementacja wraca do OPUS.

## Oszczędzanie limitu Astry

Astra nie dostaje całego repo ani historii rozmów. Dostaje jeden `ASTRA_REVIEW_PACKET.md` zawierający tylko:

- twierdzenie do oceny,
- minimalny stan wejściowy,
- istotne równania,
- właściwe fragmenty kodu,
- pomiary przed/po,
- kontrdowody,
- maksymalnie kilka pytań decyzyjnych.

Astra ma wydawać werdykt, a nie wykonywać pracę przygotowawczą.

## Prosty przebieg

```text
OPUS -> SOL_CODEX -> [ASTRA tylko gdy P0/P1] -> OPUS -> SOL_CODEX -> FABLE
```

Jeżeli Astra nie jest potrzebna:

```text
OPUS -> SOL_CODEX -> OPUS -> FABLE
```

## Użycie routera

```bash
python tools/ai_router.py --stage implementation
python tools/ai_router.py --stage review --severity P0 --astra available
python tools/ai_router.py --stage review --severity P2 --astra available
python tools/ai_router.py --stage architecture
python tools/ai_router.py --stage apply-verdict
```

Router zwraca model oraz gotową instrukcję przekazania.
