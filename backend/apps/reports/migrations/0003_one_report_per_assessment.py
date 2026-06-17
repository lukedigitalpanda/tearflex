import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Count


def dedupe_reports(apps, schema_editor):
    """Collapse any existing multiple-reports-per-assessment down to one.

    Keeps the most recently created 'ready' report (or, if none are ready, the
    most recent overall) and deletes the rest, so the OneToOne constraint can be
    applied. Orphaned PDF files on disk are left as harmless leftovers.
    """
    Report = apps.get_model('reports', 'Report')
    dupe_assessments = (
        Report.objects.values('assessment')
        .annotate(n=Count('id'))
        .filter(n__gt=1)
    )
    for row in dupe_assessments:
        reports = list(
            Report.objects.filter(assessment_id=row['assessment']).order_by('-created_at')
        )
        keep = next((r for r in reports if r.status == 'ready'), reports[0])
        for r in reports:
            if r.pk != keep.pk:
                r.delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0002_report_generation_attempts'),
    ]

    operations = [
        migrations.RunPython(dedupe_reports, noop),
        migrations.AlterField(
            model_name='report',
            name='assessment',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='report',
                to='assessments.assessment',
            ),
        ),
    ]
