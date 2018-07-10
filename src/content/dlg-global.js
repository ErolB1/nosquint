NoSquint.dialogs.global = NoSquint.ns(function() { with (NoSquint) {

    Components.utils.import("chrome://nosquint/content/lib.js", this);

    this.strings = lib.getStringBundle('dlg-global');
    var branchPI = NSQ.prefs.svc.getBranch('privacy.' + (lib.is30() ? 'item.' : 'cpd.'));

    this.init = function() {
        lib.storage.dialogs.global = this;
        this.dlg = lib.$('nosquint-dialog-global');
        this.url = window.arguments ? window.arguments[0] : null;

        // General tab
        lib.$('rememberSites').selectedIndex = Number(!NSQ.prefs.rememberSites);
        lib.$('siteForget').checked = (NSQ.prefs.forgetMonths != 0);
        lib.$('siteForget-menu').value = NSQ.prefs.forgetMonths;
        lib.$('siteForget').addEventListener('CheckboxStateChange', () => NSQ.dialogs.global.forgetMonthsChecked(), false);
        lib.$('siteSanitize').checked = branchPI.getBoolPref('extensions-nosquint');

        // Zooming tab
        lib.$('fullZoomLevel').value = NSQ.prefs.fullZoomLevel;
        lib.$('textZoomLevel').value = NSQ.prefs.textZoomLevel;
        lib.$('zoomIncrement').value = NSQ.prefs.zoomIncrement;
        // XXX: image zoom feature disabled for now.
        //lib.$('zoomImages').checked  = NSQ.prefs.zoomImages;
        lib.$('showStatus').checked  = !NSQ.prefs.hideStatus;
        lib.$('wheelZoomEnabled').checked  = NSQ.prefs.wheelZoomEnabled;
        lib.$('primaryZoomMethod-menu').value = NSQ.prefs.fullZoomPrimary ? 'full' : 'text';
        this.rememberSelect();

        // Color tab
        for (let [id, defcolor] of lib.items(NSQ.prefs.defaultColors)) {
            var color = NSQ.prefs[id];
            lib.$(id).parentNode.childNodes[1].color = (color == '0' ? defcolor : color);
            lib.$(id).addEventListener('CheckboxStateChange', this.colorChecked, false);
            lib.$(id).checked = (color == '0' ? false : true);
            this.colorChecked.apply(lib.$(id));
        }
        lib.$('colorBackgroundImages').checked = NSQ.prefs.colorBackgroundImages;
        lib.$('linksUnderline').checked = NSQ.prefs.linksUnderline;

        // Exceptions tab
        lib.$('copyURL-button').style.display = this.url ? '' : 'none';
        for (let exc in lib.iter(NSQ.prefs.exceptions))
            this.exceptionsListAdd(exc[0].replace(/%20/g, ' '), false);
            lib.$('exceptionsList').setUserData('nosquint.changed', false, null);
        this.excListSelect();
    };

    this.focus = function() {
        window.focus();
    };

    this.cancel = function() {
        this.finalize();
    };

    this.finalize = function() {
        lib.storage.dialogs.global = null;
    };

    this.help = function() {
        var tab = lib.$('tabs').selectedPanel.id.replace(/tab$/, '');
        window.openDialog('chrome://nosquint/content/dlg-help.xul', null, 'chrome', tab);
    };

    this.close = function() {
        if (lib.$('pattern').value != '')
            /* User entered stuff in exception input but OK'd dialog without
             * adding the exception.  We assume here the user actually _wanted_
             * the exception to be added, so add it automatically.  This is
             * a bit of do-what-I-mean behaviour.
             */
            this.buttonAddException();

        // General tab
        NSQ.prefs.rememberSites = !Boolean(lib.$('rememberSites').selectedIndex);
        NSQ.prefs.forgetMonths = lib.$('siteForget').checked ? lib.$('siteForget-menu').value : 0;
        branchPI.setBoolPref('extensions-nosquint', lib.$('siteSanitize').checked);

        // Zooming tab
        NSQ.prefs.fullZoomLevel = parseInt(lib.$('fullZoomLevel').value);
        NSQ.prefs.textZoomLevel = parseInt(lib.$('textZoomLevel').value);
        NSQ.prefs.zoomIncrement = parseInt(lib.$('zoomIncrement').value);
        // XXX: image zoom feature disabled for now.
        //NSQ.prefs.zoomImages = lib.$('zoomImages').checked;
        NSQ.prefs.hideStatus = !lib.$('showStatus').checked;
        NSQ.prefs.wheelZoomEnabled = lib.$('wheelZoomEnabled').checked;
        NSQ.prefs.fullZoomPrimary = lib.$('primaryZoomMethod-menu').value == 'full';

        // Color tab
        for (let [id, defcolor] of lib.items(NSQ.prefs.defaultColors))
            NSQ.prefs[id] = lib.$(id).checked ? lib.$(id).parentNode.childNodes[1].color : '0';
        NSQ.prefs.colorBackgroundImages = lib.$('colorBackgroundImages').checked;
        NSQ.prefs.linksUnderline = lib.$('linksUnderline').checked;

        // Exceptions tab
        var listbox = lib.$('exceptionsList');
        var exceptions = null;
        if (listbox.getUserData('nosquint.changed')) {
            exceptions = [];
            for (let i = 0; i < listbox.getRowCount(); i++) {
                var item = listbox.getItemAtIndex(i);
                var pattern = item.childNodes[0].getAttribute('label');
                exceptions.push(pattern.replace(/ /g, '%20'));
            }
        }
        NSQ.prefs.saveAll(exceptions);
        if (lib.storage.dialogs.site)
            lib.storage.dialogs.site.discoverSiteNameChange();
        this.finalize();
    };


    /*********************************************
     * General tab functions
     */
    this.forgetMonthsChecked = function() {
        // Months optionlist is disabled if "Forget settings" checkbox isn't checked.
        lib.$('siteForget-menu').disabled = !lib.$('siteForget').checked;
    };


    /*********************************************
     * Zooming tab functions
     */
    // Called when the "Remember zoom and color settings per site" radio button
    // is clicked.
    this.rememberSelect = function() {
        if (this.dlg === undefined)
            // Happens on initial dialog open before init()
            return;
        // Enable nested options under "Remember zoom" radiobutton if the radio is active.
        var disabled = lib.$('rememberSites').selectedIndex == 1;
        this.enableTree(lib.$('siteForget-box'), disabled);
    };

    // Enables or disables all elements in the given hierarchy
    this.enableTree = function(node, state) {
        for (let child in lib.iter(node.childNodes)) {
            if (child.disabled === undefined || child.disabled == true || (state && child.disabled == false))
                child.disabled = state;
            if (child.childNodes.length)
                this.enableTree(child, state);
        }
    };



    /*********************************************
     * Color tab functions
     */

    this.colorChecked = function(event) {
        // Color picker button is enabled if the checkbox beside is is on.
        var picker = this.parentNode.childNodes[1];
        picker.disabled = !this.checked;
        picker.style.opacity = this.checked ? 1.0 : 0.2;
    };


    /*********************************************
     * Exceptions tab functions
     */

    this.exceptionsListAdd = function(pattern, check_dupe) {
        var listbox = lib.$('exceptionsList');
        // Strip URI scheme from pattern (if it exists)
        pattern = pattern.replace(/^\w+:\/\//, '');

        if (check_dupe) {
            for (let node in lib.iter(listbox.childNodes)) {
                if (node.childNodes[0].getAttribute('label') == pattern)
                    return;
            }
        }

        // Append new exceptions pattern to the list.
        var node = document.createElement("listitem");
        var li1 = document.createElement("listcell");
        li1.setAttribute('label', pattern);
        node.appendChild(li1);
        listbox.appendChild(node);
        node.addEventListener('dblclick', () => NSQ.dialogs.global.buttonEditException(), false);
        // Mark the listbox as having been changed from stored prefs.
        listbox.setUserData('nosquint.changed', true, null);
    };

    this.textPatternKeyPress = function(event) {
        if (event.keyCode == 13) {
            // Pressed enter in the pattern input box.
            this.buttonAddException();
            return false;
        }
        return true;
    };

    this.textPatternChange = function() {
        // Enable 'Add' button if the pattern input box isn't empty.
        lib.$('exceptionAdd-button').disabled = (lib.$('pattern').value == '');
    };

    this.excListKeyPress = function(event) {
        if (event.keyCode == 13) {
            // Pressed enter on one of the listitems.
            this.buttonEditException();
            return false;
        }
        return true;
    };

    this.excListSelect = function() {
        // Edit/Remove buttons enabled when one of the listitems is selected.
        var nsel = lib.$('exceptionsList').selectedItems.length;
        lib.$('exceptionRemove-button').disabled = (nsel == 0);
        lib.$('exceptionEdit-button').disabled = (nsel != 1);
    };

    this.buttonCopyFromURL = function() {
        // Copy button is hidden unless this.url is set.
        lib.$('pattern').value = this.url;
        this.textPatternChange();
    };

    this.buttonAddException = function() {
        this.exceptionsListAdd(lib.$('pattern').value, true);
        lib.$('pattern').value = '';
        this.textPatternChange();
    };

    this.buttonEditException = function() {
        var listcell = lib.$('exceptionsList').selectedItem.childNodes[0];
        var oldPattern = listcell.getAttribute('label');
        var newPattern = lib.popup('prompt', this.strings.editTitle, this.strings.editPrompt, oldPattern);
        if (newPattern != null && newPattern != oldPattern) {
            listcell.setAttribute('label', newPattern);
            lib.$('exceptionsList').setUserData('nosquint.changed', true, null);
        }
    };

    this.buttonRemoveException = function() {
        // Listbox is multi-select capable; remove all selected items.
        var listbox = lib.$('exceptionsList');
        while (listbox.selectedItems.length)
            listbox.removeChild(listbox.selectedItems[0]);
        listbox.setUserData('nosquint.changed', true, null);
    };

}});
