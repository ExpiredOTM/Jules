// CogSec X-Ray - popup.js

document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    // Navigation
    const navElementsButton = document.getElementById('navElements');
    const navDashboardButton = document.getElementById('navDashboard');
    const navSuggestionsButton = document.getElementById('navSuggestions'); // New
    const navSettingsButton = document.getElementById('navSettings');

    const elementsView = document.getElementById('elementsView');
    const dashboardView = document.getElementById('dashboardView');
    const suggestionsView = document.getElementById('suggestionsView'); // New
    const settingsView = document.getElementById('settingsView');

    const views = [elementsView, dashboardView, suggestionsView, settingsView];
    const navButtons = [navElementsButton, navDashboardButton, navSuggestionsButton, navSettingsButton];

    function showView(viewToShow) {
        views.forEach(view => view.classList.add('hidden'));
        navButtons.forEach(button => button.classList.remove('active'));

        viewToShow.view.classList.remove('hidden');
        viewToShow.button.classList.add('active');
    }

    navElementsButton.addEventListener('click', () => showView({view: elementsView, button: navElementsButton}));
    navDashboardButton.addEventListener('click', () => {
        showView({view: dashboardView, button: navDashboardButton});
        loadEncounters(); // Reload encounters when dashboard is viewed
    });
    navSuggestionsButton.addEventListener('click', () => { // New
        showView({view: suggestionsView, button: navSuggestionsButton});
        // Potentially load/clear previous suggestions or show placeholder
        updateSuggestionViewDisplay();
    });
    navSettingsButton.addEventListener('click', () => showView({view: settingsView, button: navSettingsButton}));

    // Initialize with the elements view
    showView({view: elementsView, button: navElementsButton});

    console.log("CogSec X-Ray popup script loaded.");

    const addElementForm = document.getElementById('addElementForm');
    const elementsListUL = document.getElementById('elementsList');
    const elementInput = document.getElementById('elementInput');
    const elementType = document.getElementById('elementType');
    const elementNotes = document.getElementById('elementNotes');

    let trackingElements = [];

    // Load elements from storage
    async function loadElements() {
        const data = await chrome.storage.local.get('trackingElements');
        trackingElements = data.trackingElements || [];
        renderElements();
    }

    // Render elements to the UI
    function renderElements() {
        elementsListUL.innerHTML = ''; // Clear existing list
        if (trackingElements.length === 0) {
            elementsListUL.innerHTML = '<li>No elements being tracked. Add some!</li>';
            return;
        }
        trackingElements.forEach((element, index) => {
            const li = document.createElement('li');

            const textSpan = document.createElement('span');
            textSpan.className = 'element-value';
            textSpan.textContent = element.value;

            const typeSpan = document.createElement('span');
            typeSpan.className = 'element-type';
            typeSpan.textContent = ` (${element.type})`;

            const notesSpan = document.createElement('span');
            notesSpan.className = 'element-notes';
            notesSpan.textContent = element.notes ? ` - ${element.notes}` : '';
            notesSpan.style.fontSize = "0.8em";
            notesSpan.style.color = "#aaa";
            notesSpan.style.marginLeft = "5px";


            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-element';
            deleteButton.textContent = 'Delete';
            deleteButton.dataset.index = index; // Use index for easy deletion

            deleteButton.addEventListener('click', handleDeleteElement);

            li.appendChild(textSpan);
            li.appendChild(typeSpan);
            li.appendChild(notesSpan);
            li.appendChild(deleteButton);
            elementsListUL.appendChild(li);
        });
    }

    // Handle adding a new element
    async function handleAddElement(event) {
        event.preventDefault();
        const value = elementInput.value.trim();
        const type = elementType.value;
        const notes = elementNotes.value.trim();

        if (!value) {
            alert("Element value cannot be empty.");
            return;
        }

        // Prevent duplicate elements (simple check by value and type)
        if (trackingElements.some(el => el.value === value && el.type === type)) {
            alert("This element is already being tracked.");
            return;
        }

        // Basic validation for Twitter handles and hashtags
        if (type === 'handle' && !/^@[\w_]{1,15}$/.test(value)) {
            alert("Invalid Twitter handle format. Should be @username (1-15 alphanumeric chars including underscore).");
            return;
        }
        if (type === 'hashtag' && !/^#[\w_]+$/.test(value)) {
            alert("Invalid hashtag format. Should be #topic (alphanumeric chars including underscore).");
            return;
        }


        trackingElements.push({ value, type, notes });
        await chrome.storage.local.set({ trackingElements });
        renderElements();
        addElementForm.reset(); // Clear the form
    }

    // Handle deleting an element
    async function handleDeleteElement(event) {
        const indexToDelete = parseInt(event.target.dataset.index, 10);
        trackingElements.splice(indexToDelete, 1);
        await chrome.storage.local.set({ trackingElements });
        renderElements();
    }

    if (addElementForm) {
        addElementForm.addEventListener('submit', handleAddElement);
    }

    // Initial load
    loadElements();

    // --- Suggestion View Globals ---
    const suggestionSourceLink = document.getElementById('suggestionSourceLink');
    const suggestionSourceAuthor = document.getElementById('suggestionSourceAuthor');
    const suggestionTweetText = document.getElementById('suggestionTweetText');
    const suggestedHandlesList = document.getElementById('suggestedHandlesList');
    const suggestedHashtagsList = document.getElementById('suggestedHashtagsList');
    const suggestedKeywordsList = document.getElementById('suggestedKeywordsList');
    const suggestedURLsList = document.getElementById('suggestedURLsList');
    const addSuggestionsForm = document.getElementById('addSuggestionsForm');
    const noSuggestionsText = document.getElementById('noSuggestionsText');
    const suggestionsListContainer = document.getElementById('suggestionsListContainer');

    const handlesCountSpan = document.getElementById('handlesCount');
    const hashtagsCountSpan = document.getElementById('hashtagsCount');
    const keywordsCountSpan = document.getElementById('keywordsCount');
    const urlsCountSpan = document.getElementById('urlsCount');


    let currentSuggestions = null; // To store the latest received suggestions

    // --- Element Management (handleAddElement needs to be accessible) ---
    // (handleAddElement and related functions are already defined above)
    // We might need to call handleAddElement from the suggestions logic.

    // --- Listen for suggestions from content script ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "DISPLAY_SUGGESTIONS") {
            console.log("Popup received suggestions:", message.data);
            currentSuggestions = message.data;
            populateSuggestionsView(message.data);
            showView({ view: suggestionsView, button: navSuggestionsButton }); // Switch to suggestions view
            sendResponse({ status: "Suggestions received by popup" });
        }
        // Keep other message listeners if any (e.g. for future background script communication)
        return true; // Keep channel open for async response if needed by other handlers
    });

    function updateSuggestionViewDisplay() {
        if (currentSuggestions) {
            populateSuggestionsView(currentSuggestions);
            suggestionsListContainer.classList.remove('hidden');
            noSuggestionsText.classList.add('hidden');
        } else {
            suggestionSourceLink.textContent = 'N/A';
            suggestionSourceLink.href = '#';
            suggestionSourceAuthor.textContent = 'N/A';
            suggestionTweetText.textContent = 'No tweet selected for suggestions yet.';
            clearSuggestionLists();
            suggestionsListContainer.classList.add('hidden');
            noSuggestionsText.classList.remove('hidden');
        }
    }

    function clearSuggestionLists() {
        suggestedHandlesList.innerHTML = '';
        suggestedHashtagsList.innerHTML = '';
        suggestedKeywordsList.innerHTML = '';
        suggestedURLsList.innerHTML = '';
        handlesCountSpan.textContent = '(0)';
        hashtagsCountSpan.textContent = '(0)';
        keywordsCountSpan.textContent = '(0)';
        urlsCountSpan.textContent = '(0)';
    }

    function populateSuggestionsView(data) {
        if (!data || !data.suggestions) {
            updateSuggestionViewDisplay(); // Show "No suggestions" text
            return;
        }

        suggestionSourceLink.href = data.tweetUrl || '#';
        suggestionSourceLink.textContent = data.tweetUrl ? data.tweetUrl.substring(0, 50) + '...' : 'Unknown Source';
        suggestionSourceAuthor.textContent = data.tweetAuthor || 'Unknown Author';
        suggestionTweetText.textContent = data.tweetText ? `"${escapeHTML(data.tweetText.substring(0,200))}${data.tweetText.length > 200 ? '...' : ''}"` : "No text provided.";

        suggestionsListContainer.classList.remove('hidden');
        noSuggestionsText.classList.add('hidden');

        const { handles, hashtags, keywords, urls } = data.suggestions;

        renderSuggestionCategory(suggestedHandlesList, handles, 'handle', handlesCountSpan);
        renderSuggestionCategory(suggestedHashtagsList, hashtags, 'hashtag', hashtagsCountSpan);
        renderSuggestionCategory(suggestedKeywordsList, keywords, 'keyword', keywordsCountSpan);
        renderSuggestionCategory(suggestedURLsList, urls, 'url_pattern', urlsCountSpan); // URLs are suggested as 'url_pattern' type
    }

    function renderSuggestionCategory(ulElement, items, type, countSpan) {
        ulElement.innerHTML = '';
        countSpan.textContent = `(${items ? items.length : 0})`;
        if (!items || items.length === 0) {
            ulElement.innerHTML = '<li>None</li>';
            return;
        }
        items.forEach(item => {
            const itemLower = item.toLowerCase();
            // Don't suggest elements that are already being tracked OR previously ignored
            if (trackingElements.some(el => el.value.toLowerCase() === itemLower && el.type === type)) {
                // countSpan.textContent will be updated at the end based on actual children
                return;
            }
            if (ignoredSuggestions.has(`${type}:${itemLower}`)) {
                // countSpan.textContent will be updated at the end
                return;
            }

            const li = document.createElement('li');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = item;
            checkbox.dataset.type = type;
            checkbox.id = `suggest-${type}-${item.replace(/[^a-zA-Z0-9]/g, "")}`; // Create a somewhat unique ID

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.className = 'suggestion-value';
            label.textContent = escapeHTML(item);

            li.appendChild(checkbox);
            li.appendChild(label);
            ulElement.appendChild(li);
        });
         if (ulElement.children.length === 0) {
            ulElement.innerHTML = '<li>All items already tracked or none to suggest.</li>';
            countSpan.textContent = '(0)';
        } else {
            countSpan.textContent = `(${ulElement.children.length})`;
        }
    }

    if (addSuggestionsForm) {
        addSuggestionsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const selectedSuggestions = [];
            addSuggestionsForm.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                selectedSuggestions.push({
                    value: cb.value,
                    type: cb.dataset.type,
                    notes: `Suggested from: ${currentSuggestions ? currentSuggestions.tweetAuthor : 'Unknown'}` // Add source note
                });
            });

            if (selectedSuggestions.length === 0) {
                alert("No suggestions selected to add.");
                return;
            }

            let addedCount = 0;
            for (const suggestion of selectedSuggestions) {
                // Check for duplicates again before adding, though renderSuggestionCategory should prevent existing ones from being checkable
                if (!trackingElements.some(el => el.value.toLowerCase() === suggestion.value.toLowerCase() && el.type === suggestion.type)) {
                    trackingElements.push(suggestion);
                    addedCount++;
                }
            }

            if (addedCount > 0) {
                await chrome.storage.local.set({ trackingElements });
                renderElements(); // Re-render the main tracking elements list
                alert(`${addedCount} new element(s) added to tracking.`);
            } else if (selectedSuggestions.length > 0) { // They selected items, but all were already tracked
                 alert("Selected suggestions are already tracked or no new valid suggestions to add.");
            } else { // No items were selected
                alert("No suggestions selected to add.");
                return; // Don't proceed to ignore logic if nothing was selected
            }

            // Add unselected suggestions from the current view to the ignored list
            let newlyIgnoredCount = 0;
            if (currentSuggestions && currentSuggestions.suggestions) {
                const allCheckboxes = addSuggestionsForm.querySelectorAll('input[type="checkbox"]');
                allCheckboxes.forEach(cb => {
                    if (!cb.checked) {
                        const type = cb.dataset.type;
                        const value = cb.value.toLowerCase();
                        const ignoredKey = `${type}:${value}`;
                        if (!ignoredSuggestions.has(ignoredKey)) {
                            ignoredSuggestions.add(ignoredKey);
                            newlyIgnoredCount++;
                        }
                    }
                });
                if (newlyIgnoredCount > 0) {
                    await saveIgnoredSuggestions();
                    console.log(`Added ${newlyIgnoredCount} items to ignored suggestions.`);
                }
            }

            currentSuggestions = null; // Clear suggestions after processing
            updateSuggestionViewDisplay(); // This will show "No suggestions text" or update lists
            if (addedCount > 0) { // Only switch view if something was actually added
                showView({view: elementsView, button: navElementsButton}); // Switch back to elements view
            }
        });
    }
    // Initial call to set the correct state of the suggestions view
    updateSuggestionViewDisplay(); // Show "No suggestions text" initially or last known state

    // When Suggestions tab is clicked, try to generate new suggestions
    if (navSuggestionsButton) {
        navSuggestionsButton.addEventListener('click', () => {
            showView({ view: suggestionsView, button: navSuggestionsButton });
            if (!currentSuggestions) { // Only generate if no active suggestions displayed
                generateSuggestionsFromFeedback();
            } else {
                // If currentSuggestions exist, it means user clicked a tweet's suggest button,
                // so we don't overwrite those with feedback-based ones immediately.
                // updateSuggestionViewDisplay will ensure the existing ones are shown.
                populateSuggestionsView(currentSuggestions);
            }
        });
    }


    let ignoredSuggestions = new Set(); // In-memory set for current session

    async function loadIgnoredSuggestions() {
        const data = await chrome.storage.local.get('ignoredSuggestions');
        if (data.ignoredSuggestions && Array.isArray(data.ignoredSuggestions)) {
            ignoredSuggestions = new Set(data.ignoredSuggestions);
        } else {
            ignoredSuggestions = new Set(); // Initialize if not present
            await saveIgnoredSuggestions(); // And save empty set
        }
        // console.log("Loaded ignored suggestions:", ignoredSuggestions.size);
    }
    async function saveIgnoredSuggestions() {
        await chrome.storage.local.set({ ignoredSuggestions: Array.from(ignoredSuggestions) });
        // console.log("Saved ignored suggestions:", ignoredSuggestions.size);
    }

    // Call on popup load
    loadIgnoredSuggestions();

    // --- Suggestion Engine based on Feedback ---
    async function generateSuggestionsFromFeedback() {
        console.log("Attempting to generate suggestions from feedback...");
        chrome.runtime.sendMessage({ type: "GET_LOGGED_ENCOUNTERS" }, (response) => {
            if (chrome.runtime.lastError || !response || !response.encounters) {
                console.error("Error getting encounters for feedback suggestions:", chrome.runtime.lastError?.message);
                currentSuggestions = { source: "feedback_error", suggestions: { handles: [], hashtags: [], keywords: [], urls: [] } };
                updateSuggestionViewDisplay(); // Show no suggestions or error
                return;
            }

            const relevantEncounters = response.encounters.filter(enc => enc.userFeedback === 'relevant');
            if (relevantEncounters.length === 0) {
                console.log("No relevant encounters found to generate feedback-based suggestions.");
                currentSuggestions = { source: "feedback_none", suggestions: { handles: [], hashtags: [], keywords: [], urls: [] } };
                updateSuggestionViewDisplay();
                return;
            }

            console.log(`Found ${relevantEncounters.length} relevant encounters for suggestion generation.`);

            const potentialSuggestions = {
                handles: new Map(), // Store counts for ranking
                hashtags: new Map(),
                keywords: new Map(),
                urls: new Map() // Though URLs might be less common for co-occurrence from just text
            };

            // Simple stop words list (can be expanded or moved to a shared utility)
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
                'until', 'while', 'at', 'by', 'about',
                'tweet', 'twitter', 'post', 'link', 'video', 'image', 'photo', 'http', 'https', 'com', 'www', 'org', 'net', 'io'
            ]);


            relevantEncounters.forEach(encounter => {
                const text = encounter.tweetText;

                // Extract handles
                const handleRegex = /@(\w{1,15})/g;
                let match;
                while ((match = handleRegex.exec(text)) !== null) {
                    const handle = `@${match[1].toLowerCase()}`;
                    if (!trackingElements.some(el => el.value.toLowerCase() === handle && el.type === 'handle') && !ignoredSuggestions.has(`handle:${handle}`)) {
                        potentialSuggestions.handles.set(handle, (potentialSuggestions.handles.get(handle) || 0) + 1);
                    }
                }

                // Extract hashtags
                const hashtagRegex = /#(\w+)/g;
                while ((match = hashtagRegex.exec(text)) !== null) {
                    const hashtag = `#${match[1].toLowerCase()}`;
                     if (!trackingElements.some(el => el.value.toLowerCase() === hashtag && el.type === 'hashtag') && !ignoredSuggestions.has(`hashtag:${hashtag}`)) {
                        potentialSuggestions.hashtags.set(hashtag, (potentialSuggestions.hashtags.get(hashtag) || 0) + 1);
                    }
                }

                // Extract URLs (simple version, could be more robust)
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                while((match = urlRegex.exec(text)) !== null) {
                    const url = match[0];
                    // Basic filter for common shorteners or generic domains if desired
                    if (!trackingElements.some(el => el.value === url && el.type === 'url_pattern') && !ignoredSuggestions.has(`url_pattern:${url}`)) {
                         // For URLs, we might not want to rank by frequency as much as just presence
                        potentialSuggestions.urls.set(url, (potentialSuggestions.urls.get(url) || 0) + 1);
                    }
                }

                // Extract keywords
                let cleanedText = text.toLowerCase();
                // Remove already found entities to avoid them becoming keywords
                potentialSuggestions.handles.forEach((_,h) => cleanedText = cleanedText.replace(new RegExp(h.substring(1), 'gi'), ''));
                potentialSuggestions.hashtags.forEach((_,h) => cleanedText = cleanedText.replace(new RegExp(h, 'gi'), ''));
                // Basic URL removal for keyword extraction
                cleanedText = cleanedText.replace(/https?:\/\/[^\s]+/g, '');


                const words = cleanedText.replace(/[^\w\s']/g, '').split(/\s+/); // Keep apostrophes for contractions, remove other punctuation
                words.forEach(word => {
                    const wLower = word.toLowerCase();
                    if (wLower.length > 3 && wLower.length < 25 && !stopWords.has(wLower) && !/^\d+$/.test(wLower)) {
                         if (!trackingElements.some(el => el.value.toLowerCase() === wLower && el.type === 'keyword') && !ignoredSuggestions.has(`keyword:${wLower}`)) {
                            potentialSuggestions.keywords.set(wLower, (potentialSuggestions.keywords.get(wLower) || 0) + 1);
                        }
                    }
                });
            });

            // Convert Maps to sorted arrays of suggestions (top N, e.g., top 5 of each)
            const MAX_SUGGESTIONS_PER_CATEGORY = 5;
            const getTopN = (map) => Array.from(map.entries())
                                      .sort((a, b) => b[1] - a[1]) // Sort by count descending
                                      .slice(0, MAX_SUGGESTIONS_PER_CATEGORY)
                                      .map(entry => entry[0]);

            currentSuggestions = {
                tweetUrl: null, // Indicate these are not from a single tweet
                tweetAuthor: "Feedback Analysis",
                tweetText: `Generated from ${relevantEncounters.length} relevant encounter(s).`,
                suggestions: {
                    handles: getTopN(potentialSuggestions.handles),
                    hashtags: getTopN(potentialSuggestions.hashtags),
                    keywords: getTopN(potentialSuggestions.keywords),
                    urls: getTopN(potentialSuggestions.urls)
                }
            };
            populateSuggestionsView(currentSuggestions);
        });
    }


    // --- Settings View Additions ---
    const settingsViewSection = document.getElementById('settingsView');
    const clearIgnoredButton = document.createElement('button');
    clearIgnoredButton.id = 'clearIgnoredSuggestionsButton';
    clearIgnoredButton.textContent = 'Clear Ignored Suggestions List';
    clearIgnoredButton.style.marginTop = '15px';

    clearIgnoredButton.addEventListener('click', async () => {
        if (confirm("Are you sure you want to clear the list of all ignored suggestions? This might cause previously dismissed suggestions to reappear.")) {
            ignoredSuggestions.clear();
            await saveIgnoredSuggestions();
            alert("Ignored suggestions list has been cleared.");
        }
    });
    // Add a little div wrapper for styling if needed
    const ignoredButtonContainer = document.createElement('div');
    ignoredButtonContainer.style.marginTop = '20px';
    ignoredButtonContainer.appendChild(clearIgnoredButton);
    settingsViewSection.appendChild(ignoredButtonContainer);


    // --- Dashboard Functionality ---
    const encountersLogUL = document.getElementById('encountersLog');
    const dashboardSearchInput = document.getElementById('dashboardSearch');
    const dashboardFilterElementSelect = document.getElementById('dashboardFilterElement');
    const clearEncountersButton = document.getElementById('clearEncountersButton');

    let allEncounters = [];
    let uniqueMatchedElementValues = new Set();

    async function loadEncounters() {
        // Send message to background script to get encounters
        chrome.runtime.sendMessage({ type: "GET_LOGGED_ENCOUNTERS" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting logged encounters:", chrome.runtime.lastError.message);
                encountersLogUL.innerHTML = '<li>Error loading encounters.</li>';
                return;
            }
            if (response && response.encounters) {
                allEncounters = response.encounters;
                populateFilterDropdown();
                renderEncounters();
            } else {
                encountersLogUL.innerHTML = '<li>No encounters logged yet.</li>';
            }
        });
    }

    function populateFilterDropdown() {
        uniqueMatchedElementValues.clear();
        allEncounters.forEach(enc => uniqueMatchedElementValues.add(enc.matchedElement.value));

        dashboardFilterElementSelect.innerHTML = '<option value="">Filter by Element Value</option>'; // Reset
        uniqueMatchedElementValues.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            dashboardFilterElementSelect.appendChild(option);
        });
    }

    function renderEncounters() {
        encountersLogUL.innerHTML = ''; // Clear existing list

        const searchTerm = dashboardSearchInput.value.toLowerCase();
        const filterValue = dashboardFilterElementSelect.value;

        const filteredEncounters = allEncounters.filter(encounter => {
            const textMatch = encounter.tweetText.toLowerCase().includes(searchTerm) ||
                              encounter.tweetAuthor.toLowerCase().includes(searchTerm) ||
                              encounter.matchedElement.value.toLowerCase().includes(searchTerm) ||
                              (encounter.matchedElement.notes && encounter.matchedElement.notes.toLowerCase().includes(searchTerm));

            const elementMatch = filterValue ? encounter.matchedElement.value === filterValue : true;

            return textMatch && elementMatch;
        });


        if (filteredEncounters.length === 0) {
            encountersLogUL.innerHTML = '<li>No matching encounters found.</li>';
            return;
        }

        filteredEncounters.forEach((encounter, index) => { // Use index from filteredEncounters for unique IDs
            const li = document.createElement('li');
            const date = new Date(encounter.timestamp).toLocaleString();

            let notesText = encounter.matchedElement.notes ? ` [${encounter.matchedElement.notes}]` : '';

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'encounter-details';
            detailsDiv.innerHTML = `
                <strong class="matched-element-value">${escapeHTML(encounter.matchedElement.value)}</strong>
                <span class="matched-element-type">(${escapeHTML(encounter.matchedElement.type)})${notesText}</span><br>
                <span class="tweet-author">Author: ${escapeHTML(encounter.tweetAuthor)}</span><br>
                <span class="tweet-text-snippet">Tweet: "${escapeHTML(encounter.tweetText.substring(0, 100))}${encounter.tweetText.length > 100 ? '...' : ''}"</span><br>
                <a href="${encounter.tweetUrl}" target="_blank" class="tweet-link">View Tweet</a> - <span class="timestamp">${date}</span>
            `;

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'encounter-actions';

            const relevantButton = document.createElement('button');
            relevantButton.className = 'feedback-button relevant';
            relevantButton.title = 'Mark as Relevant';
            relevantButton.innerHTML = '👍';
            relevantButton.dataset.encounterUrl = encounter.tweetUrl;
            relevantButton.dataset.elementValue = encounter.matchedElement.value;
            relevantButton.dataset.elementType = encounter.matchedElement.type;
            relevantButton.dataset.feedback = 'relevant';

            const irrelevantButton = document.createElement('button');
            irrelevantButton.className = 'feedback-button irrelevant';
            irrelevantButton.title = 'Mark as Irrelevant';
            irrelevantButton.innerHTML = '👎';
            irrelevantButton.dataset.encounterUrl = encounter.tweetUrl;
            irrelevantButton.dataset.elementValue = encounter.matchedElement.value;
            irrelevantButton.dataset.elementType = encounter.matchedElement.type;
            irrelevantButton.dataset.feedback = 'irrelevant';

            updateFeedbackButtonStates(relevantButton, irrelevantButton, encounter.userFeedback);

            relevantButton.addEventListener('click', handleFeedbackButtonClick);
            irrelevantButton.addEventListener('click', handleFeedbackButtonClick);

            actionsDiv.appendChild(relevantButton);
            actionsDiv.appendChild(irrelevantButton);

            li.appendChild(detailsDiv);
            li.appendChild(actionsDiv);
            encountersLogUL.appendChild(li);
        });
    }

    function updateFeedbackButtonStates(relevantBtn, irrelevantBtn, feedbackState) {
        relevantBtn.classList.remove('marked-relevant', 'disabled');
        irrelevantBtn.classList.remove('marked-irrelevant', 'disabled');

        if (feedbackState === 'relevant') {
            relevantBtn.classList.add('marked-relevant');
            irrelevantBtn.classList.add('disabled'); // Disable other button
        } else if (feedbackState === 'irrelevant') {
            irrelevantBtn.classList.add('marked-irrelevant');
            relevantBtn.classList.add('disabled'); // Disable other button
        }
    }

    async function handleFeedbackButtonClick(event) {
        const button = event.currentTarget;
        const { encounterUrl, elementValue, elementType, feedback } = button.dataset;

        // Find the original encounter in allEncounters to check its current feedback state
        const originalEncounterIndex = allEncounters.findIndex(enc =>
            enc.tweetUrl === encounterUrl &&
            enc.matchedElement.value === elementValue &&
            enc.matchedElement.type === elementType
        );

        if (originalEncounterIndex === -1) {
            console.error("Could not find original encounter for feedback.");
            return;
        }

        const currentFeedback = allEncounters[originalEncounterIndex].userFeedback;
        let newFeedback = feedback;

        // If clicking the same button again, effectively unmark it
        if (currentFeedback === feedback) {
            newFeedback = null; // Or 'none', or undefined
        }

        // Send message to background to update storage
        chrome.runtime.sendMessage({
            type: "MARK_ENCOUNTER_FEEDBACK",
            data: {
                tweetUrl: encounterUrl,
                elementValue: elementValue,
                elementType: elementType,
                feedback: newFeedback
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error marking feedback:", chrome.runtime.lastError.message);
                alert("Error saving feedback.");
            } else if (response && response.success) {
                // Update local cache and UI
                allEncounters[originalEncounterIndex].userFeedback = newFeedback;

                // Update buttons in the DOM directly
                const parentLi = button.closest('li');
                if (parentLi) {
                    const relevantBtn = parentLi.querySelector('.feedback-button.relevant');
                    const irrelevantBtn = parentLi.querySelector('.feedback-button.irrelevant');
                    if (relevantBtn && irrelevantBtn) {
                         updateFeedbackButtonStates(relevantBtn, irrelevantBtn, newFeedback);
                    }
                }
                // No need to call renderEncounters() fully unless sorting/filtering changes based on feedback
            } else {
                alert("Failed to save feedback: " + (response ? response.status : "Unknown error"));
            }
        });
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return str.toString().replace(/[&<>"']/g, function (match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }


    if (navDashboardButton) {
        navDashboardButton.addEventListener('click', () => {
            showView({ view: dashboardView, button: navDashboardButton });
            loadEncounters(); // Reload encounters when dashboard is viewed
        });
    }

    if (dashboardSearchInput) {
        dashboardSearchInput.addEventListener('input', renderEncounters);
    }
    if (dashboardFilterElementSelect) {
        dashboardFilterElementSelect.addEventListener('change', renderEncounters);
    }

    if (clearEncountersButton) {
        clearEncountersButton.addEventListener('click', () => {
            if (confirm("Are you sure you want to delete ALL logged encounters? This cannot be undone.")) {
                chrome.runtime.sendMessage({ type: "CLEAR_ALL_ENCOUNTERS" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error clearing encounters:", chrome.runtime.lastError.message);
                        alert("Error clearing encounters: " + chrome.runtime.lastError.message);
                    } else if (response && response.status) {
                        alert(response.status);
                        allEncounters = []; // Clear local cache
                        populateFilterDropdown();
                        renderEncounters(); // Re-render (should show empty)
                        chrome.action.setBadgeText({ text: '' }); // Clear badge
                    } else {
                        alert("Failed to clear encounters. Unknown response from background.");
                    }
                });
            }
        });
    }

    // Call loadEncounters if dashboard is the default view or explicitly shown
    // This is now handled by the navDashboardButton click listener.

    // --- Data Export Functionality ---
    const exportDataButton = document.getElementById('exportDataButton'); // Already declared earlier

    if (exportDataButton) {
        exportDataButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: "GET_LOGGED_ENCOUNTERS" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error getting encounters for export:", chrome.runtime.lastError.message);
                    alert("Error fetching data for export.");
                    return;
                }
                if (response && response.encounters && response.encounters.length > 0) {
                    const encountersToExport = response.encounters;

                    // JSON Export
                    const jsonData = JSON.stringify(encountersToExport, null, 2);
                    const jsonBlob = new Blob([jsonData], { type: 'application/json' });
                    const jsonUrl = URL.createObjectURL(jsonBlob);
                    const jsonLink = document.createElement('a');
                    jsonLink.href = jsonUrl;
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    jsonLink.download = `cogsec_xray_encounters_${timestamp}.json`;
                    document.body.appendChild(jsonLink); // Required for Firefox
                    jsonLink.click();
                    document.body.removeChild(jsonLink);
                    URL.revokeObjectURL(jsonUrl);
                    alert("Encounters exported as JSON.");

                    // CSV Export (Optional - can be added here or as a separate button)
                    // For simplicity, focusing on JSON as per the immediate next step.
                    // If CSV is desired, it would involve formatting the data into CSV rows.
                } else {
                    alert("No encounters to export.");
                }
            });
        });
    }


    // Settings (Step 8 might use this)
    const visualHighlightingToggle = document.getElementById('visualHighlightingToggle');
    if(visualHighlightingToggle) {
        // Load setting
        chrome.storage.local.get('settings', (data) => {
            if (data.settings && data.settings.visualHighlighting !== undefined) {
                visualHighlightingToggle.checked = data.settings.visualHighlighting;
            } else {
                // Default to true if not set
                visualHighlightingToggle.checked = true;
                chrome.storage.local.set({ settings: { visualHighlighting: true } }); // Initialize if not present
            }
        });

        visualHighlightingToggle.addEventListener('change', (event) => {
            const enabled = event.target.checked;
            console.log(`Visual highlighting changed to: ${enabled}`);
            chrome.storage.local.get('settings', (data) => {
                const currentSettings = data.settings || {};
                currentSettings.visualHighlighting = enabled;
                chrome.storage.local.set({ settings: currentSettings });
            });
        });
    }
});
