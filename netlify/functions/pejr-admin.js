// Admin: manage restaurants and menus
const { fetchJSON, saveJSON } = require('./lib/github');
const { authenticateAdminRequest, CORS_HEADERS } = require('./lib/admin-auth');

exports.handler = async (event) => {
    const auth = authenticateAdminRequest(event);
    if (!auth.valid) return auth.response;

    const { action } = auth.body;

    try {
        switch (action) {
            // ── Restaurants ──
            case 'list-restaurants': {
                const restaurants = await fetchJSON('data/restaurants.json');
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ restaurants: restaurants || [] }) };
            }

            case 'toggle-restaurant': {
                const { restaurantId, active } = auth.body;
                if (!restaurantId) {
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'restaurantId je povinné' }) };
                }
                const restaurants = await fetchJSON('data/restaurants.json');
                const restaurant = restaurants?.find(r => r.id === restaurantId);
                if (!restaurant) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Restaurace nenalezena' }) };
                }
                restaurant.active = active !== false;
                await saveJSON('data/restaurants.json', restaurants, `🏪 ${restaurant.name}: ${restaurant.active ? 'aktivní' : 'neaktivní'}`);
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, restaurant }) };
            }

            // ── Menu management ──
            case 'get-menu': {
                const { restaurantId } = auth.body;
                if (!restaurantId) {
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'restaurantId je povinné' }) };
                }
                const menu = await fetchJSON(`data/menus/${restaurantId}.json`);
                if (!menu) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Menu nenalezeno' }) };
                }
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ menu }) };
            }

            case 'toggle-item': {
                const { restaurantId, categoryIndex, itemIndex, available } = auth.body;
                if (!restaurantId || categoryIndex === undefined || itemIndex === undefined) {
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Chybějící parametry' }) };
                }
                const menu = await fetchJSON(`data/menus/${restaurantId}.json`);
                if (!menu) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Menu nenalezeno' }) };
                }
                const cat = menu.categories[categoryIndex];
                if (!cat) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Kategorie nenalezena' }) };
                }
                const item = cat.items[itemIndex];
                if (!item) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Položka nenalezena' }) };
                }
                item.available = available !== false;
                await saveJSON(`data/menus/${restaurantId}.json`, menu, `🍽️ ${item.name}: ${item.available ? 'dostupné' : 'nedostupné'}`);
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, item }) };
            }

            case 'toggle-all-items': {
                const { restaurantId, available } = auth.body;
                if (!restaurantId) {
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'restaurantId je povinné' }) };
                }
                const menu = await fetchJSON(`data/menus/${restaurantId}.json`);
                if (!menu) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Menu nenalezeno' }) };
                }
                let count = 0;
                for (const cat of menu.categories) {
                    for (const item of cat.items) {
                        item.available = available !== false;
                        count++;
                    }
                }
                await saveJSON(`data/menus/${restaurantId}.json`, menu, `🍽️ Bulk: ${count} položek → ${available ? 'dostupné' : 'nedostupné'}`);
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, count }) };
            }

            default:
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Neznámá akce' }) };
        }
    } catch (err) {
        console.error('pejr-admin error:', err);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Chyba serveru' }) };
    }
};
