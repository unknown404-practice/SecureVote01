/**
 * Voter Booth Logic — Bulletproof V3
 * SCAN   → Html5Qrcode (camera)
 * UPLOAD → jsQR via Canvas (completely independent, no camera needed)
 * VERIFY → Manual text entry (100% independent)
 */

const Voter = {
  activeVoterId: null,
  html5QrCode: null,
  isScanning: false,

  init() {
    this.bindEvents();
  },

  // ─── CAMERA SCANNER (Html5Qrcode) ────────────────────────────────────────
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

  // ─── FILE UPLOAD — Tile-Based Deep QR Scanner ───────────────
  // Specifically designed to detect small QR codes on printed tickets.
  // Strategy: scan full image → tile grid (3×3) → corner quadrants,
  // each with aggressive upscaling + binary threshold preprocessing.
  async scanQRFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const W = img.width, H = img.height;

          // ── Helpers ─────────────────────────────────────────
          const mk = (w, h) => {
            const c = document.createElement('canvas');
            c.width = w; c.height = h; return c;
          };

          // Draw a region of img onto canvas with optional CSS filter
          const drawRegion = (canvas, sx, sy, sw, sh, filter = null) => {
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            if (filter) ctx.filter = filter;
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            ctx.filter = 'none';
          };

          // Binary threshold: converts to pure black/white — ideal for jsQR
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

          // Try to decode a canvas
          const tryDecode = (canvas, label) => {
            const ctx = canvas.getContext('2d');
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
            if (result && result.data) {
              console.log(`[QR-Scanner] ✓ Decoded: "${result.data}" — via ${label}`);
              return result.data;
            }
            return null;
          };

          // Scan a region with multiple filter passes
          const scanRegion = (sx, sy, sw, sh, upscale, label) => {
            const dw = Math.min(sw * upscale, 2400);
            const dh = Math.min(sh * upscale, 2400);
            const filters = [
              null,
              'grayscale(1) contrast(3) brightness(1.1)',
              'grayscale(1) contrast(4) brightness(0.9)',
              'grayscale(1) invert(1) contrast(3)',
            ];
            for (let fi = 0; fi < filters.length; fi++) {
              const c = mk(dw, dh);
              drawRegion(c, sx, sy, sw, sh, filters[fi]);
              // Try raw filter
              let r = tryDecode(c, `${label}:filter${fi}`);
              if (r) return r;
              // Try with binary threshold (128, 100, 160)
              for (const thresh of [128, 100, 160]) {
                const c2 = mk(dw, dh);
                drawRegion(c2, sx, sy, sw, sh, filters[fi]);
                applyThreshold(c2, thresh);
                r = tryDecode(c2, `${label}:filter${fi}:thresh${thresh}`);
                if (r) return r;
              }
            }
            return null;
          };

          // ── Phase 1: Full Image (4 upscale levels) ──────────
          for (const scale of [1, 2, 3, 4]) {
            const r = scanRegion(0, 0, W, H, scale, `full@${scale}x`);
            if (r) return resolve(r);
          }

          // ── Phase 2: 3×3 Tile Grid ───────────────────────────
          // Tiles with 10% overlap to catch QR codes at tile edges
          const cols = 3, rows = 3;
          const overlap = 0.10;
          const tW = Math.floor(W / cols * (1 + overlap));
          const tH = Math.floor(H / rows * (1 + overlap));
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const sx = Math.max(0, Math.floor(col * W / cols) - Math.floor(W * overlap / 2));
              const sy = Math.max(0, Math.floor(row * H / rows) - Math.floor(H * overlap / 2));
              const sw = Math.min(tW, W - sx);
              const sh = Math.min(tH, H - sy);
              const r = scanRegion(sx, sy, sw, sh, 6, `tile[${row},${col}]@6x`);
              if (r) return resolve(r);
            }
          }

          // ── Phase 3: 4 Corner Quadrants (ticket QR is usually bottom-right) ──
          const qW = Math.floor(W * 0.45), qH = Math.floor(H * 0.45);
          const corners = [
            [0,         0,        'top-left'],
            [W - qW,    0,        'top-right'],
            [0,         H - qH,   'bottom-left'],
            [W - qW,    H - qH,   'bottom-right'], // ← ticket QR location
          ];
          for (const [cx, cy, name] of corners) {
            for (const scale of [6, 8]) {
              const r = scanRegion(cx, cy, qW, qH, scale, `corner:${name}@${scale}x`);
              if (r) return resolve(r);
            }
          }

          // ── Phase 4: Right Half + Bottom Strip (ticket-specific) ──
          const rightHalf = scanRegion(Math.floor(W * 0.5), 0, Math.floor(W * 0.5), H, 6, 'right-half@6x');
          if (rightHalf) return resolve(rightHalf);

          const bottomStrip = scanRegion(0, Math.floor(H * 0.55), W, Math.floor(H * 0.45), 6, 'bottom-strip@6x');
          if (bottomStrip) return resolve(bottomStrip);

          reject(new Error(
            "No QR code detected after deep scan.\n\n" +
            "TIP: Make sure the QR code is:\n" +
            "• Clearly visible and not covered\n" +
            "• Not blurry or glare-affected\n" +
            "• Well-lit when photographed"
          ));
        };
        img.onerror = () => reject(new Error("Failed to load image file"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  },

  // ─── EVENT BINDING ───────────────────────────────────────────────────────
  bindEvents() {
    const safeBind = (id, event, cb) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, cb);
      else console.warn(`[Voter] Element not found: #${id}`);
    };

    // Hub and Bottom Nav clicks

    document.querySelectorAll('.bottom-nav-item, .hub-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    document.querySelectorAll('.btn-back-to-booth').forEach(btn => {
      btn.addEventListener('click', () => this.showDashboard());
    });

    // Exit booth
    safeBind('btn-exit-voter', 'click', () => {
      if (typeof Assistant !== 'undefined') Assistant.wipeChat();
      PortalGuard.exitVoter();
    });

    // ── VERIFY TICKET (Manual entry) ──────────────────────────────────────
    safeBind('btn-enter-voter', 'click', () => {
      const input = document.getElementById('voter-id-input');
      if (input && input.value.trim()) {
        this.handleAuthAttempt(input.value.trim());
      } else {
        alert("Please enter your Voter ID first.");
      }
    });

    // Allow Enter key in the text field
    safeBind('voter-id-input', 'keydown', (e) => {
      if (e.key === 'Enter') {
        const input = document.getElementById('voter-id-input');
        if (input && input.value.trim()) this.handleAuthAttempt(input.value.trim());
      }
    });

    // ── SCAN (Camera via Html5Qrcode) ─────────────────────────────────────
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
        scanBtn.innerHTML = '<i data-lucide="x"></i> STOP CAMERA';
        if (window.lucide) lucide.createIcons();
      }

      try {
        await this.html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            this.stopScanner();
            this.handleAuthAttempt(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error("Camera Start Failed:", err);
        alert("Camera access is blocked.\n\nTIP: Running locally (file://) blocks cameras in most browsers. Use UPLOAD or enter your ID manually.");
        this.stopScanner();
      }
    });

    // ── UPLOAD (jsQR — completely independent of camera) ──────────────────
    const uploadInput = document.getElementById('qr-upload');
    if (uploadInput) {
      uploadInput.addEventListener('change', async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];

        if (!file.type.startsWith('image/')) {
          alert("Please upload an IMAGE file (PNG, JPG). Not a PDF.");
          e.target.value = '';
          return;
        }

        const uploadLabel = document.querySelector('label[for="qr-upload"]');
        let origHtml = '';
        if (uploadLabel) {
          origHtml = uploadLabel.innerHTML;
          uploadLabel.innerHTML = '⏳ SCANNING...';
        }

        try {
          if (typeof jsQR === 'undefined') {
            throw new Error("jsQR library not loaded.");
          }
          const voterId = await this.scanQRFromFile(file);
          this.handleAuthAttempt(voterId);
        } catch (err) {
          console.error("QR Upload Error:", err);
          alert("No valid QR code found in this image.\n\nTIP: Make sure the QR code is clear, not blurry, and takes up a good portion of the image. You can also enter your Voter ID manually.");
        } finally {
          if (uploadLabel) {
            uploadLabel.innerHTML = origHtml;
            if (window.lucide) lucide.createIcons();
          }
          e.target.value = '';
        }
      });
    } else {
      console.warn("[Voter] #qr-upload not found in DOM.");
    }
  },

  // ─── AUTH FLOW ───────────────────────────────────────────────────────────
  async handleAuthAttempt(rawInput) {
    const input = (rawInput || '').trim();
    if (!input) return alert("Please enter or scan a valid Voter ID.");

    // Format: VoterID | ElectionID
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
      "Cloud Verification",
      "Connecting to secure digital booth via cloud protocol...",
      () => this.verifyAndEnter(vId, eId)
    );
  },

  async verifyAndEnter(vId, eId) {
    const verification = await DB.verifyVoter(vId, eId);
    if (!verification.valid) {
      alert(`Access Denied: ${verification.reason}`);
      return;
    }

    const elData = verification.electionData;
    this.activeVoterId = vId;
    this.activeElectionId = eId;
    
    Auth.currentPortal = 'voter';
    const displayId = document.getElementById('display-voter-id');
    if (displayId) displayId.innerText = `ID: ${vId}`;
    
    this.renderMetadata(elData);
    this.renderBallot(elData);
    this.renderDashboard(elData);
    this.switchTab('dashboard');
    App.navigateTo('voter-screen');
  },

  // ─── DASHBOARD / SIDEBAR ─────────────────────────────────────────────────
  switchTab(tab) {
    // Update Bottom Nav
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
    const bottomNavItem = document.querySelector(`.bottom-nav-item[data-tab="${tab}"]`);
    if (bottomNavItem) bottomNavItem.classList.add('active');

    const sidebar = document.getElementById('voter-sidebar');
    const main = document.getElementById('voter-main');
    if (!sidebar || !main) return;

    if (tab === 'booth' || tab === 'dashboard') {
      sidebar.classList.remove('active');
      main.style.display = 'block';
      
      const ballot = document.querySelector('.booth-layout'); // The grid container I added earlier
      const dashOverview = document.getElementById('voter-dashboard-overview');
      const ballotTitle = main.querySelector('h2'); // This might catch the wrong h2 if not careful

      if (tab === 'booth') {
        if (ballot) ballot.style.display = 'grid';
        if (dashOverview) dashOverview.style.display = 'none';
      } else {
        if (ballot) ballot.style.display = 'none';
        if (dashOverview) dashOverview.style.display = 'block';
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

  // Toggle to DASHBOARD overview view (hide ballot, show overview)
  showDashboard() {
    const ballot = document.getElementById('ballot-teams');
    const dashOverview = document.getElementById('voter-dashboard-overview');
    const main = document.getElementById('voter-main');
    const ballotTitle = main ? main.querySelector('h2') : null;
    const sidebar = document.getElementById('voter-sidebar');
    const ballotStatus = document.getElementById('ballot-status');
    if (ballot) ballot.style.display = 'none';
    if (ballotStatus) ballotStatus.style.display = 'none';
    if (dashOverview) dashOverview.style.display = 'block';
    if (ballotTitle) ballotTitle.style.display = 'none';
    if (main) main.style.display = 'block';
    if (sidebar) sidebar.classList.remove('active');
    // Clean up dashboard active states
    document.querySelectorAll('.hub-card').forEach(el => el.classList.remove('active'));
    if (window.lucide) lucide.createIcons();
  },

  renderDashboard(el) {
    if (!el) el = DB.getElection();
    if (!el) return;
    const now = new Date();
    const start = new Date(`${el.date}T${el.start}`);
    const end = new Date(`${el.date}T${el.end}`);

    const setTxt = (id, txt) => document.querySelectorAll(`[id="${id}"]`).forEach(e => e.textContent = txt);
    
    setTxt('dash-protocol-num', `SV-${(el.title||'').substring(0,3).toUpperCase()}-${el.date.replace(/-/g,'').substring(2)}`);
    setTxt('dash-election-type', el.type || '');
    setTxt('dash-voter-id', this.activeVoterId ? `ID: ${this.activeVoterId}` : '---');

    const statusEls = document.querySelectorAll('[id="dash-poll-status"]');
    const timeEls = document.querySelectorAll('[id="dash-poll-time"]');

    if (now < start) {
      statusEls.forEach(e => { e.textContent = 'NOT OPEN YET'; e.style.color = 'var(--accent)'; });
      timeEls.forEach(e => e.textContent = `Opens at ${el.start}`);
    } else if (now > end) {
      statusEls.forEach(e => { e.textContent = 'CLOSED'; e.style.color = 'var(--error)'; });
      timeEls.forEach(e => e.textContent = `Closed at ${el.end}`);
    } else {
      statusEls.forEach(e => { e.textContent = 'LIVE & OPEN'; e.style.color = 'var(--success)'; });
      timeEls.forEach(e => e.textContent = `Closes at ${el.end}`);
    }

    const teams = el.teams || DB.getTeams();
    const teamContainer = document.getElementById('dash-team-list');
    if (teamContainer) {
      if (teams.length === 0) {
        teamContainer.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem;">No entities registered yet.</p>';
      } else {
        teamContainer.innerHTML = teams.map(t => `
          <div style="display:flex; align-items:center; gap:0.75rem; padding:0.65rem 0.75rem; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
            <img src="${t.logo}" style="width:32px; height:32px; border-radius:50%; object-fit:cover; background:white; border:1px solid var(--border); flex-shrink:0;" onerror="this.style.display='none'">
            <div style="flex:1;">
              <div style="font-weight:800; font-size:0.85rem; color:white;">${t.name}</div>
              <div style="font-size:0.7rem; color:var(--primary); font-weight:700;">Ballot #${t.numeric}</div>
            </div>
            <div style="font-size:0.65rem; background:var(--primary-soft); color:var(--primary); padding:0.2rem 0.5rem; border-radius:20px; font-weight:800;">REGISTERED</div>
          </div>
        `).join('');
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  renderMetadata(el) {
    if (!el) el = DB.getElection();
    const container = document.getElementById('vote-metadata-container');
    if (!container || !el) return;

    const now = new Date();
    const startTime = new Date(`${el.date}T${el.start}`);
    const endTime   = new Date(`${el.date}T${el.end}`);
    let pollBadge, pollColor;
    if (now < startTime) { pollBadge = 'NOT STARTED'; pollColor = 'var(--accent)'; }
    else if (now > endTime) { pollBadge = 'CLOSED'; pollColor = 'var(--error)'; }
    else { pollBadge = '🟢 LIVE'; pollColor = 'var(--success)'; }

    const row = (icon, label, value) => `
      <div class="glass-panel" style="padding:1rem !important; display:flex; gap:0.75rem; align-items:center;">
        <i data-lucide="${icon}" style="width:18px; height:18px; color:var(--primary); flex-shrink:0;"></i>
        <div style="flex:1; min-width:0;">
          <div style="font-size:0.65rem; color:var(--text-secondary); font-weight:800; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:0.2rem;">${label}</div>
          <div style="font-weight:800; font-size:0.9rem; color:white; word-break:break-word;">${value}</div>
        </div>
      </div>`;

    container.innerHTML = `
      <div class="glass-panel" style="border-left:5px solid var(--primary); padding:1.5rem !important; margin-bottom:1rem;">
        <h3 style="font-size:1.6rem; font-weight:900; line-height:1.2; margin-bottom:0.25rem;">${el.title}</h3>
        <div style="display:flex; align-items:center; gap:0.5rem; color:var(--primary); font-weight:900; font-size:0.8rem; letter-spacing:2px; text-transform:uppercase;">
          <i data-lucide="award" style="width:14px;"></i> ${el.type}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
        <div class="glass-panel" style="padding:1.25rem !important;">
          <div style="color:var(--text-secondary); font-size:0.65rem; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:0.5rem;">POLL STATUS</div>
          <div style="font-weight:900; color:${pollColor}; font-size:1.1rem; letter-spacing:1px;">${pollBadge}</div>
        </div>
        <div class="glass-panel" style="padding:1.25rem !important;">
          <div style="color:var(--text-secondary); font-size:0.65rem; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:0.5rem;">DATA CHANNEL</div>
          <div style="font-weight:900; color:var(--accent); font-size:1.1rem; letter-spacing:1px;">ENCRYPTED</div>
        </div>
      </div>

      ${row('info', 'ELECTION PURPOSE', el.reason || 'Official Ballot Process')}
      ${row('clock', 'POLL SCHEDULE', `${el.start} – ${el.end} (Local Time)`)}
      ${row('calendar', 'SCHEDULED DATE', el.date)}
      ${row('map-pin', 'VERIFIED LOCATION', `${el.location.address}, ${el.location.city}`)}
      
      <div style="background:rgba(34,197,94,0.05); border:1px solid rgba(34,197,94,0.15); border-radius:12px; padding:1.25rem; margin-top:0.5rem; display:flex; gap:1rem; align-items:flex-start;">
        <i data-lucide="shield-check" style="color:var(--success); width:20px; flex-shrink:0; margin-top:2px;"></i>
        <div>
          <div style="font-weight:900; color:var(--success); font-size:0.75rem; letter-spacing:1px; text-transform:uppercase; margin-bottom:0.4rem;">LOCATION INTEGRITY ACTIVE</div>
          <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.5;">This terminal is locked to the official GPS coordinates of the polling station. Remote access is prohibited.</p>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },


  renderBallot(el) {
    const teams = el ? (el.teams || []) : DB.getTeams();
    const container = document.getElementById('ballot-teams');
    if (!container) return;
    container.innerHTML = '';

    const status = document.getElementById('ballot-status');
    if (status) status.style.display = 'none';

    teams.forEach(t => {
      const item = document.createElement('div');
      item.className = 'ballot-item';
      item.id = `ballot-team-${t.numeric}`;
      item.innerHTML = `
        <div class="ballot-team-info">
          <img src="${t.logo}" class="team-logo" onerror="this.style.display='none'">
          <div class="team-name">${t.name}</div>
        </div>
        <button class="btn btn-primary ballot-btn" data-numeric="${t.numeric}" style="font-weight:900; letter-spacing:1px; font-size:1.1rem; text-transform:uppercase;">VOTE FOR BALLOT #${t.numeric}</button>
      `;
      container.appendChild(item);
    });

    document.querySelectorAll('.ballot-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const num = e.currentTarget.dataset.numeric;
        this.castVote(num);
      });
    });
  },

  async castVote(teamNumeric) {
    if (!confirm(`Cast vote for Team #${teamNumeric}? This is permanent.`)) return;

    const result = await DB.castVote(this.activeVoterId, teamNumeric, this.activeElectionId);

    if (result.success) {
      // Lock all ballot buttons
      document.querySelectorAll('.ballot-btn').forEach(btn => {
        btn.disabled = true;
        btn.innerText = "VOTE RECORDED";
        btn.style.opacity = '0.5';
      });
      const teamEl = document.getElementById(`ballot-team-${teamNumeric}`);
      if (teamEl) teamEl.classList.add('voted');

      // Show success message with exit button
      const statusEl = document.getElementById('ballot-status');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.cssText = 'display:block; background:rgba(34,197,94,0.1); border:2px solid var(--success); border-radius:16px; padding:2rem; text-align:center; margin-bottom:1.5rem;';
        statusEl.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; gap:1.5rem;">
            <div style="width:60px; height:60px; border-radius:50%; background:rgba(34,197,94,0.1); display:flex; align-items:center; justify-content:center;">
              <i data-lucide="shield-check" style="width:32px; height:32px; color:var(--success);"></i>
            </div>
            <div>
              <h3 style="color:var(--success); font-weight:900; font-size:1.5rem; margin-bottom:0.5rem; letter-spacing:1px;">VOTE SECURELY RECORDED</h3>
              <p style="color:var(--text-secondary); font-size:0.95rem; line-height:1.6; max-width:400px;">Your ballot has been mathematically anonymized and submitted. To protect your privacy, this session will now be wiped.</p>
            </div>
            <button id="btn-final-exit" class="btn btn-primary" style="padding:1rem 2.5rem; font-weight:900; font-size:1rem; letter-spacing:2px; text-transform:uppercase; display:flex; align-items:center; gap:0.75rem; border-radius:12px;">
              <i data-lucide="lock"></i> EXIT SECURE TERMINAL
            </button>
          </div>
        `;
        if (window.lucide) lucide.createIcons();

        const exitBtn = document.getElementById('btn-final-exit');
        if (exitBtn) {
          exitBtn.onclick = () => {
            if (typeof Assistant !== 'undefined') Assistant.wipeChat();
            PortalGuard.exitVoter();
          };
        }
      }

      alert("✅ CONFIRMED: Your vote has been officially recorded. This session is now locked.");

    } else {
      const statusEl = document.getElementById('ballot-status');
      if (statusEl) {
        statusEl.style.cssText = 'display:block; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); border-radius:16px; padding:2rem; text-align:center; margin-bottom:2rem;';
        statusEl.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; gap:1.25rem;">
            <i data-lucide="alert-triangle" style="width:40px; height:40px; color:var(--error);"></i>
            <div>
              <div style="color:var(--error); font-weight:900; font-size:1.1rem; text-transform:uppercase; letter-spacing:2px; margin-bottom:0.5rem;">PROTOCOL VIOLATION</div>
              <p style="color:var(--text-secondary); font-size:0.9rem; line-height:1.5; max-width:350px;">${result.reason}</p>
            </div>
            <button id="btn-error-exit" class="btn btn-secondary" style="margin-top:0.5rem; padding:0.75rem 1.5rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:0.5rem;">
              <i data-lucide="log-out"></i> TERMINATE SESSION
            </button>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        
        const errExit = document.getElementById('btn-error-exit');
        if (errExit) {
          errExit.onclick = () => {
            if (typeof Assistant !== 'undefined') Assistant.wipeChat();
            PortalGuard.exitVoter();
          };
        }
      }
    }
  }
};
