# TearFlex

Smartphone tear film analysis platform for clinical dry eye assessment.

## Architecture

- `backend/` - Django REST API (Python 3.12+, PostgreSQL, Celery + Redis)
- `web/` - Next.js 14 web app (TypeScript, Tailwind, shadcn/ui)
- `mobile/` - React Native / Expo mobile app (iOS + Android)
- `shared/` - Shared TypeScript types and constants
- `CLAUDE.md` - Full project specification for Claude Code

## Quick Start

### 1. Start infrastructure
```bash
cd backend
docker-compose up -d   # PostgreSQL + Redis
```

### 2. Start backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### 3. Start web app
```bash
cd web
npm install && npm run dev
```

### 4. Start mobile app
```bash
cd mobile
npm install && npx expo start
```

## API Documentation

With the backend running, visit http://localhost:8000/api/docs/
