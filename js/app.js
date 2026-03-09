(function() {
'use strict';

// ── Config ──
const API = '/api';
const CART_KEY = 'pejr-cart';
const CART_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours
const RESTAURANT_EMOJIS = {
    'gabl': '🍔',
    'king-kebab': '🥙',
    'gelato-pizza': '🍕',
    'indicka': '🍛',
    'tres-amigos': '🌮',
    'hodovna': '🍖'
};

// Business hours
const HOURS = {
    1: [[10, 15], [17, 20]], // Po
    2: [[10, 15], [17, 20]], // Út
    3: [[10, 15], [17, 20]], // St
    4: [[10, 15], [17, 20]], // Čt
    5: [[10, 15], [17, 22]], // Pá
    6: [[10, 15], [17, 21]], // So
    0: [[17, 20]]            // Ne
};

// ── State ──
let restaurants = [];
let currentRestaurant = null;
let currentMenu = null;
let cart = loadCart();

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    updateStatusBadge();
    highlightTodayHours();
    loadRestaurants();
    updateCartUI();
    setInterval(updateStatusBadge, 60000);
});

// ── Business Hours ──
function isOpen() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const min = now.getMinutes();
    const time = hour + min / 60;
    const slots = HOURS[day];
    if (!slots) return false;
    return slots.some(([from, to]) => time >= from && time < to);
}

function updateStatusBadge() {
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if (isOpen()) {
        badge.className = 'status-badge status-open';
        text.textContent = 'Otevřeno';
    } else {
        badge.className = 'status-badge status-closed';
        text.textContent = 'Zavřeno';
    }
}

function highlightTodayHours() {
    const dayMap = { 1: 'po', 2: 'ut', 3: 'st', 4: 'ct', 5: 'pa', 6: 'so', 0: 'ne' };
    const today = new Date().getDay();
    const id = dayMap[today];
    if (id) {
        const el = document.getElementById('h-' + id);
        if (el) el.classList.add('today');
    }
}

window.toggleHours = function() {
    document.getElementById('hours-popup').classList.toggle('open');
};

// ── Views ──
function showView(viewId) {
    ['view-restaurants', 'view-menu', 'view-checkout', 'view-confirmation'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
    window.scrollTo(0, 0);
}

window.showRestaurants = function() {
    currentRestaurant = null;
    currentMenu = null;
    showView('view-restaurants');
};

// ── Restaurants ──
async function loadRestaurants() {
    try {
        const res = await fetch(API + '/pejr-restaurants');
        if (!res.ok) throw new Error('Server error');
        restaurants = await res.json();
        renderRestaurants();
    } catch (err) {
        console.error('Failed to load restaurants:', err);
        // Fallback: load from static file
        try {
            const res = await fetch('/data/restaurants.json');
            restaurants = (await res.json()).filter(r => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
            renderRestaurants();
        } catch {
            document.getElementById('restaurants-grid').innerHTML = '<p style="text-align:center;color:var(--text-light);padding:24px">Nepodařilo se načíst restaurace. Zkuste to později.</p>';
        }
    }
}

function renderRestaurants() {
    const grid = document.getElementById('restaurants-grid');
    if (!restaurants.length) {
        grid.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:24px">Žádné restaurace nejsou dostupné.</p>';
        return;
    }

    grid.innerHTML = restaurants.map(r => `
        <div class="restaurant-card" onclick="showMenu('${r.id}')">
            <div class="restaurant-emoji">${RESTAURANT_EMOJIS[r.id] || '🍽️'}</div>
            <h3>${r.name}</h3>
            <p>${r.description}</p>
            <div class="restaurant-meta">
                <span>🚚 ${r.deliveryFee} Kč dovoz</span>
                <span>📦 min. ${r.minOrder} Kč</span>
            </div>
        </div>
    `).join('');
}

// ── Menu ──
window.showMenu = async function(restaurantId) {
    currentRestaurant = restaurants.find(r => r.id === restaurantId);
    if (!currentRestaurant) return;

    document.getElementById('menu-title').textContent = currentRestaurant.name;
    document.getElementById('menu-tags').innerHTML = (currentRestaurant.tags || [])
        .map(t => `<span class="tag">${t}</span>`).join('');

    document.getElementById('menu-items').innerHTML = '<div class="loading"><div class="spinner"></div>Načítám menu…</div>';
    document.getElementById('category-tabs').innerHTML = '';
    showView('view-menu');

    try {
        const res = await fetch(API + '/pejr-menu?id=' + restaurantId);
        if (!res.ok) throw new Error('Server error');
        currentMenu = await res.json();
    } catch {
        try {
            const res = await fetch('/data/menus/' + restaurantId + '.json');
            currentMenu = await res.json();
        } catch {
            document.getElementById('menu-items').innerHTML = '<p style="text-align:center;color:var(--text-light);padding:24px">Menu není dostupné.</p>';
            return;
        }
    }

    renderCategoryTabs();
    renderMenuItems();
};

function renderCategoryTabs() {
    if (!currentMenu || !currentMenu.categories) return;
    const tabs = document.getElementById('category-tabs');
    tabs.innerHTML = currentMenu.categories.map((cat, i) =>
        `<div class="category-tab${i === 0 ? ' active' : ''}" onclick="scrollToCategory(${i})" data-cat="${i}">${cat.name}</div>`
    ).join('');
}

window.scrollToCategory = function(index) {
    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`.category-tab[data-cat="${index}"]`);
    if (tab) tab.classList.add('active');
    const cat = document.getElementById('cat-' + index);
    if (cat) cat.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function renderMenuItems() {
    if (!currentMenu || !currentMenu.categories) return;
    const container = document.getElementById('menu-items');
    container.innerHTML = currentMenu.categories.map((cat, ci) => `
        <div class="menu-category" id="cat-${ci}">
            <h3>${cat.name}</h3>
            ${cat.items.map(item => `
                <div class="menu-item ${item.available === false ? 'menu-item-unavailable' : ''}">
                    <div class="menu-item-info">
                        <div class="menu-item-name">${item.name}</div>
                        ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
                    </div>
                    <div class="menu-item-actions">
                        <span class="menu-item-price">${item.price} Kč</span>
                        ${item.available !== false ? `<button class="add-btn" onclick="addToCart('${escapeHtml(item.name)}', ${item.price})" title="Přidat do košíku">+</button>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

// ── Cart ──
function loadCart() {
    try {
        const stored = localStorage.getItem(CART_KEY);
        if (!stored) return { items: [], restaurantId: null, restaurantName: null, updatedAt: 0 };
        const data = JSON.parse(stored);
        // Check expiry
        if (Date.now() - data.updatedAt > CART_EXPIRY) {
            localStorage.removeItem(CART_KEY);
            return { items: [], restaurantId: null, restaurantName: null, updatedAt: 0 };
        }
        return data;
    } catch {
        return { items: [], restaurantId: null, restaurantName: null, updatedAt: 0 };
    }
}

function saveCart() {
    cart.updatedAt = Date.now();
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

window.addToCart = function(name, price) {
    // Check if switching restaurant
    if (cart.restaurantId && cart.restaurantId !== currentRestaurant.id && cart.items.length > 0) {
        if (!confirm(`V košíku máte položky z ${cart.restaurantName}. Chcete je nahradit?`)) {
            return;
        }
        cart.items = [];
    }

    cart.restaurantId = currentRestaurant.id;
    cart.restaurantName = currentRestaurant.name;

    const existing = cart.items.find(i => i.name === name);
    if (existing) {
        existing.quantity++;
    } else {
        cart.items.push({ name, price, quantity: 1 });
    }

    saveCart();
    updateCartUI();
    showToast(`✓ ${name} přidáno do košíku`);
};

function updateCartUI() {
    const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const bar = document.getElementById('cart-bar');

    document.getElementById('cart-count').textContent = count;
    document.getElementById('cart-total').textContent = subtotal + ' Kč';

    if (count > 0) {
        bar.classList.add('visible');
    } else {
        bar.classList.remove('visible');
    }
}

window.openCart = function() {
    renderCartPanel();
    document.getElementById('cart-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
};

function closeCart() {
    document.getElementById('cart-overlay').classList.remove('open');
    document.body.style.overflow = '';
}

window.closeCartIfBackground = function(e) {
    if (e.target.classList.contains('cart-overlay')) closeCart();
};

function renderCartPanel() {
    const restaurant = restaurants.find(r => r.id === cart.restaurantId);
    const deliveryFee = restaurant?.deliveryFee || 49;
    const minOrder = restaurant?.minOrder || 0;

    document.getElementById('cart-restaurant').textContent = '🏪 ' + (cart.restaurantName || '');

    const itemsHtml = cart.items.map((item, i) => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${item.price} Kč / ks</div>
            </div>
            <div class="qty-controls">
                <button class="qty-btn" onclick="changeQty(${i}, -1)">−</button>
                <span class="qty-value">${item.quantity}</span>
                <button class="qty-btn" onclick="changeQty(${i}, 1)">+</button>
            </div>
            <div class="cart-item-total">${item.price * item.quantity} Kč</div>
        </div>
    `).join('');

    document.getElementById('cart-items').innerHTML = itemsHtml;

    const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const total = subtotal + deliveryFee;

    let summaryHtml = `
        <div class="cart-summary-row"><span>Mezisoučet</span><span>${subtotal} Kč</span></div>
        <div class="cart-summary-row"><span>Dovoz</span><span>${deliveryFee} Kč</span></div>
        <div class="cart-summary-row total"><span>Celkem</span><span>${total} Kč</span></div>
    `;

    if (subtotal < minOrder) {
        summaryHtml += `<div class="cart-min-warning">⚠️ Minimální objednávka je ${minOrder} Kč (chybí ${minOrder - subtotal} Kč)</div>`;
    }

    document.getElementById('cart-summary').innerHTML = summaryHtml;

    const checkoutBtn = document.getElementById('cart-checkout-btn');
    checkoutBtn.disabled = subtotal < minOrder;
}

window.changeQty = function(index, delta) {
    const item = cart.items[index];
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
        cart.items.splice(index, 1);
        if (cart.items.length === 0) {
            cart.restaurantId = null;
            cart.restaurantName = null;
        }
    }
    saveCart();
    updateCartUI();
    renderCartPanel();
};

window.clearCart = function() {
    if (!confirm('Opravdu chcete vysypat košík?')) return;
    cart = { items: [], restaurantId: null, restaurantName: null, updatedAt: 0 };
    saveCart();
    updateCartUI();
    closeCart();
};

window.goToCheckout = function() {
    closeCart();
    renderCheckout();
    showView('view-checkout');
};

// ── Checkout ──
function renderCheckout() {
    const restaurant = restaurants.find(r => r.id === cart.restaurantId);
    const deliveryFee = restaurant?.deliveryFee || 49;
    const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const total = subtotal + deliveryFee;

    let html = `<h3>🏪 ${cart.restaurantName}</h3>`;
    cart.items.forEach(item => {
        html += `<div class="checkout-item">
            <span>${item.quantity}× ${item.name}</span>
            <span>${item.price * item.quantity} Kč</span>
        </div>`;
    });
    html += `<div class="checkout-item" style="border-top:1px solid var(--cream-dark);padding-top:8px;margin-top:4px">
        <span>Dovoz</span><span>${deliveryFee} Kč</span>
    </div>`;
    html += `<div class="checkout-item" style="font-weight:700;font-size:1rem">
        <span>Celkem</span><span>${total} Kč</span>
    </div>`;

    document.getElementById('checkout-items').innerHTML = html;
}

window.selectPayment = function(el) {
    document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
};

window.submitOrder = async function(e) {
    e.preventDefault();

    const name = document.getElementById('c-name').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    const address = document.getElementById('c-address').value.trim();
    const time = document.getElementById('c-time').value;
    const note = document.getElementById('c-note').value.trim();
    const payment = document.querySelector('.payment-option.selected')?.dataset.payment || 'cash';

    if (!name || !phone || !address) {
        showToast('⚠️ Vyplňte všechna povinná pole');
        return;
    }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Odesílám…';

    try {
        const res = await fetch(API + '/pejr-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurantId: cart.restaurantId,
                customer: { name, phone, address },
                items: cart.items.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
                deliveryTime: time,
                payment,
                note
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Chyba při odesílání objednávky');
        }

        // Success!
        document.getElementById('confirm-order-id').textContent = data.orderId;
        showView('view-confirmation');

        // Clear cart
        cart = { items: [], restaurantId: null, restaurantName: null, updatedAt: 0 };
        saveCart();
        updateCartUI();

        // Reset form
        document.getElementById('checkout-form').reset();

    } catch (err) {
        showToast('❌ ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '🛵 Odeslat objednávku';
    }
};

window.newOrder = function() {
    showView('view-restaurants');
};

// ── Helpers ──
function escapeHtml(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// Expose for onclick handlers
window.currentRestaurant = null;
Object.defineProperty(window, 'currentRestaurant', {
    get: () => currentRestaurant,
    set: (v) => { currentRestaurant = v; }
});

})();
