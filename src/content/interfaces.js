NoSquint.interfaces = NoSquint.ns(function() { with (NoSquint) {
    const CI = Components.interfaces;

    this.id = 'NoSquint.interfaces';

    /* Previously, this was either STATE_TRANSFERRING or STATE_STOP depending on
     * the version of Firefox in use. These days, only using STATE_TRANSFERRING
     * seems to be necessary.
     */
    const STATE_TRANSFERRING = Components.interfaces.nsIWebProgressListener.STATE_TRANSFERRING;

    /* Listener used to receive notifications when a new URI is about to be loaded.
     * XXX: when support for Firefox 3.0 is dropped, use:
     *          https://developer.mozilla.org/En/Listening_to_events_on_all_tabs
     * 
     * XXX 06-14-2018: The above doesn't seem to work properly. We never seem to
     * get the STATE_TRANSFERRING bit, and it causes all of the styling options
     * to break.
     */
    this.ProgressListener = function (browser) {
        this.id = 'NoSquint.interfaces.ProgressListener';
        this.browser= browser;
        this.contentType = null;

        this.QueryInterface = function (aIID) {
            if (aIID.equals(CI.nsIWebProgressListener) ||
                aIID.equals(CI.nsISupportsWeakReference) ||
                aIID.equals(CI.nsISupports))
                return this;
            throw Components.results.NS_NOINTERFACE;
        }
    };

    this.ProgressListener.prototype = {
        onLocationChange: function(progress, request, uri) {
            // Ignore url#foo -> url#bar location changes
            if (!request)
                return;

            // If we're here, a new document will be loaded next.
            this.contentType = this.browser.docShell.document.contentType;
            this.styleApplied = false;
            this.zoomApplied = false;

            // Remove any stylers from the last document.
            var userData = this.browser.getUserData('nosquint');
            userData.stylers = [];

            var site = NSQ.browser.getSiteFromBrowser(this.browser);
            if (site == userData.site)
                // New document on the same site.
                return;

            console.debug("onLocationChange(): old=" + userData.site + ", new=" + site + ", uri=" + uri.spec);
            /* Update timestamp for site.  This isn't _quite_ perfect because
             * the timestamp is only updated for the first page load on that site
             * rather than the last.  But it should be good enough in practice, and
             * avoids updating the site list on _every_ page load.
             */
            NSQ.prefs.updateSiteTimestamp(site);
            userData.site = site;

            /* Now zoom the current browser for the proper zoom level for this site.
             * It's expected that this zoom level will not get modified from under us.
             * However, this has happened with a Firefox 3.6 nightly -- see bug
             * #516513.  That bug got fixed, so it seems to be safe to zoom here.
             * If the problem resurfaces, we will need to move the zooming into
             * onStateChange the way styling is currently hooked.
             * XXX: 3.6 private browsing mode exhibits some problems, so zooming
             * is back in onStateChange.
             * https://support.mozilla.com/en-US/forum/1/563849
             * https://bugzilla.mozilla.org/show_bug.cgi?id=526828
             */
            NSQ.browser.zoom(this.browser);

            // If the site settings dialog was open from this browser, sync it.
            var dlg = NSQ.storage.dialogs.site;
            if (dlg && dlg.browser == this.browser)
                dlg.setBrowser(NSQ.browser, this.browser);
        },

        onStateChange: function(progress, request, state, astatus) {
            console.debug("LISTENER: request=" + request + ", state=" + state + ", status=" +
                astatus + ", type=" + this.browser.docShell.document.contentType);

            /* Check the current content type against the content type we initially got.
             * This changes in the case when there's an error page (e.g. dns failure),
             * which we treat as chrome and do not adjust.
             */
            var contentType = this.browser.docShell.document.contentType;
            if (this.contentType != contentType) {
                console.debug("onStateChange(): Content type did not match");

                this.contentType = contentType;
                var userData = this.browser.getUserData('nosquint');

                if (isChrome(this.browser)) {
                    // Content type is changed and it's now chrome.  Unzoom (or
                    // zoom to 100%)
                    console.log("onStateChange(): Content type is changed and it's now chrome.");
                    userData.site = null;
                    NSQ.browser.zoom(this.browser, 100, 100);
                } else if (userData.site === null) {
                    // Was considered chrome, but now isn't.  Rezoom/style.
                    delete userData.site;
                    NSQ.browser.zoom(this.browser);
                    console.debug("onStateChange(): Content Type was chrome, but now isn't.  Rezoom/style.");
                    this.styleApplied = NSQ.browser.style(this.browser);
                }
            } else if (state & STATE_TRANSFERRING) {
                console.debug("onStateChange(): Recieved the STATE_TRANSFERRING bit");

                if (!this.zoomApplied) {
                    console.debug("onStateChange: (Transferring) Zoom has not been applied; Zooming now.");

                    this.zoomApplied = true;
                    if (NSQ.browser.isPrivate) {
                        /* In private browsing mode, Firefox does not honor
                         * siteSpecific=false and resets the zoom level back to
                         * 100% after every page load (bug #526828).  So we
                         * must resort to this retarded hack, queuing a zoom in
                         * 100ms.  This seems to work ok empirically, but a race
                         * is theoretically possible. *grmbl*
                         */
                         // XXX 2013-13-31: with Firefox 20 this doesn't seem to be
                         // needed anymore.
                        var b = this.browser;
                        setTimeout(() => NSQ.browser.zoom(b), 100);
                    } else {
                        NSQ.browser.zoom(this.browser);
                    }
                }

                if (!this.styleApplied) {
                    console.debug("onStateChange(): (Transferring) Style has not been applied; Styling now.");

                    if (!isChrome(this.browser) || isImage(this.browser)) {
                        this.styleApplied = NSQ.browser.style(this.browser);
                    } else {
                        this.styleApplied = true;
                    }
                }
            }
        },

        onProgressChange: function() {},
        onStatusChange: function() {},
        onSecurityChange: function() {},
        onRefreshAttempted: function() {}
    };

    /* Custom observer attached to nsIObserverService.  Used to detect new windows
     * (to save pending site settings) and addon disable/uninstall.
     */
    this.Observer = function() {
        this.id = 'NoSquint.interfaces.Observer';
        this.init();
    };

    this.Observer.prototype = {
        _os: null,

        init: function () {
            this._os = Components.classes["@mozilla.org/observer-service;1"]
                                 .getService(Components.interfaces.nsIObserverService);
            this._os.addObserver(this, "quit-application-granted", false);
            if (is3x())
                this._os.addObserver(this, "em-action-requested", false);
            else {
                Components.utils.import("resource://gre/modules/AddonManager.jsm");
                AddonManager.addAddonListener(this);
            }
        },

        unhook: function() {
            this._os.removeObserver(this, "quit-application-granted");
            if (is3x())
                this._os.removeObserver(this, "em-action-requested");
            else
                AddonManager.removeAddonListener(this);
        },

        onDisabling: function(addon, needsRestart) {
            if (addon.id != 'nosquint@urandom.ca' || NSQ.storage.disabled)
                return;

            NSQ.storage.disabled = true;
            if (popup('confirm', NSQ.strings.disableTitle, NSQ.strings.disablePrompt) == 1) {
                // Clicked no
            } else
                NSQ.prefs.setSiteSpecific(true);
        },

        onUninstalling: function(addon, needsRestart) {
            return this.onDisabling(addon, needsRestart);
        },

        onOperationCancelled: function(addon) {
            if (addon.id != 'nosquint@urandom.ca' || NSQ.storage.disabled != true)
                return;
            NSQ.prefs.setSiteSpecific(false);
            NSQ.storage.disabled = false;
        },

        observe: function (subject, topic, data) {
            switch (topic) {
                case "quit-application-granted":
                    NSQ.storage.quitting = true;
                    break;

                // This is for ff 3.x; just dispatch to the 4.x handlers.
                case "em-action-requested":
                    switch (data) {
                        case "item-disabled":
                        case "item-uninstalled":
                            var addon = subject.QueryInterface(Components.interfaces.nsIUpdateItem);
                            this.onDisabling(addon, true);
                            break;

                        case "item-cancel-action":
                            var addon = subject.QueryInterface(Components.interfaces.nsIUpdateItem);
                            this.onOperationCancelled(addon);
                            break;
                    }
                    break;
            }
        },
    };
}});
