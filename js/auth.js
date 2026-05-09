/**
 * Authentication & Portal Security Module — SecureVote V5
 * Two fully isolated portals: ORGANIZER and VOTER.
 * No cross-access. No shared nav. Enforced at the JS layer.
 */

// ── ORGANIZER CODE SECURITY ──────────────────────────────────────────────────
const ORGANIZER_CODE_KEY = 'sv_v2_org_code';
const DEFAULT_ORGANIZER_CODE = 'LOCKED-SETUP'; // FORCES INITIAL GENERATION

function getOrgCode() {
  return localStorage.getItem(ORGANIZER_CODE_KEY) || DEFAULT_ORGANIZER_CODE;
}

async function updateOrgCode(newCode) {
  localStorage.setItem(ORGANIZER_CODE_KEY, newCode);
  if (Auth.user) {
    try {
      await firebase.firestore().collection('organizers').doc(Auth.user.uid).set({
        orgCode: newCode,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log("Cloud Protocol: Organizer Code synchronized.");
    } catch (e) {
      console.error("Cloud Error: Sync failed:", e);
    }
  }
}

// ── AUTH MODULE ──────────────────────────────────────────────────────────────
const Auth = {
  user: null,
  currentPortal: null,

  init() {
    const firebaseConfig = {
      apiKey: "AIzaSyDHCxFew7y__URVLtkppM4Awto_YgydVzo",
      authDomain: "vote-787d4.firebaseapp.com",
      projectId: "vote-787d4",
      storageBucket: "vote-787d4.firebasestorage.app",
      messagingSenderId: "259413242565",
      appId: "1:259413242565:web:9e3f17605be545f42076ac",
      measurementId: "G-DTBMKYWRGD"
    };
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("Cloud Infrastructure: ONLINE");
      }
      this.monitorAuthState();
    } catch (e) {
      console.error("Firebase initialization failed:", e);
    }
  },

  monitorAuthState() {
    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        this.user = user;
        console.log("Identity Verified:", user.email);
        if (typeof App !== 'undefined' && App.hideSplash) App.hideSplash();
        
        try {
          const docRef = firebase.firestore().collection('organizers').doc(user.uid);
          const doc = await docRef.get();
          if (doc.exists && doc.data().orgCode) {
            console.log("Cloud Protocol: Master Code Verified.");
            localStorage.setItem(ORGANIZER_CODE_KEY, doc.data().orgCode);
          } else {
            // NEW USER: Permanently lock ORG-2026 in cloud
            console.log("Cloud Protocol: Initializing Official Lock...");
            await docRef.set({
              orgCode: DEFAULT_ORGANIZER_CODE,
              organizerUid: user.uid,
              lastSynced: new Date().toISOString()
            }, { merge: true });
            localStorage.setItem(ORGANIZER_CODE_KEY, DEFAULT_ORGANIZER_CODE);
            console.log("Onboarding: New Organizer Profile Created.");
          }
          // Restore most recent election from Cloud for this user
          await DB.restoreSession();
        } catch (e) {
          console.error("Sync Error:", e);
        }

        if (typeof App !== 'undefined') App.navigateTo('role-screen');
      } else {
        this.user = null;
        if (typeof App !== 'undefined' && App.hideSplash) App.hideSplash();
        if (typeof App !== 'undefined' && App.currentScreen !== 'auth-screen') {
          App.navigateTo('auth-screen');
        }
      }
    });
  },

  isLoggedIn() { return this.user !== null; },

  async loginWithGoogle() {
    try {
      if (this.user) {
        if (typeof App !== 'undefined') App.navigateTo('role-screen');
        return;
      }
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await firebase.auth().signInWithPopup(provider);
      this.user = result.user;
      if (typeof App !== 'undefined') App.navigateTo('role-screen');
    } catch (error) {
      console.error("Auth Error:", error);
      alert("Authentication Failed: " + error.message);
    }
  },

  async logout() {
    if (confirm("Terminate secure session?")) {
      try { await firebase.auth().signOut(); } catch(e) {}
      this.user = null;
      this.currentPortal = null;
      App.navigateTo('auth-screen');
    }
  },

  showSuccessBanner(msg) {
    const banner = document.createElement('div');
    banner.className = 'success-banner';
    banner.style.cssText = `
      position:fixed; top:24px; left:50%; transform:translateX(-50%);
      background:var(--success); color:white; padding:0.85rem 1.5rem;
      border-radius:12px; font-weight:900; z-index:9999;
      box-shadow:0 10px 40px rgba(0,0,0,0.4);
      display:flex; align-items:center; gap:0.75rem; font-size:0.9rem;
      animation: slideDown 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
    `;
    banner.innerHTML = `<i data-lucide="check-circle" style="width:18px;"></i> <span>${msg}</span>`;
    document.body.appendChild(banner);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      banner.style.animation = "slideUp 0.5s forwards";
      setTimeout(() => banner.remove(), 500);
    }, 4500);
  },

  async sendForgotCodeEmail() {
    if (!this.user) return alert("Error: You must be signed in with Google first.");
    
    // Remove existing modals to prevent overlap
    const orgModal = document.getElementById('org-code-modal');
    if (orgModal) orgModal.remove();
    
    const existingRec = document.getElementById('recovery-modal');
    if (existingRec) existingRec.remove();

    // Create a loading state modal
    const modal = document.createElement('div');
    modal.id = 'recovery-modal';
    modal.innerHTML = `
      <div class="org-modal-backdrop" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(2,6,23,0.8);backdrop-filter:blur(8px);z-index:2000;"></div>
      <div class="org-modal-box glass-panel" style="position:fixed;top:50%;left:50%;transform:translate(-50%, -50%);width:90%;max-width:400px;background:var(--bg-surface);border:1px solid rgba(59,130,246,0.3);padding:2rem;border-radius:16px;z-index:2010;text-align:center;">
        <i id="recovery-icon" data-lucide="loader" class="spin" style="color:var(--primary);width:48px;height:48px;margin-bottom:1rem;margin-left:auto;margin-right:auto;display:block;"></i>
        <h2 id="recovery-title" style="color:white;font-weight:900;margin-bottom:0.5rem;font-size:1.2rem;letter-spacing:1px;text-transform:uppercase;">DISPATCHING EMAIL...</h2>
        <p id="recovery-desc" style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem;line-height:1.5;">Securely connecting to the backend server...</p>
        <button id="btn-recovery-close" class="btn btn-secondary" style="width:100%;padding:1rem;font-weight:900;letter-spacing:1px;display:none;">CLOSE</button>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();
    
    const closeBtn = document.getElementById('btn-recovery-close');
    closeBtn.onclick = () => modal.remove();

    try {
      const response = await fetch(`https://formsubmit.co/ajax/${this.user.email}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            _subject: "SecureVote - Organizer Code Recovery",
            _template: "box",
            Organizer_Email: this.user.email,
            Secure_Code: getOrgCode(),
            Timestamp: new Date().toLocaleString()
        })
      });

      const data = await response.json().catch(() => ({}));
      const box = modal.querySelector('.org-modal-box');

      if (response.ok) {
        modal.remove(); // Close loading modal
        this.showSuccessBanner("EMAIL DISPATCHED SUCCESSFULLY!");
        
        // Also show a smaller info modal about activation if needed
        const successModal = document.createElement('div');
        successModal.id = 'recovery-success-modal';
        successModal.innerHTML = `
          <div class="org-modal-backdrop" id="sc-backdrop" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(2,6,23,0.8);backdrop-filter:blur(8px);z-index:2000;"></div>
          <div class="org-modal-box glass-panel" style="position:fixed;top:50%;left:50%;transform:translate(-50%, -50%);width:90%;max-width:400px;background:var(--bg-surface);border:1px solid rgba(34,197,94,0.3);padding:2rem;border-radius:16px;z-index:2010;text-align:center;">
            <i data-lucide="check-circle" style="color:var(--success);width:48px;height:48px;margin-bottom:1rem;margin-left:auto;margin-right:auto;display:block;"></i>
            <h2 style="color:white;font-weight:900;margin-bottom:0.5rem;font-size:1.2rem;letter-spacing:1px;text-transform:uppercase;">CHECK YOUR INBOX</h2>
            <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem;line-height:1.5;">The recovery code has been sent to <b>${this.user.email}</b>.<br><br><span style="color:var(--accent);font-size:0.8rem;"><b>IMPORTANT:</b> If this is your first time, you must click the <b>"Activate Form"</b> button in the email to see your code!</span></p>
            <button id="btn-success-close" class="btn btn-primary" style="width:100%;padding:1rem;font-weight:900;letter-spacing:1px;">GOT IT</button>
          </div>
        `;
        document.body.appendChild(successModal);
        if (window.lucide) lucide.createIcons();
        document.getElementById('btn-success-close').onclick = () => successModal.remove();
        document.getElementById('sc-backdrop').onclick = () => successModal.remove();
      } else {
        throw new Error(data.error || 'Server error');
      }
    } catch (err) {
      const box = modal.querySelector('.org-modal-box');
      box.innerHTML = `
        <i data-lucide="alert-triangle" style="color:var(--error);width:48px;height:48px;margin-bottom:1rem;margin-left:auto;margin-right:auto;display:block;"></i>
        <h2 style="color:white;font-weight:900;margin-bottom:0.5rem;font-size:1.2rem;letter-spacing:1px;text-transform:uppercase;">DISPATCH FAILED</h2>
        <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem;line-height:1.5;">Failed to connect to the email server. Please check your internet connection.</p>
        <button id="btn-fail-close" class="btn btn-primary" style="width:100%;padding:1rem;font-weight:900;letter-spacing:1px;">CLOSE</button>
      `;
      if (window.lucide) lucide.createIcons();
      document.getElementById('btn-fail-close').onclick = () => modal.remove();
    }
  }
};

// ── PORTAL GUARD ─────────────────────────────────────────────────────────────
const PortalGuard = {
  enterOrganizer() {
    this.showOrgModal();
  },

  showOrgModal() {
    const existing = document.getElementById('org-code-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'org-code-modal';
    modal.innerHTML = `
      <div class="org-modal-backdrop" id="org-modal-backdrop"></div>
      <div class="org-modal-box glass-panel">
        <div style="text-align:center; margin-bottom:1.5rem;">
          <div style="width:56px; height:56px; border-radius:50%; background:rgba(59,130,246,0.15); border:2px solid var(--primary); display:flex; align-items:center; justify-content:center; margin:0 auto 1rem;">
            <i data-lucide="lock" style="color:var(--primary); width:24px; height:24px;"></i>
          </div>
          <h2 style="font-weight:900; font-size:1.2rem; color:white; letter-spacing:2px; text-transform:uppercase;">Organizer Access</h2>
          <p style="color:var(--text-secondary); font-size:0.82rem; margin-top:0.5rem; line-height:1.5;">Enter your secure organizer code.</p>
        </div>
        <div class="form-group">
          <input type="password" id="org-code-input" class="form-input" placeholder="Enter code" autocomplete="off" style="text-align:center; letter-spacing:4px; font-weight:900;">
        </div>
        <div id="org-code-error" style="color:var(--error); font-size:0.8rem; font-weight:700; text-align:center; margin-bottom:0.75rem; display:none;">⚠️ Access denied.</div>
        <button id="org-code-submit" class="btn btn-primary w-100" style="margin-bottom:0.75rem;">VERIFY & ENTER</button>
        <button id="org-code-cancel" class="btn btn-secondary w-100">CANCEL</button>
        <div style="margin-top:1.25rem; text-align:center; border-top:1px solid rgba(255,255,255,0.1); pt-3;">
          <button id="btn-forgot-code-action" class="btn btn-secondary btn-sm w-100" style="color:var(--primary); margin-top:1rem;">FORGOT CODE? RECOVER NOW</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();

    const input = document.getElementById('org-code-input');
    const error = document.getElementById('org-code-error');
    setTimeout(() => { if (input) input.focus(); }, 100);

    const handleSubmit = () => {
      if (input.value.trim().toUpperCase() === getOrgCode().trim().toUpperCase()) {
        modal.remove();
        Auth.currentPortal = 'organizer';
        App.navigateTo('organizer-screen');
        if (typeof Organizer !== 'undefined') Organizer.renderState();
      } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
      }
    };

    document.getElementById('org-code-submit').addEventListener('click', handleSubmit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });
    document.getElementById('org-code-cancel').addEventListener('click', () => modal.remove());
    document.getElementById('btn-forgot-code-action').addEventListener('click', () => Auth.sendForgotCodeEmail());
    document.getElementById('org-modal-backdrop').addEventListener('click', () => modal.remove());
  },

  requireOrganizer() {
    if (Auth.currentPortal !== 'organizer') {
      alert('🚫 Access denied.');
      App.navigateTo('role-screen');
      return false;
    }
    return true;
  },

  exitOrganizer() {
    Auth.currentPortal = null;
    App.navigateTo('role-screen');
  },

  enterVoter() {
    Auth.currentPortal = 'voter';
  },

  exitVoter() {
    Auth.currentPortal = null;
    if (typeof Voter !== 'undefined') Voter.activeVoterId = null;
    App.navigateTo('role-screen');
  }
};
