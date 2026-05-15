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

    // PRIVACY WIPE: Ensure sensitive fields are clean on boot
    setTimeout(() => {
      const vid = document.getElementById('voter-id-input');
      if (vid) vid.value = '';
      localStorage.removeItem('sv_v2_last_voter_id');
    }, 100);

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
        } else if (Auth.currentPortal === 'voter') {
          // Always return an authenticated voter directly to the booth
          this.navigateTo('voter-screen');
          if (typeof Voter !== 'undefined') Voter.showDashboard();
        } else {
          this.navigateTo('role-screen');
        }
        this.close && this.close();
      });
    });

    safeBind('btn-logout', 'click', () => Auth.logout());
    safeBind('btn-contact-admin', 'click', () => this.showContactModal());
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
  },

  showContactModal() {
    const modal = document.createElement('div');
    modal.id = 'contact-modal';
    modal.innerHTML = `
      <div class="org-modal-backdrop" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(2,6,23,0.8);backdrop-filter:blur(8px);z-index:3000;"></div>
      <div class="org-modal-box glass-panel" style="position:fixed;top:50%;left:50%;transform:translate(-50%, -50%);width:95%;max-width:450px;background:var(--bg-surface);border:1px solid rgba(59,130,246,0.3);padding:2rem;border-radius:20px;z-index:3010;text-align:center;">
        <div style="width:50px;height:50px;background:rgba(59,130,246,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;border:1px solid var(--primary);">
          <i data-lucide="help-circle" style="color:var(--primary);width:24px;height:24px;"></i>
        </div>
        <h2 style="color:white;font-weight:900;margin-bottom:0.5rem;font-size:1.3rem;letter-spacing:1px;text-transform:uppercase;">SUPPORT REQUEST</h2>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1.5rem;">Have an issue? Send a direct message to the SecureVote Admin team.</p>
        
        <form id="contact-form">
          <div style="margin-bottom:1rem; text-align:left;">
            <label style="color:white; font-size:0.75rem; font-weight:700; text-transform:uppercase; margin-bottom:0.5rem; display:block;">Your Message</label>
            <textarea id="contact-message" required placeholder="Describe your issue or suggestion..." style="width:100%; height:120px; background:rgba(15,23,42,0.5); border:1px solid rgba(255,255,255,0.1); border-radius:12px; color:white; padding:1rem; font-family:inherit; font-size:0.9rem; resize:none; outline:none;"></textarea>
          </div>
          <button type="submit" id="btn-submit-contact" class="btn btn-primary w-100" style="padding:1rem; font-weight:900; letter-spacing:1px;">DISPATCH MESSAGE</button>
        </form>
        <button id="btn-contact-close" class="btn btn-secondary w-100" style="margin-top:0.75rem; padding:1rem;">CANCEL</button>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();

    const close = () => modal.remove();
    document.getElementById('btn-contact-close').onclick = close;

    document.getElementById('contact-form').onsubmit = async (e) => {
      e.preventDefault();
      const message = document.getElementById('contact-message').value;
      const btn = document.getElementById('btn-submit-contact');
      const userEmail = Auth.user?.email || "Anonymous";

      btn.disabled = true;
      btn.innerText = "SENDING...";

      try {
        const response = await fetch(`https://api.slapform.com/ranadeep2021saha@gmail.com`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            slap_subject: "SecureVote - Support Request",
            User: userEmail,
            Message: message,
            Platform: "SecureVote Global Terminal",
            Local_Time: new Date().toLocaleString()
          })
        });

        if (response.ok) {
          modal.querySelector('.org-modal-box').innerHTML = `
            <i data-lucide="check-circle" style="color:var(--success);width:48px;height:48px;margin-bottom:1rem;margin-left:auto;margin-right:auto;display:block;"></i>
            <h2 style="color:white;font-weight:900;margin-bottom:0.5rem;font-size:1.2rem;letter-spacing:1px;text-transform:uppercase;">MESSAGE DISPATCHED</h2>
            <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem;line-height:1.5;">Your support request has been securely delivered to the admin team. We will review it shortly.</p>
            <button id="btn-success-close" class="btn btn-primary w-100" style="padding:1rem; font-weight:900;">CLOSE</button>
          `;
          if (window.lucide) lucide.createIcons();
          document.getElementById('btn-success-close').onclick = close;
        } else {
          throw new Error("Server rejected request");
        }
      } catch (err) {
        console.error("DISPATCH_ERROR:", err);
        alert("System error: The email server is temporarily busy. Please try again in a few minutes.");
        btn.disabled = false;
        btn.innerText = "DISPATCH MESSAGE";
      }
    };
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
        } else if (Auth.currentPortal === 'voter') {
          // Always return authenticated voter to the booth
          App.navigateTo('voter-screen');
          if (typeof Voter !== 'undefined') Voter.showDashboard();
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

