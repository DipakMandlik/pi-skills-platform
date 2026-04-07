FROM python:3.12-slim

WORKDIR /app

# gcc needed to compile snowflake-connector-python C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY apps/mcp/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY apps/ apps/
COPY pyproject.toml .

# Non-root user for security
RUN useradd --no-create-home --shell /bin/false appuser
USER appuser

EXPOSE 5000

CMD ["python", "-m", "uvicorn", "apps.mcp.main:app", \
     "--host", "0.0.0.0", \
     "--port", "5000", \
     "--workers", "1", \
     "--no-access-log"]
