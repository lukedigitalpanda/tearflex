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

# Media goes to the default FileSystemStorage from base (no S3 outside prod);
# conftest overrides MEDIA_ROOT to a temp dir for file/image-saving tests.
