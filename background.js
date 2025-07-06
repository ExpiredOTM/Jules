// CogSec X-Ray - background.js (Service Worker)

console.log("CogSec X-Ray background service worker started.");

// Initialize storage if it doesn't exist
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['trackingElements', 'loggedEncounters', 'settings'], (result) => {
        if (!result.trackingElements) {
            chrome.storage.local.set({ trackingElements: [] });
            console.log("Initialized empty trackingElements in storage.");
        }
        if (!result.loggedEncounters) {
            chrome.storage.local.set({ loggedEncounters: [] });
            console.log("Initialized empty loggedEncounters in storage.");
        }
        if (!result.settings) {
            // Ensure settings from popup.js default is respected or set here
            chrome.storage.local.get('settings', (s) => {
                if (!s.settings || s.settings.visualHighlighting === undefined) {
                     chrome.storage.local.set({ settings: { visualHighlighting: true } });
                     console.log("Initialized default settings in storage (visualHighlighting: true).");
                }
            });
        }
    });
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // console.log("Background script received message:", message.type, "from sender:", sender.tab ? "content script (" + sender.tab.url + ")" : "popup");

    if (message.type === "LOG_ENCOUNTER") {
        const encounterData = message.data;
        // console.log("Background: Received LOG_ENCOUNTER", encounterData.tweetUrl);

        chrome.storage.local.get('loggedEncounters', (result) => {
            let encounters = result.loggedEncounters || [];

            // Check for duplicates: same tweet URL and same matched element value/type
            const isDuplicate = encounters.some(enc =>
                enc.tweetUrl === encounterData.tweetUrl &&
                enc.matchedElement.value === encounterData.matchedElement.value &&
                enc.matchedElement.type === encounterData.matchedElement.type
            );

            if (!isDuplicate) {
                encounters.unshift(encounterData); // Add new encounters to the beginning

                // Optional: Limit the number of stored encounters to prevent storage bloat
                const MAX_ENCOUNTERS = 1000; // Define a reasonable limit
                if (encounters.length > MAX_ENCOUNTERS) {
                    encounters = encounters.slice(0, MAX_ENCOUNTERS);
                }

                chrome.storage.local.set({ loggedEncounters: encounters }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("CogSec X-Ray: Error saving encounter:", chrome.runtime.lastError.message);
                        sendResponse({ status: "Error logging encounter", logged: false, error: chrome.runtime.lastError.message });
                    } else {
                        // console.log("Encounter logged successfully:", encounterData.tweetUrl);
                        chrome.action.setBadgeText({ text: String(encounters.length > 99 ? "99+" : encounters.length) });
                        chrome.action.setBadgeBackgroundColor({ color: '#ff00ff' }); // Hot Pink
                        sendResponse({ status: "Encounter logged successfully", logged: true });
                    }
                });
            } else {
                // console.log("Duplicate encounter skipped:", encounterData.tweetUrl, encounterData.matchedElement.value);
                sendResponse({ status: "Duplicate encounter skipped", logged: false });
            }
        });
        return true; // Keep message channel open for async response

    } else if (message.type === "GET_TRACKING_ELEMENTS") {
        chrome.storage.local.get('trackingElements', (result) => {
            sendResponse({ elements: result.trackingElements || [] });
        });
        return true;

    } else if (message.type === "GET_SETTINGS") { // Added for content script to get settings
        chrome.storage.local.get('settings', (result) => {
            sendResponse({ settings: result.settings || { visualHighlighting: true } });
        });
        return true;

    } else if (message.type === "GET_LOGGED_ENCOUNTERS") {
        // This will be used in Step 6 (Popup)
        chrome.storage.local.get('loggedEncounters', (result) => {
            sendResponse({ encounters: result.loggedEncounters || [] });
        });
        return true;
    } else if (message.type === "CLEAR_ALL_ENCOUNTERS") {
        // This will be used in Step 6 (Popup)
        chrome.storage.local.set({ loggedEncounters: [] }, () => {
            console.log("All encounters cleared via background script.");
            sendResponse({ status: "All encounters cleared successfully."});
        });
        return true;
    }

    // Default response for unhandled messages
    // sendResponse({status: "Message type not handled"});
    return false; // No async response needed for unhandled types
});
