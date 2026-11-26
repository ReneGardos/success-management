/* Success Management – cookieless page views.
   <script defer src="https://APP/sm-track.js" data-site="SITE_ID"></script> */
(function () {
  var s = document.currentScript
  if (!s) return
  var site = s.getAttribute("data-site")
  var endpoint = new URL("/api/v1/track?site=" + encodeURIComponent(site), s.src).toString()
  var last = ""
  function send() {
    var path = location.pathname
    if (path === last) return
    last = path
    var params = new URLSearchParams(location.search)
    var body = JSON.stringify({ site: site, path: path, referrer: document.referrer || "", utm: params.get("utm_source") || "", width: innerWidth })
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }))
      else fetch(endpoint, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } })
    } catch (e) {}
  }
  send()
  var push = history.pushState
  history.pushState = function () { push.apply(this, arguments); setTimeout(send, 0) }
  addEventListener("popstate", send)
})()
