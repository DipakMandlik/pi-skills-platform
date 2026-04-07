FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY apps/mcp/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy full source (monorepo layout)
COPY apps/ /app/apps/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production \
    MCP_PORT=5001 \
    SQL_SAFETY_MODE=prod

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

CMD ["uvicorn", "apps.mcp.main:app", "--host", "0.0.0.0", "--port", "5001"]
