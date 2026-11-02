"""Frozen owner-only evaluation boundary. All sockets are refused before protocol upgrade.

Adapted from the owned root gateway candidate, not a claim of public release readiness. mitmproxy owns
HTTP/TLS; smokescreen owns DNS validation-to-dial; protected kernel quotas bound admitted upstream bytes.
"""
import json
import asyncio
import os
import re
import time
import zlib
from collections import deque
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
from mitmproxy import ctx, http, version

# mitmproxy 12.3.1 creates native HTTP/1 and HTTP/2 protocol-error responses after the
# addon error hook; they never enter responseheaders(). Both native factories read this
# Server identifier. Attribute those responses without changing transport/TLS behavior.
# Pin the reviewed implementation and strip upstream spoofing below.
if version.VERSION != '12.3.1':
    raise RuntimeError('unreviewed_mitmproxy_error_attribution_version')
NATIVE_ERROR_SERVER = 'oddhound-evaluation-gateway/12.3.1'
version.MITMPROXY = NATIVE_ERROR_SERVER

BASE = Path('/run/oddhound-evaluation')
POLICY = json.loads((BASE / 'policy.json').read_text())
UI = POLICY['primaryOrigin']
APIS = set(POLICY['apiOrigins'])
LIMITS = POLICY['limits']
LAB = os.environ.get('ODDHOUND_EVALUATION_LAB') == '1'
STATE = BASE / 'state' / 'state.json'
SAFE = {'GET', 'HEAD', 'OPTIONS'}
METHODS = SAFE | {'POST', 'PUT', 'PATCH', 'DELETE'}
ASSETS = {'script', 'style', 'image', 'font', 'manifest', 'audio', 'video', 'track', 'iframe'}
RESERVED = set(POLICY.get('reservedHosts', [])) | {'api.meta.ai', 'api.modal.com'}


def origin(request):
    return request.scheme + '://' + request.host.lower() + ('' if request.port == 443 else ':' + str(request.port))


class Boundary:
    def __init__(self):
        self.requests = 0
        self.received = 0
        self.active = set()
        self.peak = 0
        self.reason = None
        self.events = deque(maxlen=100)
        self.slots = asyncio.Semaphore(LIMITS['concurrent'])
        self.pending = 0

    def publish(self):
        temporary = STATE.with_suffix('.tmp')
        temporary.write_text(json.dumps({'ready': True, 'requests': self.requests, 'received': self.received,
                                        'active': len(self.active), 'peak': self.peak, 'pending': self.pending,
                                        'stopReason': self.reason, 'events': list(self.events)}))
        temporary.replace(STATE)

    def stopped(self):
        if time.time() * 1000 >= POLICY['expiresAt']:
            self.reason = self.reason or 'run_expired'
        if (BASE / 'control' / 'stop').exists():
            self.reason = self.reason or 'run_stopped'
        return self.reason

    def record_denial(self, flow, reason):
        record = {'egress': 'denied', 'host': flow.request.host, 'port': flow.request.port, 'reason': reason}
        if LAB:
            nonce = parse_qs(urlsplit(flow.request.path).query).get('nonce', [''])[0]
            if re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', nonce):
                record['canaryNonce'] = nonce
        self.events.append(record)
        print(json.dumps(record), flush=True)
        self.publish()

    def deny(self, flow, reason, status=403):
        self.record_denial(flow, reason)
        flow.response = http.Response.make(status, b'Blocked by Oddhound evaluation scope', {'content-type': 'text/plain', 'x-oddhound-blocked': reason})

    def poison(self, flow=None):
        self.reason = 'gateway_policy_fault'
        try:
            self.publish()
            print(json.dumps({'egress': 'exhausted', 'reason': self.reason}), flush=True)
        finally:
            try:
                if flow is not None and flow.killable:
                    flow.kill()
            finally:
                os._exit(70)

    def running(self):
        try:
            assert ctx.options.connection_strategy == 'lazy'
            assert not ctx.options.ssl_insecure
            assert list(ctx.options.mode) == ['upstream:http://127.0.0.1:4750@127.0.0.1:8080']
            assert not ctx.options.store_streamed_bodies
            assert not ctx.options.rawtcp and not ctx.options.http3
            self.publish()
        except Exception:
            self.poison()

    def http_connect(self, flow):
        try:
            self.requests += 1
            if self.requests > LIMITS['requests']:
                self.reason = 'request_cap'
            if self.stopped():
                return self.deny(flow, self.reason, 429)
            if flow.request.port != 443 or flow.request.host.lower() in RESERVED:
                return self.deny(flow, 'connect_scope')
        except Exception:
            self.poison(flow)

    async def requestheaders(self, flow):
        try:
            self.requests += 1
            if self.requests > LIMITS['requests']:
                self.reason = 'request_cap'
            if self.stopped():
                return self.deny(flow, self.reason, 429)
            request = flow.request
            if 'x-upstream-https-proxy' in request.headers or 'x-upstream-http-proxy' in request.headers:
                return self.deny(flow, 'upstream_selection')
            if request.scheme != 'https' or request.port != 443 or request.host.lower() in RESERVED:
                return self.deny(flow, 'https_scope')
            # This profile has no socket capability. Reject before mitmproxy can assemble any frame.
            if request.headers.get('upgrade', '') or request.headers.get(':protocol', '') or request.method == 'CONNECT':
                return self.deny(flow, 'sockets_disabled')
            method = request.method
            destination = request.headers.get('sec-fetch-dest', '')
            site = request.headers.get('sec-fetch-site', '')
            initiator = request.headers.get('origin', '')
            location = origin(request)
            if not destination or method not in METHODS:
                return self.deny(flow, 'missing_browser_metadata')
            path = unquote(urlsplit(request.path).path).lower()
            if location == UI or location in APIS:
                if any(path.startswith(prefix.lower()) for prefix in POLICY['deniedPathPrefixes']):
                    return self.deny(flow, 'denied_path')
                parts = {part for segment in path.split('/') for part in [segment, *re.split(r'[-_.]', segment)]}
                matched = parts.intersection(POLICY['deniedPathKeywords'])
                background = method in SAFE and destination not in ('document', 'iframe')
                read_denies = set(POLICY.get('deniedReadKeywords', POLICY['deniedPathKeywords']))
                if matched and (not background or matched.intersection(read_denies)):
                    return self.deny(flow, 'denied_path_keyword')
            if location == UI:
                # An unverified resource frame's Origin / Fetch-Metadata cannot borrow UI authority.
                allowed = site in ('same-origin', 'none') and initiator in ('', UI)
                if method not in SAFE:
                    allowed = allowed and POLICY['writes'] and initiator == UI
            elif location in APIS:
                allowed = initiator == UI and destination == 'empty' and (method in SAFE or POLICY['writes'])
            else:
                allowed = method in ('GET', 'HEAD') and destination in ASSETS
            if not allowed:
                return self.deny(flow, 'action_scope')
            # A declared 8 MiB bound also caps uploads before buffering; body_size_limit covers streams.
            if int(request.headers.get('content-length', '0')) > LIMITS['resourceBytes']:
                self.reason = 'request_body_cap'
                return self.deny(flow, self.reason, 413)
            # Ordinary browser chunk fan-out waits for one of six upstream slots. Queue memory and
            # waiting time stay bounded; request bodies also retain mitmproxy's 8 MiB parser cap.
            if self.pending >= 32:
                return self.deny(flow, 'request_queue_full', 429)
            self.pending += 1
            self.publish()
            try:
                await asyncio.wait_for(self.slots.acquire(), timeout=10)
            except asyncio.TimeoutError:
                return self.deny(flow, 'request_queue_timeout', 429)
            finally:
                self.pending -= 1
            if self.stopped():
                self.slots.release()
                return self.deny(flow, self.reason, 429)
            request.headers['accept-encoding'] = 'gzip, deflate'
            self.active.add(flow.id)
            self.peak = max(self.peak, len(self.active))
            self.publish()
        except Exception:
            self.poison(flow)

    def responseheaders(self, flow):
        try:
            if flow.id not in self.active:
                return
            # Only proxy-generated responses may carry gateway attribution. A genuine
            # upstream 502 must remain a target response, even if it spoofs these headers.
            flow.response.headers.pop('x-oddhound-blocked', None)
            if flow.response.headers.get('server', '').strip().lower().startswith('oddhound-evaluation-gateway/'):
                flow.response.headers.pop('server', None)
            # No unexpected protocol switch, even if a target sends one without an Upgrade request.
            if flow.response.status_code == 101:
                self.release(flow)
                return self.deny(flow, 'sockets_disabled')
            if flow.request.method == 'HEAD' or flow.response.status_code in (204, 304):
                return
            encoding = flow.response.headers.get('content-encoding', 'identity').lower()
            if encoding not in ('identity', 'gzip', 'deflate'):
                self.release(flow)
                return self.deny(flow, 'unsupported_encoding', 502)
            if int(flow.response.headers.get('content-length', '0')) > LIMITS['resourceBytes']:
                self.reason = 'resource_bytes'
                self.release(flow)
                return self.deny(flow, self.reason, 502)
            decoder = zlib.decompressobj(31 if encoding == 'gzip' else zlib.MAX_WBITS) if encoding != 'identity' else None
            resource = 0

            def bounded_stream(chunk):
                nonlocal resource, decoder
                try:
                    if self.stopped():
                        if flow.killable:
                            flow.kill()
                        return b''
                    if not chunk and decoder and not decoder.eof:
                        self.reason = 'truncated_encoding'
                        if flow.killable:
                            flow.kill()
                        self.publish()
                        return b''
                    pending = chunk
                    while pending:
                        room = min(LIMITS['resourceBytes'] - resource, LIMITS['totalBytes'] - self.received)
                        if decoder and decoder.eof:
                            if encoding != 'gzip':
                                self.reason = 'encoding_trailing_data'
                                if flow.killable:
                                    flow.kill()
                                self.publish()
                                return b''
                            decoder = zlib.decompressobj(31)
                        expanded = decoder.decompress(pending, room + 1) if decoder else pending
                        count = len(expanded)
                        if count > room or decoder and decoder.unconsumed_tail:
                            self.reason = 'resource_bytes' if LIMITS['resourceBytes'] - resource <= LIMITS['totalBytes'] - self.received else 'run_bytes'
                            if flow.killable:
                                flow.kill()
                            self.publish()
                            return b''
                        resource += count
                        self.received += count
                        pending = decoder.unused_data if decoder else b''
                    self.publish()
                    return chunk
                except Exception:
                    self.poison(flow)
            flow.response.stream = bounded_stream
        except Exception:
            self.poison(flow)

    def response(self, flow):
        try:
            self.release(flow)
            self.publish()
        except Exception:
            self.poison(flow)

    def error(self, flow):
        try:
            self.release(flow)
            self.record_denial(flow, 'upstream_error')
        except Exception:
            self.poison(flow)

    def release(self, flow):
        if flow.id in self.active:
            self.active.remove(flow.id)
            self.slots.release()


addons = [Boundary()]
