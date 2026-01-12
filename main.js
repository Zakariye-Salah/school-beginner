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
const loaderMessages = ['Fadlan sug...','Waxaan hubineynaa xogta...','Waxaa la soo rarayaa natiijooyinka...'];
function showLoader(){ if(!loaderOverlay) return; loaderOverlay.style.display='flex'; let i=0; loaderMessageEl.textContent = loaderMessages[0]; if(loaderInterval) clearInterval(loaderInterval); loaderInterval = setInterval(()=>{ i=(i+1)%loaderMessages.length; loaderMessageEl.textContent = loaderMessages[i]; },2200); }
function hideLoader(){ if(!loaderOverlay) return; loaderOverlay.style.display='none'; if(loaderInterval){ clearInterval(loaderInterval); loaderInterval=null } loaderMessageEl.textContent=''; }

function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

function gradeForPercent(p){
  if(p>=97) return 'A+'; if(p>=93) return 'A'; if(p>=90) return 'A-';
  if(p>=87) return 'B+'; if(p>=83) return 'B'; if(p>=80) return 'B-';
  if(p>=77) return 'C+'; if(p>=73) return 'C'; if(p>=70) return 'C-';
  if(p>=67) return 'D+'; if(p>=63) return 'D'; if(p>=60) return 'D-';
  if(p>=50) return 'E+'; if(p>=40) return 'E'; return 'F';
}
function percentColor(p){
  if(p>=95) return '#0b8a3e'; if(p>=90) return '#26a64b'; if(p>=85) return '#8cc63f';
  if(p>=80) return '#f1c40f'; if(p>=75) return '#f39c12'; if(p>=70) return '#e67e22';
  if(p>=60) return '#e74c3c'; return '#c0392b';
}
function gradeColor(g){
  if(g==='A+') return '#0b8a3e'; if(g==='A') return '#26a64b'; if(g==='A-') return '#66d17a';
  if(g.startsWith('B')) return '#3b82f6'; if(g.startsWith('C')) return '#f59e0b'; return '#b91c1c';
}

/* input toggle before search */
(function wireInputToggleNow(){
  if(!toggleIdInputBtn || !studentIdInput) return;
  let hidden = false;
  toggleIdInputBtn.addEventListener('click', () => {
    hidden = !hidden;
    studentIdInput.type = hidden ? 'password' : 'text';
    if(hidden){
      toggleIdInputBtn.innerHTML = `
        <svg id="toggleInputIcon" class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3l18 18" stroke="#0f172a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="#0f172a" stroke-width="1.2"/>
        </svg>`;
    } else {
      toggleIdInputBtn.innerHTML = `
        <svg id="toggleInputIcon" class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="#0f172a" stroke-width="1.2"/><circle cx="12" cy="12" r="3" stroke="#0f172a" stroke-width="1.2"/>
        </svg>`;
    }
  });
})();

/* helper: format a header into two-line with small sublabel if it contains a space (mobile will show the small label) */
function twoLineHeaderHTML(label){
  if(!label) return '';
  const parts = String(label).trim().split(/\s+/);
  if(parts.length <= 1) return escapeHtml(label);
  const first = escapeHtml(parts[0]);
  const rest = escapeHtml(parts.slice(1).join(' '));
  return `${first}<br><span class="small">${rest}</span>`;
}

/* renderResult (header stacked lines + table + totals). Keeps screenshot & PDF logic intact. */
async function renderResult(doc, opts = {}) {
  resultArea.style.display = 'block';
  resultArea.innerHTML = '';

  const published = doc.publishedAt ? new Date(doc.publishedAt.seconds ? doc.publishedAt.seconds * 1000 : doc.publishedAt).toLocaleString() : '';
  const examName = doc.examName || doc.examId || '';

  let compsEnabled = doc.components || null;
  if(!compsEnabled){
    compsEnabled = { assignment:false, quiz:false, monthly:false, exam:false };
    if(Array.isArray(doc.subjects)) for(const s of doc.subjects){
      const c = s.components||{};
      if(c.assignment) compsEnabled.assignment = true;
      if(c.quiz) compsEnabled.quiz = true;
      if(c.monthly) compsEnabled.monthly = true;
      if(c.exam) compsEnabled.exam = true;
    }
  }

  const hasLinked = Boolean(doc.linkedExamName) || Boolean(doc.linkedExamId) || (Array.isArray(doc.subjects) && doc.subjects.some(s => s.components && s.components.linked));
  // build table header with mobile-friendly two-line labels for Midterm/Final when applicable
  let tableHtml = `<div class="card"><div style="overflow:auto"><table><thead><tr><th>Subject</th>`;
  if(hasLinked) tableHtml += `<th>${twoLineHeaderHTML(doc.linkedExamName || 'Prev')}</th>`;
  if(compsEnabled.assignment) tableHtml += `<th>Assignment</th>`;
  if(compsEnabled.quiz) tableHtml += `<th>Quiz</th>`;
  if(compsEnabled.monthly) tableHtml += `<th>Monthly</th>`;
  if(compsEnabled.exam) tableHtml += `<th>${twoLineHeaderHTML(examName || 'Exam')}</th>`;
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

      // subject row
      tableHtml += `<tr><td>${escapeHtml(s.name)}</td>`;
      if(hasLinked){
        const prevVal = (s.components && s.components.linked && (typeof s.components.linked.total !== 'undefined')) ? s.components.linked.total : (s.components && typeof s.components.linked === 'number' ? s.components.linked : '-');
        tableHtml += `<td style="text-align:center">${escapeHtml(String(prevVal!=null?prevVal:'-'))}</td>`;
      }
      if(compsEnabled.assignment) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.assignment!=null)?comps.assignment:(s.assignment!=null? s.assignment: '-')))}</td>`;
      if(compsEnabled.quiz) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.quiz!=null)?comps.quiz:(s.quiz!=null? s.quiz: '-')))}</td>`;
      if(compsEnabled.monthly) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.monthly!=null)?comps.monthly:(s.monthly!=null? s.monthly: '-')))}</td>`;
      if(compsEnabled.exam) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.exam!=null)?comps.exam:(s.exam!=null? s.exam: '-')))}</td>`;
      tableHtml += `<td style="text-align:center">${escapeHtml(String(rowTotal))}</td><td style="text-align:center">${escapeHtml(String(rowMax||''))}</td></tr>`;

      totGot += Number(rowTotal||0); totMax += Number(rowMax||0);
    }
  }
  tableHtml += `</tbody></table></div></div>`;

  const total = typeof doc.total !== 'undefined' ? Number(doc.total) : totGot;
  const averageRaw = typeof doc.average !== 'undefined' ? Number(doc.average) : ((doc.subjects && doc.subjects.length) ? (total / doc.subjects.length) : 0);
  const sumMax = totMax;
  const percent = sumMax ? (total / sumMax * 100) : 0;
  const grade = gradeForPercent(percent);
  const passfail = percent >= 50 ? 'Gudbay' : 'Dhacay';
  const percentCol = percentColor(percent);
  const gradeBg = gradeColor(grade);

  const schoolName = 'Al-Fatxi Primary & Secondary School';
  const studentName = escapeHtml(doc.studentName || 'Magac aan la garanayn');
  const studentIdRaw = escapeHtml(doc.studentId || '');
  const className = escapeHtml(doc.className || doc.classId || '');
  const examLabel = escapeHtml(examName || '');
  const mother = doc.motherName ? escapeHtml(doc.motherName) : '';

  // stacked header exactly as requested (7 lines). student name prefixed with "Magaca ardayga:"
  const headerHtml = `
    <div class="card">
      <div class="result-school">${schoolName}</div>
      <div class="result-header">
        <div class="student-line">Magaca ardayga: <span class="student-name">${studentName}</span></div>
        <div class="id-class-line">ID: <strong id="studentIdText">${studentIdRaw}</strong> &nbsp;&nbsp; Class: <strong>${className}</strong></div>
        <div class="exam-line">Exam: <strong>${examLabel}</strong></div>
        ${mother ? `<div class="mother-line"><strong>Ina Hooyo:</strong> ${mother}</div>` : ''}
        <div class="published-line">Published: ${escapeHtml(published)}</div>
        <div class="source-line">Source: AL-Fatxi School</div>
      </div>
    </div>`;

  // totals: show inline items in one row (wrap only if needed)
  const totalsHtml = `
    <div class="totals-card card">
      <div class="totals-block">
        <div class="tot-line">
          <div>Total: <strong style="color:#246bff">${total}</strong> / <span style="color:green">${sumMax}</span></div>
          <div>Percent: <strong style="color:${percentCol}">${percent.toFixed(2)}%</strong></div>
          <div>Average: <strong>${Number(averageRaw).toFixed(2)}</strong></div>
          <div>Grade: <span class="grade-badge" style="background:${gradeBg}">${grade}</span></div>
          <div>Status: <strong style="color:${percent>=50? '#0b8a3e':'#c0392b'}">${passfail}</strong></div>
          <div>School rank: <strong id="schoolRankCell">${escapeHtml(String(doc.schoolRank || '/—'))}</strong></div>
          <div>Class rank: <strong id="classRankCell">${escapeHtml(String(doc.classRank || '/—'))}</strong></div>
        </div>
      </div>

      <div class="actions-group" id="actionsGroup">
        <button id="printBtn" class="btn btn-primary" title="Download PDF" style="min-width:170px;font-size:15px">
          <svg class="icon" viewBox="0 0 24 24"><path d="M6 9h12V4H6v5zM6 13h12v-1H6v1zM6 15h12v5H6v-5z" fill="#fff"/></svg> Daabac (PDF)
        </button>

        <button id="moreExamsBtn" class="btn btn-ghost" title="More published exams">More published exams</button>

        <button id="screenshotBtn" class="btn" title="Screenshot (download image)">
          <svg class="icon" viewBox="0 0 24 24"><path d="M4 7h4l1-3h6l1 3h4v11H4z" stroke="currentColor" stroke-width="1.2" fill="none"/></svg> Screenshot
        </button>
      </div>
    </div>`;

  resultArea.innerHTML = headerHtml + tableHtml + totalsHtml;
  hideLoader();

  /* mask ID (display) */
  const maskBtn = document.getElementById('maskIdBtn');
  const studentIdText = document.getElementById('studentIdText');
  const eyeOpen = document.getElementById('eyeOpen');
  const eyeClosed = document.getElementById('eyeClosed');
  let masked = true;
  const originalId = studentIdText ? studentIdText.textContent : '';
  function applyMask(){
    if(!studentIdText) return;
    if(masked){
      const s = originalId || '';
      studentIdText.textContent = s.length>3 ? '*'.repeat(Math.max(0,s.length-3)) + s.slice(-3) : '*'.repeat(s.length);
      if(eyeOpen) eyeOpen.style.display='none'; if(eyeClosed) eyeClosed.style.display='inline-block';
    } else {
      studentIdText.textContent = originalId;
      if(eyeOpen) eyeOpen.style.display='inline-block'; if(eyeClosed) eyeClosed.style.display='none';
    }
  }
  if(maskBtn){ maskBtn.addEventListener('click', ()=>{ masked = !masked; applyMask(); }); applyMask(); }
  // If mask button not present, create a small toggle next to ID to preserve feature
  if(studentIdText && !maskBtn){
    const b = document.createElement('button');
    b.className = 'btn'; b.style.padding = '6px 8px'; b.style.marginLeft = '8px'; b.title = 'Toggle displayed ID';
    b.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="#0f172a" stroke-width="1.2"/><circle cx="12" cy="12" r="3" stroke="#0f172a" stroke-width="1.2"/></svg>';
    studentIdText.parentNode.appendChild(b);
    b.addEventListener('click', ()=>{ masked = !masked; applyMask(); });
  }
  applyMask();

  /* screenshot (kept) */
  const screenshotBtn = document.getElementById('screenshotBtn');
  const actionsGroup = document.getElementById('actionsGroup');
  if(screenshotBtn){
    screenshotBtn.onclick = async () => {
      try {
        if(actionsGroup) actionsGroup.style.visibility = 'hidden';
        const el = resultArea;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        const name = (doc.studentName || doc.studentId || 'result').replace(/\s+/g,'_');
        a.download = `${name}_result.png`; document.body.appendChild(a); a.click(); a.remove();
      } catch (e) {
        console.error('Screenshot failed', e); alert('Screenshot failed — isku day mar kale.');
      } finally {
        if(actionsGroup) actionsGroup.style.visibility = 'visible';
      }
    };
  }

  /* PDF generation (kept) */
  const printBtn = document.getElementById('printBtn');
  if(printBtn){
    printBtn.onclick = async () => {
      try {
        if(!(window.jspdf && window.jspdf.jsPDF)) throw new Error('jsPDF not available');
        const { jsPDF } = window.jspdf;
        const docPdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const margin = 20; let y = margin;
        docPdf.setFontSize(18); docPdf.text(schoolName, margin, y); y += 24;
        docPdf.setFontSize(15); docPdf.text(`${doc.studentName || ''}    ID: ${doc.studentId || ''}`, margin, y); y += 20;
        if(mother) { docPdf.setFontSize(13); docPdf.text(`Ina Hooyo: ${mother}`, margin, y); y += 18; }
        docPdf.setFontSize(13); docPdf.text(`Class: ${className}    Exam: ${examLabel}`, margin, y); y += 20;
        docPdf.setFontSize(12); docPdf.text(`Published: ${published}    Source: AL-Fatxi School`, margin, y); y += 20;

        const cols = [];
        cols.push({ header: 'Subject', dataKey: 'subject' });
        if(hasLinked) cols.push({ header: (doc.linkedExamName || 'Prev'), dataKey: 'linked' });
        if(compsEnabled.assignment) cols.push({ header: 'Assignment', dataKey: 'assignment' });
        if(compsEnabled.quiz) cols.push({ header: 'Quiz', dataKey: 'quiz' });
        if(compsEnabled.monthly) cols.push({ header: 'Monthly', dataKey: 'monthly' });
        if(compsEnabled.exam) cols.push({ header: examName, dataKey: 'exam' });
        cols.push({ header: 'Total', dataKey: 'total' }); cols.push({ header: 'Max', dataKey: 'max' });

        const tableData = (doc.subjects||[]).map(s=>{
          const comps = s.components||{};
          const r = { subject: s.name };
          if(hasLinked) r.linked = (s.components && s.components.linked && typeof s.components.linked.total !== 'undefined') ? String(s.components.linked.total) : ((typeof s.components?.linked === 'number')? String(s.components.linked): '-');
          if(compsEnabled.assignment) r.assignment = (comps.assignment!=null)? String(comps.assignment) : (s.assignment!=null? String(s.assignment): '-');
          if(compsEnabled.quiz) r.quiz = (comps.quiz!=null)? String(comps.quiz) : (s.quiz!=null? String(s.quiz): '-');
          if(compsEnabled.monthly) r.monthly = (comps.monthly!=null)? String(comps.monthly) : (s.monthly!=null? String(s.monthly): '-');
          if(compsEnabled.exam) r.exam = (comps.exam!=null)? String(comps.exam) : (s.exam!=null? String(s.exam): '-');
          r.total = (typeof s.mark !== 'undefined') ? String(s.mark) : String(s.total != null ? s.total : ((comps.assignment||0)+(comps.quiz||0)+(comps.monthly||0)+(comps.exam||0)));
          r.max = String(s.max || '');
          return r;
        });

        docPdf.autoTable({
          startY: y,
          head: [cols.map(c=>c.header)],
          body: tableData.map(r => cols.map(c => r[c.dataKey] || '')),
          styles: { fontSize: 12, cellPadding: 6 },
          headStyles: { fillColor: [240,240,240], textColor: [20,20,20], fontStyle: 'bold' },
          margin: { left: margin, right: margin }
        });

        const finalY = docPdf.lastAutoTable ? docPdf.lastAutoTable.finalY + 18 : docPdf.internal.pageSize.getHeight() - 80;
        docPdf.setFontSize(13);
        docPdf.text(`Total: ${total} / ${sumMax}    Percent: ${percent.toFixed(2)}%`, margin, finalY);
        docPdf.text(`Average: ${Number(averageRaw).toFixed(2)}    Grade: ${grade}`, margin, finalY + 18);
        docPdf.text(`Status: ${passfail}`, margin, finalY + 36);
        docPdf.text(`School rank: ${doc.schoolRank || '/—'}    Class rank: ${doc.classRank || '/—'}`, margin, finalY + 54);

        const fname = `${(doc.studentName || doc.studentId || 'result').replace(/\s+/g,'_')}_result.pdf`;
        docPdf.save(fname);
      } catch (e) {
        console.warn('PDF failed, print fallback', e);
        window.print();
      }
    };
  }

  const moreBtn = document.getElementById('moreExamsBtn');
  if(moreBtn) moreBtn.onclick = () => togglePublishedList(doc.studentId);

  if(doc.examId){
    (async ()=>{
      try{
        const qAll = query(collection(db,'examTotals'), where('examId','==', doc.examId));
        const snapAll = await getDocs(qAll);
        const schoolSize = snapAll.size || 0;
        let classSize = 0;
        if(doc.classId){
          snapAll.forEach(d => { const data = d.data(); if(data.classId === doc.classId) classSize++; });
        }
        const schoolRankCell = document.getElementById('schoolRankCell'), classRankCell = document.getElementById('classRankCell');
        if(schoolRankCell) schoolRankCell.textContent = doc.schoolRank && schoolSize ? `${doc.schoolRank} / ${schoolSize}` : (doc.schoolRank ? `${doc.schoolRank}` : '/—');
        if(classRankCell) classRankCell.textContent = doc.classRank && classSize ? `${doc.classRank} / ${classSize}` : (doc.classRank ? `${doc.classRank}` : '/—');
      }catch(e){ console.warn('Rank fetch failed', e); }
    })();
  }
}

/* ---------- togglePublishedList ---------- */
const publishedListState = {};
async function togglePublishedList(studentId){
  if(!studentId) return;
  const key = String(studentId);
  if(!publishedListState[key]) publishedListState[key] = { visible:false, container:null, selectedExamId:null };
  const state = publishedListState[key];
  if(state.visible){
    if(state.container && state.container.parentNode) state.container.parentNode.removeChild(state.container);
    state.visible = false;
    return;
  }
  const container = document.createElement('div');
  container.className = 'card';
  container.style.marginTop = '12px';
  container.innerHTML = `<div style="padding:10px;color:var(--muted)">Loading…</div>`;
  resultArea.appendChild(container);
  state.container = container; state.visible = true;
  try{
    const q = query(collection(db,'examTotals'), where('studentId','==', studentId));
    const snap = await getDocs(q);
    const arr = [];
    snap.forEach(d=> arr.push(d.data()));
    if(arr.length === 0){ container.innerHTML = '<div style="padding:10px;color:var(--muted)">No published exams found.</div>'; return; }
    arr.sort((a,b)=> (b.publishedAt?.seconds||0) - (a.publishedAt?.seconds||0));
    const html = arr.map(a => {
      const dateText = a.publishedAt ? new Date(a.publishedAt.seconds*1000).toLocaleDateString() : '';
      return `<div style="padding:8px;border-bottom:1px solid #eef2f7"><button class="pubBtn" data-id="${escapeHtml(a.examId)}" style="background:none;border:0;font-weight:800">${escapeHtml(a.examName||a.examId||'(exam)')}</button><span style="float:right;color:var(--muted)">${escapeHtml(dateText)}</span></div>`;
    }).join('');
    container.innerHTML = html;
    container.querySelectorAll('.pubBtn').forEach(b => {
      b.onclick = async () => {
        const exId = b.dataset.id;
        const snap = await getDoc(doc(db,'examTotals', `${exId}_${studentId}`));
        if(!snap.exists()) return alert('Not found');
        renderResult(snap.data(), { source: 'examTotals' });
      };
    });
  }catch(err){
    console.error(err);
    container.innerHTML = `<div style="padding:10px;color:#c0392b">Khalad ayaa dhacay, fadlan isku day mar kale.</div>`;
  }
}

/* ---------- fallback ----- */
async function fallbackFindLatestExamTotal(studentId){
  try{
    const q = query(collection(db,'examTotals'), where('studentId','==', studentId));
    const snap = await getDocs(q);
    const arr = [];
    snap.forEach(d => arr.push(d.data()));
    if(arr.length === 0) return null;
    arr.sort((a,b)=> (b.publishedAt?.seconds||0) - (a.publishedAt?.seconds||0));
    return arr[0];
  }catch(e){ console.error(e); return null; }
}

/* ---------- main search click ---------- */
searchBtn.onclick = async () => {
  const studentId = studentIdInput.value.trim();
  message.textContent = '';
  resultArea.style.display = 'none'; resultArea.innerHTML = '';
  if(!studentId){ message.textContent = 'Fadlan geli ID sax ah.'; return; }
  showLoader();
  try{
    const latestSnap = await getDoc(doc(db,'studentsLatest', studentId));
    let latest = latestSnap.exists() ? latestSnap.data() : null;

    if(latest && !latest.motherName){
      try{ const sSnap = await getDoc(doc(db,'students', studentId)); if(sSnap.exists()){ const sData = sSnap.data(); if(sData && sData.motherName) latest.motherName = sData.motherName; } }catch(e){ console.warn(e); }
    }

    if(!latest){
      const alt = await fallbackFindLatestExamTotal(studentId);
      if(!alt){ message.textContent = 'Natiijo la heli waayey. Fadlan hubi ID-ga.'; hideLoader(); return; }
      await renderResult(alt, { source: 'examTotals' }); return;
    }

    if(latest.blocked){
      resultArea.style.display='block'; resultArea.innerHTML = `<div class="card"><h2>Access blocked</h2><p>${escapeHtml(latest.blockMessage || 'You are not allowed to view results.')}</p></div>`; hideLoader(); return;
    }

    const alt = await fallbackFindLatestExamTotal(studentId);
    if(alt && alt.publishedAt && latest.publishedAt){
      const altSeconds = alt.publishedAt.seconds || (new Date(alt.publishedAt).getTime()/1000);
      const latestSeconds = latest.publishedAt.seconds || (new Date(latest.publishedAt).getTime()/1000);
      if(altSeconds > latestSeconds){ await renderResult(alt, { source: 'examTotals' }); return; }
    } else if(alt && !latest.publishedAt){ await renderResult(alt, { source: 'examTotals' }); return; }

    await renderResult(latest, { source: 'AL-Fatxi School' });
  }catch(err){
    console.error(err); message.textContent = 'Khalad ayaa dhacay. Fadlan isku day mar kale.'; hideLoader();
  }
};
export { renderResult };
