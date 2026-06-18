"""Internal free/disposable email classification — no external API.

A bundled list of known free-provider and disposable domains is loaded once
into a frozenset. Domains NOT on the list are treated as professional.
"""
import os

_DATA_FILE = os.path.join(os.path.dirname(__file__), 'data', 'free_email_domains.txt')


def _load_domains():
    domains = set()
    with open(_DATA_FILE, encoding='utf-8') as fh:
        for line in fh:
            domain = line.strip().lower()
            if domain and not domain.startswith('#'):
                domains.add(domain)
    return frozenset(domains)


FREE_OR_DISPOSABLE_DOMAINS = _load_domains()


def is_free_or_disposable(email):
    """True if `email`'s domain is a known free or disposable provider."""
    if not email or '@' not in email:
        return False
    domain = email.rsplit('@', 1)[1].strip().lower()
    return domain in FREE_OR_DISPOSABLE_DOMAINS
