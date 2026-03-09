// Admin authentication for Rozvoz Pejr
// Adapted from WebZitra admin-auth.js

const crypto = require('crypto');

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
};

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

// Rate limiting
const failedAttempts = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = failedAttempts.get(ip);
    if (!entry) return true;
    if (now - entry.firstAttempt > 60000) {
        failedAttempts.delete(ip);
        return true;
    }
    return entry.count < 5;
}

function recordFailedAttempt(ip) {
    const now = Date.now();
    const entry = failedAttempts.get(ip);
    if (!entry || now - entry.firstAttempt > 60000) {
        failedAttempts.set(ip, { count: 1, firstAttempt: now });
    } else {
        entry.count++;
    }
}

function createAdminSession() {
    const secret = process.env.TOKEN_SECRET;
    if (!secret) throw new Error('TOKEN_SECRET not configured');
    const timestamp = String(Date.now());
    const hmac = crypto.createHmac('sha256', secret).update(`pejr-admin:${timestamp}`).digest('hex');
    return {
        sessionToken: `${timestamp}.${hmac}`,
        expiresAt: Date.now() + SESSION_DURATION
    };
}

function verifyAdminSession(sessionToken) {
    if (!sessionToken || typeof sessionToken !== 'string') return false;
    const parts = sessionToken.split('.');
    if (parts.length !== 2) return false;
    const [timestamp, hmac] = parts;
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return false;
    if (Date.now() - ts > SESSION_DURATION) return false;
    const secret = process.env.TOKEN_SECRET;
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(`pejr-admin:${timestamp}`).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
    } catch {
        return false;
    }
}

function authenticateAdminRequest(event) {
    if (event.httpMethod === 'OPTIONS') {
        return { valid: false, response: { statusCode: 200, headers: CORS_HEADERS, body: '' } };
    }
    if (event.httpMethod !== 'POST') {
        return { valid: false, response: { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) } };
    }
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { valid: false, response: { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Neplatný požadavek' }) } };
    }
    if (!verifyAdminSession(body.sessionToken)) {
        return { valid: false, response: { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Neplatná session' }) } };
    }
    return { valid: true, body };
}

module.exports = {
    createAdminSession,
    verifyAdminSession,
    authenticateAdminRequest,
    checkRateLimit,
    recordFailedAttempt,
    CORS_HEADERS
};
