from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0004_report_completed_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='report',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
