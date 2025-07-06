// CogSec X-Ray - content_script.js

console.log("CogSec X-Ray content script loaded and active on this page.");

let trackingElements = [];
let visualHighlightingEnabled = true; // Default, will be updated from storage

// Function to extract tweet data from a tweet article element
function extractTweetData(tweetArticle, includeRawTextForSuggestion = false) {
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
                processTweetElement(node);
            }
            // Check if any descendants are tweet articles
            const tweetsInNode = node.querySelectorAll('article[data-testid="tweet"]');
            tweetsInNode.forEach(processTweetElement);
        }
    });
}

// Central function to process a single tweet element
function processTweetElement(tweetArticleElement) {
    // Check if already processed to avoid duplicate buttons or excessive work
    // and also to avoid reprocessing for matching if not needed.
    if (tweetArticleElement.dataset.cogsecProcessed === 'true') {
        // If it's already processed, we might still need to refresh its highlight
        // if elements or settings changed, but not add another button or re-log.
        // For now, matchAndLogTweet handles its own highlighting updates based on current state.
        // We only add the button once.
        return;
    }
    // Mark as processed for button addition. Highlighting state is managed by matchAndLogTweet.
    tweetArticleElement.dataset.cogsecProcessed = 'true';


    const tweetData = extractTweetData(tweetArticleElement);
    if (tweetData) {
        matchAndLogTweet(tweetData); // Handles matching, logging, and current highlighting state
        addSuggestionButtonToTweet(tweetArticleElement, tweetData); // Add suggestion button
    }
}

// Basic Entity Extraction from text
function extractEntitiesFromText(text, authorHandle) {
    const suggestions = {
        handles: new Set(),
        hashtags: new Set(),
        keywords: new Set(),
        urls: new Set()
    };

    // Add the author's handle directly
    if (authorHandle) {
        suggestions.handles.add(authorHandle.toLowerCase());
    }

    // Regex for handles, hashtags, URLs
    const handleRegex = /@(\w{1,15})/g;
    const hashtagRegex = /#(\w+)/g;
    // More comprehensive URL regex:
    const urlRegex = /(?:(?:https?|ftp):\/\/|\b(?:[a-z\d]+\.))(?:(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))?\))+(?:\((?:[^\s()<>]+|(?:\(?:[^\s()<>]+\)))?\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))?/gi;


    let match;
    while ((match = handleRegex.exec(text)) !== null) {
        suggestions.handles.add(`@${match[1].toLowerCase()}`);
    }
    while ((match = hashtagRegex.exec(text)) !== null) {
        suggestions.hashtags.add(`#${match[1].toLowerCase()}`);
    }
    while ((match = urlRegex.exec(text)) !== null) {
        suggestions.urls.add(match[0]);
    }

    // Basic keyword extraction (can be significantly improved)
    // Remove handles, hashtags, URLs, and common words, then take remaining words
    let cleanedText = text.toLowerCase();
    suggestions.handles.forEach(h => cleanedText = cleanedText.replace(new RegExp(h.substring(1), 'gi'), '')); // remove handle part without @
    suggestions.hashtags.forEach(h => cleanedText = cleanedText.replace(new RegExp(h, 'gi'), ''));
    suggestions.urls.forEach(u => cleanedText = cleanedText.replace(u, ''));

    // Simple stop words list (can be expanded)
    const stopWords = new Set([
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'should', 'can', 'could', 'may', 'might', 'must',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
        'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
        'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
        'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out',
        'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
        'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
        'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't',
        'just', 'don', 'shouldve', 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren',
        'couldn', 'didn', 'doesn', 'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn',
        'needn', 'shan', 'shouldn', 'wasn', 'weren', 'won', 'wouldn', 'rt',
        'this', 'that', 'these', 'those', 'am', 'and', 'but', 'if', 'or', 'because', 'as',
        'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about',
        // Common Twitter/social media terms that might not be useful as keywords
        'rt', 'via', 'tweet', 'twitter', 'post', 'link', 'video', 'image', 'photo', 'http', 'https', 'com', 'www'
    ]);

    const words = cleanedText.replace(/[^\w\s@#]/g, '').split(/\s+/); // Remove punctuation, split by space
    words.forEach(word => {
        if (word.length > 3 && !stopWords.has(word) && !/^\d+$/.test(word)) { // Basic filter: length > 3, not a stop word, not purely numeric
            suggestions.keywords.add(word);
        }
    });

    // Convert Sets to Arrays for sending
    return {
        handles: Array.from(suggestions.handles),
        hashtags: Array.from(suggestions.hashtags),
        keywords: Array.from(suggestions.keywords),
        urls: Array.from(suggestions.urls)
    };
}

// Add "Suggest Elements" button to a tweet
function addSuggestionButtonToTweet(tweetArticleElement, tweetData) {
    // Find a suitable place to inject the button.
    // Twitter's DOM: look for the group of action icons (reply, retweet, like, view, share)
    // The selector `div[role="group"][id^="id__"]` is often used for this action bar.
    let actionBar = tweetArticleElement.querySelector('div[role="group"][id^="id__"]');

    // Fallback if the specific ID pattern isn't found, try a more general role="group"
    // and then check its children for typical action buttons to confirm it's the right one.
    if (!actionBar) {
        const groupDivs = tweetArticleElement.querySelectorAll('div[role="group"]');
        for(let div of groupDivs) {
            if (div.querySelector('button[data-testid="reply"], button[data-testid="retweet"], button[data-testid="like"]')) {
                actionBar = div;
                break;
            }
        }
    }

    // Ensure we don't add multiple buttons if somehow processed again (though dataset.cogsecProcessed should prevent)
    if (actionBar && !actionBar.querySelector('.cogsec-suggest-button')) {
        const suggestButton = document.createElement('button');
        suggestButton.className = 'cogsec-suggest-button';
        suggestButton.title = 'Suggest elements to track from this tweet';
        suggestButton.innerHTML = '💡'; // Lightbulb emoji as a placeholder icon
                                      // CSS will style this. No need for extra span if simple.

        suggestButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent tweet click or other parent actions
            event.preventDefault();

            console.log("CogSec X-Ray: 'Suggest Elements' button clicked for tweet:", tweetData.url);

            const extractedEntities = extractEntitiesFromText(tweetData.text, tweetData.author);

            chrome.runtime.sendMessage({
                type: "DISPLAY_SUGGESTIONS",
                data: {
                    tweetUrl: tweetData.url,
                    tweetAuthor: tweetData.author,
                    tweetText: tweetData.text, // Keep original text for context in popup
                    suggestions: extractedEntities
                }
            }, response => {
                if (chrome.runtime.lastError) {
                    console.error("CogSec X-Ray: Error sending suggestions to popup:", chrome.runtime.lastError.message);
                    alert("Could not send suggestion request to popup.");
                } else {
                    console.log("Suggestion request sent to popup.");
                    // The popup will handle opening and displaying suggestions.
                    // We could also consider a small inline notification here if desired.
                }
            });
            // alert(`"Suggest Elements" clicked for tweet by ${tweetData.author}. Feature to send to popup for processing in next step.`);
        });

        // Append the button to the action bar.
        // Adding it as the last child or first child are common strategies.
        // Let's try adding it after the existing action items, but before any potential "more options" dropdown.
        // A simple appendChild might be best to start.
        actionBar.appendChild(suggestButton);
    } else if (!actionBar) {
        // console.warn("CogSec X-Ray: Could not find suitable action bar to add suggest button for tweet:", tweetData.url, tweetArticleElement);
    }
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
