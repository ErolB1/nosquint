NoSquint.dialogs.help = NoSquint.ns(function() { with (NoSquint) {
    
    Components.utils.import("chrome://nosquint/content/lib.js", this);

    this.init = function() {
        var browser = lib.$('nosquint-help-browser');
        var uri = 'chrome://nosquint/locale/help.html';
        if (window.arguments)
            uri += '#' + window.arguments[0];
        browser.loadURI(uri, null, null);
    };

}});
