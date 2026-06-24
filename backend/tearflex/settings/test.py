"""Test settings.

Defaults to the project's Postgres (inherited from base) so CI keeps full database
fidelity — important for a future medical device (JSONField semantics, constraints,
migrations all exercised against the real engine). Set ``USE_SQLITE_TESTS=1`` to fall
back to in-memory SQLite for running the suite on a host without a reachable Postgres.
"""
import os

from .base import *  # noqa: F401, F403

# Faster password hashing for tests.
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

if os.environ.get('USE_SQLITE_TESTS') == '1':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': ':memory:',
        }
    }
