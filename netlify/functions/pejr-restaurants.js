// Public: list active restaurants
const { fetchJSON } = require('./lib/github');

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=60'
};

// Simple in-memory cache (60s)
let cache = { data: null, time: 0 };

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const now = Date.now();
        if (cache.data && now - cache.time < 60000) {
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(cache.data) };
        }

        const restaurants = await fetchJSON('data/restaurants.json');
        if (!restaurants) {
            return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Data nejsou dostupná' }) };
        }

        // Only return active restaurants, sorted
        const active = restaurants
            .filter(r => r.active)
            .sort((a, b) => a.sortOrder - b.sortOrder);

        cache = { data: active, time: now };

        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(active) };
    } catch (err) {
        console.error('pejr-restaurants error:', err);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Chyba serveru' }) };
    }
};
