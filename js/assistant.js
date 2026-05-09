/**
 * SecureVote Personal Assistant — V4
 * Smart rule-based assistant with full election context awareness.
 * Supports: candidates, timing, location, rules, security, how-to-vote.
 */

const Assistant = {
  chatContainer: null,
  inputField: null,
  form: null,
  initialized: false,

  ensureInit() {
    if (this.initialized) return;
    this.chatContainer = document.getElementById('ai-chat');
    this.form = document.getElementById('form-ai');
    this.inputField = document.getElementById('ai-input');

    if (this.form) {
      this.form.onsubmit = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        try {
          const q = (this.inputField.value || '').trim();
          if (q) this.handleQuery(q);
        } catch (err) {
          console.error("Assistant Error:", err);
        }
        return false;
      };
    }

    this.wipeChat();
    this.initialized = true;
  },

  wipeChat() {
    if (this.chatContainer) {
      this.chatContainer.innerHTML = '';
      this.addMessage('ai', `👋 Hello! I'm your <strong>SecureVote Personal Assistant</strong>.<br><br>I have full context of this election. You can ask me about <strong>candidates, voting hours, location, rules, security</strong>, or anything else about this protocol.<br><br>Use the quick buttons below or type your question!`);
    }
  },

  quickAsk(question) {
    if (!this.initialized) this.ensureInit();
    this.handleQuery(question);
    // Hide suggestion chips after use
    const chips = document.getElementById('ai-suggestions');
    if (chips) chips.style.display = 'none';
  },

  addMessage(role, html) {
    if (!this.chatContainer) return;
    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`;
    msg.innerHTML = html;
    this.chatContainer.appendChild(msg);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  },

  showTyping() {
    const el = document.createElement('div');
    el.className = 'chat-msg ai typing-indicator';
    el.id = 'ai-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    this.chatContainer.appendChild(el);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  },

  hideTyping() {
    const el = document.getElementById('ai-typing');
    if (el) el.remove();
  },

  handleQuery(query) {
    if (!query.trim()) return;
    this.addMessage('user', query);
    if (this.inputField) this.inputField.value = '';

    this.showTyping();
    setTimeout(() => {
      this.hideTyping();
      this.addMessage('ai', this.getResponse(query));
    }, 700);
  },

  getResponse(query) {
    const q = query.toLowerCase();
    const el = DB.getElection();

    if (!el) {
      return '⚠️ No election protocol has been initialized yet. Please contact the Organizer.';
    }

    const teams = DB.getTeams();
    const now = new Date();
    const startTime = new Date(`${el.date}T${el.start}`);
    const endTime   = new Date(`${el.date}T${el.end}`);
    let pollStatus = now < startTime ? '⏳ Not yet open' : now > endTime ? '🔴 Closed' : '🟢 LIVE & OPEN';

    // --- Greeting ---
    if (q.match(/^(hi|hello|hey|namaste|good\s*(morning|afternoon|evening))/)) {
      return `Hello! 👋 Welcome to the <strong>${el.title}</strong> voting session. I'm here to help you through the entire process. What would you like to know?`;
    }

    // --- Candidates / Teams ---
    if (q.includes('candidate') || q.includes('team') || q.includes('party') || q.includes('who') || q.includes('ballot') || q.includes('contestant')) {
      if (teams.length === 0) return '⚠️ No candidates have been registered yet. Please contact the Election Organizer.';
      const list = teams.map(t =>
        `<div style="display:flex;align-items:center;gap:0.5rem;margin:0.4rem 0;padding:0.5rem 0.75rem;background:rgba(255,255,255,0.05);border-radius:8px;">
          <img src="${t.logo}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;background:white;" onerror="this.style.display='none'">
          <div><strong>${t.name}</strong> — Ballot #${t.numeric}</div>
        </div>`
      ).join('');
      return `There are <strong>${teams.length} registered candidate(s)</strong> in this election:<br>${list}<br>Cast your vote by clicking the <strong>VOTE FOR BALLOT #</strong> button on the Official Ballot screen.`;
    }

    // --- Voting time / hours ---
    if (q.includes('time') || q.includes('hour') || q.includes('when') || q.includes('schedule') || q.includes('open') || q.includes('close')) {
      return `🕐 <strong>Polling Window:</strong><br>
        <strong>Date:</strong> ${el.date}<br>
        <strong>Opens:</strong> ${el.start}<br>
        <strong>Closes:</strong> ${el.end}<br><br>
        Current Status: <strong>${pollStatus}</strong><br><br>
        ${now < startTime ? `The booth opens at <strong>${el.start}</strong>. Please return at that time.` :
          now > endTime ? `The polling window has <strong>closed</strong>. No more votes are being accepted.` :
          `The booth is <strong>currently open</strong>! You can cast your vote right now.`}`;
    }

    // --- Date only ---
    if (q.includes('date') || q.includes('day')) {
      return `📅 This election is scheduled for <strong>${el.date}</strong>, from <strong>${el.start}</strong> to <strong>${el.end}</strong>.`;
    }

    // --- Location ---
    if (q.includes('where') || q.includes('location') || q.includes('place') || q.includes('address') || q.includes('gps') || q.includes('city') || q.includes('state')) {
      return `📍 <strong>Official Polling Location:</strong><br>
        <strong>Address:</strong> ${el.location.address}<br>
        <strong>City:</strong> ${el.location.city}<br>
        <strong>State:</strong> ${el.location.state}<br>
        <strong>Pincode:</strong> ${el.location.pincode}<br><br>
        The exact GPS coordinates are also embedded in your voter ticket for navigation.`;
    }

    // --- How to vote ---
    if (q.includes('how') || q.includes('step') || q.includes('process') || q.includes('procedure') || q.includes('cast') || q.includes('submit')) {
      return `✅ <strong>How to Vote — Step by Step:</strong><br><br>
        <strong>1.</strong> You are already authenticated ✓<br>
        <strong>2.</strong> Go to the <strong>Official Ballot</strong> (the main screen)<br>
        <strong>3.</strong> Review all registered candidates carefully<br>
        <strong>4.</strong> Click <strong>"VOTE FOR BALLOT #X"</strong> for your chosen candidate<br>
        <strong>5.</strong> Confirm in the security popup<br>
        <strong>6.</strong> Your vote is recorded and the booth locks permanently<br><br>
        ⚠️ You can only vote <strong>once</strong>. This action is irreversible.`;
    }

    // --- Rules / guidelines ---
    if (q.includes('rule') || q.includes('guideline') || q.includes('regulation') || q.includes('allowed') || q.includes('prohibit') || q.includes('code')) {
      return `📋 <strong>Official Voting Rules:</strong><br><br>
        🔹 You are permitted <strong>exactly ONE vote</strong> per session<br>
        🔹 Your vote is <strong>final and cannot be changed</strong><br>
        🔹 Voting is only valid within the official polling window<br>
        🔹 Do <strong>NOT share</strong> your Voter ID or QR code with anyone<br>
        🔹 Do not allow others to view your screen while voting<br>
        🔹 If you face any issue, contact the Organizer <strong>before</strong> voting<br><br>
        This platform complies with the <strong>Model Code of Conduct</strong>.`;
    }

    // --- Security / encryption ---
    if (q.includes('secure') || q.includes('safe') || q.includes('encrypt') || q.includes('private') || q.includes('anonymous') || q.includes('hack') || q.includes('data')) {
      return `🔒 <strong>Security Assurance:</strong><br><br>
        ✅ <strong>AES-256 Bit</strong> local encryption<br>
        ✅ <strong>Zero cloud dependency</strong> — all data stays on this device<br>
        ✅ <strong>Full anonymity</strong> — your identity is never linked to your vote after submission<br>
        ✅ <strong>Hash-verified</strong> — each vote is tamper-evident<br>
        ✅ <strong>One-vote lockout</strong> — your Voter ID is locked the moment you vote<br><br>
        No one — not even the Organizer — can see how you voted.`;
    }

    // --- Election type / mandate ---
    if (q.includes('type') || q.includes('reason') || q.includes('why') || q.includes('mandate') || q.includes('election') || q.includes('purpose')) {
      return `🏛️ <strong>Election Details:</strong><br><br>
        <strong>Title:</strong> ${el.title}<br>
        <strong>Classification:</strong> ${el.type}<br>
        <strong>Official Mandate:</strong> ${el.reason || 'Not specified'}<br><br>
        This protocol has been officially established by a verified Organizer.`;
    }

    // --- Status / poll status ---
    if (q.includes('status') || q.includes('live') || q.includes('active') || q.includes('ongoing')) {
      return `📊 <strong>Current Poll Status: ${pollStatus}</strong><br><br>
        <strong>Date:</strong> ${el.date}<br>
        <strong>Window:</strong> ${el.start} – ${el.end}<br><br>
        ${teams.length} candidate(s) registered · Election: ${el.title}`;
    }

    // --- My vote / voted ---
    if (q.includes('my vote') || q.includes('did i vote') || q.includes('voted') || q.includes('already')) {
      return `🗳️ Your vote status is managed securely by the system. Once you cast your vote, all ballot buttons are locked and a <strong>✅ VOTE SECURELY RECORDED</strong> message appears.<br><br>If you have not voted yet, the ballot buttons are still active on the main screen.`;
    }

    // --- Help / what can you do ---
    if (q.includes('help') || q.includes('assist') || q.includes('what can') || q.includes('option')) {
      return `🤖 I can help you with:<br><br>
        🗳️ <strong>Candidates</strong> — Who is on the ballot<br>
        ⏰ <strong>Timing</strong> — Polling hours and date<br>
        📍 <strong>Location</strong> — Where the election is held<br>
        📋 <strong>Rules</strong> — Voting guidelines and regulations<br>
        🔒 <strong>Security</strong> — How your data is protected<br>
        🏛️ <strong>Election details</strong> — Type, mandate, protocol<br><br>
        Just ask me anything!`;
    }

    // --- Thank you ---
    if (q.includes('thank') || q.includes('thanks') || q.includes('great') || q.includes('good')) {
      return `You're welcome! 😊 If you have any more questions before casting your vote, I'm right here. Good luck!`;
    }

    // --- Default fallback ---
    return `I'm not sure I understood that. I can help with <strong>candidates, voting hours, location, rules, security, or election details</strong>. Try asking one of those topics, or use the quick buttons above!`;
  }
};
