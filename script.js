async function fetchRestrooms() {
    const list = document.getElementById('restroom-list');
    
    // We fetch everything from your restrooms table
    // Including specific fields for wait_time and diapers
    const { data, error } = await _supabase
        .from('restrooms')
        .select('*');

    if (error) {
        list.innerHTML = `<p>Error connecting to NYC Data: ${error.message}</p>`;
        return;
    }

    renderUI(data);
}

function renderUI(bathrooms) {
    const list = document.getElementById('restroom-list');
    list.innerHTML = '';

    bathrooms.forEach(place => {
        const card = document.createElement('div');
        card.className = 'restroom-card';
        
        // Logic for Wait Time colors
        const waitColor = place.wait_minutes > 15 ? 'var(--danger)' : 'var(--success)';

        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h3 style="margin:0">${place.name}</h3>
                    <small style="color: #8E8E93">${place.address}</small>
                </div>
                <span class="status-tag" style="background: #E8F5E9; color: var(--success)">
                    ${place.is_paid ? '💰 PAID' : '🆓 FREE'}
                </span>
            </div>

            <div class="wait-time" style="color: ${waitColor}">
                ⏱ Est. Wait: ${place.wait_minutes || 0} mins
            </div>

            <div class="amenity-icons">
                ${place.baby_changing ? '🍼' : ''}
                ${place.accessibility ? '♿' : ''}
                ${place.mta_access ? '🚇' : ''}
                ${place.charging_station ? '⚡' : ''}
            </div>

            <button class="nav-btn" onclick="window.open('https://maps.google.com/?q=${place.latitude},${place.longitude}')">
                GO NOW 🗺️
            </button>
        `;
        list.appendChild(card);
    });
}

// Simple search filter
document.getElementById('searchInput').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('.restroom-card');
    cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        card.style.display = text.includes(term) ? 'block' : 'none';
    });
});

document.addEventListener('DOMContentLoaded', fetchRestrooms);
