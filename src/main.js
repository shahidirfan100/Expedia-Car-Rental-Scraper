import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Actor, log } from 'apify';
import { Dataset, gotScraping } from 'crawlee';

await Actor.init();

const GRAPHQL_URL = 'https://www.expedia.com/graphql';
const PAGE_ID = 'page.Car-Search,C,20';
const CLIENT_INFO = 'bernie-cars-shopping-web,pwa,us-east-1';
const AUTO_HEAL_INPUT = true;
const RESILIENT_MODE = true;
const PAGE_BATCH_SIZE = 20;
const BOOTSTRAP_ATTEMPTS = 4;
const PAGE_ATTEMPTS = 5;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.7; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
];

const ACCEPT_LANGUAGES = [
    'en-US,en;q=0.9',
    'en-US,en;q=0.8',
    'en-GB,en;q=0.9,en-US;q=0.8',
];

const CAR_SEARCH_QUERY = `
query CarSearchLite(
  $context: ContextInput!
  $primaryCarSearchCriteria: PrimaryCarCriteriaInput!
  $secondaryCriteria: ShoppingSearchCriteriaInput!
  $shoppingContext: ShoppingContextInput
) {
  carSearchOrRecommendations(
    context: $context
    primaryCarSearchCriteria: $primaryCarSearchCriteria
    secondaryCriteria: $secondaryCriteria
    shoppingContext: $shoppingContext
  ) {
    carSearchResults {
      carsShoppingContext {
        searchId
      }
      listings {
        __typename
        ... on CarOfferCard {
          accessibilityString
          offerHeading
          reserveButtonText
          infositeURL {
            relativePath
            value
          }
          detailsContext {
            carOfferToken
            selectedAccessories
            rewardPointsSelection
            continuationContextualId
          }
          vehicle {
            category
            description
            image {
              url
            }
            attributes {
              text
              icon {
                id
                description
              }
            }
          }
          vendor {
            image {
              url
            }
          }
          review {
            rating
            superlative
            totalCount
          }
          multiItemPriceToken
          isFareComparisonTestEnabled
          priceSummaryText
        }
      }
      loadMoreAction {
        searchPagination {
          size
          startingIndex
        }
      }
    }
    carsErrorContent {
      heading
      subText
      errorEventName
    }
  }
}`;

function randomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomAcceptLanguage() {
    return ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function cleanText(value) {
    if (value === null || value === undefined) return undefined;
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text || undefined;
}

function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const text = cleanText(value);
    if (!text) return undefined;

    const match = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return undefined;

    const number = Number(match[0]);
    return Number.isFinite(number) ? number : undefined;
}

function toInteger(value) {
    const number = toNumber(value);
    return number === undefined ? undefined : Math.trunc(number);
}

function compactObject(value) {
    if (Array.isArray(value)) {
        const cleaned = value.map((item) => compactObject(item)).filter((item) => item !== undefined);
        return cleaned.length ? cleaned : undefined;
    }

    if (value && typeof value === 'object') {
        const output = {};
        for (const [key, nestedValue] of Object.entries(value)) {
            const cleaned = compactObject(nestedValue);
            if (cleaned !== undefined) output[key] = cleaned;
        }
        return Object.keys(output).length ? output : undefined;
    }

    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return value;
}

function parseDateInput(value) {
    const text = cleanText(value);
    if (!text) return undefined;

    let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        return {
            month: Number(match[1]),
            day: Number(match[2]),
            year: Number(match[3]),
        };
    }

    match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        return {
            year: Number(match[1]),
            month: Number(match[2]),
            day: Number(match[3]),
        };
    }

    return undefined;
}

function formatUsDate(parts) {
    if (!parts) return undefined;
    return `${parts.month}/${parts.day}/${parts.year}`;
}

function formatIsoDate(parts) {
    if (!parts) return undefined;
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function parseTimeInput(value) {
    const text = cleanText(value);
    if (!text) {
        return { hour: 10, minute: 30, source: '1030AM' };
    }

    const compact = text.toUpperCase().replace(/\s+/g, '');

    let match = compact.match(/^(\d{1,2})(\d{2})(AM|PM)$/);
    if (match) {
        let hour = Number(match[1]);
        const minute = Number(match[2]);
        const ampm = match[3];

        if (hour === 12) hour = 0;
        if (ampm === 'PM') hour += 12;

        return {
            hour,
            minute,
            source: `${match[1]}${match[2]}${ampm}`,
        };
    }

    match = compact.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
    if (match) {
        let hour = Number(match[1]);
        const minute = Number(match[2]);
        const ampm = match[3];

        if (ampm) {
            if (hour === 12) hour = 0;
            if (ampm === 'PM') hour += 12;
        }

        return {
            hour,
            minute,
            source: `${String(match[1]).padStart(2, '0')}:${match[2]}${ampm || ''}`,
        };
    }

    return { hour: 10, minute: 30, source: '1030AM' };
}

function normalizeUrlInput(input) {
    let normalized = cleanText(input);
    if (!normalized) return undefined;

    normalized = normalized
        .replace(/&amp;/gi, '&')
        .replace(/^[\s"'`<[({]+/, '')
        .replace(/[\s"'`>\])}.,;!?]+$/, '');

    const hasEncodedUrl = /^https?%3A/i.test(normalized)
        || /(?:^|[?&](?:url|u|target|dest|destination|redirect)=)https?%3A/i.test(normalized);

    if (hasEncodedUrl) {
        for (let attempt = 0; attempt < 2; attempt++) {
            if (!/%[0-9A-Fa-f]{2}/.test(normalized)) break;
            try {
                const decoded = decodeURIComponent(normalized);
                if (decoded === normalized) break;
                normalized = decoded;
            } catch {
                break;
            }
        }
    }

    if (/^(https?:\/\/|www\.)/i.test(normalized)) {
        normalized = normalized.replace(/ /g, '%20');
    }

    const embeddedMatch = normalized.match(/https?:\/\/(?:www\.)?expedia\.[^\s"'<>]+/i);
    if (embeddedMatch) {
        normalized = embeddedMatch[0];
    }

    if (!/^https?:\/\//i.test(normalized) && /^(?:www\.)?expedia\./i.test(normalized)) {
        normalized = `https://${normalized}`;
    }

    try {
        const outerUrl = new URL(normalized);
        if (!/expedia\./i.test(outerUrl.hostname)) {
            for (const key of ['url', 'u', 'target', 'dest', 'destination', 'redirect']) {
                const nestedValue = outerUrl.searchParams.get(key);
                const nestedUrl = normalizeUrlInput(nestedValue);
                if (nestedUrl && /https?:\/\/(?:www\.)?expedia\./i.test(nestedUrl)) return nestedUrl;
            }
        }
    } catch {
        // Ignore and return normalized text below.
    }

    return normalized;
}

function parseStartUrl(startUrl) {
    const normalized = normalizeUrlInput(startUrl);
    if (!normalized) return {};

    try {
        const url = new URL(normalized);
        return {
            startUrl: url.toString(),
            pickUpLoc: cleanText(url.searchParams.get('locn') || url.searchParams.get('pickUpLoc')),
            pickupRegion: cleanText(url.searchParams.get('dpln') || url.searchParams.get('pickupRegion') || url.searchParams.get('regionId')),
            dropLoc: cleanText(url.searchParams.get('loc2') || url.searchParams.get('dropLoc')),
            dropRegion: cleanText(url.searchParams.get('drid') || url.searchParams.get('dropRegion')),
            pickUpDate: cleanText(url.searchParams.get('date1') || url.searchParams.get('pickUpDate')),
            dropDate: cleanText(url.searchParams.get('date2') || url.searchParams.get('dropDate')),
            pickUpTime: cleanText(url.searchParams.get('time1') || url.searchParams.get('pickUpTime')),
            dropTime: cleanText(url.searchParams.get('time2') || url.searchParams.get('dropTime')),
            sort: cleanText(url.searchParams.get('sort')),
            rfrr: cleanText(url.searchParams.get('rfrr') || url.searchParams.get('crfrr')),
        };
    } catch {
        return {};
    }
}

function parseCookieHeader(setCookieHeaders = []) {
    return setCookieHeaders.map((entry) => entry.split(';')[0]).join('; ');
}

function readDuaid(cookieHeader) {
    const duaid = cookieHeader.match(/(?:^|;\s*)DUAID=([^;]+)/)?.[1];
    return cleanText(duaid) || crypto.randomUUID();
}

function buildBootstrapHeaders({ userAgent, acceptLanguage }) {
    return {
        'user-agent': userAgent,
        'accept-language': acceptLanguage,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
}

function buildGraphqlHeaders({
    searchUrl,
    userAgent,
    acceptLanguage,
    cookieHeader,
    duaid,
}) {
    return {
        'user-agent': userAgent,
        accept: '*/*',
        'accept-language': acceptLanguage,
        'content-type': 'application/json',
        'Client-Info': CLIENT_INFO,
        'client-info': 'domain-redirect:true',
        'Device-User-Agent-ID': duaid,
        'x-page-id': PAGE_ID,
        origin: 'https://www.expedia.com',
        referer: searchUrl,
        cookie: cookieHeader,
    };
}

function ensureAbsoluteUrl(value) {
    const text = cleanText(value);
    if (!text) return undefined;

    try {
        return new URL(text, 'https://www.expedia.com').toString();
    } catch {
        return undefined;
    }
}

function formatUsd(value) {
    const amount = toNumber(value);
    if (amount === undefined) return undefined;
    return `$${amount.toFixed(2)}`;
}

function parseInfositePricing(infositeUrl) {
    const urlText = cleanText(infositeUrl);
    if (!urlText) return {};

    try {
        const url = new URL(urlText);
        return {
            lead: formatUsd(url.searchParams.get('dailyPriceShown')),
            total: formatUsd(url.searchParams.get('totalPriceShown')),
        };
    } catch {
        return {};
    }
}

function healSearchUrl(startUrl) {
    const normalized = normalizeUrlInput(startUrl);
    if (!normalized) return undefined;

    let url;
    try {
        url = new URL(normalized);
    } catch {
        return normalized;
    }

    const params = url.searchParams;
    const aliases = {
        locn: cleanText(params.get('locn') || params.get('pickUpLoc') || params.get('pickupLocation')),
        dpln: cleanText(params.get('dpln') || params.get('pickupRegion') || params.get('regionId')),
        loc2: cleanText(params.get('loc2') || params.get('dropLoc') || params.get('dropoffLocation')),
        drid: cleanText(params.get('drid') || params.get('dropRegion')),
        date1: cleanText(params.get('date1') || params.get('pickUpDate') || params.get('pickupDate')),
        date2: cleanText(params.get('date2') || params.get('dropDate') || params.get('dropoffDate')),
        time1: cleanText(params.get('time1') || params.get('pickUpTime') || params.get('pickupTime')),
        time2: cleanText(params.get('time2') || params.get('dropTime') || params.get('dropoffTime')),
        crfrr: cleanText(params.get('crfrr') || params.get('rfrr')),
        SearchType: cleanText(params.get('SearchType')),
    };

    if (aliases.loc2 === undefined) aliases.loc2 = aliases.locn;
    if (aliases.drid === undefined) aliases.drid = aliases.dpln;

    const healedUrl = new URL('/carsearch', 'https://www.expedia.com');

    for (const [key, value] of params.entries()) {
        if (!healedUrl.searchParams.has(key)) {
            healedUrl.searchParams.set(key, value);
        }
    }

    for (const [key, value] of Object.entries(aliases)) {
        if (value !== undefined) healedUrl.searchParams.set(key, value);
    }

    return healedUrl.toString();
}

function buildContext(duaid) {
    return {
        siteId: 1,
        locale: 'en_US',
        eapid: 0,
        tpid: 1,
        currency: 'USD',
        device: { type: 'DESKTOP' },
        identity: {
            duaid,
            authState: 'ANONYMOUS',
        },
        privacyTrackingState: 'CAN_TRACK',
        debugContext: { abacusOverrides: [] },
    };
}

function buildPrimaryCriteria(searchInput) {
    const pickUpDate = parseDateInput(searchInput.pickUpDate);
    const dropDate = parseDateInput(searchInput.dropDate);

    if (!pickUpDate || !dropDate) {
        throw new Error('Missing valid pickUpDate/dropDate. Use M/D/YYYY or YYYY-MM-DD.');
    }

    if (!searchInput.pickUpLoc && !searchInput.pickupRegion) {
        throw new Error('Missing pickup location. Provide startUrl or pickUpLoc/pickupRegion input.');
    }

    const pickUpTime = parseTimeInput(searchInput.pickUpTime);
    const dropTime = parseTimeInput(searchInput.dropTime);

    const pickUpLocation = {
        searchTerm: cleanText(searchInput.pickUpLoc),
        regionId: cleanText(searchInput.pickupRegion),
        isExactLocationSearch: Boolean(searchInput.pickUpExactLoc),
    };

    const dropLocationValue = cleanText(searchInput.dropLoc) || cleanText(searchInput.pickUpLoc);
    const dropRegionValue = cleanText(searchInput.dropRegion) || cleanText(searchInput.pickupRegion);

    const dropOffLocation = compactObject({
        searchTerm: dropLocationValue,
        regionId: dropRegionValue,
        isExactLocationSearch: Boolean(searchInput.dropExactLoc),
    });

    return {
        pickUpLocation: compactObject(pickUpLocation),
        dropOffLocation,
        pickUpDateTime: {
            day: pickUpDate.day,
            month: pickUpDate.month,
            year: pickUpDate.year,
            hour: pickUpTime.hour,
            minute: pickUpTime.minute,
            second: 0,
        },
        dropOffDateTime: {
            day: dropDate.day,
            month: dropDate.month,
            year: dropDate.year,
            hour: dropTime.hour,
            minute: dropTime.minute,
            second: 0,
        },
    };
}

function buildSecondaryCriteria({
    sort,
    pageCount,
    startingIndex,
    savedSearchId,
    rfrr,
}) {
    const selections = [
        { id: 'selPageCount', value: String(pageCount) },
        { id: 'searchId', value: cleanText(savedSearchId) || '' },
    ];

    if (startingIndex > 0) {
        selections.push({ id: 'selPageIndex', value: String(startingIndex) });
    }

    if (cleanText(sort)) {
        selections.push({ id: 'selSort', value: cleanText(sort) });
    }

    if (cleanText(rfrr)) {
        selections.push({ id: 'rfrr', value: cleanText(rfrr) });
    }

    return {
        booleans: [{ id: 'SALES_UNLOCKED', value: false }],
        selections,
    };
}

function mergeSearchInput(input) {
    const fromStartUrl = parseStartUrl(input.startUrl);

    return {
        startUrl: normalizeUrlInput(input.startUrl) || fromStartUrl.startUrl,
        pickUpLoc: cleanText(input.pickUpLoc || fromStartUrl.pickUpLoc),
        pickupRegion: cleanText(input.pickupRegion || fromStartUrl.pickupRegion),
        dropLoc: cleanText(input.dropLoc || fromStartUrl.dropLoc),
        dropRegion: cleanText(input.dropRegion || fromStartUrl.dropRegion),
        pickUpDate: cleanText(input.pickUpDate || fromStartUrl.pickUpDate),
        dropDate: cleanText(input.dropDate || fromStartUrl.dropDate),
        pickUpTime: cleanText(input.pickUpTime || fromStartUrl.pickUpTime || '1030AM'),
        dropTime: cleanText(input.dropTime || fromStartUrl.dropTime || '1030AM'),
        sort: cleanText(input.sort || fromStartUrl.sort),
        rfrr: cleanText(input.rfrr || fromStartUrl.rfrr),
        pickUpExactLoc: Boolean(input.pickUpExactLoc),
        dropExactLoc: Boolean(input.dropExactLoc),
    };
}

async function bootstrapSession({ searchUrl, proxyConfiguration }) {
    const userAgent = randomUserAgent();
    const acceptLanguage = randomAcceptLanguage();
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
    const bootstrap = await fetchBootstrap({
        searchUrl,
        userAgent,
        acceptLanguage,
        proxyUrl,
    });

    return {
        ...bootstrap,
        userAgent,
        acceptLanguage,
        proxyUrl,
    };
}

async function withRetries({
    label,
    attempts,
    enabled,
    task,
}) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await task(attempt);
        } catch (error) {
            lastError = error;
            if (!enabled || attempt === attempts) break;
            const message = cleanText(error?.message) || '';
            const isRateLimited = /429|Too Many Requests|terminated|Timeout/i.test(message);
            const baseDelay = isRateLimited ? (attempt * 2000) : (attempt * 800);
            await delay(baseDelay + randomInt(350, 900));
            log.warning(`${label} failed, retrying`, {
                attempt,
                attempts,
                message: error.message,
            });
        }
    }

    throw lastError;
}

async function fetchCarSearchBatchWithRecovery({
    label,
    searchUrl,
    proxyConfiguration,
    currentSession,
    resilientMode,
    variables,
}) {
    let activeSession = currentSession;

    return withRetries({
        label,
        attempts: resilientMode ? PAGE_ATTEMPTS : 1,
        enabled: resilientMode,
        task: async (attempt) => {
            if (attempt > 1) {
                activeSession = await bootstrapSession({ searchUrl, proxyConfiguration });
            }

            await delay(randomInt(450, 1100));

            const response = await fetchCarSearchBatch({
                searchUrl: activeSession.finalSearchUrl,
                userAgent: activeSession.userAgent,
                acceptLanguage: activeSession.acceptLanguage,
                proxyUrl: activeSession.proxyUrl,
                cookieHeader: activeSession.cookieHeader,
                duaid: activeSession.duaid,
                variables,
            });

            return {
                response,
                session: activeSession,
            };
        },
    });
}

async function loadInput() {
    const actorInput = await Actor.getInput();
    if (actorInput && typeof actorInput === 'object') return actorInput;

    try {
        const raw = await readFile(new URL('../INPUT.json', import.meta.url), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            log.info('Using local INPUT.json fallback because Actor input was empty.');
            return parsed;
        }
    } catch {
        // Ignore local fallback failure.
    }

    return {};
}

async function fetchBootstrap({ searchUrl, userAgent, acceptLanguage, proxyUrl }) {
    const response = await gotScraping({
        url: searchUrl,
        headers: buildBootstrapHeaders({ userAgent, acceptLanguage }),
        proxyUrl,
        retry: { limit: 0 },
        timeout: { request: 60000 },
        throwHttpErrors: false,
    });

    if (response.statusCode < 200 || response.statusCode >= 400) {
        throw new Error(`Car search bootstrap page failed with status ${response.statusCode}`);
    }

    const cookieHeader = parseCookieHeader(response.headers['set-cookie'] || []);
    const duaid = readDuaid(cookieHeader);

    return {
        cookieHeader,
        duaid,
        finalSearchUrl: response.url || searchUrl,
    };
}

async function fetchCarSearchBatch({
    searchUrl,
    userAgent,
    acceptLanguage,
    proxyUrl,
    cookieHeader,
    duaid,
    variables,
}) {
    const response = await gotScraping({
        url: GRAPHQL_URL,
        method: 'POST',
        headers: buildGraphqlHeaders({
            searchUrl,
            userAgent,
            acceptLanguage,
            cookieHeader,
            duaid,
        }),
        body: JSON.stringify({
            operationName: 'CarSearchLite',
            query: CAR_SEARCH_QUERY,
            variables,
        }),
        proxyUrl,
        retry: { limit: 0 },
        timeout: { request: 90000 },
        throwHttpErrors: false,
    });

    const responseText = String(response.body || '');

    if (response.statusCode === 429) {
        throw new Error('Expedia API returned 429 Too Many Requests. Use residential proxies for reliable extraction.');
    }

    if (response.statusCode < 200 || response.statusCode >= 400) {
        throw new Error(`Expedia GraphQL request failed with status ${response.statusCode}: ${responseText.slice(0, 280)}`);
    }

    let body;
    try {
        body = JSON.parse(responseText);
    } catch {
        throw new Error(`Expedia GraphQL did not return JSON: ${responseText.slice(0, 280)}`);
    }

    if (Array.isArray(body?.errors) && body.errors.length) {
        throw new Error(body.errors.map((entry) => entry.message).filter(Boolean).join('; '));
    }

    return body?.data?.carSearchOrRecommendations;
}

function normalizeOfferRecord({
    offer,
    pageIndex,
    searchInput,
    searchId,
    scrapedAt,
}) {
    const lead = offer?.priceSummary?.lead;
    const total = offer?.priceSummary?.total;
    const infositeUrl = ensureAbsoluteUrl(offer?.infositeURL?.relativePath || offer?.infositeURL?.value);
    const fallbackPrices = parseInfositePricing(infositeUrl);

    const record = {
        car_offer_token: cleanText(offer?.detailsContext?.carOfferToken),
        continuation_contextual_id: cleanText(offer?.detailsContext?.continuationContextualId),
        selected_accessories: Array.isArray(offer?.detailsContext?.selectedAccessories)
            ? offer.detailsContext.selectedAccessories
            : undefined,
        reward_points_selection: cleanText(offer?.detailsContext?.rewardPointsSelection),

        offer_heading: cleanText(offer?.offerHeading),
        reserve_button_text: cleanText(offer?.reserveButtonText),
        accessibility_string: cleanText(offer?.accessibilityString),
        infosite_url: infositeUrl,

        vehicle_category: cleanText(offer?.vehicle?.category),
        vehicle_description: cleanText(offer?.vehicle?.description),
        vehicle_image_url: ensureAbsoluteUrl(offer?.vehicle?.image?.url || offer?.vehicle?.image?.value),
        vendor_image_url: ensureAbsoluteUrl(offer?.vendor?.image?.url || offer?.vendor?.image?.value),
        vehicle_attributes: (offer?.vehicle?.attributes || [])
            .map((entry) => cleanText(entry?.text))
            .filter(Boolean),

        review_rating: toNumber(offer?.review?.rating),
        review_label: cleanText(offer?.review?.superlative),
        review_count: toInteger(offer?.review?.totalCount),

        price_lead: cleanText(lead?.formatted || lead?.price || lead?.accessibility) || fallbackPrices.lead,
        price_total: cleanText(total?.formatted || total?.price || total?.accessibility) || fallbackPrices.total,
        price_accessibility: cleanText(offer?.priceSummary?.accessibility) || cleanText(offer?.accessibilityString),
        strike_through_first: typeof offer?.priceSummary?.strikeThroughFirst === 'boolean'
            ? offer.priceSummary.strikeThroughFirst
            : undefined,
        multi_item_price_token: cleanText(offer?.multiItemPriceToken),
        fare_comparison_enabled: typeof offer?.isFareComparisonTestEnabled === 'boolean'
            ? offer.isFareComparisonTestEnabled
            : undefined,
        price_summary_text: cleanText(offer?.priceSummaryText),

        search_id: cleanText(searchId),
        pick_up_location: cleanText(searchInput.pickUpLoc),
        drop_off_location: cleanText(searchInput.dropLoc || searchInput.pickUpLoc),
        pick_up_region: cleanText(searchInput.pickupRegion),
        drop_off_region: cleanText(searchInput.dropRegion || searchInput.pickupRegion),
        pick_up_date: formatIsoDate(parseDateInput(searchInput.pickUpDate)),
        drop_off_date: formatIsoDate(parseDateInput(searchInput.dropDate)),
        pick_up_time: cleanText(searchInput.pickUpTime),
        drop_off_time: cleanText(searchInput.dropTime),

        page_index: pageIndex,
        operation_name: 'CarSearchLite',
        scraped_at: scrapedAt,
    };

    return compactObject(record);
}

function clamp(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

async function main() {
    const input = await loadInput();
    const autoHealInput = AUTO_HEAL_INPUT;
    const resilientMode = RESILIENT_MODE;

    const searchInput = mergeSearchInput(input);
    if (autoHealInput && searchInput.startUrl) {
        searchInput.startUrl = healSearchUrl(searchInput.startUrl);
    }

    if (!searchInput.startUrl) {
        throw new Error('Missing startUrl. Provide a full Expedia car rental search URL.');
    }

    const resultsWanted = clamp(input.results_wanted, 1, 500, 20);
    const maxPages = clamp(input.max_pages, 1, 50, 8);
    const pageSize = PAGE_BATCH_SIZE;
    const initialSearchUrl = searchInput.startUrl;

    let proxyConfiguration;
    if (input.proxyConfiguration) {
        try {
            proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration);
        } catch (error) {
            log.warning('Proxy configuration initialization failed, continuing without proxy.', {
                message: error.message,
            });
        }
    }

    const scrapedAt = new Date().toISOString();

    let session = await withRetries({
        label: 'Bootstrap request',
        attempts: resilientMode ? BOOTSTRAP_ATTEMPTS : 1,
        enabled: resilientMode,
        task: () => bootstrapSession({ searchUrl: initialSearchUrl, proxyConfiguration }),
    });

    const resolvedSearchInput = mergeSearchInput({
        ...searchInput,
        startUrl: session.finalSearchUrl || initialSearchUrl,
    });

    if (autoHealInput && resolvedSearchInput.startUrl) {
        resolvedSearchInput.startUrl = healSearchUrl(resolvedSearchInput.startUrl);
    }

    const pickUpDate = parseDateInput(resolvedSearchInput.pickUpDate);
    const dropDate = parseDateInput(resolvedSearchInput.dropDate);

    if (!pickUpDate || !dropDate || !resolvedSearchInput.pickUpLoc) {
        throw new Error('The provided startUrl is missing required Expedia car search details. Use a full carsearch URL with location, region, and pickup/drop dates.');
    }

    if (!resolvedSearchInput.pickUpDate) resolvedSearchInput.pickUpDate = formatUsDate(pickUpDate);
    if (!resolvedSearchInput.dropDate) resolvedSearchInput.dropDate = formatUsDate(dropDate);

    const searchUrl = resolvedSearchInput.startUrl;

    log.info('Starting Expedia car rental extraction', {
        searchUrl,
        resultsWanted,
        maxPages,
        pageSize,
        usingProxy: Boolean(session.proxyUrl),
        autoHealInput,
        resilientMode,
    });

    const dedupe = new Set();
    let savedSearchId = '';
    let startingIndex = 0;
    let stagnantPages = 0;
    let savedCount = 0;

    for (let pageIndex = 0; pageIndex < maxPages && savedCount < resultsWanted; pageIndex++) {
        const variables = {
            context: buildContext(session.duaid),
            primaryCarSearchCriteria: buildPrimaryCriteria(resolvedSearchInput),
            secondaryCriteria: buildSecondaryCriteria({
                sort: resolvedSearchInput.sort,
                pageCount: pageSize,
                startingIndex,
                savedSearchId,
                rfrr: resolvedSearchInput.rfrr,
            }),
            shoppingContext: null,
        };

        const pageResult = await fetchCarSearchBatchWithRecovery({
            label: `Results page ${pageIndex + 1}`,
            searchUrl,
            proxyConfiguration,
            currentSession: session,
            resilientMode,
            variables,
        });
        const { response, session: refreshedSession } = pageResult;
        session = refreshedSession;

        const apiError = response?.carsErrorContent;
        const result = response?.carSearchResults;
        const listings = Array.isArray(result?.listings) ? result.listings : [];
        const batchRecords = [];

        if (cleanText(result?.carsShoppingContext?.searchId)) {
            savedSearchId = cleanText(result?.carsShoppingContext?.searchId);
        }

        if (!listings.length) {
            if (cleanText(apiError?.heading) || cleanText(apiError?.subText)) {
                throw new Error(`Expedia returned an empty result set: ${cleanText(apiError?.heading) || ''} ${cleanText(apiError?.subText) || ''}`.trim());
            }
            break;
        }

        for (const item of listings) {
            if ((savedCount + batchRecords.length) >= resultsWanted) break;
            const itemType = cleanText(Reflect.get(item ?? {}, '__typename'));
            if (itemType !== 'CarOfferCard') continue;

            const record = normalizeOfferRecord({
                offer: item,
                pageIndex,
                searchInput: resolvedSearchInput,
                searchId: savedSearchId,
                scrapedAt,
            });

            if (!record) continue;

            const dedupeKey = record.car_offer_token
                || record.infosite_url
                || `${record.offer_heading || ''}|${record.price_total || ''}|${record.page_index}`;

            if (dedupe.has(dedupeKey)) continue;
            dedupe.add(dedupeKey);
            batchRecords.push(record);
        }

        if (batchRecords.length) {
            await Dataset.pushData(batchRecords);
            savedCount += batchRecords.length;
        }

        log.info(`Saved ${savedCount}/${resultsWanted} car offers after page ${pageIndex + 1}`);

        const addedThisPage = batchRecords.length;
        if (addedThisPage === 0) {
            stagnantPages += 1;
        } else {
            stagnantPages = 0;
        }

        const nextPageInfo = result?.loadMoreAction?.searchPagination;
        const batchSize = toInteger(nextPageInfo?.size) || listings.length || pageSize;
        if (!nextPageInfo || batchSize <= 0) {
            break;
        }

        if (listings.length < batchSize) break;

        const healedStartingIndex = startingIndex + batchSize;
        if (resilientMode && stagnantPages >= 2) {
            log.warning('Pagination produced duplicate-heavy pages repeatedly, stopping to avoid a loop.', {
                pageIndex,
                startingIndex,
                batchSize,
            });
            break;
        }

        startingIndex = healedStartingIndex;
        if (resilientMode && savedCount < resultsWanted && pageIndex < (maxPages - 1)) {
            await delay(randomInt(500, 1200));
        }
    }

    if (!savedCount) {
        throw new Error('No car rental offers extracted. Retry with residential proxies or a different Expedia carsearch URL.');
    }

    log.info('Finished successfully', {
        saved: savedCount,
        requested: resultsWanted,
    });
}

try {
    await main();
    await Actor.exit();
} catch (error) {
    log.exception(error, 'Actor failed');
    await Actor.fail(error.message);
}
