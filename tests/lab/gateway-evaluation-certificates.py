"""Ephemeral certificates for the owned, internal Docker TLS canary only.

The gateway receives ca.pem only. Private keys remain in the synthetic target container.
No system trust store is modified and none of these test keys is used on a real site.
"""
import datetime
import pathlib
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

out = pathlib.Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc)


def authority(common_name):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(minutes=5))
            .not_valid_after(now + datetime.timedelta(days=2))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .sign(key, hashes.SHA256()))
    return key, cert


def server(prefix, names, ca_key, ca_cert):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, names[0])])
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(ca_cert.subject)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(minutes=5))
            .not_valid_after(now + datetime.timedelta(days=2))
            .add_extension(x509.SubjectAlternativeName([x509.DNSName(n) for n in names]), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .sign(ca_key, hashes.SHA256()))
    (out / f"{prefix}.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    (out / f"{prefix}-key.pem").write_bytes(key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))


ca_key, ca_cert = authority("Oddhound evaluation canary CA")
(out / "ca.pem").write_bytes(ca_cert.public_bytes(serialization.Encoding.PEM))
server("server", ["fixture.test", "api.test", "resource.test"], ca_key, ca_cert)
bad_key, bad_ca = authority("Untrusted canary CA")
(out / "untrusted-ca.pem").write_bytes(bad_ca.public_bytes(serialization.Encoding.PEM))
server("untrusted", ["badcert.test"], bad_key, bad_ca)
print("Generated ephemeral canary certificates; public CA only is mounted in gateway.")
