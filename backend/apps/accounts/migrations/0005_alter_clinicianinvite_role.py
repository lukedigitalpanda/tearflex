from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_chain'),
    ]

    operations = [
        migrations.AlterField(
            model_name='clinicianinvite',
            name='role',
            field=models.CharField(
                choices=[
                    ('chain_admin', 'Chain Admin'),
                    ('admin', 'Practice Admin'),
                    ('clinician', 'Clinician'),
                    ('technician', 'Technician'),
                ],
                default='clinician',
                max_length=20,
            ),
        ),
    ]
