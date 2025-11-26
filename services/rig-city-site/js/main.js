(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        updateCopyrightYear();
        initMobileMenu();
        initSmoothScroll();
        initCardGlowEffects();
        initScrollAnimations();
        initHeaderScroll();
    });

    function updateCopyrightYear() {
        var yearElement = document.getElementById('current-year');
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
    }

    function initMobileMenu() {
        var toggle = document.querySelector('.mobile-menu-toggle');
        var navLinks = document.getElementById('nav-links');
        
        if (!toggle || !navLinks) return;

        toggle.addEventListener('click', function() {
            var isExpanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', !isExpanded);
            navLinks.classList.toggle('active');
        });

        navLinks.querySelectorAll('.nav-link').forEach(function(link) {
            link.addEventListener('click', function() {
                toggle.setAttribute('aria-expanded', 'false');
                navLinks.classList.remove('active');
            });
        });

        document.addEventListener('click', function(e) {
            if (!toggle.contains(e.target) && !navLinks.contains(e.target)) {
                toggle.setAttribute('aria-expanded', 'false');
                navLinks.classList.remove('active');
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && navLinks.classList.contains('active')) {
                toggle.setAttribute('aria-expanded', 'false');
                navLinks.classList.remove('active');
                toggle.focus();
            }
        });
    }

    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                var targetId = this.getAttribute('href');
                if (targetId === '#') return;
                
                var targetElement = document.querySelector(targetId);
                if (targetElement) {
                    e.preventDefault();
                    var headerOffset = 80;
                    var elementPosition = targetElement.getBoundingClientRect().top;
                    var offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });

                    targetElement.setAttribute('tabindex', '-1');
                    targetElement.focus({ preventScroll: true });
                }
            });
        });
    }

    function initCardGlowEffects() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        document.querySelectorAll('.card').forEach(function(card) {
            var cardGlow = card.querySelector('.card-glow');
            if (!cardGlow) return;
            
            card.addEventListener('mousemove', function(e) {
                var rect = card.getBoundingClientRect();
                var x = e.clientX - rect.left;
                var y = e.clientY - rect.top;
                cardGlow.style.left = (x - cardGlow.offsetWidth / 2) + 'px';
                cardGlow.style.top = (y - cardGlow.offsetHeight / 2) + 'px';
            });
        });
    }

    function initScrollAnimations() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (!('IntersectionObserver' in window)) return;

        var observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        document.querySelectorAll('.about, .community, .events').forEach(function(section) {
            section.style.opacity = '0';
            section.style.transform = 'translateY(30px)';
            section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(section);
        });
        
        document.querySelectorAll('.card').forEach(function(card, index) {
            card.style.opacity = '0';
            card.style.transform = 'translateY(30px)';
            card.style.transition = 'opacity 0.6s ease ' + (index * 0.1) + 's, transform 0.6s ease ' + (index * 0.1) + 's';
            observer.observe(card);
        });
    }

    function initHeaderScroll() {
        var header = document.querySelector('.header');
        if (!header) return;

        var ticking = false;
        
        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    if (window.scrollY > 50) {
                        header.style.background = 'rgba(13, 14, 16, 0.98)';
                        header.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
                    } else {
                        header.style.background = 'rgba(13, 14, 16, 0.95)';
                        header.style.boxShadow = 'none';
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }
})();
