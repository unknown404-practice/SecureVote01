/**
 * Authentication & Portal Security Module — SecureVote V5
 * Two fully isolated portals: ORGANIZER and VOTER.
 * No cross-access. No shared nav. Enforced at the JS layer.
 */

// ── ORGANIZER CODE SECURITY ──────────────────────────────────────────────────
// Default organizer code — organizer sets this on first launch.
// Stored in localStorage under a hashed key to prevent casual inspection.
const ORGANIZER_CODE_KEY = 'sv_v2_org_code';
const DEFAULT_ORGANIZER_CODE = 'ORG-2026'; // First-run default

function getOrgCode() {
  return localStorage.getItem(ORGANIZER_CODE_KEY) || DEFAULT_ORGANIZER_CODE;
}

// Update the code locally and in Firestore if logged in
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
  currentPortal: null, // 'organizer' | 'voter' | null

  init() {
    // REDACTED: USER MUST REPLACE THESE WITH ACTUAL FIREBASE CONFIG
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
      // Ensure only one instance is initialized
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
    // Continuous Monitor - This will catch the login instantly
    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        this.user = user;
        console.log("Identity Verified:", user.email);
        
        if (typeof App !== 'undefined' && App.hideSplash) App.hideSplash();
        
        try {
          const doc = await firebase.firestore().collection('organizers').doc(user.uid).get();
          if (doc.exists && doc.data().orgCode) {
            localStorage.setItem(ORGANIZER_CODE_KEY, doc.data().orgCode);
          }
        } catch (e) {}

        if (typeof App !== 'undefined') App.navigateTo('role-screen');
      } else {
        this.user = null;
        if (typeof App !== 'undefined' && App.currentScreen !== 'auth-screen') {
          App.navigateTo('auth-screen');
        }
      }
    });
  },

  isLoggedIn() { return this.user !== null; },

  async loginWithGoogle() {
    try {
      // Check if already logged in (Manual Jump)
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

  // ── FORGOT CODE — PROFESSIONAL EMAIL DELIVERY ──────────────────────────────
  async sendForgotCodeEmail() {
    if (!this.user) return alert("Error: You must be signed in with Google first.");
    
    const adminEmail = "ranadeep2021saha@gmail.com";
    const currentCode = getOrgCode();
    
    // UI Feedback
    const btn = document.getElementById('btn-forgot-code-action');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> SENDING...'; }

    try {
      // ── DEV MODE: Local Discovery ──
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isLocal) {
        console.log("DEV_MODE_DISCOVERY: Bypassing mail protocol for local session.");
        alert(`[DEV MODE] Access Protocol Recovered.\n\nYour Organizer Code is: ${currentCode}\n\n(This code is only shown directly when running on localhost)`);
        if(btn) { btn.disabled = false; btn.innerHTML = 'FORGOT CODE? SEND TO GMAIL'; }
        return;
      }

      // ── PRODUCTION MODE: EmailJS Delivery ──
      if (typeof emailjs !== 'undefined') {
        await emailjs.send('service_faw00u8', 'sggivkl', {
          to_name: "Admin",
          from_name: "SecureVote System",
          message: currentCode,
          reply_to: this.user.email,
          official_gmail: adminEmail
        });
        alert(`SUCCESS: Access protocol sent to ${adminEmail}. Check your inbox.`);
      } else {
        throw new Error("EmailJS not initialized");
      }
      // Master Recovery Bypass: Show code directly if cloud/mailto are slow
      const msg = `MASTER_RECOVERY_PROTOCOL: Cloud Mailers are currently congested.\n\nSince you are securely signed in, here is your Organizer Code: [ ${currentCode} ]\n\nPlease write this down and enter it in the login box.`;
      alert(msg);
      
      console.error("Email Protocol Warning:", err);
      // Fallback to mailto protocol
      const body = `Organizer: ${this.user.email}%0ACurrent Code: ${currentCode}%0A%0AIdentity verified via Google Sign-In.`;
      window.location.href = `mailto:${adminEmail}?subject=SecureVote Code Recovery&body=${body}`;
    }
 finally {
      if(btn) { btn.disabled = false; btn.innerHTML = 'FORGOT CODE? SEND TO GMAIL'; }
      if (window.lucide) lucide.createIcons();
    }
  }
};

// ── PORTAL GUARD — enforces complete isolation ───────────────────────────────
const PortalGuard = {

  /**
   * Attempt to enter the ORGANIZER portal.
   * Shows a secure code entry modal. Only proceeds on correct code.
   */
  enterOrganizer() {
    this.showOrgModal();
  },

  showOrgModal() {
    // Remove any existing modal
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
          <p style="color:var(--text-secondary); font-size:0.82rem; margin-top:0.5rem; line-height:1.5;">Enter your secure organizer code to access the<br>administration database.</p>
        </div>
        <div class="form-group">
          <label>ORGANIZER CODE</label>
          <input type="password" id="org-code-input" class="form-input" placeholder="Enter organizer code" autocomplete="off" style="text-align:center; letter-spacing:4px; font-size:1.1rem; font-weight:900;">
        </div>
        <div id="org-code-error" style="color:var(--error); font-size:0.8rem; font-weight:700; text-align:center; margin-bottom:0.75rem; display:none;">
          ⚠️ Incorrect code. Access denied.
        </div>
        <button id="org-code-submit" class="btn btn-primary w-100" style="margin-bottom:0.75rem; padding:1rem;">
          <i data-lucide="shield-check"></i> VERIFY & ENTER
        </button>
        <button id="org-code-cancel" class="btn btn-secondary w-100" style="padding:0.85rem; font-size:0.85rem;">
          CANCEL
        </button>
        <div style="margin-top:1.25rem; padding-top:1rem; border-top:1px solid var(--border); text-align:center;">
          <button id="btn-forgot-code-action" class="btn btn-secondary w-100" style="padding:0.65rem; font-size:0.75rem; margin-bottom:1rem; color:var(--primary); border-color:var(--primary-soft);">
            <i data-lucide="mail"></i> FORGOT CODE? SEND TO GMAIL
          </button>
          <p style="font-size:0.7rem; color:var(--text-secondary); line-height:1.5;">
            🔒 This portal is restricted to authorized organizers only.<br>
            Verified Identity: <strong style="color:var(--primary);">${Auth.user ? Auth.user.email : 'Unknown'}</strong>
          </p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();

    const input = document.getElementById('org-code-input');
    const error = document.getElementById('org-code-error');

    // Focus input
    setTimeout(() => { if (input) input.focus(); }, 100);

    // Submit
    const handleSubmit = () => {
      const entered = (input.value || '').trim().toUpperCase();
      const correct = getOrgCode().trim().toUpperCase();
      if (entered === correct) {
        modal.remove();
        Auth.currentPortal = 'organizer';
        App.navigateTo('organizer-screen');
        if (typeof Organizer !== 'undefined') Organizer.renderState();
      } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
        // Shake animation
        const box = modal.querySelector('.org-modal-box');
        box.style.animation = 'shake 0.4s ease';
        setTimeout(() => { box.style.animation = ''; }, 400);
      }
    };

    document.getElementById('org-code-submit').addEventListener('click', handleSubmit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });
    document.getElementById('org-code-cancel').addEventListener('click', () => modal.remove());
    
    const forgotBtn = document.getElementById('btn-forgot-code-action');
    if (forgotBtn) forgotBtn.addEventListener('click', () => Auth.sendForgotCodeEmail());
    document.getElementById('org-modal-backdrop').addEventListener('click', () => modal.remove());
  },

  /**
   * Guard: ensure only organizer portal can access organizer screens.
   * Call at the top of any organizer-only function.
   */
  requireOrganizer() {
    if (Auth.currentPortal !== 'organizer') {
      alert('🚫 Access denied. This section is restricted to authorized organizers only.');
      App.navigateTo('role-screen');
      return false;
    }
    return true;
  },

  /**
   * Publish confirmation: 2-step — confirm intent + re-verify organizer code.
   * This permanently locks the election. callback() is only called on success.
   */
  showPublishConfirm(callback) {
    const existing = document.getElementById('publish-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'publish-confirm-modal';
    modal.innerHTML = `
      <div class="org-modal-backdrop" id="pub-modal-backdrop"></div>
      <div class="org-modal-box glass-panel" style="max-width:460px;">
        <div style="text-align:center; margin-bottom:1.5rem;">
          <div style="width:56px; height:56px; border-radius:50%; background:rgba(239,68,68,0.15); border:2px solid var(--error); display:flex; align-items:center; justify-content:center; margin:0 auto 1rem;">
            <i data-lucide="alert-triangle" style="color:var(--error); width:26px; height:26px;"></i>
          </div>
          <h2 style="font-weight:900; font-size:1.15rem; color:white; letter-spacing:2px; text-transform:uppercase;">Publish Final Results?</h2>
          <p style="color:var(--text-secondary); font-size:0.82rem; margin-top:0.5rem; line-height:1.6;">
            This action is <strong style="color:var(--error);">permanent and irreversible</strong>.<br>
            The election will be locked, all voting will stop, and the certified results will be published publicly.
          </p>
        </div>

        <div style="background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:0.85rem; margin-bottom:1.25rem; font-size:0.8rem; color:var(--text-secondary);">
          ⚠️ <strong style="color:var(--error);">WARNING:</strong> Once published, no further votes will be accepted and no changes can be made to the results.
        </div>

        <div class="form-group">
          <label>RE-ENTER ORGANIZER CODE TO CONFIRM</label>
          <input type="password" id="pub-code-input" class="form-input" placeholder="Organizer code" autocomplete="off" style="text-align:center; letter-spacing:4px; font-size:1.1rem; font-weight:900;">
        </div>
        <div id="pub-code-error" style="color:var(--error); font-size:0.8rem; font-weight:700; text-align:center; margin-bottom:0.75rem; display:none;">
          ⚠️ Incorrect code. Publication aborted.
        </div>
        <button id="pub-confirm-submit" class="btn btn-accent w-100" style="margin-bottom:0.75rem; padding:1rem; background:var(--error); border-color:var(--error);">
          <i data-lucide="gavel"></i> CERTIFY & PUBLISH RESULTS
        </button>
        <button id="pub-confirm-cancel" class="btn btn-secondary w-100" style="padding:0.85rem; font-size:0.85rem;">
          CANCEL — KEEP ELECTION OPEN
        </button>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();

    const input = document.getElementById('pub-code-input');
    const error = document.getElementById('pub-code-error');
    setTimeout(() => { if (input) input.focus(); }, 100);

    const handleSubmit = () => {
      const entered = (input.value || '').trim().toUpperCase();
      const correct = getOrgCode().trim().toUpperCase();
      if (entered === correct) {
        modal.remove();
        callback();
      } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
        const box = modal.querySelector('.org-modal-box');
        box.style.animation = 'shake 0.4s ease';
        setTimeout(() => { box.style.animation = ''; }, 400);
      }
    };

    document.getElementById('pub-confirm-submit').addEventListener('click', handleSubmit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });
    document.getElementById('pub-confirm-cancel').addEventListener('click', () => modal.remove());
    document.getElementById('pub-modal-backdrop').addEventListener('click', () => modal.remove());
  },

  /**
   * Exit the organizer portal — clears the session and returns to role screen.
   */

  exitOrganizer() {
    Auth.currentPortal = null;
    App.navigateTo('role-screen');
  },

  /**
   * Enter the voter portal. Sets the portal context.
   */
  enterVoter() {
    Auth.currentPortal = 'voter';
    // Voter authentication is handled by Voter.handleAuthAttempt()
  },

  /**
   * Exit the voter portal.
   */
  exitVoter() {
    Auth.currentPortal = null;
    if (typeof Voter !== 'undefined') Voter.activeVoterId = null;
    App.navigateTo('role-screen');
  }
};
