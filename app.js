// Mock Data for the prototype
const locations = [
    {
        name: "Bryant Park Public Station",
        address: "42nd St & 6th Ave",
        wait: "Short Wait",
        amenities: ["baby", "free", "charging"],
        open: true
    },
    {
        name: "Grand Central - Lower Level",
        address: "89 E 42nd St",
        wait: "Busy",
        amenities: ["mta", "baby"],
        open: true
    }
];

// Elements
const markers = document.querySelectorAll('.marker');
const panel = document.getElementById('detail-panel');
const placeName = document.getElementById('place-name');
const amenityList = document.getElementById('amenity-list');

// Show Panel Logic
markers.forEach((marker, index) => {
    marker.addEventListener('click', () => {
        const data = locations[index] || locations[0];
        showDetails(data);
    });
});

function showDetails(data) {
    placeName.textContent = data.name;
    document.getElementById('place-address').textContent = data.address;
    document.getElementById('wait-time').textContent = data.wait;
    
    // Clear and build amenities
    amenityList.innerHTML = '';
    data.amenities.forEach(type => {
        let icon = document.createElement('i');
        icon.className = `fas fa-${type === 'baby' ? 'baby-carriage' : type === 'mta' ? 'subway' : 'bolt'} amenity-icon`;
        icon.style.marginRight = "15px";
        icon.style.fontSize = "1.2rem";
        icon.style.color = "#666";
        amenityList.appendChild(icon);
    });

    panel.classList.remove('hidden');
}

// Interaction: Close panel if clicking map
document.getElementById('map-view').addEventListener('click', (e) => {
    if(e.target.id === 'map-view') {
        panel.classList.add('hidden');
    }
});

// Feedback Loop Logic
document.getElementById('report-busy').addEventListener('click', function() {
    this.textContent = "Reported!";
    this.style.backgroundColor = "#ffeaa7";
    setTimeout(() => {
        this.textContent = "Report Busy";
        this.style.backgroundColor = "#eee";
    }, 2000);
});
