(function() {
    let checkEruda = setInterval(() => {
        if (window.eruda) {
            clearInterval(checkEruda);
            initInspector();
        }
    }, 100);

    function initInspector() {
        const elementsPanel = eruda.get('elements');
        if (!elementsPanel) return;

        
        elementsPanel.on('select', (targetEl) => {
            if (!targetEl) return;          
            const selector = getCssSelector(targetEl);          
            window.parent.postMessage({
                type: 'acode-live-server-inspect',
                selector: selector
            }, '*');
        });
    }

    function getCssSelector(el) {
        if (!(el instanceof Element)) return;
        const path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector += '#' + el.id;
                path.unshift(selector);
                break; // ID is unique, stop
            } else {
                let sib = el, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName.toLowerCase() == selector)
                       nth++;
                }
                if (nth != 1)
                    selector += ":nth-of-type("+nth+")";
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
    }
})();
