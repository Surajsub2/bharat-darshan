(function () {
    "use strict";

    const databaseName = "bharat-darshan-offline-database";
    const databaseVersion = 1;
    const localStorageKeys = {
        guides: "bharat-darshan:offline-guides",
        bookings: "bharat-darshan:trip-requests",
        ecoWallet: "bharat-darshan:eco-wallet"
    };
    const services = [
        { value: "stay", name: "Find a stay", detail: "Hotels, lodges and heritage stays" },
        { value: "restaurant", name: "Eat local", detail: "Restaurants and regional food" },
        { value: "vehicle", name: "Book a ride", detail: "Taxi, sedan, SUV or traveller" },
        { value: "rental", name: "Rent a vehicle", detail: "Bike, scooter or self-drive car" },
        { value: "guide", name: "Meet a local guide", detail: "Heritage, wildlife, trekking and food" },
        { value: "package", name: "Explore packages", detail: "Spiritual, nature and adventure trips" }
    ];

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
        });
    }

    function transactionComplete(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted."));
            transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
        });
    }

    function openDatabase() {
        if (!window.indexedDB) {
            return Promise.reject(new Error("This browser does not support IndexedDB."));
        }

        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(databaseName, databaseVersion);
            request.onupgradeneeded = () => {
                const database = request.result;
                const transaction = request.transaction;
                const stores = [
                    ["states", "name"],
                    ["services", "value"],
                    ["bookings", "id"],
                    ["ecoActions", "id"],
                    ["offlineGuides", "state"],
                    ["metadata", "key"]
                ];

                stores.forEach(([name, keyPath]) => {
                    if (!database.objectStoreNames.contains(name)) {
                        database.createObjectStore(name, { keyPath });
                    }
                });

                if (!database.objectStoreNames.contains("bookings")) return;
                const bookings = transaction.objectStore("bookings");
                if (!bookings.indexNames.contains("byState")) bookings.createIndex("byState", "state");
                if (!bookings.indexNames.contains("byService")) bookings.createIndex("byService", "service");
                if (!bookings.indexNames.contains("byCreatedAt")) bookings.createIndex("byCreatedAt", "createdAt");
                const actions = transaction.objectStore("ecoActions");
                if (!actions.indexNames.contains("byDate")) actions.createIndex("byDate", "date");
                if (!actions.indexNames.contains("byType")) actions.createIndex("byType", "type");
            };
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => database.close();
                resolve(database);
            };
            request.onerror = () => reject(request.error || new Error("Could not open the Bharat Darshan database."));
            request.onblocked = () => reject(new Error("The Bharat Darshan database upgrade is blocked by another open tab."));
        });
    }

    function writeSnapshot(database, key, value) {
        const stores = ["bookings", "ecoActions", "offlineGuides", "metadata"];
        const transaction = database.transaction(stores, "readwrite");
        const bookings = transaction.objectStore("bookings");
        const actions = transaction.objectStore("ecoActions");
        const guides = transaction.objectStore("offlineGuides");
        const metadata = transaction.objectStore("metadata");
        const completion = transactionComplete(transaction);

        if (key === localStorageKeys.bookings) {
            bookings.clear();
            if (Array.isArray(value)) {
                value.forEach((booking, index) => {
                    if (!booking || typeof booking !== "object") return;
                    bookings.put({
                        ...booking,
                        id: booking.id || `${booking.createdAt || "booking"}-${index}`
                    });
                });
            }
        } else if (key === localStorageKeys.ecoWallet) {
            actions.clear();
            if (value && Array.isArray(value.actions)) {
                value.actions.forEach((action, index) => {
                    if (!action || typeof action !== "object") return;
                    actions.put({
                        ...action,
                        id: action.id || `${action.date || "action"}-${index}`
                    });
                });
            }
            metadata.put({
                key: "eco-wallet",
                points: Number.isFinite(value && value.points) ? value.points : 0,
                updatedAt: new Date().toISOString()
            });
        } else if (key === localStorageKeys.guides) {
            guides.clear();
            const statesByName = new Map(
                (Array.isArray(window.BHARAT_STATES) ? window.BHARAT_STATES : [])
                    .map(state => [state.name, state])
            );
            if (Array.isArray(value)) {
                value.forEach(name => {
                    const state = statesByName.get(name);
                    if (state) {
                        guides.put({
                            state: name,
                            guide: state,
                            savedAt: new Date().toISOString()
                        });
                    }
                });
            }
        }

        return completion;
    }

    function seedDatabase(database) {
        if (!Array.isArray(window.BHARAT_STATES) || window.BHARAT_STATES.length !== 28) {
            return Promise.reject(new Error("The 28-state catalogue is not available to seed the database."));
        }

        const transaction = database.transaction(["states", "services", "metadata"], "readwrite");
        const stateStore = transaction.objectStore("states");
        const serviceStore = transaction.objectStore("services");
        const metadata = transaction.objectStore("metadata");
        const completion = transactionComplete(transaction);

        window.BHARAT_STATES.forEach(state => stateStore.put(state));
        services.forEach(service => serviceStore.put(service));
        metadata.put({
            key: "database",
            appId: "bharat-darshan",
            schemaVersion: databaseVersion,
            stateCount: window.BHARAT_STATES.length,
            updatedAt: new Date().toISOString()
        });
        return completion;
    }

    function importLegacyData(database) {
        return Promise.all(Object.entries(localStorageKeys).map(async ([name, key]) => {
            let stored;
            try {
                stored = window.localStorage.getItem(key);
            } catch (error) {
                console.error(`Could not access local browser data for ${name}.`, error);
                return;
            }
            if (stored === null) return;
            let value;
            try {
                value = JSON.parse(stored);
            } catch (error) {
                console.error(`Could not migrate invalid local data for ${name}.`, error);
                return;
            }
            await writeSnapshot(database, key, value);
        }));
    }

    const ready = openDatabase().then(async database => {
        await seedDatabase(database);
        await importLegacyData(database);
        return database;
    });

    window.BharatDatabase = {
        name: databaseName,
        ready,
        saveSnapshot(key, value) {
            if (!Object.values(localStorageKeys).includes(key)) {
                return Promise.reject(new Error(`Unknown Bharat Darshan data collection: ${key}`));
            }
            return ready.then(database => writeSnapshot(database, key, value));
        },
        async getCounts() {
            const database = await ready;
            const transaction = database.transaction(
                ["states", "services", "bookings", "ecoActions", "offlineGuides"],
                "readonly"
            );
            const completion = transactionComplete(transaction);
            const counts = await Promise.all(
                ["states", "services", "bookings", "ecoActions", "offlineGuides"].map(name =>
                    requestResult(transaction.objectStore(name).count())
                )
            );
            await completion;
            return Object.fromEntries(
                ["states", "services", "bookings", "ecoActions", "offlineGuides"]
                    .map((name, index) => [name, counts[index]])
            );
        }
    };
})();
