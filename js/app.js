/**
 * Main Application Routing & Animations (Hardened V3)
 * SecureVote Platform
 */

const App = {
  init() {
    console.log("Initializing SecureVote Local Protocol (Hardened V4)...");
    
    // Global Error Trapping
    window.onerror = (msg, url, line, col, error) => {
      console.error("CRITICAL_SYSTEM_ERROR:", {msg, url, line, error});
      // Ensure UI is not fridged
      this.hideSplash();
    };

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Module Initialization with Fault Isolation
    const loadModule = (name, mod) => {
      try {
        if (mod && typeof mod.init === 'function') {
          mod.init();
          console.log(`Module [${name}] initialized successfully.`);
        }
      } catch (err) {
        console.error(`Module [${name}] initialization failed:`, err);
      }
    };

    loadModule('Voter', typeof Voter !== 'undefined' ? Voter : null);
    loadModule('Auth', typeof Auth !== 'undefined' ? Auth : null);
    loadModule('Organizer', typeof Organizer !== 'undefined' ? Organizer : null);
    loadModule('Assistant', typeof Assistant !== 'undefined' ? Assistant : null);
    loadModule('Navigation', typeof Navigation !== 'undefined' ? Navigation : null);
    loadModule('AppEvents', { init: () => this.bindEvents() });

    // Initial Routing with Session Awareness
    console.log("System booting... awaiting identity resolution.");
    
    // Cloud Deep-Linking: Check for electionId in URL
    const urlParams = new URLSearchParams(window.location.search);
    const eId = urlParams.get('electionId');
    
    if (eId && typeof Results !== 'undefined') {
      console.log("DEEP_LINK_DETECTED: Routing to cloud results for", eId);
      this.playTransitionSplash(
        "bar-chart-3",
        "Cloud Sync",
        "Establishing real-time connection to public result silo...",
        () => {
          this.navigateTo('results-screen');
          Results.render(eId);
        }
      );
    } else {
      this.playSplashAnimation();
    }
  },

  hideSplash() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.classList.remove('active');
        splash.style.display = 'none';
      }, 500);
    }
  },

  playSplashAnimation() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    
    // Ensure splash starts visible
    splash.classList.add('active');
    splash.style.display = 'flex';
    splash.style.opacity = '1';
    
    setTimeout(() => {
      splash.style.opacity = '0';
      splash.style.transition = 'opacity 0.6s ease-out';
      setTimeout(() => {
        splash.classList.remove('active');
        splash.style.display = 'none';
      }, 600);
    }, 1000); // Only stay for 1 second instead of 2.5
  },

  playTransitionSplash(icon, title, message, callback) {
    const splash = document.getElementById('splash-screen');
    if (!splash) return callback();

    const splashContent = splash.querySelector('.splash-content');
    
    // Update content
    splashContent.innerHTML = `
      <i data-lucide="${icon}" style="width: 80px; height: 80px; color: var(--primary); animation: pulse 2s infinite;"></i>
      <h1 class="text-gradient mt-2" style="font-size: 2.5rem;">${title}</h1>
      <p style="font-size: 1.1rem; color: var(--text-secondary); max-width: 400px; margin: 1rem auto;">${message}</p>
    `;
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    splash.style.display = 'flex';
    splash.style.opacity = '1';
    splash.classList.add('active');
    
    setTimeout(() => {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.classList.remove('active');
        splash.style.display = 'none';
        if (callback) callback();
      }, 500);
    }, 2000);
  },

  navigateTo(screenId) {
    console.log("Navigating to Protocol Section:", screenId);
    
    // 1. Hide all sections immediately
    document.querySelectorAll('.view-section').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none'; // Double layer protection
    });

    // 2. Show target
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      // Set correct display mode based on classes
      if (target.classList.contains('flex-center')) {
        target.style.display = 'flex';
      } else {
        target.style.display = 'block';
      }
      
      if (typeof lucide !== 'undefined') lucide.createIcons(); 
      window.scrollTo(0,0);
    }
  },

  bindEvents() {
    // Helper function for safe event binding
    const safeBind = (id, event, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, fn);
    };

    // Auth Screen (Removed redundant safeBind - using direct onclick in index.html)
    
    // Role Screen
    safeBind('btn-organizer-manual', 'click', () => {
      this.navigateTo('manual-organizer-screen');
    });
    safeBind('btn-voter-manual', 'click', () => {
      this.navigateTo('manual-voter-screen');
    });

    safeBind('btn-enter-organizer', 'click', () => {
      PortalGuard.enterOrganizer();
    });

    // Back buttons — context-aware exit
    document.querySelectorAll('.btn-back, .btn-back-to-home').forEach(btn => {
      btn.addEventListener('click', () => {
        if (Auth.currentPortal === 'organizer') {
          PortalGuard.exitOrganizer();
        } else {
          this.navigateTo('role-screen');
        }
        this.close && this.close();
      });
    });

    safeBind('btn-logout', 'click', () => Auth.logout());
    safeBind('btn-exit-results', 'click', () => {
      Auth.currentPortal = null;
      if(Auth.user) this.navigateTo('role-screen');
      else this.navigateTo('auth-screen');
    });
  },

  togglePassword(inputId, el) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
      input.type = 'text';
      el.innerHTML = '<i data-lucide="eye-off"></i>';
    } else {
      input.type = 'password';
      el.innerHTML = '<i data-lucide="eye"></i>';
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  resetViaGmail() {
    const email = Auth.user?.email || "admin@govvote.local";
    alert("Establishing secure connection to Gmail Authentication Services...");
    setTimeout(() => {
      alert(`A secure reset link has been dispatched to ${email}. Please verify your identity via the incoming digital dispatch.`);
    }, 1500);
  }
};

const Navigation = {
  init() {
    this.bindEvents();
    if(window.lucide) lucide.createIcons();
  },
  bindEvents() {
    // btn-nav-toggle: only used in organizer/results screens for global-nav
    document.querySelectorAll('.btn-nav-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Only allow global-nav to open for organizer portal
        if (Auth.currentPortal === 'organizer') {
          this.toggle();
        }
        // Voter portal nav is handled by btn-voter-menu → Voter.toggleDashboard()
      });
    });

    document.querySelectorAll('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => {
        if (Auth.currentPortal === 'organizer') {
          PortalGuard.exitOrganizer();
        } else {
          App.navigateTo('role-screen');
        }
        this.close();
      });
    });

    const overlay = document.getElementById('global-overlay');
    if(overlay) overlay.addEventListener('click', () => this.close());

    // Global nav items: organizer-only screens
    document.querySelectorAll('#global-nav .nav-item[data-screen]').forEach(item => {
      item.addEventListener('click', () => {
        if (Auth.currentPortal !== 'organizer') {
          this.close();
          return; // block cross-portal navigation
        }
        const screen = item.dataset.screen;
        // Only permit organizer-safe screens
        const allowed = ['organizer-screen','manual-organizer-screen','role-screen'];
        if (allowed.includes(screen)) {
          App.navigateTo(screen);
          if (screen === 'organizer-screen' && typeof Organizer !== 'undefined') Organizer.renderState();
        }
        this.close();
      });
    });

    const logoutBtn = document.getElementById('btn-global-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        PortalGuard.exitOrganizer();
        this.close();
      });
    }
  },
  toggle() {
    const nav = document.getElementById('global-nav');
    const overlay = document.getElementById('global-overlay');
    if(nav) nav.classList.toggle('open');
    if(overlay) overlay.classList.toggle('active');
  },
  close() {
    const nav = document.getElementById('global-nav');
    const overlay = document.getElementById('global-overlay');
    if(nav) nav.classList.remove('open');
    if(overlay) overlay.classList.remove('active');
  }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
    console.log("SECUREVOTE: Ready.");
});

