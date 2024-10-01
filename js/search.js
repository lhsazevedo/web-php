const PHPSearch = (() => {
    const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
    const CACHE_DAYS = 14;

    let fuzzyhound;

    /**
     * Processes a data structure in the format of our search-index.php
     * files and returns an array of search items.
     *
     * @param {Object} index
     * @return {Array}
     */
    const processIndex = (index) => {
        return Object.entries(index)
            .map(([id, [name, description, tag]]) => {
                if (!name) return null;

                let type = "General";
                switch (tag) {
                    case "phpdoc:varentry":
                        type = "Variable";
                        break;

                    case "refentry":
                        type = "Function";
                        break;

                    case "phpdoc:exceptionref":
                        type = "Exception";
                        break;

                    case "phpdoc:classref":
                        type = "Class";
                        break;

                    case "set":
                    case "book":
                    case "reference":
                        type = "Extension";
                        break;
                }

                return {
                    id,
                    name,
                    description,
                    tag,
                    type,
                    methodName: name.split("::").pop(),
                };
            })
            .filter(Boolean);
    };

    /**
     * Attempt to asynchronously load the search JSON for a given language.
     *
     * @param {String}   language The language to search for.
     * @return {Promise} A promise that resolves with the search items.
     */
    const loadLanguageIndex = async (language) => {
        const key = `search-${language}`;
        const cache = window.localStorage.getItem(key);

        if (cache) {
            const { data, time: cachedDate } = JSON.parse(cache);
            const expireDate = cachedDate + CACHE_DAYS * MILLISECONDS_PER_DAY;
            if (Date.now() < expireDate) {
                return data;
            }
        }

        const response = await fetch(`/js/search-index.php?lang=${language}`);
        const data = await response.json();
        const items = processIndex(data);

        try {
            localStorage.setItem(
                key,
                JSON.stringify({
                    data: items,
                    time: Date.now(),
                }),
            );
        } catch (e) {
            // Local storage might be full, or other error. Just continue without caching.
        }

        return items;
    };

    /**
     * Load language data with fallback to English.
     *
     * @param {string} language The language to load
     * @returns {Promise<Array>} The loaded search items
     */
    const loadLanguageIndexWithFallback = async (language) => {
        try {
            const searchItems = await loadLanguageIndex(language);
            return searchItems;
        } catch (error) {
            if (language !== "en") {
                return loadLanguageIndexWithFallback("en");
            }
            throw error;
        }
    };

    /**
     * Perform a search with the given query and FuzzySearch instance.
     *
     * @param {String} query The search query.
     * @returns {Array} The search results.
     */
    const search = (query) => {
        return fuzzyhound
            .search(query)
            .map((result) => {
                // Boost Language Reference matches.
                if (result.item.id.startsWith("language")) {
                    result.score += 10;
                }
                return result;
            })
            .sort((a, b) => b.score - a.score);
    };

    /**
     * Initialize the search functionality.
     *
     * @param {Object} options The options object. This should include
     *                         "language": the language to try to load,
     *                         "limit": the maximum number of results
     */
    const init = async (language = "en") => {
        const searchItems = await loadLanguageIndexWithFallback(language);

        if (!searchItems) {
            console.error("Failed to load any search index");
            return;
        }

        fuzzyhound = new FuzzySearch({
            source: searchItems,
            token_sep: " \t.,-_",
            score_test_fused: true,
            keys: ["name", "methodName", "description"],
            thresh_include: 5.0,
            thresh_relative_to_best: 0.7,
            bonus_match_start: 0.7,
            bonus_token_order: 1.0,
            bonus_position_decay: 0.3,
            token_query_min_length: 1,
            token_field_min_length: 2,
            output_map: "root",
        });

        return (query) => search(query, fuzzyhound);
    };

    return { init, search };
})();

const initSearchModal = () => {
    const backdropElement = document.getElementById("php-search-container");
    const dialogElement = document.getElementById("php-search-dialog");
    const resultsElement = document.getElementById("php-search-results");
    const inputElement = document.getElementById("php-search-input");

    const show = function () {
        resultsElement.innerHTML = "";

        backdropElement.style.display = "block";
        backdropElement.setAttribute("aria-modal", "true");
        backdropElement.setAttribute("role", "dialog");
        // Force a reflow to make the transition work.
        void backdropElement.offsetWidth;
        backdropElement.classList.add("show");
        document.body.style.overflow = "hidden";

        inputElement.focus();
        inputElement.value = "";
    };

    const hide = function () {
        backdropElement.classList.remove("show");
        backdropElement.removeAttribute("aria-modal");
        backdropElement.removeAttribute("role");
        document.body.style.overflow = "auto";
        backdropElement.addEventListener(
            "transitionend",
            () => {
                backdropElement.style.display = "none";
            },
            { once: true },
        );
    };

    // Open the search modal when the search button is clicked
    document
        .querySelectorAll(".php-navbar-search, .php-navbar-search-btn-mobile")
        .forEach((button) => button.addEventListener("click", show));

    // Close the search modal when the close button is clicked
    document
        .querySelector(".php-search-close-btn")
        .addEventListener("click", hide);

    // Close the search modal when the escape key is pressed
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            hide();
        }
    });

    // Close the search modal when the user clicks outside of it
    backdropElement.addEventListener("click", function (event) {
        if (event.target === backdropElement) {
            hide();
        }
    });

    // Focus trap
    document.addEventListener("keydown", function (event) {
        if (event.key != "Tab") {
            return;
        }

        const selectable = dialogElement.querySelectorAll("input, button, a");
        const lastElement = selectable[selectable.length - 1];

        if (event.shiftKey) {
            if (document.activeElement === inputElement) {
                event.preventDefault();
                lastElement.focus();
            }
        } else if (document.activeElement === lastElement) {
            event.preventDefault();
            inputElement.focus();
        }
    });
};

const initSearchUI = ({ language, limit = 30 }) => {
    const DEBOUNCE_DELAY = 200;
    const BRACES_ICON =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>code-braces</title><path d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z" /></svg>';
    const DOCUMENT_ICON =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>file-document-outline</title><path d="M6,2A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6M6,4H13V9H18V20H6V4M8,12V14H16V12H8M8,16V18H13V16H8Z" /></svg>';

    const resultsElement = document.getElementById("php-search-results");
    const inputElement = document.getElementById("php-search-input");
    let selectedIndex = -1;

    /**
     * Update the selected result in the results container.
     */
    const updateSelectedResult = () => {
        const results = resultsElement.querySelectorAll(".php-search-result");
        results.forEach((result, index) => {
            const isSelected = index === selectedIndex;
            result.setAttribute("aria-selected", isSelected ? "true" : "false");
            if (!isSelected) {
                result.classList.remove("selected");
                return;
            }
            result.classList.add("selected");
            result.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        });
    };

    /**
     * Render the search results.
     *
     * @param {Array} results The search results.
     */
    const renderResults = (results) => {
        const escape = (html) => {
            var div = document.createElement('div');
            var node = document.createTextNode(html)
            div.appendChild(node);
            return div.innerHTML;
        };

        let resultsHtml = '';
        results.forEach(({ item }, i) => {
            const icon = ["General", "Extension"].includes(item.type)
                ? DOCUMENT_ICON
                : BRACES_ICON;
            const link = `/manual/${encodeURIComponent(language)}/${encodeURIComponent(item.id)}.php`;

            const description = (item.type !== "General")
                ? `${item.type} • ${item.description}`
                : item.description;

            resultsHtml += `
                <a
                    href="${link}"
                    class="php-search-result"
                    role="option"
                    aria-labelledby="php-search-result-name-${i}"
                    aria-describedby="php-search-result-desc-${i}"
                    aria-selected="false"
                >
                    <div class="php-search-result-icon">${icon}</div>
                    <div class="php-search-result-main">
                        <div id="php-search-result-name-${i}" class="php-search-result-name">
                            ${escape(item.name)}
                        </div>
                        <div id="php-search-result-desc-${i}" class="php-search-result-desc">
                            ${escape(description)}
                        </div>
                    </div>
                </a>
            `
        });

        resultsElement.innerHTML = resultsHtml;
    };

    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
    };

    const initSearchInput = () => {
        const handleKeyDown = (event) => {
            const resultsElements =
                resultsElement.querySelectorAll(".php-search-result");

            switch (event.key) {
                case "ArrowDown":
                    event.preventDefault();
                    selectedIndex = Math.min(
                        selectedIndex + 1,
                        resultsElements.length - 1,
                    );
                    updateSelectedResult();
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    selectedIndex = Math.max(selectedIndex - 1, -1);
                    updateSelectedResult();
                    break;
                case "Enter":
                    if (selectedIndex !== -1) {
                        event.preventDefault();
                        resultsElements[selectedIndex].click();
                    } else {
                        window.location.href = `/search.php?lang=${language}&q=${encodeURIComponent(inputElement.value)}`;
                    }
                    break;
                case "Escape":
                    selectedIndex = -1;
                    break;
            }
        };

        const handleInput = (event) => {
            const results = PHPSearch.search(event.target.value);
            renderResults(
                results.slice(0, limit),
                language,
                resultsElement,
            );
            selectedIndex = -1;
        }
        const debouncedHandleInput = debounce(handleInput, DEBOUNCE_DELAY);

        inputElement.addEventListener("input", debouncedHandleInput);
        inputElement.addEventListener("keydown", handleKeyDown);
    };

    initSearchInput();
    PHPSearch.init(language);
};
