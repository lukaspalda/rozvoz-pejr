// Admin: list and manage orders
const { fetchJSON, saveJSON } = require('./lib/github');
const { authenticateAdminRequest, CORS_HEADERS } = require('./lib/admin-auth');

exports.handler = async (event) => {
    const auth = authenticateAdminRequest(event);
    if (!auth.valid) return auth.response;

    const { action, date, orderId, status } = auth.body;

    try {
        switch (action) {
            case 'list': {
                const dateKey = date || new Date().toISOString().slice(0, 10);
                const orders = await fetchJSON(`data/orders/${dateKey}.json`);
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ orders: orders || [], date: dateKey })
                };
            }

            case 'update-status': {
                if (!orderId || !status) {
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'orderId a status jsou povinné' }) };
                }

                const validStatuses = ['new', 'confirmed', 'preparing', 'delivering', 'delivered', 'cancelled'];
                if (!validStatuses.includes(status)) {
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Neplatný status' }) };
                }

                const dateKey = date || new Date().toISOString().slice(0, 10);
                const orders = await fetchJSON(`data/orders/${dateKey}.json`);
                if (!orders) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Žádné objednávky pro tento den' }) };
                }

                const order = orders.find(o => o.orderId === orderId);
                if (!order) {
                    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Objednávka nenalezena' }) };
                }

                order.status = status;
                order.updatedAt = new Date().toISOString();

                await saveJSON(`data/orders/${dateKey}.json`, orders, `📋 ${orderId}: ${status}`);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ success: true, order })
                };
            }

            default:
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Neznámá akce' }) };
        }
    } catch (err) {
        console.error('pejr-orders error:', err);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Chyba serveru' }) };
    }
};
