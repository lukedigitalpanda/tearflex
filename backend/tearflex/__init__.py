# Ensure the Celery app is loaded and set as the current app when Django starts,
# so shared_task instances (and .delay() from the web process) use the broker
# configured in Django settings rather than the unconfigured default app.
from .celery import app as celery_app

__all__ = ('celery_app',)
