/**
 * On-Device Database using LocalStorage (V2)
 * SecureVote Platform
 */

const DB = {
  KEYS: {
    ELECTION: 'sv_v2_election_data',
    TEAMS: 'sv_v2_teams_data',
    VOTERS: 'sv_v2_voters_data',
    VOTES: 'sv_v2_votes_data', 
    STATUS: 'sv_v2_status',
    ELECTION_ID: 'sv_v2_election_id' 
  },

  // Reset database completely
  hardReset() {
    console.log("Resetting Database for V2 Schema...");
    // Clear potentially old v1 keys too
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sv_')) {
        localStorage.removeItem(key);
      }
    });
    this.init();
  },

  init() {
    if (!localStorage.getItem(this.KEYS.STATUS)) {
      localStorage.setItem(this.KEYS.STATUS, 'setup');
      localStorage.setItem(this.KEYS.TEAMS, JSON.stringify([]));
      localStorage.setItem(this.KEYS.VOTERS, JSON.stringify({}));
      localStorage.setItem(this.KEYS.VOTES, JSON.stringify({}));
    }
  },

  // --- Image Converter ---
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  },

  async urlToBase64(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await this.fileToBase64(blob);
    } catch (e) {
      console.warn("CORS_FETCH_FALLBACK: Could not serialize external URL. Using original link.", e);
      return url;
    }
  },

  // --- Setters (Cloud Sync Aware) ---
  async saveElection(data) {
    localStorage.setItem(this.KEYS.ELECTION, JSON.stringify(data));
    const eid = this.getElectionId();
    if (eid) {
      try {
        await firebase.firestore().collection('elections').doc(eid).update({ election: data });
        console.log("Cloud Sync: Protocol Settings Updated.");
      } catch (e) { console.warn("Cloud Sync Failed (Settings):", e); }
    }
  },

  async saveTeams(teams) {
    localStorage.setItem(this.KEYS.TEAMS, JSON.stringify(teams));
    const votes = {};
    teams.forEach(t => votes[t.numeric] = 0);
    localStorage.setItem(this.KEYS.VOTES, JSON.stringify(votes));
    
    const eid = this.getElectionId();
    if (eid) {
      try {
        await firebase.firestore().collection('elections').doc(eid).update({ 
          teams: teams,
          votes: votes
        });
      } catch (e) { console.warn("Cloud Sync Failed (Bulk Teams):", e); }
    }
  },

  async addTeam(team) {
    const teams = this.getTeams();
    teams.push(team);
    localStorage.setItem(this.KEYS.TEAMS, JSON.stringify(teams));
    
    const votes = this.getVotes();
    votes[team.numeric] = 0;
    localStorage.setItem(this.KEYS.VOTES, JSON.stringify(votes));

    const eid = this.getElectionId();
    if (eid) {
      try {
        await firebase.firestore().collection('elections').doc(eid).update({ 
          teams: teams,
          votes: votes
        });
        console.log("Cloud Sync: Roster Updated.");
      } catch (e) { console.warn("Cloud Sync Failed (Teams):", e); }
    }
  },

  async removeTeam(numeric) {
    let teams = this.getTeams();
    teams = teams.filter(t => t.numeric !== numeric);
    localStorage.setItem(this.KEYS.TEAMS, JSON.stringify(teams));
    
    const votes = this.getVotes();
    delete votes[numeric];
    localStorage.setItem(this.KEYS.VOTES, JSON.stringify(votes));

    const eid = this.getElectionId();
    if (eid) {
      try {
        await firebase.firestore().collection('elections').doc(eid).update({ 
          teams: teams,
          votes: votes
        });
        console.log("Cloud Sync: Roster Pruned.");
      } catch (e) { console.warn("Cloud Sync Failed (Delete):", e); }
    }
  },

  async saveVoters(votersObj) {
    localStorage.setItem(this.KEYS.VOTERS, JSON.stringify(votersObj));
    
    // CLOUD SYNC: Ensure new tickets are pushed to the database immediately
    const eid = this.getElectionId();
    if (eid) {
      try {
        await firebase.firestore().collection('elections').doc(eid).update({ 
          voters: votersObj 
        });
        console.log("Cloud Sync: Voter Roster Verified & Uploaded.");
      } catch (e) {
        console.warn("Cloud Sync Failed (Voters):", e);
      }
    }
  },

  setStatus(status) {
    localStorage.setItem(this.KEYS.STATUS, status);
  },

  // --- Getters ---
  getElection() {
    const data = localStorage.getItem(this.KEYS.ELECTION);
    return data ? JSON.parse(data) : null;
  },

  getTeams() {
    const data = localStorage.getItem(this.KEYS.TEAMS);
    return data ? JSON.parse(data) : [];
  },

  getVoters() {
    const data = localStorage.getItem(this.KEYS.VOTERS);
    return data ? JSON.parse(data) : {};
  },

  getVotes() {
    const data = localStorage.getItem(this.KEYS.VOTES);
    return data ? JSON.parse(data) : {};
  },

  getStatus() {
    return localStorage.getItem(this.KEYS.STATUS);
  },

  getElectionId() {
    return localStorage.getItem(this.KEYS.ELECTION_ID);
  },

  setElectionId(id) {
    localStorage.setItem(this.KEYS.ELECTION_ID, id);
  },

  // MASTER CLOUD HANDSHAKE: Consolidated V3
  async publishToCloud() {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error("Authentication Required: You must be signed in with Google to publish.");

    let eid = this.getElectionId();
    if (!eid) {
      eid = `EL-${user.uid.substring(0,5)}-${Date.now()}`;
      this.setElectionId(eid);
    }

    const data = {
      id: eid,
      organizerUid: user.uid,
      election: this.getElection(),
      teams: this.getTeams(),
      voters: this.getVoters(),
      votes: this.getVotes(),
      status: this.getStatus() || 'active',
      publishedAt: new Date().toISOString()
    };

    // Use .set() with merge to ensure it works for both initial setup and final results
    await firebase.firestore().collection('elections').doc(eid).set(data, { merge: true });
    return eid;
  },

  async restoreSession() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
      const snapshot = await firebase.firestore().collection('elections')
        .where('organizerUid', '==', user.uid)
        .orderBy('publishedAt', 'desc')
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        this.setElectionId(data.id);
        localStorage.setItem(this.KEYS.ELECTION, JSON.stringify(data.election));
        localStorage.setItem(this.KEYS.TEAMS, JSON.stringify(data.teams || []));
        localStorage.setItem(this.KEYS.VOTERS, JSON.stringify(data.voters || {}));
        localStorage.setItem(this.KEYS.VOTES, JSON.stringify(data.votes || {}));
        this.setStatus(data.status || 'setup');
        console.log("Cloud Protocol: Session Restored for UID:", user.uid);
        return true;
      }
    } catch (e) {
      console.warn("Cloud Restore Failed:", e);
    }
    return false;
  },

  // --- Voting Logic (Cloud Enhanced) ---
  async verifyVoter(voterId, electionId) {
    if (!electionId) return { valid: false, reason: "SYSTEM_ERROR: No active protocol detected." };
    
    let elData = null;
    let votersMap = null;
    let isCloud = false;

    try {
      const doc = await firebase.firestore().collection('elections').doc(electionId).get();
      if (doc.exists) {
        const el = doc.data();
        elData = el.election;
        votersMap = el.voters || {};
        isCloud = true;
      } else {
        throw new Error("Election not found in cloud.");
      }
    } catch (e) {
      console.warn("Cloud Verify Failed. Activating Local Fallback Protocol.", e);
      if (this.getElectionId() === electionId) {
        elData = this.getElection();
        votersMap = this.getVoters();
      } else {
        return { valid: false, reason: "INVALID_PROTOCOL: This election ID does not exist in local records." };
      }
    }

    if (!elData) return { valid: false, reason: "INVALID_PROTOCOL: No election data found." };

    if (!votersMap[voterId]) {
      if (isCloud) {
        const localVoters = this.getVoters();
        if (localVoters[voterId]) {
          console.log("EMERGENCY_SYNC: ID found locally. Injecting to cloud...");
          votersMap[voterId] = localVoters[voterId];
          try {
            await firebase.firestore().collection('elections').doc(electionId).update({ voters: votersMap });
          } catch(err) {}
        } else {
          return { valid: false, reason: "Invalid Official Voter ID or QR Code." };
        }
      } else {
        return { valid: false, reason: "Invalid Official Voter ID or QR Code." };
      }
    }

    if (votersMap[voterId].voted) return { valid: false, reason: "VIOLATION: This Voter ID has already been utilized. Multi-voting is strictly prohibited." };

    const now = new Date();
    const startTime = new Date(`${elData.date}T${elData.start}`);
    const endTime = new Date(`${elData.date}T${elData.end}`);

    if (now < startTime) return { valid: false, reason: `Voting protocol has not commenced. Scheduled to open at ${elData.start}.` };
    if (now > endTime) return { valid: false, reason: `Voting protocol has concluded. Scheduled window closed at ${elData.end}.` };

    return { valid: true, electionData: elData, cloudData: isCloud ? { election: elData, voters: votersMap } : null };
  },

  async castVote(voterId, teamNumeric, electionId) {
    const verify = await this.verifyVoter(voterId, electionId);
    if (!verify.valid) return verify;

    try {
      const db = firebase.firestore();
      const electionRef = db.collection('elections').doc(electionId);

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(electionRef);
        if (!doc.exists) throw "Election disappeared!";
        
        const data = doc.data();
        if (data.voters[voterId].voted) throw "Already voted (Transaction check)!";

        const updatedVoters = { ...data.voters };
        updatedVoters[voterId].voted = true;
        updatedVoters[voterId].timestamp = new Date().toISOString();

        const updatedVotes = { ...data.votes };
        updatedVotes[teamNumeric] = (updatedVotes[teamNumeric] || 0) + 1;

        transaction.update(electionRef, {
          voters: updatedVoters,
          votes: updatedVotes
        });
      });

      return { success: true };
    } catch (e) {
      console.warn("Vote Transaction Failed on Cloud. Using Local Fallback:", e);
      
      const voters = this.getVoters();
      if (!voters[voterId] || voters[voterId].voted) {
        return { success: false, reason: "VIOLATION: This Voter ID has already been utilized." };
      }
      voters[voterId].voted = true;
      voters[voterId].timestamp = new Date().toISOString();
      localStorage.setItem(this.KEYS.VOTERS, JSON.stringify(voters));

      const votes = this.getVotes();
      votes[teamNumeric] = (votes[teamNumeric] || 0) + 1;
      localStorage.setItem(this.KEYS.VOTES, JSON.stringify(votes));
      
      return { success: true };
    }
  }
};

// Start Fresh for V2
if (!localStorage.getItem('sv_v2_status')) {
  DB.hardReset();
} else {
  DB.init();
}
