// Customer: submit a new order
const { fetchJSON, saveJSON } = require('./lib/github');
const { Resend } = require('resend');

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
};

// Business hours config
const HOURS = {
    1: [[10, 15], [17, 20]], // Po
    2: [[10, 15], [17, 20]], // Út
    3: [[10, 15], [17, 20]], // St
    4: [[10, 15], [17, 20]], // Čt
    5: [[10, 15], [17, 22]], // Pá
    6: [[10, 15], [17, 21]], // So
    0: [[17, 20]]            // Ne
};

function isOpen() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const slots = HOURS[day];
    if (!slots) return false;
    return slots.some(([from, to]) => hour >= from && hour < to);
}

function generateOrderId() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `P${date}-${rand}`;
}

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Neplatný požadavek' }) };
    }

    const { customer, items, restaurantId, deliveryTime, payment, note } = body;

    // Validate required fields
    if (!customer?.name || !customer?.phone || !customer?.address) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Vyplňte jméno, telefon a adresu' }) };
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Košík je prázdný' }) };
    }
    if (!restaurantId) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Nebyla vybrána restaurace' }) };
    }

    // Validate phone (Czech format)
    const phone = customer.phone.replace(/\s/g, '');
    if (!/^(\+420)?[0-9]{9}$/.test(phone)) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Neplatné telefonní číslo' }) };
    }

    // Check business hours
    if (!isOpen()) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Momentálně nemáme otevřeno. Objednávky přijímáme v provozní době.' }) };
    }

    try {
        // Load restaurant info for validation
        const restaurants = await fetchJSON('data/restaurants.json');
        const restaurant = restaurants?.find(r => r.id === restaurantId && r.active);
        if (!restaurant) {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Restaurace není dostupná' }) };
        }

        // Load menu for price validation
        const menu = await fetchJSON(`data/menus/${restaurantId}.json`);
        if (!menu) {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Menu není dostupné' }) };
        }

        // Build price lookup from menu
        const priceLookup = {};
        for (const cat of menu.categories) {
            for (const item of cat.items) {
                priceLookup[item.name] = item.price;
            }
        }

        // Validate prices server-side (never trust the client)
        let subtotal = 0;
        const validatedItems = [];
        for (const item of items) {
            const serverPrice = priceLookup[item.name];
            if (serverPrice === undefined) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Položka "${item.name}" nebyla nalezena v menu` }) };
            }
            const qty = Math.max(1, Math.min(20, parseInt(item.quantity) || 1));
            subtotal += serverPrice * qty;
            validatedItems.push({
                name: item.name,
                price: serverPrice,
                quantity: qty,
                total: serverPrice * qty
            });
        }

        // Check minimum order
        if (subtotal < restaurant.minOrder) {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Minimální objednávka je ${restaurant.minOrder} Kč` }) };
        }

        const deliveryFee = restaurant.deliveryFee || 49;
        const total = subtotal + deliveryFee;
        const orderId = generateOrderId();

        const order = {
            orderId,
            status: 'new',
            restaurantId,
            restaurantName: restaurant.name,
            customer: {
                name: customer.name.trim().substring(0, 100),
                phone: phone,
                address: customer.address.trim().substring(0, 200),
                note: (note || '').trim().substring(0, 500)
            },
            deliveryTime: deliveryTime || 'co nejdříve',
            payment: payment === 'card' ? 'card' : 'cash',
            items: validatedItems,
            subtotal,
            deliveryFee,
            total,
            createdAt: new Date().toISOString()
        };

        // Save order to daily file
        const dateKey = todayKey();
        const ordersPath = `data/orders/${dateKey}.json`;
        let orders = await fetchJSON(ordersPath);
        if (!orders) orders = [];
        orders.push(order);
        await saveJSON(ordersPath, orders, `📦 Nová objednávka ${orderId}`);

        // Send email notification
        try {
            const notifyEmail = process.env.NOTIFY_EMAIL || 'rozvozpejr@gmail.com';
            const resend = new Resend(process.env.RESEND_API_KEY);

            const itemsHtml = validatedItems.map(i =>
                `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${i.name}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${i.quantity}×</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${i.total} Kč</td></tr>`
            ).join('');

            await resend.emails.send({
                from: 'Rozvoz Pejr <objednavky@webzitra.cz>',
                to: notifyEmail,
                subject: `🍕 Nová objednávka ${orderId} — ${restaurant.name}`,
                html: `
                    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
                        <h2 style="color:#D4822A;margin-bottom:4px">Nová objednávka!</h2>
                        <p style="color:#666;margin-top:0">ID: ${orderId} | ${new Date().toLocaleString('cs-CZ')}</p>
                        <hr style="border:none;border-top:2px solid #D4822A">
                        <h3 style="margin-bottom:4px">🏪 ${restaurant.name}</h3>
                        <table style="width:100%;border-collapse:collapse;margin:12px 0">
                            <tr style="background:#f5f5f5"><th style="padding:6px 12px;text-align:left">Položka</th><th style="padding:6px 12px;text-align:center">Ks</th><th style="padding:6px 12px;text-align:right">Cena</th></tr>
                            ${itemsHtml}
                        </table>
                        <p style="text-align:right;margin:4px 12px"><strong>Mezisoučet: ${subtotal} Kč</strong></p>
                        <p style="text-align:right;margin:4px 12px">Dovoz: ${deliveryFee} Kč</p>
                        <p style="text-align:right;margin:4px 12px;font-size:1.2em"><strong>Celkem: ${total} Kč</strong></p>
                        <hr style="border:none;border-top:1px solid #ddd">
                        <h3 style="margin-bottom:4px">👤 Zákazník</h3>
                        <p style="margin:4px 0"><strong>${customer.name}</strong></p>
                        <p style="margin:4px 0">📞 <a href="tel:${phone}">${phone}</a></p>
                        <p style="margin:4px 0">📍 ${customer.address}</p>
                        <p style="margin:4px 0">🕐 ${deliveryTime || 'Co nejdříve'}</p>
                        <p style="margin:4px 0">💳 ${payment === 'card' ? 'Kartou' : 'Hotově'}</p>
                        ${order.customer.note ? `<p style="margin:4px 0">📝 ${order.customer.note}</p>` : ''}
                    </div>
                `
            });
        } catch (emailErr) {
            console.error('Email notification failed:', emailErr);
            // Don't fail the order if email fails
        }

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                success: true,
                orderId,
                total,
                message: 'Objednávka byla přijata! Brzy se ozveme.'
            })
        };
    } catch (err) {
        console.error('pejr-order error:', err);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Chyba při zpracování objednávky' }) };
    }
};
