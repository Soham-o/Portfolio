document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. THEME LOGIC ---
    const body = document.body;
    const themeBtn = document.getElementById('theme-switcher');
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'light') {
        body.classList.remove('dark-mode');
    } else {
        body.classList.add('dark-mode');
    }

    if(themeBtn){
        themeBtn.addEventListener('click', () => {
            body.classList.toggle('dark-mode');
            localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
    }

    // --- 2. PAGE TRANSITIONS ---
    const loader = document.querySelector('.transition-loader');
    
    // A. ENTRANCE
    if(loader) {
        loader.classList.add('transition-active');
        setTimeout(() => {
            loader.classList.remove('transition-active');
        }, 1500);
    }

    // B. EXIT (Fixed Timing)
    const links = document.querySelectorAll('a');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            const target = link.getAttribute('target');

            // Only hijack internal links
            if (loader && href && !href.startsWith('#') && target !== '_blank' && !href.includes('mailto')) {
                e.preventDefault();
                
                // 1. Play Exit Animation
                loader.classList.add('transition-exit');
                
                // 2. Wait 0.6s then go (Matches CSS animation speed better)
                setTimeout(() => {
                    window.location.href = href;
                }, 600); 
            }
        });
    });

    // --- 3. TIMELINE SCROLL LOGIC ---
    function setupTimeline(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;

        const container = section.querySelector('.timeline-container');
        const lineProgress = section.querySelector('.scroll-line-progress');
        const items = section.querySelectorAll('.timeline-item');

        window.addEventListener('scroll', () => {
            const rect = container.getBoundingClientRect();
            const startPoint = window.innerHeight * 0.8; 
            let scrollY = startPoint - rect.top;
            let percentage = (scrollY / (rect.height * 1.2)) * 100;
            percentage = Math.max(0, Math.min(percentage, 100));

            lineProgress.style.height = `${percentage}%`;

            items.forEach(item => {
                if (item.getBoundingClientRect().top < startPoint) item.classList.add('active');
                else item.classList.remove('active');
            });
        });
    }

    setupTimeline('experience');
    setupTimeline('education');
    
    // --- 4. STATS LOGIC ---
    const statsSection = document.querySelector('.stats-row');
    const statNumbers = document.querySelectorAll('.stat-num');
    let started = false;

    if(statsSection) {
        window.addEventListener('scroll', () => {
            if(statsSection.getBoundingClientRect().top < window.innerHeight && !started) {
                statNumbers.forEach(num => {
                    let start = 0; 
                    let end = parseInt(num.getAttribute('data-val'));
                    let duration = 2000;
                    let interval = setInterval(() => {
                        start += 1;
                        num.textContent = start;
                        if(start == end) clearInterval(interval);
                    }, duration/end);
                });
                started = true;
            }
        });
    }
});