from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_alter_clinicianinvite_role'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='OnboardingRegistration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('registration_type', models.CharField(choices=[('practice', 'Practice'), ('chain', 'Chain')], max_length=10)),
                ('contact_first_name', models.CharField(max_length=100)),
                ('contact_last_name', models.CharField(max_length=100)),
                ('contact_email', models.EmailField(max_length=254)),
                ('contact_title', models.CharField(blank=True, max_length=20)),
                ('professional_registration', models.CharField(blank=True, max_length=50)),
                ('password', models.CharField(max_length=128)),
                ('practice_name', models.CharField(max_length=255)),
                ('address_line_1', models.CharField(max_length=255)),
                ('address_line_2', models.CharField(blank=True, max_length=255)),
                ('city', models.CharField(max_length=100)),
                ('postcode', models.CharField(max_length=10)),
                ('phone', models.CharField(blank=True, max_length=20)),
                ('practice_email', models.EmailField(blank=True, max_length=254)),
                ('chain_name', models.CharField(blank=True, max_length=255)),
                ('email_token', models.CharField(blank=True, max_length=64, unique=True)),
                ('email_verified_at', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(
                    choices=[
                        ('pending_verification', 'Pending email verification'),
                        ('awaiting_approval', 'Awaiting superadmin approval'),
                        ('provisioned', 'Provisioned'),
                        ('rejected', 'Rejected'),
                    ],
                    default='pending_verification',
                    max_length=24,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('decided_at', models.DateTimeField(blank=True, null=True)),
                ('provisioned_practice', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='accounts.practice',
                )),
                ('provisioned_clinician', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='accounts.clinician',
                )),
                ('decided_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
