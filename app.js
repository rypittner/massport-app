let globalLocations = [];
let stateInkMap = {}; 
let stateCounts = {};
let placeholderCounter = 0;
let isManualScrolling = false;
let lastHapticId = null;
let activeFilter = 'ALL';
let map;

function triggerHaptic(type = 'light') {
    if (window.navigator && window.navigator.vibrate) {
        if (type === 'light') window.navigator.vibrate(10);
        else if (type === 'medium') window.navigator.vibrate(20);
    }
}

async function init() {
    try {
        // 1. Fetch documents from Appwrite
        const response = await databases.listDocuments(
            CONFIG.DATABASE_ID,
            CONFIG.COLLECTION_ID
        );

        // 2. Map Appwrite columns to our App variables
        globalLocations = response.documents.map(doc => {
            // Logic to extract State from address (e.g., "New York, NY")
            const parts = doc.address ? doc.address.split(',') : [];
            const rawState = parts.length > 1 ? parts.pop().trim().toUpperCase() : 'EU';

            return {
                id: doc.$id,
                name: doc.name,
                note: doc.notes || "",
                imgUrl: doc.img_url || "",
                city: doc.address || "",
                stateName: rawState,
                lat: doc.lat,
                long: doc.long,
                type: 'paper'
            };
        });

        // 3. Sort and process colors (same as before)
        stateCounts = {};
        globalLocations.forEach(l => { 
            stateCounts[l.stateName] = (stateCounts[l.stateName] || 0) + 1; 
        });

        // 4. Render the UI
        renderGrid();
        setupNavigation();
        initMap(); 
    } catch (e) {
        console.error("Appwrite Fetch Error:", e);
    }
}

function setupNavigation() {
    const nav = document.getElementById('filter-nav'), mapAnchor = document.getElementById('map-btn-anchor');
    nav.innerHTML = '<div class="nav-pill-bg" id="nav-pill"></div>';
    
    const isMobile = window.innerWidth <= 600;
    let sortedKeys = Object.keys(stateCounts).sort((a, b) => a === 'EU' ? 1 : b === 'EU' ? -1 : a.localeCompare(b));
    
    let displayKeys = [];
    if (!isMobile) {
        const top5 = sortedKeys.filter(k => k !== 'EU').sort((a,b) => stateCounts[b] - stateCounts[a]).slice(0, 5);
        const others = sortedKeys.filter(k => !top5.includes(k) && k !== 'EU');
        displayKeys = [...top5];
        if(others.length) displayKeys.push('OTHER');
        if(sortedKeys.includes('EU')) displayKeys.push('EU');
    } else {
        displayKeys = sortedKeys;
    }

    displayKeys.forEach(s => {
        const btn = document.createElement('div');
        btn.className = 'nav-tag'; btn.id = `nav-${s}`; btn.dataset.abbr = s;
        const count = s === 'OTHER' ? "" : ` <span>(${stateCounts[s] || '0'})</span>`;
        btn.innerHTML = `${s}${count}`;
        
        btn.onclick = () => { 
            isManualScrolling = true; 
            triggerHaptic('medium'); 
            if(document.body.classList.contains('map-active')) document.body.classList.remove('map-active');
            
            if (isMobile) {
                scrollToGroup(s);
                setActiveNav(btn, stateInkMap[s]);
            } else {
                document.body.classList.add('hide-scroll');
                window.scrollTo({ top: 0, behavior: 'instant' });
                activeFilter = s;
                renderGrid();
                setActiveNav(btn, stateInkMap[s] || '#4478A2');
                setTimeout(() => document.body.classList.remove('hide-scroll'), 50);
            }
            setTimeout(() => isManualScrolling = false, 800); 
        };
        nav.appendChild(btn);
    });

    const mapBtn = document.createElement('div');
    mapBtn.className = 'nav-tag map-tag'; mapBtn.innerText = 'Map';
    mapBtn.onclick = () => { 
        triggerHaptic('medium'); 
        document.body.classList.add('map-active'); 
        setActiveNav(mapBtn, '#4478A2'); 
    };
    mapAnchor.innerHTML = '';
    mapAnchor.appendChild(mapBtn);

    const firstId = isMobile ? sortedKeys[0] : displayKeys[0];
    activeFilter = isMobile ? 'ALL' : firstId;
    setTimeout(() => { const first = document.querySelector(`.nav-tag`); if(first) setActiveNav(first, stateInkMap[first.dataset.abbr]); }, 100);
}

function setActiveNav(el, color) {
    if (!el) return;
    const isMap = el.classList.contains('map-tag');
    const abbr = el.dataset.abbr;
    
    document.querySelectorAll('.nav-tag:not(.map-tag)').forEach(t => { 
        const tAbbr = t.dataset.abbr;
        t.innerHTML = tAbbr === 'OTHER' ? 'OTHER' : `${tAbbr} <span>(${stateCounts[tAbbr] || 0})</span>`; 
        t.classList.remove('active'); 
    });
    
    if (!isMap && abbr && abbr !== 'OTHER') {
        el.innerHTML = `${CONFIG.abbrToState[abbr]} <span>(${stateCounts[abbr]})</span>`;
    }
    el.classList.add('active');
    
    const pill = document.getElementById('nav-pill');
    pill.style.opacity = isMap ? "0" : "1";
    pill.style.width = el.offsetWidth + 'px'; 
    pill.style.left = el.offsetLeft + 'px';
    if(color) pill.style.background = color;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function scrollToGroup(state) {
    const target = document.querySelector(`.stamp-wrapper[data-state="${state}"]`);
    if (target) {
        const grid = document.getElementById('main-grid');
        grid.scrollTo({ left: target.offsetLeft - (window.innerWidth * 0.1), behavior: 'smooth' });
    }
}

function setupAutoNavTracker() {
    if (window.innerWidth > 600) return;
    const root = document.getElementById('main-grid');
    const observer = new IntersectionObserver((entries) => {
        if (isManualScrolling || document.body.classList.contains('map-active')) return;
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const state = entry.target.getAttribute('data-state');
                const navBtn = document.getElementById(`nav-${state}`);
                if (navBtn && lastHapticId !== state) { 
                    setActiveNav(navBtn, stateInkMap[state]); 
                    triggerHaptic('light'); 
                    lastHapticId = state; 
                }
            }
        });
    }, { root: root, threshold: 0.5 });
    document.querySelectorAll('.stamp-wrapper').forEach(el => observer.observe(el));
}

function generateStampHTML(loc, index, delay = 0) {
    const rotation = (Math.random() * 10 - 5).toFixed(2) + 'deg';
    const sealRotation = (Math.random() * 70 - 35).toFixed(2) + 'deg';
    const animStyle = window.innerWidth > 600 ? `style="animation-delay: ${delay}ms"` : '';

    if (loc.type === 'ink') {
        const icon = CONFIG.stateIcons[loc.stateName] || CONFIG.defaultIcons[loc.styleIdx % CONFIG.defaultIcons.length];
        return `<div class="stamp-wrapper state-ink-wrapper animate-in" ${animStyle} data-state="${loc.stateName}" style="--r_deg: ${rotation}"><div class="ink-stamp ink-shape-${loc.styleIdx % 4}" style="--ink-color: ${loc.inkColor}"><div class="ink-stamp-inner"><span class="material-symbols-rounded ink-stamp-icon">${icon}</span><div class="ink-stamp-text-abbr">${loc.stateName}</div><div class="ink-stamp-text-full">${CONFIG.abbrToState[loc.stateName]}</div></div></div></div>`;
    }
    const color = CONFIG.themes[index % CONFIG.themes.length];
    const cityStr = loc.city.split(',')[0].trim();
    return `<div class="stamp-wrapper animate-in" ${animStyle} data-state="${loc.stateName}" style="--r_deg: ${rotation}; --seal-rot: ${sealRotation}"><div class="stamp" style="--theme-color: ${color}" onclick="openModalByIndex(${index})"><div class="stamp-image">${loc.imgUrl ? `<img src="${loc.imgUrl}" class="duotone"><img src="${loc.imgUrl}" class="normal">` : `<div class="placeholder pattern-${(placeholderCounter++ % 4) + 1}" style="--theme-color: ${color}"></div>`}<div class="stamp-title-overlay"><div class="stamp-name">${loc.name}</div>${loc.note ? `<div class="note-container"><div class="stamp-note">${loc.note}</div></div>` : ''}</div></div></div><div class="postmark-seal" onclick="openMap('${loc.name.replace(/'/g, "\\'")}', '${loc.city.replace(/'/g, "\\'")}')"><div class="postmark-content"><div class="postmark-line"></div><div class="postmark-text">${cityStr}</div><div class="postmark-line"></div></div></div></div>`;
}

function renderGrid() { 
    const grid = document.getElementById('main-grid');
    const isMobile = window.innerWidth <= 600;
    
    let filtered;
    if (isMobile) {
        filtered = globalLocations;
    } else {
        if (activeFilter === 'OTHER') {
            const top5 = Object.keys(stateCounts).filter(k => k !== 'EU').sort((a,b) => stateCounts[b] - stateCounts[a]).slice(0, 5);
            filtered = globalLocations.filter(l => !top5.includes(l.stateName) && l.stateName !== 'EU');
        } else {
            filtered = globalLocations.filter(l => l.stateName === activeFilter);
        }
    }

    grid.innerHTML = filtered.map((l, i) => generateStampHTML(l, i, i * 60)).join('');
    if(isMobile) setupScrollEffect();
}

function setupScrollEffect() {
    const grid = document.getElementById('main-grid');
    if (window.innerWidth > 600) return;
    let ticking = false;
    const update = () => {
        const wrappers = document.querySelectorAll('.stamp-wrapper');
        const centerX = window.innerWidth / 2;
        wrappers.forEach(w => {
            const rect = w.getBoundingClientRect();
            const cardCenter = rect.left + rect.width / 2;
            const normalized = Math.min(Math.abs(centerX - cardCenter) / (window.innerWidth * 0.6), 1);
            
            if (w.classList.contains('state-ink-wrapper')) { 
                w.style.transform = `scale(${1.0 - (normalized * 0.2)})`; 
                w.style.opacity = 1 - (normalized * 0.4); 
            } else { 
                w.style.transform = `scale(${1.1 - (normalized * 0.3)}) translateY(${-10 + (normalized * 10)}px)`; 
                w.style.opacity = 1 - (normalized * 0.2);
            }
            
            if (normalized < 0.2) { w.classList.add('is-centered'); w.style.zIndex = "100"; }
            else { w.classList.remove('is-centered'); w.style.zIndex = "1"; }
        });
        ticking = false;
    };
    grid.addEventListener('scroll', () => { if (!ticking) { window.requestAnimationFrame(update); ticking = true; } }, { passive: true });
    update();
}

function scrollGrid(dir) {
    const grid = document.getElementById('main-grid');
    const itemWidth = window.innerWidth * 0.8; 
    grid.scrollBy({ left: itemWidth * dir, behavior: 'smooth' });
    triggerHaptic('light');
}

function initMap() { 
    map = L.map('map', { attributionControl: false, zoomControl: false }).setView([39.8283, -98.5795], 4); 
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png').addTo(map); 
}

function openMap(n, c) { 
    triggerHaptic('medium'); 
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n + ', ' + c)}`, '_blank'); 
}

function openModalByIndex(idx) {
    triggerHaptic('medium'); 
    const loc = globalLocations[idx]; 
    if (loc.type === 'ink' || !loc.imgUrl) return;
    document.getElementById('img01').src = loc.imgUrl;
    document.getElementById('caption').innerHTML = `<h2 style="margin:0; line-height:1.2; text-align:center;">${loc.name}</h2>${loc.note ? `<div style="font-family:'Inter', sans-serif; font-size:14px; opacity:0.9; margin-top:8px; text-align:center;">${loc.note}</div>` : ''}<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name + ', ' + loc.city)}" target="_blank" class="modal-city-pill"><span class="material-symbols-rounded" style="font-size:16px;">location_on</span>${loc.city}</a>`;
    document.getElementById('myModal').style.display = 'flex';
}

document.querySelector('.close').onclick = () => document.getElementById('myModal').style.display = 'none';

window.addEventListener('resize', () => {
     setupNavigation();
     renderGrid(); 
     setupAutoNavTracker();
});

init();
