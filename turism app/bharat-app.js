(function () {
    "use strict";

    const states = window.BHARAT_STATES;
    const landmarks = new Map(
        (Array.isArray(window.BHARAT_LANDMARKS) ? window.BHARAT_LANDMARKS : [])
            .map(landmark => [landmark.state, landmark])
    );
    const templeLandmarks = new Map(
        (Array.isArray(window.BHARAT_TEMPLE_LANDMARKS) ? window.BHARAT_TEMPLE_LANDMARKS : [])
            .map(landmark => [landmark.state, landmark])
    );
    const root = document.getElementById("bharat-app-root");
    const services = [
        { value: "stay", name: "Find a stay", detail: "Hotels, lodges and heritage stays", icon: "⌂" },
        { value: "restaurant", name: "Eat local", detail: "Restaurants and regional food", icon: "✦" },
        { value: "vehicle", name: "Book a ride", detail: "Taxi, sedan, SUV or traveller", icon: "↗" },
        { value: "rental", name: "Rent a vehicle", detail: "Bike, scooter or self-drive car", icon: "⌁" },
        { value: "guide", name: "Meet a local guide", detail: "Heritage, wildlife, trekking and food", icon: "◎" },
        { value: "package", name: "Explore packages", detail: "Spiritual, nature and adventure trips", icon: "✧" }
    ];
    const serviceLabels = Object.fromEntries(services.map(service => [service.value, service.name]));
    const stateStorageKey = "bharat-darshan:offline-guides";
    const bookingStorageKey = "bharat-darshan:trip-requests";
    const ecoStorageKey = "bharat-darshan:eco-wallet";
    let activeState = null;
    let activeCategory = "";
    let noticeTimer;

    if (!Array.isArray(states) || states.length !== 28 || !root) {
        console.error("Bharat Darshan could not initialize: the state catalogue or app root is missing.");
        return;
    }

    const incompleteStates = states.filter(state =>
        !state.name
        || !state.capital
        || !["destinations", "featuredPlaces", "temples", "hiddenGems", "activities"].every(key =>
            Array.isArray(state[key])
            && state[key].length === 3
            && state[key].every(item => typeof item === "string" && item.trim())
        )
        || !["culture", "heritage", "food", "ecoFocus"].every(key =>
            typeof state[key] === "string" && state[key].trim()
        )
    );
    if (incompleteStates.length) {
        console.error(
            "Bharat Darshan state guides are incomplete:",
            incompleteStates.map(state => state.name || "Unnamed state")
        );
        return;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function readStoredValue(key, fallback) {
        try {
            const stored = localStorage.getItem(key);
            return stored === null ? fallback : JSON.parse(stored);
        } catch (error) {
            console.error(`Could not read saved Bharat Darshan data for ${key}.`, error);
            return fallback;
        }
    }

    function writeStoredValue(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Could not save Bharat Darshan data for ${key}.`, error);
            announce("This browser could not save your changes. Check its storage permissions and available space.");
            return false;
        }
    }

    function announce(message) {
        const element = document.getElementById("bd-notice");
        if (!element) return;
        element.textContent = message;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => {
            element.textContent = "";
        }, 5000);
    }

    function stateOptions(selectedName) {
        return `
            <option value="" disabled${selectedName ? "" : " selected"}>Select a state</option>
            ${states.map(state => `
            <option value="${escapeHtml(state.name)}"${state.name === selectedName ? " selected" : ""}>
                ${escapeHtml(state.name)}
            </option>
            `).join("")}
        `;
    }

    function serviceCards() {
        return services.map(service => `
            <button class="bd-service" type="button" data-book="${service.value}">
                <span class="bd-service-icon" aria-hidden="true">${service.icon}</span>
                <strong>${service.name}</strong>
                <small>${service.detail}</small>
            </button>
        `).join("");
    }

    function stateCards(query = "") {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        const matchedStates = states.filter(state => {
            const searchable = [
                state.name,
                state.capital,
                ...state.destinations,
                ...state.featuredPlaces,
                ...state.temples,
                ...state.hiddenGems,
                ...state.activities,
                state.culture,
                state.heritage,
                state.food,
                state.ecoFocus
            ].join(" ").toLocaleLowerCase();
            return searchable.includes(normalizedQuery);
        });

        const cards = matchedStates.map((state, index) => {
            const tone = `hsl(${145 + (index * 31) % 190} 50% 37%)`;
            const landmark = landmarks.get(state.name);
            return `
                <button class="bd-state-card" type="button" data-open-state="${escapeHtml(state.name)}" style="--bd-tone:${tone}">
                    ${landmark ? `<img class="bd-state-thumb" src="${escapeHtml(landmark.image)}" alt="${escapeHtml(landmark.place)}" loading="lazy">` : ""}
                    <strong>${escapeHtml(state.name)}</strong>
                    <small>Capital: ${escapeHtml(state.capital)}</small>
                    <small>Featured: ${escapeHtml(state.featuredPlaces[0])}</small>
                </button>
            `;
        }).join("");

        document.getElementById("bd-state-grid").innerHTML = cards || `
            <p class="bd-note" role="status">No state stories match that search. Try a place, dish or activity.</p>
        `;
        document.getElementById("bd-state-count").textContent =
            `${matchedStates.length} ${matchedStates.length === 1 ? "state" : "states"}`;
    }

    window.addEventListener("bharat-landmarks-updated", () => {
        (window.BHARAT_LANDMARKS || []).forEach(landmark => landmarks.set(landmark.state, landmark));
        (window.BHARAT_TEMPLE_LANDMARKS || []).forEach(landmark => templeLandmarks.set(landmark.state, landmark));
        const search = document.getElementById("bd-state-search");
        stateCards(search ? search.value : "");
        if (activeState && !document.getElementById("bd-state-modal").hidden) {
            openState(activeState.name);
        }
    });

    function renderApp() {
        root.innerHTML = `
            <section class="bd-section space-y-8" id="bharat-directory" aria-labelledby="bd-title">
                <div class="bd-panel p-6 md:p-8">
                    <div class="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
                        <div>
                            <p class="bd-kicker mb-2">One platform · 28 states · travel with care</p>
                            <h2 class="text-3xl md:text-4xl font-black tracking-tight" id="bd-title">Bharat Darshan</h2>
                            <p class="mt-3 max-w-2xl text-sm md:text-base leading-relaxed text-slate-600">
                                Find celebrated landmarks and quieter local places, discover living culture and regional food,
                                and plan the practical parts of your journey in one place.
                            </p>
                        </div>
                        <div class="rounded-2xl bg-emerald-50 px-5 py-4 text-emerald-900">
                            <strong class="block text-2xl">28</strong>
                            <span class="text-xs font-bold uppercase tracking-wider">state guides</span>
                        </div>
                    </div>
                </div>

                <div class="bd-panel p-5 md:p-7" id="bd-services">
                    <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p class="bd-kicker mb-1">Plan the whole journey</p>
                            <h3 class="text-2xl font-extrabold">Travel services</h3>
                        </div>
                        <p class="max-w-md text-xs leading-relaxed text-slate-500">
                            Browse the service types in the report. This prototype saves trip requests on your device;
                            it does not show live availability or confirm a provider booking.
                        </p>
                    </div>
                    <div class="bd-service-grid">${serviceCards()}</div>
                    <div class="bd-action-row">
                        <button class="bd-secondary" type="button" data-open-map>Maps &amp; offline guides</button>
                        <button class="bd-secondary" type="button" data-open-eco>Eco-Warrior rewards</button>
                    </div>
                </div>

                <div class="bd-panel p-5 md:p-7">
                    <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p class="bd-kicker mb-1">Famous places · hidden gems · local stories</p>
                            <h3 class="text-2xl font-extrabold">Choose a state to begin</h3>
                        </div>
                        <span class="text-sm font-bold text-emerald-800" id="bd-state-count">28 states</span>
                    </div>
                    <label class="mb-4 block">
                        <span class="sr-only">Search all state guides</span>
                        <input class="bd-state-search" id="bd-state-filter" type="search"
                            placeholder="Search states, places, food, festivals or activities" autocomplete="off">
                    </label>
                    <div class="bd-state-grid" id="bd-state-grid"></div>
                    <p class="mt-4 text-xs leading-relaxed text-slate-500">
                        Places and events are indicative. Confirm seasonal access, current timings and required permits before travelling.
                    </p>
                </div>

                <div class="bd-panel p-5 md:p-7">
                    <div class="mb-4">
                        <p class="bd-kicker mb-1">Small actions, meaningful places</p>
                        <h3 class="text-2xl font-extrabold">Travel gently. Leave places better.</h3>
                    </div>
                    <div class="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                        <p class="text-sm leading-relaxed text-slate-600">
                            Learn about each state's environmental focus, save a guide for later, and record a local
                            Eco-Warrior action. The points wallet is a local prototype, not a verified rewards programme.
                        </p>
                        <button class="bd-primary" type="button" data-open-eco>Open Eco-Warrior</button>
                    </div>
                </div>
            </section>

            <div class="bd-overlay" id="bd-state-modal" hidden>
                <section class="bd-dialog" role="dialog" aria-modal="true" aria-labelledby="bd-state-title">
                    <div class="bd-dialog-top">
                        <div>
                            <p class="bd-kicker" id="bd-state-capital"></p>
                            <h2 class="mt-1 text-3xl font-black" id="bd-state-title"></h2>
                        </div>
                        <button class="bd-close" type="button" data-close aria-label="Close state guide">×</button>
                    </div>
                    <div id="bd-state-content"></div>
                </section>
            </div>

            <div class="bd-overlay" id="bd-booking-modal" hidden>
                <section class="bd-dialog" role="dialog" aria-modal="true" aria-labelledby="bd-booking-title">
                    <div class="bd-dialog-top">
                        <div>
                            <p class="bd-kicker">A plan, saved on this device</p>
                            <h2 class="mt-1 text-3xl font-black" id="bd-booking-title">Plan your trip</h2>
                        </div>
                        <button class="bd-close" type="button" data-close aria-label="Close trip planner">×</button>
                    </div>
                    <p class="bd-note mb-4">
                        This is a planning request, not a confirmed reservation. No live provider, price or availability data is connected.
                    </p>
                    <form class="bd-form" id="bd-booking-form">
                        <label>Your name
                            <input name="traveller" type="text" maxlength="80" autocomplete="name" required>
                        </label>
                        <label>Service
                            <select name="service" id="bd-booking-service" required>
                                <option value="" selected disabled>Choose a travel service</option>
                                ${services.map(service => `<option value="${service.value}">${service.name}</option>`).join("")}
                            </select>
                        </label>
                        <label>State
                            <select name="state" id="bd-booking-state" required>${stateOptions()}</select>
                        </label>
                        <div class="grid gap-3 sm:grid-cols-2">
                            <label>Start date
                                <input name="date" id="bd-booking-date" type="date" required>
                            </label>
                            <label>Travellers
                                <input name="travellers" type="number" min="1" max="50" value="1" required>
                            </label>
                        </div>
                        <label>Notes (optional)
                            <textarea name="notes" maxlength="500" placeholder="City, interests, accessibility needs or preferred language"></textarea>
                        </label>
                        <button class="bd-primary" type="submit">Save trip request</button>
                    </form>
                    <div class="mt-6">
                        <h3 class="font-extrabold">Saved requests</h3>
                        <ul class="bd-list" id="bd-booking-list"></ul>
                    </div>
                </section>
            </div>

            <div class="bd-overlay" id="bd-category-modal" hidden>
                <section class="bd-dialog" role="dialog" aria-modal="true" aria-labelledby="bd-category-title">
                    <div class="bd-dialog-top">
                        <div>
                            <p class="bd-kicker">Discover from the 28-state guide</p>
                            <h2 class="mt-1 text-3xl font-black" id="bd-category-title"></h2>
                            <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600" id="bd-category-description"></p>
                        </div>
                        <button class="bd-close" type="button" data-close aria-label="Close category results">×</button>
                    </div>
                    <label class="mb-3 block">
                        <span class="sr-only">Filter category results</span>
                        <input class="bd-state-search" id="bd-category-search" type="search"
                            placeholder="Filter by state or item" autocomplete="off">
                    </label>
                    <p class="mb-3 text-xs font-bold text-emerald-800" id="bd-category-count" role="status"></p>
                    <div class="bd-category-list" id="bd-category-list"></div>
                    <p class="mt-4 text-xs leading-relaxed text-slate-500">
                        Suggestions come from the project report. Confirm seasonal access, local rules and permits before travelling.
                    </p>
                </section>
            </div>

            <div class="bd-overlay" id="bd-map-modal" hidden>
                <section class="bd-dialog" role="dialog" aria-modal="true" aria-labelledby="bd-map-title">
                    <div class="bd-dialog-top">
                        <div>
                            <p class="bd-kicker">Open maps · keep your guide close</p>
                            <h2 class="mt-1 text-3xl font-black" id="bd-map-title">Maps &amp; offline guides</h2>
                        </div>
                        <button class="bd-close" type="button" data-close aria-label="Close maps">×</button>
                    </div>
                    <p class="bd-note">
                        OpenStreetMap links need an internet connection. Download a state guide below to keep its
                        destinations, culture, food and eco notes as a file. Map tiles are not downloaded by this prototype.
                    </p>
                    <div class="bd-action-row items-end">
                        <label class="grid flex-1 gap-2 text-sm font-bold text-slate-600">Choose a state
                            <select class="bd-form" id="bd-map-state">${stateOptions()}</select>
                        </label>
                        <a class="bd-primary inline-flex items-center justify-center no-underline" id="bd-map-link"
                            href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer">
                            Open map
                        </a>
                    </div>
                    <div class="mt-6">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <h3 class="font-extrabold">Saved guides</h3>
                            <span class="text-xs text-slate-500">Stored in this browser</span>
                        </div>
                        <ul class="bd-list" id="bd-offline-list"></ul>
                    </div>
                </section>
            </div>

            <div class="bd-overlay" id="bd-eco-modal" hidden>
                <section class="bd-dialog" role="dialog" aria-modal="true" aria-labelledby="bd-eco-title">
                    <div class="bd-dialog-top">
                        <div>
                            <p class="bd-kicker">Rewards for responsible tourism</p>
                            <h2 class="mt-1 text-3xl font-black" id="bd-eco-title">Eco-Warrior</h2>
                        </div>
                        <button class="bd-close" type="button" data-close aria-label="Close Eco-Warrior">×</button>
                    </div>
                    <div class="bd-wallet mb-4">
                        <div><span class="block text-xs font-bold uppercase tracking-wider text-emerald-100">Your demo points</span>
                            <strong id="bd-eco-points">0 points</strong></div>
                        <div class="text-right"><span class="block text-xs font-bold uppercase tracking-wider text-emerald-100">Current level</span>
                            <strong class="text-base" id="bd-eco-level">Green Starter</strong></div>
                    </div>
                    <p class="bd-note mb-4">
                        Prototype only: actions are self-reported and points are credited locally for demonstration.
                        There is no server-side review, photo verification or redeemable reward.
                    </p>
                    <form class="bd-form" id="bd-eco-form">
                        <label>Eco action
                            <select name="action" required>
                                <option value="litter">Dispose of litter at a tourist site — 10 points</option>
                                <option value="cleanup">Join a community clean-up — 50 points</option>
                                <option value="tree">Join a tree-planting activity — 40 points</option>
                                <option value="pledge">Take the plastic-free trip pledge — 20 points</option>
                                <option value="report">Report a missing or overflowing dustbin — 5 points</option>
                            </select>
                        </label>
                        <label>Place or short note
                            <input name="location" type="text" maxlength="120" placeholder="Optional; avoid sharing private details">
                        </label>
                        <button class="bd-primary" type="submit">Record demo action</button>
                    </form>
                    <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
                        <p class="text-xs leading-relaxed text-slate-500" id="bd-certificate-note">
                            Earn 300 points to unlock the demo certificate.
                        </p>
                        <button class="bd-secondary" id="bd-certificate" type="button" disabled>Download certificate</button>
                    </div>
                    <div class="mt-5">
                        <h3 class="font-extrabold">Recent actions</h3>
                        <ul class="bd-list" id="bd-eco-list"></ul>
                    </div>
                </section>
            </div>
            <div class="bd-notice" id="bd-notice" role="status" aria-live="polite"></div>
        `;
        stateCards();
        setMinimumBookingDate();
        renderBookingRequests();
        renderEcoWallet();
        renderOfflineGuides();
        updateMapLink();
    }

    function setMinimumBookingDate() {
        const today = new Date();
        const localDate = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0")
        ].join("-");
        document.getElementById("bd-booking-date").min = localDate;
        document.getElementById("bd-booking-date").value = localDate;
    }

    function openDialog(id) {
        document.querySelectorAll(".bd-overlay:not([hidden])").forEach(dialog => {
            dialog.hidden = true;
        });
        const dialog = document.getElementById(id);
        dialog.hidden = false;
        document.body.classList.add("modal-open");
        const closeButton = dialog.querySelector("[data-close]");
        if (closeButton) closeButton.focus();
    }

    function closeDialog(dialog) {
        dialog.hidden = true;
        if (!document.querySelector(".bd-overlay:not([hidden])")) {
            document.body.classList.remove("modal-open");
        }
    }

    function listItems(items) {
        return `<ul class="bd-tag-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    }

    function openState(name) {
        const state = states.find(item => item.name === name);
        if (!state) {
            announce("That state guide could not be found.");
            return;
        }

        activeState = state;
        const landmark = landmarks.get(state.name);
        const templeLandmark = templeLandmarks.get(state.name);
        document.getElementById("bd-state-capital").textContent = `Capital · ${state.capital}`;
        document.getElementById("bd-state-title").textContent = state.name;
        document.getElementById("bd-state-content").innerHTML = `
            ${landmark ? `
            <figure class="bd-featured-landmark">
                <img src="${escapeHtml(landmark.image)}" alt="${escapeHtml(landmark.place)}, ${escapeHtml(state.name)}" loading="lazy">
                <figcaption>
                    <strong>${escapeHtml(landmark.place)}</strong>
                    <span>Photo: ${escapeHtml(landmark.attribution)} · ${escapeHtml(landmark.license)}</span>
                    <a href="${escapeHtml(landmark.sourceUrl)}" target="_blank" rel="noopener noreferrer">Image source and license</a>
                </figcaption>
            </figure>` : ""}
            <div class="bd-info-grid">
                <article class="bd-info-card"><h4>Famous destinations</h4>${listItems(state.destinations)}</article>
                <article class="bd-info-card"><h4>Featured places</h4>${listItems(state.featuredPlaces)}</article>
                <article class="bd-info-card">
                    <h4>Temples &amp; sacred sites</h4>
                    ${templeLandmark?.image ? `
                    <figure class="bd-featured-landmark bd-temple-landmark">
                        <img src="${escapeHtml(templeLandmark.image)}" alt="${escapeHtml(templeLandmark.place)}, ${escapeHtml(state.name)}" loading="lazy">
                        <figcaption>
                            <strong>${escapeHtml(templeLandmark.place)}</strong>
                            <span>Photo: ${escapeHtml(templeLandmark.attribution)} · ${escapeHtml(templeLandmark.license)}</span>
                            <a href="${escapeHtml(templeLandmark.sourceUrl)}" target="_blank" rel="noopener noreferrer">Image source and license</a>
                        </figcaption>
                    </figure>` : ""}
                    ${listItems(state.temples)}
                </article>
                <article class="bd-info-card"><h4>Hidden gems</h4>${listItems(state.hiddenGems)}</article>
                <article class="bd-info-card"><h4>Popular activities</h4>${listItems(state.activities)}</article>
                <article class="bd-info-card"><h4>Culture</h4><p>${escapeHtml(state.culture)}</p></article>
                <article class="bd-info-card"><h4>Heritage</h4><p>${escapeHtml(state.heritage)}</p></article>
                <article class="bd-info-card"><h4>Local food</h4><p>${escapeHtml(state.food)}</p></article>
                <article class="bd-info-card"><h4>Eco focus</h4><p>${escapeHtml(state.ecoFocus)}</p></article>
            </div>
            <div class="bd-action-row">
                <button class="bd-primary" type="button" data-state-plan="${escapeHtml(state.name)}">Plan a trip here</button>
                <button class="bd-secondary" type="button" data-save-guide="${escapeHtml(state.name)}">Save / download guide</button>
                <button class="bd-secondary" type="button" data-state-map="${escapeHtml(state.name)}">Open map</button>
            </div>
        `;
        openDialog("bd-state-modal");
    }

    const categoryDescriptions = {
        Destinations: "Mix marquee sights with lesser-known places. Every destination opens its complete state story.",
        Treks: "Find trekking and hill-walking ideas mentioned in state activities and hidden-gem lists.",
        Temples: "Browse temple, monastery, pilgrimage and sacred-heritage mentions from across India.",
        Nature: "Explore parks, lakes, valleys, waterfalls, beaches, forests and outdoor experiences.",
        Culture: "Discover festivals, performance traditions, art forms and living heritage from every state.",
        Food: "Browse the report's regional dishes and food traditions, organised by state."
    };

    const categoryMatchers = {
        Treks: /\btrek(?:king)?\b|\bhill trekking\b|\bhiking\b|\bmountain trail\b|\bvalley trek\b|\broot bridge trek\b/i,
        Temples: /\btemple\b|\bpilgrimage\b|\bmonastery\b|\bmonasteries\b|\bdham\b|\bshrine\b|\bjagannath\b/i,
        Nature: /\bpark\b|\bforest\b|\bfalls?\b|\bwaterfall\b|\blake\b|\bbeach(?:es)?\b|\bvalley\b|\bhills?\b|\bmountain\b|\bpeak\b|\bpass\b|\bcoast(?:al)?\b|\bisland\b|\bbackwaters?\b|\bwildlife\b|\bsafari\b|\bbird\b|\bcave\b|\bcaves\b|\bghats?\b|\bmeadows?\b|\bwetland\b|\bcruise\b|\bboating\b|\brafting\b|\bplantation\b|\bwater sports\b|\bhouseboat\b|\bview(?:s)?\b|\bnational park\b/i
    };

    function getCategoryEntries(category) {
        const entries = [];
        const matcher = categoryMatchers[category];
        for (const state of states) {
            if (category === "Culture") {
                entries.push({
                    state: state.name,
                    capital: state.capital,
                    title: state.culture,
                    source: "Culture & festivals"
                });
            } else if (category === "Food") {
                entries.push({
                    state: state.name,
                    capital: state.capital,
                    title: state.food,
                    source: "Local food"
                });
            } else {
                const sourceLists = [
                    ["Famous destination", state.destinations],
                    ["Featured place", state.featuredPlaces],
                    ["Temple or sacred site", state.temples],
                    ["Hidden gem", state.hiddenGems],
                    ["Popular activity", state.activities]
                ];
                for (const [source, items] of sourceLists) {
                    for (const title of items) {
                        const isMatch = category === "Destinations"
                            ? source !== "Popular activity"
                            : matcher.test(title);
                        if (isMatch) {
                            entries.push({
                                state: state.name,
                                capital: state.capital,
                                title,
                                source
                            });
                        }
                    }
                }
            }
        }
        return entries;
    }

    function renderCategory(category, query = "") {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        const entries = getCategoryEntries(category).filter(entry =>
            `${entry.title} ${entry.state} ${entry.capital} ${entry.source}`
                .toLocaleLowerCase()
                .includes(normalizedQuery)
        );
        document.getElementById("bd-category-count").textContent =
            `${entries.length} ${entries.length === 1 ? "idea" : "ideas"} across the state guide`;
        document.getElementById("bd-category-list").innerHTML = entries.length
            ? entries.map(entry => `
                <button class="bd-category-card" type="button" data-category-state="${escapeHtml(entry.state)}">
                    <strong>${escapeHtml(entry.title)}</strong>
                    <span>${escapeHtml(entry.state)} · Capital: ${escapeHtml(entry.capital)}</span>
                    <small>${escapeHtml(entry.source)} · Open state guide</small>
                </button>
            `).join("")
            : `<p class="bd-note" role="status">No ${escapeHtml(category.toLocaleLowerCase())} ideas match this filter. Try another place or state.</p>`;
    }

    function openCategory(category) {
        if (category === "Stays") {
            openBooking("stay", activeState && activeState.name);
            return;
        }
        if (category === "Plan Trip") {
            openBooking("", activeState && activeState.name);
            return;
        }
        if (!Object.prototype.hasOwnProperty.call(categoryDescriptions, category)) {
            console.error(`Unknown quick-plan category: ${category}`);
            announce("That quick-plan category is not available.");
            return;
        }
        activeCategory = category;
        document.getElementById("bd-category-title").textContent = category;
        document.getElementById("bd-category-description").textContent = categoryDescriptions[category];
        document.getElementById("bd-category-search").value = "";
        renderCategory(category);
        openDialog("bd-category-modal");
    }

    function downloadTextFile(filename, contents, mimeType) {
        const blob = new Blob([contents], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function saveGuide(name) {
        const state = states.find(item => item.name === name);
        if (!state) {
            announce("That state guide could not be found.");
            return;
        }
        const savedGuides = readStoredValue(stateStorageKey, []);
        if (!Array.isArray(savedGuides)) {
            console.error("Saved guide data was not a list; resetting the local guide list.");
            writeStoredValue(stateStorageKey, []);
        }
        const guides = Array.isArray(savedGuides) ? savedGuides : [];
        if (!guides.includes(state.name)) {
            guides.push(state.name);
            if (!writeStoredValue(stateStorageKey, guides)) return;
        }
        renderOfflineGuides();
        downloadTextFile(
            `${state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-bharat-darshan-guide.json`,
            JSON.stringify(state, null, 2),
            "application/json;charset=utf-8"
        );
        announce(`${state.name} guide saved in this browser and downloaded as a file.`);
    }

    function renderOfflineGuides() {
        const list = document.getElementById("bd-offline-list");
        if (!list) return;
        const savedGuides = readStoredValue(stateStorageKey, []);
        const guides = Array.isArray(savedGuides) ? savedGuides : [];
        const validGuides = guides.filter(name => states.some(state => state.name === name));
        list.innerHTML = validGuides.length
            ? validGuides.map(name => `
                <li class="flex items-center justify-between gap-3">
                    <span>${escapeHtml(name)}</span>
                    <button class="bd-secondary" type="button" data-open-state="${escapeHtml(name)}">Read guide</button>
                </li>
            `).join("")
            : `<li>No saved guides yet. Open a state guide and choose “Save / download guide”.</li>`;
    }

    function openBooking(service, stateName) {
        const serviceSelect = document.getElementById("bd-booking-service");
        serviceSelect.value = services.some(item => item.value === service) ? service : "";
        if (states.some(state => state.name === stateName)) {
            document.getElementById("bd-booking-state").value = stateName;
        } else {
            document.getElementById("bd-booking-state").value = "";
        }
        renderBookingRequests();
        openDialog("bd-booking-modal");
    }

    function renderBookingRequests() {
        const list = document.getElementById("bd-booking-list");
        if (!list) return;
        const requests = readStoredValue(bookingStorageKey, []);
        if (!Array.isArray(requests)) {
            console.error("Saved trip request data was not a list.");
            list.innerHTML = "<li>Saved requests could not be read.</li>";
            return;
        }
        list.innerHTML = requests.length
            ? requests.slice().reverse().map(request => `
                <li>
                    <strong>${escapeHtml(serviceLabels[request.service] || "Trip request")} · ${escapeHtml(request.state)}</strong>
                    <span class="block mt-1">${escapeHtml(request.date)} · ${escapeHtml(request.travellers)} traveller(s)</span>
                    <span class="block mt-1 text-xs text-amber-800">Saved locally · waiting for provider confirmation</span>
                </li>
            `).join("")
            : "<li>No trip requests saved on this device.</li>";
    }

    const ecoPoints = { litter: 10, cleanup: 50, tree: 40, pledge: 20, report: 5 };
    const ecoLabels = {
        litter: "Disposed of litter at a tourist site",
        cleanup: "Joined a community clean-up",
        tree: "Joined a tree-planting activity",
        pledge: "Took the plastic-free trip pledge",
        report: "Reported a missing or overflowing dustbin"
    };

    function ecoLevel(points) {
        if (points >= 600) return "Green Ambassador";
        if (points >= 300) return "Eco Warrior";
        if (points >= 100) return "Eco Explorer";
        return "Green Starter";
    }

    function renderEcoWallet() {
        const pointsElement = document.getElementById("bd-eco-points");
        if (!pointsElement) return;
        const wallet = readStoredValue(ecoStorageKey, { points: 0, actions: [] });
        const validWallet = wallet && Number.isFinite(wallet.points) && Array.isArray(wallet.actions)
            ? wallet
            : { points: 0, actions: [] };
        if (validWallet !== wallet) console.error("Eco wallet data was invalid; displaying an empty wallet.");

        pointsElement.textContent = `${validWallet.points} points`;
        document.getElementById("bd-eco-level").textContent = ecoLevel(validWallet.points);
        const certificate = document.getElementById("bd-certificate");
        certificate.disabled = validWallet.points < 300;
        document.getElementById("bd-certificate-note").textContent = validWallet.points >= 300
            ? "Your demo wallet has reached the 300-point certificate level."
            : `${300 - validWallet.points} more points to unlock the demo certificate.`;

        const list = document.getElementById("bd-eco-list");
        list.innerHTML = validWallet.actions.length
            ? validWallet.actions.slice(-5).reverse().map(action => `
                <li>
                    <strong>${escapeHtml(ecoLabels[action.type] || "Eco action")} · +${escapeHtml(action.points)} points</strong>
                    <span class="block mt-1">${escapeHtml(action.location || "Place not added")} · ${escapeHtml(action.date)}</span>
                </li>
            `).join("")
            : "<li>No actions recorded yet. Choose an action to try the local demo wallet.</li>";
    }

    function localDayKey(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    }

    function recordEcoAction(form) {
        const formData = new FormData(form);
        const type = String(formData.get("action"));
        if (!Object.prototype.hasOwnProperty.call(ecoPoints, type)) {
            announce("Choose a valid Eco-Warrior action.");
            return;
        }
        const wallet = readStoredValue(ecoStorageKey, { points: 0, actions: [] });
        if (!wallet || !Number.isFinite(wallet.points) || !Array.isArray(wallet.actions)) {
            console.error("Eco wallet data was invalid; the new action was not recorded.");
            announce("Your saved Eco-Warrior data is invalid and could not be updated.");
            return;
        }
        const today = localDayKey(new Date());
        const actionsToday = wallet.actions.filter(action => action.date === today).length;
        if (actionsToday >= 10) {
            announce("Daily demo limit reached: up to 10 actions can be recorded per day.");
            return;
        }
        const points = ecoPoints[type];
        wallet.points += points;
        wallet.actions.push({
            type,
            points,
            location: String(formData.get("location") || "").trim(),
            date: today,
            status: "self-reported-demo"
        });
        if (!writeStoredValue(ecoStorageKey, wallet)) return;
        form.reset();
        renderEcoWallet();
        announce(`Demo action recorded: +${points} points. No independent verification was performed.`);
    }

    function downloadCertificate() {
        const wallet = readStoredValue(ecoStorageKey, { points: 0, actions: [] });
        if (!wallet || !Number.isFinite(wallet.points) || wallet.points < 300) {
            announce("The demo certificate unlocks at 300 points.");
            return;
        }
        const name = window.prompt("Name to display on your demo certificate:");
        if (name === null) return;
        const traveller = name.trim();
        if (!traveller) {
            announce("Enter a name to create the certificate.");
            return;
        }
        const level = ecoLevel(wallet.points);
        const certificate = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Bharat Darshan Eco-Warrior Demo Certificate</title>
<style>body{margin:0;padding:40px;background:#eef5ef;color:#17372d;font:16px Arial,sans-serif}.certificate{max-width:760px;margin:auto;padding:52px;border:10px double #0b7651;background:white;text-align:center}.label{color:#0b7651;font-weight:bold;letter-spacing:.2em;text-transform:uppercase}h1{font-size:38px}h2{font-size:30px}p{line-height:1.6}.note{margin-top:32px;font-size:12px;color:#60736a}</style>
<main class="certificate"><p class="label">Bharat Darshan · Eco-Warrior</p><h1>Certificate of Appreciation</h1>
<p>This local prototype certificate recognises</p><h2>${escapeHtml(traveller)}</h2>
<p>for recording ${wallet.points} demo points as a <strong>${escapeHtml(level)}</strong>.</p>
<p>Issued ${escapeHtml(new Date().toLocaleDateString())}</p>
<p class="note">Demo certificate only. Actions and points are self-reported and have not been independently verified.</p></main></html>`;
        downloadTextFile("bharat-darshan-eco-warrior-demo-certificate.html", certificate, "text/html;charset=utf-8");
    }

    function updateMapLink() {
        const stateName = document.getElementById("bd-map-state").value;
        const state = states.find(item => item.name === stateName);
        const searchTerm = state ? `${state.capital}, ${state.name}, India` : "India";
        document.getElementById("bd-map-link").href =
            `https://www.openstreetmap.org/search?query=${encodeURIComponent(searchTerm)}`;
    }

    function matchingStates(query) {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        if (normalizedQuery.length < 2) return [];
        return states.filter(state => [
            state.name,
            state.capital,
            ...state.destinations,
            ...state.featuredPlaces,
            ...state.temples,
            ...state.hiddenGems,
            ...state.activities,
            state.culture,
            state.heritage,
            state.food
        ].join(" ").toLocaleLowerCase().includes(normalizedQuery));
    }

    function renderSearchResults(query) {
        const results = document.getElementById("search-results");
        const matches = matchingStates(query);
        if (query.trim().length < 2) {
            results.innerHTML = `
                <p class="bd-note">Search all 28 state guides by place, festival, dish or activity.</p>
                <div class="space-y-3">
                    ${["Rajasthan", "Kerala", "Meghalaya"].map(name => `
                        <button class="w-full rounded-2xl bg-white p-4 text-left shadow-sm" type="button" data-search-state="${name}">
                            <strong class="block text-emerald-900">${name}</strong>
                            <span class="text-sm text-slate-600">Open state guide</span>
                        </button>
                    `).join("")}
                </div>
            `;
            return;
        }
        results.innerHTML = matches.length
            ? `<p class="text-sm text-slate-600">Found ${matches.length} state ${matches.length === 1 ? "guide" : "guides"}.</p>
                <div class="space-y-3">${matches.map(state => `
                    <button class="w-full rounded-2xl bg-white p-4 text-left shadow-sm" type="button" data-search-state="${escapeHtml(state.name)}">
                        <strong class="block text-emerald-900">${escapeHtml(state.name)}</strong>
                        <span class="text-sm text-slate-600">${escapeHtml(state.featuredPlaces.join(" · "))}</span>
                    </button>
                `).join("")}</div>`
            : `<p class="bd-note" role="status">No state guide matches “${escapeHtml(query)}”. Try a state, landmark, dish or festival.</p>`;
    }

    window.openBharatDirectory = function () {
        document.getElementById("bharat-directory").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.openBharatBookings = function (service, stateName) {
        openBooking(service, stateName);
    };
    window.openBharatCategory = openCategory;
    window.openBharatEco = function () {
        renderEcoWallet();
        openDialog("bd-eco-modal");
    };
    window.openBharatMaps = function () {
        renderOfflineGuides();
        updateMapLink();
        openDialog("bd-map-modal");
    };
    window.handleExplore = function (show = true) {
        if (show) window.openBharatDirectory();
        else document.getElementById("explore-modal").classList.remove("active");
    };
    window.handleBookNow = function (show = true) {
        if (show) openBooking("", activeState && activeState.name);
        else {
            const modal = document.getElementById("bd-booking-modal");
            if (!modal.hidden) closeDialog(modal);
        }
    };
    window.handleMaps = function (show = true) {
        if (show) window.openBharatMaps();
        else {
            const modal = document.getElementById("bd-map-modal");
            if (!modal.hidden) closeDialog(modal);
        }
    };
    window.handleMore = function () {
        document.getElementById("bd-services").scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.handleAlerts = function () {
        window.openBharatEco();
    };
    window.dynamicSearch = renderSearchResults;
    window.handleSearch = function (show = true) {
        const modal = document.getElementById("search-modal");
        modal.classList.toggle("active", show);
        document.body.classList.toggle("modal-open", show);
        if (show) {
            renderSearchResults("");
            document.getElementById("search-input").focus();
        } else {
            document.getElementById("search-input").value = "";
            renderSearchResults("");
        }
    };

    renderApp();
    document.getElementById("search-input").oninput =
        event => renderSearchResults(event.currentTarget.value);

    root.addEventListener("input", event => {
        if (event.target.id === "bd-state-filter") stateCards(event.target.value);
        if (event.target.id === "bd-category-search") {
            renderCategory(activeCategory, event.target.value);
        }
    });
    root.addEventListener("click", event => {
        const target = event.target.closest("button, a");
        if (!target) return;
        if (target.hasAttribute("data-close")) {
            closeDialog(target.closest(".bd-overlay"));
        } else if (target.dataset.openState) {
            openState(target.dataset.openState);
        } else if (target.dataset.book) {
            openBooking(target.dataset.book, activeState && activeState.name);
        } else if (target.dataset.statePlan) {
            openBooking("", target.dataset.statePlan);
        } else if (target.dataset.saveGuide) {
            saveGuide(target.dataset.saveGuide);
        } else if (target.dataset.stateMap) {
            document.getElementById("bd-map-state").value = target.dataset.stateMap;
            updateMapLink();
            renderOfflineGuides();
            openDialog("bd-map-modal");
        } else if (target.dataset.categoryState) {
            openState(target.dataset.categoryState);
        } else if (target.hasAttribute("data-open-map")) {
            window.openBharatMaps();
        } else if (target.hasAttribute("data-open-eco")) {
            window.openBharatEco();
        }
    });

    document.getElementById("search-modal").addEventListener("click", event => {
        const button = event.target.closest("[data-search-state]");
        if (!button) return;
        window.handleSearch(false);
        openState(button.dataset.searchState);
    });
    document.getElementById("bd-booking-form").addEventListener("submit", event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        const requests = readStoredValue(bookingStorageKey, []);
        if (!Array.isArray(requests)) {
            console.error("Saved trip request data was invalid; request was not saved.");
            announce("Saved trip requests could not be updated.");
            return;
        }
        requests.push({
            traveller: String(data.get("traveller")).trim(),
            service: String(data.get("service")),
            state: String(data.get("state")),
            date: String(data.get("date")),
            travellers: Number(data.get("travellers")),
            notes: String(data.get("notes") || "").trim(),
            createdAt: new Date().toISOString(),
            status: "local-planning-request"
        });
        if (!writeStoredValue(bookingStorageKey, requests)) return;
        renderBookingRequests();
        announce("Trip request saved on this device. A provider has not confirmed it.");
    });
    document.getElementById("bd-eco-form").addEventListener("submit", event => {
        event.preventDefault();
        recordEcoAction(event.currentTarget);
    });
    document.getElementById("bd-certificate").addEventListener("click", downloadCertificate);
    document.getElementById("bd-map-state").addEventListener("change", updateMapLink);
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        const openDialogElement = document.querySelector(".bd-overlay:not([hidden])");
        if (openDialogElement) closeDialog(openDialogElement);
    });

})();
