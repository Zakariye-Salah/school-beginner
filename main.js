// main.js
import { db } from './firebase-config.js';
import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

const searchBtn = document.getElementById('searchBtn');
const studentIdInput = document.getElementById('studentId');
const resultArea = document.getElementById('resultArea');
const message = document.getElementById('message');
const loaderOverlay = document.getElementById('loaderOverlay');
const loaderMessageEl = document.getElementById('loaderMessage');
const toggleIdInputBtn = document.getElementById('toggleIdInputBtn');

let loaderInterval = null;
const loaderMessages = [
  'Fadlan sug...',
  'Waxaan hubineynaa xogta...',
  'Waxaa la soo rarayaa natiijooyinka...'
];
function showLoader(){
  if(!loaderOverlay) return;
  loaderOverlay.style.display='flex';
  let i=0; loaderMessageEl.textContent = loaderMessages[0];
  if(loaderInterval) clearInterval(loaderInterval);
  loaderInterval = setInterval(()=>{ i=(i+1)%loaderMessages.length; loaderMessageEl.textContent = loaderMessages[i]; }, 2200);
}
function hideLoader(){ if(!loaderOverlay) return; loaderOverlay.style.display='none'; if(loaderInterval){clearInterval(loaderInterval); loaderInterval=null;} loaderMessageEl.textContent=''; }

function escape(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }
function gradeForPercent(p){
  if(p >= 97) return 'A+'; if(p >= 93) return 'A'; if(p >= 90) return 'A-';
  if(p >= 87) return 'B+'; if(p >= 83) return 'B'; if(p >= 80) return 'B-';
  if(p >= 77) return 'C+'; if(p >= 73) return 'C'; if(p >= 70) return 'C-';
  if(p >= 67) return 'D+'; if(p >= 63) return 'D'; if(p >= 60) return 'D-';
  if(p >= 50) return 'E+'; if(p >= 40) return 'E'; return 'F';
}
function percentColor(p){
  if(p >= 95) return '#0b8a3e';
  if(p >= 90) return '#26a64b';
  if(p >= 85) return '#8cc63f';
  if(p >= 80) return '#f1c40f';
  if(p >= 75) return '#f39c12';
  if(p >= 70) return '#e67e22';
  if(p >= 60) return '#e74c3c';
  return '#c0392b';
}
function gradeColor(g){
  if(g==='A+' ) return '#0b8a3e';
  if(g==='A') return '#26a64b';
  if(g==='A-') return '#66d17a';
  if(g.startsWith('B')) return '#3b82f6';
  if(g.startsWith('C')) return '#f59e0b';
  return '#b91c1c';
}

/* ---------- renderResult: new header, clean table, exact totals layout ---------- */
async function renderResult(doc, opts = {}){
  resultArea.style.display = 'block';
  resultArea.innerHTML = '';

  const published = doc.publishedAt ? new Date(doc.publishedAt.seconds ? doc.publishedAt.seconds*1000 : doc.publishedAt).toLocaleString() : '';
  const examName = doc.examName || doc.examId || '';

  // detect components presence
  let compsEnabled = doc.components || null;
  if(!compsEnabled){
    compsEnabled = { assignment:false, quiz:false, monthly:false, exam:false };
    if(Array.isArray(doc.subjects)){
      for(const s of doc.subjects){
        const c = s.components || {};
        if(c.assignment) compsEnabled.assignment = true;
        if(c.quiz) compsEnabled.quiz = true;
        if(c.monthly) compsEnabled.monthly = true;
        if(c.exam) compsEnabled.exam = true;
      }
    }
  }

  // table build (same data as before)
  const hasLinked = Boolean(doc.linkedExamName) || Boolean(doc.linkedExamId) || (Array.isArray(doc.subjects) && doc.subjects.some(s => s.components && s.components.linked));
  let tableHtml = `<div class="card"><div style="overflow:auto"><table><thead><tr><th>Subject</th>`;
  if(hasLinked) tableHtml += `<th>${escape(doc.linkedExamName || 'Prev')}</th>`;
  if(compsEnabled.assignment) tableHtml += `<th>Assignment</th>`;
  if(compsEnabled.quiz) tableHtml += `<th>Quiz</th>`;
  if(compsEnabled.monthly) tableHtml += `<th>Monthly</th>`;
  if(compsEnabled.exam) tableHtml += `<th>${escape(examName)}</th>`;
  tableHtml += `<th>Total</th><th>Max</th></tr></thead><tbody>`;

  let totGot = 0, totMax = 0;
  if(doc.subjects && Array.isArray(doc.subjects)){
    for(const s of doc.subjects){
      const comps = s.components || {};
      const combinedMark = typeof s.mark !== 'undefined' ? Number(s.mark) : Number(s.total || 0);
      let componentSum = 0;
      if(typeof s.mark === 'undefined'){
        if(comps.assignment != null) componentSum += Number(comps.assignment); else if(s.assignment != null) componentSum += Number(s.assignment);
        if(comps.quiz != null) componentSum += Number(comps.quiz); else if(s.quiz != null) componentSum += Number(s.quiz);
        if(comps.monthly != null) componentSum += Number(comps.monthly); else if(s.monthly != null) componentSum += Number(s.monthly);
        if(comps.exam != null) componentSum += Number(comps.exam); else if(s.exam != null) componentSum += Number(s.exam);
      }
      const rowTotal = (typeof s.mark !== 'undefined') ? combinedMark : componentSum;
      const rowMax = Number(s.max || 0);

      tableHtml += `<tr><td>${escape(s.name)}</td>`;
      if(hasLinked) {
        const prevVal = (s.components && s.components.linked && (typeof s.components.linked.total !== 'undefined')) ? s.components.linked.total : (s.components && typeof s.components.linked === 'number' ? s.components.linked : '-');
        tableHtml += `<td style="text-align:center">${escape(String(prevVal!=null?prevVal:'-'))}</td>`;
      }
      if(compsEnabled.assignment) tableHtml += `<td style="text-align:center">${escape(String((comps.assignment!=null)?comps.assignment:(s.assignment!=null? s.assignment: '-')))}</td>`;
      if(compsEnabled.quiz) tableHtml += `<td style="text-align:center">${escape(String((comps.quiz!=null)?comps.quiz:(s.quiz!=null? s.quiz: '-')))}</td>`;
      if(compsEnabled.monthly) tableHtml += `<td style="text-align:center">${escape(String((comps.monthly!=null)?comps.monthly:(s.monthly!=null? s.monthly: '-')))}</td>`;
      if(compsEnabled.exam) tableHtml += `<td style="text-align:center">${escape(String((comps.exam!=null)?comps.exam:(s.exam!=null? s.exam: '-')))}</td>`;
      tableHtml += `<td style="text-align:center">${escape(String(rowTotal))}</td><td style="text-align:center">${escape(String(rowMax||''))}</td></tr>`;

      totGot += Number(rowTotal||0); totMax += Number(rowMax||0);
    }
  }
  tableHtml += `</tbody></table></div></div>`;

  // totals calc
  const total = typeof doc.total !== 'undefined' ? Number(doc.total) : totGot;
  const averageRaw = typeof doc.average !== 'undefined' ? Number(doc.average) : ((doc.subjects && doc.subjects.length) ? (total / doc.subjects.length) : 0);
  const sumMax = totMax;
  const percent = sumMax ? (total / sumMax * 100) : 0;
  const grade = gradeForPercent(percent);
  const passfail = percent >= 50 ? 'Gudbay' : 'Dhacay';
  const percentCol = percentColor(percent);
  const gradeBg = gradeColor(grade);

  // Build header exactly as requested
  const schoolName = 'Al-Fatxi Primary & Secondary School';
  const studentName = escape(doc.studentName || 'Magac aan la garanayn');
  const className = escape(doc.className || doc.classId || '');
  const examLabel = escape(examName || '');
  const mother = doc.motherName ? escape(doc.motherName) : '';

  // Header HTML
  const headerHtml = `
    <div class="card">
      <div class="result-school">${schoolName}</div>
      <div class="result-header">
        <div class="header-top">
          <div class="student-line">
            <div class="student-name">${studentName}</div>
            <div class="meta-inline">
              <div>ID: <strong id="studentIdText">${escape(doc.studentId || '')}</strong></div>
              <button id="maskIdBtn" class="btn" style="padding:6px 8px;font-weight:700" title="Toggle ID visibility">
                <!-- eye (show/hide) SVG -->
                <svg id="eyeSvg" class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5C7 5 3.2 8 1 12c2.2 4 6 7 11 7s8.8-3 11-7c-2.2-4-6-7-11-7z" stroke="#0f172a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="12" cy="12" r="3" stroke="#0f172a" stroke-width="1.2"/>
                </svg>
              </button>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <div style="font-weight:700">${className}</div>
            <div style="color:var(--muted);font-weight:700">${examLabel}</div>
          </div>
        </div>

        <div style="margin-top:6px">
          ${mother ? `<div><strong>Ina Hooyo:</strong> ${mother}</div>` : ''}
          <div class="tiny-note">Published: ${escape(published)} &nbsp; Source: AL-Fatxi School</div>
        </div>
      </div>
    </div>`;

  // totals layout as requested (4 lines)
  const totalsHtml = `
    <div class="card">
      <div class="totals-block">
        <div class="tot-line"><div>Total: <strong style="color:#246bff">${total}</strong> / <span style="color:green">${sumMax}</span></div><div>Percent: <strong style="color:${percentCol}">${percent.toFixed(2)}%</strong></div></div>
        <div class="tot-line"><div>Average: <strong>${Number(averageRaw).toFixed(2)}</strong></div><div>Grade: <span class="grade-badge" style="background:${gradeBg}">${grade}</span></div></div>
        <div class="tot-line"><div>Status: <strong style="color:${percent>=50 ? '#0b8a3e' : '#c0392b'}">${passfail}</strong></div></div>
        <div class="tot-line"><div>School rank: <strong id="schoolRankCell">${escape(String(doc.schoolRank || '/—'))}</strong></div><div>Class rank: <strong id="classRankCell">${escape(String(doc.classRank || '/—'))}</strong></div></div>
      </div>
      <div class="actions-group">
        <div class="actions-small">
          <button id="printBtn" class="btn btn-primary primary" title="Download PDF">
            <!-- print/download svg -->
            <svg class="icon" viewBox="0 0 24 24"><path d="M6 9h12v-5H6v5zM6 13h12v-1H6v1zM6 15h12v5H6v-5z" fill="#fff"/></svg> Daabac (PDF)
          </button>
          <button id="moreBtn" class="btn btn-ghost" title="More published exams">
            <!-- more svg -->
            <svg class="icon" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
          </button>
        </div>
        <button id="screenshotBtn" class="btn" title="Screenshot (download image)">
          <svg class="icon" viewBox="0 0 24 24"><path d="M4 7h4l1-3h6l1 3h4v11H4z" stroke="currentColor" stroke-width="1.2" fill="none"/></svg> Screenshot
        </button>
      </div>
    </div>`;

  resultArea.innerHTML = headerHtml + tableHtml + totalsHtml;

  // hide loader
  hideLoader();

  /* ---------- mask ID toggle (professional SVG) ---------- */
  const maskBtn = document.getElementById('maskIdBtn');
  const studentIdText = document.getElementById('studentIdText');
  let masked = true;
  const originalId = studentIdText ? studentIdText.textContent : '';
  function applyMask(){
    if(!studentIdText) return;
    if(masked){
      const s = originalId || '';
      studentIdText.textContent = s.length>3 ? '*'.repeat(Math.max(0,s.length-3)) + s.slice(-3) : '*'.repeat(s.length);
      // change svg to eye open (we maintain same svg but it's okay)
    } else {
      studentIdText.textContent = originalId;
    }
  }
  if(maskBtn){
    maskBtn.addEventListener('click', ()=>{ masked = !masked; applyMask(); });
    applyMask();
  }

  /* toggle for studentId input field (the top input) - lock button */
  if(toggleIdInputBtn){
    let hiddenInput = false;
    toggleIdInputBtn.onclick = ()=>{
      hiddenInput = !hiddenInput;
      studentIdInput.type = hiddenInput ? 'password' : 'text';
      // change icon: we'll keep it simple: toggle border-highlight
      toggleIdInputBtn.style.borderColor = hiddenInput ? 'rgba(0,0,0,0.12)' : 'rgba(11,116,255,0.18)';
    };
  }

  /* ----- screenshot behavior: hide action buttons while capturing ----- */
  const screenshotBtn = document.getElementById('screenshotBtn');
  const actionsGroup = document.querySelector('.actions-group');
  if(screenshotBtn){
    screenshotBtn.onclick = async ()=>{
      try{
        // hide the actions to avoid including them
        if(actionsGroup) actionsGroup.style.visibility = 'hidden';
        // capture resultArea (header + table + totals only)
        const el = resultArea;
        const canvas = await window.html2canvas(el, { scale:2, useCORS:true, backgroundColor:'#ffffff' });
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a'); a.href = dataUrl;
        const safe = (doc.studentName || doc.studentId || 'result').replace(/\s+/g,'_');
        a.download = `${safe}_result.png`; document.body.appendChild(a); a.click(); a.remove();
      }catch(e){
        console.error('screenshot failed', e); alert('Screenshot failed — isku day mar kale.');
      }finally{
        if(actionsGroup) actionsGroup.style.visibility = 'visible';
      }
    };
  }

  /* ----- PDF generation (bigger fonts & spacing) ----- */
  const printBtn = document.getElementById('printBtn');
  if(printBtn){
    printBtn.onclick = async ()=>{
      try{
        if(!(window.jspdf && window.jspdf.jsPDF)) throw new Error('jsPDF not available');
        const { jsPDF } = window.jspdf;
        const docPdf = new jsPDF({orientation:'p',unit:'pt',format:'a4'});
        const margin = 26;
        let y = margin;
        docPdf.setFontSize(14);
        docPdf.text(schoolName, margin, y);
        docPdf.setFontSize(12);
        y += 22;
        docPdf.text(`${doc.studentName || ''}    ID: ${doc.studentId || ''}`, margin, y);
        y += 18;
        if(mother) { docPdf.setFontSize(10); docPdf.text(`Ina Hooyo: ${mother}`, margin, y); y += 16; }
        docPdf.setFontSize(10);
        docPdf.text(`Class: ${className}    ${examLabel}`, margin, y);
        y += 20;
        docPdf.text(`Published: ${published}    Source: AL-Fatxi School`, margin, y);
        y += 18;

        // prepare columns
        const cols = [];
        cols.push({header:'Subject',dataKey:'subject'});
        if(hasLinked) cols.push({header:'Prev',dataKey:'linked'});
        if(compsEnabled.assignment) cols.push({header:'Assignment',dataKey:'assignment'});
        if(compsEnabled.quiz) cols.push({header:'Quiz',dataKey:'quiz'});
        if(compsEnabled.monthly) cols.push({header:'Monthly',dataKey:'monthly'});
        if(compsEnabled.exam) cols.push({header:examName,dataKey:'exam'});
        cols.push({header:'Total',dataKey:'total'}); cols.push({header:'Max',dataKey:'max'});

        const body = (doc.subjects||[]).map(s=>{
          const comps = s.components||{};
          const row = { subject: s.name };
          if(hasLinked) row.linked = (s.components && s.components.linked && typeof s.components.linked.total !== 'undefined') ? String(s.components.linked.total) : ((typeof s.components?.linked === 'number')? String(s.components.linked): '-');
          if(compsEnabled.assignment) row.assignment = (comps.assignment!=null)? String(comps.assignment) : (s.assignment!=null? String(s.assignment): '-');
          if(compsEnabled.quiz) row.quiz = (comps.quiz!=null)? String(comps.quiz) : (s.quiz!=null? String(s.quiz): '-');
          if(compsEnabled.monthly) row.monthly = (comps.monthly!=null)? String(comps.monthly) : (s.monthly!=null? String(s.monthly): '-');
          if(compsEnabled.exam) row.exam = (comps.exam!=null)? String(comps.exam) : (s.exam!=null? String(s.exam): '-');
          row.total = (typeof s.mark !== 'undefined') ? String(s.mark) : String(s.total != null ? s.total : ((comps.assignment||0)+(comps.quiz||0)+(comps.monthly||0)+(comps.exam||0)));
          row.max = String(s.max || '');
          return row;
        });

        docPdf.autoTable({
          startY: y,
          head: [cols.map(c=>c.header)],
          body: body.map(r => cols.map(c => r[c.dataKey]||'')),
          styles: { fontSize:10, cellPadding:6 },
          headStyles: { fillColor:[240,240,240], textColor:[20,20,20], fontStyle:'bold' },
          margin:{left:margin,right:margin}
        });

        const finalY = docPdf.lastAutoTable ? docPdf.lastAutoTable.finalY + 18 : docPdf.internal.pageSize.getHeight() - 80;
        docPdf.setFontSize(11);
        docPdf.text(`Total: ${total} / ${sumMax}    Percent: ${percent.toFixed(2)}%`, margin, finalY);
        docPdf.text(`Average: ${Number(averageRaw).toFixed(2)}    Grade: ${grade}`, margin, finalY + 16);
        docPdf.text(`Status: ${passfail}`, margin, finalY + 32);
        docPdf.text(`School rank: ${doc.schoolRank || '/—'}    Class rank: ${doc.classRank || '/—'}`, margin, finalY + 48);

        const fname = `${(doc.studentName||doc.studentId||'result').replace(/\s+/g,'_')}_result.pdf`;
        docPdf.save(fname);
      }catch(e){
        console.warn(e);
        window.print();
      }
    };
  }

  // wire more button to published list toggling (preserve previous togglePublishedList)
  const moreBtn = document.getElementById('moreBtn');
  if(moreBtn) moreBtn.onclick = ()=> togglePublishedList(doc.studentId);

  // update async ranks like before (keeps original behavior)
  if(doc.examId){
    (async ()=>{
      try{
        const qAll = query(collection(db,'examTotals'), where('examId','==', doc.examId));
        const snapAll = await getDocs(qAll);
        const schoolSize = snapAll.size || 0;
        let classSize = 0;
        if(doc.classId){
          snapAll.forEach(d=>{
            const data = d.data();
            if(data.classId === doc.classId) classSize++;
          });
        }
        const schoolRankCell = document.getElementById('schoolRankCell'), classRankCell = document.getElementById('classRankCell');
        if(schoolRankCell){
          schoolRankCell.textContent = doc.schoolRank && schoolSize ? `${doc.schoolRank} / ${schoolSize}` : (doc.schoolRank ? `${doc.schoolRank}` : '/—');
        }
        if(classRankCell){
          classRankCell.textContent = doc.classRank && classSize ? `${doc.classRank} / ${classSize}` : (doc.classRank ? `${doc.classRank}` : '/—');
        }
      }catch(e){ console.warn('rank fetch failed', e); }
    })();
  }
}

/* ---------- copy your existing togglePublishedList, fallbackFindLatestExamTotal, search onclick and helpers here (unchanged) ---------- */


/* togglePublishedList: shows/hides the published exam list */
async function togglePublishedList(studentId){
  if(!studentId) return;
  const key = String(studentId);
  if(!publishedListState[key]) publishedListState[key] = { visible: false, container: null, selectedExamId: null };

  const state = publishedListState[key];
  if(state.visible){
    if(state.container && state.container.parentNode) state.container.parentNode.removeChild(state.container);
    state.visible = false;
    const btn = document.querySelector(`#moreExamsBtn_${CSS.escape(studentId)}`);
    if(btn) btn.textContent = 'More published exams';
    return;
  }

  const container = document.createElement('div');
  container.className = 'card';
  container.style.marginTop = '12px';
  container.style.padding = '12px';
  container.style.borderRadius = '10px';
  container.style.boxShadow = '0 6px 18px rgba(15,23,42,0.04)';
  container.innerHTML = `<h3 style="margin:0 0 8px 0;font-size:1.05rem">Published exams</h3><div id="pubList_${escape(studentId)}" style="margin-top:6px">Loading…</div>`;
  resultArea.appendChild(container);
  state.container = container;
  state.visible = true;
  const btn = document.querySelector(`#moreExamsBtn_${CSS.escape(studentId)}`);
  if(btn) btn.textContent = 'Hide published exams';

  try {
    const q = query(collection(db,'examTotals'), where('studentId','==', studentId));
    const snap = await getDocs(q);
    const arr = [];
    snap.forEach(d=> arr.push(d.data()));
    if(arr.length === 0){
      const listEl = document.getElementById(`pubList_${escape(studentId)}`);
      if(listEl) listEl.innerHTML = `<div style="color:#6b7280">No published exams found.</div>`;
      return;
    }
    arr.sort((a,b)=> (b.publishedAt?.seconds||0) - (a.publishedAt?.seconds||0));
    const listHtml = arr.map(a=>{
      const dateText = a.publishedAt ? new Date(a.publishedAt.seconds*1000).toLocaleDateString() : '';
      const examName = a.examName || a.examId || '(exam)';
      return `<li style="list-style:none;margin-bottom:6px"><button class="pubExamBtn" data-id="${escape(a.examId)}" style="width:100%;text-align:left;padding:8px;border-radius:8px;border:1px solid #eef2f6;background:#ffffff">${escape(examName)} <small style="color:#6b7280;margin-left:8px">— ${escape(a.examId)}</small> <span style="float:right;color:#94a3b8">${escape(dateText)}</span></button></li>`;
    }).join('');

    const listEl = document.getElementById(`pubList_${escape(studentId)}`);
    if(listEl) listEl.innerHTML = `<ul style="padding:0;margin:0">${listHtml}</ul>`;

    container.querySelectorAll('.pubExamBtn').forEach(b=>{
      b.onclick = async (ev) => {
        const exId = b.dataset.id;
        if(!exId) return;
        if(state.selectedExamId === exId){
          state.selectedExamId = null;
          container.querySelectorAll('.pubExamBtn').forEach(x => { x.style.background = '#fff'; x.style.borderColor = '#eef2f6'; });
          const first = arr[0];
          if(first) renderResult(first, { source: 'examTotals' });
          return;
        }

        container.querySelectorAll('.pubExamBtn').forEach(x => { x.style.background = '#fff'; x.style.borderColor = '#eef2f6'; x.style.boxShadow = 'none'; });
        b.style.background = '#eef2ff';
        b.style.borderColor = '#c7ddff';
        b.style.boxShadow = '0 3px 10px rgba(15,23,42,0.04)';
        state.selectedExamId = exId;

        const snap = await getDoc(doc(db,'examTotals', `${exId}_${studentId}`));
        if(!snap.exists()) return alert('Not found');
        const data = snap.data();
        renderResult(data, { source: 'examTotals' });
      };
    });

  } catch(err){
    console.error('showAllPublishedFor err', err);
    const listEl = document.getElementById(`pubList_${escape(studentId)}`);
    if(listEl) listEl.innerHTML = `<div style="color:#c0392b">Khalad ayaa dhacay, fadlan isku day mar kale.</div>`;
  }
}

/* ---------- utility: grade mapping ---------- */
function gradeForPercent(p){
  if(p >= 97) return 'A+';
  if(p >= 93) return 'A';
  if(p >= 90) return 'A-';
  if(p >= 87) return 'B+';
  if(p >= 83) return 'B';
  if(p >= 80) return 'B-';
  if(p >= 77) return 'C+';
  if(p >= 73) return 'C';
  if(p >= 70) return 'C-';
  if(p >= 67) return 'D+';
  if(p >= 63) return 'D';
  if(p >= 60) return 'D-';
  if(p >= 50) return 'E+';
  if(p >= 40) return 'E';
  return 'F';
}

/* ---------- fallback to find latest examTotals ---------- */
async function fallbackFindLatestExamTotal(studentId){
  try {
    const q = query(collection(db,'examTotals'), where('studentId','==', studentId));
    const snap = await getDocs(q);
    const arr = [];
    snap.forEach(d=> arr.push(d.data()));
    if(arr.length === 0) return null;
    arr.sort((a,b)=> {
      const ta = a.publishedAt && a.publishedAt.seconds ? a.publishedAt.seconds : 0;
      const tb = b.publishedAt && b.publishedAt.seconds ? b.publishedAt.seconds : 0;
      return tb - ta;
    });
    return arr[0];
  } catch(err){
    console.error('fallback err', err);
    return null;
  }
}

/* ---------- main search click ---------- */
searchBtn.onclick = async () => {
  const studentId = studentIdInput.value.trim();
  message.textContent = '';
  resultArea.style.display = 'none';
  resultArea.innerHTML = '';
  if(!studentId) { message.textContent = 'Fadlan geli ID sax ah.'; return; }

  showLoader(); // show the centered loader with cycling messages

  try {
    const latestSnap = await getDoc(doc(db,'studentsLatest', studentId));
    let latest = latestSnap.exists() ? latestSnap.data() : null;

    if(latest && !latest.motherName){
      try {
        const sSnap = await getDoc(doc(db,'students', studentId));
        if(sSnap.exists()){
          const sData = sSnap.data();
          if(sData && sData.motherName){
            latest.motherName = sData.motherName;
          }
        }
      } catch(e){
        console.warn('Could not fetch student doc to fill motherName', e);
      }
    }

    if(!latest){
      const alt = await fallbackFindLatestExamTotal(studentId);
      if(!alt){
        message.textContent = 'Natiijo la heli waayey. Fadlan hubi ID-ga.';
        hideLoader();
        return;
      } else {
        await renderResult(alt, { source: 'examTotals' });
        return;
      }
    }

    if(latest.blocked){
      resultArea.style.display = 'block';
      resultArea.innerHTML = `<div class="card"><h2>Access blocked</h2><p>${escape(latest.blockMessage || 'You are not allowed to view results.')}</p></div>`;
      hideLoader();
      return;
    }

    const alt = await fallbackFindLatestExamTotal(studentId);
    if(alt && alt.publishedAt && latest.publishedAt) {
      const altSeconds = alt.publishedAt.seconds || (new Date(alt.publishedAt).getTime()/1000);
      const latestSeconds = latest.publishedAt.seconds || (new Date(latest.publishedAt).getTime()/1000);
      if(altSeconds > latestSeconds){
        await renderResult(alt, { source: 'examTotals' });
        return;
      }
    } else if(alt && !latest.publishedAt){
      await renderResult(alt, { source: 'examTotals' });
      return;
    }

    await renderResult(latest, { source: 'AL-Fatxi School' });
  } catch(err){
    console.error(err); message.textContent = 'Khalad ayaa dhacay. Fadlan isku day mar kale.';
    hideLoader();
  }
};


export { renderResult };
