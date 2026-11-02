# Opt-in evaluation image only. Existing deployed browser images/configuration are unchanged.
FROM golang:1.27-bookworm@sha256:972b4110ba0f47539a975c31e52c64765e1ff19f2d74469ae4a595c6676e80a5 AS smokescreen-build
WORKDIR /source
RUN git init && git remote add origin https://github.com/stripe/smokescreen.git && git fetch --depth 1 origin 68e7b8218e226bc47d09ce705fdb8fed82145ceb && git checkout --detach FETCH_HEAD
COPY apps/browser/gateway/smokescreen-main.go ./main.go
RUN CGO_ENABLED=0 go build -mod=readonly -tags=smokescreen_no_prometheus -trimpath -o /oddhound-smokescreen .

FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS node26
FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea
USER root
COPY --from=node26 /usr/local/bin/node /usr/local/bin/node26
COPY --from=smokescreen-build /oddhound-smokescreen /usr/local/bin/oddhound-smokescreen
COPY --from=smokescreen-build /source/LICENSE.txt /usr/share/doc/oddhound-smokescreen/LICENSE
RUN apt-get update && apt-get install -y --no-install-recommends nftables tini util-linux libnss3-tools python3 curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --shell /usr/sbin/nologin oddproxy \
 && useradd --system --no-create-home --shell /usr/sbin/nologin oddgateway
RUN curl -fsSL https://downloads.mitmproxy.org/12.3.1/mitmproxy-12.3.1-linux-x86_64.tar.gz -o /tmp/mitmproxy.tar.gz \
 && python3 -c "import hashlib; assert hashlib.sha256(open('/tmp/mitmproxy.tar.gz','rb').read()).hexdigest() == 'f7b4237f5702f6cd21357fe6e4680a7e905f8f9b816b872230d018ea696c34d5'" \
 && mkdir -p /opt/mitmproxy && tar -xzf /tmp/mitmproxy.tar.gz -C /opt/mitmproxy && rm /tmp/mitmproxy.tar.gz
WORKDIR /opt/oddhound
RUN printf '{"name":"oddhound-evaluation-browser","private":true,"type":"module"}' > package.json \
 && npm install --no-audit --no-fund --omit=dev playwright@1.64.1
COPY apps/browser/gateway/ /opt/oddhound/gateway/
COPY apps/browser/gateway/entrypoint.sh /usr/local/bin/oddhound-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/oddhound-entrypoint \
 && chmod 0755 /usr/local/bin/oddhound-entrypoint \
 && chown -R root:root /opt/oddhound /opt/mitmproxy && chmod -R a-w /opt/oddhound /opt/mitmproxy
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/oddhound-entrypoint"]
