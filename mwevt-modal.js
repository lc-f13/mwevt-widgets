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

    // ------------------------------------------------------------
    // 1. Read the event ID from this script tag's data attribute
    // ------------------------------------------------------------
    var currentScript = document.currentScript;

    var EVENT_ID = currentScript && currentScript.dataset.eventId
        ? currentScript.dataset.eventId
        : null;

    if (!EVENT_ID) {
        console.error("[mwevt-modal] Missing required data-event-id attribute on the script tag. Modal will not be initialized.");
        return;
    }

    var TYPEFORM_BASE   = "https://vxolsyg2q32.typeform.com/to/TqaCQY0J";
    var TYPEFORM_SOURCE = "mattweaverteamevents.com";
    var TYPEFORM_URL    = TYPEFORM_BASE
        + "?typeform-source=" + encodeURIComponent(TYPEFORM_SOURCE)
        + "#event_form_id=" + encodeURIComponent(EVENT_ID);

    var EVENT_API_URL = "https://rain13-api.onrender.com/api/events/" + encodeURIComponent(EVENT_ID);

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
        +         '<p>We\'re sorry — this event is fully booked.</p>'
        +       '</div>'
        +     '</div>'
        +     '<iframe id="mwevt-iframe" class="mwevt-iframe" loading="lazy" '
        +       'allow="camera; microphone; fullscreen" '
        +       'data-src="' + TYPEFORM_URL + '"></iframe>'
        +   '</div>'
        + '</div>';

    // Append once DOM is ready
    function appendRoot() {
        document.body.appendChild(root);
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
        var modal     = document.getElementById("mwevt-modal");
        var iframe    = document.getElementById("mwevt-iframe");
        var loader    = document.getElementById("mwevt-loader");
        var fullMsg   = document.getElementById("mwevt-full");
        var closeBtn  = document.getElementById("mwevt-close");

        var initialized    = false;
        var eventAvailable = null;

        function preloadIframe() {
            if (initialized) return;
            if (!eventAvailable) return;

            initialized = true;
            iframe.src = iframe.dataset.src;
        }

        function checkEvent() {
            return fetch(EVENT_API_URL, { cache: "no-store" })
                .then(function (res) {
                    if (!res.ok) {
                        eventAvailable = false;
                        return;
                    }
                    return res.json().then(function (data) {
                        eventAvailable = !!(data && data.status === "available");
                    });
                })
                .catch(function () {
                    eventAvailable = false;
                })
                .then(function () {
                    if (eventAvailable) preloadIframe();
                });
        }

        function openModal() {
            document.body.classList.add("mwevt-lock");

            if (eventAvailable === null) {
                modal.classList.add("mwevt-show");
                loader.classList.remove("mwevt-hidden");
                fullMsg.style.display = "none";

                checkEvent().then(function () {
                    if (eventAvailable) {
                        fullMsg.style.display = "none";
                        loader.classList.remove("mwevt-hidden");
                        preloadIframe();
                    } else {
                        loader.classList.add("mwevt-hidden");
                        fullMsg.style.display = "flex";
                    }
                });
                return;
            }

            modal.classList.add("mwevt-show");

            if (eventAvailable) {
                fullMsg.style.display = "none";
                loader.classList.remove("mwevt-hidden");
                preloadIframe();
            } else {
                loader.classList.add("mwevt-hidden");
                fullMsg.style.display = "flex";
            }
        }

        function closeModal() {
            modal.classList.remove("mwevt-show");
            document.body.classList.remove("mwevt-lock");
        }

        // Hide loader once iframe has loaded
        iframe.addEventListener("load", function () {
            iframe.classList.add("mwevt-loaded");
            setTimeout(function () {
                loader.classList.add("mwevt-hidden");
            }, 250);
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
            if (e.target.closest && e.target.closest(".mwevt-open") && eventAvailable) {
                preloadIframe();
            }
        }, true);

        document.addEventListener("touchstart", function (e) {
            if (e.target.closest && e.target.closest(".mwevt-open") && eventAvailable) {
                preloadIframe();
            }
        }, true);

        document.addEventListener("focus", function (e) {
            if (e.target.closest && e.target.closest(".mwevt-open") && eventAvailable) {
                preloadIframe();
            }
        }, true);

        // Kick off availability check right away
        checkEvent();
    }

})();
