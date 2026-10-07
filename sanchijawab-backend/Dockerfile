# SanchiJawab API + worker image (same image, different command — see docker-compose.yml).
# Heavy on purpose: it carries Chromium (website crawling + PDF invoices) and the
# document parser's ML dependencies, so expect a multi-GB image and a long first build.
# bookworm, not the default (trixie): playwright 1.49 --with-deps asks for font packages trixie dropped.
FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    UV_HTTP_TIMEOUT=900 \
    UV_CONCURRENT_DOWNLOADS=4

WORKDIR /app

# Dependencies first so code changes don't reinstall them.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

# Browser + the system libraries it needs (crawler, JS rendering, invoice PDFs).
RUN playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Uploaded files / local data when S3 isn't configured (mount a volume here).
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
