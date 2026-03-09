(function() {
'use strict';

// ── Config ──
const API = '/api';
const CART_KEY = 'pejr-cart';
const CART_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours

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

    grid.innerHTML = restaurants.map(r => {
        const imgSrc = `img/restaurants/${r.image}`;
        const tagsHtml = (r.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
        const addressHtml = r.address ? `<div class="restaurant-card-address">📍 ${r.address}</div>` : '';
        const navigateHtml = r.mapUrl ? `<a href="${r.mapUrl}" class="restaurant-navigate" target="_blank" rel="noopener" onclick="event.stopPropagation()">🗺 Navigovat</a>` : '';

        return `
        <div class="restaurant-card" onclick="showMenu('${r.id}')">
            <div class="restaurant-card-img">
                <img src="${imgSrc}" alt="${r.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'card-emoji\\'>${getRestaurantEmoji(r.tags)}</div>'">
            </div>
            <div class="restaurant-card-body">
                <div class="restaurant-card-tags">${tagsHtml}</div>
                <h3>${r.name}</h3>
                <div class="restaurant-card-desc">${r.description}</div>
                ${addressHtml}
                <div class="restaurant-card-footer">
                    <div class="restaurant-meta">
                        <span>🚚 ${r.deliveryFee} Kč</span>
                        <span>📦 min. ${r.minOrder} Kč</span>
                    </div>
                    ${navigateHtml}
                </div>
            </div>
        </div>`;
    }).join('');

    // Animate cards entrance with IntersectionObserver
    observeCards();
}

// Get a relevant emoji from restaurant tags (fallback for missing photos)
function getRestaurantEmoji(tags) {
    if (!tags) return '🍽️';
    const tagStr = tags.join(' ');
    if (tagStr.includes('pizza') || tagStr.includes('italská')) return '🍕';
    if (tagStr.includes('kebab') || tagStr.includes('turecká')) return '🥙';
    if (tagStr.includes('mexická') || tagStr.includes('burrito')) return '🌮';
    if (tagStr.includes('indická') || tagStr.includes('curry')) return '🍛';
    if (tagStr.includes('gril') || tagStr.includes('klasika')) return '🍖';
    if (tagStr.includes('bistro') || tagStr.includes('česká')) return '🍔';
    return '🍽️';
}

// IntersectionObserver for card entrance animation
function observeCards() {
    const cards = document.querySelectorAll('.restaurant-card');
    if (!('IntersectionObserver' in window)) {
        // Fallback: show all immediately
        cards.forEach(c => c.classList.add('visible'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                // Stagger animation delay
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, i * 80);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    cards.forEach(card => observer.observe(card));
}

// ── Menu ──
window.showMenu = async function(restaurantId) {
    currentRestaurant = restaurants.find(r => r.id === restaurantId);
    if (!currentRestaurant) return;

    // Render menu banner (photo header)
    renderMenuBanner();

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

function renderMenuBanner() {
    const container = document.getElementById('menu-banner-container');
    const r = currentRestaurant;
    const imgSrc = `img/restaurants/${r.image}`;
    const tagsHtml = (r.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
    const addressHtml = r.address ? `<div class="menu-banner-address">📍 ${r.address}</div>` : '';

    container.innerHTML = `
        <div class="menu-banner">
            <div class="menu-banner-bg" style="background-image:url('${imgSrc}')"></div>
            <div class="menu-banner-overlay"></div>
            <div class="menu-banner-content">
                <div class="restaurant-tags">${tagsHtml}</div>
                <h2>${r.name}</h2>
                ${addressHtml}
            </div>
        </div>
    `;
}

function renderCategoryTabs() {
    if (!currentMenu || !currentMenu.categories) return;
    const tabs = document.getElementById('category-tabs');

    // Collect popular items across all categories
    const popularItems = [];
    currentMenu.categories.forEach(cat => {
        cat.items.forEach(item => {
            if (item.popular) popularItems.push(item);
        });
    });

    let tabsHtml = '';

    // Add "Oblíbené" tab if there are popular items
    if (popularItems.length > 0) {
        tabsHtml += `<div class="category-tab active" onclick="scrollToCategory('popular')" data-cat="popular">🔥 Oblíbené</div>`;
    }

    tabsHtml += currentMenu.categories.map((cat, i) =>
        `<div class="category-tab${popularItems.length === 0 && i === 0 ? ' active' : ''}" onclick="scrollToCategory(${i})" data-cat="${i}">${cat.name}</div>`
    ).join('');

    tabs.innerHTML = tabsHtml;
}

window.scrollToCategory = function(index) {
    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`.category-tab[data-cat="${index}"]`);
    if (tab) tab.classList.add('active');
    const cat = document.getElementById('cat-' + index);
    if (cat) cat.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function renderMenuItem(item) {
    const popularBadge = item.popular ? `<span class="popular-badge">Oblíbené</span>` : '';
    return `
        <div class="menu-item ${item.available === false ? 'menu-item-unavailable' : ''}">
            <div class="menu-item-info">
                <div class="menu-item-name">${item.name}${popularBadge}</div>
                ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
            </div>
            <div class="menu-item-actions">
                <span class="menu-item-price">${item.price} Kč</span>
                ${item.available !== false ? `<button class="add-btn" onclick="addToCart('${escapeHtml(item.name)}', ${item.price})" title="Přidat do košíku">+</button>` : ''}
            </div>
        </div>
    `;
}

function renderMenuItems() {
    if (!currentMenu || !currentMenu.categories) return;
    const container = document.getElementById('menu-items');

    let html = '';

    // Render "Oblíbené" section first if there are popular items
    const popularItems = [];
    currentMenu.categories.forEach(cat => {
        cat.items.forEach(item => {
            if (item.popular) popularItems.push(item);
        });
    });

    if (popularItems.length > 0) {
        html += `<div class="menu-category" id="cat-popular">
            <h3>🔥 Oblíbené</h3>
            ${popularItems.map(item => renderMenuItem(item)).join('')}
        </div>`;
    }

    // Render regular categories
    html += currentMenu.categories.map((cat, ci) => `
        <div class="menu-category" id="cat-${ci}">
            <h3>${cat.name}</h3>
            ${cat.items.map(item => renderMenuItem(item)).join('')}
        </div>
    `).join('');

    container.innerHTML = html;
}

// ── Cart ──
function loadCart() {
    try {
        const stored = localStorage.getItem(CART_KEY);
        if (!stored) return { items: [], restaurantId: null, restaurantName: null, updatedAt: 0 };
        const data = JSON.parse(stored);
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
    const freeThreshold = restaurant?.freeDeliveryThreshold || 0;

    document.getElementById('cart-restaurant').textContent = '🏪 ' + (cart.restaurantName || '');

    const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // Free delivery upsell banner
    const bannerEl = document.getElementById('free-delivery-banner');
    if (freeThreshold > 0 && subtotal > 0) {
        if (subtotal >= freeThreshold) {
            bannerEl.innerHTML = `<div class="free-delivery-banner achieved">🎉 Máte dopravu zdarma!</div>`;
        } else {
            const remaining = freeThreshold - subtotal;
            bannerEl.innerHTML = `<div class="free-delivery-banner upsell">🚚 Přidejte ještě ${remaining} Kč pro dopravu zdarma</div>`;
        }
    } else {
        bannerEl.innerHTML = '';
    }

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

    // Calculate delivery: free if above threshold
    const isFreeDelivery = freeThreshold > 0 && subtotal >= freeThreshold;
    const actualDeliveryFee = isFreeDelivery ? 0 : deliveryFee;
    const total = subtotal + actualDeliveryFee;

    const deliveryLabel = isFreeDelivery
        ? `<span class="free-delivery-label">ZDARMA</span>`
        : `${deliveryFee} Kč`;

    let summaryHtml = `
        <div class="cart-summary-row"><span>Mezisoučet</span><span>${subtotal} Kč</span></div>
        <div class="cart-summary-row"><span>Dovoz</span><span>${deliveryLabel}</span></div>
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
    const freeThreshold = restaurant?.freeDeliveryThreshold || 0;
    const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const isFreeDelivery = freeThreshold > 0 && subtotal >= freeThreshold;
    const actualDeliveryFee = isFreeDelivery ? 0 : deliveryFee;
    const total = subtotal + actualDeliveryFee;

    let html = `<h3>🏪 ${cart.restaurantName}</h3>`;
    cart.items.forEach(item => {
        html += `<div class="checkout-item">
            <span>${item.quantity}× ${item.name}</span>
            <span>${item.price * item.quantity} Kč</span>
        </div>`;
    });

    const deliveryLabel = isFreeDelivery ? '<span class="free-delivery-label">ZDARMA</span>' : `${actualDeliveryFee} Kč`;
    html += `<div class="checkout-item" style="border-top:1px solid var(--cream-dark);padding-top:8px;margin-top:4px">
        <span>Dovoz</span><span>${deliveryLabel}</span>
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

        document.getElementById('confirm-order-id').textContent = data.orderId;
        showView('view-confirmation');

        cart = { items: [], restaurantId: null, restaurantName: null, updatedAt: 0 };
        saveCart();
        updateCartUI();

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
