from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='report',
            name='generation_attempts',
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
