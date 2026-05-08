/**
 * Voter Booth Logic â€” Bulletproof V3
 * SCAN   â†’ Html5Qrcode (camera)
 * UPLOAD â†’ jsQR via Canvas (completely independent, no camera needed)
 * VERIFY â†’ Manual text entry (100% independent)
 */

const Voter = {
  activeVoterId: null,
  html5QrCode: null,
  isScanning: false,

  init() {
    this.bindEvents();
  },

  // â”€â”€â”€ CAMERA SCANNER (Html5Qrcode) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ FILE UPLOAD â€” Tile-Based Deep QR Scanner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Specifically designed to detect small QR codes on printed tickets.
  // Strategy: scan full image â†’ tile grid (3Ã—3) â†’ corner quadrants,
  // each with aggressive upscaling + binary threshold preprocessing.
  async scanQRFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const W = img.width, H = img.height;

          // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

          // Binary threshold: converts to pure black/white â€” ideal for jsQR
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
              console.log(`[QR-Scanner] âœ“ Decoded: "${result.data}" â€” via ${label}`);
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

          // â”€â”€ Phase 1: Full Image (4 upscale levels) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          for (const scale of [1, 2, 3, 4]) {
            const r = scanRegion(0, 0, W, H, scale, `full@${scale}x`);
            if (r) return resolve(r);
          }

          // â”€â”€ Phase 2: 3Ã—3 Tile Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

          // â”€â”€ Phase 3: 4 Corner Quadrants (ticket QR is usually bottom-right) â”€â”€
          const qW = Math.floor(W * 0.45), qH = Math.floor(H * 0.45);
          const corners = [
            [0,         0,        'top-left'],
            [W - qW,    0,        'top-right'],
            [0,         H - qH,   'bottom-left'],
            [W - qW,    H - qH,   'bottom-right'], // â† ticket QR location
          ];
          for (const [cx, cy, name] of corners) {
            for (const scale of [6, 8]) {
              const r = scanRegion(cx, cy, qW, qH, scale, `corner:${name}@${scale}x`);
              if (r) return resolve(r);
            }
          }

          // â”€â”€ Phase 4: Right Half + Bottom Strip (ticket-specific) â”€â”€
          const rightHalf = scanRegion(Math.floor(W * 0.5), 0, Math.floor(W * 0.5), H, 6, 'right-half@6x');
          if (rightHalf) return resolve(rightHalf);

          const bottomStrip = scanRegion(0, Math.floor(H * 0.55), W, Math.floor(H * 0.45), 6, 'bottom-strip@6x');
          if (bottomStrip) return resolve(bottomStrip);

          reject(new Error(
            "No QR code detected after deep scan.\n\n" +
            "TIP: Make sure the QR code is:\n" +
            "â€¢ Clearly visible and not covered\n" +
            "â€¢ Not blurry or glare-affected\n" +
            "â€¢ Well-lit when photographed"
          ));
        };
        img.onerror = () => reject(new Error("Failed to load image file"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  },

  // â”€â”€â”€ EVENT BINDING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ VERIFY TICKET (Manual entry) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ SCAN (Camera via Html5Qrcode) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ UPLOAD (jsQR â€” completely independent of camera) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          uploadLabel.innerHTML = 'â³ SCANNING...';
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

  // â”€â”€â”€ AUTH FLOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ DASHBOARD / SIDEBAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      
      const boothLayout = document.querySelector('.booth-layout');
      const dashOverview = document.getElementById('voter-dashboard-overview');

      if (tab === 'booth') {
        // Forcefully hide dashboard, show booth
        if (dashOverview) dashOverview.style.display = 'none';
        if (boothLayout)  boothLayout.style.display  = 'grid';
        // Always re-render ballot so candidates show up
        this.renderBallot(null);
      } else {
        // Forcefully hide booth, show dashboard
        if (boothLayout)  boothLayout.style.display  = 'none';
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

  handleBackNav() {
    const dashOverview = document.getElementById('voter-dashboard-overview');
    const boothLayout  = document.querySelector('.booth-layout');
    const sidebar      = document.getElementById('voter-sidebar');

    if (dashOverview && dashOverview.style.display === 'block') {
      this.exitBoothGuard();
    } else if (boothLayout && (boothLayout.style.display === 'grid' || boothLayout.style.display === 'block')) {
      this.switchTab('dashboard');
    } else if (sidebar && sidebar.classList.contains('active')) {
      this.switchTab('booth');
    } else {
      this.switchTab('dashboard');
    }
  },

  // Go back to dashboard
  showDashboard() {
    const boothLayout   = document.querySelector('.booth-layout');
    const dashOverview  = document.getElementById('voter-dashboard-overview');
    const main          = document.getElementById('voter-main');
    const sidebar       = document.getElementById('voter-sidebar');
    const ballotStatus  = document.getElementById('ballot-status');

    // Hide the ENTIRE booth layout (left ballot col + right info col)
    if (boothLayout)  boothLayout.style.display  = 'none';
    // Hide ballot status banner
    if (ballotStatus) ballotStatus.style.display = 'none';
    // Show dashboard hub
    if (dashOverview) dashOverview.style.display = 'block';
    // Make sure voter-main is visible and sidebar is gone
    if (main)    main.style.display = 'block';
    if (sidebar) sidebar.classList.remove('active');
    // Reset hub-card active states
    document.querySelectorAll('.hub-card').forEach(el => el.classList.remove('active'));
    const overviewCard = document.querySelector('.hub-card[data-tab="dashboard"]');
    if (overviewCard) overviewCard.classList.add('active');
    if (window.lucide) lucide.createIcons();
  },

  // Guard: called when voter tries to leave the booth via top â† arrow
  exitBoothGuard() {
    // If voter already voted, let them leave cleanly
    if (this.hasVoted) {
      if (typeof App !== 'undefined') App.navigateTo('role-screen');
      return;
    }

    // Remove any existing guard modal
    const existing = document.getElementById('exit-booth-guard');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'exit-booth-guard';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
    modal.innerHTML = `
      <div id="exit-guard-backdrop" style="position:absolute;inset:0;background:rgba(2,6,23,0.88);backdrop-filter:blur(12px);"></div>
      <div style="position:relative;z-index:1;width:100%;max-width:420px;background:#1e293b;border:2px solid #f59e0b;border-radius:20px;padding:2rem;text-align:center;box-shadow:0 0 60px rgba(245,158,11,0.25);animation:slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1);">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(245,158,11,0.12);border:2px solid #f59e0b;display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;">
          <svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='#f59e0b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>
        </div>
        <div style="font-size:0.7rem;color:#f59e0b;font-weight:900;letter-spacing:3px;text-transform:uppercase;margin-bottom:0.75rem;">SECURE BOOTH ALERT</div>
        <h2 style="font-size:1.4rem;font-weight:900;color:white;margin-bottom:0.75rem;line-height:1.3;">Please Don't Leave Without Voting!</h2>
        <p style="color:#cbd5e1;font-size:0.9rem;line-height:1.6;margin-bottom:1.75rem;">
          Your vote matters. You have not cast your ballot yet.<br>
          <strong style="color:#f59e0b;">Every vote counts</strong> — the election outcome depends on your participation.
        </p>
        <button id="exit-guard-stay" style="width:100%;padding:1rem;border:none;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;font-weight:900;font-size:1rem;letter-spacing:1px;text-transform:uppercase;cursor:pointer;margin-bottom:0.75rem;">
          ✓ Stay & Cast My Vote
        </button>
        <button id="exit-guard-leave" style="width:100%;padding:0.75rem;border:1px solid #475569;border-radius:12px;background:transparent;color:#64748b;font-weight:700;font-size:0.8rem;letter-spacing:1px;text-transform:uppercase;cursor:pointer;">
          Exit Without Voting
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('exit-guard-stay').onclick = () => modal.remove();
    document.getElementById('exit-guard-backdrop').onclick = () => modal.remove();
    document.getElementById('exit-guard-leave').onclick = () => {
      modal.remove();
      if (typeof App !== 'undefined') App.navigateTo('role-screen');
    };
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
    const elData = el || DB.getElection();
    const cloudData = elData && elData.teams ? elData : null;
    const teams = cloudData ? cloudData.teams : DB.getTeams();
    const container = document.getElementById('ballot-teams');
    if (!container) return;
    container.innerHTML = '';

    const status = document.getElementById('ballot-status');
    if (status) status.style.display = 'none';

    if (teams.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:4rem 2rem; color:var(--text-secondary);">
          <div style="font-size:3rem; margin-bottom:1rem;">ðŸ—³ï¸</div>
          <p style="font-weight:700; letter-spacing:1px;">NO CANDIDATES REGISTERED YET</p>
          <p style="font-size:0.85rem; margin-top:0.5rem;">The organizer has not added any participants to this election.</p>
        </div>`;
      return;
    }

    const colors = ['#38bdf8','#fbbf24','#f87171','#4ade80','#818cf8','#f472b6','#fb923c','#a78bfa'];

    teams.forEach((t, i) => {
      const color = colors[i % colors.length];
      const item = document.createElement('div');
      item.id = `ballot-team-${t.numeric}`;
      item.style.cssText = `
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-left: 4px solid ${color};
        border-radius: 16px;
        padding: 1.25rem;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1.25rem;
        transition: all 0.3s ease;
        margin-bottom: 1rem;
      `;
      item.innerHTML = `
        <div style="width:56px; height:56px; border-radius:50%; overflow:hidden; background:white; border:3px solid ${color}; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
          <img src="${t.logo}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=font-size:1.2rem;font-weight:900;color:${color};>${t.name[0]}</span>'">
        </div>
        <div style="flex:1; min-width:180px;">
          <div style="font-size:1.1rem; font-weight:900; color:white; margin-bottom:0.2rem; letter-spacing:0.5px;">${t.name}</div>
          <div style="font-size:0.7rem; font-weight:800; color:${color}; letter-spacing:1.5px; text-transform:uppercase;">BALLOT ID: #${t.numeric}</div>
        </div>
        <button class="ballot-btn" data-numeric="${t.numeric}" style="
          background: linear-gradient(135deg, ${color}22, ${color}44);
          border: 2px solid ${color};
          color: ${color};
          font-weight: 900;
          font-size: 0.8rem;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          padding: 0.75rem 1.5rem;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          flex-shrink: 0;
          margin-left: auto;
        "
        onmouseover="this.style.background='${color}'; this.style.color='#0f172a';"
        onmouseout="this.style.background='linear-gradient(135deg, ${color}22, ${color}44)'; this.style.color='${color}';"
        >✓ VOTE</button>
      `;
      container.appendChild(item);
    });

    container.querySelectorAll('.ballot-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const num = e.currentTarget.dataset.numeric;
        this.castVote(num);
      });
    });
  },

  // Show smooth inline vote confirmation modal â€” no browser dialogs
  showVoteModal(teamNumeric) {
    const teams = DB.getTeams();
    const team = teams.find(t => String(t.numeric) === String(teamNumeric));
    if (!team) return;

    const colors = ['#38bdf8','#fbbf24','#f87171','#4ade80','#818cf8','#f472b6','#fb923c','#a78bfa'];
    const idx = teams.indexOf(team);
    const color = colors[idx % colors.length];

    // Remove any existing modal
    const existing = document.getElementById('vote-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'vote-confirm-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.75);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
      animation: fadeIn 0.2s ease-out;
    `;

    modal.innerHTML = `
      <style>
        @keyframes fadeIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        #vote-confirm-box { animation: slideUp 0.25s ease-out; }
      </style>
      <div id="vote-confirm-box" style="
        background: #0f172a;
        border: 1px solid rgba(255,255,255,0.1);
        border-top: 4px solid ${color};
        border-radius: 24px;
        padding: 2.5rem;
        max-width: 480px;
        width: 100%;
        text-align: center;
        box-shadow: 0 30px 80px rgba(0,0,0,0.6);
      ">
        <div style="font-size:0.7rem; color:var(--text-secondary); font-weight:800; letter-spacing:3px; text-transform:uppercase; margin-bottom:1.5rem;">
          ðŸ” SECURE BALLOT CONFIRMATION
        </div>

        <div style="width:80px; height:80px; border-radius:50%; overflow:hidden; background:white; border:4px solid ${color}; margin: 0 auto 1.25rem; display:flex; align-items:center; justify-content:center;">
          <img src="${team.logo}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=font-size:2rem;font-weight:900;color:${color};>${team.name[0]}</span>'">
        </div>

        <h2 style="font-size:1.8rem; font-weight:900; color:white; margin-bottom:0.4rem;">${team.name}</h2>
        <div style="font-size:0.8rem; font-weight:800; color:${color}; letter-spacing:2px; text-transform:uppercase; margin-bottom:1.5rem;">BALLOT ID: #${team.numeric}</div>

        <p style="color:var(--text-secondary); font-size:0.9rem; line-height:1.6; margin-bottom:2rem; background:rgba(255,255,255,0.03); border-radius:12px; padding:1rem;">
          âš ï¸ This action is <strong style="color:white;">irreversible</strong>. Once submitted, your vote is cryptographically sealed and cannot be changed.
        </p>

        <div style="display:flex; gap:1rem; justify-content:center;">
          <button id="btn-vote-cancel" style="
            flex:1; padding:1rem; border-radius:12px;
            background:transparent; border:1px solid rgba(255,255,255,0.15);
            color:var(--text-secondary); font-weight:800; font-size:0.9rem;
            letter-spacing:1px; cursor:pointer; text-transform:uppercase;
            transition: all 0.2s;
          ">âœ• CANCEL</button>
          <button id="btn-vote-confirm" style="
            flex:2; padding:1rem; border-radius:12px;
            background:linear-gradient(135deg, ${color}, ${color}cc);
            border:none; color:#0f172a;
            font-weight:900; font-size:1rem; letter-spacing:2px;
            cursor:pointer; text-transform:uppercase;
            transition: all 0.2s; box-shadow: 0 8px 24px ${color}44;
          ">âœ“ CONFIRM VOTE</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Cancel
    document.getElementById('btn-vote-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Confirm â†’ cast vote
    document.getElementById('btn-vote-confirm').onclick = async () => {
      const confirmBtn = document.getElementById('btn-vote-confirm');
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = 'â³ SUBMITTING...';

      const result = await DB.castVote(this.activeVoterId, teamNumeric, this.activeElectionId);
      modal.remove();

      if (result.success) {
        this.showVoteSuccess(teamNumeric);
      } else {
        this.showVoteError(result.reason);
      }
    };
  },

  showVoteSuccess(teamNumeric) {
    // Lock all ballot buttons
    const container = document.getElementById('ballot-teams');
    if (container) {
      container.querySelectorAll('.ballot-btn').forEach(btn => {
        btn.disabled = true;
        btn.textContent = 'âœ“ VOTED';
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
      });
    }

    // Remove any leftover modal
    const old = document.getElementById('vote-success-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'vote-success-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(18px) saturate(0.6) brightness(0.45);
      -webkit-backdrop-filter: blur(18px) saturate(0.6) brightness(0.45);
      animation: svBgIn 0.35s ease-out forwards;
    `;

    modal.innerHTML = `
      <style>
        @keyframes svBgIn   { from{opacity:0} to{opacity:1} }
        @keyframes svRiseUp {
          from { opacity:0; transform: translateY(60px) scale(0.93); }
          to   { opacity:1; transform: translateY(0)    scale(1);    }
        }
        @keyframes svPulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        #sv-banner { animation: svRiseUp 0.45s cubic-bezier(0.34,1.4,0.64,1) forwards; }
        #sv-ring   { animation: svPulse 2s ease-in-out infinite; }
      </style>

      <!-- The 4:3 Banner -->
      <div id="sv-banner" style="
        /* 4:3 ratio â€” width drives height */
        width: min(72vw, 420px);
        aspect-ratio: 4 / 3;

        background: linear-gradient(160deg, rgba(15,23,42,0.97) 0%, rgba(10,20,40,0.98) 100%);
        border: 1px solid rgba(34,197,94,0.3);
        border-top: 4px solid #22c55e;
        border-radius: 22px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.55), 0 0 40px rgba(34,197,94,0.1);

        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.6rem;
        padding: 1.75rem 2rem;
        text-align: center;
        position: relative;
        overflow: hidden;
      ">
        <!-- Glow blob -->
        <div style="position:absolute;top:-50px;left:50%;transform:translateX(-50%);
          width:180px;height:180px;border-radius:50%;pointer-events:none;
          background:radial-gradient(circle,rgba(34,197,94,0.14) 0%,transparent 70%);"></div>

        <!-- Pulsing check ring -->
        <div id="sv-ring" style="
          width:56px; height:56px; border-radius:50%;
          background:rgba(34,197,94,0.12);
          border:2px solid rgba(34,197,94,0.55);
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0;
        ">
          <span style="font-size:1.75rem; line-height:1;">âœ…</span>
        </div>

        <!-- Badge -->
        <div style="font-size:0.55rem;font-weight:900;letter-spacing:4px;
          text-transform:uppercase;color:rgba(34,197,94,0.75);">
          ðŸ” VOTE CERTIFIED
        </div>

        <!-- Heading -->
        <h2 style="font-size:clamp(1.1rem,3.5vw,1.45rem);font-weight:900;
          color:#fff;line-height:1.2;margin:0;">
          Thank You for<br>Participating!
        </h2>

        <!-- Sub text -->
        <p style="font-size:clamp(0.7rem,2vw,0.82rem);font-weight:700;
          color:#22c55e;letter-spacing:0.5px;margin:0;">
          Your vote has been officially recorded.
        </p>

        <!-- Exit button -->
        <button id="btn-thank-you-exit" style="
          margin-top:0.4rem;
          padding:0.7rem 1.6rem;
          background:linear-gradient(135deg,#22c55e,#16a34a);
          border:none; border-radius:12px;
          color:#0f172a; font-weight:900;
          font-size:clamp(0.72rem,2vw,0.85rem);
          letter-spacing:2px; text-transform:uppercase;
          cursor:pointer;
          box-shadow:0 6px 24px rgba(34,197,94,0.4);
          transition:transform 0.2s, box-shadow 0.2s;
          display:flex; align-items:center; gap:0.5rem;
          flex-shrink:0;
        "
        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 10px 32px rgba(34,197,94,0.55)';"
        onmouseout="this.style.transform='';this.style.boxShadow='0 6px 24px rgba(34,197,94,0.4)';"
        >
          ðŸ”’ Exit Secure Booth
        </button>

        <!-- Footer -->
        <p style="font-size:0.6rem;color:rgba(255,255,255,0.2);letter-spacing:0.5px;margin:0;">
          SecureVote Â· Session Terminated
        </p>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-thank-you-exit').onclick = () => {
      modal.style.animation = 'svBgIn 0.2s ease-in reverse forwards';
      setTimeout(() => {
        modal.remove();
        if (typeof Assistant !== 'undefined') Assistant.wipeChat();
        PortalGuard.exitVoter();
      }, 200);
    };
  },

  showVoteError(reason) {
    const statusEl = document.getElementById('ballot-status');
    if (!statusEl) return;
    statusEl.style.cssText = `
      display:block; background:rgba(239,68,68,0.08);
      border:1px solid rgba(239,68,68,0.3); border-radius:16px;
      padding:2rem; text-align:center; margin-bottom:2rem;
    `;
    statusEl.innerHTML = `
      <div style="font-size:2.5rem; margin-bottom:1rem;">â›”</div>
      <div style="color:var(--error); font-weight:900; font-size:1.1rem; text-transform:uppercase; letter-spacing:2px; margin-bottom:0.75rem;">PROTOCOL VIOLATION</div>
      <p style="color:var(--text-secondary); font-size:0.9rem; line-height:1.5; max-width:350px; margin:0 auto 1.5rem;">${reason}</p>
      <button id="btn-error-exit" style="
        background:transparent; border:1px solid var(--error); color:var(--error);
        padding:0.75rem 1.75rem; border-radius:10px; font-weight:800;
        font-size:0.85rem; letter-spacing:1px; text-transform:uppercase; cursor:pointer;
      ">â†© GO BACK</button>
    `;
    document.getElementById('btn-error-exit').onclick = () => { statusEl.style.display = 'none'; };
  },

  async castVote(teamNumeric) {
    this.showVoteModal(teamNumeric);
  }
};

