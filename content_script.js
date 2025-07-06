// CogSec X-Ray - content_script.js

console.log("CogSec X-Ray content script loaded and active on this page.");

let trackingElements = [];
let visualHighlightingEnabled = true; // Default, will be updated from storage

// Function to extract tweet data from a tweet article element
function extractTweetData(tweetArticle) {
    if (!tweetArticle || typeof tweetArticle.querySelector !== 'function') {
        // console.warn("Invalid tweetArticle element passed to extractTweetData", tweetArticle);
        return null;
    }

    // Tweet Text: Twitter uses specific data-testid attributes which can be more stable
    // The actual text content can be spread across multiple spans.
    // We look for a div that typically holds the tweet text.
    const tweetTextDiv = tweetArticle.querySelector('div[data-testid="tweetText"]');
    let tweetText = '';
    if (tweetTextDiv) {
        // Collect text from all child spans, as Twitter breaks up text for various reasons
        tweetTextDiv.querySelectorAll('span').forEach(span => {
            // Filter out spans that might be icons or other non-text elements
            if (span.offsetHeight > 0 && !span.querySelector('svg, img')) { // Basic check for visibility and no icons
                 tweetText += span.textContent;
            }
        });
        tweetText = tweetText.trim();
    }

    if (!tweetText) { // Fallback if the primary selector fails
        // This is a more generic selector, might grab other text.
        const textCandidates = tweetArticle.querySelectorAll('div[lang]');
        if (textCandidates.length > 0) {
            tweetText = Array.from(textCandidates).map(el => el.textContent.trim()).join(' ');
        }
    }


    // Author Handle: Typically found in a link within the user info section
    const userLink = tweetArticle.querySelector('a[href^="/"][role="link"] div[dir="ltr"] span');
    let authorHandle = userLink ? userLink.textContent.trim() : null;
    if (authorHandle && !authorHandle.startsWith('@')) { // Ensure it's a handle
        const handleCandidate = tweetArticle.querySelector('div[data-testid="User-Name"] span:last-child');
        if(handleCandidate && handleCandidate.textContent.startsWith('@')) {
            authorHandle = handleCandidate.textContent.trim();
        } else {
            authorHandle = null; // Could not reliably find handle
        }
    }


    // Tweet Permalink: Found in a link usually associated with the tweet's timestamp
    const timeLink = tweetArticle.querySelector('a[href*="/status/"]');
    let permalink = timeLink ? timeLink.href : null;

    // Attempt to find permalink through time element if primary fails
    if (!permalink) {
        const timeElement = tweetArticle.querySelector('time[datetime]');
        if (timeElement && timeElement.parentElement && timeElement.parentElement.tagName === 'A') {
            permalink = timeElement.parentElement.href;
        }
    }


    if (tweetText && authorHandle && permalink) {
        return {
            text: tweetText,
            author: authorHandle,
            url: permalink,
            element: tweetArticle // Keep a reference to the DOM element for potential highlighting
        };
    }
    // console.warn("Could not extract all required data from tweet element:", {tweetText, authorHandle, permalink}, tweetArticle);
    return null;
}

// Function to process new nodes added to the DOM
function processAddedNodes(nodes) {
    nodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the node itself is a tweet article
            if (node.matches && node.matches('article[data-testid="tweet"]')) {
                const tweetData = extractTweetData(node);
                if (tweetData) {
                    // console.log("Found Tweet:", tweetData);
                    // In future steps, this is where matching against trackingElements will happen
                    // And where we'll send data to background.js
                    matchAndLogTweet(tweetData);
                }
            }
            // Check if any descendants are tweet articles
            // This is important as tweets might be nested within other added nodes
            const tweetsInNode = node.querySelectorAll('article[data-testid="tweet"]');
            tweetsInNode.forEach(tweetArticle => {
                const tweetData = extractTweetData(tweetArticle);
                if (tweetData) {
                    // console.log("Found Nested Tweet:", tweetData);
                    matchAndLogTweet(tweetData);
                }
            });
        }
    });
}

// Matching and Logging function
function matchAndLogTweet(tweetData) {
    if (!trackingElements || trackingElements.length === 0) {
        // If no elements to track, ensure tweet is not highlighted if it was previously
        if (tweetData.element) unhighlightTweet(tweetData.element);
        return;
    }

    const tweetTextLower = tweetData.text.toLowerCase();
    const authorHandleLower = tweetData.author.toLowerCase();
    let overallMatchForThisTweet = false;

    trackingElements.forEach(element => {
        let isMatch = false;
        const elementValueLower = element.value.toLowerCase();

        switch (element.type) {
            case 'keyword':
                if (tweetTextLower.includes(elementValueLower)) isMatch = true;
                break;
            case 'handle':
                if (authorHandleLower === elementValueLower || tweetTextLower.includes(elementValueLower)) isMatch = true;
                break;
            case 'hashtag':
                if (tweetTextLower.includes(elementValueLower)) isMatch = true;
                break;
            case 'url_pattern':
                try {
                    const regex = new RegExp(element.value, 'i');
                    if (regex.test(tweetData.text)) isMatch = true;
                } catch (e) {
                    console.warn(`CogSec X-Ray: Invalid regex for URL pattern "${element.value}":`, e);
                }
                break;
        }

        if (isMatch) {
            overallMatchForThisTweet = true;
            // console.log(`MATCH FOUND for element "${element.value}" (type: ${element.type}) in tweet by ${tweetData.author}: ${tweetData.text.substring(0, 100)}...`);
            const encounter = {
                matchedElement: { // Send a copy, not the reactive element itself
                    value: element.value,
                    type: element.type,
                    notes: element.notes
                },
                tweetText: tweetData.text,
                tweetAuthor: tweetData.author,
                tweetUrl: tweetData.url,
                timestamp: new Date().toISOString(),
            };
            chrome.runtime.sendMessage({ type: "LOG_ENCOUNTER", data: encounter }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("CogSec X-Ray: Error logging encounter:", chrome.runtime.lastError.message);
                } else if (response && response.logged) {
                    // console.log("Encounter logged by background:", response.status);
                }
            });
        }
    });

    // Handle highlighting based on whether *any* element matched this tweet
    if (tweetData.element) {
        if (overallMatchForThisTweet && visualHighlightingEnabled) {
            highlightTweet(tweetData.element);
        } else {
            unhighlightTweet(tweetData.element);
        }
    }
}

// Visual Highlighting functions
function highlightTweet(tweetDOMElement) {
    if (tweetDOMElement && !tweetDOMElement.classList.contains('cogsec-highlighted-tweet')) {
        tweetDOMElement.classList.add('cogsec-highlighted-tweet');
        // console.log("Highlighted tweet:", tweetDOMElement.getAttribute('aria-labelledby'));
    }
}

function unhighlightTweet(tweetDOMElement){
    if (tweetDOMElement && tweetDOMElement.classList.contains('cogsec-highlighted-tweet')) {
        tweetDOMElement.classList.remove('cogsec-highlighted-tweet');
        // console.log("Unhighlighted tweet:", tweetDOMElement.getAttribute('aria-labelledby'));
    }
}

// Function to re-process all visible tweets for highlighting/unhighlighting
// This is crucial when tracking elements change or the highlighting setting is toggled.
function refreshAllVisibleTweetHighlights() {
    // console.log("Refreshing all visible tweet highlights. Highlighting enabled:", visualHighlightingEnabled);
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweetArticle => {
        const tweetData = extractTweetData(tweetArticle);
        if (tweetData) {
            // We call matchAndLogTweet which now handles its own highlighting logic
            // based on current elements and visualHighlightingEnabled state.
            // No need to duplicate matching logic here.
            // Crucially, matchAndLogTweet should NOT log again if the tweet was already processed
            // for logging purposes. The logging part has its own duplication check.
            // For highlighting refresh, we just care about the visual state.

            // To prevent re-logging during a pure visual refresh, we could pass a flag,
            // but the current duplication check in background.js for logging is sufficient.
            // The main purpose here is to update the visual state (add/remove highlight class).

            // Determine if this tweet *should* be highlighted based on current elements
            let shouldBeHighlighted = false;
            if (visualHighlightingEnabled && trackingElements && trackingElements.length > 0) {
                const tweetTextLower = tweetData.text.toLowerCase();
                const authorHandleLower = tweetData.author.toLowerCase();

                for (const element of trackingElements) {
                    let isMatch = false;
                    const elementValueLower = element.value.toLowerCase();
                    switch (element.type) {
                        case 'keyword': if (tweetTextLower.includes(elementValueLower)) isMatch = true; break;
                        case 'handle': if (authorHandleLower === elementValueLower || tweetTextLower.includes(elementValueLower)) isMatch = true; break;
                        case 'hashtag': if (tweetTextLower.includes(elementValueLower)) isMatch = true; break;
                        case 'url_pattern':
                            try { if (new RegExp(element.value, 'i').test(tweetData.text)) isMatch = true; }
                            catch (e) { /* ignore */ }
                            break;
                    }
                    if (isMatch) {
                        shouldBeHighlighted = true;
                        break;
                    }
                }
            }

            if (shouldBeHighlighted) {
                highlightTweet(tweetData.element);
            } else {
                unhighlightTweet(tweetData.element);
            }
        }
    });
}

// MutationObserver setup
const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            processAddedNodes(mutation.addedNodes);
        }
    }
});

// Start observing the document body.
// Twitter's content is dynamically loaded, so we need to observe the whole body
// or a very high-level container.
// Using `document.documentElement` might be more robust than `document.body`
// if the body itself is replaced, though less common.
observer.observe(document.documentElement, { childList: true, subtree: true });

// Initial scan for tweets already on the page when the script loads
// This is important for pages that are already loaded when the extension is enabled/reloaded.
function initialScan() {
    console.log("Performing initial scan for tweets...");
    const existingTweets = document.querySelectorAll('article[data-testid="tweet"]');
    existingTweets.forEach(tweetArticle => {
        const tweetData = extractTweetData(tweetArticle);
        if (tweetData) {
            // console.log("Found Initial Tweet:", tweetData);
            matchAndLogTweet(tweetData);
        }
    });
}

// Load settings and elements, then perform initial scan
async function initialize() {
    try {
        const settingsData = await chrome.storage.local.get('settings');
        if (settingsData.settings && settingsData.settings.visualHighlighting !== undefined) {
            visualHighlightingEnabled = settingsData.settings.visualHighlighting;
        }
        console.log("Visual highlighting initially set to:", visualHighlightingEnabled);

        const elementsData = await chrome.storage.local.get('trackingElements');
        trackingElements = elementsData.trackingElements || [];
        console.log("Tracking elements loaded:", trackingElements.length);

        initialScan(); // Perform scan after settings and elements are loaded
    } catch (error) {
        console.error("CogSec X-Ray: Error during initialization:", error);
    }
}

// Listen for changes in settings or tracking elements from storage
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.settings) {
            const oldVisualHighlightingEnabled = visualHighlightingEnabled;
            visualHighlightingEnabled = changes.settings.newValue.visualHighlighting !== undefined ? changes.settings.newValue.visualHighlighting : true;
            console.log(`Visual highlighting setting updated to: ${visualHighlightingEnabled}`);
            if (oldVisualHighlightingEnabled !== visualHighlightingEnabled) {
                refreshAllVisibleTweetHighlights();
            }
        }
        if (changes.trackingElements) {
            trackingElements = changes.trackingElements.newValue || [];
            console.log("Tracking elements updated:", trackingElements.length);
            refreshAllVisibleTweetHighlights(); // Re-evaluate highlighting for all visible tweets
        }
    }
});

initialize();
