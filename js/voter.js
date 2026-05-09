/**
 * Voter Booth Logic — Bulletproof V4 (Production Hardened)
 * SCAN   → Html5Qrcode (camera)
 * UPLOAD → jsQR via Canvas (completely independent)
 * VERIFY → Manual text entry
 */

const Voter = {
  activeVoterId: null,
  activeElectionId: null,
  html5QrCode: null,
  isScanning: false,
  hasVoted: false,

  init() {
    console.log("[Voter] Initializing Protocol...");
    this.bindEvents();
  },

  // ─── CAMERA SCANNER (Html5Qrcode) ──────────────────────────────────────────
  async ensureScanner() {
    if (this.html5QrCode) return true;
    if (typeof Html5Qrcode === 'undefined') {
      alert("Camera Scanner Error: Library not loaded. Please use UPLOAD or manual entry instead.");
      return false;
    }
    try {
      this.html5QrCode = new Html5Qrcode("qr-reader");
      return true;
    } catch (e) {
      console.error("Scanner init failed:", e);
      alert("Camera module could not start. Please use UPLOAD or manual entry.");
      return false;
    }
  },

  async stopScanner() {
    if (this.html5QrCode && this.isScanning) {
      try { await this.html5QrCode.stop(); } catch (e) {}
    }
    this.isScanning = false;
    const qrReader = document.getElementById('qr-reader');
    if (qrReader) qrReader.style.display = 'none';
    const scanBtn = document.getElementById('btn-scan-camera');
    if (scanBtn) {
      scanBtn.innerHTML = '<i data-lucide="camera" class="icon-primary"></i> SCAN';
      if (window.lucide) lucide.createIcons();
    }
  },

  // ─── FILE UPLOAD — Tile-Based Deep QR Scanner ─────────────────────────────
  async scanQRFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const W = img.width, H = img.height;
          const mk = (w, h) => {
            const c = document.createElement('canvas');
            c.width = w; c.height = h; return c;
          };
          const drawRegion = (canvas, sx, sy, sw, sh, filter = null) => {
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            if (filter) ctx.filter = filter;
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          };
          const applyThreshold = (canvas, thresh = 128) => {
            const ctx = canvas.getContext('2d');
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < d.data.length; i += 4) {
              const lum = 0.299 * d.data[i] + 0.587 * d.data[i+1] + 0.114 * d.data[i+2];
              const v = lum > thresh ? 255 : 0;
              d.data[i] = d.data[i+1] = d.data[i+2] = v;
            }
            ctx.putImageData(d, 0, 0);
          };
          const tryDecode = (canvas, label) => {
            const ctx = canvas.getContext('2d');
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
            if (result && result.data) return result.data;
            return null;
          };
          const scanRegion = (sx, sy, sw, sh, upscale, label) => {
            const dw = Math.min(sw * upscale, 2400);
            const dh = Math.min(sh * upscale, 2400);
            const filters = [null, 'grayscale(1) contrast(3) brightness(1.1)'];
            for (let fi = 0; fi < filters.length; fi++) {
              const c = mk(dw, dh);
              drawRegion(c, sx, sy, sw, sh, filters[fi]);
              let r = tryDecode(c, label);
              if (r) return r;
              applyThreshold(c, 128);
              r = tryDecode(c, label);
              if (r) return r;
            }
            return null;
          };

          // Fast Pass
          for (const scale of [1, 2, 4]) {
            const r = scanRegion(0, 0, W, H, scale, `full@${scale}x`);
            if (r) return resolve(r);
          }
          reject(new Error("No QR code detected. Try manual entry."));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  // ─── EVENT BINDING ────────────────────────────────────────────────────────
  bindEvents() {
    const safeBind = (id, event, cb) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, cb);
    };

    // Hub and Nav
    document.querySelectorAll('.bottom-nav-item, .hub-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    document.querySelectorAll('.btn-back-to-booth').forEach(btn => {
      btn.addEventListener('click', () => this.showDashboard());
    });

    safeBind('btn-exit-voter', 'click', () => {
      if (typeof Assistant !== 'undefined') Assistant.wipeChat();
      PortalGuard.exitVoter();
    });

    // VERIFY TICKET (Manual)
    safeBind('btn-enter-voter', 'click', () => {
      const input = document.getElementById('voter-id-input');
      if (input && input.value.trim()) {
        this.handleAuthAttempt(input.value.trim());
      } else {
        alert("Please enter your Voter ID first.");
      }
    });

    safeBind('voter-id-input', 'keydown', (e) => {
      if (e.key === 'Enter') {
        const input = document.getElementById('voter-id-input');
        if (input && input.value.trim()) this.handleAuthAttempt(input.value.trim());
      }
    });

    // SCAN (Camera)
    safeBind('btn-scan-camera', 'click', async () => {
      if (!(await this.ensureScanner())) return;
      if (this.isScanning) {
        await this.stopScanner();
        return;
      }
      const qrReaderDiv = document.getElementById('qr-reader');
      if (qrReaderDiv) qrReaderDiv.style.display = 'block';
      this.isScanning = true;
      const scanBtn = document.getElementById('btn-scan-camera');
      if (scanBtn) {
        scanBtn.innerHTML = '<i data-lucide="x"></i> STOP';
        if (window.lucide) lucide.createIcons();
      }
      try {
        await this.html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (decodedText) => {
            this.stopScanner();
            this.handleAuthAttempt(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error("Camera Start Failed:", err);
        alert("Camera blocked. Use UPLOAD or manual entry.");
        this.stopScanner();
      }
    });

    // UPLOAD
    const uploadInput = document.getElementById('qr-upload');
    if (uploadInput) {
      uploadInput.addEventListener('change', async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const uploadLabel = document.querySelector('label[for="qr-upload"]');
        let origHtml = uploadLabel ? uploadLabel.innerHTML : '';
        if (uploadLabel) uploadLabel.innerHTML = '⌛ SCANNING...';
        try {
          const voterId = await this.scanQRFromFile(file);
          this.handleAuthAttempt(voterId);
        } catch (err) {
          alert("QR Not Found. Please try manual entry.");
        } finally {
          if (uploadLabel) uploadLabel.innerHTML = origHtml;
          if (window.lucide) lucide.createIcons();
          e.target.value = '';
        }
      });
    }
  },

  // ─── AUTH FLOW ───────────────────────────────────────────────────────────
  async handleAuthAttempt(rawInput) {
    const input = (rawInput || '').trim();
    if (!input) return alert("Please enter or scan a valid Voter ID.");

    let vId = input;
    let eId = DB.getElectionId();

    if (input.includes('|')) {
      const parts = input.split('|');
      vId = parts[0].trim().toUpperCase();
      eId = parts[1].trim();
    } else {
      vId = input.toUpperCase();
    }

    App.playTransitionSplash(
      "vote",
      "Verification",
      "Authenticating your secure protocol access...",
      () => this.verifyAndEnter(vId, eId)
    );
  },

  async verifyAndEnter(vId, eId) {
    const res = await DB.verifyVoter(vId, eId);
    if (!res.valid) {
      alert(`Access Denied: ${res.reason}`);
      return;
    }

    this.activeVoterId = vId;
    this.activeElectionId = eId;
    this.hasVoted = false;
    
    Auth.currentPortal = 'voter';
    const displayId = document.getElementById('display-voter-id');
    if (displayId) displayId.innerText = `ID: ${vId}`;
    
    this.renderMetadata(res.electionData);
    this.renderBallot(res.electionData);
    this.renderDashboard(res.electionData);
    this.switchTab('dashboard');
    App.navigateTo('voter-screen');
  },

  switchTab(tab) {
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.bottom-nav-item[data-tab="${tab}"]`);
    if (item) item.classList.add('active');

    const sidebar = document.getElementById('voter-sidebar');
    const main = document.getElementById('voter-main');
    if (!sidebar || !main) return;

    if (tab === 'booth' || tab === 'dashboard') {
      sidebar.classList.remove('active');
      main.style.display = 'block';
      const booth = document.querySelector('.booth-layout');
      const dash = document.getElementById('voter-dashboard-overview');
      if (tab === 'booth') {
        if (dash) dash.style.display = 'none';
        if (booth) booth.style.display = 'grid';
        this.renderBallot(null);
      } else {
        if (booth) booth.style.display = 'none';
        if (dash) dash.style.display = 'block';
      }
    } else {
      main.style.display = 'none';
      sidebar.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      const target = document.getElementById(`tab-${tab}`);
      if (target) target.classList.add('active');
      if (tab === 'assistant' && typeof Assistant !== 'undefined') Assistant.ensureInit();
    }
    if (window.lucide) lucide.createIcons();
  },

  handleBackNav() {
    const dash = document.getElementById('voter-dashboard-overview');
    if (dash && dash.style.display === 'block') {
      this.exitBoothGuard();
    } else {
      this.switchTab('dashboard');
    }
  },

  showDashboard() {
    this.switchTab('dashboard');
  },

  exitBoothGuard() {
    if (this.hasVoted) {
      App.navigateTo('role-screen');
      return;
    }
    if (confirm("You have not voted yet. Exit booth?")) {
      App.navigateTo('role-screen');
    }
  },

  renderDashboard(el) {
    if (!el) el = DB.getElection();
    if (!el) return;
    const setTxt = (id, txt) => document.querySelectorAll(`[id="${id}"]`).forEach(e => e.textContent = txt);
    setTxt('dash-protocol-num', `SV-${(el.title||'').substring(0,3).toUpperCase()}-${el.date.replace(/-/g,'').substring(2)}`);
    setTxt('dash-election-type', el.type || '');
    setTxt('dash-voter-id', `ID: ${this.activeVoterId}`);

    const statusEl = document.getElementById('dash-poll-status');
    const timeEl = document.getElementById('dash-poll-time');
    const now = new Date();
    const start = new Date(`${el.date}T${el.start}`);
    const end = new Date(`${el.date}T${el.end}`);

    if (now < start) {
      if (statusEl) statusEl.innerText = 'NOT OPEN';
      if (timeEl) timeEl.innerText = `Opens ${el.start}`;
    } else if (now > end) {
      if (statusEl) statusEl.innerText = 'CLOSED';
      if (timeEl) timeEl.innerText = `Ended ${el.end}`;
    } else {
      if (statusEl) statusEl.innerText = 'LIVE & OPEN';
      if (timeEl) timeEl.innerText = `Closes ${el.end}`;
    }

    const teams = el.teams || [];
    const container = document.getElementById('dash-team-list');
    if (container) {
      container.innerHTML = teams.map(t => `
        <div style="display:flex; align-items:center; gap:0.75rem; padding:0.6rem; background:rgba(255,255,255,0.03); border-radius:10px;">
          <img src="${t.logo}" style="width:30px; height:30px; border-radius:50%; background:white;">
          <div style="flex:1;">
            <div style="font-weight:800; font-size:0.8rem;">${t.name}</div>
            <div style="font-size:0.65rem; color:var(--primary);">#${t.numeric}</div>
          </div>
        </div>
      `).join('');
    }
  },

  renderMetadata(el) {
    const container = document.getElementById('vote-metadata-container');
    if (!container || !el) return;
    container.innerHTML = `
      <div class="glass-panel" style="border-left:4px solid var(--primary); padding:1rem !important;">
        <h3 style="font-size:1.4rem; font-weight:900;">${el.title}</h3>
        <p style="color:var(--primary); font-weight:800; font-size:0.8rem;">${el.type}</p>
      </div>
      <div class="glass-panel" style="padding:1rem !important;">
        <p style="color:var(--text-secondary); font-size:0.7rem; font-weight:800;">LOCATION</p>
        <p style="font-weight:800;">${el.location?.address || 'Digital Booth'}</p>
      </div>
    `;
  },

  renderBallot(el) {
    if (!el) el = DB.getElection();
    const container = document.getElementById('ballot-teams');
    if (!container || !el) return;
    container.innerHTML = '';
    const teams = el.teams || [];
    teams.forEach(t => {
      const card = document.createElement('div');
      card.className = 'ballot-card glass-panel';
      card.innerHTML = `
        <img src="${t.logo}" style="width:60px; height:60px; border-radius:50%; margin-bottom:1rem; background:white;">
        <h3 style="font-weight:900;">${t.name}</h3>
        <p style="color:var(--primary); font-weight:800; margin-bottom:1.5rem;">#${t.numeric}</p>
        <button class="btn btn-primary w-100 ballot-btn" data-numeric="${t.numeric}">VOTE</button>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('.ballot-btn').forEach(btn => {
      btn.onclick = () => this.castVote(btn.dataset.numeric);
    });
  },

  castVote(teamNum) {
    if (confirm("Confirm your vote? This cannot be undone.")) {
      this.doCast(teamNum);
    }
  },

  async doCast(teamNum) {
    const res = await DB.castVote(this.activeVoterId, teamNum, this.activeElectionId);
    if (res.success) {
      this.hasVoted = true;
      this.showVoteSuccess();
    } else {
      this.showVoteError(res.reason);
    }
  },

  showVoteSuccess() {
    const status = document.getElementById('ballot-status');
    if (status) {
      status.style.display = 'block';
      status.className = 'alert alert-success';
      status.innerHTML = `
        <div style="text-align:center; padding:2rem;">
          <h2 style="font-weight:900;">VOTE RECORDED!</h2>
          <p>Your cryptographic ballot has been successfully sealed.</p>
          <button onclick="PortalGuard.exitVoter()" class="btn btn-primary mt-2">EXIT BOOTH</button>
        </div>
      `;
      document.getElementById('ballot-teams').style.opacity = '0.3';
      document.getElementById('ballot-teams').style.pointerEvents = 'none';
    }
  },

  showVoteError(reason) {
    const status = document.getElementById('ballot-status');
    if (status) {
      status.style.display = 'block';
      status.className = 'alert alert-error';
      status.innerHTML = `
        <div style="text-align:center; padding:2rem;">
          <h2 style="font-weight:900; color:var(--error);">ERROR</h2>
          <p>${reason}</p>
          <button onclick="PortalGuard.exitVoter()" class="btn btn-secondary mt-2">EXIT BOOTH</button>
        </div>
      `;
    }
  }
};
