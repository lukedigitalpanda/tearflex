def user_is_report_admin(user) -> bool:
    """Superusers and practice admins are the elevated group for reports: they
    may see pending/failed reports and the precise completion time, and may
    retry/delete reports. Ordinary clinicians/technicians only ever see finished
    ('ready') reports."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser:
        return True
    clinician = getattr(user, 'clinician', None)
    return bool(clinician and clinician.role in ('admin', 'chain_admin'))
