
// Update copyright year dynamically
document.addEventListener('DOMContentLoaded', function() {
    const yearElement = document.getElementById('current-year');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
    
    // Initialize whoami typing animation
    initWhoamiTyping();
    
    // Initialize proximity glow cards
    initProximityGlow();
});

// ========================================
// WHOAMI TYPING ANIMATION
// ========================================
function initWhoamiTyping() {
    const cmdElement = document.getElementById('whoami-cmd');
    const outputElement = document.getElementById('whoami-output');
    
    if (!cmdElement || !outputElement) return;
    
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
    
    // Use IntersectionObserver to trigger animation when element is visible
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Add typing animation class
                cmdElement.classList.add('typing-animation');
                
                // After typing completes (1s), remove typing cursor
                setTimeout(() => {
                    cmdElement.style.borderRight = 'none';
                    const promptCursor = document.getElementById('prompt-cursor');
                    if (promptCursor) {
                        promptCursor.style.display = 'none';
                    }
                }, 1000);
                
                // When output fades in (1.5s), show cursor on output line
                setTimeout(() => {
                    const outputCursor = document.getElementById('output-cursor');
                    if (outputCursor) {
                        outputCursor.style.display = 'inline';
                    }
                }, 1500);
                
                // Disconnect observer after first trigger
                observer.disconnect();
            }
        });
    }, { threshold: 0.5 });
    
    observer.observe(cmdElement);
}

// ========================================
// PROXIMITY GLOW EFFECT
// ========================================
function initProximityGlow() {
    const cards = document.querySelectorAll('.proximity-glow-card');
    
    cards.forEach(card => {
        const glowColor = card.getAttribute('data-glow-color') || '0, 255, 136';
        card.style.setProperty('--glow-color', glowColor);
        
        let rafId = null;
        let rect = null;
        
        // Cache rect on mouseenter
        card.addEventListener('mouseenter', () => {
            rect = card.getBoundingClientRect();
        });
        
        // Track mouse movement
        card.addEventListener('mousemove', (e) => {
            if (rafId) return; // Throttle using RAF
            
            rafId = requestAnimationFrame(() => {
                if (!rect) rect = card.getBoundingClientRect();
                
                // Calculate cursor position relative to card
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Calculate cursor position as percentage
                const xPercent = (x / rect.width) * 100;
                const yPercent = (y / rect.height) * 100;
                
                // Calculate distance to nearest edge for border glow intensity
                const distanceToLeft = x;
                const distanceToRight = rect.width - x;
                const distanceToTop = y;
                const distanceToBottom = rect.height - y;
                
                // Find minimum distance to any edge
                const minDistanceToEdge = Math.min(
                    distanceToLeft,
                    distanceToRight,
                    distanceToTop,
                    distanceToBottom
                );
                
                // Maximum possible distance (to determine falloff)
                const maxDistance = 150; // pixels from edge where glow starts to fade
                
                // Calculate intensity (1.0 at edge, fades to 0 at maxDistance)
                const intensity = Math.max(0, Math.min(1.0, 1 - (minDistanceToEdge / maxDistance)));
                
                // Update CSS variables
                card.style.setProperty('--cursor-x', `${xPercent}%`);
                card.style.setProperty('--cursor-y', `${yPercent}%`);
                card.style.setProperty('--glow-intensity', intensity);
                
                rafId = null;
            });
        });
        
        // Reset on mouseleave
        card.addEventListener('mouseleave', () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            card.style.setProperty('--glow-intensity', '0');
            rect = null;
        });
    });
}

// ========================================
// LIGHTBOX GALLERY VIEWER
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    initLightboxGallery();
});

function initLightboxGallery() {
    const galleryItems = document.querySelectorAll('.gallery-item img');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.getElementById('lightbox-close');
    const lightboxPrev = document.getElementById('lightbox-prev');
    const lightboxNext = document.getElementById('lightbox-next');
    const lightboxCounter = document.getElementById('lightbox-counter');
    
    if (!galleryItems.length || !lightbox) return;
    
    let currentIndex = 0;
    const images = Array.from(galleryItems).map(img => ({
        src: img.src,
        alt: img.alt
    }));
    
    // Open lightbox when clicking on gallery image
    galleryItems.forEach((img, index) => {
        img.addEventListener('click', () => {
            currentIndex = index;
            openLightbox();
        });
    });
    
    function openLightbox() {
        lightbox.classList.add('active');
        updateImage();
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }
    
    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
    }
    
    function updateImage() {
        lightboxImg.src = images[currentIndex].src;
        lightboxImg.alt = images[currentIndex].alt;
        lightboxCounter.textContent = `${currentIndex + 1} / ${images.length}`;
    }
    
    function showNext() {
        currentIndex = (currentIndex + 1) % images.length;
        updateImage();
    }
    
    function showPrev() {
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        updateImage();
    }
    
    // Close button
    lightboxClose.addEventListener('click', closeLightbox);
    
    // Navigation buttons
    lightboxNext.addEventListener('click', showNext);
    lightboxPrev.addEventListener('click', showPrev);
    
    // Click outside image to close
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        
        switch(e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case 'ArrowRight':
                showNext();
                break;
            case 'ArrowLeft':
                showPrev();
                break;
        }
    });
}
