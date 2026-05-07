/**
 * Organizer Logic V2
 * Media Picker, GPS, 6-per-page PDFs, ZIP JPG generation, Live Counting
 */

const Organizer = {
  liveInterval: null,
  map: null,
  marker: null,
  tempCoords: null,
  lastGeneratedIds: [],

  init() {
    this.bindEvents();
    // NOTE: renderState() is called by PortalGuard after successful code entry, NOT on init.
  },


  bindEvents() {
    const safeBind = (id, event, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, fn);
    };

    // Election Setup Media Picker
    safeBind('el-logo-file', 'change', async (e) => {
      if (e.target.files.length > 0) {
        const base64 = await DB.fileToBase64(e.target.files[0]);
        const urlField = document.getElementById('el-logo-url');
        const preview = document.getElementById('el-logo-preview');
        if (urlField) urlField.value = base64;
        if (preview) {
          preview.src = base64;
          preview.style.display = 'block';
        }
      }
    });

    // Team Media Picker
    safeBind('team-logo-file', 'change', async (e) => {
      if (e.target.files.length > 0) {
        const base64 = await DB.fileToBase64(e.target.files[0]);
        const urlField = document.getElementById('team-logo-url');
        const preview = document.getElementById('team-logo-preview');
        if (urlField) urlField.value = base64;
        if (preview) {
          preview.src = base64;
          preview.style.display = 'block';
        }
      }
    });

    // Add Team Submit
    const formTeam = document.getElementById('form-add-team');
    if (formTeam) {
      formTeam.addEventListener('submit', (e) => {
        e.preventDefault();
        const team = {
          name: document.getElementById('team-name').value,
          numeric: document.getElementById('team-numeric').value,
          logo: document.getElementById('team-logo-url').value || 'https://via.placeholder.com/150'
        };
        
        const exists = DB.getTeams().find(t => t.numeric === team.numeric);
        if (exists) return alert("Numeric Ballot ID must be unique.");

        DB.addTeam(team);
        e.target.reset();
        document.getElementById('team-logo-preview').style.display = 'none';
        this.renderTeams();
      });
    }

    // Generators (Now with Security Handshake)
    safeBind('btn-generate-tickets', 'click', async () => {
      if (!PortalGuard.requireOrganizer()) return; // Security Prompt
      const numInput = document.getElementById('num-voters');
      const num = numInput ? parseInt(numInput.value) : 12;
      await this.generateTicketsPDF(num);
    });

    safeBind('btn-generate-zip', 'click', async () => {
      if (!PortalGuard.requireOrganizer()) return; // Security Prompt
      await this.generateTicketsZIP();
    });

    // Draft Notice
    safeBind('btn-draft-notice', 'click', async () => {
      const el = DB.getElection();
      const teams = DB.getTeams();
      const votes = DB.getVotes();
      if (!el) return alert("Please establish election scope first.");
      
      let totalVotes = 0;
      teams.forEach(t => totalVotes += (votes[t.numeric] || 0));
      
      alert("Drafting public notice based on current configurations...");
      await Results.generateNoticeJPG(el, teams, votes, totalVotes, true);
    });

    // Publish — requires ORGANIZER CODE re-verification
    safeBind('btn-publish-results', 'click', async () => {
      if (!PortalGuard.requireOrganizer()) return;
      PortalGuard.showPublishConfirm(async () => {
        try {
          await DB.publishToCloud();
          DB.setStatus('published');
          this.stopLiveCounting();
          App.navigateTo('results-screen');
          if (typeof Results !== 'undefined') Results.render();
        } catch (e) {
          alert("PUBLISH_FAILED: " + e.message);
        }
      });
    });

    // Exit
    safeBind('btn-exit-organizer', 'click', () => {
      this.stopLiveCounting();
      PortalGuard.exitOrganizer();
    });
  },

  renderState() {
    // Enforce organizer-only access
    if (!PortalGuard.requireOrganizer()) return;

    const el = DB.getElection();
    const status = DB.getStatus();
    const eid = DB.getElectionId();

    // Authoritative Lifecycle: Always enable participant and live-count engines
    this.renderTeams();
    this.startLiveCounting();

    if (el) {
      const setVal = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ''; };
      
      // Update Establish Button State
      const btnEstablish = document.getElementById('btn-establish-protocol');
      if (btnEstablish && eid) {
        btnEstablish.disabled = true;
        btnEstablish.innerHTML = '<i data-lucide="shield-check"></i> PROTOCOL ESTABLISHED & LOCKED';
        btnEstablish.style.background = 'var(--success)';
        btnEstablish.style.opacity = '0.7';
      }

      setVal('el-title', el.title);
      setVal('el-type', el.type);
      setVal('el-reason', el.reason);
      setVal('el-state', el.location.state);
      setVal('el-city', el.location.city);
      setVal('el-pincode', el.location.pincode);
      setVal('el-address', el.location.address);
      setVal('el-date', el.date);
      setVal('el-start', el.start);
      setVal('el-end', el.end);
      setVal('el-logo-url', el.logo);
      
      const teamsPanel = document.getElementById('teams-panel');
      if (teamsPanel) {
        teamsPanel.style.opacity = '1';
        teamsPanel.style.pointerEvents = 'auto';
      }
    }

    if (status === 'COMPLETED') {
      const grid = document.querySelector('#organizer-screen .dashboard-grid');
      if (grid) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 4rem; background: rgba(15, 23, 42, 0.85); border-radius: 12px; border: 1px solid var(--border);">
            <h2 style="color:var(--text-secondary); margin-bottom: 2rem;">This protocol has concluded and results are certified.</h2>
            <button id="btn-start-new-vote" class="btn btn-primary" style="padding: 1rem 2rem; font-size: 1.2rem;"><i data-lucide="refresh-cw"></i> Initialize New Election Protocol</button>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        const resetBtn = document.getElementById('btn-start-new-vote');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            if(confirm("WARNING: This will permanently delete all data, teams, and votes from the concluded election. Are you sure you want to start a new protocol?")) {
              DB.hardReset();
              location.reload();
            }
          });
        }
      }
    }
  },

  renderTeams() {
    const teams = DB.getTeams();
    const list = document.getElementById('teams-list');
    if (!list) return;

    if (teams.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:3rem 1rem; color:rgba(255,255,255,0.2); border:1px dashed rgba(255,255,255,0.1); border-radius:12px;">
          <i data-lucide="users" style="width:40px; height:40px; margin-bottom:1rem; opacity:0.5;"></i>
          <p style="font-size:0.85rem; font-weight:600; letter-spacing:1px;">NO ENTITIES REGISTERED</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    console.log(`Rendering ${teams.length} participants in the official roster...`);

    list.innerHTML = teams.map(t => {
      const nId = String(t.numeric);
      return `
        <div class="team-card-item" style="display:flex; align-items:center; gap:1rem; padding:0.85rem 1.25rem; background:rgba(255,255,255,0.04); border-radius:12px; border:1px solid rgba(255,255,255,0.08); transition: all 0.3s ease; margin-bottom:0.75rem;">
          <div style="width:40px; height:40px; background:white; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; border: 2px solid var(--primary);">
            <img src="${t.logo}" style="width:100%; height:100%; object-fit:cover;">
          </div>
          <div style="flex:1;">
            <div style="font-weight: 800; font-size: 1rem; letter-spacing: 0.5px; color:white;">${t.name}</div>
            <div style="font-size: 0.7rem; color:var(--primary); font-weight:900; letter-spacing: 1px;">BALLOT ID: #${nId}</div>
          </div>
          <button class="btn-delete-team" data-numeric="${nId}" style="background:transparent; border:none; color:rgba(239, 68, 68, 0.4); cursor:pointer; padding:0.5rem; transition:0.2s;">
            <i data-lucide="trash-2" style="width:18px; height:18px;"></i>
          </button>
        </div>
      `;
    }).join('');

    // Bind Delete Events
    list.querySelectorAll('.btn-delete-team').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const numeric = String(btn.dataset.numeric);
        const team = teams.find(t => String(t.numeric) === numeric);
        if (confirm(`AUTHORIZATION REQUIRED: Permanently remove '${team.name}' (#${numeric})?`)) {
          DB.removeTeam(numeric);
          this.renderTeams();
        }
      });
    });

    if (window.lucide) lucide.createIcons();

    // Force Panel Visibility
    const teamsPanel = document.getElementById('teams-panel');
    if (teamsPanel) {
      teamsPanel.style.opacity = '1';
      teamsPanel.style.pointerEvents = 'auto';
    }

    if (teams.length > 0) {
      const actionsPanel = document.getElementById('actions-panel');
      const livePanel = document.getElementById('live-panel');
      const publishBtn = document.getElementById('btn-publish-results');

      if (actionsPanel) {
        actionsPanel.style.opacity = '1';
        actionsPanel.style.pointerEvents = 'auto';
      }
      if (livePanel) livePanel.style.opacity = '1';
      if (publishBtn) publishBtn.disabled = false;
    }
  },

  startLiveCounting() {
    if (typeof PortalGuard !== 'undefined' && Auth.currentPortal !== 'organizer') return;
    this.stopLiveCounting();
    
    this.liveInterval = setInterval(async () => {
      const eid = DB.getElectionId();
      if (!eid) return;

      try {
        const doc = await firebase.firestore().collection('elections').doc(eid).get();
        if (!doc.exists) return;
        
        const data = doc.data();
        
        // SECURITY SHIELD: Check ownership
        if (data.organizerUid !== firebase.auth().currentUser.uid) {
          console.error("SECURITY_VIOLATION: UID Mismatch. Access Terminated.");
          this.stopLiveCounting();
          return;
        }

        const votes = data.votes || {};
        const teams = data.teams || [];

        // MANDATORY CLOUD SYNC: Always prioritize cloud data for UI consistency
        if (teams.length > 0) {
          localStorage.setItem(DB.KEYS.TEAMS, JSON.stringify(teams));
          localStorage.setItem(DB.KEYS.VOTES, JSON.stringify(votes));
          this.renderTeams(); // Force middle column update
        }

        const area = document.getElementById('live-counting-area');
        if (!area) return;

        let total = 0;
        let html = '';
        teams.forEach(t => {
          const v = votes[t.numeric] || 0;
          total += v;
          const initial = t.name ? t.name.charAt(0).toUpperCase() : '?';
          html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.03); padding: 0.8rem 1.2rem; border-radius: 12px; margin-bottom: 0.75rem; border: 1px solid rgba(255,255,255,0.05);">
              <div style="display:flex; align-items:center; gap:1rem;">
                <img src="${t.logo}" style="width:32px; height:32px; border-radius:50%; object-fit:cover; background:white; border: 1px solid var(--border);" onerror="this.style.display='none'">
                <span style="font-weight: 600; letter-spacing: 0.5px;">${t.name}</span>
              </div>
              <strong style="color:var(--accent); font-size: 1.1rem;">${v} <span style="font-size:0.7rem; opacity:0.7;">VOTES</span></strong>
            </div>
          `;
        });
        html += `<div style="text-align:right; margin-top:1rem; color:var(--text-secondary); font-weight: 800; font-size: 0.75rem; letter-spacing: 1px;">LIVE CLOUD SYNC: ${new Date().toLocaleTimeString()}</div>`;
        area.innerHTML = html;
      } catch (e) {
        console.error("Live Sync Error:", e);
      }
    }, 5000); // Sync every 5 seconds
  },

  stopLiveCounting() {
    if (this.liveInterval) clearInterval(this.liveInterval);
  },

  generateId() {
    return 'VOTER-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  },

  async getTicketCanvas(vid, el) {
    const logoTpl = document.getElementById('tpl-logo');
    const waterTpl = document.getElementById('tpl-watermark');
    
    // ON-THE-FLY SERIALIZATION: Ensure logo is Base64 for zero-taint rendering
    let finalLogo = el.logo;
    if (finalLogo && finalLogo.startsWith('http')) {
      console.log("SERIALIZATION_HANDSHAKE: Converting logo URL to local Base64 for PDF fidelity...");
      finalLogo = await DB.urlToBase64(finalLogo);
    }
    
    // Set sources
    if (logoTpl) logoTpl.src = finalLogo;
    if (waterTpl) waterTpl.src = finalLogo;
    
    // IMAGE SYNC PROTOCOL: Wait for assets to be ready before capture
    const waitForImages = () => {
      const imgs = [logoTpl, waterTpl].filter(i => i && i.src);
      return Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve; // Continue even if error
          setTimeout(resolve, 1000); // Fail-safe
        });
      }));
    };

    await waitForImages();

    const setTplText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerText = text;
    };

    setTplText('tpl-title', el.title);
    setTplText('tpl-type', el.type);
    setTplText('tpl-reason', el.reason);
    setTplText('tpl-datetime', `${el.date} | ${el.start} to ${el.end}`);
    setTplText('tpl-location', `${el.location.address}, ${el.location.city}, ${el.location.state} - ${el.location.pincode}`);
    setTplText('tpl-vid', vid);
    
    const appUrl = window.location.href.split('?')[0].split('#')[0];
    setTplText('tpl-loc-url', el.location.mapUrl);
    setTplText('tpl-app-url', appUrl);

    // QR Generation (Cloud Enhanced: includes ElectionID)
    const qrContainer = document.getElementById('tpl-qr');
    const electionId = DB.getElectionId();
    const qrData = electionId ? `${vid}|${electionId}` : vid;
    
    if (qrContainer) {
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, {
        text: qrData,
        width: 210,
        height: 210,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
      // Wait for QR canvas to render
      await new Promise(r => setTimeout(r, 150));
    }

    const tpl = document.getElementById('ticket-template');
    const canvas = await html2canvas(tpl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff"
    });
    return canvas;
  },

  async generateTicketsPDF(count) {
    // CLOUD SYNC CHECK: Ensure ElectionID is established before generating tickets
    let eid = DB.getElectionId();
    if (!eid) {
      alert("INITIALIZING CLOUD PROTOCOL: Please wait while we secure your Election ID...");
      try {
        eid = await DB.publishToCloud();
        alert("CLOUD_READY: Election ID secured. Generating tickets now.");
      } catch (e) {
        return alert("CLOUD_ERROR: Could not establish a secure connection to the cloud. Tickets cannot be generated without a cloud ID.");
      }
    }

    alert(`Generating ${count} structured 6-per-page A4 PDF tickets. Please wait...`);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    const el = DB.getElection();
    const voters = DB.getVoters();
    this.lastGeneratedIds = [];

    const tWidth = 90;
    const tHeight = 45;
    const marginX = 10;
    const marginY = 10;
    const gapX = 10;
    const gapY = 10;

    let ticketOnPage = 0;

    for (let i = 0; i < count; i++) {
      const vid = this.generateId();
      voters[vid] = { voted: false, timestamp: null };
      this.lastGeneratedIds.push(vid);
      
      const canvas = await this.getTicketCanvas(vid, el);
      if (!canvas) continue;
      const imgData = canvas.toDataURL('image/png');

      if (ticketOnPage === 6) {
        doc.addPage();
        ticketOnPage = 0;
      }

      const col = ticketOnPage % 2;
      const row = Math.floor(ticketOnPage / 2);
      const x = marginX + col * (tWidth + gapX);
      const y = marginY + row * (tHeight + gapY);

      doc.addImage(imgData, 'PNG', x, y, tWidth, tHeight);
      
      const appUrl = window.location.href.split('?')[0].split('#')[0];
      doc.link(x + 5, y + 25, 12, 12, { url: el.location.mapUrl });
      doc.link(x + 18, y + 25, 22, 12, { url: appUrl });
      
      ticketOnPage++;
    }

    await DB.saveVoters(voters);
    doc.save(`${el.title.replace(/\s+/g, '_')}_Official_Print_Sheet.pdf`);
    alert(`Successfully generated ${count} tickets. You can now download them as individual PDFs in a ZIP.`);
  },

  async generateTicketsZIP() {
    const el = DB.getElection();
    const voters = DB.getVoters();
    const { jsPDF } = window.jspdf;
    
    const targetIds = this.lastGeneratedIds.length > 0 ? this.lastGeneratedIds : Object.keys(voters);
    if(targetIds.length === 0) return alert("Please generate tickets (PDF) first to create Voter IDs.");
    
    alert(`Packaging ${targetIds.length} individual digital PDF tickets. This may take a moment...`);
    const zip = new JSZip();
    const folder = zip.folder(`${el.title.replace(/\s+/g, '_')}_Individual_Tickets`);
    const appUrl = window.location.href.split('?')[0].split('#')[0];

    for (const vid of targetIds) {
      const canvas = await this.getTicketCanvas(vid, el);
      if (!canvas) continue;
      const imgData = canvas.toDataURL('image/png');
      
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [100, 50] });
      doc.addImage(imgData, 'PNG', 0, 0, 100, 50);
      doc.link(5, 28, 15, 14, { url: el.location.mapUrl });
      doc.link(22, 28, 25, 14, { url: appUrl });
      
      const pdfBlob = doc.output('blob');
      folder.file(`${vid}.pdf`, pdfBlob);
    }

    zip.generateAsync({type:"blob"}).then(function(content) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${el.title.replace(/\s+/g, '_')}_Digital_Tickets_Batch.zip`;
      link.click();
    });
  },

  openMapPicker() {
    const modal = document.getElementById('map-picker-modal');
    if (modal) {
      modal.style.display = 'flex';
      setTimeout(() => this.initMap(), 100);
    }
  },

  initMap() {
    if (this.map) {
      this.map.invalidateSize();
      return;
    }
    const indiaLat = 20.5937;
    const indiaLng = 78.9629;
    if (window.L) {
      this.map = L.map('map-container').setView([indiaLat, indiaLng], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(this.map);
      this.map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        this.setTempMarker(lat, lng);
      });
    }
  },

  setTempMarker(lat, lng) {
    this.tempCoords = { lat, lng };
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      if (window.L) this.marker = L.marker([lat, lng]).addTo(this.map);
    }
  },

  confirmMap() {
    if (!this.tempCoords) return alert("Please select a location on the map first.");
    const latField = document.getElementById('el-gps-lat');
    const lngField = document.getElementById('el-gps-lng');
    const status = document.getElementById('gps-status');
    const gpsBtn = document.getElementById('id-btn-gps');

    if (latField) latField.value = this.tempCoords.lat;
    if (lngField) lngField.value = this.tempCoords.lng;
    if (status) {
      status.style.display = 'block';
      if (window.lucide) lucide.createIcons();
    }
    if (gpsBtn) {
      gpsBtn.innerHTML = '<i data-lucide="map-pin" class="icon-primary"></i> GEOGRAPHIC LOCK SECURED';
      if (window.lucide) lucide.createIcons();
    }
    this.closeMap();
    alert("PRECISION LOCK SECURED: Coordinates have been mapped and recorded in the protocol.");
  },

  closeMap() {
    const modal = document.getElementById('map-picker-modal');
    if (modal) modal.style.display = 'none';
  }
};
