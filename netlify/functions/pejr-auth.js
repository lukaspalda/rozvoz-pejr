// Admin login for Rozvoz Pejr
const { createAdminSession, checkRateLimit, recordFailedAttempt, CORS_HEADERS } = require('./lib/admin-auth');

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
    if (!checkRateLimit(ip)) {
        return { statusCode: 429, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Příliš mnoho pokusů. Zkuste to za minutu.' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Neplatný požadavek' }) };
    }

    const { password } = body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server není nakonfigurován' }) };
    }

    if (password !== adminPassword) {
        recordFailedAttempt(ip);
        return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Nesprávné heslo' }) };
    }

    const session = createAdminSession();
    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, ...session })
    };
};
