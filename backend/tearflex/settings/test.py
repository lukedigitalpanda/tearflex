"""Test settings — SQLite in-memory so no running Postgres is required.

The CI/prod database is Postgres; this override is for running the suite on a host
without a reachable project Postgres. Consider gating behind an env var so CI keeps
Postgres fidelity (SaMD).
"""
from .base import *  # noqa: F401, F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Faster password hashing for tests.
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
