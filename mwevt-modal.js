/*
============================================================
  mwevt-modal.js
============================================================
  Self-contained event registration modal.

  USAGE (in WordPress, or any page):

    <script src="https://cdn.jsdelivr.net/gh/USERNAME/REPO@v1.0.0/mwevt-modal.js"
            data-event-id="0927265916"
            defer></script>

  Then anywhere on the page, any element with class "mwevt-open"
  opens the modal for that event:

    <button class="mwevt-open">Register Now</button>

  This script injects its own HTML + CSS + behavior — nothing
  else needs to be pasted into the page.
============================================================
*/

(function () {
    "use strict";

    var LOG_PREFIX = "[Event Registration Modal]";

    function log(message) {
        console.log(LOG_PREFIX + " " + message);
    }

    function logError(message) {
        console.error(LOG_PREFIX + " " + message);
    }

    // ------------------------------------------------------------
    // 1. Read the event ID from this script tag's data attribute
    // ------------------------------------------------------------
    var currentScript = document.currentScript;

    var EVENT_ID = currentScript && currentScript.dataset.eventId
        ? currentScript.dataset.eventId
        : null;

    if (!EVENT_ID) {
        logError("Required event identifier was not provided. Initialization aborted.");
        return;
    }

    log("Module initialized for event ID " + EVENT_ID + ".");

    var TYPEFORM_BASE   = "https://vxolsyg2q32.typeform.com/to/TqaCQY0J";
    var TYPEFORM_SOURCE = "mattweaverteamevents.com";

    function buildTypeformUrl(eventNameValue) {
        var url = TYPEFORM_BASE + "?typeform-source=" + encodeURIComponent(TYPEFORM_SOURCE);
        if (eventNameValue) {
            url += "&event_name=" + encodeURIComponent(eventNameValue);
        }
        url += "#event_form_id=" + encodeURIComponent(EVENT_ID);
        return url;
    }

    var EVENT_API_URL = "https://rain13-api.onrender.com/api/events/" + encodeURIComponent(EVENT_ID);

    // ------------------------------------------------------------
    // Shared state. The Typeform iframe is preloaded UNCONDITIONALLY
    // as soon as the DOM is ready — it does not wait for the modal
    // to be opened. It DOES wait briefly for the event details
    // response, so the event name can be included in the Typeform
    // URL (as the event_name parameter) and rendered inside the
    // form itself. If that response takes too long, a grace-period
    // timeout allows the form to load anyway, without the name,
    // rather than leaving the form stuck waiting indefinitely.
    //
    // The availability result is used separately to decide what to
    // SHOW when the modal opens — the already-loading form, or the
    // "Fully Booked" message. If the event turns out to be fully
    // booked, the form still loaded in the background, it's just
    // never revealed.
    // ------------------------------------------------------------
    var eventAvailable   = null;
    var eventName        = null;
    var eventDataReady   = false; // true once we've either got the API response or given up waiting for it
    var iframeEl         = null; // set once the DOM is ready
    var fallbackLinkEl   = null; // set once the DOM is ready
    var iframePreloaded  = false;

    var EVENT_NAME_WAIT_MS = 4000; // grace period to receive the event name before loading without it

    function tryPreloadIframe() {
        if (iframePreloaded) return;
        if (!iframeEl) return;      // DOM not ready yet — will retry once it is
        if (!eventDataReady) return; // still waiting on the event details response (or its timeout)

        iframePreloaded = true;

        var finalUrl = buildTypeformUrl(eventName);

        if (eventName) {
            log("Loading registration form in the background with event name \"" + eventName + "\".");
        } else {
            log("Loading registration form in the background without an event name.");
        }

        iframeEl.src = finalUrl;
        if (fallbackLinkEl) {
            fallbackLinkEl.href = finalUrl;
        }
    }

    function proceedWithPreload() {
        if (eventDataReady) return;
        eventDataReady = true;
        tryPreloadIframe();
    }

    var nameWaitTimer = setTimeout(function () {
        log("Event name was not received within the expected time. Proceeding without it.");
        proceedWithPreload();
    }, EVENT_NAME_WAIT_MS);

    log("Checking event availability.");

    var eventCheckPromise = fetch(EVENT_API_URL, { cache: "no-store" })
        .then(function (res) {
            if (!res.ok) {
                eventAvailable = false;
                logError("Event availability check returned an unsuccessful response (status " + res.status + "). Treating event as unavailable.");
                return;
            }
            return res.json().then(function (data) {
                eventAvailable = !!(data && data.status === "available");
                eventName = (data && data.name) ? data.name : null;
                log("Event availability confirmed: " + (eventAvailable ? "available." : "fully booked.")
                    + (eventName ? " Event name: " + eventName + "." : " Event name was not provided by the API."));
            }).catch(function () {
                eventAvailable = false;
                logError("Event availability response could not be interpreted. Treating event as unavailable.");
            });
        })
        .catch(function (err) {
            eventAvailable = false;
            logError("Event availability check failed to complete (" + (err && err.message ? err.message : "network error") + "). Treating event as unavailable.");
        })
        .then(function () {
            clearTimeout(nameWaitTimer);
            proceedWithPreload();
        });

    // ------------------------------------------------------------
    // 2. Inject scoped CSS (prefixed, won't collide with theme)
    // ------------------------------------------------------------
    var style = document.createElement("style");
    style.textContent = ""
        + "#mwevt-root .mwevt-modal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;justify-content:center;align-items:center;opacity:0;visibility:hidden;transition:opacity .25s ease;z-index:999999;box-sizing:border-box;}"
        + "#mwevt-root .mwevt-modal *,#mwevt-root .mwevt-modal *::before,#mwevt-root .mwevt-modal *::after{box-sizing:border-box;}"
        + "#mwevt-root .mwevt-modal.mwevt-show{opacity:1;visibility:visible;}"
        + "#mwevt-root .mwevt-modal-content{position:relative;width:min(1000px,92vw);height:min(850px,90vh);background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,.3);font-family:Arial,sans-serif;}"
        + "#mwevt-root .mwevt-close{position:absolute;right:18px;top:18px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.95);display:flex;justify-content:center;align-items:center;font-size:22px;line-height:1;color:#333;cursor:pointer;z-index:50;}"
        + "#mwevt-root .mwevt-loader{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#fff;transition:opacity .4s ease;z-index:20;}"
        + "#mwevt-root .mwevt-loader.mwevt-hidden{opacity:0;pointer-events:none;}"
        + "#mwevt-root .mwevt-loader p{margin:0;color:#666;font-size:16px;text-align:center;padding:0 24px;font-family:Arial,sans-serif;}"
        + "#mwevt-root .mwevt-iframe{width:100%;height:100%;border:none;opacity:0;transition:opacity .4s ease;display:block;}"
        + "#mwevt-root .mwevt-iframe.mwevt-loaded{opacity:1;}"
        + "#mwevt-root .mwevt-full{position:absolute;inset:0;display:flex;justify-content:center;align-items:center;background:#fff;z-index:25;padding:24px;text-align:center;color:#333;font-family:Arial,sans-serif;}"
        + "#mwevt-root .mwevt-full h3{margin:0 0 8px 0;}"
        + "#mwevt-root .mwevt-full p{margin:0;}"
        + "#mwevt-root .mwevt-fallback-link{position:absolute;left:0;right:0;bottom:16px;margin:0 auto;width:max-content;max-width:88%;text-align:center;background:#fff;color:#333;font-family:Arial,sans-serif;padding:10px 16px;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.15);z-index:30;}"
        + "#mwevt-root .mwevt-fallback-link p{margin:0;font-size:14px;line-height:1.4;}"
        + "#mwevt-root .mwevt-fallback-link a{color:#635BFF;text-decoration:underline;}"
        + "#mwevt-root .mwevt-fallback-link.mwevt-hidden{display:none;}"
        + "body.mwevt-lock{overflow:hidden;}";
    document.head.appendChild(style);

    // ------------------------------------------------------------
    // 3. Inject the modal markup
    // ------------------------------------------------------------
    var root = document.createElement("div");
    root.id = "mwevt-root";
    root.innerHTML = ""
        + '<div class="mwevt-modal" id="mwevt-modal">'
        +   '<div class="mwevt-modal-content">'
        +     '<div class="mwevt-close" id="mwevt-close">&times;</div>'
        +     '<div class="mwevt-loader" id="mwevt-loader">'
        +       '<p>Initializing event registration form, please wait...</p>'
        +     '</div>'
        +     '<div class="mwevt-full" id="mwevt-full" style="display:none;">'
        +       '<div>'
        +         '<h3>Event Fully Booked</h3>'
        +         '<p>We\u2019re sorry, this luncheon is fully booked. Please check other upcoming luncheons for available seats.</p>'
        +       '</div>'
        +     '</div>'
        +     '<div class="mwevt-fallback-link mwevt-hidden" id="mwevt-fallback-link">'
        +       '<p>This is taking longer than expected. You can wait a few more seconds, or '
        +       '<a href="' + buildTypeformUrl(null) + '" target="_blank" rel="noopener" id="mwevt-fallback-anchor">open the form in a new tab</a>.</p>'
        +     '</div>'
        +     '<iframe id="mwevt-iframe" class="mwevt-iframe" '
        +       'allow="camera; microphone; fullscreen"></iframe>'
        +   '</div>'
        + '</div>';

    // Append once DOM is ready
    function appendRoot() {
        document.body.appendChild(root);
        log("Modal structure added to the page.");
        init();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", appendRoot);
    } else {
        appendRoot();
    }

    // ------------------------------------------------------------
    // 4. Behavior
    // ------------------------------------------------------------
    function init() {
        var modal         = document.getElementById("mwevt-modal");
        var iframe         = document.getElementById("mwevt-iframe");
        var loader         = document.getElementById("mwevt-loader");
        var fullMsg        = document.getElementById("mwevt-full");
        var closeBtn       = document.getElementById("mwevt-close");
        var fallbackLink   = document.getElementById("mwevt-fallback-link");
        var fallbackAnchor = document.getElementById("mwevt-fallback-anchor");

        iframeEl = iframe; // now that the DOM exists, hook it into the shared state
        fallbackLinkEl = fallbackAnchor;

        // If the event details already resolved (or resolve shortly)
        // before the modal DOM was ready, this makes sure the iframe
        // still gets preloaded once both are ready.
        tryPreloadIframe();

        // Timers used to detect a "stuck" load and recover from it
        var showFallbackTimer = null; // shows the "open in new tab" link
        var forceRevealTimer  = null; // stops waiting on the load event

        var FALLBACK_LINK_DELAY = 6000;  // 6s: offer the new-tab link
        var FORCE_REVEAL_DELAY  = 14000; // 14s: stop waiting, show iframe anyway

        function clearLoadTimers() {
            if (showFallbackTimer) { clearTimeout(showFallbackTimer); showFallbackTimer = null; }
            if (forceRevealTimer)  { clearTimeout(forceRevealTimer);  forceRevealTimer  = null; }
        }

        function startLoadTimers() {
            clearLoadTimers();

            showFallbackTimer = setTimeout(function () {
                log("Registration form load is taking longer than expected. Displaying alternate access link.");
                fallbackLink.classList.remove("mwevt-hidden");
            }, FALLBACK_LINK_DELAY);

            forceRevealTimer = setTimeout(function () {
                // The iframe's "load" event never fired, but in
                // practice the form is very often already usable —
                // stop blocking on it and reveal what's there.
                logError("Registration form load confirmation not received within the expected time. Displaying form regardless.");
                iframe.classList.add("mwevt-loaded");
                loader.classList.add("mwevt-hidden");
            }, FORCE_REVEAL_DELAY);
        }

        function openModal() {
            log("Modal opened.");
            document.body.classList.add("mwevt-lock");
            fallbackLink.classList.add("mwevt-hidden");

            function showAvailable() {
                fullMsg.style.display = "none";

                if (iframe.classList.contains("mwevt-loaded")) {
                    // Already finished loading from a previous open —
                    // reveal it immediately, no loader, no timers.
                    log("Registration form already loaded. Displaying immediately.");
                    loader.classList.add("mwevt-hidden");
                    return;
                }

                loader.classList.remove("mwevt-hidden");

                if (iframePreloaded) {
                    // Preloading in progress but not finished yet —
                    // start the recovery timers in case it's stuck.
                    log("Registration form still loading. Awaiting completion.");
                    startLoadTimers();
                } else {
                    log("Registration form load was not yet initiated. Initiating now.");
                    tryPreloadIframe();
                    startLoadTimers();
                }
            }

            function showFullyBooked() {
                log("Event is fully booked. Displaying notice.");
                loader.classList.add("mwevt-hidden");
                fullMsg.style.display = "flex";
            }

            if (eventAvailable === null) {
                modal.classList.add("mwevt-show");
                loader.classList.remove("mwevt-hidden");
                fullMsg.style.display = "none";
                log("Event availability check still in progress. Waiting for result.");

                eventCheckPromise.then(function () {
                    if (eventAvailable) {
                        showAvailable();
                    } else {
                        showFullyBooked();
                    }
                });
                return;
            }

            modal.classList.add("mwevt-show");

            if (eventAvailable) {
                showAvailable();
            } else {
                showFullyBooked();
            }
        }

        function closeModal() {
            log("Modal closed.");
            modal.classList.remove("mwevt-show");
            document.body.classList.remove("mwevt-lock");
            clearLoadTimers();
        }

        // Hide loader once iframe has actually loaded
        iframe.addEventListener("load", function () {
            log("Registration form loaded successfully.");
            clearLoadTimers();
            fallbackLink.classList.add("mwevt-hidden");
            iframe.classList.add("mwevt-loaded");
            setTimeout(function () {
                loader.classList.add("mwevt-hidden");
            }, 250);
        });

        // Log if the iframe itself fails to load (blocked, network
        // failure, etc.) — the timeout-based fallback below will
        // still recover the UI, but this records the underlying cause.
        iframe.addEventListener("error", function () {
            logError("Registration form failed to load due to a network or embedding error.");
        });

        // Close button
        closeBtn.addEventListener("click", closeModal);

        // Click outside modal content
        modal.addEventListener("click", function (e) {
            if (e.target === modal) closeModal();
        });

        // ESC key
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closeModal();
        });

        // Delegated trigger — works for any current or future
        // element with class "mwevt-open", anywhere on the page
        document.addEventListener("click", function (e) {
            var trigger = e.target.closest && e.target.closest(".mwevt-open");
            if (trigger) {
                e.preventDefault();
                openModal();
            }
        });

        // Preload on intent (hover / touch / focus of a trigger)
        document.addEventListener("mouseenter", function (e) {
            if (e.target.closest && e.target.closest(".mwevt-open")) {
                tryPreloadIframe();
            }
        }, true);

        document.addEventListener("touchstart", function (e) {
            if (e.target.closest && e.target.closest(".mwevt-open")) {
                tryPreloadIframe();
            }
        }, true);

        document.addEventListener("focus", function (e) {
            if (e.target.closest && e.target.closest(".mwevt-open")) {
                tryPreloadIframe();
            }
        }, true);
    }

})();
