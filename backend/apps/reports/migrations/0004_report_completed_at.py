from django.db import migrations, models
from django.db.models import F


def backfill_completed_at(apps, schema_editor):
    """Existing ready reports have no recorded completion time; use created_at
    as the best available estimate."""
    Report = apps.get_model('reports', 'Report')
    Report.objects.filter(status='ready', completed_at__isnull=True).update(completed_at=F('created_at'))


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0003_one_report_per_assessment'),
    ]

    operations = [
        migrations.AddField(
            model_name='report',
            name='completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_completed_at, noop),
    ]
