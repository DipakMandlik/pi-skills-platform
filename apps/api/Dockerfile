FROM python:3.12-slim

WORKDIR /app

# Install system deps needed by asyncpg and bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY apps/api/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY apps/ apps/
COPY pyproject.toml .

# Alembic config lives at project root
COPY alembic.ini .

# Non-root user for security
RUN useradd --no-create-home --shell /bin/false appuser && \
    chmod +x apps/api/entrypoint.sh
USER appuser

EXPOSE 8000

# entrypoint runs `alembic upgrade head` then starts uvicorn
CMD ["apps/api/entrypoint.sh"]
