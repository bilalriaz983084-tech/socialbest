const express = require("express");
const router = express.Router();
const axios = require("axios");
const cheerio = require("cheerio");

// ============================================================
// CONFIG
// ============================================================

const REQUEST_TIMEOUT = 12000;

const DESKTOP_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/128.0.0.0 Safari/537.36";

const FB_HEADERS = {
    "User-Agent": DESKTOP_UA,
    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
};

// ============================================================
// STATUS
// ============================================================

router.get("/status", (req, res) => {
    res.json({
        platform: "Facebook",
        status: "Connected",
        timestamp: new Date().toISOString(),
    });
});

// ============================================================
// BASIC HELPERS
// ============================================================

function cleanUrl(url) {
    if (!url) return "";

    return String(url)
        .trim()
        .replace(/^['"]+|['"]+$/g, "")
        .replace(/\\u0025/g, "%")
        .replace(/\\u0026/g, "&")
        .replace(/\\u003D/g, "=")
        .replace(/\\\//g, "/");
}

function decodeFacebookUrl(url) {
    let value = cleanUrl(url);

    for (let i = 0; i < 3; i++) {
        try {
            const decoded = decodeURIComponent(value);

            if (decoded === value) break;

            value = decoded;
        } catch (_) {
            break;
        }
    }

    return value;
}

function normalizeMediaUrl(url) {
    if (!url) return null;

    let value = decodeFacebookUrl(url);

    value = value
        .replace(/&amp;/gi, "&")
        .replace(/\\u0026/g, "&")
        .replace(/\\u003A/g, ":")
        .replace(/\\u002F/g, "/")
        .replace(/\\u003F/g, "?")
        .replace(/\\u003D/g, "=")
        .replace(/\\u0025/g, "%")
        .replace(/\\\//g, "/");

    // Remove accidental wrapping quotes
    value = value.replace(/^["']|["']$/g, "");

    if (
        !value.startsWith("http://") &&
        !value.startsWith("https://")
    ) {
        return null;
    }

    return value;
}

function isFacebookMediaUrl(url) {
    if (!url) return false;

    const value = String(url).toLowerCase();

    return (
        value.includes("video") ||
        value.includes("fbcdn.net") ||
        value.includes("facebook.com") ||
        value.includes("scontent")
    );
}

function isLikelyVideoUrl(url) {
    if (!url) return false;

    const value = String(url).toLowerCase();

    return (
        value.includes(".mp4") ||
        value.includes("video") ||
        value.includes("playable_url") ||
        value.includes("browser_native") ||
        value.includes("scontent")
    );
}

// ============================================================
// URL RESOLVER
// ============================================================

async function resolveFacebookUrl(inputUrl) {
    const original = cleanUrl(inputUrl);

    if (!original) return "";

    console.log("[Facebook] Resolving:", original);

    try {
        const response = await axios.get(original, {
            headers: FB_HEADERS,
            maxRedirects: 10,
            timeout: REQUEST_TIMEOUT,
            validateStatus: (status) =>
                status >= 200 && status < 400,
        });

        let finalUrl = "";

        // Axios redirect URL
        if (response.request?.res?.responseUrl) {
            finalUrl = response.request.res.responseUrl;
        }

        // Node URL fallback
        if (!finalUrl && response.request?.responseURL) {
            finalUrl = response.request.responseURL;
        }

        if (finalUrl) {
            finalUrl = cleanUrl(finalUrl);

            if (
                finalUrl.includes("facebook.com") ||
                finalUrl.includes("fb.watch")
            ) {
                console.log("[Facebook] Redirect URL:", finalUrl);
            }
        }

        const html =
            typeof response.data === "string"
                ? response.data
                : "";

        // OG URL
        try {
            const $ = cheerio.load(html);

            const ogUrl =
                $('meta[property="og:url"]').attr("content") ||
                $('meta[name="og:url"]').attr("content");

            if (ogUrl) {
                const normalized = cleanUrl(ogUrl);

                if (
                    normalized.includes("facebook.com") &&
                    !normalized.includes("/share/")
                ) {
                    console.log(
                        "[Facebook] OG canonical:",
                        normalized
                    );

                    return normalized.split("#")[0];
                }
            }
        } catch (_) {}

        if (
            finalUrl &&
            !finalUrl.includes("/share/") &&
            !finalUrl.includes("fb.watch")
        ) {
            return finalUrl.split("#")[0];
        }
    } catch (err) {
        console.log(
            "[Facebook] Resolve failed:",
            err.message
        );
    }

    return original.split("?")[0];
}

// ============================================================
// FETCH FACEBOOK PAGE
// ============================================================

async function fetchFacebookPage(url) {
    try {
        const response = await axios.get(url, {
            headers: FB_HEADERS,
            timeout: REQUEST_TIMEOUT,
            maxRedirects: 10,
            responseType: "text",
            validateStatus: (status) =>
                status >= 200 && status < 400,
        });

        return {
            html:
                typeof response.data === "string"
                    ? response.data
                    : "",
            finalUrl:
                response.request?.res?.responseUrl ||
                response.request?.responseURL ||
                url,
        };
    } catch (err) {
        console.log(
            "[Facebook] Page fetch failed:",
            err.message
        );

        return {
            html: "",
            finalUrl: url,
        };
    }
}

// ============================================================
// EXTRACT URLS FROM TEXT
// ============================================================

function extractUrlsFromText(text) {
    const results = [];

    if (!text) return results;

    const source = String(text);

    // Normal URLs
    const normalRegex =
        /https?:\/\/[^"'\\\s<>]+/gi;

    const matches = source.match(normalRegex) || [];

    for (const match of matches) {
        const url = normalizeMediaUrl(match);

        if (url && isFacebookMediaUrl(url)) {
            results.push(url);
        }
    }

    // Escaped URLs
    const escapedRegex =
        /https?:\\\/\\\/[^"'\\\s<>]+/gi;

    const escaped = source.match(escapedRegex) || [];

    for (const match of escaped) {
        const url = normalizeMediaUrl(match);

        if (url && isFacebookMediaUrl(url)) {
            results.push(url);
        }
    }

    return [...new Set(results)];
}

// ============================================================
// REGEX MEDIA EXTRACTION
// ============================================================

function extractFacebookMediaFromHTML(html) {
    const candidates = [];

    if (!html) return candidates;

    const patterns = [
        // Current/common Facebook fields
        /"browser_native_hd_url"\s*:\s*"([^"]+)"/gi,
        /"browser_native_sd_url"\s*:\s*"([^"]+)"/gi,

        /"playable_url_quality_hd"\s*:\s*"([^"]+)"/gi,
        /"playable_url_quality_sd"\s*:\s*"([^"]+)"/gi,

        /"playable_url"\s*:\s*"([^"]+)"/gi,
        /"playable_url_dash"\s*:\s*"([^"]+)"/gi,

        /"hd_src"\s*:\s*"([^"]+)"/gi,
        /"sd_src"\s*:\s*"([^"]+)"/gi,

        /"hd_url"\s*:\s*"([^"]+)"/gi,
        /"sd_url"\s*:\s*"([^"]+)"/gi,

        /"video_url"\s*:\s*"([^"]+)"/gi,

        // Generic MP4 URLs
        /"(https?:[^"]+?\.mp4[^"]*)"/gi,

        // Escaped MP4
        /(https?:\\\/\\\/[^"' ]+?\.mp4[^"' ]*)/gi,
    ];

    for (const regex of patterns) {
        let match;

        while ((match = regex.exec(html)) !== null) {
            const url = normalizeMediaUrl(match[1]);

            if (url && isLikelyVideoUrl(url)) {
                candidates.push(url);
            }
        }
    }

    // Also scan complete HTML for URLs
    candidates.push(...extractUrlsFromText(html));

    return [...new Set(candidates)];
}

// ============================================================
// JSON / SCRIPT EXTRACTION
// ============================================================

function extractJsonObjects(html) {
    const objects = [];

    if (!html) return objects;

    const scriptRegex =
        /<script[^>]*>([\s\S]*?)<\/script>/gi;

    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        const content = match[1];

        if (!content) continue;

        // JSON-looking scripts
        if (
            content.includes("playable_url") ||
            content.includes("browser_native") ||
            content.includes("videoData") ||
            content.includes("video_url")
        ) {
            objects.push(content);
        }
    }

    return objects;
}

// ============================================================
// THUMBNAIL EXTRACTION
// ============================================================

function extractThumbnail(html) {
    if (!html) return null;

    const patterns = [
        /"preferred_thumbnail"\s*:\s*\{\s*"image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/i,

        /"thumbnail"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/i,

        /"thumbnail_url"\s*:\s*"([^"]+)"/i,

        /"image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/i,

        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,

        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    ];

    for (const regex of patterns) {
        const match = html.match(regex);

        if (match && match[1]) {
            const url = normalizeMediaUrl(match[1]);

            if (url) return url;
        }
    }

    return null;
}

// ============================================================
// TITLE EXTRACTION
// ============================================================

function extractTitle(html) {
    if (!html) return "Facebook Video";

    try {
        const $ = cheerio.load(html);

        const ogTitle =
            $('meta[property="og:title"]').attr("content");

        if (ogTitle) return ogTitle.trim();

        const title = $("title").text();

        if (title) return title.trim();
    } catch (_) {}

    return "Facebook Video";
}

// ============================================================
// SORT BEST VIDEO
// ============================================================

function scoreVideoUrl(url) {
    let score = 0;

    const value = String(url).toLowerCase();

    if (
        value.includes("browser_native_hd_url") ||
        value.includes("playable_url_quality_hd")
    ) {
        score += 100;
    }

    if (value.includes(".mp4")) {
        score += 50;
    }

    if (value.includes("hd")) {
        score += 20;
    }

    if (value.includes("sd")) {
        score -= 10;
    }

    if (value.includes("scontent")) {
        score += 10;
    }

    return score;
}

function chooseBestVideo(candidates) {
    if (!candidates || !candidates.length) {
        return null;
    }

    const cleanCandidates = [
        ...new Set(
            candidates
                .map(normalizeMediaUrl)
                .filter(Boolean)
        ),
    ];

    cleanCandidates.sort(
        (a, b) => scoreVideoUrl(b) - scoreVideoUrl(a)
    );

    return cleanCandidates[0] || null;
}

// ============================================================
// VALIDATE MEDIA URL
// ============================================================

async function validateMediaUrl(url) {
    if (!url) return false;

    try {
        const response = await axios.head(url, {
            headers: {
                "User-Agent": DESKTOP_UA,
                Referer: "https://www.facebook.com/",
            },
            timeout: 7000,
            maxRedirects: 5,
            validateStatus: () => true,
        });

        if (response.status >= 200 && response.status < 400) {
            return true;
        }

        // Some CDN URLs reject HEAD
        if (response.status === 403 || response.status === 405) {
            const getResponse = await axios.get(url, {
                headers: {
                    "User-Agent": DESKTOP_UA,
                    Referer: "https://www.facebook.com/",
                    Range: "bytes=0-1024",
                },
                responseType: "stream",
                timeout: 7000,
                maxRedirects: 5,
                validateStatus: () => true,
            });

            if (
                getResponse.status >= 200 &&
                getResponse.status < 400
            ) {
                getResponse.data.destroy();
                return true;
            }

            getResponse.data.destroy();
        }
    } catch (_) {}

    return false;
}

// ============================================================
// ENGINE 1 - FACEBOOK PAGE
// ============================================================

async function facebookPageEngine(url) {
    console.log("[Facebook] Engine 1: Facebook HTML");

    const page = await fetchFacebookPage(url);

    if (!page.html) {
        return {
            video: null,
            thumbnail: null,
            title: "Facebook Video",
        };
    }

    let candidates = [];

    // Main HTML
    candidates.push(
        ...extractFacebookMediaFromHTML(page.html)
    );

    // Scripts
    const scripts = extractJsonObjects(page.html);

    for (const script of scripts) {
        candidates.push(
            ...extractFacebookMediaFromHTML(script)
        );

        candidates.push(
            ...extractUrlsFromText(script)
        );
    }

    // Search JSON escaped data
    candidates = candidates.map(normalizeMediaUrl).filter(Boolean);

    candidates = [...new Set(candidates)];

    console.log(
        `[Facebook] Engine 1 candidates: ${candidates.length}`
    );

    const thumbnail =
        extractThumbnail(page.html);

    const title =
        extractTitle(page.html);

    const best =
        chooseBestVideo(candidates);

    if (best) {
        console.log(
            "[Facebook] Engine 1 found video"
        );

        return {
            video: best,
            thumbnail,
            title,
        };
    }

    return {
        video: null,
        thumbnail,
        title,
    };
}

// ============================================================
// ENGINE 2 - SIPUTZX
// ============================================================

async function siputzxEngine(url) {
    console.log("[Facebook] Engine 2: Siputzx");

    try {
        const endpoint =
            "https://api.siputzx.my.id/api/d/facebook?url=" +
            encodeURIComponent(url);

        const response = await axios.get(endpoint, {
            timeout: 10000,
            headers: {
                "User-Agent": DESKTOP_UA,
                Accept: "application/json",
            },
        });

        const data = response.data;

        const candidates = [];

        if (data) {
            candidates.push(
                data?.data?.hd,
                data?.data?.sd,
                data?.data?.video,
                data?.data?.url,
                data?.hd,
                data?.sd,
                data?.video,
                data?.url
            );

            if (Array.isArray(data?.data)) {
                for (const item of data.data) {
                    candidates.push(
                        item?.hd,
                        item?.sd,
                        item?.video,
                        item?.url
                    );
                }
            }
        }

        const video = chooseBestVideo(
            candidates.filter(Boolean)
        );

        if (video) {
            console.log(
                "[Facebook] Engine 2 found video"
            );

            return {
                video,
                thumbnail:
                    data?.data?.thumbnail ||
                    data?.thumbnail ||
                    null,
            };
        }
    } catch (err) {
        console.log(
            "[Facebook] Siputzx failed:",
            err.message
        );
    }

    return {
        video: null,
        thumbnail: null,
    };
}

// ============================================================
// ENGINE 3 - WIDIPE
// ============================================================

async function widipeEngine(url) {
    console.log("[Facebook] Engine 3: Widipe");

    try {
        const endpoint =
            "https://widipe.com/download/fb?url=" +
            encodeURIComponent(url);

        const response = await axios.get(endpoint, {
            timeout: 10000,
            headers: {
                "User-Agent": DESKTOP_UA,
                Accept: "application/json,text/plain,*/*",
            },
        });

        const result =
            response.data?.result ||
            response.data?.data ||
            response.data;

        const candidates = [
            result?.hd,
            result?.sd,
            result?.video,
            result?.url,
            result?.downloadUrl,
        ];

        const video = chooseBestVideo(
            candidates.filter(Boolean)
        );

        if (video) {
            console.log(
                "[Facebook] Engine 3 found video"
            );

            return {
                video,
                thumbnail:
                    result?.thumbnail ||
                    result?.thumb ||
                    null,
            };
        }
    } catch (err) {
        console.log(
            "[Facebook] Widipe failed:",
            err.message
        );
    }

    return {
        video: null,
        thumbnail: null,
    };
}

// ============================================================
// TRY BOTH ORIGINAL + RESOLVED URL
// ============================================================

async function extractFacebookVideo(originalUrl, resolvedUrl) {
    const urls = [
        originalUrl,
        resolvedUrl,
    ].filter(Boolean);

    const uniqueUrls = [...new Set(urls)];

    let thumbnail = null;
    let title = "Facebook Video";

    // --------------------------------------------------------
    // ENGINE 1
    // --------------------------------------------------------

    for (const url of uniqueUrls) {
        const result =
            await facebookPageEngine(url);

        if (result.thumbnail) {
            thumbnail = result.thumbnail;
        }

        if (result.title) {
            title = result.title;
        }

        if (result.video) {
            return {
                video: result.video,
                thumbnail:
                    result.thumbnail || thumbnail,
                title,
            };
        }
    }

    // --------------------------------------------------------
    // ENGINE 2
    // --------------------------------------------------------

    for (const url of uniqueUrls) {
        const result =
            await siputzxEngine(url);

        if (result.thumbnail) {
            thumbnail = result.thumbnail;
        }

        if (result.video) {
            return {
                video: result.video,
                thumbnail,
                title,
            };
        }
    }

    // --------------------------------------------------------
    // ENGINE 3
    // --------------------------------------------------------

    for (const url of uniqueUrls) {
        const result =
            await widipeEngine(url);

        if (result.thumbnail) {
            thumbnail = result.thumbnail;
        }

        if (result.video) {
            return {
                video: result.video,
                thumbnail,
                title,
            };
        }
    }

    return {
        video: null,
        thumbnail,
        title,
    };
}

// ============================================================
// DOWNLOAD ROUTE
// ============================================================

router.post("/download", async (req, res) => {
    const rawUrl =
        req.body?.url ||
        req.body?.link ||
        req.body?.videoUrl ||
        req.query?.url;

    if (!rawUrl) {
        return res.status(400).json({
            success: false,
            error: "Facebook URL is required",
        });
    }

    const originalUrl = cleanUrl(rawUrl);

    if (!originalUrl) {
        return res.status(400).json({
            success: false,
            error: "Invalid Facebook URL",
        });
    }

    console.log(
        "[Facebook] Incoming URL:",
        originalUrl
    );

    try {
        // ====================================================
        // RESOLVE SHARE / WATCH
        // ====================================================

        let resolvedUrl = originalUrl;

        if (
            originalUrl.includes("/share/") ||
            originalUrl.includes("fb.watch")
        ) {
            resolvedUrl =
                await resolveFacebookUrl(originalUrl);
        } else {
            resolvedUrl =
                originalUrl.split("?")[0];
        }

        console.log(
            "[Facebook] Resolved URL:",
            resolvedUrl
        );

        // ====================================================
        // EXTRACTION
        // ====================================================

        const result =
            await extractFacebookVideo(
                originalUrl,
                resolvedUrl
            );

        if (!result.video) {
            console.log(
                "[Facebook] No downloadable video found"
            );

            return res.status(400).json({
                success: false,
                error:
                    "Facebook video stream could not be extracted. The video may be private, login-required, region-restricted, or Facebook may have changed its page format.",
            });
        }

        // ====================================================
        // OPTIONAL VALIDATION
        // ====================================================

        let valid = false;

        try {
            valid =
                await validateMediaUrl(
                    result.video
                );
        } catch (_) {}

        // Do NOT reject solely because CDN blocks HEAD.
        // Facebook CDN URLs can sometimes reject HEAD while
        // remaining usable for normal browser downloads.

        console.log(
            "[Facebook] Video extracted:",
            valid ? "validated" : "not HEAD validated"
        );

        // ====================================================
        // RESPONSE
        // ====================================================

        const thumbnail =
            result.thumbnail ||
            result.video;

        return res.json({
            success: true,

            platform: "Facebook",

            title:
                result.title ||
                `Facebook_Video_${Date.now()}`,

            thumbnail,

            downloadUrl: result.video,

            formats: [
                {
                    quality: "HD Video (MP4)",
                    downloadUrl: result.video,
                    extension: "mp4",
                    type: "video",
                },
            ],
        });
    } catch (err) {
        console.error(
            "[Facebook] Fatal Error:",
            err
        );

        return res.status(500).json({
            success: false,
            error:
                "Facebook extraction failed: " +
                (err.message || "Unknown error"),
        });
    }
});

// ============================================================
// EXPORT
// ============================================================

module.exports = router;
