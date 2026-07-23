/*
============================================================
  mwevt-modal-multi.js
============================================================
  Self-contained event registration modal — MULTI-EVENT version.

  USAGE (one script tag per PAGE, not per event):

    <script src="https://cdn.jsdelivr.net/gh/USERNAME/REPO@v2.0.0/mwevt-modal-multi.js" defer></script>

  Then anywhere on the page, put the event id on the TRIGGER
  element itself (not the script tag). Multiple buttons for
  multiple different events can live on the same page:

    <button class="mwevt-open" data-event-id="0927265916">Register — Luncheon A</button>
    <button class="mwevt-open" data-event-id="1122334455">Register — Luncheon B</button>

  Behavior differences vs. the single-event version:
  - Nothing is checked or preloaded on page load. There is no
    page-load availability sweep.
  - The availability check for a given event AND the Typeform
    iframe load for that event are both kicked off together,
    at the moment its button is clicked — not before.
  - The iframe is loaded hidden behind the loader. It is only
    revealed once the availability check confirms the event is
    open. If the event is fully booked, the iframe is simply
    never revealed (loading it in parallel costs nothing since
    it's invisible either way, and it means an "available"
    result doesn't need to wait on a fresh iframe load if the
    iframe already finished loading by the time the check
    resolves).
  - The modal + iframe are a single shared instance reused for
    whichever event was most recently clicked. Clicking a
    different event's button resets and reloads it for that
    event. Re-clicking the SAME event's button while it's
    already fully loaded and confirmed available re-opens
    instantly without refetching or reloading anything.
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

    var TYPEFORM_BASE   = "https://vxolsyg2q32.typeform.com/to/TqaCQY0J";
    var TYPEFORM_SOURCE = "mattweaverteamevents.com";
    var EVENT_API_BASE  = "https://rain13-api.onrender.com/api/events/";

    function buildTypeformUrl(eventId, eventNameValue) {
        var url = TYPEFORM_BASE + "?typeform-source=" + encodeURIComponent(TYPEFORM_SOURCE);
        if (eventNameValue) {
            url += "&event_name=" + encodeURIComponent(eventNameValue);
        }
        url += "#event_form_id=" + encodeURIComponent(eventId);
        return url;
    }

    function buildEventApiUrl(eventId) {
        return EVENT_API_BASE + encodeURIComponent(eventId);
    }

    // Per-event cache, so a repeat click on the same event can
    // reuse a known name / skip flicker without re-hitting the API
    // unnecessarily on the very first paint of that event.
    // Availability itself is still re-checked on every open, since
    // seats can fill up between visits — only the name is cached.
    var eventCache = {}; // eventId -> { name }

    var FALLBACK_LINK_DELAY = 6000;  // ms: offer the "open in new tab" link
    var FORCE_REVEAL_DELAY  = 14000; // ms: stop waiting on the iframe's load event
    var FETCH_TIMEOUT_MS    = 10000; // ms: give up on a stuck availability check

    // ------------------------------------------------------------
    // Inject scoped CSS (prefixed, won't collide with theme)
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
    // Inject the modal markup (a single shared instance)
    // ------------------------------------------------------------
    var root = document.createElement("div");
    root.id = "mwevt-root";
    root.innerHTML = ""
        + '<div class="mwevt-modal" id="mwevt-modal">'
        +   '<div class="mwevt-modal-content">'
        +     '<div class="mwevt-close" id="mwevt-close">&times;</div>'
        +     '<div class="mwevt-loader" id="mwevt-loader">'
        +       '<p>Checking availability, please wait...</p>'
        +     '</div>'
        +     '<div class="mwevt-full" id="mwevt-full" style="display:none;">'
        +       '<div>'
        +         '<h3>Event Fully Booked</h3>'
        +         '<p>We\u2019re sorry, this luncheon is fully booked. Please check other upcoming luncheons for available seats.</p>'
        +       '</div>'
        +     '</div>'
        +     '<div class="mwevt-fallback-link mwevt-hidden" id="mwevt-fallback-link">'
        +       '<p>This is taking longer than expected. You can wait a few more seconds, or '
        +       '<a href="#" target="_blank" rel="noopener" id="mwevt-fallback-anchor">open the form in a new tab</a>.</p>'
        +     '</div>'
        +     '<iframe id="mwevt-iframe" class="mwevt-iframe"></iframe>'
        +   '</div>'
        + '</div>';

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
    // Behavior
    // ------------------------------------------------------------
    function init() {
        var modal         = document.getElementById("mwevt-modal");
        var iframe        = document.getElementById("mwevt-iframe");
        var loader        = document.getElementById("mwevt-loader");
        var fullMsg       = document.getElementById("mwevt-full");
        var closeBtn      = document.getElementById("mwevt-close");
        var fallbackLink  = document.getElementById("mwevt-fallback-link");
        var fallbackAnchor = document.getElementById("mwevt-fallback-anchor");

        // Shared state for whichever event is currently active in the modal.
        var state = {
            token: 0,             // bumped on every open/close; invalidates stale async results
            currentEventId: null,  // event id currently sitting in the iframe
            iframeLoaded: false,   // has the iframe's own 'load' event fired for currentEventId
            availability: null,    // null = unknown/checking, true = available, false = booked
            controller: null       // AbortController for the in-flight availability fetch
        };

        var fallbackTimer = null;
        var forceRevealTimer = null;

        function clearTimers() {
            if (fallbackTimer)    { clearTimeout(fallbackTimer);    fallbackTimer = null; }
            if (forceRevealTimer) { clearTimeout(forceRevealTimer); forceRevealTimer = null; }
        }

        function revealIfReady(token) {
            if (token !== state.token) return;
            if (state.availability === true && state.iframeLoaded) {
                clearTimers();
                fallbackLink.classList.add("mwevt-hidden");
                fullMsg.style.display = "none";
                setTimeout(function () {
                    loader.classList.add("mwevt-hidden");
                }, 150);
                iframe.classList.add("mwevt-loaded");
            }
        }

        function showFullyBooked(token) {
            if (token !== state.token) return;
            clearTimers();
            log("Event is fully booked. Displaying notice.");
            loader.classList.add("mwevt-hidden");
            fallbackLink.classList.add("mwevt-hidden");
            fullMsg.style.display = "flex";
        }

        function openModalForEvent(eventId) {
            state.token += 1;
            var token = state.token;

            if (state.controller) {
                state.controller.abort();
            }

            log("Opening registration modal for event " + eventId + ".");

            document.body.classList.add("mwevt-lock");
            modal.classList.add("mwevt-show");
            clearTimers();
            fallbackLink.classList.add("mwevt-hidden");

            var reusingLoadedIframe = (state.currentEventId === eventId && state.iframeLoaded && state.availability === true);

            if (reusingLoadedIframe) {
                // Same event, already loaded and previously confirmed available —
                // show it immediately, but still quietly re-check availability
                // below in case seats filled up since the last time it was opened.
                log("Reusing already-loaded form for this event.");
                fullMsg.style.display = "none";
                loader.classList.add("mwevt-hidden");
                iframe.classList.add("mwevt-loaded");
            } else {
                state.iframeLoaded = false;
                state.availability = null;
                iframe.classList.remove("mwevt-loaded");
                fullMsg.style.display = "none";
                loader.classList.remove("mwevt-hidden");

                var cached = eventCache[eventId];
                var url = buildTypeformUrl(eventId, cached ? cached.name : null);
                iframe.src = url;
                fallbackAnchor.href = url;
                state.currentEventId = eventId;

                log("Loading registration form for event " + eventId + " in the background (hidden until availability is confirmed).");
            }

            // Both start together: the availability check and the iframe load
            // (the iframe load was already kicked off above, if needed).
            fallbackTimer = setTimeout(function () {
                if (token !== state.token) return;
                log("This is taking longer than expected. Showing the open-in-new-tab link.");
                fallbackLink.classList.remove("mwevt-hidden");
            }, FALLBACK_LINK_DELAY);

            forceRevealTimer = setTimeout(function () {
                if (token !== state.token) return;
                if (state.availability === true && !state.iframeLoaded) {
                    logError("Registration form load confirmation not received within the expected time. Displaying form regardless.");
                    state.iframeLoaded = true;
                    revealIfReady(token);
                }
            }, FORCE_REVEAL_DELAY);

            var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
            state.controller = controller;
            var timeoutId = controller
                ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS)
                : null;

            log("Checking availability for event " + eventId + ".");

            fetch(buildEventApiUrl(eventId), {
                cache: "no-store",
                signal: controller ? controller.signal : undefined
            })
                .then(function (res) {
                    if (!res.ok) {
                        logError("Event availability check returned an unsuccessful response (status " + res.status + "). Treating event as unavailable.");
                        return { available: false, name: null };
                    }
                    return res.json().then(function (data) {
                        var available = !!(data && data.status === "available");
                        var name = (data && data.name) ? data.name : null;
                        log("Event availability confirmed for " + eventId + ": " + (available ? "available." : "fully booked.")
                            + (name ? " Event name: " + name + "." : " Event name was not provided by the API."));
                        return { available: available, name: name };
                    }).catch(function () {
                        logError("Event availability response could not be interpreted. Treating event as unavailable.");
                        return { available: false, name: null };
                    });
                })
                .catch(function (err) {
                    var reason = (err && err.name === "AbortError")
                        ? "the request timed out"
                        : (err && err.message ? err.message : "network error");
                    logError("Event availability check failed to complete (" + reason + "). Treating event as unavailable.");
                    return { available: false, name: null };
                })
                .then(function (result) {
                    if (timeoutId) clearTimeout(timeoutId);
                    if (token !== state.token) return; // a different event/close happened meanwhile

                    if (result.name) {
                        eventCache[eventId] = { name: result.name };
                    }

                    state.availability = result.available;

                    if (result.available) {
                        fullMsg.style.display = "none";
                        revealIfReady(token); // reveals now if the iframe already finished loading
                    } else {
                        showFullyBooked(token);
                    }
                });
        }

        function closeModal() {
            log("Modal closed.");
            state.token += 1; // invalidate any in-flight callbacks
            if (state.controller) {
                state.controller.abort();
            }
            clearTimers();
            modal.classList.remove("mwevt-show");
            document.body.classList.remove("mwevt-lock");
        }

        // Iframe finished loading
        iframe.addEventListener("load", function () {
            state.iframeLoaded = true;
            revealIfReady(state.token);
        });

        iframe.addEventListener("error", function () {
            logError("Registration form failed to load due to a network or embedding error.");
        });

        closeBtn.addEventListener("click", closeModal);

        modal.addEventListener("click", function (e) {
            if (e.target === modal) closeModal();
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closeModal();
        });

        // Delegated trigger — any current or future element with class
        // "mwevt-open" and a data-event-id attribute, anywhere on the page.
        document.addEventListener("click", function (e) {
            var trigger = e.target.closest && e.target.closest(".mwevt-open");
            if (!trigger) return;

            e.preventDefault();

            var eventId = trigger.dataset.eventId;
            if (!eventId) {
                logError("Clicked trigger is missing a data-event-id attribute. Ignoring click.");
                return;
            }

            openModalForEvent(eventId);
        });
    }

})();
