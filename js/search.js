/**
 * A jQuery plugin to add typeahead search functionality to the navbar search
 * box.  This requires Hogan for templating and typeahead.js for the actual
 * typeahead functionality.
 */
(function ($) {
    /**
     * A backend, which encapsulates a set of completions, such as a list of
     * functions or classes.
     *
     * @constructor
     */
    var Backend = function () {
        this.elements = {};
    };

    /**
     * Adds an item to the backend.
     *
     * @param {String} id          The item ID. It would help if this was unique.
     * @param {String} name        The item name to use as a label.
     * @param {String} description Explanatory text for item.
     */
    Backend.prototype.addItem = function (id, name, description, tag, type) {
        this.elements[id] = {
            id: id,
            name: name,
            description: description,
            tag: tag,
            type: type,
        };
    };

    /**
     * Returns the backend contents formatted as an array that typeahead.js can
     * digest as a local data source.
     *
     * @return {Array}
     */
    Backend.prototype.toTypeaheadArray = function () {
        var array = [];

        $.each(this.elements, function (_, element) {
            element.methodName = element.name.split('::');
            if (element.methodName.length > 1) {
                element.methodName = element.methodName.slice(-1)[0];
            } else {
                delete element.methodName;
            }
            array.push(element);
        });

        /**
         * Old pre-sorting has no effect on results sorted by score.
         */
        return array;
    };

    /**
     * The actual search plugin. Should be applied to the input that needs
     * typeahead functionality.
     *
     * @param {Object} options The options object. This should include
     *                         "language": the language to try to load,
     *                         "limit": the maximum number of results
     */
    $.fn.search = function (options) {
        var $modal = this;

        options.language = options.language || "en";
        options.limit = options.limit || 30;

        /**
         * Utility function to check if the user's browser supports local
         * storage and native JSON, in which case we'll use it to cache the
         * search JSON.
         *
         * @return {Boolean}
         */
        var canCache = function () {
            // Disable caching in development (localhost, 127.0.0.1 and 0.0.0.0)
            const hostnames = ['localhost', '127.0.0.1', '0.0.0.0'];
            if (hostnames.includes(window.location.hostname)) {
                return false;
            }

            try {
                return ('localStorage' in window && window['localStorage'] !== null && "JSON" in window && window["JSON"] !== null);
            } catch (e) {
                return false;
            }
        };

        /**
         * Processes a data structure in the format of our search-index.php
         * files and returns an object containing multiple Backend objects.
         *
         * @param {Object} index
         * @return {Object}
         */
        var processIndex = function (index) {
            // The search types we want to support.
            var backend = new Backend()

            $.each(index, function (id, item) {
                /* If the item has a name, then we should figure out what type
                 * of data this is, and hence which backend this should go
                 * into. */
                if (item[0]) {
                    var type = "General";

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

                    if (type) {
                        backend.addItem(id, item[0], item[1], item[2], type);
                    }
                }
            });

            return backend;
        };

        /**
         * Attempt to asynchronously load the search JSON for a given language.
         *
         * @param {String}   language The language to search for.
         * @param {Function} success  Success handler, which will be given an
         *                            object containing multiple Backend
         *                            objects on success.
         * @param {Function} failure  An optional failure handler.
         */
        var loadLanguage = function (language, success, failure) {
            var key = "search-" + language;

            // Check if the cache has a recent enough search index.
            if (canCache()) {
                var cache = window.localStorage.getItem(key);

                if (cache) {
                    var since = new Date();

                    // Parse the stored JSON.
                    cache = JSON.parse(cache);

                    // We'll use anything that's less than two weeks old.
                    since.setDate(since.getDate() - 14);
                    if (cache.time > since.getTime()) {
                        b = new Backend();
                        b.elements = cache.data.elements
                        success(b);
                        return;
                    }
                }
            }

            // OK, nothing cached.
            $.ajax({
                dataType: "json",
                error: failure,
                success: function (data) {
                    // Transform the data into something useful.
                    var backend = processIndex(data);
                    // Cache the data if we can.
                    if (canCache()) {
                        /* This may fail in IE 8 due to exceeding the local
                         * storage limit. If so, squash the exception: this
                         * isn't a required part of the system. */
                        try {
                            window.localStorage.setItem(key,
                                JSON.stringify({
                                    data: backend,
                                    time: new Date().getTime()
                                })
                            );
                        } catch (e) {
                            // Derp.
                        }
                    }
                    success(backend);
                },
                url: "/js/search-index.php?lang=" + language
            });
        };

        /**
         * Actually enables the typeahead on the DOM element.
         *
         * @param {Object} backend An array-like object containing backend.
         */
        var enableSearchTypeahead = function (backend) {
            var fuzzyhound = new FuzzySearch({
                source: backend.toTypeaheadArray(),
                token_sep: ' \t.,-_', // treat colon as part of token, ignore tabs (from pasted content)
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

            var $resultsContainer = $modal.find('#php-search-results');

            // Source: https://pictogrammers.com/library/mdi/
            // We should credit them somewhere :)
            var bracesIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>code-braces</title><path d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z" /></svg>';
            var documentIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>file-document-outline</title><path d="M6,2A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6M6,4H13V9H18V20H6V4M8,12V14H16V12H8M8,16V18H13V16H8Z" /></svg>';

            $modal.find('#php-search-modal-input').on('input', function () {
                $resultsContainer.empty();

                var results = fuzzyhound.search(this.value)

                results.forEach(function (result) {
                    // Boost Language Reference matches.
                    if (result.item.id.startsWith('language')) {
                        result.score += 10;
                    }
                });

                results.sort(function (a, b) {
                    return b.score - a.score;
                });

                $resultsContainer.append(results.slice(0, 20).map(function (result) {
                    var icon = documentIcon;
                    var item = result.item;

                    bracesTags = [
                        'refentry',
                        'reference',

                        // Some refentry tags use the role attribute as name for the index.
                        // See phpdotnet\phd\Index::format_refentry()
                        'phpdoc:classref',
                        'phpdoc:exceptionref',
                        'phpdoc:varentry',
                        'stream_wrapper',
                        'stream_context_option',

                    ]

                    if (bracesTags.includes(item.tag)) {
                        icon = bracesIcon;
                    }

                    let description = (item.type === "General")
                        ? item.description
                        : `${item.type} • ${item.description}`;

                    return `<a href="/manual/${options.language}/${item.id}.php" class="php-search-result">
                            <div class="php-search-result-type">${icon}</div>
                                <div class="php-search-result-main">
                                    <div class="php-search-result-name">${item.name}</div>
                                    <div class="php-search-result-desc">${description}</div>
                                </div>
                            </a>`
                }))
            })
        };

        // Look for the user's language, then fall back to English.
        loadLanguage(options.language, enableSearchTypeahead, function () {
            loadLanguage("en", enableSearchTypeahead);
        });

        return this;
    };
})(jQuery);
