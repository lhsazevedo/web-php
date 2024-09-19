const PHPSearch = (function() {
    /**
     * Processes a data structure in the format of our search-index.php
     * files and returns an array of search items.
     *
     * @param {Object} index
     * @return {Array}
     */
    const processIndex = function (index) {
        return Object.entries(index).map(([id, item]) => {
            if (!item[0]) return null;

            let type = "General";
            switch(item[2]) {
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
                id: id,
                name: item[0],
                description: item[1],
                tag: item[2],
                type: type,
                methodName: item[0].split('::').slice(-1)[0]
            };
        }).filter(Boolean);
    };

    /**
     * Attempt to asynchronously load the search JSON for a given language.
     *
     * @param {String}   language The language to search for.
     * @param {Function} success  Success handler, which will be given an
     *                            array of search items on success.
     * @param {Function} failure  An optional failure handler.
     */
    const loadLanguage = function (language, success, failure) {
        const key = "search-" + language;

        // Check if the cache has a recent enough search index.
        const cache = window.localStorage.getItem(key);

        if (cache) {
            const since = new Date();
            // Parse the stored JSON.
            const parsedCache = JSON.parse(cache);

            // We'll use anything that's less than two weeks old.
            since.setDate(since.getDate() - 14);
            if (parsedCache.time > since.getTime()) {
                success(parsedCache.data);
                return;
            }
        }

        // OK, nothing cached or cache is too old.
        fetch("/js/search-index.php?lang=" + language)
            .then(response => response.json())
            .then(data => {
                // Transform the data into something useful.
                const items = processIndex(data);
                // Cache the data.
                try {
                    window.localStorage.setItem(key,
                        JSON.stringify({
                            data: items,
                            time: new Date().getTime()
                        })
                    );
                } catch (e) {
                    // Local storage might be full, or other error. Just continue without caching.
                }
                success(items);
            })
            .catch(failure);
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
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };

    /**
     * Initialize the search functionality.
     *
     * @param {Object} options The options object. This should include
     *                         "language": the language to try to load,
     *                         "limit": the maximum number of results
     */
    const init = function(options) {
        const language = options.language || "en";
        const limit = options.limit || 30;

        const modal = document.getElementById("php-search-modal");
        const resultsContainer = document.getElementById("php-search-results");
        const searchInput = document.getElementById("php-search-modal-input");

        // SVG icons
        const bracesIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>code-braces</title><path d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z" /></svg>';
        const documentIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>file-document-outline</title><path d="M6,2A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6M6,4H13V9H18V20H6V4M8,12V14H16V12H8M8,16V18H13V16H8Z" /></svg>';

        const bracesTags = [
            'refentry',
            'reference',
            'phpdoc:classref',
            'phpdoc:exceptionref',
            'phpdoc:varentry',
            'stream_wrapper',
            'stream_context_option',
        ];

        const enableSearch = function (items) {
            const fuzzyhound = new FuzzySearch({
                source: items,
                token_sep: ' \t.,-_',  // treat colon as part of token, ignore tabs (from pasted content)
                score_test_fused: true,
                keys: [
                    'name',
                    'methodName',
                    'description'
                ],
                thresh_include: 5.0,
                thresh_relative_to_best: 0.7,
                bonus_match_start: 0.7,
                bonus_token_order: 1.0,
                bonus_position_decay: 0.3,
                token_query_min_length: 1,
                token_field_min_length: 2,
                output_map: 'root',
            });

            const doSearch = function () {
                resultsContainer.innerHTML = '';

                let results = fuzzyhound.search(this.value);

                results.forEach(function (result) {
                    // Boost Language Reference matches.
                    if (result.item.id.startsWith('language')) {
                        result.score += 10;
                    }
                });

                results.sort((a, b) => b.score - a.score);

                const resultHTML = results.slice(0, limit).map(function (result) {
                    const item = result.item;
                    const icon = bracesTags.includes(item.tag) ? bracesIcon : documentIcon;
                    const description = (item.type === "General")
                        ? item.description
                        : `${item.type} • ${item.description}`;

                    return `<a href="/manual/${language}/${item.id}.php" class="php-search-result">
                            <div class="php-search-result-type">${icon}</div>
                                <div class="php-search-result-main">
                                    <div class="php-search-result-name">${item.name}</div>
                                    <div class="php-search-result-desc">${description}</div>
                                </div>
                            </a>`;
                }).join('');

                resultsContainer.innerHTML = resultHTML;
            };

            searchInput.addEventListener('input', debounce(doSearch, 200));
        };

        // Look for the user's language, then fall back to English.
        loadLanguage(language, enableSearch, function () {
            loadLanguage("en", enableSearch);
        });
    };

    return { init };
})();
