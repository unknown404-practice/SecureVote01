/**
 * Results Generation Logic V2
 */

const Results = {
  activeElectionId: null,
  unsubscribe: null,

  async render(providedEId = null) {
    const eId = providedEId || new URLSearchParams(window.location.search).get('electionId') || DB.getElectionId();
    
    if (!eId) {
      console.warn("No Election ID found for results.");
      return;
    }

    this.activeElectionId = eId;

    // Start Real-time Listener if not already active
    if (!this.unsubscribe) {
      this.initListener(eId);
    }
  },

  initListener(eId) {
    if (this.unsubscribe) this.unsubscribe();

    console.log(`[Results] Listening to Cloud Election: ${eId}`);
    this.unsubscribe = firebase.firestore().collection('elections').doc(eId)
      .onSnapshot((doc) => {
        if (doc.exists) {
          const data = doc.data();
          this.updateUI(data);
        } else {
          console.error("Election not found in cloud.");
        }
      }, (err) => {
        console.error("Results Listener Error:", err);
      });
  },

  updateUI(data) {
    const el = data.election || data.config || {};
    const teams = data.teams || [];
    const votes = data.votes || {};

    if (teams.length === 0) return;

    // Sort by votes
    const sortedTeams = [...teams].sort((a, b) => (votes[b.numeric] || 0) - (votes[a.numeric] || 0));

    // Update Text Elements
    const setTxt = (id, txt) => { const e = document.getElementById(id); if(e) e.innerText = txt; };
    setTxt('res-el-title', el.title || "Untitled Election");
    setTxt('res-el-type', el.type || "General");
    setTxt('res-el-reason', `"${el.reason || ""}"`);
    setTxt('res-el-date', `${el.date} | ${el.start} to ${el.end}`);
    
    let totalVotes = 0;
    Object.values(votes).forEach(v => totalVotes += v);
    setTxt('res-total-votes', totalVotes);

    // Winner Info
    const winner = sortedTeams[0];
    const winnerVotes = votes[winner.numeric] || 0;
    setTxt('res-winner-name', winnerVotes > 0 ? winner.name : "Waiting for Votes...");
    setTxt('res-winner-votes', `${winnerVotes} Authenticated Votes`);
    
    const winLogo = document.getElementById('res-winner-logo');
    if(winLogo) {
      winLogo.innerHTML = winnerVotes > 0 ? `<img src="${winner.logo}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-secondary);"><i data-lucide="award" style="width:60px; height:60px;"></i></div>`;
      if (window.lucide) lucide.createIcons();
    }

    // List Breakdown
    const list = document.getElementById('res-teams-breakdown');
    if (list) {
      list.innerHTML = sortedTeams.map((t, i) => {
        const v = votes[t.numeric] || 0;
        const pct = totalVotes === 0 ? 0 : Math.round((v / totalVotes) * 100);
        return `
          <div class="glass-panel p-1" style="display:flex; align-items:center; gap:1.5rem; margin-bottom:0.5rem; ${i===0 && v>0 ? 'border-left:4px solid var(--success);' : ''}">
            <img src="${t.logo}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; background:white; padding:2px; border:1px solid var(--border);">
            <div style="flex:1;">
              <h3 style="margin-bottom:0.25rem; font-size:1rem;">${t.name} <span style="font-size:0.8rem; color:var(--text-secondary);">#${t.numeric}</span></h3>
              <div style="width:100%; background:var(--bg-dark); height:6px; border-radius:3px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:var(--primary);"></div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.2rem; font-weight:bold; color:var(--primary);">${v}</div>
              <div style="font-size:0.8rem; color:var(--text-secondary);">${pct}%</div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Chart
    this.renderChart(sortedTeams, votes);

    // Bind Action Buttons (Only once or re-bind if needed)
    this.bindButtons(el, sortedTeams, votes, totalVotes);
  },

  bindButtons(el, teams, votes, totalVotes) {
    const guarded = (fn) => { if (PortalGuard.requireOrganizer()) fn(); };
    
    const bPdf = document.getElementById('btn-download-report');
    if(bPdf) bPdf.onclick = () => guarded(() => this.generatePDF(el, teams, votes, totalVotes));

    const bDoc = document.getElementById('btn-download-docx');
    if(bDoc) bDoc.onclick = () => guarded(() => this.generateDOCX(el, teams, votes, totalVotes));

    const bJpg = document.getElementById('btn-download-notice');
    if(bJpg) bJpg.onclick = () => this.generateNoticeJPG(el, teams, votes, totalVotes);
  },

  renderChart(teams, votes) {
    const canvas = document.getElementById('results-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.myChart) window.myChart.destroy();
    
    window.myChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: teams.map(t => t.name),
        datasets: [{
          data: teams.map(t => votes[t.numeric] || 0),
          backgroundColor: ['#38bdf8', '#fbbf24', '#f87171', '#4ade80', '#818cf8', '#f472b6'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Inter' } } }
        }
      }
    });
  },

  generatePDF(el, teams, votes, totalVotes) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42);
      doc.text("Official Election Results Certificate", 105, 20, null, null, "center");
      
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.text(`Protocol ID: SV-CERT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`, 105, 28, null, null, "center");
      
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(`ELECTION: ${el.title.toUpperCase()}`, 20, 45);
      
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      doc.text(`Type: ${el.type}`, 20, 53);
      doc.text(`Timeline: ${el.date} (${el.start} to ${el.end})`, 20, 60);
      doc.text(`Location: ${el.location.address}, ${el.location.city}, ${el.location.state}`, 20, 67);
      doc.text(`Mandate: ${el.reason}`, 20, 74);
      
      doc.setFontSize(16);
      doc.setTextColor(56, 189, 248);
      doc.text(`TOTAL AUTHENTICATED VOTES CAST: ${totalVotes}`, 105, 90, null, null, "center");
      
      // Table Header
      doc.setDrawColor(226, 232, 240);
      doc.line(20, 100, 190, 100);
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text("RANK", 20, 107);
      doc.text("PARTICIPANT NAME", 40, 107);
      doc.text("BALLOT #", 120, 107);
      doc.text("VOTES", 150, 107);
      doc.text("PERCENTAGE", 170, 107);
      doc.line(20, 110, 190, 110);
      
      // Rows
      let y = 118;
      teams.forEach((t, i) => {
        const v = votes[t.numeric] || 0;
        const pct = totalVotes === 0 ? 0 : Math.round((v / totalVotes) * 100);
        
        doc.setFontSize(10);
        if (i === 0 && v > 0) doc.setTextColor(74, 222, 128); // Winner green
        else doc.setTextColor(15, 23, 42);
        
        doc.text(`${i+1}`, 20, y);
        doc.text(`${t.name}`, 40, y);
        doc.text(`${t.numeric}`, 120, y);
        doc.text(`${v}`, 150, y);
        doc.text(`${pct}%`, 170, y);
        
        y += 10;
        if (y > 270) {
          doc.addPage();
          y = 30;
        }
      });

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text(`Authenticated via SecureVote Cryptographic Framework. This document serves as the official certification of results.`, 105, 285, null, null, "center");
      doc.text(`Timestamp: ${new Date().toLocaleString()} | Digital Signature: [SECURE_VOTE_LOCAL_LOCK]`, 105, 290, null, null, "center");

      doc.save(`${el.title.replace(/\s+/g, '_')}_Official_Results.pdf`);
    } catch (err) {
      console.error(err);
      alert("PDF Error: " + err.message);
    }
  },

  async generateNoticeJPG(el, teams, votes, totalVotes, isDraft = false) {
    try {
      const template = document.getElementById('notice-template');
      
      // Fill Template
      document.getElementById('notice-el-title').innerText = isDraft ? `[DRAFT] ${el.title.toUpperCase()}` : el.title.toUpperCase();
      document.getElementById('notice-el-meta').innerText = `${el.type} | ${el.date} | ${el.location.city}, ${el.location.state}`;
      document.getElementById('notice-el-reason').innerText = `"${el.reason}"`;
      document.getElementById('notice-total-votes').innerText = totalVotes;
      
      const winner = teams[0];
      const v = votes[winner.numeric] || 0;
      
      const appLogo = document.getElementById('notice-app-logo');
      if (appLogo) appLogo.src = el.logo || 'app_icon.png';

      document.getElementById('notice-winner-name').innerText = (v > 0 && !isDraft) ? winner.name : (isDraft ? "PENDING OFFICIAL COUNT" : "PROTOCOL CONCLUDED");
      document.getElementById('notice-timestamp').innerText = isDraft ? `DRAFT GENERATED ON: ${new Date().toLocaleString()}` : `CERTIFIED ON: ${new Date().toLocaleString()}`;

      // Breakdown in JPG
      const breakdown = document.getElementById('notice-breakdown-container');
      breakdown.innerHTML = teams.slice(0, 10).map(t => {
        const v = votes[t.numeric] || 0;
        const logoSrc = (t.logo && t.logo.length > 5) ? t.logo : 'app_icon.png';
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; background:rgba(255,255,255,0.05); padding:15px 25px; border-radius:15px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; align-items:center; gap:15px;">
              <div style="width:55px; height:55px; background:rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.2); border-radius:50%; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                <img src="${logoSrc}" style="width:100%; height:100%; object-fit:cover;">
              </div>
              <span style="font-size:1.4rem; font-weight:700; letter-spacing:1px;">${t.name}</span>
            </div>
            <span style="font-size:1.4rem; color:var(--accent); font-weight:900;">${v} <span style="font-size:0.9rem; opacity:0.7;">VOTES</span></span>
          </div>
        `;
      }).join('');

      // Create Logo Watermark Grid
      const watermark = document.getElementById('notice-watermark');
      watermark.innerHTML = '';
      if (teams.length > 0) {
        for (let i = 0; i < 15; i++) {
          const t = teams[i % teams.length];
          const logoSrc = (t.logo && t.logo.length > 20) ? t.logo : 'https://via.placeholder.com/150?text=LOGO';
          const img = document.createElement('img');
          img.src = logoSrc;
          img.style.width = "150px";
          img.style.height = "150px";
          img.style.objectFit = "contain";
          img.style.margin = "20px";
          img.style.opacity = "0.6"; 
          watermark.appendChild(img);
        }
      }

      alert(isDraft ? "Generating Official Draft Notice..." : "Capturing High-Resolution Public Notice...");
      
      // Ensure all images are loaded and decoded
      const imgs = Array.from(template.getElementsByTagName('img'));
      await Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(r => { img.onload = r; img.onerror = r; });
      }));

      // Final wait for browser paint
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const canvas = await html2canvas(template, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#0f172a",
        logging: false
      });

      const link = document.createElement('a');
      link.download = isDraft ? `DRAFT_NOTICE_${el.title.replace(/\s+/g, '_')}.jpg` : `${el.title.replace(/\s+/g, '_')}_Public_Notice.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.98);
      link.click();
    } catch (err) {
      console.error(err);
      alert("Notice Export Error: " + err.message);
    }
  },

  generateDOCX(el, teams, votes, totalVotes) {
    try {
      const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Election Report</title></head><body>`;
      const footer = `</body></html>`;
      
      let tableRows = teams.map((t, i) => {
        const v = votes[t.numeric] || 0;
        const pct = totalVotes === 0 ? 0 : Math.round((v / totalVotes) * 100);
        return `<tr>
          <td style="border:1px solid #ccc; padding:8px;">${i+1}</td>
          <td style="border:1px solid #ccc; padding:8px;">${t.name}</td>
          <td style="border:1px solid #ccc; padding:8px;">#${t.numeric}</td>
          <td style="border:1px solid #ccc; padding:8px; font-weight:bold;">${v}</td>
          <td style="border:1px solid #ccc; padding:8px;">${pct}%</td>
        </tr>`;
      }).join('');

      const content = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <h1 style="text-align:center; color:#1e293b; border-bottom: 2px solid #3b82f6; padding-bottom:10px;">Official Election Report</h1>
          <p style="text-align:center; color:#64748b;">Generated via SecureVote Protocol</p>
          
          <div style="margin: 30px 0;">
            <h3>Election Scope</h3>
            <p><strong>Title:</strong> ${el.title}</p>
            <p><strong>Type:</strong> ${el.type}</p>
            <p><strong>Timeline:</strong> ${el.date} (${el.start} - ${el.end})</p>
            <p><strong>Location:</strong> ${el.location.address}, ${el.location.city}, ${el.location.state}</p>
          </div>

          <div style="background:#f1f5f9; padding:20px; border-radius:10px; margin-bottom:30px;">
            <h2 style="margin:0; color:#2563eb;">Total Votes Cast: ${totalVotes}</h2>
            <p style="margin:5px 0 0 0; color:#475569;">Protocol Integrity Verified: Active</p>
          </div>

          <table style="width:100%; border-collapse:collapse; margin-bottom:40px;">
            <thead>
              <tr style="background:#e2e8f0; text-align:left;">
                <th style="border:1px solid #ccc; padding:10px;">Rank</th>
                <th style="border:1px solid #ccc; padding:10px;">Participant</th>
                <th style="border:1px solid #ccc; padding:10px;">Ballot #</th>
                <th style="border:1px solid #ccc; padding:10px;">Votes</th>
                <th style="border:1px solid #ccc; padding:10px;">%</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div style="border-top:1px solid #e2e8f0; padding-top:20px; font-size:12px; color:#94a3b8; text-align:center;">
            <p>Certified on: ${new Date().toLocaleString()}</p>
            <p>This document is a concluded official record of the ${el.title}.</p>
          </div>
        </div>
      `;

      const source = header + content + footer;
      const blob = new Blob(['\ufeff', source], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${el.title.replace(/\s+/g, '_')}_Official_Report.doc`;
      link.click();
      
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      alert("DOCX Export Error: " + err.message);
    }
  }
};
