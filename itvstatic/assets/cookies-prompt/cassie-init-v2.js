/*global globalThis*/

var CASSIE_WIDGET_PROFILE_ID = document.currentScript.getAttribute('data-cassie-widget-profile-id');
var CASSIE_LICENCE_ID = document.currentScript.getAttribute('data-cassie-licence-id');
var CASSIE_LANGUAGE_CODE = document.currentScript.getAttribute('data-cassie-language-code');
var CASSIE_REGION = document.currentScript.getAttribute('data-cassie-region');
var CASSIE_ENVIRONMENT = document.currentScript.getAttribute('data-cassie-environment');
var CASSIE_EXCLUDED_PATHS = document.currentScript.getAttribute('data-cassie-excluded-paths');
var SPLUNK_AUTH = '6968063C-86CD-4DB2-A2A8-5431F569369D';
var SPLUNK_URL = 'https://http-inputs-itv.splunkcloud.com/services/collector';
var SPLUNK_ERROR_MESSAGE_MAX_LENGTH = 500;

// Initial init of cassie global object for remembering currently visible widget and selected element on it
if (globalThis && globalThis.cassie === undefined) {
  Object.assign(globalThis, {
    cassie: { currentElementIndex: -1, widget: '' }
  });
}

function sendEventToSplunk(payload) {
  fetch(SPLUNK_URL, {
    body: JSON.stringify({
      event: {
        data: payload
      }
    }),
    method: 'POST',
    headers: {
      Authorization: 'Splunk ' + SPLUNK_AUTH
    }
  });
}

function sendErrorToSplunk(errorMessageProp) {
  var errorMessageShorten = '';
  if(errorMessageProp) {
    errorMessageShorten = errorMessageProp.slice(0, SPLUNK_ERROR_MESSAGE_MAX_LENGTH);

    if (errorMessageShorten.includes('ReferenceError') && errorMessageShorten.includes('CassieWidgetLoaderModule')) {
      errorMessageShorten = 'CassieWidgetLoaderModule is undefined. Cassie API unavailable.';
    }
  }

  sendEventToSplunk({
    bannerLoadTime: null,
    platform: window.document.URL,
    timestamp: new Date().getTime(),
    errorMessage: errorMessageShorten,
    innerWidth: window.innerWidth,
    userAgent: navigator.userAgent
  });
}

function splunkBannerLoadTimeCheck() {
  var loadTimes = { start: 0, end: 0 };

  document.addEventListener('InitializationStarted', function () {
    loadTimes.start = new Date().getTime();
  });

  document.addEventListener('CassieTemplateInitialized', function () {
    loadTimes.end = new Date().getTime();

    sendEventToSplunk({
      bannerLoadTime: (loadTimes.end - loadTimes.start) / 1000,
      platform: window.document.URL,
      timestamp: new Date().getTime()
    });
  });
}

function useFocusVisiblePolyfill() {
  /**
   * Applies the :focus-visible polyfill at the given scope.
   * A scope in this case is either the top-level Document or a Shadow Root.
   *
   * @param {(Document|ShadowRoot)} scope
   * @see https://github.com/WICG/focus-visible
   */
  function applyFocusVisiblePolyfill(scope) {
    var hadKeyboardEvent = true;
    var hadFocusVisibleRecently = false;
    var hadFocusVisibleRecentlyTimeout = null;

    var inputTypesAllowList = {
      text: true,
      search: true,
      url: true,
      tel: true,
      email: true,
      password: true,
      number: true,
      date: true,
      month: true,
      week: true,
      time: true,
      datetime: true,
      'datetime-local': true
    };

    /**
     * Helper function for legacy browsers and iframes which sometimes focus
     * elements like document, body, and non-interactive SVG.
     * @param {Element} el
     */
    function isValidFocusTarget(el) {
      if (
          el &&
          el !== document &&
          el.nodeName !== 'HTML' &&
          el.nodeName !== 'BODY' &&
          'classList' in el &&
          'contains' in el.classList
      ) {
        return true;
      }
      return false;
    }

    /**
     * Computes whether the given element should automatically trigger the
     * `focus-visible` class being added, i.e. whether it should always match
     * `:focus-visible` when focused.
     * @param {Element} el
     * @return {boolean}
     */
    function focusTriggersKeyboardModality(el) {
      var type = el.type;
      var tagName = el.tagName;

      if (tagName === 'INPUT' && inputTypesAllowList[type] && !el.readOnly) {
        return true;
      }

      if (tagName === 'TEXTAREA' && !el.readOnly) {
        return true;
      }

      if (el.isContentEditable) {
        return true;
      }

      return false;
    }

    /**
     * Add the `focus-visible` class to the given element if it was not added by
     * the author.
     * @param {Element} el
     */
    function addFocusVisibleClass(el) {
      if (el.classList.contains('focus-visible')) {
        return;
      }
      el.classList.add('focus-visible');
      el.setAttribute('data-focus-visible-added', '');
    }

    /**
     * Remove the `focus-visible` class from the given element if it was not
     * originally added by the author.
     * @param {Element} el
     */
    function removeFocusVisibleClass(el) {
      if (!el.hasAttribute('data-focus-visible-added')) {
        return;
      }
      el.classList.remove('focus-visible');
      el.removeAttribute('data-focus-visible-added');
    }

    /**
     * If the most recent user interaction was via the keyboard;
     * and the key press did not include a meta, alt/option, or control key;
     * then the modality is keyboard. Otherwise, the modality is not keyboard.
     * Apply `focus-visible` to any current active element and keep track
     * of our keyboard modality state with `hadKeyboardEvent`.
     * @param {KeyboardEvent} e
     */
    function onKeyDown(e) {
      if (e.metaKey || e.altKey || e.ctrlKey) {
        return;
      }

      if (isValidFocusTarget(scope.activeElement)) {
        addFocusVisibleClass(scope.activeElement);
      }

      hadKeyboardEvent = true;
    }

    /**
     * If at any point a user clicks with a pointing device, ensure that we change
     * the modality away from keyboard.
     * This avoids the situation where a user presses a key on an already focused
     * element, and then clicks on a different element, focusing it with a
     * pointing device, while we still think we're in keyboard modality.
     * @param {Event} e
     */
    function onPointerDown(e) {
      hadKeyboardEvent = false;
    }

    /**
     * On `focus`, add the `focus-visible` class to the target if:
     * - the target received focus as a result of keyboard navigation, or
     * - the event target is an element that will likely require interaction
     *   via the keyboard (e.g. a text box)
     * @param {Event} e
     */
    function onFocus(e) {
      // Prevent IE from focusing the document or HTML element.
      if (!isValidFocusTarget(e.target)) {
        return;
      }

      if (hadKeyboardEvent || focusTriggersKeyboardModality(e.target)) {
        addFocusVisibleClass(e.target);
      }
    }

    /**
     * On `blur`, remove the `focus-visible` class from the target.
     * @param {Event} e
     */
    function onBlur(e) {
      if (!isValidFocusTarget(e.target)) {
        return;
      }

      if (e.target.classList.contains('focus-visible') || e.target.hasAttribute('data-focus-visible-added')) {
        // To detect a tab/window switch, we look for a blur event followed
        // rapidly by a visibility change.
        // If we don't see a visibility change within 100ms, it's probably a
        // regular focus change.
        hadFocusVisibleRecently = true;
        window.clearTimeout(hadFocusVisibleRecentlyTimeout);
        hadFocusVisibleRecentlyTimeout = window.setTimeout(function () {
          hadFocusVisibleRecently = false;
        }, 100);
        removeFocusVisibleClass(e.target);
      }
    }

    /**
     * If the user changes tabs, keep track of whether or not the previously
     * focused element had .focus-visible.
     * @param {Event} e
     */
    function onVisibilityChange(e) {
      if (document.visibilityState === 'hidden') {
        // If the tab becomes active again, the browser will handle calling focus
        // on the element (Safari actually calls it twice).
        // If this tab change caused a blur on an element with focus-visible,
        // re-apply the class when the user switches back to the tab.
        if (hadFocusVisibleRecently) {
          hadKeyboardEvent = true;
        }
        addInitialPointerMoveListeners();
      }
    }

    /**
     * Add a group of listeners to detect usage of any pointing devices.
     * These listeners will be added when the polyfill first loads, and anytime
     * the window is blurred, so that they are active when the window regains
     * focus.
     */
    function addInitialPointerMoveListeners() {
      document.addEventListener('mousemove', onInitialPointerMove);
      document.addEventListener('mousedown', onInitialPointerMove);
      document.addEventListener('mouseup', onInitialPointerMove);
      document.addEventListener('pointermove', onInitialPointerMove);
      document.addEventListener('pointerdown', onInitialPointerMove);
      document.addEventListener('pointerup', onInitialPointerMove);
      document.addEventListener('touchmove', onInitialPointerMove);
      document.addEventListener('touchstart', onInitialPointerMove);
      document.addEventListener('touchend', onInitialPointerMove);
    }

    function removeInitialPointerMoveListeners() {
      document.removeEventListener('mousemove', onInitialPointerMove);
      document.removeEventListener('mousedown', onInitialPointerMove);
      document.removeEventListener('mouseup', onInitialPointerMove);
      document.removeEventListener('pointermove', onInitialPointerMove);
      document.removeEventListener('pointerdown', onInitialPointerMove);
      document.removeEventListener('pointerup', onInitialPointerMove);
      document.removeEventListener('touchmove', onInitialPointerMove);
      document.removeEventListener('touchstart', onInitialPointerMove);
      document.removeEventListener('touchend', onInitialPointerMove);
    }

    /**
     * When the polfyill first loads, assume the user is in keyboard modality.
     * If any event is received from a pointing device (e.g. mouse, pointer,
     * touch), turn off keyboard modality.
     * This accounts for situations where focus enters the page from the URL bar.
     * @param {Event} e
     */
    function onInitialPointerMove(e) {
      // Work around a Safari quirk that fires a mousemove on <html> whenever the
      // window blurs, even if you're tabbing out of the page. ¯\_(ツ)_/¯
      if (e.target.nodeName && e.target.nodeName.toLowerCase() === 'html') {
        return;
      }

      hadKeyboardEvent = false;
      removeInitialPointerMoveListeners();
    }

    // For some kinds of state, we are interested in changes at the global scope
    // only. For example, global pointer input, global key presses and global
    // visibility change should affect the state at every scope:
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, true);
    document.addEventListener('visibilitychange', onVisibilityChange, true);

    addInitialPointerMoveListeners();

    // For focus and blur, we specifically care about state changes in the local
    // scope. This is because focus / blur events that originate from within a
    // shadow root are not re-dispatched from the host element if it was already
    // the active element in its own scope:
    scope.addEventListener('focus', onFocus, true);
    scope.addEventListener('blur', onBlur, true);

    // We detect that a node is a ShadowRoot by ensuring that it is a
    // DocumentFragment and also has a host property. This check covers native
    // implementation and polyfill implementation transparently. If we only cared
    // about the native implementation, we could just check if the scope was
    // an instance of a ShadowRoot.
    if (scope.nodeType === Node.DOCUMENT_FRAGMENT_NODE && scope.host) {
      // Since a ShadowRoot is a special kind of DocumentFragment, it does not
      // have a root element to add a class to. So, we add this attribute to the
      // host element instead:
      scope.host.setAttribute('data-js-focus-visible', '');
    } else if (scope.nodeType === Node.DOCUMENT_NODE) {
      document.documentElement.classList.add('js-focus-visible');
      document.documentElement.setAttribute('data-js-focus-visible', '');
    }
  }

  // It is important to wrap all references to global window and document in
  // these checks to support server-side rendering use cases
  // @see https://github.com/WICG/focus-visible/issues/199
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Make the polyfill helper globally available. This can be used as a signal
    // to interested libraries that wish to coordinate with the polyfill for e.g.,
    // applying the polyfill to a shadow root:
    window.applyFocusVisiblePolyfill = applyFocusVisiblePolyfill;

    // Notify interested libraries of the polyfill's presence, in case the
    // polyfill was loaded lazily:
    var event;

    try {
      event = new CustomEvent('focus-visible-polyfill-ready');
    } catch (error) {
      // IE11 does not support using CustomEvent as a constructor directly:
      event = document.createEvent('CustomEvent');
      event.initCustomEvent('focus-visible-polyfill-ready', false, false, {});
    }

    window.dispatchEvent(event);
  }

  if (typeof document !== 'undefined') {
    // Apply the polyfill to the global document, so that no JavaScript
    // coordination is required to use the polyfill in the top-level document:
    applyFocusVisiblePolyfill(document);
  }
}

function injectCassieCookieWidget(widgetProfileId, licenseId, languageCode, region, environment, excludedPathsPayload) {
  var loadEvent = document.createEvent('Event');
  loadEvent.initEvent('InitializationStarted', true, true);
  document.dispatchEvent(loadEvent);

  if (typeof excludedPathsPayload === 'string') {
    try {
      var excludedPathsParsed = excludedPathsPayload.replaceAll('\'','').split(',');
      if (Array.isArray(excludedPathsParsed)) {
        var currentPath = window.location.pathname.toLowerCase();
        var excludedPaths = excludedPathsParsed.map(function (path) {
          if (path) {
            return path.toLowerCase();
          }
        });

        if (currentPath && excludedPaths.includes(currentPath)) {
          return;
        }
      }
    } catch (e) {
      console.log(
          'Error occured during parsing excluded paths while injecting cassie cookie widget. Excluded paths param: ' +
          excludedPathsPayload +
          '. Error message: ' +
          e.toString()
      );
    }
  }

  var acceptAllSwitchHtml = '<button tabindex="0">Accept All</button>';

  var alwaysOnBtnForNecessaryCookiesHtml = '<span>ON</span>';

  var cassieSettings = {
    widgetProfileId: widgetProfileId,
    languageCode: languageCode,
    licenseKey: licenseId,
    region: region,
    environment: environment
  };

  var addAttribute = function (htmlElement, attributeType, attributeValue) {
    var currentAttribute = htmlElement.getAttributeNode(attributeType);

    // New attribute is an ID
    if (attributeType === 'id') {
      var newAttribute = document.createAttribute(attributeType);
      newAttribute.value = attributeValue;
      htmlElement.setAttributeNode(newAttribute);
    }

    // New attribute is a class for toggle ON/OFF switches
    else if (
        currentAttribute &&
        currentAttribute.value &&
        attributeType === 'class' &&
        (attributeValue === 'toggleON' || attributeValue === 'toggleOFF')
    ) {
      // If current attribute is not the same as the one to set up
      if (
          !(
              (currentAttribute.value.includes('toggleOFF') && attributeValue === 'toggleOFF') ||
              (currentAttribute.value.includes('toggleON') && attributeValue === 'toggleON')
          )
      ) {
        currentAttribute.value = currentAttribute.value.replace(/toggleON/g, '').replace(/toggleOFF/g, '');
        currentAttribute.value = (currentAttribute.value + ' ' + attributeValue).trim();
        htmlElement.setAttributeNode(currentAttribute);
      }
    }

    // New attribute is added to existing attributes - checking uniqueness
    else if (currentAttribute && currentAttribute.value && !currentAttribute.value.includes(attributeValue)) {
      currentAttribute.value = currentAttribute.value + ' ' + attributeValue;
      htmlElement.setAttributeNode(currentAttribute);

      // New attribute is assigned because current attribute does not exist
    } else if (!currentAttribute || (currentAttribute && !currentAttribute.value)) {
      var newAttribute = document.createAttribute(attributeType);
      newAttribute.value = attributeValue;
      htmlElement.setAttributeNode(newAttribute);
    }
  };

  var getFocusableElementsFromVisibleBanner = function () {
    var cassieWidgetPreBanner = document.getElementsByClassName('cassie-pre-banner')[0];
    var cassieWidgetBanner = document.getElementsByClassName('cassie-cookie-modal')[0];
    var querySelection = '.cassie-toggle-switch, a[href], button';
    var focusableElements = [];

    // Banner visible
    if (cassieWidgetBanner && cassieWidgetBanner.style && cassieWidgetBanner.style.display !== 'none') {
      focusableElements = cassieWidgetBanner.querySelectorAll(querySelection);
      // Reset current element index if banner changes
      if (globalThis && globalThis.cassie && globalThis.cassie.widget !== 'cassieWidgetBanner') {
        globalThis.cassie.currentElementIndex = -1;
      }
      globalThis.cassie.widget = 'cassieWidgetBanner';

      // Pre-banner visible
    } else {
      focusableElements = cassieWidgetPreBanner.querySelectorAll(querySelection);
      // Reset current element index if banner changes
      if (globalThis && globalThis.cassie && globalThis.cassie.widget !== 'cassieWidgetPreBanner') {
        globalThis.cassie.currentElementIndex = -1;
      }
      globalThis.cassie.widget = 'cassieWidgetPreBanner';
    }
    return focusableElements;
  };

  var handleTabKey = function (e) {
    var focusableElementsHTMLCollection = getFocusableElementsFromVisibleBanner();
    var focusableElementsArray = Array.prototype.slice.call(focusableElementsHTMLCollection);

    // Restricting the focusable elements from selected widget into only toggles ON/OFF, links and buttons
    var onlyVisibleFocusableElements = focusableElementsArray.filter(function (el) {
      return (
          !(el.style && el.style.cssText && el.style.cssText.includes('display: none;')) &&
          !(
              el.classList &&
              (el.classList.toString().includes('d-none') || el.classList.toString().includes('cassie-child-cookie--toggle-switch'))
          ) &&
          el.id !== 'cassie_accept_all_toggle_switch' &&
          el.id !== 'cassie_consent_button' &&
          el.id !== 'cassie_legitimate_interests_button' &&
          el.href !== 'https://cassie.syrenis.com/'
      );
    });

    // Pre-banner order elements rules
    var cassieWidgetPreBanner = document.getElementsByClassName('cassie-pre-banner')[0];
    var PRIORITY_SHIFT = 9999;

    if (cassieWidgetPreBanner && cassieWidgetPreBanner.style && cassieWidgetPreBanner.style.display !== 'none') {
      var cookiePolicy = onlyVisibleFocusableElements.find(function (el) {
        if (el) {
          return el.id === 'cookie-policy-link';
        }
      });
      if (cookiePolicy) {
        cookiePolicy.priority = 0;
      }
      var manage = onlyVisibleFocusableElements.find(function (el) {
        if (el) {
          return el.id === 'cassie-cookie-modal-manage-button';
        }
      });
      if (manage) {
        manage.priority = 1;
      }
      var acceptAll = onlyVisibleFocusableElements.find(function (el) {
        if (el) {
          return el.id === 'cassie_accept_all_pre_banner';
        }
      });
      if (acceptAll) {
        acceptAll.priority = 2;
      }

      // Ordering elements by it's priority
      onlyVisibleFocusableElements = new Map(
          onlyVisibleFocusableElements.map(function (el, index) {
            return [el.priority != null ? el.priority : index + PRIORITY_SHIFT, el];
          })
      );
    } else {
      // For banner leave elements as they are
      onlyVisibleFocusableElements = new Map(
          onlyVisibleFocusableElements.map(function (el, index) {
            return [index, el];
          })
      );
    }

    if (globalThis && globalThis.cassie) {
      var currElementIndex = globalThis.cassie.currentElementIndex;

      // For next (with currElementIndex) tab press
      if (!e.shiftKey && currElementIndex > -1) {
        globalThis.cassie.currentElementIndex =
            currElementIndex + 1 >= onlyVisibleFocusableElements.size ? 0 : currElementIndex + 1;
        var element = onlyVisibleFocusableElements.get(globalThis.cassie.currentElementIndex);
        element.focus();

        // For next (with currElementIndex) shift-tab press
      } else if (e.shiftKey && currElementIndex > -1) {
        globalThis.cassie.currentElementIndex =
            currElementIndex - 1 < 0 ? onlyVisibleFocusableElements.size - 1 : currElementIndex - 1;
        var element = onlyVisibleFocusableElements.get(globalThis.cassie.currentElementIndex);
        element.focus();

        // For the first tab or shift-tab press
      } else {
        globalThis.cassie.currentElementIndex = 0;
        var element = onlyVisibleFocusableElements.get(0);
        element.focus();
      }
    }

    return e.preventDefault();
  };

  try {
    window.CassieWidgetLoader = new CassieWidgetLoaderModule(cassieSettings);
    setTimeout(() => {
      if (window.CassieWidgetLoader && window.CassieWidgetLoader.error && window.CassieWidgetLoader.error.isError) {
        if (
            window.CassieWidgetLoader.error &&
            window.CassieWidgetLoader.error.errorMessage &&
            window.CassieWidgetLoader.error.errorMessage.response &&
            window.CassieWidgetLoader.error.errorMessage.response.data
        ) {
          sendErrorToSplunk(window.CassieWidgetLoader.error.errorMessage.response.data);
        } else {
          sendErrorToSplunk('Cassie API available but CassieWidgetLoaderModule unknown error.');
        }
      }
    }, 1000);
  } catch (error) {
    sendErrorToSplunk(error.toString());
  }

  document.addEventListener('CassieSubmittedConsent', function () {
    // This logic is for animation on a Banner - toggles are switched, animation of toggling visible for 1 second
    setTimeout(function () {
      window.CassieWidgetLoader.Widget.hideBanner();
    }, 1000);

    // This logic is for WCAG issue, focus on first navbar element
    setTimeout(function () {
      removeAllWcagAttributesFromBanners();

      var itvLogo = document.querySelector('[title="ITV Hub Homepage"]') ||
          document.getElementsByClassName('itv-header__nav-logo-link')[0];

      if(itvLogo) {
        itvLogo.focus();
      }
    }, 100);
  });

  document.addEventListener('CassieTemplateInitialized', function (event) {
    // Setting necessary attributes to some elements
    var preBannerManageButton = document.getElementsByClassName('cassie-view-all')[0];
    addAttribute(preBannerManageButton, 'id', 'cassie-cookie-modal-manage-button');

    document.addEventListener('CassieModalVisibility', function (e) {
      // Focus on manage cookies banner
      document.getElementsByClassName('cassie-cookie-modal cassie-cookie-modal--center')[0].focus();

      var saveAndExitButton = document.getElementById('cassie_save_preferences');
      addAttribute(saveAndExitButton, 'tabindex', '0');

      var toggleSwitchesForOptInAndOut = Object.values(document.getElementsByClassName('cassie-toggle-switch'));
      if (Array.isArray(toggleSwitchesForOptInAndOut)) {
        toggleSwitchesForOptInAndOut.slice().forEach(function (el) {
          addAttribute(el, 'tabindex', '0');
        });
      }
      // End of setting necessary attributes

      // Initial setup of toggle ON/OFF classes
      var togglesOnly = Object.values(
          document.getElementsByClassName('cassie-toggle-switch--status cassie-cookie-group--toggle-switch--status')
      );
      if (Array.isArray(togglesOnly)) {
        togglesOnly.slice().forEach(function (toggleElement) {
          if (toggleElement && toggleElement.firstChild) {
            if (toggleElement.firstChild.nodeValue === 'ON') {
              addAttribute(toggleElement, 'class', 'toggleON');
            } else if (toggleElement.firstChild.nodeValue === 'OFF') {
              addAttribute(toggleElement, 'class', 'toggleOFF');
            }
          }
        });
      }
      // End of initial setup

      // Dynamic changing of toggle ON/OFF classes during runtime
      var observer = new MutationObserver(function (event) {
        if (document.activeElement && document.activeElement.firstElementChild) {
          if (document.activeElement.firstElementChild.innerText === 'ON') {
            addAttribute(document.activeElement.firstElementChild, 'class', 'toggleON');
          } else if (document.activeElement.firstElementChild.innerText === 'OFF') {
            addAttribute(document.activeElement.firstElementChild, 'class', 'toggleOFF');
          }
        }
      });

      var tabGroupView = document.getElementsByClassName('cassie-cookie-modal--tab-group')[0];
      observer.observe(tabGroupView, {
        attributes: true,
        childList: false,
        subtree: true
      });
      // End of dynamic changing of toggle ON/OFF classes during runtime

      // Adding accept all button to cassie widget footer
      var acceptAllBtn = document.createElement('div');
      addAttribute(acceptAllBtn, 'class', 'cassie-cookie-modal-accept-all-button');
      addAttribute(acceptAllBtn, 'name', 'acceptAllButton');
      acceptAllBtn.innerHTML = `${acceptAllSwitchHtml}`;

      var acceptAllCallback = function () {
        var toggleButtonsHTMLElements = document.getElementsByClassName('cassie-toggle-switch cassie-cookie-group--toggle-switch');
        var toggleButtonsElementsArray = Array.prototype.slice.call(toggleButtonsHTMLElements);

        toggleButtonsElementsArray.forEach(function (element) {
          element.style = 'pointer-events: none';
          element.firstElementChild.innerText = 'ON';
          addAttribute(element.firstElementChild, 'class', 'toggleON');
          addAttribute(element.lastElementChild, 'class', 'cassie-toggle-switch--slider--active');
        });

        window.CassieWidgetLoader.Widget.acceptAll();
        savePreferences.style = 'pointer-events: none';
        acceptAllBtn.style = 'pointer-events: none';

        setTimeout(function () {
          toggleButtonsElementsArray.forEach(function (element) {
            element.style = 'pointer-events: auto';
          });
          savePreferences.style = 'pointer-events: auto';
          acceptAllBtn.style = 'pointer-events: auto';
        }, 1000);
      };

      acceptAllBtn.addEventListener('click', acceptAllCallback);

      if (document.getElementsByName('acceptAllButton')[0] === undefined) {
        document.getElementsByClassName('cassie-cookie-modal--footer-extra')[0].appendChild(acceptAllBtn);
      }
      // End of Adding accept all button to cassie widget footer

      // Adding gradient to cassie widget banner
      var preferencesGradient = document.createElement('div');
      addAttribute(preferencesGradient, 'class', 'cassie-cookie-modal--preferences-gradient');

      if (document.getElementsByClassName('cassie-cookie-modal--preferences-gradient')[0] === undefined) {
        document.getElementsByClassName('cassie-cookie-modal--cookies--container')[0].appendChild(preferencesGradient);
      }
      // End of Adding gradient to cassie widget banner

      // Adding always ON (unclickable) button (graphic)
      var alwaysOnBtnForNecessaryCookies = document.createElement('div');
      addAttribute(alwaysOnBtnForNecessaryCookies, 'class', 'cassie-cookie-modal-always-on-button');
      addAttribute(alwaysOnBtnForNecessaryCookies, 'name', 'alwaysOnBtnForNecessaryCookies');
      addAttribute(alwaysOnBtnForNecessaryCookies, 'role', 'switch');
      addAttribute(alwaysOnBtnForNecessaryCookies, 'tabindex', '0');
      addAttribute(alwaysOnBtnForNecessaryCookies, 'aria-checked', 'true');
      addAttribute(alwaysOnBtnForNecessaryCookies, 'aria-selected', 'true');
      addAttribute(alwaysOnBtnForNecessaryCookies, 'aria-labelledby', 'cassie_strictly_necessary_heading');
      addAttribute(alwaysOnBtnForNecessaryCookies, 'aria-describedby', 'cassie_strictly_necessary_description');
      alwaysOnBtnForNecessaryCookies.innerHTML = `${alwaysOnBtnForNecessaryCookiesHtml}`;

      if (document.getElementsByName('alwaysOnBtnForNecessaryCookies')[0] === undefined) {
        document
            .querySelector('#cassie_strictly_necessary')
            .querySelector('#cassie_strictly_necessary_description')
            .before(alwaysOnBtnForNecessaryCookies);
      }

      var savePreferences = document.getElementById('cassie_save_preferences');
      savePreferences.addEventListener('click', function () {
        document.addEventListener('CassieSubmittedConsent', function () {
          window.location.reload();
        });
      });
    });
    // focus-visible polyfill added for Safari
    try {
      document.body.querySelector(':focus-visible');
    } catch (error) {
      useFocusVisiblePolyfill();
    }
    // End of Adding always ON (unclickable) button (graphic)

    applyAccessibility();

    // CassieBannerVisibility event is not invoked at the init time (cassie bug?) - need to invoke it explicitly
    const cassieBannerVisibleEvent = new CustomEvent('CassieBannerVisibility', { detail: true });
    document.dispatchEvent(cassieBannerVisibleEvent);

    // Fix for the banner to be visible if users scroll down during pre-banner load phase
    window.scrollTo(0, 0);
  });

  function applyAccessibility() {
    // Adding Accessibility attributes
    var switchElements = document.querySelectorAll(
        '.cassie-toggle-switch.cassie-cookie-group--toggle-switch, .cassie-cookie-modal-always-on-button'
    );
    switchElements.forEach((switchElement) => {
      addAttribute(switchElement, 'aria-describedby', switchElement.nextElementSibling.id);
    });

    document.addEventListener('CassieBannerVisibility', function () {
      // Fix for cassie, instead of retrieving a visibility from an event (which is corrupted)
      var visible = !document.getElementsByClassName('cassie-cookie-module cassie-d-none').length;

      var bannersWrapperNode = document.getElementById('cassie-widget');
      var preBannerNode = document.getElementsByClassName('cassie-pre-banner cassie-top')[0];

      if (visible) {
        document.addEventListener('keydown', customNavigationKeyListener);

        // ----------------------------
        // Banners Wrapper - this restricts going outside of banners with Screen readers' key shortcuts
        addAttribute(bannersWrapperNode, 'role', 'dialog');
        addAttribute(bannersWrapperNode, 'aria-modal', 'true');
        //End of Banners Wrapper
        // ----------------------------

        // ----------------------------
        // Pre-Banner
        preBannerNode.removeAttribute('tabindex');
        addAttribute(preBannerNode, 'tabindex', '1');
        addAttribute(preBannerNode, 'aria-modal', 'true');
        addAttribute(preBannerNode, 'aria-live', 'polite');
        addAttribute(preBannerNode, 'role', 'dialog');
        addAttribute(preBannerNode, 'aria-labelledby', document.getElementById('cassie-pre-banner-header-id'));
        // End of Pre-Banner
        // ----------------------------

        // Swap buttons position for accessibility reasons
        document
            .getElementById('cassie_accept_all_pre_banner')
            .before(document.getElementById('cassie-cookie-modal-manage-button'));
        // End of Swap buttons position for accessibility reasons

        preBannerNode.focus();
      }

      setTimeout(function () {
        var cassieModal = document.getElementsByClassName('cassie-cookie-modal cassie-cookie-modal--center')[0];
        if(!visible && cassieModal && cassieModal.style.display === 'none') {
          // Both banners invisible - unlock website
          removeAllWcagAttributesFromBanners();
        }
      }, 700);
    });

    document.addEventListener('CassieModalVisibility', function (err) {
      var visible = err.detail;

      var bannerNode = document.getElementsByClassName('cassie-cookie-modal cassie-cookie-modal--center')[0];

      if (visible) {
        document.addEventListener('keydown', customNavigationKeyListener);

        // ----------------------------
        // Manage Cookies Banner
        bannerNode.removeAttribute('tabindex');
        addAttribute(bannerNode, 'tabindex', '1');
        addAttribute(bannerNode, 'aria-live', 'polite');
        addAttribute(bannerNode, 'aria-modal', 'true');
        addAttribute(bannerNode, 'role', 'region');

        // -- Essential Cookies and other categories
        (function () {
          var categoriesTitles = document.getElementsByClassName('cassie-expand-cookies--container');
          for (var i = 0; i < categoriesTitles.length; i++) {
            categoriesTitles[i].removeAttribute('role');
            categoriesTitles[i].removeAttribute('tabindex');
          }

          var categoriesHiddenSections = document.querySelectorAll('[class*=children--container]');
          for (var k = 0; k < categoriesHiddenSections.length; k++) {
            addAttribute(categoriesHiddenSections[k], 'aria-hidden', 'true');
            addAttribute(categoriesHiddenSections[k], 'aria-disabled', 'true');
            addAttribute(categoriesHiddenSections[k], 'display', 'none');
          }
        })();
        // End of Manage Cookies Banner
        // ----------------------------

        bannerNode.focus();
      }
    });
  }

  var removeAllWcagAttributesFromBanners= function () {
    var bannersWrapperNode = document.getElementById('cassie-widget');
    bannersWrapperNode.removeAttribute('aria-modal');
    bannersWrapperNode.removeAttribute('role');
    addAttribute(bannersWrapperNode, 'tabindex', '-1');
    addAttribute(bannersWrapperNode, 'aria-hidden', 'true');

    var preBannerNode = document.getElementsByClassName('cassie-pre-banner cassie-top')[0];
    document.removeEventListener('keydown', customNavigationKeyListener);
    preBannerNode.removeAttribute('tabindex');
    preBannerNode.removeAttribute('aria-modal');
    preBannerNode.removeAttribute('aria-live');
    preBannerNode.removeAttribute('role');

    var bannerNode = document.getElementsByClassName('cassie-cookie-modal cassie-cookie-modal--center')[0];
    bannerNode.removeAttribute('tabindex');
    bannerNode.removeAttribute('aria-live');
    bannerNode.removeAttribute('aria-modal');
    bannerNode.removeAttribute('role');
  }

  var customNavigationKeyListener = function (e) {
    var cookieBannerAndPrebanner = document.getElementsByClassName('cassie-cookie-module');
    var cookieBannerAndPrebannerVisible = !(
        cookieBannerAndPrebanner &&
        cookieBannerAndPrebanner[0] &&
        cookieBannerAndPrebanner[0].classList &&
        cookieBannerAndPrebanner[0].classList.toString().includes('d-none')
    );
    if (cookieBannerAndPrebannerVisible) {
      //Tab key event
      var isTabKeyPressed = e.keyCode === 9;
      if (isTabKeyPressed) {
        handleTabKey(e);
      }
    }
  };
}

var injectCassieCookieWidgetOnUrlChange = function () {

  var oldHref = document.location.href;

  var bodyList = document.querySelector('body');

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function() {
      if (oldHref !== document.location.href) {
        oldHref = document.location.href;

        /* We have to hide a banner in case it was once shown on a different url
         * In injectCassieCookieWidget method below, it will detect if to display the banner again or not
         */
        try {
          CassieWidgetLoader.Widget.hideBanner();
        } catch (e) {
          /* In case the CASSIE API is unavailable */
        }

        injectCassieCookieWidget(
            CASSIE_WIDGET_PROFILE_ID,
            CASSIE_LICENCE_ID,
            CASSIE_LANGUAGE_CODE,
            CASSIE_REGION,
            CASSIE_ENVIRONMENT,
            CASSIE_EXCLUDED_PATHS
        );
      }
    });
  });

  observer.observe(bodyList, {
    childList: true,
    subtree: true
  });

}


window.onload = function () {
  splunkBannerLoadTimeCheck();

  injectCassieCookieWidget(
      CASSIE_WIDGET_PROFILE_ID,
      CASSIE_LICENCE_ID,
      CASSIE_LANGUAGE_CODE,
      CASSIE_REGION,
      CASSIE_ENVIRONMENT,
      CASSIE_EXCLUDED_PATHS
  );

  injectCassieCookieWidgetOnUrlChange();
};
