import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_passwordresettoken'),
    ]

    operations = [
        migrations.CreateModel(
            name='Chain',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddField(
            model_name='practice',
            name='chain',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='practices', to='accounts.chain',
            ),
        ),
        migrations.AlterField(
            model_name='clinician',
            name='role',
            field=models.CharField(
                choices=[
                    ('chain_admin', 'Chain Admin'),
                    ('admin', 'Practice Admin'),
                    ('clinician', 'Clinician'),
                    ('technician', 'Technician'),
                ],
                default='clinician', max_length=20,
            ),
        ),
    ]
