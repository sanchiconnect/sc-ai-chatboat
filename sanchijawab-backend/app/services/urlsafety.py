"""SSRF guard (SAN-1126, OWASP A10). The crawler and the CRM/Slack webhooks
fetch URLs a customer typed in, so without this a customer could point them
at localhost, the cloud metadata service (169.254.169.254) or other internal
hosts. Only public http(s) hosts are allowed; set ALLOW_PRIVATE_URLS=true in
.env to crawl local sites during development.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from ..config import settings


class UnsafeURLError(ValueError):
    pass


def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise UnsafeURLError("URL must start with http:// or https:// and include a host")
    if settings.allow_private_urls:
        return
    try:
        addrs = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, None)}
    except socket.gaierror as e:
        raise UnsafeURLError(f"Could not resolve host {parsed.hostname!r}") from e
    for addr in addrs:
        ip = ipaddress.ip_address(addr.split("%")[0])
        if not ip.is_global:
            raise UnsafeURLError("URL points to a private or internal address, which isn't allowed")
