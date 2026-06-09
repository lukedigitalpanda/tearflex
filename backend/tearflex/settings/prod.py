import os
import sys
from .base import *

SECRET_KEY = os.environ.get('SECRET_KEY', '')
if not SECRET_KEY:
    sys.exit('FATAL: SECRET_KEY environment variable is not set.')

DEBUG = False
ALLOWED_HOSTS = os.environ.get(
    'ALLOWED_HOSTS', 'tearflex.mydryeyeapp.co.uk,localhost'
).split(',')

CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'https://tearflex.mydryeyeapp.co.uk',
).split(',')

# Trust X-Forwarded-Proto from nginx
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# Static and media storage
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Media storage — local by default; switch to S3 by setting DEFAULT_FILE_STORAGE env var
MEDIA_ROOT = os.environ.get('MEDIA_ROOT', '/app/media')

# S3 (leave blank to use local filesystem; set DEFAULT_FILE_STORAGE + AWS_* to switch)
AWS_STORAGE_BUCKET_NAME = os.environ.get('AWS_STORAGE_BUCKET_NAME', '')
AWS_S3_REGION_NAME = os.environ.get('AWS_S3_REGION_NAME', '')
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
AWS_S3_ENDPOINT_URL = os.environ.get('AWS_S3_ENDPOINT_URL', '')
