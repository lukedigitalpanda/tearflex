FROM python:3.12-slim

# WeasyPrint native deps (for PDF reports) + ffmpeg (for Phase C NIBUT pipeline)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-xlib-2.0-0 \
    libffi-dev \
    libcairo2 \
    libpq-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements/base.txt requirements/base.txt
RUN pip install --no-cache-dir -r requirements/base.txt

COPY . .

# Collect static files at build time (no DB needed; dummy SECRET_KEY sufficient)
RUN SECRET_KEY=build-placeholder \
    DJANGO_SETTINGS_MODULE=tearflex.settings.base \
    python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["gunicorn", "tearflex.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--timeout", "120"]
