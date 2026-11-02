(function () {
    "use strict";

    const states = window.BHARAT_STATES;
    if (!Array.isArray(states) || states.length !== 28) {
        console.error("Landmark photos could not load because the state catalogue is unavailable.");
        window.BHARAT_LANDMARKS = [];
        return;
    }

    const landmarks = states.map(state => ({
        state: state.name,
        place: state.featuredPlaces[0],
        image: "",
        attribution: "",
        license: "",
        licenseUrl: "",
        sourceUrl: ""
    }));
    const templeLandmarks = states.map(state => ({
        state: state.name,
        place: state.temples[0],
        image: "",
        attribution: "",
        license: "",
        licenseUrl: "",
        sourceUrl: ""
    }));
    const tourScenes = states.map((state, index) => ({
        state: state.name,
        place: state.featuredPlaces[0],
        temple: state.temples[0],
        kind: "Featured place",
        image: "",
        video: "",
        attribution: "",
        license: "",
        licenseUrl: "",
        sourceUrl: "",
        hue: (142 + index * 47) % 360
    }));
    window.BHARAT_LANDMARKS = landmarks;
    window.BHARAT_TEMPLE_LANDMARKS = templeLandmarks;
    window.BHARAT_TOUR_SCENES = tourScenes;
    const mediaCacheKey = "bharat-darshan:licensed-landmark-media";
    const genericVideoWords = new Set([
        "india", "temple", "temples", "fort", "forts", "national", "park", "parks",
        "cave", "caves", "lake", "river", "island", "valley", "falls", "fall",
        "waterfall", "heritage", "site", "sites", "monument", "monuments", "group",
        "complex", "city", "old", "new", "hill", "hills", "beach", "beaches",
        "sri", "shri", "sree", "shree", "maha", "devi", "jain", "buddhist",
        "temple", "and", "with", "from", "the", "for", "of"
    ]);
    const featuredPhotoOverrides = new Map([
        ["Andhra Pradesh", {
            image: "https://upload.wikimedia.org/wikipedia/commons/0/08/Front_view_of_Nandi%2C_at_Lepakshi.jpg",
            attribution: "Anupam Chatterjee",
            license: "CC BY-SA 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
            sourceUrl: "https://commons.wikimedia.org/wiki/File:Front_view_of_Nandi,_at_Lepakshi.jpg"
        }]
    ]);

    function restoreCachedPhotos() {
        try {
            const cached = JSON.parse(localStorage.getItem(mediaCacheKey) || "null");
            if (!cached || cached.version !== 1) return;
            for (const [target, records] of [
                [landmarks, cached.featured],
                [templeLandmarks, cached.temples]
            ]) {
                const byState = new Map((records || []).map(record => [record.state, record]));
                target.forEach(record => {
                    const saved = byState.get(record.state);
                    if (saved?.image && saved.sourceUrl && saved.license) {
                        Object.assign(record, saved);
                    }
                });
            }
            const savedVideos = new Map((cached.videos || []).map(record => [record.state, record]));
            if (cached.videoVersion === 2) tourScenes.forEach(scene => {
                const saved = savedVideos.get(scene.state);
                if (saved?.video && saved.sourceUrl && saved.license) {
                    Object.assign(scene, saved);
                }
            });
        } catch (error) {
            console.warn("Saved landmark images could not be restored from this browser.", error);
        }
    }

    function cacheMedia() {
        try {
            localStorage.setItem(mediaCacheKey, JSON.stringify({
                version: 1,
                videoVersion: 2,
                featured: landmarks.filter(item => item.image),
                temples: templeLandmarks.filter(item => item.image),
                videos: tourScenes.filter(item => item.video)
            }));
        } catch (error) {
            console.warn("Landmark images could not be cached in this browser.", error);
        }
    }

    restoreCachedPhotos();
    landmarks.forEach(landmark => {
        const override = featuredPhotoOverrides.get(landmark.state);
        if (override) Object.assign(landmark, override);
    });
    tourScenes.forEach(scene => {
        const photo = landmarks.find(item => item.state === scene.state);
        if (photo?.image) scene.image = photo.image;
    });

    async function commonsJson(params) {
        let lastError;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            try {
                const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
                if (response.status === 429 || response.status >= 500) {
                    const retryAfter = Number(response.headers.get("Retry-After")) || attempt + 1;
                    await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter * 1000, 8000)));
                    continue;
                }
                if (!response.ok) {
                    throw new Error(`Wikimedia Commons returned HTTP ${response.status}.`);
                }
                return await response.json();
            } catch (error) {
                lastError = error;
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
            }
        }
        throw lastError || new Error("Wikimedia Commons could not be reached after retries.");
    }

    function cleanMetadata(value) {
        return String(value || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&quot;/g, "\"")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .trim();
    }

    async function findLandmarkPhoto(state, landmark, searchTerm) {
        if (featuredPhotoOverrides.has(landmark.state) && landmark.place === state.featuredPlaces[0]) return;
        const searchTerms = [searchTerm];
        for (const term of [...new Set(searchTerms)]) {
            const params = new URLSearchParams({
                action: "query",
                generator: "search",
                gsrsearch: term,
                gsrnamespace: "6",
                gsrwhat: "text",
                gsrlimit: "10",
                prop: "imageinfo",
                iiprop: "url|extmetadata",
                iiurlwidth: "1200",
                format: "json",
                origin: "*"
            });
            const data = await commonsJson(params);
            const candidates = Object.values(data.query?.pages || [])
                .map(page => {
                    const info = page.imageinfo?.[0];
                    if (!info?.thumburl || !info.descriptionurl) return null;
                    const title = page.title.replace(/^File:/, "");
                    const metadata = info.extmetadata || {};
                    if (/\b(logo|map|diagram|icon|flag|info board|poster)\b/i.test(title)) return null;
                    const lowerTitle = title.toLocaleLowerCase();
                    const words = term.toLocaleLowerCase().match(/[a-z]{4,}/g) || [];
                    const matches = words.filter(word => lowerTitle.includes(word)).length;
                    const ratio = info.thumbwidth / info.thumbheight;
                    return {
                        image: info.thumburl,
                        sourceUrl: info.descriptionurl,
                        attribution: cleanMetadata(metadata.Artist?.value || metadata.Credit?.value || "Wikimedia Commons contributor"),
                        license: cleanMetadata(metadata.LicenseShortName?.value || "See source page"),
                        licenseUrl: metadata.LicenseUrl?.value || info.descriptionurl,
                        score: matches * 10 + Math.max(0, 4 - Math.abs(ratio - 1.6) * 3)
                    };
                })
                .filter(Boolean)
                .sort((first, second) => second.score - first.score);
            if (candidates.length) {
                Object.assign(landmark, candidates[0]);
                return;
            }
        }
        throw new Error(`No suitable Commons photo was found for ${landmark.place}.`);
    }

    async function findTourVideo(scene, state) {
        const terms = [...new Set([
            scene.place,
            scene.temple,
            ...state.destinations,
            ...state.hiddenGems,
            ...state.culture.split(/,| and /i).map(item => item.trim()).filter(item => item.length >= 6)
        ])];
        for (const term of terms) {
            const params = new URLSearchParams({
                action: "query",
                generator: "search",
                gsrsearch: `${term} filetype:video`,
                gsrnamespace: "6",
                gsrwhat: "text",
                gsrlimit: "10",
                prop: "imageinfo",
                iiprop: "url|extmetadata",
                iiurlwidth: "900",
                format: "json",
                origin: "*"
            });
            const data = await commonsJson(params);
            const words = (term.toLocaleLowerCase().match(/[a-z]{4,}/g) || [])
                .filter(word => !genericVideoWords.has(word));
            const candidates = Object.values(data.query?.pages || [])
                .map(page => {
                    const info = page.imageinfo?.[0];
                    const title = page.title.replace(/^File:/, "");
                    if (!info?.url || !/\.(webm|ogv|mp4|mov)$/i.test(title)) return null;
                    const metadata = info.extmetadata || {};
                    const lowerTitle = title.toLocaleLowerCase();
                    const matches = words.filter(word => lowerTitle.includes(word)).length;
                    return {
                        video: info.url,
                        image: info.thumburl || "",
                        attribution: cleanMetadata(metadata.Artist?.value || metadata.Credit?.value || "Wikimedia Commons contributor"),
                        license: cleanMetadata(metadata.LicenseShortName?.value || "See source page"),
                        licenseUrl: metadata.LicenseUrl?.value || info.descriptionurl,
                        sourceUrl: info.descriptionurl,
                        score: matches,
                        matchedPlace: term
                    };
                })
                .filter(candidate => candidate && candidate.score > 0)
                .sort((first, second) => second.score - first.score);
            if (candidates.length) {
                Object.assign(scene, candidates[0], {
                    place: term,
                    kind: state.temples.includes(term)
                        ? "Temple & sacred site"
                        : state.hiddenGems.includes(term)
                            ? "Hidden gem"
                            : state.featuredPlaces.includes(term) || state.destinations.includes(term)
                                ? "Featured place"
                                : "Living culture"
                });
                cacheMedia();
                return;
            }
        }
    }

    async function loadTourVideos() {
        const scenes = [...tourScenes];
        const failures = [];
        for (let start = 0; start < scenes.length; start += 2) {
            const batch = scenes.slice(start, start + 2);
            const results = await Promise.allSettled(batch.map(scene =>
                findTourVideo(scene, states.find(state => state.name === scene.state))
            ));
            results.forEach((result, offset) => {
                if (result.status === "rejected") {
                    failures.push({ place: batch[offset].place, reason: result.reason });
                }
            });
            cacheMedia();
            window.dispatchEvent(new CustomEvent("bharat-tour-scenes-updated"));
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        if (failures.length) {
            console.error("Some state travel clips could not be searched:", failures);
        }
    }

    async function loadLandmarkPhotos() {
        const failures = [];
        for (let start = 0; start < states.length; start += 2) {
            const batch = states.slice(start, start + 2);
            const results = await Promise.allSettled(batch.flatMap((state, offset) => [
                findLandmarkPhoto(state, landmarks[start + offset], state.featuredPlaces[0]),
                findLandmarkPhoto(state, templeLandmarks[start + offset], state.temples[0])
            ]));
            results.forEach((result, offset) => {
                if (result.status === "rejected") {
                    failures.push({
                        state: batch[Math.floor(offset / 2)].name,
                        type: offset % 2 === 0 ? "featured place" : "temple",
                        reason: result.reason
                    });
                }
            });
            cacheMedia();
            const photosByState = new Map(landmarks.map(item => [item.state, item]));
            tourScenes.forEach(scene => {
                const photo = photosByState.get(scene.state);
                if (photo?.image && !scene.image) scene.image = photo.image;
            });
            window.dispatchEvent(new CustomEvent("bharat-landmarks-updated"));
        }
        if (failures.length) {
            console.error("Some state landmark photos could not be loaded:", failures);
        }
    }

    window.BHARAT_LANDMARKS_READY = loadLandmarkPhotos();
    window.BHARAT_TOUR_VIDEOS_READY = loadTourVideos();
})();
