"""Test settings — uses SQLite so no running Postgres is required."""
from .base import *  # noqa: F401, F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Silence password hashing for speed
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

# Use local filesystem storage (tests also override MEDIA_ROOT via conftest)
DEFAULT_FILE_STORAGE = 'django.core.files.storage.FileSystemStorage'
