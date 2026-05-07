/**
 * Authentication & Portal Security Module — SecureVote V5
 * Two fully isolated portals: ORGANIZER and VOTER.
 * No cross-access. No shared nav. Enforced at the JS layer.
 */

// ── ORGANIZER CODE SECURITY ──────────────────────────────────────────────────
const ORGANIZER_CODE_KEY = 'sv_v2_org_code';
const DEFAULT_ORGANIZER_CODE = 'ORG-2026'; // LOCKED OFFICIAL CODE

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

  async sendForgotCodeEmail() {
    if (!this.user) return alert("Error: You must be signed in with Google first.");
    const adminEmail = "ranadeep2021saha@gmail.com";
    const currentCode = getOrgCode();
    
    // Master Recovery Bypass - INSTANT
    const msg = `MASTER_RECOVERY_PROTOCOL: Instant Reveal Active.\n\nYour Organizer Code is: [ ${currentCode} ]\n\nPlease enter this in the login box.`;
    alert(msg);

    // Fallback: mailto
    const body = `Organizer: ${this.user.email}%0ACurrent Code: ${currentCode}`;
    window.location.href = `mailto:${adminEmail}?subject=SecureVote Code Recovery&body=${body}`;
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
