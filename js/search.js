const PHPSearch = (() => {
    const DEBOUNCE_DELAY = 200;
    const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
    const CACHE_DAYS = 14;
    const BRACES_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>code-braces</title><path d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z" /></svg>';
    const DOCUMENT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>file-document-outline</title><path d="M6,2A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6M6,4H13V9H18V20H6V4M8,12V14H16V12H8M8,16V18H13V16H8Z" /></svg>';

    // SVG icons
    const parser = new DOMParser();
    const bracesIcon = parser.parseFromString(
        BRACES_ICON,
        "image/svg+xml",
    ).documentElement;
    const documentIcon = parser.parseFromString(
        DOCUMENT_ICON,
        "image/svg+xml",
    ).documentElement;

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
     * Debounce function to limit the rate at which a function can fire.
     *
     * @param {Function} func The function to debounce.
     * @param {Number} delay The debounce delay in milliseconds.
     * @return {Function} The debounced function.
     */
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
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
     * Utility function to safely create DOM elements with attributes and
     * children.
     *
     * @param {String} tag The tag name of the element.
     * @param {Object} attrs The attributes to set on the element.
     * @param {Array} children The children of the element.
     * @returns {HTMLElement} The created element.
     */
    const el = (tag, attrs = {}, children = []) => {
        const element = document.createElement(tag);

        Object.entries(attrs).forEach(([key, value]) => {
            if (key === "className") {
                element.className = value;
            } else {
                element.setAttribute(key, value);
            }
        });

        children.forEach((child) => {
            if (typeof child === "string") {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        });

        return element;
    };

    /**
     * Render the search results.
     *
     * @param {Array} results The search results.
     * @param {HTMLElement} container The container to render the results in.
     */
    const renderResults = (results, language, container) => {
        container.innerHTML = "";
        results.forEach(({ item }) => {
            const icon = ["General", "Extension"].includes(item.type)
                ? documentIcon
                : bracesIcon;
            const link = `/manual/${encodeURIComponent(language)}/${encodeURIComponent(item.id)}.php`;

            const resultElement = el(
                "a",
                {
                    href: link,
                    className: "php-search-result",
                    role: "option",
                    "aria-selected": "false",
                },
                [
                    el("div", { className: "php-search-result-icon" }, [
                        icon.cloneNode(true),
                    ]),
                    el("div", { className: "php-search-result-main" }, [
                        el("div", { className: "php-search-result-name" }, [
                            item.name,
                        ]),
                        el("div", { className: "php-search-result-desc" }, [
                            item.type !== "General" && `${item.type} • `,
                            item.description,
                        ]),
                    ]),
                ],
            );

            container.appendChild(resultElement);
        });
    };

    /**
     * Update the selected result in the results container.
     *
     * @param {HTMLElement} resultsContainer
     * @param {Number} selectedIndex
     */
    const updateSelectedResult = (resultsContainer, selectedIndex) => {
        const results = resultsContainer.querySelectorAll(".php-search-result");
        results.forEach((result, index) => {
            result.setAttribute(
                "aria-selected",
                index === selectedIndex ? "true" : "false",
            );
            if (index !== selectedIndex) {
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
     * Perform a search with the given query and FuzzySearch instance.
     *
     * @param {String} query The search query.
     * @param {FuzzySearch} fuzzyhound The FuzzySearch instance.
     * @returns {Array} The search results.
     */
    const search = (query, fuzzyhound) => {
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
    const init = async ({ language = "en", limit = 30 }) => {
        const resultsContainer = document.getElementById("php-search-results");
        const searchInput = document.getElementById("php-search-input");

        const searchItems = await loadLanguageIndexWithFallback(language);
        if (!searchItems) {
            console.error("Failed to load any search index");
            return;
        }

        const fuzzyhound = new FuzzySearch({
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

        let selectedIndex = -1;

        const handleKeyDown = function (event) {
            const results =
                resultsContainer.querySelectorAll(".php-search-result");

            switch (event.key) {
                case "ArrowDown":
                    event.preventDefault();
                    selectedIndex = Math.min(
                        selectedIndex + 1,
                        results.length - 1,
                    );
                    updateSelectedResult(resultsContainer, selectedIndex);
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    selectedIndex = Math.max(selectedIndex - 1, -1);
                    updateSelectedResult(resultsContainer, selectedIndex);
                    break;
                case "Enter":
                    if (selectedIndex !== -1) {
                        event.preventDefault();
                        results[selectedIndex].click();
                    } else {
                        window.location.href =
                            `/search.php?lang=${language}&q=` +
                            encodeURIComponent(searchInput.value);
                    }
                    break;
                case "Escape":
                    selectedIndex = -1;
                    break;
            }
        };

        searchInput.addEventListener(
            "input",
            debounce(() => {
                const result = search(searchInput.value, fuzzyhound);
                renderResults(result, language, resultsContainer);
                selectedIndex = -1;
                resultsContainer.setAttribute("role", "listbox");
                resultsContainer.setAttribute("aria-label", "Search results");
            }, DEBOUNCE_DELAY),
        );

        searchInput.addEventListener("keydown", handleKeyDown);
    };

    return { init };
})();
