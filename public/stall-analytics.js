(function () {
  "use strict";
  var CONSENT_KEY = "stall_ga4_consent_v1";
  var measurementId = "";
  var initialized = false;
  var preferenceButton = null;

  function validMeasurementId(value) {
    return /^G-[A-Z0-9]+$/.test(String(value || "").trim());
  }
  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY) || ""; } catch (_) { return ""; }
  }
  function saveConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (_) {}
  }
  function sendEvent(name, params) {
    if (!initialized || getConsent() !== "accepted" || typeof window.gtag !== "function") return;
    window.gtag("event", name, params || {});
  }
  function initAnalytics() {
    if (initialized || !validMeasurementId(measurementId) || getConsent() !== "accepted") return;
    initialized = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      linker: {
        domains: ["stallwale.in", "www.stallwale.in", "stallapp.stallwale.in", "stallwale.ai.studio"]
      }
    });
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    script.onerror = function () { initialized = false; };
    document.head.appendChild(script);
  }
  function removeBanner() {
    var existing = document.getElementById("stall-analytics-consent");
    if (existing) existing.remove();
  }
  function styleButton(button, primary) {
    button.type = "button";
    button.style.cssText = [
      "border:1px solid " + (primary ? "#ffd968" : "#777"),
      "border-radius:8px", "padding:9px 12px",
      "font:600 12px/1.3 system-ui,sans-serif", "cursor:pointer",
      "background:" + (primary ? "#ffd968" : "#202020"),
      "color:" + (primary ? "#111" : "#fff")
    ].join(";");
  }
  function showConsentBanner() {
    if (document.getElementById("stall-analytics-consent")) return;
    var banner = document.createElement("section");
    banner.id = "stall-analytics-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Optional analytics preference");
    banner.style.cssText = [
      "position:fixed", "z-index:2147483647", "left:16px", "right:16px",
      "bottom:16px", "max-width:760px", "margin:0 auto", "padding:16px",
      "border:1px solid #3a3a3a", "border-radius:14px", "background:#111",
      "color:#fff", "box-shadow:0 10px 40px rgba(0,0,0,.35)",
      "font:13px/1.5 system-ui,sans-serif"
    ].join(";");
    var title = document.createElement("strong");
    title.textContent = "Help us improve STall";
    title.style.cssText = "display:block;font-size:14px;margin-bottom:5px;color:#ffd968";
    var copy = document.createElement("p");
    copy.textContent = "Optional Google Analytics helps us understand page visits and clicks to STall tools. Analytics is not loaded unless you accept.";
    copy.style.cssText = "margin:0 0 12px;color:#e1e1e1";
    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center";
    var accept = document.createElement("button");
    accept.textContent = "Accept analytics";
    styleButton(accept, true);
    accept.addEventListener("click", function () {
      saveConsent("accepted");
      removeBanner();
      initAnalytics();
    });
    var decline = document.createElement("button");
    decline.textContent = "Decline";
    styleButton(decline, false);
    decline.addEventListener("click", function () {
      saveConsent("rejected");
      if (initialized && typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          analytics_storage: "denied", ad_storage: "denied",
          ad_user_data: "denied", ad_personalization: "denied"
        });
      }
      removeBanner();
    });
    actions.appendChild(accept);
    actions.appendChild(decline);
    banner.appendChild(title);
    banner.appendChild(copy);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }
  function configure(id) {
    measurementId = String(id || "").trim();
    if (!validMeasurementId(measurementId)) {
      if (preferenceButton) preferenceButton.hidden = true;
      return;
    }
    if (preferenceButton) {
      preferenceButton.hidden = false;
      preferenceButton.addEventListener("click", showConsentBanner);
    }
    var consent = getConsent();
    if (consent === "accepted") initAnalytics();
    else if (consent !== "rejected") showConsentBanner();

    document.addEventListener("click", function (event) {
      if (getConsent() !== "accepted") return;
      var target = event.target;
      var anchor = target && typeof target.closest === "function" ? target.closest("a[href]") : null;
      if (!anchor || !anchor.href) return;
      var destination;
      try { destination = new URL(anchor.href, window.location.href); } catch (_) { return; }
      var eventName = "";
      if (destination.hostname === "stallwale.ai.studio") eventName = "open_ai_studio";
      else if (destination.hostname === "stallapp.stallwale.in") eventName = "open_stall_app";
      if (!eventName) return;
      sendEvent(eventName, {
        destination_host: destination.hostname,
        destination_path: destination.pathname,
        source_page: window.location.pathname
      });
    });
  }

  preferenceButton = document.getElementById("stall-analytics-open-preferences");
  window.stallTrackEvent = sendEvent;
  window.stallOpenAnalyticsPreferences = showConsentBanner;

  if (Object.prototype.hasOwnProperty.call(window, "STALL_GA_MEASUREMENT_ID")) {
    configure(window.STALL_GA_MEASUREMENT_ID);
  } else {
    fetch("/api/analytics-config", { credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Analytics config unavailable");
        return response.json();
      })
      .then(function (config) { configure(config && config.measurementId); })
      .catch(function () { if (preferenceButton) preferenceButton.hidden = true; });
  }
})();