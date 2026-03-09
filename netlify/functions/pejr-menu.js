// Public: get menu for a specific restaurant
const { fetchJSON } = require('./lib/github');

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=60'
};

// Simple in-memory cache per restaurant (60s)
const menuCache = new Map();

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const id = event.queryStringParameters?.id;
    if (!id || !/^[a-z0-9-]+$/.test(id)) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Neplatné ID restaurace' }) };
    }

    try {
        const now = Date.now();
        const cached = menuCache.get(id);
        if (cached && now - cached.time < 60000) {
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(cached.data) };
        }

        const menu = await fetchJSON(`data/menus/${id}.json`);
        if (!menu) {
            return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Menu nenalezeno' }) };
        }

        menuCache.set(id, { data: menu, time: now });

        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(menu) };
    } catch (err) {
        console.error(`pejr-menu error for ${id}:`, err);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Chyba serveru' }) };
    }
};
