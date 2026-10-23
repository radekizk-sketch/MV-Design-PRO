FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
ENV POETRY_VERSION=1.7.1
ENV POETRY_HOME=/opt/poetry
ENV POETRY_VENV=/opt/poetry-venv
ENV POETRY_CACHE_DIR=/opt/.cache

RUN python -m venv $POETRY_VENV \
    && $POETRY_VENV/bin/pip install -U pip setuptools \
    && $POETRY_VENV/bin/pip install poetry==$POETRY_VERSION

ENV PATH="${POETRY_VENV}/bin:${PATH}"

# Copy dependency files
COPY pyproject.toml ./

# Install dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --no-root

# Copy application code
COPY . .

# Install the project
RUN poetry install --no-interaction --no-ansi

# Ensure src/ packages are importable without poetry run
ENV PYTHONPATH=/app/src

# Polityka wątków BLAS obrazu — Z POMIARU PERF-DYN-0 (karta DYNAMIKA-W-TLE, 2026-09-30,
# host 4 CPU bez obcego obciążenia, sieć złota 52 stacje, 5 źródeł GFL, 10 s symulacji,
# 5 000 kroków): 1 wątek — 42,1 s, wątki domyślne (4) — 40,5 s (różnica 4 %, w szumie).
# Rdzeń liczy układy rzadkie i małe operacje gęste, więc wątki BLAS nic nie dają, a przy
# obcym obciążeniu nadsubskrypcja kosztuje rzędy wielkości (karta WATKI-BLAS-E2E: bieg
# zwarciowy 866 s zamiast 6 s). Jeden wątek BLAS = ten sam czas, zero ryzyka.
ENV OPENBLAS_NUM_THREADS=1
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1

EXPOSE 8000

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
