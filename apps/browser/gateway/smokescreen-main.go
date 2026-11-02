package main

import (
  "errors"
  "net/http"
  "os"
  "github.com/stripe/smokescreen/cmd"
  "github.com/stripe/smokescreen/pkg/smokescreen"
)

// No reimplementation of proxying or DNS/TLS. Protect the library's documented
// client-selected upstream hook before any dial, in addition to UID egress rules.
func main() {
  for _, key := range []string{"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"} { os.Unsetenv(key) }
  conf, err := cmd.NewConfiguration(nil, nil)
  if err != nil { panic(err) }
  if conf == nil { return }
  if conf.UnsafeAllowPrivateRanges || len(conf.IPFilterBypassedDomains) > 0 || conf.UpstreamHttpProxyAddr != "" || conf.UpstreamHttpsProxyAddr != "" { panic("unsafe proxy configuration") }
  conf.PostDecisionRequestHandler = func(req *http.Request) error {
    if req.Header.Get("X-Upstream-Https-Proxy") != "" || req.Header.Get("X-Upstream-Http-Proxy") != "" { return errors.New("client-selected upstream is forbidden") }
    return nil
  }
  smokescreen.StartWithConfig(conf, nil)
}
