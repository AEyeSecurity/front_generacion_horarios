"""Disposable local backend for contract/E2E checks; never uses the configured DB."""
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

backend = Path(__file__).resolve().parents[2] / "Shift-Backend"
sys.path.insert(0, str(backend))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
os.environ["PYTHON_DOTENV_DISABLED"] = "1"
os.environ["DATABASE_URL"] = ""
os.environ["EMAIL_BACKEND"] = "django.core.mail.backends.locmem.EmailBackend"
os.environ["SECRET_KEY"] = "local-api-contract-audit-only-not-for-production"

with TemporaryDirectory(prefix="shift-contract-") as directory:
    from django.conf import settings
    settings.DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": str(Path(directory) / "audit.sqlite3")}}
    import django
    django.setup()
    from django.core.management import call_command
    from django.contrib.auth import get_user_model
    call_command("migrate", verbosity=0)
    get_user_model().objects.create_superuser(
        email="contract-audit@example.invalid", password="Contract-audit-local-123!", email_verified=True,
    )
    print("Disposable contract backend ready on 127.0.0.1:8000", flush=True)
    call_command("runserver", "127.0.0.1:8000", use_reloader=False)
